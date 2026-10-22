import { sql } from "drizzle-orm";
import { db } from "./index";
import { lerWhatsappConfig } from "./whatsapp-config.server";
import { STATUS_REJECTED, normalizarStatusTemplate } from "./whatsapp-status";
import { extrairErroPostgres, mensagemErroPostgres } from "./erro-postgres";

/**
 * Versão padrão da Graph API.
 *
 * A Meta mantém cada versão por ~2 anos. A v20.0 (lançada em 21/05/2024)
 * expirou em 24/09/2026 — e, com ela, TODAS as chamadas do sistema: a
 * sincronização de templates voltava vazia, a criação de template era
 * recusada e a exclusão não apagava nada na Meta, enquanto o banco local
 * continuava funcionando (por isso o sintoma era "parou do nada há dias").
 *
 * A versão precisa ser atualizada de novo a cada ~2 anos; a boa notícia é
 * que o campo `graph_api_version` da configuração tem um valor gravado
 * (v20.0), que é MAIS VELHO que este padrão — então o valor gravado ganha
 * e a falha continua. Por isso a versão gravada só é aceita se ainda
 * estiver viva (ver `versaoGraphValida`).
 */
const DEFAULT_GRAPH_VERSION = "v26.0";

/**
 * Versões da Graph API que a Meta ainda aceita.
 *
 * A Meta expira cada versão dois anos após o lançamento da seguinte. A
 * lista abaixo vai até a mais antiga ainda em suporte — a v20.0 expirou
 * em 24/09/2026 e a v21.0/v22.0/v23.0 já saíram de suporte.
 */
const VERSOES_GRAPH_SUPORTADAS = ["v26.0", "v25.0", "v24.0"];

/**
 * Normaliza o texto digitado pelo admin para o formato canônico `vN.0`.
 *
 * A tela deixa o campo livre, e "v26" (sem o `.0`) é a forma natural de digitar
 * — mas o formato exato é o que a Meta espera na URL. Sem esta normalização, o
 * "v26" gravado caía fora da lista de versões suportadas e era descartado,
 * voltando para o padrão — o admin achava que não estava salvando.
 */
export function normalizarVersaoGraph(versao?: string | null): string {
  const bruta = String(versao || "").trim().toLowerCase().replace(/^v/, "");
  if (!/^\d+(\.\d+)?$/.test(bruta)) return "";
  const [maior, menor] = bruta.split(".");
  return `v${maior}.${menor ?? "0"}`;
}

/**
 * Decide qual versão da Graph API usar.
 *
 * A configuração pode ter uma versão gravada (o admin a escolhe na tela),
 * mas ela vale só se ainda estiver no ar: uma versão expirada faz a Meta
 * responder erro em TODAS as chamadas, sem nenhuma pista no sistema.
 * Quando a versão gravada não está mais no ar, sobe para a mais recente
 * disponível.
 */
export function versaoGraphValida(versaoGravada?: string | null): string {
  const normalizada = normalizarVersaoGraph(versaoGravada);
  if (normalizada && VERSOES_GRAPH_SUPORTADAS.includes(normalizada)) return normalizada;
  return DEFAULT_GRAPH_VERSION;
}

// A Meta recusa o template com "invalid parameter" quando os componentes chegam
// fora desta ordem. A ordem é HEADER → BODY → FOOTER → BUTTONS.
const ORDEM_COMPONENTES: Record<string, number> = {
  HEADER: 0,
  BODY: 1,
  FOOTER: 2,
  BUTTONS: 3,
};

/**
 * Grava/atualiza o template da Meta usando `meta_name` como chave lógica.
 *
 * NÃO usa `ON CONFLICT (meta_name)`: essa sintaxe exige uma restrição UNIQUE
 * na coluna, e bancos antigos (criados antes da coluna nascer com UNIQUE) não
 * têm essa constraint — o `ON CONFLICT` estourava com "there is no unique or
 * exclusion constraint matching the ON CONFLICT specification" e o template
 * nunca era gravado. Aqui a atualização é feita por UPDATE + INSERT, que
 * funciona com ou sem índice único.
 *
 * Regras de merge (iguais às do antigo ON CONFLICT):
 * - `status` sempre vem da Meta (é a fonte da verdade).
 * - `conteudo` NÃO é sobrescrito: o wizard grava no formato de criação
 *   (HEADER/BODY/FOOTER/BUTTONS maiúsculo, com buttons[] e format) e a Meta
 *   devolve o formato de envio (minúsculo, com parameters[]). Sobrescrever
 *   quebra o montarComponents e a Meta responde 132012.
 * - `midia_*` são preservadas quando já existem: sem `midia_id` o HEADER de
 *   mídia some no envio.
 */
export async function upsertTemplateDaMeta(
  t: any,
  nome: string,
  statusResolvido?: string | null,
) {
  // `statusResolvido` vem da sincronização quando a listagem não trouxe o
  // status e ele foi buscado no template individual: gravar o PENDING do
  // default da coluna perderia o estado real (aprovado na Meta, "em análise"
  // no sistema).
  const status = statusResolvido || normalizarStatusTemplate(t?.status) || "PENDING";
  const motivoRecusa = status === STATUS_REJECTED ? (t?.reason ?? null) : null;

  if (!db) return;

  // A Meta e o banco local divergem com frequência em caixa e espaços no nome
  // do template. A comparação EXATA (`meta_name = nome`) não encontra a linha
  // nesse caso, e o INSERT que vem depois estourava com 23505 (violação de
  // unicidade) — o template simplesmente não entrava no banco, e o admin
  // viajava "sincronizado" sem o template aparecer. Comparar sem caixa e sem
  // espaços nas pontas resolve os dois casos de uma vez.
  const chave = String(nome ?? "").trim();

  const atualizado = await db.execute(sql`
    UPDATE whatsapp_templates SET
      nome_interno = COALESCE(NULLIF(TRIM(nome_interno), ''), ${chave}),
      status = ${status},
      meta_id = COALESCE(${t?.id ?? null}, meta_id),
      categoria = COALESCE(${t?.category ?? null}, categoria),
      idioma = COALESCE(${t?.language ?? null}, idioma),
      motivo_recusa = ${motivoRecusa},
      midia_id = COALESCE(midia_id, ${t?.midia_id ?? null}),
      midia_tipo = COALESCE(midia_tipo, ${t?.midia_tipo ?? null}),
      midia_nome = COALESCE(midia_nome, ${t?.midia_nome ?? null}),
      midia_arquivo_id = COALESCE(midia_arquivo_id, ${t?.midia_arquivo_id ?? null}),
      ultima_sincronizacao = now()
    WHERE lower(trim(meta_name)) = lower(${chave})
    RETURNING id, idioma
  `);

  const linha = (rowsOf(atualizado) as any[])[0];
  if (linha) {
    // A tabela local guarda UM registro por nome, mas a Meta permite o mesmo
    // nome em idiomas diferentes. Quando o idioma que chegou é outro, o status
    // gravado é o desse idioma — avisar no log evita a conclusão errada de que
    // a sincronização trouxe "o template errado".
    const idiomaLocal = String(linha.idioma ?? "").trim().toLowerCase();
    const idiomaMeta = String(t?.language ?? "").trim().toLowerCase();
    if (idiomaLocal && idiomaMeta && idiomaLocal !== idiomaMeta) {
      console.warn(
        `[Meta] o template "${chave}" já existia no idioma ${idiomaLocal} e chegou ` +
          `${idiomaMeta} da Meta; como a chave local é o nome, vale o status do ${idiomaMeta}.`,
      );
    }
    return;
  }

  try {
    await db.execute(sql`
      INSERT INTO whatsapp_templates (
        meta_id,
        nome_interno,
        meta_name,
        categoria,
        idioma,
        status,
        conteudo,
        motivo_recusa,
        ultima_sincronizacao
      )
      VALUES (
        ${t?.id ?? null},
        ${chave},
        ${chave},
        ${t?.category ?? null},
        ${t?.language ?? null},
        ${status},
        ${JSON.stringify(t?.components ?? [])}::jsonb,
        ${motivoRecusa},
        now()
      )
    `);
  } catch (e: any) {
    // Corrida entre dois lugares gravando o mesmo template (o `INSERT` acima e
    // uma linha que já existia com a grafia exata) estoura com 23505. Em vez
    // de contar o template como falha — e ele nunca apareceria na tela —,
    // o UPDATE deFallback grava o status da Meta na linha que já existe.
    if (extrairErroPostgres(e).code !== "23505") throw e;
    const recuperado = await db.execute(sql`
      UPDATE whatsapp_templates SET
        status = ${status},
        meta_id = COALESCE(${t?.id ?? null}, meta_id),
        categoria = COALESCE(${t?.category ?? null}, categoria),
        idioma = COALESCE(${t?.language ?? null}, idioma),
        motivo_recusa = ${motivoRecusa},
        ultima_sincronizacao = now()
      WHERE lower(trim(meta_name)) = lower(${chave})
      RETURNING id
    `);
    if ((rowsOf(recuperado) as any[]).length === 0) throw e;
  }
}

