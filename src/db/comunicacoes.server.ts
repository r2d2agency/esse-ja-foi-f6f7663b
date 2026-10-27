import { sql, eq, and } from "drizzle-orm";
import { db } from "./index";
import { metaService, normalizarVersaoGraph } from "./meta-whatsapp.server";
import {
  curarConfigDuplicada,
  lerWhatsappConfig,
} from "./whatsapp-config.server";
import { processarMensagemRecebida } from "./conversas.server";
import { mensagemErroPostgres } from "./erro-postgres";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

/**
 * Executa um passo do esquema sem derrubar o resto.
 *
 * `ensureComunicacoesSchema` é chamada por quase toda função de servidor do
 * módulo WhatsApp (listar templates, sincronizar, enviar teste, logs, webhook,
 * motor de disparo). Um único comando que estoure — uma linha duplicada num
 * índice único, uma coluna que alguém mudou fora do sistema — abortava a
 * função inteira (o `catch` externo relança) e derrubava **tudo de uma vez**:
 * templates, logs, teste e disparo. Cada passo crítico passa por aqui: a
 * falha fica registrada no log do servidor e o restante do esquema continua.
 */
async function passoOpcional(rotulo: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    // `e.message` do Drizzle é "Failed query: SELECT ... params: ..." — não diz
    // NADA do motivo. A causa real (SQLSTATE, coluna que falta, tipo que não
    // bate) está no `.cause`, e é ela que precisa aparecer no log.
    console.error(
      `[comunicacoes.server] Falha ao garantir ${rotulo}: ${mensagemErroPostgres(e)}`,
    );
  }
}

/**
 * Garante as tabelas do módulo antes de uma leitura.
 *
 * As tabelas `whatsapp_*` são criadas em tempo de execução (`CREATE TABLE IF
 * NOT EXISTS`), fora das migrações do Drizzle. Se a criação falhou — ou se a
 * leitura acontece antes do boot concluí-la — o `SELECT` morre com 42P01
 * ("relation does not exist") e o Drizzle reporta só "Failed query: SELECT ...
 * params: ...".
 *
 * A falha aqui NÃO interrompe a leitura: se a tabela existir, o `SELECT`
 * funciona; se não existir, ela devolve o erro real (com SQLSTATE), que é o
 * que o admin precisa ver.
 */
async function garantirTabelas() {
  try {
    await ensureComunicacoesSchema();
  } catch (e) {
    console.error(
      "[comunicacoes.server] Falha ao garantir o schema antes da leitura:",
      mensagemErroPostgres(e),
    );
  }
}

/**
 * Janela em que o esquema já garantido é aceito sem refazer o trabalho.
 *
 * `ensureComunicacoesSchema` roda em quase toda função de servidor do módulo
 * WhatsApp. Cada execução refazia a deduplicação, recriava constraints e
 * criava índices — e duas requisições simultâneas brigavam pelo mesmo
 * deadlock. Como o passo é idempotente e só serve para garantir que as
 * tabelas existem, repetir a cada requisição é desperdício: 30 segundos de
 * folga bastam.
 */
const INTERVALO_ENSURE_MS = 30_000;
let ultimoEnsureConcluido = 0;
let ensureEmVoo: Promise<void> | null = null;

export async function ensureComunicacoesSchema(silent = true) {
  // Uma execução em andamento já vai fazer o trabalho: esperar por ela evita
  // duas deduplicações simultâneas (a origem do "deadlock detected").
  if (ensureEmVoo) {
    await ensureEmVoo.catch(() => undefined);
    return;
  }
  if (Date.now() - ultimoEnsureConcluido < INTERVALO_ENSURE_MS) return;

  const execucao = garantirEsquemaComunicacoes(silent);
  ensureEmVoo = execucao;
  try {
    await execucao;
    ultimoEnsureConcluido = Date.now();
  } finally {
    ensureEmVoo = null;
  }
}

