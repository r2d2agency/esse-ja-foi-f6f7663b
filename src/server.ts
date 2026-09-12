import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Injeta as tags de rastreamento (GTM, Google Ads, Pixel Meta, HTML customizado do admin)
 * direto no HTML final da resposta — funciona pra qualquer tipo de snippet (script, meta,
 * style etc), sem depender do sistema estruturado de head() do React pra conteúdo solto.
 */
async function injetarTagsRastreamento(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  try {
    const { obterConfiguracoesPublicas, construirInjecoesRastreamento } = await import("./db/admin.server");
    const cfg = await obterConfiguracoesPublicas();
    const { head, body } = construirInjecoesRastreamento(cfg);
    if (!head && !body) return response;

    let html = await response.text();
    if (head) html = html.replace("</head>", `${head}</head>`);
    if (body) html = html.replace(/<body([^>]*)>/, (m) => `${m}${body}`);

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error("[tags-rastreamento] falha ao injetar tags no HTML:", error);
    return response;
  }
}

/**
 * Job em segundo plano: avisa por e-mail quem marcou "lembrar-me" num leilão
 * que já começou ou está prestes a começar. Roda a cada 5 minutos no mesmo
 * processo Node do servidor — não depende de nenhuma página estar aberta.
 * O `globalThis` evita duplicar o intervalo se este módulo for reavaliado
 * (hot-reload em dev).
 */
declare global {
  // eslint-disable-next-line no-var
  var __lembretesLeilaoInterval: ReturnType<typeof setInterval> | undefined;
}

if (!globalThis.__lembretesLeilaoInterval) {
  globalThis.__lembretesLeilaoInterval = setInterval(async () => {
    try {
      const { processarLembretesLeilao } = await import("./db/leilao.server");
      await processarLembretesLeilao();
    } catch (error) {
      console.error("[lembretes-leilao] falha no job em segundo plano:", error);
    }
  }, 5 * 60 * 1000);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') {
      return new Response('ok', { 
        status: 200,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    try {
      console.log(`[SSR] Request: ${request.method} ${url.pathname}`);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalizado = await normalizeCatastrophicSsrResponse(response);
      return await injetarTagsRastreamento(normalizado);
    } catch (error) {
      console.error('Fatal SSR Error:', error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },


};
