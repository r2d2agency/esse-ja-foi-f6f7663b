import { sql } from "drizzle-orm";
import { db } from "./index";
import { getProvider } from "./provedores/pix.server";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export const STATUS_COBRANCA = [
  "AGUARDANDO",
  "PROCESSANDO",
  "PAGO",
  "EXPIRADO",
  "FALHOU",
  "CANCELADO",
  "DIVERGENCIA",
  "DUPLICADO",
] as const;

export async function ensurePagamentosSchema() {
  const d = requireDb();

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS cobrancas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      negociacao_id uuid NOT NULL REFERENCES negociacoes(id) ON DELETE CASCADE,
      referencia text UNIQUE NOT NULL,
      forma text NOT NULL DEFAULT 'PIX',
      provedor text NOT NULL,
      id_externo text,
      qr_code text,
      copia_e_cola text,
      valor_esperado numeric(12,2) NOT NULL,
      valor_recebido numeric(12,2),
      status text NOT NULL DEFAULT 'AGUARDANDO',
      motivo text,
      expira_em timestamptz NOT NULL,
      confirmado_em timestamptz,
      criado_por uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_cobrancas_neg ON cobrancas(negociacao_id, status);`);

  /** Eventos externos: garantia de idempotência por identificador único do provedor. */
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS cobrancas_eventos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cobranca_id uuid REFERENCES cobrancas(id) ON DELETE CASCADE,
      evento_externo_id text UNIQUE NOT NULL,
      tipo text NOT NULL,
      valor numeric(12,2),
      payload jsonb,
      processado boolean DEFAULT false,
      criado_em timestamptz DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS movimentos_financeiros (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      negociacao_id uuid NOT NULL REFERENCES negociacoes(id) ON DELETE CASCADE,
      cobranca_id uuid REFERENCES cobrancas(id),
      tipo text NOT NULL,
      direcao text NOT NULL DEFAULT 'ENTRADA',
      valor numeric(12,2) NOT NULL,
      status text NOT NULL DEFAULT 'CONFIRMADO',
      criado_em timestamptz DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS pagamentos_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cobranca_id uuid REFERENCES cobrancas(id) ON DELETE CASCADE,
      acao text NOT NULL,
      detalhe text,
      autor_id uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now()
    );
  `);
}

async function log(exec: any, cobrancaId: string | null, acao: string, detalhe?: string, autorId?: string | null) {
  await exec.execute(sql`
    INSERT INTO pagamentos_logs (cobranca_id, acao, detalhe, autor_id)
    VALUES (${cobrancaId}::uuid, ${acao}, ${detalhe || null}, ${autorId || null}::uuid)
  `);
}

async function timeline(exec: any, negociacaoId: string, evento: string, detalhe?: string) {
  await exec.execute(sql`
    INSERT INTO negociacoes_timeline (negociacao_id, evento, detalhe)
    VALUES (${negociacaoId}::uuid, ${evento}, ${detalhe || null})
  `);
}

async function notificar(exec: any, negociacaoId: string, publico: string, destinatarioId: string | null, titulo: string, mensagem: string) {
  await exec.execute(sql`
    INSERT INTO negociacoes_notificacoes (negociacao_id, destinatario_id, publico, titulo, mensagem)
    VALUES (${negociacaoId}::uuid, ${destinatarioId}::uuid, ${publico}, ${titulo}, ${mensagem})
  `);
}

async function carregarNegociacao(d: any, negociacaoId: string) {
  const res = await d.execute(sql`
    SELECT n.*, a.titulo, a.codigo_publico,
      (SELECT foto_url FROM anuncios_fotos WHERE anuncio_id = n.anuncio_id ORDER BY eh_capa DESC, ordem ASC LIMIT 1) as foto_capa
    FROM negociacoes n JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    WHERE n.id = ${negociacaoId}::uuid
  `);
  return rowsOf(res)?.[0] || null;
}

/**
 * Cobrança do comprador: reutiliza cobrança válida, nunca duplica ao recarregar a página.
 * Fonte da verdade do valor é sempre a negociação no backend.
 */