async function garantirEsquemaComunicacoes(silent = true) {
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
        graph_api_version text DEFAULT 'v26.0',
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
        ADD COLUMN IF NOT EXISTS graph_api_version text DEFAULT 'v26.0',
        ADD COLUMN IF NOT EXISTS webhook_verify_token text,
        ADD COLUMN IF NOT EXISTS status text DEFAULT 'DESCONECTADO',
        ADD COLUMN IF NOT EXISTS ultimo_teste timestamptz,
        ADD COLUMN IF NOT EXISTS detalhes_erro text;
    `);

    // A versão da Graph API guardada pode ter saído do ar: a Meta expira cada
    // versão ~2 anos após o lançamento da seguinte, e a v20.0 expirou em
    // 24/09/2026. Uma versão morta derruba TODAS as chamadas à Meta (a
    // sincronização voltava vazia, a criação de template era recusada e a
    // exclusão não apagava nada) sem deixar pista no sistema. Quando a
    // versão guardada não está mais no ar, ela sobe para a atual.
    await passoOpcional("a versão da Graph API", () =>
      d.execute(sql`
        UPDATE whatsapp_config
        SET graph_api_version = CASE
          -- Forma canônica: "v26", "26.0" e "V26.0" viram "v26.0".
          WHEN btrim(lower(graph_api_version)) ~ '^v?[0-9]+(\.[0-9]+)?$'
            THEN 'v' || split_part(regexp_replace(btrim(lower(graph_api_version)), '^v', ''), '.', 1)
                 || '.' ||
                 COALESCE(NULLIF(split_part(regexp_replace(btrim(lower(graph_api_version)), '^v', ''), '.', 2), ''), '0')
          -- Texto fora do padrão (ou vazio): vai para a versão vigente.
          ELSE 'v26.0'
        END
        WHERE graph_api_version IS NULL
           OR lower(trim(graph_api_version)) NOT IN ('v26.0', 'v25.0', 'v24.0');
      `),
    );

    // A normalização acima conserta o FORMATO, mas não sabe se a versão é
    // ainda aceita pela Meta: uma "v20.0" normalizada continua "v20.0" e
    // continua morta. Só as três versões em suporte sobrevivem — as demais
    // sobem para a vigente.
    await passoOpcional("a vigência da versão da Graph API", () =>
      d.execute(sql`
        UPDATE whatsapp_config
        SET graph_api_version = 'v26.0'
        WHERE graph_api_version IS NOT NULL
          AND lower(trim(graph_api_version)) NOT IN ('v26.0', 'v25.0', 'v24.0');
      `),
    );

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
        status text DEFAULT 'PENDING', -- APPROVED, PENDING, REJECTED, PAUSED (vocabulário da Meta)
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
        ADD COLUMN IF NOT EXISTS status text DEFAULT 'PENDING',
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

    // Migração de dados do status do template. A coluna foi criada com o
    // default em português ('PENDENTE'), mas todo o sistema compara com o
    // vocabulário da Meta ('APPROVED', 'PENDING', 'REJECTED'). Um template
    // criado pelo wizard ficava travado em 'PENDENTE': invisível no seletor de
    // template da campanha e com a campanha bloqueada como
    // TEMPLATE_INDISPONIVEL, mesmo já aprovado na Meta. O `ALTER ... ADD
    // COLUMN IF NOT EXISTS` acima não muda default nem dados de tabela
    // existente — por isso a normalização é um UPDATE explícito.
    await passoOpcional("a migração de status dos templates", () =>
      d.execute(sql`
      UPDATE whatsapp_templates SET status = CASE UPPER(TRIM(COALESCE(status, '')))
        WHEN 'APROVADO' THEN 'APPROVED'
        WHEN 'PENDENTE' THEN 'PENDING'
        WHEN 'REJEITADO' THEN 'REJECTED'
        WHEN 'PAUSADO' THEN 'PAUSED'
        WHEN 'APAGADO' THEN 'DELETED'
        ELSE status
      END
      WHERE status IS NOT NULL
        AND status <> ''
        AND UPPER(TRIM(status)) IN ('APROVADO','PENDENTE','REJEITADO','PAUSADO','APAGADO');
    `),
    );

    // O default antigo também precisa mudar: `ADD COLUMN IF NOT EXISTS` não
    // altera o default de uma coluna que já existe.
    await passoOpcional("o default de status dos templates", () =>
      d.execute(sql`
      ALTER TABLE whatsapp_templates ALTER COLUMN status SET DEFAULT 'PENDING';
    `),
    );

    // O `ON CONFLICT (meta_name)` usado na sincronização e na criação de
    // template da Meta exige uma restrição UNIQUE em `meta_name`. A coluna
    // nasceu com `UNIQUE NOT NULL` na criação da tabela, mas bancos criados
    // antes disso recebem só o `ADD COLUMN IF NOT EXISTS meta_name text`
    // (que NÃO cria constraint) — e aí todo ON CONFLICT estoura com "there is
    // no unique or exclusion constraint matching the ON CONFLICT
    // specification". Deduplica primeiro e depois cria o índice idempotente.
    //
    // IMPORTANTE: esta limpeza NÃO pode derrubar o resto do esquema. A função
    // relança qualquer erro, e `ensureComunicacoesSchema` é chamada por quase
    // toda função de servidor do módulo WhatsApp (listar, sincronizar, enviar
    // teste, logs, webhook) — um único DELETE bloqueado por chave estrangeira
    // matava templates, logs e envio de teste de uma vez. Por isso cada passo
    // vai isolado no seu próprio try/catch, e a dedupe respeita as referências
    // de campanha e automação (reapontando para o registro sobrevivente em vez
    // de apagar a linha e estourar a FK).
    try {
      await d.execute(sql`
        DO $$
        BEGIN
          -- Serializa a deduplicação entre requisições simultâneas.
          -- Sem esta trava, dois processes rodavam o mesmo UPDATE em
          -- whatsapp_campanhas ao mesmo tempo e o Postgres abortava um deles
          -- com "deadlock detected" (while locking tuple in relation
          -- "whatsapp_campanhas"). A trava é de transação: vale só para o
          -- bloco e some no fim, sem estado residual.
          PERFORM pg_advisory_xact_lock(918273646);

          -- Nada a fazer quando não há duplicata: evita tomar a trava de
          -- escrita sobre as tabelas a cada requisição.
          IF NOT EXISTS (
            SELECT 1 FROM whatsapp_templates a
            JOIN whatsapp_templates b
              ON lower(trim(a.meta_name)) = lower(trim(b.meta_name))
             AND a.meta_name IS NOT NULL
             AND a.id > b.id
          ) THEN
            RETURN;
          END IF;

          -- Campanhas: um template duplicado pode estar em uso por uma campanha.
          -- Reaponta para o registro mais antigo antes de apagar o duplicado.
          -- A comparação ignora caixa e espaços nas pontas: a Meta devolve o
          -- nome em minúsculas e o wizard grava o que o usuário digitou — as
          -- duas linhas do MESMO template chegam com grafias diferentes.
          IF to_regclass('whatsapp_campanhas') IS NOT NULL THEN
            UPDATE whatsapp_campanhas c
            SET template_id = k.id
            FROM whatsapp_templates dup
            JOIN whatsapp_templates k
              ON k.id = (
                SELECT x.id FROM whatsapp_templates x
                WHERE lower(trim(x.meta_name)) = lower(trim(dup.meta_name))
                ORDER BY x.id LIMIT 1
              )
            WHERE c.template_id = dup.id;
          END IF;

          -- Automações: mesma situação (a tabela é criada depois, em outro
          -- módulo, então o guard por to_regclass é obrigatório).
          IF to_regclass('whatsapp_automacoes') IS NOT NULL THEN
            UPDATE whatsapp_automacoes a
            SET template_id = k.id
            FROM whatsapp_templates dup
            JOIN whatsapp_templates k
              ON k.id = (
                SELECT x.id FROM whatsapp_templates x
                WHERE lower(trim(x.meta_name)) = lower(trim(dup.meta_name))
                ORDER BY x.id LIMIT 1
              )
            WHERE a.template_id = dup.id;
          END IF;
        END $$;
      `);

      // O estado mais recente do template precisa ir para a linha que
      // SOBREVIVE à deduplicação. Sem isto, a linha antiga (criada pelo
      // wizard, com status PENDING) vencia a linha recém-sincronizada
      // (APPROVED na Meta) e o template aprovado sumia da tela — era
      // exatamente o que a sincronização devolvia sem mostrar os templates.
      await d.execute(sql`
        UPDATE whatsapp_templates k
        SET status = COALESCE(s.status, k.status),
            meta_id = COALESCE(s.meta_id, k.meta_id),
            categoria = COALESCE(s.categoria, k.categoria),
            idioma = COALESCE(s.idioma, k.idioma),
            motivo_recusa = s.motivo_recusa,
            ultima_sincronizacao = COALESCE(s.ultima_sincronizacao, k.ultima_sincronizacao)
        FROM (
          SELECT DISTINCT ON (lower(trim(meta_name)))
            lower(trim(meta_name)) AS chave,
            status, meta_id, categoria, idioma, motivo_recusa, ultima_sincronizacao
          FROM whatsapp_templates
          WHERE meta_name IS NOT NULL
          ORDER BY lower(trim(meta_name)), ultima_sincronizacao DESC NULLS LAST, id DESC
        ) s
        WHERE lower(trim(k.meta_name)) = s.chave
          AND k.id = (
            SELECT x.id FROM whatsapp_templates x
            WHERE lower(trim(x.meta_name)) = s.chave
            ORDER BY x.id LIMIT 1
          )
      `);

      await d.execute(sql`
        DELETE FROM whatsapp_templates a
        USING whatsapp_templates b
        WHERE lower(trim(a.meta_name)) = lower(trim(b.meta_name))
          AND a.meta_name IS NOT NULL
          AND a.id > b.id;
      `);
    } catch (e) {
      console.error(
        "[comunicacoes.server] Falha ao deduplicar whatsapp_templates.meta_name:",
        mensagemErroPostgres(e),
      );
    }

    try {
      await d.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_templates_meta_name
          ON whatsapp_templates (meta_name);
      `);
    } catch (e) {
      // Este passo é justamente o que falha com 23505 quando sobrou duplicata:
      // o motivo (violação de unicidade) precisa aparecer.
      console.error(
        "[comunicacoes.server] Falha ao criar o índice único de meta_name:",
        mensagemErroPostgres(e),
      );
    }

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
        template_id uuid REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
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

    // 5.1 Referência de template: SET NULL ao excluir.
    // A FK original não tinha ação de delete, então excluir um template usado
    // por uma campanha quebrava com violação de chave estrangeira (SQLSTATE
    // 23503). Recria a constraint com ON DELETE SET NULL — de forma
    // idempotente, para valer tanto em tabelas novas quanto nas já existem.
    //
    // DROP e ADD precisam ser o MESMO comando: feitos em duas chamadas
    // separadas, duas requisições simultâneas faziam as duas o DROP e as duas
    // o ADD, e a segunda ADD falhava com 'constraint
    // whatsapp_campanhas_template_id_fkey ... already exists' — oito vezes
    // numa única noite. O DO $$ abaixo confere pg_constraint e só recria o
    // que falta, dentro de uma transação (o bloco DO já é atômico).
    //
    // A conferência é pelo COMPORTAMENTO, não pelo nome: `confdeltype = 'n'`
    // significa NO ACTION (a FK antiga, que não tinha ON DELETE). Se a
    // constraint existe mas ainda está sem SET NULL, ela precisa ser trocada
    // — e a troca só acontece com o lock da tabela, dentro do mesmo bloco.
    try {
      await d.execute(sql`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'whatsapp_campanhas_template_id_fkey'
              AND conrelid = 'whatsapp_campanhas'::regclass
              AND confdeltype = 'n'
          ) THEN
            LOCK TABLE whatsapp_campanhas IN ACCESS EXCLUSIVE MODE;
            ALTER TABLE whatsapp_campanhas
              DROP CONSTRAINT whatsapp_campanhas_template_id_fkey;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'whatsapp_campanhas_template_id_fkey'
              AND conrelid = 'whatsapp_campanhas'::regclass
          ) THEN
            ALTER TABLE whatsapp_campanhas
              ADD CONSTRAINT whatsapp_campanhas_template_id_fkey
              FOREIGN KEY (template_id) REFERENCES whatsapp_templates(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);
    } catch (e) {
      if (process.env["NODE_ENV"] === "development")
        console.error(
          "[comunicacoes.server] Falha ao ajustar a FK de template da campanha:",
          mensagemErroPostgres(e),
        );
    }

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
    await passoOpcional("a coluna variaveis das mensagens", () =>
      d.execute(sql`
      ALTER TABLE whatsapp_mensagens
        ADD COLUMN IF NOT EXISTS variaveis jsonb DEFAULT '{}'::jsonb;
    `),
    );

    // 6b. Fila de disparo: o estado do worker em coluna separada do status de
    // entrega. O webhook da Meta grava 'DELIVERED'/'READ'/'FAILED' em `status`,
    // que antes era o mesmo campo da fila — os dois vocabulários se atropelavam.
    await passoOpcional("as colunas da fila de disparo", () =>
      d.execute(sql`
      ALTER TABLE whatsapp_mensagens
        ADD COLUMN IF NOT EXISTS estado_fila text DEFAULT 'PENDENTE',
        ADD COLUMN IF NOT EXISTS reservada_em timestamptz,
        ADD COLUMN IF NOT EXISTS reservada_por text,
        ADD COLUMN IF NOT EXISTS tentativas int DEFAULT 0,
        ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz,
        ADD COLUMN IF NOT EXISTS origem text,
        ADD COLUMN IF NOT EXISTS contato_marketing_id uuid;
    `),
    );

    // Conversão única do que já existia. `enviado_em` preenchido é o sinal mais
    // confiável de que a mensagem saiu: `status` pode ter sido sobrescrito pelo
    // webhook para DELIVERED/READ, apagando o vestígio de NA_FILA.
    await passoOpcional("a conversão da fila para ENVIADA", () =>
      d.execute(sql`
      UPDATE whatsapp_mensagens SET estado_fila = 'ENVIADA'
      WHERE estado_fila = 'PENDENTE' AND enviado_em IS NOT NULL;
    `),
    );

    // O worker só enxerga mensagens prontas, e a ordem é por campanha + retry.
    await passoOpcional("o índice da fila de disparo", () =>
      d.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_wa_mensagens_fila
      ON whatsapp_mensagens (campanha_id, proxima_tentativa_em)
      WHERE estado_fila = 'PENDENTE';
    `),
    );

    // Segunda barreira contra envio duplicado: o mesmo telefone não entra duas
    // vezes na mesma campanha.
    //
    // Este índice NÃO era opcional: os INSERT da fila (`popularFilaCampanha` e
    // `criarCampanhaGrupos`) usam `ON CONFLICT (campanha_id, telefone)`, e o
    // Postgres recusa a cláusula com "there is no unique or exclusion
    // constraint matching the ON CONFLICT specification" quando a restrição
    // não existe. Sem o índice, a fila nasce vazia e nada é disparado.
    //
    // Pior: a criação do índice falhava com "could not create unique index ...
    // duplicate key value" sempre que existissem duas mensagens do mesmo
    // telefone na mesma campanha — e essa criação NÃO era isolada, então
    // abortava o esquema inteiro, derrubando templates, logs, teste e disparo
    // de uma vez. Por isso: (1) deduplica antes, (2) isola a criação.
    await passoOpcional("a deduplicação de (campanha_id, telefone)", () =>
      d.execute(sql`
        DELETE FROM whatsapp_mensagens m
        WHERE m.id IN (
          SELECT id FROM (
            SELECT id,
              row_number() OVER (
                PARTITION BY campanha_id, telefone
                ORDER BY
                  -- mantém a linha mais avançada: a que já saiu da fila
                  CASE WHEN estado_fila IS DISTINCT FROM 'PENDENTE' THEN 0 ELSE 1 END,
                  -- entre as equivalentes, a mais antiga (a fila é ordenada por
                  -- horário de saída, então a antiga já está no roteiro)
                  criado_em ASC NULLS LAST,
                  id ASC
              ) AS rn
            FROM whatsapp_mensagens
            -- campanha_id IS NULL é o histórico de conversa, não fila de
            -- campanha: nunca entra na deduplicação.
            WHERE campanha_id IS NOT NULL
          ) t WHERE t.rn > 1
        );
      `),
    );
    await passoOpcional("o índice único de (campanha_id, telefone)", () =>
      d.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_mensagens_telefone
      ON whatsapp_mensagens (campanha_id, telefone);
    `),
    );

    // 6c. Janela de trabalho e ritmo de envio por campanha.
    await passoOpcional("as colunas de janela e ritmo da campanha", () =>
      d.execute(sql`
      ALTER TABLE whatsapp_campanhas
        ADD COLUMN IF NOT EXISTS janela_inicio time,
        ADD COLUMN IF NOT EXISTS janela_fim time,
        ADD COLUMN IF NOT EXISTS intervalo_minutos int DEFAULT 5,
        ADD COLUMN IF NOT EXISTS segmento_id uuid REFERENCES whatsapp_segmentos(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS origem_publico text DEFAULT 'AMBOS',
        ADD COLUMN IF NOT EXISTS ultimo_envio_em timestamptz;
    `),
    );

    // 6f. Mapeamento de variáveis do template ({{1}} -> veiculo.marca etc).
    // Campanha de mensagem geral usa {} — o campo é obrigatório no INSERT.
    await passoOpcional("o mapeamento de variáveis da campanha", () =>
      d.execute(sql`
      ALTER TABLE whatsapp_campanhas
        ADD COLUMN IF NOT EXISTS mapeamento_variaveis jsonb DEFAULT '{}'::jsonb;
    `),
    );

    // 6e. Canal de envio: por quem a mensagem sai.
    //   META    = template oficial pelo serviço da Meta (caminho original).
    //   UAZAPI  = conexão nova da Uazapi — a única rota que aceita grupo, já
    //            que a Meta não processa template enviado para @g.us.
    // `grupos_alvo` só existe para UAZAPI: são os ids "120363...@g.us".
    await passoOpcional("as colunas de canal de envio da campanha", () =>
      d.execute(sql`
      ALTER TABLE whatsapp_campanhas
        ADD COLUMN IF NOT EXISTS canal_envio text DEFAULT 'META',
        ADD COLUMN IF NOT EXISTS grupos_alvo jsonb DEFAULT '[]'::jsonb;
    `),
    );

    // 6g. Imagem do cabeçalho da campanha.
    // O template é que carrega a mídia por padrão, mas a campanha precisa
    // poder trocar a imagem sem alterar o template aprovado (a Meta não deixa
    // editar um template já aprovado). Guardamos a referência aqui e o motor
    // prefere a da campanha, caindo na do template quando vazia.
    await passoOpcional("as colunas de midia da campanha", () =>
      d.execute(sql`
      ALTER TABLE whatsapp_campanhas
        ADD COLUMN IF NOT EXISTS midia_id text,
        ADD COLUMN IF NOT EXISTS midia_tipo text,
        ADD COLUMN IF NOT EXISTS midia_nome text,
        ADD COLUMN IF NOT EXISTS midia_arquivo_id uuid;
    `),
    );

    // 6d. Lote importado: guarda de onde veio cada contato, para a tela mostrar
    // qual lista foi carregada e quando.
    await passoOpcional("a tabela de lotes de contato", () =>
      d.execute(sql`
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
    `),
    );

    // 7. Logs de Auditoria
    await passoOpcional("a tabela de logs de auditoria", () =>
      d.execute(sql`
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
    `),
    );

    await passoOpcional("a coluna de acao dos logs", () =>
      d.execute(sql`
      ALTER TABLE whatsapp_logs
        ADD COLUMN IF NOT EXISTS acao text;
    `),
    );

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
        // Este SQL é enviado AVULSO (fora de bloco DO), então a aspa simples
        // do DEFAULT vai como é: `DEFAULT 'PF'`. Dobrar a aspa aqui — como se
        // fosse um DO $$ ... $$ — produzia `DEFAULT ''PF''`, que o Postgres
        // lia como string vazia seguida do identificador PF e devolvia
        // "syntax error at or near PF" a cada chamada.
        await d.execute(
          sql.raw(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ${name} ${type};`),
        );
      } catch (e) {
        if (process.env["NODE_ENV"] === "development")
          console.error(
            `Erro ao adicionar coluna ${name} em profiles:`,
            mensagemErroPostgres(e),
          );
      }
    }

    if (!silent && process.env["NODE_ENV"] === "development")
      console.log("[comunicacoes.server] Tabelas OK.");
  } catch (err) {
    console.error(
      "[comunicacoes.server] Erro ao garantir tabelas:",
      mensagemErroPostgres(err),
    );
    throw err;
  }
}

// Functions to be implemented
export async function getWhatsappConfig() {
  // A inicialização do servidor pode ocorrer depois da primeira chamada server-side.
  // Garanta a tabela antes da leitura para não falhar com "relation does not exist".
  await ensureComunicacoesSchema();
  return await lerWhatsappConfig();
}

/**
 * A deduplicação e a leitura da linha de configuração foram movidas para
 * `whatsapp-config.server.ts`: o serviço da Meta (`metaService.init()`) precisa
 * ler EXATAMENTE a mesma linha que a tela lê, senão salvar funciona mas a
 * Meta responde "WABA ID não configurado".
 */
export async function updateWhatsappConfig(config: any) {
  const d = requireDb();
  await ensureComunicacoesSchema();
  await curarConfigDuplicada(d);
  await d.execute(sql`
    INSERT INTO whatsapp_config (id)
    SELECT gen_random_uuid()
    WHERE NOT EXISTS (SELECT 1 FROM whatsapp_config);
  `);
  // A versão digitada pelo admin ("v26", "V26.0", "26.0") é normalizada para
  // o formato canônico antes de gravar. Sem isso, um "v26" caía fora da lista
  // de versões suportadas e era descartado na leitura — o admin via a tela
  // dizer "salvou", mas o valor nunca era aceito.
  const versaoInformada = normalizarVersaoGraph(config.graph_api_version);
  const res = await d.execute(sql`
    UPDATE whatsapp_config SET
      waba_id = COALESCE(${config.waba_id ?? null}, waba_id),
      phone_number_id = COALESCE(${config.phone_number_id ?? null}, phone_number_id),
      business_id = COALESCE(${config.business_id ?? null}, business_id),
      phone_number = COALESCE(${config.phone_number ?? null}, phone_number),
      app_id = COALESCE(${config.app_id ?? null}, app_id),
      app_secret = COALESCE(${config.app_secret ?? null}, app_secret),
      access_token = COALESCE(${config.access_token ?? null}, access_token),
      graph_api_version = COALESCE(${versaoInformada || null}, graph_api_version),
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

/**
 * Remove o registro local do template.
 *
 * A comparação é por `lower(trim(meta_name))`, e não pelo texto exato: a
 * sincronização grava o nome como a Meta devolve, e o wizard do admin grava
 * com a grafia que o usuário digitou. Com o nome exato, um template que
 * diferisse só em caixa ou espaço sobrava na tela depois de uma exclusão
 * "certa" na Meta — o admin via o erro "Invalid parameter" e o template
 * continuava listado.
 */
export async function excluirTemplateLocal(metaName: string) {
  const d = requireDb();
  await garantirTabelas();

  // Desreferencia antes de apagar: com ON DELETE SET NULL o banco já resolve,
  // mas garantir aqui deixa o resultado explícito (e protege o caso de uma
  // constraint antiga ainda sem a ação de delete).
  // Cada UPDATE é tolerante: a tabela pode não existir ainda nesta base.
  const desreferenciar = async (tabela: "whatsapp_campanhas" | "whatsapp_automacoes") => {
    try {
      // A tabela de automações é criada por outro módulo, de forma preguiçosa:
      // referenciá-la antes de existir gerava "relation
      // "whatsapp_automacoes" does not exist" no log do Postgres a cada
      // exclusão. Conferir a existência ANTES evita o erro — e evita
      // interpolar o nome dentro de um bloco dollar-quoted, onde um "$$" no
      // texto quebraria a query.
      if (tabela === "whatsapp_automacoes") {
        const existe = await d.execute(sql`SELECT to_regclass('whatsapp_automacoes') AS t`);
        const t = (rowsOf(existe) as any[])[0]?.t;
        if (!t) return;
      }

      await d.execute(sql`
        UPDATE ${sql.identifier(tabela)}
        SET template_id = NULL
        WHERE template_id IN (
          SELECT id FROM whatsapp_templates
          WHERE lower(trim(meta_name)) = lower(trim(${metaName}))
        )
      `);
    } catch {
      // Sem a tabela (ou sem a coluna) não há o que desreferenciar.
    }
  };
  await desreferenciar("whatsapp_campanhas");
  await desreferenciar("whatsapp_automacoes");

  try {
    const res = await d.execute(sql`
      DELETE FROM whatsapp_templates
      WHERE lower(trim(meta_name)) = lower(trim(${metaName}))
      RETURNING id
    `);
    return { ok: true, removido: (rowsOf(res) as any[]).length > 0 };
  } catch (e) {
    // Ainda assim pode sobrar referência (outra constraint). Devolve uma
    // mensagem em português em vez do SQLSTATE cru.
    const msg = mensagemErroPostgres(e);
    if (msg.includes("23503") || /foreign key/i.test(msg))
      return {
        ok: false,
        removido: false,
        erro:
          "Este template está em uso por uma campanha ou automação e não pode ser excluído.",
      };
    throw e;
  }
}

export async function listarTemplates() {
  const d = requireDb();
  // As tabelas do módulo são criadas em tempo de execução, fora das migrações
  // do Drizzle. Sem garantir antes de ler, uma base onde o passo de criação
  // falhou devolve "Failed query: SELECT * FROM whatsapp_templates ..." — sem
  // dizer que a tabela não existe.
  await garantirTabelas();
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
  await garantirTabelas();
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
  // As colunas `whatsapp_status` e `pode_receber_comunicacoes` da tabela
  // `profiles` também são criadas por este passo — sem ele a consulta morre
  // com 42703 (coluna não existe).
  await garantirTabelas();
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
  await garantirTabelas();
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
  await garantirTabelas();
  const res = await d.execute(sql`
    SELECT * FROM whatsapp_webhook_logs
    ORDER BY criado_em DESC
    LIMIT 50
  `);
  return rowsOf(res) || [];
}

/**
 * Log só da sincronização de templates.
 *
 * A aba "Logs" geral é dominada pelos eventos do webhook e do motor de
 * disparo — que são dezenas de linhas por minuto. A sincronização, que roda
 * sob demanda, ficava soterrada nela, e o admin não via a passagem que
 * falhou. Aqui a leitura é filtrada pela própria operação, então a aba
 * Templates mostra exatamente o que a Meta respondeu na última sincronização.
 */
export async function getLogsSincronizacao(operacao = "SINCRONIZAR_TEMPLATES") {
  const d = requireDb();
  await garantirTabelas();
  const res = await d.execute(sql`
    SELECT * FROM whatsapp_webhook_logs
    WHERE event_type = ${operacao}
    ORDER BY criado_em DESC
    LIMIT 30
  `);
  return rowsOf(res) || [];
}

export async function getIndicadoresComunicacoes() {
  const d = requireDb();
  await garantirTabelas();
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
    // "Só novos" precisa chegar à contagem do mesmo jeito que chega à fila:
    // sem isso a tela mostra 200 e o motor enfileira 140.
    apenasNaoEnviados: filtros?.apenasNaoEnviados ?? filtros?.apenas_nao_enviados ?? null,
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
    contatoIds: (data as any).contato_ids ?? data.filtros?.contatoIds ?? null,
    mapeamento: data.mapeamento_variaveis ?? {},
    apenasNaoEnviados:
      (data as any).apenas_nao_enviados ?? data.filtros?.apenasNaoEnviados ?? null,
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
      m.criado_em,
      -- "Já recebeu antes": existe outra mensagem ENVIADA para o mesmo
      -- telefone em outra campanha. É o que a tela usa para mostrar, na
      -- frente do contato, se ele já foi alcançado antes.
      EXISTS (
        SELECT 1 FROM whatsapp_mensagens m2
        WHERE m2.telefone = m.telefone
          AND m2.campanha_id <> m.campanha_id
          AND m2.estado_fila = 'ENVIADA'
      ) AS ja_recebeu_antes
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
  await processarDisparo();

  // O resumo do motor é global (todas as campanhas em processamento). Para a
  // tela poder falar a verdade sobre *esta* campanha, o contador vem do
  // próprio banco: quantos contactos saíram, quantos falharam e quantos ainda
  // estão na fila.
  const cont = await d.execute(sql`
    SELECT
      count(*) FILTER (WHERE estado_fila = 'ENVIADA') AS enviados,
      count(*) FILTER (WHERE estado_fila = 'FALHOU') AS falhas,
      count(*) FILTER (WHERE estado_fila = 'IGNORADA') AS ignoradas,
      count(*) FILTER (WHERE estado_fila = 'PENDENTE') AS pendentes
    FROM whatsapp_mensagens
    WHERE campanha_id = ${campanhaId}::uuid
  `);
  const c = rowsOf(cont)[0] ?? {};
  return {
    enviados: Number(c.enviados ?? 0),
    falhas: Number(c.falhas ?? 0),
    ignoradas: Number(c.ignoradas ?? 0),
    pendentes: Number(c.pendentes ?? 0),
  };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
export function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
