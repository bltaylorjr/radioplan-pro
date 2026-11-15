// Azimuth (true bearing), back-azimuth and magnetic declination.
// Declination uses the World Magnetic Model WMM2025 (NOAA NCEI / BGS, public domain), valid 2025.0 to 2030.0,
// so compass (magnetic) bearings work offline. Typical WMM accuracy is about 0.5° in the continental US;
// local iron, power lines and steel buildings can throw a hand compass off much more.
import { bearingDeg, haversineKm, LatLon } from './geo';

let EPOCH = 2025.0;
const MAXORD = 12;
/** n, m, g, h, dg/dt, dh/dt (nT, nT/year). From WMM_2025.COF. */
let COEF: number[][] = [[1,0,-29351.8,0.0,12.0,0.0],[1,1,-1410.8,4545.4,9.7,-21.5],[2,0,-2556.6,0.0,-11.6,0.0],[2,1,2951.1,-3133.6,-5.2,-27.7],[2,2,1649.3,-815.1,-8.0,-12.1],[3,0,1361.0,0.0,-1.3,0.0],[3,1,-2404.1,-56.6,-4.2,4.0],[3,2,1243.8,237.5,0.4,-0.3],[3,3,453.6,-549.5,-15.6,-4.1],[4,0,895.0,0.0,-1.6,0.0],[4,1,799.5,278.6,-2.4,-1.1],[4,2,55.7,-133.9,-6.0,4.1],[4,3,-281.1,212.0,5.6,1.6],[4,4,12.1,-375.6,-7.0,-4.4],[5,0,-233.2,0.0,0.6,0.0],[5,1,368.9,45.4,1.4,-0.5],[5,2,187.2,220.2,0.0,2.2],[5,3,-138.7,-122.9,0.6,0.4],[5,4,-142.0,43.0,2.2,1.7],[5,5,20.9,106.1,0.9,1.9],[6,0,64.4,0.0,-0.2,0.0],[6,1,63.8,-18.4,-0.4,0.3],[6,2,76.9,16.8,0.9,-1.6],[6,3,-115.7,48.8,1.2,-0.4],[6,4,-40.9,-59.8,-0.9,0.9],[6,5,14.9,10.9,0.3,0.7],[6,6,-60.7,72.7,0.9,0.9],[7,0,79.5,0.0,-0.0,0.0],[7,1,-77.0,-48.9,-0.1,0.6],[7,2,-8.8,-14.4,-0.1,0.5],[7,3,59.3,-1.0,0.5,-0.8],[7,4,15.8,23.4,-0.1,0.0],[7,5,2.5,-7.4,-0.8,-1.0],[7,6,-11.1,-25.1,-0.8,0.6],[7,7,14.2,-2.3,0.8,-0.2],[8,0,23.2,0.0,-0.1,0.0],[8,1,10.8,7.1,0.2,-0.2],[8,2,-17.5,-12.6,0.0,0.5],[8,3,2.0,11.4,0.5,-0.4],[8,4,-21.7,-9.7,-0.1,0.4],[8,5,16.9,12.7,0.3,-0.5],[8,6,15.0,0.7,0.2,-0.6],[8,7,-16.8,-5.2,-0.0,0.3],[8,8,0.9,3.9,0.2,0.2],[9,0,4.6,0.0,-0.0,0.0],[9,1,7.8,-24.8,-0.1,-0.3],[9,2,3.0,12.2,0.1,0.3],[9,3,-0.2,8.3,0.3,-0.3],[9,4,-2.5,-3.3,-0.3,0.3],[9,5,-13.1,-5.2,0.0,0.2],[9,6,2.4,7.2,0.3,-0.1],[9,7,8.6,-0.6,-0.1,-0.2],[9,8,-8.7,0.8,0.1,0.4],[9,9,-12.9,10.0,-0.1,0.1],[10,0,-1.3,0.0,0.1,0.0],[10,1,-6.4,3.3,0.0,0.0],[10,2,0.2,0.0,0.1,-0.0],[10,3,2.0,2.4,0.1,-0.2],[10,4,-1.0,5.3,-0.0,0.1],[10,5,-0.6,-9.1,-0.3,-0.1],[10,6,-0.9,0.4,0.0,0.1],[10,7,1.5,-4.2,-0.1,0.0],[10,8,0.9,-3.8,-0.1,-0.1],[10,9,-2.7,0.9,-0.0,0.2],[10,10,-3.9,-9.1,-0.0,-0.0],[11,0,2.9,0.0,0.0,0.0],[11,1,-1.5,0.0,-0.0,-0.0],[11,2,-2.5,2.9,0.0,0.1],[11,3,2.4,-0.6,0.0,-0.0],[11,4,-0.6,0.2,0.0,0.1],[11,5,-0.1,0.5,-0.1,-0.0],[11,6,-0.6,-0.3,0.0,-0.0],[11,7,-0.1,-1.2,-0.0,0.1],[11,8,1.1,-1.7,-0.1,-0.0],[11,9,-1.0,-2.9,-0.1,0.0],[11,10,-0.2,-1.8,-0.1,0.0],[11,11,2.6,-2.3,-0.1,0.0],[12,0,-2.0,0.0,0.0,0.0],[12,1,-0.2,-1.3,0.0,-0.0],[12,2,0.3,0.7,-0.0,0.0],[12,3,1.2,1.0,-0.0,-0.1],[12,4,-1.3,-1.4,-0.0,0.1],[12,5,0.6,-0.0,-0.0,-0.0],[12,6,0.6,0.6,0.1,-0.0],[12,7,0.5,-0.1,-0.0,-0.0],[12,8,-0.1,0.8,0.0,0.0],[12,9,-0.4,0.1,0.0,-0.0],[12,10,-0.2,-1.0,-0.1,-0.0],[12,11,-1.3,0.1,-0.0,0.0],[12,12,-0.7,0.2,-0.1,-0.1]];

