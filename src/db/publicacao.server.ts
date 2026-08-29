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

export const CANAIS = ["LEILAO", "ANUNCIO", "VITRINE"] as const;
export type Canal = (typeof CANAIS)[number];

/** Veículo só pode ser publicado depois de aprovado na análise pós-vistoria. */
export const STATUS_APTOS = ["PRONTO_PARA_ANUNCIO", "ANUNCIADO", "EM_LEILAO"];

export async function ensurePublicacaoSchema() {
  const d = requireDb();
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS publicacao_canais (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      canal text NOT NULL,
      ativo boolean DEFAULT false,
      titulo text,
      descricao text,
      fotos jsonb DEFAULT '[]',
      atualizado_em timestamptz DEFAULT now(),
      UNIQUE (veiculo_id, canal)
    );
  `);
}

export async function listarVeiculosAptosPublicacao() {
  const d = requireDb();
  await ensurePublicacaoSchema();
  const res = await d.execute(sql`
    SELECT
      v.id, v.placa, v.marca, v.modelo, v.versao, v.ano_fabricacao, v.ano_modelo,
      v.km, v.cor, v.cidade, v.uf, v.status_analise, v.valor_fipe,
      COALESCE(
        (SELECT json_agg(json_build_object('canal', pc.canal, 'ativo', pc.ativo))
         FROM publicacao_canais pc WHERE pc.veiculo_id = v.id), '[]'
      ) as canais
    FROM veiculos v
    WHERE v.status_analise = ANY(${STATUS_APTOS})
    ORDER BY v.atualizado_em DESC NULLS LAST
    LIMIT 200
  `);
  return rowsOf(res);
}

export async function getCanaisPublicacao(veiculoId: string) {
  const d = requireDb();
  await ensurePublicacaoSchema();

  const vRes = await d.execute(sql`
    SELECT id, placa, marca, modelo, versao, ano_fabricacao, ano_modelo, km, cor,
           cidade, uf, status_analise, fotos, valor_fipe
    FROM veiculos WHERE id = ${veiculoId}::uuid
  `);
  const veiculo = rowsOf(vRes)[0];
  if (!veiculo) return null;

  const apto = STATUS_APTOS.includes(veiculo.status_analise);

  const cRes = await d.execute(sql`
    SELECT canal, ativo, titulo, descricao, fotos, atualizado_em
    FROM publicacao_canais WHERE veiculo_id = ${veiculoId}::uuid
  `);
  const existentes = rowsOf(cRes);

  const canais = CANAIS.map((canal) => {
    const found = existentes.find((c) => c.canal === canal);
    return (
      found || {
        canal,
        ativo: false,
        titulo: `${veiculo.marca} ${veiculo.modelo} ${veiculo.ano_modelo}`,
        descricao: "",
        fotos: [],
      }
    );
  });

  return { veiculo, apto, canais };
}

export async function salvarCanalPublicacao(data: {
  veiculo_id: string;
  canal: Canal;
  ativo: boolean;
  titulo?: string;
  descricao?: string;
  fotos?: string[];
}) {
  const d = requireDb();
  await ensurePublicacaoSchema();

  const vRes = await d.execute(
    sql`SELECT status_analise FROM veiculos WHERE id = ${data.veiculo_id}::uuid`,
  );
  const veiculo = rowsOf(vRes)[0];
  if (!veiculo) throw new Error("Veículo não encontrado.");
  if (!STATUS_APTOS.includes(veiculo.status_analise)) {
    throw new Error(
      "Este veículo ainda não foi aprovado na análise pós-vistoria e não pode ser publicado.",
    );
  }

  await d.execute(sql`
    INSERT INTO publicacao_canais (veiculo_id, canal, ativo, titulo, descricao, fotos)
    VALUES (
      ${data.veiculo_id}::uuid, ${data.canal}, ${data.ativo},
      ${data.titulo || null}, ${data.descricao || null},
      ${JSON.stringify(data.fotos || [])}::jsonb
    )
    ON CONFLICT (veiculo_id, canal) DO UPDATE SET
      ativo = EXCLUDED.ativo,
      titulo = EXCLUDED.titulo,
      descricao = EXCLUDED.descricao,
      fotos = EXCLUDED.fotos,
      atualizado_em = now()
  `);

  return { ok: true as const };
}
