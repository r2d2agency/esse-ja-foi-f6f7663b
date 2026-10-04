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
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_templates' AND column_name = 'motivo_recusa') THEN
          ALTER TABLE whatsapp_templates ADD COLUMN motivo_recusa text;
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

    // 6b. Fila de disparo: o estado do worker em coluna separada do status de
    // entrega. O webhook da Meta grava 'DELIVERED'/'READ'/'FAILED' em `status`,
    // que antes era o mesmo campo da fila — os dois vocabulários se atropelavam.
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'estado_fila') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN estado_fila text DEFAULT 'PENDENTE';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'reservada_em') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN reservada_em timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'reservada_por') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN reservada_por text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'tentativas') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN tentativas int DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'proxima_tentativa_em') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN proxima_tentativa_em timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'origem') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN origem text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'contato_marketing_id') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN contato_marketing_id uuid;
        END IF;
      $$;
    `);

    // Conversão única do que já existia. `enviado_em` preenchido é o sinal mais
    // confiável de que a mensagem saiu: `status` pode ter sido sobrescrito pelo
    // webhook para DELIVERED/READ, apagando o vestígio de NA_FILA.
    await d.execute(sql`
      UPDATE whatsapp_mensagens SET estado_fila = 'ENVIADA'
      WHERE estado_fila = 'PENDENTE' AND enviado_em IS NOT NULL;
    `);

    // O worker só enxerga mensagens prontas, e a ordem é por campanha + retry.
    await d.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_wa_mensagens_fila
      ON whatsapp_mensagens (campanha_id, proxima_tentativa_em)
      WHERE estado_fila = 'PENDENTE';
    `);
    // Segunda barreira contra envio duplicado: o mesmo telefone não entra duas
    // vezes na mesma campanha.
    await d.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_mensagens_telefone
      ON whatsapp_mensagens (campanha_id, telefone);
    `);

    // 6c. Janela de trabalho e ritmo de envio por campanha.
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'janela_inicio') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN janela_inicio time;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'janela_fim') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN janela_fim time;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'intervalo_minutos') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN intervalo_minutos int DEFAULT 5;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'segmento_id') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN segmento_id uuid REFERENCES whatsapp_segmentos(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'origem_publico') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN origem_publico text DEFAULT 'AMBOS';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_campanhas' AND column_name = 'ultimo_envio_em') THEN
          ALTER TABLE whatsapp_campanhas ADD COLUMN ultimo_envio_em timestamptz;
        END IF;
      END $$;
    `);

    // 6d. Lote importado: guarda de onde veio cada contato, para a tela mostrar
    // qual lista foi carregada e quando.
    await d.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_contato_lotes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome text NOT NULL,
        origem text DEFAULT 'importacao',
        total_inseridos int DEFAULT 0,
        total_duplicados int DEFAULT 0,
        total_invalidos int DEFAULT 0,
        criado_por uuid REFERENCES profiles(id),
        criado_em timestamptz DEFAULT now()
      );
    `);

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
  // A inicialização do servidor pode ocorrer depois da primeira chamada server-side.
  // Garanta a tabela antes da leitura para não falhar com "relation does not exist".
  await ensureComunicacoesSchema();
  await curarConfigDuplicada(d);
  const res = await d.execute(sql`
    SELECT * FROM whatsapp_config
    ORDER BY atualizado_em, id LIMIT 1
  `);
  return rowsOf(res)?.[0] || null;
}

/**
 * A tabela é conceitualmente de linha única, mas os INSERT ... WHERE NOT EXISTS
 * não são atômicos: duas requisições simultâneas (a tela dispara várias queries
 * em paralelo) passam as duas pelo NOT EXISTS e criam duas linhas. Depois disso,
 * salvar e ler caem em linhas diferentes e a configuração parece não persistir.
 *
 * Mantém a linha de menor id (a que o UPDATE já alvo) e absorve dela qualquer
 * valor preenchido que exista nas duplicadas, para não perder a configuração
 * que o usuário já havia salvo.
 */
async function curarConfigDuplicada(d: any) {
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
          'waba_id', 'phone_number_id', 'business_id', 'phone_number', 'app_id',
          'app_secret', 'access_token', 'graph_api_version', 'webhook_verify_token', 'status'
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
    if (process.env['NODE_ENV'] === 'development')
      console.error("[comunicacoes.server] Falha ao deduplicar whatsapp_config:", e);
  }
}

export async function updateWhatsappConfig(config: any) {
  const d = requireDb();
  await ensureComunicacoesSchema();
  await curarConfigDuplicada(d);
  await d.execute(sql`
    INSERT INTO whatsapp_config (id)
    SELECT gen_random_uuid()
    WHERE NOT EXISTS (SELECT 1 FROM whatsapp_config);
  `);
  const res = await d.execute(sql`
    UPDATE whatsapp_config SET
      waba_id = COALESCE(${config.waba_id ?? null}, waba_id),
      phone_number_id = COALESCE(${config.phone_number_id ?? null}, phone_number_id),
      business_id = COALESCE(${config.business_id ?? null}, business_id),
      phone_number = COALESCE(${config.phone_number ?? null}, phone_number),
      app_id = COALESCE(${config.app_id ?? null}, app_id),
      app_secret = COALESCE(${config.app_secret ?? null}, app_secret),
      access_token = COALESCE(${config.access_token ?? null}, access_token),
      graph_api_version = COALESCE(${config.graph_api_version ?? null}, graph_api_version),
      webhook_verify_token = COALESCE(${config.webhook_verify_token ?? null}, webhook_verify_token),
      status = COALESCE(${config.status ?? null}, status),
      atualizado_em = now()
    WHERE id = (SELECT id FROM whatsapp_config ORDER BY id LIMIT 1)
    RETURNING id
  `);

  // Sem esta checagem, um UPDATE que não afeta nenhuma linha ainda retornava
  // { ok: true } e a tela confirmava "salvado" sem ter gravado nada.
  if ((rowsOf(res) as any[]).length === 0) {
    throw new Error(
      "Nenhuma linha de configuração foi atualizada. Recarregue a página e tente de novo."
    );
  }
  return { ok: true };
}

export async function excluirTemplateLocal(metaName: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    DELETE FROM whatsapp_templates WHERE meta_name = ${metaName}
    RETURNING id
  `);
  return { ok: true, removido: (rowsOf(res) as any[]).length > 0 };
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

