// Terrain-aware coverage prediction: Hata/COST-231 median loss + worst-obstacle knife-edge diffraction
// along each pixel's radial, plus 3GPP sector antenna pattern with downtilt.
import { LatLon, haversineKm, bearingDeg, interpolate } from './geo';
import { empiricalPathLoss, sectorPatternDb, earthBulgeM, diffractionV, knifeEdgeLossDb, Environment, CitySize } from './rf';
import { DemGrid, sampleDem } from './terrain';

export interface Tuning { offsetDb: number; slopeDbPerDecade: number; diffractionFactor: number; clutterDb: number }
export const NO_TUNING: Tuning = { offsetDb: 0, slopeDbPerDecade: 0, diffractionFactor: 1, clutterDb: 0 };
export interface Bounds4 { north: number; south: number; east: number; west: number }
export interface CoverageInputs {
  site: LatLon; siteGroundM?: number; antennaAglM: number; fMHz: number; eirpDbm: number;
  rxGainDbi: number; rxLossDb: number; mobileHeightM: number; env: Environment; city: CitySize;
  azimuthDeg: number; tiltDeg: number; hBwDeg: number; vBwDeg: number; radiusKm: number; gridN: number;
  dem?: DemGrid | null; k?: number;
  /** Model tuning (calibration). */
  tune?: Tuning;
  /** Compute on this common grid instead of a square around the site (multi-site analysis). */
  bounds?: Bounds4;
}
export interface CoverageResult {
  n: number; north: number; south: number; east: number; west: number;
  rssi: Float32Array; // dBm per cell, row 0 = north
}

export function boundsFor(site: LatLon, radiusKm: number): Bounds4 {
  const dLat = radiusKm / 111.32, dLon = radiusKm / (111.32 * Math.cos((site.lat * Math.PI) / 180));
  return { north: site.lat + dLat, south: site.lat - dLat, west: site.lon - dLon, east: site.lon + dLon };
}

/** Predicted received signal (dBm) at one point. Returns NaN beyond the analysis radius. */
export function predictPoint(i: CoverageInputs, p: LatLon): number {
  const k = i.k ?? 4 / 3, t = i.tune ?? NO_TUNING;
  const elev = (q: LatLon) => (i.dem ? sampleDem(i.dem, q) : null);
  const g0 = i.siteGroundM ?? elev(i.site) ?? 0;
  const txAbs = g0 + i.antennaAglM;
  const d = Math.max(haversineKm(i.site, p), 0.05);
  if (d > i.radiusKm) return NaN;
  const gp = elev(p);
  // Effective base height above the mobile's ground (Hata assumes height above average terrain)
  const hb = Math.max(1, txAbs - (gp ?? g0));
  const pl = empiricalPathLoss({ fMHz: i.fMHz, hbM: hb, hmM: i.mobileHeightM, dKm: Math.max(d, 1), env: i.env, city: i.city }).lossDb
    + (d < 1 ? 20 * Math.log10(d) : 0); // continue the inverse-square trend inside 1 km
  let diff = 0;
  if (i.dem && gp != null) {
    const steps = Math.min(40, Math.max(6, Math.round(d / 0.15)));
    const rxAbs = gp + i.mobileHeightM;
    let worst = -Infinity;
    for (let s = 1; s < steps; s++) {
      const f = s / steps, q = interpolate(i.site, p, f), z = elev(q);
      if (z == null) continue;
      const d1 = d * f, d2 = d - d1;
      const h = z + earthBulgeM(d1, d2, k) - (txAbs + (rxAbs - txAbs) * f);
      const v = diffractionV(h, d1, d2, i.fMHz);
      if (v > worst) worst = v;
    }
    diff = knifeEdgeLossDb(worst);
  }
  const brg = bearingDeg(i.site, p);
  const elevAngle = (Math.atan2((gp ?? g0) + i.mobileHeightM - txAbs, d * 1000) * 180) / Math.PI;
  const pat = sectorPatternDb(brg - i.azimuthDeg, elevAngle + i.tiltDeg, i.hBwDeg, i.vBwDeg);
  return i.eirpDbm + pat - pl - t.diffractionFactor * diff - t.clutterDb + t.offsetDb + t.slopeDbPerDecade * Math.log10(d) + i.rxGainDbi - i.rxLossDb;
}

export function cellCenter(res: { n: number; north: number; south: number; east: number; west: number }, r: number, c: number): LatLon {
  return { lat: res.north - ((r + 0.5) / res.n) * (res.north - res.south), lon: res.west + ((c + 0.5) / res.n) * (res.east - res.west) };
}

export function computeCoverage(i: CoverageInputs): CoverageResult {
  const b = i.bounds ?? boundsFor(i.site, i.radiusKm);
  const n = i.gridN, rssi = new Float32Array(n * n);
  const res = { n, ...b, rssi };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) rssi[r * n + c] = predictPoint(i, cellCenter(res, r, c));
  return res;
}

export const RSSI_SCALE = [
  { min: -75, color: [0, 160, 60], label: '≥ -75 dBm (excellent / in-building)' },
  { min: -85, color: [120, 200, 40], label: '-85 to -75 (good / in-vehicle)' },
  { min: -95, color: [250, 210, 30], label: '-95 to -85 (fair, ERCES threshold -95)' },
  { min: -105, color: [245, 130, 30], label: '-105 to -95 (marginal / on-street)' },
  { min: -999, color: [220, 40, 40], label: '< -105 (poor)' },
] as const;

export function rssiColor(v: number, floor: number): [number, number, number, number] {
  if (Number.isNaN(v) || v < floor) return [0, 0, 0, 0];
  for (const s of RSSI_SCALE) if (v >= s.min) return [s.color[0], s.color[1], s.color[2], 150];
  return [0, 0, 0, 0];
}

export function coverageStats(res: CoverageResult, thresholdDbm: number) {
  let tot = 0, ok = 0;
  for (const v of res.rssi) { if (Number.isNaN(v)) continue; tot++; if (v >= thresholdDbm) ok++; }
  return { pct: tot ? (ok / tot) * 100 : 0, cells: tot };
}
