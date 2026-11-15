// Line of sight on terrain: obstruction points along a radio path, and a viewshed (what a site can see).
// Uses the same earth-bulge (k-factor) and clutter rules as the path profile, so the 3D view and the Path page agree.
import type { DemGrid, ProfileAnalysis } from './terrain';
import { sampleDem } from './terrain';
import { earthBulgeM } from './rf';
import { haversineKm, interpolate, type LatLon } from './geo';

export interface Obstruction {
  lat: number; lon: number; dKm: number;
  /** ground + clutter + earth bulge at the worst point (m above sea level) */
  topM: number;
  /** straight-line beam height there (m above sea level) */
  beamM: number;
  /** 'blocks' = terrain rises above the straight line; 'fresnel' = inside 60 % of the first Fresnel zone */
  kind: 'blocks' | 'fresnel';
  /** how far the terrain rises above the beam (blocks) or how close it comes to it (fresnel), metres */
  byM: number;
  clearancePct: number;
}

/** Group consecutive bad points of a profile analysis and return the worst point of each group, worst first. */
export function findObstructions(a: ProfileAnalysis, maxCount = 8): Obstruction[] {
  const out: Obstruction[] = [];
  let cur: Obstruction | null = null;
  a.points.forEach((p, i) => {
    const interior = i > 0 && i < a.points.length - 1;
    const kind = !interior ? null : p.clearanceM <= 0 ? 'blocks' : p.clearancePct < 60 ? 'fresnel' : null;
    if (!kind) { if (cur) out.push(cur); cur = null; return; }
    const o: Obstruction = { lat: p.lat, lon: p.lon, dKm: p.dKm, topM: p.effGroundM, beamM: p.losM, kind, byM: Math.abs(p.clearanceM), clearancePct: p.clearancePct };
    if (!cur) { cur = o; return; }
    const anyBlocks = cur.kind === 'blocks' || kind === 'blocks';
    if (o.beamM - o.topM < cur.beamM - cur.topM) cur = o; // keep the worst point of the group (least clearance in metres)
    if (anyBlocks) cur.kind = 'blocks';
  });
  if (cur) out.push(cur);
  // worst first: anything that blocks the line (highest above the beam first), then Fresnel crowding (least clear first)
  return out.sort((x, y) => (x.kind === y.kind ? (x.kind === 'blocks' ? y.byM - x.byM : x.clearancePct - y.clearancePct) : x.kind === 'blocks' ? -1 : 1)).slice(0, maxCount);
}

export interface ViewshedOpts { observerAglM: number; targetAglM: number; k?: number; clutterM?: number; steps?: number }

/** Is `to` (target AGL above ground) visible from `from` (observer AGL) over the DEM? */
export function visible(dem: DemGrid, from: LatLon, to: LatLon, o: ViewshedOpts, g0?: number): boolean {
  const ga = g0 ?? sampleDem(dem, from); const gb = sampleDem(dem, to);
  if (ga == null || gb == null) return false;
  const D = haversineKm(from, to); if (D < 1e-4) return true;
  const hA = ga + o.observerAglM, hB = gb + o.targetAglM;
  const n = o.steps ?? Math.max(8, Math.min(96, Math.ceil(D / 0.08)));
  for (let i = 1; i < n; i++) {
    const t = i / n, p = interpolate(from, to, t);
    const z = sampleDem(dem, p); if (z == null) continue;
    const d1 = D * t, eff = z + earthBulgeM(d1, D - d1, o.k ?? 4 / 3) + (o.clutterM ?? 0);
    if (eff >= hA + (hB - hA) * t) return false;
  }
  return true;
}

/** Viewshed on an (n+1)×(n+1) vertex grid over the DEM (row 0 = north). 1 = visible from `from`, 0 = hidden. */
export function viewshedGrid(dem: DemGrid, from: LatLon, n: number, o: ViewshedOpts, b: { north: number; south: number; east: number; west: number }): Uint8Array {
  const out = new Uint8Array((n + 1) * (n + 1));
  const g0 = sampleDem(dem, from); if (g0 == null) return out;
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) {
    const p = { lat: b.north - ((b.north - b.south) * r) / n, lon: b.west + ((b.east - b.west) * c) / n };
    out[r * (n + 1) + c] = visible(dem, from, p, o, g0) ? 1 : 0;
  }
  return out;
}
