import { createServerFn } from "@tanstack/react-start";

export const getAnalyticsFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const m = await import("@/db/analytics.server");
    return { ok: true as const, data: await m.getAnalytics() };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "Falha ao carregar indicadores." };
  }
});

export const getPontosMapaFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const m = await import("@/db/analytics.server");
    return { ok: true as const, data: await m.getPontosMapa() };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "Falha ao carregar o mapa." };
  }
});
