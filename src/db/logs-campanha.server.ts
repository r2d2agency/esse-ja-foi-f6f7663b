import { sql } from "drizzle-orm";
import { db } from "./index";
import { mensagemErroPostgres } from "./erro-postgres";

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

/** O postgres-js devolve as linhas em array puro; outros drivers, em `.rows`. */
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
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
 * Eventos que não conseguiram ser gravados na tabela.
 *
 * A tabela `whatsapp_logs` é criada dentro de `passoOpcional` — se essa
 * criação falhar (banco antigo, permissão, conexão), todo insert passa a
 * falhar e a tela fica muda, que é exatamente a queixa de "não gera log de
 * disparo". Guardar os eventos em memória garante que o admin veja o que o
 * motor fez, mesmo com a tabela fora do ar.
 */
const bufferMemoria: any[] = [];
const LIMITE_BUFFER = 300;

/** Grava um evento da campanha. Nunca lança: se o log falhar, o disparo
 * continua — o log é diagnóstico, não parte do fluxo.
 */
export async function registrarLogCampanha(params: {
  campanhaId: string | null;
  acao: AcaoLogCampanha;
  detalhe?: string | null;
  payload?: Record<string, any> | null;
  mensagemId?: string | null;
}) {
  const evento = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    acao: params.acao,
    detalhe: params.detalhe ? String(params.detalhe).slice(0, 2000) : null,
    payload: params.payload ?? {},
    campanha_id: params.campanhaId ?? null,
    criado_em: new Date().toISOString(),
    em_memoria: true,
  };
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
    console.error("[logs-campanha] falha ao registrar evento:", mensagemErroPostgres(erro));
    bufferMemoria.unshift(evento);
    if (bufferMemoria.length > LIMITE_BUFFER) bufferMemoria.length = LIMITE_BUFFER;
    return false;
  }
}

/** Eventos de uma campanha, do mais recente para o mais antigo. */
export async function listarLogsCampanha(campanhaId: string, limite = 200) {
  const d = requireDb();
  let doBanco: any[] = [];
  try {
    const d = requireDb();
    const res = await d.execute(sql`
      SELECT id, acao, detalhe, payload, criado_em
      FROM whatsapp_logs
      WHERE campanha_id = ${campanhaId}::uuid
      ORDER BY criado_em DESC
      LIMIT ${limite}
    `);
    doBanco = rowsOf(res);
  } catch (erro: any) {
    console.error("[logs-campanha] falha ao listar os eventos:", mensagemErroPostgres(erro));
  }
  const daMemoria = bufferMemoria.filter((e) => e.campanha_id === campanhaId);
  return [...daMemoria, ...doBanco].slice(0, limite);
}

/**
 * Trilha de disparo de todas as campanhas, do mais recente para o mais antigo.
 *
 * A trilha por campanha só aparecia dentro do dialog de detalhe, atrás do
 * botão "olho" — na prática o admin olhava a aba de logs (que é do webhook) e
 * concluía que o disparo não gerava registro nenhum. Esta lista deixa o
 * registro do motor visível na própria tela de logs.
 */
export async function listarLogsDisparo(limite = 300) {
  let doBanco: any[] = [];
  try {
    const d = requireDb();
    const res = await d.execute(sql`
      SELECT l.id, l.acao, l.detalhe, l.payload, l.criado_em,
        l.campanha_id,
        c.nome as campanha_nome
      FROM whatsapp_logs l
      LEFT JOIN whatsapp_campanhas c ON c.id = l.campanha_id
      ORDER BY l.criado_em DESC
      LIMIT ${limite}
    `);
    doBanco = rowsOf(res);
  } catch (erro: any) {
    console.error("[logs-campanha] falha ao listar o log de disparo:", mensagemErroPostgres(erro));
  }
  // Os eventos que falharam no insert entram na frente da lista: são os mais
  // recentes e são justamente os que a tabela perdeu.
  const jaGravados = new Set(doBanco.map((l) => `${l.campanha_id}|${l.acao}|${l.criado_em}`));
  const daMemoria = bufferMemoria.filter(
    (e) => !jaGravados.has(`${e.campanha_id}|${e.acao}|${e.criado_em}`),
  );
  return [...daMemoria, ...doBanco].slice(0, limite);
}
