import { sql } from "drizzle-orm";
import { db } from "./index";
import { codigoConsultaDoPayload, conferiEmProcessamento } from "./conferi-protocolo";
import { criarContextoConsultaLog, registrarEventoConsulta, type ContextoConsultaLog } from "./consulta-logs.server";

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

/**
 * Provedor padrão pré-configurado (Company Conferi — produto Conferi Auto Pericia Gold).
 * Endpoint e nome do produto seguem exatamente a documentação oficial de integração:
 * webservice.companyconferi.com.br/api-clientes/documentacao/documentacao/conferi-auto-pericia-gold
 */
export const PROVEDOR_PADRAO = {
  slug: "company_conferi",
  nome: "Company Conferi",
  base_url: "https://webservice.companyconferi.com.br/api-clientes",
  caminho_consulta: "/conferi-veiculo/json",
  produto: "conferi-auto-pericia-gold",
};

/** URL de homologação do produto — usada para validar credenciais sem gerar cobrança. */
const URL_HOMOLOGACAO =
  "https://webservice.companyconferi.com.br/api-clientes-homologacao/conferi-veiculo?responseType=xml";

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
  await d.execute(
    sql`ALTER TABLE consulta_provedores ADD COLUMN IF NOT EXISTS webhook_token text;`,
  );
  // Testes usam o mesmo ciclo das consultas do cadastro, sem criar veículos fictícios.
  await d.execute(sql`ALTER TABLE veiculo_consultas ALTER COLUMN veiculo_id DROP NOT NULL;`);
  await d.execute(sql`ALTER TABLE veiculo_consultas ADD COLUMN IF NOT EXISTS parametros jsonb;`);
  await d.execute(
    sql`CREATE INDEX IF NOT EXISTS veiculo_consultas_protocolo_idx ON veiculo_consultas (protocolo);`,
  );
  // Token usado para autenticar o webhook (a Conferi não assina a chamada) — gerado uma
  // única vez por instalação, na primeira vez que a linha existir sem um.
  await d.execute(sql`
    UPDATE consulta_provedores SET webhook_token = replace(gen_random_uuid()::text, '-', '')
    WHERE webhook_token IS NULL
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
  } else {
    // Corrige instalações antigas que ficaram com o endpoint/produto incorretos
    // (a versão anterior usava um contrato de API que nunca correspondeu ao real,
    // por isso a integração nunca funcionava). O produto exigido pela Conferi é
    // um valor fixo, então sempre o mantemos correto; base_url/caminho só são
    // corrigidos quando ainda estão no valor-padrão antigo, preservando qualquer
    // customização deliberada (ex.: apontar para homologação).
    await d.execute(sql`
      UPDATE consulta_provedores SET
        produto = ${PROVEDOR_PADRAO.produto},
        base_url = CASE
          WHEN base_url = 'https://webservice.companyconferi.com.br'
          THEN ${PROVEDOR_PADRAO.base_url}
          ELSE base_url
        END,
        caminho_consulta = CASE
          WHEN caminho_consulta IN ('/consulta', '/api-clientes/consulta')
          THEN ${PROVEDOR_PADRAO.caminho_consulta}
          ELSE caminho_consulta
        END
      WHERE slug = ${PROVEDOR_PADRAO.slug}
    `);
  }
}

function mascarar(chave?: string | null) {
  if (!chave) return "";
  if (chave.length <= 6) return "••••";
  return `${chave.slice(0, 3)}••••••${chave.slice(-3)}`;
}

/** Configuração visível no admin — a senha nunca é devolvida em texto puro. */
export async function getProvedorConsulta() {
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  const p = rowsOf(
    await d.execute(
      sql`SELECT * FROM consulta_provedores WHERE slug = ${PROVEDOR_PADRAO.slug} LIMIT 1`,
    ),
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
    tem_senha: !!p.senha,
    chave_mascarada: mascarar(p.senha),
    webhook_token: p.webhook_token,
    atualizado_em: p.atualizado_em,
  };
}

/** Usado só pelo endpoint público do webhook para validar o token recebido na URL. */
export async function getWebhookTokenConferi() {
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  const p = rowsOf(
    await d.execute(
      sql`SELECT webhook_token FROM consulta_provedores WHERE slug = ${PROVEDOR_PADRAO.slug} LIMIT 1`,
    ),
  )[0];
  return p?.webhook_token || null;
}

export async function salvarProvedorConsulta(data: {
  nome?: string | undefined;
  base_url: string;
  caminho_consulta?: string | undefined;
  produto?: string | undefined;
  usuario?: string | undefined;
  senha?: string | undefined;
  ativo: boolean;
}) {
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  if (data.usuario && !/^\d+$/.test(data.usuario.trim())) {
    throw new Error("O usuário da Company Conferi é numérico (código de acesso da plataforma).");
  }
  const trocaSenha = typeof data.senha === "string" && data.senha.trim().length > 0;
  await d.execute(sql`
    UPDATE consulta_provedores SET
      nome = ${data.nome || PROVEDOR_PADRAO.nome},
      base_url = ${data.base_url.replace(/\/+$/, "")},
      caminho_consulta = ${data.caminho_consulta || PROVEDOR_PADRAO.caminho_consulta},
      produto = ${PROVEDOR_PADRAO.produto},
      usuario = ${data.usuario || null},
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
    await d.execute(
      sql`SELECT * FROM consulta_provedores WHERE slug = ${PROVEDOR_PADRAO.slug} LIMIT 1`,
    ),
  )[0];
  if (!p) throw new Error("Provedor de consulta não configurado.");
  if (!p.ativo) throw new Error("O módulo de consulta veicular está desativado.");
  if (!p.usuario || !p.senha) {
    throw new Error("Informe o usuário e a senha da Company Conferi antes de consultar.");
  }
  return p;
}

