/* Esse Já Foi — Service Worker do app do vistoriador */
const CACHE = "ejf-vistoriador-v2";
const SHELL = [
  "/vistoriador",
  "/manifest.webmanifest",
  "/favicon.png",
  "/logo-esse-ja-foi.png",
  "/logo-esse-ja-foi-branco.png",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar APIs, uploads e dados dinâmicos
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_server")
  ) {
    return;
  }

  // Navegação: network-first com fallback para o cache (modo offline)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copia));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match("/vistoriador"))
        )
    );
    return;
  }

  // Estáticos: cache-first
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copia = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copia));
          }
          return res;
        })
    )
  );
});
