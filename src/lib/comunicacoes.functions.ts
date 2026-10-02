import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as db from "../db/comunicacoes.server";
import { metaService } from "../db/meta-whatsapp.server";

export const getWhatsappConfigFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const config = await db.getWhatsappConfig();
    if (config) {
      return {
        ...config,
        app_secret: config.app_secret ? "••••••••••••" : null,
        access_token: config.access_token ? "••••••••••••" : null,
        webhook_verify_token: config.webhook_verify_token ? "••••••••••••" : null,
      };
    }
    return config;
  });

export const updateWhatsappConfigFn = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    try {
      // Sem `data`, todos os campos viram null e o COALESCE do UPDATE preserva
      // o que já estava salvo: o salvamento passa silenciosamente. Melhor falhar.
      if (!data || typeof data !== "object") {
        throw new Error(
          "Nenhum dado foi recebido pelo servidor. Recarregue a página e tente salvar de novo."
        );
      }

      const existing = await db.getWhatsappConfig();

      // O formulário abre com a linha inteira do banco, que traz campos de
      // leitura (id, criado_em, ultimo_teste...) como Date e o placeholder
      // "••••••••••••" no lugar dos segredos. Enviar tudo isso ao UPDATE
      // quebra a query e, pior, grava a máscara por cima da senha real.
      // Então: allowlist dos campos editáveis + preserva segredos não alterados.
      const texto = (v: any) => (typeof v === "string" ? v.trim() : v);
      const editable = ["waba_id", "phone_number_id", "business_id", "phone_number", "app_id", "graph_api_version", "status"];
      const updateData: any = {};
      for (const campo of editable) {
        updateData[campo] = data?.[campo] === "••••••••••••" ? null : texto(data?.[campo]) || null;
      }
      for (const segredo of ["app_secret", "access_token", "webhook_verify_token"]) {
        const enviado = texto(data?.[segredo]);
        updateData[segredo] =
          enviado && enviado !== "••••••••••••" ? enviado : (existing?.[segredo] ?? null);
      }

      return await db.updateWhatsappConfig(updateData);
    } catch (error: any) {
      console.error("[WhatsApp] Erro ao salvar configuração:", error);
      return { ok: false, error: error?.message || "Erro ao salvar configuração." };
    }
  });

export const listarTemplatesFn = createServerFn({ method: "GET" })
  .handler(async () => {
    return db.listarTemplates();
  });

export const listarSegmentosFn = createServerFn({ method: "GET" })
  .handler(async () => {
    return db.listarSegmentos();
  });

export const listarCampanhasFn = createServerFn({ method: "GET" })
  .handler(async () => {
    return db.listarCampanhas();
  });

export const getIndicadoresComunicacoesFn = createServerFn({ method: "GET" })
  .handler(async () => {
    return db.getIndicadoresComunicacoes();
  });

export const testarConexaoFn = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      return await metaService.testarConexao();
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

export const sincronizarTemplatesFn = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const count = await metaService.sincronizarTemplates();
      return { ok: true, count };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

export const buscarDadosAutomaticosFn = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const data = await metaService.buscarDadosAutomaticos();
      return { ok: true, data };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

export const gerarNovoVerifyTokenFn = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const newToken = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
      const existing = await db.getWhatsappConfig();
      if (!existing) {
        return { ok: false, error: "Configuração do WhatsApp não encontrada." };
      }

      await db.updateWhatsappConfig({
        ...existing,
        webhook_verify_token: newToken,
      });
      return { ok: true, token: newToken };
    } catch (error: any) {
      console.error("[WhatsApp] Erro ao gerar Verify Token:", error);
      return { ok: false, error: error?.message || "Erro ao salvar o Verify Token." };
    }
  });

export const getWebhookLogsFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const logs = await db.getWebhookLogs();
    return logs as any[];
  });

export const criarTemplateMetaFn = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    try {
      return await metaService.criarTemplate(data);
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

export const estimarPublicoFn = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    return db.estimarPublico(data);
  });

export const criarCampanhaFn = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data, context }) => {
    // Pegar usuário da auth se disponível, ou mockar admin
    const userId = (context as any).userId || '00000000-0000-0000-0000-000000000000';
    return db.criarCampanha(data, userId);
  });

export const getCampanhaDetalhesFn = createServerFn({ method: "GET" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    return db.getCampanhaDetalhes(id);
  });

export const processarEnvioCampanhaFn = createServerFn({ method: "POST" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    return db.processarEnvioCampanha(id);
  });

export const enviarTesteFn = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({
    telefone: z.string(),
    template_id: z.string().uuid(),
    variaveis: z.any()
  }).parse(data))
  .handler(async ({ data }) => {
    try {
      const template = (await db.listarTemplates()).find((t: any) => t.id === data.template_id);
      if (!template) throw new Error("Template não encontrado");
      
      return await metaService.enviarMensagem(
        data.telefone,
        template.meta_name,
        template.idioma,
        [] // TODO: Mapear variáveis
      );
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
