import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

async function userIdFrom(token?: string | null) {
  if (!token) return null;
  const { verifyToken } = await import("@/db/auth.server");
  return verifyToken(token);
}

const tipoTermoSchema = z.enum(["VENDEDOR", "COMPRADOR"]).optional();

export const getTermoVigenteFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ tipo: tipoTermoSchema }).optional().parse(d))
  .handler(async ({ data }) => {
    try {
      const { getTermoVigente } = await import("@/db/termos.server");
      return { ok: true as const, data: await getTermoVigente(data?.tipo || "VENDEDOR") };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao carregar o termo." };
    }
  });

export const salvarTermoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        tipo: tipoTermoSchema,
        versao: z.string().min(1),
        titulo: z.string().optional(),
        conteudo: z.string().min(20),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { salvarTermo } = await import("@/db/termos.server");
      await salvarTermo(data.tipo || "VENDEDOR", data.versao, data.conteudo, data.titulo);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao salvar o termo." };
    }
  });

export const aceitarTermoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token: z.string().nullable().optional(),
        assinatura: z.string().min(3),
        tipo: tipoTermoSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const userId = await userIdFrom(data.token ?? null);
      if (!userId) return { ok: false as const, message: "Sessão expirada." };

      let ip: string | null = null;
      let userAgent: string | null = null;
      try {
        ip =
          getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
          getRequestHeader("cf-connecting-ip") ||
          null;
        userAgent = getRequestHeader("user-agent") || null;
        if (!ip) {
          const req = getRequest();
          ip = req?.headers?.get("x-real-ip") || null;
        }
      } catch {
        /* ambiente sem request */
      }

      const { registrarAceiteTermo } = await import("@/db/termos.server");
      await registrarAceiteTermo({
        perfilId: userId,
        assinatura: data.assinatura,
        tipo: data.tipo || "VENDEDOR",
        ip,
        userAgent,
      });
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao registrar o aceite." };
    }
  });

export const getAceitePorVeiculoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ veiculoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { getAceitePorVeiculo } = await import("@/db/termos.server");
      return { ok: true as const, data: await getAceitePorVeiculo(data.veiculoId) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao carregar o aceite." };
    }
  });
