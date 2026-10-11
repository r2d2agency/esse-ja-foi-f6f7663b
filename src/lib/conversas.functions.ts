import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as db from "../db/conversas.server";

/**
 * Token -> atendente. Quando falha, registra uma linha antes de devolver null:
 * sem isso o handler lança "Não autorizado" e a operação não deixa rastro em
 * lugar nenhum — o atendente vê o toast e não há como diagnosticar depois.
 * Distinguimos "token ausente" (store ainda não reidratada na primeira ação)
 * de "token inválido/expirado" (secret diferente entre login e verificação),
 * porque as soluções são diferentes.
 */
async function userIdFrom(token?: string | null, onde = "?") {
  if (!token) {
    console.warn(`[conversas] ${onde}: token ausente na requisicao`);
    await logarTentativa(onde, false, null);
    return null;
  }
  const { verifyToken } = await import("@/db/auth.server");
  const userId = await verifyToken(token);
  if (!userId) {
    console.warn(`[conversas] ${onde}: token presente mas invalido ou expirado`);
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

const payloadMensagem = z.union([
  z.object({ tipo: z.literal("TEXTO"), conteudo: z.object({ text: z.object({ body: z.string() }) }) }),
  z.object({
    tipo: z.literal("TEMPLATE"),
    template_name: z.string(),
    idioma: z.string().optional(),
    componentes: z.array(z.any()).optional(),
  }),
  z.object({ tipo: z.literal("NOTA_INTERNA"), conteudo: z.any() }),
]);

export const enviarMensagemAtendenteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        token: z.string().nullable().optional(),
        conversaId: z.string().uuid(),
        payload: payloadMensagem,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const atendenteId = await userIdFrom(data.token ?? null, "ENVIAR_MENSAGEM");
    if (!atendenteId) throw new Error("Não autorizado");
    return db.enviarMensagemAtendente(data.conversaId, atendenteId, data.payload);
  });

export const definirApelidoFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({
      token: z.string().nullable().optional(),
      conversaId: z.string().uuid(),
      apelido: z.string().nullable(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const atendenteId = await userIdFrom(data.token ?? null, "DEFINIR_APELIDO");
    if (!atendenteId) throw new Error("Não autorizado");
    return db.definirApelido(data.conversaId, data.apelido);
  });

export const resolverConversaFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ token: z.string().nullable().optional(), conversaId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const atendenteId = await userIdFrom(data.token ?? null, "RESOLVER_CONVERSA");
    if (!atendenteId) throw new Error("Não autorizado");
    return db.marcarConversaResolvida(data.conversaId);
  });

export const atribuirResponsavelFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        token: z.string().nullable().optional(),
        conversaId: z.string().uuid(),
        responsavelId: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const atendenteId = await userIdFrom(data.token ?? null, "ATRIBUIR_RESPONSAVEL");
    if (!atendenteId) throw new Error("Não autorizado");
    return db.atribuirResponsavel(data.conversaId, data.responsavelId);
  });

export const listarRespostasProntasFn = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ token: z.string().nullable().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    // GET: não rejeita. Respostas prontas e globais e do atendente aparecem
    // juntas, e esconder as globais de quem caiu no token vazio seria pior.
    const atendenteId = await userIdFrom(data.token ?? null, "LISTAR_RESPOSTAS");
    return db.listarRespostasProntas(atendenteId ?? null);
  });

export const salvarRespostaProntaFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        token: z.string().nullable().optional(),
        atalho: z.string().min(1),
        titulo: z.string().optional(),
        conteudo: z.string().min(1),
        escopo: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const atendenteId = await userIdFrom(data.token ?? null, "SALVAR_RESPOSTA");
    if (!atendenteId) throw new Error("Não autorizado");
    return db.salvarRespostaPronta(atendenteId, data);
  });

export const excluirRespostaProntaFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ token: z.string().nullable().optional(), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const atendenteId = await userIdFrom(data.token ?? null, "EXCLUIR_RESPOSTA");
    if (!atendenteId) throw new Error("Não autorizado");
    return db.excluirRespostaPronta(data.id, atendenteId);
  });

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
  .handler(async ({ data }) => db.cadastrarContato(data));

/**
 * Inicia uma conversa nova. Exige template: a janela de 24h só se abre quando o
 * cliente escreve, então não existe caminho de texto livre para primeiro contato.
 */
export const iniciarConversaFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        token: z.string().nullable().optional(),
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
  .handler(async ({ data }) => {
    const atendenteId = await userIdFrom(data.token ?? null, "INICIAR_CONVERSA");
    if (!atendenteId) throw new Error("Não autorizado");
    const template = await (async () => {
      if (data.template_id) {
        const lista = await db.listarTemplates();
        const t = lista.find((x: any) => x.id === data.template_id);
        if (!t) throw new Error("Template não encontrado");
        return t;
      }
      const lista = await db.listarTemplates();
      const t = lista.find((x: any) => x.meta_name === data.template_name);
      if (!t) throw new Error("Template não encontrado");
      return t;
    })();

    const valores = (data.variaveis || []).map((v) => String(v ?? ""));
    const mapa: Record<string, string> = {};
    valores.forEach((v, i) => {
      mapa[String(i + 1)] = v;
    });

    const { montarComponents } = await import("@/db/meta-whatsapp.server");
    let componentes: any[];
    try {
      componentes = montarComponents(template.conteudo, mapa);
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
  });
