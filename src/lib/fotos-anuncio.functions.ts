import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { detectarPlacaFoto, gerarLegendaFoto } from "../db/ia-fotos.server";

export const detectarPlacaFotoFn = createServerFn({ method: "POST" })
  .validator((data: { imagemUrl: string }) => z.object({ imagemUrl: z.string() }).parse(data))
  .handler(async ({ data }) => detectarPlacaFoto(data.imagemUrl));

export const gerarLegendaFotoFn = createServerFn({ method: "POST" })
  .validator((data: { notaBase: string; marca?: string; modelo?: string; anoModelo?: string | number }) =>
    z
      .object({
        notaBase: z.string(),
        marca: z.string().optional(),
        modelo: z.string().optional(),
        anoModelo: z.union([z.string(), z.number()]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    gerarLegendaFoto(data.notaBase, { marca: data.marca, modelo: data.modelo, anoModelo: data.anoModelo }),
  );

/** Salva/atualiza a legenda de UMA foto (mapa por URL) sem afetar as demais já salvas. */
export const salvarLegendaFotoFn = createServerFn({ method: "POST" })
  .validator((data: { veiculoId: string; fotoUrl: string; legenda: string }) =>
    z
      .object({
        veiculoId: z.string().uuid(),
        fotoUrl: z.string(),
        legenda: z.string(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const { db } = await import("@/db/index");
      const { sql } = await import("drizzle-orm");
      if (!db) throw new Error("Banco de dados indisponível");
      await db.execute(sql`
        UPDATE veiculos SET
          fotos_legendas = COALESCE(fotos_legendas, '{}'::jsonb) || jsonb_build_object(${data.fotoUrl}::text, ${data.legenda}::text),
          atualizado_em = now()
        WHERE id = ${data.veiculoId}::uuid
      `);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

/**
 * Guarda as fotos do veículo já processadas (placa coberta pela logo), prontas para
 * reaproveitar na publicação. `camadas` (opcional, mesma ordem/índice de `fotos`) guarda
 * a posição/rotação de cada camada usada em cada foto, pra reabrir o editor depois
 * exatamente do jeito que foi deixado — sem isso, reabrir sempre resetava pro padrão.
 */
export const salvarFotosProcessadasFn = createServerFn({ method: "POST" })
  .validator((data: { veiculoId: string; fotos: string[]; camadas?: (unknown[] | null)[] }) =>
    z
      .object({
        veiculoId: z.string().uuid(),
        fotos: z.array(z.string()),
        camadas: z.array(z.array(z.any()).nullable()).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const { db } = await import("@/db/index");
      const { sql } = await import("drizzle-orm");
      if (!db) throw new Error("Banco de dados indisponível");
      if (data.camadas) {
        await db.execute(sql`
          UPDATE veiculos SET
            fotos_processadas = ${JSON.stringify(data.fotos)}::jsonb,
            fotos_camadas = ${JSON.stringify(data.camadas)}::jsonb,
            atualizado_em = now()
          WHERE id = ${data.veiculoId}::uuid
        `);
      } else {
        await db.execute(sql`
          UPDATE veiculos SET fotos_processadas = ${JSON.stringify(data.fotos)}::jsonb, atualizado_em = now()
          WHERE id = ${data.veiculoId}::uuid
        `);
      }
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
