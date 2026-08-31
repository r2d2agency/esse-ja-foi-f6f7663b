import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function userIdFrom(token?: string | null) {
  if (!token) return null;
  const { verifyToken } = await import("@/db/auth.server");
  return verifyToken(token);
}

const opcional = z.string().trim().optional();

export const criarVendedorInternoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token: z.string().nullable().optional(),
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
        doc_comprovante: z.string().nullable().optional(),
        doc_selfie: z.string().nullable().optional(),
      })
      .parse(d),
  )

  .handler(async ({ data }) => {
    try {
      const criadoPor = await userIdFrom(data.token ?? null);
      const { criarVendedorInterno } = await import("@/db/pre-cadastro.server");
      const { token: _t, ...dados } = data;
      const res = await criarVendedorInterno(dados, criadoPor);
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
  .validator((d: unknown) => z.object({ token: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const userId = await userIdFrom(data.token ?? null);
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
      .object({ token: z.string().nullable().optional(), novaSenha: z.string().min(8) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const userId = await userIdFrom(data.token ?? null);
      if (!userId) return { ok: false as const, message: "Sessão expirada." };
      const { definirNovaSenha } = await import("@/db/pre-cadastro.server");
      await definirNovaSenha(userId, data.novaSenha);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao definir a senha." };
    }
  });
