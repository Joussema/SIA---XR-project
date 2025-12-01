/* Service Worker for Exit8 - SIA XR
   Basic caching strategy:
   - Precache core assets during install
   - Serve cached assets for requests in the cache
   - For other requests, use network-first then fall back to cache
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
  '/images/fire.png',
  '/images/flame.png',
  '/images/tunnel.jpg'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Limit cache size: delete the oldest entries if there are too many.
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  // Delete oldest entries until the size is within the limit.
  for (let i = 0; i < keys.length - maxItems; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Route caching for models and sounds with strategy and limits
  if (url.pathname.startsWith('/models/')) {
    // Use network-first for models so the user usually gets the latest
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || request.method !== 'GET') return response;
          const copy = response.clone();
          caches.open(MODELS_CACHE).then(cache => {
            cache.put(request, copy);
            // keep at most 10 models cached
            trimCache(MODELS_CACHE, 10);
          });
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.pathname.startsWith('/sounds/')) {
    // Use cache-first for sounds (fast playback), then network
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          // cache successful GET responses in sounds cache
          if (res && res.status === 200 && request.method === 'GET') {
            const copy = res.clone();
            caches.open(SOUNDS_CACHE).then(cache => {
              cache.put(request, copy);
              // keep at most 30 small sound files cached
              trimCache(SOUNDS_CACHE, 30);
            });
          }
          return res;
        }).catch(() => {
          // If it's an audio request and fails, let it fail (no fallback audio)
          return null;
        });
      })
    );
    return;
  }
  // Always try network first for navigation (HTML documents)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Update cache
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For other requests, try cache first, then network with fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          // Only cache GET responses that are 200
          if (request.method === 'GET' && res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => {
          // Optionally: return a fallback image for images
          if (request.destination === 'image') {
            return caches.match('/images/fire.png');
          }
        });
    })
  );
});
