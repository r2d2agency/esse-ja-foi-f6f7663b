import { sql } from "drizzle-orm";
import { db } from "./index";
import { metaService, MetaApiError, montarComponents } from "./meta-whatsapp.server";
import { resolverPublico, normalizarParaMeta, type CriterioPublico } from "./publico.server";

/**
 * Motor de disparo em dripping.
 *
 * A versão anterior enviava a campanha inteira num `for` sequencial, sem
 * pausa: uma lista de 5.000 contatos batia no limite de taxa da Meta (131056)
 * em segundos e derrubava o nível de qualidade da conta. Aqui cada rodada
 * respeita a janela de trabalho configurada (ex: 08h–18h) e o intervalo entre
 * mensagens, e o lote é reservado antes de chamar a API para que duas
 * instâncias do servidor não enviem em duplicidade.
 */

/** Tamanho do lote por rodada. Maior que isso não adianta: o intervalo domina. */
const LOTE = 20;
/** Mensagem reservada há mais que isso volta para a fila (o processo morreu). */
const RESERVACA_PENDENTE_MIN = 10;
/** Backoff de retry: 1min, 2min, 4min, 8min… até ESTOURAR_TENTATIVAS. */
const MAX_TENTATIVAS = 5;

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

/** Texto do template não pode conter R$ solto: a Meta entende como URL. */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const km = new Intl.NumberFormat("pt-BR");

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

/** "08:00" → 8,aceito também null. */
function horaDe(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const [h] = String(valor).split(":");
  const n = Number(h);
  return Number.isFinite(n) ? n : null;
}

/**
 * A janela pode atravessar a meia-noite (22h–06h). Sem este tratamento, uma
 * janela que começa depois do fim seria nunca satisfeita.
 */
function dentroDaJanela(agora: Date, inicio: number | null, fim: number | null): boolean {
  if (inicio === null || fim === null) return true;
  const h = agora.getHours() + agora.getMinutes() / 60;
  if (inicio <= fim) return h >= inicio && h < fim;
  return h >= inicio || h < fim;
}

/** Primeiro instante de hoje dentro da janela — para adiar o que sobrou. */
function proximaAbertura(inicio: number | null, fim: number | null): Date {
  const agora = new Date();
  if (inicio === null) return agora;
  const alvo = new Date(agora);
  alvo.setHours(Math.floor(inicio), Math.round((inicio % 1) * 60), 0, 0);
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
  return alvo;
}

/**
 * Libera reservas órfãs e reaberta campanhas travadas em PROCESSANDO.
 * Sem isso, uma queda do container no meio de um disparo deixaria mensagens
 * em RESERVADA para sempre e a campanha nunca mais terminaria.
 */
export async function recuperarDisparosInterrompidos() {
  const d = requireDb();
  const res = await d.execute(sql`
    UPDATE whatsapp_mensagens
    SET estado_fila = 'PENDENTE', reservada_em = NULL, reservada_por = NULL
    WHERE estado_fila = 'RESERVADA'
      AND reservada_em < now() - (${RESERVACA_PENDENTE_MIN} || ' minutes')::interval
    RETURNING id
  `);
  return rowsOf(res).length;
}

