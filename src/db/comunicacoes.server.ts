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
  if (!silent && process.env["NODE_ENV"] === "development")
    console.log("[comunicacoes.server] Garantindo tabelas de comunicação...");

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
      ALTER TABLE whatsapp_config
        ADD COLUMN IF NOT EXISTS waba_id text,
        ADD COLUMN IF NOT EXISTS phone_number_id text,
        ADD COLUMN IF NOT EXISTS business_id text,
        ADD COLUMN IF NOT EXISTS phone_number text,
        ADD COLUMN IF NOT EXISTS app_id text,
        ADD COLUMN IF NOT EXISTS app_secret text,
        ADD COLUMN IF NOT EXISTS access_token text,
        ADD COLUMN IF NOT EXISTS graph_api_version text DEFAULT 'v20.0',
        ADD COLUMN IF NOT EXISTS webhook_verify_token text,
        ADD COLUMN IF NOT EXISTS status text DEFAULT 'DESCONECTADO',
        ADD COLUMN IF NOT EXISTS ultimo_teste timestamptz,
        ADD COLUMN IF NOT EXISTS detalhes_erro text;
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

    // Colunas que separam as duas pontas da chamada à Meta. Sem elas a linha de
    // log só dizia o que chegou, nunca o que foi pedido — e `status` ficava
    // limitado a PROCESSADO/ERRO, sem distinguir sucesso de falha.
    await d.execute(sql`
      ALTER TABLE whatsapp_webhook_logs
        ADD COLUMN IF NOT EXISTS direcao text,
        ADD COLUMN IF NOT EXISTS endpoint text,
        ADD COLUMN IF NOT EXISTS http_status int,
        ADD COLUMN IF NOT EXISTS duracao_ms int;
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
      ALTER TABLE whatsapp_templates
        ADD COLUMN IF NOT EXISTS nome_interno text,
        ADD COLUMN IF NOT EXISTS meta_name text,
        ADD COLUMN IF NOT EXISTS categoria text,
        ADD COLUMN IF NOT EXISTS idioma text DEFAULT 'pt_BR',
        ADD COLUMN IF NOT EXISTS conteudo jsonb,
        ADD COLUMN IF NOT EXISTS status text DEFAULT 'PENDENTE',
        ADD COLUMN IF NOT EXISTS motivo_recusa text,
        ADD COLUMN IF NOT EXISTS tipo_midia text,
        ADD COLUMN IF NOT EXISTS meta_id text,
        ADD COLUMN IF NOT EXISTS ultima_sincronizacao timestamptz DEFAULT now();
    `);

    // Anexo do cabeçalho (imagem ou PDF). O `conteudo` guarda a estrutura do
    // template, não o binário; o `media_id` da Meta expira em 30 dias, então a
    // cópia local em `arquivos_upload` (`midia_arquivo_id`) é o que permite
    // reenviar o template quando o id vencer.
    await d.execute(sql`
      ALTER TABLE whatsapp_templates
        ADD COLUMN IF NOT EXISTS midia_id text,
        ADD COLUMN IF NOT EXISTS midia_tipo text,
        ADD COLUMN IF NOT EXISTS midia_nome text,
        ADD COLUMN IF NOT EXISTS midia_arquivo_id uuid;
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
      ALTER TABLE whatsapp_segmentos
        ADD COLUMN IF NOT EXISTS nome text,
        ADD COLUMN IF NOT EXISTS descricao text,
        ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'DINAMICO',
        ADD COLUMN IF NOT EXISTS filtros jsonb,
        ADD COLUMN IF NOT EXISTS total_contatos integer DEFAULT 0;
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
      ALTER TABLE whatsapp_campanhas
        ADD COLUMN IF NOT EXISTS nome text,
        ADD COLUMN IF NOT EXISTS status text DEFAULT 'RASCUNHO',
        ADD COLUMN IF NOT EXISTS agendado_para timestamptz,
        ADD COLUMN IF NOT EXISTS total_destinatarios integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES profiles(id);
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
      ALTER TABLE whatsapp_mensagens
        ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES whatsapp_campanhas(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS comprador_id uuid REFERENCES profiles(id),
        ADD COLUMN IF NOT EXISTS telefone text,
        ADD COLUMN IF NOT EXISTS status text DEFAULT 'NA_FILA',
        ADD COLUMN IF NOT EXISTS meta_message_id text;
    `);
    await d.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_wa_mensagens_campanha ON whatsapp_mensagens(campanha_id);`,
    );
    await d.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_wa_mensagens_status ON whatsapp_mensagens(status);`,
    );

    // A coluna `variaveis` é a que o motor de disparo grava (INSERT em
    // whatsapp_mensagens.variaveis) e que a tela de detalhe da campanha lê
    // (`variaveis->'contato'->>'nome'`). Ela não existia: só havia `payload`,
    // que ninguém escreve. O INSERT falhava com "column variaveis does not
    // exist", o catch engolia o erro e a campanha ficava com fila vazia.
    await d.execute(sql`
      ALTER TABLE whatsapp_mensagens
        ADD COLUMN IF NOT EXISTS variaveis jsonb DEFAULT '{}'::jsonb;
    `);

    // 6b. Fila de disparo: o estado do worker em coluna separada do status de
    // entrega. O webhook da Meta grava 'DELIVERED'/'READ'/'FAILED' em `status`,
    // que antes era o mesmo campo da fila — os dois vocabulários se atropelavam.
    await d.execute(sql`
      ALTER TABLE whatsapp_mensagens
        ADD COLUMN IF NOT EXISTS estado_fila text DEFAULT 'PENDENTE',
        ADD COLUMN IF NOT EXISTS reservada_em timestamptz,
        ADD COLUMN IF NOT EXISTS reservada_por text,
        ADD COLUMN IF NOT EXISTS tentativas int DEFAULT 0,
        ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz,
        ADD COLUMN IF NOT EXISTS origem text,
        ADD COLUMN IF NOT EXISTS contato_marketing_id uuid;
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
      ALTER TABLE whatsapp_campanhas
        ADD COLUMN IF NOT EXISTS janela_inicio time,
        ADD COLUMN IF NOT EXISTS janela_fim time,
        ADD COLUMN IF NOT EXISTS intervalo_minutos int DEFAULT 5,
        ADD COLUMN IF NOT EXISTS segmento_id uuid REFERENCES whatsapp_segmentos(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS origem_publico text DEFAULT 'AMBOS',
        ADD COLUMN IF NOT EXISTS ultimo_envio_em timestamptz;
    `);

    // 6f. Mapeamento de variáveis do template ({{1}} -> veiculo.marca etc).
    // Campanha de mensagem geral usa {} — o campo é obrigatório no INSERT.
    await d.execute(sql`
      ALTER TABLE whatsapp_campanhas
        ADD COLUMN IF NOT EXISTS mapeamento_variaveis jsonb DEFAULT '{}'::jsonb;
    `);

    // 6e. Canal de envio: por quem a mensagem sai.
    //   META    = template oficial pelo serviço da Meta (caminho original).
    //   UAZAPI  = conexão nova da Uazapi — a única rota que aceita grupo, já
    //            que a Meta não processa template enviado para @g.us.
    // `grupos_alvo` só existe para UAZAPI: são os ids "120363...@g.us".
    await d.execute(sql`
      ALTER TABLE whatsapp_campanhas
        ADD COLUMN IF NOT EXISTS canal_envio text DEFAULT 'META',
        ADD COLUMN IF NOT EXISTS grupos_alvo jsonb DEFAULT '[]'::jsonb;
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
      ALTER TABLE whatsapp_logs
        ADD COLUMN IF NOT EXISTS acao text;
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
      ["verificado", "boolean DEFAULT false"],
    ];

    for (const [name, type] of profileCols) {
      try {
        // O tipo é interpolado dentro de uma string SQL, então as aspas simples
        // do DEFAULT precisam ser dobradas — senão a string fecha antes do
        // valor e o Postgres devolve "syntax error at or near".
        // A troca é feita uma única vez, na hora de montar o SQL. Tentar
        // compensar um valor já escapado (a ideia do marcador ''D'') gerava
        // `DEFAULT ''D''PF''D''` e quebrava todas essas colunas.
        const tipoLimpo = String(type).replace(/'/g, "''");
        await d.execute(
          sql.raw(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ${name} ${tipoLimpo};`),
        );
      } catch (e) {
        if (process.env["NODE_ENV"] === "development")
          console.error(`Erro ao adicionar coluna ${name} em profiles:`, e);
      }
    }

    if (!silent && process.env["NODE_ENV"] === "development")
      console.log("[comunicacoes.server] Tabelas OK.");
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
    if (process.env["NODE_ENV"] === "development")
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
      "Nenhuma linha de configuração foi atualizada. Recarregue a página e tente de novo.",
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

