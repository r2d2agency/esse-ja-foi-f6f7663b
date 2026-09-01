import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hashPassword } from "@/db/auth.server";
import { sql } from "drizzle-orm";
import { RegraNegocioError } from "@/db/cadastro.server";

const vendedorSchema = z.object({
  nome: z.string().min(3, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  whatsapp: z.string().optional().nullable(),
  cpf: z.string().optional().nullable(),
  cep: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
});

export const cadastrarVendedorFn = createServerFn({ method: "POST" })
  .validator(vendedorSchema)
  .handler(async ({ data }) => {
    const { db: database } = await import("@/db/index");
    if (!database) throw new Error(`Banco de dados indisponível (Verifique se a DATABASE_URL está configurada corretamente)`);
    const db = database;
    
    const { ensureCadastroSchema } = await import("@/db/cadastro.server");
    await ensureCadastroSchema();
    
    const senhaHash = await hashPassword(data.password);
    
    try {
      // Primeiro garante o superadmin e a estrutura básica de auth (inclusive o enum)
      const { ensureSuperAdmin } = await import("@/db/auth.server");
      await ensureSuperAdmin();

      const rows = await db.execute(sql`
        INSERT INTO profiles (nome, email, role, senha_hash, whatsapp, cpf, cep, endereco, cidade, uf, ativo, protegido, cadastro_completo)
        VALUES (
          ${data.nome}, 
          ${data.email.toLowerCase()}, 
          'vendedor'::text::app_role, 
          ${senhaHash}, 
          ${data.whatsapp ?? null}, 
          ${data.cpf ?? null}, 
          ${data.cep ?? null}, 
          ${data.endereco ?? null}, 
          ${data.cidade ?? null}, 
          ${data.uf ?? null}, 
          true, 
          false, 
          false
        )
        RETURNING id, nome, email, role;
      `);
      const user = (rows as any).rows?.[0] || (rows as any)[0];
      
      const { issueToken } = await import("@/db/auth.server");
      const accessToken = await issueToken(user.id);
      
      // Dispara OTP para confirmação de cadastro
      try {
        const { gerarEnviarOTP } = await import("@/db/mail.server");
        await gerarEnviarOTP(data.email.toLowerCase(), 'REGISTRATION');
      } catch (mailErr) {
        console.error("Erro ao enviar e-mail de boas-vindas/OTP:", mailErr);
      }

      return { ok: true as const, user, accessToken };

    } catch (error: any) {
      console.error("Erro detalhado ao cadastrar vendedor:", error);
      
      const { db: database } = await import("@/db/index");
      if (database) {
        try {
          const detail = {
            mensagem: error.message,
            codigo: error.code,
            hint: error.hint,
            stack: error.stack,
            context: { email: data.email, nome: data.nome }
          };
          
          await database.execute(sql`
            INSERT INTO logs (entidade, acao, detalhe, usuario)
            VALUES ('auth', 'CADASTRO_VENDEDOR_ERRO', ${JSON.stringify(detail)}, ${data.email})
          `);
        } catch (logErr) {
          console.error("Erro ao registrar log de erro:", logErr);
        }
      }

      if (error.message?.includes("unique constraint") || error.message?.includes("already exists") || error.code === '23505') {
        return { ok: false as const, message: "Este e-mail já está cadastrado." };
      }
      
      let userMessage = `Erro técnico: ${error.message || "Erro desconhecido"}`;
      if (error.message?.includes("app_role") || error.message?.includes("permission") || error.code === '42P01') {
        userMessage = `Erro de permissão ou estrutura de banco: ${error.message}. Use o Dashboard Admin para verificar a saúde do sistema.`;
      }
      
      return { ok: false as const, message: userMessage };
    }
  });

export const listarMeusVeiculosFn = createServerFn({ method: "GET" })
  .validator(z.object({ perfilId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { db: database } = await import("@/db/index");
    if (!database) throw new Error("Banco de dados indisponível");
    const db = database;
    const rows = await db.execute(sql`
      SELECT * FROM veiculos 
      WHERE perfil_id = ${data.perfilId}::uuid 
      ORDER BY criado_em DESC;
    `);
    
    const profileRows = await db.execute(sql`
      SELECT cadastro_completo FROM profiles WHERE id = ${data.perfilId}::uuid;
    `);
    
    return { 
      ok: true as const, 
      data: (rows as any).rows || rows,
      profile: (profileRows as any).rows?.[0] || (profileRows as any)[0]
    };
  });

export const cadastrarMeuVeiculoFn = createServerFn({ method: "POST" })
  .validator(z.object({
    perfilId: z.string().uuid(),
    placa: z.string().min(7),
    marca: z.string().min(2),
    modelo: z.string().min(2),
    anoFabricacao: z.string().optional(),
    anoModelo: z.string().optional(),
    combustivel: z.string().optional().nullable(),
    cambio: z.string().optional().nullable(),
    km: z.number().optional(),
    valorInteresse: z.number().optional(),
    opcionais: z.array(z.string()).optional(),
    observacoes: z.string().optional(),
    fotos: z.array(z.string()).optional(),
    endereco: z.string().optional(),
    cep: z.string().optional(),
    cidade: z.string().optional(),
    uf: z.string().optional(),
    numero: z.string().optional(),
    bairro: z.string().optional(),
    complemento: z.string().optional(),
    documento_crlv_url: z.string().optional().nullable(),
    versao: z.string().optional().nullable(),
    cor: z.string().optional().nullable(),
    status: z.string().optional(),
    id: z.string().uuid().optional(),
  }))
  .handler(async ({ data }) => {
    const { salvarVeiculo } = await import("@/db/cadastro.server");
    
    // Garantir que observacoes seja um JSON válido ou string limpa
    let observacoesFinal = data.observacoes || '';
    if (data.opcionais && data.opcionais.length > 0) {
      const opcionaisStr = `Opcionais: ${data.opcionais.join(', ')}.`;
      observacoesFinal = observacoesFinal ? `${opcionaisStr} ${observacoesFinal}` : opcionaisStr;
    }

    return await salvarVeiculo({
      ...data,
      id: data.id,
      valorInteresseCliente: data.valorInteresse,
      status: data.status || 'AGUARDANDO_APROVACAO',
      observacoes: observacoesFinal
    } as any);
  });

export const atualizarPerfilVendedorFn = createServerFn({ method: "POST" })
  .validator(z.object({
    perfilId: z.string().uuid(),
    cpf: z.string().optional().nullable(),
    dataNascimento: z.string().optional().nullable(),
    estadoCivil: z.string().optional().nullable(),
    profissao: z.string().optional().nullable(),
    nomeMae: z.string().optional().nullable(),
    cep: z.string().optional().nullable(),
    endereco: z.string().optional().nullable(),
    numero: z.string().optional().nullable(),
    bairro: z.string().optional().nullable(),
    complemento: z.string().optional().nullable(),
    cidade: z.string().optional().nullable(),
    uf: z.string().optional().nullable(),
    cnhUrl: z.string().optional().nullable(),
    cnhVersoUrl: z.string().optional().nullable(),
    crlvUrl: z.string().optional().nullable(),
    selfieUrl: z.string().optional().nullable(),
    comprovanteEnderecoUrl: z.string().optional().nullable(),
    finalizar: z.boolean().optional(),
  }))

  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    if (!db) throw new Error("Banco de dados indisponível");
    const { ensureVendedoresSchema } = await import("@/db/vendedores-compliance.server");
    await ensureVendedoresSchema();

    if (data.finalizar) {
      const rows = (await db.execute(sql`
        SELECT * FROM profiles WHERE id = ${data.perfilId}::uuid
      `)) as any;
      const p = rows.rows?.[0] || rows[0] || {};
      const pendenciasRows = (await db.execute(sql`
        SELECT documento_tipo, motivo
        FROM compliance_pendencias
        WHERE vendedor_id = ${data.perfilId}::uuid
          AND status IN ('PENDENTE', 'REPROVADO')
      `)) as any;
      const pendenciasAbertas = pendenciasRows.rows || pendenciasRows || [];
      
      const { calcularProgressoVendedor } = await import("@/db/vendedores-compliance.server");
      // Mesclar dados atuais com os novos dados recebidos para calcular o progresso real
      const perfilSimulado = {
        ...p,
        cpf: data.cpf ?? p.cpf,
        data_nascimento: data.dataNascimento ?? p.data_nascimento,
        cep: data.cep ?? p.cep,
        endereco: data.endereco ?? p.endereco,
        numero: data.numero ?? p.numero,
        bairro: data.bairro ?? p.bairro,
        cidade: data.cidade ?? p.cidade,
        uf: data.uf ?? p.uf,
        documento_cnh_url: data.cnhUrl ?? p.documento_cnh_url,
        documento_cnh_verso_url: data.cnhVersoUrl ?? p.documento_cnh_verso_url,
        documento_crlv_url: data.crlvUrl ?? p.documento_crlv_url,
        documento_selfie_url: data.selfieUrl ?? p.documento_selfie_url,
        documento_comprovante_endereco_url: data.comprovanteEnderecoUrl ?? p.documento_comprovante_endereco_url
      };

      const status = calcularProgressoVendedor(perfilSimulado);
      
      if (!status.isCompleto) {
        const faltando: string[] = [];
        const e = status.etapas;
        if (e.dados_pessoais !== "CONCLUIDO") faltando.push("Dados Pessoais");
        if (e.endereco !== "CONCLUIDO") faltando.push("Endereço/Comprovante");
        if (e.documentos !== "CONCLUIDO") {
          const docs = [];
          if (!(perfilSimulado.documento_cnh_url || perfilSimulado.cnh_url)) docs.push("CNH Frente");
          if (!(perfilSimulado.documento_cnh_verso_url || perfilSimulado.cnh_verso_url)) docs.push("CNH Verso");
          if (!(perfilSimulado.documento_crlv_url || perfilSimulado.crlv_url)) docs.push("CRLV-e");
          faltando.push(`Documentos (${docs.join(", ")})`);
        }
        if (e.validacao !== "CONCLUIDO") faltando.push("Selfie");
        
        throw new Error(`Cadastro incompleto (${status.progresso}%). Itens pendentes: ${faltando.join(", ")}`);
      }

      if (pendenciasAbertas.length > 0) {
        throw new Error(`Existem documentos reprovados para corrigir: ${pendenciasAbertas.map((p: any) => p.documento_tipo).join(", ")}`);
      }

    }

    const setClauses: any[] = [];
    const documentosReenviados: string[] = [];
    
    if (data.cpf !== undefined) setClauses.push(sql`cpf = ${data.cpf}`);
    if (data.dataNascimento !== undefined) setClauses.push(sql`data_nascimento = ${data.dataNascimento}`);
    if (data.estadoCivil !== undefined) setClauses.push(sql`estado_civil = ${data.estadoCivil}`);
    if (data.profissao !== undefined) setClauses.push(sql`profissao = ${data.profissao}`);
    if (data.nomeMae !== undefined) setClauses.push(sql`nome_mae = ${data.nomeMae}`);
    if (data.cep !== undefined) setClauses.push(sql`cep = ${data.cep}`);
    if (data.endereco !== undefined) setClauses.push(sql`endereco = ${data.endereco}`);
    if (data.numero !== undefined) setClauses.push(sql`numero = ${data.numero}`);
    if (data.bairro !== undefined) setClauses.push(sql`bairro = ${data.bairro}`);
    if (data.complemento !== undefined) setClauses.push(sql`complemento = ${data.complemento}`);
    if (data.cidade !== undefined) setClauses.push(sql`cidade = ${data.cidade}`);
    if (data.uf !== undefined) setClauses.push(sql`uf = ${data.uf}`);
    if (data.cnhUrl !== undefined) {
      setClauses.push(sql`documento_cnh_url = ${data.cnhUrl}`);
      if (data.cnhUrl) {
        setClauses.push(sql`documento_cnh_status = 'AGUARDANDO_ANALISE'`);
        documentosReenviados.push('cnh_frente');
      }
    }
    if (data.cnhVersoUrl !== undefined) {
      setClauses.push(sql`documento_cnh_verso_url = ${data.cnhVersoUrl}`);
      if (data.cnhVersoUrl) {
        setClauses.push(sql`documento_cnh_verso_status = 'AGUARDANDO_ANALISE'`);
        documentosReenviados.push('cnh_verso');
      }
    }
    if (data.crlvUrl !== undefined) {
      setClauses.push(sql`documento_crlv_url = ${data.crlvUrl}`);
      if (data.crlvUrl) {
        setClauses.push(sql`documento_crlv_status = 'AGUARDANDO_ANALISE'`);
        documentosReenviados.push('crlv');
      }
    }
    if (data.selfieUrl !== undefined) {
      setClauses.push(sql`documento_selfie_url = ${data.selfieUrl}`);
      if (data.selfieUrl) {
        setClauses.push(sql`documento_selfie_status = 'AGUARDANDO_ANALISE'`);
        documentosReenviados.push('selfie');
      }
    }
    if (data.comprovanteEnderecoUrl !== undefined) {
      setClauses.push(sql`documento_comprovante_endereco_url = ${data.comprovanteEnderecoUrl}`);
      if (data.comprovanteEnderecoUrl) {
        setClauses.push(sql`documento_comprovante_endereco_status = 'AGUARDANDO_ANALISE'`);
        documentosReenviados.push('comprovante_endereco');
      }
    }
    
    if (data.finalizar !== undefined) {
      setClauses.push(sql`cadastro_completo = ${data.finalizar}`);
      if (data.finalizar === true) {
        setClauses.push(sql`status_compliance = 'AGUARDANDO_ANALISE'`);
        setClauses.push(sql`compliance_motivo_pendencia = null`);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push(sql`atualizado_em = now()`);

      const setClause = sql.join(setClauses, sql`, `);
      await db.execute(sql`
        UPDATE profiles SET ${setClause} WHERE id = ${data.perfilId}::uuid
      `);
    }

    if (documentosReenviados.length > 0) {
      await db.execute(sql`
        UPDATE compliance_pendencias
        SET status = 'RESOLVIDA'
        WHERE vendedor_id = ${data.perfilId}::uuid
          AND documento_tipo IN (${sql.join(documentosReenviados.map((tipo) => sql`${tipo}`), sql`, `)})
          AND status IN ('PENDENTE', 'REPROVADO')
      `);

      // Roda depois de limpar as pendências antigas: se a IA reprovar de novo,
      // a pendência recém-criada por ela não pode ser apagada pela limpeza acima.
      try {
        const { analisarDocumentosVendedor } = await import("@/db/ia-documentos.server");
        await analisarDocumentosVendedor(data.perfilId, {
          cnh_frente: data.cnhUrl,
          cnh_verso: data.cnhVersoUrl,
          crlv: data.crlvUrl,
          selfie: data.selfieUrl,
          comprovante_endereco: data.comprovanteEnderecoUrl,
        });
      } catch (e) {
        console.error("[vendedor.functions] Erro ao acionar análise por IA:", e);
      }
    }

    return { ok: true as const };
  });


export const validarOTPCadastroFn = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string().email(), code: z.string() }))
  .handler(async ({ data }) => {
    const { validarOTP } = await import("@/db/mail.server");
    const ok = await validarOTP(data.email, data.code, 'REGISTRATION');
    return { ok };
  });

