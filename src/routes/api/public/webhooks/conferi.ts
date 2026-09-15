import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da Company Conferi: eles chamam essa URL por GET, passando só o `codigo_consulta`,
 * quando uma consulta assíncrona (ex.: Desvalorização Fipe, Auto Pericia Gold) termina de
 * processar. A Conferi não assina a chamada, então autenticamos pelo `token` na própria URL
 * (gerado por instalação em `consulta_provedores.webhook_token` e mostrado no admin em
 * Configurações → Consulta veicular).
 */
export const Route = createFileRoute("/api/public/webhooks/conferi")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const codigoConsulta = url.searchParams.get("codigo_consulta") || url.searchParams.get("codigoConsulta");
        const token = url.searchParams.get("token");

        if (!codigoConsulta) {
          return new Response("codigo_consulta ausente", { status: 400 });
        }

        const { getWebhookTokenConferi, processarWebhookConferi } = await import("@/db/consulta-veicular.server");
        const tokenEsperado = await getWebhookTokenConferi();
        if (!tokenEsperado || token !== tokenEsperado) {
          return new Response("Token inválido", { status: 401 });
        }

        try {
          const resultado = await processarWebhookConferi(codigoConsulta);
          return new Response(JSON.stringify(resultado), {
            status: resultado.ok ? 200 : 404,
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, message: e?.message || "Erro ao processar webhook." }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
