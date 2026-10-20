import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Garante a conta do superadmin.
 *
 * Antes isso era uma server fn **pública**: qualquer visitante chamava e recebia
 * de volta o e-mail do administrador — e ainda forçava a criação da conta.
 * Agora só um admin já logado pode disparar, e o e-mail só é devolvido nesse
 * caso. A criação da conta no boot continua em `db/index.ts`, que não depende
 * desta fn.
 */
export const seedSuperAdmin = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({}).parse(d))
  .handler(async () => {
    const { ensureSuperAdmin, SUPERADMIN_EMAIL } = await import("@/db/auth.server");
    try {
      const { adminDaSessao } = await import("@/lib/sessao.server");
      await adminDaSessao();
      await ensureSuperAdmin();
      return { ok: true as const, email: SUPERADMIN_EMAIL };
    } catch (error) {
      console.error("Falha ao criar superadmin:", error);
      return { ok: false as const, error: (error as Error).message };
    }
  });

export const loginWithPassword = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({ 
    email: z.string().email(), 
    password: z.string().min(1) 
  }).parse(data))
  .handler(async ({ data }) => {
    const { authenticate, issueToken } = await import("@/db/auth.server");
    const { definirSessao } = await import("@/lib/sessao.server");
    try {
      const user = await authenticate(data.email, data.password);
      if (!user) return { ok: false as const, message: "E-mail ou senha inválidos." };
      // A sessão passa a viver num cookie httpOnly: o navegador não guarda mais
      // token nenhum, então token vencido/dessincronizado não derruba mais as chamadas.
      definirSessao(await issueToken(user.id));
      return { ok: true as const, user };
    } catch (error: any) {
      console.error("Falha na autenticação:", error);
      
      const { db: database } = await import("@/db/index");
      if (database) {
        try {
          const { sql } = await import("drizzle-orm");
          await database.execute(sql`
            INSERT INTO logs (entidade, acao, detalhe, usuario)
            VALUES ('auth', 'LOGIN_ERRO', ${JSON.stringify({ error: error.message, email: data.email })}, ${data.email})
          `);
        } catch (logErr) {
          console.error("Erro ao registrar log de login:", logErr);
        }
      }

      return {
        ok: false as const,
        message: "Não foi possível acessar o banco de dados. Verifique a DATABASE_URL e tente novamente.",
      };
    }
  });

/**
 * Perfil do dono do cookie de sessão, ou `autenticado: false` quando o cookie
 * está ausente/inválido/expirado. É a fonte do store de auth no cliente: como o
 * cookie é lido no servidor, não há como o navegador ficar com uma sessão velha.
 */
export const getSessaoAtualFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({}).parse(d))
  .handler(async () => {
    const { perfilDaSessao } = await import("@/lib/sessao.server");
    const user = await perfilDaSessao();
    if (!user) return { autenticado: false as const, user: null };
    return {
      autenticado: true as const,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        whatsapp: user.whatsapp ?? undefined,
        cpf: user.cpf ?? undefined,
        pode_ver_valores: user.pode_ver_valores ?? undefined,
        tipo_pessoa: user.tipo_pessoa ?? undefined,
        protegido: user.protegido ?? undefined,
      },
    };
  });

/** Apaga o cookie de sessão no navegador. Sem localStorage para limpar. */
export const logoutFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({}).parse(d))
  .handler(async () => {
    const { encerrarSessao } = await import("@/lib/sessao.server");
    encerrarSessao();
    return { ok: true as const };
  });

export const solicitarResetSenha = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({ email: z.string().email() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const { db } = await import("@/db/index");
      const { sql } = await import("drizzle-orm");
      if (!db) return { ok: false as const, message: "Banco de dados indisponível no momento." };
      
      const { gerarEnviarOTP } = await import("@/db/mail.server");
      
      // Verifica se o e-mail existe
      const rows = await db.execute(sql`SELECT id FROM profiles WHERE lower(email) = lower(${data.email})`);
      if ((rows as any).rows?.length > 0 || (rows as any).length > 0) {
        await gerarEnviarOTP(data.email.toLowerCase(), 'RECOVERY');
      }

      await db.execute(sql`
        INSERT INTO logs (entidade, acao, detalhe, usuario)
        VALUES (${"auth"}, ${"RESET_SENHA_SOLICITADO"}, ${data.email.toLowerCase()}, ${data.email.toLowerCase()});
      `);
      return { ok: true as const };
    } catch (error: any) {
      console.error("Falha ao processar solicitação de reset:", error);
      return { ok: false as const, message: error.message || "Não foi possível processar a solicitação." };
    }
  });

export const validarOTPResetFn = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({ email: z.string().email(), code: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { validarOTP } = await import("@/db/mail.server");
    const ok = await validarOTP(data.email, data.code, 'RECOVERY');
    return { ok };
  });

export const resetarSenhaFinalFn = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({ 
    email: z.string().email(), 
    code: z.string(), 
    // Piso de 10 caracteres: 6 permitia senhas de 1 caractere na prática
    // ("a12345" passa em `min(6)` com brute force viável sobre o hash).
    newPassword: z.string().min(10)
  }).parse(data))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    const { sql } = await import("drizzle-orm");
    const { hashPassword } = await import("@/db/auth.server");
    const { validarOTP } = await import("@/db/mail.server");
    
    // Validamos novamente por segurança
    const ok = await validarOTP(data.email, data.code, 'RECOVERY');
    if (!ok) return { ok: false, message: "Código inválido ou expirado." };

    const newHash = await hashPassword(data.newPassword);
    await db!.execute(sql`
      UPDATE profiles SET senha_hash = ${newHash}, atualizado_em = now() 
      WHERE lower(email) = lower(${data.email})
    `);

    return { ok: true };
  });

