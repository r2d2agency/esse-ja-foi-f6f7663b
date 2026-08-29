import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getVistoriasHojeVistoriadorFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ usuarioId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { listarVistoriasHojeVistoriador } = await import("@/db/vistorias.server");
    try {
      const vistorias = await listarVistoriasHojeVistoriador(data.usuarioId);
      return { ok: true, data: vistorias };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getPainelVistoriadorFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({
    usuarioId: z.string().uuid(),
    inicio: z.string().optional().nullable(),
    fim: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    busca: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { obterPainelVistoriador } = await import("@/db/vistorias.server");
    try {
      return { ok: true as const, data: await obterPainelVistoriador(data.usuarioId, data) };
    } catch (err: any) {
      return { ok: false as const, message: err.message || "Não foi possível carregar os dados." };
    }
  });

export const alterarSenhaVistoriadorFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    usuarioId: z.string().uuid(),
    senhaAtual: z.string().min(1),
    novaSenha: z.string().min(6),
  }).parse(d))
  .handler(async ({ data }) => {
    const { alterarSenhaVistoriador } = await import("@/db/vistorias.server");
    try {
      return await alterarSenhaVistoriador(data.usuarioId, data.senhaAtual, data.novaSenha);
    } catch (err: any) {
      return { ok: false as const, message: err.message || "Não foi possível alterar a senha." };
    }
  });

export const getVistoriaDetalheVistoriadorFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ vistoriaId: z.string(), usuarioId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { getVistoriaDetalheVistoriador } = await import("@/db/vistorias.server");
    try {
      const vistoria = await getVistoriaDetalheVistoriador(data.vistoriaId, data.usuarioId);
      return { ok: true, data: vistoria };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const iniciarCheckinFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    vistoriaId: z.string(),
    usuarioId: z.string(),
    placa: z.string(),
    localizacao: z.any()
  }).parse(d))
  .handler(async ({ data }) => {
    const { iniciarCheckin } = await import("@/db/vistorias.server");
    try {
      const res = await iniciarCheckin(data);
      return res;
    } catch (err: any) {
      return { ok: false as const, message: err.message };
    }
  });

export const salvarItemChecklistFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    laudoId: z.string(),
    etapa: z.string(),
    item_chave: z.string(),
    status: z.string(),
    observacao: z.string().optional().nullable().default(null),
    foto_url: z.string().optional().nullable().default(null)
  }).parse(d))
  .handler(async ({ data }) => {
    const { salvarItemChecklist } = await import("@/db/vistorias.server");
    try {
      return await salvarItemChecklist(data);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const salvarFotoLaudoFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    laudoId: z.string(),
    tipo_foto: z.string(),
    url: z.string(),
    metadata: z.any().optional()
  }).parse(d))
  .handler(async ({ data }) => {
    const { salvarFotoLaudo } = await import("@/db/vistorias.server");
    try {
      return await salvarFotoLaudo(data);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getFotosLaudoFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ laudoId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { listarFotosLaudo } = await import("@/db/vistorias.server");
    try {
      return { ok: true as const, data: await listarFotosLaudo(data.laudoId) };
    } catch (err: any) {
      return { ok: false as const, message: err.message, data: [] };
    }
  });

export const concluirVistoriaAppFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    laudoId: z.string(),
    quilometragem: z.number(),
    observacao_geral: z.string(),
    declaracao: z.boolean()
  }).parse(d))
  .handler(async ({ data }) => {
    const { concluirVistoriaApp } = await import("@/db/vistorias.server");
    try {
      const res = await concluirVistoriaApp(data);
      return res;
    } catch (err: any) {
      return { ok: false as const, message: err.message };
    }
  });

export const getChecklistConfigFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listarChecklistConfig } = await import("@/db/vistorias.server");
    try {
      const categorias = await listarChecklistConfig();
      return { ok: true, data: categorias };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getRespostasChecklistFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ laudoId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { listarRespostasChecklistPorLaudo } = await import("@/db/vistorias.server");
    try {
      const arr = await listarRespostasChecklistPorLaudo(data.laudoId);
      return { ok: true, data: arr };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const salvarRespostaChecklistFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    laudoId: z.string(),
    vistoriaId: z.string(),
    item_id: z.string(),
    categoria_id: z.string(),
    resposta_conformidade: z.string().optional().nullable(),
    resposta_texto: z.string().optional().nullable(),
    resposta_numero: z.number().optional().nullable(),
    resposta_opcoes: z.any().optional(),
    observacao: z.string().optional().nullable(),
    foto_url: z.string().optional().nullable(),
    respondido_por: z.string().optional().nullable(),
    gps_lat: z.number().optional().nullable(),
    gps_lng: z.number().optional().nullable(),
    gps_precisao: z.number().optional().nullable(),
    registrado_em_dispositivo: z.string().optional().nullable(),
  }).parse(d))

  .handler(async ({ data }) => {
    const { salvarRespostaChecklistDinamico } = await import("@/db/vistorias.server");
    try {
      return await salvarRespostaChecklistDinamico(data as any);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });