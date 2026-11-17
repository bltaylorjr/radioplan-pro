// Benchmarks and certification-level tests for the RF spectrum analyzer and the audio analyzer: the pass /
// fail rules from the cited standards, grading of the measuring chain, and the test records that become
// signed reports (Reports → Certification test reports). The rules cite where they come from; the adopted
// code edition and the AHJ decide what applies on a job.

export interface CertItem { item: string; requirement: string; measured: string; pass: boolean | null }
export interface CertRecord {
  id: string; kind: 'rf' | 'audio'; title: string; standard: string; at: string; tech: string; location: string;
  equipment: { name: string; serial?: string; calibrated?: string; grade?: string }[];
  items: CertItem[]; pass: boolean | null; notes: string;
}
export const overall = (items: CertItem[]): boolean | null => (items.some((i) => i.pass === false) ? false : items.every((i) => i.pass === true) ? true : null);

// ---------- RF: FCC Part 90 emission masks (47 CFR 90.210) ----------
export type MaskId = 'B' | 'D';
/** Required attenuation (dB below the unmodulated carrier) at `fdHz` from the center, for transmitter power `pW` watts.
 *  Mask B (25 kHz channels): 25 dB at 50–100 % of the authorized bandwidth (20 kHz), 35 dB at 100–250 %, beyond 250 %: 43 + 10·log10(P).
 *  Mask D (12.5 kHz channels): 0 dB to 5.625 kHz, 7.27·(fd − 2.88 kHz) dB to 12.5 kHz, beyond: the lesser of 50 + 10·log10(P) or 70 dB. */
export function maskAttenDb(mask: MaskId, fdHz: number, pW: number): number {
  const fd = Math.abs(fdHz), p = Math.max(1e-3, pW);
  if (mask === 'D') { if (fd <= 5625) return 0; if (fd <= 12500) return 7.27 * (fd / 1000 - 2.88); return Math.min(50 + 10 * Math.log10(p), 70); }
  const B = 20000; if (fd <= 0.5 * B) return 0; if (fd <= B) return 25; if (fd <= 2.5 * B) return 35; return 43 + 10 * Math.log10(p);
}
/** Checks a trace against a mask around the carrier at `fcHz` whose level is `carrierDbm`. */
export function checkMask(f: ArrayLike<number>, d: ArrayLike<number>, fcHz: number, carrierDbm: number, mask: MaskId, pW: number, spanHz = 50e3) {
  let worst = Infinity, at = NaN, fails = 0;
  for (let k = 0; k < f.length; k++) { const fd = f[k] - fcHz; if (Math.abs(fd) > spanHz) continue; const lim = carrierDbm - maskAttenDb(mask, fd, pW), m = lim - d[k]; if (Math.abs(fd) > (mask === 'D' ? 5625 : 10000) && m < worst) { worst = m; at = f[k]; } if (m < 0 && Math.abs(fd) > (mask === 'D' ? 5625 : 10000)) fails++; }
  return { pass: fails === 0, worstMarginDb: worst, worstAtHz: at, fails };
}

