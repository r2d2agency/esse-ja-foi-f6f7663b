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
 * Monta os componentes de uma mensagem de template a partir do corpo gravado e
 * dos valores. A Meta exige um parameter para cada {{n}} do corpo, na mesma
 * ordem — sem isso a resposta é "template variable missing".
 */
export function montarComponents(conteudo: any, valores: Record<string, string> = {}): any[] {
  const comps = Array.isArray(conteudo?.components) ? conteudo.components : [];
  const corpo = comps.find((c: any) => c?.type === "BODY")?.text || "";
  const numeros = [...String(corpo).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const maximo = numeros.length ? Math.max(...numeros) : 0;
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
      `Preencha ${faltando.join(", ")} no mapeamento da campanha. A Meta recusa mensagem de template com variável vazia.`,
    );
  }
  return [{ type: "BODY", parameters }];
}

export class MetaWhatsAppService {
  private config: any = null;

  /**
   * Ordena os componentes na sequência que a Meta exige. `parameters` pertence
   * ao envio de mensagens, não ao cadastro do template; a API rejeita esse
   * campo no payload de criação com "Unexpected key parameters".
   */
  private normalizarComponentes(components: any[] = []) {
    return [...components].sort(
      (a, b) => (ORDEM_COMPONENTES[a?.type] ?? 99) - (ORDEM_COMPONENTES[b?.type] ?? 99),
    );
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

    await this.registrar({
      endpoint: url,
      operacao,
      status: response.ok ? "SUCESSO" : "ERRO",
      resumo: response.ok
        ? "OK"
        : data?.error?.message || "Erro na comunicação com a API da Meta.",
      payload: data,
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
          conteudo = EXCLUDED.conteudo,
          -- O motivo da recusa só vale enquanto o status é REJECTED. Sem
          -- limpar, um template que foi rejeitado e depois reenviado continuaria
          -- exibindo a razão antiga na tela.
          motivo_recusa = ${t.status === "REJECTED" ? (t.reason ?? null) : null},
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

  async uploadMedia(fileData: string, fileName: string, fileType: string) {
    await this.init();
    if (!this.config?.app_id) throw new Error("Meta App ID não configurado.");

    // Implementação simplificada de upload de mídia Meta
    // 1. Iniciar upload
    // 2. Enviar chunks (ou arquivo inteiro se pequeno)
    // 3. Obter handle

    // Para simplificar agora, retornamos um erro indicando que o upload requer Buffer/Stream real
    throw new Error("Upload de mídia via API Meta requer processamento de binários.");
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
}

export const metaService = new MetaWhatsAppService();

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
