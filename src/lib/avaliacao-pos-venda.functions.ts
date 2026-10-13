import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Usuário dono do cookie de sessão, ou estoura com a mensagem de sempre. */
async function userId() {
  const { usuarioDaSessao } = await import("@/lib/sessao.server");
  const id = await usuarioDaSessao();
  if (!id) throw new Error("Sessão expirada.");
  return id;
}

export const listarAvaliacoesPosVendaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ veiculoId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data }) => {
    await userId();
    const m = await import("@/db/avaliacao-pos-venda.server");
    return { ok: true as const, data: await m.listarAvaliacoesPosVendaAdmin(data.veiculoId) };
  });
export const criarAvaliacaoPosVendaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        negociacaoId: z.string().uuid(),
        modalidade: z.enum(["INTERNA", "EXTERNA"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const id = await userId();
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
  .validator((d: unknown) => z.object({}).parse(d))
  .handler(async () => {
    const id = await userId();
    const m = await import("@/db/avaliacao-pos-venda.server");
    return { ok: true as const, data: await m.listarAvaliacoesDoComprador(id) };
  });
export const anexarCautelarCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        arquivoUrl: z.string().url(),
        arquivoNome: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await userId();
    const m = await import("@/db/avaliacao-pos-venda.server");
    return {
      ok: true as const,
      data: await m.anexarCautelarComprador(data.id, uid, data.arquivoUrl, data.arquivoNome),
    };
  });
