import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

/** Status da negociação */
export const STATUS_NEGOCIACAO = [
  "AGUARDANDO_PAGAMENTO",
  "PAGAMENTO_EM_PROCESSAMENTO",
  "PAGAMENTO_CONFIRMADO",
  "PAGAMENTO_NAO_REALIZADO",
  "LIBERADO_PARA_REPASSE",
  "REPASSE_EM_PROCESSAMENTO",
  "REPASSE_CONCLUIDO",
  "REPASSE_FALHOU",
  "CONCLUIDA",
  "CANCELADA",
] as const;

export async function ensureNegociacoesSchema() {
  const d = requireDb();

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS negociacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      codigo text UNIQUE NOT NULL,
      veiculo_id uuid NOT NULL REFERENCES veiculos(id),
      anuncio_id uuid NOT NULL REFERENCES anuncios_veiculo(id),
      leilao_id uuid NOT NULL REFERENCES leiloes(id),
      lance_id uuid REFERENCES lances(id),
      vendedor_id uuid NOT NULL REFERENCES profiles(id),
      comprador_id uuid NOT NULL REFERENCES profiles(id),
      valor_venda numeric(12,2) NOT NULL,
      valor_comissao numeric(12,2) NOT NULL DEFAULT 0,
      valor_previsto_vendedor numeric(12,2) NOT NULL DEFAULT 0,
      prazo_pagamento_em timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
      motivo_cancelamento text,
      mensagem_comprador text,
      mensagem_vendedor text,
      cancelado_por uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);


  await d.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_negociacoes_leilao ON negociacoes(leilao_id);`);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_negociacoes_comprador ON negociacoes(comprador_id, status);`);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_negociacoes_status ON negociacoes(status, prazo_pagamento_em);`);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS negociacoes_timeline (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      negociacao_id uuid NOT NULL REFERENCES negociacoes(id) ON DELETE CASCADE,
      evento text NOT NULL,
      detalhe text,
      autor_id uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_negtimeline ON negociacoes_timeline(negociacao_id, criado_em);`);

  /** Ranking final imutável dos lances de cada leilão encerrado */
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS leiloes_resultado (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      leilao_id uuid UNIQUE NOT NULL REFERENCES leiloes(id) ON DELETE CASCADE,
      resultado text NOT NULL,
      maior_lance numeric(12,2),
      valor_minimo_acordado numeric(12,2),
      vencedor_id uuid REFERENCES profiles(id),
      ranking jsonb DEFAULT '[]',
      fechado_em timestamptz DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS negociacoes_notificacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      negociacao_id uuid REFERENCES negociacoes(id) ON DELETE CASCADE,
      destinatario_id uuid REFERENCES profiles(id),
      publico text NOT NULL,
      titulo text NOT NULL,
      mensagem text,
      lida boolean DEFAULT false,
      criado_em timestamptz DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS configuracoes_negociacao (
      chave text PRIMARY KEY,
      valor text NOT NULL,
      atualizado_em timestamptz DEFAULT now()
    );
  `);
  await d.execute(sql`
    INSERT INTO configuracoes_negociacao (chave, valor) VALUES ('prazo_pagamento_horas', '24')
    ON CONFLICT (chave) DO NOTHING;
  `);
}

async function registrarEvento(tx: any, negociacaoId: string, evento: string, detalhe?: string, autorId?: string | null) {
  await tx.execute(sql`
    INSERT INTO negociacoes_timeline (negociacao_id, evento, detalhe, autor_id)
    VALUES (${negociacaoId}::uuid, ${evento}, ${detalhe || null}, ${autorId || null}::uuid)
  `);
}

async function notificar(tx: any, negociacaoId: string, publico: string, destinatarioId: string | null, titulo: string, mensagem: string) {
  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notificacoes') THEN
        CREATE TABLE notificacoes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          destinatario_id uuid REFERENCES profiles(id),
          titulo text NOT NULL,
          mensagem text NOT NULL,
          tipo text DEFAULT 'GERAL',
          lida boolean DEFAULT false,
          criado_em timestamptz DEFAULT now()
        );
      END IF;
    END $$;
  `);

  await tx.execute(sql`
    INSERT INTO notificacoes (destinatario_id, titulo, mensagem, tipo)
    VALUES (${destinatarioId}::uuid, ${titulo}, ${mensagem}, 'NEGOCIACAO')
  `);
  
  await tx.execute(sql`
    INSERT INTO negociacoes_notificacoes (negociacao_id, destinatario_id, publico, titulo, mensagem)
    VALUES (${negociacaoId}::uuid, ${destinatarioId}::uuid, ${publico}, ${titulo}, ${mensagem})
  `);
}

