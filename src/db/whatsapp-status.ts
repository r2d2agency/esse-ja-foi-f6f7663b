/**
 * Status de template do WhatsApp.
 *
 * A Meta devolve o status em inglês (`APPROVED`, `PENDING`, `REJECTED`,
 * `PAUSED`, `DELETED`), mas a tabela `whatsapp_templates` foi criada com o
 * default em português (`'PENDENTE'`) e um comentário que lista
 * `APROVADO, REJEITADO, PENDENTE, PAUSADO`. O resultado era um banco com dois
 * vocabulários: o template recém-criado ficava `PENDENTE` (PT) e nunca
 * satisfazia a comparação `status === "APPROVED"` feita pelo seletor de
 * template da campanha, pelo motor de disparo e pelo envio de mensagens — o
 * template ficava invisível e a campanha era bloqueada como
 * `TEMPLATE_INDISPONIVEL` para sempre.
 *
 * Este módulo é a fonte única: normaliza qualquer variante para o vocabulário
 * da Meta e expõe os predicados usados nos pontos de consumo.
 */

export const STATUS_APPROVED = "APPROVED";
export const STATUS_PENDING = "PENDING";
export const STATUS_REJECTED = "REJECTED";
export const STATUS_PAUSED = "PAUSED";
export const STATUS_DELETED = "DELETED";

const ALIASES: Record<string, string> = {
  APPROVED: STATUS_APPROVED,
  APROVADO: STATUS_APPROVED,
  APROVADA: STATUS_APPROVED,
  PENDING: STATUS_PENDING,
  PENDENTE: STATUS_PENDING,
  REJECTED: STATUS_REJECTED,
  REJEITADO: STATUS_REJECTED,
  REJEITADA: STATUS_REJECTED,
  PAUSED: STATUS_PAUSED,
  PAUSADO: STATUS_PAUSED,
  PAUSADA: STATUS_PAUSED,
  DELETED: STATUS_DELETED,
  APAGADO: STATUS_DELETED,
};

/** Normaliza o status gravado para o vocabulário da Meta. */
export function normalizarStatusTemplate(status: unknown): string {
  const bruto = String(status ?? "").trim().toUpperCase();
  if (!bruto) return "";
  return ALIASES[bruto] ?? bruto;
}

/** O template pode ser usado em campanha/envio? */
export function templateAprovado(status: unknown): boolean {
  return normalizarStatusTemplate(status) === STATUS_APPROVED;
}

/** Rótulo curto para a tela, no vocabulário da Meta. */
export function rotuloStatusTemplate(status: unknown): string {
  switch (normalizarStatusTemplate(status)) {
    case STATUS_APPROVED:
      return "Aprovado";
    case STATUS_PENDING:
      return "Em análise";
    case STATUS_REJECTED:
      return "Rejeitado";
    case STATUS_PAUSED:
      return "Pausado";
    case STATUS_DELETED:
      return "Apagado na Meta";
    default:
      return String(status || "—");
  }
}
