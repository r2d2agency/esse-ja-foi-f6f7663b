import { sql } from "drizzle-orm";
import { db } from "./index";
import { metaService, montarComponents } from "./meta-whatsapp.server";

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
      SELECT a.*, t.meta_name, t.idioma, t.conteudo as template_conteudo, t.status as template_meta_status,
        t.midia_id, t.midia_tipo, t.midia_nome
      FROM whatsapp_automacoes a
      LEFT JOIN whatsapp_templates t ON t.id = a.template_id
      WHERE a.evento = ${evento} AND a.status = 'ATIVA'
    `);

    const rows = rowsOf(automacoes) || [];

    for (const auto of rows) {
      // Ramo GRUPOS_UAZAPI: veículo publicado na vitrine vai para os grupos da
      // Uazapi com texto + foto. A Meta não aceita template para @g.us, então
      // o envio é enfileirado como uma campanha Uazapi (o motor já respeita a
      // janela 08-18 e o intervalo).
      if (auto.publico === "GRUPOS_UAZAPI") {
        try {
          await enviarParaGruposUazapi(auto, contexto);
        } catch (e: any) {
          console.error("[Automacao Motor] falha no ramo GRUPOS_UAZAPI:", e?.message || e);
        }
        continue;
      }

      // Validação de template na Meta
      if (auto.template_meta_status !== 'APPROVED') {
        await db.execute(sql`UPDATE whatsapp_automacoes SET status = 'TEMPLATE_INDISPONIVEL' WHERE id = ${auto.id}::uuid`);
        continue;
      }

      // 2. Identificar destinatário baseado no público
      const destinatario = await identificarDestinatario(auto.publico, contexto);
      if (!destinatario || !destinatario.telefone || destinatario.whatsapp_status !== 'ATIVO') continue;

      // 3. Verificar idempotência (Evitar spam e duplicicidade)
      const identificador = `${auto.id}:${evento}:${destinatario.id}:${contexto.referencia_id || 'global'}`;
      const jaExiste = await db.execute(sql`
        SELECT 1 FROM whatsapp_automacoes_execucoes WHERE identificador_unico = ${identificador}
      `);
      if (rowsOf(jaExiste).length > 0) continue;

      // 4. Preencher variáveis (Mapeamento dinâmico) e montar componentes
      const valores = mapearVariaveis(auto.mapeamento_variaveis, contexto);
      const midia = (auto as any).midia_id
        ? { tipo: (auto as any).midia_tipo, mediaId: (auto as any).midia_id, nome: (auto as any).midia_nome }
        : null;
      const componentes = montarComponents(auto.template_conteudo, valores, midia);

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

async function enviarParaGruposUazapi(auto: any, contexto: any) {
  const { ensureComunicacoesSchema } = await import("./comunicacoes.server");
  const { criarCampanhaDisparoGrupos } = await import("./disparo-motor.server");
  await ensureComunicacoesSchema();

  // Grupos vêm da regra da automação (regras.grupos_alvo = ["120363...@g.us"]).
  const grupos: string[] = Array.isArray(auto.regras?.grupos_alvo) ? auto.regras.grupos_alvo : [];
  if (!grupos.length) {
    console.warn(`[Automacao Motor] automação ${auto.id} (GRUPOS_UAZAPI) sem grupos em regras.grupos_alvo — nada a fazer.`);
    return;
  }

  // Monta a mensagem do veículo publicado (título, ano/km, link público, foto).
  // `montarMensagemWhatsapp` devolve o texto com o link privado; para a vitrine
  // usamos o link público /veiculos/{slug}.
  const veiculoId = contexto.veiculo_id;
  if (!veiculoId) throw new Error("VEICULO_PUBLICADO sem veiculo_id no contexto.");

  const { montarMensagemWhatsapp } = await import("./publicacao.server");
  const baseUrl = process.env.BASE_URL || process.env.VITE_BASE_URL || "";
  const montado = await montarMensagemWhatsapp(veiculoId, baseUrl);

  // Link público da vitrine (slug) substitui o link privado /v/{token}.
  const slug = contexto.slug || null;
  let texto = montado?.mensagem || "";
  if (slug && baseUrl) {
    texto = texto.replace(
      /🔗 Veja as fotos e a ficha completa:.*$/m,
      `🔗 Veja as fotos e a ficha completa: ${baseUrl}/veiculos/${slug}`,
    );
  }

  // Foto de capa: enviada como legenda na Uazapi (o texto vai junto).
  const foto = montado?.foto_capa || null;

  await criarCampanhaDisparoGrupos({
    nome: `${auto.nome} — ${veiculoId}`,
    veiculo_id: veiculoId,
    grupos_alvo: grupos,
    texto,
    foto,
    janela_inicio: "08:00",
    janela_fim: "18:00",
    intervalo_minutos: 5,
    enviar_agora: true,
  });

  await db.execute(sql`
    UPDATE whatsapp_automacoes SET ultima_execucao = now() WHERE id = ${auto.id}::uuid
  `);
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
  if (!mapeamento || !Array.isArray(mapeamento)) return {};

  const valores: Record<string, string> = {};
  for (const m of mapeamento) {
    const chave = String(m.variavel || "").replace(/[{}]/g, "");
    if (!chave) continue;
    valores[chave] = resolveOrigem(m.origem, contexto);
  }
  return valores;
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
