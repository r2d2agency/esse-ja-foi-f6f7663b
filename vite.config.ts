// The shared vite-tanstack config package already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig, type LovableViteTanstackOptions } from "@lovable.dev/vite-tanstack-config";

// Gerado uma vez por execução do `vite build` — igual no bundle do cliente e no bundle do
// servidor (mesmo `define`). O cliente compara o próprio id com o que o servidor devolve em
// runtime para saber se um novo deploy aconteceu e precisa recarregar. Ver VersaoWatcher.
const APP_BUILD_ID = String(Date.now());

// O motor de gotejamento das campanhas precisa estar de pé desde o boot do
// processo, sem depender da primeira requisição: o chunk de SSR do TanStack
// Start é carregado de forma preguiçosa, então o worker que vivia em
// `src/server.ts` só nascia depois do primeiro request. O plugin Nitro roda
// na criação do app — antes de qualquer requisição —, que é o lugar certo
// para armar o worker.
//
// `plugins` não faz parte do tipo público do pacote compartilhado
// (@lovable.dev/vite-tanstack-config), mas o `nitro()` dele repassa as opções
// do usuário para o nitro (ver `nitroOpts = { ...userNitroOpts }`), e o nitro
// aceita `plugins` com caminhos relativos ao rootDir.
const nitro = {
  preset: "node-server",
  output: { dir: ".output", serverDir: ".output/server", publicDir: ".output/public" },
  plugins: ["./plugins/disparo-worker.ts"],
} as Exclude<LovableViteTanstackOptions["nitro"], boolean | undefined> & { plugins?: string[] };

export default defineConfig({
  vite: {
    define: {
      __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
    },
  },
  // Self-hosting (Easypanel/Docker): gera um servidor Node que escuta em HOST/PORT.
  // Sem isso o build sai no formato Cloudflare Worker e o container sobe sem abrir porta.
  nitro,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
