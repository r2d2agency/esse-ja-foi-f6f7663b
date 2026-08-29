import { sql, eq, and, desc } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function ensureAutomacoesSchema(silent = true) {
  const d = requireDb();
  if (!silent && process.env['NODE_ENV'] === 'development') console.log("[automacoes.server] Garantindo tabelas de automação...");

  try {
    // 1. Tabela de Automações
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_automacoes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome text NOT NULL,
        evento text NOT NULL, -- VEICULO_PUBLICADO, VISTORIA_AGENDADA, LANCE_SUPERADO, etc.
        publico text NOT NULL, -- VENDEDOR, COMPRADOR_VENCEDOR, COMPRADOR_PARTICIPANTE, etc.
        template_id uuid REFERENCES whatsapp_templates(id),
        status text DEFAULT 'RASCUNHO', -- ATIVA, PAUSADA, RASCUNHO, COM_ERRO, TEMPLATE_INDISPONIVEL
        config_envio jsonb DEFAULT '{"momento": "IMEDIATO"}'::jsonb, -- { momento: 'IMEDIATO' | 'AGENDADO', delay_minutos: number }
        regras jsonb DEFAULT '{}'::jsonb, -- Condições extras
        mapeamento_variaveis jsonb DEFAULT '[]'::jsonb, -- [ { variavel: '{{1}}', origem: 'veiculo.marca' } ]
        total_enviados integer DEFAULT 0,
        ultima_execucao timestamptz,
        criado_por uuid REFERENCES profiles(id),
        criado_em timestamptz DEFAULT now(),
        atualizado_em timestamptz DEFAULT now()
      );
    `);

    // 2. Fila de Execução de Automações (Idempotência e Histórico)
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_automacoes_execucoes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        automacao_id uuid REFERENCES whatsapp_automacoes(id) ON DELETE CASCADE,
        evento_id text NOT NULL, -- ID do registro original (veiculo_id, leilao_id, etc)
        destinatario_id uuid REFERENCES profiles(id),
        mensagem_id uuid REFERENCES whatsapp_mensagens(id),
        status text DEFAULT 'PENDENTE', -- PENDENTE, ENVIADO, FALHOU, IGNORADO
        erro_detalhe text,
        identificador_unico text UNIQUE, -- automacao_id + evento_id + destinatario_id
        criado_em timestamptz DEFAULT now()
      );
    `);

    // Inserir automações iniciais na biblioteca (desativadas) se a tabela estiver vazia
    const countRes = await d.execute(sql`SELECT count(*) FROM whatsapp_automacoes`);
    if (parseInt(rowsOf(countRes)[0].count) === 0) {
       // A inserção real seria feita via seeds ou interface, mas deixamos a estrutura pronta
    }

    if (!silent && process.env['NODE_ENV'] === 'development') console.log("[automacoes.server] Tabelas de Automação OK.");
  } catch (err) {
    console.error("[automacoes.server] Erro ao garantir tabelas:", err);
    throw err;
  }
}

export async function listarAutomacoes() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT a.*, t.meta_name as template_name, t.status as template_status
    FROM whatsapp_automacoes a
    LEFT JOIN whatsapp_templates t ON t.id = a.template_id
    ORDER BY a.criado_em DESC
  `);
  return rowsOf(res) || [];
}

export async function salvarAutomacao(data: any, usuarioId: string) {
  const d = requireDb();
  if (data.id) {
    await d.execute(sql`
      UPDATE whatsapp_automacoes SET
        nome = ${data.nome},
        evento = ${data.evento},
        publico = ${data.publico},
        template_id = ${data.template_id}::uuid,
        status = ${data.status},
        config_envio = ${JSON.stringify(data.config_envio)}::jsonb,
        regras = ${JSON.stringify(data.regras)}::jsonb,
        mapeamento_variaveis = ${JSON.stringify(data.mapeamento_variaveis)}::jsonb,
        atualizado_em = now()
      WHERE id = ${data.id}::uuid
    `);
    return { id: data.id };
  } else {
    const res = await d.execute(sql`
      INSERT INTO whatsapp_automacoes (
        nome, evento, publico, template_id, status, config_envio, regras, mapeamento_variaveis, criado_por
      ) VALUES (
        ${data.nome}, ${data.evento}, ${data.publico}, ${data.template_id}::uuid, 
        'RASCUNHO', ${JSON.stringify(data.config_envio)}::jsonb, 
        ${JSON.stringify(data.regras)}::jsonb, ${JSON.stringify(data.mapeamento_variaveis)}::jsonb,
        ${usuarioId}::uuid
      ) RETURNING id
    `);
    return rowsOf(res)[0];
  }
}

export async function dispararEventoSistema(evento: string, contexto: any) {
  try {
    const { processarEventoSistema } = await import("./automacoes-motor.server");
    await processarEventoSistema(evento, contexto);
  } catch (err) {
    console.error(`[Automacao] Erro ao disparar evento ${evento}:`, err);
  }
}

export async function getExecucoesAutomacao(automacaoId: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT e.*, p.nome as destinatario_nome, m.status as mensagem_status
    FROM whatsapp_automacoes_execucoes e
    LEFT JOIN profiles p ON p.id = e.destinatario_id
    LEFT JOIN whatsapp_mensagens m ON m.id = e.mensagem_id
    WHERE e.automacao_id = ${automacaoId}::uuid
    ORDER BY e.criado_em DESC
    LIMIT 50
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
