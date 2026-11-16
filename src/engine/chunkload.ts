// Loading the app's program files for a page, made to survive updates and poor connections.
// When a new version is published while the app is open, the open copy still asks for the old file names,
// which no longer exist on the website ("Importing a module script failed" on iPhone). The fix is to reload
// once to pick up the new version. A short network drop is handled by simply trying again.
import { logRepair } from './carelog';

export const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading (CSS )?chunk|Load failed/i;
const KEY = 'radioplan.chunkReloadAt';
const WAIT_MS = 60000;

export function isChunkError(e: unknown): boolean {
  return CHUNK_ERROR.test(String((e as Error)?.message ?? e));
}

/** Reload the app once to get the newest program files. False if it already did so in the last minute (stops loops). */
export function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < WAIT_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; }
  logRepair('Reloaded to pick up updated program files');
  location.reload();
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Load a program file; on a load error try again twice (short network drops), then reload once for an update. */
export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  let err: unknown;
  for (const wait of [0, 700, 2000]) {
    if (wait) await sleep(wait);
    try { return await load(); } catch (e) { err = e; if (!isChunkError(e)) throw e; }
  }
  if (navigator.onLine !== false && reloadForUpdate()) return new Promise<T>(() => undefined); // the page is reloading
  throw err;
}

// ---- Pages are downloaded quietly in the background after start ----
// The app opens with only the first page; the rest follow one by one while the app is idle, so by the
// time a page is picked it is already on the device and opens at once (no "Loading…" on a phone).
const LOADERS: (() => Promise<unknown>)[] = [];

/** Register a page's loader for the background download, and return it for React.lazy. */
export function track<T>(load: () => Promise<T>): () => Promise<T> {
  LOADERS.push(load); // background: a plain try, never a reload (that could interrupt the user)
  return () => loadChunk(load); // opening the page: retries and the update reload
}

const idle = () => new Promise<void>((r) => {
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(() => r(), { timeout: 1500 }); else setTimeout(r, 50);
});

let started = false;
/** Start the background page downloads (once). Skipped when the phone is set to save data. */
export function preloadPages(delayMs = 1500) {
  if (started || typeof window === 'undefined') return;
  started = true;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  setTimeout(async () => {
    for (const f of LOADERS) {
      await idle();
      if (navigator.onLine === false) break;
      await f().catch(() => undefined);
    }
  }, delayMs);
}
