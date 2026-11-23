const CACHE_NAME = 'fruittrade-shell-v2';
const APP_BASE = new URL('./', self.registration.scope).pathname;
const appUrl = (path) => new URL(path, self.registration.scope).href;
const INDEX_URL = appUrl('index.html');
const APP_SHELL = [appUrl('./'), INDEX_URL, appUrl('manifest.webmanifest'), appUrl('fruittrade-icon.svg')];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // Pre-cache the Vite entry bundles so the app shell can reopen after a successful online visit.
    const page = await fetch(INDEX_URL);
    if (page.ok) {
      const html = await page.text();
      const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((asset) => asset.startsWith(APP_BASE) && !asset.startsWith('//'))
        .filter((asset) => asset.endsWith('.js') || asset.endsWith('.css'));
      await cache.addAll(assets);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('fruittrade-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never cache Supabase, authentication, database, storage, or other external responses.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(APP_BASE)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(INDEX_URL, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(INDEX_URL)) || (await caches.match(appUrl('./'))))
    );
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(caches.match(request).then((cached) => {
      const update = fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      });
      return cached || update;
    }));
  }
});
