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
  await d.execute(sql`ALTER TABLE consulta_provedores ADD COLUMN IF NOT EXISTS senha text;`);
  await d.execute(
    sql`ALTER TABLE consulta_provedores ADD COLUMN IF NOT EXISTS auth_modo text DEFAULT 'AUTO';`,
  );


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
    auth_modo: p.auth_modo || "AUTO",
    ativo: !!p.ativo,
    tem_chave: !!p.api_key,
    tem_senha: !!p.senha,
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
  senha?: string | undefined;
  api_key?: string | undefined;
  auth_modo?: string | undefined;
  ativo: boolean;
}) {
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  const trocaChave = typeof data.api_key === "string" && data.api_key.trim().length > 0;
  const trocaSenha = typeof data.senha === "string" && data.senha.trim().length > 0;
  await d.execute(sql`
    UPDATE consulta_provedores SET
      nome = ${data.nome || PROVEDOR_PADRAO.nome},
      base_url = ${data.base_url.replace(/\/+$/, "")},
      caminho_consulta = ${data.caminho_consulta || PROVEDOR_PADRAO.caminho_consulta},
      produto = ${data.produto || PROVEDOR_PADRAO.produto},
      usuario = ${data.usuario || null},
      auth_modo = ${data.auth_modo || "AUTO"},
      ${trocaChave ? sql`api_key = ${data.api_key!.trim()},` : sql``}
      ${trocaSenha ? sql`senha = ${data.senha!.trim()},` : sql``}
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
  if (!p.api_key && !(p.usuario && p.senha)) {
    throw new Error("Informe a chave de acesso ou o usuário e a senha do provedor antes de consultar.");
  }
  return p;
}

type Tentativa = {
  label: string;
  headers: Record<string, string>;
  body: string;
};

function b64(s: string) {
  // eslint-disable-next-line n/no-deprecated-api
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64");
}

/**
 * Monta as variações de autenticação aceitas por webservices do tipo Company Conferi.
 * Em modo AUTO tentamos as combinações mais comuns até uma responder sem 401/403.
 */
function montarTentativas(prov: any, dados: Record<string, any>): Tentativa[] {
  const usuario = prov.usuario ? String(prov.usuario) : "";
  const senha = prov.senha ? String(prov.senha) : "";
  const chave = prov.api_key ? String(prov.api_key) : "";
  const base = { ...dados, produto: prov.produto || "GOLD" };
  const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" };

  const corpoCredenciais = JSON.stringify({
    ...base,
    usuario: usuario || undefined,
    login: usuario || undefined,
    senha: senha || undefined,
    password: senha || undefined,
    token: chave || undefined,
    chave: chave || undefined,
  });
  const corpoSimples = JSON.stringify({ ...base, usuario: usuario || undefined });
  const form = new URLSearchParams();
  Object.entries({
    ...base,
    usuario,
    senha,
    token: chave,
  }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
  });

  const tentativas: Record<string, Tentativa> = {
    CORPO: {
      label: "Usuário e senha no corpo (JSON)",
      headers: jsonHeaders,
      body: corpoCredenciais,
    },
    FORM: {
      label: "Usuário e senha em formulário (x-www-form-urlencoded)",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form.toString(),
    },
    BASIC: {
      label: "Basic auth (usuário:senha)",
      headers: { ...jsonHeaders, Authorization: `Basic ${b64(`${usuario}:${senha || chave}`)}` },
      body: corpoSimples,
    },
    BEARER: {
      label: "Bearer token",
      headers: { ...jsonHeaders, Authorization: `Bearer ${chave}` },
      body: corpoSimples,
    },
    APIKEY: {
      label: "Cabeçalho x-api-key",
      headers: { ...jsonHeaders, "x-api-key": chave },
      body: corpoSimples,
    },
  };

  const modo = String(prov.auth_modo || "AUTO").toUpperCase();
  if (modo !== "AUTO" && tentativas[modo]) return [tentativas[modo]!];

  const ordem: string[] = [];
  if (usuario && senha) ordem.push("CORPO", "FORM", "BASIC");
  if (chave) ordem.push("BEARER", "APIKEY", "CORPO");
  return [...new Set(ordem)].map((k) => tentativas[k]!).filter(Boolean);
}

function parse(texto: string) {
  try {
    return JSON.parse(texto);
  } catch {
    return { raw: texto };
  }
}

/** Executa as tentativas até obter sucesso; devolve diagnóstico de todas. */
async function executarConsulta(prov: any, dados: Record<string, any>) {
  const url = `${String(prov.base_url).replace(/\/+$/, "")}${prov.caminho_consulta || "/consulta"}`;
  const tentativas = montarTentativas(prov, dados);
  const diagnostico: { modo: string; httpStatus: number; mensagem: string }[] = [];
  let ultima: { ok: boolean; httpStatus: number; payload: any; erro: string | null } | null = null;

  for (const t of tentativas) {
    try {
      const resp = await fetch(url, { method: "POST", headers: t.headers, body: t.body });
      const payload = parse(await resp.text());
      const msg =
        primeiro(payload, ["mensagem", "message", "erro", "error", "descricao"]) ||
        (resp.ok ? "OK" : `HTTP ${resp.status}`);
      diagnostico.push({ modo: t.label, httpStatus: resp.status, mensagem: String(msg).slice(0, 300) });
      if (resp.ok) {
        return { ok: true as const, httpStatus: resp.status, payload, erro: null, diagnostico };
      }
      ultima = { ok: false, httpStatus: resp.status, payload, erro: String(msg) };
      if (resp.status !== 401 && resp.status !== 403 && resp.status !== 400) break;
    } catch (e: any) {
      const erro = e?.message || "Falha de comunicação com o provedor.";
      diagnostico.push({ modo: t.label, httpStatus: 0, mensagem: erro });
      ultima = { ok: false, httpStatus: 0, payload: null, erro };
    }
  }

  return {
    ok: false as const,
    httpStatus: ultima?.httpStatus ?? 0,
    payload: ultima?.payload ?? null,
    erro: ultima?.erro ?? "Não foi possível autenticar no provedor.",
    diagnostico,
  };
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

  const r = await executarConsulta(prov, {
    placa: veiculo.placa || undefined,
    chassi: veiculo.chassi || undefined,
    renavam: veiculo.renavam || undefined,
  });

  const payload = r.payload;
  const erro = r.ok ? null : r.erro;
  const status = r.ok
    ? "CONCLUIDA"
    : r.httpStatus === 401 || r.httpStatus === 403
      ? "NAO_AUTORIZADO"
      : "ERRO";


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
  const r = await executarConsulta(prov, { placa: "TESTE000" });
  if (r.ok) {
    return {
      ok: true as const,
      message: `Conexão estabelecida (HTTP ${r.httpStatus}).`,
      diagnostico: r.diagnostico,
    };
  }
  const naoAutorizado = r.diagnostico.some((d) => d.httpStatus === 401 || d.httpStatus === 403);
  return {
    ok: false as const,
    message: naoAutorizado
      ? `Credenciais recusadas pelo provedor. ${r.erro}`
      : r.erro || "Não foi possível alcançar o endpoint.",
    diagnostico: r.diagnostico,
  };
}

/**
 * Consulta de teste por placa digitada (tela de configurações).
 * Não grava nada no banco — serve apenas para validar credenciais/endpoint e inspecionar o retorno.
 */
export async function consultarPlacaAvulsa(placa: string) {
  const prov = await getProvedorComChave();
  const placaLimpa = placa.toUpperCase().replace(/\W/g, "");
  if (placaLimpa.length !== 7) throw new Error("Informe uma placa válida (7 caracteres).");

  const r = await executarConsulta(prov, { placa: placaLimpa });
  if (!r.ok) {
    return {
      ok: false as const,
      httpStatus: r.httpStatus,
      message: r.erro || "Falha de comunicação com o provedor.",
      resumo: null,
      resposta: r.payload,
      diagnostico: r.diagnostico,
    };
  }
  return {
    ok: true as const,
    httpStatus: r.httpStatus,
    message: "Consulta concluída.",
    resumo: resumirRetorno(r.payload),
    resposta: r.payload,
    diagnostico: r.diagnostico,
  };
}

