// Audio and acoustics maths for the Audio & Acoustic Analyzer: frequency weightings (IEC 61672-1), octave and
// one-third-octave bands (IEC 61260 base-10), time weighting and statistics (Leq, Lmax, Lmin, L10, L50, L90),
// the exponential sine sweep and its impulse response (Farina), reverberation (ISO 3382: EDT, T20, T30,
// Schroeder integration), speech transmission index from the impulse response (IEC 60268-16 indirect method),
// THD+N, noise criteria (NC) and microphone calibration files. Plain TypeScript, tested in Node.
import { fft } from './spectrum';

// ---------- weightings ----------
const f2 = (f: number) => f * f;
/** A-weighting (dB) at f Hz, IEC 61672-1. */
export function aWeight(f: number): number { const r = (12194 ** 2 * f ** 4) / ((f2(f) + 20.6 ** 2) * Math.sqrt((f2(f) + 107.7 ** 2) * (f2(f) + 737.9 ** 2)) * (f2(f) + 12194 ** 2)); return 20 * Math.log10(r) + 2.0; }
/** C-weighting (dB) at f Hz. */
export function cWeight(f: number): number { const r = (12194 ** 2 * f2(f)) / ((f2(f) + 20.6 ** 2) * (f2(f) + 12194 ** 2)); return 20 * Math.log10(r) + 0.06; }
export type Weighting = 'A' | 'C' | 'Z';
export const weightDb = (w: Weighting, f: number) => (w === 'A' ? aWeight(f) : w === 'C' ? cWeight(f) : 0);

// ---------- bands ----------
/** Exact mid-band frequencies (base-10, G = 10^0.3) and nominal labels for octave or one-third-octave bands. */
export function bands(third: boolean, lo = 20, hi = 20000): { fm: number; label: string; f1: number; f2: number }[] {
  const out: { fm: number; label: string; f1: number; f2: number }[] = [], step = third ? 1 : 3, e = 10 ** (0.15 * (third ? 1 / 3 : 1));
  for (let x = third ? -17 : -15; x <= 13; x += step) { const fm = 1000 * 10 ** (x / 10); if (fm < lo * 0.89 || fm > hi * 1.12) continue; out.push({ fm, label: nominal(fm), f1: fm / e, f2: fm * e }); }
  return out;
}
const NOM = [12.5, 16, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
function nominal(fm: number): string { const n = NOM.reduce((a, b) => (Math.abs(Math.log(b / fm)) < Math.abs(Math.log(a / fm)) ? b : a)); return n >= 1000 ? `${n / 1000}k` : String(n); }
/** Band levels (dB) from a power spectrum (linear power per bin, bin width df), with an optional weighting. */
export function bandLevels(power: ArrayLike<number>, df: number, third: boolean, w: Weighting = 'Z', calDb = 0): { label: string; fm: number; db: number }[] {
  return bands(third).map((b) => { let p = 0; for (let k = Math.max(1, Math.ceil(b.f1 / df)); k <= Math.min(power.length - 1, Math.floor(b.f2 / df)); k++) p += power[k] * 10 ** (weightDb(w, k * df) / 10); return { label: b.label, fm: b.fm, db: 10 * Math.log10(p + 1e-30) + calDb }; });
}
/** Total weighted level (dB) of a power spectrum. */
export function totalLevel(power: ArrayLike<number>, df: number, w: Weighting, calDb = 0, fmin = 10, fmax = 20000): number {
  let p = 0; for (let k = 1; k < power.length; k++) { const f = k * df; if (f < fmin || f > fmax) continue; p += power[k] * 10 ** (weightDb(w, f) / 10); } return 10 * Math.log10(p + 1e-30) + calDb;
}
/** Power spectrum (one-sided, mean-square per bin, Hann window, amplitude-corrected so a full-scale sine reads −3 dBFS RMS). */
export function powerSpectrum(x: Float32Array, n = x.length): { p: Float64Array; df: (sr: number) => number } {
  const re = new Float64Array(n), im = new Float64Array(n); let s2 = 0;
  for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); re[i] = (x[i] ?? 0) * w; s2 += w * w; }
  fft(re, im); const p = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) p[k] = ((re[k] ** 2 + im[k] ** 2) / (s2 * n)) * (k ? 2 : 1);
  return { p, df: (sr) => sr / n };
}