export async function obterOuCriarCobranca(negociacaoId: string, compradorId: string) {
  const d = requireDb();
  const neg = await carregarNegociacao(d, negociacaoId);
  if (!neg) throw new Error("Negociação não encontrada.");
  if (neg.comprador_id !== compradorId) throw new Error("Esta negociação não pertence a você.");

  const agora = new Date();

  if (neg.status === "PAGAMENTO_CONFIRMADO") {
    const paga = await d.execute(sql`SELECT * FROM cobrancas WHERE negociacao_id = ${negociacaoId}::uuid AND status = 'PAGO' ORDER BY criado_em DESC LIMIT 1`);
    return { negociacao: neg, cobranca: rowsOf(paga)?.[0] || null, servidor_agora: agora.toISOString() };
  }
  if (neg.status !== "AGUARDANDO_PAGAMENTO" && neg.status !== "PAGAMENTO_EM_PROCESSAMENTO") {
    return { negociacao: neg, cobranca: null, servidor_agora: agora.toISOString() };
  }
  if (new Date(neg.prazo_pagamento_em) <= agora) {
    await expirarCobrancasVencidas();
    const atualizada = await carregarNegociacao(d, negociacaoId);
    return { negociacao: atualizada, cobranca: null, servidor_agora: agora.toISOString() };
  }

  const ativaRes = await d.execute(sql`
    SELECT * FROM cobrancas
    WHERE negociacao_id = ${negociacaoId}::uuid AND status IN ('AGUARDANDO','PROCESSANDO') AND expira_em > now()
    ORDER BY criado_em DESC LIMIT 1
  `);
  const ativa = rowsOf(ativaRes)?.[0];
  if (ativa) {
    await log(d, ativa.id, "CONSULTA", "Comprador acessou a tela de pagamento.");
    return { negociacao: neg, cobranca: ativa, servidor_agora: agora.toISOString() };
  }

  const provider = getProvider();
  const referencia = `${neg.codigo}-${Date.now().toString(36).toUpperCase()}`;
  const valor = Number(neg.valor_venda);
  const expiraEm = new Date(neg.prazo_pagamento_em);

  let externa;
  try {
    externa = await provider.criarCobranca({
      valor,
      referencia,
      descricao: `Pagamento da negociação ${neg.codigo}`,
      expiraEm,
    });
  } catch (e: any) {
    await log(d, null, "ERRO_PROVEDOR", `Falha ao gerar cobrança de ${neg.codigo}: ${e?.message}`);
    throw new Error("PROVEDOR_INDISPONIVEL");
  }

  const inserida = await d.execute(sql`
    INSERT INTO cobrancas (negociacao_id, referencia, forma, provedor, id_externo, qr_code, copia_e_cola, valor_esperado, status, expira_em)
    VALUES (${negociacaoId}::uuid, ${referencia}, 'PIX', ${provider.id}, ${externa.id_externo}, ${externa.qr_code},
            ${externa.copia_e_cola}, ${valor}, 'AGUARDANDO', ${expiraEm.toISOString()}::timestamptz)
    RETURNING *
  `);
  const cobranca = rowsOf(inserida)[0];

  await log(d, cobranca.id, "CRIACAO", `Cobrança Pix criada no provedor ${provider.id}.`);
  await timeline(d, negociacaoId, "Cobrança Pix gerada.", `Referência ${referencia}`);
  await notificar(d, negociacaoId, "COMPRADOR", neg.comprador_id, "Seu Pix foi gerado.", `Conclua o pagamento de R$ ${valor.toFixed(2)} dentro do prazo.`);

  return { negociacao: neg, cobranca, servidor_agora: agora.toISOString() };
}

/** "Já fiz o pagamento": apenas consulta o provedor, nunca confirma por conta própria. */
export async function verificarPagamento(cobrancaId: string) {
  const d = requireDb();
  const res = await d.execute(sql`SELECT * FROM cobrancas WHERE id = ${cobrancaId}::uuid`);
  const cobranca = rowsOf(res)?.[0];
  if (!cobranca) throw new Error("Cobrança não encontrada.");
  if (cobranca.status === "PAGO") return { status: "PAGO" };

  const provider = getProvider();
  await log(d, cobranca.id, "CONSULTA", "Verificação solicitada pelo comprador.");
  const externo = await provider.consultarCobranca(cobranca.id_externo);

  if (externo.status === "PAGO") {
    await registrarEventoPagamento({
      evento_externo_id: `consulta-${cobranca.id_externo}`,
      id_externo: cobranca.id_externo,
      tipo: "PAGAMENTO_CONFIRMADO",
      valor: externo.valor_pago ?? Number(cobranca.valor_esperado),
      payload: externo,
    });
    return { status: "PAGO" };
  }

  await d.execute(sql`UPDATE cobrancas SET status = 'PROCESSANDO', atualizado_em = now() WHERE id = ${cobranca.id}::uuid AND status = 'AGUARDANDO'`);
  return { status: "PROCESSANDO" };
}

