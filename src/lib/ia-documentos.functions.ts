import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TIPO_DOCUMENTO = z.enum(["cnh_frente", "cnh_verso", "crlv", "comprovante_endereco", "selfie"]);

export const listarModelosOpenAIFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const m = await import("@/db/ia-documentos.server");
    return { ok: true as const, data: await m.listarModelosOpenAI() };
  } catch (e: any) {
    return { ok: false as const, message: e?.message || "Erro ao listar modelos." };
  }
});

export const cadastrarModeloOpenAIFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ nome: z.string().trim().min(1, "Informe o nome do modelo.") }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/ia-documentos.server");
      return { ok: true as const, data: await m.cadastrarModeloOpenAI(data.nome) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao cadastrar o modelo." };
    }
  });

export const removerModeloOpenAIFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ nome: z.string().trim().min(1) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/ia-documentos.server");
      return { ok: true as const, data: await m.removerModeloOpenAI(data.nome) };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao remover o modelo." };
    }
  });

export const testarAnaliseDocumentoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        tipoDocumento: TIPO_DOCUMENTO,
        imagemUrl: z.string().url(),
        model: z.string().trim().optional(),
        prompt: z.string().trim().optional(),
        apiKey: z.string().trim().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/ia-documentos.server");
      const res = await m.testarAnaliseDocumento(data);
      return { ok: true as const, ...res };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao testar a análise." };
    }
  });
