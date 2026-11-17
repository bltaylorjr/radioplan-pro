// Spectrum analyzer maths: FFT and windows for SDR receivers, sweep stitching, trace modes, corrections and
// units, and the measurements a field spectrum analyzer makes: peaks and markers, channel power, occupied
// bandwidth, adjacent-channel power, noise floor, SNR, limit lines, intermodulation of the signals found,
// and the public-safety (ERCES / BDA) checks. Plain TypeScript, tested in Node.

export interface Sweep { f: Float64Array; dbm: Float32Array; at: number; device: string; calibrated: boolean; rbwHz: number }
export type WindowKind = 'hann' | 'blackman-harris' | 'flattop' | 'rect';

// ---------- FFT ----------
/** In-place radix-2 complex FFT (re, im of length 2^n). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length; if (n & (n - 1)) throw new Error('FFT size must be a power of two');
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr; re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}

/** Window coefficients, with coherent gain (amplitude) and equivalent noise bandwidth (bins). */
export function windowOf(kind: WindowKind, n: number): { w: Float64Array; cg: number; enbw: number } {
  const w = new Float64Array(n), c = (a: number[]) => { for (let i = 0; i < n; i++) { const x = (2 * Math.PI * i) / (n - 1); w[i] = a.reduce((s, ak, k) => s + (k % 2 ? -1 : 1) * ak * Math.cos(k * x), 0); } };
  if (kind === 'hann') c([0.5, 0.5]); else if (kind === 'blackman-harris') c([0.35875, 0.48829, 0.14128, 0.01168]); else if (kind === 'flattop') c([0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368]); else w.fill(1);
  let s = 0, s2 = 0; for (const v of w) { s += v; s2 += v * v; }
  return { w, cg: s / n, enbw: (n * s2) / (s * s) };
}

