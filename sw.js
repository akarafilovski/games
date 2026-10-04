// Offline support. Pages, scripts, styles and the app manifest are checked with the network first (a cached copy is used
// only when offline); big static files (wasm, images, fonts) come from the cache and are refreshed in the background.
// Bump the cache name to clear everything old on the next visit.
const CACHE = 'axar-games-v3';

self.addEventListener('install', () => self.skipWaiting());
// The sites on this domain share one cache storage, so each one only cleans up its own old caches.
const PREFIX = CACHE.replace(/v\d+$/, '');
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const path = new URL(req.url).pathname;
  const fresh = req.mode === 'navigate' || ['document', 'manifest', 'script', 'style'].includes(req.destination) || /\.(webmanifest|js|css|json)$/.test(path);
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
