import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().min(10) });

async function userFromToken(token: string) {
  const { verifyToken } = await import("@/db/auth.server");
  const userId = await verifyToken(token);
  if (!userId) throw new Error("Sessão expirada. Faça login novamente.");
  return userId;
}

export const cadastrarCompradorFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        tipo: z.enum(["PF", "PJ"]).default("PF"),
        nome: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        whatsapp: z.string().optional(),
        cpf: z.string().optional(),
        cnpj: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const m = await import("@/db/comprador.server");
    return m.cadastrarComprador(data);
  });

export const getPerfilCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await userFromToken(data.token);
    const m = await import("@/db/comprador.server");
    const res = await m.getPerfilComprador(userId);
    if (!res) return { ok: false as const, message: "Perfil não encontrado." };
    return { ok: true as const, ...res };
  });

export const salvarEtapaCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    tokenSchema.extend({ etapa: z.number().int(), dados: z.record(z.any()) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const userId = await userFromToken(data.token);
      const m = await import("@/db/comprador.server");
      const res = await m.salvarEtapaComprador(userId, data.etapa, data.dados);
      return { ok: true as const, ...(res || {}) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const enviarCadastroCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userFromToken(data.token);
      const m = await import("@/db/comprador.server");
      return await m.enviarCadastroCompradorParaAnalise(userId);
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const enviarDocumentoCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.extend({ tipo: z.string(), url: z.string() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userFromToken(data.token);
      const m = await import("@/db/comprador.server");
      await m.salvarDocumentoComprador(userId, data.tipo, data.url);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

/* ----------------- Favoritos / lembretes / notificações ----------------- */

export const alternarFavoritoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.extend({ anuncioId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userFromToken(data.token);
      const m = await import("@/db/comprador.server");
      return { ok: true as const, ...(await m.alternarFavorito(userId, data.anuncioId)) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const listarFavoritosFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userFromToken(data.token);
      const m = await import("@/db/comprador.server");
      return { ok: true as const, data: await m.listarFavoritos(userId) };
    } catch (e: any) {
      return { ok: false as const, message: e.message, data: [] as any[] };
    }
  });

export const salvarLembreteFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    tokenSchema
      .extend({ anuncioId: z.string().uuid(), lembrarEm: z.string().nullable().optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const userId = await userFromToken(data.token);
      const m = await import("@/db/comprador.server");
      await m.salvarLembrete(userId, data.anuncioId, data.lembrarEm ?? null);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const listarLembretesFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userFromToken(data.token);
      const m = await import("@/db/comprador.server");
      return { ok: true as const, data: await m.listarLembretes(userId) };
    } catch (e: any) {
      return { ok: false as const, message: e.message, data: [] as any[] };
    }
  });

export const listarNotificacoesFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userFromToken(data.token);
      const m = await import("@/db/comprador.server");
      return { ok: true as const, data: await m.listarNotificacoes(userId) };
    } catch (e: any) {
      return { ok: false as const, message: e.message, data: [] as any[] };
    }
  });

export const marcarNotificacoesLidasFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userFromToken(data.token);
      const m = await import("@/db/comprador.server");
      return await m.marcarNotificacoesLidas(userId);
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