/** Reserva o lote com FOR UPDATE SKIP LOCKED: outra instância pula essas linhas. */
async function reservarLote(campanhaId: string, workerId: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    UPDATE whatsapp_mensagens m
    SET estado_fila = 'RESERVADA',
        reservada_em = now(),
        reservada_por = ${workerId},
        atualizado_em = now()
    WHERE m.id IN (
      SELECT id FROM whatsapp_mensagens
      WHERE campanha_id = ${campanhaId}::uuid
        AND estado_fila = 'PENDENTE'
        AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= now())
      ORDER BY criado_em
      LIMIT ${LOTE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING m.*
  `);
  return rowsOf(res);
}

/**
 * Campos do veículo e do anunciante disponíveis ao mapeamento de variáveis.
 * Cada chave é o que o wizard mostra; o valor é o caminho resolvido por
 * `resolverCaminho` (mesma convenção da automação: `veiculo.marca`).
 */
export const VEICULO_VARIAVEIS: { chave: string; rotulo: string; exemplo: string }[] = [
  { chave: "veiculo.nome_completo", rotulo: "Marca + Modelo", exemplo: "Honda CG 160" },
  { chave: "veiculo.marca", rotulo: "Marca", exemplo: "Honda" },
  { chave: "veiculo.modelo", rotulo: "Modelo", exemplo: "CG 160" },
  { chave: "veiculo.ano", rotulo: "Ano", exemplo: "2023" },
  { chave: "veiculo.placa", rotulo: "Placa", exemplo: "BRA2E19" },
  { chave: "veiculo.cor", rotulo: "Cor", exemplo: "Vermelha" },
  { chave: "veiculo.km", rotulo: "Quilometragem", exemplo: "12.500 km" },
  { chave: "veiculo.valor", rotulo: "Preço (R$)", exemplo: "R$ 18.900" },
  { chave: "veiculo.descricao", rotulo: "Descrição do anúncio", exemplo: "Único dono,…" },
  { chave: "anuncio.url", rotulo: "Link do anúncio", exemplo: "https://…" },
  { chave: "anuncio.titulo", rotulo: "Título do anúncio", exemplo: "Honda CG 160 2023" },
  { chave: "vendedor.nome", rotulo: "Nome do vendedor", exemplo: "João" },
  { chave: "vendedor.telefone", rotulo: "WhatsApp do vendedor", exemplo: "(17) 99999-9999" },
];

export const CONTATO_VARIAVEIS: { chave: string; rotulo: string }[] = [
  { chave: "contato.nome", rotulo: "Nome do contato" },
  { chave: "contato.email", rotulo: "E-mail do contato" },
  { chave: "contato.telefone", rotulo: "Telefone do contato" },
];

/**
 * Percurso de ponto (`veiculo.marca`), igual ao `resolveOrigem` da automação.
 * Texto livre usa o prefixo `literal:` — a tela só digita, não consulta banco.
 */
export function resolverCaminho(caminho: string, contexto: any): string {
  const partes = String(caminho || "").split(".");
  let atual: any = contexto;
  for (const p of partes) {
    if (atual && typeof atual === "object") atual = atual[p];
    else return "";
  }
  return String(atual ?? "");
}

/** Valores do corpo do template, na ordem dos {{n}}. */
function valoresDoTemplate(
  _template: any,
  mapeamento: Record<string, string>,
  dest: { nome: string | null; email: string | null; telefone: string },
  contexto: Record<string, any> | null,
): Record<string, string> {
  // Sem o veículo montado aqui, `veiculo.marca` resolvia para "" e a Meta
  // recusava a mensagem com "Preencha {{1}}…". O contexto reúne contato,
  // veículo e anunciante no mesmo formato que a automação usa.
  // Quando não há veículo (comunicado), usar o nome do contato como fallback
  // para variáveis de veículo, garantindo que nunca fiquem vazias.
  const fallback = dest.nome ?? "";
  const ctx: Record<string, any> = {
    contato: {
      nome: dest.nome ?? "",
      email: dest.email ?? "",
      telefone: dest.telefone,
    },
    veiculo: contexto?.veiculo ?? {
      nome_completo: fallback,
      marca: fallback,
      modelo: fallback,
      ano: "",
      placa: "",
      cor: "",
      km: "",
      valor: "",
      descricao: "",
    },
    anuncio: contexto?.anuncio ?? { titulo: fallback, url: "" },
    vendedor: contexto?.vendedor ?? { nome: "", telefone: "" },
  };

  // O mapeamento da campanha diz qual campo entra em qual {{n}}. Sem ele, os
  // valores saem vazios e a Meta rejeita a mensagem.
  // Aceita a chave como "1" (formato que o wizard grava) ou "{{1}}" (formato
  // que o motor sempre usou). Sem isso, o corpo saía vazio e a Meta respondia
  // 132018 "There's an issue with the parameters in your template".
  const saida: Record<string, string> = {};
  for (const [variavel, campo] of Object.entries(mapeamento ?? {})) {
    const chave = String(variavel).replace(/[{}]/g, "");
    if (!chave || !campo) continue;
    if (campo.startsWith("literal:")) {
      saida[chave] = campo.slice("literal:".length);
      continue;
    }
    const resolvido = resolverCaminho(campo, ctx);
    saida[chave] = resolvido;
  }
  return saida;
}

type ResultadoEnvio =
  | { ok: true; metaMessageId: string | null }
  | {
      ok: false;
      permanente: boolean;
      numeroInexistente: boolean;
      mensagem: string;
      codigo: string | null;
    };

async function enviarComRetry(msg: any, campanha: any): Promise<ResultadoEnvio> {
  const d = requireDb();
  let tentativa = Number(msg.tentativas ?? 0);
  let erro: MetaApiError | Error = new Error("Falha desconhecida.");

  // Campanha Uazapi (conexão nova): texto livre direto na instância. Grupo é o
  // caso principal — a Meta não aceita template para @g.us — mas número comum
  // também sai por aqui. O texto é o BODY do template com as variáveis
  // aplicadas; HEADER/BOTÕES da Meta não existem no WhatsApp normal.
  if ((campanha.canal_envio ?? "META") === "UAZAPI") {
    const { enviarTextoUazapi, enviarMidiaUazapi } = await import("./marketing.server");
    // Texto pronto (automação de grupos) ou BODY do template com as variáveis.
    const v = msg.variaveis ?? {};
    const corpo = String(
      campanha.template_conteudo?.find?.((c: any) => c.type === "BODY")?.text ?? "",
    );
    const texto = String(
      v.texto ??
        corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => v?.[String(n)] ?? ""),
    );
    if (!texto.trim()) {
      await d.execute(sql`
        UPDATE whatsapp_mensagens SET estado_fila = 'IGNORADA', status = 'FALHOU',
          erro_mensagem = 'Template sem corpo de texto para envio via Uazapi.', atualizado_em = now()
        WHERE id = ${msg.id}::uuid
      `);
      return { ok: false, permanente: true, numeroInexistente: false, mensagem: "Template sem corpo.", codigo: null };
    }
    // Foto da capa: enviada com o texto como legenda (o grupo recebe os dois).
    const foto = v.foto_capa || v.foto_url || null;
    try {
      const r = foto
        ? await enviarMidiaUazapi(msg.telefone, String(foto), texto)
        : await enviarTextoUazapi(msg.telefone, texto);
      await d.execute(sql`
        UPDATE whatsapp_mensagens SET
          estado_fila = 'ENVIADA',
          status = 'ENVIADA',
          meta_message_id = ${r.id},
          enviado_em = now(),
          tentativas = ${tentativa + 1},
          erro_codigo = NULL, erro_mensagem = NULL,
          atualizado_em = now()
        WHERE id = ${msg.id}::uuid
      `);
      return { ok: true, metaMessageId: r.id };
    } catch (e: any) {
      const permanente = e?.permanente === true;
      await d.execute(sql`
        UPDATE whatsapp_mensagens SET
          estado_fila = 'FALHOU',
          status = 'FALHOU',
          tentativas = ${tentativa + 1},
          erro_mensagem = ${String(e?.message ?? e).slice(0, 500)},
          atualizado_em = now()
        WHERE id = ${msg.id}::uuid
      `);
      return { ok: false, permanente, numeroInexistente: false, mensagem: String(e?.message ?? e), codigo: null };
    }
  }

  while (tentativa < MAX_TENTATIVAS) {
    try {
      // O anexo (imagem/PDF do cabeçalho) mora na linha do template, não na
      // mensagem — cada contato recebe a mesma mídia. Por isso ela é resolvida
      // aqui e passada junto com os componentes.
      const midia = campanha.midia_id
        ? { tipo: campanha.midia_tipo, mediaId: campanha.midia_id, nome: campanha.midia_nome }
        : null;
      const componentes = montarComponents(campanha.template_conteudo, msg.variaveis ?? {}, midia);
      const r = await metaService.enviarMensagem(
        normalizarParaMeta(msg.telefone),
        campanha.meta_name,
        campanha.idioma || "pt_BR",
        componentes,
        "DISPARO_CAMPANHA",
      );
      await d.execute(sql`
        UPDATE whatsapp_mensagens SET
          estado_fila = 'ENVIADA',
          status = 'ENVIADA',
          meta_message_id = ${r?.messages?.[0]?.id ?? null},
          enviado_em = now(),
          tentativas = ${tentativa + 1},
          erro_codigo = NULL, erro_mensagem = NULL,
          atualizado_em = now()
        WHERE id = ${msg.id}::uuid
      `);
      return { ok: true, metaMessageId: r?.messages?.[0]?.id ?? null };
    } catch (e: any) {
      erro = e;
      const transitorio = e instanceof MetaApiError ? e.transitorio : true;
      if (!transitorio) break;
      tentativa++;
      // Backoff exponencial, com teto em 30 min.
      const espera = Math.min(30, 2 ** tentativa) * 60 * 1000;
      await d.execute(sql`
        UPDATE whatsapp_mensagens SET
          tentativas = ${tentativa},
          proxima_tentativa_em = now() + (${espera} / 1000 || ' seconds')::interval,
          erro_codigo = ${e instanceof MetaApiError ? String(e.code ?? "") : null},
          erro_mensagem = ${String(e?.message ?? e).slice(0, 500)},
          atualizado_em = now()
        WHERE id = ${msg.id}::uuid
      `);
      console.warn(
        `[disparo] retry ${tentativa}/${MAX_TENTATIVAS} para ${msg.telefone}: ${e?.message}`,
      );
      // Espera real entre tentativas: backoff só no banco não impede o loop
      // de reenviar no mesmo tick, que é o que estoura o rate limit.
      await new Promise((r) => setTimeout(r, Math.min(espera, 30_000)));
    }
  }

  const e = erro as MetaApiError;
  const permanente = e instanceof MetaApiError ? !e.transitorio : false;
  const numeroInexistente = e instanceof MetaApiError ? e.numeroInexistente : false;

  // Mensagem sem mapeamento preenchido não é erro da Meta: é configuração.
  // Ficar em FALHOU faria a tela sugerir "tentar de novo", que nunca resolve.
  const estado = /Preencha \{\{\d+\}\}/.test(String(e?.message ?? "")) ? "IGNORADA" : "FALHOU";

  await d.execute(sql`
    UPDATE whatsapp_mensagens SET
      estado_fila = ${estado},
      status = 'FALHOU',
      tentativas = ${tentativa},
      erro_codigo = ${e instanceof MetaApiError ? String(e.code ?? "") : null},
      erro_mensagem = ${String(e?.message ?? e).slice(0, 500)},
      atualizado_em = now()
    WHERE id = ${msg.id}::uuid
  `);

  // Número inexistente é definitivo: marcar o contato evita reprocessar o erro
  // em todas as campanhas futuras.
  if (numeroInexistente) {
    if (msg.comprador_id) {
      await d.execute(sql`
        UPDATE profiles SET whatsapp_status = 'INVALIDO' WHERE id = ${msg.comprador_id}::uuid
      `);
    }
    if (msg.contato_marketing_id) {
      await d.execute(sql`
        UPDATE marketing_contatos SET whatsapp_status = 'invalido' WHERE id = ${msg.contato_marketing_id}::uuid
      `);
    }
  }

  return {
    ok: false,
    permanente,
    numeroInexistente,
    mensagem: String(e?.message ?? e),
    codigo: e instanceof MetaApiError ? String(e.code ?? "") : null,
  };
}

async function atualizarContadores(campanhaId: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT
      count(*) FILTER (WHERE estado_fila = 'ENVIADA') AS enviados,
      count(*) FILTER (WHERE estado_fila = 'FALHOU') AS falhas,
      count(*) FILTER (WHERE estado_fila = 'IGNORADA') AS ignoradas,
      count(*) FILTER (WHERE estado_fila IN ('PENDENTE', 'RESERVADA')) AS restantes,
      count(*) FILTER (WHERE status = 'ENTREGUE') AS entregues,
      count(*) FILTER (WHERE status = 'LIDA') AS lidas
    FROM whatsapp_mensagens WHERE campanha_id = ${campanhaId}::uuid
  `);
  const c = rowsOf(res)[0] ?? {};
  await d.execute(sql`
    UPDATE whatsapp_campanhas SET
      total_enviados = ${Number(c.enviados ?? 0)},
      total_falhas = ${Number(c.falhas ?? 0) + Number(c.ignoradas ?? 0)},
      total_entregues = ${Number(c.entregues ?? 0)},
      total_lidos = ${Number(c.lidas ?? 0)},
      atualizado_em = now()
    WHERE id = ${campanhaId}::uuid
  `);
  return c;
}

