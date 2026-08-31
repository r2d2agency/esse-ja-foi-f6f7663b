import { sql } from "drizzle-orm";
import { db } from "./index";

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

export const TIPOS_LAUDO = ["CAUTELAR", "VISTORIA_TRANSFERENCIA", "PERICIA", "OUTRO"] as const;

export async function ensureLaudosExternosSchema() {
  const d = requireDb();
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS veiculo_laudos_externos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      tipo text NOT NULL DEFAULT 'CAUTELAR',
      fornecedor text,
      numero_laudo text,
      data_laudo date,
      resultado text,
      observacao text,
      arquivo_url text NOT NULL,
      arquivo_nome text,
      criado_por uuid,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function listarLaudosExternos(veiculoId: string) {
  const d = requireDb();
  await ensureLaudosExternosSchema();
  const res = await d.execute(sql`
    SELECT l.*, p.nome as criado_por_nome
    FROM veiculo_laudos_externos l
    LEFT JOIN profiles p ON p.id = l.criado_por
    WHERE l.veiculo_id = ${veiculoId}::uuid
    ORDER BY l.criado_em DESC
  `);
  return rowsOf(res);
}

export async function salvarLaudoExterno(data: {
  veiculo_id: string;
  tipo: string;
  fornecedor?: string | undefined;
  numero_laudo?: string | undefined;
  data_laudo?: string | undefined;
  resultado?: string | undefined;
  observacao?: string | undefined;
  arquivo_url: string;
  arquivo_nome?: string | undefined;
  criado_por?: string | null | undefined;
}) {
  const d = requireDb();
  await ensureLaudosExternosSchema();
  const row = rowsOf(
    await d.execute(sql`
      INSERT INTO veiculo_laudos_externos
        (veiculo_id, tipo, fornecedor, numero_laudo, data_laudo, resultado, observacao, arquivo_url, arquivo_nome, criado_por)
      VALUES (
        ${data.veiculo_id}::uuid, ${data.tipo}, ${data.fornecedor || null}, ${data.numero_laudo || null},
        ${data.data_laudo || null}::date, ${data.resultado || null}, ${data.observacao || null},
        ${data.arquivo_url}, ${data.arquivo_nome || null}, ${data.criado_por || null}
      )
      RETURNING id
    `),
  )[0];
  return { ok: true as const, id: String(row?.id ?? "") };
}

export async function removerLaudoExterno(id: string) {
  const d = requireDb();
  await ensureLaudosExternosSchema();
  await d.execute(sql`DELETE FROM veiculo_laudos_externos WHERE id = ${id}::uuid`);
  return { ok: true as const };
}
