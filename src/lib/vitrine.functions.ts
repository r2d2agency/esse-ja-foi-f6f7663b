import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function userIdFrom() {
  const { usuarioDaSessao } = await import("@/lib/sessao.server");
  return usuarioDaSessao();
}

export const getVitrine = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({}).optional().parse(d))
  .handler(async () => {
    const { listarAnunciosVitrine } = await import("@/db/vitrine.server");
    const userId = await userIdFrom();
    return listarAnunciosVitrine(userId);
  });

export const getAnuncioPublico = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ slug: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { getDetalheAnuncioPublico } = await import("@/db/vitrine.server");
    const userId = await userIdFrom();
    return getDetalheAnuncioPublico(data.slug, userId);
  });
