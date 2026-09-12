import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getVeiculosAdminFn = createServerFn({ method: "GET" })
  .validator(z.object({
    busca: z.string().optional(),
    status_analise: z.string().optional(),
    marca: z.string().optional(),
    ano_min: z.number().optional(),
    ano_max: z.number().optional(),
    km_max: z.number().optional(),
    blindado: z.enum(["SIM", "NAO"]).optional(),
    data_inicio: z.string().optional(),
    data_fim: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { listarVeiculosAdmin, ensureVeiculosAdminSchema } = await import("@/db/admin-veiculos.server");
    await ensureVeiculosAdminSchema();
    const veiculos = await listarVeiculosAdmin({
      busca: data.busca ?? null,
      status_analise: data.status_analise ?? null,
      marca: data.marca ?? null,
      ano_min: data.ano_min ?? null,
      ano_max: data.ano_max ?? null,
      km_max: data.km_max ?? null,
      blindado: data.blindado === "SIM" ? true : data.blindado === "NAO" ? false : null,
      data_inicio: data.data_inicio ?? null,
      data_fim: data.data_fim ?? null,
    });
    return { ok: true as const, data: veiculos };
  });

export const assumirAnaliseVeiculoFn = createServerFn({ method: "POST" })
  .validator(z.object({
    veiculoId: z.string().uuid(),
    responsavelId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    const { sql } = await import("drizzle-orm");
    if (!db) throw new Error("Banco de dados indisponível");

    // Verificar se já tem responsável
    const existing = await db.execute(sql`
      SELECT responsavel_analise_id FROM veiculos WHERE id = ${data.veiculoId}::uuid
    `);
    const row = (existing as any).rows?.[0] || (existing as any)[0];
    
    if (row?.responsavel_analise_id && row.responsavel_analise_id !== data.responsavelId) {
      return { ok: false as const, message: "Outro usuário já assumiu esta análise." };
    }

    await db.execute(sql`
      UPDATE veiculos 
      SET 
        responsavel_analise_id = ${data.responsavelId}::uuid,
        status_analise = 'EM_ANALISE',
        atualizado_em = now()
      WHERE id = ${data.veiculoId}::uuid
    `);

    return { ok: true as const };
  });
