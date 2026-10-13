import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listarEventosConsultaFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({
    placa: z.string().trim().max(20).optional(),
    veiculo: z.string().trim().max(120).optional(),
    codigo: z.string().trim().max(100).optional(),
    status: z.enum(["", "PENDENTE", "PROCESSANDO", "CONCLUIDA", "ERRO", "RECEBIDA"]).optional(),
    produto: z.enum(["", "conferi-agregados", "conferi-desvalorizacao-fipe", "conferi-auto-pericia-gold"]).optional(),
    pagina: z.number().int().min(0).max(100000).default(0),
  }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { perfilDaSessao } = await import("@/lib/sessao.server");
      const usuario = await perfilDaSessao();
      if (!usuario?.ativo || usuario.role !== "admin") throw new Error("Entre com uma conta de administrador para consultar estes logs.");
      const { listarEventosConsulta } = await import("@/db/consulta-logs.server");
      return { ok: true as const, ...await listarEventosConsulta(data) };
    } catch (erro) {
      return { ok: false as const, message: erro instanceof Error ? erro.message : "Não foi possível carregar os logs de consulta." };
    }
  });
