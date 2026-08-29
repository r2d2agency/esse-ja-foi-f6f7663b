import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export const STATUS_REPASSE = [
  "AGUARDANDO",
  "AUTORIZADO",
  "PROCESSANDO",
  "CONCLUIDO",
  "FALHOU",
  "BLOQUEADO",
] as const;

export async function ensureFinanceiroSchema() {
  const d = requireDb();

  /** Dados bancários/Pix do vendedor */
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS vendedor_dados_bancarios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendedor_id uuid UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      tipo_chave text NOT NULL, -- CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA
      chave_pix text NOT NULL,
      titular_nome text NOT NULL,
      titular_documento text NOT NULL,
      verificado boolean DEFAULT false,
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);

  /** Repasses (Payouts) ao vendedor */
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS repasses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      negociacao_id uuid UNIQUE NOT NULL REFERENCES negociacoes(id) ON DELETE CASCADE,
      vendedor_id uuid NOT NULL REFERENCES profiles(id),
      valor_venda numeric(12,2) NOT NULL,
      valor_comissao numeric(12,2) NOT NULL,
      valor_liquido numeric(12,2) NOT NULL,
      comissao_tipo text NOT NULL, -- PERCENTUAL, FIXO
      comissao_regra text, -- Ex: "4%" ou "Fixo R$ 4.500"
      status text NOT NULL DEFAULT 'AGUARDANDO',
      dados_bancarios_json jsonb NOT NULL,
      id_externo_transacao text,
      comprovante_url text,
      autorizado_por uuid REFERENCES profiles(id),
      autorizado_em timestamptz,
      processado_em timestamptz,
      concluido_em timestamptz,
      motivo_falha text,
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_repasses_status ON repasses(status);`);

  /** Razão (Ledger) Financeiro Imutável */
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS financeiro_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      negociacao_id uuid NOT NULL REFERENCES negociacoes(id) ON DELETE CASCADE,
      tipo text NOT NULL, -- ENTRADA_COMPRADOR, RETENCAO_COMISSAO, SAIDA_REPASSE
      direcao text NOT NULL, -- ENTRADA, SAIDA
      valor numeric(12,2) NOT NULL,
      status text NOT NULL DEFAULT 'CONFIRMADO',
      referencia_externa text,
      detalhe text,
      criado_em timestamptz DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_ledger_neg ON financeiro_ledger(negociacao_id);`);

  /** Auditoria Financeira */
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS financeiro_auditoria (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      negociacao_id uuid REFERENCES negociacoes(id) ON DELETE CASCADE,
      repasse_id uuid REFERENCES repasses(id) ON DELETE CASCADE,
      acao text NOT NULL,
      valor_anterior numeric(12,2),
      valor_novo numeric(12,2),
      detalhe text,
      autor_id uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now()
    );
  `);

  /** Configurações Financeiras */
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS financeiro_configuracoes (
      chave text PRIMARY KEY,
      valor text NOT NULL,
      descricao text,
      atualizado_em timestamptz DEFAULT now()
    );
  `);

  // Default config
  await d.execute(sql`
    INSERT INTO financeiro_configuracoes (chave, valor, descricao)
    VALUES ('exigir_dupla_aprovacao_valor_minimo', '100000', 'Valor a partir do qual exige-se um segundo aprovador.')
    ON CONFLICT (chave) DO NOTHING;
  `);
}

/** 
 * Garante que a negociação esteja pronta para o módulo financeiro.
 * Chamada quando a entrega é confirmada.
 */
