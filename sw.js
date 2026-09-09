// Minimal service worker. Finnes av to grunner: den gjor appen
// installerbar, og den gir noe a vise hvis nettet er borte.
//
// Den mellomlagrer bevisst ikke API-kall. Feeden har sin egen
// ferskhetslogikk, og en cache oppa den ville gitt to sannheter om hva som
// er nyeste sak.

const CACHE = "sb-skall-v1";
const SKALL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SKALL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((navn) => Promise.all(navn.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  if (url.pathname.indexOf("/wp-api/") === 0) return;   // aldri mellomlagre feeden

  // Nett forst, cache som reserve. Motsatt rekkefolge ville servert en
  // gammel index.html i det uendelige etter neste utrulling.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const kopi = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopi)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});
