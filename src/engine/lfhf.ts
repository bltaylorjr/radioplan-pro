// LF/MF (30 kHz-3 MHz) and HF (3-30 MHz) antenna and propagation planning helpers.
import { wavelengthM } from './rf';

export const halfWaveDipoleFt = (fMHz: number) => 468 / fMHz;
export const quarterWaveVerticalFt = (fMHz: number) => 234 / fMHz;

/** Radiation resistance (ohm) of a short/quarter-wave monopole over perfect ground. */
export function monopoleRadiationResistance(heightM: number, fMHz: number): number {
  const g = (2 * Math.PI * heightM) / wavelengthM(fMHz); // electrical height (rad)
  if (g < 0.5) return 10 * g * g; // short monopole approx: Rr ≈ 40π²(h/λ)²
  return 36.5 * Math.pow(Math.sin(Math.min(g, Math.PI / 2)), 2); // tends to 36.5 Ω at λ/4
}
export function monopoleEfficiency(heightM: number, fMHz: number, groundLossOhm: number, loadingCoilLossOhm = 0) {
  const rr = monopoleRadiationResistance(heightM, fMHz);
  return { rr, eff: rr / (rr + groundLossOhm + loadingCoilLossOhm) };
}

/**
 * Groundwave field strength (mV/m) using unattenuated field E0 at 1 km (mV/m per sqrt kW)
 * and the Sommerfeld-Norton flat-earth attenuation function (Bremmer approximation).
 * Planning estimate only; regulatory studies use ITU-R P.368 / FCC 47 CFR 73.184 curves.
 */
export function groundwaveFieldMvM(powerKw: number, eff: number, dKm: number, fMHz: number, sigmaSm: number, epsR = 15, e0At1kmPerSqrtKw = 300) {
  const lambda = wavelengthM(fMHz);
  const x = (1.8e4 * sigmaSm) / fMHz;
  const p = ((Math.PI * dKm * 1000) / (lambda * x)) * (1 / Math.sqrt(1 + (epsR / x) ** 2));
  const A = (2 + 0.3 * p) / (2 + p + 0.6 * p * p);
  return e0At1kmPerSqrtKw * Math.sqrt(powerKw * eff) * A / dKm;
}
export const mvmToDbuV = (mvm: number) => 20 * Math.log10(mvm * 1000);

/** HF skywave geometry: elevation (take-off) angle for a single hop of distance D via a layer at height h. */
export function takeoffAngleDeg(dKm: number, layerKm = 300): number {
  const R = 6371, th = dKm / (2 * R);
  return (Math.atan((Math.cos(th) - R / (R + layerKm)) / Math.sin(th)) * 180) / Math.PI;
}
/** Secant-law MUF (curved earth) for a hop of dKm with critical frequency foF2 (MHz). */
export function mufMHz(foF2: number, dKm: number, layerKm = 300): number {
  const R = 6371;
  const el = (takeoffAngleDeg(dKm, layerKm) * Math.PI) / 180;
  const sinI = (R * Math.cos(el)) / (R + layerKm); // incidence angle at the layer
  return foF2 / Math.sqrt(1 - sinI * sinI);
}
/** Frequency of optimum traffic ≈ 85% of MUF. */
export const fotMHz = (muf: number) => 0.85 * muf;
/** NVIS: recommend 0.1-0.25 λ dipole height and operating below foF2. */
export function nvisPlan(foF2: number) {
  const f = 0.85 * foF2;
  const l = wavelengthM(f);
  return { freqMHz: f, dipoleLengthFt: halfWaveDipoleFt(f), heightMinM: 0.1 * l, heightMaxM: 0.25 * l };
}
