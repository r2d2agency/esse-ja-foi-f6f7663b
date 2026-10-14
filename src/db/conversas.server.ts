import { sql } from "drizzle-orm";
import { db } from "./index";

export async function ensureConversasSchema(silent = true) {
  if (!db) return;

  // 0. `telefone` é NOT NULL (herdado da tabela de campanhas) mas o envio
  // do atendente não o preenche. Sem este DROP todo INSERT de mensagem
  // enviada falha com not-null violation antes mesmo de chegar ao
  // ON CONFLICT (meta_message_id) — a mensagem ia para o WhatsApp mas
  // nunca aparecia no chat. Roda sempre para garantir que tabelas já
  // existentes também perdem o NOT NULL.
  try {
    await db.execute(sql`
      ALTER TABLE whatsapp_mensagens ALTER COLUMN telefone DROP NOT NULL;
    `);
  } catch (err) {
    console.error("[conversas.server] ERRO ao remover NOT NULL de telefone:", err);
  }

  // Cada passo roda em seu próprio try/catch. Antes, o CREATE TABLE era a
  // primeira instrução dentro de um único try, então qualquer falha derrubava
  // TODAS as seguintes — inclusive o `ALTER TABLE whatsapp_mensagens`, sem o
  // qual nenhuma mensagem recebidora recebe conversa_id. Assim, uma única falha
  // no boot deixava o sistema inteiro mudo.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_conversas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contato_id uuid REFERENCES profiles(id),
        status text DEFAULT 'NOVA', -- NOVA, EM_ATENDIMENTO, AGUARDANDO_CLIENTE, RESOLVIDA, ARQUIVADA
        prioridade text DEFAULT 'NORMAL', -- NORMAL, ALTA, URGENTE
        responsavel_id uuid REFERENCES profiles(id),
        equipe_id uuid, -- Referência futura a equipes
        ultimo_evento_em timestamptz DEFAULT now(),
        ultima_mensagem_preview text,
        nao_lidas integer DEFAULT 0,
        contexto_veiculo_id uuid REFERENCES anuncios_veiculo(id),
        contexto_negociacao_id uuid, -- Referência a negociações
        etiquetas jsonb DEFAULT '[]'::jsonb,
        apelido text,
        janela_expira_em timestamptz,
        ultima_resposta_cliente_em timestamptz,
        criado_em timestamptz DEFAULT now(),
        atualizado_em timestamptz DEFAULT now()
      );
    `);
  } catch (err) {
    // O CREATE TABLE é atômico: se qualquer FK não resolve (profiles ou
    // anuncios_veiculo ainda não criados), o Postgres descarta a tabela inteira
    // e devolve "relation does not exist". A tabela só é criada aqui — falhar
    // aqui é o que estava deixando o menu Conversas vazio.
    console.error("[conversas.server] ERRO ao criar whatsapp_conversas:", err);
  }

  try {
    await db.execute(sql`
      ALTER TABLE whatsapp_conversas
        ADD COLUMN IF NOT EXISTS contato_id uuid REFERENCES profiles(id),
        ADD COLUMN IF NOT EXISTS apelido text,
        ADD COLUMN IF NOT EXISTS janela_expira_em timestamptz,
        ADD COLUMN IF NOT EXISTS ultima_resposta_cliente_em timestamptz;
    `);
  } catch (err) {
    console.error("[conversas.server] ERRO ao alterar whatsapp_conversas:", err);
  }

  try {
    // processarMensagemRecebida grava profiles.whatsapp_status ATIVO ao dar
    // entrada em um numero desconhecido. Sem esta coluna o INSERT estoura
    // (a tabela e criada em auth.server.ts sem ela) e nenhuma conversa nasce.
    await db.execute(sql`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS whatsapp_status text DEFAULT 'ATIVO';
    `);
  } catch (err) {
    console.error("[conversas.server] ERRO ao adicionar profiles.whatsapp_status:", err);
  }

  // 2. Tabela de Mensagens e Notas
  // Nota: Reutiliza whatsapp_mensagens mas adiciona campos para notas internas e auditoria
  try {
    await db.execute(sql`
      ALTER TABLE whatsapp_mensagens
        ADD COLUMN IF NOT EXISTS conversa_id uuid REFERENCES whatsapp_conversas(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'MENSAGEM',
        ADD COLUMN IF NOT EXISTS autor_id uuid REFERENCES profiles(id),
        ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS enviado_por_atendente boolean DEFAULT false,
        -- Midia: media_id e o id que a Meta devolve no upload e e o que a
        -- tela usa para reenviar; media_url e a copia local em
        -- arquivos_upload, que continua acessivel depois que a Meta expira o
        -- id dela (30 dias).
        ADD COLUMN IF NOT EXISTS tipo_midia text,
        ADD COLUMN IF NOT EXISTS media_id text,
        ADD COLUMN IF NOT EXISTS media_url text,
        ADD COLUMN IF NOT EXISTS arquivo_id uuid;
    `);
  } catch (err) {
    // Sem `conversa_id` em whatsapp_mensagens toda mensagem gravada fica
    // órfã: não aparece em nenhuma conversa e o histórico da tela fica vazio.
    console.error("[conversas.server] ERRO ao alterar whatsapp_mensagens:", err);
  }

  // 2b. `telefone` é NOT NULL (herdado da tabela de campanhas) mas o envio
  // do atendente não o preenche. Sem este DROP todo INSERT de mensagem
  // enviada falha com not-null violation antes mesmo de chegar ao
  // ON CONFLICT (meta_message_id) — a mensagem ia para o WhatsApp mas
  // nunca aparecia no chat.
  try {
    await db.execute(sql`
      ALTER TABLE whatsapp_mensagens ALTER COLUMN telefone DROP NOT NULL;
    `);
  } catch (err) {
    console.error("[conversas.server] ERRO ao remover NOT NULL de telefone:", err);
  }

  // 3. Tabela de respostas rápidas
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_respostas_prontas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        escopo text NOT NULL DEFAULT 'GLOBAL', -- GLOBAL | ATENDENTE
        atendente_id uuid REFERENCES profiles(id),
        atalho text NOT NULL,
        titulo text,
        conteudo text NOT NULL,
        criado_em timestamptz DEFAULT now(),
        atualizado_em timestamptz DEFAULT now()
      );
    `);
  } catch (err) {
    console.error("[conversas.server] ERRO ao criar whatsapp_respostas_prontas:", err);
  }

  // 4. Índices para busca
  try {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_conversas_contato ON whatsapp_conversas(contato_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON whatsapp_mensagens(conversa_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_respostas_prontas_escopo ON whatsapp_respostas_prontas(escopo, atendente_id)`,
    );
  } catch (err) {
    // Índice ausente não quebra nada: só deixa a lista lenta com muitas linhas.
    console.error("[conversas.server] ERRO ao criar índices:", err);
  }

  // 5. Reparo: quem tem mensagem do cliente mas está sem `janela_expira_em`.
  //
  // Antes desta correção a conversa nascia sem a coluna preenchida e só o UPDATE
  // seguinte a salvava — quando esse UPDATE rodava. As que ficaram com NULL
  // apareciam "Janela fechada — apenas templates" com o cliente tendo acabado
  // de escrever, que é o sintoma errado: a janela mede inatividade do cliente,
  // então basta a existência de mensagem recebida para ela estar aberta.
  //
  // Idempotente: só mexe em linha com `janela_expira_em` nula, e o COALESCE
  // usa a última mensagem recebida como referência.
  try {
    await db.execute(sql`
      UPDATE whatsapp_conversas c
      SET janela_expira_em = COALESCE(
        (SELECT max(m.criado_em) FROM whatsapp_mensagens m
         WHERE m.conversa_id = c.id AND m.enviado_por_atendente = false),
        c.ultima_resposta_cliente_em,
        c.criado_em
      ) + interval '24 hours'
      WHERE c.janela_expira_em IS NULL
        AND EXISTS (
          SELECT 1 FROM whatsapp_mensagens m
          WHERE m.conversa_id = c.id AND m.enviado_por_atendente = false
        )
    `);
  } catch (err) {
    // Reparo que falha não pode impedir o boot — o COALESCE nas leituras já
    // trata a coluna nula.
    console.error("[conversas.server] ERRO no reparo de janela_expira_em:", err);
  }
}

export async function listarConversas(filtros: any) {
  if (!db) return [];

  // A UI envia os rótulos em português ('Todas', 'Não lidas', 'Resolvidas'),
  // enquanto o banco guarda 'TODAS'/'NAO_LIDAS'/'RESOLVIDA'. Sem este mapeamento
  // o 'Todas' inicial virava `AND c.status = 'Todas'` e a lista voltava vazia.
  const statusBanco: Record<string, string> = {
    Todas: "TODAS",
    "Não lidas": "NAO_LIDAS",
    NOVA: "NOVA",
    EM_ATENDIMENTO: "EM_ATENDIMENTO",
    AGUARDANDO_CLIENTE: "AGUARDANDO_CLIENTE",
    RESOLVIDAS: "RESOLVIDA",
  };

  const statusNorm = statusBanco[filtros.status as string] ?? filtros.status;

  const filtrosNorm = {
    ...filtros,
    status: statusNorm,
  };

  let query = sql`
    SELECT c.id, c.contato_id, c.status, c.prioridade, c.responsavel_id,
           c.ultimo_evento_em, c.nao_lidas, c.apelido, c.janela_expira_em,
           c.ultima_resposta_cliente_em, c.etiquetas, c.contexto_negociacao_id,
           c.contexto_veiculo_id, c.criado_em, c.ultima_mensagem_preview,
           p.nome as contato_nome, p.telefone as contato_telefone, p.role as contato_role,
           resp.nome as responsavel_nome,
           (SELECT m.payload
            FROM whatsapp_mensagens m
            WHERE m.conversa_id = c.id
            ORDER BY m.criado_em DESC LIMIT 1) as ultima_mensagem_payload,
           (SELECT m.tipo_midia
            FROM whatsapp_mensagens m
            WHERE m.conversa_id = c.id
            ORDER BY m.criado_em DESC LIMIT 1) as ultima_mensagem_tipo_midia,
           (SELECT m.tipo
            FROM whatsapp_mensagens m
            WHERE m.conversa_id = c.id
            ORDER BY m.criado_em DESC LIMIT 1) as ultima_mensagem_tipo,
           (SELECT m.enviado_por_atendente
            FROM whatsapp_mensagens m
            WHERE m.conversa_id = c.id
            ORDER BY m.criado_em DESC LIMIT 1) as ultima_direcao_atendente,
           -- A janela é de INATIVIDADE do cliente: 24h desde a última mensagem
           -- dele. Contar de outra coisa (ex.: do início do atendimento) fechava
           -- a janela de conversas que o cliente tinha acabado de abrir.
           -- COALESCE cobre as conversas antigas, criadas antes de a coluna
           -- janela_expira_em passar a ser gravada junto com a mensagem.
           (COALESCE(c.janela_expira_em, c.ultima_resposta_cliente_em + interval '24 hours', c.criado_em + interval '24 hours') > now()) as janela_aberta
    FROM whatsapp_conversas c
    LEFT JOIN profiles p ON p.id = c.contato_id
    LEFT JOIN profiles resp ON resp.id = c.responsavel_id
    WHERE 1=1
  `;

  if (filtrosNorm.status && filtrosNorm.status !== "TODAS") {
    if (filtrosNorm.status === "NAO_LIDAS") {
      query = sql`${query} AND c.nao_lidas > 0`;
    } else {
      query = sql`${query} AND c.status = ${filtrosNorm.status}`;
    }
  }

  if (filtrosNorm.responsavel_id) {
    query = sql`${query} AND c.responsavel_id = ${filtrosNorm.responsavel_id}::uuid`;
  }

  if (filtrosNorm.busca) {
    const termo = `%${String(filtrosNorm.busca).toLowerCase()}%`;
    query = sql`${query} AND (
      lower(COALESCE(c.apelido, '')) LIKE ${termo}
      OR lower(COALESCE(p.nome, '')) LIKE ${termo}
      OR lower(COALESCE(p.telefone, '')) LIKE ${termo}
    )`;
  }

  query = sql`${query} ORDER BY c.ultimo_evento_em DESC`;

  const res = await db.execute(query);
  return rowsOf(res) || [];
}

export async function getConversaCompleta(conversaId: string) {
  if (!db) return null;

  const convRes = await db.execute(sql`
    SELECT c.id, c.contato_id, c.status, c.prioridade, c.responsavel_id,
           c.ultimo_evento_em, c.nao_lidas, c.apelido, c.janela_expira_em,
           c.ultima_resposta_cliente_em, c.etiquetas, c.contexto_negociacao_id,
           c.contexto_veiculo_id, c.criado_em, c.atualizado_em,
           p.nome as contato_nome, p.telefone as contato_telefone, p.role as contato_role,
           p.cpf as contato_cpf, p.cnpj as contato_cnpj,
           resp.nome as responsavel_nome,
           -- contexto_veiculo_id aponta para o ANÚNCIO, não para o veículo:
           -- anuncios_veiculo não tem marca/modelo/placa, e era isso que fazia
           -- a query falhar com "column v.marca does not exist".
           vei.marca as veiculo_marca, vei.modelo as veiculo_modelo, vei.placa as veiculo_placa,
           v.id as veiculo_id,
           -- Mesma regra da listagem: janela medida pela inatividade do cliente.
           (COALESCE(c.janela_expira_em, c.ultima_resposta_cliente_em + interval '24 hours', c.criado_em + interval '24 hours') > now()) as janela_aberta
    FROM whatsapp_conversas c
    LEFT JOIN profiles p ON p.id = c.contato_id
    LEFT JOIN profiles resp ON resp.id = c.responsavel_id
    LEFT JOIN anuncios_veiculo v ON v.id = c.contexto_veiculo_id
    LEFT JOIN veiculos vei ON vei.id = v.veiculo_id
    WHERE c.id = ${conversaId}::uuid
  `);

  const conversa = rowsOf(convRes)[0];
  if (!conversa) return null;

  const msgRes = await db.execute(sql`
    SELECT m.id, m.conversa_id, m.autor_id, m.tipo, m.payload, m.status,
           m.meta_message_id, m.criado_em, m.enviado_por_atendente,
           m.entregue_em, m.lido_em, m.metadata,
           p.nome as autor_nome
    FROM whatsapp_mensagens m
    LEFT JOIN profiles p ON p.id = m.autor_id
    WHERE m.conversa_id = ${conversaId}::uuid
    ORDER BY m.criado_em ASC
  `);

  // Zera o contador de não lidas ao abrir a conversa
  await db.execute(sql`
    UPDATE whatsapp_conversas SET nao_lidas = 0 WHERE id = ${conversaId}::uuid
  `);

  return {
    ...conversa,
    mensagens: rowsOf(msgRes) || [],
  };
}

export async function enviarMensagemAtendente(
  conversaId: string,
  atendenteId: string,
  payload: any,
) {
  // Este `return` mudo era o sintoma que o atendente via como "o envio não
  // aconteceu e não apareceu nada": o handler do server function não lançava,
  // não gravava log e não escrevia mensagem — a tela só ficava sem resposta.
  // Agora ele lança, para que o try/catch do server function transforme a falha
  // em erro visível.
  if (!db) throw new Error("Banco de dados indisponível.");

  // Linha de entrada gravada antes de qualquer consulta: se o envio falhar no
  // meio (template não encontrado, janela, recusa da Meta), o log passa a
  // mostrar que a tentativa existiu — antes, só sobravam as linhas que a Meta
  // registrava quando a chamada chegava a sair.
  const inicioEnvio = Date.now();
  try {
    const { registrarLogMeta } = await import("./logs-whatsapp.server");
    await registrarLogMeta({
      direcao: "SAIDA",
      operacao: "ENVIAR_MENSAGEM_ATENDENTE",
      status: "SUCESSO",
      resumo: `Tentativa de envio iniciada (${payload?.tipo || "?"}${
        payload?.template_name ? ` / ${payload.template_name}` : ""
      }).`,
      payload: {
        conversaId,
        tipo: payload?.tipo ?? null,
        template: payload?.template_name ?? null,
      },
      duracaoMs: 0,
    });
  } catch (e) {
    // Falha de log nunca impede o envio.
    console.error("[conversas] falha ao registrar início do envio:", e);
  }

  const { metaService } = await import("./meta-whatsapp.server");

  const convRes = await db.execute(sql`
    SELECT c.contato_id, p.telefone, c.janela_expira_em, c.ultima_resposta_cliente_em, c.criado_em,
           (COALESCE(c.janela_expira_em, c.ultima_resposta_cliente_em + interval '24 hours', c.criado_em + interval '24 hours') > now()) as janela_aberta
    FROM whatsapp_conversas c
    JOIN profiles p ON p.id = c.contato_id
    WHERE c.id = ${conversaId}::uuid
  `);
  const conversa = rowsOf(convRes)[0];

  if (payload.tipo === "NOTA_INTERNA") {
    await db.execute(sql`
      INSERT INTO whatsapp_mensagens (conversa_id, autor_id, tipo, payload, status, enviado_por_atendente)
      VALUES (${conversaId}::uuid, ${atendenteId}::uuid, 'NOTA_INTERNA', ${JSON.stringify(payload.conteudo)}::jsonb, 'ENVIADA', true)
    `);
    return;
  }

  const isTemplate = Boolean(payload.template_name);
  const isTexto = payload.tipo === "TEXTO" || (!isTemplate && payload.conteudo?.text?.body);
  // Imagem, documento e áudio trafegam como média livre e também dependem da
  // janela de 24h. Sem esta lista, um anexo com janela fechada passava pela
  // verificação de texto e a Meta rejeitava com 131047 — erro que não diz
  // nada sobre a janela.
  const isMidia =
    payload.tipo === "IMAGEM" || payload.tipo === "DOCUMENTO" || payload.tipo === "AUDIO";

  // A janela de 24h NÃO bloqueia mais o envio. Ela é uma regra da Meta para
  // texto livre iniciado pelo atendente, e bloquear aqui produzia o sintoma
  // relatado: o cliente escrevia, a conversa aparecia com a janela "fechada"
  // e o atendente não conseguia responder. O envio segue livre; se a Meta
  // recusar por janela, o erro dela chega no log e no retorno do envio.
  void conversa.janela_aberta;

  let resMeta: any;
  let payloadGravado: any;
  let previewTexto = "";
  let tipoMidia: string | null = null;
  let mediaId: string | null = null;
  let mediaUrl: string | null = null;
  let arquivoId: string | null = null;

  if (isTemplate) {
    // Envio por template (funciona fora da janela de 24h)
    const componentes = payload.componentes || [];
    resMeta = await metaService.enviarMensagem(
      conversa.telefone,
      payload.template_name,
      payload.idioma || "pt_BR",
      componentes,
      "ENVIAR_MENSAGEM_ATENDENTE",
    );
    payloadGravado = {
      tipo: "TEMPLATE",
      template_name: payload.template_name,
      idioma: payload.idioma || "pt_BR",
      componentes,
    };
    previewTexto = `Template: ${payload.template_name}`;
  } else if (isMidia) {
    // Mídia: o arquivo já subiu na Meta antes de chegar aqui (a tela chama
    // `enviarMidiaAtendenteFn` só com o media_id), então este ramo só despacha.
    const midia = payload.conteudo ?? {};
    mediaId = midia.media_id ?? null;
    mediaUrl = midia.media_url ?? null;
    arquivoId = midia.arquivo_id ?? null;
    if (!mediaId) throw new Error("Mídia sem identificador. Reenvie o anexo.");

    if (payload.tipo === "IMAGEM") {
      tipoMidia = "IMAGEM";
      resMeta = await metaService.enviarImagem(
        conversa.telefone,
        mediaId,
        midia.caption ?? null,
        "ENVIAR_MENSAGEM_ATENDENTE",
      );
      previewTexto = midia.caption?.trim() ? `📷 ${midia.caption.trim()}` : "📷 Imagem";
    } else if (payload.tipo === "DOCUMENTO") {
      tipoMidia = "DOCUMENTO";
      resMeta = await metaService.enviarDocumento(
        conversa.telefone,
        mediaId,
        midia.filename ?? null,
        midia.caption ?? null,
        "ENVIAR_MENSAGEM_ATENDENTE",
      );
      previewTexto = `📄 ${midia.filename || "Documento"}`;
    } else {
      tipoMidia = "AUDIO";
      resMeta = await metaService.enviarAudio(
        conversa.telefone,
        mediaId,
        "ENVIAR_MENSAGEM_ATENDENTE",
      );
      previewTexto = "🎤 Áudio";
    }

    payloadGravado = { tipo: payload.tipo, ...midia };
  } else {
    // Envio de texto livre
    const texto = payload.conteudo.text.body;
    resMeta = await metaService.enviarTexto(conversa.telefone, texto, "ENVIAR_MENSAGEM_ATENDENTE");
    payloadGravado = {
      tipo: "TEXTO",
      text: { body: texto },
    };
    previewTexto = texto;
  }

  // `tipo_midia` fora do JSON: a tela filtra por ele sem precisar descer no
  // payload, e o id/url do anexo ficam à mão para reenvio e para o histórico
  // depois que a Meta expira o media_id dela.
  //
  // `ON CONFLICT (meta_message_id) DO NOTHING`: a Meta aceita a mensagem e
  // devolve o wamid, mas o INSERT estourava a restrição UNIQUE quando esse
  // wamid já existia — o que tornava impossível enviar a SEGUNDA mensagem de
  // qualquer conversa. A linha não era gravada, o UPDATE abaixo rodava mesmo
  // assim, e a conversa ficava com o preview atualizado e o thread vazio:
  // exatamente o sintoma de "a mensagem foi enviada mas não aparece no chat".
  // `DO NOTHING` transforma a reentrega em sucesso: a mensagem já está
  // registrada, então a conversa já tem o que mostrar.
  const wamid = resMeta.messages?.[0]?.id ?? null;
  // `telefone` é NOT NULL na tabela (herdado das campanhas) e o envio do
  // atendente não o preenche — sem isso o INSERT morre na validação antes
  // de chegar ao ON CONFLICT. O telefone já foi buscado no SELECT da conversa.
  await db.execute(sql`
    INSERT INTO whatsapp_mensagens (conversa_id, telefone, autor_id, tipo, payload, meta_message_id, status, metadata, enviado_por_atendente, tipo_midia, media_id, media_url, arquivo_id)
    VALUES (
      ${conversaId}::uuid,
      ${conversa.telefone ?? null},
      ${atendenteId}::uuid,
      'MENSAGEM',
      ${JSON.stringify(payloadGravado)}::jsonb,
      ${wamid},
      'ENVIADA',
      '{"origem": "ATENDENTE"}'::jsonb,
      true,
      ${tipoMidia ? `'${tipoMidia}'` : null},
      ${mediaId ? `'${mediaId}'` : null},
      ${mediaUrl ? `'${mediaUrl}'` : null},
      ${arquivoId ? `${arquivoId}::uuid` : null}
    )
    ON CONFLICT (meta_message_id) DO NOTHING
    RETURNING id
  `);

  // O preview só pode avançar quando a linha realmente entrou. Sem esta
  // checagem, um conflito de wamid atualizava o preview de uma mensagem que
  // não foi gravada — a lista mostrava um texto que o thread não tinha.
  const gravou = wamid
    ? rowsOf(
        await db.execute(sql`
        SELECT 1 FROM whatsapp_mensagens
        WHERE conversa_id = ${conversaId}::uuid AND meta_message_id = ${wamid}
        LIMIT 1
      `),
      ).length > 0
    : true;

  if (gravou) {
    await db.execute(sql`
      UPDATE whatsapp_conversas SET
        ultimo_evento_em = now(),
        ultima_mensagem_preview = ${previewTexto},
        status = 'AGUARDANDO_CLIENTE'
      WHERE id = ${conversaId}::uuid
    `);
  }
}

/**
 * A Meta entrega cada tipo de mídia numa forma diferente: texto tem
 * `text.body`, imagem/áudio/documento têm um objeto com `id` e a tela só
 * soube ler `text.body` — áudio, documento e localização apareciam como
 * "Arquivo recebido". Aqui o payload vira um formato único, e o que não
 * reconhecemos segue gravado em `raw` para não perder nada.
 */
export function normalizarPayloadRecebido(msg: any): any {
  if (!msg || typeof msg !== "object") return { tipo: "DESCONHECIDO", raw: msg };

  // O identificador que a Meta dá a cada mensagem (`wa_id`), gravado junto do
  // payload normalizado para permitir a checagem de reentrega.
  const base: any = msg.id ? { wa_id: msg.id } : {};

  switch (msg.type) {
    case "text":
      return { ...base, tipo: "TEXTO", text: { body: msg.text?.body ?? "" } };

    case "image":
      return {
        ...base,
        tipo: "IMAGEM",
        image: {
          id: msg.image?.id ?? null,
          caption: msg.image?.caption ?? null,
          mime_type: msg.image?.mime_type ?? null,
          sha256: msg.image?.sha256 ?? null,
        },
      };

    case "video":
      return {
        ...base,
        tipo: "VIDEO",
        video: {
          id: msg.video?.id ?? null,
          caption: msg.video?.caption ?? null,
          mime_type: msg.video?.mime_type ?? null,
          sha256: msg.video?.sha256 ?? null,
        },
      };

    case "audio":
      return {
        ...base,
        tipo: "AUDIO",
        audio: {
          id: msg.audio?.id ?? null,
          mime_type: msg.audio?.mime_type ?? null,
          sha256: msg.audio?.sha256 ?? null,
          voice: Boolean(msg.audio?.voice),
        },
      };

    case "document":
      return {
        ...base,
        tipo: "DOCUMENTO",
        document: {
          id: msg.document?.id ?? null,
          filename: msg.document?.filename ?? null,
          caption: msg.document?.caption ?? null,
          mime_type: msg.document?.mime_type ?? null,
          sha256: msg.document?.sha256 ?? null,
        },
      };

    case "sticker":
      return {
        ...base,
        tipo: "STICKER",
        sticker: {
          id: msg.sticker?.id ?? null,
          mime_type: msg.sticker?.mime_type ?? null,
          animated: Boolean(msg.sticker?.animated),
        },
      };

    case "location":
      return {
        ...base,
        tipo: "LOCALIZACAO",
        location: {
          latitude: msg.location?.latitude ?? null,
          longitude: msg.location?.longitude ?? null,
          name: msg.location?.name ?? null,
          address: msg.location?.address ?? null,
        },
      };

    case "interactive":
      return {
        ...base,
        tipo: "BOTAO",
        interactive: {
          tipo: msg.interactive?.type ?? null,
          corpo: msg.interactive?.body?.text ?? null,
          rodape: msg.interactive?.footer?.text ?? null,
          cabecalho: msg.interactive?.header?.text ?? null,
          botoes: Array.isArray(msg.interactive?.buttons)
            ? msg.interactive.buttons.map((b: any) => ({
                tipo: b.type ?? null,
                texto: b.reply?.title ?? null,
                id: b.reply?.id ?? null,
                url: b.url ?? null,
              }))
            : [],
        },
      };

    case "reaction":
      return {
        ...base,
        tipo: "REACAO",
        reaction: {
          emoji: msg.reaction?.emoji ?? null,
          message_id: msg.reaction?.message_id ?? null,
        },
      };

    case "contacts":
      return {
        ...base,
        tipo: "CONTATO",
        contacts: (msg.contacts ?? []).map((c: any) => ({
          nome: c.name?.formatted_name ?? null,
          telefones: Array.isArray(c.phones) ? c.phones.map((p: any) => p.phone) : [],
        })),
      };

    case "system":
      return {
        ...base,
        tipo: "SISTEMA",
        system: { body: msg.system?.body ?? null, tipo: msg.system?.type ?? null },
      };

    default:
      return { ...base, tipo: String(msg.type || "DESCONHECIDO").toUpperCase(), raw: msg };
  }
}

/** O rótulo curto que a lista de conversas e a bolha mostram para uma mensagem. */
export function previewDeMensagem(normalizado: any): string {
  if (!normalizado) return "";
  switch (normalizado.tipo) {
    case "TEXTO":
      return normalizado.text?.body ?? "";
    case "IMAGEM":
      return normalizado.image?.caption ? `📷 ${normalizado.image.caption}` : "📷 Imagem";
    case "VIDEO":
      return normalizado.video?.caption ? `🎬 ${normalizado.video.caption}` : "🎬 Vídeo";
    case "AUDIO":
      return "🎤 Áudio";
    case "DOCUMENTO":
      return `📄 ${normalizado.document?.filename || "Documento"}`;
    case "STICKER":
      return "Adesivo";
    case "LOCALIZACAO":
      return `📍 ${normalizado.location?.name || "Localização"}`;
    case "BOTAO":
      return normalizado.interactive?.corpo ?? "Interação";
    case "REACAO":
      return `Reagiu ${normalizado.reaction?.emoji ?? ""}`.trim();
    case "CONTATO":
      return "Contato compartilhado";
    case "SISTEMA":
      return normalizado.system?.body ?? "Sistema";
    case "TEMPLATE":
      return normalizado.template_name
        ? `Template: ${normalizado.template_name}`
        : "Arquivo recebido";
    default:
      return "Arquivo recebido";
  }
}

function apenasDigitos(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

export async function processarMensagemRecebida(telefone: string, payload: any) {
  if (!db) return;

  // O payload que a tela lê é o normalizado, não o objeto cru da Meta. O
  // webhook já grava o original em `whatsapp_webhook_logs`.
  const normalizado = normalizarPayloadRecebido(payload);
  const preview = previewDeMensagem(normalizado);

  // Normaliza telefone: a Meta envia no formato internacional (5511999999999)
  // enquanto profiles.telefone pode estar com máscara ((11) 99999-9999).
  // Compara pelos últimos 9 dígitos.
  const digitos = apenasDigitos(telefone);
  const noveDigitos = digitos.slice(-9);

  let resPerfil = await db.execute(sql`
    SELECT id FROM profiles
    WHERE length(regexp_replace(COALESCE(telefone, ''), '\D', '', 'g')) >= 9
      AND right(regexp_replace(telefone, '\D', '', 'g'), 9) = ${noveDigitos}
    LIMIT 1
  `);
  let perfilId = rowsOf(resPerfil)[0]?.id;

  if (!perfilId) {
    // `profiles.email` é NOT NULL UNIQUE, então um contato novo precisa de um
    // endereço sintético. Sem isto o INSERT estoura e nenhuma conversa nasce —
    // e o webhook já gravou 'PROCESSADO' antes, então a falha fica invisível.
    const emailSintetico = `whatsapp_${noveDigitos}@contato.local`;
    const res = await db.execute(sql`
      INSERT INTO profiles (nome, telefone, role, whatsapp_status, email)
      VALUES (
        'Contato não identificado', ${telefone}, 'comprador', 'ATIVO',
        ${emailSintetico}
      )
      ON CONFLICT (email) DO UPDATE SET telefone = EXCLUDED.telefone
      RETURNING id
    `);
    perfilId = rowsOf(res)[0].id;
  }

  // 2. Localizar conversa aberta
  //
  // Sem ORDER BY este SELECT podia devolver a conversa mais ANTIGA do contato, não
  // a ativa. Com isso a mensagem do cliente entrava em uma linha da lista e o
  // atendente abria outra: via a resposta "não aparecer", o thread vazio e a
  // janela fechada na linha em que estava. A lista ordena por
  // ultimo_evento_em DESC, então a conversa que aparece no topo é esta.
  let resConv = await db.execute(sql`
    SELECT id FROM whatsapp_conversas
    WHERE contato_id = ${perfilId}::uuid AND status != 'RESOLVIDA' AND status != 'ARQUIVADA'
    ORDER BY ultimo_evento_em DESC
    LIMIT 1
  `);
  let conversaId = rowsOf(resConv)[0]?.id;

  if (!conversaId) {
    const res = await db.execute(sql`
      INSERT INTO whatsapp_conversas (contato_id, status, ultima_resposta_cliente_em)
      VALUES (${perfilId}::uuid, 'NOVA', now())
      RETURNING id
    `);
    conversaId = rowsOf(res)[0].id;
  }

  // 2b. Idempotência: a Meta reenvia o mesmo evento quando demora a responder ou
  // quando a assinatura falha e a tentativa é repetida. Cada webhook carrega o
  // wa_id da mensagem; se ele já foi gravado, esta é uma reentrega e a linha
  // não pode ser duplicada no thread. `meta_message_id` é UNIQUE, mas a linha
  // é gravada com o ID vindo da Meta no retorno do envio (e NULL aqui), então
  // a checagem explícita é a única que segura a duplicata.
  const waId = payload?.id;
  if (waId) {
    const resExiste = await db.execute(sql`
      SELECT 1 FROM whatsapp_mensagens
      WHERE conversa_id = ${conversaId}::uuid AND payload->>'wa_id' = ${waId}
      LIMIT 1
    `);
    if (rowsOf(resExiste).length > 0) return;
  }

  // 3. Salvar mensagem
  await db.execute(sql`
    INSERT INTO whatsapp_mensagens (conversa_id, telefone, payload, status, tipo, enviado_por_atendente)
    VALUES (${conversaId}::uuid, ${telefone}, ${JSON.stringify(normalizado)}::jsonb, 'RECEBIDA', 'MENSAGEM', false)
  `);

  // 4. Atualizar conversa + reabrir a janela de 24h
  //
  // A janela é medida a partir da ÚLTIMA mensagem do cliente, não do início do
  // atendimento. Por isso `janela_expira_em` é regravada aqui e em todo UPDATE
  // que parta do cliente: enquanto ele escreve, o atendente pode responder
  // texto livre. Fechar nesse caso seria o sintoma que o usuário relatou —
  // "a conversa é gerada pelo cliente e a janela aparece fechada".
  //
  // `ultima_resposta_cliente_em` é a fonte da verdade: gravada agora, ela faz o
  // SELECT abaixo recalcular a janela mesmo que `janela_expira_em` esteja nula
  // (foi o que aconteceu com as conversas criadas antes desta correção).
  await db.execute(sql`
    UPDATE whatsapp_conversas SET
      ultimo_evento_em = now(),
      ultima_mensagem_preview = ${preview || "Mensagem recebida"},
      nao_lidas = nao_lidas + 1,
      status = 'EM_ATENDIMENTO',
      janela_expira_em = now() + interval '24 hours',
      ultima_resposta_cliente_em = now()
    WHERE id = ${conversaId}::uuid
  `);
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

/** Define (ou remove) o apelido de uma conversa. String vazia/NULL remove. */
export async function definirApelido(conversaId: string, apelido: string | null) {
  if (!db) return;
  const valor = apelido?.trim() || null;
  await db.execute(sql`
    UPDATE whatsapp_conversas SET apelido = ${valor} WHERE id = ${conversaId}::uuid
  `);
  return { ok: true as const };
}

/** Marca a conversa como resolvida. */
export async function marcarConversaResolvida(conversaId: string) {
  if (!db) return;
  await db.execute(sql`
    UPDATE whatsapp_conversas SET status = 'RESOLVIDA' WHERE id = ${conversaId}::uuid
  `);
  return { ok: true as const };
}

/** Atribui (ou remove) o responsável pela conversa. */
export async function atribuirResponsavel(conversaId: string, responsavelId: string | null) {
  if (!db) return;
  const valor = responsavelId?.trim() || null;
  await db.execute(sql`
    UPDATE whatsapp_conversas
    SET responsavel_id = ${valor}::uuid, status = CASE WHEN ${valor}::uuid IS NOT NULL THEN 'EM_ATENDIMENTO' ELSE status END
    WHERE id = ${conversaId}::uuid
  `);
  return { ok: true as const };
}

/** Lista respostas rápidas: globais + as do atendente. */
export async function listarRespostasProntas(atendenteId: string | null) {
  if (!db) return [];
  const res = await db.execute(sql`
    SELECT id, escopo, atendente_id, atalho, titulo, conteudo, criado_em
    FROM whatsapp_respostas_prontas
    WHERE escopo = 'GLOBAL' OR atendente_id = ${atendenteId}::uuid
    ORDER BY atalho ASC
  `);
  return rowsOf(res) || [];
}

/** Cria uma resposta rápida pessoal do atendente. */
export async function salvarRespostaPronta(
  atendenteId: string,
  dados: { atalho: string; titulo?: string; conteudo: string; escopo?: string },
) {
  if (!db) return;
  const escopo = dados.escopo === "GLOBAL" ? "GLOBAL" : "ATENDENTE";
  const dono = escopo === "GLOBAL" ? null : atendenteId;
  const res = await db.execute(sql`
    INSERT INTO whatsapp_respostas_prontas (escopo, atendente_id, atalho, titulo, conteudo)
    VALUES (${escopo}, ${dono}::uuid, ${dados.atalho.trim()}, ${dados.titulo?.trim() || null}, ${dados.conteudo})
    RETURNING id
  `);
  return { ok: true as const, id: rowsOf(res)[0]?.id };
}

/** Exclui uma resposta rápida, respeitando o escopo. */
export async function excluirRespostaPronta(id: string, atendenteId: string) {
  if (!db) return;
  await db.execute(sql`
    DELETE FROM whatsapp_respostas_prontas
    WHERE id = ${id}::uuid AND (escopo = 'GLOBAL' OR atendente_id = ${atendenteId}::uuid)
  `);
  return { ok: true as const };
}

/**
 * Contatos que o atendente pode escolher para iniciar uma conversa.
 * Traz perfis com telefone e já indica se já existe conversa aberta com eles —
 * assim a UI evita duplicar atendimento e o atendente clica em quem já fala com ele.
 */
export async function listarContatosDisponiveis(busca?: string | null) {
  if (!db) return [];
  // Busca do atendente costuma vir com máscara e nome — compara pelos dois lados
  // já normalizados, senão "Ana (11)" nunca casa com nada.
  const bruto = busca?.trim();
  const termo = bruto ? `%${bruto.toLowerCase()}%` : null;
  const digitos = bruto ? apenasDigitos(bruto) : null;

  const res = await db.execute(sql`
    SELECT p.id, p.nome, p.telefone, p.role,
           (SELECT c.id FROM whatsapp_conversas c
            WHERE c.contato_id = p.id
              AND c.status != 'RESOLVIDA' AND c.status != 'ARQUIVADA'
            ORDER BY c.ultimo_evento_em DESC LIMIT 1) as conversa_aberta_id
    FROM profiles p
    WHERE p.telefone IS NOT NULL
      AND length(regexp_replace(p.telefone, '\D', '', 'g')) >= 10
      AND (
        ${termo} IS NULL
        OR lower(COALESCE(p.nome, '')) LIKE ${termo}
        OR regexp_replace(p.telefone, '\D', '', 'g') LIKE ${`%${digitos || ""}%`}
      )
    ORDER BY p.nome ASC
    LIMIT 50
  `);
  const lista = rowsOf(res) || [];

  // Acabou de cadastrar? O contato sobe para o topo, senão ele aterra no fim
  // da lista (ou fora dela, se já houver 50 perfis) e o atendente não acha.
  if (busca) {
    const digitosBusca = apenasDigitos(busca);
    const termo = busca.trim().toLowerCase();
    const recadastrado = lista.find(
      (c: any) =>
        (c.nome || "").toLowerCase() === termo ||
        (digitosBusca.length >= 9 &&
          (c.telefone || "").replace(/\D/g, "").endsWith(digitosBusca.slice(-9))),
    );
    if (recadastrado) {
      return [recadastrado, ...lista.filter((c: any) => c.id !== recadastrado.id)];
    }
  }

  return lista;
}

/**
 * Cadastra um contato novo na hora, para o atendente poder puxar conversa de
 * alguém que ainda não está no banco. `profiles.email` é NOT NULL UNIQUE, então
 * o telefone vira e-mail sintético quando o atendente não informa um.
 */
export async function cadastrarContato(dados: {
  nome: string;
  telefone: string;
  email?: string | null;
}) {
  if (!db) throw new Error("Banco de dados indisponível");

  const nome = dados.nome?.trim();
  const telefone = apenasDigitos(dados.telefone);
  if (!nome) throw new Error("Informe o nome do contato.");
  if (telefone.length < 10) {
    throw new Error("Telefone inválido. Informe o DDD e o número.");
  }

  const noveDigitos = telefone.slice(-9);
  const email = dados.email?.trim() || `whatsapp_${noveDigitos}@contato.local`;

  // O telefone precisa chegar ao banco sem máscara: `listarContatosDisponiveis`
  // normaliza com regexp_replace e compara dígitos, então o valor digitado
  // (`(11) 99999-9999`) nunca casaria com o contato recém-cadastrado na busca.
  const telefoneLimpo = telefone;

  // Se já existir um perfil com esse telefone, devolve ele em vez de duplicar.
  const existente = await db.execute(sql`
    SELECT id FROM profiles
    WHERE length(regexp_replace(COALESCE(telefone, ''), '\D', '', 'g')) >= 9
      AND right(regexp_replace(telefone, '\D', '', 'g'), 9) = ${noveDigitos}
    LIMIT 1
  `);
  const perfilExistente = rowsOf(existente)[0];
  if (perfilExistente) {
    return { id: perfilExistente.id as string, ja_existia: true as const };
  }

  const res = await db.execute(sql`
    INSERT INTO profiles (nome, telefone, email, role, whatsapp_status)
    VALUES (${nome}, ${telefoneLimpo}, ${email}, 'comprador', 'ATIVO')
    ON CONFLICT (email) DO UPDATE SET
      nome = COALESCE(NULLIF(btrim(EXCLUDED.nome), ''), profiles.nome),
      telefone = COALESCE(NULLIF(btrim(EXCLUDED.telefone), ''), profiles.telefone)
    RETURNING id
  `);
  return { id: rowsOf(res)[0].id as string, ja_existia: false as const };
}

/**
 * Inicia uma conversa com um contato a partir do zero.
 *
 * A janela de 24h só se abre quando o CLIENTE manda mensagem — então uma conversa
 * nova nasce com a janela fechada e a primeira fala precisa ser um template.
 * Por isso `template_name` é obrigatório aqui: não existe caminho de texto livre
 * para um contato que nunca escreveu.
 */
export async function iniciarConversa(
  atendenteId: string,
  dados: {
    telefone: string;
    nome?: string | null;
    template_name: string;
    idioma?: string;
    componentes?: any[];
  },
) {
  if (!db) throw new Error("Banco de dados indisponível");

  const digitos = apenasDigitos(dados.telefone);
  if (digitos.length < 10) {
    throw new Error("Telefone inválido. Informe o DDD e o número.");
  }
  // A Meta exige o formato internacional sem máscara.
  const telefoneMeta = digitos.startsWith("55") ? digitos : `55${digitos}`;
  const noveDigitos = digitos.slice(-9);

  const { metaService } = await import("./meta-whatsapp.server");

  // 1. Localiza (ou cria) o perfil — mesma normalização dos 9 dígitos usada no
  // webhook, para que a conversa nasca ligada ao cadastro que já existe.
  let resPerfil = await db.execute(sql`
    SELECT id FROM profiles
    WHERE length(regexp_replace(COALESCE(telefone, ''), '\D', '', 'g')) >= 9
      AND right(regexp_replace(telefone, '\D', '', 'g'), 9) = ${noveDigitos}
    LIMIT 1
  `);
  let perfilId = rowsOf(resPerfil)[0]?.id;

  if (!perfilId) {
    const emailSintetico = `whatsapp_${noveDigitos}@contato.local`;
    const res = await db.execute(sql`
      INSERT INTO profiles (nome, telefone, role, whatsapp_status, email)
      VALUES (
        ${dados.nome?.trim() || "Contato não identificado"},
        ${telefoneMeta},
        'comprador',
        'ATIVO',
        ${emailSintetico}
      )
      ON CONFLICT (email) DO UPDATE SET telefone = EXCLUDED.telefone
      RETURNING id
    `);
    perfilId = rowsOf(res)[0].id;
  }

  // 2. Reaproveita conversa aberta, se existir — evita dois atendimentos paralelos
  // para a mesma pessoa só porque o atendente clicou duas vezes.
  let resConv = await db.execute(sql`
    SELECT id FROM whatsapp_conversas
    WHERE contato_id = ${perfilId}::uuid AND status != 'RESOLVIDA' AND status != 'ARQUIVADA'
    ORDER BY ultimo_evento_em DESC LIMIT 1
  `);
  let conversaId = rowsOf(resConv)[0]?.id;

  if (!conversaId) {
    const res = await db.execute(sql`
      -- ultima_resposta_cliente_em gravado como now(): o template foi enviado
      -- porque o atendente QUER falar com este contato, então o relógio de
      -- inatividade começa a contar daqui, e não do primeiro template.
      -- Sem isso a conversa nascia com a janela fechada e a tela mostrava
      -- "Janela fechada" mesmo com o cliente esperando retorno.
      INSERT INTO whatsapp_conversas (contato_id, status, responsavel_id, ultimo_evento_em, ultima_resposta_cliente_em)
      VALUES (${perfilId}::uuid, 'AGUARDANDO_CLIENTE', ${atendenteId}::uuid, now(), now())
      RETURNING id
    `);
    conversaId = rowsOf(res)[0].id;
  }

  // 3. Envia o template — a única forma de falar com quem nunca escreveu.
  const componentes = dados.componentes || [];
  const resMeta = await metaService.enviarMensagem(
    telefoneMeta,
    dados.template_name,
    dados.idioma || "pt_BR",
    componentes,
  );

  await db.execute(sql`
    INSERT INTO whatsapp_mensagens (conversa_id, autor_id, tipo, payload, meta_message_id, status, metadata, enviado_por_atendente)
    VALUES (
      ${conversaId}::uuid,
      ${atendenteId}::uuid,
      'MENSAGEM',
      ${JSON.stringify({
        tipo: "TEMPLATE",
        template_name: dados.template_name,
        idioma: dados.idioma || "pt_BR",
        componentes,
      })}::jsonb,
      ${resMeta.messages?.[0]?.id},
      'ENVIADA',
      '{"origem": "ATENDENTE"}'::jsonb,
      true
    )
  `);

  // Reenviar template também reinicia o relógio de inatividade — o template
  // funciona fora da janela, então sem isso uma conversa reaberta por template
  // continuaria fechada.
  await db.execute(sql`
    UPDATE whatsapp_conversas SET
      ultimo_evento_em = now(),
      ultima_mensagem_preview = ${`Template: ${dados.template_name}`},
      status = 'AGUARDANDO_CLIENTE',
      ultima_resposta_cliente_em = now()
    WHERE id = ${conversaId}::uuid
  `);

  return { conversaId: conversaId as string };
}