/**
 * Erro da API da Meta preservando o `code`, que é o que separa "tente de novo
 * depois" de "esse contato nunca vai receber". Antes o código era descartado e o
 * motor de disparo só via a mensagem em inglês.
 */
export class MetaApiError extends Error {
  readonly code: number | null;
  readonly httpStatus: number | null;
  readonly erroOriginal: any;

  constructor(message: string, body?: any, httpStatus?: number) {
    super(message);
    this.name = "MetaApiError";
    this.code = body?.error?.code ?? null;
    this.httpStatus = httpStatus ?? null;
    this.erroOriginal = body;
  }

  /**
   * Rate limit (131056), limite de mensagens por conta e erros de servidor são
   * transitórios e valem retry. Número inexistente (131047) ou template
   * inválido (132000) são permanentes: repetir só gasta cota.
   */
  get transitorio(): boolean {
    if (this.httpStatus && this.httpStatus >= 500) return true;
    if (this.code === 131056 || this.code === 4 || this.code === 2) return true;
    if (this.httpStatus === 429) return true;
    if (this.httpStatus && this.httpStatus >= 400 && this.httpStatus < 500) {
      // Codes de validação/parâmetro não melhoram com repetição.
      if (this.code === 131047 || this.code === 132000 || this.code === 131026) return false;
      return false;
    }
    return false;
  }

  /** Erro permanente que indica número que não existe mais no WhatsApp. */
  get numeroInexistente(): boolean {
    return this.code === 131047 || this.code === 131052;
  }
}

/**
 * O conteúdo pode chegar como array de componentes (formato que a Meta
 * devolve e que é gravado no banco) ou como objeto com `components`.
 */
function componentesDoConteudo(conteudo: any): any[] {
  if (Array.isArray(conteudo)) return conteudo;
  if (Array.isArray(conteudo?.components)) return conteudo.components;
  return [];
}

/** Número de placeholders {{n}} no texto, lendo do maior deles (a Meta exige sequência). */
function maiorPlaceholder(texto: string): number {
  const numeros = [...String(texto).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return numeros.length ? Math.max(...numeros) : 0;
}

/** Monta `parameters` para um texto com {{n}} (corpo ou url de botão). */
function parametersPara(texto: string, valores: Record<string, string>, rotulo: string): any[] {
  const maximo = maiorPlaceholder(texto);
  if (!maximo) return [];
  const parameters = Array.from({ length: maximo }, (_, i) => ({
    type: "text",
    text: String(valores[String(i + 1)] ?? valores[`{{${i + 1}}}`] ?? ""),
  }));
  // Preenchimento obrigatório: a Meta recusa {{n}} vazio, e é melhor falhar
  // aqui com nome do campo do que gastar cota numa tentativa que volta.
  const faltando = parameters
    .map((p, i) => (p.text.trim() === "" ? `{{${i + 1}}}` : null))
    .filter(Boolean) as string[];
  if (faltando.length) {
    throw new Error(
      `Preencha ${faltando.join(", ")} do ${rotulo}. A Meta recusa mensagem de template com variável vazia.`,
    );
  }
  return parameters;
}

/**
 * Componente de um botão de URL com {{n}} no link, no formato que a API aceita
 * no envio: `type: "button"` (singular, minúsculo) com o botão achatado — não
 * um `BUTTONS` com array, que o schema da Meta rejeita com "Unexpected key".
 *
 * A Meta devolve o botão SEM a URL na listagem (só `text`). Nesse caso, o
 * botão já está no formato de envio e deve ser passado como está — sem
 * tentar extrair URL que não existe.
 */
function componenteBotao(botao: any, posicao: number, valores: Record<string, string>): any | null {
  // Formato da Meta: { type: "button", sub_type: "url", index, text }
  // Não tem `url` nem `parameters` — a URL não é devolvida na listagem.
  if (botao?.sub_type) {
    return {
      type: "button",
      sub_type: botao.sub_type,
      index: Number.isInteger(botao.index) ? botao.index : posicao,
    };
  }
  // Formato do wizard: { type: "URL", url: "https://...{{7}}" }
  const url = String(botao?.url || "");
  if (!url) return null;
  const indice = Number.isInteger(botao?.index) ? botao.index : posicao;
  // Botão de URL estática (sem {{n}}) não leva componente algum no envio: a
  // Meta rejeita `parameters: []` com 132018 "Button does not require
  // parameters". Só manda componente quando há {{n}} na URL para preencher.
  // (erro 132018 — o payload antigo mandava `"parameters": []` no botão)
  if (!maiorPlaceholder(url)) return null;
  const substitutos = parametersPara(url, valores, `botão de link ${posicao + 1}`);
  const urlResolvida = url.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const p = substitutos[Number(n) - 1];
    return p?.text ?? "";
  });
  return { type: "button", sub_type: "url", index: indice, parameters: [{ type: "text", text: urlResolvida }] };
}

/**
 * O `image.id`/`document.id` que a Meta exige é INTEIRO (ou null). O `media_id`
 * gravado no banco e o `example.header_handle[0]` da sincronização chegam como
 * string, e a Meta rejeita string com
 * "violated JSON schema constraint 'type' ... expected '[integer, null]'".
 * Converte quando é numérico; devolve null quando não dá (id alfanumérico não
 * é referência válida para envio).
 */
