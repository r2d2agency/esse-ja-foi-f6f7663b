import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getChecklistConfigAdminFn = createServerFn({ method: "POST" })
  .handler(async () => {
    const { listarChecklistConfig } = await import("@/db/vistorias.server");
    try {
      const categorias = await listarChecklistConfig();
      return { ok: true, data: categorias };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const adminCriarCategoriaFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    nome: z.string().min(2, "Nome obrigatório (mín. 2 caracteres)"),
    descricao: z.string().optional().nullable(),
    ordem: z.number().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { adminCriarCategoriaChecklist } = await import("@/db/vistorias.server");
    try {
      return await adminCriarCategoriaChecklist(data as any);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const adminAtualizarCategoriaFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    id: z.string(),
    nome: z.string().optional(),
    descricao: z.string().optional().nullable(),
    ordem: z.number().optional().nullable(),
    ativo: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { adminAtualizarCategoriaChecklist } = await import("@/db/vistorias.server");
    try {
      return await adminAtualizarCategoriaChecklist(data as any);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const adminExcluirCategoriaFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { adminExcluirCategoriaChecklist } = await import("@/db/vistorias.server");
    try {
      return await adminExcluirCategoriaChecklist(data.id);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const adminCriarItemFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    categoria_id: z.string(),
    titulo: z.string().min(2, "Título obrigatório (mín. 2 caracteres)"),
    descricao_ajuda: z.string().optional().nullable(),
    tipo_item: z.enum(["CONFORMIDADE", "TEXTO_LIVRE", "NUMERO", "CHECKBOX_MULTIPLO", "SELECT_UNICO"]).default("CONFORMIDADE"),
    opcoes: z.any().optional(),
    obrigatorio: z.boolean().optional(),
    foto_obrigatoria: z.boolean().optional(),
    permite_observacao: z.boolean().optional(),
    ordem: z.number().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { adminCriarItemChecklist } = await import("@/db/vistorias.server");
    try {
      return await adminCriarItemChecklist(data as any);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const adminAtualizarItemFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    id: z.string(),
    categoria_id: z.string().optional(),
    titulo: z.string().optional(),
    descricao_ajuda: z.string().optional().nullable(),
    tipo_item: z.enum(["CONFORMIDADE", "TEXTO_LIVRE", "NUMERO", "CHECKBOX_MULTIPLO", "SELECT_UNICO"]).optional(),
    opcoes: z.any().optional(),
    obrigatorio: z.boolean().optional(),
    foto_obrigatoria: z.boolean().optional(),
    permite_observacao: z.boolean().optional(),
    ordem: z.number().optional(),
    ativo: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { adminAtualizarItemChecklist } = await import("@/db/vistorias.server");
    try {
      return await adminAtualizarItemChecklist(data as any);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const adminExcluirItemFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { adminExcluirItemChecklist } = await import("@/db/vistorias.server");
    try {
      return await adminExcluirItemChecklist(data.id);
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  });

export const listarTemplatesChecklistFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listarTemplatesChecklist } = await import("@/db/vistorias.server");
    try {
      return { ok: true as const, data: listarTemplatesChecklist() };
    } catch (err: any) {
      return { ok: false as const, message: err.message };
    }
  });

export const aplicarTemplateChecklistFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({ templateId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { aplicarTemplateChecklist } = await import("@/db/vistorias.server");
    try {
      return await aplicarTemplateChecklist(data.templateId);
    } catch (err: any) {
      return { ok: false as const, message: err.message };
    }
  });
