import { sql, eq, and } from "drizzle-orm";
import { db } from "./index";
import { metaService } from "./meta-whatsapp.server";
import { processarMensagemRecebida } from "./conversas.server";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function ensureComunicacoesSchema(silent = true) {
  const d = requireDb();
  if (!silent && process.env['NODE_ENV'] === 'development') console.log("[comunicacoes.server] Garantindo tabelas de comunicação...");

  try {
    // 1. Configurações WhatsApp Meta
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_config (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        waba_id text,
        phone_number_id text,
        business_id text,
        phone_number text,
        app_id text,
        app_secret text, -- Manter no backend
        access_token text, -- Manter no backend
        graph_api_version text DEFAULT 'v20.0',
        webhook_verify_token text,
        status text DEFAULT 'DESCONECTADO', -- CONECTADO, DESCONECTADO, ERRO
        ultimo_teste timestamptz,
        detalhes_erro text,
        atualizado_em timestamptz DEFAULT now()
      );
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'waba_id') THEN
          ALTER TABLE whatsapp_config ADD COLUMN waba_id text;
        END IF;


        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'phone_number_id') THEN
          ALTER TABLE whatsapp_config ADD COLUMN phone_number_id text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'business_id') THEN
          ALTER TABLE whatsapp_config ADD COLUMN business_id text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'phone_number') THEN
          ALTER TABLE whatsapp_config ADD COLUMN phone_number text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'app_id') THEN
          ALTER TABLE whatsapp_config ADD COLUMN app_id text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'app_secret') THEN
          ALTER TABLE whatsapp_config ADD COLUMN app_secret text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'access_token') THEN
          ALTER TABLE whatsapp_config ADD COLUMN access_token text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'graph_api_version') THEN
          ALTER TABLE whatsapp_config ADD COLUMN graph_api_version text DEFAULT 'v20.0';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'webhook_verify_token') THEN
          ALTER TABLE whatsapp_config ADD COLUMN webhook_verify_token text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'status') THEN
          ALTER TABLE whatsapp_config ADD COLUMN status text DEFAULT 'DESCONECTADO';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'ultimo_teste') THEN
          ALTER TABLE whatsapp_config ADD COLUMN ultimo_teste timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_config' AND column_name = 'detalhes_erro') THEN
          ALTER TABLE whatsapp_config ADD COLUMN detalhes_erro text;
        END IF;
      END $$;
    `);

    // 2. Logs de Webhook (Histórico de eventos recebidos da Meta)
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_webhook_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        waba_id text,
        event_type text,
        payload jsonb,
        status text DEFAULT 'PROCESSADO', -- PROCESSADO, ERRO
        erro_detalhe text,
        criado_em timestamptz DEFAULT now()
      );
    `);

    // Inserir config padrão se não existir
    await d.execute(sql`
      INSERT INTO whatsapp_config (id)
      SELECT gen_random_uuid()
      WHERE NOT EXISTS (SELECT 1 FROM whatsapp_config);
    `);

    // 2. Templates WhatsApp (Sincronizados da Meta)
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome_interno text NOT NULL,
        meta_name text UNIQUE NOT NULL,
        categoria text, -- MARKETING, UTILITY, AUTHENTICATION
        idioma text DEFAULT 'pt_BR',
        conteudo jsonb, -- Estrutura do template (cabeçalho, corpo, botões)
        status text DEFAULT 'PENDENTE', -- APROVADO, REJEITADO, PENDENTE, PAUSADO
        tipo_midia text, -- TEXT, IMAGE, VIDEO, DOCUMENT
        meta_id text,
        ultima_sincronizacao timestamptz DEFAULT now(),
        criado_em timestamptz DEFAULT now()
      );
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'nome_interno') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN nome_interno text NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'meta_name') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN meta_name text UNIQUE NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'categoria') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN categoria text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'idioma') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN idioma text DEFAULT 'pt_BR';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'conteudo') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN conteudo jsonb;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'status') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN status text DEFAULT 'PENDENTE';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'tipo_midia') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN tipo_midia text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'meta_id') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN meta_id text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'ultima_sincronizacao') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN ultima_sincronizacao timestamptz DEFAULT now();
        END IF;
      END $$;
    `);

    // 3. Segmentos (Listas de Compradores)
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_segmentos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome text NOT NULL,
        descricao text,
        tipo text NOT NULL DEFAULT 'DINAMICO', -- DINAMICO, MANUAL
        filtros jsonb, -- Para segmentos dinâmicos
        total_contatos integer DEFAULT 0,
        criado_em timestamptz DEFAULT now(),
        atualizado_em timestamptz DEFAULT now()
      );
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_segmentos' AND column_name = 'nome') THEN
          ALTER TABLE whatsapp_segmentos ADD COLUMN nome text NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_segmentos' AND column_name = 'descricao') THEN
          ALTER TABLE whatsapp_segmentos ADD COLUMN descricao text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_segmentos' AND column_name = 'tipo') THEN
          ALTER TABLE whatsapp_segmentos ADD COLUMN tipo text NOT NULL DEFAULT 'DINAMICO';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_segmentos' AND column_name = 'filtros') THEN
          ALTER TABLE whatsapp_segmentos ADD COLUMN filtros jsonb;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_segmentos' AND column_name = 'total_contatos') THEN
          ALTER TABLE whatsapp_segmentos ADD COLUMN total_contatos integer DEFAULT 0;
        END IF;
      END $$;
    `);

    // 4. Join table para segmentos manuais
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_segmentos_contatos (
        segmento_id uuid REFERENCES whatsapp_segmentos(id) ON DELETE CASCADE,
        comprador_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
        PRIMARY KEY (segmento_id, comprador_id)
      );
    `);

    // 5. Campanhas WhatsApp
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_campanhas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome text NOT NULL,
        veiculo_id uuid REFERENCES veiculos(id),
        template_id uuid REFERENCES whatsapp_templates(id),
        status text DEFAULT 'RASCUNHO', -- RASCUNHO, AGENDADA, PROCESSANDO, CONCLUIDA, CANCELADA
        agendado_para timestamptz,
        iniciado_em timestamptz,
        concluido_em timestamptz,
        total_destinatarios integer DEFAULT 0,
        total_enviados integer DEFAULT 0,
        total_entregues integer DEFAULT 0,
        total_lidos integer DEFAULT 0,
        total_falhas integer DEFAULT 0,
        total_cliques integer DEFAULT 0,
        criado_por uuid REFERENCES profiles(id),
        criado_em timestamptz DEFAULT now(),
        atualizado_em timestamptz DEFAULT now()
      );
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'nome') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN nome text NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'status') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN status text DEFAULT 'RASCUNHO';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'agendado_para') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN agendado_para timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'total_destinatarios') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN total_destinatarios integer DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'criado_por') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN criado_por uuid REFERENCES profiles(id);
        END IF;
      END $$;
    `);

    // 6. Mensagens Individuais (Fila e Histórico)
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        campanha_id uuid REFERENCES whatsapp_campanhas(id) ON DELETE CASCADE,
        comprador_id uuid REFERENCES profiles(id),
        telefone text NOT NULL,
        status text DEFAULT 'NA_FILA', -- NA_FILA, ENVIADA, ENTREGUE, LIDA, FALHOU, CANCELADA
        meta_message_id text UNIQUE, -- ID retornado pela Meta
        erro_codigo text,
        erro_mensagem text,
        enviado_em timestamptz,
        entregue_em timestamptz,
        lido_em timestamptz,
        clicado_em timestamptz,
        payload jsonb, -- Dados enviados (variáveis)
        criado_em timestamptz DEFAULT now(),
        atualizado_em timestamptz DEFAULT now()
      );
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'campanha_id') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN campanha_id uuid REFERENCES whatsapp_campanhas(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'comprador_id') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN comprador_id uuid REFERENCES profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'telefone') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN telefone text NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'status') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN status text DEFAULT 'NA_FILA';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'meta_message_id') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN meta_message_id text UNIQUE;
        END IF;
      END $$;
    `);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_mensagens_campanha ON whatsapp_mensagens(campanha_id);`);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_mensagens_status ON whatsapp_mensagens(status);`);

    // 7. Logs de Auditoria
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        campanha_id uuid REFERENCES whatsapp_campanhas(id) ON DELETE SET NULL,
        mensagem_id uuid REFERENCES whatsapp_mensagens(id) ON DELETE SET NULL,
        acao text NOT NULL,
        detalhe text,
        usuario_id uuid REFERENCES profiles(id),
        payload jsonb,
        criado_em timestamptz DEFAULT now()
      );
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_logs' AND column_name = 'acao') THEN
          ALTER TABLE whatsapp_logs ADD COLUMN acao text NOT NULL;
        END IF;
      END $$;
    `);

    // 8. Atualizar profiles com preferências e elegibilidade
    const profileCols: Array<[string, string]> = [
      ["cnpj", "text"],
      ["tipo_pessoa", "text DEFAULT 'PF'"],
      ["pode_receber_comunicacoes", "boolean DEFAULT true"],
      ["whatsapp_status", "text DEFAULT 'ATIVO'"], // ATIVO, INVALIDO, DESABILITADO, BLOQUEADO, DESCADASTRADO
      ["whatsapp_validado_em", "timestamptz"],
      ["interesses_veiculos", "jsonb DEFAULT '[]'"], // Hatch, Sedan, SUV, etc.
      ["interesses_marcas", "jsonb DEFAULT '[]'"],
      ["interesses_regioes", "jsonb DEFAULT '[]'"],
      ["interesses_anos", "jsonb DEFAULT '[]'"],
      ["verificado", "boolean DEFAULT false"]
    ];



    for (const [name, type] of profileCols) {
      try {
        await d.execute(sql.raw(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = '${name}') THEN
              EXECUTE 'ALTER TABLE profiles ADD COLUMN ${name} ${type}';
            END IF;
          END $$;
        `));
      } catch (e) {
        if (process.env['NODE_ENV'] === 'development') console.error(`Erro ao adicionar coluna ${name} em profiles:`, e);
      }
    }


    if (!silent && process.env['NODE_ENV'] === 'development') console.log("[comunicacoes.server] Tabelas OK.");
  } catch (err) {
    console.error("[comunicacoes.server] Erro ao garantir tabelas:", err);
    throw err;
  }
}

// Functions to be implemented
export async function getWhatsappConfig() {
  const d = requireDb();
  const res = await d.execute(sql`SELECT * FROM whatsapp_config LIMIT 1`);
  return rowsOf(res)?.[0] || null;
}

export async function updateWhatsappConfig(config: any) {
  const d = requireDb();
  await d.execute(sql`
    UPDATE whatsapp_config SET
      waba_id = ${config.waba_id},
      phone_number_id = ${config.phone_number_id},
      business_id = ${config.business_id},
      phone_number = ${config.phone_number},
      access_token = ${config.access_token},
      status = 'DESCONECTADO',
      atualizado_em = now()
    WHERE id = (SELECT id FROM whatsapp_config LIMIT 1)
  `);
  return { ok: true };
}

export async function listarTemplates() {
  const d = requireDb();
  const res = await d.execute(sql`SELECT * FROM whatsapp_templates ORDER BY meta_name`);
  return rowsOf(res) || [];
}

export async function listarSegmentos() {
  const d = requireDb();
  const res = await d.execute(sql`SELECT * FROM whatsapp_segmentos ORDER BY nome`);
  return rowsOf(res) || [];
}

export async function listarCampanhas() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT c.*, v.marca, v.modelo, t.nome_interno as template_nome
    FROM whatsapp_campanhas c
    LEFT JOIN veiculos v ON v.id = c.veiculo_id
    LEFT JOIN whatsapp_templates t ON t.id = c.template_id
    ORDER BY c.criado_em DESC
  `);
  return rowsOf(res) || [];
}

export async function getWebhookLogs() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT * FROM whatsapp_webhook_logs 
    ORDER BY criado_em DESC 
    LIMIT 50
  `);
  return rowsOf(res) || [];
}

export async function getIndicadoresComunicacoes() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT
      (SELECT count(*) FROM whatsapp_campanhas) as total_campanhas,
      (SELECT count(*) FROM whatsapp_mensagens WHERE status = 'ENVIADA') as total_enviadas,
      (SELECT count(*) FROM whatsapp_mensagens WHERE status = 'LIDA') as total_lidas,
      (SELECT count(*) FROM profiles WHERE role = 'comprador' AND pode_receber_comunicacoes = true) as compradores_elegiveis
  `);
  return rowsOf(res)?.[0] || {};
}

