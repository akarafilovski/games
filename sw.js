// Offline support. Pages and the app manifest are fetched fresh when online (cached copy only when offline);
// game files (wasm, js, fonts, images) come from the cache and are refreshed in the background.
// Bump axar-games-v2 to clear everything old on the next visit.
const CACHE = 'axar-games-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const fresh = req.mode === 'navigate' || req.destination === 'document' || req.destination === 'manifest' || /manifest\.webmanifest$/.test(req.url);
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: fresh });
    const network = fetch(req, fresh ? { cache: 'no-cache' } : undefined).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    if (fresh) return network.catch(() => cached || Response.error());
    if (cached) {
      e.waitUntil(network.catch(() => {}));
      return cached;
    }
    return network;
  }));
});