/**
 * Base de contatos do WhatsApp: todos os compradores cadastrados, com o que a
 * tela de Contatos precisa mostrar. A tela usava linhas fixas no código — o
 * cadastro real nunca aparecia, então ninguém conseguia conferir quem está
 * elegível antes de disparar.
 *
 * A elegibilidade reproduz o filtro que a campanha usa de verdade
 * (pode_receber_comunicacoes + whatsapp_status ATIVO), para o número da tela
 * bater com o número de quem vai receber.
 */
export async function listarContatosWhatsapp(filtros: {
  busca?: string | null;
  apenasElegiveis?: boolean;
} = {}) {
  const d = requireDb();
  const busca = (filtros.busca ?? "").trim();
  const termo = busca ? `%${busca}%` : null;
  const apenasElegiveis = filtros.apenasElegiveis ?? false;

  const res = await d.execute(sql`
    SELECT
      p.id, p.nome, p.telefone, p.whatsapp, p.email,
      p.status_compliance, p.whatsapp_status, p.pode_receber_comunicacoes,
      p.tipo_pessoa, p.uf, p.cidade, p.interesses_veiculos, p.interesses_marcas,
      (p.telefone IS NOT NULL AND btrim(p.telefone) <> '') AS tem_telefone,
      (p.telefone IS NOT NULL AND btrim(p.telefone) <> ''
        AND p.pode_receber_comunicacoes = true
        AND p.whatsapp_status = 'ATIVO') AS elegivel
    FROM profiles p
    WHERE p.role = 'comprador'
      AND (p.ativo IS NOT FALSE)
      ${termo
        ? sql`AND (
            p.nome ILIKE ${termo}
            OR p.telefone ILIKE ${termo}
            OR coalesce(p.whatsapp, '') ILIKE ${termo}
            OR coalesce(p.cidade, '') ILIKE ${termo}
            OR coalesce(p.email, '') ILIKE ${termo}
          )`
        : sql``}
      ${apenasElegiveis ? sql`AND p.pode_receber_comunicacoes = true AND p.whatsapp_status = 'ATIVO'` : sql``}
    ORDER BY p.nome ASC
    LIMIT 300
  `);
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
  // Antes os filtros iam concatenados no SQL, o que abria injeção. Agora vão por
  // parâmetro, e a contagem considera também os contatos importados — o
  // público real do marketing inclui prospects que ainda não são compradores.
  const { contarPublico } = await import("./publico.server");
  const total = await contarPublico({
    origem: filtros?.origem ?? "AMBOS",
    tipo: filtros?.tipo ?? null,
    uf: filtros?.uf ?? null,
    cidade: filtros?.cidade ?? null,
    statusCompliance: filtros?.status === "APROVADO" ? "APROVADO" : null,
  });
  return { total, elegiveis: total, nao_elegiveis: 0 };
}

