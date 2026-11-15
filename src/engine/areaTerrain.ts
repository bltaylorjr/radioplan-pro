// Terrain for an area: the project's own terrain when it covers the area, otherwise saved / downloaded
// tiles (cached for offline), otherwise the built-in Asheville-area grid.
import type { DemGrid } from './terrain';
import { downloadTerrain, demCovers, type Bounds } from './autoterrain';
import { bundledDem, cropDem } from './bundledTerrain';

export async function loadAreaDem(area: Bounds, projectDem?: DemGrid | null): Promise<{ dem: DemGrid | null; note: string }> {
  if (projectDem && demCovers(projectDem, area)) return { dem: cropDem(projectDem, area) ?? projectDem, note: '' };
  try {
    const r = await downloadTerrain(area, { maxTiles: 36, retries: typeof navigator !== 'undefined' && navigator.onLine === false ? 1 : 2 });
    if (!r.missingTiles) return { dem: r.dem, note: '' };
  } catch { /* fall back to the built-in terrain */ }
  const b = await bundledDem(); const c = b && cropDem(b, area);
  if (c) return { dem: c, note: typeof navigator !== 'undefined' && navigator.onLine === false ? 'Offline: using the built-in Asheville-area terrain.' : '' };
  return { dem: null, note: 'No terrain saved for this area yet. Connect to the internet once with this area showing and it is saved for offline use.' };
}

export function boundsOf(pts: { lat: number; lon: number }[], padKm = 0.5): Bounds | null {
  if (!pts.length) return null;
  const lat = pts.map((p) => p.lat), lon = pts.map((p) => p.lon), mid = (Math.max(...lat) + Math.min(...lat)) / 2;
  const dy = padKm / 111.32, dx = padKm / (111.32 * Math.cos((mid * Math.PI) / 180));
  return { north: Math.max(...lat) + dy, south: Math.min(...lat) - dy, east: Math.max(...lon) + dx, west: Math.min(...lon) - dx };
}
