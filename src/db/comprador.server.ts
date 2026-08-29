import { sql } from "drizzle-orm";
import { db } from "./index";
import { hashPassword, issueToken } from "./auth.server";
import { ensurePerfilSchema } from "./perfil.server";

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export type StatusCompliance =
  | "NAO_ENVIADO"
  | "AGUARDANDO_ANALISE"
  | "PENDENCIA"
  | "APROVADO"
  | "REPROVADO";

export async function ensureCompradorSchema() {
  if (!db) return;
  await ensurePerfilSchema();

  const cols: [string, string][] = [
    ["tipo_pessoa", "text DEFAULT 'PF'"],
    ["cnpj", "text"],
    ["razao_social", "text"],
    ["nome_fantasia", "text"],
    ["inscricao_estadual", "text"],
    ["responsavel_nome", "text"],
    ["responsavel_cpf", "text"],
    ["responsavel_whatsapp", "text"],
    ["responsavel_email", "text"],
    ["responsavel_cargo", "text"],
    ["regiao_atuacao", "text"],
    ["origem_cadastro", "text DEFAULT 'AUTOCADASTRO'"], // AUTOCADASTRO | PRE_CADASTRO_ADMIN
    ["etapa_cadastro", "integer DEFAULT 1"],
    ["status_compliance", "text DEFAULT 'NAO_ENVIADO'"],
    ["compliance_motivo_pendencia", "text"],
    ["pode_ver_valores", "boolean DEFAULT false"],
    ["pode_dar_lances", "boolean DEFAULT false"],
    ["documento_cnh_url", "text"],
    ["documento_selfie_url", "text"],
    ["documento_comprovante_url", "text"],
    ["documento_contrato_social_url", "text"],
    ["cadastro_completo", "boolean DEFAULT false"],
  ];

  for (const [name, type] of cols) {
    try {
      await db.execute(sql.raw(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ${name} ${type};`));
    } catch {
      /* coluna já existe */
    }
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS comprador_favoritos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      comprador_id uuid NOT NULL,
      anuncio_id uuid NOT NULL,
      criado_em timestamptz DEFAULT now(),
      UNIQUE (comprador_id, anuncio_id)
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS comprador_lembretes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      comprador_id uuid NOT NULL,
      anuncio_id uuid NOT NULL,
      lembrar_em timestamptz,
      enviado boolean DEFAULT false,
      criado_em timestamptz DEFAULT now(),
      UNIQUE (comprador_id, anuncio_id)
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS comprador_notificacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      comprador_id uuid NOT NULL,
      tipo text NOT NULL,
      titulo text NOT NULL,
      mensagem text,
      link text,
      lida boolean DEFAULT false,
      criado_em timestamptz DEFAULT now()
    );
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_notif_comprador ON comprador_notificacoes(comprador_id, lida, criado_em DESC);`,
  );
}

/** Regras canônicas de progresso/habilitação do comprador. */
export function calcularProgressoComprador(p: any) {
  const pj = (p?.tipo_pessoa || "PF") === "PJ";
  const pendencias: string[] = [];

  if (!p?.nome) pendencias.push("Nome");
  if (!p?.email) pendencias.push("E-mail");
  if (!p?.whatsapp) pendencias.push("WhatsApp");
  if (pj) {
    if (!p?.cnpj) pendencias.push("CNPJ");
    if (!p?.razao_social) pendencias.push("Razão social");
    if (!p?.responsavel_nome) pendencias.push("Nome do responsável");
    if (!p?.responsavel_cpf) pendencias.push("CPF do responsável");
    if (!p?.documento_contrato_social_url) pendencias.push("Contrato social");
  } else {
    if (!p?.cpf) pendencias.push("CPF");
    if (!p?.documento_cnh_url) pendencias.push("CNH/RG");
    if (!p?.documento_selfie_url) pendencias.push("Selfie");
  }
  if (!p?.cep || !p?.endereco || !p?.cidade || !p?.uf) pendencias.push("Endereço");
  if (!p?.documento_comprovante_url) pendencias.push("Comprovante de endereço");

  const totalRequisitos = pj ? 9 : 9;
  const cumpridos = Math.max(0, totalRequisitos - pendencias.length);
  const percentual = Math.round((cumpridos / totalRequisitos) * 100);

  return {
    percentual: pendencias.length === 0 ? 100 : Math.min(percentual, 99),
    pendencias,
    completo: pendencias.length === 0,
    tipo_pessoa: pj ? "PJ" : "PF",
  };
}

export async function cadastrarComprador(data: any) {
  if (!db) throw new Error("DB offline");
  await ensureCompradorSchema();

  const senhaHash = await hashPassword(data.password);

  try {
    const res = await db.execute(sql`
      INSERT INTO profiles (
        nome, email, role, senha_hash, whatsapp, cpf, cnpj, tipo_pessoa,
        status_compliance, origem_cadastro, etapa_cadastro, ativo
      ) VALUES (
        ${data.nome}, ${String(data.email).toLowerCase()}, 'comprador'::text::app_role, ${senhaHash},
        ${data.whatsapp || null}, ${data.cpf || null}, ${data.cnpj || null}, ${data.tipo || "PF"},
        'NAO_ENVIADO', 'AUTOCADASTRO', 2, true
      ) RETURNING id, nome, email, role, tipo_pessoa, pode_ver_valores
    `);

    const user = rowsOf(res)[0];
    const accessToken = await issueToken(user.id);

    return { ok: true as const, user, accessToken };
  } catch (err: any) {
    if (err.message?.includes("unique") || err.code === "23505") {
      return { ok: false as const, message: "Este e-mail já está cadastrado." };
    }
    throw err;
  }
}

/** Pré-cadastro feito pelo admin: dados mínimos + senha provisória. */
export async function preCadastrarComprador(data: any) {
  if (!db) throw new Error("DB offline");
  await ensureCompradorSchema();

  const senhaHash = await hashPassword(data.senha);
  try {
    const res = await db.execute(sql`
      INSERT INTO profiles (
        nome, email, role, senha_hash, whatsapp, cnpj, tipo_pessoa, regiao_atuacao,
        endereco, cidade, uf, status_compliance, origem_cadastro, etapa_cadastro,
        pode_ver_valores, pode_dar_lances, cadastro_completo, ativo
      ) VALUES (
        ${data.nome}, ${String(data.email).toLowerCase()}, 'comprador'::text::app_role, ${senhaHash},
        ${data.whatsapp || null}, ${data.cnpj || null}, ${data.cnpj ? "PJ" : "PF"}, ${data.regiao || null},
        ${data.endereco || null}, ${data.cidade || null}, ${data.uf || null},
        'NAO_ENVIADO', 'PRE_CADASTRO_ADMIN', 2, true, false, false, true
      ) RETURNING id, nome, email
    `);
    return { ok: true as const, data: rowsOf(res)[0] };
  } catch (err: any) {
    if (err.message?.includes("unique") || err.code === "23505") {
      return { ok: false as const, message: "Já existe um usuário com este e-mail." };
    }
    return { ok: false as const, message: err.message };
  }
}

export async function getPerfilComprador(id: string) {
  if (!db) return null;
  await ensureCompradorSchema();
  const res = await db.execute(sql`SELECT * FROM profiles WHERE id = ${id}::uuid`);
  const perfil = rowsOf(res)[0];
  if (!perfil) return null;
  const progresso = calcularProgressoComprador(perfil);
  return {
    perfil,
    progresso,
    pode_dar_lances: progresso.completo && perfil.status_compliance === "APROVADO",
    pode_ver_valores: !!perfil.pode_ver_valores || perfil.status_compliance === "APROVADO",
  };
}

const CAMPOS_PERMITIDOS = new Set([
  "nome",
  "whatsapp",
  "cpf",
  "cnpj",
  "tipo_pessoa",
  "razao_social",
  "nome_fantasia",
  "inscricao_estadual",
  "responsavel_nome",
  "responsavel_cpf",
  "responsavel_whatsapp",
  "responsavel_email",
  "responsavel_cargo",
  "regiao_atuacao",
  "cep",
  "endereco",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "documento_cnh_url",
  "documento_selfie_url",
  "documento_comprovante_url",
  "documento_contrato_social_url",
]);

/** Salva uma etapa do wizard do comprador (parcial, sem perder dados). */
export async function salvarEtapaComprador(id: string, etapa: number, dados: Record<string, any>) {
  if (!db) throw new Error("DB offline");
  await ensureCompradorSchema();

  const entries = Object.entries(dados || {}).filter(
    ([k, v]) => CAMPOS_PERMITIDOS.has(k) && v !== undefined,
  );

  const sets = entries.map(([k, v]) => sql`${sql.raw(k)} = ${v === "" ? null : v}`);
  sets.push(sql`etapa_cadastro = GREATEST(COALESCE(etapa_cadastro, 1), ${etapa})`);

  await db.execute(sql`
    UPDATE profiles SET ${sql.join(sets, sql`, `)}, atualizado_em = now()
    WHERE id = ${id}::uuid
  `);

  return getPerfilComprador(id);
}

/** Conclui o cadastro e envia para análise, apenas se não houver pendências. */
export async function enviarCadastroCompradorParaAnalise(id: string) {
  const atual = await getPerfilComprador(id);
  if (!atual) return { ok: false as const, message: "Perfil não encontrado." };
  if (!atual.progresso.completo) {
    return {
      ok: false as const,
      message: `Faltam informações: ${atual.progresso.pendencias.join(", ")}`,
      progresso: atual.progresso,
    };
  }

  await db!.execute(sql`
    UPDATE profiles SET
      cadastro_completo = true,
      status_compliance = 'AGUARDANDO_ANALISE',
      compliance_motivo_pendencia = NULL,
      etapa_cadastro = 99,
      atualizado_em = now()
    WHERE id = ${id}::uuid
  `);

  await criarNotificacaoComprador(
    id,
    "CADASTRO",
    "Cadastro enviado para análise",
    "Assim que aprovado você poderá dar lances nos leilões.",
    "/comprador",
  );

  return { ok: true as const };
}

export async function salvarDocumentoComprador(compradorId: string, tipo: string, url: string) {
  if (!db) return { ok: false as const };
  await ensureCompradorSchema();

  const mapa: Record<string, string> = {
    CNH: "documento_cnh_url",
    CNH_RG: "documento_cnh_url",
    SELFIE: "documento_selfie_url",
    COMPROVANTE: "documento_comprovante_url",
    CONTRATO_SOCIAL: "documento_contrato_social_url",
  };
  const coluna = mapa[tipo] || "documento_cnh_url";

  await db.execute(sql`
    UPDATE profiles SET ${sql.raw(coluna)} = ${url}, atualizado_em = now()
    WHERE id = ${compradorId}::uuid
  `);

  return { ok: true as const };
}

/* ---------------- Favoritos, lembretes e notificações ---------------- */

export async function alternarFavorito(compradorId: string, anuncioId: string) {
  if (!db) throw new Error("DB offline");
  await ensureCompradorSchema();
  const res = await db.execute(sql`
    DELETE FROM comprador_favoritos
    WHERE comprador_id = ${compradorId}::uuid AND anuncio_id = ${anuncioId}::uuid
    RETURNING id
  `);
  if (rowsOf(res).length > 0) return { favorito: false };

  await db.execute(sql`
    INSERT INTO comprador_favoritos (comprador_id, anuncio_id)
    VALUES (${compradorId}::uuid, ${anuncioId}::uuid)
    ON CONFLICT DO NOTHING
  `);
  return { favorito: true };
}

export async function listarFavoritos(compradorId: string) {
  if (!db) return [];
  await ensureCompradorSchema();
  const res = await db.execute(sql`
    SELECT f.anuncio_id, a.slug, a.titulo, a.codigo_publico, a.localizacao_publica,
      v.marca, v.modelo, v.ano_modelo, v.km,
      (SELECT foto_url FROM anuncios_fotos af WHERE af.anuncio_id = a.id ORDER BY af.eh_capa DESC, af.ordem ASC LIMIT 1) as foto_capa
    FROM comprador_favoritos f
    JOIN anuncios_veiculo a ON a.id = f.anuncio_id
    JOIN veiculos v ON v.id = a.veiculo_id
    WHERE f.comprador_id = ${compradorId}::uuid
    ORDER BY f.criado_em DESC
  `);
  return rowsOf(res);
}

export async function salvarLembrete(compradorId: string, anuncioId: string, lembrarEm?: string | null) {
  if (!db) throw new Error("DB offline");
  await ensureCompradorSchema();
  await db.execute(sql`
    INSERT INTO comprador_lembretes (comprador_id, anuncio_id, lembrar_em)
    VALUES (${compradorId}::uuid, ${anuncioId}::uuid, ${lembrarEm || null})
    ON CONFLICT (comprador_id, anuncio_id)
    DO UPDATE SET lembrar_em = EXCLUDED.lembrar_em, enviado = false
  `);
  return { ok: true as const };
}

export async function listarLembretes(compradorId: string) {
  if (!db) return [];
  await ensureCompradorSchema();
  const res = await db.execute(sql`
    SELECT l.*, a.slug, a.titulo, v.marca, v.modelo
    FROM comprador_lembretes l
    JOIN anuncios_veiculo a ON a.id = l.anuncio_id
    JOIN veiculos v ON v.id = a.veiculo_id
    WHERE l.comprador_id = ${compradorId}::uuid
    ORDER BY l.lembrar_em NULLS LAST
  `);
  return rowsOf(res);
}

export async function criarNotificacaoComprador(
  compradorId: string,
  tipo: string,
  titulo: string,
  mensagem?: string,
  link?: string,
) {
  if (!db) return;
  try {
    await ensureCompradorSchema();
    await db.execute(sql`
      INSERT INTO comprador_notificacoes (comprador_id, tipo, titulo, mensagem, link)
      VALUES (${compradorId}::uuid, ${tipo}, ${titulo}, ${mensagem || null}, ${link || null})
    `);
  } catch (e) {
    console.error("[comprador] falha ao criar notificação", e);
  }
}

export async function listarNotificacoes(compradorId: string) {
  if (!db) return [];
  await ensureCompradorSchema();
  const res = await db.execute(sql`
    SELECT * FROM comprador_notificacoes
    WHERE comprador_id = ${compradorId}::uuid
    ORDER BY criado_em DESC LIMIT 50
  `);
  return rowsOf(res);
}

export async function marcarNotificacoesLidas(compradorId: string) {
  if (!db) return { ok: false as const };
  await db.execute(sql`
    UPDATE comprador_notificacoes SET lida = true
    WHERE comprador_id = ${compradorId}::uuid AND lida = false
  `);
  return { ok: true as const };
}
