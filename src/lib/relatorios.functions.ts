import { createServerFn } from "@tanstack/react-start";
import { getRelatoriosGerais, getRelatoriosVendas } from "@/db/relatorios.server";
import { z } from "zod";

const FilterSchema = z.object({
  dataInicio: z.string().nullable().optional(),
  dataFim: z.string().nullable().optional(),
});


export const getRelatoriosGeraisFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => FilterSchema.parse(data))
  .handler(async ({ data }) => {

    try {
      const res = await getRelatoriosGerais({
        dataInicio: data.dataInicio ?? null,
        dataFim: data.dataFim ?? null
      });

      return { ok: true as const, data: res };

    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const getRelatoriosVendasFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => FilterSchema.parse(data))
  .handler(async ({ data }) => {

    try {
      const res = await getRelatoriosVendas({
        dataInicio: data.dataInicio ?? null,
        dataFim: data.dataFim ?? null
      });

      return { ok: true as const, data: res };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const getRelatorioComissoesFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const m = await import("@/db/relatorios.server");
    return { ok: true as const, data: await m.getRelatorioComissoes() };
  } catch (e: any) {
    return { ok: false as const, message: e.message };
  }
});

export const getComissaoPadraoFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const m = await import("@/db/relatorios.server");
    return { ok: true as const, percentual: await m.getComissaoPadrao() };
  } catch {
    return { ok: false as const, percentual: 5 };
  }
});

export const setComissaoPadraoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ percentual: z.number().min(0).max(100) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/relatorios.server");
      await m.setComissaoPadrao(data.percentual);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
