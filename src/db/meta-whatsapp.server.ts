import { sql } from "drizzle-orm";
import { db } from "./index";

const DEFAULT_GRAPH_VERSION = "v20.0";

// A Meta recusa o template com "invalid parameter" quando os componentes chegam
// fora desta ordem. A ordem é HEADER → BODY → FOOTER → BUTTONS.
const ORDEM_COMPONENTES: Record<string, number> = {
  HEADER: 0,
  BODY: 1,
  FOOTER: 2,
  BUTTONS: 3,
};

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
}): Promise<number> {
  const idSalvo = idMidiaNumerico(params.mediaId);
  if (idSalvo != null) return idSalvo;
  if (!params.base64) {
    throw new Error(
      "O anexo do cabeçalho não tem um ID válido para a Meta. Reenvie a imagem/PDF ao template e tente de novo.",
    );
  }
  return metaService.subirMidiaParaId(
    params.base64,
    params.nome || "arquivo",
    params.tipo || "image",
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
  midia: { tipo?: string; mediaId?: string; nome?: string; base64?: string } | null = null,
): Promise<any[]> {
  const comps = componentesDoConteudo(conteudo);
  if (!comps.length) return [];

  const saida: any[] = [];
  const anexo = midia?.mediaId || midia?.base64 ? midia : null;

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
   */
  private normalizarComponentes(components: any[] = []) {
    const ordenados = [...components].sort(
      (a, b) => (ORDEM_COMPONENTES[a?.type] ?? 99) - (ORDEM_COMPONENTES[b?.type] ?? 99),
    );

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
          return { ...semParameters, text: "" };
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

  async init() {
    if (!db) return;
    // Mesmo critério do updateWhatsappConfig (menor id): se a leitura e a escrita
    // escolherem linhas diferentes, salvar funciona mas a validação diz que o
    // Phone Number ID não está configurado. Vide comunicacoes.server.ts.
    const res = await db.execute(sql`
      SELECT * FROM whatsapp_config ORDER BY id LIMIT 1
    `);
    this.config = rowsOf(res)?.[0];

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
      console.warn("[Meta] normalizarTemplatesLegados falhou:", e?.message || e);
    }
  }

  private getGraphUrl(endpoint: string) {
    const version = this.config?.graph_api_version || DEFAULT_GRAPH_VERSION;
    return `https://graph.facebook.com/${version}/${endpoint}`;
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
    const url = /^https?:\/\//i.test(endpoint) ? endpoint : this.getGraphUrl(endpoint);
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
  }) {
    const { registrarLogMeta } = await import("./logs-whatsapp.server");
    await registrarLogMeta({
      direcao: "SAIDA",
      operacao: params.operacao,
      wabaId: this.config?.waba_id ?? null,
      httpStatus: params.httpStatus,
      status: params.status,
      resumo: params.resumo,
      payload: params.payload,
      endpoint: params.endpoint,
      duracaoMs: params.duracaoMs,
    });
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
      if (db)
        await db.execute(sql`
        UPDATE whatsapp_config SET 
          status = 'ERRO', 
          ultimo_teste = now(),
          detalhes_erro = ${error.message}
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

  async sincronizarTemplates() {
    await this.init();
    if (!this.config?.waba_id) throw new Error("WABA ID não configurado.");

    const templates: any[] = [];
    // A Meta devolve ~25 por página e o resto vem em paging.next. Ler só a
    // primeira página deixava parte dos templates invisível na tela para sempre.
    // O teto evita laço infinito se a API devolver cursor malformado.
    let url: string | undefined = `${this.config.waba_id}/message_templates`;
    for (let pagina = 0; pagina < 20 && url; pagina++) {
      const data: any = await this.fetchMeta(url, {}, "SINCRONIZAR_TEMPLATES");
      templates.push(...(data.data || []));
      url = data.paging?.next ? String(data.paging.next) : undefined;
    }

    for (const t of templates) {
      if (db)
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
          ${t.id},
          ${t.name},
          ${t.name},
          ${t.category},
          ${t.language},
          ${t.status},
          ${JSON.stringify(t.components)}::jsonb,
          ${t.status === "REJECTED" ? (t.reason ?? null) : null},
          now()
        )
        ON CONFLICT (meta_name) DO UPDATE SET
          status = EXCLUDED.status,
          -- NÃO sobrescrever conteudo: o wizard grava no formato de criação
          -- (HEADER/BODY/FOOTER/BUTTONS maiúsculo, com buttons[] e format).
          -- A Meta devolve o formato de envio (minúsculo, com parameters[] e
          -- sem url). Sobrescrever quebra o montarComponents, que espera o
          -- formato de criação — e a Meta responde 132012.
          -- O motivo da recusa só vale enquanto o status é REJECTED. Sem
          -- limpar, um template que foi rejeitado e depois reenviado continuaria
          -- exibindo a razão antiga na tela.
          motivo_recusa = ${t.status === "REJECTED" ? (t.reason ?? null) : null},
          -- Preservar as colunas midia_* quando o template já existe: o ON CONFLICT
          -- não as repõe, então um template com imagem perdia a referência à mídia
          -- depois de sincronizado. Sem midia_id, o HEADER de mídia some no envio
          -- e a Meta responde 132012.
          midia_id = COALESCE(whatsapp_templates.midia_id, EXCLUDED.midia_id),
          midia_tipo = COALESCE(whatsapp_templates.midia_tipo, EXCLUDED.midia_tipo),
          midia_nome = COALESCE(whatsapp_templates.midia_nome, EXCLUDED.midia_nome),
          midia_arquivo_id = COALESCE(whatsapp_templates.midia_arquivo_id, EXCLUDED.midia_arquivo_id),
          ultima_sincronizacao = now();
      `);
    }

    return templates.length;
  }

  async criarTemplate(template: any) {
    await this.init();
    if (!this.config?.waba_id) throw new Error("WABA ID não configurado.");

    const metaPayload = {
      name: template.name,
      category: template.category,
      language: template.language || "pt_BR",
      components: this.normalizarComponentes(template.components),
    };

    const data = await this.fetchMeta(
      `${this.config.waba_id}/message_templates`,
      { method: "POST", body: JSON.stringify(metaPayload) },
      "CRIAR_TEMPLATE",
    );

    if (db && data.id) {
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
          ${data.id},
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

    return data;
  }

  /**
   * A Meta apaga template pelo nome em query string, não como segmento de path:
   * `DELETE /{waba}/message_templates?name=promocao`. Montando o nome no path a
   * API responde "Unknown path components: /promocao" e nada é apagado.
   *
   * Devolve "inexistente na Meta" em vez de lançar: quem chama trata esse caso
   * removendo só o registro local, porque o objetivo do usuário já foi atingido.
   */
  async excluirTemplate(metaName: string) {
    await this.init();
    if (!this.config?.waba_id) throw new Error("WABA ID não configurado.");

    const nome = encodeURIComponent(metaName);
    try {
      await this.fetchMeta(
        `${this.config.waba_id}/message_templates?name=${nome}`,
        { method: "DELETE" },
        "EXCLUIR_TEMPLATE",
      );
      return { ok: true, jaEstavaNaMeta: false };
    } catch (e: any) {
      const msg = String(e?.message || "");
      const naoExisteNaMeta =
        /does not exist|not found|unsupported delete|Unknown path components/i.test(msg);
      if (!naoExisteNaMeta) throw e;
      return { ok: true, jaEstavaNaMeta: true };
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

    const version = this.config?.graph_api_version || DEFAULT_GRAPH_VERSION;

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
