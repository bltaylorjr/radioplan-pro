// Azimuth (true bearing), back-azimuth and magnetic declination.
// Declination uses NOAA's World Magnetic Model High Resolution WMMHR2025 (degree 133, NOAA NCEI, public domain),
// valid 2025.0 to 2030.0, built into the app so compass (magnetic) bearings work offline. The standard WMM2025
// (degree 12) is used for the first moment after start while WMMHR loads. WMMHR adds the crustal field that
// WMM leaves out (about ±0.3° in the continental US), so it matches local declination better;
// local iron, power lines and steel buildings can throw a hand compass off much more.
import { bearingDeg, haversineKm, LatLon } from './geo';
import { loadChunk } from './chunkload';

let EPOCH = 2025.0;
/** n, m, g, h, dg/dt, dh/dt (nT, nT/year). From WMM_2025.COF (degree 12): used at start, until the high-resolution model has loaded. */
let COEF: number[][] = [[1,0,-29351.8,0.0,12.0,0.0],[1,1,-1410.8,4545.4,9.7,-21.5],[2,0,-2556.6,0.0,-11.6,0.0],[2,1,2951.1,-3133.6,-5.2,-27.7],[2,2,1649.3,-815.1,-8.0,-12.1],[3,0,1361.0,0.0,-1.3,0.0],[3,1,-2404.1,-56.6,-4.2,4.0],[3,2,1243.8,237.5,0.4,-0.3],[3,3,453.6,-549.5,-15.6,-4.1],[4,0,895.0,0.0,-1.6,0.0],[4,1,799.5,278.6,-2.4,-1.1],[4,2,55.7,-133.9,-6.0,4.1],[4,3,-281.1,212.0,5.6,1.6],[4,4,12.1,-375.6,-7.0,-4.4],[5,0,-233.2,0.0,0.6,0.0],[5,1,368.9,45.4,1.4,-0.5],[5,2,187.2,220.2,0.0,2.2],[5,3,-138.7,-122.9,0.6,0.4],[5,4,-142.0,43.0,2.2,1.7],[5,5,20.9,106.1,0.9,1.9],[6,0,64.4,0.0,-0.2,0.0],[6,1,63.8,-18.4,-0.4,0.3],[6,2,76.9,16.8,0.9,-1.6],[6,3,-115.7,48.8,1.2,-0.4],[6,4,-40.9,-59.8,-0.9,0.9],[6,5,14.9,10.9,0.3,0.7],[6,6,-60.7,72.7,0.9,0.9],[7,0,79.5,0.0,-0.0,0.0],[7,1,-77.0,-48.9,-0.1,0.6],[7,2,-8.8,-14.4,-0.1,0.5],[7,3,59.3,-1.0,0.5,-0.8],[7,4,15.8,23.4,-0.1,0.0],[7,5,2.5,-7.4,-0.8,-1.0],[7,6,-11.1,-25.1,-0.8,0.6],[7,7,14.2,-2.3,0.8,-0.2],[8,0,23.2,0.0,-0.1,0.0],[8,1,10.8,7.1,0.2,-0.2],[8,2,-17.5,-12.6,0.0,0.5],[8,3,2.0,11.4,0.5,-0.4],[8,4,-21.7,-9.7,-0.1,0.4],[8,5,16.9,12.7,0.3,-0.5],[8,6,15.0,0.7,0.2,-0.6],[8,7,-16.8,-5.2,-0.0,0.3],[8,8,0.9,3.9,0.2,0.2],[9,0,4.6,0.0,-0.0,0.0],[9,1,7.8,-24.8,-0.1,-0.3],[9,2,3.0,12.2,0.1,0.3],[9,3,-0.2,8.3,0.3,-0.3],[9,4,-2.5,-3.3,-0.3,0.3],[9,5,-13.1,-5.2,0.0,0.2],[9,6,2.4,7.2,0.3,-0.1],[9,7,8.6,-0.6,-0.1,-0.2],[9,8,-8.7,0.8,0.1,0.4],[9,9,-12.9,10.0,-0.1,0.1],[10,0,-1.3,0.0,0.1,0.0],[10,1,-6.4,3.3,0.0,0.0],[10,2,0.2,0.0,0.1,-0.0],[10,3,2.0,2.4,0.1,-0.2],[10,4,-1.0,5.3,-0.0,0.1],[10,5,-0.6,-9.1,-0.3,-0.1],[10,6,-0.9,0.4,0.0,0.1],[10,7,1.5,-4.2,-0.1,0.0],[10,8,0.9,-3.8,-0.1,-0.1],[10,9,-2.7,0.9,-0.0,0.2],[10,10,-3.9,-9.1,-0.0,-0.0],[11,0,2.9,0.0,0.0,0.0],[11,1,-1.5,0.0,-0.0,-0.0],[11,2,-2.5,2.9,0.0,0.1],[11,3,2.4,-0.6,0.0,-0.0],[11,4,-0.6,0.2,0.0,0.1],[11,5,-0.1,0.5,-0.1,-0.0],[11,6,-0.6,-0.3,0.0,-0.0],[11,7,-0.1,-1.2,-0.0,0.1],[11,8,1.1,-1.7,-0.1,-0.0],[11,9,-1.0,-2.9,-0.1,0.0],[11,10,-0.2,-1.8,-0.1,0.0],[11,11,2.6,-2.3,-0.1,0.0],[12,0,-2.0,0.0,0.0,0.0],[12,1,-0.2,-1.3,0.0,-0.0],[12,2,0.3,0.7,-0.0,0.0],[12,3,1.2,1.0,-0.0,-0.1],[12,4,-1.3,-1.4,-0.0,0.1],[12,5,0.6,-0.0,-0.0,-0.0],[12,6,0.6,0.6,0.1,-0.0],[12,7,0.5,-0.1,-0.0,-0.0],[12,8,-0.1,0.8,0.0,0.0],[12,9,-0.4,0.1,0.0,-0.0],[12,10,-0.2,-1.0,-0.1,-0.0],[12,11,-1.3,0.1,-0.0,0.0],[12,12,-0.7,0.2,-0.1,-0.1]];

