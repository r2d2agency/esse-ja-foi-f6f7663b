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

export const CANAIS = ["LEILAO", "ANUNCIO", "VITRINE", "WHATSAPP"] as const;
export type Canal = (typeof CANAIS)[number];

/** Veículo só pode ser publicado depois de aprovado na análise pós-vistoria. */
export const STATUS_APTOS = ["PRONTO_PARA_ANUNCIO", "ANUNCIADO", "EM_LEILAO"];

export function gerarToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
    sql`ALTER TABLE publicacao_canais ADD COLUMN IF NOT EXISTS token_acesso text`,
    sql`ALTER TABLE publicacao_canais ADD COLUMN IF NOT EXISTS token_ativo boolean DEFAULT true`,
    sql`ALTER TABLE publicacao_canais ADD COLUMN IF NOT EXISTS visualizacoes integer DEFAULT 0`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS publicacao_canais_token_idx ON publicacao_canais (token_acesso)`,
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
    SELECT canal, ativo, titulo, descricao, fotos, atualizado_em, token_acesso, token_ativo, visualizacoes
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
        token_acesso: null,
        token_ativo: true,
        visualizacoes: 0,
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

  // Canais privados (WhatsApp) ganham um token de acesso próprio na primeira ativação.
  const tokenNovo = data.canal === "WHATSAPP" && data.ativo ? gerarToken() : null;

  await d.execute(sql`
    INSERT INTO publicacao_canais (veiculo_id, canal, ativo, titulo, descricao, fotos, token_acesso, token_ativo)
    VALUES (
      ${data.veiculo_id}::uuid, ${data.canal}, ${data.ativo},
      ${data.titulo || null}, ${data.descricao || null},
      ${JSON.stringify(data.fotos || [])}::jsonb,
      ${tokenNovo}, true
    )
    ON CONFLICT (veiculo_id, canal) DO UPDATE SET
      ativo = EXCLUDED.ativo,
      titulo = EXCLUDED.titulo,
      descricao = EXCLUDED.descricao,
      fotos = EXCLUDED.fotos,
      token_acesso = COALESCE(publicacao_canais.token_acesso, EXCLUDED.token_acesso),
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

/** Gera (ou regenera) o token do link privado do WhatsApp. */
export async function regenerarTokenCanal(veiculoId: string, canal: Canal = "WHATSAPP") {
  const d = requireDb();
  await ensurePublicacaoSchema();
  const token = gerarToken();
  await d.execute(sql`
    INSERT INTO publicacao_canais (veiculo_id, canal, ativo, token_acesso, token_ativo)
    VALUES (${veiculoId}::uuid, ${canal}, true, ${token}, true)
    ON CONFLICT (veiculo_id, canal) DO UPDATE SET
      token_acesso = ${token}, token_ativo = true, visualizacoes = 0, atualizado_em = now()
  `);
  return { ok: true as const, token };
}

/** Revoga o link privado sem apagar o histórico do canal. */
export async function revogarTokenCanal(veiculoId: string, canal: Canal = "WHATSAPP") {
  const d = requireDb();
  await ensurePublicacaoSchema();
  await d.execute(sql`
    UPDATE publicacao_canais SET token_ativo = false, atualizado_em = now()
    WHERE veiculo_id = ${veiculoId}::uuid AND canal = ${canal}
  `);
  return { ok: true as const };
}

