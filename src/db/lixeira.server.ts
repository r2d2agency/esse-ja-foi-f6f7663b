import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

/**
 * Lixeira do superadmin — "apagar" aqui é soft-delete.
 *
 * - Vendedor, comprador (`profiles`) e carro (`veiculos`) marcados com
 *   `apagado = true` somem de TODAS as listagens para qualquer usuário comum
 *   (admin, operação, vistoriador, vendedor, comprador, vitrine pública).
 * - Só quem é superadmin (`role = admin` + `protegido = true`) continua vendo
 *   esses registros, com selo "Apagado", e pode restaurar.
 * - Nada é excluído de verdade: vínculos (veículos, lances, contratos etc.)
 *   permanecem intactos.
 */
export async function ensureLixeiraSchema() {
  const d = requireDb();
  await d.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'apagado') THEN
        ALTER TABLE profiles ADD COLUMN apagado boolean NOT NULL DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'apagado_em') THEN
        ALTER TABLE profiles ADD COLUMN apagado_em timestamptz;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'apagado_por') THEN
        ALTER TABLE profiles ADD COLUMN apagado_por uuid;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'apagado') THEN
        ALTER TABLE veiculos ADD COLUMN apagado boolean NOT NULL DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'apagado_em') THEN
        ALTER TABLE veiculos ADD COLUMN apagado_em timestamptz;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'apagado_por') THEN
        ALTER TABLE veiculos ADD COLUMN apagado_por uuid;
      END IF;
    END $$;
  `);
}

/** true quando a coluna `apagado` existe na tabela (base antiga ainda sem migrate). */
async function temColunaApagado(tabela: "profiles" | "veiculos"): Promise<boolean> {
  const d = requireDb();
  try {
    const res: any = await d.execute(sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${tabela} AND column_name = 'apagado' LIMIT 1
    `);
    const linhas = Array.isArray(res) ? res : res?.rows || [];
    return linhas.length > 0;
  } catch {
    return false;
  }
}

/** Marca ou restaura um perfil (vendedor/comprador). Só superadmin chama (guard na fn). */
export async function marcarPerfilApagado(perfilId: string, apagado: boolean, apagadoPor: string) {
  const d = requireDb();
  await ensureLixeiraSchema();
  // Superadmin (protegido) nunca pode ser apagado — nem por outro superadmin.
  const alvo: any = await d.execute(sql`SELECT id, protegido, role FROM profiles WHERE id = ${perfilId}::uuid LIMIT 1`);
  const linha = (Array.isArray(alvo) ? alvo : alvo?.rows || [])[0];
  if (!linha) throw new Error("Cadastro não encontrado.");
  if (linha.protegido) throw new Error("Este perfil é protegido e não pode ser apagado.");
  if (String(linha.role) !== "vendedor" && String(linha.role) !== "comprador") {
    throw new Error("Só vendedores e compradores podem ser marcados como apagados por aqui.");
  }
  await d.execute(sql`
    UPDATE profiles
    SET apagado = ${apagado},
        apagado_em = ${apagado ? sql`now()` : null},
        apagado_por = ${apagado ? apagadoPor : null}::uuid,
        atualizado_em = now()
    WHERE id = ${perfilId}::uuid
  `);
  await d.execute(sql`
    INSERT INTO logs (entidade, acao, detalhe, usuario)
    VALUES ('perfil', ${apagado ? "APAGADO" : "RESTAURADO"}, ${perfilId}, ${apagadoPor})
  `).catch(() => {});
  return { ok: true as const };
}

/** Marca ou restaura um veículo. Só superadmin chama (guard na fn). */
export async function marcarVeiculoApagado(veiculoId: string, apagado: boolean, apagadoPor: string) {
  const d = requireDb();
  await ensureLixeiraSchema();
  const alvo: any = await d.execute(sql`SELECT id FROM veiculos WHERE id = ${veiculoId}::uuid LIMIT 1`);
  const linha = (Array.isArray(alvo) ? alvo : alvo?.rows || [])[0];
  if (!linha) throw new Error("Veículo não encontrado.");
  await d.execute(sql`
    UPDATE veiculos
    SET apagado = ${apagado},
        apagado_em = ${apagado ? sql`now()` : null},
        apagado_por = ${apagado ? apagadoPor : null}::uuid,
        atualizado_em = now()
    WHERE id = ${veiculoId}::uuid
  `);
  await d.execute(sql`
    INSERT INTO logs (entidade, entidade_id, acao, detalhe, usuario)
    VALUES ('veiculo', ${veiculoId}::uuid, ${apagado ? "APAGADO" : "RESTAURADO"}, ${veiculoId}, ${apagadoPor})
  `).catch(() => {});
  return { ok: true as const };
}

/**
 * Fragmento WHERE para esconder apagados de quem não é superadmin.
 * Uso: `WHERE ... ${filtroApagados("p", incluirApagados)}`.
 */
export function filtroApagados(alias: string, incluirApagados: boolean) {
  if (incluirApagados) return sql``;
  // COALESCE protege bases onde a coluna ainda não existe em alguma réplica.
  return sql`AND COALESCE(${sql.raw(alias)}.apagado, false) = false`;
}

export async function colunaApagadoExiste(tabela: "profiles" | "veiculos") {
  return temColunaApagado(tabela);
}