/**
 * Processamento idempotente de eventos do provedor (webhook ou consulta).
 * Um evento externo só é aplicado uma única vez.
 */
export async function registrarEventoPagamento(evento: {
  evento_externo_id: string;
  id_externo: string;
  tipo: string;
  valor?: number | undefined;
  payload?: any;
}) {
  const d = requireDb();

  const cRes = await d.execute(sql`SELECT * FROM cobrancas WHERE id_externo = ${evento.id_externo} LIMIT 1`);
  const cobranca = rowsOf(cRes)?.[0];
  if (!cobranca) return { ok: false, motivo: "COBRANCA_DESCONHECIDA" };

  return await d.transaction(async (tx) => {
    const dup = await tx.execute(sql`
      INSERT INTO cobrancas_eventos (cobranca_id, evento_externo_id, tipo, valor, payload)
      VALUES (${cobranca.id}::uuid, ${evento.evento_externo_id}, ${evento.tipo}, ${evento.valor ?? null}, ${JSON.stringify(evento.payload || {})}::jsonb)
      ON CONFLICT (evento_externo_id) DO NOTHING
      RETURNING id
    `);
    if (!(rowsOf(dup) || []).length) {
      return { ok: true, idempotente: true };
    }

    if (evento.tipo !== "PAGAMENTO_CONFIRMADO") {
      await tx.execute(sql`UPDATE cobrancas SET status = ${evento.tipo === "PAGAMENTO_FALHOU" ? "FALHOU" : "PROCESSANDO"}, atualizado_em = now() WHERE id = ${cobranca.id}::uuid`);
      await log(tx, cobranca.id, "WEBHOOK", `Evento ${evento.tipo} recebido.`);
      return { ok: true };
    }

    const esperado = Number(cobranca.valor_esperado);
    const recebido = Number(evento.valor ?? esperado);
    const neg = await carregarNegociacao(tx, cobranca.negociacao_id);

    // Pagamento duplicado para a mesma cobrança
    if (cobranca.status === "PAGO") {
      await tx.execute(sql`UPDATE cobrancas SET status = 'DUPLICADO', motivo = 'Mais de um pagamento identificado para a mesma cobrança.', atualizado_em = now() WHERE id = ${cobranca.id}::uuid`);
      await notificar(tx, cobranca.negociacao_id, "ADMIN", null, "Pagamento duplicado", `Cobrança ${cobranca.referencia} recebeu mais de um pagamento.`);
      await log(tx, cobranca.id, "DUPLICIDADE", `Valor adicional recebido: ${recebido}`);
      return { ok: true, duplicado: true };
    }

    // Pagamento após a expiração
    const aposExpiracao = new Date(cobranca.expira_em) < new Date();
    if (aposExpiracao) {
      await tx.execute(sql`UPDATE cobrancas SET status = 'DIVERGENCIA', valor_recebido = ${recebido}, motivo = 'Pagamento recebido após expiração.', atualizado_em = now() WHERE id = ${cobranca.id}::uuid`);
      await notificar(tx, cobranca.negociacao_id, "ADMIN", null, "Pagamento recebido após expiração", `Cobrança ${cobranca.referencia}. Requer tratamento administrativo.`);
      await timeline(tx, cobranca.negociacao_id, "Pagamento recebido após expiração.", "Aguardando decisão administrativa.");
      return { ok: true, apos_expiracao: true };
    }

    // Divergência de valor
    if (Math.abs(recebido - esperado) > 0.009) {
      await tx.execute(sql`UPDATE cobrancas SET status = 'DIVERGENCIA', valor_recebido = ${recebido}, motivo = 'Valor recebido diferente do esperado.', atualizado_em = now() WHERE id = ${cobranca.id}::uuid`);
      await notificar(tx, cobranca.negociacao_id, "ADMIN", null, "Divergência de valor", `Esperado ${esperado} / recebido ${recebido} na cobrança ${cobranca.referencia}.`);
      await timeline(tx, cobranca.negociacao_id, "Divergência financeira identificada.", `Esperado ${esperado} • recebido ${recebido}`);
      return { ok: true, divergencia: true };
    }

    // Conciliado e confirmado
    await tx.execute(sql`
      UPDATE cobrancas SET status = 'PAGO', valor_recebido = ${recebido}, confirmado_em = now(), atualizado_em = now()
      WHERE id = ${cobranca.id}::uuid
    `);
    await tx.execute(sql`
      UPDATE negociacoes SET status = 'PAGAMENTO_CONFIRMADO', atualizado_em = now()
      WHERE id = ${cobranca.negociacao_id}::uuid
    `);
    await tx.execute(sql`
      UPDATE veiculos SET status = 'AGUARDANDO_ENTREGA' WHERE id = ${neg.veiculo_id}::uuid
    `);
    await tx.execute(sql`
      INSERT INTO movimentos_financeiros (negociacao_id, cobranca_id, tipo, direcao, valor, status)
      VALUES (${cobranca.negociacao_id}::uuid, ${cobranca.id}::uuid, 'PAGAMENTO_COMPRADOR', 'ENTRADA', ${recebido}, 'CONFIRMADO')
    `);

    // Ledger - Entrada do Comprador
    await tx.execute(sql`
      INSERT INTO financeiro_ledger (negociacao_id, tipo, direcao, valor, referencia_externa, detalhe)
      VALUES (${cobranca.negociacao_id}::uuid, 'ENTRADA_COMPRADOR', 'ENTRADA', ${recebido}, ${cobranca.id_externo}, 'Pagamento do comprador confirmado via Pix.')
    `);

    await timeline(tx, cobranca.negociacao_id, "Pagamento confirmado pelo provedor.", `Transação ${cobranca.id_externo}`);
    await timeline(tx, cobranca.negociacao_id, "Conciliação concluída.", `Esperado e recebido: R$ ${recebido.toFixed(2)}`);
    await timeline(tx, cobranca.negociacao_id, "Negociação atualizada para Pagamento confirmado.");
    await timeline(tx, cobranca.negociacao_id, "Vendedor notificado.");

    await notificar(tx, cobranca.negociacao_id, "COMPRADOR", neg.comprador_id, "Seu pagamento foi confirmado.", "Agora vamos seguir para a etapa de entrega do veículo.");
    await notificar(tx, cobranca.negociacao_id, "VENDEDOR", neg.vendedor_id, "Pagamento confirmado.", "Agora vamos organizar a entrega do seu veículo.");
    await notificar(tx, cobranca.negociacao_id, "ADMIN", null, "Novo pagamento confirmado", `Negociação ${neg.codigo} conciliada.`);
    await log(tx, cobranca.id, "CONFIRMACAO", "Pagamento confirmado e conciliado.");

    return { ok: true, confirmado: true };
  });
}

