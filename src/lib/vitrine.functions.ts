import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function userIdFrom(token?: string | null) {
  if (!token) return null;
  const { verifyToken } = await import("@/db/auth.server");
  return verifyToken(token);
}

export const getVitrine = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: z.string().nullable().optional() }).optional().parse(d))
  .handler(async ({ data }) => {
    const { listarAnunciosVitrine } = await import("@/db/vitrine.server");
    const userId = await userIdFrom(data?.token ?? null);
    return listarAnunciosVitrine(userId);
  });

export const getAnuncioPublico = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ slug: z.string(), token: z.string().nullable().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { getDetalheAnuncioPublico } = await import("@/db/vitrine.server");
    const userId = await userIdFrom(data.token ?? null);
    return getDetalheAnuncioPublico(data.slug, userId);
  });
