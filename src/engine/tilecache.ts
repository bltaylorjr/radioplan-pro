// Persistent tile cache (IndexedDB) so map and terrain tiles keep working offline once downloaded.
// Works in browsers, the Tauri desktop app, Android WebView and from file:// (USB build).
const DB = 'radioplan-tiles', STORE = 'tiles';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('IndexedDB unavailable')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => { const r = fn(d.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
}
export const cacheGet = (url: string) => tx<Blob | undefined>('readonly', (s) => s.get(url)).catch(() => undefined);
export const cachePut = (url: string, b: Blob) => tx('readwrite', (s) => s.put(b, url)).catch(() => undefined);
export const cacheClear = () => tx('readwrite', (s) => s.clear());
export async function cacheStats(): Promise<{ count: number; bytes: number }> {
  const d = await db();
  return new Promise((res) => {
    let count = 0, bytes = 0;
    const c = d.transaction(STORE).objectStore(STORE).openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { count++; bytes += (cur.value as Blob).size ?? 0; cur.continue(); } else res({ count, bytes }); };
    c.onerror = () => res({ count, bytes });
  });
}

/** Fetch a URL, serving from the cache when present (or when offline), storing successful responses. */
export async function cachedFetchBlob(url: string, preferCache = true): Promise<{ blob: Blob; fromCache: boolean }> {
  if (preferCache) { const hit = await cacheGet(url); if (hit) return { blob: hit, fromCache: true }; }
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    cachePut(url, blob);
    return { blob, fromCache: false };
  } catch (e) {
    const hit = await cacheGet(url);
    if (hit) return { blob: hit, fromCache: true };
    throw e;
  }
}
