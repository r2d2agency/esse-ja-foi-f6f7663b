import { sql } from "drizzle-orm";
import { db } from "./index";
import { hashPassword, issueToken } from "./auth.server";
import { ensureCompradorSchema } from "./comprador.server";
import { registrarAceiteTermo } from "./termos.server";

/**
 * Pré-cadastro público de comprador — o link que vai na campanha.
 *
 * Diferente do `preCadastrarComprador` (que o admin dispara um a um, com senha
 * provisória), aqui é o próprio comprador que se cadastra, escolhendo a senha.
 * O que muda em relação ao cadastro completo:
 *
 *   - cadastro_completo = false  → ele NÃO pode dar lances;
 *   - pode_ver_valores  = true   → ele já vê os veículos e os valores;
 *   - status_compliance  = 'NAO_ENVIADO' → o admin ainda vai analisar.
 *
 * Ou seja: acesso parcial, exatamente o combinado na campanha. As regras de
 * acesso já existem em `getAcessoComercial` (src/db/vitrine.server.ts) — não
 * criamos flag nova, só gravamos o profile no estado certo.
 *
 * O termo de uso é aceito no mesmo ato (assinatura + IP + user agent), pelo
 * mesmo `registrarAceiteTermo` usado no primeiro acesso.
 */

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

/** Colunas realmente existentes na tabela profiles (evita INSERT em coluna ausente). */
async function colunasProfiles(): Promise<Set<string>> {
  if (!db) return new Set();
  const res = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
  `);
  return new Set(rowsOf(res).map((r: any) => String(r.column_name)));
}

function detalharErro(err: any): string {
  const partes = [err?.message, err?.detail, err?.hint, err?.column && `coluna: ${err.column}`]
    .filter(Boolean)
    .map((p: string) => String(p).split("\n")[0]);
  return partes.join(" — ") || "Erro desconhecido ao gravar.";
}

/** Só dígitos — CNPJ, CPF e telefone entram no banco normalizados. */
function digitos(valor: string | undefined | null): string | null {
  const d = String(valor || "").replace(/\D/g, "");
  return d.length ? d : null;
}

export type PreCadastroPublicoInput = {
  razao_social: string;
  cnpj: string;
  cep?: string;
  endereco: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  responsavel_nome: string;
  responsavel_cpf?: string;
  responsavel_whatsapp: string;
  email: string;
  senha: string;
  assinatura: string;
  ip?: string | null;
  userAgent?: string | null;
};

export async function criarPreCadastroPublico(data: PreCadastroPublicoInput) {
  if (!db) throw new Error("DB offline");
  try {
    await ensureCompradorSchema();
  } catch (e: any) {
    console.error("[pre-cadastro publico] ensureCompradorSchema:", e?.message || e);
  }

  const email = String(data.email).toLowerCase().trim();
  const senhaHash = await hashPassword(data.senha);

  const existentes = await colunasProfiles();
  const candidatos: Record<string, any> = {
    nome: data.razao_social,
    email,
    senha_hash: senhaHash,
    // O login por WhatsApp usa o número do responsável — é o mesmo que o
    // comprador digita na campanha.
    whatsapp: digitos(data.responsavel_whatsapp),
    cnpj: digitos(data.cnpj),
    tipo_pessoa: "PJ",
    razao_social: data.razao_social,
    responsavel_nome: data.responsavel_nome,
    responsavel_cpf: digitos(data.responsavel_cpf),
    responsavel_whatsapp: digitos(data.responsavel_whatsapp),
    responsavel_email: email,
    cep: digitos(data.cep),
    endereco: data.endereco || null,
    numero: data.numero || null,
    complemento: data.complemento || null,
    bairro: data.bairro || null,
    cidade: data.cidade || null,
    uf: data.uf || null,
    status_compliance: "NAO_ENVIADO",
    origem_cadastro: "AUTOCADASTRO",
    // Etapa 4 = "Documentos" no wizard. Os dados básicos já vieram prontos,
    // então quem migrar do pré-cadastro para o cadastro completo cai direto
    // no upload de documentos, sem refazer o que já foi preenchido.
    etapa_cadastro: 4,
    pode_ver_valores: true,
    pode_dar_lances: false,
    cadastro_completo: false,
    ativo: true,
  };

  const colunas: string[] = ["role"];
  const valores: any[] = [sql`'comprador'::app_role`];
  for (const [coluna, valor] of Object.entries(candidatos)) {
    if (!existentes.size || existentes.has(coluna)) {
      colunas.push(coluna);
      valores.push(sql`${valor}`);
    }
  }

  let perfilId: string;
  try {
    const res = await db.execute(sql`
      INSERT INTO profiles (${sql.raw(colunas.join(", "))})
      VALUES (${sql.join(valores, sql`, `)})
      RETURNING id, nome, email, role, tipo_pessoa
    `);
    const user = rowsOf(res)[0];
    if (!user) throw new Error("Não foi possível criar a conta.");
    perfilId = String(user.id);
  } catch (err: any) {
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      return { ok: false as const, message: "Este e-mail já está cadastrado." };
    }
    console.error("[pre-cadastro publico] insert:", err);
    return { ok: false as const, message: detalharErro(err) };
  }

  // Aceite do termo no mesmo ato. Se falhar, a conta já criada é desfeita:
  // não serve deixar comprador sem termo registrado.
  try {
    await registrarAceiteTermo({
      perfilId,
      assinatura: data.assinatura,
      tipo: "COMPRADOR",
      ip: data.ip || null,
      userAgent: data.userAgent || null,
    });
  } catch (e: any) {
    console.error("[pre-cadastro publico] aceite do termo:", e?.message || e);
    try {
      await db.execute(sql`DELETE FROM profiles WHERE id = ${perfilId}::uuid`);
    } catch (e2: any) {
      console.error("[pre-cadastro publico] rollback:", e2?.message || e2);
    }
    return { ok: false as const, message: "Não foi possível registrar o aceite do termo." };
  }

  // Sessão pelo cookie httpOnly — o mesmo mecanismo do login normal.
  const { definirSessao } = await import("@/lib/sessao.server");
  definirSessao(await issueToken(perfilId));

  const res = await db.execute(sql`
    SELECT id, nome, email, role, tipo_pessoa, pode_ver_valores
    FROM profiles WHERE id = ${perfilId}::uuid
  `);
  return { ok: true as const, user: rowsOf(res)[0] };
}
