// Offline map packs: satellite pictures, topo maps and terrain for a whole job area, downloaded ahead of time
// so maps, 3D, coverage and every calculation work where there is no signal. Tiles live in the tile cache
// (IndexedDB); the list of packs lives in the app's storage under "mappacks".
import { kvGet, kvSet } from './projectdb';
import { tileRange } from './webmercator';
import { cacheGet, cacheDelete, cachedFetchBlob } from './tilecache';
import { TERRARIUM_URL, type Bounds } from './autoterrain';
import { tileUrl } from './offline';

/** Layers a pack can hold. Only public-domain sources (USGS, AWS open terrain) may be bulk-downloaded. */
export const PACK_LAYERS: Record<string, { label: string; url: string; maxZ: number; kbPerTile: number; note: string }> = {
  satellite: { label: 'Satellite pictures (USGS)', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', maxZ: 16, kbPerTile: 24, note: 'Aerial photos; also used on the 3D tilt view.' },
  hybrid: { label: 'Satellite + roads and names (USGS)', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', maxZ: 16, kbPerTile: 30, note: 'Aerial photos with roads, names and contours.' },
  topo: { label: 'Topo map (USGS)', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', maxZ: 16, kbPerTile: 20, note: 'The standard map with roads, contours and names.' },
  relief: { label: 'Shaded relief (USGS)', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}', maxZ: 16, kbPerTile: 12, note: 'Hill shading.' },
};
/** Terrain (ground height) tiles: used for path profiles, line of sight, coverage and 3D. */
export const TERRAIN_MAX_Z = 13;
const TERRAIN_KB = 90;
export const PACK_TILE_LIMIT = 40000;

export interface MapPack {
  id: string; name: string; bounds: Bounds; zMin: number; zMax: number; layers: string[]; terrain: boolean;
  createdAt: string; tiles: number; failed: number; bytes: number; complete: boolean;
  /** How the area was chosen, shown in the list. */
  areaNote?: string;
}

export const terrainZooms = (zMax: number) => { const out: number[] = []; for (let z = 8; z <= Math.min(TERRAIN_MAX_Z, zMax); z++) out.push(z); return out; };

/** Every tile URL a pack needs (map layers zMin..zMax, terrain 8..13). */
export function packUrls(p: Pick<MapPack, 'bounds' | 'zMin' | 'zMax' | 'layers' | 'terrain'>): string[] {
  const out: string[] = [];
  for (const k of p.layers) {
    const L = PACK_LAYERS[k]; if (!L) continue;
    for (let z = p.zMin; z <= Math.min(p.zMax, L.maxZ); z++) { const r = tileRange(p.bounds, z); for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) out.push(tileUrl(L.url, z, x, y)); }
  }
  if (p.terrain) for (const z of terrainZooms(p.zMax)) { const r = tileRange(p.bounds, z); for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) out.push(TERRARIUM_URL(z, x, y)); }
  return out;
}

/** Tile count and approximate size before downloading. */
export function estimatePack(p: Pick<MapPack, 'bounds' | 'zMin' | 'zMax' | 'layers' | 'terrain'>): { tiles: number; mb: number; perLayer: { key: string; label: string; tiles: number; mb: number }[] } {
  const perLayer: { key: string; label: string; tiles: number; mb: number }[] = [];
  for (const k of p.layers) {
    const L = PACK_LAYERS[k]; if (!L) continue;
    let n = 0; for (let z = p.zMin; z <= Math.min(p.zMax, L.maxZ); z++) n += tileRange(p.bounds, z).count;
    perLayer.push({ key: k, label: L.label, tiles: n, mb: (n * L.kbPerTile) / 1024 });
  }
  if (p.terrain) { let n = 0; for (const z of terrainZooms(p.zMax)) n += tileRange(p.bounds, z).count; perLayer.push({ key: 'terrain', label: 'Terrain (ground height)', tiles: n, mb: (n * TERRAIN_KB) / 1024 }); }
  return { tiles: perLayer.reduce((a, b) => a + b.tiles, 0), mb: perLayer.reduce((a, b) => a + b.mb, 0), perLayer };
}

/** Width × height of the box in km. */
export function boundsSizeKm(b: Bounds) {
  const mid = ((b.north + b.south) / 2) * Math.PI / 180;
  return { wKm: (b.east - b.west) * 111.32 * Math.cos(mid), hKm: (b.north - b.south) * 110.574 };
}

/** A square box centred on a point. */
export function boundsAroundPoint(lat: number, lon: number, radiusKm: number): Bounds {
  const dLat = radiusKm / 110.574, dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { north: lat + dLat, south: lat - dLat, east: lon + dLon, west: lon - dLon };
}

/** The highest zoom whose pack stays under the tile limit (for the "best detail that fits" button). */
export function bestZoomFor(p: Omit<Pick<MapPack, 'bounds' | 'zMin' | 'zMax' | 'layers' | 'terrain'>, 'zMax'>, limit = PACK_TILE_LIMIT): number {
  for (let z = 16; z > p.zMin; z--) if (estimatePack({ ...p, zMax: z }).tiles <= limit) return z;
  return p.zMin;
}

export const listPacks = async (): Promise<MapPack[]> => (await kvGet<MapPack[]>('mappacks')) ?? [];
const savePacks = (p: MapPack[]) => kvSet('mappacks', p);
export async function upsertPack(p: MapPack) { const all = await listPacks(); const i = all.findIndex((x) => x.id === p.id); if (i >= 0) all[i] = p; else all.unshift(p); await savePacks(all); }

export interface PackProgress { done: number; total: number; failed: number; bytes: number; skipped: number; startedAt: number }

/** Download every tile of a pack that is not cached yet (already-cached tiles count as done). Safe to run again to finish or refresh. */
export async function downloadPack(p: MapPack, onProgress: (pr: PackProgress) => void, signal?: AbortSignal, opts: { refresh?: boolean; workers?: number } = {}): Promise<MapPack> {
  const urls = packUrls(p);
  const pr: PackProgress = { done: 0, total: urls.length, failed: 0, bytes: 0, skipped: 0, startedAt: Date.now() };
  let i = 0, last = 0;
  const tick = () => { const now = Date.now(); if (now - last > 150 || pr.done === pr.total) { last = now; onProgress({ ...pr }); } };
  const worker = async () => {
    while (i < urls.length && !signal?.aborted) {
      const u = urls[i++];
      try {
        const hit = opts.refresh ? undefined : await cacheGet(u);
        if (hit) { pr.bytes += hit.size; pr.skipped++; }
        else { const r = await cachedFetchBlob(u, false); pr.bytes += r.blob.size; }
      } catch { pr.failed++; }
      pr.done++; tick();
    }
  };
  await Promise.all(Array.from({ length: opts.workers ?? 6 }, worker));
  onProgress({ ...pr });
  const out: MapPack = { ...p, tiles: pr.done - pr.failed, failed: pr.failed + (urls.length - pr.done), bytes: pr.bytes, complete: pr.done === urls.length && pr.failed === 0 };
  await upsertPack(out);
  return out;
}

/** How much of a pack is in the cache now (for the list). */
export async function checkPack(p: MapPack): Promise<{ have: number; total: number; bytes: number }> {
  const urls = packUrls(p); let have = 0, bytes = 0;
  for (const u of urls) { const b = await cacheGet(u); if (b) { have++; bytes += b.size; } }
  return { have, total: urls.length, bytes };
}

/** Delete a pack. Tiles that another saved pack also uses are kept. */
export async function deletePack(id: string): Promise<number> {
  const all = await listPacks(); const p = all.find((x) => x.id === id); if (!p) return 0;
  const rest = all.filter((x) => x.id !== id);
  const keep = new Set<string>(); for (const o of rest) for (const u of packUrls(o)) keep.add(u);
  let n = 0; for (const u of packUrls(p)) if (!keep.has(u)) { await cacheDelete(u); n++; }
  await savePacks(rest);
  return n;
}

/** Packs covering a point (to tell the user an area is ready offline). */
export const packsAt = (packs: MapPack[], lat: number, lon: number) => packs.filter((p) => lat <= p.bounds.north && lat >= p.bounds.south && lon <= p.bounds.east && lon >= p.bounds.west);

/** Time left, from progress so far. */
export function etaText(pr: PackProgress, now = Date.now()): string {
  if (!pr.done) return '';
  const s = ((now - pr.startedAt) / pr.done) * (pr.total - pr.done) / 1000;
  return s < 60 ? `about ${Math.max(1, Math.round(s))} s left` : s < 3600 ? `about ${Math.round(s / 60)} min left` : `about ${(s / 3600).toFixed(1)} h left`;
}
