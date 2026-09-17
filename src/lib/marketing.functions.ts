import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const filtroSchema = z.object({
  busca: z.string().optional(),
  tipo: z.string().optional(),
  status: z.string().optional(),
  somenteComCoordenadas: z.boolean().optional(),
});

export const listarMarketingContatosFn = createServerFn({ method: "GET" })
  .inputValidator((d) => filtroSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const { listarMarketingContatos } = await import("@/db/marketing.server");
      return { ok: true as const, data: await listarMarketingContatos(data) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const importarMarketingContatosFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ contatos: z.array(z.record(z.string(), z.unknown())) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { importarMarketingContatos } = await import("@/db/marketing.server");
      return { ok: true as const, data: await importarMarketingContatos(data.contatos) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const criarMarketingTagFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ nome: z.string().min(1), cor: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { criarMarketingTag } = await import("@/db/marketing.server");
      return { ok: true as const, data: await criarMarketingTag(data.nome, data.cor) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const atribuirMarketingTagFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ contatoIds: z.array(z.string().uuid()), tagId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { atribuirMarketingTag } = await import("@/db/marketing.server");
      await atribuirMarketingTag(data.contatoIds, data.tagId);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const converterContatoEmCompradorFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ contatoId: z.string().uuid(), senha: z.string().min(6) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { converterContatoEmComprador } = await import("@/db/marketing.server");
      return {
        ok: true as const,
        data: await converterContatoEmComprador(data.contatoId, data.senha),
      };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const geocodificarContatosFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ limite: z.number().int().min(1).max(50).optional() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { geocodificarContatosPendentes } = await import("@/db/marketing.server");
      return { ok: true as const, data: await geocodificarContatosPendentes(data.limite) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

/** Retorna a config Uazapi com o token mascarado (nunca exposto ao navegador). */
export const getUazapiConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getUazapiConfig } = await import("@/db/marketing.server");
    const cfg = await getUazapiConfig();
    return {
      ok: true as const,
      data: {
        uazapi_base_url: cfg.uazapi_base_url || "",
        uazapi_token_definido: !!cfg.uazapi_token,
      },
    };
  } catch (e: any) {
    return { ok: false as const, message: e.message };
  }
});

export const salvarUazapiConfigFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        base_url: z.string().url().optional(),
        token: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { getUazapiConfig, salvarUazapiConfig } = await import("@/db/marketing.server");
      // Preserva valores existentes quando o campo vem vazio ou mascarado
      const atual = await getUazapiConfig();
      const base_url = data.base_url?.trim() || atual.uazapi_base_url || "";
      const token =
        !data.token || data.token === "••••••••••••" ? atual.uazapi_token || "" : data.token.trim();
      if (!base_url || !token) throw new Error("URL e token são obrigatórios.");
      return { ok: true as const, data: await salvarUazapiConfig(base_url, token) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const verificarWhatsappContatosFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ limite: z.number().int().min(1).max(250).optional() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { verificarWhatsappContatos } = await import("@/db/marketing.server");
      return { ok: true as const, data: await verificarWhatsappContatos(data.limite) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
