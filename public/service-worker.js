const CACHE_NAME = 'pulse-shell-v2';

// App shell — everything needed to render the UI offline
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
];

// ── Install: cache the app shell ──────────────────────────

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
    );
    // Activate immediately without waiting for old tabs to close
    self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    // Take control of all open tabs immediately
    self.clients.claim();
});

// ── Fetch: strategy per request type ─────────────────────

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Blob URLs (audio from IndexedDB object URLs) — never intercept.
    //    These are created by URL.createObjectURL() and live in the browser
    //    process; the SW cannot cache or serve them, so let them through.
    if (url.protocol === 'blob:') return;

    // 2. Cross-origin requests (fonts, CDN assets) — network only.
    //    We don't cache third-party assets to avoid CORS issues.
    if (url.origin !== self.location.origin) return;

    // 3. App shell (HTML, manifest) — cache-first, fall back to network.
    //    This is what makes the app load offline.
    if (
        request.destination === 'document' ||
        url.pathname === '/manifest.json' ||
        url.pathname === '/'
    ) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // 4. JS / CSS / built assets (Vite puts them in /assets/) — cache-first.
    //    Vite hashes filenames so stale cache is never an issue.
    if (
        url.pathname.startsWith('/assets/') ||
        url.pathname.startsWith('/icons/')
    ) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // 5. Everything else — network-first, fall back to cache.
    event.respondWith(networkFirst(request));
});

// ── Strategies ────────────────────────────────────────────

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}