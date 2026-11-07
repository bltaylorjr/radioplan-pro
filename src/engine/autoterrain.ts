// Automatic terrain download: AWS Open Data "Terrain Tiles" (Terrarium PNG). In the United States these tiles are
// built from USGS 3DEP (1/3 arc-second, ~10 m; 1 m LiDAR-derived in some areas), elsewhere from SRTM/GMTED/ETOPO.
// Tiles are cached in IndexedDB so terrain stays available offline. Also: USGS 3DEP point elevation (EPQS).
import type { DemGrid } from './terrain';
import { cachedFetchBlob } from './tilecache';
import { lonToTileX, latToTileY, tileRange, metersPerPixel, terrariumElevation } from './webmercator';
import type { LatLon } from './geo';

export const TERRARIUM_URL = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
export interface Bounds { north: number; south: number; east: number; west: number }

export function boundsAround(points: LatLon[], marginKm: number): Bounds {
  const lat = points.map((p) => p.lat), lon = points.map((p) => p.lon);
  const mLat = marginKm / 111.32, midLat = (Math.max(...lat) + Math.min(...lat)) / 2;
  const mLon = marginKm / (111.32 * Math.cos((midLat * Math.PI) / 180));
  return { north: Math.max(...lat) + mLat, south: Math.min(...lat) - mLat, east: Math.max(...lon) + mLon, west: Math.min(...lon) - mLon };
}

/** Highest zoom (≤ maxZ) whose tile count stays within budget. */
export function chooseZoom(b: Bounds, maxTiles = 48, maxZ = 14): number {
  for (let z = maxZ; z >= 6; z--) if (tileRange(b, z).count <= maxTiles) return z;
  return 6;
}

async function decodeTile(blob: Blob): Promise<Float32Array> {
  const bmp = await createImageBitmap(blob);
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const ctx = (cv as HTMLCanvasElement).getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0, 256, 256);
  const px = ctx.getImageData(0, 0, 256, 256).data, out = new Float32Array(256 * 256);
  for (let i = 0; i < out.length; i++) out[i] = terrariumElevation(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  return out;
}

export interface AutoTerrainResult { dem: DemGrid; zoom: number; tiles: number; fromCache: number; resolutionM: number; missingTiles: number }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Run `fn`, retrying failures with exponential backoff (baseMs, 3×, 9×, …). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 600, sleep: (ms: number) => Promise<unknown> = wait): Promise<T> {
  let last: unknown;
  for (let a = 0; a < attempts; a++) {
    try { return await fn(); } catch (e) { last = e; if (a < attempts - 1) await sleep(baseMs * Math.pow(3, a)); }
  }
  throw last;
}
/** Delay before whole-download retry n (0-based): 15 s, 30 s, 1 min, 2 min, 4 min, then every 5 min. */
export const retryDelayMs = (n: number) => Math.min(15000 * Math.pow(2, n), 300000);

/** Download (or load from cache) terrain covering `b` and resample it to a WGS84 DemGrid. */
export async function downloadTerrain(b: Bounds, opts: { maxTiles?: number; maxCells?: number; onProgress?: (done: number, total: number) => void; retries?: number; sleep?: (ms: number) => Promise<unknown> } = {}): Promise<AutoTerrainResult> {
  const z = chooseZoom(b, opts.maxTiles ?? 48);
  const r = tileRange(b, z);
  const tiles = new Map<string, Float32Array>();
  let done = 0, fromCache = 0;
  const jobs: Promise<void>[] = [];
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) {
    jobs.push((async () => {
      const { blob, fromCache: c } = await withRetry(() => cachedFetchBlob(TERRARIUM_URL(z, x, y)), opts.retries ?? 3, 600, opts.sleep);
      if (c) fromCache++;
      tiles.set(`${x}/${y}`, await decodeTile(blob));
      opts.onProgress?.(++done, r.count);
    })());
  }
  const res = await Promise.allSettled(jobs);
  const failed = res.filter((x) => x.status === 'rejected').length;
  if (failed === r.count) throw new Error((res[0] as PromiseRejectedResult).reason?.message ?? 'terrain download failed');
  const midLat = (b.north + b.south) / 2;
  const resM = metersPerPixel(midLat, z);
  const maxCells = opts.maxCells ?? 1200;
  const cellDegY = Math.max(resM / 110540, (b.north - b.south) / maxCells);
  const cellDeg = Math.max(resM / (111320 * Math.cos((midLat * Math.PI) / 180)), (b.east - b.west) / maxCells);
  const ncols = Math.ceil((b.east - b.west) / cellDeg), nrows = Math.ceil((b.north - b.south) / cellDegY);
  const data = new Float32Array(ncols * nrows);
  const at = (gx: number, gy: number) => { // global pixel -> elevation
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), t = tiles.get(`${tx}/${ty}`);
    if (!t) return NaN;
    return t[Math.min(255, Math.floor(gy - ty * 256)) * 256 + Math.min(255, Math.floor(gx - tx * 256))];
  };
  for (let rr = 0; rr < nrows; rr++) {
    const lat = b.north - (rr + 0.5) * cellDegY, gy = latToTileY(lat, z) * 256 - 0.5;
    for (let c = 0; c < ncols; c++) {
      const gx = lonToTileX(b.west + (c + 0.5) * cellDeg, z) * 256 - 0.5;
      const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const v00 = at(x0, y0), v10 = at(x0 + 1, y0), v01 = at(x0, y0 + 1), v11 = at(x0 + 1, y0 + 1);
      const v = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
      data[rr * ncols + c] = Number.isNaN(v) ? [v00, v10, v01, v11].find((q) => !Number.isNaN(q)) ?? NaN : v;
    }
  }
  return {
    dem: { name: `Auto terrain z${z}`, ncols, nrows, west: b.west, north: b.north, cellDeg, cellDegY, data, nodata: NaN, source: `USGS 3DEP / SRTM via AWS Terrain Tiles (z${z}, ~${resM.toFixed(0)} m)` },
    zoom: z, tiles: r.count - failed, fromCache, resolutionM: resM, missingTiles: failed,
  };
}

/** USGS 3DEP Elevation Point Query Service (US only, 1/3 arc-second or best available). */
export async function usgsPointElevation(p: LatLon): Promise<number> {
  const r = await fetch(`https://epqs.nationalmap.gov/v1/json?x=${p.lon}&y=${p.lat}&wkid=4326&units=Meters&includeDate=false`);
  if (!r.ok) throw new Error(`USGS EPQS HTTP ${r.status}`);
  const v = parseFloat((await r.json()).value);
  if (!Number.isFinite(v) || v < -1000) throw new Error('No USGS 3DEP data at this point');
  return v;
}

export function demCovers(dem: DemGrid | null, b: Bounds): boolean {
  if (!dem) return false;
  const cy = dem.cellDegY ?? dem.cellDeg;
  return dem.west <= b.west && dem.north >= b.north && dem.west + dem.ncols * dem.cellDeg >= b.east && dem.north - dem.nrows * cy <= b.south;
}
