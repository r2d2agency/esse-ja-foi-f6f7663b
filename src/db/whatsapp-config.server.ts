import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Leitura única da configuração do WhatsApp.
 *
 * A tabela `whatsapp_config` é conceitualmente de linha única, mas os
 * `INSERT ... WHERE NOT EXISTS` não são atômicos: duas requisições simultâneas
 * passam as duas pelo NOT EXISTS e criam duas linhas. Depois disso, salvar e
 * ler caem em linhas diferentes — a tela mostra a configuração salva enquanto o
 * serviço da Meta lê outra, sem `waba_id`, e falha com "WABA ID não
 * configurado." em toda chamada (inclusive na sincronização de templates e na
 * criação de template na Meta).
 *
 * Antes, `metaService.init()` lia `ORDER BY id LIMIT 1` e `getWhatsappConfig()`
 * lia `ORDER BY atualizado_em, id LIMIT 1` — depois de curar as duplicadas.
 * Este módulo elimina a divergência: todo mundo lê a MESMA linha.
 */

/** Colunas que o UPDATE/COALESCE de `curarConfigDuplicada` sabe mesclar. */
const COLUNAS_CONFIG = [
  "waba_id",
  "phone_number_id",
  "business_id",
  "phone_number",
  "app_id",
  "app_secret",
  "access_token",
  "graph_api_version",
  "webhook_verify_token",
  "status",
] as const;

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

/**
 * Mantém a linha de menor id (a que o UPDATE já visa) e absorve dela qualquer
 * valor preenchido que exista nas duplicadas, para não perder a configuração
 * que o usuário já havia salvo.
 */
export async function curarConfigDuplicada(d: any) {
  try {
    await d.execute(sql`
      DO $$
      DECLARE
        alvo uuid;
        col text;
      BEGIN
        SELECT id INTO alvo FROM whatsapp_config ORDER BY id LIMIT 1;
        IF alvo IS NULL THEN RETURN; END IF;

        FOREACH col IN ARRAY ARRAY[
          ${COLUNAS_CONFIG.join(",")}
        ] LOOP
          EXECUTE format(
            'UPDATE whatsapp_config SET %I = COALESCE(%I, (SELECT %I FROM whatsapp_config WHERE %I IS NOT NULL AND id <> $1 LIMIT 1)) WHERE id = $1',
            col, col, col, col
          ) USING alvo;
        END LOOP;

        DELETE FROM whatsapp_config WHERE id <> alvo;
      END $$;
    `);
  } catch (e) {
    if (process.env["NODE_ENV"] === "development")
      console.error("[whatsapp-config] Falha ao deduplicar whatsapp_config:", e);
  }
}

/**
 * Devolve a linha de configuração do WhatsApp — sempre a mesma para todos os
 * consumidores (UI, serviço da Meta, webhook).
 */
export async function lerWhatsappConfig(): Promise<any | null> {
  const d = requireDb();
  await curarConfigDuplicada(d);
  const res = await d.execute(sql`
    SELECT * FROM whatsapp_config
    ORDER BY id LIMIT 1
  `);
  const rows = Array.isArray(res)
    ? (res as any[])
    : Array.isArray((res as any)?.rows)
      ? (res as any).rows
      : [];
  return rows?.[0] || null;
}