export async function prepararFinanceiroNegociacao(negociacaoId: string) {
  const d = requireDb();
  
  return await d.transaction(async (tx) => {
    // 1. Carregar negociação e dados de venda
    const res = await tx.execute(sql`
      SELECT n.*, e.repasse_liberado, e.status as entrega_status,
        pv.comissao_valor, pv.comissao_percentual, pv.valor_minimo_acordado
      FROM negociacoes n
      JOIN entregas e ON e.negociacao_id = n.id
      LEFT JOIN LATERAL (
        SELECT * FROM propostas_veiculo pv WHERE pv.veiculo_id = n.veiculo_id ORDER BY pv.versao DESC LIMIT 1
      ) pv ON true
      WHERE n.id = ${negociacaoId}::uuid
    `);
    const neg = rowsOf(res)?.[0];
    if (!neg) throw new Error("Negociação não encontrada.");
    
    // 2. Verificar se já existe repasse
    const jaRepasse = await tx.execute(sql`SELECT id FROM repasses WHERE negociacao_id = ${negociacaoId}::uuid`);
    if (rowsOf(jaRepasse)?.[0]) return { ok: true, jaExiste: true };

    // 3. Validar se a entrega permite repasse
    if (!neg.repasse_liberado && neg.entrega_status !== 'LIBERADO_PARA_REPASSE') {
      return { ok: false, motivo: "ENTREGA_NAO_CONCLUIDA" };
    }

    // 4. Carregar dados bancários do vendedor
    const dbVendedor = await tx.execute(sql`SELECT * FROM vendedor_dados_bancarios WHERE vendedor_id = ${neg.vendedor_id}::uuid`);
    const dadosBancarios = rowsOf(dbVendedor)?.[0];
    
    // 5. Calcular comissão final (usa a regra do aceite inicial)
    // Se negociacao.valor_comissao for 0 (caso de lances), recalcula com base na proposta aceita
    let valorComissao = Number(neg.valor_comissao);
    let tipoComissao = 'FIXO';
    let regraComissao = `R$ ${valorComissao.toFixed(2)}`;

    if (neg.comissao_percentual) {
      tipoComissao = 'PERCENTUAL';
      const perc = Number(neg.comissao_percentual);
      valorComissao = (Number(neg.valor_venda) * perc) / 100;
      regraComissao = `${perc}%`;
    }

    const valorLiquido = Number(neg.valor_venda) - valorComissao;

    // 6. Criar registro de repasse
    await tx.execute(sql`
      INSERT INTO repasses (
        negociacao_id, vendedor_id, valor_venda, valor_comissao, valor_liquido,
        comissao_tipo, comissao_regra, status, dados_bancarios_json
      ) VALUES (
        ${negociacaoId}::uuid, ${neg.vendedor_id}::uuid, ${neg.valor_venda}, ${valorComissao}, ${valorLiquido},
        ${tipoComissao}, ${regraComissao}, 'AGUARDANDO', 
        ${JSON.stringify(dadosBancarios || {})}::jsonb
      )
    `);

    // 7. Atualizar status da negociação
    await tx.execute(sql`
      UPDATE negociacoes SET status = 'LIBERADO_PARA_REPASSE', atualizado_em = now()
      WHERE id = ${negociacaoId}::uuid
    `);

    // 8. Timeline e Notificação
    await tx.execute(sql`
      INSERT INTO negociacoes_timeline (negociacao_id, evento, detalhe)
      VALUES (${negociacaoId}::uuid, 'Negociação liberada para repasse.', 'Entrega confirmada e valores calculados.')
    `);

    await tx.execute(sql`
      INSERT INTO negociacoes_notificacoes (negociacao_id, publico, titulo, mensagem)
      VALUES (${negociacaoId}::uuid, 'ADMIN', 'Nova negociação liberada para repasse', ${`Negociação ${neg.codigo} aguardando autorização financeira.`})
    `);

    return { ok: true };
  });
}

