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

export type TipoTermo = "VENDEDOR" | "COMPRADOR";

const TERMO_PADRAO_VENDEDOR = `TERMO DE ADESÃO E AUTORIZAÇÃO DE VENDA — ESSE JÁ FOI

1. O VENDEDOR declara ser o legítimo proprietário do(s) veículo(s) cadastrado(s) e autoriza a plataforma ESSE JÁ FOI a divulgar, anunciar e submeter o(s) veículo(s) a leilão eletrônico.
2. O VENDEDOR declara que as informações e documentos apresentados são verdadeiros e responde civil e criminalmente por eventuais divergências.
3. O VENDEDOR autoriza a plataforma a intermediar a negociação, receber propostas e conduzir o encerramento da venda ao maior ofertante, observadas as regras do leilão.
4. A comissão da plataforma e as condições de repasse são as vigentes no momento da venda e serão apresentadas no fechamento financeiro.
5. Este aceite é firmado eletronicamente, com registro de data, hora, endereço IP e identificação do navegador, nos termos do art. 10, §2º, da MP 2.200-2/2001.`;

const TERMO_PADRAO_COMPRADOR = `TERMO DE USO E AUTORIZAÇÃO DE LANCES — ESSE JÁ FOI

1. O COMPRADOR declara que as informações e documentos apresentados no cadastro são verdadeiros e responde civil e criminalmente por eventuais divergências.
2. O COMPRADOR reconhece que todo lance registrado na plataforma é uma oferta de compra vinculante e irrevogável, condicionada apenas ao encerramento do leilão a seu favor.
3. O COMPRADOR se compromete a efetuar o pagamento e retirar o veículo arrematado nos prazos e condições informados no fechamento de cada leilão.
4. O não cumprimento das condições de pagamento e retirada pode acarretar bloqueio do cadastro e demais medidas cabíveis, observadas as regras da plataforma.
5. Este aceite é firmado eletronicamente, com registro de data, hora, endereço IP e identificação do navegador, nos termos do art. 10, §2º, da MP 2.200-2/2001.`;

const TITULO_PADRAO: Record<TipoTermo, string> = {
  VENDEDOR: "Termo de adesão do vendedor",
  COMPRADOR: "Termo de uso do comprador",
};

const TERMO_PADRAO: Record<TipoTermo, string> = {
  VENDEDOR: TERMO_PADRAO_VENDEDOR,
  COMPRADOR: TERMO_PADRAO_COMPRADOR,
};

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
    ALTER TABLE termos_versoes ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'VENDEDOR';
  `);
  await d.execute(sql`
    ALTER TABLE termos_aceites ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'VENDEDOR';
  `);
  await d.execute(sql`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS senha_temporaria boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS origem_cadastro text DEFAULT 'APP',
      ADD COLUMN IF NOT EXISTS termo_aceito_em timestamptz;
  `);

  for (const tipo of ["VENDEDOR", "COMPRADOR"] as TipoTermo[]) {
    const atual = rowsOf(
      await d.execute(sql`SELECT id FROM termos_versoes WHERE ativo = true AND tipo = ${tipo} LIMIT 1`),
    );
    if (atual.length === 0) {
      await d.execute(sql`
        INSERT INTO termos_versoes (versao, titulo, conteudo, tipo)
        VALUES ('1.0', ${TITULO_PADRAO[tipo]}, ${TERMO_PADRAO[tipo]}, ${tipo})
      `);
    }
  }
}

export async function getTermoVigente(tipo: TipoTermo = "VENDEDOR") {
  const d = requireDb();
  await ensureTermosSchema();
  const rows = rowsOf(
    await d.execute(
      sql`SELECT * FROM termos_versoes WHERE ativo = true AND tipo = ${tipo} ORDER BY criado_em DESC LIMIT 1`,
    ),
  );
  return rows[0] || null;
}

export async function salvarTermo(
  tipo: TipoTermo,
  versao: string,
  conteudo: string,
  titulo?: string,
) {
  const d = requireDb();
  await ensureTermosSchema();
  await d.execute(sql`UPDATE termos_versoes SET ativo = false WHERE ativo = true AND tipo = ${tipo}`);
  await d.execute(sql`
    INSERT INTO termos_versoes (versao, titulo, conteudo, tipo, ativo)
    VALUES (${versao}, ${titulo || TITULO_PADRAO[tipo]}, ${conteudo}, ${tipo}, true)
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
  tipo?: TipoTermo;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const d = requireDb();
  const tipo = params.tipo || "VENDEDOR";
  const termo = await getTermoVigente(tipo);
  if (!termo) throw new Error("Nenhum termo configurado.");
  const hash = await hashConteudo(String(termo.conteudo));

  await d.execute(sql`
    INSERT INTO termos_aceites (perfil_id, termo_id, versao, conteudo_hash, assinatura, tipo, ip, user_agent)
    VALUES (
      ${params.perfilId}::uuid, ${termo.id}::uuid, ${termo.versao}, ${hash},
      ${params.assinatura}, ${tipo}, ${params.ip || null}, ${params.userAgent || null}
    )
  `);
  await d.execute(sql`
    UPDATE profiles SET termo_aceito_em = now(), atualizado_em = now() WHERE id = ${params.perfilId}::uuid
  `);

  if (tipo === "VENDEDOR") {
    // O veículo cadastrado pelo pré-cadastro interno nasce em "AGUARDANDO_APROVACAO"
    // (fora da máquina de estados normal) porque o vendedor ainda não tinha autorizado
    // formalmente a venda. Assinado o termo, ele é liberado para "CADASTRADO" — o ponto
    // de entrada do funil normal (agendamento de vistoria, análise, e só então anúncio).
    await d.execute(sql`
      UPDATE veiculos
      SET status = 'CADASTRADO', atualizado_em = now()
      WHERE (perfil_id = ${params.perfilId}::uuid OR vendedor_id = ${params.perfilId}::uuid)
        AND status = 'AGUARDANDO_APROVACAO'
    `);
  }

  return { ok: true as const };
}

export async function getAceiteDoPerfil(perfilId: string, tipo?: TipoTermo) {
  const d = requireDb();
  await ensureTermosSchema();
  const rows = rowsOf(
    await d.execute(sql`
      SELECT a.*, t.titulo, t.conteudo
      FROM termos_aceites a
      LEFT JOIN termos_versoes t ON t.id = a.termo_id
      WHERE a.perfil_id = ${perfilId}::uuid
        ${tipo ? sql`AND a.tipo = ${tipo}` : sql``}
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
  return getAceiteDoPerfil(String(v.perfil_id), "VENDEDOR");
}
