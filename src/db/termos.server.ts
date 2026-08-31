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

const TERMO_PADRAO = `TERMO DE ADESÃO E AUTORIZAÇÃO DE VENDA — ESSE JÁ FOI

1. O VENDEDOR declara ser o legítimo proprietário do(s) veículo(s) cadastrado(s) e autoriza a plataforma ESSE JÁ FOI a divulgar, anunciar e submeter o(s) veículo(s) a leilão eletrônico.
2. O VENDEDOR declara que as informações e documentos apresentados são verdadeiros e responde civil e criminalmente por eventuais divergências.
3. O VENDEDOR autoriza a plataforma a intermediar a negociação, receber propostas e conduzir o encerramento da venda ao maior ofertante, observadas as regras do leilão.
4. A comissão da plataforma e as condições de repasse são as vigentes no momento da venda e serão apresentadas no fechamento financeiro.
5. Este aceite é firmado eletronicamente, com registro de data, hora, endereço IP e identificação do navegador, nos termos do art. 10, §2º, da MP 2.200-2/2001.`;

export async function ensureTermosSchema() {
  const d = requireDb();
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS termos_versoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      versao text NOT NULL,
      titulo text NOT NULL DEFAULT 'Termo de adesão do vendedor',
      conteudo text NOT NULL,
      ativo boolean NOT NULL DEFAULT true,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS termos_aceites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      perfil_id uuid NOT NULL,
      termo_id uuid,
      versao text,
      conteudo_hash text,
      assinatura text,
      ip text,
      user_agent text,
      aceito_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS senha_temporaria boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS origem_cadastro text DEFAULT 'APP',
      ADD COLUMN IF NOT EXISTS termo_aceito_em timestamptz;
  `);

  const atual = rowsOf(await d.execute(sql`SELECT id FROM termos_versoes WHERE ativo = true LIMIT 1`));
  if (atual.length === 0) {
    await d.execute(sql`
      INSERT INTO termos_versoes (versao, conteudo) VALUES ('1.0', ${TERMO_PADRAO})
    `);
  }
}

export async function getTermoVigente() {
  const d = requireDb();
  await ensureTermosSchema();
  const rows = rowsOf(
    await d.execute(sql`SELECT * FROM termos_versoes WHERE ativo = true ORDER BY criado_em DESC LIMIT 1`),
  );
  return rows[0] || null;
}

export async function salvarTermo(versao: string, conteudo: string, titulo?: string) {
  const d = requireDb();
  await ensureTermosSchema();
  await d.execute(sql`UPDATE termos_versoes SET ativo = false WHERE ativo = true`);
  await d.execute(sql`
    INSERT INTO termos_versoes (versao, titulo, conteudo, ativo)
    VALUES (${versao}, ${titulo || "Termo de adesão do vendedor"}, ${conteudo}, true)
  `);
  return { ok: true as const };
}

async function hashConteudo(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function registrarAceiteTermo(params: {
  perfilId: string;
  assinatura: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const d = requireDb();
  const termo = await getTermoVigente();
  if (!termo) throw new Error("Nenhum termo configurado.");
  const hash = await hashConteudo(String(termo.conteudo));

  await d.execute(sql`
    INSERT INTO termos_aceites (perfil_id, termo_id, versao, conteudo_hash, assinatura, ip, user_agent)
    VALUES (
      ${params.perfilId}::uuid, ${termo.id}::uuid, ${termo.versao}, ${hash},
      ${params.assinatura}, ${params.ip || null}, ${params.userAgent || null}
    )
  `);
  await d.execute(sql`
    UPDATE profiles SET termo_aceito_em = now(), atualizado_em = now() WHERE id = ${params.perfilId}::uuid
  `);
  return { ok: true as const };
}

export async function getAceiteDoPerfil(perfilId: string) {
  const d = requireDb();
  await ensureTermosSchema();
  const rows = rowsOf(
    await d.execute(sql`
      SELECT a.*, t.titulo, t.conteudo
      FROM termos_aceites a
      LEFT JOIN termos_versoes t ON t.id = a.termo_id
      WHERE a.perfil_id = ${perfilId}::uuid
      ORDER BY a.aceito_em DESC LIMIT 1
    `),
  );
  return rows[0] || null;
}

/** Aceite do vendedor dono do veículo — usado na ficha interna do carro. */
export async function getAceitePorVeiculo(veiculoId: string) {
  const d = requireDb();
  await ensureTermosSchema();
  const v = rowsOf(
    await d.execute(
      sql`SELECT COALESCE(perfil_id, vendedor_id) as perfil_id FROM veiculos WHERE id = ${veiculoId}::uuid`,
    ),
  )[0];
  if (!v?.perfil_id) return null;
  return getAceiteDoPerfil(String(v.perfil_id));
}