/** The magnetic model in use (for online content updates, e.g. WMM2030 when it is published). */
export const getMagModel = () => ({ name: MODEL_NAME, epoch: EPOCH, coef: COEF });
let MODEL_NAME = 'WMM2025';
export function setMagModel(m: { name: string; epoch: number; coef: number[][] }) {
  if (!m || typeof m.name !== 'string' || !Number.isFinite(m.epoch) || !Array.isArray(m.coef) || m.coef.length < 80 || !m.coef.every((r) => Array.isArray(r) && r.length === 6 && r.every(Number.isFinite))) throw new Error('magnetic model does not fit');
  MODEL_NAME = m.name; EPOCH = m.epoch; COEF = m.coef; model = null;
}
export const magModelName = () => MODEL_NAME;
const N = MAXORD + 1;
const mk = () => Array.from({ length: N }, () => new Array<number>(N).fill(0));
let model: { c: number[][]; cd: number[][]; k: number[][]; fn: number[]; fm: number[] } | null = null;
function init() {
  if (model) return model;
  const c = mk(), cd = mk(), k = mk(), fn = new Array<number>(N).fill(0), fm = new Array<number>(N).fill(0);
  const snorm = new Array<number>(N * N).fill(0);
  for (const [n, m, g, h, dg, dh] of COEF) {
    c[m][n] = g; cd[m][n] = dg;
    if (m !== 0) { c[n][m - 1] = h; cd[n][m - 1] = dh; }
  }
  // Convert Schmidt semi-normalised coefficients to Gauss-normalised.
  snorm[0] = 1;
  for (let n = 1; n <= MAXORD; n++) {
    snorm[n] = (snorm[n - 1] * (2 * n - 1)) / n;
    let j = 2;
    for (let m = 0; m <= n; m++) {
      k[m][n] = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
      if (m > 0) {
        const flnmj = ((n - m + 1) * j) / (n + m);
        snorm[n + m * N] = snorm[n + (m - 1) * N] * Math.sqrt(flnmj);
        j = 1;
        c[n][m - 1] *= snorm[n + m * N]; cd[n][m - 1] *= snorm[n + m * N];
      }
      c[m][n] *= snorm[n + m * N]; cd[m][n] *= snorm[n + m * N];
    }
    fn[n] = n + 1; fm[n] = n;
  }
  k[1][1] = 0;
  model = { c, cd, k, fn, fm };
  return model;
}

