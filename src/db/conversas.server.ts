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
      END $$;
    `);

    // 3. Índices para busca
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_conversas_contato ON whatsapp_conversas(contato_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON whatsapp_mensagens(conversa_id)`);

  } catch (err) {
    console.error("[conversas.server] Erro ao garantir schema:", err);
  }
}

export async function listarConversas(filtros: any) {
  if (!db) return [];
  
  let query = sql`
    SELECT c.*, p.nome as contato_nome, p.telefone as contato_telefone, p.role as contato_role,
           resp.nome as responsavel_nome
    FROM whatsapp_conversas c
    LEFT JOIN profiles p ON p.id = c.contato_id
    LEFT JOIN profiles resp ON resp.id = c.responsavel_id
    WHERE 1=1
  `;

  if (filtros.status && filtros.status !== 'TODAS') {
    query = sql`${query} AND c.status = ${filtros.status}`;
  }
  
  if (filtros.responsavel_id) {
    query = sql`${query} AND c.responsavel_id = ${filtros.responsavel_id}::uuid`;
  }

  query = sql`${query} ORDER BY c.ultimo_evento_em DESC`;
  
  const res = await db.execute(query);
  return rowsOf(res) || [];
}

export async function getConversaCompleta(conversaId: string) {
  if (!db) return null;
  
  const convRes = await db.execute(sql`
    SELECT c.*, p.nome as contato_nome, p.telefone as contato_telefone, p.role as contato_role,
           v.marca as veiculo_marca, v.modelo as veiculo_modelo, v.placa as veiculo_placa
    FROM whatsapp_conversas c
    LEFT JOIN profiles p ON p.id = c.contato_id
    LEFT JOIN anuncios_veiculo v ON v.id = c.contexto_veiculo_id
    WHERE c.id = ${conversaId}::uuid
  `);
  
  const conversa = rowsOf(convRes)[0];
  if (!conversa) return null;

  const msgRes = await db.execute(sql`
    SELECT m.*, p.nome as autor_nome
    FROM whatsapp_mensagens m
    LEFT JOIN profiles p ON p.id = m.autor_id
    WHERE m.conversa_id = ${conversaId}::uuid
    ORDER BY m.criado_em ASC
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
    SELECT c.contato_id, p.telefone 
    FROM whatsapp_conversas c 
    JOIN profiles p ON p.id = c.contato_id 
    WHERE c.id = ${conversaId}::uuid
  `);
  const conversa = rowsOf(convRes)[0];
  
  if (payload.tipo === 'NOTA_INTERNA') {
    await db.execute(sql`
      INSERT INTO whatsapp_mensagens (conversa_id, autor_id, tipo, payload, status)
      VALUES (${conversaId}::uuid, ${atendenteId}::uuid, 'NOTA_INTERNA', ${JSON.stringify(payload.conteudo)}::jsonb, 'ENVIADA')
    `);
    return;
  }

  // Enviar via Meta
  const resMeta = await metaService.enviarMensagem(
    conversa.telefone,
    payload.template_name || '',
    payload.idioma || 'pt_BR',
    payload.componentes || []
  );

  const msgRes = await db.execute(sql`
    INSERT INTO whatsapp_mensagens (conversa_id, autor_id, tipo, payload, meta_message_id, status, metadata)
    VALUES (
      ${conversaId}::uuid, 
      ${atendenteId}::uuid, 
      'MENSAGEM', 
      ${JSON.stringify(payload.componentes)}::jsonb, 
      ${resMeta.messages?.[0]?.id}, 
      'ENVIADA',
      '{"origem": "ATENDENTE"}'::jsonb
    ) RETURNING id
  `);

  await db.execute(sql`
    UPDATE whatsapp_conversas SET 
      ultimo_evento_em = now(),
      ultima_mensagem_preview = 'Mensagem enviada',
      status = 'AGUARDANDO_CLIENTE'
    WHERE id = ${conversaId}::uuid
  `);
}

export async function processarMensagemRecebida(telefone: string, payload: any) {
  if (!db) return;

  // 1. Localizar ou criar contato
  let resPerfil = await db.execute(sql`SELECT id FROM profiles WHERE telefone = ${telefone}`);
  let perfilId = rowsOf(resPerfil)[0]?.id;

  if (!perfilId) {
    // Cadastro temporário ou "Não Identificado"
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
    INSERT INTO whatsapp_mensagens (conversa_id, telefone, payload, status, tipo)
    VALUES (${conversaId}::uuid, ${telefone}, ${JSON.stringify(payload)}::jsonb, 'RECEBIDA', 'MENSAGEM')
  `);

  // 4. Atualizar conversa
  await db.execute(sql`
    UPDATE whatsapp_conversas SET 
      ultimo_evento_em = now(),
      ultima_mensagem_preview = ${payload.text?.body || 'Mídia recebida'},
      nao_lidas = nao_lidas + 1,
      status = 'EM_ATENDIMENTO'
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
