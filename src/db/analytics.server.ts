import { sql } from "drizzle-orm";
import { db } from "./index";

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    if (!db) return fallback;
    return await fn();
  } catch (error) {
    console.error("[analytics]", (error as Error)?.message);
    return fallback;
  }
}

export type SerieMes = { mes: string; total: number; valor?: number };
export type Fatia = { nome: string; total: number };

/** Série dos últimos 12 meses de uma tabela pela coluna criado_em. */
async function serieMensal(tabela: string, filtro = ""): Promise<SerieMes[]> {
  return safe(async () => {
    const q = sql.raw(`
      SELECT to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes, count(*)::int AS total
      FROM ${tabela}
      WHERE criado_em >= date_trunc('month', now()) - interval '11 months'
      ${filtro ? `AND ${filtro}` : ""}
      GROUP BY 1 ORDER BY 1
    `);
    return rowsOf(await db!.execute(q)).map((r: any) => ({
      mes: String(r.mes),
      total: Number(r.total ?? 0),
    }));
  }, [] as SerieMes[]);
}

export async function getAnalytics() {
  const [veiculosMes, vistoriasMes, lancesMes, compradoresMes] = await Promise.all([
    serieMensal("veiculos"),
    serieMensal("vistorias"),
    serieMensal("lances"),
    serieMensal("profiles", "role::text = 'comprador'"),
  ]);

  const vendasMes = await safe(async () => {
    const r = await db!.execute(sql`
      SELECT to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes,
             count(*)::int AS total,
             COALESCE(SUM(valor_venda), 0)::numeric AS valor
      FROM negociacoes
      WHERE status = 'CONCLUIDA' AND criado_em >= date_trunc('month', now()) - interval '11 months'
      GROUP BY 1 ORDER BY 1
    `);
    return rowsOf(r).map((x: any) => ({ mes: String(x.mes), total: Number(x.total ?? 0), valor: Number(x.valor ?? 0) }));
  }, [] as SerieMes[]);

  const veiculosPorStatus = await safe(async () => {
    const r = await db!.execute(sql`
      SELECT COALESCE(status, 'INDEFINIDO') AS nome, count(*)::int AS total
      FROM veiculos GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    `);
    return rowsOf(r).map((x: any) => ({ nome: String(x.nome), total: Number(x.total ?? 0) }));
  }, [] as Fatia[]);

  const topMarcas = await safe(async () => {
    const r = await db!.execute(sql`
      SELECT COALESCE(marca, 'N/D') AS nome, count(*)::int AS total
      FROM veiculos GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    `);
    return rowsOf(r).map((x: any) => ({ nome: String(x.nome), total: Number(x.total ?? 0) }));
  }, [] as Fatia[]);

  const porUf = await safe(async () => {
    const r = await db!.execute(sql`
      SELECT COALESCE(NULLIF(upper(uf), ''), 'N/D') AS nome, count(*)::int AS total
      FROM veiculos GROUP BY 1 ORDER BY 2 DESC LIMIT 12
    `);
    return rowsOf(r).map((x: any) => ({ nome: String(x.nome), total: Number(x.total ?? 0) }));
  }, [] as Fatia[]);

  const resumo = await safe(async () => {
    const r = await db!.execute(sql`
      SELECT
        (SELECT count(*)::int FROM veiculos) AS veiculos,
        (SELECT count(*)::int FROM profiles WHERE role::text = 'vendedor') AS vendedores,
        (SELECT count(*)::int FROM profiles WHERE role::text = 'comprador') AS compradores,
        (SELECT count(*)::int FROM lances) AS lances
    `);
    return rowsOf(r)[0] ?? {};
  }, {} as any);

  const leiloes = await safe(async () => {
    const r = await db!.execute(sql`
      SELECT COALESCE(status, 'N/D') AS nome, count(*)::int AS total
      FROM leiloes GROUP BY 1 ORDER BY 2 DESC
    `);
    return rowsOf(r).map((x: any) => ({ nome: String(x.nome), total: Number(x.total ?? 0) }));
  }, [] as Fatia[]);

  return {
    resumo: {
      veiculos: Number(resumo.veiculos ?? 0),
      vendedores: Number(resumo.vendedores ?? 0),
      compradores: Number(resumo.compradores ?? 0),
      lances: Number(resumo.lances ?? 0),
    },
    veiculosMes,
    vistoriasMes,
    lancesMes,
    compradoresMes,
    vendasMes,
    veiculosPorStatus,
    topMarcas,
    porUf,
    leiloes,
  };
}

export type PontoMapa = {
  id: string;
  tipo: "comprador" | "vendedor" | "unidade";
  nome: string;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
};

export async function getPontosMapa(): Promise<PontoMapa[]> {
  const pessoas = await safe(async () => {
    const r = await db!.execute(sql`
      SELECT id::text AS id, role::text AS tipo, COALESCE(nome, email) AS nome,
             cidade, uf, endereco
      FROM profiles
      WHERE role::text IN ('comprador', 'vendedor')
      ORDER BY criado_em DESC
      LIMIT 2000
    `);
    return rowsOf(r).map((x: any) => ({
      id: String(x.id),
      tipo: x.tipo === "vendedor" ? ("vendedor" as const) : ("comprador" as const),
      nome: String(x.nome ?? "Sem nome"),
      cidade: x.cidade ?? null,
      uf: x.uf ?? null,
      endereco: x.endereco ?? null,
      latitude: null,
      longitude: null,
    }));
  }, [] as PontoMapa[]);

  const unidades = await safe(async () => {
    const r = await db!.execute(sql`
      SELECT id::text AS id, nome, cidade, estado AS uf, endereco, latitude, longitude
      FROM unidades_vistoria
      WHERE COALESCE(ativo, true) = true
      LIMIT 500
    `);
    return rowsOf(r).map((x: any) => ({
      id: String(x.id),
      tipo: "unidade" as const,
      nome: String(x.nome ?? "Unidade"),
      cidade: x.cidade ?? null,
      uf: x.uf ?? null,
      endereco: x.endereco ?? null,
      latitude: x.latitude != null ? Number(x.latitude) : null,
      longitude: x.longitude != null ? Number(x.longitude) : null,
    }));
  }, [] as PontoMapa[]);

  return [...unidades, ...pessoas];
}
