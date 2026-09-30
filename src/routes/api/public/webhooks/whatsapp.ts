import { createFileRoute } from '@tanstack/react-router';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/db/index';
import { ensureComunicacoesSchema } from '@/db/comunicacoes.server';
import { sql } from 'drizzle-orm';

export const Route = createFileRoute('/api/public/webhooks/whatsapp')({
  server: {
    handlers: {
      // Verificação do Webhook pela Meta (GET)
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');

        if (mode === 'subscribe' && token) {
          // Buscar o token configurado no banco
          if (!db) throw new Error("Database offline");
          await ensureComunicacoesSchema();
          const res = await db.execute(sql`SELECT webhook_verify_token FROM whatsapp_config LIMIT 1`);
          const configToken = (res as any).rows?.[0]?.webhook_verify_token;

          if (token === configToken) {
            console.log("[WhatsApp Webhook] Verificado com sucesso!");
            return new Response(challenge, { status: 200 });
          }
        }

        console.error("[WhatsApp Webhook] Falha na verificação do token.");
        return new Response('Forbidden', { status: 403 });
      },

      // Recebimento de Eventos (POST)
      POST: async ({ request }) => {
        const bodyText = await request.text();
        const signature = request.headers.get('x-hub-signature-256');

        if (!db) throw new Error("Database offline");
        await ensureComunicacoesSchema();
        const configRes = await db.execute(sql`SELECT app_secret FROM whatsapp_config LIMIT 1`);
        const appSecret = (configRes as any).rows?.[0]?.app_secret;

        if (appSecret && signature) {
          const expectedSignature = 'sha256=' + createHmac('sha256', appSecret)
            .update(bodyText)
            .digest('hex');

          if (!signature || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            console.error("[WhatsApp Webhook] Assinatura inválida.");
            return new Response('Invalid signature', { status: 401 });
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
            // Atualizações de status (entregue, lido, falha)
            for (const status of value.statuses) {
              const metaMessageId = status.id;
              const newStatus = status.status.toUpperCase();
              
              await db.execute(sql`
                UPDATE whatsapp_mensagens 
                SET 
                  status = ${newStatus}, 
                  entregue_em = CASE WHEN ${newStatus} = 'DELIVERED' THEN now() ELSE entregue_em END,
                  lido_em = CASE WHEN ${newStatus} = 'READ' THEN now() ELSE lido_em END,
                  atualizado_em = now()
                WHERE meta_message_id = ${metaMessageId}
              `);
            }
          }

          if (eventType === 'message_template_status_update') {
            // Atualização de status de template
            const templateName = value?.event_type === 'APPROVED' ? value.message_template_name : null;
            if (templateName) {
              await db.execute(sql`
                UPDATE whatsapp_templates 
                SET status = 'APROVADO', ultima_sincronizacao = now() 
                WHERE meta_name = ${templateName}
              `);
            }
          }

          return new Response('EVENT_RECEIVED', { status: 200 });
        } catch (error: any) {
          console.error("[WhatsApp Webhook] Erro ao processar:", error);
          
          if (db) {
            await db.execute(sql`
              INSERT INTO whatsapp_webhook_logs (event_type, payload, status, erro_detalhe)
              VALUES ('ERRO_PROCESSAMENTO', ${JSON.stringify(payload)}::jsonb, 'ERRO', ${error.message})
            `);
          }

          return new Response('Internal Server Error', { status: 500 });
        }
      }
    }
  }
});
