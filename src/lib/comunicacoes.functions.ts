import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sql } from "drizzle-orm";
import * as db from "../db/comunicacoes.server";
import { metaService, montarComponents } from "../db/meta-whatsapp.server";
import { normalizarStatusTemplate, templateAprovado } from "../db/whatsapp-status";
import { normalizarParaMeta } from "../db/publico.server";
import { mensagemErroPostgres } from "../db/erro-postgres";
import { hojeEmSaoPaulo } from "./brasil";

/**
 * Traduz o erro de criação de template da Meta para algo que o admin possa
 * corrigir.
 *
 * A Meta responde "Invalid parameter" (código 100) sem dizer qual campo
 * recusou. O código mais comum na criação é o HEADER de imagem sem o HANDLE do
 * asset — e a mensagem crua não ajuda ninguém. Aqui o erro vira uma frase que
 * diz o que fazer.
 */
function explicarErroCriacaoTemplate(error: any): string {
  const original = mensagemErroPostgres(error);
  const corpo = (error as any)?.erroOriginal?.error ?? null;
  const codigo = (error as any)?.code ?? corpo?.code ?? null;
  const subcodigo = corpo?.error_subcode ?? null;
  const detalhes = corpo?.error_data?.details ?? null;
  const bruto = [original, subcodigo, detalhes].filter(Boolean).join(" ");

  if (/invalid parameter|parameter value is not valid/i.test(bruto) || codigo === 100) {
    const extra = [
      subcodigo ? `Subcódigo ${subcodigo}.` : "",
      detalhes ? `Detalhe da Meta: ${detalhes}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      `A Meta recusou o template como "parâmetro inválido" (código 100) e não diz qual campo foi. ` +
      `${extra} Causas comuns: o cabeçalho com imagem sem o anexo anexado, o corpo com variável ` +
      `{{1}} sem exemplo, um link no corpo do texto, ou o nome do template já existente. ` +
      `O payload exato que foi enviado está na aba "Logs" desta tela.`
    );
  }

  if (/2388273/i.test(bruto)) {
    return (
      `A Meta recusou o cabeçalho com imagem porque o anexo não foi reconhecido. ` +
      `Selecione a imagem novamente antes de criar o template.`
    );
  }

  if (/2388047/i.test(bruto)) {
    return `O formato do cabeçalho é inválido para a Meta. Verifique se é imagem ou PDF.`;
  }

  if (/2388072/i.test(bruto)) {
    return (
      `A Meta recusou o corpo do template. Verifique as variáveis ({{1}}, {{2}}...) — ` +
      `elas precisam ser numeradas em sequência, sem pular números.`
    );
  }

  return original;
}

export const getWhatsappConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  const config = await db.getWhatsappConfig();
  if (config) {
    return {
      ...config,
      app_secret: config.app_secret ? "••••••••••••" : null,
      access_token: config.access_token ? "••••••••••••" : null,
      webhook_verify_token: config.webhook_verify_token ? "••••••••••••" : null,
    };
  }
  return config;
});

export const updateWhatsappConfigFn = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    try {
      // Sem `data`, todos os campos viram null e o COALESCE do UPDATE preserva
      // o que já estava salvo: o salvamento passa silenciosamente. Melhor falhar.
      if (!data || typeof data !== "object") {
        throw new Error(
          "Nenhum dado foi recebido pelo servidor. Recarregue a página e tente salvar de novo.",
        );
      }

      const texto = (v: any) => (typeof v === "string" ? v.trim() : v);

      // A Meta responde "Object with ID '1338... - phone number id 1028...' does not
      // exist" quando o campo recebe o trecho inteiro da tela colado. Sem esta
      // checagem, o erro só aparece depois, com mensagem críptica e em inglês.
      for (const campo of ["waba_id", "phone_number_id"]) {
        const valor = data?.[campo] === "••••••••••••" ? "" : texto(data?.[campo]);
        if (valor && !/^\d+$/.test(String(valor))) {
          throw new Error(
            `O campo ${
              campo === "waba_id" ? "WABA ID" : "Phone Number ID"
            } deve conter apenas números. Você colou um trecho da tela da Meta — copie somente o número.`,
          );
        }
      }

      const existing = await db.getWhatsappConfig();

      // O formulário abre com a linha inteira do banco, que traz campos de
      // leitura (id, criado_em, ultimo_teste...) como Date e o placeholder
      // "••••••••••••" no lugar dos segredos. Enviar tudo isso ao UPDATE
      // quebra a query e, pior, grava a máscara por cima da senha real.
      // Então: allowlist dos campos editáveis + preserva segredos não alterados.
      const editable = [
        "waba_id",
        "phone_number_id",
        "business_id",
        "phone_number",
        "app_id",
        "graph_api_version",
        "status",
      ];
      const updateData: any = {};
      for (const campo of editable) {
        updateData[campo] = data?.[campo] === "••••••••••••" ? null : texto(data?.[campo]) || null;
      }
      for (const segredo of ["app_secret", "access_token", "webhook_verify_token"]) {
        const enviado = texto(data?.[segredo]);
        updateData[segredo] =
          enviado && enviado !== "••••••••••••" ? enviado : (existing?.[segredo] ?? null);
      }

      return await db.updateWhatsappConfig(updateData);
    } catch (error: any) {
      console.error("[WhatsApp] Erro ao salvar configuração:", error);
      return { ok: false, error: mensagemErroPostgres(error) || "Erro ao salvar configuração." };
    }
  });

export const listarTemplatesFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return await db.listarTemplates();
  } catch (error: any) {
    // Sem isto, a tela recebia a mensagem crua do Drizzle ("Failed query:
    // SELECT ... params: ..."), que não diz nada do motivo. A causa real
    // (SQLSTATE, coluna que falta) vive no `.cause`.
    const motivo = mensagemErroPostgres(error);
    console.error("[WhatsApp] Erro ao listar templates:", motivo);
    throw new Error(motivo);
  }
});

export const listarSegmentosFn = createServerFn({ method: "GET" }).handler(async () => {
  return db.listarSegmentos();
});

export const listarContatosWhatsappFn = createServerFn({ method: "GET" })
  .validator((data: any) =>
    z
      .object({
        busca: z.string().optional(),
        apenasElegiveis: z.boolean().optional(),
        origem: z.enum(["COMPRADORES", "IMPORTADOS", "AMBOS"]).optional(),
        tagIds: z.array(z.string().uuid()).optional(),
        limite: z.number().int().positive().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { listarContatos } = await import("@/db/publico.server");
    return listarContatos({
      busca: data.busca ?? null,
      apenasElegiveis: data.apenasElegiveis ?? false,
      origem: data.origem ?? null,
      tagIds: data.tagIds ?? null,
      limite: data.limite ?? null,
    });
  });

export const listarSegmentosComTotalFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listarSegmentosComTotal } = await import("@/db/publico.server");
  const { ensureComunicacoesSchema } = await import("@/db/comunicacoes.server");
  await ensureComunicacoesSchema();
  return listarSegmentosComTotal();
});

/**
 * POST aqui é de propósito: TanStack Start executa `createServerFn` GET no
 * navegador, onde DATABASE_URL não existe. Como `useServerFn` chama a função
 * diretamente, uma função GET que toca o banco sempre retornava vazio — por
 * isso a lista de contatos nunca aparecia.
 */
export const contarPublicoFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        origem: z.enum(["COMPRADORES", "IMPORTADOS", "AMBOS"]).optional(),
        uf: z.string().optional(),
        cidade: z.string().optional(),
        tagIds: z.array(z.string().uuid()).optional(),
        statusCompliance: z.string().optional(),
        busca: z.string().optional(),
        tipo: z.string().optional(),
        segmentoId: z.string().optional(),
        loteId: z.string().optional(),
        apenasNaoEnviados: z.boolean().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { contarPublico } = await import("@/db/publico.server");
    return {
      total: await contarPublico({
        origem: data.origem ?? "AMBOS",
        uf: data.uf ?? null,
        cidade: data.cidade ?? null,
        tagIds: data.tagIds ?? null,
        statusCompliance: data.statusCompliance ?? null,
        busca: data.busca ?? null,
        tipo: data.tipo ?? null,
        segmentoId: data.segmentoId ?? null,
        loteId: data.loteId ?? null,
        apenasNaoEnviados: data.apenasNaoEnviados ?? null,
      }),
    };
  });

export const criarCampanhaDisparoFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        // Nome é opcional no validador: o handler preenche "Campanha <data>"
        // quando vem vazio. O `min(1)` barrava antes disso com "too_small" no
        // path ["nome"] em todo caminho do wizard que não passa por um campo de
        // nome — o atalho "Usar em campanha" (segmento) entra direto na etapa
        // de ritmo e mandava nome em branco.
        nome: z.string().trim().max(200).optional().nullable(),
        // Template é opcional: campanha de texto livre (ou de grupos Uazapi)
        // não passa pela Meta e pode nascer sem template nenhum.
        template_id: z.string().uuid().optional().or(z.literal("")).nullable(),
        veiculo_id: z.string().uuid().optional().nullable(),
        segmento_id: z.string().uuid().optional().nullable(),
        origem_publico: z.enum(["COMPRADORES", "IMPORTADOS", "AMBOS"]).default("AMBOS"),
        tag_ids: z.array(z.string().uuid()).optional(),
        // `null` é o que a tela manda quando não há seleção manual — por isso
        // precisa aceitar null e não só undefined: com `.optional()` o Zod
        // barrava null com "expected: array" e a campanha não saía.
        contato_ids: z.array(z.string().uuid()).optional().nullable(),
        apenasNaoEnviados: z.boolean().optional(),
        janela_inicio: z.string().optional().nullable(),
        janela_fim: z.string().optional().nullable(),
        intervalo_minutos: z.number().int().min(1).max(1440).default(5),
        agendado_para: z.string().optional().nullable(),
        filtros: z.any().optional(),
        mapeamento_variaveis: z.record(z.string(), z.string()).optional(),
        enviar_agora: z.boolean().optional(),
        // Quem entrega: META (template oficial) ou UAZAPI (conexão nova —
        // a única rota que aceita grupos). Grupos só fazem sentido na UAZAPI.
        canal_envio: z.enum(["META", "UAZAPI"]).default("META"),
        grupos_alvo: z.array(z.string()).optional(),
        // Imagem do cabeçalho escolhida no wizard da campanha. A Meta não
        // permite editar um template já aprovado, então a troca de imagem
        // acontece aqui: a campanha carrega a sua mídia e o motor a prefere
        // sobre a do template.
        midia_id: z.string().optional().nullable(),
        midia_tipo: z.string().optional().nullable(),
        midia_nome: z.string().optional().nullable(),
        midia_arquivo_id: z.string().uuid().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    // Precisa sobreviver ao try/catch: quando o INSERT funciona mas a montagem
    // da fila falha, é a campanha já criada que tem que receber o log do
    // erro — sem esse id fora do try a falha ficava sem rastro.
    let campanhaIdCriada: string | null = null;
    try {
      const { db: dbc } = await import("@/db/index");
      const { ensureComunicacoesSchema } = await import("@/db/comunicacoes.server");
      const { popularFilaCampanha } = await import("@/db/disparo-motor.server");
      if (!dbc) throw new Error("Banco indisponível.");
      await ensureComunicacoesSchema();

      // O driver postgres-js devolve as linhas direto no array, não em { rows }.
      // Os campos opcionivos vêm do formulário como string vazia quando o
      // usuário não escolhe nada, e `?? null` só troca null/undefined — a
      // string vazia passava reta e morria no cast ::uuid ("Failed query").
      const uuidOuNull = (v: unknown) => {
        const s = typeof v === "string" ? v.trim() : "";
        return s ? s : null;
      };
      const templateId = uuidOuNull(data.template_id);
      // O wizard deixa o nome em branco quando o usuário só escolhe público e
      // template. Nome é NOT NULL na tabela e o validador exige min(1), então
      // sem isso o envio volta como "too_small" no path ["nome"].
      const nomeCampanha = String(data.nome || "").trim() || `Campanha ${hojeEmSaoPaulo()}`;
      const criado = templateId
        ? await dbc.execute(sql`
            INSERT INTO whatsapp_campanhas (
              nome, veiculo_id, template_id, segmento_id, origem_publico,
              janela_inicio, janela_fim, intervalo_minutos, status, agendado_para, mapeamento_variaveis,
              canal_envio, grupos_alvo, midia_id, midia_tipo, midia_nome, midia_arquivo_id
            ) VALUES (
              ${nomeCampanha},
              ${uuidOuNull(data.veiculo_id)},
              ${templateId}::uuid,
              ${uuidOuNull(data.segmento_id)},
              ${data.origem_publico},
              ${data.janela_inicio || null},
              ${data.janela_fim || null},
              ${data.intervalo_minutos},
              ${data.enviar_agora ? "AGUARDANDO" : data.agendado_para ? "AGENDADA" : "RASCUNHO"},
              ${data.agendado_para || null},
              ${JSON.stringify(data.mapeamento_variaveis ?? {})}::jsonb,
              ${data.canal_envio},
              ${JSON.stringify(
                (data.canal_envio === "UAZAPI" ? data.grupos_alvo : []) ?? [],
              )}::jsonb,
              ${data.midia_id || null},
              ${data.midia_tipo || null},
              ${data.midia_nome || null},
              ${data.midia_arquivo_id || null}
            ) RETURNING id
          `)
        : await dbc.execute(sql`
            INSERT INTO whatsapp_campanhas (
              nome, veiculo_id, template_id, segmento_id, origem_publico,
              janela_inicio, janela_fim, intervalo_minutos, status, agendado_para, mapeamento_variaveis,
              canal_envio, grupos_alvo
            ) VALUES (
              ${nomeCampanha},
              ${uuidOuNull(data.veiculo_id)},
              NULL,
              ${uuidOuNull(data.segmento_id)},
              ${data.origem_publico},
              ${data.janela_inicio || null},
              ${data.janela_fim || null},
              ${data.intervalo_minutos},
              ${data.enviar_agora ? "AGUARDANDO" : data.agendado_para ? "AGENDADA" : "RASCUNHO"},
              ${data.agendado_para || null},
              ${JSON.stringify(data.mapeamento_variaveis ?? {})}::jsonb,
              ${data.canal_envio},
              ${JSON.stringify(
                (data.canal_envio === "UAZAPI" ? data.grupos_alvo : []) ?? [],
              )}::jsonb
            ) RETURNING id
          `);
      const campanhaId = (criado as any[])[0].id;
      campanhaIdCriada = campanhaId;

      const { registrarLogCampanha } = await import("../db/logs-campanha.server");
      await registrarLogCampanha({
        campanhaId,
        acao: "CRIADA",
        detalhe: `Campanha "${nomeCampanha}" criada com status ${data.enviar_agora ? "AGUARDANDO" : data.agendado_para ? "AGENDADA" : "RASCUNHO"}.`,
        payload: {
          canal_envio: data.canal_envio,
          janela_inicio: data.janela_inicio,
          janela_fim: data.janela_fim,
          intervalo_minutos: data.intervalo_minutos,
          agendado_para: data.agendado_para ?? null,
        },
      });

      // Grupo é destino, não contato: a fila nasce com uma linha por grupo e
      // o telefone é o próprio id do grupo — assim o worker não precisa de
      // um público resolvido para essa campanha.
      if (data.canal_envio === "UAZAPI" && (data.grupos_alvo ?? []).length) {
        await dbc.execute(sql`
          INSERT INTO whatsapp_mensagens
            (campanha_id, telefone, origem, estado_fila, variaveis)
          SELECT
            ${campanhaId}::uuid,
            g.grupo,
            'GRUPO_UAZAPI',
            'PENDENTE',
            '{}'::jsonb
          FROM unnest(${JSON.stringify(
            (data.grupos_alvo as string[]) ?? [],
          )}::text[]) AS g(grupo)
          ON CONFLICT DO NOTHING
        `);
        await dbc.execute(sql`
          UPDATE whatsapp_campanhas SET total_destinatarios = ${(data.grupos_alvo ?? []).length},
            atualizado_em = now()
          WHERE id = ${campanhaId}::uuid
        `);
        return { ok: true, id: campanhaId, inseridos: (data.grupos_alvo ?? []).length, ignorados: 0 };
      }

      const fila = await popularFilaCampanha(campanhaId, {
        origem: data.origem_publico,
        uf: data.filtros?.uf ?? null,
        cidade: data.filtros?.cidade ?? null,
        tipo: data.filtros?.tipo ?? null,
        // A tag tem que chegar ao motor: sem ela a fila era montada com "todos
        // os prospects" e a campanha mirava a base inteira em vez da etiqueta.
        tagIds: data.tag_ids ?? data.filtros?.tagIds ?? null,
        contatoIds: data.contato_ids ?? data.filtros?.contatoIds ?? null,
        // "So novos": tira da fila quem ja recebeu alguma campanha antes. Sem
        // isto a tela estimava 140 novos mas a fila entrava com todo mundo.
        apenasNaoEnviados: data.apenasNaoEnviados ?? data.filtros?.apenasNaoEnviados ?? null,
        // A UI manda `filtros.status`; a estimativa já lê esse campo como
        // statusCompliance. Sem este alias a fila ignorava o filtro que a
        // tela mostrava — a estimativa apontava 2 elegíveis e a fila entrava
        // vazia.
        statusCompliance: data.filtros?.status ?? data.filtros?.statusCompliance ?? null,
        mapeamento: data.mapeamento_variaveis ?? {},
        // Sem o veículo no critério, as variáveis `veiculo.*` entravam vazias e
        // a Meta recusava o template. O motor busca o veículo uma vez e reúso
        // para todos os destinatários.
        veiculoId: data.veiculo_id ?? data.filtros?.veiculo_id ?? null,
      } as any);

      return { ok: true, id: campanhaId, ...fila };
    } catch (error: any) {
      // A campanha é o lugar onde o erro tem que aparecer: sem esta gravação a
      // tela mostrava "Erro ao criar campanha" e o histórico da campanha
      // ficava vazio, sem nenhuma pista do que quebrou.
      const detalhe = mensagemErroPostgres(error) || "Erro ao criar campanha.";
      try {
        const { registrarLogCampanha } = await import("../db/logs-campanha.server");
        await registrarLogCampanha({
          campanhaId: campanhaIdCriada,
          acao: "ERRO",
          detalhe: `Falha ao criar a campanha: ${detalhe.slice(0, 900)}`,
          payload: { erro: detalhe.slice(0, 900), etapa: "CRIACAO_CAMPANHA" },
        });
      } catch (e) {
        console.error("[campanha] falha ao registrar log de erro:", e);
      }
      return { ok: false, error: detalhe };
    }
  });

export const listarCampanhasDetalhadoFn = createServerFn({ method: "GET" }).handler(async () => {
  const { db: dbc } = await import("@/db/index");
  const { ensureComunicacoesSchema } = await import("@/db/comunicacoes.server");
  if (!dbc) return [];
  await ensureComunicacoesSchema();
  const lista = await dbc.execute(sql`
      SELECT c.*, v.marca, v.modelo, v.placa, t.nome_interno as template_nome, t.status as template_status
      FROM whatsapp_campanhas c
      LEFT JOIN veiculos v ON v.id = c.veiculo_id
      LEFT JOIN whatsapp_templates t ON t.id = c.template_id
      ORDER BY c.criado_em DESC
    `);
  return lista as any[];
});

export const alterarStatusCampanhaFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["RASCUNHO", "AGUARDANDO", "AGENDADA", "PAUSADA", "CANCELADA"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const { db: dbc } = await import("@/db/index");
      if (!dbc) throw new Error("Banco indisponível.");
      await dbc.execute(sql`
        UPDATE whatsapp_campanhas SET status = ${data.status}, atualizado_em = now()
        WHERE id = ${data.id}::uuid
      `);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });

/**
 * Edição segura de campanha: permite ajustar nome, horário agendado, janela
 * de trabalho e intervalo entre mensagens. Não altera público, template,
 * mapeamento de variáveis ou mídias (para evitar inconsistências com a fila
 * já gerada).
 */
export const atualizarCampanhaFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        id: z.string().uuid(),
        nome: z.string().min(1).max(150).optional(),
        agendado_para: z.string().datetime().nullable().optional(),
        janela_inicio: z.string().max(10).nullable().optional(),
        janela_fim: z.string().max(10).nullable().optional(),
        intervalo_minutos: z.number().int().min(1).max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const { db: dbc } = await import("@/db/index");
      if (!dbc) throw new Error("Banco indisponível.");
      const sets: any[] = [];
      if (data.nome !== undefined) sets.push(sql`nome = ${data.nome.trim() || "Campanha Geral"}`);
      if (data.agendado_para !== undefined) {
        if (data.agendado_para === null || data.agendado_para === "") {
          sets.push(sql`agendado_para = NULL`);
        } else {
          const d = new Date(data.agendado_para);
          if (Number.isNaN(d.getTime())) throw new Error("Horário de agendamento inválido.");
          sets.push(sql`agendado_para = ${d.toISOString()}::timestamptz`);
        }
      }
      if (data.janela_inicio !== undefined) sets.push(sql`janela_inicio = ${data.janela_inicio}`);
      if (data.janela_fim !== undefined) sets.push(sql`janela_fim = ${data.janela_fim}`);
      if (data.intervalo_minutos !== undefined) sets.push(sql`intervalo_minutos = ${data.intervalo_minutos}`);
      sets.push(sql`atualizado_em = now()`);
      await dbc.execute(sql`UPDATE whatsapp_campanhas SET ${sql.join(sets, sql`, `)} WHERE id = ${data.id}::uuid`);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });

/**
 * Exclusão definitiva da campanha. Envios são apagados em cascata (ON DELETE CASCADE),
 * logs ficam com campanha_id = NULL para preservar o histórico de auditoria.
 */
export const excluirCampanhaFn = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const { db: dbc } = await import("@/db/index");
      if (!dbc) throw new Error("Banco indisponível.");
      await dbc.execute(sql`DELETE FROM whatsapp_campanhas WHERE id = ${data.id}::uuid`);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });

export const processarDisparoAgoraFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { processarDisparo } = await import("@/db/disparo-motor.server");
    return { ok: true, resumo: await processarDisparo() };
  } catch (error: any) {
    return { ok: false, error: mensagemErroPostgres(error) };
  }
});

/**
 * "Disparar agora" numa campanha especifica: o pedido explicito do admin nao
 * espera janela nem horario agendado. A campanha entra em PROCESSANDO na hora
 * e a fila comeca a sair no ritmo definido (intervalo_minutos).
 */
export const dispararCampanhaAgoraFn = createServerFn({ method: "POST" })
  .validator((data: any) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const { db: dbc } = await import("@/db/index");
      const { processarDisparo } = await import("@/db/disparo-motor.server");
      if (!dbc) throw new Error("Banco indisponivel.");

      // Roteiro novo a partir de agora: o admin mandou sair, entao a fila
      // precisa de horario proprio (a cada N minutos) a partir deste instante.
      const camp = await dbc.execute(sql`
        SELECT id, intervalo_minutos FROM whatsapp_campanhas WHERE id = ${data.id}::uuid
      `);
      const c: any = (camp as any[])[0];
      if (!c) return { ok: false, error: "Campanha nao encontrada." };

      const { reescalarFila } = await import("@/db/disparo-motor.server");
      await reescalarFila(data.id, Number(c.intervalo_minutos ?? 5), new Date());

      const resumo: any = await processarDisparo({ forcar: true, campanhaId: data.id });
      // O motor devolve `erro` quando o disparo manual não se aplica (campanha
      // cancelada, concluída ou bloqueada por template). Sem isso a tela
      // mostrava "Disparo acionado" para uma campanha que não saiu.
      if (resumo?.erro) return { ok: false, error: resumo.erro, resumo };
      return { ok: true, resumo };
    } catch (error: any) {
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });

/**
 * "Agendar disparo": reagenda uma campanha existente. Grava o novo horario,
 * volta a campanha para AGENDADA e reescala a fila - cada destinatario passa
 * a ter horario proprio a partir do novo instante.
 */
export const agendarDisparoCampanhaFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        id: z.string().uuid(),
        agendado_para: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const { db: dbc } = await import("@/db/index");
      if (!dbc) throw new Error("Banco indisponivel.");

      const quando = new Date(data.agendado_para);
      if (Number.isNaN(quando.getTime())) {
        return { ok: false, error: "Horario de agendamento invalido." };
      }

      const camp = await dbc.execute(sql`
        SELECT id, intervalo_minutos FROM whatsapp_campanhas WHERE id = ${data.id}::uuid
      `);
      const c: any = (camp as any[])[0];
      if (!c) return { ok: false, error: "Campanha nao encontrada." };

      await dbc.execute(sql`
        UPDATE whatsapp_campanhas
        SET status = 'AGENDADA', agendado_para = ${quando.toISOString()}::timestamptz, atualizado_em = now()
        WHERE id = ${data.id}::uuid
      `);

      const { reescalarFila } = await import("@/db/disparo-motor.server");
      const roteirizadas = await reescalarFila(
        data.id,
        Number(c.intervalo_minutos ?? 5),
        quando,
      );

      const { registrarLogCampanha } = await import("../db/logs-campanha.server");
      await registrarLogCampanha({
        campanhaId: data.id,
        acao: "REAGENDADA",
        detalhe: `Disparo reagendado para ${quando.toISOString()}. ${roteirizadas} mensagem(ns) reescalonada(s).`,
        payload: { agendado_para: quando.toISOString(), roteirizadas },
      });

      return { ok: true, roteirizadas, agendado_para: quando.toISOString() };
    } catch (error: any) {
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });

export const listarCampanhasFn = createServerFn({ method: "GET" }).handler(async () => {
  return db.listarCampanhas();
});

export const getIndicadoresComunicacoesFn = createServerFn({ method: "GET" }).handler(async () => {
  return db.getIndicadoresComunicacoes();
});

export const testarConexaoFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    return await metaService.testarConexao();
  } catch (error: any) {
    return { ok: false, error: mensagemErroPostgres(error) };
  }
});

export const sincronizarTemplatesFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const resultado = await metaService.sincronizarTemplates();
    return { ok: true, ...resultado, count: resultado.salvos };
  } catch (error: any) {
    return { ok: false, error: mensagemErroPostgres(error) };
  }
});

export const buscarDadosAutomaticosFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const data = await metaService.buscarDadosAutomaticos();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: mensagemErroPostgres(error) };
  }
});

export const gerarNovoVerifyTokenFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const newToken = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const existing = await db.getWhatsappConfig();
    if (!existing) {
      return { ok: false, error: "Configuração do WhatsApp não encontrada." };
    }

    await db.updateWhatsappConfig({
      ...existing,
      webhook_verify_token: newToken,
    });
    return { ok: true, token: newToken };
  } catch (error: any) {
    console.error("[WhatsApp] Erro ao gerar Verify Token:", error);
    return { ok: false, error: mensagemErroPostgres(error) || "Erro ao salvar o Verify Token." };
  }
});

export const getWebhookLogsFn = createServerFn({ method: "GET" }).handler(async () => {
  const logs = await db.getWebhookLogs();
  return logs as any[];
});

/**
 * Log da sincronização de templates, separado do log geral (que é inundado
 * pelos eventos do webhook). É o que permite ver, na própria aba Templates,
 * qual chamada à Meta falhou.
 */
export const getLogsSincronizacaoFn = createServerFn({ method: "GET" }).handler(async () => {
  const logs = await db.getLogsSincronizacao();
  return logs as any[];
});

/**
 * Roda o diagnóstico do WhatsApp sob demanda (botão na tela de log). O mesmo
 * diagnóstico roda no boot; aqui ele pode ser repetido depois de corrigir a
 * configuração, sem reiniciar o servidor.
 */
export const executarDiagnosticoFn = createServerFn({ method: "GET" }).handler(async () => {
  const { gerarDiagnosticoWhatsApp } = await import("../db/diagnostico-whatsapp.server");
  return (await gerarDiagnosticoWhatsApp()) as any;
});

export const criarTemplateMetaFn = createServerFn({ method: "POST" })
  .validator((data: any) => {
    if (!data || typeof data !== "object") {
      throw new Error(
        "Nenhum dado foi recebido pelo servidor. Recarregue a página e tente de novo.",
      );
    }

    // Erros da Meta para payload inválido chegam crus e não dizem o que
    // corrigir. Validar aqui transforma "invalid parameter" em algo acionável.
    const nome = String(data.name || "").trim();
    if (!nome) throw new Error("Informe o nome do template.");
    if (!/^[a-z0-9_]+$/.test(nome)) {
      throw new Error(
        "O nome deve conter apenas letras minúsculas, números e underscore (ex: boas_vindas_veiculo).",
      );
    }

    const categorias = ["MARKETING", "UTILITY", "AUTHENTICATION"];
    if (!categorias.includes(data.category)) {
      throw new Error("Categoria inválida. Escolha Marketing, Utilitário ou Autenticação.");
    }

    const componentes: any[] = Array.isArray(data.components) ? data.components : [];
    const corpo = componentes.find((c: any) => c?.type === "BODY");
    if (!corpo || !String(corpo.text || "").trim()) {
      throw new Error("O corpo do template não pode ficar vazio.");
    }

    // A Meta exige placeholders sequenciais: {{3}} sem {{1}} e {{2}} é rejeitado.
    const varios = [...String(corpo.text).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    const unicos = [...new Set(varios)].sort((a, b) => a - b);
    const esperados = unicos.map((_, i) => i + 1);
    if (unicos.some((n, i) => n !== esperados[i])) {
      throw new Error(
        `As variáveis do corpo precisam ser numeradas sem pular. Encontrado: ${varios.join(", ")} — use {{1}}, {{2}}... em sequência.`,
      );
    }

    // Botão sem texto é recusado pela Meta com "parâmetro inválido" — este
    // caso é objetivo, então pode ser barrado aqui com mensagem clara.
    const botoes = componentes
      .filter((c: any) => String(c?.type || "").toUpperCase() === "BUTTONS")
      .flatMap((c: any) => (Array.isArray(c?.buttons) ? c.buttons : []));
    for (const botao of botoes) {
      if (!String(botao?.text || "").trim()) {
        throw new Error(
          `Todo botão de ação precisa de um texto (ex: "Ver veículos"). ` +
            `Botão sem texto é recusado pela Meta com "parâmetro inválido".`,
        );
      }
      const ehUrl = String(botao?.type || "").toUpperCase() === "URL";
      if (ehUrl && !String(botao?.url || "").trim()) {
        throw new Error(`O botão "${botao.text}" precisa de uma URL.`);
      }
    }

    // A Meta costuma recusar com "parâmetro inválido" o corpo que tem um link
    // no texto (o link deveria estar no botão de ação). Não dá para barrar
    // aqui — a regra não está documentada com certeza e um template válido
    // seria recusado sem necessidade — então o caso é registrado no log e
    // aparece como aviso na tela do wizard.
    const textoCorpo = String(corpo.text || "");
    const linkNoCorpo = textoCorpo.match(/https?:\/\/\S+/i);
    if (linkNoCorpo) {
      console.warn(
        `[comunicacoes] o template "${nome}" tem link no corpo (${linkNoCorpo[0]}). ` +
          `A Meta pode recusar a criação com "parâmetro inválido" — o link deveria estar no botão de ação.`,
      );
    }

    return { ...data, name: nome };
  })
  .handler(async ({ data }) => {
    try {
      // Nome duplicado é rejeitado pela Meta; checar antes evita o erro cru.
      const jaExiste = (await db.listarTemplates()).find((t: any) => t.meta_name === data.name);
      if (jaExiste) {
        return {
          ok: false,
          error: `Já existe um template chamado "${data.name}". Escolha outro nome.`,
        };
      }
      return await metaService.criarTemplate(data);
    } catch (error: any) {
      // A Meta responde "Invalid parameter" (código 100) sem dizer qual campo
      // recusou. Traduzir o erro mais comum para algo acionável — o que o
      // admin precisa é saber O QUE corrigir, não ler o código cru.
      return { ok: false, error: explicarErroCriacaoTemplate(error) };
    }
  });

/**
 * Anexo do cabeçalho do template (imagem ou PDF). Mesma receita do upload da
 * tela de conversas: sobe o binário para a Meta — que devolve o `media_id`
 * usado no disparo — e guarda uma cópia em `arquivos_upload`, porque o id da
 * Meta expira em 30 dias e sem a cópia o template fica sem mídia.
 *
 * Imagem e PDF são os únicos formatos aceitos num HEADER de template; vídeo
 * precisa de aprovação manual da Meta e não vale o custo aqui.
 */
export const uploadMidiaTemplateFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        arquivo: z.string().min(1),
        nome: z.string().min(1),
        tipo: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const tipoArquivo = String(data.tipo || "").toLowerCase();
      const ehImagem = tipoArquivo.startsWith("image/");
      const ehPdf = tipoArquivo === "application/pdf";
      if (!ehImagem && !ehPdf) {
        throw new Error("O cabeçalho do template aceita apenas imagem ou PDF.");
      }

      const { mediaId } = await metaService.uploadMedia(data.arquivo, data.nome, data.tipo);

      const { salvarArquivo } = await import("../db/arquivos.server");
      const buffer = Buffer.from(String(data.arquivo).replace(/^data:[^;]+;base64,/, ""), "base64");
      const arquivoId = await salvarArquivo(buffer, data.tipo);

      return {
        ok: true,
        // `document` é o tipo que a Meta exige para PDF; o resto é imagem.
        midia_tipo: ehPdf ? "document" : "image",
        midia_id: mediaId,
        midia_nome: data.nome,
        midia_arquivo_id: arquivoId,
      };
    } catch (error: any) {
      console.error("[comunicacoes] falha ao subir mídia do template:", error);
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });

/**
 * Reanexa a mídia do cabeçalho em um template que já existe. É a saída para
 * templates sincronizados do WhatsApp Manager, que chegam sem binário local e
 * com o `header_handle` da Meta como URL — nenhuma das duas serve como
 * `image.id` no envio.
 */
export const anexarMidiaTemplateFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        template_id: z.string().uuid(),
        arquivo: z.string().min(1),
        nome: z.string().min(1),
        tipo: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const tipoArquivo = String(data.tipo || "").toLowerCase();
      const ehImagem = tipoArquivo.startsWith("image/");
      const ehPdf = tipoArquivo === "application/pdf";
      if (!ehImagem && !ehPdf) {
        throw new Error("O cabeçalho aceita apenas imagem ou PDF.");
      }

      const { mediaId } = await metaService.uploadMedia(data.arquivo, data.nome, data.tipo);

      const { salvarArquivo } = await import("../db/arquivos.server");
      const buffer = Buffer.from(String(data.arquivo).replace(/^data:[^;]+;base64,/, ""), "base64");
      const arquivoId = await salvarArquivo(buffer, data.tipo);

      await db.anexarMidiaTemplate(data.template_id, {
        midia_id: mediaId,
        midia_tipo: ehPdf ? "document" : "image",
        midia_nome: data.nome,
        midia_arquivo_id: arquivoId,
      });

      return { ok: true };
    } catch (error: any) {
      console.error("[comunicacoes] falha ao reanexar mídia do template:", error);
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });

export const excluirTemplateMetaFn = createServerFn({ method: "POST" })
  .validator((data: any) => {
    const nome = String(data?.meta_name || "").trim();
    if (!nome) throw new Error("Informe o nome do template a excluir.");
    // O `meta_id` é o identificador que a Meta devolveu. Sem ele, a exclusão
    // depende só do nome — e um nome com diferença de caixa/espaços faz a Meta
    // recusar com "Invalid parameter", mesmo com o template certo na tela.
    const metaId = data?.meta_id ? String(data.meta_id).trim() : null;
    return { meta_name: nome, meta_id: metaId };
  })
  .handler(async ({ data }) => {
    try {
      // Meta primeiro: se ela falhar, aborta e o registro local é preservado,
      // para o usuário não perder o template sem tê-lo apagado de verdade.
      const naMeta = await metaService.excluirTemplate(data.meta_name, data.meta_id);
      const local = await db.excluirTemplateLocal(data.meta_name);

      // O banco pode recusar a exclusão (template em uso por campanha ou
      // automação). Nesse caso a mensagem vem pronta, em português.
      if (local.ok === false && local.erro) {
        return { ok: false, error: local.erro };
      }

      if (!local.removido && !naMeta.jaEstavaNaMeta) {
        return { ok: false, error: "Nenhum template encontrado com esse nome." };
      }
      return { ok: true, removidoNaMeta: !naMeta.jaEstavaNaMeta };
    } catch (error: any) {
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });

/**
 * Um contato de verdade para a prévia da mensagem. Sem isso a tela mostra
 * "(nome de cada contato)" e, ao testar, a Meta recusa o template por variável
 * vazia — você fica sem saber o que cada campo entrega. Aqui a prévia e o teste
 * partem de um registro real, com o mesmo mapeamento que a campanha vai usar.
 */
export const exemploDestinatarioFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        veiculoId: z.string().uuid().optional().nullable(),
        mapeamento: z.record(z.string(), z.string()).optional(),
        origem: z.enum(["COMPRADORES", "IMPORTADOS", "AMBOS"]).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { exemploDestinatario } = await import("@/db/disparo-motor.server");
    return exemploDestinatario({
      veiculoId: data.veiculoId ?? null,
      mapeamento: data.mapeamento ?? {},
      origem: data.origem ?? "AMBOS",
    });
  });

export const estimarPublicoFn = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    // A origem chega solta dentro de `data` (o handleEstimar espalha filtros e
    // origem no mesmo objeto). Sem este ajuste ela era ignorada e a contagem
    // voltava sempre como se fosse "AMBOS".
    if (data && typeof data === "object" && "origem" in data && !data.origem_publico) {
      data = { ...data, origem_publico: data.origem };
    }
    return db.estimarPublico(data);
  });

export const criarCampanhaFn = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data, context }) => {
    // Pegar usuário da auth se disponível, ou mockar admin
    const userId = (context as any).userId || "00000000-0000-0000-0000-000000000000";
    return db.criarCampanha(data, userId);
  });

export const getCampanhaDetalhesFn = createServerFn({ method: "GET" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    return db.getCampanhaDetalhes(id);
  });

/**
 * Fila de envios de uma campanha, para o detalhe por contato.
 *
 * O estado da mensagem vive em duas colunas: `estado_fila` é o ciclo do nosso
 * motor (PENDENTE → RESERVADA → ENVIADA/FALHOU/IGNORADA) e `status` é o que a
 * Meta devolve via webhook (ENVIADA/ENTREGUE/LIDA). O detalhe mostra as duas
 * coisas, porque "ENVIADA" na fila não garante entrega — a Meta só confirma
 * depois. O nome vem de `variaveis->>'contato.nome'` (onde o motor guarda o
 * contato resolvido) com fallback para a tabela de perfis.
 */
/**
 * POST aqui é de propósito: TanStack Start executa `createServerFn` GET no
 * navegador, onde `DATABASE_URL` não existe. Como `useServerFn` chama a função
 * direto, uma fn GET que toca o banco sempre voltava vazio — por isso a lista
 * de contatos da campanha nunca aparecia ("0 contato(s) na fila").
 */
export const getEnviosCampanhaFn = createServerFn({ method: "POST" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    return db.listarEnviosCampanha(id);
  });

/** Trilha de eventos do motor para uma campanha (log por campanha). */
export const getLogsCampanhaFn = createServerFn({ method: "POST" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    const { ensureComunicacoesSchema } = await import("../db/comunicacoes.server");
    await ensureComunicacoesSchema();
    const { listarLogsCampanha } = await import("../db/logs-campanha.server");
    return listarLogsCampanha(id);
  });

/**
 * Trilha de disparo de todas as campanhas (motor). Fica na aba de logs ao lado
 * dos logs de webhook: sem ela o admin só via o registro do disparo escondido
 * no dialog de cada campanha e concluía que o motor não logava nada.
 */
export const getLogsDisparoFn = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const { ensureComunicacoesSchema } = await import("../db/comunicacoes.server");
      await ensureComunicacoesSchema();
      const { listarLogsDisparo } = await import("../db/logs-campanha.server");
      return listarLogsDisparo();
    } catch (error: any) {
      console.error("[comunicacoes] falha ao listar o log de disparo:", error);
      return [];
    }
  });

export const processarEnvioCampanhaFn = createServerFn({ method: "POST" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    // O disparo da campanha devolve `{ok:false, error}` em vez de derrubar a
    // requisição: sem isso o navegador recebia uma página de erro sem corpo e
    // o log de saída ficava vazio, sem como saber por que o envio não saiu.
    try {
      const resultado = await db.processarEnvioCampanha(id);
      return { ok: true, resultado };
    } catch (error: any) {
      console.error("[comunicacoes] falha ao processar envio da campanha:", error);
      try {
        const { registrarLogMeta } = await import("../db/logs-whatsapp.server");
        await registrarLogMeta({
          direcao: "SAIDA",
          operacao: "PROCESSAR_ENVIO_CAMPANHA",
          httpStatus: 500,
          status: "ERRO",
          resumo: "Falha ao processar o envio da campanha.",
          payload: { campanhaId: id, erro: mensagemErroPostgres(error).slice(0, 1000) },
        });
      } catch (e) {
        console.error("[comunicacoes] falha ao registrar erro da campanha:", e);
      }
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });

export const enviarTesteFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        telefone: z.string(),
        template_id: z.string().uuid(),
        variaveis: z.any(),
        // Anexo opcional para o teste: templates criados direto na Meta têm o
        // `header_handle` alfanumérico, que a Meta não aceita como `image.id`.
        // Subir o binário na hora do teste resolve sem mexer no template.
        midia_base64: z.string().optional(),
        midia_nome: z.string().optional(),
        midia_tipo: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      // O schema precisa estar garantido antes de qualquer coisa: sem as
      // tabelas, `listarTemplates` estoura e o teste falha sem deixar
      // registro — era um dos motivos de "o teste não gera log".
      await db.ensureComunicacoesSchema();

      const template = (await db.listarTemplates()).find((t: any) => t.id === data.template_id);
      if (!template) throw new Error("Template não encontrado");

      // O telefone tem que estar no formato internacional. A tela aceita
      // "11999999999" (10 ou 11 dígitos) e o motor normaliza antes de enviar
      // (`normalizarParaMeta`), mas o teste mandava os dígitos crus: a Meta
      // recebia "11999999999" como número nacional, aceitava a requisição
      // (200) e a mensagem não chegava a lugar nenhum. Aqui a normalização é
      // a mesma do motor — um número de 10/11 dígitos vira "55" + dígitos.
      const telefone = normalizarParaMeta(data.telefone);
      if (telefone.length < 12) {
        throw new Error(
          "Informe o telefone com DDD e código do país. Ex: 5511999999999",
        );
      }

      if (!templateAprovado(template.status)) {
        const rotulo =
          normalizarStatusTemplate(template.status) === "PENDING"
            ? "ainda está em análise"
            : normalizarStatusTemplate(template.status) === "REJECTED"
              ? "foi rejeitado"
              : template.status || "não está aprovado";
        throw new Error(
          `O template "${template.nome_interno}" ${rotulo}. A Meta só aceita envio de template aprovado.`,
        );
      }

      // A Meta exige um componente BODY com um parameter para cada {{n}} do
      // corpo, na ordem. Montar o array na mão a partir de data.variaveis fazia
      // o payload sair com "components": [] quando o array chegava vazio, e a
      // Meta respondia 132000 "number of parameters does not match". Derivar do
      // próprio conteúdo também pega o caso de a tela mandar menos valores do
      // que o template pede.
      const valores = Array.isArray(data.variaveis) ? data.variaveis : [];
      const mapa: Record<string, string> = {};
      valores.forEach((v: any, i: number) => {
        mapa[String(i + 1)] = String(v ?? "");
      });

      // O anexo mora na linha do template (imagem/PDF do cabeçalho), não na
      // mensagem. Sem passá-lo, um template com HEADER de mídia saía sem o
      // componente `header` e a Meta respondia 132000 "number of parameters
      // does not match": ela conta o parâmetro do cabeçalho, nós não mandávamos.
      // O disparo da campanha já fazia isso (disparo-motor.server.ts); o teste
      // é que tinha esquecido.
      // Mesmo sem `midia_id` no template, um `base64` enviado no teste deve ser
      // usado: templates criados direto na Meta têm `header_handle` inválido
      // e o teste precisa de uma forma de enviar a imagem.
      const base64 = data.midia_base64 || undefined;
      const temAnexoNoTemplate = Boolean(
        (template as any).midia_id || (template as any).midia_tipo,
      );
      const midia = temAnexoNoTemplate || base64
        ? {
            // O binário do teste sobrepõe o `media_id` do template: o anexo salvo
            // pode ser de outra imagem, e o `header_handle` da Meta pode ser URL.
            tipo: (base64 ? data.midia_tipo : (template as any).midia_tipo) || "image",
            mediaId: (template as any).midia_id,
            nome: (base64 ? data.midia_nome : (template as any).midia_nome) || "arquivo",
            base64,
            // Cópia local do anexo do template: com ela o teste consegue refazer
            // o upload quando o `media_id` salvo não é numérico (a Meta exige
            // `image.id` inteiro e o id da Meta é handle alfanumérico).
            arquivoId: (template as any).midia_arquivo_id,
          }
        : null;

      let componentes: any[];
      try {
        componentes = await montarComponents(template.conteudo, mapa, midia);
      } catch (e: any) {
        // A mensagem de montarComponents fala em "mapeamento da campanha";
        // aqui o contexto é o teste avulso, então troca só o sujeito.
        throw new Error(
          String(e?.message || "").replace("no mapeamento da campanha", "no formulário de teste") ||
            "Preencha todas as variáveis do template.",
        );
      }

      const resposta: any = await metaService.enviarMensagem(
        telefone,
        template.meta_name,
        template.idioma || "pt_BR",
        componentes,
        "ENVIAR_TESTE",
      );

      // O teste de template também entra na trilha. Antes ele só aparecia no
      // log de webhook (que registra a chamada à Meta), e o admin olhando o
      // "Log de disparo (motor)" — a aba que responde "o que o sistema fez
      // com a minha mensagem?" — não via nada. Aqui fica registrado quem
      // testou, para qual número, com qual template e com qual id da Meta.
      const { registrarLogCampanha } = await import("../db/logs-campanha.server");
      await registrarLogCampanha({
        campanhaId: null,
        acao: "ENVIO_TESTE",
        detalhe:
          `Teste do template "${template.nome_interno}" enviado para ${telefone}.` +
          (resposta?.messages?.[0]?.id ? ` Id da Meta: ${resposta.messages[0].id}.` : ""),
        payload: {
          template: template.nome_interno,
          meta_name: template.meta_name,
          telefone,
          meta_message_id: resposta?.messages?.[0]?.id ?? null,
        },
      });

      return resposta;
    } catch (error: any) {
      // A falha do teste também precisa ficar registrada: "não gerou log" era
      // metade do sintoma reportado.
      try {
        const { registrarLogCampanha } = await import("../db/logs-campanha.server");
        await registrarLogCampanha({
          campanhaId: null,
          acao: "ERRO",
          detalhe: `Falha no teste de template: ${mensagemErroPostgres(error).slice(0, 1500)}`,
          payload: { telefone: data.telefone, template_id: data.template_id },
        });
      } catch {
        // Falha ao registrar a falha: não pode mascarar o erro original.
      }
      return { ok: false, error: mensagemErroPostgres(error) };
    }
  });
