import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function mod() {
  return await import("@/db/demo.server");
}

function erro(e: any) {
  const partes = [e?.message, e?.detail, e?.hint].filter(Boolean).map((p: string) => String(p).split("\n")[0]);
  return { ok: false as const, message: partes.join(" — ") || "Erro inesperado." };
}

export const statusDemoFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    return await (await mod()).statusAmbienteDemo();
  } catch (e: any) {
    return erro(e);
  }
});

export const semearDemoFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    return await (await mod()).semearAmbienteDemo();
  } catch (e: any) {
    return erro(e);
  }
});

export const resetarChecklistDemoFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    return await (await mod()).resetarChecklistDemo();
  } catch (e: any) {
    return erro(e);
  }
});

export const aprovarChecklistDemoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ valor: z.number().optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    try {
      return await (await mod()).aprovarChecklistDemo(data.valor);
    } catch (e: any) {
      return erro(e);
    }
  });

export const criarLeilaoDemoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ horas: z.number().min(1).max(168).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    try {
      return await (await mod()).criarLeilaoDemo(data.horas ?? 24);
    } catch (e: any) {
      return erro(e);
    }
  });