export const resenderOTPCadastroFn = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const { gerarEnviarOTP } = await import("@/db/mail.server");
    try {
      await gerarEnviarOTP(data.email, 'REGISTRATION');
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const obterMeuPerfilFn = createServerFn({ method: "GET" })

  .validator(z.object({ perfilId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    if (!db) throw new Error("Banco de dados indisponível");
    const { ensureSuperAdmin } = await import("@/db/auth.server");
    await ensureSuperAdmin();
    const { ensurePerfilSchema } = await import("@/db/perfil.server");
    await ensurePerfilSchema();
    const rows = await db.execute(sql`
      SELECT id, nome, email, whatsapp, telefone, cpf, cep, endereco, numero, bairro, complemento, cidade, uf, role,
             documento_cnh_url, documento_cnh_verso_url, documento_crlv_url, documento_selfie_url,
             documento_comprovante_endereco_url, cadastro_completo, criado_em,
             data_nascimento, estado_civil, profissao, nome_mae
             , status_compliance, compliance_motivo_pendencia,
             documento_cnh_status, documento_cnh_verso_status, documento_crlv_status,
             documento_comprovante_endereco_status, documento_selfie_status
      FROM profiles WHERE id = ${data.perfilId}::uuid LIMIT 1;
    `);
    const perfil = (rows as any).rows?.[0] || (rows as any)[0] || null;
    return { ok: true as const, perfil };
  });

export const atualizarMeuPerfilFn = createServerFn({ method: "POST" })
  .validator(z.object({
    perfilId: z.string().uuid(),
    nome: z.string().min(3, "Nome muito curto"),
    whatsapp: z.string().optional().nullable(),
    cpf: z.string().optional().nullable(),
    cep: z.string().optional().nullable(),
    endereco: z.string().optional().nullable(),
    cidade: z.string().optional().nullable(),
    uf: z.string().optional().nullable(),
  }))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    if (!db) throw new Error("Banco de dados indisponível");
    const { ensurePerfilSchema } = await import("@/db/perfil.server");
    await ensurePerfilSchema();
    const rows = await db.execute(sql`
      UPDATE profiles SET
        nome = ${data.nome},
        whatsapp = ${data.whatsapp ?? null},
        cpf = ${data.cpf ?? null},
        cep = ${data.cep ?? null},
        endereco = ${data.endereco ?? null},
        cidade = ${data.cidade ?? null},
        uf = ${data.uf ?? null},
        atualizado_em = now()
      WHERE id = ${data.perfilId}::uuid
      RETURNING id, nome, email, role, whatsapp, cpf;
    `);
    const perfil = (rows as any).rows?.[0] || (rows as any)[0] || null;
    if (!perfil) return { ok: false as const, message: "Perfil não encontrado." };
    return { ok: true as const, perfil };
  });

export const alterarMinhaSenhaFn = createServerFn({ method: "POST" })
  .validator(z.object({
    perfilId: z.string().uuid(),
    senhaAtual: z.string().min(1, "Informe a senha atual"),
    novaSenha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres"),
  }))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    if (!db) throw new Error("Banco de dados indisponível");
    const { verifyPassword } = await import("@/db/auth.server");
    const rows = await db.execute(sql`SELECT senha_hash FROM profiles WHERE id = ${data.perfilId}::uuid LIMIT 1;`);
    const row = (rows as any).rows?.[0] || (rows as any)[0];
    if (!row?.senha_hash) return { ok: false as const, message: "Perfil sem senha cadastrada." };
    const confere = await verifyPassword(data.senhaAtual, row.senha_hash);
    if (!confere) return { ok: false as const, message: "Senha atual incorreta." };
    const novoHash = await hashPassword(data.novaSenha);
    await db.execute(sql`UPDATE profiles SET senha_hash = ${novoHash}, atualizado_em = now() WHERE id = ${data.perfilId}::uuid;`);
    return { ok: true as const };
  });
