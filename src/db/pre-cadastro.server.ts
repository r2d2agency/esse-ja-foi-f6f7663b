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

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function gerarSenhaTemporaria(tamanho = 10) {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  let senha = "";
  for (const b of bytes) senha += ALFABETO[b % ALFABETO.length];
  return `${senha}@1`;
}

export type PreCadastroInput = {
  nome: string;
  email: string;
  cpf?: string | undefined;
  whatsapp?: string | undefined;
  telefone?: string | undefined;
  tipo_pessoa?: string | undefined;
  cnpj?: string | undefined;
  cep?: string | undefined;
  endereco?: string | undefined;
  numero?: string | undefined;
  complemento?: string | undefined;
  bairro?: string | undefined;
  cidade?: string | undefined;
  uf?: string | undefined;
};

async function garantirSchemas() {
  const { ensureAuthSchema } = await import("./auth.server");
  await ensureAuthSchema();
  try {
    const { ensurePerfilSchema } = await import("./perfil.server");
    await ensurePerfilSchema();
  } catch {
    /* opcional */
  }
  const { ensureVendedoresSchema } = await import("./vendedores-compliance.server");
  await ensureVendedoresSchema();
  const { ensureTermosSchema } = await import("./termos.server");
  await ensureTermosSchema();
}

/**
 * Cria (ou reativa) um vendedor cadastrado internamente pela administração.
 * O perfil já nasce dispensado das etapas de compliance do app e com senha temporária.
 */
export async function criarVendedorInterno(dados: PreCadastroInput, criadoPor?: string | null) {
  const d = requireDb();
  await garantirSchemas();

  const email = dados.email.trim().toLowerCase();
  const existente = rowsOf(
    await d.execute(sql`SELECT id, role FROM profiles WHERE lower(email) = ${email} LIMIT 1`),
  )[0];
  if (existente) {
    throw new Error("Já existe um usuário cadastrado com este e-mail.");
  }

  const senha = gerarSenhaTemporaria();
  const { hashPassword } = await import("./auth.server");
  const hash = await hashPassword(senha);

  const inserido = rowsOf(
    await d.execute(sql`
      INSERT INTO profiles (
        nome, email, cpf, cnpj, tipo_pessoa, whatsapp, telefone,
        cep, endereco, numero, complemento, bairro, cidade, uf,
        role, ativo, senha_hash, senha_temporaria, origem_cadastro,
        cadastro_completo, status_compliance, verificado
      ) VALUES (
        ${dados.nome}, ${email}, ${dados.cpf || null}, ${dados.cnpj || null},
        ${dados.tipo_pessoa || "PF"}, ${dados.whatsapp || null}, ${dados.telefone || dados.whatsapp || null},
        ${dados.cep || null}, ${dados.endereco || null}, ${dados.numero || null},
        ${dados.complemento || null}, ${dados.bairro || null}, ${dados.cidade || null}, ${dados.uf || null},
        'vendedor'::text::app_role, true, ${hash}, true, 'INTERNO',
        true, 'DISPENSADO', true
      )
      RETURNING id
    `),
  )[0];

  const perfilId = String(inserido.id);

  try {
    const { registrarAcaoCompliance } = await import("./vendedores-compliance.server");
    if (criadoPor) {
      await registrarAcaoCompliance(
        perfilId,
        criadoPor,
        "PRE_CADASTRO_INTERNO",
        "Vendedor cadastrado internamente pela administração. Etapas de aprovação dispensadas.",
      );
    }
  } catch (e) {
    console.error("[pre-cadastro] historico", e);
  }

  const envio = await enviarSenhaTemporaria(email, dados.nome, senha);

  return { perfilId, senha, emailEnviado: envio.ok, emailErro: envio.erro };
}

export async function enviarSenhaTemporaria(email: string, nome: string, senha: string) {
  try {
    const { enviarEmailSimples } = await import("./mail.server");
    const base = process.env["APP_URL"] || process.env["VITE_APP_URL"] || "";
    const link = `${base}/login`;
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a">
        <h2 style="margin:0 0 12px">Seu acesso à plataforma ESSE JÁ FOI</h2>
        <p>Olá, <strong>${nome}</strong>. Seu cadastro de vendedor foi criado pela nossa equipe.</p>
        <p>Use os dados abaixo para o primeiro acesso:</p>
        <p style="background:#f1f5f9;padding:12px;border-radius:8px">
          <strong>E-mail:</strong> ${email}<br/>
          <strong>Senha temporária:</strong> <code style="font-size:16px">${senha}</code>
        </p>
        <p>No primeiro acesso você precisará criar uma nova senha e aceitar o termo de adesão.</p>
        ${link ? `<p><a href="${link}">Acessar a plataforma</a></p>` : ""}
      </div>`;
    await enviarEmailSimples(email, "Acesso à plataforma ESSE JÁ FOI", html);
    return { ok: true as const, erro: null };
  } catch (e: any) {
    console.error("[pre-cadastro] email", e);
    return { ok: false as const, erro: e?.message || "Falha ao enviar e-mail." };
  }
}

/** Gera uma nova senha temporária e reenvia por e-mail. */
export async function reenviarSenhaTemporaria(perfilId: string) {
  const d = requireDb();
  await garantirSchemas();
  const perfil = rowsOf(
    await d.execute(sql`SELECT id, nome, email FROM profiles WHERE id = ${perfilId}::uuid LIMIT 1`),
  )[0];
  if (!perfil) throw new Error("Vendedor não encontrado.");

  const senha = gerarSenhaTemporaria();
  const { hashPassword } = await import("./auth.server");
  const hash = await hashPassword(senha);
  await d.execute(sql`
    UPDATE profiles SET senha_hash = ${hash}, senha_temporaria = true, atualizado_em = now()
    WHERE id = ${perfilId}::uuid
  `);
  const envio = await enviarSenhaTemporaria(perfil.email, perfil.nome || perfil.email, senha);
  return { senha, emailEnviado: envio.ok, emailErro: envio.erro };
}

/** Estado do primeiro acesso: precisa trocar senha? precisa aceitar termo? */
export async function getStatusPrimeiroAcesso(perfilId: string) {
  const d = requireDb();
  await garantirSchemas();
  const p = rowsOf(
    await d.execute(sql`
      SELECT id, nome, email, role, senha_temporaria, termo_aceito_em, origem_cadastro
      FROM profiles WHERE id = ${perfilId}::uuid LIMIT 1
    `),
  )[0];
  if (!p) throw new Error("Perfil não encontrado.");

  const precisaTermo = p.role === "vendedor" && !p.termo_aceito_em;
  return {
    nome: p.nome,
    email: p.email,
    role: p.role,
    precisaTrocarSenha: !!p.senha_temporaria,
    precisaAceitarTermo: precisaTermo,
  };
}

export async function definirNovaSenha(perfilId: string, novaSenha: string) {
  const d = requireDb();
  const { hashPassword, verifyPassword } = await import("./auth.server");
  const atual = rowsOf(
    await d.execute(sql`SELECT senha_hash FROM profiles WHERE id = ${perfilId}::uuid LIMIT 1`),
  )[0];
  if (atual?.senha_hash && (await verifyPassword(novaSenha, atual.senha_hash))) {
    throw new Error("A nova senha precisa ser diferente da senha temporária.");
  }
  const hash = await hashPassword(novaSenha);
  await d.execute(sql`
    UPDATE profiles SET senha_hash = ${hash}, senha_temporaria = false, atualizado_em = now()
    WHERE id = ${perfilId}::uuid
  `);
  return { ok: true as const };
}
