import { sql } from "drizzle-orm";
import { db } from "./index";
import { salvarAnaliseIA, type ResultadoAnaliseIA } from "./vendedores-compliance.server";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export const TIPOS_DOCUMENTO_VENDEDOR = {
  cnh_frente: "CNH (Carteira Nacional de Habilitação) — frente",
  cnh_verso: "CNH (Carteira Nacional de Habilitação) — verso",
  crlv: "CRLV-e (Certificado de Registro e Licenciamento de Veículo)",
  comprovante_endereco: "Comprovante de endereço (conta de luz, água, telefone, gás ou similar)",
  selfie: "Selfie da pessoa segurando o documento de identificação",
} as const;

export type TipoDocumentoVendedor = keyof typeof TIPOS_DOCUMENTO_VENDEDOR;

export const PROMPT_IA_DOCUMENTOS_PADRAO = `Você é um verificador automático de documentos da plataforma Esse Já Foi (compra e venda de veículos usados).

Sua única tarefa é analisar a imagem enviada e confirmar se ela realmente corresponde ao tipo de documento esperado, informado pelo usuário.

Responda SEMPRE em JSON estrito, exatamente neste formato:
{
  "tipo_detectado": "descrição curta do que você vê na imagem (ex: CNH, CRLV-e, comprovante de endereço, selfie com documento, foto não relacionada, imagem ilegível)",
  "confere": true ou false,
  "confianca": "alta" | "media" | "baixa",
  "motivo": "explicação curta e objetiva, em português, do porquê a imagem confere ou não com o documento esperado"
}

Regras:
- "confere" só pode ser true quando você tiver certeza razoável de que a imagem é o documento esperado e está legível.
- Se a imagem estiver ilegível, cortada, borrada, com dados essenciais escondidos, ou for claramente outro tipo de documento/foto, "confere" deve ser false.
- Não é sua função validar autenticidade jurídica do documento (não é perícia), apenas se o TIPO do documento bate com o esperado e se está minimamente legível.
- Nunca invente dados que não conseguir ler na imagem.
- Responda somente com o JSON, sem texto adicional antes ou depois.`;

/** Modelos sugeridos na primeira instalação — todos com suporte a visão (necessário para ler o documento). */
const MODELOS_OPENAI_PADRAO = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"];

export async function ensureIaModelosSchema() {
  const d = requireDb();
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS ia_modelos_openai (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome text NOT NULL UNIQUE,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  const existentes = (await d.execute(sql`SELECT 1 FROM ia_modelos_openai LIMIT 1`)) as any;
  const linhas = existentes.rows || existentes || [];
  if (linhas.length === 0) {
    for (const nome of MODELOS_OPENAI_PADRAO) {
      await d.execute(sql`INSERT INTO ia_modelos_openai (nome) VALUES (${nome}) ON CONFLICT (nome) DO NOTHING`);
    }
  }
}

/** Lista os modelos da OpenAI disponíveis para seleção, cadastrados pelo admin. */
export async function listarModelosOpenAI(): Promise<string[]> {
  const d = requireDb();
  await ensureIaModelosSchema();
  const res = (await d.execute(sql`SELECT nome FROM ia_modelos_openai ORDER BY nome`)) as any;
  const linhas: { nome: string }[] = res.rows || res || [];
  return linhas.map((r) => r.nome);
}

/** Cadastra um novo modelo da OpenAI na lista de seleção (idempotente). */
export async function cadastrarModeloOpenAI(nome: string): Promise<string[]> {
  const d = requireDb();
  await ensureIaModelosSchema();
  const limpo = nome.trim();
  if (!limpo) throw new Error("Informe o nome do modelo.");
  await d.execute(sql`INSERT INTO ia_modelos_openai (nome) VALUES (${limpo}) ON CONFLICT (nome) DO NOTHING`);
  return listarModelosOpenAI();
}

/** Remove um modelo da lista de seleção. */
export async function removerModeloOpenAI(nome: string): Promise<string[]> {
  const d = requireDb();
  await ensureIaModelosSchema();
  await d.execute(sql`DELETE FROM ia_modelos_openai WHERE nome = ${nome}`);
  return listarModelosOpenAI();
}

type ConfigIA = {
  apiKey: string;
  model: string;
  prompt: string;
  ativo: boolean;
  autoReprovar: boolean;
};

async function getConfigIA(): Promise<ConfigIA> {
  const d = requireDb();
  const { ensureAdminTables } = await import("./admin.server");
  await ensureAdminTables();
  const rows = (await d.execute(sql`
    SELECT chave, valor FROM configuracoes_sistema
    WHERE chave IN ('openai_api_key', 'openai_model', 'ia_prompt_documentos', 'ia_analise_documentos_ativa', 'ia_auto_reprovar');
  `)) as any;
  const lista: { chave: string; valor: string }[] = rows.rows || rows || [];
  const mapa = Object.fromEntries(lista.map((r) => [r.chave, r.valor]));

  return {
    apiKey: mapa["openai_api_key"] || "",
    model: mapa["openai_model"] || "gpt-4o",
    prompt: mapa["ia_prompt_documentos"] || PROMPT_IA_DOCUMENTOS_PADRAO,
    ativo: (mapa["ia_analise_documentos_ativa"] ?? "true") === "true",
    autoReprovar: (mapa["ia_auto_reprovar"] ?? "true") === "true",
  };
}

function extrairJson(texto: string): any {
  try {
    return JSON.parse(texto);
  } catch {
    const match = texto.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Resposta da IA não veio em formato JSON válido.");
  }
}

type ResultadoChamadaOpenAI =
  | { ok: true; resultado: ResultadoAnaliseIA; bruto: any }
  | { ok: false; motivo: string; bruto?: any };

/** Chama a OpenAI para analisar um documento — usada tanto na análise real quanto no teste de calibração. */
async function chamarOpenAIParaDocumento(params: {
  apiKey: string;
  model: string;
  prompt: string;
  tipoDocumento: TipoDocumentoVendedor;
  imagemUrl: string;
}): Promise<ResultadoChamadaOpenAI> {
  const { apiKey, model, prompt, tipoDocumento, imagemUrl } = params;
  if (!apiKey) return { ok: false, motivo: "Chave da OpenAI não configurada." };
  const rotulo = TIPOS_DOCUMENTO_VENDEDOR[tipoDocumento];

  const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            { type: "text", text: `Tipo de documento esperado: ${rotulo}.` },
            { type: "image_url", image_url: { url: imagemUrl } },
          ],
        },
      ],
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    return { ok: false, motivo: `Falha na chamada à OpenAI (HTTP ${resposta.status}): ${corpo.slice(0, 300)}` };
  }

  const payload: any = await resposta.json();
  const conteudo = payload?.choices?.[0]?.message?.content;
  if (!conteudo) return { ok: false, motivo: "OpenAI retornou resposta vazia.", bruto: payload };

  let dados: any;
  try {
    dados = extrairJson(conteudo);
  } catch (e: any) {
    return { ok: false, motivo: e?.message || "Resposta da IA não veio em formato JSON válido.", bruto: payload };
  }

  const resultado: ResultadoAnaliseIA = {
    tipoDetectado: String(dados.tipo_detectado || "não informado"),
    confere: dados.confere === true,
    confianca: ["alta", "media", "baixa"].includes(dados.confianca) ? dados.confianca : "baixa",
    motivo: String(dados.motivo || "Sem justificativa retornada pela IA."),
  };
  return { ok: true, resultado, bruto: payload };
}

