import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listarVeiculosAptosPublicacaoFn = createServerFn({ method: "POST" }).handler(
  async () => {
    try {
      const m = await import("@/db/publicacao.server");
      return { ok: true as const, data: await m.listarVeiculosAptosPublicacao() };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  },
);

export const getCanaisPublicacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ veiculoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/publicacao.server");
      const res = await m.getCanaisPublicacao(data.veiculoId);
      if (!res) return { ok: false as const, message: "Veículo não encontrado." };
      return { ok: true as const, data: res };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const salvarCanalPublicacaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        veiculo_id: z.string().uuid(),
        canal: z.enum(["LEILAO", "ANUNCIO", "VITRINE", "WHATSAPP"]),
        ativo: z.boolean(),
        titulo: z.string().optional(),
        descricao: z.string().optional(),
        fotos: z.array(z.string()).optional(),
      })
      .parse(d),
  )

  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/publicacao.server");
      await m.salvarCanalPublicacao(data as any);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const listarPublicadosVitrineFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const m = await import("@/db/publicacao.server");
    return { ok: true as const, data: await m.listarPublicadosVitrine() };
  } catch (e: any) {
    return { ok: false as const, message: e.message };
  }
});

export const regenerarTokenCanalFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ veiculoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/publicacao.server");
      return await m.regenerarTokenCanal(data.veiculoId, "WHATSAPP");
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const revogarTokenCanalFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ veiculoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/publicacao.server");
      return await m.revogarTokenCanal(data.veiculoId, "WHATSAPP");
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const montarMensagemWhatsappFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ veiculoId: z.string().uuid(), baseUrl: z.string().min(4) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/publicacao.server");
      return { ok: true as const, data: await m.montarMensagemWhatsapp(data.veiculoId, data.baseUrl) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const getVeiculoPorTokenFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/publicacao.server");
      const res = await m.getVeiculoPorToken(data.token);
      if (!res) return { ok: false as const, message: "Link inválido ou expirado." };
      return { ok: true as const, data: res };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