/** Ficha do veículo acessível apenas por quem tem o link com token. */
export async function getVeiculoPorToken(token: string) {
  const d = requireDb();
  await ensurePublicacaoSchema();

  const canal = rowsOf(
    await d.execute(sql`
      SELECT * FROM publicacao_canais
      WHERE token_acesso = ${token} AND token_ativo = true AND ativo = true
      LIMIT 1
    `),
  )[0];
  if (!canal) return null;

  const veiculo = rowsOf(
    await d.execute(sql`
      SELECT v.id, v.placa, v.marca, v.modelo, v.versao, v.ano_fabricacao, v.ano_modelo,
             v.km, v.cor, v.cambio, v.combustivel, v.cidade, v.uf, v.fotos
      FROM veiculos v WHERE v.id = ${canal.veiculo_id}::uuid
    `),
  )[0];
  if (!veiculo) return null;

  await d.execute(
    sql`UPDATE publicacao_canais SET visualizacoes = COALESCE(visualizacoes,0) + 1 WHERE id = ${canal.id}::uuid`,
  );

  const fotosCanal = Array.isArray(canal.fotos) ? canal.fotos : [];
  const fotosVeiculo = Array.isArray(veiculo.fotos)
    ? veiculo.fotos.map((f: any) => (typeof f === "string" ? f : f?.url)).filter(Boolean)
    : [];

  return {
    veiculo,
    titulo: canal.titulo || `${veiculo.marca} ${veiculo.modelo} ${veiculo.ano_modelo}`,
    descricao: canal.descricao || "",
    fotos: fotosCanal.length ? fotosCanal : fotosVeiculo,
  };
}

/** Texto pronto (com emojis) para envio via WhatsApp / Meta API. */
export async function montarMensagemWhatsapp(veiculoId: string, baseUrl: string) {
  const d = requireDb();
  await ensurePublicacaoSchema();

  const canal = rowsOf(
    await d.execute(sql`
      SELECT * FROM publicacao_canais WHERE veiculo_id = ${veiculoId}::uuid AND canal = 'WHATSAPP' LIMIT 1
    `),
  )[0];
  if (!canal?.token_acesso || canal.token_ativo === false) {
    throw new Error("Ative o canal WhatsApp e gere o link privado antes de montar a mensagem.");
  }

  const v = rowsOf(
    await d.execute(sql`
      SELECT marca, modelo, versao, ano_fabricacao, ano_modelo, km, cor, cambio, combustivel, cidade, uf, fotos
      FROM veiculos WHERE id = ${veiculoId}::uuid
    `),
  )[0];
  if (!v) throw new Error("Veículo não encontrado.");

  const fotosCanal = Array.isArray(canal.fotos) ? canal.fotos : [];
  const fotosVeiculo = Array.isArray(v.fotos)
    ? v.fotos.map((f: any) => (typeof f === "string" ? f : f?.url)).filter(Boolean)
    : [];
  const fotoCapa = fotosCanal[0] || fotosVeiculo[0] || null;

  const link = `${baseUrl.replace(/\/+$/, "")}/v/${canal.token_acesso}`;
  const km = v.km ? `${Number(v.km).toLocaleString("pt-BR")} km` : "KM não informado";
  const linhas = [
    `🚗 *${canal.titulo || `${v.marca} ${v.modelo}`}*`,
    `📅 ${v.ano_fabricacao}/${v.ano_modelo}  •  🛣️ ${km}`,
    `⚙️ ${v.cambio || "Câmbio n/d"}  •  ⛽ ${v.combustivel || "Combustível n/d"}  •  🎨 ${v.cor || "Cor n/d"}`,
    v.cidade ? `📍 ${v.cidade}${v.uf ? `/${v.uf}` : ""}` : null,
    "",
    canal.descricao ? `${canal.descricao}` : "✅ Veículo vistoriado pela ESSE JÁ FOI.",
    "",
    `🔗 Veja as fotos e a ficha completa: ${link}`,
    "🔒 Link exclusivo — este veículo não está na vitrine pública.",
  ].filter(Boolean);

  return { mensagem: linhas.join("\n"), link, foto_capa: fotoCapa };
}

/**
 * Mantém a vitrine pública em dia: só o canal VITRINE publica o veículo na
 * listagem aberta. Os demais canais (anúncio direto, WhatsApp) não expõem o carro.
 */
export async function sincronizarVitrine(veiculoId: string) {
  const d = requireDb();
  try {
    const { ensureAnunciosSchema, getProximoCodigoAnuncio } = await import("./anuncios.server");
    await ensureAnunciosSchema();

    const cRes = await d.execute(sql`
      SELECT canal, ativo, titulo, descricao FROM publicacao_canais
      WHERE veiculo_id = ${veiculoId}::uuid AND canal = 'VITRINE'
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