// ---------- time weighting and statistics ----------
/** Exponential time weighting of squared samples: Fast 125 ms, Slow 1 s, Impulse 35 ms rise. Returns the level (dB re 1) at each step. */
export function timeWeighted(levelsDbPerBlock: number[], blockS: number, tau: number): number[] {
  const a = Math.exp(-blockS / tau); let s = 10 ** ((levelsDbPerBlock[0] ?? -200) / 10); return levelsDbPerBlock.map((l) => { s = a * s + (1 - a) * 10 ** (l / 10); return 10 * Math.log10(s + 1e-30); });
}
export const TAU = { F: 0.125, S: 1, I: 0.035 } as const;
export function stats(levels: number[]) {
  if (!levels.length) return null; const s = [...levels].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round((1 - p / 100) * (s.length - 1))))];
  return { leq: 10 * Math.log10(levels.reduce((a, l) => a + 10 ** (l / 10), 0) / levels.length), lmax: s[s.length - 1], lmin: s[0], l10: q(10), l50: q(50), l90: q(90) };
}

// ---------- exponential sine sweep and impulse response ----------
/** Exponential sine sweep f1→f2 over T seconds, and its inverse filter (time-reversed with 6 dB/oct amplitude correction). */
export function essSweep(f1: number, f2: number, T: number, sr: number): { sweep: Float32Array; inverse: Float32Array } {
  const n = Math.round(T * sr), L = T / Math.log(f2 / f1), K = 2 * Math.PI * f1 * L, sweep = new Float32Array(n), inverse = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr; sweep[i] = Math.sin(K * (Math.exp(t / L) - 1)); }
  const fade = Math.round(0.01 * sr); for (let i = 0; i < fade; i++) { const g = i / fade; sweep[i] *= g; sweep[n - 1 - i] *= g; }
  for (let i = 0; i < n; i++) { const t = i / sr; inverse[i] = sweep[n - 1 - i] * Math.exp(-t / L); }
  let e = 0; for (let i = 0; i < n; i++) e += sweep[i] * inverse[i]; // normalise later by peak
  return { sweep, inverse };
}
/** Linear convolution by FFT. */
export function convolve(a: Float32Array, b: Float32Array): Float32Array {
  let n = 1; while (n < a.length + b.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(a); br.set(b); fft(ar, ai); fft(br, bi);
  for (let k = 0; k < n; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = -i; } // conj for inverse via forward FFT
  fft(ar, ai); const out = new Float32Array(a.length + b.length - 1); for (let k = 0; k < out.length; k++) out[k] = ar[k] / n;
  return out;
}
/** Impulse response from a recorded sweep: convolve with the inverse filter, start at the peak (minus a little), normalised. */
export function impulseResponse(recorded: Float32Array, inverse: Float32Array, sr: number, lengthS = 3): Float32Array {
  const c = convolve(recorded, inverse); let pk = 0; for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) > Math.abs(c[pk])) pk = i;
  const s = Math.max(0, pk - Math.round(0.002 * sr)), ir = c.slice(s, s + Math.round(lengthS * sr)), m = Math.abs(c[pk]) || 1;
  for (let i = 0; i < ir.length; i++) ir[i] /= m; return ir;
}
/** Band-pass an impulse response by FFT masking (octave band around fm), for per-band decay and STI. */
export function bandFilter(ir: Float32Array, sr: number, fm: number, third = false): Float32Array {
  let n = 1; while (n < ir.length) n <<= 1; const re = new Float64Array(n), im = new Float64Array(n); re.set(ir); fft(re, im);
  const e = 10 ** (0.15 * (third ? 1 / 3 : 1)), f1 = fm / e, f2b = fm * e;
  for (let k = 0; k < n; k++) { const f = (k <= n / 2 ? k : n - k) * (sr / n); const g = f >= f1 && f <= f2b ? 1 : f < f1 ? Math.exp(-(((f1 - f) / (f1 * 0.15)) ** 2)) : Math.exp(-(((f - f2b) / (f2b * 0.15)) ** 2)); re[k] *= g; im[k] *= g; }
  for (let k = 0; k < n; k++) im[k] = -im[k]; fft(re, im); const out = new Float32Array(ir.length); for (let i = 0; i < ir.length; i++) out[i] = re[i] / n; return out;
}
/** Schroeder backward-integrated energy decay (dB, 0 at start), with Lundeby-style noise truncation at `noiseFrac` of the tail. */
export function schroeder(ir: Float32Array, noiseFrac = 0.1): Float64Array {
  const e = Float64Array.from(ir, (v) => v * v), tail = Math.max(1, Math.floor(e.length * noiseFrac)); let nz = 0; for (let i = e.length - tail; i < e.length; i++) nz += e[i]; nz /= tail;
  const out = new Float64Array(e.length); let s = 0; for (let i = e.length - 1; i >= 0; i--) { s += Math.max(0, e[i] - nz); out[i] = s; }
  const t = out[0] || 1; for (let i = 0; i < out.length; i++) out[i] = 10 * Math.log10(out[i] / t + 1e-30); return out;
}
/** Decay time from a linear fit between two levels of the decay curve, extrapolated to 60 dB (EDT: 0 to −10, T20: −5 to −25, T30: −5 to −35). */
export function decayTime(edc: Float64Array, sr: number, from: number, to: number): number | null {
  let a = -1, b = -1; for (let i = 0; i < edc.length; i++) { if (a < 0 && edc[i] <= from) a = i; if (edc[i] <= to) { b = i; break; } }
  if (a < 0 || b <= a) return null; let sx = 0, sy = 0, sxx = 0, sxy = 0; const n = b - a + 1;
  for (let i = a; i <= b; i++) { const x = i / sr, y = edc[i]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx); return slope < 0 ? -60 / slope : null;
}
export const OCT = [125, 250, 500, 1000, 2000, 4000, 8000];
export function reverb(ir: Float32Array, sr: number) {
  return OCT.map((fm) => { const e = schroeder(bandFilter(ir, sr, fm)); return { fm, edt: decayTime(e, sr, 0, -10), t20: decayTime(e, sr, -5, -25), t30: decayTime(e, sr, -5, -35) }; });
}

