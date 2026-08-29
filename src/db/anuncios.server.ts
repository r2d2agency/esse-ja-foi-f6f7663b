import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function ensureAnunciosSchema() {
  const d = requireDb();
  
  // Dependência de laudos para a tabela de fotos
  const { ensureLaudoSchema } = await import("./laudos.server");
  await ensureLaudoSchema();


  // Tabela de Anúncios
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS anuncios_veiculo (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      codigo_publico text UNIQUE NOT NULL, -- EJF-XXXXXX
      slug text UNIQUE NOT NULL,
      titulo text NOT NULL,
      descricao text,
      localizacao_publica text, -- Cidade/UF
      tipo_publicacao text DEFAULT 'OFERTA_COMPETITIVA',
      status text NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, AGENDADO, PUBLICADO, PAUSADO, ENCERRADO, CANCELADO
      agendado_para timestamptz,
      publicado_em timestamptz,
      encerrado_em timestamptz,
      motivo_pausa_cancelamento text,
      responsavel_id uuid, -- Remover FK para profiles para evitar erro circular inicial
      config_exibicao jsonb DEFAULT '{}',
      copy_compartilhamento text,
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);

  // Tabela de Fotos do Anúncio (para gerenciar ordem e capa)
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS anuncios_fotos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      anuncio_id uuid NOT NULL REFERENCES anuncios_veiculo(id) ON DELETE CASCADE,
      foto_original_id uuid, -- Referência opcional ao ID da foto no laudo
      foto_url text NOT NULL,
      eh_capa boolean DEFAULT false,
      ordem integer DEFAULT 0,
      legenda text,
      criado_em timestamptz DEFAULT now()
    );

  `);

  // Tabela de Apontamentos Públicos do Anúncio
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS anuncios_apontamentos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      anuncio_id uuid NOT NULL REFERENCES anuncios_veiculo(id) ON DELETE CASCADE,
      item_checklist_id uuid,
      descricao_publica text NOT NULL,
      gravidade text,
      criado_em timestamptz DEFAULT now()
    );
  `);
}

export async function listarVeiculosProntosParaAnuncio() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT 
      v.id, v.placa, v.marca, v.modelo, v.ano_fabricacao, v.ano_modelo, v.km, v.cor,
      v.status_analise, v.atualizado_em as data_liberacao,
      p.nome as vendedor_nome,
      resp.nome as responsavel_nome,
      (SELECT url FROM laudo_fotos lf JOIN laudos l ON lf.laudo_id = l.id JOIN vistorias vis ON l.vistoria_id = vis.id WHERE vis.veiculo_id = v.id AND lf.usar_anuncio = true LIMIT 1) as foto_capa
    FROM veiculos v
    JOIN profiles p ON v.vendedor_id = p.id
    LEFT JOIN profiles resp ON resp.id = v.responsavel_analise_id
    WHERE v.status_analise = 'PRONTO_PARA_ANUNCIO'
    AND NOT EXISTS (SELECT 1 FROM anuncios_veiculo a WHERE a.veiculo_id = v.id)
    ORDER BY v.atualizado_em DESC
  `);
  return rowsOf(res) || res;
}

export async function listarAnuncios(status?: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT 
      a.*,
      v.placa, v.marca, v.modelo, v.ano_modelo, v.km,
      p.nome as vendedor_nome,
      (SELECT foto_url FROM anuncios_fotos af WHERE af.anuncio_id = a.id AND af.eh_capa = true LIMIT 1) as foto_capa
    FROM anuncios_veiculo a
    JOIN veiculos v ON a.veiculo_id = v.id
    JOIN profiles p ON v.vendedor_id = p.id
    ${status ? sql`WHERE a.status = ${status}` : sql``}
    ORDER BY a.criado_em DESC
  `);
  return rowsOf(res) || res;
}

export async function getProximoCodigoAnuncio() {
  const d = requireDb();
  const res = await d.execute(sql`SELECT count(*) FROM anuncios_veiculo`);
  const count = parseInt(rowsOf(res)[0].count) + 1;
  return `EJF-${count.toString().padStart(6, '0')}`;
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
