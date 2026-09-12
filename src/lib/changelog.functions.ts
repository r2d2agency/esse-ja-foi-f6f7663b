import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TIPOS_CHANGELOG = ["NOVIDADE", "MELHORIA", "CORRECAO", "OUTRO"] as const;
const STATUS_CHANGELOG = ["PUBLICADO", "PLANEJADO", "EM_ANDAMENTO"] as const;

const filtroSchema = z.object({
  busca: z.string().optional(),
  tipo: z.enum(TIPOS_CHANGELOG).optional(),
  status: z.enum(STATUS_CHANGELOG).optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});

export const listarChangelogFn = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    filtroSchema.extend({ limit: z.number().optional(), offset: z.number().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/changelog.server");
      return { ok: true as const, ...(await m.listarChangelog(data)) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const listarChangelogParaExportarFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => filtroSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/changelog.server");
      return { ok: true as const, data: await m.listarChangelogParaExportar(data) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const criarItemChangelogFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        titulo: z.string().min(1),
        descricao: z.string().optional(),
        tipo: z.enum(TIPOS_CHANGELOG),
        status: z.enum(STATUS_CHANGELOG),
        autor: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/changelog.server");
      await m.criarItemChangelog(data);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const atualizarItemChangelogFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        titulo: z.string().optional(),
        descricao: z.string().optional(),
        tipo: z.enum(TIPOS_CHANGELOG).optional(),
        status: z.enum(STATUS_CHANGELOG).optional(),
        autor: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/changelog.server");
      const { id, ...resto } = data;
      await m.atualizarItemChangelog(id, resto);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const removerItemChangelogFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/changelog.server");
      await m.removerItemChangelog(data.id);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
