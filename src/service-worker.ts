/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

const CACHE_VERSION = 'shant-matka-static-v1';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon.svg',
];

const STATIC_EXT_RE = /\.(?:css|js|mjs|png|jpe?g|webp|svg|ico|woff2?|ttf)$/i;

const EXCLUDED_PATH_RE =
  /\/(api|auth|login|logout|register|signup|account|profile|wallet|deposit|withdraw|payment|upi|transaction|bet|bid|game|history|dashboard|admin|otp|session|user|callback)\b|\.php$/i;

// Reference Workbox manifest injection point so vite-plugin-pwa injectManifest builds cleanly
const injectedManifest = self.__WB_MANIFEST;
if (Array.isArray(injectedManifest) && injectedManifest.length > 0) {
  for (const entry of injectedManifest) {
    const url = typeof entry === 'string' ? entry : entry.url;
    if (url && STATIC_EXT_RE.test(url) && !PRECACHE_URLS.includes(url)) {
      PRECACHE_URLS.push(url);
    }
  }
}

function isSafeStaticRequest(request: Request, url: URL): boolean {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (request.headers.has('Authorization')) return false;
  if (EXCLUDED_PATH_RE.test(url.pathname)) return false;
  if (url.search && !url.pathname.endsWith('.js') && !url.pathname.endsWith('.css')) {
    return false;
  }
  return (
    STATIC_EXT_RE.test(url.pathname) ||
    url.pathname === OFFLINE_URL ||
    url.pathname === '/manifest.webmanifest'
  );
}

function isSafeCacheableResponse(response: Response): boolean {
  if (!response || response.status !== 200 || response.type !== 'basic') {
    return false;
  }
  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
    return false;
  }
  if (response.headers.has('Set-Cookie')) {
    return false;
  }
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_URLS.map((assetUrl) =>
          cache.add(new Request(assetUrl, { cache: 'reload' })).catch(() => undefined)
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => (key !== CACHE_VERSION ? caches.delete(key) : Promise.resolve(true)))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  // Network-First for all HTML page navigations — never cache authenticated/private pages
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        const fallback = await cache.match(OFFLINE_URL);
        return (
          fallback ||
          new Response('Offline — please check your internet connection.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      })
    );
    return;
  }

  // Safe static asset caching ONLY
  if (!isSafeStaticRequest(request, url)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      const networkPromise = fetch(request)
        .then((networkResponse) => {
          if (isSafeCacheableResponse(networkResponse)) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => cached);

      return cached || (await networkPromise) || Response.error();
    })
  );
});