export async function getPrazoPagamentoHoras(): Promise<number> {
  const d = requireDb();
  const res = await d.execute(sql`SELECT valor FROM configuracoes_negociacao WHERE chave = 'prazo_pagamento_horas'`);
  return Number(rowsOf(res)?.[0]?.valor || 24);
}

export async function setPrazoPagamentoHoras(horas: number) {
  const d = requireDb();
  await d.execute(sql`
    INSERT INTO configuracoes_negociacao (chave, valor, atualizado_em)
    VALUES ('prazo_pagamento_horas', ${String(horas)}, now())
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
  `);
  return { ok: true, horas };
}

async function proximoCodigo(tx: any) {
  const res = await tx.execute(sql`SELECT count(*)::int as total FROM negociacoes`);
  const total = rowsOf(res)?.[0]?.total || 0;
  return `NEG-${String(total + 1).padStart(6, "0")}`;
}

/**
 * Fechamento definitivo de um leilão encerrado.
 * Sequência obrigatória: maior lance -> validação final -> valor mínimo -> vencedor -> negociação -> aguardando pagamento.
 */
export async function fecharLeilao(leilaoId: string) {
  const d = requireDb();
  const prazoHoras = await getPrazoPagamentoHoras();

  return await d.transaction(async (tx) => {
    // Já fechado? resultado é imutável
    const jaRes = await tx.execute(sql`SELECT * FROM leiloes_resultado WHERE leilao_id = ${leilaoId}::uuid`);
    if (rowsOf(jaRes)?.[0]) return { ok: true, jaFechado: true, resultado: rowsOf(jaRes)[0] };

    const lRes = await tx.execute(sql`SELECT * FROM leiloes WHERE id = ${leilaoId}::uuid FOR UPDATE`);
    const leilao = rowsOf(lRes)?.[0];
    if (!leilao) throw new Error("Leilão não encontrado.");

    const agora = new Date();
    // 2. Validação final no servidor: encerrado de fato, sem prorrogação pendente
    if (new Date(leilao.fim_em) > agora) throw new Error("O leilão ainda não foi encerrado.");
    if (leilao.status === "CANCELADO") throw new Error("Leilão cancelado não pode ser fechado.");
    await tx.execute(sql`UPDATE leiloes SET status = 'ENCERRADO', atualizado_em = now() WHERE id = ${leilaoId}::uuid`);

    // Ranking final imutável
    const rankRes = await tx.execute(sql`
      SELECT l.id, l.comprador_id, l.valor, l.criado_em, p.nome, p.ativo, p.role
      FROM lances l JOIN profiles p ON p.id = l.comprador_id
      WHERE l.leilao_id = ${leilaoId}::uuid
      ORDER BY l.valor DESC, l.criado_em ASC
    `);
    const ranking = (rowsOf(rankRes) || []) as any[];

    // Dados de suporte (veículo, vendedor, valores acordados)
    const ctxRes = await tx.execute(sql`
      SELECT a.id as anuncio_id, a.codigo_publico, a.titulo, v.id as veiculo_id, 
        COALESCE(v.vendedor_id, v.perfil_id) as vendedor_id,
        pr.valor_minimo_acordado, pr.comissao_valor, pr.valor_liquido_vendedor
      FROM leiloes le
      JOIN veiculos v ON v.id = le.veiculo_id
      JOIN anuncios_veiculo a ON a.veiculo_id = v.id


      LEFT JOIN LATERAL (
        SELECT * FROM propostas_veiculo pv WHERE pv.veiculo_id = v.id ORDER BY pv.versao DESC LIMIT 1
      ) pr ON true
      WHERE le.id = ${leilaoId}::uuid
    `);
    const ctx = rowsOf(ctxRes)?.[0];
    if (!ctx) throw new Error("Anúncio/veículo do leilão não localizado.");

    const valorMinimo = Number(ctx.valor_minimo_acordado || 0);

    // 33. Sem lances válidos
    if (ranking.length === 0) {
      await tx.execute(sql`
        INSERT INTO leiloes_resultado (leilao_id, resultado, maior_lance, valor_minimo_acordado, ranking)
        VALUES (${leilaoId}::uuid, 'ENCERRADO_SEM_OFERTAS', NULL, ${valorMinimo}, '[]'::jsonb)
      `);
      await tx.execute(sql`UPDATE veiculos SET status = 'ENCERRADO_SEM_OFERTAS' WHERE id = ${ctx.veiculo_id}::uuid`);
      return { ok: true, resultado: "ENCERRADO_SEM_OFERTAS" };
    }

    // Validação do maior lance e do comprador
    const vencedor = ranking.find((r) => r.ativo && r.role === "comprador") || null;
    const maiorLance = vencedor ? Number(vencedor.valor) : Number(ranking[0].valor);

    const rankingJson = JSON.stringify(
      ranking.slice(0, 10).map((r, i) => ({ posicao: i + 1, comprador_id: r.comprador_id, nome: r.nome, valor: Number(r.valor), criado_em: r.criado_em }))
    );

    // 5. Não atingiu o valor mínimo -> sem venda
    if (!vencedor || (valorMinimo > 0 && maiorLance < valorMinimo)) {
      await tx.execute(sql`
        INSERT INTO leiloes_resultado (leilao_id, resultado, maior_lance, valor_minimo_acordado, ranking)
        VALUES (${leilaoId}::uuid, 'ENCERRADO_SEM_MINIMO', ${maiorLance}, ${valorMinimo}, ${rankingJson}::jsonb)
      `);
      await tx.execute(sql`UPDATE veiculos SET status = 'ENCERRADO_SEM_MINIMO' WHERE id = ${ctx.veiculo_id}::uuid`);
      return { ok: true, resultado: "ENCERRADO_SEM_MINIMO", maiorLance };
    }

    // 6/7. Vencedor confirmado -> criar negociação
    const comissao = Number(ctx.comissao_valor || 0);
    const previstoVendedor = Math.max(maiorLance - comissao, 0);
    const prazo = new Date(agora.getTime() + prazoHoras * 3600 * 1000);
    const codigo = await proximoCodigo(tx);

    const negRes = await tx.execute(sql`
      INSERT INTO negociacoes (
        codigo, veiculo_id, anuncio_id, leilao_id, lance_id, vendedor_id, comprador_id,
        valor_venda, valor_comissao, valor_previsto_vendedor, prazo_pagamento_em, status
      ) VALUES (
        ${codigo}, ${ctx.veiculo_id}::uuid, ${ctx.anuncio_id}::uuid, ${leilaoId}::uuid, ${vencedor.id}::uuid,
        ${ctx.vendedor_id}::uuid, ${vencedor.comprador_id}::uuid,
        ${maiorLance}, ${comissao}, ${previstoVendedor}, ${prazo.toISOString()}, 'AGUARDANDO_PAGAMENTO'
      ) RETURNING id, codigo
    `);
    const negociacao = rowsOf(negRes)[0];

    await tx.execute(sql`
      INSERT INTO leiloes_resultado (leilao_id, resultado, maior_lance, valor_minimo_acordado, vencedor_id, ranking)
      VALUES (${leilaoId}::uuid, 'ENCERRADO_COM_VENCEDOR', ${maiorLance}, ${valorMinimo}, ${vencedor.comprador_id}::uuid, ${rankingJson}::jsonb)
    `);
    await tx.execute(sql`UPDATE veiculos SET status = 'AGUARDANDO_PAGAMENTO' WHERE id = ${ctx.veiculo_id}::uuid`);
    await tx.execute(sql`UPDATE anuncios_veiculo SET status = 'ENCERRADO', encerrado_em = now() WHERE id = ${ctx.anuncio_id}::uuid`);

    await registrarEvento(tx, negociacao.id, "Leilão encerrado.");
    await registrarEvento(tx, negociacao.id, "Maior lance validado.", `R$ ${maiorLance.toFixed(2)}`);
    await registrarEvento(tx, negociacao.id, `${vencedor.nome} confirmado como vencedor.`);
    await registrarEvento(tx, negociacao.id, `Negociação ${negociacao.codigo} criada.`);
    await registrarEvento(tx, negociacao.id, "Comprador notificado.");
    await registrarEvento(tx, negociacao.id, "Aguardando pagamento.");

    await notificar(tx, negociacao.id, "COMPRADOR", vencedor.comprador_id, `Você venceu o leilão do ${ctx.titulo}.`, "Seu pagamento está pendente.");
    try {
      const { criarNotificacaoComprador } = await import("./comprador.server");
      await criarNotificacaoComprador(
        vencedor.comprador_id,
        "LEILAO_VENCIDO",
        `Parabéns! Você venceu o leilão do ${ctx.titulo}`,
        `Lance vencedor de R$ ${maiorLance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Negociação ${negociacao.codigo} criada — conclua o pagamento.`,
        "/comprador/negociacoes",
      );
      const vRes = await tx.execute(sql`SELECT email, nome FROM profiles WHERE id = ${vencedor.comprador_id}::uuid`);
      const ganhador = (Array.isArray(vRes) ? vRes : (vRes as any)?.rows || [])[0];
      if (ganhador?.email) {
        const { enviarEmailSimples } = await import("./mail.server");
        await enviarEmailSimples(
          ganhador.email,
          `Parabéns! Você venceu o leilão do ${ctx.titulo}`,
          `<div style="font-family:Inter,Arial,sans-serif;color:#0f172a">
             <h2 style="margin:0 0 8px">🎉 Esse já foi seu!</h2>
             <p>Olá ${ganhador.nome || "comprador"}, seu lance de <strong>R$ ${maiorLance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong> venceu o leilão do ${ctx.titulo}.</p>
             <p>Negociação <strong>${negociacao.codigo}</strong> criada. Conclua o pagamento para seguir com a entrega.</p>
           </div>`,
        );
      }
    } catch (e) {
      console.error("[negociacoes] falha ao notificar vencedor", e);
    }

    await notificar(tx, negociacao.id, "VENDEDOR", ctx.vendedor_id, "Seu veículo recebeu a oferta vencedora.", "Estamos aguardando a confirmação do pagamento.");
    await notificar(tx, negociacao.id, "ADMIN", null, "Leilão encerrado com vencedor", `Negociação ${negociacao.codigo} criada. Comprador aguardando pagamento.`);

    return { ok: true, resultado: "ENCERRADO_COM_VENCEDOR", negociacao_id: negociacao.id, codigo: negociacao.codigo, maiorLance };
  });
}

