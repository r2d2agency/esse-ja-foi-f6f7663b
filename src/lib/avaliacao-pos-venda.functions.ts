import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifyToken } from "@/db/auth.server";

const token = z.string().min(10);
async function userId(t: string) {
  const id = await verifyToken(t);
  if (!id) throw new Error("Sessão expirada.");
  return id;
}

export const listarAvaliacoesPosVendaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token, veiculoId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data }) => {
    await userId(data.token);
    const m = await import("@/db/avaliacao-pos-venda.server");
    return { ok: true as const, data: await m.listarAvaliacoesPosVendaAdmin(data.veiculoId) };
  });
export const criarAvaliacaoPosVendaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token,
        negociacaoId: z.string().uuid(),
        modalidade: z.enum(["INTERNA", "EXTERNA"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const id = await userId(data.token);
    const m = await import("@/db/avaliacao-pos-venda.server");
    return {
      ok: true as const,
      data: await m.criarAvaliacaoPosVenda({
        negociacaoId: data.negociacaoId,
        modalidade: data.modalidade,
        criadoPor: id,
      }),
    };
  });
export const listarAvaliacoesCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    const id = await userId(data.token);
    const m = await import("@/db/avaliacao-pos-venda.server");
    return { ok: true as const, data: await m.listarAvaliacoesDoComprador(id) };
  });
export const anexarCautelarCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token,
        id: z.string().uuid(),
        arquivoUrl: z.string().url(),
        arquivoNome: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await userId(data.token);
    const m = await import("@/db/avaliacao-pos-venda.server");
    return {
      ok: true as const,
      data: await m.anexarCautelarComprador(data.id, uid, data.arquivoUrl, data.arquivoNome),
    };
  });
