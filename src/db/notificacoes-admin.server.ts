import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

const CHAVE_CARRO_ANALISE = "notificacao_email_carro_analise_ativa";
const CHAVE_NOVO_LANCE = "notificacao_email_novo_lance_ativa";

async function notificacaoAtiva(chave: string) {
  const d = requireDb();
  const rows = await d.execute(sql`SELECT valor FROM configuracoes_sistema WHERE chave = ${chave} LIMIT 1;`);
  const valor = rowsOf(rows)[0]?.valor;
  // Se a chave nunca foi configurada, mantém a notificação ativa por padrão.
  return valor !== "false";
}

async function emailsAdminsAtivos() {
  const d = requireDb();
  const rows = await d.execute(sql`
    SELECT email FROM profiles
    WHERE role IN ('admin'::app_role, 'operacao'::app_role)
      AND ativo = true
      AND email IS NOT NULL;
  `);
  return rowsOf(rows)
    .map((r) => r.email as string)
    .filter((email): email is string => !!email);
}

/** Dispara e-mail aos administradores/operação quando um veículo entra na fila de análise. Nunca lança erro. */
export async function notificarAdminsCarroParaAnalise(veiculo: { id: string; placa: string; marca: string; modelo: string }) {
  try {
    if (!(await notificacaoAtiva(CHAVE_CARRO_ANALISE))) return;
    const emails = await emailsAdminsAtivos();
    if (emails.length === 0) return;

    const { enviarEmailSimples } = await import("./mail.server");
    const assunto = "Novo veículo para análise — Esse Já Foi";
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a;">Novo veículo para análise</h2>
        <p>Um vendedor acabou de enviar um veículo para a fila de análise:</p>
        <div style="background: #f1f5f9; padding: 16px; border-radius: 8px;">
          <p style="margin: 0;"><strong>${veiculo.marca} ${veiculo.modelo}</strong></p>
          <p style="margin: 4px 0 0; color: #64748b;">Placa: ${veiculo.placa}</p>
        </div>
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
          Acesse o painel administrativo para revisar o cadastro.
        </p>
      </div>
    `;

    await Promise.all(
      emails.map((email) =>
        enviarEmailSimples(email, assunto, html).catch((e) =>
          console.error("[notificacoes-admin] falha ao enviar e-mail de carro para análise", email, e),
        ),
      ),
    );
  } catch (e) {
    console.error("[notificacoes-admin] erro ao notificar carro para análise", e);
  }
}

/** Dispara e-mail aos administradores/operação a cada novo lance registrado em um leilão. Nunca lança erro. */
export async function notificarAdminsNovoLance(dados: {
  leilaoId: string;
  valor: number;
  veiculo?: { placa?: string | null; marca?: string | null; modelo?: string | null } | null;
}) {
  try {
    if (!(await notificacaoAtiva(CHAVE_NOVO_LANCE))) return;
    const emails = await emailsAdminsAtivos();
    if (emails.length === 0) return;

    const { enviarEmailSimples } = await import("./mail.server");
    const valorFmt = `R$ ${Number(dados.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    const veiculoLabel = dados.veiculo?.marca || dados.veiculo?.modelo
      ? `${dados.veiculo?.marca ?? ""} ${dados.veiculo?.modelo ?? ""}`.trim()
      : "Veículo";
    const assunto = "Novo lance registrado — Esse Já Foi";
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a;">Novo lance registrado</h2>
        <p>Um novo lance foi registrado em um leilão:</p>
        <div style="background: #f1f5f9; padding: 16px; border-radius: 8px;">
          <p style="margin: 0;"><strong>${veiculoLabel}</strong></p>
          ${dados.veiculo?.placa ? `<p style="margin: 4px 0 0; color: #64748b;">Placa: ${dados.veiculo.placa}</p>` : ""}
          <p style="margin: 8px 0 0; font-size: 20px; font-weight: bold; color: #0d9488;">${valorFmt}</p>
        </div>
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
          Acesse o painel administrativo para acompanhar o leilão.
        </p>
      </div>
    `;

    await Promise.all(
      emails.map((email) =>
        enviarEmailSimples(email, assunto, html).catch((e) =>
          console.error("[notificacoes-admin] falha ao enviar e-mail de novo lance", email, e),
        ),
      ),
    );
  } catch (e) {
    console.error("[notificacoes-admin] erro ao notificar novo lance", e);
  }
}
