// Core RF engineering calculations. All functions are pure and unit-tested (tests/rf.test.ts).
// Units: distances in km unless suffixed (M = metres), frequency in MHz unless noted, power in dBm.

export const EARTH_RADIUS_KM = 6371;
export const C = 299_792_458; // m/s
const log10 = Math.log10;

/** Wavelength in metres. */
export const wavelengthM = (fMHz: number) => C / (fMHz * 1e6);

/** Effective Earth radius (km) for refractivity k-factor (standard atmosphere k = 4/3). */
export const effectiveEarthRadiusKm = (k = 4 / 3) => k * EARTH_RADIUS_KM;

/** Radio horizon distance (km) for an antenna height in metres: d = sqrt(2 k Re h). ~4.12*sqrt(h) for k=4/3. */
export function radioHorizonKm(heightM: number, k = 4 / 3): number {
  if (heightM <= 0) return 0;
  return Math.sqrt(2 * effectiveEarthRadiusKm(k) * (heightM / 1000));
}

/** Maximum line-of-sight distance (km) between two antennas over smooth earth. */
export const losDistanceKm = (h1M: number, h2M: number, k = 4 / 3) => radioHorizonKm(h1M, k) + radioHorizonKm(h2M, k);

/** Earth bulge (m) at a point d1 km from one end and d2 km from the other. */
export function earthBulgeM(d1Km: number, d2Km: number, k = 4 / 3): number {
  return ((d1Km * d2Km) / (2 * effectiveEarthRadiusKm(k))) * 1000;
}

/** nth Fresnel zone radius (m) at a point d1/d2 km along a path; r = sqrt(n λ d1 d2 / (d1+d2)). */
export function fresnelRadiusM(d1Km: number, d2Km: number, fMHz: number, n = 1): number {
  const d = d1Km + d2Km;
  if (d <= 0 || d1Km <= 0 || d2Km <= 0) return 0;
  return Math.sqrt((n * wavelengthM(fMHz) * d1Km * 1000 * d2Km * 1000) / (d * 1000));
}

/** Free-space path loss (dB). */
export function fsplDb(fMHz: number, dKm: number): number {
  return 32.45 + 20 * log10(fMHz) + 20 * log10(Math.max(dKm, 1e-6));
}

export type Environment = 'urban' | 'suburban' | 'rural';
export type CitySize = 'small-medium' | 'large';

/** Mobile antenna height correction a(hm) for Okumura-Hata / COST-231. */
export function mobileCorrectionDb(fMHz: number, hmM: number, city: CitySize): number {
  if (city === 'large') {
    if (fMHz <= 300) return 8.29 * Math.pow(log10(1.54 * hmM), 2) - 1.1;
    return 3.2 * Math.pow(log10(11.75 * hmM), 2) - 4.97;
  }
  return (1.1 * log10(fMHz) - 0.7) * hmM - (1.56 * log10(fMHz) - 0.8);
}

export interface HataInputs {
  fMHz: number; hbM: number; hmM: number; dKm: number; env: Environment; city?: CitySize;
}
export interface PathLossResult { lossDb: number; model: string; warnings: string[] }

/** Okumura-Hata median path loss (150-1500 MHz). */
export function okumuraHata(i: HataInputs): PathLossResult {
  const city = i.city ?? 'small-medium';
  const w: string[] = [];
  if (i.fMHz < 150 || i.fMHz > 1500) w.push(`Hata valid 150-1500 MHz; ${i.fMHz} MHz is outside range.`);
  if (i.hbM < 30 || i.hbM > 200) w.push(`Hata base height valid 30-200 m; got ${i.hbM} m.`);
  if (i.hmM < 1 || i.hmM > 10) w.push(`Hata mobile height valid 1-10 m; got ${i.hmM} m.`);
  if (i.dKm < 1 || i.dKm > 20) w.push(`Hata distance valid 1-20 km; got ${i.dKm.toFixed(2)} km.`);
  const lf = log10(i.fMHz), lh = log10(i.hbM), ld = log10(Math.max(i.dKm, 1e-3));
  const urban = 69.55 + 26.16 * lf - 13.82 * lh - mobileCorrectionDb(i.fMHz, i.hmM, city) + (44.9 - 6.55 * lh) * ld;
  let loss = urban;
  if (i.env === 'suburban') loss = urban - 2 * Math.pow(log10(i.fMHz / 28), 2) - 5.4;
  if (i.env === 'rural') loss = urban - 4.78 * lf * lf + 18.33 * lf - 40.94;
  return { lossDb: loss, model: 'Okumura-Hata', warnings: w };
}

