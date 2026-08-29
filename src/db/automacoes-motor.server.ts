import { sql } from "drizzle-orm";
import { db } from "./index";
import { metaService } from "./meta-whatsapp.server";

// Variáveis disponíveis por contexto
export const EVENT_VARIABLES: Record<string, string[]> = {
  'VEICULO_PUBLICADO': ['comprador.nome', 'veiculo.marca', 'veiculo.modelo', 'veiculo.ano', 'anuncio.url', 'veiculo.foto_url'],
  'LANCE_SUPERADO': ['comprador.nome', 'veiculo.marca', 'veiculo.modelo', 'lance.valor_atual', 'leilao.url'],
  'VISTORIA_AGENDADA': ['vendedor.nome', 'veiculo.placa', 'vistoria.data', 'vistoria.horario', 'vistoria.local'],
  'PAGAMENTO_CONFIRMADO': ['comprador.nome', 'negociacao.codigo', 'veiculo.modelo', 'negociacao.valor']
};

export async function processarEventoSistema(evento: string, contexto: any) {
  if (!db) return;
  
  try {
    // 1. Buscar automações ativas para este evento
    const automacoes = await db.execute(sql`
      SELECT a.*, t.meta_name, t.idioma, t.conteudo as template_conteudo, t.status as template_meta_status
      FROM whatsapp_automacoes a
      JOIN whatsapp_templates t ON t.id = a.template_id
      WHERE a.evento = ${evento} AND a.status = 'ATIVA'
    `);

    const rows = rowsOf(automacoes) || [];
    
    for (const auto of rows) {
      // Validação de template na Meta
      if (auto.template_meta_status !== 'APPROVED') {
        await db.execute(sql`UPDATE whatsapp_automacoes SET status = 'TEMPLATE_INDISPONIVEL' WHERE id = ${auto.id}::uuid`);
        continue;
      }

      // 2. Identificar destinatário baseado no público
      const destinatario = await identificarDestinatario(auto.publico, contexto);
      if (!destinatario || !destinatario.telefone || destinatario.whatsapp_status !== 'ATIVO') continue;

      // 3. Verificar idempotência (Evitar spam e duplicidade)
      const identificador = `${auto.id}:${evento}:${destinatario.id}:${contexto.referencia_id || 'global'}`;
      const jaExiste = await db.execute(sql`
        SELECT 1 FROM whatsapp_automacoes_execucoes WHERE identificador_unico = ${identificador}
      `);
      if (rowsOf(jaExiste).length > 0) continue;

      // 4. Preencher variáveis (Mapeamento dinâmico)
      const componentes = mapearVariaveis(auto.mapeamento_variaveis, contexto);

      // 5. Criar registro de execução e enviar para a fila Meta
      const resExec = await db.execute(sql`
        INSERT INTO whatsapp_automacoes_execucoes (automacao_id, evento_id, destinatario_id, status, identificador_unico)
        VALUES (${auto.id}::uuid, ${contexto.referencia_id || 'N/A'}, ${destinatario.id}::uuid, 'PENDENTE', ${identificador})
        RETURNING id
      `);
      
      const execId = rowsOf(resExec)[0].id;

      try {
        const resMeta = await metaService.enviarMensagem(
          destinatario.telefone,
          auto.meta_name,
          auto.idioma,
          componentes
        );

        // 6. Registrar mensagem e atualizar execução/estatísticas
        const msgRes = await db.execute(sql`
          INSERT INTO whatsapp_mensagens (comprador_id, telefone, status, meta_message_id, payload)
          VALUES (${destinatario.id}::uuid, ${destinatario.telefone}, 'ENVIADA', ${resMeta.messages?.[0]?.id}, ${JSON.stringify(componentes)}::jsonb)
          RETURNING id
        `);
        
        const msgId = rowsOf(msgRes)[0].id;

        await db.execute(sql`
          UPDATE whatsapp_automacoes_execucoes SET status = 'ENVIADO', mensagem_id = ${msgId}::uuid WHERE id = ${execId}::uuid;
          UPDATE whatsapp_automacoes SET total_enviados = total_enviados + 1, ultima_execucao = now() WHERE id = ${auto.id}::uuid;
        `);
      } catch (err: any) {
        await db.execute(sql`
          UPDATE whatsapp_automacoes_execucoes SET status = 'FALHOU', erro_detalhe = ${err.message} WHERE id = ${execId}::uuid
        `);
      }
    }
  } catch (error) {
    console.error(`[Automacao Motor] Erro ao processar evento ${evento}:`, error);
  }
}

async function identificarDestinatario(publico: string, contexto: any) {
  if (!db) return null;
  
  let userId = null;
  
  if (publico === 'VENDEDOR') userId = contexto.vendedor_id;
  if (publico === 'COMPRADOR_VENCEDOR') userId = contexto.comprador_id;
  if (publico === 'COMPRADOR_SUPERADO') userId = contexto.comprador_superado_id;
  if (publico === 'VISTORIADOR') userId = contexto.vistoriador_id;
  
  if (!userId) return null;

  const res = await db.execute(sql`
    SELECT id, nome, telefone, whatsapp_status, pode_receber_comunicacoes 
    FROM profiles 
    WHERE id = ${userId}::uuid
  `);
  
  const user = rowsOf(res)[0];
  return (user && user.pode_receber_comunicacoes) ? user : null;
}

function mapearVariaveis(mapeamento: any[], contexto: any) {
  if (!mapeamento || !Array.isArray(mapeamento)) return [];
  
  const bodyParams = mapeamento.map((m: any) => ({
    type: "text",
    text: resolveOrigem(m.origem, contexto)
  }));

  return [
    {
      type: "body",
      parameters: bodyParams
    }
  ];
}

function resolveOrigem(origem: string, contexto: any) {
  const parts = origem.split('.');
  let current = contexto;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = current[part];
    } else {
      return '';
    }
  }
  return String(current || '');
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
