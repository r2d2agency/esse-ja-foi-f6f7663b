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
  .validator((d: unknown) => z.object({ 
    status: z.string().optional(), 
    busca: z.string().optional() 
  }).parse(d))
  .handler(async ({ data }) => {
    await ensureSchema();
    const d = db;
    if (!d) return { ok: false, message: "DB offline" };

    const search = data.busca ? `%${data.busca.toLowerCase()}%` : null;
    const status = data.status && data.status !== "TODOS" ? data.status : null;

    // Fragmentos condicionais: evitam parâmetros sem tipo definido ($1 IS NULL),
    // que fazem o Postgres recusar a query.
    const filtroStatus = status ? sql` AND p.status_compliance = ${status}` : sql``;
    const filtroBusca = search
      ? sql` AND (lower(p.nome) LIKE ${search} OR lower(coalesce(p.cpf,'')) LIKE ${search} OR lower(coalesce(p.email,'')) LIKE ${search})`
      : sql``;
    const filtroBuscaCompleta = search
      ? sql` AND (lower(p.nome) LIKE ${search} OR lower(coalesce(p.cpf,'')) LIKE ${search} OR lower(coalesce(p.cnpj,'')) LIKE ${search} OR lower(coalesce(p.email,'')) LIKE ${search})`
      : sql``;

    try {
      const res = await d.execute(sql`
        SELECT
          p.id, p.nome, p.email, p.whatsapp, p.cpf, p.cnpj, p.tipo_pessoa,
          p.status_compliance, p.cidade, p.uf, p.atualizado_em, p.criado_em,
          p.responsavel_nome as responsavel
        FROM profiles p
        WHERE p.role::text = 'comprador'
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
        // Fallback: colunas básicas, para bancos ainda sem as colunas de compliance.
        const res = await d.execute(sql`
          SELECT p.id, p.nome, p.email, p.whatsapp, p.cpf, p.cidade, p.uf, p.criado_em
          FROM profiles p
          WHERE p.role::text = 'comprador'
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
    const comprador = (res as any).rows[0];

    if (!comprador) return { ok: false, message: "Comprador não encontrado" };

    const docsRes = await d.execute(sql`
      SELECT * FROM documentos 
      WHERE entidade = 'comprador' AND entidade_id = ${data.id}::uuid
    `);

    return { ok: true, data: { ...comprador, documentos: (docsRes as any).rows || [] } };
  });

export const aprovarCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ 
    id: z.string().uuid(),
    observacao: z.string().optional()
  }).parse(d))
  .handler(async ({ data }) => {
    await ensureSchema();
    const d = db;
    if (!d) return { ok: false, message: "DB offline" };

    await d.execute(sql`
      UPDATE profiles 
      SET status_compliance = 'APROVADO', 
          pode_ver_valores = true,
          pode_dar_lances = true,
          atualizado_em = now()
      WHERE id = ${data.id}::uuid
    `);

    return { ok: true };
  });

export const solicitarPendenciaCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ 
    id: z.string().uuid(),
    campo: z.string(),
    mensagem: z.string()
  }).parse(d))
  .handler(async ({ data }) => {
    await ensureSchema();
    const d = db;
    if (!d) return { ok: false, message: "DB offline" };

    await d.execute(sql`
      UPDATE profiles 
      SET status_compliance = 'PENDENCIA',
          compliance_motivo_pendencia = ${data.mensagem},
          atualizado_em = now()
      WHERE id = ${data.id}::uuid
    `);

    return { ok: true };
  });

export const preCadastrarCompradorFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({
    nome: z.string().min(2),
    email: z.string().email(),
    senha: z.string().min(6),
    whatsapp: z.string().optional(),
    cnpj: z.string().optional(),
    regiao: z.string().optional(),
    endereco: z.string().optional(),
    cidade: z.string().optional(),
    uf: z.string().optional(),
  }).parse(d))
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
