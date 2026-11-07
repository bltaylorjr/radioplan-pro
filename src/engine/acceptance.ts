// Acceptance criteria: turn a predicted signal grid into pass/fail decisions and service contours.
import type { Project, AcceptanceTier, RunRecord } from '../types';
import type { CoverageResult } from './coverage';

export interface ResolvedTier { id: string; label: string; dbm: number; extraLossDb: number; requiredPct: number; color: string }
export function resolveTiers(p: Project): ResolvedTier[] {
  return p.acceptance.tiers.map((t: AcceptanceTier) => ({ ...t, dbm: t.dbm ?? p.radio.coverageThresholdDbm, extraLossDb: t.extraLossDb ?? p.radio.bodyLossDb + p.radio.penetrationLossDb }));
}
/** Signal needed in the street-level map for a tier: tier threshold + its extra (body/building) loss. */
export const mapLevel = (t: ResolvedTier) => t.dbm + t.extraLossDb;

export interface TierResult { tier: ResolvedTier; pct: number; pass: boolean; marginPct: number }
export function evaluateAcceptance(res: CoverageResult, tiers: ResolvedTier[]) {
  let cells = 0, sum = 0; const ok = tiers.map(() => 0);
  for (const v of res.rssi) {
    if (Number.isNaN(v)) continue; cells++; sum += v;
    tiers.forEach((t, k) => { if (v >= mapLevel(t)) ok[k]++; });
  }
  const results: TierResult[] = tiers.map((t, k) => { const pct = cells ? (ok[k] / cells) * 100 : 0; return { tier: t, pct, pass: pct >= t.requiredPct, marginPct: pct - t.requiredPct }; });
  return { cells, meanDbm: cells ? sum / cells : NaN, results, allPass: results.every((r) => r.pass) };
}

export function toRunResults(ev: ReturnType<typeof evaluateAcceptance>): RunRecord['results'] {
  return ev.results.map((r) => ({ label: r.tier.label, dbm: mapLevel(r.tier), pct: Math.round(r.pct * 10) / 10, requiredPct: r.tier.requiredPct, pass: r.pass }));
}

export type Seg = [[number, number], [number, number]]; // [[lat,lon],[lat,lon]]
/** Marching-squares contour of grid ≥ level, returned as line segments in lat/lon (cell-centre lattice). */
export function contourSegments(g: { n: number; north: number; south: number; east: number; west: number }, val: Float32Array, level: number): Seg[] {
  const n = g.n, out: Seg[] = [];
  const lat = (r: number) => g.north - ((r + 0.5) / n) * (g.north - g.south);
  const lon = (c: number) => g.west + ((c + 0.5) / n) * (g.east - g.west);
  const V = (r: number, c: number) => { const v = val[r * n + c]; return Number.isNaN(v) ? -999 : v; };
  const lerp = (a: number, b: number) => (a === b ? 0.5 : (level - a) / (b - a));
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const tl = V(r, c), tr = V(r, c + 1), br = V(r + 1, c + 1), bl = V(r + 1, c);
    const idx = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const top: [number, number] = [lat(r), lon(c + lerp(tl, tr))];
    const right: [number, number] = [lat(r + lerp(tr, br)), lon(c + 1)];
    const bottom: [number, number] = [lat(r + 1), lon(c + lerp(bl, br))];
    const left: [number, number] = [lat(r + lerp(tl, bl)), lon(c)];
    const add = (a: [number, number], b: [number, number]) => out.push([a, b]);
    switch (idx) {
      case 1: case 14: add(left, bottom); break;
      case 2: case 13: add(bottom, right); break;
      case 3: case 12: add(left, right); break;
      case 4: case 11: add(top, right); break;
      case 6: case 9: add(top, bottom); break;
      case 7: case 8: add(left, top); break;
      case 5: add(left, top); add(bottom, right); break;
      case 10: add(top, right); add(left, bottom); break;
    }
  }
  return out;
}

/** Join segments that share endpoints into polylines (keeps exports compact). */
export function joinSegments(segs: Seg[]): [number, number][][] {
  const key = (p: [number, number]) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
  const ends = new Map<string, number[]>();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); (ends.get(k) ?? ends.set(k, []).get(k)!).push(i); } });
  const used = new Uint8Array(segs.length), lines: [number, number][][] = [];
  const next = (p: [number, number]) => { for (const j of ends.get(key(p)) ?? []) if (!used[j]) return j; return -1; };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1;
    const line: [number, number][] = [segs[i][0], segs[i][1]];
    for (let grow = 0; grow < 2; grow++) {
      for (;;) {
        const tail = line[line.length - 1], j = next(tail); if (j < 0) break; used[j] = 1;
        const s = segs[j]; line.push(key(s[0]) === key(tail) ? s[1] : s[0]);
      }
      line.reverse();
    }
    lines.push(line);
  }
  return lines;
}

/** Cells ≥ level merged into rectangles (row runs merged vertically) → polygons for GIS export. */
export function areaRectangles(g: { n: number; north: number; south: number; east: number; west: number }, val: Float32Array, level: number) {
  const n = g.n, dy = (g.north - g.south) / n, dx = (g.east - g.west) / n;
  type R = { c0: number; c1: number; r0: number; r1: number };
  const done: R[] = []; let open = new Map<string, R>();
  for (let r = 0; r < n; r++) {
    const runs: [number, number][] = [];
    for (let c = 0; c < n; c++) { if (val[r * n + c] >= level) { const s = c; while (c + 1 < n && val[r * n + c + 1] >= level) c++; runs.push([s, c]); } }
    const nextOpen = new Map<string, R>();
    for (const [a, b] of runs) { const k = `${a}-${b}`; const o = open.get(k); if (o) { o.r1 = r; nextOpen.set(k, o); open.delete(k); } else nextOpen.set(k, { c0: a, c1: b, r0: r, r1: r }); }
    done.push(...open.values()); open = nextOpen;
  }
  done.push(...open.values());
  return done.map((q) => { const N = g.north - q.r0 * dy, S = g.north - (q.r1 + 1) * dy, W = g.west + q.c0 * dx, E = g.west + (q.c1 + 1) * dx; return [[W, S], [E, S], [E, N], [W, N], [W, S]] as [number, number][]; });
}