/** Power spectrum (dB, full scale = 0 for a full-scale tone) of complex samples, DC in the middle. Averages `blocks` FFTs. */
export function iqSpectrum(i: Float32Array, q: Float32Array, n: number, kind: WindowKind = 'blackman-harris'): Float32Array {
  const { w, cg } = windowOf(kind, n), blocks = Math.max(1, Math.floor(i.length / n)), acc = new Float64Array(n), re = new Float64Array(n), im = new Float64Array(n);
  for (let b = 0; b < blocks; b++) {
    for (let k = 0; k < n; k++) { re[k] = i[b * n + k] * w[k]; im[k] = q[b * n + k] * w[k]; }
    fft(re, im);
    for (let k = 0; k < n; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  const out = new Float32Array(n), norm = (n * cg) ** 2 * blocks;
  for (let k = 0; k < n; k++) out[(k + n / 2) % n] = 10 * Math.log10(acc[k] / norm + 1e-20);
  return out;
}

/** Unsigned 8-bit IQ (RTL-SDR) or signed 8-bit IQ (HackRF) to floats −1…1. */
export function iq8(buf: ArrayBuffer, signed: boolean): { i: Float32Array; q: Float32Array } {
  const b = signed ? new Int8Array(buf) : new Uint8Array(buf), n = b.length >> 1, i = new Float32Array(n), q = new Float32Array(n);
  for (let k = 0; k < n; k++) { i[k] = signed ? b[2 * k] / 128 : (b[2 * k] - 127.5) / 127.5; q[k] = signed ? b[2 * k + 1] / 128 : (b[2 * k + 1] - 127.5) / 127.5; }
  return { i, q };
}

/** Puts one retuned SDR block into a sweep: keeps the flat middle `use` fraction of the band (edges roll off). */
export function stitch(out: { f: number[]; d: number[] }, centerHz: number, rateHz: number, spec: Float32Array, use = 0.75): void {
  const n = spec.length, bin = rateHz / n, lo = Math.floor((n * (1 - use)) / 2), hi = n - lo;
  for (let k = lo; k < hi; k++) { out.f.push(centerHz + (k - n / 2) * bin); out.d.push(spec[k]); }
}

/** Resamples a trace onto `points` frequencies between start and stop, keeping the peak in each bucket (positive-peak detector). */
export function toPoints(f: ArrayLike<number>, d: ArrayLike<number>, start: number, stop: number, points: number, detector: 'peak' | 'average' | 'sample' = 'peak'): Sweep['dbm'] {
  const out = new Float32Array(points).fill(NaN), step = (stop - start) / Math.max(1, points - 1), sum = new Float64Array(points), cnt = new Uint32Array(points);
  for (let k = 0; k < f.length; k++) {
    const j = Math.round((f[k] - start) / step); if (j < 0 || j >= points) continue;
    if (detector === 'peak') { if (!(out[j] >= d[k])) out[j] = d[k]; } else if (detector === 'sample') { if (!cnt[j]) out[j] = d[k]; cnt[j]++; } else { sum[j] += 10 ** (d[k] / 10); cnt[j]++; }
  }
  if (detector === 'average') for (let j = 0; j < points; j++) out[j] = cnt[j] ? 10 * Math.log10(sum[j] / cnt[j]) : NaN;
  for (let j = 0; j < points; j++) if (Number.isNaN(out[j])) { let a = j - 1; while (a >= 0 && Number.isNaN(out[a])) a--; let b = j + 1; while (b < points && Number.isNaN(out[b])) b++; out[j] = a >= 0 && b < points ? (out[a] + out[b]) / 2 : a >= 0 ? out[a] : b < points ? out[b] : -140; }
  return out;
}
export const freqs = (start: number, stop: number, points: number) => Float64Array.from({ length: points }, (_, j) => start + ((stop - start) * j) / Math.max(1, points - 1));

// ---------- corrections and units ----------
export interface Corrections { calOffsetDb: number; cableLossDb: number; externalAttenDb: number; preampGainDb: number; antennaGainDbi: number; /** dB/m; when set, field strength is shown. */ antennaFactor?: number }
export const NO_CORR: Corrections = { calOffsetDb: 0, cableLossDb: 0, externalAttenDb: 0, preampGainDb: 0, antennaGainDbi: 0 };
/** Power at the antenna port (dBm): reading + calibration + cable loss + attenuator − preamp gain. */
export const corrected = (dbm: number, c: Corrections) => dbm + c.calOffsetDb + c.cableLossDb + c.externalAttenDb - c.preampGainDb;
export type Unit = 'dBm' | 'dBuV' | 'dBuV/m' | 'mW' | 'uV';
/** 50 Ω conversions; field strength E (dBµV/m) = V (dBµV) + antenna factor (dB/m). With only a gain, AF = 20·log10(f MHz) − G(dBi) − 29.79. */
export function toUnit(dbm: number, u: Unit, fHz: number, c: Corrections): number {
  const dbuv = dbm + 107;
  if (u === 'dBm') return dbm; if (u === 'dBuV') return dbuv; if (u === 'mW') return 10 ** (dbm / 10); if (u === 'uV') return 10 ** (dbuv / 20);
  const af = c.antennaFactor ?? 20 * Math.log10(fHz / 1e6) - c.antennaGainDbi - 29.79;
  return dbuv + af;
}

// ---------- trace modes ----------
export type TraceMode = 'clear' | 'average' | 'max' | 'min';
/** Next trace for a mode: clear/write, video average (exponential, n sweeps), max hold, min hold. */
export function traceStep(prev: Float32Array | null, cur: Float32Array, mode: TraceMode, n = 8): Float32Array {
  if (!prev || prev.length !== cur.length || mode === 'clear') return cur.slice();
  const o = new Float32Array(cur.length);
  for (let k = 0; k < cur.length; k++) o[k] = mode === 'max' ? Math.max(prev[k], cur[k]) : mode === 'min' ? Math.min(prev[k], cur[k]) : 10 * Math.log10((10 ** (prev[k] / 10) * (n - 1) + 10 ** (cur[k] / 10)) / n);
  return o;
}

// ---------- measurements ----------
/** Noise floor: the median of the trace (robust against signals). */
export function noiseFloor(d: ArrayLike<number>): number { const a = Array.from(d).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; }
export interface Peak { i: number; f: number; dbm: number }
/** Peaks at least `excess` dB above the noise floor and `minSepHz` apart, strongest first. */
export function findPeaks(f: ArrayLike<number>, d: ArrayLike<number>, excess = 10, minSepHz = 0, max = 20): Peak[] {
  const nf = noiseFloor(d), cand: Peak[] = [];
  for (let k = 1; k < d.length - 1; k++) if (d[k] >= d[k - 1] && d[k] > d[k + 1] && d[k] >= nf + excess) cand.push({ i: k, f: f[k], dbm: d[k] });
  cand.sort((a, b) => b.dbm - a.dbm);
  const out: Peak[] = []; for (const c of cand) { if (out.every((o) => Math.abs(o.f - c.f) >= minSepHz)) out.push(c); if (out.length >= max) break; }
  return out;
}
/** Index of the point nearest a frequency. */
export function nearest(f: ArrayLike<number>, hz: number): number { let b = 0; for (let k = 1; k < f.length; k++) if (Math.abs(f[k] - hz) < Math.abs(f[b] - hz)) b = k; return b; }

/** Total power in a channel (dBm), integrating the trace's power density: each point holds the power in one RBW. */
export function channelPower(f: ArrayLike<number>, d: ArrayLike<number>, centerHz: number, bwHz: number, rbwHz: number): number {
  const lo = centerHz - bwHz / 2, hi = centerHz + bwHz / 2, step = f.length > 1 ? (f[f.length - 1] - f[0]) / (f.length - 1) : rbwHz; let p = 0, n = 0;
  for (let k = 0; k < f.length; k++) if (f[k] >= lo && f[k] <= hi) { p += 10 ** (d[k] / 10); n++; }
  return n ? 10 * Math.log10((p * step) / Math.max(rbwHz, 1e-9)) : NaN;
}
/** Occupied bandwidth: the span holding `pct` % of the power around the strongest point (99 % by default, FCC/ITU). */
export function occupiedBw(f: ArrayLike<number>, d: ArrayLike<number>, pct = 99): { bw: number; lo: number; hi: number } {
  const lin = Array.from(d, (v) => 10 ** (v / 10)), tot = lin.reduce((a, b) => a + b, 0), cut = (tot * (1 - pct / 100)) / 2;
  let a = 0, lo = 0; for (; lo < lin.length && a + lin[lo] < cut; lo++) a += lin[lo];
  let b = 0, hi = lin.length - 1; for (; hi > 0 && b + lin[hi] < cut; hi--) b += lin[hi];
  return { bw: f[hi] - f[lo], lo: f[lo], hi: f[hi] };
}
/** Adjacent-channel power ratio: power in the channels either side relative to the main channel (dBc). */
export function acpr(f: ArrayLike<number>, d: ArrayLike<number>, centerHz: number, bwHz: number, spacingHz: number, rbwHz: number) {
  const main = channelPower(f, d, centerHz, bwHz, rbwHz);
  return { main, lower: channelPower(f, d, centerHz - spacingHz, bwHz, rbwHz) - main, upper: channelPower(f, d, centerHz + spacingHz, bwHz, rbwHz) - main };
}
export interface LimitPoint { f: number; dbm: number }
/** Pass/fail against a limit line (stepped between points). Returns the worst margin and the failing points. */
export function checkLimit(f: ArrayLike<number>, d: ArrayLike<number>, line: LimitPoint[], kind: 'upper' | 'lower' = 'upper') {
  const L = [...line].sort((a, b) => a.f - b.f); let worst = Infinity, at = NaN; const fails: number[] = [];
  for (let k = 0; k < f.length; k++) {
    if (!L.length || f[k] < L[0].f || f[k] > L[L.length - 1].f) continue;
    let j = 0; while (j < L.length - 1 && L[j + 1].f <= f[k]) j++;
    const lim = j < L.length - 1 && L[j + 1].f > L[j].f ? L[j].dbm + ((L[j + 1].dbm - L[j].dbm) * (f[k] - L[j].f)) / (L[j + 1].f - L[j].f) : L[j].dbm;
    const m = kind === 'upper' ? lim - d[k] : d[k] - lim; if (m < worst) { worst = m; at = f[k]; } if (m < 0) fails.push(k);
  }
  return { pass: fails.length === 0, worstMarginDb: worst, worstAtHz: at, failCount: fails.length };
}
/** Third- and fifth-order intermodulation products of the signals found that land on another signal or a listed frequency. */
export function intermodHits(sig: number[], watch: number[], tolHz: number) {
  const out: { order: 3 | 5; f: number; from: string; hits: number }[] = [];
  for (let a = 0; a < sig.length; a++) for (let b = 0; b < sig.length; b++) {
    if (a === b) continue;
    for (const [order, f] of [[3, 2 * sig[a] - sig[b]], [5, 3 * sig[a] - 2 * sig[b]]] as [3 | 5, number][]) {
      const hit = watch.find((w) => Math.abs(w - f) <= tolHz); if (hit != null) out.push({ order, f, from: `${order === 3 ? 2 : 3}×${(sig[a] / 1e6).toFixed(4)} − ${order === 3 ? 1 : 2}×${(sig[b] / 1e6).toFixed(4)} MHz`, hits: hit });
    }
  }
  return out;
}
/** Signal-to-noise of a peak against the floor (dB). */
export const snr = (peakDbm: number, floorDbm: number) => peakDbm - floorDbm;
/** Displayed average noise level for a receiver with a noise figure, at an RBW: −174 + 10·log10(RBW) + NF. */
export const danl = (rbwHz: number, nfDb: number) => -174 + 10 * Math.log10(rbwHz) + nfDb;

// ---------- presets and tests ----------
export interface BandPreset { id: string; label: string; start: number; stop: number; chBw: number; spacing: number; note: string }
export const PRESETS: BandPreset[] = [
  { id: 'vhf', label: 'VHF public safety / business 150–174 MHz', start: 150e6, stop: 174e6, chBw: 12.5e3, spacing: 12.5e3, note: 'Part 90 narrowband channels.' },
  { id: 'uhf', label: 'UHF 450–470 MHz', start: 450e6, stop: 470e6, chBw: 12.5e3, spacing: 12.5e3, note: 'Part 90 narrowband; repeater inputs +5 MHz.' },
  { id: 'ps700', label: '700 MHz public safety 769–775 / 799–805 MHz', start: 768e6, stop: 806e6, chBw: 12.5e3, spacing: 12.5e3, note: 'Downlink 769–775, uplink 799–805 MHz (narrowband).' },
  { id: 'ps800', label: '800 MHz public safety 806–824 / 851–869 MHz', start: 805e6, stop: 870e6, chBw: 12.5e3, spacing: 25e3, note: 'Uplink 806–824, downlink 851–869 MHz (NPSPAC 821–824 / 866–869).' },
  { id: 'fn14', label: 'FirstNet / LTE Band 14 758–768 / 788–798 MHz', start: 755e6, stop: 800e6, chBw: 10e6, spacing: 10e6, note: '10 MHz LTE carriers.' },
  { id: 'wifi24', label: 'Wi-Fi 2.4 GHz', start: 2.4e9, stop: 2.4835e9, chBw: 20e6, spacing: 5e6, note: 'Channels 1, 6, 11 do not overlap.' },
  { id: 'wifi5', label: 'Wi-Fi 5 GHz', start: 5.15e9, stop: 5.85e9, chBw: 20e6, spacing: 20e6, note: 'UNII-1 to UNII-3.' },
  { id: 'fm', label: 'FM broadcast 88–108 MHz (test signal)', start: 88e6, stop: 108e6, chBw: 200e3, spacing: 200e3, note: 'Strong, known stations: good for checking the analyzer.' },
];
