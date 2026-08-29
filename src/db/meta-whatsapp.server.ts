import { sql } from "drizzle-orm";
import { db } from "./index";

const DEFAULT_GRAPH_VERSION = 'v20.0';

export class MetaWhatsAppService {
  private config: any = null;

  async init() {
    if (!db) return;
    const res = await db.execute(sql`SELECT * FROM whatsapp_config LIMIT 1`);
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

    const url = this.getGraphUrl(endpoint);
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

    const data = await this.fetchMeta(`${this.config.waba_id}/message_templates`);
    const templates = data.data || [];

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
      components: template.components
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