// ---------- RF: receiver benchmark grading ----------
export interface RfBench { levelErrorsDb: number[]; freqErrorPpm: number | null; danlDbmHz: number | null; sweepMHzPerS: number | null; dynamicRangeDb: number | null; linearityErrDb: number | null; calibratedDaysAgo: number | null }
export function gradeRf(b: RfBench): { grade: 'Measurement grade' | 'Survey grade' | 'Indicative only'; items: CertItem[] } {
  const maxLvl = b.levelErrorsDb.length ? Math.max(...b.levelErrorsDb.map(Math.abs)) : null;
  const items: CertItem[] = [
    { item: 'Level accuracy (all checked points)', requirement: '≤ ±1.5 dB measurement · ≤ ±3 dB survey', measured: maxLvl == null ? 'not checked' : `±${maxLvl.toFixed(2)} dB (${b.levelErrorsDb.length} points)`, pass: maxLvl == null ? null : maxLvl <= 3 },
    { item: 'Frequency accuracy', requirement: '≤ 2 ppm', measured: b.freqErrorPpm == null ? 'not checked' : `${b.freqErrorPpm.toFixed(2)} ppm`, pass: b.freqErrorPpm == null ? null : Math.abs(b.freqErrorPpm) <= 2 },
    { item: 'Displayed average noise level', requirement: '≤ −150 dBm/Hz (to measure −95 dBm signals with margin)', measured: b.danlDbmHz == null ? 'not checked' : `${b.danlDbmHz.toFixed(1)} dBm/Hz`, pass: b.danlDbmHz == null ? null : b.danlDbmHz <= -150 },
    { item: 'Spurious-free dynamic range', requirement: '≥ 50 dB', measured: b.dynamicRangeDb == null ? 'not checked' : `${b.dynamicRangeDb.toFixed(1)} dB`, pass: b.dynamicRangeDb == null ? null : b.dynamicRangeDb >= 50 },
    { item: 'Linearity (10 dB attenuator steps)', requirement: '≤ ±1 dB per step', measured: b.linearityErrDb == null ? 'not checked' : `±${b.linearityErrDb.toFixed(2)} dB`, pass: b.linearityErrDb == null ? null : b.linearityErrDb <= 1 },
    { item: 'Calibration current', requirement: 'within 12 months', measured: b.calibratedDaysAgo == null ? 'not calibrated' : `${Math.round(b.calibratedDaysAgo)} days ago`, pass: b.calibratedDaysAgo == null ? false : b.calibratedDaysAgo <= 365 },
    { item: 'Sweep speed', requirement: 'information', measured: b.sweepMHzPerS == null ? '—' : `${b.sweepMHzPerS.toFixed(1)} MHz/s`, pass: null },
  ];
  const meas = maxLvl != null && maxLvl <= 1.5 && b.freqErrorPpm != null && Math.abs(b.freqErrorPpm) <= 2 && b.calibratedDaysAgo != null && b.calibratedDaysAgo <= 365 && (b.danlDbmHz == null || b.danlDbmHz <= -150);
  const survey = maxLvl != null && maxLvl <= 3 && b.calibratedDaysAgo != null;
  return { grade: meas ? 'Measurement grade' : survey ? 'Survey grade' : 'Indicative only', items };
}

/** ERCES acceptance (IFC 510.4.1.1 / NFPA 1225): signal at or above the minimum in the required share of general and critical areas. */
export function ercesItems(r: { n: number; pct: number; critN: number; critPct: number; floors: { floor: string; pct: number }[] }, minDbm: number, general: number, critical: number): CertItem[] {
  return [
    { item: `General areas: ≥ ${minDbm} dBm`, requirement: `≥ ${general} % of grid cells on each floor`, measured: r.n ? `${r.pct} % of ${r.n} (worst floor ${Math.min(...r.floors.map((f) => (Number.isFinite(f.pct) ? f.pct : 100)))} %)` : 'no readings', pass: r.n ? r.floors.every((f) => !Number.isFinite(f.pct) || f.pct >= general) : null },
    { item: `Critical areas: ≥ ${minDbm} dBm`, requirement: `≥ ${critical} %`, measured: r.critN ? `${r.critPct} % of ${r.critN}` : 'no readings', pass: r.critN ? r.critPct >= critical : null },
  ];
}

