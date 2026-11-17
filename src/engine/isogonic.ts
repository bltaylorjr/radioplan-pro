// Isogonic lines (lines of equal compass declination) from the magnetic model built into the app.
import { geomag } from './azimuth';

export type Seg = [[number, number], [number, number]];
const LAT0 = 18, LAT1 = 56, LON0 = -132, LON1 = -60, STEP = 1;

/** Isogonic line segments for each whole-degree level (marching squares over a 1° grid). */
export function isogonicLines(when: Date, every = 2): Map<number, Seg[]> {
  const ny = Math.round((LAT1 - LAT0) / STEP) + 1, nx = Math.round((LON1 - LON0) / STEP) + 1;
  const g: number[][] = [];
  for (let j = 0; j < ny; j++) { g.push([]); for (let i = 0; i < nx; i++) g[j].push(geomag(LAT0 + j * STEP, LON0 + i * STEP, when).decDeg); }
  let lo = Infinity, hi = -Infinity; g.forEach((r) => r.forEach((v) => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
  const out = new Map<number, Seg[]>();
  for (let lv = Math.ceil(lo / every) * every; lv <= hi; lv += every) {
    const segs: Seg[] = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const c = [[j, i], [j, i + 1], [j + 1, i + 1], [j + 1, i]] as const;
      const v = c.map(([a, b]) => g[a][b]);
      const pts: [number, number][] = [];
      for (let k = 0; k < 4; k++) {
        const a = v[k], b = v[(k + 1) % 4];
        if ((a < lv) !== (b < lv)) {
          const t = (lv - a) / (b - a), [ja, ia] = c[k], [jb, ib] = c[(k + 1) % 4];
          pts.push([LAT0 + (ja + t * (jb - ja)) * STEP, LON0 + (ia + t * (ib - ia)) * STEP]);
        }
      }
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
      else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
    }
    out.set(lv, segs);
  }
  return out;
}
