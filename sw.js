/* Service Worker for Exit8 - SIA XR
   Optimized caching strategy that doesn't cause lag:
   - Precache core assets during install
   - Use async cache operations to not block gameplay
*/
const CACHE_NAME = 'exit8-static-v1';
const MODELS_CACHE = 'exit8-models-v1';
const SOUNDS_CACHE = 'exit8-sounds-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/style.css',
  '/main.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Silently fail if precache fails (don't block service worker)
        console.log('[SW] Precache skipped');
      });
    })
  );
  self.skipWaiting(); // Activate immediately
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== MODELS_CACHE && k !== SOUNDS_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip non-http/https requests (e.g. chrome-extension://)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // For models: network first, cache as fallback
  if (url.pathname.startsWith('/models/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // For sounds: cache first, network as fallback
  if (url.pathname.startsWith('/sounds/')) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).catch(err => {
        console.warn('Fetch failed for sound:', request.url);
        throw err;
      }))
    );
    return;
  }

  // For navigation requests: network first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For everything else: cache first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).catch(err => {
      console.warn('Fetch failed for asset:', request.url);
      throw err;
    }))
  );
});
