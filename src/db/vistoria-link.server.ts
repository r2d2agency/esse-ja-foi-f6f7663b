import { sql } from "drizzle-orm";
import { db } from "./index";
import { gerarToken } from "./publicacao.server";

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

export async function ensureVistoriaLinkSchema() {
  const d = requireDb();
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS vistoria_links (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      perfil_id uuid NOT NULL REFERENCES profiles(id),
      veiculo_id uuid REFERENCES veiculos(id),
      token text NOT NULL UNIQUE,
      ativo boolean NOT NULL DEFAULT true,
      criado_por uuid REFERENCES profiles(id),
      criado_em timestamptz NOT NULL DEFAULT now(),
      preenchido_em timestamptz
    );
  `);
  await d.execute(sql`
    CREATE INDEX IF NOT EXISTS vistoria_links_token_idx ON vistoria_links(token);
  `);
}

/**
 * Cria o perfil do vendedor "do zero" (só nome + whatsapp) e gera o link público
 * de vistoria simplificada. O e-mail é um placeholder único (nunca é usado para
 * enviar nada) só para satisfazer a constraint NOT NULL UNIQUE de profiles.email
 * até o vendedor formalizar o cadastro completo depois, pelos fluxos já existentes.
 */
export async function gerarLinkVistoria(dados: { nome: string; whatsapp: string; criadoPor?: string | null }) {
  const d = requireDb();
  await ensureVistoriaLinkSchema();

  const token = gerarToken();
  const emailPlaceholder = `vistoria+${token}@pendente.essejafoi.local`;

  const { criarVendedorInterno } = await import("./pre-cadastro.server");
  const { perfilId } = await criarVendedorInterno(
    { nome: dados.nome, email: emailPlaceholder, whatsapp: dados.whatsapp },
    dados.criadoPor,
    { enviarAcesso: false, origemCadastro: "LINK_PUBLICO", statusCompliance: "NAO_ENVIADO" },
  );

  await d.execute(sql`
    INSERT INTO vistoria_links (perfil_id, token, criado_por)
    VALUES (${perfilId}::uuid, ${token}, ${dados.criadoPor ? sql`${dados.criadoPor}::uuid` : sql`NULL`})
  `);

  const base = process.env["APP_URL"] || process.env["VITE_APP_URL"] || "";
  return { ok: true as const, token, perfilId, link: `${base}/vistoria/${token}` };
}

async function buscarLinkAtivo(token: string) {
  const d = requireDb();
  const rows = rowsOf(
    await d.execute(sql`
      SELECT vl.*, p.nome as vendedor_nome
      FROM vistoria_links vl
      JOIN profiles p ON p.id = vl.perfil_id
      WHERE vl.token = ${token} AND vl.ativo = true
      LIMIT 1
    `),
  );
  return rows[0] || null;
}

export async function getVistoriaPorToken(token: string) {
  await ensureVistoriaLinkSchema();
  const link = await buscarLinkAtivo(token);
  if (!link) return null;

  const d = requireDb();
  let veiculo: any = null;
  if (link.veiculo_id) {
    const rows = rowsOf(
      await d.execute(sql`SELECT * FROM veiculos WHERE id = ${link.veiculo_id}::uuid LIMIT 1`),
    );
    veiculo = rows[0] || null;
  }

  const { desserializarCondicao } = await import("@/lib/veiculo-condicao");
  const condicao = veiculo ? desserializarCondicao(veiculo.observacoes) : {};
  let fotos: string[] = [];
  if (veiculo?.fotos) {
    try {
      const parsed = JSON.parse(veiculo.fotos);
      if (Array.isArray(parsed)) fotos = parsed;
    } catch {
      /* ignora */
    }
  }

  return {
    vendedorNome: link.vendedor_nome as string,
    jaPreenchido: !!link.preenchido_em,
    preenchidoEm: link.preenchido_em,
    veiculo,
    condicao,
    fotos,
    crlv: veiculo?.documento_crlv_url || null,
  };
}

export async function enviarVistoriaPorToken(token: string, veiculo: import("./cadastro.server").VeiculoInput) {
  const d = requireDb();
  await ensureVistoriaLinkSchema();
  const link = await buscarLinkAtivo(token);
  if (!link) throw new Error("Link inválido ou revogado.");

  const { salvarVeiculo } = await import("./cadastro.server");
  const resultado = await salvarVeiculo({
    ...veiculo,
    id: link.veiculo_id || undefined,
    perfilId: link.perfil_id,
    status: "AGUARDANDO_APROVACAO",
  });

  await d.execute(sql`
    UPDATE vistoria_links
    SET veiculo_id = ${resultado.id}::uuid, preenchido_em = now()
    WHERE id = ${link.id}::uuid
  `);

  await notificarPreenchimento(link.vendedor_nome, resultado.id);

  return { ok: true as const, veiculoId: resultado.id };
}

async function notificarPreenchimento(vendedorNome: string, veiculoId: string) {
  try {
    const d = requireDb();
    const rows = rowsOf(
      await d.execute(sql`
        SELECT valor FROM configuracoes_sistema WHERE chave = 'notificacao_email_operacao'
      `),
    );
    const destinatario = rows[0]?.valor?.trim();
    if (!destinatario) return;

    const base = process.env["APP_URL"] || process.env["VITE_APP_URL"] || "";
    const link = `${base}/admin/veiculo/${veiculoId}`;
    const { enviarEmailSimples } = await import("./mail.server");
    await enviarEmailSimples(
      destinatario,
      "Vistoria simplificada preenchida por link",
      `
        <div style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a">
          <h2 style="margin:0 0 12px">Vistoria simplificada recebida</h2>
          <p><strong>${vendedorNome}</strong> preencheu as informações do veículo pelo link de vistoria.</p>
          ${link ? `<p><a href="${link}">Ver veículo no painel</a></p>` : ""}
        </div>`,
    );
  } catch (e) {
    console.error("[vistoria-link] notificação de e-mail", e);
  }
}

/** Link ativo mais recente de um perfil (para exibir na tela do vendedor no admin). */
export async function getVistoriaLinkPorPerfil(perfilId: string) {
  const d = requireDb();
  await ensureVistoriaLinkSchema();
  const rows = rowsOf(
    await d.execute(sql`
      SELECT * FROM vistoria_links
      WHERE perfil_id = ${perfilId}::uuid AND ativo = true
      ORDER BY criado_em DESC LIMIT 1
    `),
  );
  const link = rows[0] || null;
  if (!link) return null;
  const base = process.env["APP_URL"] || process.env["VITE_APP_URL"] || "";
  return { ...link, link: `${base}/vistoria/${link.token}` };
}

export async function revogarVistoriaLink(linkId: string) {
  const d = requireDb();
  await d.execute(sql`UPDATE vistoria_links SET ativo = false WHERE id = ${linkId}::uuid`);
  return { ok: true as const };
}

export async function contarVistoriaLinksPendentes() {
  const d = requireDb();
  try {
    await ensureVistoriaLinkSchema();
    const rows = rowsOf(
      await d.execute(sql`
        SELECT count(*)::int as total FROM vistoria_links
        WHERE ativo = true AND preenchido_em IS NULL
      `),
    );
    return Number(rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}
