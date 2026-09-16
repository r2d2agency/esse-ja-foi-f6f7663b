import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./index";

export type ContextoConsultaLog = {
  rastreioId: string;
  placa?: string | null;
  veiculoId?: string | null;
  consultaId?: string | null;
  protocolo?: string | null;
  produto?: string | null;
  origem: string;
};

export function criarContextoConsultaLog(dados: Omit<ContextoConsultaLog, "rastreioId">): ContextoConsultaLog {
  return { ...dados, rastreioId: randomUUID() };
}

let schema: Promise<void> | undefined;
export async function ensureConsultaLogsSchema() {
  if (!db) throw new Error("Banco de dados indisponível.");
  const d = db;
  schema ??= (async () => {
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS consulta_eventos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rastreio_id uuid NOT NULL,
        consulta_id uuid,
        veiculo_id uuid,
        placa text,
        protocolo text,
        produto text,
        origem text NOT NULL,
        evento text NOT NULL,
        status text NOT NULL,
        mensagem text NOT NULL,
        http_status integer,
        duracao_ms integer,
        criado_em timestamptz NOT NULL DEFAULT now()
      )
    `);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS consulta_eventos_data_idx ON consulta_eventos (criado_em DESC, id DESC)`);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS consulta_eventos_placa_idx ON consulta_eventos (placa, criado_em DESC)`);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS consulta_eventos_protocolo_idx ON consulta_eventos (protocolo)`);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS consulta_eventos_veiculo_idx ON consulta_eventos (veiculo_id)`);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS consulta_eventos_rastreio_idx ON consulta_eventos (rastreio_id)`);
  })().catch((erro: unknown) => { schema = undefined; throw erro; });
  await schema;
}

/** Registra só metadados permitidos. Nunca recebe URL, credenciais ou o JSON da pesquisa. */
export async function registrarEventoConsulta(
  contexto: ContextoConsultaLog,
  evento: string,
  status: string,
  mensagem: string,
  httpStatus?: number,
  duracaoMs?: number,
) {
  try {
    await ensureConsultaLogsSchema();
    if (!db) return;
    // Vincula inclusive o envio ocorrido antes de a Company devolver o protocolo.
    await db.execute(sql`
      UPDATE consulta_eventos SET
        protocolo = coalesce(${contexto.protocolo || null}, protocolo),
        consulta_id = coalesce(${contexto.consultaId || null}::uuid, consulta_id),
        veiculo_id = coalesce(${contexto.veiculoId || null}::uuid, veiculo_id),
        placa = coalesce(${contexto.placa || null}, placa),
        produto = coalesce(${contexto.produto || null}, produto)
      WHERE rastreio_id = ${contexto.rastreioId}::uuid
    `);
    await db.execute(sql`
      INSERT INTO consulta_eventos (rastreio_id, consulta_id, veiculo_id, placa, protocolo, produto, origem, evento, status, mensagem, http_status, duracao_ms)
      VALUES (${contexto.rastreioId}::uuid, ${contexto.consultaId || null}::uuid, ${contexto.veiculoId || null}::uuid,
        ${contexto.placa || null}, ${contexto.protocolo || null}, ${contexto.produto || null}, ${contexto.origem},
        ${evento}, ${status}, ${mensagem}, ${httpStatus ?? null}, ${duracaoMs ?? null})
    `);
  } catch {
    // A indisponibilidade do log não interrompe uma consulta já cobrada pelo provedor.
    console.error("[consulta-eventos] Falha ao persistir evento", evento, contexto.rastreioId);
  }
}

export type FiltrosConsultaLog = { placa?: string; veiculo?: string; codigo?: string; status?: string; produto?: string; pagina: number };
export type EventoConsultaLog = {
  id: string; rastreio_id: string; consulta_id: string | null; veiculo_id: string | null;
  placa: string | null; protocolo: string | null; produto: string | null; origem: string;
  evento: string; status: string; mensagem: string; http_status: number | null; duracao_ms: number | null;
  criado_em: string; veiculo_nome: string | null;
};

export function condicoesConsultaLog(filtros: FiltrosConsultaLog) {
  const literal = (texto: string) => `%${texto.replace(/[\\%_]/g, "\\$&")}%`;
  return sql`
    ${filtros.placa ? sql`e.placa LIKE ${literal(filtros.placa.toUpperCase().replace(/[^A-Z0-9]/g, ""))}` : sql`true`}
    AND ${filtros.veiculo ? sql`(e.veiculo_id::text ILIKE ${literal(filtros.veiculo)} OR concat_ws(' ', v.marca, v.modelo) ILIKE ${literal(filtros.veiculo)})` : sql`true`}
    AND ${filtros.codigo ? sql`(e.protocolo ILIKE ${literal(filtros.codigo)} OR e.rastreio_id::text ILIKE ${literal(filtros.codigo)} OR e.consulta_id::text ILIKE ${literal(filtros.codigo)})` : sql`true`}
    AND ${filtros.status ? sql`e.status = ${filtros.status}` : sql`true`}
    AND ${filtros.produto ? sql`e.produto = ${filtros.produto}` : sql`true`}
  `;
}

export async function listarEventosConsulta(filtros: FiltrosConsultaLog) {
  await ensureConsultaLogsSchema();
  if (!db) throw new Error("Banco de dados indisponível.");
  const where = condicoesConsultaLog(filtros);
  const data = await db.execute(sql`
    SELECT e.*, nullif(concat_ws(' ', v.marca, v.modelo), '') AS veiculo_nome
    FROM consulta_eventos e LEFT JOIN veiculos v ON v.id = e.veiculo_id
    WHERE ${where} ORDER BY e.criado_em DESC, e.id DESC LIMIT 50 OFFSET ${filtros.pagina * 50}
  `);
  const count = await db.execute(sql`
    SELECT count(*)::integer AS total FROM consulta_eventos e
    LEFT JOIN veiculos v ON v.id = e.veiculo_id WHERE ${where}
  `);
  return { data: Array.from(data) as unknown as EventoConsultaLog[], total: Number(count[0]?.total || 0) };
}
