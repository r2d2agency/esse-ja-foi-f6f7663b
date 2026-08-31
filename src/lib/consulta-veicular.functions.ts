import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function userIdFrom(token?: string | null) {
  if (!token) return null;
  const { verifyToken } = await import("@/db/auth.server");
  return verifyToken(token);
}

export const getProvedorConsultaFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const m = await import("@/db/consulta-veicular.server");
    return { ok: true as const, data: await m.getProvedorConsulta() };
  } catch (e: any) {
    return { ok: false as const, message: e?.message || "Erro ao carregar o provedor." };
  }
});

export const salvarProvedorConsultaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        nome: z.string().trim().optional(),
        base_url: z.string().url(),
        caminho_consulta: z.string().trim().optional(),
        produto: z.string().trim().optional(),
        usuario: z.string().trim().optional(),
        api_key: z.string().trim().optional(),
        ativo: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/consulta-veicular.server");
      return await m.salvarProvedorConsulta(data);
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao salvar o provedor." };
    }
  });

export const testarConexaoConsultaFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const m = await import("@/db/consulta-veicular.server");
    return await m.testarConexaoProvedor();
  } catch (e: any) {
    return { ok: false as const, message: e?.message || "Erro ao testar a conexão." };
  }
});

export const testarConsultaPlacaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ placa: z.string().trim().min(7, "Informe a placa.") }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/consulta-veicular.server");
      return await m.consultarPlacaAvulsa(data.placa);
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao consultar a placa." };
    }
  });

export const consultarLaudoVeiculoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ token: z.string().nullable().optional(), veiculoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const criadoPor = await userIdFrom(data.token ?? null);
      const m = await import("@/db/consulta-veicular.server");
      return await m.consultarLaudoVeiculo(data.veiculoId, criadoPor);
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao consultar." };
    }
  });

export const listarConsultasVeiculoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ veiculoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/consulta-veicular.server");
      return { ok: true as const, data: await m.listarConsultasVeiculo(data.veiculoId) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao listar consultas." };
    }
  });
