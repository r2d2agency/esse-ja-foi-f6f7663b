import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as db from "../db/conversas.server";
import { templateAprovado } from "../db/whatsapp-status";

/**
 * Cookie de sessão -> atendente. Quando falha, registra uma linha antes de
 * devolver null: sem isso o handler lança "Não autorizado" e a operação não
 * deixa rastro em lugar nenhum — o atendente vê o toast e não há como
 * diagnosticar depois.
 */
async function userIdFrom(onde = "?") {
  const { usuarioDaSessao } = await import("@/lib/sessao.server");
  const userId = await usuarioDaSessao();
  if (!userId) {
    console.warn(`[conversas] ${onde}: cookie de sessao ausente, invalida ou expirada`);
  }
  await logarTentativa(onde, !!userId, userId);
  return userId;
}

/** Grava a tentativa em `logs`, a tabela de trilha que o app já tem. */
async function logarTentativa(onde: string, ok: boolean, userId: string | null) {
  try {
    const { db: database } = await import("@/db/index");
    if (!database) return;
    const { sql } = await import("drizzle-orm");
    // `detalhe` e `usuario` sao text nesta tabela: gravar como texto, nao jsonb.
    await database.execute(sql`
      INSERT INTO logs (entidade, acao, detalhe, usuario)
      VALUES ('conversas', ${ok ? "AUTORIZADO" : "NAO_AUTORIZADO"}, ${JSON.stringify({ onde })}, ${userId})
    `);
  } catch (err) {
    // Log que falha não pode derrubar a operação do atendente.
    console.error("[conversas] falha ao registrar tentativa:", err);
  }
}

export const listarConversasFn = createServerFn({ method: "GET" })
  .validator((filtros: unknown) =>
    z
      .object({
        status: z.string().optional(),
        responsavel_id: z.string().uuid().optional(),
        busca: z.string().optional(),
      })
      .partial()
      .parse(filtros ?? {}),
  )
  .handler(async ({ data: filtros }) => {
    return db.listarConversas(filtros);
  });

export const getConversaCompletaFn = createServerFn({ method: "GET" })
  .validator((id: unknown) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    return db.getConversaCompleta(id);
  });

/**
 * Template pode chegar de duas formas: já com `componentes` montados (caminho
 * antigo) ou com `variaveis` em lista. Montar no servidor em vez de na tela
 * porque `montarComponents` vive no módulo do banco e a tela não importa
 * servidor — e porque é aqui que se descobre quantos `{{n}}` o template pede.
 */
const payloadTemplate = z
  .object({
    tipo: z.literal("TEMPLATE"),
    template_id: z.string().uuid().optional(),
    template_name: z.string().optional(),
    idioma: z.string().optional(),
    componentes: z.array(z.any()).optional(),
    variaveis: z.array(z.string()).optional(),
  })
  .refine((d) => d.template_id || d.template_name, {
    message: "Informe o template_id ou template_name",
  });

const payloadMensagem = z.union([
  z.object({ tipo: z.literal("TEXTO"), conteudo: z.object({ text: z.object({ body: z.string() }) }) }),
  payloadTemplate,
  z.object({ tipo: z.literal("NOTA_INTERNA"), conteudo: z.any() }),
  z.object({
    tipo: z.enum(["IMAGEM", "DOCUMENTO", "AUDIO"]),
    conteudo: z.object({
      media_id: z.string().min(1),
      media_url: z.string().nullable().optional(),
      arquivo_id: z.string().uuid().nullable().optional(),
      caption: z.string().nullable().optional(),
      filename: z.string().nullable().optional(),
    }),
  }),
]);

/** Resolve o template por id ou por nome e monta os componentes com as variáveis. */
async function montarPayloadTemplate(payload: any) {
  const { listarTemplates } = await import("@/db/comunicacoes.server");
  const lista = await listarTemplates();
  const template = payload.template_id
    ? lista.find((t: any) => t.id === payload.template_id)
    : lista.find((t: any) => t.meta_name === payload.template_name);
  if (!template) throw new Error("Template não encontrado");
  if (template.status && !templateAprovado(template.status)) {
    throw new Error(`O template "${template.nome_interno}" não está aprovado na Meta.`);
  }

  const valores = (payload.variaveis || []).map((v: any) => String(v ?? ""));
  const mapa: Record<string, string> = {};
  valores.forEach((v: string, i: number) => {
    mapa[String(i + 1)] = v;
  });

  const { montarComponents } = await import("@/db/meta-whatsapp.server");
  let componentes: any[];
  try {
    componentes = await montarComponents(template.conteudo, mapa);
  } catch (e: any) {
    throw new Error(e?.message || "Preencha todas as variáveis do template.");
  }

  return {
    ...payload,
    template_id: undefined,
    variaveis: undefined,
    template_name: template.meta_name || payload.template_name,
    idioma: template.idioma || payload.idioma || "pt_BR",
    componentes,
  };
}