function idMidiaNumerico(valor: unknown): number | null {
  const bruto = String(valor ?? "").trim();
  // Alguns templates criados direto na Meta trazem o anexo como URL de CDN
  // (`example.header_handle[0] = "https://scontent.whatsapp.net/..."`), não como
  // id. URL não é referência válida para envio; devolve null para o chamador
  // reenviar o binário.
  if (!/^\d+$/.test(bruto)) return null;
  const n = Number(bruto);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Baixa o anexo de um HEADER de template a partir da URL de CDN que a Meta
 * devolve na sincronização (`example.header_handle[0]` quando o template foi
 * criado direto no WhatsApp Manager). A URL costuma expirar rápido, então
 * qualquer falha aqui não é motivo para quebrar o envio: devolve null e o
 * chamador tenta a próxima fonte.
 */
async function baixarMidiaPorUrl(url: string): Promise<{ base64: string; nome: string; tipo: string } | null> {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const tipo = (resposta.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const buffer = Buffer.from(await resposta.arrayBuffer());
    if (!buffer.length) return null;
    return {
      base64: buffer.toString("base64"),
      nome: "capa",
      tipo: tipo === "application/pdf" ? "document" : "image",
    };
  } catch {
    return null;
  }
}

/**
 * Sobe o binário do cabeçalho e devolve o `id` INTEIRO da Meta. Quando existe
 * um `media_id` salvo no banco e ele é numérico, usa ele direto — sem upload
 * desnecessário. O upload é o caminho de fallback para o `header_handle`
 * alfanumérico/URL de templates criados direto na Meta e para o teste com
 * anexo, que envia o binário em vez de um id.
 */
async function resolverIdMidia(params: {
  mediaId?: string | null;
  base64?: string | null;
  nome?: string | null;
  tipo?: string | null;
  arquivoId?: string | null;
  urlMidia?: string | null;
}): Promise<number> {
  const idSalvo = idMidiaNumerico(params.mediaId);
  if (idSalvo != null) return idSalvo;

  // Sem id numérico, a saída é reenviar o binário para a Meta. A cópia local
  // em `arquivos_upload` (`midia_arquivo_id`) existe exatamente para isso: o
  // `media_id` da Meta expira em 30 dias e chega alfanumérico na
  // sincronização, e sem o binário o HEADER de mídia não tem como ser
  // montado — o envio morria com "não tem um ID válido para a Meta".
  let base64 = params.base64 || null;
  let nome = params.nome || null;
  let tipo = params.tipo || null;

  if (!base64 && params.arquivoId) {
    const { obterArquivo } = await import("./arquivos.server");
    const arquivo = await obterArquivo(params.arquivoId);
    if (arquivo?.conteudo) {
      base64 = arquivo.conteudo.toString("base64");
      nome = nome || "arquivo";
      tipo = tipo || arquivo.mimeType;
    }
  }

  // Sem cópia local, tenta a última fonte: o `header_handle` da sincronização
  // pode vir como URL de CDN ("https://scontent.whatsapp.net/..."). Baixar o
  // arquivo e reenviar para a Meta devolve um id numérico utilizável.
  if (!base64 && params.urlMidia) {
    const baixado = await baixarMidiaPorUrl(params.urlMidia);
    if (baixado) {
      base64 = baixado.base64;
      nome = nome || baixado.nome;
      tipo = tipo || baixado.tipo;
    }
  }

  if (!base64) {
    throw new Error(
      "O anexo do cabeçalho não tem um ID válido para a Meta. Reenvie a imagem/PDF ao template e tente de novo.",
    );
  }
  return metaService.subirMidiaParaId(
    base64,
    nome || "arquivo",
    tipo || "image",
  );
}

/**
 * Monta os componentes de uma mensagem de template a partir do conteúdo gravado
 * e dos valores. A Meta exige um parameter para cada {{n}} do corpo — sem isso
 * a resposta é "template variable missing". Botões de URL com placeholder no
 * link também pedem parâmetro (erro 131008), e vêm como componente próprio.
 * Vale tanto para o conteúdo como array (formato que a Meta devolve) quanto
 * como objeto com `components`.
 *
 * `midia` (opcional) é o anexo do cabeçalho: `{ tipo: "image"|"document",
 * mediaId, nome? }`. Sem ele o HEADER sai como texto puro.
 *
 * É async porque o `header_handle` que a Meta devolve para templates criados
 * fora do wizard pode ser um id alfanumérico (não-inteiro) — a Meta rejeita o
 * `image.id` com "violated JSON schema constraint 'type' ... expected
 * '[integer, null]'". Nesse caso o chamador precisa subir o binário de novo.
 */
export async function montarComponents(
  conteudo: any,
  valores: Record<string, string> = {},
  midia: {
    tipo?: string;
    mediaId?: string;
    nome?: string;
    base64?: string;
    arquivoId?: string;
  } | null = null,
): Promise<any[]> {
  const comps = componentesDoConteudo(conteudo);
  if (!comps.length) return [];

  const saida: any[] = [];
  const anexo = midia?.mediaId || midia?.base64 || midia?.arquivoId ? midia : null;

  for (const comp of comps) {
    const tipo = String(comp?.type || "").toUpperCase();

    if (tipo === "HEADER") {
      const formato = String(comp.format || "TEXT").toUpperCase();

      // HEADER de mídia sem `midia_id` salvo na linha: templates criados direto
      // na Meta (fora do wizard) chegam pela sincronização com o anexo em
      // `example.header_handle[0]`. Sem ler esse campo, o HEADER é omitido e a
      // Meta responde 132012 "expected IMAGE, received UNKNOWN". Esse campo pode
      // vir como id numérico (raro) ou como URL de CDN — só o id serve.
      const midiaFallback = String(comp.example?.header_handle?.[0] ?? "").trim();
      const temAnexo = Boolean(anexo?.mediaId || anexo?.base64 || midiaFallback);

      if (formato !== "TEXT" && temAnexo) {
        const tipoMidia = (anexo?.tipo === "document" || formato === "DOCUMENT")
          ? "document"
          : "image";
        // A Meta exige `image.id`/`document.id` como INTEIRO (ou null). O
        // `media_id` vem do banco como string e o `header_handle` da
        // sincronização também pode ser string (id ou URL) — resolve para
        // inteiro aqui, reenviando o binário quando não há id válido.
        const idNumerico = await resolverIdMidia({
          mediaId: anexo?.mediaId ?? midiaFallback,
          base64: anexo?.base64,
          nome: anexo?.nome,
          tipo: anexo?.tipo,
          arquivoId: anexo?.arquivoId,
          // O `header_handle` alfanumérico não serve como referência de envio;
          // quando ele é URL de CDN, dá para baixar o binário e reenviar.
          urlMidia: /^https?:\/\//i.test(midiaFallback) ? midiaFallback : null,
        });
        const parameter: any = { type: tipoMidia, [tipoMidia]: { id: idNumerico } };
        if (tipoMidia === "document" && anexo?.nome) parameter.document.filename = anexo.nome;
        saida.push({ type: "header", parameters: [parameter] });
        continue;
      }

      // HEADER de mídia sem anexo nenhum: a Meta espera um componente `header`,
      // sem ele o envio responde 132012 "expected IMAGE, received UNKNOWN".
      if (formato !== "TEXT" && !temAnexo) {
        throw new Error(
          `O template tem um cabeçalho de ${formato.toLowerCase()}, mas nenhuma imagem ou PDF foi anexado. Adicione uma mídia ao template e tente de novo.`,
        );
      }

      // O texto do HEADER pode vir em `comp.text` (formato do wizard) ou em
      // `comp.parameters[0].text` (formato que a Meta devolve na sincronização).
      // Sem ler os dois, o HEADER de texto salvo como Meta desaparece do envio
      // e a Meta responde 132012 "Parameter format does not match".
      const texto = String(comp.text ?? comp.parameters?.[0]?.text ?? "").trim();
      if (texto) saida.push({ type: "header", parameters: [{ type: "text", text: texto }] });
      continue;
    }

    if (tipo === "BODY") {
      // Formato do wizard: { type: "BODY", text: "Olá {{1}}!" }
      // Formato da Meta:  { type: "body", parameters: [{type:"text", text:"Olá {{1}}!"}] }
      // O text com {{n}} pode estar em comp.text (wizard) ou dentro de
      // comp.parameters[0].text (Meta). Extrair de onde estiver.
      const textoBody = comp.text ?? comp.parameters?.[0]?.text ?? "";
      const parameters = parametersPara(textoBody, valores, "corpo do template");
      // Template sem {{n}} ainda tem BODY na Meta; sem este componente o envio
      // responde 132012 "Parameter format does not match". Texto vai vazio.
      saida.push({ type: "body", parameters });
      continue;
    }

    if (tipo === "BUTTONS") {
      const botoes = Array.isArray(comp.buttons) ? comp.buttons : [];
      botoes.forEach((botao: any, i: number) => {
        const montado = componenteBotao(botao, i, valores);
        if (montado) saida.push(montado);
      });
      continue;
    }

    // Formato da Meta: botões vêm como componentes individuais
    // { type: "button", sub_type: "url", index: 0, text: "..." }
    // O wizard grava BUTTONS com array; a Meta devolve button solto.
    if (tipo === "BUTTON" && comp?.sub_type) {
      saida.push({
        type: "button",
        sub_type: comp.sub_type,
        index: Number.isInteger(comp.index) ? comp.index : 0,
      });
      continue;
    }
  }

  // Template sem nenhum {{n}} ainda tem um BODY na Meta, e o envio precisa
  // levar esse componente — sem ele a API responde 132012 "Parameter format
  // does not match format in the created template". O texto vai vazio.
  if (!saida.some((c) => String(c?.type || "").toUpperCase() === "BODY")) {
    const corpo = comps.find((c) => String(c?.type || "").toUpperCase() === "BODY");
    const textoCorpo = corpo?.text ?? corpo?.parameters?.[0]?.text ?? "";
    saida.push({ type: "body", parameters: [{ type: "text", text: String(textoCorpo).trim() }] });
  }

  return saida;
}

export class MetaWhatsAppService {
  private config: any = null;

  /**
   * Ordena os componentes na sequência que a Meta exige. `parameters` pertence
   * ao envio de mensagens, não ao cadastro do template; a API rejeita esse
   * campo no payload de criação com "Unexpected key parameters".
   *
   * `midiaId` é o `media_id` devolvido pelo upload do cabeçalho. A Meta exige um
   * EXEMPLO do anexo no pedido de criação — `example.header_handle: [media_id]` —
   * e recusa o template com o subcode 2388273 ("Modelos com o tipo de cabeçalho
   * IMAGE precisam de um exemplo/modelo, mas não foi fornecido") quando ele
   * falta. O `media_id` do `/media` da Meta é uma string; o `header_handle`
   * aceita essa mesma string.
   */
  private normalizarComponentes(components: any[] = [], midiaId?: string | null) {
    const ordenados = [...components].sort(
      (a, b) => (ORDEM_COMPONENTES[a?.type] ?? 99) - (ORDEM_COMPONENTES[b?.type] ?? 99),
    );

    const id = String(midiaId || "").trim();

    // HEADER de mídia NÃO leva `parameters` no pedido de criação: a Meta
    // interpreta como template "sem mídia" e responde "invalid parameter".
    // O anexo só entra no DISPARO, com o `media_id` resolvido na hora.
    // Parameters vazios viram poluição no JSON; a Meta exige array não-vazio.
    return ordenados
      .map((c) => {
        if (c?.parameters?.length === 0) {
          const { parameters, ...semParameters } = c;
          return semParameters;
        }
        if (c?.type === "HEADER" && String(c?.format || "").toUpperCase() !== "TEXT") {
          const { parameters, ...semParameters } = c;
          return {
            ...semParameters,
            text: "",
            // O exemplo do anexo é obrigatório na criação. Sem ele a Meta
            // recusa com 2388273.
            ...(id ? { example: { header_handle: [id] } } : {}),
          };
        }
        return c;
      })
      .filter((c) => {
        // Meta rejeita HEADER "vazio" e também BODY sem `text` (quando o texto
        // são só placeholders). Manter os demais tipos intactos.
        if (c?.type === "HEADER") {
          const formato = String(c.format || "TEXT").toUpperCase();
          if (formato === "TEXT") return Boolean(String(c.text || "").trim());
          return true;
        }
        if (c?.type === "BODY") return Boolean(String(c.text || "").trim());
        if (c?.type === "FOOTER") return Boolean(String(c.text || "").trim());
        if (c?.type === "BUTTONS") return Boolean(c.buttons?.length);
        return true;
      });
  }

  /**
   * Grava o evento também na trilha do motor de disparo (`whatsapp_logs`).
   *
   * A sincronização gravava só na `whatsapp_webhook_logs`, que é a aba "Logs"
   * geral. Mas o painel que o admin realmente usa para "o que o sistema fez"
   * — o mesmo onde aparece o `ENVIO_TESTE` do teste de template — é o "Log de
   * disparo (motor)", que lê a `whatsapp_logs`. Sem esta segunda gravação, a
   * sincronização era invisível justamente onde o admin olha.
   */
  private async registrarTrilha(params: {
    acao: string;
    detalhe: string;
    payload?: Record<string, any> | null;
  }) {
    try {
      const { registrarLogCampanha } = await import("./logs-campanha.server");
      await registrarLogCampanha({
        campanhaId: null,
        acao: params.acao,
        detalhe: params.detalhe,
        payload: params.payload ?? {},
      });
    } catch (e: any) {
      console.error(
        "[Meta] falha ao registrar o evento na trilha de disparo:",
        mensagemErroPostgres(e),
      );
    }
  }

  async init() {
    if (!db) return;
    // A configuração é lida pelo MESMO caminho que a tela usa (deduplica as
    // linhas duplicadas e devolve a de menor id). Antes este `init()` lia a
    // linha de menor id sem deduplicar, enquanto `getWhatsappConfig()` lia
    // `ORDER BY atualizado_em, id` — linhas diferentes. Com uma duplicata de
    // id menor e `waba_id` vazio, TODA chamada à Meta falhava com "WABA ID não
    // configurado." — o que quebrava a sincronização de templates e a criação
    // de template na Meta ao mesmo tempo.
    this.config = await lerWhatsappConfig();

    // Templates gravados antes da correção ficaram com o HEADER de texto no
    // formato que a Meta devolve ({type:"header", parameters:[{type:"text",
    // text:"..."}]}) em vez do formato do wizard ({type:"HEADER", text:"..."}).
    // O montarComponents não reconhecia esse formato e o HEADER sumia do envio,
    // gerando o erro 132012. Aqui normalizamos os componentes afetados de uma
    // vez, sem precisar recriar os templates.
    await this.normalizarTemplatesLegados();
  }

  /**
   * Converte HEADERs salvos no formato da Meta (com `parameters`) de volta ao
   * formato do wizard (com `text`), que é o que o `montarComponents` espera.
   * Só mexe em HEADERs de texto — HEADERs de mídia permanecem intactos.
   */
  private async normalizarTemplatesLegados() {
    try {
      const res = await db!.execute(sql`
        SELECT id, conteudo FROM whatsapp_templates
        WHERE conteudo::text LIKE '%"header"%'
      `);
      for (const row of rowsOf(res) as any[]) {
        const comps = componentesDoConteudo(row.conteudo);
        const normalizados = comps.map((comp: any) => {
          const ehHeaderTexto =
            String(comp?.type || "").toUpperCase() === "HEADER" &&
            !comp?.text &&
            Array.isArray(comp?.parameters) &&
            comp.parameters[0]?.type === "text" &&
            comp.parameters[0]?.text;
          if (!ehHeaderTexto) return comp;
          return {
            type: "HEADER",
            text: comp.parameters[0].text,
            ...(comp.format ? { format: comp.format } : {}),
          };
        });
        if (JSON.stringify(comps) !== JSON.stringify(normalizados)) {
          await db!.execute(sql`
            UPDATE whatsapp_templates SET conteudo = ${JSON.stringify(normalizados)}::jsonb
            WHERE id = ${row.id}::uuid
          `);
        }
      }
    } catch (e: any) {
      // Não deve impedir o startup — falha aqui é melhor resolvida manualmente.
      // `mensagemErroPostgres` desembrulha o erro do Drizzle: o `.cause` tem o
      // SQLSTATE e a coluna real, que `e.message` nunca mostra.
      console.warn("[Meta] normalizarTemplatesLegados falhou:", mensagemErroPostgres(e));
    }
  }

  private getGraphUrl(endpoint: string) {
    const version = versaoGraphValida(this.config?.graph_api_version);
    return `https://graph.facebook.com/${version}/${endpoint}`;
  }

  /**
   * Reescreve a versão de uma URL absoluta da Meta.
   *
   * O `paging.next` que a Meta devolve é uma URL completa, com a versão
   * embutida (`/v20.0/...`). Se a Meta responder com um link na versão que
   * saiu do ar, seguir o link devolve erro — e a paginação trava ali, com a
   * sincronização "sem templates novos". A URL é reescrita para a versão em
   * uso; o resto (token, cursor, parâmetros) é preservado.
   */
  private ajustarVersaoUrl(url: string): string {
    return url.replace(
      /(graph\.facebook\.com\/)v\d+\.\d+/i,
      (_m, prefixo: string) => `${prefixo}${versaoGraphValida(this.config?.graph_api_version)}`,
    );
  }

  private async fetchMeta(
    endpoint: string,
    options: RequestInit = {},
    operacao: string = "CHAMADA_META",
  ) {
    if (!this.config?.access_token) {
      throw new Error("Token de acesso do WhatsApp não configurado.");
    }

    // O paging.next da Meta já vem como URL absoluta, com versão e token. Prefixar
    // a versão de novo produziria uma URL inválida.
    const url = /^https?:\/\//i.test(endpoint)
      ? this.ajustarVersaoUrl(endpoint)
      : this.getGraphUrl(endpoint);
    const headers = {
      Authorization: `Bearer ${this.config.access_token}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const inicio = Date.now();
    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (e: any) {
      // Falha de rede não chega como resposta: sem este registro a tela de logs
      // ficaria muda justamente no caso em que o usuário mais precisa ver algo.
      await this.registrar({
        endpoint: url,
        operacao,
        status: "ERRO",
        resumo: e?.message || "Falha de rede ao chamar a Meta.",
        payload: null,
        duracaoMs: Date.now() - inicio,
      });
      throw e;
    }

    const data = await response.json();
    const duracaoMs = Date.now() - inicio;

    // O payload enviado é registrado junto com a resposta. Sem isso, erros como
    // "Invalid parameter" não dizem qual campo a Meta recusou — o corpo da
    // requisição é a única forma de comparar o que foi enviado com o que a
    // API espera.
    let payloadEnviado: unknown = null;
    if (options.body) {
      try {
        payloadEnviado = JSON.parse(String(options.body));
      } catch {
        payloadEnviado = String(options.body);
      }
    }

    await this.registrar({
      endpoint: url,
      operacao,
      status: response.ok ? "SUCESSO" : "ERRO",
      resumo: response.ok
        ? "OK"
        : data?.error?.message || "Erro na comunicação com a API da Meta.",
      payload: { enviado: payloadEnviado, resposta: data },
      httpStatus: response.status,
      duracaoMs,
    });

    if (!response.ok) {
      console.error("[Meta API Error]", data);
      throw new MetaApiError(
        data.error?.message || "Erro na comunicação com a API da Meta.",
        data,
        response.status,
      );
    }

    return data;
  }

  /**
   * Grava uma linha de log da chamada à Meta. Nunca lança: um erro de log não
   * pode impedir a operação que originou a chamada.
   */
  private async registrar(params: {
    endpoint: string;
    operacao: string;
    status: "SUCESSO" | "ERRO";
    resumo?: string | null;
    payload?: unknown;
    httpStatus?: number | null;
    duracaoMs?: number | null;
    direcao?: "SAIDA" | "ENTRADA";
  }) {
    try {
      const { registrarLogMeta } = await import("./logs-whatsapp.server");
      await registrarLogMeta({
        direcao: params.direcao ?? "SAIDA",
        operacao: params.operacao,
        wabaId: this.config?.waba_id ?? null,
        httpStatus: params.httpStatus,
        status: params.status,
        resumo: params.resumo,
        payload: params.payload,
        endpoint: params.endpoint,
        duracaoMs: params.duracaoMs,
      });
    } catch (e: any) {
      // Log é diagnóstico, nunca parte do fluxo: se a escrita falhar, a
      // operação que a originou tem de continuar. Sem este try/catch, uma
      // falha na tabela de log derrubava a sincronização inteira.
      console.error(
        "[Meta] falha ao registrar o log da operação:",
        mensagemErroPostgres(e),
      );
    }
  }

  async testarConexao() {
    await this.init();
    if (!this.config?.phone_number_id) {
      throw new Error("Phone Number ID não configurado.");
    }

    try {
      const data = await this.fetchMeta(this.config.phone_number_id, {}, "TESTAR_CONEXAO");

      if (db)
        await db.execute(sql`
        UPDATE whatsapp_config SET 
          status = 'CONECTADO', 
          ultimo_teste = now(),
          detalhes_erro = null
        WHERE id = ${this.config.id}
      `);

      return { ok: true, data };
    } catch (error: any) {
      // O que o admin lê na tela de conexão precisa ser a causa real — o
      // `error.message` do Drizzle é só "Failed query: SELECT ...".
      const motivo = mensagemErroPostgres(error);
      if (db)
        await db.execute(sql`
        UPDATE whatsapp_config SET
          status = 'ERRO',
          ultimo_teste = now(),
          detalhes_erro = ${motivo}
        WHERE id = ${this.config.id}
      `);
      throw error;
    }
  }

  async buscarDadosAutomaticos() {
    await this.init();
    if (!this.config?.phone_number_id) throw new Error("Phone Number ID ausente.");
    const phoneData = await this.fetchMeta(this.config.phone_number_id, {}, "BUSCAR_DADOS");
    return phoneData;
  }

  /**
   * Sincroniza os templates da Meta para o banco local.
   *
   * A gravação é isolada por template: um template que falha (conteúdo que o
   * Postgres recusa, status inesperado, etc.) não pode abortar o laço — antes
   * isso acontecia, e os templates seguintes da lista nunca chegavam ao banco.
   * O retorno diz quantos foram lidos da Meta, quantos foram gravados e quais
   * falharam, para que a tela não anuncie "N templates sincronizados" quando
   * nada foi salvo.
   */
  async sincronizarTemplates(): Promise<{
    lidos: number;
    salvos: number;
    falhas: { nome: string; erro: string }[];
    porStatus: Record<string, number>;
    totalMeta?: number | null;
    passagens?: { url: string; quantidade: number; totalMeta?: number | null; erro?: string }[];
  }> {
    // Rastro ANTES de qualquer chamada. A sincronização pode morrer antes do
    // primeiro contato com a Meta (token ausente, WABA ID vazio, banco fora) e,
    // nesse caso, nenhuma linha de log era criada — a aba de logs ficava
    // vazia e o admin não tinha como saber que o botão tinha sido clicado.
    await this.registrar({
      endpoint: "message_templates",
      operacao: "SINCRONIZAR_TEMPLATES",
      status: "SUCESSO",
      resumo: "Iniciando a sincronização de templates com a Meta.",
      payload: null,
    });
    await this.registrarTrilha({
      acao: "SINCRONIZACAO",
      detalhe: "Iniciando a sincronização de templates com a Meta.",
      payload: { etapa: "inicio" },
    });

    try {
      await this.init();
      if (!this.config?.waba_id) throw new Error("WABA ID não configurado.");
      // Sem banco, todo template "sincronizava" e nada era gravado — a contagem
      // de salvos mentia. Falhar cedo é o único jeito de a tela não anunciar
      // sucesso sobre um gravação que não aconteceu.
      if (!db) throw new Error("Banco de dados indisponível.");

      const { templates, passagens, totalMeta } = await this.listarTemplatesDaMeta();

      const falhas: { nome: string; erro: string }[] = [];
      let salvos = 0;
      // Quantos vieram em cada status. A tela só dizia "sincronizado", então um
      // template APPROVED que continuava aparecendo como "Em análise" no sistema
      // não tinha explicação nenhuma. Com a contagem por status, a diferença
      // entre a Meta e a tela fica visível na própria mensagem.
      const porStatus: Record<string, number> = {};

      for (const t of templates) {
        const nome = String(t?.name || "");
        if (!nome) {
          falhas.push({ nome: "(sem nome)", erro: "A Meta devolveu um template sem `name`." });
          continue;
        }

        let statusMeta = normalizarStatusTemplate(t?.status);
        if (!statusMeta && t?.id) {
          // A listagem veio sem `status`. Descartar o template por causa
          // disso era o que fazia os aprovados "não aparecerem": a tela
          // recebia uma lista de falhas e nenhum template gravado. A fonte da
          // verdade é o template individual — e essa consulta também fica
          // registrada no log da Meta.
          //
          // Duas tentativas: com `fields=status` e sem nenhum parâmetro.
          // Dependendo da versão do Graph API, uma das duas é recusada.
          for (const url of [`${t.id}?fields=status`, `${t.id}`]) {
            if (statusMeta) break;
            try {
              const detalhe: any = await this.fetchMeta(url, {}, "SINCRONIZAR_TEMPLATES");
              statusMeta = normalizarStatusTemplate(detalhe?.status);
            } catch (e: any) {
              console.warn(
                `[Meta] não foi possível consultar o status do template "${nome}" (${url}):`,
                mensagemErroPostgres(e),
              );
            }
          }
        }
        if (!statusMeta) {
          // Sem status não dá para gravar: a coluna tem PENDING como default e
          // o template apareceria "em análise" mesmo aprovado na Meta.
          falhas.push({
            nome,
            erro: `A Meta não devolveu o status deste template (recebido: ${JSON.stringify(
              t?.status ?? null,
            )}).`,
          });
          continue;
        }
        porStatus[statusMeta] = (porStatus[statusMeta] ?? 0) + 1;
        try {
          await upsertTemplateDaMeta(t, nome, statusMeta);
          salvos++;
        } catch (e: any) {
          // Esta mensagem vai direto para o relatório de sincronização que o
          // admin lê na tela — precisa ser a causa real, não "Failed query: ...".
          const motivo = mensagemErroPostgres(e);
          console.warn(`[Meta] falha ao gravar o template "${nome}" na sincronização:`, motivo);
          falhas.push({ nome, erro: motivo.slice(0, 300) });
        }
      }

      console.info(
        `[Meta] sincronização de templates: ${templates.length} lidos, ${salvos} gravados ` +
          `(${Object.entries(porStatus)
            .map(([s, n]) => `${s}: ${n}`)
            .join(", ")}), ${falhas.length} falharam.`,
      );

      // A linha de log fecha o ciclo: quantos templates vieram da Meta, quantos
      // foram gravados e quais falharam. Sem ela, a aba de logs só diria que
      // "algo foi chamado" e a tela não teria como explicar a divergência.
      // As passagens ficam no payload porque são elas que revelam se a Meta
      // devolveu menos do que existe (total informado x total lido).
      await this.registrar({
        endpoint: `${this.config.waba_id}/message_templates`,
        operacao: "SINCRONIZAR_TEMPLATES",
        status: falhas.length ? "ERRO" : "SUCESSO",
        resumo:
          `Sincronização concluída: ${templates.length} lidos da Meta ` +
          `(a Meta informa ${totalMeta ?? "?"} no total), ` +
          `${salvos} gravados, ${falhas.length} falha(s).`,
        payload: { porStatus, falhas, totalMeta, passagens },
      });
      await this.registrarTrilha({
        acao: falhas.length ? "ERRO" : "SINCRONIZACAO",
        detalhe:
          `Sincronização concluída: ${templates.length} lidos da Meta ` +
          `(a Meta informa ${totalMeta ?? "?"} no total), ` +
          `${salvos} gravados, ${falhas.length} falha(s).` +
          (falhas.length
            ? ` Primeiras falhas: ${falhas
                .slice(0, 3)
                .map((f) => `${f.nome} — ${f.erro}`)
                .join(" | ")}`
            : ""),
        payload: { porStatus, falhas, totalMeta, passagens },
      });

      return { lidos: templates.length, salvos, falhas, porStatus, totalMeta, passagens };
    } catch (error: any) {
      // A falha precisa ficar registrada. Sem esta linha, um erro antes da
      // chamada à Meta aparecia só como um toast na tela e sumia — sem nenhum
      // registro para investigar depois.
      const motivo = mensagemErroPostgres(error);
      await this.registrar({
        endpoint: "message_templates",
        operacao: "SINCRONIZAR_TEMPLATES",
        status: "ERRO",
        resumo: `Falha na sincronização de templates: ${motivo.slice(0, 500)}`,
        payload: null,
      });
      await this.registrarTrilha({
        acao: "ERRO",
        detalhe: `Falha na sincronização de templates: ${motivo.slice(0, 500)}`,
        payload: { etapa: "erro" },
      });
      throw error;
    }
  }

  /**
   * Lê a lista de templates da Meta, página por página.
   *
   * A Graph API mudou a forma de paginar: a versão clássica devolve
   * `paging.next` com a URL da página seguinte, e a mais nova devolve só
   * cursores (`paging.cursors.after`). Seguir apenas a URL deixava a
   * sincronização presa na primeira página, e os templates que estavam depois
   * dela nunca chegavam ao banco.
   *
   * Os campos são pedidos explicitamente porque a listagem sem `fields`
   * devolve um conjunto mínimo, e sem `status` o template não pode ser
   * salvo (entraria como PENDING, que é o estado oposto do real).
   */
  private async listarTemplatesDaMeta(): Promise<{
    templates: any[];
    passagens: { url: string; quantidade: number; totalMeta?: number | null; erro?: string }[];
    totalMeta: number | null;
  }> {
    const waba = String(this.config?.waba_id || "");
    const campos = "id,name,status,language,category,components";

    const paginar = async (base: string) => {
      const itens: any[] = [];
      let proxima: string | null = null;
      let cursor: string | null = null;
      let ultimo: any = null;
      // A Meta devolve no máximo 1000 por página, mas a listagem sem `limit`
      // vem com 25 — era esse o motivo de a sincronização "travar" num
      // punhado de templates. Com `limit=1000`, 20 páginas cobrem 20.000
      // templates: passou de 60, porque cada página é uma chamada à API e a
      // requisição do servidor tem tempo limite.
      for (let pagina = 0; pagina < 20; pagina++) {
        const alvo =
          cursor !== null
            ? `${base}${base.includes("?") ? "&" : "?"}after=${encodeURIComponent(cursor)}`
            : (proxima ?? base);
        const data: any = await this.fetchMeta(alvo, {}, "SINCRONIZAR_TEMPLATES");
        ultimo = data;
        const lote = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        itens.push(...lote);

        const next = data?.paging?.next;
        if (typeof next === "string" && /^https?:\/\//i.test(next)) {
          // Graph API clássica: a próxima página vem como URL pronta.
          proxima = next;
          cursor = null;
          continue;
        }
        const after = data?.paging?.cursors?.after ?? (typeof next === "string" ? next : null);
        if (after && lote.length) {
          // Graph API nova: a paginação é por cursor.
          cursor = String(after);
          proxima = null;
          continue;
        }
        break;
      }
      return {
        itens,
        totalMeta: Number(ultimo?.summary?.total_count ?? 0) || null,
      };
    };

    /**
     * A listagem de templates da Meta NÃO devolve o catálogo inteiro da WABA:
     * o endpoint é escopado pelo token e, em muitos casos, devolve só o
     * subconjunto visível para aquele app (e, com paginação padrão de 25,
     * só os primeiros). O sintoma era: a Meta mostra 8 modelos no WhatsApp
     * Manager, o sistema mostrava 8 mas não os 3 novos, e nada indicava
     * onde estava a diferença.
     *
     * A saída é ler por vários ângulos e unir o que vier:
     *  1. listagem completa, sem filtro, com `limit` alto;
     *  2. a mesma listagem pedindo os campos explicitamente (`status` vem
     *     junto, que sem ele o template não pode ser salvo);
     *  3. uma passagem por status (APPROVED, PENDING, ...) — cada uma traz
     *     um recorte que a listagem geral às vezes não traz;
     *  4. `summary=total_count`, que diz quantos a Meta acha que existem,
     *     para dar uma referência de conferência.
     */
    const STATUS_PARA_BUSCAR = [
      "APPROVED",
      "PENDING",
      "REJECTED",
      "PAUSED",
      "DELETED",
      "ARCHIVED",
      "DISABLED",
    ];

    const passagens: { url: string; quantidade: number; totalMeta?: number | null; erro?: string }[] =
      [];
    const vistos = new Map<string, any>();
    let totalMeta: number | null = null;

    const registrar = (item: any) => {
      const chave = String(item?.id || `${item?.name}|${item?.language}`);
      if (!vistos.has(chave)) vistos.set(chave, item);
    };

    /**
     * Primeiro passo: perguntar à Meta quantos templates existem.
     *
     * Isso precisa vir ANTES da varredura, por dois motivos:
     *  1. `summary=total_count` só aparece quando é pedido explicitamente —
     *     e ele estava no último dos 19 alvos, ou seja, nunca era conhecido a
     *     tempo de interromper a varredura;
     *  2. sem o total, a sincronização percorria 19 URLs × 60 páginas
     *     (mais de mil chamadas à API), o que estourava o tempo da requisição
     *     e fazia a tela voltar vazia — era esse o sintoma de "não sincroniza".
     */
    try {
      const contagem: any = await this.fetchMeta(
        `${waba}/message_templates?summary=total_count&limit=1`,
        {},
        "SINCRONIZAR_TEMPLATES",
      );
      const total = Number(contagem?.summary?.total_count ?? 0);
      if (total > 0) totalMeta = total;
      passagens.push({
        url: `${waba}/message_templates?summary=total_count&limit=1`,
        quantidade: Array.isArray(contagem?.data) ? contagem.data.length : 0,
        totalMeta: totalMeta ?? null,
      });
    } catch (e: any) {
      const motivo = mensagemErroPostgres(e).slice(0, 300);
      passagens.push({
        url: `${waba}/message_templates?summary=total_count&limit=1`,
        quantidade: 0,
        erro: motivo,
      });
      console.warn("[Meta] não foi possível obter o total de templates:", motivo);
    }

    /**
     * Ângulos de listagem, em ordem de confiança.
     *
     * A listagem simples é a primeira de propósito: é a forma que nenhuma
     * versão do Graph API recusa. As demais tentam trazer mais coisa (mais
     * itens por página, `status` explícito, recorte por status) e uma recusa
     * delas não pode derrubar a sincronização.
     */
    const alvos: string[] = [
      `${waba}/message_templates?limit=1000`,
      `${waba}/message_templates?fields=${campos}&limit=1000`,
      `${waba}/message_templates`,
      `${waba}/message_templates?fields=${campos}`,
      ...STATUS_PARA_BUSCAR.flatMap((s) => [
        // O filtro de status é aceito como texto simples e como array JSON —
        // a Graph API mudou de um para o outro entre versões, então as duas
        // formas são tentadas.
        `${waba}/message_templates?status=${s}&limit=1000`,
        `${waba}/message_templates?status=${encodeURIComponent(`["${s}"]`)}`,
      ]),
    ];

    for (const url of alvos) {
      try {
        const { itens, totalMeta: total } = await paginar(url);
        passagens.push({ url, quantidade: itens.length, totalMeta: total });
        if (total && !totalMeta) totalMeta = total;
        for (const item of itens) registrar(item);

        // Se a Meta já disse quantos templates existem e já trouxemos todos,
        // as passagens seguintes são desperdício — e cada uma delas é uma
        // chamada à API que consome cota. Com 19 alvos e 60 páginas cada, a
        // sincronização podia levar minutos e estourar o tempo da requisição.
        if (totalMeta && vistos.size >= totalMeta) {
          console.info(
            `[Meta] listagem completa: ${vistos.size} de ${totalMeta} templates — demais passagens dispensadas.`,
          );
          break;
        }
      } catch (e: any) {
        // Uma passagem recusada não pode derrubar a sincronização: as outras
        // ainda podem trazer os templates. O motivo fica registrado.
        const motivo = mensagemErroPostgres(e).slice(0, 300);
        passagens.push({ url, quantidade: 0, erro: motivo });
        console.warn(`[Meta] passagem de listagem recusada (${url}):`, motivo);
      }
    }

    const templates = [...vistos.values()];
    console.info(
      `[Meta] listagem de templates: ${templates.length} templates únicos em ` +
        `${passagens.length} passagens (total informado pela Meta: ${totalMeta ?? "?"}).`,
    );
    return { templates, passagens, totalMeta };
  }

  async criarTemplate(template: any) {
    await this.init();
    if (!this.config?.waba_id) throw new Error("WABA ID não configurado.");

    const metaPayload = {
      name: template.name,
      category: template.category,
      language: template.language || "pt_BR",
      components: this.normalizarComponentes(template.components, template.midia_id),
    };

    const data = await this.fetchMeta(
      `${this.config.waba_id}/message_templates`,
      { method: "POST", body: JSON.stringify(metaPayload) },
      "CRIAR_TEMPLATE",
    );

    // A Meta devolve o `id` do template criado. Se a resposta vier sem `id`
    // (o Graph API nem sempre o inclui), o template JÁ EXISTE na Meta — e não
    // gravá-lo localmente deixaria o usuário sem nenhuma pista na tela, com o
    // template órfão do lado da Meta.
    //
    // Mas o sintoma reportado era o contrário: o template aparecia na
    // plataforma e NÃO na Meta. Sem `id` na resposta não dá para afirmar que
    // a criação aconteceu — a API pode ter aceitado a chamada e não ter
    // criado nada. Por isso a criação é CONFIRMADA na listagem: uma chamada
    // só, filtrando pelo nome.
    let idConfirmado: string | null = data?.id ?? null;
    let statusConfirmado: string | null = null;
    // `conferenciaDeuCerto` separa "a listagem rodou e o template não está
    // nela" (o template NÃO foi criado) de "a listagem falhou" (não se pode
    // afirmar nada). No segundo caso não se pode recusar a criação — seria
    // reprovar um template que a Meta provavelmente criou.
    let conferenciaDeuCerto = false;
    if (!idConfirmado) {
      try {
        const conferencia: any = await this.fetchMeta(
          `${this.config.waba_id}/message_templates?fields=id,name,status&limit=1000`,
          {},
          "VERIFICAR_TEMPLATE",
        );
        const lista = Array.isArray(conferencia?.data) ? conferencia.data : [];
        // Uma listagem vazia sem erro também não prova nada: pode ser que a
        // listagem esteja escopada. Só a ausência com a lista cheia é prova.
        if (lista.length > 0) conferenciaDeuCerto = true;
        const achado = lista.find(
          (t: any) =>
            String(t?.name || "").trim().toLowerCase() === String(template.name).trim().toLowerCase(),
        );
        if (achado?.id) {
          idConfirmado = String(achado.id);
          statusConfirmado = normalizarStatusTemplate(achado?.status);
        }
      } catch (e: any) {
        console.warn(
          "[Meta] não foi possível confirmar a criação do template:",
          mensagemErroPostgres(e),
        );
      }
    }

    if (!idConfirmado && conferenciaDeuCerto) {
      // A Meta aceitou a chamada, mas o template não aparece na listagem: ele
      // não foi criado. Gravar localmente mentiria — a tela mostraria um
      // template que não existe na Meta, e a campanha tentaria usá-lo.
      const aviso =
        `A Meta aceitou a criação do template "${template.name}", mas ele não aparece ` +
        `na listagem de templates da conta — ou seja, NÃO foi criado na Meta. ` +
        `Isso costuma acontecer quando o template já existe com esse nome ou quando ` +
        `o token não tem permissão de criação nessa WABA.`;
      await this.registrarTrilha({
        acao: "ERRO",
        detalhe: aviso,
        payload: { nome: template.name, etapa: "criacao_nao_confirmada" },
      });
      throw new Error(aviso);
    }

    // A trilha do motor de disparo é onde o admin olha ("o que o sistema fez
    // com a minha mensagem"). Sem esta linha, criar template não deixava
    // rastro nenhum — e a falha "criou aqui mas não na Meta" não tinha onde
    // aparecer.
    await this.registrarTrilha({
      acao: "CRIACAO_TEMPLATE",
      detalhe:
        `Template "${template.name}" criado na Meta e enviado para análise. ` +
        `Id na Meta: ${idConfirmado}` +
        (statusConfirmado ? ` Status: ${statusConfirmado}.` : ""),
      payload: {
        nome: template.name,
        categoria: template.category,
        meta_id: idConfirmado,
        status: statusConfirmado,
      },
    });

    // O `meta_id` gravado é o CONFIRMADO. Gravar o `data.id` quando ele não
    // bate com o que está na Meta deixaria o sistema apontando para um id que
    // não existe — e a verificação "o template ainda existe na Meta" passaria
    // a errar em tudo.
    if (db) {
      // Mesmo motivo da sincronização: `ON CONFLICT (meta_name)` exige
      // restrição UNIQUE que bancos antigos não têm. UPDATE + INSERT funciona
      // nos dois casos.
      const nome = template.name;
      const atualizado = await db.execute(sql`
        UPDATE whatsapp_templates SET
          status = 'PENDING',
          meta_id = COALESCE(${idConfirmado ?? null}, meta_id),
          ultima_sincronizacao = now()
        WHERE meta_name = ${nome}
        RETURNING id
      `);

      if ((rowsOf(atualizado) as any[]).length === 0) {
        await db.execute(sql`
          INSERT INTO whatsapp_templates (
            meta_id,
            nome_interno,
            meta_name,
            categoria,
            idioma,
            status,
            conteudo,
            midia_id,
            midia_tipo,
            midia_nome,
            midia_arquivo_id,
            ultima_sincronizacao
          )
          VALUES (
            ${idConfirmado ?? null},
            ${template.nome_interno || template.name},
            ${template.name},
            ${template.category},
            ${template.language || "pt_BR"},
            'PENDING',
            ${JSON.stringify(template.components)}::jsonb,
            ${template.midia_id ?? null},
            ${template.midia_tipo ?? null},
            ${template.midia_nome ?? null},
            ${template.midia_arquivo_id ?? null},
            now()
          )
        `);
      }
    }

    return { ...data, ok: true, id: idConfirmado, nome: template.name };
  }

  /**
   * A Meta apaga template pelo nome em query string, não como segmento de path:
   * `DELETE /{waba}/message_templates?name=promocao`. Montando o nome no path a
   * API responde "Unknown path components: /promocao" e nada é apagado.
   *
   * "Invalid parameter" é a resposta da Meta quando o `name` não é um nome
   * válido de template (a Meta só aceita minúsculas, dígitos e `_`) OU quando o
   * nome não existe exatamente assim na conta. O nome gravado no sistema pode
   * ter vindo do wizard do admin (com maiúsculas ou espaços), enquanto a Meta
   * devolve o nome já normalizado — as duas grafias não são o mesmo template
   * para a API, e a exclusão falhava com "Invalid parameter" mesmo com o
   * template certo na tela.
   *
   * Por isso a exclusão tenta, em ordem:
   *  1. o nome como está no sistema;
   *  2. o nome exato que a Meta devolve para aquele template (comparado por
   *     `meta_id` e, na falta, por nome sem caixa/espaços);
   *  3. o `id` do template (`DELETE /{template_id}`), que a Meta aceita.
   *
   * Devolve "inexistente na Meta" em vez de lançar: quem chama trata esse caso
   * removendo só o registro local, porque o objetivo do usuário já foi atingido.
   */
  async excluirTemplate(metaName: string, metaId?: string | null) {
    await this.init();
    if (!this.config?.waba_id) throw new Error("WABA ID não configurado.");

    const waba = this.config.waba_id;
    const nomesTentados = new Set<string>();
    let ultimoErro: any = null;

    const tentar = async (nome: string) => {
      const chave = nome.trim();
      if (!chave || nomesTentados.has(chave)) return false;
      nomesTentados.add(chave);
      try {
        await this.fetchMeta(
          `${waba}/message_templates?name=${encodeURIComponent(chave)}`,
          { method: "DELETE" },
          "EXCLUIR_TEMPLATE",
        );
        await this.registrarTrilha({
          acao: "EXCLUSAO_TEMPLATE",
          detalhe: `Template "${chave}" excluído na Meta pelo nome.`,
          payload: { nome: chave, via: "nome" },
        });
        return true;
      } catch (e: any) {
        ultimoErro = e;
        return false;
      }
    };

    // 1) O nome exato que o sistema conhece.
    if (await tentar(metaName)) return { ok: true, jaEstavaNaMeta: false };

    // 2) O nome real na Meta, encontrado pela listagem. É o que resolve o
    //    "Invalid parameter" causado por diferença de caixa/espaços.
    let encontrado: any = null;
    try {
      const { templates } = await this.listarTemplatesDaMeta();
      const alvo = String(metaName || "").trim().toLowerCase();
      encontrado =
        templates.find((t: any) => metaId && String(t?.id) === String(metaId)) ||
        templates.find((t: any) => String(t?.name || "").trim().toLowerCase() === alvo) ||
        null;
      if (encontrado?.name) {
        if (await tentar(String(encontrado.name))) return { ok: true, jaEstavaNaMeta: false };
      }
    } catch (e: any) {
      // A listagem é apenas uma tentativa extra: se ela falhar, o erro original
      // (o do DELETE) continua sendo o que interessa.
      console.warn(
        "[Meta] listagem de apoio para exclusão falhou:",
        mensagemErroPostgres(e),
      );
    }

    // 3) Pelo id do template. A Meta NÃO aceita DELETE em
    //    `/{waba}/message_templates/{id}` (esse subdicionário não existe: a
    //    resposta é "Unknown path components: /<id>"). A exclusão por
    //    template individual é `DELETE /{TEMPLATE_ID}` — o id, sozinho, no
    //    caminho da raiz.
    if (encontrado?.id) {
      try {
        await this.fetchMeta(
          `${encodeURIComponent(String(encontrado.id))}`,
          { method: "DELETE" },
          "EXCLUIR_TEMPLATE",
        );
        await this.registrarTrilha({
          acao: "EXCLUSAO_TEMPLATE",
          detalhe: `Template "${metaName}" excluído na Meta pelo id ${encontrado.id}.`,
          payload: { nome: metaName, meta_id: encontrado.id, via: "id" },
        });
        return { ok: true, jaEstavaNaMeta: false };
      } catch (e: any) {
        ultimoErro = e;
      }
    }

    const msg = mensagemErroPostgres(ultimoErro);

    // "Unsupported delete request. Object with ID ... does not exist" é a
    // resposta da Meta quando ela RECUSA o DELETE — e o texto contém
    // "does not exist". Sem conferir, o sistema respondia "já não existia na
    // Meta", apagava o registro local, e o template continuava vivo no
    // WhatsApp Manager. Era exatamente o sintoma reportado.
    //
    // Só é seguro concluir que o template sumiu da Meta depois de CONFIRMAR
    // que ele não está mais na listagem.
    const aindaExiste = await this.templateAindaNaMeta(metaName, metaId, encontrado);
    if (aindaExiste === true) {
      await this.registrarTrilha({
        acao: "ERRO",
        detalhe:
          `Falha ao excluir o template "${metaName}": ${msg} ` +
          `O template continua existindo na Meta — ele não foi apagado de lá.`,
        payload: { nome: metaName, erro: msg.slice(0, 500) },
      });
      throw new Error(
        `${msg} O template continua existindo na Meta — ele não foi apagado de lá. ` +
          `Verifique o nome e as permissões do token, ou exclua pela WhatsApp Manager.`,
      );
    }
    if (aindaExiste === false) return { ok: true, jaEstavaNaMeta: true };

    // A Meta recusou de forma que não dá para saber se o template existe.
    // O nome exato que ela devolveu (quando existe) é a informação útil:
    // sem ela, o admin só vê "Invalid parameter" e não sabe o que corrigir.
    const dica = encontrado?.name
      ? ` O template existe na Meta com o nome "${encontrado.name}" — a exclusão automática não conseguiu usá-lo.`
      : "";
    throw new Error(`${msg}${dica}`);
  }

  /**
   * Confere se o template ainda está na Meta depois de uma recusa no DELETE.
   *
   * Devolve `true` (continua lá), `false` (não está mais lá) ou `null`
   * (não deu para conferir — a listação falhou).
   */
  private async templateAindaNaMeta(
    metaName: string,
    metaId?: string | null,
    jaEncontrado?: any,
  ): Promise<boolean | null> {
    const waba = String(this.config?.waba_id || "");
    if (!waba) return null;

    // Consulta direta pelo id: mais barata que a listagem e suficiente
    // quando a tela tem o meta_id do template.
    //
    // O caminho é `/{TEMPLATE_ID}` — e NÃO `/{waba}/message_templates/{id}`.
    // Esse subdicionário não existe na API da Meta: a resposta é "Unknown
    // path components: /<id>", que não diz nada sobre o template e fazia a
    // verificação cair no "não deu para conferir", devolvendo um erro
    // confuso em vez da resposta certa.
    const id = String(metaId || jaEncontrado?.id || "").trim();
    if (id) {
      try {
        await this.fetchMeta(
          `${encodeURIComponent(id)}?fields=id,name,status`,
          {},
          "VERIFICAR_TEMPLATE",
        );
        return true;
      } catch (e: any) {
        const m = mensagemErroPostgres(e);
        if (/does not exist|not found/i.test(m)) return false;
        console.warn(`[Meta] consulta do template ${id} falhou:`, m);
      }
    }

    // Sem id (ou com id que a Meta não reconheceu), procura na listagem.
    try {
      const { templates } = await this.listarTemplatesDaMeta();
      const alvo = String(metaName || "").trim().toLowerCase();
      const achou = templates.some(
        (t: any) =>
          (id && String(t?.id) === id) ||
          String(t?.name || "").trim().toLowerCase() === alvo,
      );
      return achou;
    } catch (e: any) {
      console.warn(
        "[Meta] não foi possível conferir se o template ainda existe:",
        mensagemErroPostgres(e),
      );
      return null;
    }
  }

  /**
   * Faz upload de binário para a Meta e devolve o `media_id` que os endpoints
   * de imagem/áudio/documento esperam. Precisa do `phone_number_id`; o
   * `app_id` sozinho não autentica o POST de mídia.
   *
   * Chega aqui como base64 (o arquivo passa pelo endpoint público de upload e
   * é relido em bytes), então o multipart é montado em memória com um
   * FormData próprio, sem depender de `form-data` no servidor.
   */
  async uploadMedia(fileData: string, fileName: string, fileType: string) {
    const inicio = Date.now();
    await this.init();
    if (!this.config?.phone_number_id) throw new Error("Phone Number ID não configurado.");

    const base64 = String(fileData).replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) throw new Error("Arquivo vazio.");

    // Multipart montado à mão: o boundary precisa existir no Content-Type e no
    // corpo, e o FormData do browser não funciona no servidor.
    const boundary = `meta${Date.now().toString(36)}`;
    const partes: Buffer[] = [];
    const empurrar = (chunk: Buffer | string) => partes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));

    empurrar(`--${boundary}\r\n`);
    empurrar(
      `Content-Disposition: form-data; name="file"; filename="${String(fileName || "arquivo").replace(/["\r\n]/g, "_")}"\r\n` +
      `Content-Type: ${fileType || "application/octet-stream"}\r\n\r\n`,
    );
    empurrar(buffer);
    empurrar(`\r\n--${boundary}\r\n`);
    empurrar(`Content-Disposition: form-data; name="type"\r\n\r\n${fileType || "application/octet-stream"}\r\n`);
    empurrar(`--${boundary}\r\n`);
    empurrar(`Content-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n`);
    empurrar(`--${boundary}--\r\n`);

    const corpo = Buffer.concat(partes);

    const version = versaoGraphValida(this.config?.graph_api_version);

    if (!this.config?.access_token) throw new Error("Token de acesso do WhatsApp não configurado.");

    const resposta = await fetch(
      `https://graph.facebook.com/${version}/${this.config.phone_number_id}/media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.access_token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: corpo,
      },
    );

    const texto = await resposta.text();
    let parsed: any;
    try {
      parsed = JSON.parse(texto);
    } catch {
      parsed = null;
    }

    if (!resposta.ok || !parsed?.id) {
      const detalhe = parsed?.error?.message || texto.slice(0, 400) || `HTTP ${resposta.status}`;
      await this.registrar({
        endpoint: `${version}/${this.config.phone_number_id}/media`,
        operacao: "UPLOAD_MIDIA",
        status: "ERRO",
        httpStatus: resposta.status,
        resumo: `Falha no upload de mídia: ${detalhe}`,
        payload: { nome: fileName, tipo: fileType, tamanho: buffer.length },
      });
      throw new Error(`Falha no upload de mídia para a Meta: ${detalhe}`);
    }

    await this.registrar({
      endpoint: `${version}/${this.config.phone_number_id}/media`,
      operacao: "UPLOAD_MIDIA",
      status: "SUCESSO",
      httpStatus: resposta.status,
      resumo: `Upload de mídia concluído (${parsed.id})`,
      payload: { nome: fileName, tipo: fileType, tamanho: buffer.length, mediaId: parsed.id },
      duracaoMs: Date.now() - inicio,
    });

    return { mediaId: parsed.id, tamanho: buffer.length };
  }

  /**
   * Sobe um binário (base64 dataURL ou puro) para a Meta e devolve o `id`
   * INTEIRO que os endpoints de mensagem esperam. O `media_id` gravado no banco
   * é string; a Meta devolve inteiro. Templates criados direto na Meta podem
   * trazer um `header_handle` alfanumérico, que não serve como referência —
   * nesse caso o binário é reenviado e o id novo é o que entra no payload.
   */
  async subirMidiaParaId(
    arquivoBase64: string,
    nome: string,
    tipo: string,
  ): Promise<number> {
    const { mediaId } = await this.uploadMedia(arquivoBase64, nome, tipo);
    const id = idMidiaNumerico(mediaId);
    if (id == null) {
      throw new Error("A Meta devolveu um ID de mídia inesperado após o upload.");
    }
    return id;
  }

  private enviarMidia(tipo: "image" | "audio" | "document", to: string, mediaId: string, extras: Record<string, string>, operacao: string) {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: tipo,
      [tipo]: { id: mediaId, ...extras },
    };
    return this.fetchMeta(
      `${this.config!.phone_number_id}/messages`,
      { method: "POST", body: JSON.stringify(payload) },
      operacao,
    );
  }

  /** Enviar imagem. `caption` é opcional e limitado pela Meta a 1024 caracteres. */
  async enviarImagem(to: string, mediaId: string, caption?: string | null, operacao = "ENVIAR_MIDIA") {
    await this.init();
    if (!this.config?.phone_number_id) throw new Error("Phone Number ID não configurado.");
    const extras: Record<string, string> = {};
    if (caption?.trim()) extras.caption = caption.trim().slice(0, 1024);
    return this.enviarMidia("image", to, mediaId, extras, operacao);
  }

  /** Enviar documento. O `filename` aparece no cartão de arquivo no WhatsApp. */
  async enviarDocumento(to: string, mediaId: string, filename?: string | null, caption?: string | null, operacao = "ENVIAR_MIDIA") {
    await this.init();
    if (!this.config?.phone_number_id) throw new Error("Phone Number ID não configurado.");
    const extras: Record<string, string> = {};
    if (filename?.trim()) extras.filename = filename.trim();
    if (caption?.trim()) extras.caption = caption.trim().slice(0, 1024);
    return this.enviarMidia("document", to, mediaId, extras, operacao);
  }

  /** Enviar áudio (voz ou música). A Meta detecta o tipo pelo binário. */
  async enviarAudio(to: string, mediaId: string, operacao = "ENVIAR_MIDIA") {
    await this.init();
    if (!this.config?.phone_number_id) throw new Error("Phone Number ID não configurado.");
    return this.enviarMidia("audio", to, mediaId, {}, operacao);
  }

  async enviarMensagem(
    to: string,
    templateName: string,
    language: string,
    components: any[],
    operacao = "ENVIAR_MENSAGEM",
  ) {
    await this.init();
    if (!this.config?.phone_number_id) throw new Error("Phone Number ID não configurado.");

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: language,
        },
        components,
      },
    };

    return this.fetchMeta(
      `${this.config.phone_number_id}/messages`,
      { method: "POST", body: JSON.stringify(payload) },
      operacao || "ENVIAR_MENSAGEM",
    );
  }

  /**
   * Envia texto livre. Só é aceito pela Meta dentro da janela de 24h
   * de atendimento — quem controla a janela é o chamador (conversas.server).
   */
  async enviarTexto(to: string, texto: string, operacao = "ENVIAR_TEXTO") {
    await this.init();
    if (!this.config?.phone_number_id) throw new Error("Phone Number ID não configurado.");

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: texto },
    };

    return this.fetchMeta(
      `${this.config.phone_number_id}/messages`,
      { method: "POST", body: JSON.stringify(payload) },
      operacao,
    );
  }
}

export const metaService = new MetaWhatsAppService();

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
