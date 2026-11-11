import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const marcarPerfilApagadoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({
      perfilId: z.string().uuid(),
      apagado: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { superadminDaSessao } = await import("@/lib/sessao.server");
      const superadmin = await superadminDaSessao();
      const { marcarPerfilApagado, ensureLixeiraSchema } = await import("@/db/lixeira.server");
      await ensureLixeiraSchema();
      await marcarPerfilApagado(data.perfilId, data.apagado, superadmin.id);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const marcarVeiculoApagadoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({
      veiculoId: z.string().uuid(),
      apagado: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { superadminDaSessao } = await import("@/lib/sessao.server");
      const superadmin = await superadminDaSessao();
      const { marcarVeiculoApagado, ensureLixeiraSchema } = await import("@/db/lixeira.server");
      await ensureLixeiraSchema();
      await marcarVeiculoApagado(data.veiculoId, data.apagado, superadmin.id);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