/**
 * Analisa um documento enviado pelo vendedor com a IA configurada em
 * /admin/configuracoes e grava o veredito. Nunca lança erro — se a IA
 * estiver desativada, sem chave configurada, ou falhar, apenas registra
 * o motivo e segue sem bloquear o cadastro do vendedor.
 */
export async function analisarDocumentoVendedor(params: {
  vendedorId: string;
  tipoDocumento: TipoDocumentoVendedor;
  imagemUrl: string;
}): Promise<{ ok: boolean; motivo: string }> {
  const { vendedorId, tipoDocumento, imagemUrl } = params;

  try {
    const config = await getConfigIA();
    if (!config.ativo) return { ok: false, motivo: "Análise por IA desativada nas configurações." };
    if (!config.apiKey) return { ok: false, motivo: "Chave da OpenAI não configurada." };

    const r = await chamarOpenAIParaDocumento({
      apiKey: config.apiKey,
      model: config.model,
      prompt: config.prompt,
      tipoDocumento,
      imagemUrl,
    });
    if (!r.ok) return { ok: false, motivo: r.motivo };

    await salvarAnaliseIA(vendedorId, tipoDocumento, r.resultado, config.autoReprovar);
    return { ok: true, motivo: "Análise concluída." };
  } catch (err: any) {
    console.error("[ia-documentos] Erro ao analisar documento:", err);
    return { ok: false, motivo: err?.message || "Erro desconhecido na análise por IA." };
  }
}

/**
 * Testa a análise de um documento sem gravar nada no cadastro de nenhum vendedor —
 * usada na tela de configurações para calibrar o prompt e o modelo antes de salvar.
 * Se model/prompt/apiKey não forem informados, usa os valores já salvos.
 */
export async function testarAnaliseDocumento(params: {
  tipoDocumento: TipoDocumentoVendedor;
  imagemUrl: string;
  model?: string;
  prompt?: string;
  apiKey?: string;
}): Promise<{ resultado: ResultadoAnaliseIA; bruto: any }> {
  const config = await getConfigIA();
  const apiKey = params.apiKey?.trim() || config.apiKey;
  const model = params.model?.trim() || config.model;
  const prompt = params.prompt?.trim() || config.prompt;

  if (!apiKey) {
    throw new Error("Informe a chave da OpenAI (no formulário ou já salva nas configurações) antes de testar.");
  }

  const r = await chamarOpenAIParaDocumento({
    apiKey,
    model,
    prompt,
    tipoDocumento: params.tipoDocumento,
    imagemUrl: params.imagemUrl,
  });
  if (!r.ok) throw new Error(r.motivo);
  return { resultado: r.resultado, bruto: r.bruto };
}

/** Dispara a análise de vários documentos em paralelo, sem lançar erros. */
export async function analisarDocumentosVendedor(
  vendedorId: string,
  documentos: Partial<Record<TipoDocumentoVendedor, string | null | undefined>>,
) {
  const tarefas = Object.entries(documentos)
    .filter(([, url]) => !!url)
    .map(([tipo, url]) =>
      analisarDocumentoVendedor({
        vendedorId,
        tipoDocumento: tipo as TipoDocumentoVendedor,
        imagemUrl: url as string,
      }),
    );
  await Promise.allSettled(tarefas);
}