/** Fecha automaticamente todos os leilões vencidos e expira prazos de pagamento. */
export async function processarFechamentos() {
  const d = requireDb();
  const agora = new Date().toISOString();

  const pendentes = await d.execute(sql`
    SELECT l.id FROM leiloes l
    LEFT JOIN leiloes_resultado r ON r.leilao_id = l.id
    WHERE l.fim_em <= ${agora} AND l.status <> 'CANCELADO' AND r.id IS NULL
  `);
  for (const row of (rowsOf(pendentes) || [])) {
    try { await fecharLeilao(row.id); } catch { /* segue para os demais */ }
  }

  // 14. Prazo vencido sem pagamento
  const vencidas = await d.execute(sql`
    UPDATE negociacoes SET status = 'PAGAMENTO_NAO_REALIZADO', atualizado_em = now()
    WHERE status = 'AGUARDANDO_PAGAMENTO' AND prazo_pagamento_em <= ${agora}
    RETURNING id, codigo, veiculo_id
  `);
  for (const n of (rowsOf(vencidas) || [])) {
    await d.execute(sql`
      INSERT INTO negociacoes_timeline (negociacao_id, evento, detalhe)
      VALUES (${n.id}::uuid, 'Pagamento não realizado dentro do prazo.', 'Alteração automática pelo sistema.')
    `);
    await d.execute(sql`
      INSERT INTO negociacoes_notificacoes (negociacao_id, publico, titulo, mensagem)
      VALUES (${n.id}::uuid, 'ADMIN', 'Pagamento não realizado dentro do prazo', ${`Negociação ${n.codigo} aguardando decisão.`})
    `);
    await d.execute(sql`UPDATE veiculos SET status = 'PAGAMENTO_NAO_REALIZADO' WHERE id = ${n.veiculo_id}::uuid`);
  }

  return { ok: true };
}