/**
 * Registro manual de pagamento (TED, Depósito, Dinheiro).
 * Permite que o administrativo baixe uma negociação que foi paga fora da plataforma.
 */
export async function confirmarPagamentoManual(params: {
  negociacao_id: string;
  valor: number;
  referencia: string;
  admin_id: string;
}) {
  const d = requireDb();
  
  return await d.transaction(async (tx) => {
    const negRes = await tx.execute(sql`
      SELECT n.*, a.veiculo_id FROM negociacoes n 
      JOIN anuncios_veiculo a ON a.id = n.anuncio_id
      WHERE n.id = ${params.negociacao_id}::uuid FOR UPDATE
    `);
    const neg = rowsOf(negRes)?.[0];
    if (!neg) throw new Error("Negociação não encontrada.");
    
    // 1. Atualizar Negociação
    await tx.execute(sql`
      UPDATE negociacoes SET status = 'PAGAMENTO_CONFIRMADO', atualizado_em = now()
      WHERE id = ${params.negociacao_id}::uuid
    `);
    
    // 2. Atualizar Veículo
    await tx.execute(sql`
      UPDATE veiculos SET status = 'AGUARDANDO_ENTREGA' WHERE id = ${neg.veiculo_id}::uuid
    `);
    
    // 3. Ledger - Entrada Manual
    await tx.execute(sql`
      INSERT INTO financeiro_ledger (negociacao_id, tipo, direcao, valor, referencia_externa, detalhe)
      VALUES (${params.negociacao_id}::uuid, 'ENTRADA_MANUAL', 'ENTRADA', ${params.valor}, ${params.referencia}, 'Pagamento informado manualmente pelo administrativo.')
    `);
    
    // 4. Timeline
    await timeline(tx, params.negociacao_id, "Pagamento confirmado manualmente.", `Referência: ${params.referencia} • Valor: R$ ${params.valor.toFixed(2)}`);
    
    // 5. Notificações
    await notificar(tx, params.negociacao_id, "COMPRADOR", neg.comprador_id, "Seu pagamento manual foi confirmado.", "O administrativo confirmou o recebimento do seu pagamento.");
    await notificar(tx, params.negociacao_id, "VENDEDOR", neg.vendedor_id, "Pagamento do veículo confirmado.", "O comprador realizou o pagamento via TED/Depósito e o sistema foi atualizado.");
    await notificar(tx, params.negociacao_id, "ADMIN", null, "Pagamento manual registrado", `Negociação ${neg.codigo} baixada manualmente por ${params.admin_id}.`);

    return { ok: true };
  });
}

