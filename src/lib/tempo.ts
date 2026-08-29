/**
 * Formata o tempo restante até uma data.
 * Acima de 24h exibe em dias (ex.: "3d 04h 12m"); abaixo disso usa horas/minutos/segundos.
 */
export function formatarTempoRestante(
  fim: string | number | Date | null | undefined,
  agora: number = Date.now()
): string {
  if (!fim) return "—";
  const alvo = new Date(fim).getTime();
  if (Number.isNaN(alvo)) return "—";

  const diff = alvo - agora;
  if (diff <= 0) return "Encerrado";

  const seg = Math.floor(diff / 1000);
  const dias = Math.floor(seg / 86400);
  const horas = Math.floor((seg % 86400) / 3600);
  const minutos = Math.floor((seg % 3600) / 60);
  const segundos = seg % 60;

  const p2 = (n: number) => String(n).padStart(2, "0");

  if (dias >= 1) return `${dias}d ${p2(horas)}h ${p2(minutos)}m`;
  if (horas >= 1) return `${horas}h ${p2(minutos)}m ${p2(segundos)}s`;
  return `${minutos}m ${p2(segundos)}s`;
}
