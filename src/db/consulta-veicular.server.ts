import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

/** Provedor padrão pré-configurado (Company Conferi — Consulta Gold). */
export const PROVEDOR_PADRAO = {
  slug: "company_conferi",
  nome: "Company Conferi",
  base_url: "https://webservice.companyconferi.com.br/api-clientes",
  caminho_consulta: "/consulta",
  produto: "GOLD",
};

export async function ensureConsultaVeicularSchema() {
  const d = requireDb();
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS consulta_provedores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE,
      nome text NOT NULL,
      base_url text NOT NULL,
      caminho_consulta text DEFAULT '/consulta',
      produto text DEFAULT 'GOLD',
      api_key text,
      usuario text,
      ativo boolean NOT NULL DEFAULT false,
      atualizado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS veiculo_consultas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      provedor text NOT NULL,
      produto text,
      placa text,
      chassi text,
      status text NOT NULL DEFAULT 'PENDENTE',
      protocolo text,
      resumo jsonb DEFAULT '{}',
      resposta jsonb,
      documento_url text,
      erro text,
      criado_por uuid,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS consulta_habilitada boolean DEFAULT false;
  `);

  const existe = rowsOf(
    await d.execute(sql`SELECT id FROM consulta_provedores WHERE slug = ${PROVEDOR_PADRAO.slug}`),
  );
  if (existe.length === 0) {
    await d.execute(sql`
      INSERT INTO consulta_provedores (slug, nome, base_url, caminho_consulta, produto, ativo)
      VALUES (${PROVEDOR_PADRAO.slug}, ${PROVEDOR_PADRAO.nome}, ${PROVEDOR_PADRAO.base_url},
              ${PROVEDOR_PADRAO.caminho_consulta}, ${PROVEDOR_PADRAO.produto}, false)
    `);
  }
}

function mascarar(chave?: string | null) {
  if (!chave) return "";
  if (chave.length <= 6) return "••••";
  return `${chave.slice(0, 3)}••••••${chave.slice(-3)}`;
}

/** Configuração visível no admin — a chave nunca é devolvida em texto puro. */
export async function getProvedorConsulta() {
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  const p = rowsOf(
    await d.execute(sql`SELECT * FROM consulta_provedores WHERE slug = ${PROVEDOR_PADRAO.slug} LIMIT 1`),
  )[0];
  if (!p) return null;
  return {
    slug: p.slug,
    nome: p.nome,
    base_url: p.base_url,
    caminho_consulta: p.caminho_consulta,
    produto: p.produto,
    usuario: p.usuario,
    ativo: !!p.ativo,
    tem_chave: !!p.api_key,
    chave_mascarada: mascarar(p.api_key),
    atualizado_em: p.atualizado_em,
  };
}

export async function salvarProvedorConsulta(data: {
  nome?: string | undefined;
  base_url: string;
  caminho_consulta?: string | undefined;
  produto?: string | undefined;
  usuario?: string | undefined;
  api_key?: string | undefined;
  ativo: boolean;
}) {
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  const trocaChave = typeof data.api_key === "string" && data.api_key.trim().length > 0;
  await d.execute(sql`
    UPDATE consulta_provedores SET
      nome = ${data.nome || PROVEDOR_PADRAO.nome},
      base_url = ${data.base_url.replace(/\/+$/, "")},
      caminho_consulta = ${data.caminho_consulta || PROVEDOR_PADRAO.caminho_consulta},
      produto = ${data.produto || PROVEDOR_PADRAO.produto},
      usuario = ${data.usuario || null},
      ${trocaChave ? sql`api_key = ${data.api_key!.trim()},` : sql``}
      ativo = ${data.ativo},
      atualizado_em = now()
    WHERE slug = ${PROVEDOR_PADRAO.slug}
  `);
  return { ok: true as const };
}

async function getProvedorComChave() {
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  const p = rowsOf(
    await d.execute(sql`SELECT * FROM consulta_provedores WHERE slug = ${PROVEDOR_PADRAO.slug} LIMIT 1`),
  )[0];
  if (!p) throw new Error("Provedor de consulta não configurado.");
  if (!p.ativo) throw new Error("O módulo de consulta veicular está desativado.");
  if (!p.api_key) throw new Error("Informe a chave de acesso do provedor antes de consultar.");
  return p;
}

function primeiro(obj: any, chaves: string[]) {
  for (const k of chaves) {
    const v = k.split(".").reduce((acc: any, part) => (acc == null ? acc : acc[part]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

/** Mapeamento tolerante: cobre variações comuns de nomes de campo do retorno. */
export function resumirRetorno(payload: any) {
  const raiz = payload?.retorno ?? payload?.data ?? payload?.resultado ?? payload;
  return {
    protocolo: primeiro(raiz, ["protocolo", "ticket", "id_consulta", "idConsulta", "numero_protocolo"]),
    situacao: primeiro(raiz, ["situacao", "situacao_veiculo", "status_veiculo"]),
    roubo_furto: primeiro(raiz, ["roubo_furto", "rouboFurto", "indicio_roubo_furto", "ocorrencia_roubo"]),
    restricoes: primeiro(raiz, ["restricoes", "restricao", "restricoes_veiculo"]),
    leilao: primeiro(raiz, ["leilao", "historico_leilao", "indicio_leilao", "remarcacao_leilao"]),
    sinistro: primeiro(raiz, ["sinistro", "indicio_sinistro", "historico_sinistro"]),
    debitos: primeiro(raiz, ["debitos", "debito", "total_debitos"]),
    renajud: primeiro(raiz, ["renajud", "restricao_judicial"]),
    documento_url: primeiro(raiz, ["url_pdf", "pdf", "link_pdf", "arquivo", "url_laudo", "documento"]),
  };
}

export async function consultarLaudoVeiculo(veiculoId: string, criadoPor?: string | null) {
  const d = requireDb();
  const prov = await getProvedorComChave();

  const veiculo = rowsOf(
    await d.execute(sql`SELECT id, placa, chassi, renavam FROM veiculos WHERE id = ${veiculoId}::uuid`),
  )[0];
  if (!veiculo) throw new Error("Veículo não encontrado.");
  if (!veiculo.placa && !veiculo.chassi) {
    throw new Error("Cadastre a placa ou o chassi do veículo antes de consultar.");
  }

  const url = `${String(prov.base_url).replace(/\/+$/, "")}${prov.caminho_consulta || "/consulta"}`;
  const corpo = {
    placa: veiculo.placa || undefined,
    chassi: veiculo.chassi || undefined,
    renavam: veiculo.renavam || undefined,
    produto: prov.produto || "GOLD",
    usuario: prov.usuario || undefined,
  };

  let status = "ERRO";
  let payload: any = null;
  let erro: string | null = null;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${prov.api_key}`,
        "x-api-key": String(prov.api_key),
      },
      body: JSON.stringify(corpo),
    });
    const texto = await resp.text();
    try {
      payload = JSON.parse(texto);
    } catch {
      payload = { raw: texto };
    }
    if (!resp.ok) {
      erro =
        primeiro(payload, ["mensagem", "message", "erro", "error"]) ||
        `O provedor respondeu com erro ${resp.status}.`;
      status = resp.status === 401 || resp.status === 403 ? "NAO_AUTORIZADO" : "ERRO";
    } else {
      status = "CONCLUIDA";
    }
  } catch (e: any) {
    erro = e?.message || "Falha de comunicação com o provedor.";
  }

  const resumo = status === "CONCLUIDA" ? resumirRetorno(payload) : {};

  const row = rowsOf(
    await d.execute(sql`
      INSERT INTO veiculo_consultas
        (veiculo_id, provedor, produto, placa, chassi, status, protocolo, resumo, resposta, documento_url, erro, criado_por)
      VALUES (
        ${veiculoId}::uuid, ${prov.nome}, ${prov.produto}, ${veiculo.placa || null}, ${veiculo.chassi || null},
        ${status}, ${(resumo as any).protocolo || null}, ${JSON.stringify(resumo)}::jsonb,
        ${payload ? JSON.stringify(payload) : null}::jsonb,
        ${(resumo as any).documento_url || null}, ${erro}, ${criadoPor || null}
      )
      RETURNING id
    `),
  )[0];

  if (status !== "CONCLUIDA") {
    throw new Error(erro || "Não foi possível concluir a consulta.");
  }

  await d.execute(
    sql`UPDATE veiculos SET consulta_habilitada = true WHERE id = ${veiculoId}::uuid`,
  );

  return { ok: true as const, id: String(row?.id ?? ""), status, resumo };
}

export async function listarConsultasVeiculo(veiculoId: string) {
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  const res = await d.execute(sql`
    SELECT id, provedor, produto, placa, chassi, status, protocolo, resumo, documento_url, erro, criado_em
    FROM veiculo_consultas
    WHERE veiculo_id = ${veiculoId}::uuid
    ORDER BY criado_em DESC
  `);
  return rowsOf(res);
}

export async function testarConexaoProvedor() {
  const prov = await getProvedorComChave();
  const url = `${String(prov.base_url).replace(/\/+$/, "")}${prov.caminho_consulta || "/consulta"}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${prov.api_key}`,
        "x-api-key": String(prov.api_key),
      },
      body: JSON.stringify({ placa: "TESTE000", produto: prov.produto }),
    });
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false as const, message: "Chave de acesso recusada pelo provedor." };
    }
    return {
      ok: true as const,
      message: `Conexão estabelecida (HTTP ${resp.status}). O endpoint respondeu.`,
    };
  } catch (e: any) {
    return { ok: false as const, message: e?.message || "Não foi possível alcançar o endpoint." };
  }
}