async function processarCampanha(campanha: any, workerId: string) {
  const d = requireDb();
  const agora = new Date();

  const inicio = horaDe(campanha.janela_inicio);
  const fim = horaDe(campanha.janela_fim);

  if (!dentroDaJanela(agora, inicio, fim)) {
    // Fora da janela: adia para a próxima abertura em vez de descartar, senão a
    // campanha perde os contatos que não couberam hoje.
    await d.execute(sql`
      UPDATE whatsapp_campanhas SET status = 'AGUARDANDO', atualizado_em = now()
      WHERE id = ${campanha.id}::uuid
    `);
    return;
  }

  const intervalo = Math.max(1, Number(campanha.intervalo_minutos ?? 5));
  if (campanha.ultimo_envio_em) {
    const desdeUltimo = (agora.getTime() - new Date(campanha.ultimo_envio_em).getTime()) / 60000;
    if (desdeUltimo < intervalo) return;
  }

  const lote = await reservarLote(campanha.id, workerId);
  if (!lote.length) {
    const c = await atualizarContadores(campanha.id);
    if (Number(c.restantes ?? 0) === 0) {
      await d.execute(sql`
        UPDATE whatsapp_campanhas SET status = 'CONCLUIDA', concluido_em = now(), atualizado_em = now()
        WHERE id = ${campanha.id}::uuid
      `);
    }
    return;
  }

  let enviados = 0;
  let falhas = 0;
  for (const msg of lote) {
    const r = await enviarComRetry(msg, campanha);
    if (r.ok) enviados++;
    else falhas++;
  }

  await d.execute(sql`
    UPDATE whatsapp_campanhas SET
      ultimo_envio_em = now(),
      total_enviados = total_enviados + ${enviados},
      total_falhas = total_falhas + ${falhas},
      atualizado_em = now()
    WHERE id = ${campanha.id}::uuid
  `);
  await atualizarContadores(campanha.id);
}

