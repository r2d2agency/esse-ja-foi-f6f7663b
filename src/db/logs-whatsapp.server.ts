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
 * diagnóstico, não parte do fluxo.
 */

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
  if (!db) return;
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
  } catch (erro: any) {
    // A tabela pode não existir ainda (primeiro boot antes de qualquer request)
    // ou o insert pode falhar por outro motivo. Registrar é acessório: um erro
    // aqui jamais deve impedir o envio que estava sendo tentado.
    console.error("[WhatsApp Logs] Falha ao registrar log:", erro?.message || erro);
  }
}