import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getVistoriasAdminFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ status: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { listarVistoriasAdmin } = await import("@/db/vistorias.server");
    try {
      const vistorias = await listarVistoriasAdmin(data);
      return { ok: true, data: vistorias };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getVeiculosAguardandoVistoriaFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getVeiculosAguardandoVistoria } = await import("@/db/vistorias.server");
    try {
      const veiculos = await getVeiculosAguardandoVistoria();
      return { ok: true, data: veiculos };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getUnidadesDisponiveisFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ cidade: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { listarUnidadesDisponiveis } = await import("@/db/vistorias.server");
    try {
      const unidades = await listarUnidadesDisponiveis(data.cidade);
      return { ok: true, data: unidades };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getVistoriadoresUnidadeFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ unidadeId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { listarVistoriadoresUnidade } = await import("@/db/vistorias.server");
    try {
      const vistoriadores = await listarVistoriadoresUnidade(data.unidadeId);
      return { ok: true, data: vistoriadores };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getSlotsUnidadeDisponiveisFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({
    unidadeId: z.string(),
    data: z.string(),
    vistoriadorId: z.string().optional().nullable(),
    nomeUnidade: z.string().optional().nullable(),
    cidadeUnidade: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { listarSlotsDisponiveisUnidade } = await import("@/db/vistorias.server");
    try {
      return await listarSlotsDisponiveisUnidade(
        data.unidadeId,
        data.data,
        data.vistoriadorId || null,
        { nomeUnidade: data.nomeUnidade || null, cidadeUnidade: data.cidadeUnidade || null }
      );
    } catch (err: any) {
      return { ok: false, message: err.message, slots: [] };
    }
  });

export const getUnidadesCadastroFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listarUnidadesVistoriaCadastro } = await import("@/db/vistorias.server");
    try {
      const unidades = await listarUnidadesVistoriaCadastro();
      return { ok: true, data: unidades };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const salvarUnidadeCadastroFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    id: z.string().optional(),
    nome: z.string().min(2),
    cnpj: z.string().optional().nullable(),
    cep: z.string().optional().nullable(),
    endereco: z.string().min(5),
    cidade: z.string().min(2),
    estado: z.string().min(2).max(2),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    horario_atendimento: z.record(z.string(), z.array(z.object({
      inicio: z.string(),
      fim: z.string(),
    }))).optional().nullable(),
    duracao_padrao_minutos: z.number().int().positive().optional().nullable(),
    intervalo_entre_vistorias_minutos: z.number().int().min(0).optional().nullable(),
    telefone: z.string().optional().nullable(),
    whatsapp: z.string().optional().nullable(),
    email: z.string().email().optional().or(z.literal("")).nullable(),
    responsavel: z.string().optional().nullable(),
    ativo: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { salvarUnidadeVistoria } = await import("@/db/vistorias.server");
    try {
      const unidade = await salvarUnidadeVistoria(data as any);
      return { ok: true, data: unidade };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getVistoriadoresCadastroFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listarVistoriadoresCadastro } = await import("@/db/vistorias.server");
    try {
      const vistoriadores = await listarVistoriadoresCadastro();
      return { ok: true, data: vistoriadores };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const salvarVistoriadorCadastroFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    usuario_id: z.string(),
    unidade_id: z.string(),
    status: z.enum(["ATIVO", "INATIVO", "BLOQUEADO"]).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { salvarVistoriadorCadastro } = await import("@/db/vistorias.server");
    try {
      const vistoriador = await salvarVistoriadorCadastro(data as any);
      return { ok: true, data: vistoriador };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const criarAgendamentoVistoriaFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    veiculo_id: z.string(),
    vendedor_id: z.string(),
    unidade_id: z.string(),
    vistoriador_id: z.string().optional().nullable(),
    data_vistoria: z.string(),
    horario_vistoria: z.string(),
    usuario_id: z.string()
  }).parse(d))
  .handler(async ({ data }) => {
    const { criarAgendamento } = await import("@/db/vistorias.server");
    try {
      return await criarAgendamento(data);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const getVistoriaVendedorFn = createServerFn({ method: "GET" })
  .validator((d) => z.object({ vendedorId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { getVistoriaVendedor } = await import("@/db/vistorias.server");
    try {
      const vistoria = await getVistoriaVendedor(data.vendedorId);
      return { ok: true, data: vistoria };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const confirmarPresencaVistoriaFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({ vistoriaId: z.string(), vendedorId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { confirmarVistoriaVendedor } = await import("@/db/vistorias.server");
    try {
      return await confirmarVistoriaVendedor(data.vistoriaId, data.vendedorId);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const remarcarAgendamentoVistoriaFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    vistoriaId: z.string(),
    novaUnidadeId: z.string(),
    novaData: z.string(),
    novoHorario: z.string(),
    usuarioId: z.string().optional().nullable(),
    vendedorId: z.string().optional().nullable(),
    permissaoAdmin: z.boolean().optional(),
    unidade_nome: z.string().optional().nullable(),
    unidade_cidade: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { remarcarAgendamentoVistoria } = await import("@/db/vistorias.server");
    try {
      return await remarcarAgendamentoVistoria(data as any);
    } catch (err: any) {
      // Debug embutido: se a vistoria "não for encontrada", roda uma busca completa de diagnóstico
      if (String(err.message || "").startsWith("Agendamento de vistoria não encontrado")) {
        try {
          const { listarVistoriasAdmin } = await import("@/db/vistorias.server");
          const ultimas = await listarVistoriasAdmin({});
          const ultimosIds = (ultimas as any)?.slice?.(0, 5)?.map((v: any) => String(v.id || "")) || [];
          const match = (ultimas as any)?.find?.((v: any) => String(v.id || "").toLowerCase() === String((data as any).vistoriaId || "").toLowerCase());
          return {
            ok: false,
            message: err.message + ` | DEBUG ultimos_5_ids_da_tabela=[${ultimosIds.join(", ")}] | match_no_listarVistoriasAdmin=${match ? "SIM (ela EXISTE na listagem mas nao no fallback remarcar) BUG!" : "NAO (realmente NAO existe na tabela, era cache stale)"}`,
          };
        } catch { /* fallback */ }
      }
      return { ok: false, message: err.message };
    }
  });
