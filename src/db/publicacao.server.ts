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

  const alters = [
    sql`ALTER TABLE publicacao_canais ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT false`,
    sql`ALTER TABLE publicacao_canais ADD COLUMN IF NOT EXISTS titulo text`,
    sql`ALTER TABLE publicacao_canais ADD COLUMN IF NOT EXISTS descricao text`,
    sql`ALTER TABLE publicacao_canais ADD COLUMN IF NOT EXISTS fotos jsonb DEFAULT '[]'`,
    sql`ALTER TABLE publicacao_canais ADD COLUMN IF NOT EXISTS atualizado_em timestamptz DEFAULT now()`,
  ];
  for (const stmt of alters) {
    try {
      await d.execute(stmt);
    } catch {
      /* segue */
    }
  }
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

  await sincronizarVitrine(data.veiculo_id);

  if (data.canal === "LEILAO" && !data.ativo) {
    try {
      const { cancelarLeilaoVeiculo } = await import("./leilao.server");
      await cancelarLeilaoVeiculo(data.veiculo_id);
    } catch (e) {
      console.error("[publicacao] cancelarLeilaoVeiculo", e);
    }
  }

  return { ok: true as const };
}

/**
 * Mantém a vitrine pública em dia: se algum canal (ANUNCIO/VITRINE) estiver ativo,
 * garante um registro publicado em anuncios_veiculo. Caso contrário, pausa.
 */
export async function sincronizarVitrine(veiculoId: string) {
  const d = requireDb();
  try {
    const { ensureAnunciosSchema, getProximoCodigoAnuncio } = await import("./anuncios.server");
    await ensureAnunciosSchema();

    const cRes = await d.execute(sql`
      SELECT canal, ativo, titulo, descricao FROM publicacao_canais
      WHERE veiculo_id = ${veiculoId}::uuid AND canal IN ('ANUNCIO','VITRINE')
    `);
    const canais = rowsOf(cRes);
    const ativos = canais.filter((c) => c.ativo);

    const aRes = await d.execute(
      sql`SELECT id, status FROM anuncios_veiculo WHERE veiculo_id = ${veiculoId}::uuid LIMIT 1`,
    );
    const anuncio = rowsOf(aRes)[0];

    if (ativos.length === 0) {
      if (anuncio) {
        await d.execute(
          sql`UPDATE anuncios_veiculo SET status = 'PAUSADO', atualizado_em = now() WHERE id = ${anuncio.id}::uuid`,
        );
      }
      return;
    }

    const vRes = await d.execute(sql`
      SELECT marca, modelo, ano_modelo, cidade, uf FROM veiculos WHERE id = ${veiculoId}::uuid
    `);
    const v = rowsOf(vRes)[0] || {};
    const titulo =
      ativos[0]?.titulo || `${v.marca ?? ""} ${v.modelo ?? ""} ${v.ano_modelo ?? ""}`.trim() || "Veículo";
    const localizacao = [v.cidade, v.uf].filter(Boolean).join("/") || null;

    if (anuncio) {
      await d.execute(sql`
        UPDATE anuncios_veiculo
        SET status = 'PUBLICADO',
            titulo = ${titulo},
            descricao = ${ativos[0]?.descricao || null},
            localizacao_publica = ${localizacao},
            publicado_em = COALESCE(publicado_em, now()),
            atualizado_em = now()
        WHERE id = ${anuncio.id}::uuid
      `);
      return;
    }

    const codigo = await getProximoCodigoAnuncio();
    const slug = `${titulo}-${codigo}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    await d.execute(sql`
      INSERT INTO anuncios_veiculo
        (veiculo_id, codigo_publico, slug, titulo, descricao, localizacao_publica, status, publicado_em)
      VALUES (
        ${veiculoId}::uuid, ${codigo}, ${slug}, ${titulo},
        ${ativos[0]?.descricao || null}, ${localizacao}, 'PUBLICADO', now()
      )
    `);
  } catch (e: any) {
    console.error("[publicacao] sincronizarVitrine", e);
    throw new Error(
      `Canal salvo, mas a publicação na vitrine falhou: ${e?.message || "erro desconhecido"}`,
    );
  }
}

/** Veículos atualmente publicados na vitrine/anúncio (visão admin). */
export async function listarPublicadosVitrine() {
  const d = requireDb();
  await ensurePublicacaoSchema();
  const res = await d.execute(sql`
    SELECT v.id, v.placa, v.marca, v.modelo, v.ano_modelo, v.km, v.cor,
           pc.canal, pc.titulo, pc.fotos, pc.atualizado_em,
           a.status as anuncio_status, a.slug
    FROM publicacao_canais pc
    JOIN veiculos v ON v.id = pc.veiculo_id
    LEFT JOIN anuncios_veiculo a ON a.veiculo_id = v.id
    WHERE pc.ativo = true
    ORDER BY pc.atualizado_em DESC
    LIMIT 200
  `);
  return rowsOf(res);
}
