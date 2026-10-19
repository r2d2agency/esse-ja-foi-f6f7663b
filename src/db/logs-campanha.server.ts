import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Trilha de eventos por campanha.
 *
 * A tabela `whatsapp_logs` já existe (criada em `ensureComunicacoesSchema`) com
 * `campanha_id`, `acao`, `detalhe` e `payload` — mas ninguém escrevia nela. O
 * motor worked silenciosamente: quando a campanha não disparava, a tela não
 * mostrava nem erro nem motivo (fora da janela, fila vazia, template não
 * aprovado, ninguém elegível...). Cada passo do motor agora grava um evento
 * aqui, e a tela de Admin > Comunicações mostra essa lista ao lado da fila.
 *
 * A gravação nunca pode derrubar o disparo: falha de log é absorvida.
 */

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export type AcaoLogCampanha =
  | "CRIADA"
  | "FILA_MONTADA"
  | "PROMOCAO_STATUS"
  | "FORA_DA_JANELA"
  | "AGUARDANDO_INTERVALO"
  | "FILA_VAZIA"
  | "LOTE_ENVIADO"
  | "BLOQUEADA"
  | "ERRO"
  | "CONCLUIDA"
  | "DISPARO_FORCADO"
  | "REAGENDADA"
  | string;

/**
 * Grava um evento da campanha. Nunca lança: se o log falhar, o disparo
 * continua — o log é diagnóstico, não parte do fluxo.
 */
export async function registrarLogCampanha(params: {
  campanhaId: string | null;
  acao: AcaoLogCampanha;
  detalhe?: string | null;
  payload?: Record<string, any> | null;
  mensagemId?: string | null;
}) {
  try {
    const d = requireDb();
    await d.execute(sql`
      INSERT INTO whatsapp_logs (campanha_id, mensagem_id, acao, detalhe, payload)
      VALUES (
        ${params.campanhaId}::uuid,
        ${params.mensagemId ?? null}::uuid,
        ${params.acao},
        ${params.detalhe ? String(params.detalhe).slice(0, 2000) : null},
        ${JSON.stringify(params.payload ?? {})}::jsonb
      )
    `);
    return true;
  } catch (erro: any) {
    console.error("[logs-campanha] falha ao registrar evento:", erro?.message || erro);
    return false;
  }
}

/** Eventos de uma campanha, do mais recente para o mais antigo. */
export async function listarLogsCampanha(campanhaId: string, limite = 200) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT id, acao, detalhe, payload, criado_em
    FROM whatsapp_logs
    WHERE campanha_id = ${campanhaId}::uuid
    ORDER BY criado_em DESC
    LIMIT ${limite}
  `);
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.rows)) return res.rows;
  return [];
}
