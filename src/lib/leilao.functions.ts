import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { 
  ensureLeilaoSchema, 
  configurarLeilao, 
  registrarLance, 
  getEstadoLeilao, 
  processarCicloLeiloes,
  listarLeiloesAdmin
} from "../db/leilao.server";

export const initLeilaoModule = createServerFn({ method: "POST" })
  .handler(async () => {
    await ensureLeilaoSchema();
    return { success: true };
  });

export const getLeilaoInfo = createServerFn({ method: "GET" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: leilaoId }) => {
    try {
      await processarCicloLeiloes();
    } catch (e) {
      console.error("[leilao] ciclo", e);
    }
    const info = await getEstadoLeilao(leilaoId);
    if (!info) return null;
    return info;
  });

export const darLanceFn = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({
    leilaoId: z.string().uuid(),
    valor: z.number().positive("O valor do lance deve ser maior que zero."),
    token: z.string().min(10)
  }).parse(data))
  .handler(async ({ data }) => {
    const { verifyToken } = await import("@/db/auth.server");
    const compradorId = await verifyToken(data.token);
    if (!compradorId) throw new Error("Sessão expirada. Faça login novamente.");
    return registrarLance(data.leilaoId, compradorId, data.valor, "unknown", "unknown");
  });

export const salvarConfiguracaoLeilao = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({
    anuncio_id: z.string().uuid(),
    inicio_em: z.string(),
    fim_em: z.string(),
    lance_inicial: z.number(),
    incremento_minimo: z.number(),
    prorrogacao_ativa: z.boolean(),
    prorrogacao_janela_segundos: z.number(),
    prorrogacao_tempo_segundos: z.number(),
  }).parse(data))
  .handler(async ({ data }) => {
    return configurarLeilao(data);
  });

export const getLeiloesAdmin = createServerFn({ method: "GET" })
  .validator((status: string | undefined) => z.string().optional().parse(status))
  .handler(async ({ data: status }) => {
    return listarLeiloesAdmin(status);
  });

export const getLeilaoVeiculoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ veiculoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { getLeilaoPorVeiculo } = await import("@/db/leilao.server");
      return { ok: true as const, data: await getLeilaoPorVeiculo(data.veiculoId) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao carregar leilão." };
    }
  });

export const salvarLeilaoVeiculoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        veiculo_id: z.string().uuid(),
        inicio_em: z.string().min(1),
        fim_em: z.string().min(1),
        lance_inicial: z.number(),
        incremento_minimo: z.number(),
        prorrogacao_ativa: z.boolean().optional(),
        prorrogacao_janela_segundos: z.number().optional(),
        prorrogacao_tempo_segundos: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { salvarLeilaoVeiculo } = await import("@/db/leilao.server");
      return { ok: true as const, data: await salvarLeilaoVeiculo(data) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao salvar leilão." };
    }
  });
