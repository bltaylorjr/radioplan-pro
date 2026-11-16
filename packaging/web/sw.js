/* LvPlan Pro offline helper for the online version (GitHub Pages).
 * Built by vite.config.ts: __VERSION__, __CORE__ and __EXTRA__ are filled in at build time.
 * - CORE files (the app and every page) are saved before the new version takes over.
 * - EXTRA files (FCC, airport and terrain data) are saved quietly afterwards, so the app works offline.
 * - The intro video and map tiles are not saved here (the app keeps its own map cache). */
const VERSION = '__VERSION__';
const CACHE = 'lvplan-' + VERSION;
const CORE = __CORE__;
const EXTRA = __EXTRA__;
const scope = new URL(self.registration.scope);
const abs = (p) => new URL(p, scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map(abs))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Keep the previous version's files too: a page that was already open keeps working until it reloads.
    const old = (await caches.keys()).filter((k) => k.startsWith('lvplan-') && k !== CACHE);
    for (const k of old.slice(0, -1)) await caches.delete(k);
    await self.clients.claim();
    // Save the large data files in the background, one at a time so the phone stays responsive.
    const c = await caches.open(CACHE);
    for (const p of EXTRA) { try { if (!(await c.match(abs(p)))) await c.add(abs(p)); } catch { /* try again next start */ } }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin || !url.href.startsWith(scope.href)) return;
  if (/\.(mp4|webm)$/i.test(url.pathname)) return; // video streams straight from the server
  // The page itself and downloaded content packs: newest when online, saved copy when offline.
  if (req.mode === 'navigate' || /\/content\//.test(url.pathname) || url.pathname.endsWith('/sw.js')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(req, { signal: ctl.signal, cache: 'no-cache' }); clearTimeout(t);
        if (r.ok) c.put(req.mode === 'navigate' ? abs('./') : req, r.clone());
        return r;
      } catch {
        return (await c.match(req.mode === 'navigate' ? abs('./') : req)) || (await c.match(abs('index.html'))) || Response.error();
      }
    })());
    return;
  }
  // Program files have a fingerprint in their name, so a saved copy is always right.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = (await c.match(req, { ignoreSearch: true })) || (await caches.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok && r.type === 'basic') c.put(req, r.clone());
    return r;
  })());
});
