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
    tem_senha: !!p.senha,
    chave_mascarada: mascarar(p.senha),
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
    await d.execute(sql`SELECT * FROM consulta_provedores WHERE slug = ${PROVEDOR_PADRAO.slug} LIMIT 1`),
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
 * { usuario: Number, senha: String, parametros: { placa|chassi, produto, codigo_consulta? } }
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
  const codigo = String(acao);
  if (codigo === "1") return null;
  const msgApi = primeiro(raiz, ["solicitacao.mensagem"]);
  return MENSAGENS_ACAO[codigo] || (msgApi ? String(msgApi) : `Solicitação recusada pelo provedor (acao=${codigo}).`);
}

type ResultadoConsulta = {
  ok: boolean;
  httpStatus: number;
  payload: any;
  erro: string | null;
  diagnostico: { modo: string; httpStatus: number; mensagem: string }[];
};

/** Executa a chamada ao endpoint do produto Conferi Auto Pericia Gold (POST, JSON). */
async function executarConsulta(
  prov: any,
  parametros: ConferiParametros,
  opcoes: { codigoConsulta?: string; url?: string } = {},
): Promise<ResultadoConsulta> {
  const url =
    opcoes.url ||
    `${String(prov.base_url).replace(/\/+$/, "")}${prov.caminho_consulta || PROVEDOR_PADRAO.caminho_consulta}`;
  const body = montarCorpo(prov, { ...parametros, produto: PROVEDOR_PADRAO.produto }, opcoes.codigoConsulta);
  const diagnostico: { modo: string; httpStatus: number; mensagem: string }[] = [];

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, application/xml" },
      body,
    });
    const payload = parse(await resp.text());
    const falha = resp.ok ? falhaLogica(payload) : null;
    const msg = falha || mensagemDoRetorno(payload) || (resp.ok ? "OK" : `HTTP ${resp.status}`);
    diagnostico.push({ modo: "POST JSON", httpStatus: resp.status, mensagem: String(msg).slice(0, 300) });

    if (resp.ok && !falha) {
      return { ok: true, httpStatus: resp.status, payload, erro: null, diagnostico };
    }
    return {
      ok: false,
      httpStatus: resp.status,
      payload,
      erro: falha || mensagemDoRetorno(payload) || `HTTP ${resp.status}`,
      diagnostico,
    };
  } catch (e: any) {
    const erro = e?.message || "Falha de comunicação com o provedor.";
    diagnostico.push({ modo: "POST JSON", httpStatus: 0, mensagem: erro });
    return { ok: false, httpStatus: 0, payload: null, erro, diagnostico };
  }
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
    node.forEach((item, i) => achatarLeaves(item, prefixo ? `${prefixo}[${i}]` : String(i), saida, profundidade + 1));
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
  const solicitacao = raiz.solicitacao ?? {};
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

  const temRegistroLeilao = !!(leilao?.leiloes?.leilao);
  const temDebito = [
    estadual.existeDebitoMulta,
    estadual.existeDebitoIPVA,
    estadual.existeDebitoLicenciamento,
    estadual.existeDebitoDpvat,
  ].some((v) => {
    const norm = String(v ?? "").trim().toLowerCase();
    return norm && norm !== "nao" && norm !== "não" && norm !== "0" && norm !== "false";
  });

  const resumo = {
    protocolo: primeiro(solicitacao, ["codigoConsulta"]),
    situacao: primeiro({ agregados, estadual, bin }, ["agregados.situacao", "estadual.situacao", "bin.situacao"]),
    roubo_furto: historicoRF.alertaMensagem || null,
    restricoes,
    leilao: temRegistroLeilao ? "Consta ocorrência de leilão" : leilao?.mensagem || null,
    sinistro: sinistro.mensagem || indicioSinistro.mensagem || null,
    debitos: temDebito ? "Consta débito em aberto" : estadual.mensagem || null,
    renajud: estadual.restricoesRenajud || estadual.restricaoRenajud || bin.restricaoRenajud || null,
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
  const d = requireDb();
  await ensureConsultaVeicularSchema();
  const prov = await getProvedorComChave();

  const veiculo = rowsOf(
    await d.execute(sql`SELECT id, placa, chassi FROM veiculos WHERE id = ${veiculoId}::uuid`),
  )[0];
  if (!veiculo) throw new Error("Veículo não encontrado.");
  if (!veiculo.placa && !veiculo.chassi) {
    throw new Error("Cadastre a placa ou o chassi do veículo antes de consultar.");
  }

  // Reaproveita o protocolo de uma consulta anterior (até 60 dias) para não gerar nova cobrança,
  // conforme a seção "Atualização de uma consulta existente" da documentação.
  const anterior = rowsOf(
    await d.execute(sql`
      SELECT protocolo FROM veiculo_consultas
      WHERE veiculo_id = ${veiculoId}::uuid AND protocolo IS NOT NULL
        AND criado_em > now() - interval '60 days'
      ORDER BY criado_em DESC LIMIT 1
    `),
  )[0];

  const r = await executarConsulta(
    prov,
    { placa: veiculo.placa || undefined, chassi: veiculo.chassi || undefined },
    { codigoConsulta: anterior?.protocolo ? String(anterior.protocolo) : undefined },
  );

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
        ${veiculoId}::uuid, ${prov.nome}, ${PROVEDOR_PADRAO.produto}, ${veiculo.placa || null}, ${veiculo.chassi || null},
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