// ---------- audio ----------
/** NFPA 72 (2022) 18.4.3–18.4.6 audible signals. */
export function nfpaAudibility(o: { mode: 'public' | 'private' | 'sleeping'; ambientAvgDba: number; ambientMax60sDba: number; signalDba: number }): CertItem[] {
  const above = o.mode === 'private' ? 10 : 15, need = Math.max(o.ambientAvgDba + above, o.ambientMax60sDba + 5, o.mode === 'sleeping' ? 75 : 0);
  return [
    { item: `Signal level (${o.mode} mode)`, requirement: `≥ ${need.toFixed(0)} dBA (${above} dB over average ambient ${o.ambientAvgDba.toFixed(0)}, or 5 dB over max ${o.ambientMax60sDba.toFixed(0)}${o.mode === 'sleeping' ? ', or 75 dBA at the pillow' : ''})`, measured: `${o.signalDba.toFixed(1)} dBA`, pass: o.signalDba >= need },
    { item: 'Maximum level', requirement: '≤ 110 dBA at the minimum hearing distance', measured: `${o.signalDba.toFixed(1)} dBA`, pass: o.signalDba <= 110 },
  ];
}
/** NFPA 72 Annex D intelligibility: in each acoustically distinguishable space, average STI ≥ 0.50 and at least 90 % of points ≥ 0.45. */
export function stiAcceptance(points: number[]): CertItem[] {
  const avg = points.reduce((a, b) => a + b, 0) / Math.max(1, points.length), share = points.length ? (100 * points.filter((x) => x >= 0.45).length) / points.length : 0;
  return [
    { item: 'Average STI in the space', requirement: '≥ 0.50', measured: points.length ? avg.toFixed(2) : 'no points', pass: points.length ? avg >= 0.5 : null },
    { item: 'Points with STI ≥ 0.45', requirement: '≥ 90 %', measured: points.length ? `${share.toFixed(0)} % of ${points.length}` : 'no points', pass: points.length ? share >= 90 : null },
  ];
}
export interface AudioBench { calDeviationDb: number | null; calStabilityDb: number | null; selfNoiseDba: number | null; micCalFile: boolean; processingOff: boolean; sampleRate: number; latencyMs: number | null; loopbackFlatnessDb: number | null; loopbackThdPct: number | null }
/** Verification of the measuring chain against IEC 61672-1 tolerances (indicative: a type-approved meter is still needed for legal certification). */
export function gradeAudio(b: AudioBench): { grade: 'Class 1 tolerances met' | 'Class 2 tolerances met' | 'Indicative only'; items: CertItem[] } {
  const items: CertItem[] = [
    { item: 'Calibrator check at 1 kHz', requirement: 'within ±0.7 dB (Class 1) / ±1.0 dB (Class 2) after calibration', measured: b.calDeviationDb == null ? 'not checked' : `${b.calDeviationDb >= 0 ? '+' : ''}${b.calDeviationDb.toFixed(2)} dB`, pass: b.calDeviationDb == null ? null : Math.abs(b.calDeviationDb) <= 1 },
    { item: 'Reading stability (10 s on the calibrator)', requirement: '≤ 0.1 dB standard deviation', measured: b.calStabilityDb == null ? 'not checked' : `${b.calStabilityDb.toFixed(2)} dB`, pass: b.calStabilityDb == null ? null : b.calStabilityDb <= 0.1 },
    { item: 'Self-noise (quiet room, A-weighted)', requirement: '≤ 30 dBA for room acoustics and background noise', measured: b.selfNoiseDba == null ? 'not checked' : `${b.selfNoiseDba.toFixed(1)} dBA`, pass: b.selfNoiseDba == null ? null : b.selfNoiseDba <= 30 },
    { item: 'Microphone calibration file', requirement: 'loaded (frequency response correction)', measured: b.micCalFile ? 'loaded' : 'none', pass: b.micCalFile },
    { item: 'Echo cancellation, noise suppression, auto gain', requirement: 'off', measured: b.processingOff ? 'off' : 'on (phone or browser processing)', pass: b.processingOff },
    { item: 'Sample rate', requirement: '≥ 44.1 kHz (20 kHz bandwidth)', measured: `${b.sampleRate} Hz`, pass: b.sampleRate >= 44100 },
    { item: 'Loopback flatness 50 Hz–16 kHz', requirement: '≤ ±0.5 dB (interface)', measured: b.loopbackFlatnessDb == null ? 'not checked' : `±${b.loopbackFlatnessDb.toFixed(2)} dB`, pass: b.loopbackFlatnessDb == null ? null : b.loopbackFlatnessDb <= 0.5 },
    { item: 'Loopback THD at 1 kHz', requirement: '≤ 0.1 %', measured: b.loopbackThdPct == null ? 'not checked' : `${b.loopbackThdPct.toFixed(3)} %`, pass: b.loopbackThdPct == null ? null : b.loopbackThdPct <= 0.1 },
    { item: 'Latency', requirement: 'information', measured: b.latencyMs == null ? '—' : `${b.latencyMs.toFixed(1)} ms`, pass: null },
  ];
  const ok = (x: boolean | null) => x === true;
  const c2 = ok(items[0].pass) && ok(items[3].pass) && ok(items[4].pass) && ok(items[5].pass);
  const c1 = c2 && b.calDeviationDb != null && Math.abs(b.calDeviationDb) <= 0.7 && ok(items[1].pass) && ok(items[2].pass);
  return { grade: c1 ? 'Class 1 tolerances met' : c2 ? 'Class 2 tolerances met' : 'Indicative only', items };
}
