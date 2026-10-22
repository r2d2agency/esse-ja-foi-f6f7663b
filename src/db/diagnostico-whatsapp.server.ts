import { sql } from "drizzle-orm";
import { db } from "./index";
import { ensureComunicacoesSchema } from "./comunicacoes.server";
import { ensureConversasSchema } from "./conversas.server";
import { registrarLogMeta, getUltimoErroLog } from "./logs-whatsapp.server";
import { extrairErroPostgres } from "./erro-postgres";
import { versaoGraphValida } from "./meta-whatsapp.server";

/**
 * Diagnóstico do WhatsApp Meta API.
 *
 * O sistema de conversas estava quebrado sem deixar rastro: o webhook só
 * gravava log depois de validar a assinatura, então um `app_secret` divergente
 * devolvia 401 e a tela de log continuava vazia — sem como saber o que estava
 * acontecendo. Como não há como rodar SELECT na mão, o diagnóstico roda no
 * boot e grava o resultado como linha de log, que a tela lê.
 *
 * Nunca lança: diagnóstico não pode derrubar o boot nem o request que o chamou.
 */

const TABELAS_ESPERADAS = [
  "whatsapp_config",
  "whatsapp_webhook_logs",
  "whatsapp_mensagens",
  "whatsapp_conversas",
  "whatsapp_templates",
  "whatsapp_campanhas",
  "whatsapp_segmentos",
  "whatsapp_contato_lotes",
];

/** Hash curto e irreversível: permite comparar o segredo gravado com o da Meta
 *  sem exibir o valor. */
