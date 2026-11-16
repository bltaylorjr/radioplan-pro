/* LvPlan Pro offline helper for the online version (GitHub Pages).
 * Built by vite.config.ts: __VERSION__, __CORE__ and __EXTRA__ are filled in at build time.
 * - CORE files (the app and every page) are saved before the new version takes over; the app then opens
 *   from them at once, and a newer version is used from the open after it has been saved.
 * - EXTRA files (FCC, airport and terrain data) are saved quietly later, when the app asks (after it has been idle),
 *   so the app works offline without slowing down pages.
 * - The intro video and map tiles are not saved here (the app keeps its own map cache). */
const VERSION = '__VERSION__';
const CACHE = 'lvplan-' + VERSION;
const CORE = __CORE__;
const EXTRA = __EXTRA__;
const scope = new URL(self.registration.scope);
const abs = (p) => new URL(p, scope).href;

/** A file with a fingerprint in its name never changes, so after an update it is copied from the
 *  previous version's saved files instead of being downloaded again. Only new or changed files are downloaded. */
const HASHED = /-[\w-]{8}\.\w+$/;
async function fill(c, list) {
  for (const p of list) {
    const url = abs(p);
    if (await c.match(url)) continue;
    const old = HASHED.test(p) ? await caches.match(url) : undefined;
    if (old) await c.put(url, old);
    else await c.add(new Request(url, { cache: HASHED.test(p) ? 'default' : 'reload' })); // the page itself always fresh
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => fill(c, CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // Keep this quick: until it finishes, the browser holds back every file the app asks for.
  e.waitUntil((async () => {
    // Keep the previous version's files too: a page that was already open keeps working until it reloads.
    const old = (await caches.keys()).filter((k) => k.startsWith('lvplan-') && k !== CACHE);
    for (const k of old.slice(0, -1)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The app asks for the large data files (FCC, airports, terrain) once it has been idle for a while,
// so saving them never competes with opening pages or loading maps.
let warming = null;
self.addEventListener('message', (e) => {
  if (e.data !== 'save-data-files') return;
  warming ??= (async () => {
    const c = await caches.open(CACHE);
    for (const p of EXTRA) { try { await fill(c, [p]); } catch { /* try again next start */ } }
  })().finally(() => { warming = null; });
  e.waitUntil(warming);
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin || !url.href.startsWith(scope.href)) return;
  if (/\.(mp4|webm)$/i.test(url.pathname)) return; // video streams straight from the server
  // Opening the app: show this version's saved page at once, with no wait on a weak signal. A newer version
  // is picked up by the browser's own update check of sw.js, saved in the background, and used from the next open.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = (await c.match(abs('./'))) || (await c.match(abs('index.html')));
      if (hit) return hit;
      try { return await fetch(req); } catch { return Response.error(); }
    })());
    return;
  }
  // Downloaded content packs: newest when online, saved copy when offline.
  if (/\/content\//.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(req, { signal: ctl.signal, cache: 'no-cache' }); clearTimeout(t);
        if (r.ok) c.put(req, r.clone());
        return r;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.endsWith('/sw.js')) return;
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
