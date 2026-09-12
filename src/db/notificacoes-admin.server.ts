import { sql } from "drizzle-orm";
import { db } from "./index";
import { RegraNegocioError } from "./cadastro.server";

function requireDb() {
  if (!db) throw new RegraNegocioError("Banco de dados indisponível.", 503);
  return db;
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

let prepared = false;

/** Cria/ajusta a tabela de destinatários de notificação por e-mail. Idempotente. */
export async function ensureNotificacoesDestinatariosSchema() {
  if (prepared) return;
  const d = requireDb();

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS notificacoes_destinatarios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome text NOT NULL,
      email text NOT NULL,
      notificar_carro_analise boolean NOT NULL DEFAULT true,
      notificar_novo_lance boolean NOT NULL DEFAULT true,
      criado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_destinatarios_email_uidx ON notificacoes_destinatarios (lower(email));
  `);

  prepared = true;
}

export type DestinatarioNotificacaoInput = {
  id?: string;
  nome: string;
  email: string;
  notificarCarroAnalise: boolean;
  notificarNovoLance: boolean;
};

export async function listarDestinatariosNotificacao() {
  await ensureNotificacoesDestinatariosSchema();
  const d = requireDb();
  const rows = await d.execute(sql`
    SELECT id, nome, email, notificar_carro_analise, notificar_novo_lance, criado_em
    FROM notificacoes_destinatarios
    ORDER BY criado_em DESC;
  `);
  return rowsOf(rows);
}

export async function salvarDestinatarioNotificacao(input: DestinatarioNotificacaoInput) {
  await ensureNotificacoesDestinatariosSchema();
  const d = requireDb();

  const nome = input.nome.trim();
  const email = input.email.trim().toLowerCase();
  if (nome.length < 2) throw new RegraNegocioError("Informe o nome da pessoa.", 422);
  if (!email) throw new RegraNegocioError("Informe o e-mail.", 422);

  if (input.id) {
    await d.execute(sql`
      UPDATE notificacoes_destinatarios SET
        nome = ${nome}, email = ${email},
        notificar_carro_analise = ${input.notificarCarroAnalise},
        notificar_novo_lance = ${input.notificarNovoLance},
        atualizado_em = now()
      WHERE id = ${input.id}::uuid;
    `);
    return { id: input.id };
  }

  const dup = await d.execute(sql`
    SELECT id FROM notificacoes_destinatarios WHERE lower(email) = ${email} LIMIT 1;
  `);
  if (rowsOf(dup).length > 0) throw new RegraNegocioError("Já existe um destinatário cadastrado com este e-mail.", 409);

  const rows = await d.execute(sql`
    INSERT INTO notificacoes_destinatarios (nome, email, notificar_carro_analise, notificar_novo_lance)
    VALUES (${nome}, ${email}, ${input.notificarCarroAnalise}, ${input.notificarNovoLance})
    RETURNING id;
  `);
  return { id: rowsOf(rows)[0]?.id as string };
}

export async function removerDestinatarioNotificacao(id: string) {
  await ensureNotificacoesDestinatariosSchema();
  const d = requireDb();
  await d.execute(sql`DELETE FROM notificacoes_destinatarios WHERE id = ${id}::uuid;`);
  return { ok: true };
}

async function emailsParaNotificacao(coluna: "notificar_carro_analise" | "notificar_novo_lance") {
  await ensureNotificacoesDestinatariosSchema();
  const d = requireDb();
  const rows = await d.execute(sql`
    SELECT email FROM notificacoes_destinatarios WHERE ${sql.identifier(coluna)} = true;
  `);
  return rowsOf(rows)
    .map((r) => r.email as string)
    .filter((email): email is string => !!email);
}

/** Dispara e-mail aos destinatários cadastrados quando um veículo entra na fila de análise. Nunca lança erro. */
export async function notificarAdminsCarroParaAnalise(veiculo: { id: string; placa: string; marca: string; modelo: string }) {
  try {
    const emails = await emailsParaNotificacao("notificar_carro_analise");
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

/** Dispara e-mail aos destinatários cadastrados a cada novo lance registrado em um leilão. Nunca lança erro. */
export async function notificarAdminsNovoLance(dados: {
  leilaoId: string;
  valor: number;
  veiculo?: { placa?: string | null; marca?: string | null; modelo?: string | null } | null;
}) {
  try {
    const emails = await emailsParaNotificacao("notificar_novo_lance");
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
