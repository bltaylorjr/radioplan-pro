// Lines you draw on the map (freehand with a finger / mouse, or straight point-to-point) and what the app
// predicts along them: ground height, signal from the transmitter, whether the transmitter can see each spot,
// and, for a straight two-point line, the line-of-sight check between its ends.
import { haversineKm, interpolate, type LatLon } from './geo';
import { sampleDem, buildProfile, analyzeProfile, type DemGrid, type ProfileAnalysis } from './terrain';
import { predictPoint, type CoverageInputs } from './coverage';
import { visible, findObstructions, type Obstruction } from './los';
import { azimuthPair, type AzimuthPair } from './azimuth';

export interface DrawnLine {
  id: string; name: string;
  /** 'free' = drawn by hand, 'straight' = tapped points joined by straight lines */
  mode: 'free' | 'straight';
  pts: LatLon[];
  /** Antenna height above ground at the ends (m), used for the end-to-end line-of-sight check. */
  endAglM?: number;
  color?: string;
}

export const lineLengthKm = (pts: LatLon[]) => pts.slice(1).reduce((t, q, i) => t + haversineKm(pts[i], q), 0);

/** Douglas-Peucker simplification (tolerance in metres), keeps the ends. Freehand strokes become editable. */
export function simplifyLine(pts: LatLon[], tolM = 15): LatLon[] {
  if (pts.length < 3) return pts.slice();
  const lat0 = pts[0].lat, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const xy = pts.map((p) => [p.lon * kx, p.lat * ky]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; let worst = -1, wi = -1;
    const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]; let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); if (d > worst) { worst = d; wi = i; }
    }
    if (worst > tolM && wi > 0) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Points every `stepKm` along the line (plus every vertex), with the distance from the start. */
export function densify(pts: LatLon[], stepKm: number): (LatLon & { dKm: number })[] {
  const out: (LatLon & { dKm: number })[] = []; let d0 = 0;
  if (!pts.length) return out;
  out.push({ ...pts[0], dKm: 0 });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = haversineKm(a, b), n = Math.max(1, Math.ceil(L / stepKm));
    for (let s = 1; s <= n; s++) { const q = interpolate(a, b, s / n); out.push({ ...q, dKm: d0 + (L * s) / n }); }
    d0 += L;
  }
  return out;
}

export interface RouteSample extends LatLon { dKm: number; groundM: number | null; rssi: number | null; seen: boolean | null }
export interface RouteResult {
  lengthKm: number; samples: RouteSample[];
  /** per straight piece: distance and azimuth (true and magnetic) */
  legs: (AzimuthPair & { from: number; to: number })[];
  minRssi: number | null; avgRssi: number | null; pctAbove: number | null; thresholdDbm: number | null;
  hiddenKm: number | null;
  /** straight two-point line: line-of-sight between its ends */
  ends?: { an: ProfileAnalysis; obs: Obstruction[] } | null;
}

/** Analyse a drawn line: samples about every 30 m (at most 400), signal from the transmitter (if any) and terrain. */
export function analyzeLine(line: DrawnLine, dem: DemGrid | null, cov: CoverageInputs | null, o: { thresholdDbm?: number; k?: number; clutterM?: number; fMHz?: number } = {}): RouteResult {
  const lengthKm = lineLengthKm(line.pts);
  const step = Math.max(0.03, lengthKm / 400);
  const raw = densify(line.pts, step);
  const tx = cov ? { lat: cov.site.lat, lon: cov.site.lon } : null;
  const samples: RouteSample[] = raw.map((q) => {
    const groundM = dem ? sampleDem(dem, q) : null;
    const rssi = cov ? predictPoint({ ...cov, radiusKm: Math.max(cov.radiusKm, 1e6) }, q) : null;
    const seen = dem && tx && cov ? visible(dem, tx, q, { observerAglM: cov.antennaAglM, targetAglM: cov.mobileHeightM, k: o.k, clutterM: o.clutterM }) : null;
    return { ...q, groundM, rssi: rssi != null && Number.isFinite(rssi) ? rssi : null, seen };
  });
  const legs = line.pts.slice(1).map((b, i) => ({ ...azimuthPair(line.pts[i], b), from: i, to: i + 1 }));
  const rs = samples.map((s) => s.rssi).filter((v): v is number => v != null);
  const thr = o.thresholdDbm ?? null;
  let hidden: number | null = null;
  if (samples.some((s) => s.seen != null)) { hidden = 0; for (let i = 1; i < samples.length; i++) if (samples[i].seen === false) hidden += samples[i].dKm - samples[i - 1].dKm; }
  let ends: RouteResult['ends'] = null;
  if (line.mode === 'straight' && line.pts.length === 2 && dem) {
    const [a, b] = line.pts, h = line.endAglM ?? 10;
    const an = analyzeProfile(buildProfile(a, b, Math.max(60, Math.min(400, Math.round(lengthKm / 0.03))), (q) => sampleDem(dem, q)), h, h, o.fMHz ?? 450, o.k, o.clutterM);
    ends = { an, obs: findObstructions(an, 4) };
  }
  return {
    lengthKm, samples, legs,
    minRssi: rs.length ? Math.min(...rs) : null, avgRssi: rs.length ? rs.reduce((t, v) => t + v, 0) / rs.length : null,
    pctAbove: rs.length && thr != null ? (rs.filter((v) => v >= thr).length / rs.length) * 100 : null, thresholdDbm: thr,
    hiddenKm: hidden, ends,
  };
}

/** Moves vertex i (edit mode). */
export const moveVertex = (l: DrawnLine, i: number, q: LatLon): DrawnLine => ({ ...l, pts: l.pts.map((p, j) => (j === i ? { lat: q.lat, lon: q.lon } : p)) });
/** Inserts a vertex after index i (dragging the small handle in the middle of a piece). */
export const insertVertex = (l: DrawnLine, i: number, q: LatLon): DrawnLine => ({ ...l, pts: [...l.pts.slice(0, i + 1), { lat: q.lat, lon: q.lon }, ...l.pts.slice(i + 1)] });
/** Removes vertex i (a line keeps at least two points). */
export const removeVertex = (l: DrawnLine, i: number): DrawnLine => (l.pts.length <= 2 ? l : { ...l, pts: l.pts.filter((_, j) => j !== i) });