export async function criarCampanha(data: any, usuarioId: string) {
  const d = requireDb();
  const { ensureComunicacoesSchema } = await import("./comunicacoes.server");
  await ensureComunicacoesSchema();

  const resCampanha = await d.execute(sql`
    INSERT INTO whatsapp_campanhas (
      nome, veiculo_id, template_id, origem_publico, janela_inicio, janela_fim,
      intervalo_minutos, status, agendado_para, criado_por, mapeamento_variaveis
    ) VALUES (
      ${data.nome},
      ${data.veiculo_id ? sql`${data.veiculo_id}::uuid` : null},
      ${data.template_id}::uuid,
      ${data.origem_publico ?? 'AMBOS'},
      ${data.janela_inicio || null},
      ${data.janela_fim || null},
      ${data.intervalo_minutos ?? 5},
      ${data.agendado_para ? 'AGUARDANDO' : 'RASCUNHO'},
      ${data.agendado_para || null},
      ${usuarioId}::uuid,
      ${JSON.stringify(data.mapeamento_variaveis ?? {})}::jsonb
    ) RETURNING id
  `);

  const campanhaId = rowsOf(resCampanha)[0].id;

  // A fila é montada pelo motor, que dedup por telefone e resolve o público
  // unificado. O INSERT por destinatário que existia aqui saía em N voltas.
  const { popularFilaCampanha } = await import("./disparo-motor.server");
  const fila = await popularFilaCampanha(campanhaId, {
    origem: data.origem_publico ?? "AMBOS",
    tipo: data.filtros?.tipo ?? null,
    uf: data.filtros?.uf ?? null,
    cidade: data.filtros?.cidade ?? null,
    statusCompliance: data.filtros?.status ?? null,
    mapeamento: data.mapeamento_variaveis ?? {},
  } as any);

  return { id: campanhaId, total: fila.inseridos };
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

/**
 * Dispara uma campanha respeitando janela e intervalo. O trabalho de verdade
 * é do motor (disparo-motor.server.ts), que roda sozinho no worker do servidor
 * e é retomável; aqui só forçamos uma passada imediata, útil para o botão
 * "processar agora" da tela e para o primeiro disparo depois de agendar.
 *
 * O código anterior enviava a fila inteira num for sequencial, sem pausa e com
 * os componentes vazios — batia no rate limit da Meta e nenhuma variável do
 * corpo era preenchida.
 */
export async function processarEnvioCampanha(campanhaId: string) {
  const d = requireDb();
  await ensureComunicacoesSchema();
  await d.execute(sql`
    UPDATE whatsapp_campanhas
    SET status = 'AGUARDANDO', atualizado_em = now()
    WHERE id = ${campanhaId}::uuid AND status IN ('RASCUNHO', 'AGENDADA')
  `);
  const { processarDisparo } = await import("./disparo-motor.server");
  return await processarDisparo();
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
