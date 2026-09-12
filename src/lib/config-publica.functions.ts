import { createServerFn } from "@tanstack/react-start";

/**
 * Config de SEO e tags de rastreamento (GTM, Google Ads, Pixel Meta, HTML customizado)
 * seguras para expor em qualquer página pública. Usada pelo layout raiz do site.
 */
export const obterConfiguracoesPublicasFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { obterConfiguracoesPublicas } = await import("@/db/admin.server");
    return { ok: true as const, data: await obterConfiguracoesPublicas() };
  } catch (e: any) {
    return { ok: false as const, message: e.message };
  }
});