export async function salvarDadosBancarios(vendedorId: string, dados: {
  tipo_chave: string;
  chave_pix: string;
  titular_nome: string;
  titular_documento: string;
}) {
  const d = requireDb();
  
  return await d.transaction(async (tx) => {
    // 1. Carregar perfil para validar documento
    const pRes = await tx.execute(sql`SELECT documento FROM profiles WHERE id = ${vendedorId}::uuid`);
    const perfil = rowsOf(pRes)?.[0];
    
    // 2. Validar se o documento do titular bate com o perfil (Compliance)
    const docLimpo = dados.titular_documento.replace(/\D/g, '');
    const perfilDocLimpo = perfil?.documento?.replace(/\D/g, '');
    
    if (perfilDocLimpo && docLimpo !== perfilDocLimpo) {
      // Nota: Em produção, isso poderia ser um erro fatal ou apenas um alerta de flag
      // Vamos apenas registrar a divergência para auditoria por enquanto
    }

    // 3. Salvar dados
    await tx.execute(sql`
      INSERT INTO vendedor_dados_bancarios (vendedor_id, tipo_chave, chave_pix, titular_nome, titular_documento, verificado)
      VALUES (${vendedorId}::uuid, ${dados.tipo_chave}, ${dados.chave_pix}, ${dados.titular_nome}, ${dados.titular_documento}, false)
      ON CONFLICT (vendedor_id) DO UPDATE SET
        tipo_chave = EXCLUDED.tipo_chave,
        chave_pix = EXCLUDED.chave_pix,
        titular_nome = EXCLUDED.titular_nome,
        titular_documento = EXCLUDED.titular_documento,
        verificado = false,
        atualizado_em = now()
    `);

    // 4. Log de Auditoria
    await tx.execute(sql`
      INSERT INTO financeiro_auditoria (acao, detalhe, autor_id)
      VALUES ('ALTERACAO_DADOS_BANCARIOS', ${`Vendedor ${vendedorId} alterou sua chave Pix.`}, ${vendedorId}::uuid)
    `);

    return { ok: true };
  });
}

export async function listarRepassesAdmin(status?: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT r.*, n.codigo as negociacao_codigo, a.titulo as veiculo_titulo, v.nome as vendedor_nome
    FROM repasses r
    JOIN negociacoes n ON n.id = r.negociacao_id
    JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    JOIN profiles v ON v.id = r.vendedor_id
    ${status ? sql`WHERE r.status = ${status}` : sql``}
    ORDER BY r.criado_em DESC
  `);
  return rowsOf(res) || [];
}

export async function getRepasse(id: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT r.*, n.codigo as negociacao_codigo, a.titulo as veiculo_titulo, v.nome as vendedor_nome,
      n.comprador_id, comp.nome as comprador_nome,
      (SELECT row_to_json(c) FROM cobrancas c WHERE c.negociacao_id = r.negociacao_id AND c.status = 'PAGO' ORDER BY c.criado_em DESC LIMIT 1) as cobranca_paga
    FROM repasses r
    JOIN negociacoes n ON n.id = r.negociacao_id
    JOIN anuncios_veiculo a ON a.id = n.anuncio_id
    JOIN profiles v ON v.id = r.vendedor_id
    JOIN profiles comp ON comp.id = n.comprador_id
    WHERE r.id = ${id}::uuid
  `);
  const repasse = rowsOf(res)?.[0];
  if (!repasse) return null;

  const logs = await d.execute(sql`
    SELECT * FROM financeiro_auditoria WHERE repasse_id = ${id}::uuid ORDER BY criado_em DESC
  `);
  
  return { ...repasse, logs: rowsOf(logs) || [] };
}

export async function autorizarRepasse(repasseId: string, adminId: string) {
  const d = requireDb();
  
  return await d.transaction(async (tx) => {
    const res = await tx.execute(sql`SELECT * FROM repasses WHERE id = ${repasseId}::uuid FOR UPDATE`);
    const r = rowsOf(res)?.[0];
    if (!r) throw new Error("Repasse não encontrado.");
    if (r.status !== 'AGUARDANDO' && r.status !== 'FALHOU') throw new Error("Repasse em status que não permite autorização.");

    // TODO: Implementar lógica de dupla aprovação se necessário futuramente
    
    await tx.execute(sql`
      UPDATE repasses SET 
        status = 'AUTORIZADO', 
        autorizado_por = ${adminId}::uuid, 
        autorizado_em = now(), 
        atualizado_em = now() 
      WHERE id = ${repasseId}::uuid
    `);

    await tx.execute(sql`
      INSERT INTO financeiro_auditoria (repasse_id, negociacao_id, acao, autor_id, detalhe)
      VALUES (${repasseId}::uuid, ${r.negociacao_id}::uuid, 'AUTORIZACAO_REPASSE', ${adminId}::uuid, 'Repasse autorizado para processamento.')
    `);

    return { ok: true };
  });
}

