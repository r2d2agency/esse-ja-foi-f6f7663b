import { sql } from "drizzle-orm";
import { db } from "./index";

export async function ensureRelatoriosSchema() {
  if (!db) return;
}

export async function getRelatoriosGerais(filtros: { dataInicio?: string | null; dataFim?: string | null }) {
  if (!db) return null;

  const whereClause = filtros.dataInicio && filtros.dataFim 
    ? sql`WHERE criado_em BETWEEN ${filtros.dataInicio}::timestamptz AND ${filtros.dataFim}::timestamptz`
    : sql``;

  const andWhereClause = filtros.dataInicio && filtros.dataFim 
    ? sql` AND criado_em BETWEEN ${filtros.dataInicio}::timestamptz AND ${filtros.dataFim}::timestamptz`
    : sql``;

  const stats = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM veiculos ${whereClause}) as veiculos_cadastrados,
      (SELECT count(*)::int FROM veiculos WHERE status_analise = 'PRONTO_PARA_VISTORIA' ${andWhereClause}) as veiculos_aprovados,
      (SELECT count(*)::int FROM anuncios_veiculo ${whereClause}) as veiculos_publicados,
      (SELECT count(*)::int FROM leiloes WHERE status = 'encerrado' ${whereClause}) as leiloes_realizados,
      (SELECT count(*)::int FROM negociacoes WHERE status = 'CONCLUIDA' ${whereClause}) as vendas_concluidas,
      (SELECT COALESCE(SUM(valor_venda), 0)::numeric FROM negociacoes WHERE status = 'CONCLUIDA' ${whereClause}) as volume_vendido,
      (SELECT COALESCE(SUM(valor_comissao), 0)::numeric FROM negociacoes WHERE status = 'CONCLUIDA' ${whereClause}) as comissao_gerada,
      (SELECT count(*)::int FROM profiles WHERE role = 'comprador' AND ativo = true ${whereClause}) as compradores_ativos,
      (SELECT count(*)::int FROM profiles WHERE role = 'vendedor' ${whereClause}) as vendedores_cadastrados
  `);

  const funnel = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM veiculos ${whereClause}) as cadastrados,
      (SELECT count(*)::int FROM veiculos WHERE status = 'ANALISE' ${andWhereClause}) as em_analise,
      (SELECT count(*)::int FROM veiculos WHERE status_analise = 'PRONTO_PARA_VISTORIA' ${andWhereClause}) as aprovados_vistoria,
      (SELECT count(*)::int FROM vistorias WHERE status = 'CONCLUIDA' ${andWhereClause}) as vistoriados,
      (SELECT count(*)::int FROM veiculos WHERE status = 'PRONTO_PARA_ANUNCIO' ${andWhereClause}) as prontos_anuncio,
      (SELECT count(*)::int FROM anuncios_veiculo ${andWhereClause}) as publicados,
      (SELECT count(DISTINCT leilao_id)::int FROM lances ${andWhereClause}) as com_lances,
      (SELECT count(*)::int FROM negociacoes ${andWhereClause}) as com_vencedor,
      (SELECT count(*)::int FROM cobrancas WHERE status = 'PAGO' ${andWhereClause}) as pagos,
      (SELECT count(*)::int FROM entregas WHERE status = 'ENTREGA_CONFIRMADA' ${andWhereClause}) as entregues,
      (SELECT count(*)::int FROM negociacoes WHERE status = 'CONCLUIDA' ${andWhereClause}) as concluidos
  `);

  const rows = rowsOf(stats) || stats;
  const funnelRows = rowsOf(funnel) || funnel;

  return {
    overview: Array.isArray(rows) ? rows[0] : rows,
    funnel: Array.isArray(funnelRows) ? funnelRows[0] : funnelRows
  };
}

