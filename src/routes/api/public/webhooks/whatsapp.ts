import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db/index";
import { ensureComunicacoesSchema } from "@/db/comunicacoes.server";
import { ensureConversasSchema } from "@/db/conversas.server";
import { sql } from "drizzle-orm";
import { registrarLogMeta } from "@/db/logs-whatsapp.server";
import { registrarLogCampanha } from "@/db/logs-campanha.server";
import { extrairErroPostgres } from "@/db/erro-postgres";

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      // Verificação do Webhook pela Meta (GET)
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && token) {
          // Buscar o token configurado no banco
          if (!db) throw new Error("Database offline");
          await ensureComunicacoesSchema();
          const res = await db.execute(
            sql`SELECT webhook_verify_token FROM whatsapp_config LIMIT 1`,
          );
          // postgres-js retorna as linhas diretamente como array; alguns drivers usam .rows.
          const configToken = (Array.isArray(res) ? res[0] : (res as any).rows?.[0])
            ?.webhook_verify_token;

          if (token === configToken) {
            console.log("[WhatsApp Webhook] Verificado com sucesso!");
            await registrarLogMeta({
              direcao: "ENTRADA",
              operacao: "WEBHOOK",
              status: "SUCESSO",
              resumo: "Webhook verificado pela Meta (handshake concluído).",
              payload: { modo: mode },
            });
            return new Response(challenge, { status: 200 });
          }

          // A Meta só chega até aqui quando a URL está certa mas o token de
          // verificação não bate. Sem esta linha o motivo fica invisível: a
          // Meta exibe "verificação falhou" e a tela de logs permanece vazia.
          await registrarLogMeta({
            direcao: "ENTRADA",
            operacao: "WEBHOOK",
            status: "ERRO",
            httpStatus: 403,
            resumo:
              "Verificação do webhook recusada: o token enviado pela Meta difere do configurado aqui.",
            payload: {
              modo: mode,
              tokenRecebido: String(token).slice(0, 6) + "…",
              tokenConfigurado: configToken ? String(configToken).slice(0, 6) + "…" : null,
            },
          });
        }

        console.error("[WhatsApp Webhook] Falha na verificação do token.");
        return new Response("Forbidden", { status: 403 });
      },

      // Recebimento de Eventos (POST)
      POST: async ({ request }) => {
        // O handler inteiro vive dentro deste try: antes, o JSON.parse e a
        // validação da assinatura ficavam fora, então qualquer falha nesses
        // passos matava a requisição sem escrever uma única linha — a tela de
        // log continuava vazia e não havia como descobrir o motivo.
        try {
          const bodyText = await request.text();
          const signature = request.headers.get("x-hub-signature-256");
          const inicio = Date.now();

          if (!db) throw new Error("Database offline");

          // O schema e a config vêm antes de qualquer log porque o log precisa
          // da tabela. Falha aqui também é registrada, senão o boot quebrado
          // continuaria silencioso.
          let ensureOk = true;
          let ensureErro = "";
          try {
            await ensureComunicacoesSchema();
            // whatsapp_conversas só é criada aqui — nenhuma migração toca nela.
            // Se o boot falhar (transiente, ex.: conexão caiu no momento exato),
            // o webhook se auto-corrige a cada mensagem recebida. Sem isto, uma
            // única falha no boot deixava o sistema permanentemente mudo: toda
            // mensagem falhava no INSERT INTO whatsapp_conversas e nenhuma
            // conversa nascia.
            await ensureConversasSchema();
          } catch (e: any) {
            ensureOk = false;
            ensureErro = String(e?.message || e);
          }

          let appSecret: string | null = null;
          let configLida = true;
          if (ensureOk) {
            try {
              const configRes = await db.execute(
                sql`SELECT app_secret, waba_id, phone_number_id FROM whatsapp_config LIMIT 1`,
              );
              const linha = (Array.isArray(configRes)
                ? configRes[0]
                : (configRes as any).rows?.[0]) as any;
              appSecret = linha?.app_secret ?? null;
            } catch (e: any) {
              configLida = false;
              await registrarLogMeta({
                direcao: "ENTRADA",
                operacao: "WEBHOOK",
                status: "ERRO",
                httpStatus: 500,
                resumo: "Falha ao ler whatsapp_config para validar a assinatura.",
                payload: { erro: String(e?.message || e).slice(0, 1000) },
              });
            }
          }

          if (!ensureOk) {
            await registrarLogMeta({
              direcao: "ENTRADA",
              operacao: "WEBHOOK",
              status: "ERRO",
              httpStatus: 500,
              resumo:
                "Falha ao garantir as tabelas do WhatsApp (ensureComunicacoesSchema). Sem elas nenhum evento pode ser processado.",
              payload: { erro: ensureErro.slice(0, 1000) },
            });
            return new Response("Internal Server Error", { status: 500 });
          }

          // Linha-raiz do evento: gravada antes de qualquer validação, para que
          // exista rastro mesmo que tudo abaixo falhe.
          await registrarLogMeta({
            direcao: "ENTRADA",
            operacao: "WEBHOOK",
            status: "SUCESSO",
            httpStatus: 200,
            resumo: "Evento recebido no webhook.",
            payload: {
              bytes: bodyText.length,
              assinaturaPresente: Boolean(signature),
              configLida,
              // Nomes de perfil que a Meta mandou junto — servem de histórico
              // para retroalimentar contatos criados como "não identificado".
              contacts: (value?.contacts ?? []).map((ct: any) => ({
                wa_id: ct?.wa_id ?? null,
                name: ct?.profile?.name ?? null,
              })),
            },
            duracaoMs: Date.now() - inicio,
          });

          const payload = JSON.parse(bodyText);

          // Extrair informações básicas
          const entry = payload.entry?.[0];
          const change = entry?.changes?.[0];
          const value = change?.value;
          const wabaId = entry?.id ?? null;
          const eventType = change?.field ?? null;

          // --- Validação da assinatura HMAC ---
          if (appSecret) {
            const expectedSignature =
              "sha256=" + createHmac("sha256", appSecret).update(bodyText).digest("hex");

            // `timingSafeEqual` lança exceção quando os buffers têm tamanhos
            // diferentes — sem esta checagem, uma assinatura truncada derrubava
            // o handler com um erro em vez de um 401 limpo.
            const conferida =
              Boolean(signature) &&
              signature!.length === expectedSignature.length &&
              timingSafeEqual(Buffer.from(signature!), Buffer.from(expectedSignature));

            if (!conferida) {
              // Aqui estava o buraco que escondia a causa: o 401 era devolvido
              // com um console.error e nenhuma linha no banco, então a tela de
              // log parecia nunca ter sido chamada. O 401 continua (a Meta
              // exige a recusa), mas agora ele fica visível.
              console.error("[WhatsApp Webhook] Assinatura inválida.");
              await registrarLogMeta({
                direcao: "ENTRADA",
                operacao: "WEBHOOK",
                wabaId,
                endpoint: eventType,
                httpStatus: 401,
                status: "ERRO",
                resumo: signature
                  ? "Assinatura inválida: o x-hub-signature-256 não confere com o app_secret gravado na configuração. Confira se o App Secret da Meta é o mesmo salvo em Comunicações > Configurações."
                  : "Assinatura ausente: a Meta não enviou o header x-hub-signature-256, então a identidade do remetente não pôde ser confirmada.",
                payload: {
                  assinaturaRecebida: signature ? signature.slice(0, 14) + "…" : null,
                  assinaturaEsperada: expectedSignature.slice(0, 14) + "…",
                  bodyBytes: bodyText.length,
                  eventType,
                },
                duracaoMs: Date.now() - inicio,
              });
              return new Response("Invalid signature", { status: 401 });
            }
          } else {
            // Sem `app_secret` não há como conferir a assinatura: o HMAC é a
            // única prova de que quem mandou é a Meta. Aceitar o evento assim
            // deixa um endpoint público que grava conversas e dispara ações a
            // partir de qualquer POST — falha aberta.
            //
            // A saída de emergência (`WEBHOOK_ASSINATURA_OPCIONAL=true`) existe
            // só para o intervalo entre configurar o App Secret e o deploy
            // desta correção; sem ela, o padrão é recusar.
            const assinaturaOpcional =
              process.env["WEBHOOK_ASSINATURA_OPCIONAL"] === "true";

            if (!assinaturaOpcional) {
              console.error(
                "[WhatsApp Webhook] Nenhum app_secret configurado — requisição recusada.",
              );
              await registrarLogMeta({
                direcao: "ENTRADA",
                operacao: "WEBHOOK",
                wabaId,
                endpoint: eventType,
                httpStatus: 401,
                status: "ERRO",
                resumo:
                  "Nenhum app_secret configurado — a assinatura não pode ser conferida, então o evento foi recusado. Cadastre o App Secret da Meta em Comunicações > Configurações.",
                payload: {
                  eventType,
                  assinaturaPresente: Boolean(signature),
                },
                duracaoMs: Date.now() - inicio,
              });
              return new Response("Missing app secret", { status: 401 });
            }

            await registrarLogMeta({
              direcao: "ENTRADA",
              operacao: "WEBHOOK",
              httpStatus: 200,
              status: "ERRO",
              resumo:
                "ATENÇÃO: nenhum app_secret configurado — a validação de assinatura foi ignorada porque WEBHOOK_ASSINATURA_OPCIONAL=true.",
              payload: { eventType },
              duracaoMs: Date.now() - inicio,
            });
          }

          if (!db) throw new Error("Database offline");

          // --- Mensagens recebidas ---
          if (value?.messages) {
            const { processarMensagemRecebida } = await import("@/db/conversas.server");
            for (const msg of value.messages) {
              // Cada mensagem em seu próprio try/catch: um contato problemático
              // (telefone com formato inesperado, insert que estoura) não pode
              // derrubar as demais e nem deixar o lote marcado como PROCESSADO.
              try {
                // A Meta envia o nome do perfil do WhatsApp junto do lote
                // (value.contacts[].profile.name), casando por wa_id. Sem
                // passar adiante, todo contato novo nascia "Contato não
                // identificado" mesmo com a Meta sabendo o nome.
                const nomePerfil = (value?.contacts ?? []).find(
                  (ct: any) => ct?.wa_id === msg.from || !ct?.wa_id,
                )?.profile?.name;
                await processarMensagemRecebida(msg.from, msg, nomePerfil);
              } catch (err: any) {
                console.error("[WhatsApp Webhook] Falha ao processar mensagem:", err);
                // O Drizzle envolve o erro real do Postgres em `.cause`; sem isto
                // o log mostrava só a query e nunca o motivo (ex.: "column does
                // not exist", "invalid input syntax for type uuid").
                const pg = extrairErroPostgres(err);
                await registrarLogMeta({
                  direcao: "ENTRADA",
                  operacao: "WEBHOOK",
                  wabaId,
                  endpoint: eventType,
                  httpStatus: 500,
                  status: "ERRO",
                  resumo: `Falha ao processar mensagem de ${msg?.from ?? "?"}.`,
                  payload: {
                    erro: pg.mensagem.slice(0, 1000),
                    sqlstate: pg.code,
                    detalhe: pg.detalhe,
                    dica: pg.hint,
                    mensagem: msg,
                  },
                  duracaoMs: Date.now() - inicio,
                });
              }
            }
          }

          // --- Atualizações de status (entregue, lido, falha) ---
          if (value?.statuses) {
            for (const status of value.statuses) {
              const metaMessageId = status.id;
              const novo = String(status.status || "").toUpperCase();
              // A Meta manda DELIVERED/READ/FAILED; a tela lê em português.
              const rotulo: Record<string, string> = {
                SENT: "ENVIADA",
                DELIVERED: "ENTREGUE",
                READ: "LIDA",
                FAILED: "FALHOU",
                DELETED: "REMOVIDA",
              };
              const novoStatus = rotulo[novo] ?? novo;
              const erro = status.errors?.[0];

              await db.execute(sql`
                UPDATE whatsapp_mensagens
                SET
                  status = ${novoStatus},
                  entregue_em = CASE WHEN ${novoStatus} = 'ENTREGUE' THEN now() ELSE entregue_em END,
                  lido_em = CASE WHEN ${novoStatus} = 'LIDA' THEN now() ELSE lido_em END,
                  erro_codigo = COALESCE(${erro?.code != null ? String(erro.code) : null}, erro_codigo),
                  erro_mensagem = COALESCE(${erro?.error_title ?? null}, erro_mensagem),
                  atualizado_em = now()
                WHERE meta_message_id = ${metaMessageId}
              `);

              // 131047/131052: o número não existe no WhatsApp. Marcar o contato
              // evita repetir o mesmo erro — e gastar a cota — em toda campanha.
              const codigo = erro?.code;
              if (novo === "FAILED" && (codigo === 131047 || codigo === 131052)) {
                const linha = await db.execute(sql`
                  SELECT comprador_id, contato_marketing_id
                  FROM whatsapp_mensagens WHERE meta_message_id = ${metaMessageId} LIMIT 1
                `);
                const alvo = (Array.isArray(linha) ? linha[0] : (linha as any).rows?.[0]) ?? {};
                if (alvo.comprador_id) {
                  await db.execute(sql`
                    UPDATE profiles SET whatsapp_status = 'INVALIDO' WHERE id = ${alvo.comprador_id}::uuid
                  `);
                }
                if (alvo.contato_marketing_id) {
                  await db.execute(sql`
                    UPDATE marketing_contatos SET whatsapp_status = 'invalido'
                    WHERE id = ${alvo.contato_marketing_id}::uuid
                  `);
                }
              }
            }
          }

          // --- Status de template ---
          if (eventType === "message_template_status_update") {
            // O status vem em `value.event`, não em `value.event_type`: ler o
            // campo errado fazia a guarda abaixo falhar e o UPDATE nunca rodar,
            // então o template ficava travado em PENDING até a sincronização.
            const statusTemplate = String(value?.event ?? "").toUpperCase();
            const templateName = value?.message_template_name;
            const motivo = value?.reason ?? null;
            if (templateName && statusTemplate) {
              await db.execute(sql`
                UPDATE whatsapp_templates
                SET status = ${statusTemplate},
                    motivo_recusa = ${statusTemplate === "REJECTED" ? String(motivo) : null},
                    ultima_sincronizacao = now()
                WHERE meta_name = ${templateName}
              `);

              // Template aprovado libera as campanhas que estavam travadas.
              if (statusTemplate === "APPROVED") {
                const liberadas = await db.execute(sql`
                  UPDATE whatsapp_campanhas
                  SET status = 'AGUARDANDO', atualizado_em = now()
                  WHERE status IN ('TEMPLATE_INDISPONIVEL', 'TEMPLATE_INDESPONIVEL')
                    AND template_id IN (SELECT id FROM whatsapp_templates WHERE meta_name = ${templateName})
                  RETURNING id
                `);
                const linhas: any[] = (liberadas as any)?.rows
                  ? (liberadas as any).rows
                  : Array.isArray(liberadas)
                    ? (liberadas as any[])
                    : [];
                for (const c of linhas) {
                  await registrarLogCampanha({
                    campanhaId: c.id,
                    acao: "PROMOCAO_STATUS",
                    detalhe: "Template aprovado pela Meta: campanha liberada para voltar a fila.",
                    payload: { novo_status: "AGUARDANDO", origem: "webhook" },
                  });
                }
              }
            }
          }

          // Fechamento: diferencia "a Meta chamou e deu tudo certo" de "a Meta
          // chamou mas o evento não tinha nada processável".
          const qtdMensagens = value?.messages?.length ?? 0;
          const qtdStatus = value?.statuses?.length ?? 0;
          await registrarLogMeta({
            direcao: "ENTRADA",
            operacao: "WEBHOOK",
            wabaId,
            endpoint: eventType,
            httpStatus: 200,
            status: "SUCESSO",
            resumo:
              qtdMensagens || qtdStatus
                ? `Evento processado: ${qtdMensagens} mensagem(ns), ${qtdStatus} atualização(ões) de status.`
                : "Evento processado (sem mensagens nem status para tratar).",
            payload: {
              eventType,
              wabaId,
              telefone: value?.metadata?.phone_number_id ?? null,
              mensagens: qtdMensagens,
              status: qtdStatus,
              temConfig: Boolean(appSecret),
            },
            duracaoMs: Date.now() - inicio,
          });

          return new Response("EVENT_RECEIVED", { status: 200 });
        } catch (error: any) {
          console.error("[WhatsApp Webhook] Erro ao processar:", error);
          // Antes esta linha só existia no catch interno: um JSON.parse
          // quebrado ou uma falha no meio do caminho não deixava registro.
          const pg = extrairErroPostgres(error);
          await registrarLogMeta({
            direcao: "ENTRADA",
            operacao: "WEBHOOK",
            httpStatus: 500,
            status: "ERRO",
            resumo: "Erro ao processar evento do webhook.",
            payload: {
              erro: pg.mensagem.slice(0, 1000),
              sqlstate: pg.code,
              detalhe: pg.detalhe,
              dica: pg.hint,
              stack: String(error?.stack || "").slice(0, 1500),
            },
          });
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