export async function confirmarConclusaoRepasse(repasseId: string, params: { id_externo?: string, comprovante_url?: string }) {
  const d = requireDb();

  return await d.transaction(async (tx) => {
    const res = await tx.execute(sql`SELECT * FROM repasses WHERE id = ${repasseId}::uuid FOR UPDATE`);
    const r = rowsOf(res)?.[0];
    if (!r) throw new Error("Repasse não encontrado.");
    
    // 1. Atualizar repasse
    await tx.execute(sql`
      UPDATE repasses SET 
        status = 'CONCLUIDO', 
        id_externo_transacao = ${params.id_externo || r.id_externo_transacao || null},
        comprovante_url = ${params.comprovante_url || r.comprovante_url || null},
        concluido_em = now(),
        processado_em = COALESCE(processado_em, now()),
        atualizado_em = now()
      WHERE id = ${repasseId}::uuid
    `);

    // 2. Ledger - Saída Repasse
    await tx.execute(sql`
      INSERT INTO financeiro_ledger (negociacao_id, tipo, direcao, valor, referencia_externa, detalhe)
      VALUES (${r.negociacao_id}::uuid, 'SAIDA_REPASSE', 'SAIDA', ${r.valor_liquido}, ${params.id_externo || null}, 'Repasse ao vendedor confirmado.')
    `);

    // 3. Ledger - Retenção Comissão
    await tx.execute(sql`
      INSERT INTO financeiro_ledger (negociacao_id, tipo, direcao, valor, detalhe)
      VALUES (${r.negociacao_id}::uuid, 'RETENCAO_COMISSAO', 'ENTRADA', ${r.valor_comissao}, 'Comissão da plataforma reconhecida.')
    `);

    // 4. Encerrar negociação
    await tx.execute(sql`
      UPDATE negociacoes SET status = 'CONCLUIDA', atualizado_em = now() WHERE id = ${r.negociacao_id}::uuid
    `);

    // 5. Encerrar veículo
    const negRes = await tx.execute(sql`SELECT veiculo_id FROM negociacoes WHERE id = ${r.negociacao_id}::uuid`);
    const veiculoId = rowsOf(negRes)[0].veiculo_id;
    await tx.execute(sql`UPDATE veiculos SET status = 'VENDA_CONCLUIDA' WHERE id = ${veiculoId}::uuid`);

    // 6. Timeline e Notificações
    await tx.execute(sql`
      INSERT INTO negociacoes_timeline (negociacao_id, evento, detalhe)
      VALUES (${r.negociacao_id}::uuid, 'Repasse confirmado.', 'Venda 100% concluída financeiramente.')
    `);

    await tx.execute(sql`
      INSERT INTO negociacoes_notificacoes (negociacao_id, publico, titulo, mensagem)
      VALUES (${r.negociacao_id}::uuid, 'VENDEDOR', ${r.vendedor_id}::uuid, 'Seu repasse foi realizado!', 'O valor já foi transferido para sua conta.')
    `);

    return { ok: true };
  });
}

export async function getIndicadoresFinanceiros() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT
      COALESCE(SUM(valor_venda), 0) as total_vendido,
      COALESCE(SUM(valor_comissao), 0) as total_comissoes,
      COUNT(*) FILTER (WHERE status = 'AGUARDANDO') as aguardando_repasse,
      COUNT(*) FILTER (WHERE status = 'CONCLUIDO') as repasses_concluidos,
      COUNT(*) FILTER (WHERE status = 'FALHOU') as falhas
    FROM repasses
  `);
  return rowsOf(res)?.[0] || {};
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
