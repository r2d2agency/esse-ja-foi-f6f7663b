import { sql } from "drizzle-orm";
import { db } from "./index";

const PRESERVAR = new Set([
  "profiles",
  "configuracoes_sistema",
  "logs",
  "otp_codes",
  "termos",
  "changelog",
]);
const ROLES_INTERNOS = ["admin", "operacao", "vistoriador"];

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}
function rowsOf(res: any): any[] {
  return Array.isArray(res) ? res : Array.isArray(res?.rows) ? res.rows : [];
}
function ident(value: unknown) {
  const text = String(value || "");
  if (!/^[a-z_][a-z0-9_]*$/i.test(text)) throw new Error("Identificador inválido no catálogo.");
  return text;
}

/** Limpa todos os dados operacionais e preserva somente estrutura, configurações e perfis internos. */
export async function resetBaseOperacional(confirmacao: string) {
  if (confirmacao !== "LIMPAR BASE") throw new Error("Confirmação inválida.");
  const d = requireDb();
  const resumo: Record<string, number> = {};

  await d.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(771234567)`);
    const tables = rowsOf(await tx.execute(sql`
      SELECT tablename FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' ORDER BY tablename
    `)).map((row) => ident(row.tablename));

    const alvos = tables.filter((table) => !PRESERVAR.has(table));
    let restantes = new Set(alvos);
    for (let tentativa = 0; tentativa < alvos.length + 2 && restantes.size; tentativa++) {
      let apagou = false;
      for (const tabela of [...restantes]) {
        try {
          const result: any = await tx.execute(sql`DELETE FROM public.${sql.raw(tabela)}`);
          const count = Number(result?.count ?? result?.rowCount ?? 0);
          if (count) resumo[tabela] = (resumo[tabela] || 0) + count;
          restantes.delete(tabela);
          apagou = true;
        } catch (error: any) {
          const code = error?.cause?.code ?? error?.code;
          if (code !== "23503") throw error;
        }
      }
      if (!apagou) break;
    }
    if (restantes.size) {
      throw new Error(`Não foi possível limpar todas as tabelas operacionais: ${[...restantes].join(", ")}`);
    }

    const perfis = await tx.execute(sql`
      DELETE FROM profiles
      WHERE role::text NOT IN (${sql.join(ROLES_INTERNOS.map((role) => sql`${role}`), sql`, `)})
        AND COALESCE(protegido, false) = false
    `);
    const perfisRemovidos = Number((perfis as any)?.count ?? (perfis as any)?.rowCount ?? 0);
    if (perfisRemovidos) resumo.profiles = perfisRemovidos;

    await tx.execute(sql`
      INSERT INTO logs (entidade, acao, detalhe)
      VALUES ('sistema', 'RESET_BASE_OPERACIONAL', ${JSON.stringify(resumo)})
    `);
  });
  return resumo;
}