export async function listarNegociacoesAdmin(status?: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT n.*, a.titulo, a.codigo_publico,
      pv.nome as vendedor_nome, pc.nome as comprador_nome
    FROM negociacoes n
    JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    JOIN profiles pv ON pv.id = n.vendedor_id
    JOIN profiles pc ON pc.id = n.comprador_id

    ${status ? sql`WHERE n.status = ${status}` : sql``}
    ORDER BY n.criado_em DESC
  `);
  return rowsOf(res) || [];
}

export async function getNegociacao(id: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT n.*, a.titulo, a.codigo_publico, a.slug,
      pv.nome as vendedor_nome, pc.nome as comprador_nome,
      (SELECT foto_url FROM anuncios_fotos WHERE anuncio_id = n.anuncio_id ORDER BY eh_capa DESC, ordem ASC LIMIT 1) as foto_capa,
      (SELECT ranking FROM leiloes_resultado WHERE leilao_id = n.leilao_id) as ranking
    FROM negociacoes n
    JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    JOIN profiles pv ON pv.id = n.vendedor_id
    JOIN profiles pc ON pc.id = n.comprador_id
    WHERE n.id = ${id}::uuid
  `);
  const negociacao = rowsOf(res)?.[0];
  if (!negociacao) return null;

  const tl = await d.execute(sql`
    SELECT evento, detalhe, criado_em FROM negociacoes_timeline
    WHERE negociacao_id = ${id}::uuid ORDER BY criado_em ASC
  `);
  return { ...negociacao, timeline: rowsOf(tl) || [], servidor_agora: new Date().toISOString() };
}

