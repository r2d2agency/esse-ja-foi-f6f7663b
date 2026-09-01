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
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS chassi text;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS renavam text;
  `);
  // Compatibilidade: alguns cadastros legados gravaram o chassi em chassi_parcial.
  await d.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'veiculos' AND column_name = 'chassi_parcial'
      ) THEN
        UPDATE veiculos SET chassi = chassi_parcial WHERE chassi IS NULL AND chassi_parcial IS NOT NULL;
      END IF;
    END $$;
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
  body?: string;
  method?: "POST" | "GET";
  url?: string;
};

function b64(s: string) {
  // eslint-disable-next-line n/no-deprecated-api
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64");
}

function esc(v: any) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Monta as variações de autenticação aceitas por webservices do tipo Company Conferi.
 * O webservice da Conferi é XML: o pedido vai em <conferi><solicitacao usuario senha .../></conferi>.
 */
function montarTentativas(prov: any, dados: Record<string, any>, urlBase: string): Tentativa[] {
  const usuario = prov.usuario ? String(prov.usuario) : "";
  const senha = prov.senha ? String(prov.senha) : "";
  const chave = prov.api_key ? String(prov.api_key) : "";
  const base = { ...dados, produto: prov.produto || "GOLD" };
  const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" };
  const xmlHeaders = { "Content-Type": "application/xml; charset=UTF-8", Accept: "application/xml" };

  const parametros = Object.entries(dados)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `<parametro nome="${esc(k)}" valor="${esc(v)}"/>`)
    .join("");

  const xmlAttr =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<conferi><solicitacao acao="2" usuario="${esc(usuario)}" senha="${esc(senha || chave)}" ` +
    `chave="${esc(chave)}" produto="${esc(prov.produto || "GOLD")}"/>` +
    `<parametros>${parametros}</parametros></conferi>`;

  const xmlTag =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<conferi><solicitacao acao="2"><usuario>${esc(usuario)}</usuario>` +
    `<senha>${esc(senha || chave)}</senha><chave>${esc(chave)}</chave>` +
    `<produto>${esc(prov.produto || "GOLD")}</produto></solicitacao>` +
    `<parametros>${parametros}</parametros></conferi>`;

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
  Object.entries({ ...base, usuario, senha, token: chave }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
  });

  const query = new URLSearchParams();
  Object.entries({ ...dados, usuario, senha: senha || chave, chave, produto: prov.produto })
    .forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") query.append(k, String(v));
    });

  const tentativas: Record<string, Tentativa> = {
    XML: {
      label: "XML Conferi (usuário/senha em atributos)",
      headers: xmlHeaders,
      body: xmlAttr,
    },
    XMLTAG: {
      label: "XML Conferi (usuário/senha em elementos)",
      headers: xmlHeaders,
      body: xmlTag,
    },
    XMLFORM: {
      label: "XML Conferi enviado em campo de formulário (xml=)",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/xml" },
      body: new URLSearchParams({ xml: xmlAttr }).toString(),
    },
    QUERY: {
      label: "Parâmetros na URL (GET)",
      headers: { Accept: "application/xml, application/json" },
      method: "GET",
      url: `${urlBase}?${query.toString()}`,
    },
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

  const ordem: string[] = ["XML", "XMLTAG", "XMLFORM", "QUERY"];
  if (usuario && senha) ordem.push("CORPO", "FORM", "BASIC");
  if (chave) ordem.push("BEARER", "APIKEY", "CORPO");
  return [...new Set(ordem)].map((k) => tentativas[k]!).filter(Boolean);
}

/** Conversor XML → objeto simples (sem DOMParser, compatível com o runtime do servidor). */
function xmlParaObjeto(xml: string): any {
  const root: any = {};
  const pilha: any[] = [root];
  const re = /<\?[^>]*\?>|<!--[\s\S]*?-->|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, fechamento, abertura, attrsRaw, autoFecha, texto] = m;
    const atual = pilha[pilha.length - 1];
    if (fechamento) {
      if (pilha.length > 1) pilha.pop();
    } else if (abertura) {
      const node: any = {};
      const attrRe = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
      let a: RegExpExecArray | null;
      while ((a = attrRe.exec(attrsRaw || ""))) node[a[1]!] = a[2];
      const existente = atual[abertura];
      if (existente === undefined) atual[abertura] = node;
      else if (Array.isArray(existente)) existente.push(node);
      else atual[abertura] = [existente, node];
      if (!autoFecha) pilha.push(node);
    } else if (texto && texto.trim()) {
      const t = texto.trim();
      if (Object.keys(atual).length === 0) {
        (atual as any)["#text"] = t;
      } else {
        (atual as any)["#text"] = ((atual as any)["#text"] || "") + t;
      }
    }
  }
  return root;
}

function parse(texto: string) {
  const t = texto.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.parse(t);
    } catch {
      /* segue para XML/raw */
    }
  }
  if (t.startsWith("<")) {
    try {
      const obj = xmlParaObjeto(t);
      return { ...obj, raw: t };
    } catch {
      return { raw: t };
    }
  }
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t };
  }
}

const PADROES_FALHA = [
  "falha de autentica",
  "falha na autentica",
  "nao autenticado",
  "não autenticado",
  "usuario ou senha",
  "usuário ou senha",
  "acesso negado",
  "credenciais",
  "unauthorized",
  "invalid token",
  "token invalido",
  "token inválido",
];

function mensagemDoRetorno(payload: any): string | null {
  const direto = primeiro(payload, [
    "mensagem",
    "message",
    "erro",
    "error",
    "descricao",
    "conferi.solicitacao.mensagem",
    "conferi.mensagem",
    "conferi.erro.#text",
    "solicitacao.mensagem",
  ]);
  if (direto) return String(direto);
  return null;
}

/** Detecta erro lógico devolvido com HTTP 200 (caso típico da Conferi). */
function falhaLogica(payload: any): string | null {
  const msg = mensagemDoRetorno(payload);
  if (msg) {
    const norm = msg.toLowerCase();
    if (PADROES_FALHA.some((p) => norm.includes(p))) return msg;
  }
  const raw = typeof payload?.raw === "string" ? payload.raw.toLowerCase() : "";
  if (raw) {
    const achou = PADROES_FALHA.find((p) => raw.includes(p));
    if (achou) return msg || "Falha de autenticação informada pelo provedor.";
  }
  return null;
}

/** Executa as tentativas até obter sucesso; devolve diagnóstico de todas. */
async function executarConsulta(prov: any, dados: Record<string, any>) {
  const url = `${String(prov.base_url).replace(/\/+$/, "")}${prov.caminho_consulta || "/consulta"}`;
  const tentativas = montarTentativas(prov, dados, url);
  const diagnostico: { modo: string; httpStatus: number; mensagem: string }[] = [];
  let ultima: { ok: boolean; httpStatus: number; payload: any; erro: string | null } | null = null;

  for (const t of tentativas) {
    try {
      const method = t.method || "POST";
      const init: RequestInit = { method, headers: t.headers };
      if (method !== "GET" && t.body !== undefined) init.body = t.body;
      const resp = await fetch(t.url || url, init);
      const payload = parse(await resp.text());
      const falha = resp.ok ? falhaLogica(payload) : null;
      const msg =
        falha || mensagemDoRetorno(payload) || (resp.ok ? "OK" : `HTTP ${resp.status}`);
      diagnostico.push({
        modo: t.label,
        httpStatus: resp.status,
        mensagem: String(msg).slice(0, 300),
      });
      if (resp.ok && !falha) {
        return { ok: true as const, httpStatus: resp.status, payload, erro: null, diagnostico };
      }
      ultima = { ok: false, httpStatus: resp.status, payload, erro: String(msg) };
      if (!resp.ok && ![400, 401, 403, 404, 405, 415, 500].includes(resp.status)) break;
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

/** Achata a resposta XML da Conferi em um objeto plano nome → valor. */
function achatarConferi(payload: any): Record<string, any> {
  const plano: Record<string, any> = {};
  const visitar = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visitar);
    if (node.nome && node.valor !== undefined) plano[String(node.nome).toLowerCase()] = node.valor;
    for (const [k, v] of Object.entries(node)) {
      if (k === "raw") continue;
      if (v && typeof v === "object") visitar(v);
      else if (typeof v === "string" && k !== "#text") plano[k.toLowerCase()] ??= v;
    }
  };
  visitar(payload?.conferi ?? payload);
  return plano;
}

/** Mapeamento tolerante: cobre variações comuns de nomes de campo do retorno. */
export function resumirRetorno(payload: any) {
  const base = payload?.retorno ?? payload?.data ?? payload?.resultado ?? payload;
  const raiz = payload?.conferi ? { ...achatarConferi(payload), ...base } : base;

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
  await ensureConsultaVeicularSchema();
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

