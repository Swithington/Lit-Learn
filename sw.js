// Service worker for the GI/Hep/IM Recall PWA.
//
// Scope: caches the APP SHELL ONLY — the HTML, manifest, icons, and the
// Google Fonts stylesheet/font files — so the app opens with zero
// connectivity. It deliberately does NOT cache API calls (api.anthropic.com,
// the Consensus/PubMed MCP endpoints, CrossRef lookups, etc.). Those need a
// live network round-trip by definition — a cached AI response would be
// stale or simply wrong, not a reasonable offline fallback. Card building,
// Evidence Check, and Coverage runs are expected to fail (cleanly, per the
// app's existing online/offline UI gating) when there's no connection;
// reviewing, browsing, favouriting, and rating already-built cards do not
// touch the network at all and work fully offline once the shell is cached.

const CACHE_NAME = 'gi-recall-shell-v1';

const SHELL_URLS = [
  // Both kept even though they likely serve identical content: a browser tab
  // opened directly (typed URL, bookmark) requests './', while the installed
  // PWA's start_url in manifest.json is explicitly './index.html' — caching
  // both means either request path is served from cache offline.
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

// Bump CACHE_NAME (v1 -> v2 etc.) on any deploy that changes index.html or
// the icons, so returning users pick up the new shell rather than being
// stuck on a stale cached copy indefinitely. See the update flow below.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Deliberately NOT cache.addAll(SHELL_URLS) — addAll is all-or-nothing:
      // if a single URL 404s, redirects unexpectedly, or the host returns a
      // non-2xx for any reason, the WHOLE install step rejects and NOTHING
      // gets cached, silently — the app just doesn't work offline with no
      // visible error. Caching each URL independently means one bad entry
      // can't take down the rest of the shell.
      const results = await Promise.allSettled(
        SHELL_URLS.map((url) => cache.add(url))
      );
      results.forEach((r, i) => {
        if(r.status === 'rejected'){
          console.error('Service worker: failed to cache shell URL', SHELL_URLS[i], r.reason);
        }
      });
    })
  );
  // Take over immediately rather than waiting for all tabs to close, so a
  // fresh deploy is picked up on next reload instead of next full app restart.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

function isApiOrMcpRequest(url){
  // Anything that should NEVER be served from cache or cached as a response —
  // these are live calls whose whole point is fresh data.
  return (
    url.hostname === 'api.anthropic.com' ||
    url.hostname.endsWith('mcp.consensus.app') ||
    url.hostname.endsWith('mcp.claude.com') ||
    url.hostname === 'api.crossref.org'
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API/MCP calls — let them go straight to the network so a
  // failure surfaces immediately as a normal fetch error, which the app's
  // existing retry/offline-detection logic already knows how to handle.
  if(isApiOrMcpRequest(url)) return;

  // Only handle GET — POST (the API calls above, already excluded) and other
  // methods pass through untouched regardless.
  if(event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if(cached) return cached;

      // Not an exact cache hit. For a navigation (opening/reloading the app,
      // including from the home-screen icon) while offline, fall back to the
      // cached index.html rather than failing outright — this is a
      // single-page app, so any navigation is really "load the shell" even
      // if the exact requested URL wasn't one of the ones pre-cached. This
      // is a safety net for URL-matching edge cases (query strings, trailing
      // slashes, GitHub Pages serving quirks) that can't be fully verified
      // without testing against the real hosting environment.
      const navigationFallback = event.request.mode === 'navigate'
        ? caches.match('./index.html')
        : Promise.resolve(null);

      // Cache-first for the app shell: instant load, works offline. Falls
      // back to network for anything not yet cached (e.g. first-ever visit,
      // or a font file variant not seen before), and opportunistically
      // caches same-origin-or-fonts responses as they come in so the SECOND
      // offline visit is more complete than the first.
      const networkFetch = fetch(event.request).then((response) => {
        const isCacheable = response && response.ok &&
          (url.origin === self.location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com'));
        if(isCacheable){
          const clone = response.clone();
          // waitUntil keeps the worker alive for this write — without it,
          // the browser can terminate the service worker right after the
          // response above is handed back to the page (Android does this
          // aggressively to save battery), silently dropping the cache
          // write before it completes. The opportunistic-caching guarantee
          // in the comment above depends on this actually finishing.
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
        }
        return response;
      }).catch(() => navigationFallback); // offline and not cached: try the shell fallback, else give up

      return networkFetch;
    })
  );
});
