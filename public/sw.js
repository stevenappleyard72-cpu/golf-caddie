const CACHE_NAME = 'golfcaddie-shell-v1';
const FIXED_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/api/course',
  '/icons/golfcaddie.svg',
  '/icons/golfcaddie-192.png',
  '/icons/golfcaddie-512.png',
];

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch('/');
  if (!indexResponse.ok) throw new Error('Could not cache app shell');
  const html = await indexResponse.clone().text();
  await cache.put('/', indexResponse);

  const discoveredAssets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => `${url.pathname}${url.search}`);
  await cache.addAll([...new Set([...FIXED_ASSETS.slice(1), ...discoveredAssets])]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function respond(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_NAME);

  if (request.mode === 'navigate' || url.pathname === '/api/course') {
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request.mode === 'navigate' ? '/' : request, response.clone());
      return response;
    } catch {
      return (await cache.match(request.mode === 'navigate' ? '/' : request)) || Response.error();
    }
  }

  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && url.origin === self.location.origin) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET') event.respondWith(respond(event.request));
});
