import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db/index";
import { ensureComunicacoesSchema } from "@/db/comunicacoes.server";
import { sql } from "drizzle-orm";

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
            return new Response(challenge, { status: 200 });
          }
        }

        console.error("[WhatsApp Webhook] Falha na verificação do token.");
        return new Response("Forbidden", { status: 403 });
      },

      // Recebimento de Eventos (POST)
      POST: async ({ request }) => {
        const bodyText = await request.text();
        const signature = request.headers.get("x-hub-signature-256");

        if (!db) throw new Error("Database offline");
        await ensureComunicacoesSchema();
        const configRes = await db.execute(sql`SELECT app_secret FROM whatsapp_config LIMIT 1`);
        const appSecret = (Array.isArray(configRes) ? configRes[0] : (configRes as any).rows?.[0])
          ?.app_secret;

        if (appSecret && signature) {
          const expectedSignature =
            "sha256=" + createHmac("sha256", appSecret).update(bodyText).digest("hex");

          if (
            !signature ||
            !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
          ) {
            console.error("[WhatsApp Webhook] Assinatura inválida.");
            return new Response("Invalid signature", { status: 401 });
          }
        }

        const payload = JSON.parse(bodyText);

        // 2. Processar Payload
        try {
          if (!db) throw new Error("Database offline");
          // Extrair informações básicas
          const entry = payload.entry?.[0];
          const change = entry?.changes?.[0];
          const value = change?.value;
          const wabaId = entry?.id;
          const eventType = change?.field;

          // 3. Registrar Log
          await db.execute(sql`
            INSERT INTO whatsapp_webhook_logs (waba_id, event_type, payload, status)
            VALUES (${wabaId}, ${eventType}, ${JSON.stringify(payload)}::jsonb, 'PROCESSADO')
          `);

          // 4. Lógica de Negócio (Idempotente)
          if (value?.messages) {
            // Mensagens recebidas
            const { processarMensagemRecebida } = await import("@/db/conversas.server");
            for (const msg of value.messages) {
              await processarMensagemRecebida(msg.from, msg);
            }
          }

          if (value?.statuses) {
            // Atualizações de status (entregue, lido, falha).
            // `status` aqui é o estado de entrega; o estado da fila do worker
            // mora em `estado_fila`, então os dois não se atrapelham.
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
                await db.execute(sql`
                  UPDATE whatsapp_campanhas
                  SET status = 'AGUARDANDO', atualizado_em = now()
                  WHERE status = 'TEMPLATE_INDESPONIVEL'
                    AND template_id IN (SELECT id FROM whatsapp_templates WHERE meta_name = ${templateName})
                `);
              }
            }
          }

          return new Response("EVENT_RECEIVED", { status: 200 });
        } catch (error: any) {
          console.error("[WhatsApp Webhook] Erro ao processar:", error);

          if (db) {
            await db.execute(sql`
              INSERT INTO whatsapp_webhook_logs (event_type, payload, status, erro_detalhe)
              VALUES ('ERRO_PROCESSAMENTO', ${JSON.stringify(payload)}::jsonb, 'ERRO', ${error.message})
            `);
          }

          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
