import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { migrateDb } from "@/db";

/**
 * Esquema-base de cada ação. A sessão vem do cookie httpOnly
 * (`usuarioDaSessao`), então nenhuma ação recebe `token` do cliente — antes cada
 * validator exigia um campo que o servidor nem precisava e que o navegador
 * tirava do `localStorage`, muitas vezes vencido.
 */
const tokenSchema = z.object({});

async function ensureSchema() {
  try {
    await migrateDb();
  } catch (e: any) {
    console.error("[comprador.functions] migrateDb error:", e?.message || e);
  }
}

/** Usuário dono do cookie de sessão, ou estoura com a mensagem de sempre. */
async function userFromToken() {
  const { usuarioDaSessao } = await import("@/lib/sessao.server");
  const userId = await usuarioDaSessao();
  if (!userId) throw new Error("Sessão expirada. Faça login novamente.");
  return userId;
}

export const cadastrarCompradorFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        nome: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        whatsapp: z.string().optional(),
        cnpj: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await ensureSchema();
    const m = await import("@/db/comprador.server");
    return m.cadastrarComprador(data);
  });

export const getPerfilCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    await ensureSchema();
    const userId = await userFromToken();
    const m = await import("@/db/comprador.server");
    const res = await m.getPerfilComprador(userId);
    if (!res) return { ok: false as const, message: "Perfil não encontrado." };
    return { ok: true as const, ...res };
  });

export const salvarEtapaCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    tokenSchema.extend({ etapa: z.number().int(), dados: z.record(z.string(), z.any()) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      await ensureSchema();
      const userId = await userFromToken();
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
      await ensureSchema();
      const userId = await userFromToken();
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
      await ensureSchema();
      const userId = await userFromToken();
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
      await ensureSchema();
      const userId = await userFromToken();
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
      await ensureSchema();
      const userId = await userFromToken();
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
      await ensureSchema();
      const userId = await userFromToken();
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
      await ensureSchema();
      const userId = await userFromToken();
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
      await ensureSchema();
      const userId = await userFromToken();
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
      await ensureSchema();
      const userId = await userFromToken();
      const m = await import("@/db/comprador.server");
      return await m.marcarNotificacoesLidas(userId);
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

/* ----------------------------- Interesses ----------------------------- */

export const getInteressesFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      await ensureSchema();
      const userId = await userFromToken();
      const { db } = await import("@/db/index");
      const { sql } = await import("drizzle-orm");
      if (!db) return {};
      const res: any = await db.execute(sql`
        SELECT interesses_veiculos, interesses_marcas, pode_receber_comunicacoes
        FROM profiles WHERE id = ${userId}::uuid
      `);
      const rows = Array.isArray(res) ? res : res?.rows || [];
      return rows[0] || {};
    } catch {
      return {};
    }
  });

export const updateInteressesFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    tokenSchema
      .extend({
        veiculos: z.array(z.string()).default([]),
        marcas: z.array(z.string()).default([]),
        receberWhatsApp: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      await ensureSchema();
      const userId = await userFromToken();
      const { db } = await import("@/db/index");
      const { sql } = await import("drizzle-orm");
      if (!db) return { ok: false as const, message: "DB offline" };
      await db.execute(sql`
        UPDATE profiles SET
          interesses_veiculos = ${JSON.stringify(data.veiculos)}::jsonb,
          interesses_marcas = ${JSON.stringify(data.marcas)}::jsonb,
          pode_receber_comunicacoes = ${data.receberWhatsApp},
          atualizado_em = now()
        WHERE id = ${userId}::uuid
      `);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
