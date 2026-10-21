/**
 * Rótulos legíveis das operações registradas no log do WhatsApp.
 *
 * Fica num módulo separado de propósito: o log é gravado no servidor, mas o
 * rótulo é lido na tela (que roda no cliente). Importar o módulo de log
 * direto na rota arrastaria o acesso ao banco para o bundle do navegador.
 */

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
 * Traduz o código da operação para um texto que o admin entende. Operação
 * desconhecida volta como está — melhor mostrar o código do que esconder o
 * que aconteceu.
 */
export function rotuloOperacao(operacao: string): string {
  if (!operacao) return "";
  return ROTULO_OPERACAO[operacao] || operacao;
}
