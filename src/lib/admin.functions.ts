import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../db/index";
import { sql } from "drizzle-orm";
import { RegraNegocioError } from "../db/cadastro.server";

function requireDb() {
  if (!db) throw new RegraNegocioError("Banco de dados indisponível.", 503);
  return db;
}

export const listarVendedoresFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({
    status: z.string().optional(),
  }).optional().parse(d))
  .handler(async ({ data }) => {
    const m = await import("@/db/admin.server");
    await m.ensureAdminTables();
    try {
      return { ok: true as const, data: await m.listarVendedoresPendentes(data?.status) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const listarCompradoresFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const m = await import("@/db/admin.server");
    await m.ensureAdminTables();
    try {
      return { ok: true as const, data: await m.listarCompradores() };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const listarUsuariosInternosFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({
    role: z.enum(["admin", "operacao", "vistoriador"]).optional(),
  }).optional().parse(d))
  .handler(async ({ data }) => {
    const m = await import("@/db/admin.server");
    await m.ensureAdminTables();
    try {
      return { ok: true as const, data: await m.listarUsuariosInternos(data?.role) };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const checkSystemHealthFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const m = await import("@/db/admin.server");
    try {
      return { ok: true as const, data: await m.checkSystemHealth() };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const gerenciarUsuarioFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ 
    id: z.string().uuid().optional(), 
    nome: z.string().optional(),
    email: z.string().email().optional(),
    whatsapp: z.string().optional(),
    role: z.enum(['admin', 'operacao', 'vistoriador', 'comprador', 'vendedor']).optional(),
    password: z.string().optional(),
    ativo: z.boolean().optional() 
  }).parse(d))
  .handler(async ({ data }) => {
    const m = await import("@/db/admin.server");
    try {
      if (data.id) {
        await m.alterarStatusUsuario(data.id, data.ativo ?? true);
        if (data.nome || data.email || data.role || data.password) {
          await m.atualizarUsuario(data);
        }
      } else {
        if (!data.email || !data.password || !data.role) throw new Error("Dados incompletos para novo usuário.");
        await m.criarUsuario(data);
      }
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });


export const excluirPerfilFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const m = await import("@/db/admin.server");
    try {
      await m.excluirPerfil(data.id);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const listarConfiguracoesFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const m = await import("@/db/admin.server");
    await m.ensureAdminTables();
    try {
      return { ok: true as const, data: await m.listarConfiguracoes() };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const salvarConfiguracaoFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ chave: z.string(), valor: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const m = await import("@/db/admin.server");
    try {
      await m.salvarConfiguracao(data.chave, data.valor);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const enviarEmailTesteFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data }) => {
    const m = await import("@/db/mail.server");
    try {
      await m.enviarEmailTeste(data.email);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });


export const listarRegrasDepreciacaoFn = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const m = await import("@/db/admin.server");
      await m.ensureAdminTables();
      const d = requireDb();

      const regras = await d.execute(sql`
        SELECT r.*, i.titulo as item_titulo, i.categoria as item_categoria
        FROM depreciacao_regras r
        LEFT JOIN checklist_itens i ON i.id = r.item_id
        ORDER BY i.categoria, i.titulo
      `);
      const itens = await d.execute(sql`
        SELECT i.id, i.titulo, i.categoria, m.nome as modelo_nome
        FROM checklist_itens i
        JOIN checklist_modelos m ON m.id = i.modelo_id
        WHERE m.ativo = true
        ORDER BY i.categoria, i.titulo
      `);
      return { ok: true, data: (regras as any).rows || regras, itens: (itens as any).rows || itens };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  });

export const salvarRegraDepreciacaoFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    id: z.string().optional(),
    itemId: z.string().nullable(),
    resposta: z.string().nullable(),
    tipoDesconto: z.enum(["PERCENTUAL", "VALOR"]),
    valor: z.number(),
    fatorLeve: z.number(),
    fatorMedia: z.number(),
    fatorGrave: z.number(),
    ativo: z.boolean(),
  }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/admin.server");
      await m.ensureAdminTables();
      const d = requireDb();

      if (data.id) {
        await d.execute(sql`
          UPDATE depreciacao_regras SET
            item_id = ${data.itemId},
            resposta = ${data.resposta},
            tipo_desconto = ${data.tipoDesconto},
            valor = ${data.valor},
            fator_leve = ${data.fatorLeve},
            fator_media = ${data.fatorMedia},
            fator_grave = ${data.fatorGrave},
            ativo = ${data.ativo}
          WHERE id = ${data.id}::uuid
        `);
      } else {
        await d.execute(sql`
          INSERT INTO depreciacao_regras (item_id, resposta, tipo_desconto, valor, fator_leve, fator_media, fator_grave, ativo)
          VALUES (${data.itemId}, ${data.resposta}, ${data.tipoDesconto}, ${data.valor}, ${data.fatorLeve}, ${data.fatorMedia}, ${data.fatorGrave}, ${data.ativo})
        `);
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  });

export const duplicarRegraDepreciacaoFn = createServerFn({ method: "POST" })
  .validator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const m = await import("@/db/admin.server");
      await m.ensureAdminTables();
      const d = requireDb();

      await d.execute(sql`
        INSERT INTO depreciacao_regras (item_id, resposta, tipo_desconto, valor, fator_leve, fator_media, fator_grave, ativo)
        SELECT item_id, resposta, tipo_desconto, valor, fator_leve, fator_media, fator_grave, ativo
        FROM depreciacao_regras WHERE id = ${data.id}::uuid
      `);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  });