export async function estimarPublico(filtros: any) {
  const d = requireDb();
  let whereClause = "WHERE p.role = 'comprador'";

  if (filtros.tipo === 'PF') whereClause += " AND p.tipo_pessoa = 'PF'";
  if (filtros.tipo === 'PJ') whereClause += " AND p.tipo_pessoa = 'PJ'";
  
  if (filtros.status === 'APROVADO') whereClause += " AND p.status_compliance = 'APROVADO'";
  
  if (filtros.uf) whereClause += ` AND p.uf = '${filtros.uf}'`;
  if (filtros.cidade) whereClause += ` AND p.cidade = '${filtros.cidade}'`;

  // Estimativa baseada no banco
  const query = sql.raw(`
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE pode_receber_comunicacoes = true AND whatsapp_status = 'ATIVO') as elegiveis,
      count(*) FILTER (WHERE pode_receber_comunicacoes = false OR whatsapp_status != 'ATIVO') as nao_elegiveis
    FROM profiles p
    ${whereClause}
  `);

  const res = await d.execute(query);
  return rowsOf(res)?.[0] || { total: 0, elegiveis: 0, nao_elegiveis: 0 };
}

export async function criarCampanha(data: any, usuarioId: string) {
  const d = requireDb();
  
  // 1. Criar a campanha
  const resCampanha = await d.execute(sql`
    INSERT INTO whatsapp_campanhas (
      nome, veiculo_id, template_id, status, agendado_para, criado_por
    ) VALUES (
      ${data.nome}, 
      ${data.veiculo_id ? sql`${data.veiculo_id}::uuid` : null}, 
      ${data.template_id}::uuid, 
      ${data.agendado_para ? 'AGENDADA' : 'RASCUNHO'}, 
      ${data.agendado_para ? sql`${data.agendado_para}::timestamptz` : null},
      ${usuarioId}::uuid
    ) RETURNING id
  `);
  
  const campanhaId = rowsOf(resCampanha)[0].id;

  // 2. Buscar destinatários elegíveis baseados nos filtros
  let whereClause = "WHERE p.role = 'comprador' AND p.pode_receber_comunicacoes = true AND p.whatsapp_status = 'ATIVO'";
  if (data.filtros?.tipo === 'PF') whereClause += " AND p.tipo_pessoa = 'PF'";
  if (data.filtros?.tipo === 'PJ') whereClause += " AND p.tipo_pessoa = 'PJ'";
  if (data.filtros?.uf) whereClause += ` AND p.uf = '${data.filtros.uf}'`;
  
  const destinatarios = await d.execute(sql.raw(`
    SELECT id, telefone, nome FROM profiles p ${whereClause}
  `));

  // 3. Popular a fila de mensagens
  const rows = rowsOf(destinatarios) || [];
  for (const dest of rows) {
    await d.execute(sql`
      INSERT INTO whatsapp_mensagens (campanha_id, comprador_id, telefone, payload)
      VALUES (
        ${campanhaId}::uuid, 
        ${dest.id}::uuid, 
        ${dest.telefone}, 
        ${JSON.stringify(data.mapeamento_variaveis)}::jsonb
      )
    `);
  }

  // Atualizar total
  await d.execute(sql`
    UPDATE whatsapp_campanhas SET total_destinatarios = ${rows.length} WHERE id = ${campanhaId}::uuid
  `);

  return { id: campanhaId, total: rows.length };
}

