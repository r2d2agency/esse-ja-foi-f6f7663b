import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { 
  listarVeiculosProntosParaAnuncio, 
  listarAnuncios, 
  getProximoCodigoAnuncio,
  ensureAnunciosSchema 
} from "../db/anuncios.server";
import { db } from "../db";
import { sql } from "drizzle-orm";

export const getProntosParaAnuncio = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      await ensureAnunciosSchema();
      return await listarVeiculosProntosParaAnuncio();
    } catch (e: any) {
      console.error("[getProntosParaAnuncio] error:", e?.message || e);
      return [];
    }
  });

export const getAnunciosAdmin = createServerFn({ method: "GET" })
  .validator((s: string | undefined) => z.string().optional().parse(s))
  .handler(async ({ data: status }) => {
    return listarAnuncios(status);
  });

export const getDadosParaNovoAnuncio = createServerFn({ method: "GET" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: veiculoId }) => {
    const d = db;
    if (!d) throw new Error("DB offline");

    const vRes = await d.execute(sql`
      SELECT v.*, p.cidade as vendedor_cidade, p.uf as vendedor_uf
      FROM veiculos v
      JOIN profiles p ON v.vendedor_id = p.id
      WHERE v.id = ${veiculoId}::uuid
    `);
    const veiculo = (vRes as any).rows[0];

    const fotoRes = await d.execute(sql`
      SELECT lf.* 
      FROM laudo_fotos lf
      JOIN laudos l ON lf.laudo_id = l.id
      JOIN vistorias vis ON l.vistoria_id = vis.id
      WHERE vis.veiculo_id = ${veiculoId}::uuid AND lf.usar_anuncio = true
      ORDER BY lf.eh_principal DESC, lf.criado_em ASC
    `);
    const fotos = (fotoRes as any).rows || [];

    const codigo = await getProximoCodigoAnuncio();

    return { veiculo, fotos, codigo };
  });

export const criarAnuncio = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({
    veiculo_id: z.string().uuid(),
    titulo: z.string(),
    descricao: z.string(),
    localizacao_publica: z.string(),
    fotos: z.array(z.object({
      foto_url: z.string(),
      foto_original_id: z.string().uuid().optional().nullable(),
      eh_capa: z.boolean(),
      ordem: z.number()
    })),
    status: z.string(),
    agendado_para: z.string().optional().nullable(),
  }).parse(data))
  .handler(async ({ data }) => {
    const d = db;
    if (!d) throw new Error("DB offline");

    const codigo = await getProximoCodigoAnuncio();
    const slug = `${data.titulo.toLowerCase().replace(/ /g, '-')}-${codigo.toLowerCase()}`;

    const resAnuncio = await d.execute(sql`
      INSERT INTO anuncios_veiculo (
        veiculo_id, codigo_publico, slug, titulo, descricao, 
        localizacao_publica, status, agendado_para, publicado_em
      ) VALUES (
        ${data.veiculo_id}::uuid, ${codigo}, ${slug}, ${data.titulo}, ${data.descricao},
        ${data.localizacao_publica}, ${data.status}, 
        ${data.agendado_para ? data.agendado_para : null},
        ${data.status === 'PUBLICADO' ? sql`now()` : null}
      ) RETURNING id
    `);
    
    const anuncioId = (resAnuncio as any).rows[0].id;

    for (const foto of data.fotos) {
      await d.execute(sql`
        INSERT INTO anuncios_fotos (anuncio_id, foto_original_id, foto_url, eh_capa, ordem)
        VALUES (${anuncioId}::uuid, ${foto.foto_original_id ? sql`${foto.foto_original_id}::uuid` : null}, ${foto.foto_url}, ${foto.eh_capa}, ${foto.ordem})
      `);
    }

    // Atualizar status do veículo
    await d.execute(sql`
      UPDATE veiculos SET status_analise = 'ANUNCIADO' WHERE id = ${data.veiculo_id}::uuid
    `);

    return { id: anuncioId, codigo, slug };
  });
