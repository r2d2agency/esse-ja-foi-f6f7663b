import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Pré-cadastro público de comprador — o link enviado na campanha.
 *
 * Sem sessão: quem abre o link é um Guest. O servidor grava o cookie de
 * sessão no mesmo ato, então o comprador entra logado e já com acesso
 * parcial (vê os veículos, não dá lances).
 */
export const criarPreCadastroPublicoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        razao_social: z.string().trim().min(2, "Informe o nome da empresa."),
        cnpj: z.string().trim().min(1, "Informe o CNPJ."),
        cep: z.string().trim().optional(),
        endereco: z.string().trim().min(3, "Informe o endereço."),
        numero: z.string().trim().optional(),
        complemento: z.string().trim().optional(),
        bairro: z.string().trim().optional(),
        cidade: z.string().trim().min(2, "Informe a cidade."),
        uf: z.string().trim().min(2, "Informe o estado."),
        responsavel_nome: z.string().trim().min(3, "Informe o nome do responsável."),
        responsavel_cpf: z.string().trim().optional(),
        responsavel_whatsapp: z.string().trim().min(8, "Informe o WhatsApp do responsável."),
        email: z.string().trim().email("Informe um e-mail válido."),
        senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
        assinatura: z.string().trim().min(3, "Digite seu nome completo como assinatura."),
        aceiteTermo: z.literal(true, { message: "É preciso aceitar o termo de uso." }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      let ip: string | null = null;
      let userAgent: string | null = null;
      try {
        ip =
          getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
          getRequestHeader("cf-connecting-ip") ||
          null;
        userAgent = getRequestHeader("user-agent") || null;
        if (!ip) {
          const req = getRequest();
          ip = req?.headers?.get("x-real-ip") || null;
        }
      } catch {
        /* ambiente sem request */
      }

      const { criarPreCadastroPublico } = await import("@/db/comprador-pre-cadastro.server");
      return await criarPreCadastroPublico({ ...data, ip, userAgent });
    } catch (e: any) {
      if (e?.issues?.length) {
        return { ok: false as const, message: e.issues[0]?.message || "Dados inválidos." };
      }
      return { ok: false as const, message: e?.message || "Erro ao criar o cadastro." };
    }
  });