/**
 * Uma passada do motor. Chamado pelo worker no servidor; seguro para rodar em
 * paralelo porque a reserva usa SKIP LOCKED.
 */
export async function processarDisparo(opts: { apenasAgendadas?: boolean } = {}) {
  const d = requireDb();

  // O worker roda no boot, antes de qualquer request — e o migrateDb só roda em
  // request. Sem garantir o schema aqui, o primeiro tick quebraria.
  const { ensureComunicacoesSchema } = await import("./comunicacoes.server");
  await ensureComunicacoesSchema();
  const { ensureMarketingSchema } = await import("./marketing.server");
  await ensureMarketingSchema();

  await recuperarDisparosInterrompidos();

  const workerId = `${process.pid}-${Date.now().toString(36)}`;

  await d.execute(sql`
    UPDATE whatsapp_campanhas
    SET status = 'PROCESSANDO', iniciado_em = COALESCE(iniciado_em, now()), atualizado_em = now()
    WHERE status IN ('AGENDADA', 'AGUARDANDO')
      AND (agendado_para IS NULL OR agendado_para <= now())
  `);

  const res = await d.execute(sql`
    SELECT c.*, t.meta_name, t.idioma, t.conteudo as template_conteudo, t.status as template_status,
      t.midia_id, t.midia_tipo, t.midia_nome
    FROM whatsapp_campanhas c
    LEFT JOIN whatsapp_templates t ON t.id = c.template_id
    WHERE c.status = 'PROCESSANDO'
    ORDER BY c.criado_em
    LIMIT 20
  `);
  const campanhas = rowsOf(res);
  const resumo = { campanhas: campanhas.length, enviados: 0, falhas: 0, bloqueadas: 0 };

  for (const campanha of campanhas) {
    // Campanha do canal Meta precisa de template: sem ele a chamada à Meta
    // quebra no primeiro envio. O wizard aceita template_id vazio (campanha
    // de texto livre), então aqui a tratamos como indisponível.
    if ((campanha.canal_envio ?? "META") === "META" && !campanha.template_id) {
      await d.execute(sql`
        UPDATE whatsapp_campanhas SET status = 'TEMPLATE_INDESPONIVEL', atualizado_em = now()
        WHERE id = ${campanha.id}::uuid
      `);
      console.warn(
        `[disparo] campanha "${campanha.nome}" bloqueada: canal META sem template`,
      );
      resumo.bloqueadas++;
      continue;
    }

    // Template não aprovado não pode ser enviado: a Meta rejeita toda mensagem.
    // Bloquear a campanha é mais honesto do que queimar a fila inteira.
    // Na Uazapi não há aprovação — o texto sai direto — então o gate não se aplica.
    if (
      (campanha.canal_envio ?? "META") === "META" &&
      campanha.template_status &&
      campanha.template_status !== "APPROVED"
    ) {
      await d.execute(sql`
        UPDATE whatsapp_campanhas SET status = 'TEMPLATE_INDESPONIVEL', atualizado_em = now()
        WHERE id = ${campanha.id}::uuid
      `);
      console.warn(
        `[disparo] campanha "${campanha.nome}" bloqueada: template em ${campanha.template_status}`,
      );
      resumo.bloqueadas++;
      continue;
    }
    try {
      await processarCampanha(campanha, workerId);
    } catch (e: any) {
      console.error(`[disparo] falha na campanha ${campanha.id}:`, e?.message || e);
    }
  }

  // Campaign whose template became approved later needs to be unblocked.
  await d.execute(sql`
    UPDATE whatsapp_campanhas c SET status = 'AGUARDANDO', atualizado_em = now()
    FROM whatsapp_templates t
    WHERE c.template_id = t.id AND c.status = 'TEMPLATE_INDESPONIVEL' AND t.status = 'APPROVED'
  `);

  if (resumo.campanhas) {
    const cont = await d.execute(sql`
      SELECT
        count(*) FILTER (WHERE estado_fila = 'ENVIADA') AS enviados,
        count(*) FILTER (WHERE estado_fila IN ('FALHOU', 'IGNORADA')) AS falhas
      FROM whatsapp_mensagens
      WHERE campanha_id IN (SELECT id FROM whatsapp_campanhas WHERE status IN ('PROCESSANDO','CONCLUIDA'))
    `);
    const c = rowsOf(cont)[0] ?? {};
    resumo.enviados = Number(c.enviados ?? 0);
    resumo.falhas = Number(c.falhas ?? 0);
  }
  return resumo;
}

