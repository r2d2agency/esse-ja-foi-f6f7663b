import { sql } from "drizzle-orm";
import { db } from "./index";

const DEFAULT_GRAPH_VERSION = 'v20.0';

// A Meta recusa o template com "invalid parameter" quando os componentes chegam
// fora desta ordem. A ordem é HEADER → BODY → FOOTER → BUTTONS.
const ORDEM_COMPONENTES: Record<string, number> = {
  HEADER: 0, BODY: 1, FOOTER: 2, BUTTONS: 3,
};

export class MetaWhatsAppService {
  private config: any = null;

  /**
   * Ordena os componentes na sequência que a Meta exige e completa o HEADER de
   * texto com o objeto `parameters`, que é obrigatório — sem ele a API responde
   * "invalid parameter" mesmo com a ordem correta.
   */
  private normalizarComponentes(components: any[] = []) {
    return [...components]
      .sort((a, b) => (ORDEM_COMPONENTES[a?.type] ?? 99) - (ORDEM_COMPONENTES[b?.type] ?? 99))
      .map((c) =>
        c?.type === "HEADER" && c?.format === "TEXT" && !c.parameters
          ? { ...c, parameters: [] }
          : c
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

  private async fetchMeta(endpoint: string, options: RequestInit = {}) {
    if (!this.config?.access_token) {
      throw new Error("Token de acesso do WhatsApp não configurado.");
    }

    // O paging.next da Meta já vem como URL absoluta, com versão e token. Prefixar
    // a versão de novo produziria uma URL inválida.
    const url = /^https?:\/\//i.test(endpoint)
      ? endpoint
      : this.getGraphUrl(endpoint);
    const headers = {
      'Authorization': `Bearer ${this.config.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      console.error("[Meta API Error]", data);
      throw new Error(data.error?.message || "Erro na comunicação com a API da Meta.");
    }

    return data;
  }

  async testarConexao() {
    await this.init();
    if (!this.config?.phone_number_id) {
      throw new Error("Phone Number ID não configurado.");
    }

    try {
      const data = await this.fetchMeta(this.config.phone_number_id);
      
      if (db) await db.execute(sql`
        UPDATE whatsapp_config SET 
          status = 'CONECTADO', 
          ultimo_teste = now(),
          detalhes_erro = null
        WHERE id = ${this.config.id}
      `);

      return { ok: true, data };
    } catch (error: any) {
      if (db) await db.execute(sql`
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
    const phoneData = await this.fetchMeta(this.config.phone_number_id);
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
      const data: any = await this.fetchMeta(url);
      templates.push(...(data.data || []));
      url = data.paging?.next ? String(data.paging.next) : undefined;
    }

    for (const t of templates) {
      if (db) await db.execute(sql`
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
          ${t.id}, 
          ${t.name}, 
          ${t.name}, 
          ${t.category}, 
          ${t.language}, 
          ${t.status}, 
          ${JSON.stringify(t.components)}::jsonb,
          now()
        )
        ON CONFLICT (meta_name) DO UPDATE SET
          status = EXCLUDED.status,
          conteudo = EXCLUDED.conteudo,
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
      language: template.language || 'pt_BR',
      components: this.normalizarComponentes(template.components)
    };

    const data = await this.fetchMeta(`${this.config.waba_id}/message_templates`, {
      method: 'POST',
      body: JSON.stringify(metaPayload)
    });

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
          ${template.language || 'pt_BR'}, 
          'PENDING', 
          ${JSON.stringify(template.components)}::jsonb,
          now()
        )
      `);
    }

    return data;
  }

  /**
   * A Meta apaga template pelo nome, não pelo id numérico.
   * Devolve "inexistente na Meta" em vez de lançar: quem chama trata esse caso
   * removendo só o registro local, porque o objetivo do usuário já foi atingido.
   */
  async excluirTemplate(metaName: string) {
    await this.init();
    if (!this.config?.waba_id) throw new Error("WABA ID não configurado.");

    try {
      await this.fetchMeta(
        `${this.config.waba_id}/message_templates/${encodeURIComponent(metaName)}`,
        { method: "DELETE" }
      );
      return { ok: true, jaEstavaNaMeta: false };
    } catch (e: any) {
      const msg = String(e?.message || "");
      const naoExisteNaMeta =
        /does not exist|not found|Unsupported (delete|get)/i.test(msg);
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

  async enviarMensagem(to: string, templateName: string, language: string, components: any[]) {
    await this.init();
    if (!this.config?.phone_number_id) throw new Error("Phone Number ID não configurado.");

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: language
        },
        components
      }
    };

    return this.fetchMeta(`${this.config.phone_number_id}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
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