// ---------- STI (IEC 60268-16 ed. 4, indirect method from the impulse response) ----------
export const STI_FM = [0.63, 0.8, 1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10, 12.5];
export const STI_ALPHA = [0.085, 0.127, 0.23, 0.233, 0.309, 0.224, 0.173], STI_BETA = [0.085, 0.078, 0.065, 0.011, 0.047, 0.095];
/** STI from an impulse response, with each octave's signal-to-noise ratio (speech level − background noise, dB) if known. */
export function stiFromIr(ir: Float32Array, sr: number, snrDb: number[] = []): { sti: number; mti: number[]; rating: string } {
  const mti = OCT.map((fm, k) => {
    const h = bandFilter(ir, sr, fm), e = Float64Array.from(h, (v) => v * v); const tot = e.reduce((a, b) => a + b, 0) || 1, snr = snrDb[k];
    const ti = STI_FM.map((F) => { let re = 0, im = 0; for (let i = 0; i < e.length; i++) { const w = (2 * Math.PI * F * i) / sr; re += e[i] * Math.cos(w); im -= e[i] * Math.sin(w); }
      let m = Math.hypot(re, im) / tot; if (snr != null && Number.isFinite(snr)) m *= 1 / (1 + 10 ** (-snr / 10)); m = Math.min(0.9999, Math.max(1e-4, m));
      const s = Math.max(-15, Math.min(15, 10 * Math.log10(m / (1 - m)))); return (s + 15) / 30; });
    return ti.reduce((a, b) => a + b, 0) / ti.length;
  });
  let sti = 0; for (let k = 0; k < 7; k++) sti += STI_ALPHA[k] * mti[k]; for (let k = 0; k < 6; k++) sti -= STI_BETA[k] * Math.sqrt(mti[k] * mti[k + 1]);
  sti = Math.max(0, Math.min(1, sti));
  return { sti, mti, rating: sti >= 0.75 ? 'Excellent (A+)' : sti >= 0.6 ? 'Good (B–A)' : sti >= 0.5 ? 'Fair (D–C)' : sti >= 0.45 ? 'Fair, low (E)' : sti >= 0.3 ? 'Poor (F–H)' : 'Bad (I–U)' };
}
/** STI from a reverberation time and SNR (diffuse field, Houtgast & Steeneken): m(F) = 1/√(1+(2πF·T/13.8)²) · 1/(1+10^(−SNR/10)). */
export function stiFromRt(rt: number[], snrDb: number[]): number {
  const mti = OCT.map((_, k) => { const T = rt[k] ?? rt[3] ?? 1, s = snrDb[k] ?? 30; return STI_FM.map((F) => { const m = (1 / Math.sqrt(1 + ((2 * Math.PI * F * T) / 13.8) ** 2)) / (1 + 10 ** (-s / 10)); const x = Math.max(-15, Math.min(15, 10 * Math.log10(m / (1 - m)))); return (x + 15) / 30; }).reduce((a, b) => a + b, 0) / STI_FM.length; });
  let sti = 0; for (let k = 0; k < 7; k++) sti += STI_ALPHA[k] * mti[k]; for (let k = 0; k < 6; k++) sti -= STI_BETA[k] * Math.sqrt(mti[k] * mti[k + 1]); return Math.max(0, Math.min(1, sti));
}