/** Expira cobranças e negociações vencidas (horário do servidor como fonte da verdade). */
export async function expirarCobrancasVencidas() {
  const d = requireDb();
  const venc = await d.execute(sql`
    UPDATE cobrancas SET status = 'EXPIRADO', atualizado_em = now()
    WHERE status IN ('AGUARDANDO','PROCESSANDO') AND expira_em <= now()
    RETURNING id, negociacao_id, referencia
  `);
  for (const c of (rowsOf(venc) || [])) {
    await d.execute(sql`
      UPDATE negociacoes SET status = 'PAGAMENTO_NAO_REALIZADO', atualizado_em = now()
      WHERE id = ${c.negociacao_id}::uuid AND status IN ('AGUARDANDO_PAGAMENTO','PAGAMENTO_EM_PROCESSAMENTO')
    `);
    await timeline(d, c.negociacao_id, "Cobrança Pix expirada.", `Referência ${c.referencia}`);
    await notificar(d, c.negociacao_id, "ADMIN", null, "Pagamento expirado", `Cobrança ${c.referencia} venceu sem confirmação.`);
    await log(d, c.id, "EXPIRACAO", "Prazo encerrado sem confirmação financeira.");
  }
  return { expiradas: (rowsOf(venc) || []).length };
}

export async function listarPagamentosAdmin(status?: string) {
  const d = requireDb();
  await expirarCobrancasVencidas();
  const res = await d.execute(sql`
    SELECT c.*, n.codigo, n.valor_venda, a.titulo, a.codigo_publico,
      comp.nome as comprador_nome
    FROM cobrancas c
    JOIN negociacoes n ON n.id = c.negociacao_id
    JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    LEFT JOIN profiles comp ON comp.id = n.comprador_id
    ${status ? sql`WHERE c.status = ${status}` : sql``}
    ORDER BY c.criado_em DESC
  `);
  return rowsOf(res) || [];
}

export async function getPagamento(cobrancaId: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT c.*, n.codigo, n.valor_venda, n.comprador_id, a.titulo, a.codigo_publico, comp.nome as comprador_nome
    FROM cobrancas c
    JOIN negociacoes n ON n.id = c.negociacao_id
    JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    LEFT JOIN profiles comp ON comp.id = n.comprador_id
    WHERE c.id = ${cobrancaId}::uuid
  `);
  const cobranca = rowsOf(res)?.[0];
  if (!cobranca) return null;
  const eventos = await d.execute(sql`SELECT tipo, valor, criado_em FROM cobrancas_eventos WHERE cobranca_id = ${cobrancaId}::uuid ORDER BY criado_em`);
  const logs = await d.execute(sql`SELECT acao, detalhe, criado_em FROM pagamentos_logs WHERE cobranca_id = ${cobrancaId}::uuid ORDER BY criado_em DESC LIMIT 50`);
  return { ...cobranca, eventos: rowsOf(eventos) || [], logs: rowsOf(logs) || [] };
}

/** Pagamento vinculado a uma negociação, para exibição no Admin e comprovante. */
export async function getPagamentoDaNegociacao(negociacaoId: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT * FROM cobrancas WHERE negociacao_id = ${negociacaoId}::uuid ORDER BY criado_em DESC LIMIT 1
  `);
  return rowsOf(res)?.[0] || null;
}

