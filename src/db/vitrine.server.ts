import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function listarAnunciosVitrine(filtros: any = {}) {
  const d = requireDb();
  
  // Apenas anúncios PUBLICADOS são visíveis na vitrine
  const res = await d.execute(sql`
    SELECT 
      a.id, a.codigo_publico, a.slug, a.titulo, a.localizacao_publica,
      v.marca, v.modelo, v.ano_modelo, v.km, v.cor,
      (SELECT foto_url FROM anuncios_fotos af WHERE af.anuncio_id = a.id AND af.eh_capa = true LIMIT 1) as foto_capa
    FROM anuncios_veiculo a
    JOIN veiculos v ON a.veiculo_id = v.id
    WHERE a.status = 'PUBLICADO'
    ORDER BY a.publicado_em DESC
    LIMIT 50
  `);
  
  return rowsOf(res) || res;
}

export async function getDetalheAnuncioPublico(slug: string) {
  const d = requireDb();
  
  const aRes = await d.execute(sql`
    SELECT 
      a.*,
      v.marca, v.modelo, v.ano_fabricacao, v.ano_modelo, v.km, v.cor, v.combustivel, v.cambio
    FROM anuncios_veiculo a
    JOIN veiculos v ON a.veiculo_id = v.id
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
  
  const fotos = rowsOf(fotoRes) || [];

  return { ...anuncio, fotos };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
