// Map imagery draped over the 3D terrain: stitches satellite / topo tiles (from the offline cache when present)
// into one picture and gives each terrain point its place on that picture (Web Mercator -> texture u,v).
import { cachedFetchBlob } from './tilecache';
import { lonToTileX, latToTileY, tileRange } from './webmercator';
import type { Bounds } from './autoterrain';

export interface DrapeInfo { z: number; x0: number; y0: number; nx: number; ny: number }
export interface Drape extends DrapeInfo { canvas: HTMLCanvasElement; loaded: number; missing: number; fromCache: number; source: string }

/** Highest zoom (≤ maxZ) whose tile count stays within budget, so the picture stays sharp but not huge. */
export function drapeZoom(b: Bounds, maxTiles = 48, maxZ = 16): number {
  for (let z = maxZ; z >= 3; z--) if (tileRange(b, z).count <= maxTiles) return z;
  return 3;
}

/** Texture coordinates of a point (u right, v up, as three.js expects with flipY). */
export function drapeUv(d: DrapeInfo, lat: number, lon: number): [number, number] {
  const u = (lonToTileX(lon, d.z) - d.x0) / d.nx;
  const v = 1 - (latToTileY(lat, d.z) - d.y0) / d.ny;
  return [u, v];
}

export const tileUrl = (tpl: string, z: number, x: number, y: number) =>
  tpl.replace('{s}', 'abc'[(x + y) % 3]).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

/** Build the draped picture. Each tile tries the sources in order (e.g. high-res satellite, then USGS imagery);
 *  `under` paints first so any tile that cannot be found (offline, not saved yet) still shows something. */
export async function buildDrape(b: Bounds, sources: { name: string; url: string; max: number }[], opts: { maxTiles?: number; under?: (ctx: CanvasRenderingContext2D, d: DrapeInfo) => void; signal?: AbortSignal } = {}): Promise<Drape> {
  const maxZ = Math.min(...sources.map((s) => s.max), 16);
  const z = drapeZoom(b, opts.maxTiles ?? 48, maxZ);
  const r = tileRange(b, z);
  const info: DrapeInfo = { z, x0: r.x0, y0: r.y0, nx: r.x1 - r.x0 + 1, ny: r.y1 - r.y0 + 1 };
  const canvas = document.createElement('canvas'); canvas.width = info.nx * 256; canvas.height = info.ny * 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c9c4b5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  opts.under?.(ctx, info);
  let loaded = 0, missing = 0, fromCache = 0; const used = new Map<string, number>();
  const jobs: Promise<void>[] = [];
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) jobs.push((async () => {
    for (const s of sources) {
      if (opts.signal?.aborted) return;
      try {
        const { blob, fromCache: c } = await cachedFetchBlob(tileUrl(s.url, z, x, y), true);
        const bmp = await createImageBitmap(blob);
        ctx.drawImage(bmp, (x - r.x0) * 256, (y - r.y0) * 256, 256, 256);
        loaded++; if (c) fromCache++; used.set(s.name, (used.get(s.name) ?? 0) + 1); return;
      } catch { /* try the next source */ }
    }
    missing++;
  })());
  await Promise.all(jobs);
  const source = [...used.entries()].sort((a, c) => c[1] - a[1]).map(([n]) => n).join(' + ') || 'none';
  return { ...info, canvas, loaded, missing, fromCache, source };
}
