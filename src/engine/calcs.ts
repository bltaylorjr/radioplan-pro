// Stand-alone engineering calculators (pure functions). Formulas are standard textbook / industry forms;
// approximations are labelled where used.
import { wavelengthM, EARTH_RADIUS_KM } from './rf';
import { RESISTANCE_OHM_PER_KFT, Awg } from './electrical';

const log10 = Math.log10;

// ---- Power and level ----
export const dbmToMw = (dbm: number) => Math.pow(10, dbm / 10);
export const mwToDbm = (mw: number) => 10 * log10(mw);
/** dBm ↔ µV across a resistive load (default 50 Ω). */
export const dbmToUv = (dbm: number, ohms = 50) => Math.sqrt(dbmToMw(dbm) * 1e-3 * ohms) * 1e6;
export const uvToDbm = (uv: number, ohms = 50) => mwToDbm(((uv * 1e-6) ** 2 / ohms) * 1e3);
export const dbmToDbuv = (dbm: number, ohms = 50) => 20 * log10(dbmToUv(dbm, ohms));
/** Field strength (dBµV/m) at a receive antenna of gain G (dBi) delivering Pr (dBm) into 50 Ω: E = Pr + 20·log f + 77.2 − G. */
export const fieldStrengthDbuvM = (prDbm: number, fMHz: number, gDbi: number) => prDbm + 20 * log10(fMHz) + 77.2 - gDbi;
export const receivedFromField = (eDbuvM: number, fMHz: number, gDbi: number) => eDbuvM - 20 * log10(fMHz) - 77.2 + gDbi;

// ---- Antennas ----
export function antennaLengths(fMHz: number, velocity = 0.95) {
  const lam = wavelengthM(fMHz);
  return { lambdaM: lam, halfWaveM: (lam / 2) * velocity, quarterWaveM: (lam / 4) * velocity, fiveEighthM: lam * 0.625 * velocity, halfWaveFt468: 468 / fMHz, quarterWaveFt234: 234 / fMHz };
}
export const dbdToDbi = (dbd: number) => dbd + 2.15;
export const dbiToDbd = (dbi: number) => dbi - 2.15;
/** Approximate directivity from half-power beamwidths: G ≈ 10·log10(η·41253 / (θH·θV)). */
export const gainFromBeamwidth = (hDeg: number, vDeg: number, eff = 0.7) => 10 * log10((eff * 41253) / (hDeg * vDeg));
/** Antenna-to-antenna isolation (typical engineering approximations): horizontal = 22 + 20·log(d/λ) − (G1+G2); vertical = 28 + 40·log(d/λ). */
export const isolationHorizontalDb = (dM: number, fMHz: number, g1Dbi: number, g2Dbi: number) => 22 + 20 * log10(dM / wavelengthM(fMHz)) - (g1Dbi + g2Dbi);
export const isolationVerticalDb = (dM: number, fMHz: number) => 28 + 40 * log10(dM / wavelengthM(fMHz));
/** Downtilt (deg) that points the main beam at a ground point d km away from height h m, with earth curvature (k-factor). */
export const tiltToDistanceDeg = (hM: number, dKm: number, k = 4 / 3) => ((Math.atan(hM / (dKm * 1000)) + (dKm / (2 * k * EARTH_RADIUS_KM))) * 180) / Math.PI;

// ---- Transmission line ----
export function vswrCalc(vswr: number) {
  const g = (vswr - 1) / (vswr + 1);
  return { gamma: g, returnLossDb: g > 0 ? -20 * log10(g) : Infinity, mismatchLossDb: -10 * log10(1 - g * g), reflectedPct: g * g * 100 };
}
export const returnLossToVswr = (rlDb: number) => { const g = Math.pow(10, -rlDb / 20); return (1 + g) / (1 - g); };

// ---- Noise / sensitivity ----
export const thermalNoiseDbm = (bwHz: number, nfDb = 0, tempK = 290) => 10 * log10(1.380649e-23 * tempK * bwHz * 1000) + nfDb;
export const sensitivityDbm = (bwHz: number, nfDb: number, snrDb: number) => thermalNoiseDbm(bwHz, nfDb) + snrDb;