/** COST-231 Hata extension (1500-2000 MHz). Cm = 3 dB metropolitan, 0 dB medium city/suburban. */
export function cost231Hata(i: HataInputs): PathLossResult {
  const city = i.city ?? 'small-medium';
  const w: string[] = [];
  if (i.fMHz < 1500 || i.fMHz > 2000) w.push(`COST-231 Hata valid 1500-2000 MHz; ${i.fMHz} MHz is outside range.`);
  if (i.hbM < 30 || i.hbM > 200) w.push(`COST-231 base height valid 30-200 m; got ${i.hbM} m.`);
  if (i.dKm < 1 || i.dKm > 20) w.push(`COST-231 distance valid 1-20 km; got ${i.dKm.toFixed(2)} km.`);
  const lf = log10(i.fMHz), lh = log10(i.hbM), ld = log10(Math.max(i.dKm, 1e-3));
  const cm = i.env === 'urban' && city === 'large' ? 3 : 0;
  let loss = 46.3 + 33.9 * lf - 13.82 * lh - mobileCorrectionDb(i.fMHz, i.hmM, city) + (44.9 - 6.55 * lh) * ld + cm;
  // Open/suburban corrections borrowed from Hata (common engineering practice, not part of COST-231 spec).
  if (i.env === 'suburban') loss -= 2 * Math.pow(log10(i.fMHz / 28), 2) + 5.4;
  if (i.env === 'rural') loss -= 4.78 * lf * lf - 18.33 * lf + 40.94;
  return { lossDb: loss, model: 'COST-231 Hata', warnings: w };
}

/** Picks Hata (<=1500 MHz) or COST-231 (>1500 MHz). Never returns less than free-space loss. */
export function empiricalPathLoss(i: HataInputs): PathLossResult {
  const r = i.fMHz > 1500 ? cost231Hata(i) : okumuraHata(i);
  const fs = fsplDb(i.fMHz, i.dKm);
  if (r.lossDb < fs) return { ...r, lossDb: fs, warnings: [...r.warnings, 'Model below free-space; clamped to FSPL.'] };
  return r;
}

/** Distance (km) at which the empirical model loss equals `maplDb` (inverse of Hata/COST-231). */
export function rangeForPathLossKm(maplDb: number, base: Omit<HataInputs, 'dKm'>): number {
  const at1 = (base.fMHz > 1500 ? cost231Hata : okumuraHata)({ ...base, dKm: 1 }).lossDb;
  const slope = 44.9 - 6.55 * log10(base.hbM);
  return Math.pow(10, (maplDb - at1) / slope);
}

// ---------- Link budget ----------
export interface LinkBudgetInputs {
  txPowerDbm: number; txAntGainDbi: number; txFeederLossDb: number; txConnectorLossDb?: number;
  rxAntGainDbi: number; rxFeederLossDb: number; rxSensitivityDbm: number;
  fadeMarginDb?: number; bodyLossDb?: number; penetrationLossDb?: number; interferenceMarginDb?: number;
}
export const eirpDbm = (p: number, g: number, feeder: number, conn = 0) => p - feeder - conn + g;
export const erpDbm = (eirp: number) => eirp - 2.15;
export const dbmToWatts = (dbm: number) => Math.pow(10, (dbm - 30) / 10);
export const wattsToDbm = (w: number) => 10 * log10(w) + 30;

export interface LinkBudgetResult { eirpDbm: number; erpDbm: number; eirpW: number; maplDb: number; totalMarginsDb: number }

/** Maximum allowable path loss at cell edge = EIRP + Grx - Lrx - sensitivity - margins. */
export function linkBudget(i: LinkBudgetInputs): LinkBudgetResult {
  const eirp = eirpDbm(i.txPowerDbm, i.txAntGainDbi, i.txFeederLossDb, i.txConnectorLossDb ?? 0);
  const margins = (i.fadeMarginDb ?? 0) + (i.bodyLossDb ?? 0) + (i.penetrationLossDb ?? 0) + (i.interferenceMarginDb ?? 0);
  const mapl = eirp + i.rxAntGainDbi - i.rxFeederLossDb - i.rxSensitivityDbm - margins;
  return { eirpDbm: eirp, erpDbm: erpDbm(eirp), eirpW: dbmToWatts(eirp), maplDb: mapl, totalMarginsDb: margins };
}

/** Received power (dBm) = EIRP - path loss + Grx - Lrx. */
export const receivedPowerDbm = (eirp: number, pathLoss: number, grx: number, lrx: number) => eirp - pathLoss + grx - lrx;

