import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { detectarPlacaFoto } from "../db/ia-fotos.server";

export const detectarPlacaFotoFn = createServerFn({ method: "POST" })
  .validator((data: { imagemUrl: string }) => z.object({ imagemUrl: z.string() }).parse(data))
  .handler(async ({ data }) => detectarPlacaFoto(data.imagemUrl));

/** Guarda as fotos do veículo já processadas (placa coberta pela logo), prontas para reaproveitar na publicação. */
export const salvarFotosProcessadasFn = createServerFn({ method: "POST" })
  .validator((data: { veiculoId: string; fotos: string[] }) =>
    z.object({ veiculoId: z.string().uuid(), fotos: z.array(z.string()) }).parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const { db } = await import("@/db/index");
      const { sql } = await import("drizzle-orm");
      if (!db) throw new Error("Banco de dados indisponível");
      await db.execute(sql`
        UPDATE veiculos SET fotos_processadas = ${JSON.stringify(data.fotos)}::jsonb, atualizado_em = now()
        WHERE id = ${data.veiculoId}::uuid
      `);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