/** Decimal year of a date, e.g. 2026-07-02 → 2026.5. */
export function decimalYear(d: Date = new Date()): number {
  const y = d.getUTCFullYear(), a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - a) / (b - a);
}

export interface Geomag { decDeg: number; dipDeg: number; totalNt: number; horizNt: number; year: number; outOfRange: boolean }

/** Magnetic field from WMM2025 at a point. Declination is east-positive (west is negative). altKm is height above the WGS84 ellipsoid. */
export function geomag(lat: number, lon: number, when: Date | number = new Date(), altKm = 0): Geomag {
  const { c, cd, k, fn, fm } = init();
  const yr = typeof when === 'number' ? when : decimalYear(when);
  const outOfRange = yr < EPOCH || yr > EPOCH + 5;
  const dt = Math.min(Math.max(yr, EPOCH), EPOCH + 5) - EPOCH;
  const rad = Math.PI / 180;
  const a = 6378.137, b = 6356.7523142, re = 6371.2, a2 = a * a, b2 = b * b, c2 = a2 - b2, a4 = a2 * a2, b4 = b2 * b2, c4 = a4 - b4;
  const rlat = lat * rad, rlon = lon * rad;
  const srlat = Math.sin(rlat), crlat = Math.cos(rlat), srlat2 = srlat * srlat, crlat2 = crlat * crlat;
  const sp = new Array<number>(N).fill(0), cp = new Array<number>(N).fill(0), pp = new Array<number>(N).fill(0);
  sp[0] = 0; cp[0] = 1; pp[0] = 1;
  sp[1] = Math.sin(rlon); cp[1] = Math.cos(rlon);
  // Geodetic to spherical coordinates.
  const q = Math.sqrt(a2 - c2 * srlat2), q1 = altKm * q, q2 = ((q1 + a2) / (q1 + b2)) ** 2;
  const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2), st = Math.sqrt(1 - ct * ct);
  const r2 = altKm * altKm + 2 * q1 + (a4 - c4 * srlat2) / (q * q), r = Math.sqrt(r2);
  const d = Math.sqrt(a2 * crlat2 + b2 * srlat2), ca = (altKm + d) / r, sa = (c2 * crlat * srlat) / (r * d);
  for (let m = 2; m <= MAXORD; m++) { sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1]; cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1]; }
  const p = mk(), dp = mk(), tc = mk(); p[0][0] = 1;
  const aor = re / r; let ar = aor * aor, br = 0, bt = 0, bp = 0, bpp = 0;
  for (let n = 1; n <= MAXORD; n++) {
    ar *= aor;
    for (let m = 0; m <= n; m++) {
      if (n === m) { p[m][n] = st * p[m - 1][n - 1]; dp[m][n] = st * dp[m - 1][n - 1] + ct * p[m - 1][n - 1]; }
      else if (n === 1 && m === 0) { p[m][n] = ct * p[m][n - 1]; dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1]; }
      else if (n > 1 && n !== m) {
        if (m > n - 2) { p[m][n - 2] = 0; dp[m][n - 2] = 0; }
        p[m][n] = ct * p[m][n - 1] - k[m][n] * p[m][n - 2];
        dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1] - k[m][n] * dp[m][n - 2];
      }
      tc[m][n] = c[m][n] + dt * cd[m][n];
      if (m !== 0) tc[n][m - 1] = c[n][m - 1] + dt * cd[n][m - 1];
      const par = ar * p[m][n];
      let t1: number, t2: number;
      if (m === 0) { t1 = tc[m][n] * cp[m]; t2 = tc[m][n] * sp[m]; }
      else { t1 = tc[m][n] * cp[m] + tc[n][m - 1] * sp[m]; t2 = tc[m][n] * sp[m] - tc[n][m - 1] * cp[m]; }
      bt -= ar * t1 * dp[m][n];
      bp += fm[m] * t2 * par;
      br += fn[n] * t1 * par;
      if (st === 0 && m === 1) { // geographic poles
        pp[n] = n === 1 ? pp[n - 1] : ct * pp[n - 1] - k[m][n] * pp[n - 2];
        bpp += fm[m] * t2 * ar * pp[n];
      }
    }
  }
  bp = st === 0 ? bpp : bp / st;
  const bx = -bt * ca - br * sa, by = bp, bz = bt * sa - br * ca, bh = Math.sqrt(bx * bx + by * by);
  return { decDeg: Math.atan2(by, bx) / rad, dipDeg: Math.atan2(bz, bh) / rad, totalNt: Math.sqrt(bh * bh + bz * bz), horizNt: bh, year: yr, outOfRange };
}

