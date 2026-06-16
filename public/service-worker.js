// ── Pulse service worker — offline-first PWA shell ──────────
// Bump CACHE_VERSION on every deploy: it invalidates the old caches and
// forces the shell to be re-precached.
const CACHE_VERSION = 'v4';
const SHELL_CACHE   = `pulse-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `pulse-runtime-${CACHE_VERSION}`;

// Everything needed to boot the UI with zero network. Vite emits stable
// (unhashed) filenames, so these paths are deterministic.
//
// NOTE: we deliberately do NOT precache '/index.html'. On Cloudflare Pages
// '/index.html' answers with a 308 redirect to '/', so caching it stores a
// "redirected" response — and iOS Safari refuses to satisfy a navigation with
// a redirected response ("Response served by service worker has redirections").
// '/' serves the same HTML with a clean 200, so that's our shell entry.
const SHELL_ASSETS = [
    '/',
    '/manifest.json',
    '/icons/icon.png',
    '/assets/index.js',
    '/assets/index.css',
];

// Cross-origin hosts whose responses we cache so fonts + icons work offline.
const CACHEABLE_HOSTS = [
    'fonts.googleapis.com', // @font-face CSS (Syne, DM Mono)
    'fonts.gstatic.com',    // the actual font files
    'cdn.jsdelivr.net',     // Tabler icons webfont (CSS + woff2)
];

// ── Install: precache the shell ─────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            // Fetch fresh + store a redirect-free copy. Done per-item so a
            // single failure can't abort the whole precache.
            .then((cache) => Promise.all(
                SHELL_ASSETS.map(async (url) => {
                    try {
                        const res = await fetch(new Request(url, { cache: 'reload' }));
                        if (res && (res.ok || res.type === 'opaque')) {
                            await cache.put(url, await stripRedirect(res));
                        }
                    } catch { /* offline at install time */ }
                })
            ))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: drop caches from older versions ───────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch strategies ────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Only GET is cacheable; let the browser handle the rest.
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Audio object URLs (blob:) live in the page process — never intercept.
    if (url.protocol === 'blob:') return;

    // Page navigations → network-first: an online user always gets the latest
    // shell; offline falls back to the cached shell. Always redirect-free so
    // iOS Safari accepts the response.
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigate(request));
        return;
    }

    // Same-origin assets (JS, CSS, icon) → cache-first: instant + offline-safe.
    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(request, SHELL_CACHE));
        return;
    }

    // Cross-origin fonts / icon webfont → cache-first so they survive offline.
    if (CACHEABLE_HOSTS.includes(url.hostname)) {
        event.respondWith(cacheFirst(request, RUNTIME_CACHE));
        return;
    }

    // Anything else → network, falling back to cache if we happen to have it.
    event.respondWith(
        fetch(request).catch(() => caches.match(request).then((c) => c || Response.error()))
    );
});

// Navigation handler: try the network, cache a clean copy under '/', and fall
// back to the cached shell offline. Every returned response is redirect-free.
async function handleNavigate(request) {
    try {
        const res = await stripRedirect(await fetch(request));
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => {});
        return res;
    } catch {
        const cached = (await caches.match('/')) || (await caches.match('/index.html'));
        return cached ? stripRedirect(cached) : Response.error();
    }
}

// Cache-first: serve from cache, otherwise fetch and store. Caches both normal
// (same-origin / CORS) and opaque (no-cors stylesheet/font) responses so the
// CDN-hosted fonts and icon glyphs are available with no network.
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        // Offline and nothing cached for this request.
        return Response.error();
    }
}

// iOS Safari rejects a redirected response for a navigation. Rebuild the
// response so `redirected` is false. Drops content-encoding/length since the
// body is already decoded once read.
async function stripRedirect(response) {
    if (!response || !response.redirected) return response;

    const body = await response.clone().blob();
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');

    return new Response(body, {
        status: response.status === 0 ? 200 : response.status,
        statusText: response.statusText,
        headers,
    });
}
