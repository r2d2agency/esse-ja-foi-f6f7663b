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

    // Logs e OTP também são dados da execução; preservamos somente configurações.
    // O log de auditoria é inserido após a limpeza, dentro da mesma transação.
    const alvos = tables.filter((table) => !PRESERVAR.has(table));
    // Ordena dependentes antes dos pais. Assim negociacoes é removida antes de
    // anuncios_veiculo, evitando a FK negociacoes_anuncio_id_fkey sem depender
    // da ordem alfabética de pg_tables.
    const fkRows = rowsOf(await tx.execute(sql`
      SELECT child.relname AS filha, parent.relname AS pai
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
      WHERE c.contype = 'f'
        AND child_ns.nspname = 'public'
        AND parent_ns.nspname = 'public'
    `));
    const pais = new Map<string, string[]>();
    for (const row of fkRows) {
      const filha = ident(row.filha);
      const pai = ident(row.pai);
      pais.set(filha, [...(pais.get(filha) || []), pai]);
    }
    const profundidades = new Map<string, number>();
    const calcularProfundidade = (tabela: string, caminho = new Set<string>()): number => {
      if (profundidades.has(tabela)) return profundidades.get(tabela)!;
      if (caminho.has(tabela)) return 0;
      const proximo = new Set(caminho).add(tabela);
      const profundidade = Math.max(0, ...(pais.get(tabela) || []).map((pai) => calcularProfundidade(pai, proximo))) + (pais.has(tabela) ? 1 : 0);
      profundidades.set(tabela, profundidade);
      return profundidade;
    };
    alvos.sort((a, b) => calcularProfundidade(b) - calcularProfundidade(a));
    let restantes = new Set(alvos);
    for (let tentativa = 0; tentativa < alvos.length + 2 && restantes.size; tentativa++) {
      let apagou = false;
      for (const tabela of [...restantes]) {
        const savepoint = `reset_${tentativa}_${tabela}`;
        await tx.execute(sql.raw(`SAVEPOINT ${savepoint}`));
        try {
          let total = 0;
          if (tabela === "arquivos_upload") {
            // Arquivos podem conter blobs grandes; apague em lotes para evitar
            // timeout e bloqueios longos durante o reset global.
            for (;;) {
              const result: any = await tx.execute(sql`
                DELETE FROM public.arquivos_upload
                WHERE id IN (
                  SELECT id FROM public.arquivos_upload
                  ORDER BY criado_em, id
                  LIMIT 25
                )
              `);
              const count = Number(result?.count ?? result?.rowCount ?? 0);
              total += count;
              if (count === 0) break;
            }
          } else {
            const result: any = await tx.execute(sql`DELETE FROM public.${sql.raw(tabela)}`);
            total = Number(result?.count ?? result?.rowCount ?? 0);
          }
          await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepoint}`));
          if (total) resumo[tabela] = (resumo[tabela] || 0) + total;
          restantes.delete(tabela);
          apagou = true;
        } catch (error: any) {
          const code = error?.cause?.code ?? error?.code;
          const message = String(error?.cause?.message ?? error?.message ?? "");
          const isForeignKey = code === "23503" || /violates foreign key constraint/i.test(message);
          if (!isForeignKey) {
            await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${savepoint}`));
            await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepoint}`));
            throw error;
          }
          // Tabela filha ainda possui referências; deixe para a próxima rodada.
          await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${savepoint}`));
          await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepoint}`));
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

    // A tabela de auditoria pode não existir em instalações antigas; não fazemos
    // o reset falhar por isso, pois a própria transação continua protegida.
    try {
      await tx.execute(sql`
        INSERT INTO logs (entidade, acao, detalhe)
        VALUES ('sistema', 'RESET_BASE_OPERACIONAL', ${JSON.stringify(resumo)})
      `);
    } catch (error) {
      console.warn("[purge] Não foi possível registrar auditoria do reset:", error);
    }
  });
  return resumo;
}
