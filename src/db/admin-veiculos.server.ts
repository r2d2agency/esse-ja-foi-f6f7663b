import { sql } from "drizzle-orm";
import { db } from "./index";

let pronto = false;

export async function ensureVeiculosAdminSchema() {
  if (pronto || !db) return;
  const d = db;

  // Garantir status 'AGUARDANDO_ANALISE' caso não exista
  await d.execute(sql`
    ALTER TABLE veiculos ALTER COLUMN status SET DEFAULT 'AGUARDANDO_ANALISE';
  `);
  
  // Garantir colunas de responsável e vínculos
  await d.execute(sql`
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS responsavel_analise_id uuid REFERENCES profiles(id);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS status_analise text DEFAULT 'AGUARDANDO_ANALISE';
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS perfil_id uuid REFERENCES profiles(id);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES profiles(id);
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS fotos text;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS documento_crlv_url text;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS fotos_processadas jsonb;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS fotos_camadas jsonb;
    ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS fotos_legendas jsonb;
  `);

  pronto = true;
}

export async function listarVeiculosAdmin(filtros: {
  busca?: string | null;
  status_analise?: string | null;
  marca?: string | null;
  ano_min?: number | null;
  ano_max?: number | null;
  km_max?: number | null;
  blindado?: boolean | null;
  data_inicio?: string | null;
  data_fim?: string | null;
}) {
  const d = db;
  if (!d) return [];

  const termo = filtros.busca ? `%${filtros.busca}%` : null;
  const status = filtros.status_analise;
  const marca = filtros.marca ? `%${filtros.marca}%` : null;

  const rows = await d.execute(sql`
    SELECT
      v.id, v.marca, v.modelo, v.placa, v.ano_modelo, v.valor_interesse_cliente,
      v.status_analise, v.atualizado_em, v.cor, v.km, v.criado_em, v.blindado,
      p.nome as vendedor_nome,
      p.status_compliance as compliance_status,
      resp.nome as responsavel_nome
    FROM veiculos v
    LEFT JOIN profiles p ON (p.id = v.perfil_id OR p.id = v.vendedor_id)
    LEFT JOIN profiles resp ON (resp.id = v.responsavel_analise_id)
    WHERE 1=1
      ${status ? sql`AND v.status_analise = ${status}` : sql``}
      ${termo ? sql`AND (v.placa ILIKE ${termo} OR v.marca ILIKE ${termo} OR v.modelo ILIKE ${termo} OR p.nome ILIKE ${termo})` : sql``}
      ${marca ? sql`AND v.marca ILIKE ${marca}` : sql``}
      ${filtros.ano_min ? sql`AND v.ano_modelo >= ${filtros.ano_min}` : sql``}
      ${filtros.ano_max ? sql`AND v.ano_modelo <= ${filtros.ano_max}` : sql``}
      ${filtros.km_max ? sql`AND v.km <= ${filtros.km_max}` : sql``}
      ${filtros.blindado === true ? sql`AND v.blindado = true` : sql``}
      ${filtros.blindado === false ? sql`AND v.blindado = false` : sql``}
      ${filtros.data_inicio ? sql`AND v.criado_em >= ${filtros.data_inicio}::timestamptz` : sql``}
      ${filtros.data_fim ? sql`AND v.criado_em <= ${filtros.data_fim}::timestamptz` : sql``}
    ORDER BY v.criado_em DESC
    LIMIT 100
  `);

  const veiculos = rowsOf(rows) || rows;

  return veiculos;
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