/**
 * Dados do veículo no formato que o mapeamento de variáveis consome
 * (`veiculo.marca`, `veiculo.ano`, ...). Vazio quando a campanha não tem
 * veículo — aí só entram variáveis de contato e texto livre.
 */
async function contextoVeiculo(veiculoId: string | null | undefined) {
  if (!veiculoId) return null;
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT
      v.id, v.placa, v.marca, v.modelo, v.cor, v.km,
      v.valor_interesse_cliente, v.status_analise,
      -- Ano de fabricação e modelo podem diferir; o template pede "ano", então
      -- o modelo (o que aparece no documento) vence quando existe.
      coalesce(v.ano_modelo, v.ano_fabricacao) AS ano,
      p.nome AS vendedor_nome, p.telefone AS vendedor_telefone
    FROM veiculos v
    LEFT JOIN profiles p ON (p.id = v.perfil_id OR p.id = v.vendedor_id)
    WHERE v.id = ${veiculoId}::uuid
    LIMIT 1
  `);
  const l: any = rowsOf(res)[0];
  if (!l) return null;

  const preco = brl.format(Number(l.valor_interesse_cliente ?? 0));
  const nomeCompleto = [l.marca, l.modelo].filter(Boolean).join(" ");

  return {
    veiculo: {
      id: l.id,
      marca: l.marca ?? "",
      modelo: l.modelo ?? "",
      nome_completo: nomeCompleto,
      // Template costuma ter só "ano"; ano_modelo é o que aparece no documento.
      ano: l.ano_modelo != null ? String(l.ano_modelo) : "",
      placa: l.placa ?? "",
      cor: l.cor ?? "",
      km: l.km != null ? `${km.format(Number(l.km))} km` : "",
      valor: l.valor_interesse_cliente != null ? preco : "",
    },
    anuncio: {
      titulo: nomeCompleto,
      url: "",
    },
    vendedor: {
      nome: l.vendedor_nome ?? "",
      telefone: l.vendedor_telefone ?? "",
    },
  };
}

/**
 * Pega um contato real para prévia e teste — o motor de fila já resolve o
 * público; aqui é o mesmo critério, mas a fila inteira é pesada demais para a
 * tela. Usa a mesma fonte (`resolverPublico`) e o mesmo mapeamento.
 */
/**
 * Cria uma campanha Uazapi para os grupos alvo com texto + foto (opcional).
 * Usada pela automação VEICULO_PUBLICADO — o motor respeita a janela e o
 * intervalo. `variaveis` carrega a foto para o ramo Uazapi de enviarComRetry.
 */
export async function criarCampanhaDisparoGrupos(opts: {
  nome: string;
  veiculo_id: string;
  grupos_alvo: string[];
  texto: string;
  foto?: string | null;
  janela_inicio?: string;
  janela_fim?: string;
  intervalo_minutos?: number;
  enviar_agora?: boolean;
}) {
  const d = requireDb();
  const { rowsOf } = await import("./comunicacoes.server");

  const res = await d.execute(sql`
    INSERT INTO whatsapp_campanhas (nome, veiculo_id, template_id, status, canal_envio, grupos_alvo, janela_inicio, janela_fim, intervalo_minutos)
    VALUES (
      ${opts.nome},
      ${opts.veiculo_id}::uuid,
      NULL,
      ${opts.enviar_agora ? "AGUARDANDO" : "RASCUNHO"},
      'UAZAPI',
      ${JSON.stringify(opts.grupos_alvo)}::jsonb,
      ${opts.janela_inicio || "08:00"},
      ${opts.janela_fim || "18:00"},
      ${opts.intervalo_minutos || 5}
    )
    RETURNING id
  `);
  const campanhaId = rowsOf(res)[0]?.id;
  if (!campanhaId) throw new Error("Falha ao criar campanha de grupos.");

  // Uma linha por grupo: origem GRUPO_UAZAPI, telefone = JID @g.us.
  await d.execute(sql`
    INSERT INTO whatsapp_mensagens (campanha_id, telefone, origem, estado_fila, variaveis)
    SELECT
      ${campanhaId}::uuid,
      g.grupo,
      'GRUPO_UAZAPI',
      'PENDENTE',
      ${JSON.stringify({ texto: opts.texto, foto_capa: opts.foto || null })}::jsonb
    FROM unnest(${JSON.stringify(opts.grupos_alvo)}::text[]) AS g(grupo)
    ON CONFLICT (campanha_id, telefone) DO NOTHING
  `);

  await d.execute(sql`
    UPDATE whatsapp_campanhas SET total_destinatarios = (
      SELECT count(*) FROM whatsapp_mensagens WHERE campanha_id = ${campanhaId}::uuid
    ) WHERE id = ${campanhaId}::uuid
  `);

  return { campanhaId };
}

export async function exemploDestinatario(criterio: {
  veiculoId?: string | null;
  mapeamento?: Record<string, string>;
  origem?: string;
}) {
  const { resolverPublico } = await import("./publico.server");
  const destinatarios = await resolverPublico({
    origem: (criterio.origem as any) ?? "AMBOS",
  });
  const primeiro = destinatarios[0];
  if (!primeiro) return null;
  const contexto = await contextoVeiculo(criterio.veiculoId ?? null);
  const mapeamento = criterio.mapeamento ?? {};
  const valores = valoresDoTemplate(
    { conteudo: null },
    mapeamento,
    {
      nome: primeiro.nome ?? "",
      email: primeiro.email ?? "",
      telefone: primeiro.telefone,
    },
    contexto,
  );
  return {
    nome: primeiro.nome ?? "",
    email: primeiro.email ?? null,
    telefone: primeiro.telefone,
    origem: primeiro.origem,
    variaveis: valores,
  };
}

/**
 * Popula a fila de uma campanha a partir do público resolvido.
 * Usa INSERT ... SELECT quando dá, mas a montagem por lote é necessária para
 * anexar as variáveis já calculadas por destinatário.
 */
export async function popularFilaCampanha(
  campanhaId: string,
  criterio: CriterioPublico & { veiculoId?: string | null; mapeamento?: Record<string, string> },
) {
  const d = requireDb();
  const publicos = await resolverPublico(criterio);
  const contexto = await contextoVeiculo((criterio as any).veiculoId);
  let inseridos = 0;
  let ignorados = 0;

  for (const p of publicos) {
    try {
      // Variáveis resolvidas aqui, enquanto nome e telefone estão à mão. Se
      // fossem calculadas no worker, ele buscaria o contato de novo para cada
      // mensagem, a cada rodada.
      const variaveis = valoresDoTemplate(
        { conteudo: null },
        (criterio as any).mapeamento ?? {},
        p,
        contexto,
      );
      // ON CONFLICT DO NOTHING não avisa quando ignora: sem o RETURNING o
      // contador subia mesmo sem inserir e a campanha exibia destinatários que
      // nunca entraram na fila.
      const res = await d.execute(sql`
        INSERT INTO whatsapp_mensagens
          (campanha_id, comprador_id, contato_marketing_id, telefone, origem, estado_fila, variaveis)
        VALUES (
          ${campanhaId}::uuid,
          ${p.comprador_id}::uuid,
          ${p.contato_marketing_id}::uuid,
          ${p.telefone},
          ${p.origem},
          'PENDENTE',
          ${JSON.stringify(variaveis)}::jsonb
        )
        ON CONFLICT (campanha_id, telefone) DO NOTHING
        RETURNING id
      `);
      if (Array.isArray(res) && res.length > 0) inseridos++;
    } catch (e: any) {
      console.warn(`[disparo] não enfileirou ${p.telefone}: ${e?.message || e}`);
      ignorados++;
    }
  }

  await d.execute(sql`
    UPDATE whatsapp_campanhas SET total_destinatarios = ${inseridos}, atualizado_em = now()
    WHERE id = ${campanhaId}::uuid
  `);
  return { inseridos, ignorados, total: publicos.length };
}

export { proximaAbertura };