export const enviarMensagemAtendenteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        conversaId: z.string().uuid(),
        payload: payloadMensagem,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    // Envio sempre responde. Antes o handler lançava e a exceção era engolida
    // pelo servidor: o navegador recebia uma página de erro sem corpo, o
    // atendente via "Falha ao carregar" e nenhum log de saída era gravado —
    // impossível distinguir "a mensagem saiu" de "morreu no caminho". Agora o
    // desfecho volta em `{ok, ...}` e é registrado.
    try {
      const atendenteId = await userIdFrom("ENVIAR_MENSAGEM");
      if (!atendenteId) throw new Error("Sessão expirada. Faça login novamente.");
      const payload =
        data.payload.tipo === "TEMPLATE"
          ? await montarPayloadTemplate(data.payload)
          : data.payload;
      const resultado = await db.enviarMensagemAtendente(data.conversaId, atendenteId, payload);
      return { ok: true, resultado };
    } catch (error: any) {
      console.error("[conversas] falha ao enviar mensagem:", error);
      try {
        const { registrarLogMeta } = await import("../db/logs-whatsapp.server");
        await registrarLogMeta({
          direcao: "SAIDA",
          operacao: "ENVIAR_MENSAGEM_ATENDENTE",
          httpStatus: 500,
          status: "ERRO",
          resumo: "Envio da mensagem falhou antes de chegar à Meta.",
          payload: {
            conversaId: data.conversaId,
            tipo: data.payload?.tipo ?? null,
            template: (data.payload as any)?.template_name ?? null,
            erro: String(error?.message || error).slice(0, 1000),
          },
        });
      } catch (e) {
        console.error("[conversas] falha ao registrar erro de envio:", e);
      }
      return { ok: false, error: String(error?.message || error) };
    }
  });

/**
 * Sobe o anexo para a Meta. Duas etapas em uma chamada só: o arquivo entra como
 * base64 (mesmo formato que o endpoint público de upload já usa em outras
 * telas), vai para `arquivos_upload` — onde a URL continua válida — e daí para
 * a Graph API, que devolve o `media_id` usado no envio. Um `media_id` da Meta
 * expira em 30 dias; a cópia local não.
 */
export const uploadMidiaWhatsAppFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        arquivo: z.string().min(1),
        nome: z.string().min(1),
        tipo: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    // Mesmo tratamento do envio: o anexo devolve `{ok:false, error}` em vez de
    // derrubar a requisição, para o erro aparecer na tela.
    try {
      const atendenteId = await userIdFrom("UPLOAD_MIDIA");
      if (!atendenteId) throw new Error("Sessão expirada. Faça login novamente.");

      const { metaService } = await import("@/db/meta-whatsapp.server");
      const { mediaId, tamanho } = await metaService.uploadMedia(
        data.arquivo,
        data.nome,
        data.tipo,
      );

      const { salvarArquivo } = await import("@/db/arquivos.server");
      const buffer = Buffer.from(
        String(data.arquivo).replace(/^data:[^;]+;base64,/, ""),
        "base64",
      );
      const arquivoId = await salvarArquivo(buffer, data.tipo);

      return { ok: true, media_id: mediaId, arquivo_id: arquivoId, tamanho };
    } catch (error: any) {
      console.error("[conversas] falha ao subir mídia:", error);
      try {
        const { registrarLogMeta } = await import("../db/logs-whatsapp.server");
        await registrarLogMeta({
          direcao: "SAIDA",
          operacao: "UPLOAD_MIDIA",
          httpStatus: 500,
          status: "ERRO",
          resumo: "Falha ao subir anexo para a Meta.",
          payload: {
            nome: data.nome ?? null,
            tipo: data.tipo ?? null,
            erro: String(error?.message || error).slice(0, 1000),
          },
        });
      } catch (e) {
        console.error("[conversas] falha ao registrar erro de upload:", e);
      }
      return { ok: false, error: String(error?.message || error) };
    }
  });

export const definirApelidoFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        conversaId: z.string().uuid(),
        apelido: z.string().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const atendenteId = await userIdFrom("DEFINIR_APELIDO");
    if (!atendenteId) throw new Error("Sessão expirada. Faça login novamente.");
    return db.definirApelido(data.conversaId, data.apelido);
  });

/**
 * Wrapper que garante que toda operação do atendimento responda com JSON
 * legível em vez de derrubar a requisição. Sem isso o navegador recebia uma
 * página de erro sem corpo (`503 ()`) e o atendente via "Falha ao carregar"
 * sem nenhuma pista do motivo — e o log de saída ficava vazio porque a
 * exceção morria antes de qualquer gravação. O `erro` é registrado em
 * `whatsapp_webhook_logs`, onde a tela de Log WhatsApp o exibe.
 */
function comTratamento<T>(handler: () => Promise<T>): Promise<
  { ok: true; resultado: T } | { ok: false; error: string }
