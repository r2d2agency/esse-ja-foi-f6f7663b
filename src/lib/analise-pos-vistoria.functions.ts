import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getFilaAnalisePosVistoriaFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listarVistoriasConcluidasFila } = await import("@/db/analise-pos-vistoria.server");
    try {
      const data = await listarVistoriasConcluidasFila();
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getDetalheAnaliseVistoriaFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ veiculoId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { getDetalheAnaliseVistoria } = await import("@/db/analise-pos-vistoria.server");
    try {
      const res = await getDetalheAnaliseVistoria(data.veiculoId);
      return { ok: true, data: res };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const enviarPropostaVendedorFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    veiculo_id: z.string(),
    valor_referencia: z.number(),
    valor_minimo_acordado: z.number(),
    comissao_tipo: z.string(),
    comissao_valor: z.number(),
    valor_liquido_vendedor: z.number(),
    valor_minimo_interno: z.number().optional(),
    observacao_interna: z.string().optional(),
    mensagem_vendedor: z.string().optional(),
    usuario_id: z.string()
  }).parse(d))
  .handler(async ({ data }) => {
    const { enviarPropostaVendedor } = await import("@/db/analise-pos-vistoria.server");
    try {
      return await enviarPropostaVendedor(data);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const solicitarNovaVistoriaFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    veiculoId: z.string().uuid(),
    vistoriaId: z.string().uuid(),
    motivo: z.string().trim().min(5),
    usuarioId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { solicitarNovaVistoria } = await import("@/db/analise-pos-vistoria.server");
    try {
      return await solicitarNovaVistoria(data);
    } catch (err: any) {
      return { ok: false as const, message: err.message };
    }
  });

export const responderPropostaVendedorFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    veiculo_id: z.string(),
    proposta_id: z.string(),
    aceite: z.boolean(),
    motivo_recusa: z.string().optional(),
    detalhes_recusa: z.string().optional(),
    ip: z.string().optional()
  }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    const { sql } = await import("drizzle-orm");
    
    if (!db) throw new Error("Banco de dados indisponível.");
    
    try {
      const status = data.aceite ? 'ACEITA' : 'RECUSADA';
      const veiculoStatusAnalise = data.aceite ? 'PRONTO_PARA_ANUNCIO' : 'VALOR_RECUSADO';
      
      await db.execute(sql`
        UPDATE propostas_veiculo SET 
          status = ${status},
          respondido_em = now(),
          motivo_recusa = ${data.motivo_recusa || null},
          detalhes_recusa = ${data.detalhes_recusa || null},
          ip_vendedor = ${data.ip || null}
        WHERE id = ${data.proposta_id}::uuid
      `);

      await db.execute(sql`
        UPDATE veiculos SET 
          status_analise = ${veiculoStatusAnalise},
          atualizado_em = now()
        WHERE id = ${data.veiculo_id}::uuid
      `);

      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const listarPropostasPendentesVendedorFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ perfilId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { listarPropostasPendentesVendedor } = await import("@/db/analise-pos-vistoria.server");
    try {
      const res = await listarPropostasPendentesVendedor(data.perfilId);
      return { ok: true as const, data: res };
    } catch (err: any) {
      return { ok: false as const, message: err.message, data: [] as any[] };
    }
  });