function hashCurto(valor: string): string {
  let h = 0;
  for (let i = 0; i < valor.length; i++) {
    h = (h * 31 + valor.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function preenchido(valor: unknown): boolean {
  return typeof valor === "string" ? valor.trim().length > 0 : valor != null;
}

/**
 * Roda a query real da listagem — a mesma que `listarConversas` monta, sem
 * filtro. Só lê, então é seguro executar a qualquer hora.
 *
 * Existe porque o diagnóstico conferia tabela e tipo de coluna, mas havia um
 * estado que escapava: `whatsapp_conversas` existe, `contato_id` é uuid, o
 * INSERT do webhook funciona — e ainda assim a lista volta vazia. Isso só
 * acontece se a própria query de listagem estoura, e o estouro morria no
 * servidor: a tela mostrava "nenhuma conversa" sem explicar o motivo. Rodando a
 * query aqui, o erro real do Postgres entra em `problemas` e aparece na tela.
 */
async function testarListagem(): Promise<string | null> {
  try {
    await db!.execute(sql`
      SELECT c.id
      FROM whatsapp_conversas c
      LEFT JOIN profiles p ON p.id = c.contato_id
      LEFT JOIN profiles resp ON resp.id = c.responsavel_id
      LEFT JOIN anuncios_veiculo v ON v.id = c.contexto_veiculo_id
      WHERE 1=1
      ORDER BY c.ultimo_evento_em DESC
      LIMIT 1
    `);
    return null;
  } catch (e: any) {
    return extrairErroPostgres(e).mensagem;
  }
}

export type DiagnosticoWhatsApp = {
  geradoEm: string;
  status: "OK" | "ATENCAO";
  problemas: string[];
  config: {
    existe: boolean;
    campos: Record<string, { preenchido: boolean; hash?: string }>;
    status: string | null;
    versaoGraph?: string;
  };
  tabelas: Record<string, { existe: boolean; linhas: number }>;
  contagens: {
    conversas: number;
    mensagens: number;
    mensagensPorStatus: Record<string, number>;
    conversasPorStatus: Record<string, number>;
  };
  ultimoErroLog: { mensagem: string; em: string } | null;
};

export async function gerarDiagnosticoWhatsApp(): Promise<DiagnosticoWhatsApp> {
  const problemas: string[] = [];
  const diag: DiagnosticoWhatsApp = {
    geradoEm: new Date().toISOString(),
    status: "ATENCAO",
    problemas,
    config: { existe: false, campos: {}, status: null },
    tabelas: {},
    contagens: { conversas: 0, mensagens: 0, mensagensPorStatus: {}, conversasPorStatus: {} },
    ultimoErroLog: getUltimoErroLog(),
  };

  try {
    await ensureComunicacoesSchema();
    // whatsapp_conversas não é criada por nenhuma migração: `ensureConversasSchema`
    // é a única que a cria. Rodar aqui é o que faz o botão "Rodar diagnóstico"
    // consertar a tabela, em vez de só relatar que ela falta.
    await ensureConversasSchema();
  } catch (e: any) {
    problemas.push(
      `Falha ao garantir as tabelas do WhatsApp: ${String(e?.message || e).slice(0, 300)}`,
    );
  }

  // --- Configuração ---
  try {
    const res = await db!.execute(sql`SELECT * FROM whatsapp_config LIMIT 1`);
    const linha = (Array.isArray(res) ? res[0] : (res as any).rows?.[0]) as any;

    if (!linha) {
      problemas.push(
        "Nenhum registro em whatsapp_config. Cadastre o App Secret, o Phone Number ID e o Token em Comunicações > Configurações.",
      );
    } else {
      diag.config.existe = true;
      diag.config.status = linha.status ?? null;

      const campos: Record<string, { preenchido: boolean; hash?: string }> = {};
      for (const campo of [
        "app_secret",
        "phone_number_id",
        "waba_id",
        "webhook_verify_token",
        "access_token",
        "app_id",
        "phone_number",
      ]) {
        const valor = linha[campo];
        const ok = preenchido(valor);
        campos[campo] = {
          preenchido: ok,
          // Segredo nunca é impresso: só o hash, para comparar com o da Meta.
          hash: campo === "app_secret" && ok ? hashCurto(String(valor)) : undefined,
        };
        if (!ok) {
          problemas.push(`Campo obrigatório ausente: ${campo}.`);
        }
      }
      diag.config.campos = campos;

      // A versão da Graph API guardada é a causa mais comum de "a Meta parou
      // de responder": cada versão sai do ar ~2 anos após o lançamento da
      // seguinte, e a Meta passa a recusar TODAS as chamadas sem dar pista.
      const versaoGuardada = String(linha.graph_api_version || "").trim();
      const versaoEmUso = versaoGraphValida(versaoGuardada);
      diag.config.versaoGraph = versaoEmUso;
      if (versaoGuardada && versaoEmUso !== versaoGuardada.toLowerCase()) {
        problemas.push(
          `A versão da Graph API guardada (${versaoGuardada}) saiu do ar na Meta. ` +
            `As chamadas passam a usar ${versaoEmUso}.`,
        );
      }

      if (linha.status && linha.status !== "CONECTADO") {
        problemas.push(
          `Status da configuração é "${linha.status}" (esperado CONECTADO). Confira o App Secret e o Token.`,
        );
      }
    }
  } catch (e: any) {
    problemas.push(`Não foi possível ler whatsapp_config: ${String(e?.message || e).slice(0, 300)}`);
  }

  // --- Tabelas e contagens ---
  for (const tabela of TABELAS_ESPERADAS) {
    try {
      const existe = await db!.execute(sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tabela}
        LIMIT 1
      `);
      const tem = (Array.isArray(existe) ? existe.length : (existe as any).rows?.length) > 0;
      let linhas = 0;
      if (tem) {
        const contagem = await db!.execute(sql`
          SELECT count(*)::int AS total FROM ${sql.raw(tabela)}
        `);
        linhas = (Array.isArray(contagem) ? contagem[0] : (contagem as any).rows?.[0])?.total ?? 0;
      } else {
        problemas.push(`Tabela ausente: ${tabela}.`);
      }
      diag.tabelas[tabela] = { existe: tem, linhas };
    } catch (e: any) {
      diag.tabelas[tabela] = { existe: false, linhas: 0 };
      problemas.push(`Erro ao conferir ${tabela}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }

  // --- Tipos das colunas ---
  //
  // Este bloco existe por causa de uma falha real e silenciosa: a tabela
  // `whatsapp_conversas` existia, as queries passavam a bater nela, e todas
  // falhavam porque `contato_id` não era `uuid`. Nenhum teste anterior pegava
  // isso — a checagem de tabela só confirmava a existência, não o tipo.
  // O erro aparecia na tela como "Failed query: SELECT id FROM
  // whatsapp_conversas WHERE contato_id = ..." sem o motivo, então nada
  // apontava a causa.
  //
  // `perfilId` vem de `profiles.id` (uuid). Se `contato_id` for text/varchar,
  // `contato_id = $1::uuid` estoura. Vamos verificar o tipo das colunas de
  // ligação antes que a conversa possa ser criada.
  const COLUNAS_ESPERADAS: Array<{
    tabela: string;
    coluna: string;
    tipo: string;
    obrigatorio?: boolean;
  }> = [
    { tabela: "whatsapp_conversas", coluna: "contato_id", tipo: "uuid", obrigatorio: true },
    { tabela: "whatsapp_conversas", coluna: "id", tipo: "uuid", obrigatorio: true },
    { tabela: "whatsapp_conversas", coluna: "responsavel_id", tipo: "uuid" },
    { tabela: "whatsapp_mensagens", coluna: "conversa_id", tipo: "uuid", obrigatorio: true },
    { tabela: "whatsapp_mensagens", coluna: "id", tipo: "uuid", obrigatorio: true },
  ];

  for (const { tabela, coluna, tipo, obrigatorio } of COLUNAS_ESPERADAS) {
    try {
      const res = await db!.execute(sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tabela}
          AND column_name = ${coluna}
        LIMIT 1
      `);
      const linha = (Array.isArray(res) ? res[0] : (res as any).rows?.[0]) as any;

      if (!linha) {
        problemas.push(
          `Coluna ausente: ${tabela}.${coluna}. Sem ela as queries de conversa falham.`,
        );
      } else if (linha.data_type !== tipo) {
        problemas.push(
          `Tipo incorreto em ${tabela}.${coluna}: esperado "${tipo}", encontrado "${linha.data_type}". ` +
            `A query "${tabela} WHERE contato_id = ...::uuid" vai falhar com "tipo de dado incompatível" se o campo não for uuid.`,
        );
      }
    } catch (e: any) {
      const pg = extrairErroPostgres(e);
      problemas.push(
        `Erro ao conferir o tipo de ${tabela}.${coluna}: ${pg.mensagem.slice(0, 300)}`,
      );
    }
  }

  // --- Conversas e mensagens: distingue "nunca chegou nada" de "chegou e não
  //     virou conversa" ---
  try {
    const conv = await db!.execute(sql`SELECT count(*)::int AS total FROM whatsapp_conversas`);
    diag.contagens.conversas =
      (Array.isArray(conv) ? conv[0] : (conv as any).rows?.[0])?.total ?? 0;

    const msgs = await db!.execute(sql`SELECT count(*)::int AS total FROM whatsapp_mensagens`);
    diag.contagens.mensagens =
      (Array.isArray(msgs) ? msgs[0] : (msgs as any).rows?.[0])?.total ?? 0;

    const porStatusMsg = await db!.execute(sql`
      SELECT status, count(*)::int AS total FROM whatsapp_mensagens GROUP BY status
    `);
    for (const l of Array.isArray(porStatusMsg) ? porStatusMsg : (porStatusMsg as any).rows ?? []) {
      diag.contagens.mensagensPorStatus[l.status ?? "?"] = l.total;
    }

    const porStatusConv = await db!.execute(sql`
      SELECT status, count(*)::int AS total FROM whatsapp_conversas GROUP BY status
    `);
    for (const l of Array.isArray(porStatusConv)
      ? porStatusConv
      : (porStatusConv as any).rows ?? []) {
      diag.contagens.conversasPorStatus[l.status ?? "?"] = l.total;
    }

    if (diag.contagens.mensagens === 0 && diag.contagens.conversas === 0) {
      problemas.push(
        "Nenhuma mensagem nem conversa registrada. Se a Meta já chamou o webhook, confira o App Secret — assinatura inválida devolve 401 antes de criar conversa.",
      );
    }

    // O sintoma que este diagnóstico existe para explicar: a tela de log mostra
    // eventos (o webhook chegou, assinou, respondeu) mas a lista de conversas
    // continua vazia. Isso significa que `processarMensagemRecebida` falhou —
    // e o motivo estava escondido porque o Drizzle engolia o erro do Postgres.
    // Distinguir os três estados é o que aponta a correção:
    //   conversas > 0  -> a criação funciona; o problema é a listagem
    //   conversas = 0, mensagens > 0 -> a mensagem entrou mas não virou conversa
    //   ambos = 0 -> nada chegou ao banco
    if (diag.contagens.conversas === 0 && diag.contagens.mensagens > 0) {
      // A causa real já foi vista: `whatsapp_conversas` não existia (42P01),
      // porque `ensureConversasSchema` era a única função que a criava e
      // engolia qualquer falha. O INSERT do webhook falhava, nenhuma conversa
      // nascia e o menu Conversas ficava vazio — sem nenhuma pista na tela.
      // Agora o schema é garantido no boot, no webhook e aqui no diagnóstico.
      const tabelaExiste = diag.tabelas["whatsapp_conversas"]?.existe;
      problemas.push(
        `Há ${diag.contagens.mensagens} mensagem(ns) gravada(s) mas NENHUMA conversa criada. ` +
          (tabelaExiste
            ? "A tabela whatsapp_conversas existe agora — as próximas mensagens já devem criar conversas. Se as antigas não apareceram, elas foram gravadas sem conversa_id e precisam ser reprocessadas."
            : "A tabela whatsapp_conversas NÃO existe. O diagnóstico acabou de tentar criá-la — se ainda falta, veja o erro do schema no log acima."),
      );
    }
    if (diag.contagens.conversas > 0) {
      problemas.push(
        `ATENÇÃO: ${diag.contagens.conversas} conversa(s) existem no banco mas a tela mostra vazio. ` +
          "O problema está na listagem, não na criação — revise o filtro de status e o JOIN com profiles.",
      );
      // A própria hipótese anterior ("filtro de status / JOIN") fica sem prova:
      // o filtro inicial é TODAS, que não filtra nada, e os JOINs são LEFT, que
      // nunca removem linha. Se a lista continua vazia, resta a query estar
      // estourando — e aí o erro do Postgres é a resposta.
      const erroListagem = await testarListagem();
      if (erroListagem) {
        problemas.push(
          `A query de listagem de conversas FALHA no banco: ${erroListagem} ` +
            "É por isso que a tela mostra vazia mesmo com conversas gravadas.",
        );
      }
    }
  } catch (e: any) {
    problemas.push(`Erro ao contar conversas/mensagens: ${String(e?.message || e).slice(0, 200)}`);
  }

  if (diag.ultimoErroLog) {
    problemas.push(`O próprio log está falhando: ${diag.ultimoErroLog.mensagem}`);
  }

  diag.status = problemas.length === 0 ? "OK" : "ATENCAO";

  // O diagnóstico vira linha de log: a tela ordena por criado_em DESC, então ele
  // aparece no topo e fica visível sem precisar de SELECT.
  try {
    await registrarLogMeta({
      direcao: "ENTRADA",
      operacao: "DIAGNOSTICO",
      status: diag.status === "OK" ? "SUCESSO" : "ERRO",
      resumo:
        diag.status === "OK"
          ? "Diagnóstico OK: configuração completa e tabelas presentes."
          : `Diagnóstico apontou ${problemas.length} problema(s).`,
      payload: diag,
    });
  } catch {
    // registrarLogMeta já trata a falha internamente.
  }

  return diag;
}
