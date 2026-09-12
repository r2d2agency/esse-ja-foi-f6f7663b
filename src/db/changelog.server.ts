import { sql } from "drizzle-orm";
import { db } from "./index";
import { changelogSeed as seedItens } from "./changelog-seed";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export const TIPOS_CHANGELOG = ["NOVIDADE", "MELHORIA", "CORRECAO", "OUTRO"] as const;
export const STATUS_CHANGELOG = ["PUBLICADO", "PLANEJADO", "EM_ANDAMENTO"] as const;
export type TipoChangelog = (typeof TIPOS_CHANGELOG)[number];
export type StatusChangelog = (typeof STATUS_CHANGELOG)[number];

let pronto = false;

export async function ensureChangelogSchema() {
  if (pronto) return;
  const d = requireDb();

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS changelog_itens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo text NOT NULL,
      descricao text,
      tipo text NOT NULL DEFAULT 'OUTRO',
      status text NOT NULL DEFAULT 'PUBLICADO',
      commit_hash text,
      autor text,
      criado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS changelog_itens_criado_em_idx ON changelog_itens (criado_em DESC)`);

  const total = rowsOf(await d.execute(sql`SELECT count(*)::int as n FROM changelog_itens`))[0]?.n ?? 0;
  if (total === 0 && Array.isArray(seedItens) && seedItens.length > 0) {
    await semearHistoricoGit();
  }

  pronto = true;
}

/**
 * Popula o changelog com o histórico real de commits (uma vez, só quando a tabela está
 * vazia) — gerado a partir de `git log` e filtrado para tirar commits sem valor de changelog
 * (autosave do editor, "Changes", "Work in progress" etc). Ver scripts que geraram
 * changelog-seed.json — refazer exige rodar o mesmo filtro de novo sobre `git log`.
 */
async function semearHistoricoGit() {
  const d = requireDb();
  for (const item of seedItens as { hash: string; data: string; titulo: string; tipo: string }[]) {
    await d.execute(sql`
      INSERT INTO changelog_itens (titulo, tipo, status, commit_hash, criado_em, atualizado_em)
      VALUES (${item.titulo}, ${item.tipo}, 'PUBLICADO', ${item.hash}, ${item.data}::timestamptz, ${item.data}::timestamptz)
    `);
  }
}

export async function listarChangelog(filtros: {
  busca?: string;
  tipo?: string;
  status?: string;
  dataInicio?: string;
  dataFim?: string;
  limit?: number;
  offset?: number;
}) {
  const d = requireDb();
  await ensureChangelogSchema();

  const condicoes = [sql`1=1`];
  if (filtros.busca) {
    const termo = `%${filtros.busca.toLowerCase()}%`;
    condicoes.push(sql`(lower(titulo) LIKE ${termo} OR lower(coalesce(descricao, '')) LIKE ${termo})`);
  }
  if (filtros.tipo) condicoes.push(sql`tipo = ${filtros.tipo}`);
  if (filtros.status) condicoes.push(sql`status = ${filtros.status}`);
  if (filtros.dataInicio) condicoes.push(sql`criado_em >= ${filtros.dataInicio}::timestamptz`);
  if (filtros.dataFim) condicoes.push(sql`criado_em <= ${filtros.dataFim}::timestamptz`);
  const where = sql.join(condicoes, sql` AND `);

  const limit = Math.min(filtros.limit ?? 50, 500);
  const offset = filtros.offset ?? 0;

  const [itensRes, totalRes, statsRes] = await Promise.all([
    d.execute(sql`
      SELECT * FROM changelog_itens WHERE ${where}
      ORDER BY criado_em DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    d.execute(sql`SELECT count(*)::int as n FROM changelog_itens WHERE ${where}`),
    d.execute(sql`SELECT status, count(*)::int as n FROM changelog_itens GROUP BY status`),
  ]);

  const stats: Record<string, number> = {};
  for (const row of rowsOf(statsRes)) stats[row.status] = row.n;

  return {
    itens: rowsOf(itensRes),
    total: rowsOf(totalRes)[0]?.n ?? 0,
    stats,
  };
}

/** Sem paginação/limite — usado só para exportar em PDF o resultado filtrado completo. */
export async function listarChangelogParaExportar(filtros: {
  busca?: string;
  tipo?: string;
  status?: string;
  dataInicio?: string;
  dataFim?: string;
}) {
  const { itens } = await listarChangelog({ ...filtros, limit: 2000, offset: 0 });
  return itens;
}

export async function criarItemChangelog(data: {
  titulo: string;
  descricao?: string;
  tipo: string;
  status: string;
  autor?: string;
}) {
  const d = requireDb();
  await ensureChangelogSchema();
  await d.execute(sql`
    INSERT INTO changelog_itens (titulo, descricao, tipo, status, autor)
    VALUES (${data.titulo}, ${data.descricao || null}, ${data.tipo}, ${data.status}, ${data.autor || null})
  `);
}

export async function atualizarItemChangelog(
  id: string,
  data: { titulo?: string; descricao?: string; tipo?: string; status?: string; autor?: string },
) {
  const d = requireDb();
  await ensureChangelogSchema();
  const sets = [];
  if (data.titulo !== undefined) sets.push(sql`titulo = ${data.titulo}`);
  if (data.descricao !== undefined) sets.push(sql`descricao = ${data.descricao}`);
  if (data.tipo !== undefined) sets.push(sql`tipo = ${data.tipo}`);
  if (data.status !== undefined) sets.push(sql`status = ${data.status}`);
  if (data.autor !== undefined) sets.push(sql`autor = ${data.autor}`);
  if (sets.length === 0) return;
  sets.push(sql`atualizado_em = now()`);
  await d.execute(sql`UPDATE changelog_itens SET ${sql.join(sets, sql`, `)} WHERE id = ${id}::uuid`);
}

export async function removerItemChangelog(id: string) {
  const d = requireDb();
  await ensureChangelogSchema();
  await d.execute(sql`DELETE FROM changelog_itens WHERE id = ${id}::uuid`);
}
