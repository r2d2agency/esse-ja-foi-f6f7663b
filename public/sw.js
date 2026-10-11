/* Esse Já Foi — Service Worker do PWA */
// Suba esta versão a cada deploy que mude os assets. O `activate` apaga tudo
// que tiver outro nome, então é assim que o cache velho sai de circulação.
const CACHE = "ejf-app-v5";
const SHELL = [
  "/manifest.webmanifest",
  "/favicon.png",
  "/logo-esse-ja-foi.png",
  "/logo-esse-ja-foi-branco.png",
  "/icon-192.png",
  "/icon-512.png",
];

// Só entra no cache de navegação o que for HTML do próprio site.
function ehNavegacaoValida(req, url) {
  return (
    req.method === "GET" &&
    req.mode === "navigate" &&
    url.origin === self.location.origin
  );
}

self.addEventListener("install", (event) => {
  // addAll é atômico: se um item falhar, nenhum é cacheado e a instalação
  // inteira quebra. Por isso o fallback silencia o erro em vez de deixá-lo
  // derrubar o SW.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar APIs, uploads e dados dinâmicos — precisam ir direto
  // à rede, senão o app passa a mostrar dado velho sem avisar.
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_server")
  ) {
    return;
  }

  // Navegação: network-first. A rede manda; o cache só entra quando ela falha,
  // que é o cenário offline. É essa ordem que evita a tela branca de um
  // deploy novo — nada é servido do cache enquanto o servidor responder.
  if (ehNavegacaoValida(event.request, url)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copia));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(event.request)) ||
            // URL sem query para casar com o que foi cacheado: /comprador?x=1
            // e /comprador precisam cair no mesmo documento.
            (await cache.match(url.pathname)) ||
            (await cache.match("/"))
          );
        })
    );
    return;
  }

  // Estáticos: cache-first, com retentativa de rede quando o cache falha.
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request)
          .then((res) => {
            if (res.ok && url.origin === self.location.origin) {
              const copia = res.clone();
              caches.open(CACHE).then((cache) => cache.put(event.request, copia));
            }
            return res;
          })
          // Antes isto chamava o mesmo fetch que tinha acabado de falhar, sem
          // fallback nenhum: a promise rejeitava e virava "Uncaught (in
          // promise) Failed to fetch" no console. Na dúvida, responde 503 de
          // verdade — o navegador mostra o erro, não uma rejeição solta.
          .catch(async () => {
            const cache = await caches.open(CACHE);
            const alternativa =
              (await cache.match(url.pathname)) || (await cache.match("/"));
            if (alternativa) return alternativa;
            return new Response("Servico indisponivel no momento.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          })
    )
  );
});