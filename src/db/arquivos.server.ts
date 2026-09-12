import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

let prepared = false;

/** Cria a tabela de arquivos enviados (fotos, CRLV, etc). Idempotente. */
export async function ensureArquivosSchema() {
  if (prepared) return;
  const d = requireDb();

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS arquivos_upload (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mime_type text NOT NULL,
      conteudo bytea NOT NULL,
      tamanho integer NOT NULL,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);

  prepared = true;
}

/**
 * Persiste o arquivo assim que ele é enviado — independente do restante do
 * formulário ser salvo depois. Evita perder foto/documento se o usuário
 * fechar a aba ou abandonar o cadastro antes de concluir.
 */
export async function salvarArquivo(buffer: Buffer, mimeType: string) {
  await ensureArquivosSchema();
  const d = requireDb();
  const rows = await d.execute(sql`
    INSERT INTO arquivos_upload (mime_type, conteudo, tamanho)
    VALUES (${mimeType}, ${buffer}, ${buffer.length})
    RETURNING id;
  `);
  return rowsOf(rows)[0]?.id as string;
}

export async function obterArquivo(id: string) {
  await ensureArquivosSchema();
  const d = requireDb();
  const rows = await d.execute(sql`
    SELECT mime_type, conteudo FROM arquivos_upload WHERE id = ${id}::uuid LIMIT 1;
  `);
  const row = rowsOf(rows)[0];
  if (!row) return null;
  return { mimeType: row.mime_type as string, conteudo: row.conteudo as Buffer };
}
