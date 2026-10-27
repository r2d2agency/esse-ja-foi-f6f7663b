import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db, migrateDb } from "../db";
import { sql } from "drizzle-orm";

async function ensureSchema() {
  try {
    await migrateDb();
  } catch (e: any) {
    console.error("[admin-compradores] migrateDb error:", e?.message || e);
  }
}

export const listarCompradoresFn = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z
      .object({
        status: z.string().optional(),
        busca: z.string().optional(),
        tipo: z.enum(["CADASTRADOS", "WHATSAPP"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await ensureSchema();
    const d = db;
    if (!d) return { ok: false, message: "DB offline" };

    const search = data.busca ? `%${data.busca.toLowerCase()}%` : null;
    const status = data.status && data.status !== "TODOS" ? data.status : null;
    const tipo = data.tipo || "CADASTRADOS";

    const filtroStatus = status ? sql` AND p.status_compliance = ${status}` : sql``;
    const filtroBuscaCompleta = search
      ? sql` AND (lower(p.nome) LIKE ${search} OR lower(coalesce(p.cpf,'')) LIKE ${search} OR lower(coalesce(p.cnpj,'')) LIKE ${search} OR lower(coalesce(p.email,'')) LIKE ${search})`
      : sql``;
    const filtroBusca = search
      ? sql` AND (lower(p.nome) LIKE ${search} OR lower(coalesce(p.cpf,'')) LIKE ${search} OR lower(coalesce(p.email,'')) LIKE ${search})`
      : sql``;
    const filtroOrigem =
      tipo === "WHATSAPP"
        ? sql` AND (p.origem_cadastro = 'WHATSAPP' OR p.origem_cadastro IS NULL OR p.email LIKE 'whatsapp_%')`
        : sql` AND p.origem_cadastro IN ('AUTOCADASTRO', 'PRE_CADASTRO_ADMIN')`;

    try {
      const res = await d.execute(sql`
        SELECT
          p.id, p.nome, p.email, p.whatsapp, p.cpf, p.cnpj, p.tipo_pessoa,
          p.status_compliance, p.cidade, p.uf, p.atualizado_em, p.criado_em,
          p.responsavel_nome as responsavel
        FROM profiles p
        WHERE p.role::text = 'comprador'
        ${filtroOrigem}
        ${filtroStatus}
        ${filtroBuscaCompleta}
        ORDER BY p.criado_em DESC
        LIMIT 100
      `);
      const rows = Array.isArray(res) ? res : (res as any).rows || [];
      return { ok: true as const, data: rows };
    } catch (e: any) {
      console.error("[admin-compradores] listagem completa falhou:", e?.message || e);
      try {
        const res = await d.execute(sql`
          SELECT p.id, p.nome, p.email, p.whatsapp, p.cpf, p.cidade, p.uf, p.criado_em
          FROM profiles p
          WHERE p.role::text = 'comprador'
          ${filtroOrigem}
          ${filtroBusca}
          ORDER BY p.criado_em DESC
          LIMIT 100
        `);
        const rows = Array.isArray(res) ? res : (res as any).rows || [];
        return {
          ok: true as const,
          data: rows.map((r: any) => ({ ...r, status_compliance: r.status_compliance ?? "NAO_ENVIADO" })),
        };
      } catch (e2: any) {
        return { ok: false as const, message: e2?.message || "Erro ao listar compradores.", data: [] };
      }
    }
  });

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export const obterDetalheCompradorFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await ensureSchema();
    const d = db;
    if (!d) return { ok: false, message: "DB offline" };

    const res = await d.execute(sql`
      SELECT * FROM profiles
      WHERE id = ${data.id}::uuid AND role::text = 'comprador'
    `);
    const comprador = rowsOf(res)[0];

    if (!comprador) return { ok: false, message: "Comprador não encontrado" };

    try {
      const docs = await d.execute(sql`
        SELECT * FROM comprador_documentos WHERE comprador_id = ${data.id}::uuid ORDER BY criado_em ASC
      `);
      return { ok: true, comprador, documentos: rowsOf(docs) };
    } catch (e: any) {
      console.error("[admin-compradores] documentos falhou:", e?.message || e);
      return { ok: true, comprador, documentos: [] };
    }
  });

export const preCadastrarCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        nome: z.string().min(2),
        email: z.string().email(),
        senha: z.string().min(6),
        whatsapp: z.string().optional(),
        cnpj: z.string().optional(),
        regiao: z.string().optional(),
        endereco: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      await ensureSchema();
      const m = await import("@/db/comprador.server");
      return await m.preCadastrarComprador(data);
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const reprovarCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), motivo: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    await ensureSchema();
    if (!db) return { ok: false as const, message: "DB offline" };
    await db.execute(sql`
      UPDATE profiles SET status_compliance = 'REPROVADO',
        compliance_motivo_pendencia = ${data.motivo || null},
        pode_ver_valores = false, pode_dar_lances = false, atualizado_em = now()
      WHERE id = ${data.id}::uuid
    `);
    return { ok: true as const };
  });

export const aprovarCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await ensureSchema();
    if (!db) return { ok: false as const, message: "DB offline" };
    await db.execute(sql`
      UPDATE profiles
      SET status_compliance = 'APROVADO',
          compliance_motivo_pendencia = NULL,
          pode_ver_valores = true,
          pode_dar_lances = true,
          atualizado_em = now()
      WHERE id = ${data.id}::uuid
        AND role::text = 'comprador'
    `);
    return { ok: true as const };
  });

export const solicitarPendenciaCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        campo: z.string().optional(),
        mensagem: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await ensureSchema();
    if (!db) return { ok: false as const, message: "DB offline" };
    await db.execute(sql`
      UPDATE profiles
      SET status_compliance = 'PENDENCIA',
          compliance_motivo_pendencia = ${data.mensagem.trim()},
          compliance_campo_pendencia = ${data.campo || null},
          pode_ver_valores = true,
          pode_dar_lances = false,
          atualizado_em = now()
      WHERE id = ${data.id}::uuid
        AND role::text = 'comprador'
    `);
    return { ok: true as const };
  });
