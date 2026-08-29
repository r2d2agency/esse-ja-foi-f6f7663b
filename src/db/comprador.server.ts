import { sql } from "drizzle-orm";
import { db } from "./index";
import { hashPassword, issueToken } from "./auth.server";
import { ensurePerfilSchema } from "./perfil.server";

export async function ensureCompradorSchema() {
  if (!db) return;
  await ensurePerfilSchema();
  
  // Colunas específicas para comprador/PJ se não existirem
  const cols = [
    ['tipo_pessoa', "text DEFAULT 'PF'"],
    ['cnpj', 'text'],
    ['razao_social', 'text'],
    ['nome_fantasia', 'text'],
    ['inscricao_estadual', 'text'],
    ['responsavel_nome', 'text'],
    ['responsavel_cpf', 'text'],
    ['responsavel_whatsapp', 'text'],
    ['responsavel_email', 'text'],
    ['responsavel_cargo', 'text'],
    ['status_compliance', "text DEFAULT 'PENDENTE'"],
    ['pode_ver_valores', "boolean DEFAULT false"],
    ['pode_dar_lances', "boolean DEFAULT false"]
  ];

  for (const [name, type] of cols) {
    try {
      await db.execute(sql.raw(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ${name} ${type};`));
    } catch (e) {}
  }
}

export async function cadastrarComprador(data: any) {
  if (!db) throw new Error("DB offline");
  await ensureCompradorSchema();

  const senhaHash = await hashPassword(data.password);
  
  try {
    const res = await db.execute(sql`
      INSERT INTO profiles (
        nome, email, role, senha_hash, whatsapp, cpf, cnpj, tipo_pessoa, status_compliance, ativo
      ) VALUES (
        ${data.nome}, ${data.email.toLowerCase()}, 'comprador'::text::app_role, ${senhaHash}, 
        ${data.whatsapp}, ${data.cpf || null}, ${data.cnpj || null}, ${data.tipo}, 'PENDENTE', true
      ) RETURNING id, nome, email, role
    `);
    
    const user = rowsOf(res)[0];
    const accessToken = await issueToken(user.id);
    
    return { ok: true as const, user, accessToken };
  } catch (err: any) {
    if (err.message?.includes("unique") || err.code === '23505') {
      return { ok: false as const, message: "Este e-mail já está cadastrado." };
    }
    throw err;
  }
}

export async function getStatusComprador(id: string) {
  if (!db) return null;
  const res = await db.execute(sql`
    SELECT status_compliance, pode_ver_valores, cadastro_completo, tipo_pessoa
    FROM profiles WHERE id = ${id}::uuid
  `);
  return rowsOf(res)[0] || null;
}

export async function atualizarDadosComprador(id: string, dados: any) {
  if (!db) return { ok: false };
  
  const sets = Object.entries(dados).map(([k, v]) => {
    return sql.raw(`${k} = ${v === null ? 'NULL' : `'${v}'`}`);
  });

  if (sets.length === 0) return { ok: true };

  await db.execute(sql`
    UPDATE profiles SET ${sql.join(sets, sql`, `)}, atualizado_em = now()
    WHERE id = ${id}::uuid
  `);

  return { ok: true };
}

export async function salvarDocumentoComprador(compradorId: string, tipo: string, url: string) {
  if (!db) return { ok: false };
  
  // Garantir tabela de documentos
  const { ensureAdminTables } = await import("./admin.server");
  await ensureAdminTables();

  await db.execute(sql`
    INSERT INTO documentos (entidade, entidade_id, tipo, url, status)
    VALUES ('comprador', ${compradorId}::uuid, ${tipo}, ${url}, 'PENDENTE')
    ON CONFLICT (entidade, entidade_id, tipo) DO UPDATE SET 
      url = EXCLUDED.url, 
      status = 'PENDENTE',
      atualizado_em = now()
  `);

  return { ok: true };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