// ---------- Statistics: shadow fading margin & area reliability ----------
/** Inverse standard normal CDF (Acklam's algorithm, |error| < 1.2e-9). */
export function invNorm(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError('p must be in (0,1)');
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number, r: number;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Log-normal shadow fading margin (dB) for a cell-edge location reliability (e.g. 0.9). */
export const shadowMarginDb = (sigmaDb: number, edgeReliability: number) => sigmaDb * invNorm(edgeReliability);

export function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

/** Jakes area-coverage reliability within the cell given edge margin, sigma, and path-loss exponent n. */
export function areaReliability(edgeMarginDb: number, sigmaDb: number, n = 3.5): number {
  const a = -edgeMarginDb / (sigmaDb * Math.SQRT2);
  const b = (10 * n * Math.LOG10E) / (sigmaDb * Math.SQRT2);
  return 0.5 * (1 - erf(a) + Math.exp((1 - 2 * a * b) / (b * b)) * (1 - erf((1 - a * b) / b)));
}

// ---------- Diffraction ----------
/** Fresnel-Kirchhoff diffraction parameter v for an obstacle of height h (m) above the LOS line. */
export function diffractionV(hM: number, d1Km: number, d2Km: number, fMHz: number): number {
  const l = wavelengthM(fMHz), d1 = d1Km * 1000, d2 = d2Km * 1000;
  return hM * Math.sqrt((2 / l) * ((d1 + d2) / (d1 * d2)));
}

/** Single knife-edge diffraction loss J(v) in dB, ITU-R P.526 approximation (valid v > -0.78). */
export function knifeEdgeLossDb(v: number): number {
  if (v <= -0.78) return 0;
  return 6.9 + 20 * log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1);
}

// ---------- Antenna pattern & tilt ----------
/** 3GPP TR 36.814 parabolic sector pattern attenuation (dB, <= 0). */
export function sectorPatternDb(offAzDeg: number, offElDeg: number, hBwDeg: number, vBwDeg: number, fbDb = 25, slaDb = 20): number {
  let az = ((offAzDeg + 540) % 360) - 180;
  const ah = hBwDeg >= 360 ? 0 : -Math.min(12 * (az / hBwDeg) ** 2, fbDb);
  const av = -Math.min(12 * (offElDeg / vBwDeg) ** 2, slaDb);
  return -Math.min(-(ah + av), fbDb);
}

/** Ground footprint of a down-tilted beam: main-beam hit, inner and outer -3 dB edges (km). */
export function tiltFootprintKm(heightM: number, tiltDeg: number, vBwDeg: number) {
  const r = (deg: number) => (deg <= 0 ? Infinity : heightM / Math.tan((deg * Math.PI) / 180) / 1000);
  return { mainBeamKm: r(tiltDeg), innerKm: r(tiltDeg + vBwDeg / 2), outerKm: r(tiltDeg - vBwDeg / 2) };
}

/** Recommended downtilt (deg) so the upper -3 dB edge lands at the target cell radius. */
export function recommendedTiltDeg(heightM: number, cellRadiusKm: number, vBwDeg: number): number {
  return (Math.atan(heightM / (cellRadiusKm * 1000)) * 180) / Math.PI + vBwDeg / 2;
}

// ---------- RF exposure (FCC OET Bulletin 65 / 47 CFR 1.1310) ----------
/** MPE limit in mW/cm^2. */
export function mpeLimitMwCm2(fMHz: number, population: 'general' | 'occupational'): number {
  if (population === 'general') {
    if (fMHz < 1.34) return 100;
    if (fMHz < 30) return 180 / (fMHz * fMHz);
    if (fMHz < 300) return 0.2;
    if (fMHz < 1500) return fMHz / 1500;
    return 1.0;
  }
  if (fMHz < 3) return 100;
  if (fMHz < 30) return 900 / (fMHz * fMHz);
  if (fMHz < 300) return 1.0;
  if (fMHz < 1500) return fMHz / 300;
  return 5.0;
}
/** Far-field power density (mW/cm^2) at distance R metres, OET-65 eq. with ground reflection factor 1.6 (field) -> 2.56 power. */
export function powerDensityMwCm2(eirpW: number, rM: number, groundReflection = true): number {
  const rCm = rM * 100;
  return ((groundReflection ? 2.56 : 1) * eirpW * 1000) / (4 * Math.PI * rCm * rCm);
}
/** Distance (m) at which power density falls to the MPE limit. */
export function mpeComplianceDistanceM(eirpW: number, fMHz: number, population: 'general' | 'occupational', groundReflection = true): number {
  const s = mpeLimitMwCm2(fMHz, population);
  return Math.sqrt(((groundReflection ? 2.56 : 1) * eirpW * 1000) / (4 * Math.PI * s)) / 100;
}

// ---------- Feeder loss ----------
/** Interpolate cable attenuation (dB/100 ft) from datasheet points using a*sqrt(f)+b*f fit. */
export function cableLossPer100ft(points: [number, number][], fMHz: number): number {
  if (points.length === 1) return points[0][1] * Math.sqrt(fMHz / points[0][0]);
  // Least squares on [sqrt(f), f]
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
  for (const [f, a] of points) { const x1 = Math.sqrt(f), x2 = f; s11 += x1 * x1; s12 += x1 * x2; s22 += x2 * x2; t1 += x1 * a; t2 += x2 * a; }
  const det = s11 * s22 - s12 * s12;
  const ka = (t1 * s22 - t2 * s12) / det, kb = (s11 * t2 - s12 * t1) / det;
  return Math.max(0, ka * Math.sqrt(fMHz) + kb * fMHz);
}
export const mToFt = (m: number) => m * 3.28084;
export const ftToM = (ft: number) => ft / 3.28084;