// ---------- distortion and noise ----------
/** THD and THD+N of a tone (fundamental found near f0): harmonics 2–10, and everything except the fundamental (20 Hz–20 kHz). */
export function thd(p: ArrayLike<number>, df: number, f0: number): { thdPct: number; thdnPct: number; fundDb: number } {
  const peakNear = (f: number) => { const k0 = Math.round(f / df); let s = 0; for (let k = Math.max(1, k0 - 3); k <= Math.min(p.length - 1, k0 + 3); k++) s += p[k]; return s; };
  const fund = peakNear(f0); let h = 0; for (let n = 2; n <= 10; n++) if (n * f0 < p.length * df) h += peakNear(n * f0);
  let all = 0; const k0 = Math.round(f0 / df); for (let k = Math.ceil(20 / df); k <= Math.min(p.length - 1, Math.floor(20000 / df)); k++) if (Math.abs(k - k0) > 3) all += p[k];
  return { thdPct: 100 * Math.sqrt(h / fund), thdnPct: 100 * Math.sqrt(all / fund), fundDb: 10 * Math.log10(fund) };
}
/** NC curves (63 Hz–8 kHz octave levels, ANSI S12.2 / Beranek). */
export const NC: [number, number[]][] = [[15, [47, 36, 29, 22, 17, 14, 12, 11]], [20, [51, 40, 33, 26, 22, 19, 17, 16]], [25, [54, 44, 37, 31, 27, 24, 22, 21]], [30, [57, 48, 41, 35, 31, 29, 28, 27]], [35, [60, 52, 45, 40, 36, 34, 33, 32]], [40, [64, 56, 50, 45, 41, 39, 38, 37]], [45, [67, 60, 54, 49, 46, 44, 43, 42]], [50, [71, 64, 58, 54, 51, 49, 48, 47]], [55, [74, 67, 62, 58, 56, 54, 53, 52]], [60, [77, 71, 67, 63, 61, 59, 58, 57]], [65, [80, 75, 71, 68, 66, 64, 63, 62]], [70, [83, 79, 75, 72, 71, 70, 69, 68]]];
/** Lowest NC curve not exceeded by the octave levels (63 Hz–8 kHz). */
export function ncRating(oct8: number[]): number | null { for (const [nc, c] of NC) if (oct8.every((l, i) => l <= c[i])) return nc; return null; }

// ---------- microphone calibration files ----------
/** Reads a mic calibration file (UMIK / miniDSP, Dayton, REW style): optional "Sens Factor =…dB" header, then frequency and dB correction lines. */
export function parseMicCal(text: string): { sensDb: number | null; f: number[]; db: number[] } {
  const s = /sens\s*factor\s*=\s*(-?[\d.]+)\s*dB/i.exec(text); const f: number[] = [], db: number[] = [];
  for (const ln of text.split(/\r?\n/)) { const m = /^\s*([\d.]+(?:e[+-]?\d+)?)\s*[\t ,;]\s*(-?[\d.]+)/i.exec(ln); if (m && +m[1] > 0) { f.push(+m[1]); db.push(+m[2]); } }
  return { sensDb: s ? +s[1] : null, f, db };
}
/** Correction (dB to subtract) at f from a mic cal file, interpolated on a log-frequency axis. */
export function micCorr(cal: { f: number[]; db: number[] } | null, f: number): number {
  if (!cal || !cal.f.length) return 0; if (f <= cal.f[0]) return cal.db[0]; if (f >= cal.f[cal.f.length - 1]) return cal.db[cal.db.length - 1];
  let i = 1; while (cal.f[i] < f) i++; const t = Math.log(f / cal.f[i - 1]) / Math.log(cal.f[i] / cal.f[i - 1]); return cal.db[i - 1] + t * (cal.db[i] - cal.db[i - 1]);
}