export async function gerarNovaCobranca(params: { negociacao_id: string; motivo: string; admin_id: string }) {
  const d = requireDb();
  if (!params.motivo?.trim()) throw new Error("Motivo é obrigatório.");
  await d.execute(sql`
    UPDATE cobrancas SET status = 'CANCELADO', motivo = ${params.motivo}, atualizado_em = now()
    WHERE negociacao_id = ${params.negociacao_id}::uuid AND status IN ('AGUARDANDO','PROCESSANDO')
  `);
  await d.execute(sql`
    UPDATE negociacoes SET status = 'AGUARDANDO_PAGAMENTO', atualizado_em = now()
    WHERE id = ${params.negociacao_id}::uuid AND status = 'PAGAMENTO_NAO_REALIZADO'
  `);
  await timeline(d, params.negociacao_id, "Nova cobrança autorizada pelo Admin.", params.motivo);
  const neg = await carregarNegociacao(d, params.negociacao_id);
  return obterOuCriarCobranca(params.negociacao_id, neg.comprador_id);
}

export async function prorrogarPrazoPagamento(params: { negociacao_id: string; horas: number; motivo: string; admin_id: string }) {
  const d = requireDb();
  if (!params.motivo?.trim()) throw new Error("Motivo interno é obrigatório.");
  await d.execute(sql`
    UPDATE negociacoes
    SET prazo_pagamento_em = GREATEST(prazo_pagamento_em, now()) + (${params.horas} || ' hours')::interval,
        status = CASE WHEN status = 'PAGAMENTO_NAO_REALIZADO' THEN 'AGUARDANDO_PAGAMENTO' ELSE status END,
        atualizado_em = now()
    WHERE id = ${params.negociacao_id}::uuid
  `);
  const neg = await carregarNegociacao(d, params.negociacao_id);
  await d.execute(sql`
    UPDATE cobrancas SET expira_em = ${new Date(neg.prazo_pagamento_em).toISOString()}::timestamptz,
      status = CASE WHEN status = 'EXPIRADO' THEN 'AGUARDANDO' ELSE status END, atualizado_em = now()
    WHERE negociacao_id = ${params.negociacao_id}::uuid AND status IN ('AGUARDANDO','PROCESSANDO','EXPIRADO')
  `);
  await timeline(d, params.negociacao_id, "Prazo de pagamento prorrogado.", `${params.horas}h — ${params.motivo}`);
  await notificar(d, params.negociacao_id, "COMPRADOR", neg.comprador_id, "Existe uma atualização no seu pagamento.", "O prazo de pagamento foi prorrogado.");
  return { ok: true };
}

export async function cancelarCobrancasDaNegociacao(negociacaoId: string) {
  const d = requireDb();
  const provider = getProvider();
  const ativas = await d.execute(sql`SELECT id, id_externo FROM cobrancas WHERE negociacao_id = ${negociacaoId}::uuid AND status IN ('AGUARDANDO','PROCESSANDO')`);
  for (const c of (rowsOf(ativas) || [])) {
    try { await provider.cancelarCobranca(c.id_externo); } catch { /* provedor indisponível: status interno prevalece */ }
    await d.execute(sql`UPDATE cobrancas SET status = 'CANCELADO', atualizado_em = now() WHERE id = ${c.id}::uuid`);
    await log(d, c.id, "CANCELAMENTO", "Cobrança cancelada junto com a negociação.");
  }
  return { ok: true };
}

export async function getIndicadoresPagamentos() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'AGUARDANDO') as aguardando,
      COUNT(*) FILTER (WHERE status = 'PROCESSANDO') as processando,
      COUNT(*) FILTER (WHERE status = 'PAGO') as pagos,
      COUNT(*) FILTER (WHERE status = 'EXPIRADO') as expirados,
      COUNT(*) FILTER (WHERE status IN ('DIVERGENCIA','DUPLICADO')) as analise
    FROM cobrancas
  `);
  return rowsOf(res)?.[0] || {};
}

/** Comprovante do sistema — somente dados da compra, sem informações internas. */
export async function getComprovante(cobrancaId: string, compradorId: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT c.id, c.referencia, c.forma, c.provedor, c.id_externo, c.valor_recebido, c.valor_esperado,
      c.status, c.confirmado_em, c.criado_em, n.codigo, n.comprador_id, a.titulo, a.codigo_publico,
      comp.nome as comprador_nome
    FROM cobrancas c
    JOIN negociacoes n ON n.id = c.negociacao_id
    JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    LEFT JOIN profiles comp ON comp.id = n.comprador_id
    WHERE c.id = ${cobrancaId}::uuid AND c.status = 'PAGO'
  `);
  const row = rowsOf(res)?.[0];
  if (!row || row.comprador_id !== compradorId) return null;
  const { comprador_id, ...comprovante } = row;
  return comprovante;
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