export async function getNegociacoesComprador(compradorId: string) {
  const d = requireDb();
  const ativas = await d.execute(sql`
    SELECT n.*, a.titulo, a.codigo_publico,
      (SELECT foto_url FROM anuncios_fotos WHERE anuncio_id = n.anuncio_id ORDER BY eh_capa DESC, ordem ASC LIMIT 1) as foto_capa
    FROM negociacoes n
    JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    WHERE n.comprador_id = ${compradorId}::uuid AND n.status <> 'CANCELADA'
    ORDER BY n.criado_em DESC
  `);

  // Participações encerradas: leilões em que deu lance e não venceu
  const encerradas = await d.execute(sql`
    SELECT DISTINCT a.titulo, a.slug, a.codigo_publico, r.maior_lance, r.resultado, r.fechado_em
    FROM lances l
    JOIN leiloes le ON le.id = l.leilao_id
    JOIN anuncios_veiculo a ON a.veiculo_id = le.veiculo_id
    JOIN leiloes_resultado r ON r.leilao_id = le.id
    WHERE l.comprador_id = ${compradorId}::uuid
      AND (r.vencedor_id IS NULL OR r.vencedor_id <> ${compradorId}::uuid)
    ORDER BY r.fechado_em DESC
  `);

  return {
    em_andamento: rowsOf(ativas) || [],
    encerradas: rowsOf(encerradas) || [],
    servidor_agora: new Date().toISOString(),
  };
}