/** Magnetic declination in degrees, east positive (the Southeast US is west, so negative). */
export const declinationDeg = (q: LatLon, when: Date | number = new Date()) => geomag(q.lat, q.lon, when).decDeg;

export const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** Compass (magnetic) bearing from a true bearing: magnetic = true − declination. */
export const trueToMag = (trueDeg: number, decDeg: number) => norm360(trueDeg - decDeg);
export const magToTrue = (magDeg: number, decDeg: number) => norm360(magDeg + decDeg);
/** Reciprocal of a bearing (± 180°). For a long path use azimuthPair().back, which follows the great circle. */
export const reciprocal = (d: number) => norm360(d + 180);

const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** 16-point compass name, e.g. 135 → "SE". */
export const compassPoint = (d: number) => POINTS16[Math.round(norm360(d) / 22.5) % 16];

/** "6.9° W" style text for a declination. */
export const fmtDecl = (dec: number) => `${Math.abs(dec).toFixed(1)}° ${dec < 0 ? 'W' : 'E'}`;
/** "045.2°" (three digits before the decimal, as read on a compass / alignment tool). */
export const fmtDeg = (d: number, digits = 1) => { const v = norm360(+norm360(d).toFixed(digits)); const s = v.toFixed(digits); return (v < 10 ? '00' : v < 100 ? '0' : '') + s; };

export interface AzimuthPair {
  /** Azimuth from A toward B, degrees true. */ fwd: number;
  /** Azimuth from B back toward A, degrees true (the great-circle back-azimuth, not always exactly fwd ± 180). */ back: number;
  /** Same two azimuths as a compass reads them (magnetic), using the declination at each end. */ fwdMag: number; backMag: number;
  decA: number; decB: number; km: number;
}
/** Azimuths both ways between two points, true and magnetic. */
export function azimuthPair(a: LatLon, b: LatLon, when: Date | number = new Date()): AzimuthPair {
  const fwd = bearingDeg(a, b), back = bearingDeg(b, a), decA = declinationDeg(a, when), decB = declinationDeg(b, when);
  return { fwd, back, fwdMag: trueToMag(fwd, decA), backMag: trueToMag(back, decB), decA, decB, km: haversineKm(a, b) };
}

/** One-line azimuth text: "045.2°T (052.1°M) NE". Pass the declination to include the magnetic bearing. */
export function fmtAz(trueDeg: number, decDeg?: number | null, digits = 1): string {
  const m = decDeg == null || !Number.isFinite(decDeg) ? '' : ` (${fmtDeg(trueToMag(trueDeg, decDeg), digits)}°M)`;
  return `${fmtDeg(trueDeg, digits)}°T${m} ${compassPoint(trueDeg)}`;
}

/** Elevation (up/down tilt) angle from A to B in degrees, with earth curvature (k-factor) included. Heights in metres above sea level. */
export function elevationAngleDeg(km: number, fromAmslM: number, toAmslM: number, k = 4 / 3): number {
  if (km <= 0) return toAmslM >= fromAmslM ? 90 : -90;
  const d = km * 1000, re = 6371000 * k;
  return (Math.atan((toAmslM - fromAmslM) / d - d / (2 * re)) * 180) / Math.PI;
}
