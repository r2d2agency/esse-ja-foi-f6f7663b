import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Busca o valor FIPE de um veículo já cadastrado, pela API pública da fipeX. */
export const buscarPrecoFipeVeiculoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ veiculoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { db } = await import("@/db/index");
      const { sql } = await import("drizzle-orm");
      if (!db) throw new Error("Banco de dados indisponível.");

      const rows = (await db.execute(sql`
        SELECT marca, modelo, versao, ano_modelo, ano_fabricacao, combustivel
        FROM veiculos WHERE id = ${data.veiculoId} LIMIT 1;
      `)) as unknown as Array<{
        marca: string;
        modelo: string;
        versao: string | null;
        ano_modelo: string | null;
        ano_fabricacao: string | null;
        combustivel: string | null;
      }>;
      const veiculo = rows[0];
      if (!veiculo) return { ok: false as const, message: "Veículo não encontrado." };

      const { buscarPrecoFipe } = await import("@/db/fipe.server");
      const resultado = await buscarPrecoFipe({
        marca: veiculo.marca,
        modelo: veiculo.modelo,
        versao: veiculo.versao,
        anoModelo: veiculo.ano_modelo,
        anoFabricacao: veiculo.ano_fabricacao,
        combustivel: veiculo.combustivel,
      });
      return { ok: true as const, data: resultado };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao consultar a FIPE." };
    }
  });
