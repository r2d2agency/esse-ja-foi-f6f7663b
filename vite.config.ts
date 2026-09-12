// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Gerado uma vez por execução do `vite build` — igual no bundle do cliente e no bundle do
// servidor (mesmo `define`). O cliente compara o próprio id com o que o servidor devolve em
// runtime para saber se um novo deploy aconteceu e precisa recarregar. Ver VersaoWatcher.
const APP_BUILD_ID = String(Date.now());

export default defineConfig({
  vite: {
    define: {
      __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
    },
  },
  // Self-hosting (Easypanel/Docker): gera um servidor Node que escuta em HOST/PORT.
  // Sem isso o build sai no formato Cloudflare Worker e o container sobe sem abrir porta.
  nitro: {
    preset: "node-server",
    output: { dir: ".output", serverDir: ".output/server", publicDir: ".output/public" },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
