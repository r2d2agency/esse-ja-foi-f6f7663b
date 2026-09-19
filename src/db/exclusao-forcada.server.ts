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

function identifier(value: unknown, label: string): string {
  const text = String(value || "");
  if (!/^[a-z_][a-z0-9_]*$/i.test(text)) {
    throw new Error(`Identificador inválido encontrado no banco (${label}).`);
  }
  return text;
}

const LIMITE_TOTAL_LINHAS = 5000;
const LIMITE_PROFUNDIDADE = 12;
const LIMITE_TENTATIVAS = 50;

type DbExecutor = NonNullable<typeof db>;

/**
 * Exclusão administrativa destrutiva. O grafo é descoberto pelo catálogo do PostgreSQL,
 * mas toda a operação roda em uma única transação: qualquer falha desfaz toda a limpeza.
 * Nunca chamar sem requireSuperAdmin + OTP no endpoint de server function.
 */
async function apagarComCascataManual(
  executor: DbExecutor,
  tabela: string,
  id: string,
  resumo: Record<string, number>,
  visitados: Set<string>,
  profundidade = 0,
): Promise<void> {
  const tabelaSegura = identifier(tabela, "tabela");
  if (profundidade > LIMITE_PROFUNDIDADE) {
    throw new Error(`Profundidade máxima de exclusão em cascata excedida em "${tabelaSegura}".`);
  }

  const chave = `${tabelaSegura}:${id}`;
  if (visitados.has(chave)) return;
  visitados.add(chave);

  const totalAtual = Object.values(resumo).reduce((a, b) => a + b, 0);
  if (totalAtual >= LIMITE_TOTAL_LINHAS) {
    throw new Error("Exclusão em cascata excedeu o limite de segurança de linhas apagadas.");
  }

  for (let tentativa = 0; tentativa < LIMITE_TENTATIVAS; tentativa++) {
    try {
      await executor.execute(sql`DELETE FROM public.${sql.raw(tabelaSegura)} WHERE id = ${id}::uuid`);
      resumo[tabelaSegura] = (resumo[tabelaSegura] || 0) + 1;
      return;
    } catch (err: any) {
      const codigo = err?.cause?.code ?? err?.code;
      const constraint = err?.cause?.constraint_name ?? err?.constraint_name;
      if (codigo !== "23503" || !constraint) throw err;

      const infoRes = await executor.execute(sql`
        SELECT tc.table_name AS tabela, kcu.column_name AS coluna
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_schema = 'public'
          AND tc.constraint_name = ${constraint}
          AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY kcu.ordinal_position
        LIMIT 1
      `);
      const info = rowsOf(infoRes)[0];
      if (!info) throw err;

      const tabelaFilha = identifier(info.tabela, "tabela filha");
      const colunaFilha = identifier(info.coluna, "coluna filha");
      const filhosRes = await executor.execute(
        sql`SELECT id FROM public.${sql.raw(tabelaFilha)} WHERE ${sql.raw(colunaFilha)} = ${id}::uuid`,
      );
      const filhos = rowsOf(filhosRes);
      if (filhos.length === 0) throw err;

      for (const filho of filhos) {
        if (!filho?.id) {
          throw new Error(`A tabela "${tabelaFilha}" possui vínculo sem chave id compatível; limpeza abortada.`);
        }
        await apagarComCascataManual(
          executor,
          tabelaFilha,
          String(filho.id),
          resumo,
          visitados,
          profundidade + 1,
        );
      }
    }
  }
  throw new Error(`Não foi possível excluir ${tabelaSegura}/${id} — muitas tentativas.`);
}

async function registrarLogExclusaoForcada(
  executor: DbExecutor,
  entidade: string,
  entidadeId: string,
  resumo: Record<string, number>,
) {
  await executor.execute(sql`
    INSERT INTO logs (entidade, entidade_id, acao, detalhe)
    VALUES (${entidade}, ${entidadeId}::uuid, 'EXCLUIDO_FORCADO', ${JSON.stringify(resumo)})
  `);
}

async function executarExclusaoForcada(entidade: string, tabela: string, id: string) {
  const d = requireDb();
  const resumo: Record<string, number> = {};
  await d.transaction(async (tx) => {
    const alvo = await tx.execute(sql`SELECT id FROM public.${sql.raw(identifier(tabela, "tabela alvo"))} WHERE id = ${id}::uuid LIMIT 1`);
    if (rowsOf(alvo).length === 0) throw new Error("Registro não encontrado ou já removido.");
    await apagarComCascataManual(tx as DbExecutor, tabela, id, resumo, new Set());
    await registrarLogExclusaoForcada(tx as DbExecutor, entidade, id, resumo);
  });
  return resumo;
}

export async function excluirVeiculoForcado(veiculoId: string) {
  return executarExclusaoForcada("veiculo", "veiculos", veiculoId);
}

/** Vale para vendedor ou comprador — ambos são linhas de `profiles`. */
export async function excluirPerfilForcado(perfilId: string) {
  return executarExclusaoForcada("perfil", "profiles", perfilId);
}
