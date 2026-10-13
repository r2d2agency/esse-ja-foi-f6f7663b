import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * A aba "Logs do WhatsApp" só mostrava o que a Meta mandava para o webhook.
 * Toda chamada da aplicação à Meta — teste de conexão, sincronização e criação
 * de template, envio de teste, motor de dripping — passava por `fetchMeta` sem
 * deixar rastro, então a tela ficava permanentemente vazia mesmo com a conexão
 * funcionando. Este módulo é o ponto único de registro dos dois lados.
 *
 * Falha ao registrar não pode derrubar a operação principal: o log é
 * diagnóstico, não parte do fluxo. Mas ela também não pode desaparecer — o
 * diagnóstico lê `getUltimoErroLog()` e mostra na tela que o log está falhando,
 * que é a única forma de explicar uma tela de log vazia quando há atividade.
 */

let ultimoErroLog: { mensagem: string; em: string } | null = null;

/** Última falha ao escrever log, se houve. Lido pelo diagnóstico. */
export function getUltimoErroLog() {
  return ultimoErroLog;
}

export type DirecaoLog = "SAIDA" | "ENTRADA";

/** Nomes das operações, para a tela mostrar algo legível em vez da URL crua. */
export type OperacaoMeta =
  | "TESTAR_CONEXAO"
  | "SINCRONIZAR_TEMPLATES"
  | "CRIAR_TEMPLATE"
  | "EXCLUIR_TEMPLATE"
  | "ENVIAR_TESTE"
  | "DISPARO_CAMPANHA"
  | "BUSCAR_DADOS"
  | "WEBHOOK"
  | "UPLOAD_MIDIA"
  | string;

const ROTULO_OPERACAO: Record<string, string> = {
  TESTAR_CONEXAO: "Teste de conexão",
  SINCRONIZAR_TEMPLATES: "Sincronização de templates",
  CRIAR_TEMPLATE: "Criação de template",
  EXCLUIR_TEMPLATE: "Exclusão de template",
  ENVIAR_TESTE: "Envio de teste",
  DISPARO_CAMPANHA: "Disparo de campanha",
  BUSCAR_DADOS: "Consulta de dados do número",
  WEBHOOK: "Evento recebido da Meta",
  ENVIAR_MENSAGEM_ATENDENTE: "Envio do atendente",
  UPLOAD_MIDIA: "Upload de mídia",
  DIAGNOSTICO: "Diagnóstico do sistema",
  INICIALIZACAO: "Inicialização do servidor",
};

/**
 * `payload` guarda até 8 KB do corpo. A Meta devolve a mensagem inteira em
 * erros de template e o payload completo de webhook pode ter dezenas de KB —
 * sem o corte, uma linha de log carrega a tabela inteira.
 */
function resumir(valor: unknown, limite = 8000): string | null {
  if (valor === undefined || valor === null) return null;
  // Precisa sair como jsonb válido. A Meta devolve corpo em texto puro nos
  // erros, e `'texto solto'::jsonb` faria o INSERT falhar. O corte também não
  // pode quebrar o JSON: truncar e sufixar "…" geraria jsonb inválido, então o
  // excedente vai embrulhado em outro objeto.
  let texto: string;
  try {
    texto = JSON.stringify(valor);
  } catch {
    texto = JSON.stringify(String(valor));
  }
  if (!texto || texto === "null") return null;
  if (texto.length <= limite) return texto;
  const cortado = texto.slice(0, limite);
  return JSON.stringify({ truncado: true, previa: cortado });
}

export function rotuloOperacao(operacao: string): string {
  return ROTULO_OPERACAO[operacao] || operacao;
}

export async function registrarLogMeta(params: {
  direcao: DirecaoLog;
  operacao: OperacaoMeta;
  wabaId?: string | null;
  endpoint?: string | null;
  httpStatus?: number | null;
  status: "SUCESSO" | "ERRO";
  resumo?: string | null;
  payload?: unknown;
  duracaoMs?: number | null;
}): Promise<void> {
  if (!db) {
    ultimoErroLog = {
      mensagem: "Banco de dados indisponível (db é null) — nenhum log pode ser gravado.",
      em: new Date().toISOString(),
    };
    return;
  }
  const {
    direcao,
    operacao,
    wabaId = null,
    endpoint = null,
    httpStatus = null,
    status,
    resumo = null,
    payload,
    duracaoMs = null,
  } = params;

  try {
    await db.execute(sql`
      INSERT INTO whatsapp_webhook_logs (
        waba_id, event_type, direcao, endpoint, http_status,
        payload, status, erro_detalhe, duracao_ms
      ) VALUES (
        ${wabaId},
        ${rotuloOperacao(operacao)},
        ${direcao},
        ${endpoint},
        ${httpStatus},
        ${resumir(payload)}::jsonb,
        ${status},
        ${resumir(resumo, 2000)},
        ${duracaoMs}
      )
    `);
    ultimoErroLog = null;
  } catch (erro: any) {
    const mensagem = String(erro?.message || erro);

    // Segunda tentativa com a linha mínima: se a falha foi no payload
    // (jsonb inválido, estouro de tamanho), sem ele a linha ainda entra e pelo
    // menos o fato de que algo aconteceu fica registrado.
    try {
      await db.execute(sql`
        INSERT INTO whatsapp_webhook_logs (
          event_type, direcao, http_status, status, erro_detalhe
        ) VALUES (
          ${rotuloOperacao(operacao)},
          ${direcao},
          ${httpStatus},
          ${status},
          ${`[log simplificado] ${resumir(resumo, 1500) ?? ""}`.slice(0, 1500)}
        )
      `);
      return;
    } catch {
      // Cai fora: nem a linha mínima entrou.
    }

    // Registrar é acessório: um erro aqui jamais deve impedir o envio que
    // estava sendo tentado. Mas ele fica guardado para o diagnóstico mostrar,
    // em vez de desaparecer no console do servidor.
    ultimoErroLog = { mensagem, em: new Date().toISOString() };
    console.error("[WhatsApp Logs] Falha ao registrar log:", mensagem);
  }
}