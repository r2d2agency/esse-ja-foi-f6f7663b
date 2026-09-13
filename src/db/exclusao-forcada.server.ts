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

const LIMITE_TOTAL_LINHAS = 5000;
const LIMITE_PROFUNDIDADE = 12;

/**
 * Apaga uma linha e, recursivamente, qualquer linha em OUTRA tabela que a referencie por chave
 * estrangeira — descoberto em tempo real via information_schema, não por uma lista fixa de
 * tabelas escrita à mão (o esquema deste projeto muda com frequência e uma lista manual ficaria
 * desatualizada). Assume convenção `id uuid` como chave primária em todas as tabelas, que é o
 * padrão observado neste banco.
 *
 * NUNCA chamar isso sem antes confirmar autorização de superadmin (requireSuperAdmin) e o
 * código de confirmação por e-mail (validarOTP) — não há nenhuma outra proteção aqui além do
 * gatilho `check_profile_protegido`/`protege_superadmin` do Postgres, que ainda assim impede
 * apagar um superadmin mesmo por esta via.
 */
async function apagarComCascataManual(
  tabela: string,
  id: string,
  resumo: Record<string, number>,
  profundidade = 0,
): Promise<void> {
  if (profundidade > LIMITE_PROFUNDIDADE) {
    throw new Error(`Profundidade máxima de exclusão em cascata excedida em "${tabela}".`);
  }
  const totalAtual = Object.values(resumo).reduce((a, b) => a + b, 0);
  if (totalAtual > LIMITE_TOTAL_LINHAS) {
    throw new Error("Exclusão em cascata excedeu o limite de segurança de linhas apagadas.");
  }

  const d = requireDb();
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    try {
      await d.execute(sql`DELETE FROM ${sql.raw(tabela)} WHERE id = ${id}::uuid`);
      resumo[tabela] = (resumo[tabela] || 0) + 1;
      return;
    } catch (err: any) {
      const codigo = err?.cause?.code ?? err?.code;
      const constraint = err?.cause?.constraint_name ?? err?.constraint_name;
      if (codigo !== "23503" || !constraint) throw err;

      const infoRes = await d.execute(sql`
        SELECT tc.table_name AS tabela, kcu.column_name AS coluna
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_name = ${constraint} AND tc.constraint_type = 'FOREIGN KEY'
        LIMIT 1
      `);
      const info = rowsOf(infoRes)[0];
      if (!info) throw err;

      const filhosRes = await d.execute(
        sql`SELECT id FROM ${sql.raw(info.tabela)} WHERE ${sql.raw(info.coluna)} = ${id}::uuid`,
      );
      const filhos = rowsOf(filhosRes);
      if (filhos.length === 0) throw err; // evita loop infinito se a tabela filha não tiver coluna "id"

      for (const filho of filhos) {
        await apagarComCascataManual(info.tabela, String(filho.id), resumo, profundidade + 1);
      }
    }
  }
  throw new Error(`Não foi possível excluir ${tabela}/${id} — muitas tentativas.`);
}

async function registrarLogExclusaoForcada(entidade: string, entidadeId: string, resumo: Record<string, number>) {
  const d = requireDb();
  await d.execute(sql`
    INSERT INTO logs (entidade, entidade_id, acao, detalhe)
    VALUES (${entidade}, ${entidadeId}::uuid, 'EXCLUIDO_FORCADO', ${JSON.stringify(resumo)})
  `);
}

export async function excluirVeiculoForcado(veiculoId: string) {
  const resumo: Record<string, number> = {};
  await apagarComCascataManual("veiculos", veiculoId, resumo);
  await registrarLogExclusaoForcada("veiculo", veiculoId, resumo);
  return resumo;
}

/** Vale para vendedor ou comprador — ambos são linhas de `profiles`. */
export async function excluirPerfilForcado(perfilId: string) {
  const resumo: Record<string, number> = {};
  await apagarComCascataManual("profiles", perfilId, resumo);
  await registrarLogExclusaoForcada("perfil", perfilId, resumo);
  return resumo;
}