type ConferiParametros = Record<string, string | number | undefined | null>;

/**
 * Monta o corpo da requisição exatamente como descrito na documentação oficial:
 * { usuario: Number, senha: String, parametros: { placa|chassi, produto }, codigo_consulta? }
 * Não há cabeçalho de autenticação separado — usuario e senha viajam no corpo.
 */
function montarCorpo(prov: any, parametros: ConferiParametros, codigoConsulta?: string) {
  const usuarioTexto = String(prov.usuario ?? "").trim();
  const usuarioNum = Number(usuarioTexto);
  const corpo: Record<string, any> = {
    usuario: usuarioTexto && Number.isFinite(usuarioNum) ? usuarioNum : prov.usuario,
    senha: prov.senha,
  };
  if (codigoConsulta) {
    const num = Number(codigoConsulta);
    corpo.codigo_consulta = Number.isFinite(num) ? num : codigoConsulta;
  }
  corpo.parametros = Object.fromEntries(
    Object.entries(parametros).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  return JSON.stringify(corpo);
}

/** Conversor XML → objeto simples (sem DOMParser, compatível com o runtime do servidor). */
function xmlParaObjeto(xml: string): any {
  const root: any = {};
  const pilha: any[] = [root];
  const re =
    /<\?[^>]*\?>|<!--[\s\S]*?-->|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
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

function primeiro(obj: any, chaves: string[]) {
  for (const k of chaves) {
    const v = k.split(".").reduce((acc: any, part) => (acc == null ? acc : acc[part]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

/** A resposta pode vir com o objeto raiz nomeado "conferi" (espelhando o XML) ou já "achatada". */
function raizDoPayload(payload: any): any {
  return payload?.conferi ?? payload ?? {};
}

/** Mensagens oficiais por código de "acao" (seção 6 da documentação). */
const MENSAGENS_ACAO: Record<string, string> = {
  "2": "Falha de autenticação: usuário ou senha incorretos.",
  "3": "Dados incorretos: verifique a placa/chassi informados.",
  "4": "Sistema indisponível no provedor. A consulta foi registrada e pode ser reenviada mais tarde com o código de consulta.",
  "6": "Código pré-pago sem créditos suficientes para este produto.",
  "8": "Este usuário não tem acesso a este produto/consulta.",
  "9": "Consulta não está mais disponível (criada há mais de 60 dias).",
};

function mensagemDoRetorno(payload: any): string | null {
  const raiz = raizDoPayload(payload);
  const direto = primeiro(raiz, ["solicitacao.mensagem", "mensagem", "message", "erro", "error"]);
  return direto ? String(direto) : null;
}

/** Detecta erro lógico devolvido com HTTP 200, usando o código "acao" da solicitação. */
function falhaLogica(payload: any): string | null {
  const raiz = raizDoPayload(payload);
  const acao = primeiro(raiz, ["solicitacao.acao"]);
  if (acao === null) return null;
  const codigo = textoDe(acao);
  if (codigo === "1") return null;
  const msgApi = primeiro(raiz, ["solicitacao.mensagem"]);
  return (
    MENSAGENS_ACAO[codigo] ||
    (msgApi ? String(msgApi) : `Solicitação recusada pelo provedor (acao=${codigo}).`)
  );
}

type ResultadoConsulta = {
  ok: boolean;
  httpStatus: number;
  payload: any;
  erro: string | null;
  diagnostico: { modo: string; httpStatus: number; mensagem: string }[];
};

/** Chamada HTTP crua (POST, JSON) + parse da resposta — compartilhada por qualquer produto Conferi. */
async function chamarConferi(url: string, body: string, contexto?: ContextoConsultaLog): Promise<ResultadoConsulta> {
  const diagnostico: { modo: string; httpStatus: number; mensagem: string }[] = [];
  const parametrosEnvio = JSON.parse(body);
  const log = contexto || criarContextoConsultaLog({
    origem: url.includes("homologacao") ? "HOMOLOGACAO" : "POR_PLACA",
    placa: parametrosEnvio.parametros?.placa || null,
    protocolo: parametrosEnvio.codigo_consulta ? String(parametrosEnvio.codigo_consulta) : null,
    produto: parametrosEnvio.parametros?.produto || (url.includes("conferi-agregados") ? "conferi-agregados" : DESVALORIZACAO_PRODUTO),
  });
  const inicio = Date.now();
  await registrarEventoConsulta(log, log.protocolo ? "RESGATE_ENVIADO" : "CONSULTA_ENVIADA", "PENDENTE", log.protocolo ? "Resgate enviado à Company com o código da consulta." : "Consulta enviada à Company. Aguardando resposta.");
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, application/xml" },
      body,
      signal: AbortSignal.timeout(30000),
    });
    const payload = parse(await resp.text());
    log.protocolo = codigoConsultaDoPayload(payload) || log.protocolo;
    await registrarEventoConsulta(log, "RESPOSTA_RECEBIDA", "RECEBIDA", "Resposta HTTP recebida da Company.", resp.status, Date.now() - inicio);
    const falha = resp.ok ? falhaLogica(payload) : null;
    const msg = falha || mensagemDoRetorno(payload) || (resp.ok ? "OK" : `HTTP ${resp.status}`);
    diagnostico.push({
      modo: "POST JSON",
      httpStatus: resp.status,
      mensagem: String(msg).slice(0, 300),
    });

    if (resp.ok && !falha) {
      if (!contexto) await registrarEventoConsulta(log, "CONSULTA_CONCLUIDA", "CONCLUIDA", "Resposta disponível para preenchimento dos dados.", resp.status);
      return { ok: true, httpStatus: resp.status, payload, erro: null, diagnostico };
    }
    if (!contexto) await registrarEventoConsulta(log, conferiEmProcessamento(payload) ? "AGUARDANDO_RESPOSTA" : "FALHA_CONSULTA", conferiEmProcessamento(payload) ? "PROCESSANDO" : "ERRO", conferiEmProcessamento(payload) ? "A Company ainda está processando a consulta." : "A Company não concluiu a consulta. Verifique o diagnóstico da pesquisa.", resp.status);
    return {
      ok: false,
      httpStatus: resp.status,
      payload,
      erro: falha || mensagemDoRetorno(payload) || `HTTP ${resp.status}`,
      diagnostico,
    };
  } catch (e: any) {
    await registrarEventoConsulta(log, "FALHA_COMUNICACAO", "ERRO", "Falha de comunicação ou tempo de espera excedido ao chamar a Company.", 0, Date.now() - inicio);
    const erro = e?.message || "Falha de comunicação com o provedor.";
    diagnostico.push({ modo: "POST JSON", httpStatus: 0, mensagem: erro });
    return { ok: false, httpStatus: 0, payload: null, erro, diagnostico };
  }
}

/** Executa a chamada ao endpoint do produto Conferi Auto Pericia Gold (POST, JSON). */
async function executarConsulta(
  prov: any,
  parametros: ConferiParametros,
  opcoes: { codigoConsulta?: string; url?: string; contexto?: ContextoConsultaLog } = {},
): Promise<ResultadoConsulta> {
  const url =
    opcoes.url ||
    `${String(prov.base_url).replace(/\/+$/, "")}${prov.caminho_consulta || PROVEDOR_PADRAO.caminho_consulta}`;
  const body = montarCorpo(
    prov,
    { ...parametros, produto: PROVEDOR_PADRAO.produto },
    opcoes.codigoConsulta,
  );
  return chamarConferi(url, body, opcoes.contexto);
}

/** Junta valores não vazios de restrições em um único texto legível. */
function juntarNaoVazios(valores: any[]): string | null {
  const vistos = new Set<string>();
  const filtrados = valores
    .map((v) => (v === null || v === undefined ? "" : String(v).trim()))
    .filter((v) => v.length > 0)
    .filter((v) => {
      const chave = v.toLowerCase();
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  return filtrados.length ? filtrados.join(" / ") : null;
}

/** Achata valores-folha de um objeto para exibição de diagnóstico (campos fora do mapeamento). */
function achatarLeaves(node: any, prefixo = "", saida: Record<string, any> = {}, profundidade = 0) {
  if (node == null || profundidade > 4) return saida;
  if (Array.isArray(node)) {
    node.forEach((item, i) =>
      achatarLeaves(item, prefixo ? `${prefixo}[${i}]` : String(i), saida, profundidade + 1),
    );
    return saida;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "raw" || k === "#text") continue;
      achatarLeaves(v, prefixo ? `${prefixo}.${k}` : k, saida, profundidade + 1);
    }
    return saida;
  }
  if (node !== "") saida[prefixo] = node;
  return saida;
}

/** Mapeia a resposta (blocos agregados/estadual/historicoRouboFurto/sinistro/leilao/csv) para um resumo legível. */
export function resumirRetorno(payload: any) {
  const raiz = raizDoPayload(payload);
  const agregados = raiz.agregados ?? {};
  const estadual = raiz.estadual ?? {};
  const bin = raiz.bin ?? {};
  const historicoRF = raiz.historicoRouboFurto ?? {};
  const sinistro = raiz.sinistro ?? {};
  const indicioSinistro = raiz.indicioSinistro ?? {};
  const leilao = raiz.leilao ?? {};
  const csv = raiz.csv ?? {};
  const alertaAcidente = raiz.alertaDeAcidente ?? null;

  const restricoes = juntarNaoVazios([
    agregados.restricao1,
    agregados.restricao2,
    agregados.restricao3,
    agregados.restricao4,
    estadual.restricoes,
    estadual.restricoes_01,
    estadual.restricoes_02,
    estadual.restricoes_03,
    estadual.restricoes_04,
    estadual.restricoes_05,
  ]);

  const temRegistroLeilao = !!leilao?.leiloes?.leilao;
  const temDebito = [
    estadual.existeDebitoMulta,
    estadual.existeDebitoIPVA,
    estadual.existeDebitoLicenciamento,
    estadual.existeDebitoDpvat,
  ].some((v) => {
    const norm = String(v ?? "")
      .trim()
      .toLowerCase();
    return norm && norm !== "nao" && norm !== "não" && norm !== "0" && norm !== "false";
  });

  const resumo = {
    protocolo: codigoConsultaDoPayload(payload),
    situacao: primeiro({ agregados, estadual, bin }, [
      "agregados.situacao",
      "estadual.situacao",
      "bin.situacao",
    ]),
    roubo_furto: historicoRF.alertaMensagem || null,
    restricoes,
    leilao: temRegistroLeilao ? "Consta ocorrência de leilão" : leilao?.mensagem || null,
    sinistro: sinistro.mensagem || indicioSinistro.mensagem || null,
    debitos: temDebito ? "Consta débito em aberto" : estadual.mensagem || null,
    renajud:
      estadual.restricoesRenajud || estadual.restricaoRenajud || bin.restricaoRenajud || null,
    alerta_acidente: (alertaAcidente as any)?.mensagem || null,
    documento_url: csv?.retorno?.pdf_path || null,
    hash_pesquisa: raiz.hashPesquisa || null,
  };

  const conhecidos = new Set(Object.keys(resumo));
  const tudoNulo = Object.values(resumo).every((v) => v === null || v === undefined || v === "");
  if (!tudoNulo) return resumo;

  // Nada do mapeamento padrão veio preenchido: expõe os campos brutos para diagnóstico.
  const extras: Record<string, any> = {};
  for (const [k, v] of Object.entries(achatarLeaves(raiz))) {
    if (conhecidos.has(k)) continue;
    extras[k] = v;
  }
  return { ...resumo, ...(Object.keys(extras).length > 0 ? { extras } : {}) };
}

export async function consultarLaudoVeiculo(veiculoId: string, criadoPor?: string | null) {
  return iniciarConsultaRegistrada(PROVEDOR_PADRAO.produto, { veiculoId, criadoPor });
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

/**
 * Testa usuário/senha contra o ambiente de homologação do produto (seção 2.3 da documentação),
 * que simula retornos sem gerar cobrança — não consulta o ambiente de produção.
 */
export async function testarConexaoProvedor() {
  const prov = await getProvedorComChave();
  const r = await executarConsulta(prov, { placa: "ABC1234" }, { url: URL_HOMOLOGACAO });
  if (r.ok) {
    return {
      ok: true as const,
      message: `Credenciais validadas no ambiente de homologação (HTTP ${r.httpStatus}).`,
      diagnostico: r.diagnostico,
    };
  }
  return {
    ok: false as const,
    message: r.erro || "Não foi possível validar as credenciais no ambiente de homologação.",
    diagnostico: r.diagnostico,
  };
}

/**
 * Consulta de teste por placa digitada (tela de configurações), no ambiente de produção.
 * Gera uma consulta real (e possível cobrança) — não grava nada no cadastro de veículos.
 */
export async function consultarPlacaAvulsa(placa: string) {
  return iniciarConsultaRegistrada(PROVEDOR_PADRAO.produto, { placa });
}

/**
 * Caminho fixo do produto Conferi Agregados — diferente do produto Pericia Gold (cuja rota é
 * configurável em `caminho_consulta`), este é só dados básicos do veículo (marca/modelo/ano/cor),
 * então não precisa de tela própria de configuração. Mesma conta (usuario/senha) dos dois produtos.
 */
const AGREGADOS_CAMINHO_CONSULTA = "/conferi-agregados/json";

/**
 * Ao contrário da Pericia Gold, o corpo da requisição de Agregados NÃO leva o campo "produto" —
 * é só { usuario, senha, parametros: { placa|chassi|motor|cambio } }, por isso não reaproveita
 * `executarConsulta` (que sempre injeta o produto da Pericia Gold).
 */
async function executarConsultaAgregados(
  prov: any,
  parametros: ConferiParametros,
): Promise<ResultadoConsulta> {
  // base_url é um campo livre editado pelo admin (tela de configurações) e pode já conter o
  // caminho de outro produto (ex.: alguém colou a URL completa da Pericia Gold ali) — remove
  // qualquer sufixo de produto conhecido antes de montar a URL do Agregados, pra não gerar uma
  // URL quebrada tipo ".../conferi-veiculo/json/conferi-agregados/json".
  const raiz = String(prov.base_url)
    .replace(/\/+$/, "")
    .replace(/\/conferi-veiculo.*$/i, "")
    .replace(/\/conferi-agregados.*$/i, "");
  const url = `${raiz}${AGREGADOS_CAMINHO_CONSULTA}`;
  const body = montarCorpo(prov, parametros);
  return chamarConferi(url, body);
}

/**
 * A resposta em produção vem em JSON (valores já são string), mas se algum dia vier em XML o
 * conversor xmlParaObjeto embrulha texto de folha como { "#text": "valor" } — sem isso, um campo
 * viraria um objeto em vez de string e quebraria o preenchimento do formulário.
 */
function textoDe(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return String((v as any)["#text"] ?? "");
  return String(v);
}

/** Campos básicos do veículo (produto Conferi Agregados) prontos para pré-preencher um formulário. */
export function mapearAgregadosParaFormulario(payload: any) {
  const raiz = raizDoPayload(payload).agregados ?? raizDoPayload(payload);
  return {
    marca: textoDe(primeiro(raiz, ["marca"])),
    modelo: textoDe(primeiro(raiz, ["modelo"])),
    cor: textoDe(primeiro(raiz, ["cor"])),
    anoFabricacao: textoDe(primeiro(raiz, ["anoFabricacao"])),
    anoModelo: textoDe(primeiro(raiz, ["anoModelo"])),
    combustivel: textoDe(primeiro(raiz, ["combustivel"])),
    cambio: textoDe(primeiro(raiz, ["caixaCambio"])),
    chassi: textoDe(primeiro(raiz, ["chassi"])),
    renavam: textoDe(primeiro(raiz, ["renavam"])),
    municipio: textoDe(primeiro(raiz, ["municipio"])),
    uf: textoDe(primeiro(raiz, ["Uf", "uf"])),
  };
}

/**
 * Busca dados básicos do veículo pela placa (produto Conferi Agregados) para pré-preencher o
 * cadastro assim que o vendedor digita a placa — evita erro de digitação em marca/modelo/ano/cor.
 * Não grava nada; quem chama decide o que fazer com o retorno.
 */
export async function consultarAgregadosPorPlaca(placa: string) {
  const prov = await getProvedorComChave();
  const placaLimpa = placa.toUpperCase().replace(/\W/g, "");
  if (placaLimpa.length !== 7) throw new Error("Informe uma placa válida (7 caracteres).");

  const r = await executarConsultaAgregados(prov, { placa: placaLimpa });
  if (!r.ok) {
    return {
      ok: false as const,
      httpStatus: r.httpStatus,
      message: r.erro || "Falha de comunicação com o provedor.",
      dados: null,
      diagnostico: r.diagnostico,
    };
  }
  const dados = mapearAgregadosParaFormulario(r.payload);
  const encontrado = Object.values(dados).some((v) => v);
  if (!encontrado) {
    return {
      ok: false as const,
      httpStatus: r.httpStatus,
      message: "Nenhum registro encontrado para esta placa.",
      dados: null,
      diagnostico: r.diagnostico,
    };
  }
  return {
    ok: true as const,
    httpStatus: r.httpStatus,
    message: "Dados localizados.",
    dados,
    diagnostico: r.diagnostico,
  };
}

/**
 * Caminho fixo do produto Conferi Desvalorização Fipe — como o Agregados, não leva o campo
 * "produto" no corpo, só { usuario, senha, parametros: { placa }, codigo_consulta? }.
 */
const DESVALORIZACAO_CAMINHO_CONSULTA = "/conferi-desvalorizacao/json";
const DESVALORIZACAO_PRODUTO = "conferi-desvalorizacao-fipe";

async function executarConsultaDesvalorizacao(
  prov: any,
  parametros: ConferiParametros,
  codigoConsulta?: string,
  contexto?: ContextoConsultaLog,
): Promise<ResultadoConsulta> {
  const raiz = String(prov.base_url)
    .replace(/\/+$/, "")
    .replace(/\/conferi-veiculo.*$/i, "")
    .replace(/\/conferi-agregados.*$/i, "")
    .replace(/\/conferi-desvalorizacao.*$/i, "");
  const url = `${raiz}${DESVALORIZACAO_CAMINHO_CONSULTA}`;
  const body = montarCorpo(prov, parametros, codigoConsulta);
  return chamarConferi(url, body, contexto);
}

/** "R$ 71.123,00" -> 71123 (reais, não centavos) — mesma unidade da coluna veiculos.valor_fipe. */
function valorMonetarioParaNumero(texto: any): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  const t = textoDe(texto);
  if (!t || !/\d/.test(t)) return null;
  const bruto = t.replace(/[^\d,.-]/g, "");
  const limpo = bruto.includes(",")
    ? bruto.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(bruto)
      ? bruto.replace(/\./g, "")
      : bruto;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function numeroOuNulo(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Mapeia a resposta do produto Desvalorização Fipe (valor atual + histórico de anos) para exibição. */
export function mapearDesvalorizacaoFipe(payload: any) {
  const raiz = raizDoPayload(payload);
  const lista = raiz?.precificador?.precificador;
  const item = Array.isArray(lista) ? lista[0] : lista;
  if (!item) return null;

  const historicoBruto = item.historico ?? item.Historicos?.historico ?? [];
  const historico = (Array.isArray(historicoBruto) ? historicoBruto : [historicoBruto]).map(
    (h: any) => ({
      referencia: textoDe(h?.referencia),
      valor: numeroOuNulo(h?.valor),
      status: textoDe(h?.status),
      variacaoNominal: numeroOuNulo(h?.variacao_nominal),
      variacaoPercentual: numeroOuNulo(h?.variacao_percentual),
    }),
  );

  const resumoBruto = item.resumo;
  const resumo = resumoBruto
    ? {
        valorInicial: numeroOuNulo(resumoBruto.valor_inicial),
        valorFinal: numeroOuNulo(resumoBruto.valor_final),
        variacaoAcumuladaNominal: numeroOuNulo(resumoBruto.variacao_acumulada_nominal),
        variacaoAcumuladaPercentual: numeroOuNulo(resumoBruto.variacao_acumulada_percentual),
        anosAnalisados: numeroOuNulo(resumoBruto.anos_analisados),
        anosIndisponiveis: numeroOuNulo(resumoBruto.anos_indisponiveis),
      }
    : null;

  return {
    valor: textoDe(primeiro(item, ["Valor"])),
    valorNumero: valorMonetarioParaNumero(item.Valor),
    marca: textoDe(primeiro(item, ["Marca"])),
    modelo: textoDe(primeiro(item, ["Modelo"])),
    combustivel: textoDe(primeiro(item, ["Combustivel"])),
    anoModelo: textoDe(primeiro(item, ["AnoModelo"])),
    codigoFipe: textoDe(primeiro(item, ["CodigoFipe"])),
    mesReferencia: textoDe(primeiro(item, ["MesReferencia"])),
    historico,
    resumo,
  };
}

/**
 * Consulta o valor FIPE atual e o histórico de desvalorização do veículo pela placa (produto
 * Conferi Desvalorização Fipe). Registra a consulta em `veiculo_consultas` — igual ao laudo
 * completo — e reaproveita o protocolo de uma consulta anterior (até 60 dias) para não gerar
 * cobrança em duplicidade. Quando o provedor ainda está processando (acao=4), devolve
 * status "PROCESSANDO" enquanto aguarda o webhook; a tela acompanha apenas o banco.
 */
export async function consultarDesvalorizacaoFipe(veiculoId: string, criadoPor?: string | null) {
  return iniciarConsultaRegistrada(DESVALORIZACAO_PRODUTO, { veiculoId, criadoPor });
}

/**
 * Versão "avulsa" do produto Desvalorização Fipe — só pela placa, sem vincular a um veículo
 * cadastrado. Registra o teste para receber o webhook. Usada na tela de configurações para validar a integração,
 * do mesmo jeito que `consultarAgregadosPorPlaca` é usada para testar o produto Agregados.
 */
export async function consultarDesvalorizacaoFipePorPlaca(placa: string) {
  return iniciarConsultaRegistrada(DESVALORIZACAO_PRODUTO, { placa });
}

function retornoRegistrado(consulta: any) {
  const fipe = consulta.produto === DESVALORIZACAO_PRODUTO;
  const processando = consulta.status === "PROCESSANDO";
  return {
    ok: processando || consulta.status === "CONCLUIDA",
    id: String(consulta.id),
    status: consulta.status as string,
    protocolo: consulta.protocolo as string | null,
    message: processando
      ? "Consulta em processamento. O resultado será atualizado automaticamente."
      : consulta.status === "CONCLUIDA"
        ? "Consulta concluída."
        : consulta.erro || "Não foi possível concluir a consulta.",
    dados: fipe && consulta.status === "CONCLUIDA" ? consulta.resumo : null,
    resumo: fipe ? null : consulta.resumo,
    resposta: consulta.resposta,
  };
}

/** Apenas lê nosso banco: acompanhar uma pendência nunca inicia outra pesquisa. */
export async function obterConsultaRegistrada(id: string) {
  const consulta = rowsOf(
    await requireDb().execute(sql`
    SELECT id, produto, status, protocolo, resumo, resposta, erro
    FROM veiculo_consultas WHERE id = ${id}::uuid
  `),
  )[0];
  if (!consulta) throw new Error("Consulta não encontrada.");
  return retornoRegistrado(consulta);
}

function resultadoRegistravel(produto: string, r: ResultadoConsulta, inicial = false) {
  const parcial =
    (inicial && produto === PROVEDOR_PADRAO.produto && r.ok) ||
    (r.httpStatus >= 200 && r.httpStatus < 300 && conferiEmProcessamento(r.payload));
  const dados: any =
    produto === DESVALORIZACAO_PRODUTO
      ? mapearDesvalorizacaoFipe(r.payload)
      : resumirRetorno(r.payload);
  // Para FIPE o objetivo é o valor atual, mesmo se o histórico estiver indisponível.
  const temValor = produto === DESVALORIZACAO_PRODUTO && r.ok && (dados as any)?.valorNumero > 0;
  const status = temValor ? "CONCLUIDA" : parcial ? "PROCESSANDO" : r.ok ? "CONCLUIDA" : "ERRO";
  if (status === "CONCLUIDA" && produto === DESVALORIZACAO_PRODUTO && !temValor) {
    return {
      status: "ERRO",
      resumo: {},
      erro: "A consulta terminou sem um valor FIPE válido para esta placa.",
    };
  }
  return { status, resumo: dados ?? {}, erro: status === "ERRO" ? r.erro : null };
}

async function executarProduto(
  prov: any,
  produto: string,
  parametros: ConferiParametros,
  protocolo?: string,
  contexto?: ContextoConsultaLog,
) {
  if (produto === DESVALORIZACAO_PRODUTO)
    return executarConsultaDesvalorizacao(prov, parametros, protocolo, contexto);
  if (produto === PROVEDOR_PADRAO.produto)
    return executarConsulta(prov, parametros, { codigoConsulta: protocolo, contexto });
  throw new Error("Produto não suportado pelo webhook.");
}

/** Cadastro e testes compartilham persistência, estados e recuperação pelo webhook. */
async function iniciarConsultaRegistrada(
  produto: string,
  entrada: { veiculoId?: string; placa?: string; criadoPor?: string | null },
) {
  await ensureConsultaVeicularSchema();
  const prov = await getProvedorComChave();
  const d = requireDb();
  const veiculo = entrada.veiculoId
    ? rowsOf(
        await d.execute(sql`
    SELECT id, placa, chassi FROM veiculos WHERE id = ${entrada.veiculoId}::uuid
  `),
      )[0]
    : null;
  if (entrada.veiculoId && !veiculo) throw new Error("Veículo não encontrado.");
  const placa = String(veiculo?.placa || entrada.placa || "")
    .toUpperCase()
    .replace(/\W/g, "");
  if (placa.length !== 7 && !(produto === PROVEDOR_PADRAO.produto && veiculo?.chassi)) {
    throw new Error("Informe uma placa válida (7 caracteres).");
  }
  const parametros: ConferiParametros = { placa: placa || undefined };
  if (produto === PROVEDOR_PADRAO.produto && veiculo?.chassi) parametros.chassi = veiculo.chassi;
  const contexto = criarContextoConsultaLog({ origem: entrada.veiculoId ? "CADASTRO" : "TESTE", veiculoId: entrada.veiculoId, placa: placa || null, produto });
  try {
  const retorno = await d.transaction(async (tx) => {
    // Serializa cliques repetidos para não criar duas pesquisas antes de salvar o protocolo.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${produto}:${entrada.veiculoId || placa}`}))`,
    );
    const anterior = rowsOf(
      await tx.execute(sql`
      SELECT * FROM veiculo_consultas
      WHERE produto = ${produto} AND placa IS NOT DISTINCT FROM ${placa || null}
        AND veiculo_id IS NOT DISTINCT FROM ${entrada.veiculoId || null}::uuid
        AND chassi IS NOT DISTINCT FROM ${parametros.chassi || null}
        AND criado_em > now() - interval '60 days'
      ORDER BY criado_em DESC LIMIT 1
    `),
    )[0];
    const protocoloAnterior =
      anterior?.protocolo && anterior.protocolo !== "[object Object]"
        ? String(anterior.protocolo).trim() || codigoConsultaDoPayload(anterior?.resposta)
      : codigoConsultaDoPayload(anterior?.resposta);
    contexto.protocolo = protocoloAnterior;
    contexto.consultaId = anterior?.id;
    const concluidaValida =
      anterior?.status === "CONCLUIDA" &&
      (produto === DESVALORIZACAO_PRODUTO
        ? anterior.resumo?.valorNumero > 0
        : !conferiEmProcessamento(anterior.resposta));
    if (anterior && (anterior.status === "PROCESSANDO" || concluidaValida) && protocoloAnterior) {
      if (anterior.protocolo !== protocoloAnterior) {
        await tx.execute(
          sql`UPDATE veiculo_consultas SET protocolo = ${protocoloAnterior} WHERE id = ${anterior.id}::uuid`,
        );
      }
      return retornoRegistrado({ ...anterior, protocolo: protocoloAnterior });
    }
    const r = await executarProduto(
      prov,
      produto,
      anterior?.parametros || parametros,
      protocoloAnterior || undefined,
      contexto,
    );
    const resultado = resultadoRegistravel(produto, r, !protocoloAnterior);
    const protocolo = codigoConsultaDoPayload(r.payload) || protocoloAnterior || null;
    if (resultado.status === "PROCESSANDO" && !protocolo) {
      resultado.status = "ERRO";
      resultado.erro =
        "A Company retornou processamento sem código de consulta. Verifique a resposta antes de tentar novamente.";
    }
    const resumo = JSON.stringify(resultado.resumo);
    const resposta = JSON.stringify(r.payload);
    const registro =
      anterior && protocoloAnterior
        ? rowsOf(
            await tx.execute(sql`
          UPDATE veiculo_consultas SET status = ${resultado.status}, protocolo = ${protocolo},
            resumo = ${resumo}::jsonb, resposta = ${resposta}::jsonb, erro = ${resultado.erro}
          WHERE id = ${anterior.id}::uuid RETURNING *
        `),
          )[0]
        : rowsOf(
            await tx.execute(sql`
          INSERT INTO veiculo_consultas (veiculo_id, provedor, produto, placa, chassi, parametros, status, protocolo, resumo, resposta, erro, criado_por)
          VALUES (${entrada.veiculoId || null}::uuid, ${prov.nome}, ${produto}, ${placa || null}, ${parametros.chassi || null},
            ${JSON.stringify(parametros)}::jsonb, ${resultado.status}, ${protocolo}, ${resumo}::jsonb, ${resposta}::jsonb, ${resultado.erro}, ${entrada.criadoPor || null}::uuid)
          RETURNING *
        `),
          )[0];
    contexto.consultaId = registro.id;
    contexto.protocolo = protocolo;
    if (produto === PROVEDOR_PADRAO.produto) {
      await tx.execute(
        sql`UPDATE veiculo_consultas SET documento_url = ${(resultado.resumo as any)?.documento_url || null} WHERE id = ${registro.id}::uuid`,
      );
    }
    if (
      produto === PROVEDOR_PADRAO.produto &&
      entrada.veiculoId &&
      resultado.status === "CONCLUIDA"
    ) {
      await tx.execute(
        sql`UPDATE veiculos SET consulta_habilitada = true WHERE id = ${entrada.veiculoId}::uuid`,
      );
    }
    return { ...retornoRegistrado(registro), httpStatus: r.httpStatus, diagnostico: r.diagnostico };
  });
  await registrarEventoConsulta(contexto, retorno.status === "PROCESSANDO" ? "AGUARDANDO_RESPOSTA" : retorno.ok ? "RESULTADO_DISPONIVEL" : "FALHA_CONSULTA", retorno.status, retorno.status === "PROCESSANDO" ? "Consulta registrada. Aguardando a conclusão e o webhook da Company." : retorno.ok ? "Resultado disponível no sistema." : "Consulta registrada com erro. Verifique o diagnóstico da pesquisa.");
  return retorno;
  } catch (erro) {
    await registrarEventoConsulta(contexto, "FALHA_REGISTRO", "ERRO", "Não foi possível finalizar o registro da consulta no sistema.");
    throw erro;
  }
}

/**
 * Processa a notificação do webhook da Company Conferi: eles avisam só o `codigo_consulta`
 * (por GET), e o nosso lado é quem faz a segunda requisição de fato — reenviando o mesmo
 * corpo do produto original mais o `codigo_consulta` — para resgatar o resultado completo.
 * Localiza a consulta pendente pelo protocolo, atualiza `veiculo_consultas` e, no caso da
 * Desvalorização Fipe, já grava o valor FIPE encontrado no veículo (sem exigir confirmação
 * manual), preservando o valor de interesse do cliente já cadastrado.
 */
export async function processarWebhookConferi(codigoConsulta: string) {
  const contexto = criarContextoConsultaLog({ origem: "WEBHOOK", protocolo: codigoConsulta });
  await registrarEventoConsulta(contexto, "WEBHOOK_RECEBIDO", "RECEBIDA", "Notificação recebida da Company. Localizando a consulta.");
  try {
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  const prov = await getProvedorComChave();

  let consultas = rowsOf(
    await d.execute(sql`
    SELECT id, veiculo_id, produto, placa, chassi, parametros FROM veiculo_consultas
    WHERE protocolo = ${codigoConsulta} ORDER BY criado_em DESC
  `),
  );
  {
    const legadas = rowsOf(
      await d.execute(sql`
      SELECT id, veiculo_id, produto, placa, chassi, parametros, resposta FROM veiculo_consultas
      WHERE (protocolo IS NULL OR protocolo = '[object Object]' OR btrim(protocolo) = '') AND resposta IS NOT NULL
    `),
    );
    const recuperadas = legadas.filter(
      (consulta) => codigoConsultaDoPayload(consulta.resposta) === codigoConsulta,
    );
    for (const consulta of recuperadas) {
      await d.execute(
        sql`UPDATE veiculo_consultas SET protocolo = ${codigoConsulta} WHERE id = ${consulta.id}::uuid`,
      );
    }
    consultas = [...consultas, ...recuperadas];
  }
  if (!consultas.length) {
    await registrarEventoConsulta(contexto, "CONSULTA_NAO_LOCALIZADA", "ERRO", "O código recebido não corresponde a uma consulta registrada no sistema.");
    return {
      ok: false as const,
      message: `codigo_consulta ${codigoConsulta} não corresponde a nenhuma consulta registrada.`,
    };
  }
  // A Company pode reutilizar o código para a mesma pesquisa no dia: atualiza cadastro e testes.
  const resultados = [];
  for (const [indice, consulta] of consultas.entries()) {
    const log = indice === 0 ? contexto : criarContextoConsultaLog({ origem: "WEBHOOK", protocolo: codigoConsulta });
    Object.assign(log, { consultaId: consulta.id, veiculoId: consulta.veiculo_id, placa: consulta.placa, produto: consulta.produto });
    resultados.push(await atualizarConsultaNotificada(prov, consulta, codigoConsulta, log));
  }
  return resultados.find((resultado) => !resultado.ok) || resultados[0];
  } catch (erro) {
    await registrarEventoConsulta(contexto, "FALHA_WEBHOOK", "ERRO", "Não foi possível processar a notificação ou salvar o resultado no sistema.");
    throw erro;
  }
}

async function atualizarConsultaNotificada(prov: any, pendente: any, codigoConsulta: string, contexto: ContextoConsultaLog) {
  const d = requireDb();
  const parametros = pendente.parametros || {
    placa: pendente.placa || undefined,
    ...(pendente.produto === PROVEDOR_PADRAO.produto
      ? { chassi: pendente.chassi || undefined }
      : {}),
  };
  const r = await executarProduto(prov, pendente.produto, parametros, codigoConsulta, contexto);
  const payload = r.payload;
  const resultado = resultadoRegistravel(pendente.produto, r);
  const { status, resumo: dados } = resultado;

  if (
    status === "CONCLUIDA" &&
    pendente.produto === DESVALORIZACAO_PRODUTO &&
    pendente.veiculo_id &&
    (dados as any)?.valorNumero
  ) {
    const veiculo = rowsOf(
      await d.execute(sql`
        SELECT placa, marca, modelo, valor_interesse_cliente FROM veiculos WHERE id = ${pendente.veiculo_id}::uuid
      `),
    )[0];
    if (veiculo) {
      const { salvarVeiculo } = await import("./cadastro.server");
      await salvarVeiculo({
        id: pendente.veiculo_id,
        placa: veiculo.placa,
        marca: veiculo.marca,
        modelo: veiculo.modelo,
        valorFipe: (dados as any).valorNumero,
        valorInteresseCliente:
          veiculo.valor_interesse_cliente != null
            ? Number(veiculo.valor_interesse_cliente)
            : undefined,
      });
      await registrarEventoConsulta(contexto, "VALOR_FIPE_ATUALIZADO", "CONCLUIDA", "Valor FIPE atualizado no cadastro do veículo.");
    }
  }

  if (
    status === "CONCLUIDA" &&
    pendente.produto === PROVEDOR_PADRAO.produto &&
    pendente.veiculo_id
  ) {
    await d.execute(
      sql`UPDATE veiculos SET consulta_habilitada = true WHERE id = ${pendente.veiculo_id}::uuid`,
    );
  }
  await d.execute(sql`
    UPDATE veiculo_consultas SET
      status = ${status},
      resumo = ${JSON.stringify(dados ?? {})}::jsonb,
      resposta = ${payload ? JSON.stringify(payload) : null}::jsonb,
      documento_url = ${(dados as any)?.documento_url || null},
      erro = ${resultado.erro}
    WHERE id = ${pendente.id}::uuid
  `);

  await registrarEventoConsulta(contexto, status === "PROCESSANDO" ? "AGUARDANDO_RESPOSTA" : status === "ERRO" ? "FALHA_RESGATE" : "CONSULTA_CONCLUIDA", status, status === "PROCESSANDO" ? "Resposta ainda parcial. Aguardando nova notificação da Company." : status === "ERRO" ? "A Company não concluiu o resgate. Verifique o diagnóstico da pesquisa." : "Resposta recebida e salva no sistema.", r.httpStatus);
  if (status === "ERRO") {
    return {
      ok: false as const,
      message: resultado.erro || "Falha ao resgatar a consulta notificada pelo webhook.",
    };
  }
  if (status === "PROCESSANDO") {
    return {
      ok: true as const,
      message: "Ainda em processamento no provedor — aguardando novo webhook.",
    };
  }
  return { ok: true as const, message: "Consulta atualizada com sucesso." };
}
