/**
 * Plugin Nitro: arma o motor de disparo de campanhas no boot do processo.
 *
 * O gotejamento (drip) das campanhas depende de um worker que roda a cada
 * 60 segundos. Esse worker morava em `src/server.ts`, que é o entry de SSR do
 * TanStack Start — e o Nitro carrega esse chunk de forma preguiçosa
 * (`lazyService(() => import("./_ssr/ssr.mjs"))`). Ou seja: o worker só
 * existia DEPOIS da primeira requisição. Num container que fica sem tráfego
 * (ou logo após o restart), a fila agendada não andava — a campanha enviava
 * a primeira mensagem (via "Disparar agora") e as seguintes ficavam paradas
 * no horário.
 *
 * O plugin Nitro roda na criação do app, antes de qualquer requisição, então
 * aqui o motor já está de pé quando o processo sobe.
 *
 * O guarda `globalThis.__disparoInterval` evita dois workers: o deste plugin
 * e o de `src/server.ts` (que continua rodando em dev/build). Nunca logamos
 * segredos aqui — só mensagens de erro do job.
 */

declare global {
  // eslint-disable-next-line no-var
  var __disparoInterval: ReturnType<typeof setInterval> | undefined;
}

export default function disparoWorkerPlugin(_nitroApp: unknown) {
  if (globalThis.__disparoInterval) return;

  const INTERVALO_MS = 60_000;

  globalThis.__disparoInterval = setInterval(async () => {
    try {
      const { processarDisparo } = await import("../src/db/disparo-motor.server");
      await processarDisparo();
    } catch (error: any) {
      console.error("[disparo] falha no job em segundo plano:", error?.message || error);
    }
  }, INTERVALO_MS);

  // Primeira passada: no boot o banco e o schema podem ainda estar subindo, e
  // um tick imediato só produziria ruído no log. O `src/server.ts` faz o
  // mesmo (30 s) — mas ele só existe depois do primeiro request.
  setTimeout(async () => {
    try {
      const { processarDisparo } = await import("../src/db/disparo-motor.server");
      await processarDisparo();
    } catch (error: any) {
      console.error("[disparo] falha na primeira passada:", error?.message || error);
    }
  }, 30_000);
}