export async function getRelatoriosVendas(filtros: { dataInicio?: string | null; dataFim?: string | null }) {
  if (!db) return null;
  
  const whereClause = filtros.dataInicio && filtros.dataFim 
    ? sql`WHERE n.criado_em BETWEEN ${filtros.dataInicio}::timestamptz AND ${filtros.dataFim}::timestamptz`
    : sql``;

  const stats = await db.execute(sql`
    SELECT 
      count(*)::int as total_vendas,
      COALESCE(SUM(valor_venda), 0)::numeric as volume_total,
      COALESCE(AVG(valor_venda), 0)::numeric as ticket_medio,
      COALESCE(MAX(valor_venda), 0)::numeric as maior_venda,
      COALESCE(SUM(valor_comissao), 0)::numeric as comissao_total,
      COALESCE(AVG(valor_comissao), 0)::numeric as comissao_media
    FROM negociacoes n
    WHERE n.status = 'CONCLUIDA' 
    ${filtros.dataInicio && filtros.dataFim ? sql` AND n.criado_em BETWEEN ${filtros.dataInicio}::timestamptz AND ${filtros.dataFim}::timestamptz` : sql``}
  `);

  const lista = await db.execute(sql`
    SELECT 
      n.criado_em, n.codigo, v.marca || ' ' || v.modelo as veiculo,
      vend.nome as vendedor_nome, comp.nome as comprador_nome,
      n.valor_venda::numeric, n.valor_comissao::numeric, (n.valor_venda - n.valor_comissao)::numeric as valor_repassado,
      n.status
    FROM negociacoes n
    JOIN veiculos v ON v.id = n.veiculo_id
    JOIN profiles vend ON vend.id = n.vendedor_id
    JOIN profiles comp ON comp.id = n.comprador_id
    ${whereClause}
    ORDER BY n.criado_em DESC
    LIMIT 100
  `);

  const statsRows = rowsOf(stats) || stats;
  const listaRows = rowsOf(lista) || lista;

  return {
    stats: Array.isArray(statsRows) ? statsRows[0] : statsRows,
    lista: listaRows
  };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

/** Configuração da comissão padrão da plataforma (%) */
async function ensureComissaoConfig() {
  if (!db) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS financeiro_configuracoes (
      chave text PRIMARY KEY,
      valor text NOT NULL,
      descricao text,
      atualizado_em timestamptz DEFAULT now()
    );
  `);
  await db.execute(sql`
    INSERT INTO financeiro_configuracoes (chave, valor, descricao)
    VALUES ('comissao_padrao_percentual', '5', 'Percentual padrão de comissão da plataforma por venda.')
    ON CONFLICT (chave) DO NOTHING;
  `);
}

export async function getComissaoPadrao(): Promise<number> {
  if (!db) return 5;
  await ensureComissaoConfig();
  const res = await db.execute(sql`SELECT valor FROM financeiro_configuracoes WHERE chave = 'comissao_padrao_percentual'`);
  const v = Number(rowsOf(res)?.[0]?.valor);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

export async function setComissaoPadrao(percentual: number) {
  if (!db) return { ok: false as const };
  await ensureComissaoConfig();
  await db.execute(sql`
    INSERT INTO financeiro_configuracoes (chave, valor, descricao, atualizado_em)
    VALUES ('comissao_padrao_percentual', ${String(percentual)}, 'Percentual padrão de comissão da plataforma por venda.', now())
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
  `);
  return { ok: true as const };
}

/** Comissões: a receber, recebidas e previstas */
export async function getRelatorioComissoes() {
  if (!db) return null;

  let repassesOk = true;
  let resumo: any = {};
  try {
    const res = await db.execute(sql`
      SELECT
        COALESCE(SUM(valor_comissao) FILTER (WHERE status = 'CONCLUIDO'), 0)::numeric as comissao_recebida_total,
        COALESCE(SUM(valor_comissao) FILTER (WHERE status <> 'CONCLUIDO'), 0)::numeric as comissao_a_receber,
        COALESCE(SUM(valor_comissao) FILTER (WHERE status = 'CONCLUIDO' AND date_trunc('month', COALESCE(concluido_em, atualizado_em)) = date_trunc('month', now())), 0)::numeric as comissao_recebida_mes,
        COALESCE(SUM(valor_comissao) FILTER (WHERE status <> 'CONCLUIDO' AND date_trunc('month', criado_em) = date_trunc('month', now())), 0)::numeric as comissao_a_receber_mes,
        COUNT(*) FILTER (WHERE status <> 'CONCLUIDO')::int as qtd_pendentes,
        COUNT(*) FILTER (WHERE status = 'CONCLUIDO')::int as qtd_concluidas
      FROM repasses
    `);
    resumo = rowsOf(res)?.[0] || {};
  } catch {
    repassesOk = false;
  }

  let previsto: any = {};
  try {
    const res = await db.execute(sql`
      SELECT
        COALESCE(SUM(pv.comissao_valor), 0)::numeric as comissao_prevista,
        COUNT(*)::int as qtd_veiculos
      FROM propostas_veiculo pv
      JOIN veiculos v ON v.id = pv.veiculo_id
      WHERE pv.comissao_valor IS NOT NULL
    `);
    previsto = rowsOf(res)?.[0] || {};
  } catch {
    previsto = {};
  }

  let lista: any[] = [];
  if (repassesOk) {
    try {
      const res = await db.execute(sql`
        SELECT r.id, r.status, r.valor_venda::numeric, r.valor_comissao::numeric, r.valor_liquido::numeric,
               r.comissao_regra, r.criado_em, r.concluido_em,
               n.codigo as negociacao_codigo,
               (v.marca || ' ' || v.modelo) as veiculo,
               vend.nome as vendedor_nome
        FROM repasses r
        JOIN negociacoes n ON n.id = r.negociacao_id
        LEFT JOIN veiculos v ON v.id = n.veiculo_id
        LEFT JOIN profiles vend ON vend.id = r.vendedor_id
        ORDER BY r.criado_em DESC
        LIMIT 100
      `);
      lista = rowsOf(res) || [];
    } catch {
      lista = [];
    }
  }

  return {
    percentualPadrao: await getComissaoPadrao(),
    resumo: {
      comissao_recebida_total: Number(resumo.comissao_recebida_total || 0),
      comissao_recebida_mes: Number(resumo.comissao_recebida_mes || 0),
      comissao_a_receber: Number(resumo.comissao_a_receber || 0),
      comissao_a_receber_mes: Number(resumo.comissao_a_receber_mes || 0),
      qtd_pendentes: Number(resumo.qtd_pendentes || 0),
      qtd_concluidas: Number(resumo.qtd_concluidas || 0),
      comissao_prevista: Number(previsto.comissao_prevista || 0),
      qtd_veiculos: Number(previsto.qtd_veiculos || 0),
    },
    lista,
  };
}
