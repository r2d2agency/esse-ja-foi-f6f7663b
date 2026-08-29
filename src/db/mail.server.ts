import { sql } from "drizzle-orm";
import { db } from "./index";
import nodemailer from "nodemailer";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function ensureMailSchema(silent = true) {
  const d = requireDb();
  try {
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        code text NOT NULL,
        type text NOT NULL, -- 'LOGIN', 'RECOVERY', 'REGISTRATION'
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        criado_em timestamptz DEFAULT now()
      );
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_codes TO authenticated';
        EXECUTE 'GRANT ALL ON public.otp_codes TO service_role';
        EXECUTE 'GRANT ALL ON public.otp_codes TO anon';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao conceder grants em otp_codes: %', SQLERRM;
      END $$;
    `);
    
    // Garantir colunas se a tabela já existir mas estiver incompleta
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'otp_codes' AND column_name = 'email') THEN
          ALTER TABLE otp_codes ADD COLUMN email text NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'otp_codes' AND column_name = 'code') THEN
          ALTER TABLE otp_codes ADD COLUMN code text NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'otp_codes' AND column_name = 'type') THEN
          ALTER TABLE otp_codes ADD COLUMN type text NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'otp_codes' AND column_name = 'expires_at') THEN
          ALTER TABLE otp_codes ADD COLUMN expires_at timestamptz NOT NULL;
        END IF;
      END $$;
    `);

    if (!silent && process.env['NODE_ENV'] === 'development') console.log("[mail.server] Schema OTP OK.");
  } catch (err) {
    console.error("[mail.server] Erro ao garantir schema de e-mail:", err);
  }
}

async function getTransporter() {
  const d = requireDb();
  const rows = await d.execute(sql`SELECT chave, valor FROM configuracoes_sistema WHERE chave LIKE 'smtp_%'`);
  const configs = (rowsOf(rows) || rows).reduce((acc: any, curr: any) => {
    acc[curr.chave] = curr.valor;
    return acc;
  }, {});

  if (!configs.smtp_host || !configs.smtp_user || !configs.smtp_pass) {
    throw new Error("Configurações de SMTP incompletas. Verifique as configurações no painel administrativo.");
  }

  const port = parseInt(configs.smtp_port || "587");
  // smtp_secure: "ssl" (conexão TLS direta, porta 465), "tls" (STARTTLS) ou "none"
  const modo = (configs.smtp_secure || (port === 465 ? "ssl" : "tls")).toLowerCase();

  const transporter = nodemailer.createTransport({
    host: configs.smtp_host,
    port,
    secure: modo === "ssl",
    requireTLS: modo === "tls",
    ignoreTLS: modo === "none",
    auth: {
      user: configs.smtp_user,
      pass: configs.smtp_pass,
    },
    tls: {
      // muitos servidores compartilhados usam certificado do provedor
      rejectUnauthorized: configs.smtp_reject_unauthorized === "true",
    },
  });

  // O remetente PRECISA ser um endereço aceito pelo servidor (erro 550 caso contrário)
  const from = configs.smtp_from?.trim() || configs.smtp_user;
  const fromName = configs.smtp_from_name?.trim() || "Esse Já Foi";

  return { transporter, from: `"${fromName}" <${from}>` };
}

export async function enviarEmailTeste(destinatario: string) {
  const { transporter, from } = await getTransporter();

  await transporter.verify();

  await transporter.sendMail({
    from,
    to: destinatario,
    subject: "Teste de Configuração SMTP - Esse Já Foi",
    text: "Se você recebeu este e-mail, as configurações de SMTP estão funcionando corretamente.",
    html: "<b>Se você recebeu este e-mail, as configurações de SMTP estão funcionando corretamente.</b>",
  });

  return { ok: true };
}

export async function gerarEnviarOTP(email: string, type: 'LOGIN' | 'RECOVERY' | 'REGISTRATION') {
  const d = requireDb();
  await ensureMailSchema(true);

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

  try {
    await d.execute(sql`
      INSERT INTO otp_codes (email, code, type, expires_at)
      VALUES (${email}, ${code}, ${type}, ${expiresAt})
    `);
  } catch (err: any) {
    console.error("[mail.server] Falha ao inserir OTP no banco:", err);
    // Em ambiente de desenvolvimento, se falhar a persistência, ainda permitimos o envio do e-mail
    // para não travar o fluxo do usuário se for apenas um problema de permissão temporário no banco
    if (process.env['NODE_ENV'] !== 'development') {
      throw new Error("Erro interno ao gerar código de acesso.");
    }
  }

  const { transporter, from } = await getTransporter();

  const subjects = {
    LOGIN: "Seu código de acesso - Esse Já Foi",
    RECOVERY: "Recuperação de senha - Esse Já Foi",
    REGISTRATION: "Confirme seu cadastro - Esse Já Foi"
  };

  await transporter.sendMail({
    from,
    to: email,
    subject: subjects[type],
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
        <h2 style="color: #0f172a;">Esse Já Foi</h2>
        <p>Olá,</p>
        <p>Seu código de verificação é:</p>
        <div style="background: #f1f5f9; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0d9488; border-radius: 8px;">
          ${code}
        </div>
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
          Este código expira em 10 minutos. Se você não solicitou este código, ignore este e-mail.
        </p>
      </div>
    `,
  });

  return { ok: true };
}

export async function validarOTP(email: string, code: string, type: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT id FROM otp_codes 
    WHERE email = ${email} 
      AND code = ${code} 
      AND type = ${type} 
      AND used_at IS NULL 
      AND expires_at > now()
    ORDER BY criado_em DESC 
    LIMIT 1
  `);

  const otp = rowsOf(res)?.[0];
  if (!otp) return false;

  await d.execute(sql`UPDATE otp_codes SET used_at = now() WHERE id = ${otp.id}::uuid`);
  return true;
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