/** The magnetic model in use (for online content updates, e.g. WMM2030 when it is published). */
export const getMagModel = () => ({ name: MODEL_NAME, epoch: EPOCH, coef: COEF });
let MODEL_NAME = 'WMM2025';
const degreeOf = (coef: number[][]) => coef.reduce((a, r) => Math.max(a, r[0]), 0);
/**
 * Switch the model. A model with fewer terms for the same or an older epoch is ignored, so an online update of the
 * standard WMM never replaces the high-resolution model of the same years.
 */
export function setMagModel(m: { name: string; epoch: number; coef: number[][] }): boolean {
  if (!m || typeof m.name !== 'string' || !Number.isFinite(m.epoch) || !Array.isArray(m.coef) || m.coef.length < 80 || !m.coef.every((r) => Array.isArray(r) && r.length === 6 && r.every(Number.isFinite))) throw new Error('magnetic model does not fit');
  if (m.epoch < EPOCH || (m.epoch === EPOCH && degreeOf(m.coef) < degreeOf(COEF))) return false;
  MODEL_NAME = m.name; EPOCH = m.epoch; COEF = m.coef; model = null;
  return true;
}
export const magModelName = () => MODEL_NAME;
/** Spherical harmonic degree of the model in use (12 for WMM, 133 for WMMHR). */
export const magModelDegree = () => degreeOf(COEF);

/**
 * Load NOAA's World Magnetic Model High Resolution (WMMHR2025, degree 133) built into the app. It is a separate
 * download chunk so the app starts as fast as before; compass bearings use WMM2025 for the first moment.
 */
let hrLoading: Promise<boolean> | null = null;
export function loadHighResMagModel(): Promise<boolean> {
  hrLoading ??= loadChunk(() => import('../data/wmmhr')).then(({ WMMHR }) => {
    const coef: number[][] = []; let k = 0;
    for (let n = 1; n <= WMMHR.maxN; n++) for (let m = 0; m <= n; m++, k += 4) coef.push([n, m, WMMHR.gh[k], WMMHR.gh[k + 1], WMMHR.gh[k + 2], WMMHR.gh[k + 3]]);
    if (coef.length !== WMMHR.rows || k !== WMMHR.gh.length) throw new Error('high-resolution magnetic model is incomplete');
    const ok = setMagModel({ name: WMMHR.name, epoch: WMMHR.epoch, coef });
    hrListeners.forEach((f) => f());
    return ok;
  }).catch(() => false);
  return hrLoading;
}
const hrListeners = new Set<() => void>();
/** Called when the high-resolution model has loaded (pages showing numbers re-render). */
export function onMagModel(f: () => void) { hrListeners.add(f); return () => { hrListeners.delete(f); }; }

type Model = { deg: number; g: Float64Array; h: Float64Array; dg: Float64Array; dh: Float64Array; A: Float64Array; B: Float64Array };
let model: Model | null = null;
const ix = (n: number, m: number) => (n * (n + 1)) / 2 + m;
function init(): Model {
  if (model) return model;
  const deg = degreeOf(COEF), size = ix(deg, deg) + 1;
  const g = new Float64Array(size), h = new Float64Array(size), dg = new Float64Array(size), dh = new Float64Array(size);
  for (const [n, m, gg, hh, dgg, dhh] of COEF) { const i = ix(n, m); g[i] = gg; h[i] = hh; dg[i] = dgg; dh[i] = dhh; }
  // Recursion factors for Schmidt semi-normalised Legendre functions: P(n,m) = A·cosθ·P(n-1,m) − B·P(n-2,m).
  const A = new Float64Array(size), B = new Float64Array(size);
  for (let n = 1; n <= deg; n++) for (let m = 0; m < n; m++) {
    const d = Math.sqrt(n * n - m * m);
    A[ix(n, m)] = (2 * n - 1) / d; B[ix(n, m)] = Math.sqrt((n - 1) * (n - 1) - m * m) / d;
  }
  model = { deg, g, h, dg, dh, A, B };
  return model;
}