export async function getCampanhaDetalhes(id: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT c.*, v.marca, v.modelo, t.meta_name, t.idioma, t.conteudo as template_conteudo
    FROM whatsapp_campanhas c
    LEFT JOIN veiculos v ON v.id = c.veiculo_id
    LEFT JOIN whatsapp_templates t ON t.id = c.template_id
    WHERE c.id = ${id}::uuid
  `);
  
  const campanha = rowsOf(res)?.[0];
  if (!campanha) return null;

  const mensagensRes = await d.execute(sql`
    SELECT m.*, p.nome as comprador_nome
    FROM whatsapp_mensagens m
    LEFT JOIN profiles p ON p.id = m.comprador_id
    WHERE m.campanha_id = ${id}::uuid
    ORDER BY m.criado_em ASC
    LIMIT 100
  `);

  return { 
    ...campanha, 
    mensagens: rowsOf(mensagensRes) || [] 
  };
}

export async function processarEnvioCampanha(campanhaId: string) {
  const d = requireDb();
  
  // Mudar status da campanha
  await d.execute(sql`UPDATE whatsapp_campanhas SET status = 'PROCESSANDO', iniciado_em = now() WHERE id = ${campanhaId}::uuid`);

  const detalhes = await getCampanhaDetalhes(campanhaId);
  if (!detalhes) throw new Error("Campanha não encontrada");

  const mensagens = await d.execute(sql`
    SELECT * FROM whatsapp_mensagens WHERE campanha_id = ${campanhaId}::uuid AND status = 'NA_FILA'
  `);

  const rows = rowsOf(mensagens) || [];
  let sucessos = 0;
  let falhas = 0;

  for (const msg of rows) {
    try {
      // Aqui chamaríamos a MetaService
      // Como estamos no sandbox, simularemos o envio ou usaremos a real se houver config
      const res = await metaService.enviarMensagem(
        msg.telefone,
        detalhes.meta_name,
        detalhes.idioma,
        [] // TODO: Mapear variáveis do payload para componentes Meta
      );

      await d.execute(sql`
        UPDATE whatsapp_mensagens SET 
          status = 'ENVIADA', 
          enviado_em = now(),
          meta_message_id = ${res.messages?.[0]?.id}
        WHERE id = ${msg.id}::uuid
      `);
      sucessos++;
    } catch (e: any) {
      await d.execute(sql`
        UPDATE whatsapp_mensagens SET 
          status = 'FALHOU', 
          erro_mensagem = ${e.message}
        WHERE id = ${msg.id}::uuid
      `);
      falhas++;
    }
  }

  await d.execute(sql`
    UPDATE whatsapp_campanhas SET 
      status = 'CONCLUIDA', 
      concluido_em = now(),
      total_enviados = ${sucessos},
      total_falhas = ${falhas}
    WHERE id = ${campanhaId}::uuid
  `);

  return { sucessos, falhas };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