// ---- Intermodulation ----
export interface ImHit { order: number; formula: string; fMHz: number; victim: number; offsetKHz: number }
/** Two- and three-signal 3rd-order and two-signal 5th-order products of the TX list that fall within ±tolKHz of any RX frequency. */
export function intermodHits(tx: number[], rx: number[], tolKHz: number): { products: { order: number; formula: string; fMHz: number }[]; hits: ImHit[] } {
  const products: { order: number; formula: string; fMHz: number }[] = [];
  const f = (x: number) => x.toFixed(4);
  for (let i = 0; i < tx.length; i++) for (let j = 0; j < tx.length; j++) {
    if (i === j) continue;
    products.push({ order: 3, formula: `2×${f(tx[i])} − ${f(tx[j])}`, fMHz: 2 * tx[i] - tx[j] });
    products.push({ order: 5, formula: `3×${f(tx[i])} − 2×${f(tx[j])}`, fMHz: 3 * tx[i] - 2 * tx[j] });
    for (let k = 0; k < tx.length; k++) if (k !== i && k !== j && i < j) products.push({ order: 3, formula: `${f(tx[i])} + ${f(tx[j])} − ${f(tx[k])}`, fMHz: tx[i] + tx[j] - tx[k] });
  }
  const hits: ImHit[] = [];
  for (const p of products) for (const v of rx) { const off = (p.fMHz - v) * 1000; if (Math.abs(off) <= tolKHz) hits.push({ ...p, victim: v, offsetKHz: off }); }
  return { products, hits };
}

// ---- Traffic ----
/** Erlang B blocking probability for N channels and A Erlangs (stable recursion). */
export function erlangB(n: number, a: number): number { let b = 1; for (let k = 1; k <= n; k++) b = (a * b) / (k + a * b); return b; }
export function channelsForGos(a: number, gos: number): number { for (let n = 1; n < 1000; n++) if (erlangB(n, a) <= gos) return n; return NaN; }

// ---- Electrical ----
export function ohmsLaw(v?: number | null, i?: number | null, r?: number | null, p?: number | null) {
  const has = (x?: number | null) => x != null && Number.isFinite(x);
  if (has(v) && has(i)) return { v: v!, i: i!, r: v! / i!, p: v! * i! };
  if (has(v) && has(r)) return { v: v!, i: v! / r!, r: r!, p: (v! * v!) / r! };
  if (has(v) && has(p)) return { v: v!, i: p! / v!, r: (v! * v!) / p!, p: p! };
  if (has(i) && has(r)) return { v: i! * r!, i: i!, r: r!, p: i! * i! * r! };
  if (has(i) && has(p)) return { v: p! / i!, i: i!, r: p! / (i! * i!), p: p! };
  if (has(r) && has(p)) return { v: Math.sqrt(p! * r!), i: Math.sqrt(p! / r!), r: r!, p: p! };
  return null;
}
/** Voltage drop with NEC Ch. 9 Table 8 DC resistance (uncoated copper, 75 °C). Single-phase / DC uses 2·L; three-phase uses √3·L. */
export function voltageDrop(amps: number, oneWayFt: number, awg: Awg, volts: number, phase: 'dc' | '1ph' | '3ph') {
  const k = phase === '3ph' ? Math.sqrt(3) : 2;
  const vd = (k * oneWayFt * amps * RESISTANCE_OHM_PER_KFT[awg]) / 1000;
  return { vd, pct: (vd / volts) * 100, endV: volts - vd };
}
export function batteryAh(loadW: number, hours: number, volts: number, dod: number, tempFactor = 1, invEff = 1) { return (loadW * hours) / (volts * dod * tempFactor * invEff); }
export function batteryRuntimeH(ah: number, volts: number, loadW: number, dod: number) { return (ah * volts * dod) / loadW; }
/** Dwight's formula for one driven rod: R = ρ/(2πL)·(ln(4L/a) − 1). ρ Ω·m, L m, a = rod radius m. */
export const groundRodOhms = (rhoOhmM: number, lenM: number, diaM: number) => (rhoOhmM / (2 * Math.PI * lenM)) * (Math.log((4 * lenM) / (diaM / 2)) - 1);
export const guyLength = (attachHtM: number, anchorRadiusM: number) => ({ lengthM: Math.hypot(attachHtM, anchorRadiusM), angleDeg: (Math.atan2(attachHtM, anchorRadiusM) * 180) / Math.PI });

// ---- Conversions ----
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const fToC = (f: number) => ((f - 32) * 5) / 9;
const AWG_N: Record<string, number> = { '4/0': -3, '3/0': -2, '2/0': -1, '1/0': 0 };
export function awgToMm2(awg: string) { const n = AWG_N[awg] ?? Number(awg); const d = 0.127 * Math.pow(92, (36 - n) / 39); return { diaMm: d, areaMm2: (Math.PI * d * d) / 4, kcmil: (d / 0.0254) ** 2 / 1000 }; }
export function ddToDms(dd: number, pos: string, neg: string) { const h = dd < 0 ? neg : pos, a = Math.abs(dd), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60; return `${d}° ${String(m).padStart(2, '0')}′ ${s.toFixed(2).padStart(5, '0')}″ ${h}`; }