> {
  return (async () => {
    try {
      const resultado = await handler();
      return { ok: true, resultado };
    } catch (error: any) {
      console.error("[conversas] falha na operação:", error);
      try {
        const { registrarLogMeta } = await import("../db/logs-whatsapp.server");
        await registrarLogMeta({
          direcao: "SAIDA",
          operacao: "OPERACAO_CONVERSA",
          httpStatus: 500,
          status: "ERRO",
          resumo: "Operação da central de conversas falhou.",
          payload: { erro: String(error?.message || error).slice(0, 1000) },
        });
      } catch (e) {
        console.error("[conversas] falha ao registrar erro da operação:", e);
      }
      return { ok: false, error: String(error?.message || error) };
    }
  })();
}

export const resolverConversaFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ conversaId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) =>
    comTratamento(async () => {
      const atendenteId = await userIdFrom("RESOLVER_CONVERSA");
      if (!atendenteId) throw new Error("Sessão expirada. Faça login novamente.");
      return db.marcarConversaResolvida(data.conversaId);
    }),
  );

export const atribuirResponsavelFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        conversaId: z.string().uuid(),
        responsavelId: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    comTratamento(async () => {
      const atendenteId = await userIdFrom("ATRIBUIR_RESPONSAVEL");
      if (!atendenteId) throw new Error("Sessão expirada. Faça login novamente.");
      return db.atribuirResponsavel(data.conversaId, data.responsavelId);
    }),
  );

export const listarRespostasProntasFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async () => {
    // GET: não rejeita. Respostas prontas globais e do atendente aparecem
    // juntas, e esconder as globais de quem está sem cookie seria pior.
    const atendenteId = await userIdFrom("LISTAR_RESPOSTAS");
    return db.listarRespostasProntas(atendenteId ?? null);
  });

export const salvarRespostaProntaFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        atalho: z.string().min(1),
        titulo: z.string().optional(),
        conteudo: z.string().min(1),
        escopo: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    comTratamento(async () => {
      const atendenteId = await userIdFrom("SALVAR_RESPOSTA");
      if (!atendenteId) throw new Error("Sessão expirada. Faça login novamente.");
      return db.salvarRespostaPronta(atendenteId, data);
    }),
  );

export const excluirRespostaProntaFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) =>
    comTratamento(async () => {
      const atendenteId = await userIdFrom("EXCLUIR_RESPOSTA");
      if (!atendenteId) throw new Error("Sessão expirada. Faça login novamente.");
      return db.excluirRespostaPronta(data.id, atendenteId);
    }),
  );

/** Contatos com telefone, para o diálogo "Nova conversa". */
export const listarContatosDisponiveisFn = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ busca: z.string().nullable().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    return db.listarContatosDisponiveis(data.busca ?? null);
  });

/** Cadastra um contato novo na hora, para o diálogo "Nova conversa". */
export const cadastrarContatoFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        nome: z.string().min(1),
        telefone: z.string().min(10),
        email: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => comTratamento(() => db.cadastrarContato(data)));

/**
 * Inicia uma conversa nova. Exige template: a janela de 24h só se abre quando o
 * cliente escreve, então não existe caminho de texto livre para primeiro contato.
 */
export const iniciarConversaFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        telefone: z.string().min(10),
        nome: z.string().nullable().optional(),
        template_id: z.string().uuid().optional(),
        template_name: z.string().optional(),
        idioma: z.string().optional(),
        componentes: z.array(z.any()).optional(),
        variaveis: z.array(z.string()).optional(),
      })
      .refine((d) => d.template_id || d.template_name, {
        message: "Informe o template_id ou template_name",
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    comTratamento(async () => {
      const atendenteId = await userIdFrom("INICIAR_CONVERSA");
      if (!atendenteId) throw new Error("Sessão expirada. Faça login novamente.");
      const { listarTemplates } = await import("@/db/comunicacoes.server");
      const template = await (async () => {
        if (data.template_id) {
          const lista = await listarTemplates();
          const t = lista.find((x: any) => x.id === data.template_id);
          if (!t) throw new Error("Template não encontrado");
          return t;
        }
        const lista = await listarTemplates();
        const t = lista.find((x: any) => x.meta_name === data.template_name);
        if (!t) throw new Error("Template não encontrado");
        return t;
      })();

      const valores = (data.variaveis || []).map((v: any) => String(v ?? ""));
      const mapa: Record<string, string> = {};
      valores.forEach((v: string, i: number) => {
        mapa[String(i + 1)] = v;
      });

      const { montarComponents } = await import("@/db/meta-whatsapp.server");
      let componentes: any[];
      try {
        componentes = await montarComponents(template.conteudo, mapa);
      } catch (e: any) {
        throw new Error(e?.message || "Preencha todas as variáveis do template.");
      }

      return db.iniciarConversa(atendenteId, {
        telefone: data.telefone,
        nome: data.nome ?? null,
        template_name: template.meta_name,
        idioma: template.idioma || "pt_BR",
        componentes,
      });
    }),
  );
