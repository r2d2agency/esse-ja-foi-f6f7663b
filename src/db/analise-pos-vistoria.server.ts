import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function ensureAnalisePosVistoriaSchema() {
  const d = requireDb();

  // Tabela de Propostas
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS propostas_veiculo (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      versao integer NOT NULL DEFAULT 1,
      valor_referencia numeric(12,2),
      valor_minimo_acordado numeric(12,2) NOT NULL,
      comissao_tipo text NOT NULL DEFAULT 'PERCENTUAL', -- PERCENTUAL, FIXO
      comissao_valor numeric(12,2) NOT NULL,
      valor_liquido_vendedor numeric(12,2) NOT NULL,
      valor_minimo_interno numeric(12,2),
      observacao_interna text,
      mensagem_vendedor text,
      status text NOT NULL DEFAULT 'AGUARDANDO_ACEITE', -- AGUARDANDO_ACEITE, ACEITA, RECUSADA, EXPIRADA
      motivo_recusa text,
      detalhes_recusa text,
      enviado_por uuid REFERENCES profiles(id),
      enviado_em timestamptz DEFAULT now(),
      respondido_em timestamptz,
      ip_vendedor text,
      criado_em timestamptz DEFAULT now(),
      UNIQUE(veiculo_id, versao)
    );
  `);

  // Histórico de Fotos para Anúncio (seleção do admin)
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS veiculos_fotos_selecao (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      foto_laudo_id uuid REFERENCES laudo_fotos(id),
      foto_url text NOT NULL,
      eh_principal boolean DEFAULT false,
      usar_anuncio boolean DEFAULT true,
      ordem integer DEFAULT 0,
      criado_em timestamptz DEFAULT now()
    );
  `);
  
  // Pendências de Vistoria
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS vistorias_pendencias (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vistoria_id uuid NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
      tipo text NOT NULL, -- FOTO_FALTANTE, FOTO_INADEQUADA, ITEM_NAO_PREENCHIDO, DIVERGENCIA, OUTRO
      descricao text NOT NULL,
      status text NOT NULL DEFAULT 'PENDENTE', -- PENDENTE, RESOLVIDO
      criado_por uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now(),
      resolvido_em timestamptz
    );
  `);

  // Reconciliação de esquemas legados
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS valor_referencia numeric(12,2)`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS valor_minimo_interno numeric(12,2)`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS observacao_interna text`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS mensagem_vendedor text`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS motivo_recusa text`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS detalhes_recusa text`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS respondido_em timestamptz`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS ip_vendedor text`);
}


export async function listarVistoriasConcluidasFila() {
  const d = requireDb();
  await ensureAnalisePosVistoriaSchema();
  const res = await d.execute(sql`
    SELECT 
      v.id as vistoria_id,
      v.data_vistoria,
      v.horario_vistoria,
      v.status as vistoria_status,
      vei.id as veiculo_id,
      vei.placa,
      vei.marca,
      vei.modelo,
      vei.status_analise,
      prof.nome as vendedor_nome,
      pvist.nome as vistoriador_nome,
      uv.nome as unidade_nome,
      l.concluido_em,
      vei.responsavel_analise_id,
      resp.nome as responsavel_nome
    FROM vistorias v
    JOIN veiculos vei ON v.veiculo_id = vei.id
    JOIN profiles prof ON v.vendedor_id = prof.id
    JOIN unidades_vistoria uv ON v.unidade_id = uv.id
    LEFT JOIN vistoriadores vist ON v.vistoriador_id = vist.id
    LEFT JOIN profiles pvist ON vist.usuario_id = pvist.id
    LEFT JOIN laudos l ON l.vistoria_id = v.id
    LEFT JOIN profiles resp ON resp.id = vei.responsavel_analise_id
    WHERE vei.status_analise IN ('AGUARDANDO_ANALISE_LAUDO', 'EM_ANALISE_POS_VISTORIA', 'PENDENCIA_VISTORIA')
    ORDER BY l.concluido_em ASC NULLS LAST
  `);
  return rowsOf(res) || res;
}

export async function getDetalheAnaliseVistoria(veiculoId: string) {
  const d = requireDb();
  await ensureAnalisePosVistoriaSchema();
  
  const vRes = await d.execute(sql`
    SELECT 
      v.*, 
      p.nome as vendedor_nome, p.cidade as vendedor_cidade, p.uf as vendedor_uf,
      resp.nome as responsavel_nome
    FROM veiculos v
    JOIN profiles p ON v.vendedor_id = p.id
    LEFT JOIN profiles resp ON resp.id = v.responsavel_analise_id
    WHERE v.id = ${veiculoId}::uuid
    LIMIT 1
  `);
  const veiculo = rowsOf(vRes)[0];

  const vistRes = await d.execute(sql`
    SELECT 
      vis.*, 
      uv.nome as unidade_nome,
      pvist.nome as vistoriador_nome,
      l.id as laudo_id,
      l.quilometragem_atual,
      l.observacao_geral,
      l.concluido_em
    FROM vistorias vis
    JOIN unidades_vistoria uv ON vis.unidade_id = uv.id
    LEFT JOIN vistoriadores vistor ON vis.vistoriador_id = vistor.id
    LEFT JOIN profiles pvist ON vistor.usuario_id = pvist.id
    LEFT JOIN laudos l ON l.vistoria_id = vis.id
    WHERE vis.veiculo_id = ${veiculoId}::uuid AND vis.status = 'CONCLUIDA'
    ORDER BY vis.criado_em DESC
    LIMIT 1
  `);
  const vistoria = rowsOf(vistRes)[0];

  let checklist = [];
  let fotos = [];
  if (vistoria?.laudo_id) {
    try {
      const checkRes = await d.execute(sql`SELECT * FROM laudo_checklist WHERE laudo_id = ${vistoria.laudo_id}::uuid`);
      checklist = rowsOf(checkRes) || [];
    } catch { checklist = []; }

    try {
      const fotoRes = await d.execute(sql`SELECT * FROM laudo_fotos WHERE laudo_id = ${vistoria.laudo_id}::uuid`);
      fotos = rowsOf(fotoRes) || [];
    } catch { fotos = []; }
  }

  const propRes = await d.execute(sql`
    SELECT * FROM propostas_veiculo 
    WHERE veiculo_id = ${veiculoId}::uuid 
    ORDER BY versao DESC
  `);
  const propostas = rowsOf(propRes) || [];

  return { veiculo, vistoria, checklist, fotos, propostas };
}

export async function enviarPropostaVendedor(data: any) {
  const d = requireDb();
  await ensureAnalisePosVistoriaSchema();

  const vRes = await d.execute(sql`SELECT COALESCE(MAX(versao), 0) + 1 as prox FROM propostas_veiculo WHERE veiculo_id = ${data.veiculo_id}::uuid`);
  const versao = rowsOf(vRes)[0].prox;

  await d.execute(sql`
    INSERT INTO propostas_veiculo (
      veiculo_id, versao, valor_referencia, valor_minimo_acordado, 
      comissao_tipo, comissao_valor, valor_liquido_vendedor, 
      valor_minimo_interno, observacao_interna, mensagem_vendedor, enviado_por
    ) VALUES (
      ${data.veiculo_id}::uuid, ${versao}, ${data.valor_referencia}, ${data.valor_minimo_acordado},
      ${data.comissao_tipo}, ${data.comissao_valor}, ${data.valor_liquido_vendedor},
      ${data.valor_minimo_interno}, ${data.observacao_interna}, ${data.mensagem_vendedor}, ${data.usuario_id}::uuid
    )
  `);

  await d.execute(sql`
    UPDATE veiculos SET 
      status_analise = 'AGUARDANDO_ACEITE_VENDEDOR',
      atualizado_em = now()
    WHERE id = ${data.veiculo_id}::uuid
  `);

  return { ok: true, versao };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
