import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db/index";
import { sql } from "drizzle-orm";
import { getUazapiConfig } from "@/db/marketing.server";
import { dispararEventoSistema } from "@/db/automacoes.server";

export const Route = createFileRoute("/api/public/webhooks/uazapi")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!db) return new Response("Database offline", { status: 503 });

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        // Validação opcional por token da instância (header `token`).
        const cfg: any = await getUazapiConfig().catch(() => ({}));
        const tokenCfg = String(cfg?.uazapi_token || "").trim();
        const tokenHeader = String(request.headers.get("token") || request.headers.get("x-token") || "").trim();
        if (tokenCfg && tokenHeader && tokenHeader !== tokenCfg) {
          return new Response("Unauthorized", { status: 401 });
        }

        const eventType = String(body?.EventType || body?.event || body?.type || "").toLowerCase();
        const action = String(body?.action || body?.Action || "").toLowerCase();
        const groupJid = String(body?.groupjid || body?.groupJid || body?.group || body?.chatId || "").trim();
        const participants: string[] = Array.isArray(body?.participants)
          ? body.participants
          : Array.isArray(body?.Participants)
            ? body.Participants
            : [];

        // Evento de grupo com entrada de participante.
        if (eventType === "groups" && action === "add" && groupJid && participants.length) {
          for (const p of participants) {
            const numero = String(p).replace(/\D/g, "");
            if (!numero) continue;
            try {
              await dispararEventoSistema("GRUPO_MEMBRO_ENTROU", {
                grupo_id: groupJid,
                participante_numero: numero,
              });
            } catch (e) {
              console.error("[Uazapi Webhook] falha ao disparar evento:", e);
            }
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});