/** Decimal year of a date, e.g. 2026-07-02 → 2026.5. */
export function decimalYear(d: Date = new Date()): number {
  const y = d.getUTCFullYear(), a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - a) / (b - a);
}

export interface Geomag { decDeg: number; dipDeg: number; totalNt: number; horizNt: number; year: number; outOfRange: boolean }

/**
 * Magnetic field at a point from the model in use (WMMHR2025 once loaded, WMM2025 before). Declination is
 * east-positive (west is negative). altKm is height above the WGS84 ellipsoid. Same method as NOAA's
 * geomagnetism library: geodetic → geocentric, spherical harmonic sum with Schmidt semi-normalised Legendre
 * functions, then the field is turned back to geodetic north / east / down.
 */
export function geomag(lat: number, lon: number, when: Date | number = new Date(), altKm = 0): Geomag {
  const M = init(), deg = M.deg;
  const yr = typeof when === 'number' ? when : decimalYear(when);
  const outOfRange = yr < EPOCH || yr > EPOCH + 5;
  const dt = Math.min(Math.max(yr, EPOCH), EPOCH + 5) - EPOCH;
  const rad = Math.PI / 180;
  const la = Math.max(-89.999999, Math.min(89.999999, lat)); // the formulas divide by sin(colatitude)
  // WGS84 geodetic → geocentric spherical.
  const a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f), re = 6371.2;
  const sl = Math.sin(la * rad), cl = Math.cos(la * rad);
  const rc = a / Math.sqrt(1 - e2 * sl * sl);
  const xp = (rc + altKm) * cl, zp = (rc * (1 - e2) + altKm) * sl;
  const r = Math.sqrt(xp * xp + zp * zp);
  const latc = Math.asin(zp / r); // geocentric latitude
  const ct = Math.sin(latc), st = Math.cos(latc); // cos and sin of colatitude
  const lam = lon * rad;
  // cos(mλ), sin(mλ)
  const cm = new Float64Array(deg + 1), sm = new Float64Array(deg + 1);
  cm[0] = 1; sm[0] = 0; const c1 = Math.cos(lam), s1 = Math.sin(lam);
  for (let m = 1; m <= deg; m++) { cm[m] = cm[m - 1] * c1 - sm[m - 1] * s1; sm[m] = sm[m - 1] * c1 + cm[m - 1] * s1; }
  const size = ix(deg, deg) + 1;
  const P = new Float64Array(size), dP = new Float64Array(size); // P and dP/dθ
  P[0] = 1; dP[0] = 0;
  for (let n = 1; n <= deg; n++) {
    // sectoral term P(n,n)
    const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
    P[ix(n, n)] = k * st * P[ix(n - 1, n - 1)];
    dP[ix(n, n)] = k * (ct * P[ix(n - 1, n - 1)] + st * dP[ix(n - 1, n - 1)]);
    for (let m = 0; m < n; m++) {
      const i = ix(n, m), A = M.A[i], B = M.B[i];
      const p1 = P[ix(n - 1, m)], d1 = dP[ix(n - 1, m)];
      const p2 = n - 2 >= m ? P[ix(n - 2, m)] : 0, d2 = n - 2 >= m ? dP[ix(n - 2, m)] : 0;
      P[i] = A * ct * p1 - B * p2;
      dP[i] = A * (ct * d1 - st * p1) - B * d2;
    }
  }
  let br = 0, bt = 0, bp = 0;
  const aor = re / r; let ar = aor * aor;
  for (let n = 1; n <= deg; n++) {
    ar *= aor; // (a/r)^(n+2)
    let sr = 0, stt = 0, sp = 0;
    for (let m = 0; m <= n; m++) {
      const i = ix(n, m), gg = M.g[i] + dt * M.dg[i], hh = M.h[i] + dt * M.dh[i];
      const t1 = gg * cm[m] + hh * sm[m], t2 = gg * sm[m] - hh * cm[m];
      sr += t1 * P[i]; stt += t1 * dP[i]; sp += m * t2 * P[i];
    }
    br += ar * (n + 1) * sr; bt -= ar * stt; bp += ar * sp;
  }
  bp /= st;
  // Geocentric (north = −Bθ, east = Bφ, down = −Br) → geodetic.
  const psi = latc - la * rad, cps = Math.cos(psi), sps = Math.sin(psi);
  const xn = -bt, ye = bp, zd = -br;
  const bx = xn * cps - zd * sps, by = ye, bz = xn * sps + zd * cps, bh = Math.sqrt(bx * bx + by * by);
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