/**
 * Grava o anexo do cabeçalho em um template JÁ EXISTENTE. Templates criados
 * direto no WhatsApp Manager chegam pela sincronização sem binário local
 * (`midia_arquivo_id` nulo) e com o `header_handle` da Meta como URL — sem
 * referência utilizável, o HEADER de mídia mata o envio com "não tem um ID
 * válido para a Meta". Reanexar guarda o binário em `arquivos_upload` e
 * devolve o caminho do disparo.
 */
export async function anexarMidiaTemplate(
  templateId: string,
  midia: {
    midia_id: string;
    midia_tipo: string;
    midia_nome: string;
    midia_arquivo_id: string;
  },
) {
  const d = requireDb();
  const res = await d.execute(sql`
    UPDATE whatsapp_templates
    SET midia_id = ${midia.midia_id},
        midia_tipo = ${midia.midia_tipo},
        midia_nome = ${midia.midia_nome},
        midia_arquivo_id = ${midia.midia_arquivo_id}::uuid
    WHERE id = ${templateId}::uuid
    RETURNING id
  `);
  if ((rowsOf(res) as any[]).length === 0) {
    throw new Error("Template não encontrado.");
  }
  return { ok: true };
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
export async function listarContatosWhatsapp(
  filtros: {
    busca?: string | null;
    apenasElegiveis?: boolean;
  } = {},
) {
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
      ${
        termo
          ? sql`AND (
            p.nome ILIKE ${termo}
            OR p.telefone ILIKE ${termo}
            OR coalesce(p.whatsapp, '') ILIKE ${termo}
            OR coalesce(p.cidade, '') ILIKE ${termo}
            OR coalesce(p.email, '') ILIKE ${termo}
          )`
          : sql``
      }
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
  // O wizard guarda o filtro de compliance em `filtros.status`; como a tela
  // também pode mandar `statusCompliance` direto, os dois são aceitos.
  const statusCompliance = filtros?.statusCompliance ?? filtros?.status ?? null;
  const total = await contarPublico({
    origem: filtros?.origem ?? "AMBOS",
    tipo: filtros?.tipo ?? null,
    uf: filtros?.uf ?? null,
    cidade: filtros?.cidade ?? null,
    statusCompliance: statusCompliance || null,
    // Sem isto a etiqueta escolhida na tela não chegava à contagem: a campanha
    // mirava a base inteira enquanto o wizard mostrava outro número.
    tagIds: filtros?.tagIds ?? null,
    busca: filtros?.busca ?? null,
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
      ${data.origem_publico ?? "AMBOS"},
      ${data.janela_inicio || null},
      ${data.janela_fim || null},
      ${data.intervalo_minutos ?? 5},
      ${data.agendado_para ? "AGUARDANDO" : "RASCUNHO"},
      ${data.agendado_para || null},
      ${usuarioId}::uuid,
      ${JSON.stringify(data.mapeamento_variaveis ?? {})}::jsonb
    ) RETURNING id
  `);

  const campanhaId = rowsOf(resCampanha)[0].id;

  // A fila é montada pelo motor, que dedup por telefone e resolve o público
  // unificado. O INSERT por destinatário que existia aqui saía em N voltas.
  const { popularFilaCampanha } = await import("./disparo-motor.server");
  // A tag mora no topo (`tag_ids`), com fallback para `filtros.tagIds`: sem
  // isso a campanha com tag gravava mas enfileirava zero pessoas.
  const fila = await popularFilaCampanha(campanhaId, {
    origem: data.origem_publico ?? "AMBOS",
    tipo: data.filtros?.tipo ?? null,
    uf: data.filtros?.uf ?? null,
    cidade: data.filtros?.cidade ?? null,
    statusCompliance: data.filtros?.status ?? null,
    tagIds: (data as any).tag_ids ?? data.filtros?.tagIds ?? null,
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
    mensagens: rowsOf(mensagensRes) || [],
  };
}

/**
 * Fila de uma campanha, para o detalhe por contato.
 *
 * A tabela não guarda o nome do contato — a mensagem carrega apenas telefone e
 * o id de quem é comprador/prospect. O nome sai de `variaveis->>'contato.nome'`
 * (o motor já resolve o contato ao montar a fila), com fallback para a tabela
 * de perfis e por fim para o próprio telefone.
 *
 * `estado_fila` é o ciclo do nosso motor (PENDENTE/RESERVADA/ENVIADA/FALHOU/
 * IGNORADA); `status` é o que a Meta devolve via webhook (ENVIADA/ENTREGUE/
 * LIDA). O detalhe mostra os dois porque a fila dizer "ENVIADA" não garante
 * entrega — a Meta confirma depois, e o erro (`erro_mensagem`/`erro_codigo`)
 * é o que explica uma mensagem que não saiu.
 */
export async function listarEnviosCampanha(campanhaId: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT
      m.id,
      m.telefone,
      COALESCE(
        NULLIF(m.variaveis->'contato'->>'nome', ''),
        p.nome,
        mc.nome
      ) as contato_nome,
      m.estado_fila,
      m.status,
      m.origem,
      m.proxima_tentativa_em,
      m.enviado_em,
      m.entregue_em,
      m.lido_em,
      m.tentativas,
      m.erro_codigo,
      m.erro_mensagem,
      m.criado_em
    FROM whatsapp_mensagens m
    LEFT JOIN profiles p ON p.id = m.comprador_id
    LEFT JOIN marketing_contatos mc ON mc.id = m.contato_marketing_id
    WHERE m.campanha_id = ${campanhaId}::uuid
    ORDER BY m.proxima_tentativa_em ASC NULLS LAST, m.criado_em ASC
  `);
  return rowsOf(res) || [];
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
export function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