export async function getNegociacoesVendedor(vendedorId: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT n.id, n.codigo, n.valor_venda, n.valor_previsto_vendedor, n.status, n.prazo_pagamento_em, n.criado_em,
      a.titulo, a.codigo_publico,
      (SELECT foto_url FROM anuncios_fotos WHERE anuncio_id = n.anuncio_id ORDER BY eh_capa DESC, ordem ASC LIMIT 1) as foto_capa
    FROM negociacoes n
    JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    WHERE n.vendedor_id = ${vendedorId}::uuid AND n.status <> 'CANCELADA'
    ORDER BY n.criado_em DESC
  `);
  return rowsOf(res) || [];
}

/** Bloqueio de edição do veículo quando existe vencedor confirmado. */
export async function veiculoBloqueadoPorNegociacao(veiculoId: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT 1 FROM negociacoes
    WHERE veiculo_id = ${veiculoId}::uuid
      AND status IN ('AGUARDANDO_PAGAMENTO','PAGAMENTO_EM_PROCESSAMENTO','PAGAMENTO_CONFIRMADO')
    LIMIT 1
  `);
  return (rowsOf(res) || []).length > 0;
}

export async function cancelarNegociacao(params: {
  id: string; motivo: string; mensagem_comprador?: string; mensagem_vendedor?: string; admin_id: string;
}) {
  const d = requireDb();
  if (!params.motivo?.trim()) throw new Error("Motivo interno é obrigatório.");

  return await d.transaction(async (tx) => {
    const res = await tx.execute(sql`
      UPDATE negociacoes SET status = 'CANCELADA', motivo_cancelamento = ${params.motivo},
        mensagem_comprador = ${params.mensagem_comprador || null},
        mensagem_vendedor = ${params.mensagem_vendedor || null},
        cancelado_por = ${params.admin_id}::uuid, atualizado_em = now()
      WHERE id = ${params.id}::uuid RETURNING codigo
    `);
    const neg = rowsOf(res)?.[0];
    if (!neg) throw new Error("Negociação não encontrada.");
    await registrarEvento(tx, params.id, "Negociação cancelada pelo administrativo.", params.motivo, params.admin_id);
    return { ok: true, codigo: neg.codigo };
  });
}

export async function getIndicadoresNegociacao() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'AGUARDANDO_PAGAMENTO')::int as aguardando_pagamento,
      count(*) FILTER (WHERE status = 'PAGAMENTO_NAO_REALIZADO')::int as pagamentos_vencidos,
      count(*) FILTER (WHERE status = 'PAGAMENTO_CONFIRMADO')::int as pagamentos_confirmados
    FROM negociacoes
  `);
  return rowsOf(res)?.[0] || { aguardando_pagamento: 0, pagamentos_vencidos: 0, pagamentos_confirmados: 0 };
}

export async function listarLeiloesSemVenda() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT r.*, a.titulo, a.codigo_publico
    FROM leiloes_resultado r
    JOIN leiloes l ON l.id = r.leilao_id
    JOIN anuncios_veiculo a ON a.veiculo_id = l.veiculo_id
    WHERE r.resultado IN ('ENCERRADO_SEM_MINIMO','ENCERRADO_SEM_OFERTAS')
    ORDER BY r.fechado_em DESC
  `);
  return rowsOf(res) || [];
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
