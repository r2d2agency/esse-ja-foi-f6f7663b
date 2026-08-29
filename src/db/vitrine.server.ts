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


async function ensureDependencias() {
  try {
    const { ensurePublicacaoSchema } = await import("./publicacao.server");
    await ensurePublicacaoSchema();
  } catch (e) { console.error("[vitrine] publicacao schema", e); }
  try {
    const { ensureLeilaoSchema } = await import("./leilao.server");
    await ensureLeilaoSchema();
  } catch (e) { console.error("[vitrine] leilao schema", e); }
  try {
    const { ensureAnunciosSchema } = await import("./anuncios.server");
    await ensureAnunciosSchema();
  } catch (e) { console.error("[vitrine] anuncios schema", e); }
  try {
    const { ensureCompradorSchema } = await import("./comprador.server");
    await ensureCompradorSchema();
  } catch (e) { console.error("[vitrine] comprador schema", e); }
}

/** Descobre o nível de acesso comercial do visitante. */
export async function getAcessoComercial(userId?: string | null) {
  const base = { autenticado: false, pode_ver_valores: false, pode_dar_lances: false, comprador_id: null as string | null };
  if (!userId || !db) return base;
  const res = await db.execute(sql`
    SELECT id, role, ativo, cadastro_completo, status_compliance, pode_ver_valores
    FROM profiles WHERE id = ${userId}::uuid
  `);
  const p = rowsOf(res)[0];
  if (!p) return base;
  const aprovado = p.status_compliance === "APROVADO" && p.ativo;
  return {
    autenticado: true,
    comprador_id: p.id as string,
    pode_ver_valores: !!(aprovado || p.pode_ver_valores),
    pode_dar_lances: !!(aprovado && p.cadastro_completo),
  };
}

export async function listarAnunciosVitrine(userId?: string | null) {
  const d = requireDb();
  await ensureDependencias();
  const acesso = await getAcessoComercial(userId);

  const res = await d.execute(sql`
    SELECT 
      a.id, a.codigo_publico, a.slug, a.titulo, a.localizacao_publica, a.veiculo_id,
      v.marca, v.modelo, v.ano_modelo, v.km, v.cor,
      pc.titulo as vitrine_titulo, pc.descricao as vitrine_descricao, pc.fotos as vitrine_fotos,
      l.id as leilao_id, l.status as leilao_status, l.inicio_em, l.fim_em,
      l.lance_inicial, l.incremento_minimo,
      (SELECT max(valor) FROM lances WHERE leilao_id = l.id) as lance_atual,
      (SELECT foto_url FROM anuncios_fotos af WHERE af.anuncio_id = a.id ORDER BY af.eh_capa DESC, af.ordem ASC LIMIT 1) as foto_capa
    FROM anuncios_veiculo a
    JOIN veiculos v ON a.veiculo_id = v.id
    LEFT JOIN publicacao_canais pc ON pc.veiculo_id = v.id AND pc.canal = 'VITRINE'
    LEFT JOIN LATERAL (
      SELECT * FROM leiloes le
      WHERE le.veiculo_id = v.id AND le.status IN ('AGENDADO','ATIVO','PRORROGADO')
      ORDER BY le.inicio_em ASC LIMIT 1
    ) l ON true
    WHERE a.status = 'PUBLICADO'
      AND (pc.id IS NULL OR pc.ativo = true)
    ORDER BY a.publicado_em DESC NULLS LAST
    LIMIT 60
  `);

  return rowsOf(res).map((r) => ({
    ...r,
    titulo: r.vitrine_titulo || r.titulo,
    foto_capa: (Array.isArray(r.vitrine_fotos) && r.vitrine_fotos[0]) || r.foto_capa,
    // Vitrine pública nunca mostra valores
    lance_inicial: acesso.pode_ver_valores ? r.lance_inicial : null,
    lance_atual: acesso.pode_ver_valores ? r.lance_atual : null,
    incremento_minimo: acesso.pode_ver_valores ? r.incremento_minimo : null,
    valores_ocultos: !acesso.pode_ver_valores,
  }));
}

export async function getDetalheAnuncioPublico(slug: string, userId?: string | null) {
  const d = requireDb();
  await ensureDependencias();
  const acesso = await getAcessoComercial(userId);

  const aRes = await d.execute(sql`
    SELECT 
      a.*,
      v.marca, v.modelo, v.ano_fabricacao, v.ano_modelo, v.km, v.cor, v.combustivel, v.cambio,
      pc.titulo as canal_titulo, pc.descricao as canal_descricao, pc.fotos as canal_fotos,
      l.id as leilao_id, l.status as leilao_status, l.inicio_em, l.fim_em
    FROM anuncios_veiculo a
    JOIN veiculos v ON a.veiculo_id = v.id
    LEFT JOIN publicacao_canais pc ON pc.veiculo_id = v.id AND pc.canal = 'VITRINE'
    LEFT JOIN LATERAL (
      SELECT * FROM leiloes le
      WHERE le.veiculo_id = v.id AND le.status IN ('AGENDADO','ATIVO','PRORROGADO','ENCERRADO')
      ORDER BY le.inicio_em DESC LIMIT 1
    ) l ON true
    WHERE a.slug = ${slug}
    LIMIT 1
  `);

  const anuncio = rowsOf(aRes)[0];
  if (!anuncio) return null;

  const fotoRes = await d.execute(sql`
    SELECT * FROM anuncios_fotos 
    WHERE anuncio_id = ${anuncio.id}::uuid 
    ORDER BY ordem ASC
  `);

  let fotos = rowsOf(fotoRes) || [];
  if (Array.isArray(anuncio.canal_fotos) && anuncio.canal_fotos.length > 0) {
    fotos = anuncio.canal_fotos.map((url: string, i: number) => ({ id: `c-${i}`, foto_url: url }));
  }

  let favorito = false;
  let lembrete = null as any;
  if (acesso.comprador_id) {
    const fRes = await d.execute(sql`
      SELECT 1 FROM comprador_favoritos
      WHERE comprador_id = ${acesso.comprador_id}::uuid AND anuncio_id = ${anuncio.id}::uuid
    `);
    favorito = rowsOf(fRes).length > 0;
    const lRes = await d.execute(sql`
      SELECT lembrar_em FROM comprador_lembretes
      WHERE comprador_id = ${acesso.comprador_id}::uuid AND anuncio_id = ${anuncio.id}::uuid
    `);
    lembrete = rowsOf(lRes)[0] || null;
  }

  return {
    ...anuncio,
    titulo: anuncio.canal_titulo || anuncio.titulo,
    descricao: anuncio.canal_descricao || anuncio.descricao,
    fotos,
    favorito,
    lembrete,
    acesso,
  };
}
