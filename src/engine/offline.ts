// Pre-download map tiles for an area so maps work with no connection (USB, PC and Android).
import { cachedFetchBlob, cacheGet } from './tilecache';
import { tileRange } from './webmercator';
import type { Bounds } from './autoterrain';

export function countTiles(b: Bounds, zMin: number, zMax: number) {
  let n = 0; for (let z = zMin; z <= zMax; z++) n += tileRange(b, z).count; return n;
}
export const tileUrl = (tpl: string, z: number, x: number, y: number) => tpl.replace('{s}', 'a').replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

export async function prefetchTiles(templates: string[], b: Bounds, zMin: number, zMax: number, onProgress: (done: number, total: number, failed: number) => void, signal?: AbortSignal) {
  const jobs: string[] = [];
  for (const t of templates) for (let z = zMin; z <= zMax; z++) { const r = tileRange(b, z); for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) jobs.push(tileUrl(t, z, x, y)); }
  let done = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < jobs.length && !signal?.aborted) {
      const u = jobs[i++];
      try { if (!(await cacheGet(u))) await cachedFetchBlob(u, false); } catch { failed++; }
      onProgress(++done, jobs.length, failed);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker)); // polite parallelism
  return { total: jobs.length, failed };
}
