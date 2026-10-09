import { sql } from "drizzle-orm";
import { db } from "./index";

export async function ensureConversasSchema(silent = true) {
  if (!db) return;

  try {
    // 1. Tabela de Conversas
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

    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversas' AND column_name = 'contato_id') THEN
          ALTER TABLE whatsapp_conversas ADD COLUMN contato_id uuid NOT NULL REFERENCES profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversas' AND column_name = 'apelido') THEN
          ALTER TABLE whatsapp_conversas ADD COLUMN apelido text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversas' AND column_name = 'janela_expira_em') THEN
          ALTER TABLE whatsapp_conversas ADD COLUMN janela_expira_em timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_conversas' AND column_name = 'ultima_resposta_cliente_em') THEN
          ALTER TABLE whatsapp_conversas ADD COLUMN ultima_resposta_cliente_em timestamptz;
        END IF;
      END $$;
    `);

    // 2. Tabela de Mensagens e Notas
    // Nota: Reutiliza whatsapp_mensagens mas adiciona campos para notas internas e auditoria
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'conversa_id') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN conversa_id uuid REFERENCES whatsapp_conversas(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'tipo') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN tipo text DEFAULT 'MENSAGEM';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'autor_id') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN autor_id uuid REFERENCES profiles(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'metadata') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_mensagens' AND column_name = 'enviado_por_atendente') THEN
          ALTER TABLE whatsapp_mensagens ADD COLUMN enviado_por_atendente boolean DEFAULT false;
        END IF;
      END $$;
    `);

    // 3. Tabela de respostas rápidas
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

    // 4. Índices para busca
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_conversas_contato ON whatsapp_conversas(contato_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON whatsapp_mensagens(conversa_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_respostas_prontas_escopo ON whatsapp_respostas_prontas(escopo, atendente_id)`);

  } catch (err) {
    console.error("[conversas.server] Erro ao garantir schema:", err);
  }
}

export async function listarConversas(filtros: any) {
  if (!db) return [];

  const filtrosNorm = {
    ...filtros,
    status: filtros.status === 'Não lidas' ? 'NAO_LIDAS' : filtros.status,
  };

  let query = sql`
    SELECT c.id, c.contato_id, c.status, c.prioridade, c.responsavel_id,
           c.ultimo_evento_em, c.nao_lidas, c.apelido, c.janela_expira_em,
           c.ultima_resposta_cliente_em, c.etiquetas, c.contexto_negociacao_id,
           c.contexto_veiculo_id, c.criado_em,
           p.nome as contato_nome, p.telefone as contato_telefone, p.role as contato_role,
           resp.nome as responsavel_nome,
           (SELECT m.payload->'text'->>'body'
            FROM whatsapp_mensagens m
            WHERE m.conversa_id = c.id
            ORDER BY m.criado_em DESC LIMIT 1) as ultima_mensagem_texto,
           (SELECT m.tipo
            FROM whatsapp_mensagens m
            WHERE m.conversa_id = c.id
            ORDER BY m.criado_em DESC LIMIT 1) as ultima_mensagem_tipo,
           (SELECT m.enviado_por_atendente
            FROM whatsapp_mensagens m
            WHERE m.conversa_id = c.id
            ORDER BY m.criado_em DESC LIMIT 1) as ultima_direcao_atendente,
           (c.janela_expira_em > now()) as janela_aberta
    FROM whatsapp_conversas c
    LEFT JOIN profiles p ON p.id = c.contato_id
    LEFT JOIN profiles resp ON resp.id = c.responsavel_id
    WHERE 1=1
  `;

  if (filtrosNorm.status && filtrosNorm.status !== 'TODAS') {
    if (filtrosNorm.status === 'NAO_LIDAS') {
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
           v.marca as veiculo_marca, v.modelo as veiculo_modelo, v.placa as veiculo_placa,
           v.id as veiculo_id,
           (c.janela_expira_em > now()) as janela_aberta
    FROM whatsapp_conversas c
    LEFT JOIN profiles p ON p.id = c.contato_id
    LEFT JOIN profiles resp ON resp.id = c.responsavel_id
    LEFT JOIN anuncios_veiculo v ON v.id = c.contexto_veiculo_id
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
    mensagens: rowsOf(msgRes) || []
  };
}

export async function enviarMensagemAtendente(conversaId: string, atendenteId: string, payload: any) {
  if (!db) return;

  const { metaService } = await import("./meta-whatsapp.server");

  const convRes = await db.execute(sql`
    SELECT c.contato_id, p.telefone, c.janela_expira_em
    FROM whatsapp_conversas c
    JOIN profiles p ON p.id = c.contato_id
    WHERE c.id = ${conversaId}::uuid
  `);
  const conversa = rowsOf(convRes)[0];

  if (payload.tipo === 'NOTA_INTERNA') {
    await db.execute(sql`
      INSERT INTO whatsapp_mensagens (conversa_id, autor_id, tipo, payload, status, enviado_por_atendente)
      VALUES (${conversaId}::uuid, ${atendenteId}::uuid, 'NOTA_INTERNA', ${JSON.stringify(payload.conteudo)}::jsonb, 'ENVIADA', true)
    `);
    return;
  }

  const isTemplate = Boolean(payload.template_name);
  const isTexto = payload.tipo === 'TEXTO' || (!isTemplate && payload.conteudo?.text?.body);

  // Verifica janela de 24h para envio de texto livre
  if (isTexto) {
    const janelaAberta = conversa.janela_expira_em && new Date(conversa.janela_expira_em) > new Date();
    if (!janelaAberta) {
      throw new Error("A janela de 24h com este contato está fechada. Envie um template para reabrir o atendimento.");
    }
  }

  let resMeta: any;
  let payloadGravado: any;
  let previewTexto = '';

  if (isTemplate) {
    // Envio por template (funciona fora da janela de 24h)
    const componentes = payload.componentes || [];
    resMeta = await metaService.enviarMensagem(
      conversa.telefone,
      payload.template_name,
      payload.idioma || 'pt_BR',
      componentes,
    );
    payloadGravado = {
      tipo: 'TEMPLATE',
      template_name: payload.template_name,
      idioma: payload.idioma || 'pt_BR',
      componentes,
    };
    previewTexto = `Template: ${payload.template_name}`;
  } else {
    // Envio de texto livre
    const texto = payload.conteudo.text.body;
    resMeta = await metaService.enviarTexto(conversa.telefone, texto);
    payloadGravado = {
      tipo: 'TEXTO',
      text: { body: texto },
    };
    previewTexto = texto;
  }

  await db.execute(sql`
    INSERT INTO whatsapp_mensagens (conversa_id, autor_id, tipo, payload, meta_message_id, status, metadata, enviado_por_atendente)
    VALUES (
      ${conversaId}::uuid,
      ${atendenteId}::uuid,
      'MENSAGEM',
      ${JSON.stringify(payloadGravado)}::jsonb,
      ${resMeta.messages?.[0]?.id},
      'ENVIADA',
      '{"origem": "ATENDENTE"}'::jsonb,
      true
    ) RETURNING id
  `);

  await db.execute(sql`
    UPDATE whatsapp_conversas SET
      ultimo_evento_em = now(),
      ultima_mensagem_preview = ${previewTexto},
      status = 'AGUARDANDO_CLIENTE'
    WHERE id = ${conversaId}::uuid
  `);
}

function apenasDigitos(s: string | null | undefined): string {
  return (s || '').replace(/\D/g, '');
}

export async function processarMensagemRecebida(telefone: string, payload: any) {
  if (!db) return;

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
    const res = await db.execute(sql`
      INSERT INTO profiles (nome, telefone, role, whatsapp_status)
      VALUES ('Contato não identificado', ${telefone}, 'comprador', 'ATIVO')
      RETURNING id
    `);
    perfilId = rowsOf(res)[0].id;
  }

  // 2. Localizar conversa aberta
  let resConv = await db.execute(sql`
    SELECT id FROM whatsapp_conversas
    WHERE contato_id = ${perfilId}::uuid AND status != 'RESOLVIDA' AND status != 'ARQUIVADA'
  `);
  let conversaId = rowsOf(resConv)[0]?.id;

  if (!conversaId) {
    const res = await db.execute(sql`
      INSERT INTO whatsapp_conversas (contato_id, status)
      VALUES (${perfilId}::uuid, 'NOVA')
      RETURNING id
    `);
    conversaId = rowsOf(res)[0].id;
  }

  // 3. Salvar mensagem
  await db.execute(sql`
    INSERT INTO whatsapp_mensagens (conversa_id, telefone, payload, status, tipo, enviado_por_atendente)
    VALUES (${conversaId}::uuid, ${telefone}, ${JSON.stringify(payload)}::jsonb, 'RECEBIDA', 'MENSAGEM', false)
  `);

  // 4. Atualizar conversa + abrir janela de 24h
  await db.execute(sql`
    UPDATE whatsapp_conversas SET
      ultimo_evento_em = now(),
      ultima_mensagem_preview = ${payload.text?.body || 'Mídia recebida'},
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
  const escopo = dados.escopo === 'GLOBAL' ? 'GLOBAL' : 'ATENDENTE';
  const dono = escopo === 'GLOBAL' ? null : atendenteId;
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
