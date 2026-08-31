import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function userIdFrom(token?: string | null) {
  if (!token) return null;
  const { verifyToken } = await import("@/db/auth.server");
  return verifyToken(token);
}

export const listarLaudosExternosFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ veiculoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/laudos-externos.server");
      return { ok: true as const, data: await m.listarLaudosExternos(data.veiculoId) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao listar laudos." };
    }
  });

export const salvarLaudoExternoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token: z.string().nullable().optional(),
        veiculo_id: z.string().uuid(),
        tipo: z.string().default("CAUTELAR"),
        fornecedor: z.string().trim().optional(),
        numero_laudo: z.string().trim().optional(),
        data_laudo: z.string().trim().optional(),
        resultado: z.string().trim().optional(),
        observacao: z.string().trim().optional(),
        arquivo_url: z.string().min(5),
        arquivo_nome: z.string().trim().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const criadoPor = await userIdFrom(data.token ?? null);
      const m = await import("@/db/laudos-externos.server");
      const { token: _t, ...resto } = data;
      return await m.salvarLaudoExterno({ ...resto, criado_por: criadoPor });
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao salvar o laudo." };
    }
  });

export const removerLaudoExternoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/laudos-externos.server");
      return await m.removerLaudoExterno(data.id);
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao remover o laudo." };
    }
  });
