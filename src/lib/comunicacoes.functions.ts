import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sql } from "drizzle-orm";
import * as db from "../db/comunicacoes.server";
import { metaService } from "../db/meta-whatsapp.server";

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
      return { ok: false, error: error?.message || "Erro ao salvar configuração." };
    }
  });

export const listarTemplatesFn = createServerFn({ method: "GET" }).handler(async () => {
  return db.listarTemplates();
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
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { listarContatos } = await import("@/db/publico.server");
    return listarContatos({
      busca: data.busca ?? null,
      apenasElegiveis: data.apenasElegiveis ?? false,
      origem: data.origem ?? null,
    });
  });

export const listarSegmentosComTotalFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listarSegmentosComTotal } = await import("@/db/publico.server");
  const { ensureComunicacoesSchema } = await import("@/db/comunicacoes.server");
  await ensureComunicacoesSchema();
  return listarSegmentosComTotal();
});

export const contarPublicoFn = createServerFn({ method: "GET" })
  .validator((data: any) =>
    z
      .object({
        origem: z.enum(["COMPRADORES", "IMPORTADOS", "AMBOS"]).optional(),
        uf: z.string().optional(),
        cidade: z.string().optional(),
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
      }),
    };
  });

export const criarCampanhaDisparoFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        nome: z.string().min(1),
        template_id: z.string().uuid(),
        veiculo_id: z.string().uuid().optional().nullable(),
        segmento_id: z.string().uuid().optional().nullable(),
        origem_publico: z.enum(["COMPRADORES", "IMPORTADOS", "AMBOS"]).default("AMBOS"),
        janela_inicio: z.string().optional().nullable(),
        janela_fim: z.string().optional().nullable(),
        intervalo_minutos: z.number().int().min(1).max(1440).default(5),
        agendado_para: z.string().optional().nullable(),
        filtros: z.any().optional(),
        mapeamento_variaveis: z.record(z.string()).optional(),
        enviar_agora: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const { db: dbc } = await import("@/db/index");
      const { ensureComunicacoesSchema } = await import("@/db/comunicacoes.server");
      const { popularFilaCampanha } = await import("@/db/disparo-motor.server");
      if (!dbc) throw new Error("Banco indisponível.");
      await ensureComunicacoesSchema();

      const { rows } = await dbc.execute(sql`
        INSERT INTO whatsapp_campanhas (
          nome, veiculo_id, template_id, segmento_id, origem_publico,
          janela_inicio, janela_fim, intervalo_minutos, status, agendado_para, mapeamento_variaveis
        ) VALUES (
          ${data.nome},
          ${data.veiculo_id ?? null},
          ${data.template_id}::uuid,
          ${data.segmento_id ?? null},
          ${data.origem_publico},
          ${data.janela_inicio || null},
          ${data.janela_fim || null},
          ${data.intervalo_minutos},
          ${data.enviar_agora ? "AGUARDANDO" : "RASCUNHO"},
          ${data.agendado_para || null},
          ${JSON.stringify(data.mapeamento_variaveis ?? {})}::jsonb
        ) RETURNING id
      `);
      const campanhaId = (rows as any[])[0].id;

      const fila = await popularFilaCampanha(campanhaId, {
        origem: data.origem_publico,
        uf: data.filtros?.uf ?? null,
        cidade: data.filtros?.cidade ?? null,
        tipo: data.filtros?.tipo ?? null,
        statusCompliance: data.filtros?.statusCompliance ?? null,
        mapeamento: data.mapeamento_variaveis ?? {},
      } as any);

      return { ok: true, id: campanhaId, ...fila };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Erro ao criar campanha." };
    }
  });

export const listarCampanhasDetalhadoFn = createServerFn({ method: "GET" }).handler(async () => {
  const { db: dbc } = await import("@/db/index");
  const { ensureComunicacoesSchema } = await import("@/db/comunicacoes.server");
  if (!dbc) return [];
  await ensureComunicacoesSchema();
  const { rows } = await dbc.execute(sql`
      SELECT c.*, v.marca, v.modelo, v.placa, t.nome_interno as template_nome, t.status as template_status
      FROM whatsapp_campanhas c
      LEFT JOIN veiculos v ON v.id = c.veiculo_id
      LEFT JOIN whatsapp_templates t ON t.id = c.template_id
      ORDER BY c.criado_em DESC
    `);
  return rows;
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
      return { ok: false, error: error?.message };
    }
  });

export const processarDisparoAgoraFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { processarDisparo } = await import("@/db/disparo-motor.server");
    return { ok: true, resumo: await processarDisparo() };
  } catch (error: any) {
    return { ok: false, error: error?.message };
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
    return { ok: false, error: error.message };
  }
});

export const sincronizarTemplatesFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const count = await metaService.sincronizarTemplates();
    return { ok: true, count };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
});

export const buscarDadosAutomaticosFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const data = await metaService.buscarDadosAutomaticos();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error.message };
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
    return { ok: false, error: error?.message || "Erro ao salvar o Verify Token." };
  }
});

export const getWebhookLogsFn = createServerFn({ method: "GET" }).handler(async () => {
  const logs = await db.getWebhookLogs();
  return logs as any[];
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
      return { ok: false, error: error.message };
    }
  });

export const excluirTemplateMetaFn = createServerFn({ method: "POST" })
  .validator((data: any) => {
    const nome = String(data?.meta_name || "").trim();
    if (!nome) throw new Error("Informe o nome do template a excluir.");
    return { meta_name: nome };
  })
  .handler(async ({ data }) => {
    try {
      // Meta primeiro: se ela falhar, aborta e o registro local é preservado,
      // para o usuário não perder o template sem tê-lo apagado de verdade.
      const naMeta = await metaService.excluirTemplate(data.meta_name);
      const local = await db.excluirTemplateLocal(data.meta_name);

      if (!local.removido && !naMeta.jaEstavaNaMeta) {
        return { ok: false, error: "Nenhum template encontrado com esse nome." };
      }
      return { ok: true, removidoNaMeta: !naMeta.jaEstavaNaMeta };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

export const estimarPublicoFn = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
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

export const processarEnvioCampanhaFn = createServerFn({ method: "POST" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    return db.processarEnvioCampanha(id);
  });

export const enviarTesteFn = createServerFn({ method: "POST" })
  .validator((data: any) =>
    z
      .object({
        telefone: z.string(),
        template_id: z.string().uuid(),
        variaveis: z.any(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const template = (await db.listarTemplates()).find((t: any) => t.id === data.template_id);
      if (!template) throw new Error("Template não encontrado");

      if (template.status !== "APPROVED") {
        const rotulo =
          template.status === "PENDING"
            ? "ainda está em análise"
            : template.status === "REJECTED"
              ? "foi rejeitado"
              : template.status || "não está aprovado";
        throw new Error(
          `O template "${template.nome_interno}" ${rotulo}. A Meta só aceita envio de template aprovado.`,
        );
      }

      // A Meta exige um componente BODY com os mesmos valores, na ordem dos
      // placeholders {{1}}, {{2}}... do corpo. Sem isto, qualquer template com
      // variável é recusado com "template variable missing" — que era o que
      // impedia o botão de teste existir: nunca ia funcionar.
      const valores = Array.isArray(data.variaveis) ? data.variaveis : [];
      const componentes = valores.length
        ? [
            {
              type: "BODY",
              parameters: valores.map((v: any) => ({
                type: "text",
                text: String(v ?? ""),
              })),
            },
          ]
        : [];

      return await metaService.enviarMensagem(
        data.telefone,
        template.meta_name,
        template.idioma || "pt_BR",
        componentes,
      );
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
