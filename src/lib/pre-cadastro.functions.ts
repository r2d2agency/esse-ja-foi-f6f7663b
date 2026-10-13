import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function userIdFrom() {
  const { usuarioDaSessao } = await import("@/lib/sessao.server");
  return usuarioDaSessao();
}

const opcional = z.string().trim().optional();

export const criarVendedorInternoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        nome: z.string().min(3),
        email: z.string().email(),
        cpf: opcional,
        cnpj: opcional,
        rg: opcional,
        data_nascimento: opcional,
        tipo_pessoa: opcional,
        whatsapp: opcional,
        telefone: opcional,
        cep: opcional,
        endereco: opcional,
        numero: opcional,
        complemento: opcional,
        bairro: opcional,
        cidade: opcional,
        uf: opcional,
        doc_cnh_frente: z.string().nullable().optional(),
        doc_cnh_verso: z.string().nullable().optional(),
        doc_rg_frente: z.string().nullable().optional(),
        doc_rg_verso: z.string().nullable().optional(),
        doc_comprovante: z.string().nullable().optional(),
        doc_selfie: z.string().nullable().optional(),
        enviarAcesso: z.boolean().optional(),
      })
      .parse(d),
  )

  .handler(async ({ data }) => {
    try {
      const userId = await userIdFrom();
      const { criarVendedorInterno } = await import("@/db/pre-cadastro.server");
      const { enviarAcesso, ...dados } = data;
      const res = await criarVendedorInterno(dados as any, userId, {
        enviarAcesso: enviarAcesso !== false,
      });
      return { ok: true as const, ...res };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao criar o vendedor." };
    }
  });

export const reenviarSenhaTemporariaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ perfilId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { reenviarSenhaTemporaria } = await import("@/db/pre-cadastro.server");
      return { ok: true as const, ...(await reenviarSenhaTemporaria(data.perfilId)) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao reenviar a senha." };
    }
  });

export const getStatusPrimeiroAcessoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userIdFrom();
      if (!userId) return { ok: false as const, message: "Sessão expirada." };
      const { getStatusPrimeiroAcesso } = await import("@/db/pre-cadastro.server");
      return { ok: true as const, data: await getStatusPrimeiroAcesso(userId) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao carregar o primeiro acesso." };
    }
  });

export const trocarSenhaPrimeiroAcessoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({ novaSenha: z.string().min(8) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const userId = await userIdFrom();
      if (!userId) return { ok: false as const, message: "Sessão expirada." };
      const { definirNovaSenha } = await import("@/db/pre-cadastro.server");
      await definirNovaSenha(userId, data.novaSenha);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao definir a senha." };
    }
  });

export const getResumoTermoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userIdFrom();
      if (!userId) return { ok: false as const, message: "Sessão expirada." };
      const { resumoParaTermo } = await import("@/db/pre-cadastro.server");
      return { ok: true as const, data: await resumoParaTermo(userId) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao carregar o resumo." };
    }
  });
