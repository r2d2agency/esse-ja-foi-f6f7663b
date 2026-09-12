import { sql } from "drizzle-orm";
import { db } from "./index";

export type Row = Record<string, any>;

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function ensureAdminTables(silent = true) {
  const d = requireDb();
  if (!silent && process.env['NODE_ENV'] === 'development') console.log("[admin.server] Garantindo tabelas admin...");

  try {
    // Tabela de configurações
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS configuracoes_sistema (
        chave text PRIMARY KEY,
        valor text NOT NULL,
        descricao text,
        atualizado_em timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Tabela de logs (se não existir, embora já devesse existir pela migration)
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entidade text NOT NULL,
        acao text NOT NULL,
        detalhe text,
        usuario text,
        criado_em timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Tabela depreciacao_regras (se não existir)
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS public.depreciacao_regras (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id uuid,
        resposta text,
        tipo_desconto text NOT NULL DEFAULT 'PERCENTUAL',
        valor numeric(14,2) NOT NULL DEFAULT 0,
        fator_leve numeric(14,2) DEFAULT 0.6,
        fator_media numeric(14,2) DEFAULT 1.0,
        fator_grave numeric(14,2) DEFAULT 1.8,
        ativo boolean NOT NULL DEFAULT true,
        criado_em timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Tabela depreciacao_calculos (se não existir)
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS public.depreciacao_calculos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        laudo_id uuid,
        veiculo_id uuid,
        usuario_id uuid,
        valor_fipe numeric(14,2),
        valor_final numeric(14,2),
        detalhamento jsonb,
        fora_da_curva boolean DEFAULT false,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Tabela de compliance
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS public.compliance_analise (
        vendedor_id uuid PRIMARY KEY REFERENCES profiles(id),
        status text NOT NULL DEFAULT 'PENDENTE',
        observacoes text,
        responsavel_id uuid REFERENCES profiles(id),
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Tabela de documentos genérica
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS public.documentos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entidade text NOT NULL, -- 'vendedor', 'veiculo'
        entidade_id uuid NOT NULL,
        tipo text NOT NULL, -- 'CNH', 'CRLV', 'SELFIE', 'FOTO_VEICULO'
        url text NOT NULL,
        status text NOT NULL DEFAULT 'PENDENTE',
        observacoes text,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Adiciona constraint UNIQUE para documentos para permitir ON CONFLICT (idempotente)
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'documentos_entidade_tipo_uidx'
        ) AND NOT EXISTS (
          SELECT 1 FROM pg_class WHERE relname = 'documentos_entidade_tipo_uidx'
        ) THEN
          ALTER TABLE public.documentos
            ADD CONSTRAINT documentos_entidade_tipo_uidx UNIQUE (entidade, entidade_id, tipo);
        END IF;
      END $$;
    `);




    // Sementes iniciais
    const { PROMPT_IA_DOCUMENTOS_PADRAO } = await import("./ia-documentos.server");
    await d.execute(sql`
      INSERT INTO configuracoes_sistema (chave, valor, descricao)
      VALUES
        ('smtp_host', '', 'Host do servidor SMTP'),
        ('smtp_port', '587', 'Porta do servidor SMTP'),
        ('smtp_user', '', 'Usuário do servidor SMTP'),
        ('smtp_pass', '', 'Senha do servidor SMTP'),
        ('openai_api_key', '', 'Chave de API da OpenAI'),
        ('openai_model', 'gpt-4o', 'Modelo da OpenAI a ser utilizado (precisa suportar visão)'),
        ('ia_analise_documentos_ativa', 'true', 'Analisar automaticamente os documentos do vendedor com IA ao serem enviados'),
        ('ia_auto_reprovar', 'true', 'Reprovar automaticamente um documento quando a IA tiver certeza (alta/média confiança) de que não confere'),
        ('seo_titulo_site', '', 'Título de SEO da landing page (vazio usa o padrão do código)'),
        ('seo_descricao_site', '', 'Descrição de SEO da landing page (vazio usa o padrão do código)'),
        ('seo_imagem_og_url', '', 'URL da imagem usada ao compartilhar o site (og:image / twitter:image)'),
        ('tracking_gtm_id', '', 'ID do container do Google Tag Manager (ex: GTM-XXXXXXX)'),
        ('tracking_google_ads_id', '', 'ID de conversão do Google Ads (ex: AW-XXXXXXXXX)'),
        ('tracking_meta_pixel_id', '', 'ID do Pixel do Meta (Facebook/Instagram Ads)'),
        ('tracking_meta_capi_token', '', 'Token de acesso da Conversions API do Meta (nunca exposto ao navegador)'),
        ('tracking_meta_capi_ativa', 'false', 'Enviar eventos também pela Conversions API do Meta (servidor-a-servidor)'),
        ('tracking_head_html', '', 'HTML/script customizado injetado no <head> de todas as páginas'),
        ('tracking_body_html', '', 'HTML/script customizado injetado logo após a abertura do <body> de todas as páginas'),
        (${'ia_prompt_documentos'}, ${PROMPT_IA_DOCUMENTOS_PADRAO}, 'Prompt de sistema usado pela IA para validar CNH, CRLV, comprovante e selfie do vendedor')
      ON CONFLICT (chave) DO NOTHING;
    `);
    if (!silent && process.env['NODE_ENV'] === 'development') console.log("[admin.server] Tabelas admin OK.");
  } catch (err) {
    console.error("[admin.server] Erro ao garantir tabelas admin:", err);
    throw err;
  }
}

export async function checkSystemHealth() {
  const d = requireDb();
  const tables = ['profiles', 'veiculos', 'agendamentos', 'clientes', 'laudos', 'logs', 'configuracoes_sistema', 'depreciacao_regras', 'depreciacao_calculos'];
  const health: Record<string, boolean> = {};
  
  for (const table of tables) {
    try {
      const res = await d.execute(sql`SELECT 1 FROM ${sql.identifier(table)} LIMIT 1`);
      health[table] = true;
    } catch (e) {
      health[table] = false;
      console.warn(`[health] Tabela ${table} não acessível:`, (e as Error).message);
    }
  }
  
  return health;
}

export async function listarVendedoresPendentes(status?: string | null) {
  const d = requireDb();
  const statusFilter = status ? sql` AND status_compliance = ${status}` : sql``;
  const rows = await d.execute(sql`
    SELECT
      id,
      nome,
      email,
      whatsapp,
      cpf,
      cidade,
      uf,
      ativo,
      cadastro_completo,
      criado_em,
      status_compliance,
      documento_cnh_url,
      documento_crlv_url,
      documento_selfie_url
    FROM profiles
    WHERE role = 'vendedor'::app_role
    ${statusFilter}
    ORDER BY criado_em DESC;
  `);
  return rowsOf(rows) || rows;
}

export async function listarCompradores() {
  const d = requireDb();
  const rows = await d.execute(sql`
    SELECT id, nome, email, whatsapp, cpf, cidade, uf, ativo, criado_em
    FROM profiles 
    WHERE role = 'comprador'::app_role
    ORDER BY criado_em DESC;
  `);
  return rowsOf(rows) || rows;
}

export async function listarUsuariosInternos(role?: string | null) {
  const d = requireDb();
  const roleFilter = role ? sql` AND role = ${role}::app_role` : sql``;
  const rows = await d.execute(sql`
    SELECT
      id,
      nome,
      email,
      whatsapp,
      role,
      ativo,
      criado_em,
      atualizado_em,
      cidade,
      uf
    FROM profiles
    WHERE role IN ('admin'::app_role, 'operacao'::app_role, 'vistoriador'::app_role)
    ${roleFilter}
    ORDER BY
      CASE role
        WHEN 'vistoriador'::app_role THEN 1
        WHEN 'operacao'::app_role THEN 2
        WHEN 'admin'::app_role THEN 3
        ELSE 9
      END,
      nome ASC
  `);
  return rowsOf(rows) || rows;
}

export async function alterarStatusUsuario(userId: string, ativo: boolean) {
  const d = requireDb();
  await d.execute(sql`
    UPDATE profiles SET ativo = ${ativo}, atualizado_em = now() WHERE id = ${userId}::uuid;
  `);
  return { ok: true };
}

/**
 * Exclui definitivamente um vendedor ou comprador. Só aceita essas duas roles
 * (admin/operação/vistoriador não passam por aqui). Não faz cascade manual —
 * se o perfil tiver veículos, negociações, contratos etc. vinculados, o
 * próprio banco recusa a exclusão (violação de chave estrangeira) e isso é
 * repassado como mensagem clara em vez de apagar dados vinculados.
 */
export async function excluirPerfil(userId: string) {
  const d = requireDb();
  try {
    const res = await d.execute(sql`
      DELETE FROM profiles
      WHERE id = ${userId}::uuid AND role IN ('vendedor'::app_role, 'comprador'::app_role)
      RETURNING id;
    `);
    const linhas = rowsOf(res) || (res as any);
    if (!linhas || linhas.length === 0) {
      throw new Error("Cadastro não encontrado (ou não é um vendedor/comprador).");
    }
    return { ok: true as const };
  } catch (e: any) {
    if (e?.code === "23503") {
      throw new Error(
        "Não é possível excluir: este cadastro tem veículos, negociações, contratos ou outros registros vinculados. Bloqueie o acesso em vez de excluir.",
      );
    }
    throw e;
  }
}

export async function criarUsuario(data: any) {
  const d = requireDb();
  const auth = await import("./auth.server");
  const senhaHash = await auth.hashPassword(data.password);
  
  await d.execute(sql`
    INSERT INTO profiles (nome, email, role, senha_hash, ativo, whatsapp)
    VALUES (${data.nome}, ${data.email}, ${data.role}::app_role, ${senhaHash}, true, ${data.whatsapp || null})
  `);
}

export async function atualizarUsuario(data: any) {
  const d = requireDb();
  const updates: any[] = [];
  
  if (data.nome) updates.push(sql`nome = ${data.nome}`);
  if (data.email) updates.push(sql`email = ${data.email}`);
  if (data.role) updates.push(sql`role = ${data.role}::app_role`);
  if (data.whatsapp) updates.push(sql`whatsapp = ${data.whatsapp}`);
  
  if (data.password) {
    const auth = await import("./auth.server");
    const hash = await auth.hashPassword(data.password);
    updates.push(sql`senha_hash = ${hash}`);
  }

  if (updates.length === 0) return;

  const setClause = sql.join(updates, sql`, `);
  await d.execute(sql`
    UPDATE profiles SET ${setClause}, atualizado_em = now() 
    WHERE id = ${data.id}::uuid
  `);
}


export async function listarConfiguracoes() {
  const d = requireDb();
  const rows = await d.execute(sql`SELECT * FROM configuracoes_sistema ORDER BY chave;`);
  return rowsOf(rows) || rows;
}

export async function salvarConfiguracao(chave: string, valor: string) {
  const d = requireDb();
  await d.execute(sql`
    INSERT INTO configuracoes_sistema (chave, valor, atualizado_em)
    VALUES (${chave}, ${valor}, now())
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now();
  `);
  return { ok: true };
}

/**
 * Chaves seguras para expor em toda página pública (SEO + tags de rastreamento).
 * NUNCA inclua aqui segredos como tracking_meta_capi_token — esse só pode ser lido
 * no servidor, para chamar a Conversions API, e nunca deve chegar ao navegador.
 */
const CHAVES_CONFIG_PUBLICAS = [
  "seo_titulo_site",
  "seo_descricao_site",
  "seo_imagem_og_url",
  "tracking_gtm_id",
  "tracking_google_ads_id",
  "tracking_meta_pixel_id",
  "tracking_head_html",
  "tracking_body_html",
] as const;

export type ConfiguracoesPublicas = Record<(typeof CHAVES_CONFIG_PUBLICAS)[number], string>;

let cacheConfigPublicas: { valor: ConfiguracoesPublicas; expiraEm: number } | null = null;

/**
 * Config de SEO/tags seguras para injetar em toda página (landing, vitrine, etc).
 * Cacheada por 30s em memória — é lida em toda request HTML, não compensa bater no
 * banco a cada página vista.
 */
export async function obterConfiguracoesPublicas(): Promise<ConfiguracoesPublicas> {
  if (cacheConfigPublicas && cacheConfigPublicas.expiraEm > Date.now()) {
    return cacheConfigPublicas.valor;
  }

  const d = requireDb();
  await ensureAdminTables();
  const rows = await d.execute(sql`
    SELECT chave, valor FROM configuracoes_sistema WHERE chave = ANY(${CHAVES_CONFIG_PUBLICAS as unknown as string[]});
  `);
  const base = Object.fromEntries(CHAVES_CONFIG_PUBLICAS.map((k) => [k, ""])) as ConfiguracoesPublicas;
  for (const row of rowsOf(rows) || rows) {
    if (CHAVES_CONFIG_PUBLICAS.includes(row.chave)) (base as any)[row.chave] = row.valor || "";
  }
  cacheConfigPublicas = { valor: base, expiraEm: Date.now() + 30_000 };
  return base;
}

/** Mantém só letras, números, "-" e "_" — formato esperado de GTM-XXXX / AW-XXXX / ID numérico do Pixel. */
function idDeRastreamentoSeguro(valor: string) {
  return (valor || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * Monta os trechos de HTML/script das tags de rastreamento configuradas (GTM, Google Ads,
 * Pixel Meta) mais o HTML customizado do admin, para injetar no <head> e logo após o <body>
 * de toda página renderizada. Ids passam por uma limpeza básica; o HTML customizado é
 * responsabilidade de quem tem acesso ao admin (mesmo modelo de "custom code" de qualquer CMS).
 */
export function construirInjecoesRastreamento(cfg: ConfiguracoesPublicas): { head: string; body: string } {
  const partesHead: string[] = [];
  const partesBody: string[] = [];

  const gtmId = idDeRastreamentoSeguro(cfg.tracking_gtm_id);
  if (gtmId) {
    partesHead.push(
      `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');</script>`,
    );
    partesBody.push(
      `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`,
    );
  }

  const adsId = idDeRastreamentoSeguro(cfg.tracking_google_ads_id);
  if (adsId) {
    partesHead.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${adsId}"></script>`);
    partesHead.push(
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${adsId}');</script>`,
    );
  }

  const pixelId = idDeRastreamentoSeguro(cfg.tracking_meta_pixel_id);
  if (pixelId) {
    partesHead.push(
      `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');</script>`,
    );
    partesBody.push(
      `<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1" /></noscript>`,
    );
  }

  if (cfg.tracking_head_html?.trim()) partesHead.push(cfg.tracking_head_html);
  if (cfg.tracking_body_html?.trim()) partesBody.push(cfg.tracking_body_html);

  return { head: partesHead.join("\n"), body: partesBody.join("\n") };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
