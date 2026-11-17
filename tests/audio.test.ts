import { describe, it, expect } from 'vitest';
import { aWeight, cWeight, bands, powerSpectrum, bandLevels, totalLevel, stats, timeWeighted, essSweep, impulseResponse, reverb, stiFromIr, stiFromRt, thd, ncRating, parseMicCal, micCorr, schroeder, decayTime } from '../src/engine/audio';
import { maskAttenDb, checkMask, gradeRf, nfpaAudibility, stiAcceptance, gradeAudio, overall } from '../src/engine/certification';

const SR = 48000;
const tone = (f: number, a: number, n: number) => Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / SR));
/** Synthetic room: exponentially decaying noise with RT60 = T. */
function room(T: number, len = 2.5): Float32Array { let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5); return Float32Array.from({ length: Math.round(len * SR) }, (_, i) => (i === 0 ? 1 : 0.3 * r() * Math.exp((-6.91 * i) / (T * SR)))); }

describe('audio analyzer maths', () => {
  it('weightings match IEC 61672 table values', () => {
    expect(aWeight(1000)).toBeCloseTo(0, 1); expect(aWeight(100)).toBeCloseTo(-19.1, 0); expect(aWeight(10000)).toBeCloseTo(-2.5, 0);
    expect(cWeight(1000)).toBeCloseTo(0, 1); expect(cWeight(31.5)).toBeCloseTo(-3.0, 0);
    expect(bands(false).map((b) => b.label)).toContain('1k'); expect(bands(true).length).toBeGreaterThan(28);
  });
  it('reads a 1 kHz tone level in its band and as a total', () => {
    const x = tone(1000, 1, 8192), { p, df } = powerSpectrum(x); const d = df(SR);
    expect(totalLevel(p, d, 'Z')).toBeCloseTo(-3, 0); // full-scale sine = −3 dBFS RMS
    const b = bandLevels(p, d, false).find((q) => q.label === '1k')!; expect(b.db).toBeCloseTo(-3, 0);
    const t = thd(p, d, 1000); expect(t.thdPct).toBeLessThan(0.05);
    const y = Float32Array.from(x, (v, i) => v + 0.01 * Math.sin((2 * Math.PI * 3000 * i) / SR)); const r = powerSpectrum(y); expect(thd(r.p, d, 1000).thdPct).toBeCloseTo(1, 0);
  });
  it('statistics and time weighting', () => {
    const s = stats([60, 60, 70, 80])!; expect(s.lmax).toBe(80); expect(s.leq).toBeCloseTo(74.7, 0);
    const tw = timeWeighted(Array(80).fill(90), 0.0125, 0.125); expect(tw[79]).toBeCloseTo(90, 1);
  });
  it('measures RT60 of a synthetic room and gives a matching STI', () => {
    const ir = room(1.2), rv = reverb(ir, SR); const t30 = rv.find((r) => r.fm === 1000)!.t30!;
    expect(t30).toBeGreaterThan(1.0); expect(t30).toBeLessThan(1.45);
    const e = schroeder(ir); expect(decayTime(e, SR, -5, -25)).toBeGreaterThan(1.0);
    const sti = stiFromIr(ir, SR).sti, ref = stiFromRt(Array(7).fill(1.2), Array(7).fill(60));
    expect(Math.abs(sti - ref)).toBeLessThan(0.08); expect(ref).toBeGreaterThan(0.4); expect(ref).toBeLessThan(0.65);
    expect(stiFromRt(Array(7).fill(0.4), Array(7).fill(30))).toBeGreaterThan(0.7);
  });
  it('recovers an impulse response from a sine sweep', () => {
    const { sweep, inverse } = essSweep(50, 16000, 1, SR); const rec = new Float32Array(sweep.length + 4800); rec.set(sweep, 2400); for (let i = 0; i < sweep.length; i++) rec[i + 2400 + 960] += 0.5 * sweep[i];
    const ir = impulseResponse(rec, inverse, SR, 0.1); expect(Math.abs(ir[Math.round(0.002 * SR)])).toBeCloseTo(1, 1);
    expect(Math.abs(ir[Math.round(0.002 * SR) + 960])).toBeGreaterThan(0.3);
  }, 20000);
  it('NC rating and mic calibration files', () => {
    expect(ncRating([50, 42, 35, 30, 26, 22, 20, 18])).toBe(25); expect(ncRating([90, 90, 90, 90, 90, 90, 90, 90])).toBeNull();
    const c = parseMicCal('"Sens Factor =-1.378dB, SERNO: 7000000"\n20.0\t-1.2\n1000\t0.0\n10000\t2.0\n'); expect(c.sensDb).toBeCloseTo(-1.378); expect(micCorr(c, 1000)).toBe(0); expect(micCorr(c, 3162)).toBeCloseTo(1, 1);
  });
});

describe('certification rules', () => {
  it('FCC 90.210 masks', () => {
    expect(maskAttenDb('D', 3000, 50)).toBe(0); expect(maskAttenDb('D', 10000, 50)).toBeCloseTo(7.27 * 7.12, 2); expect(maskAttenDb('D', 20000, 50)).toBe(66.98970004336019 > 70 ? 70 : 50 + 10 * Math.log10(50));
    expect(maskAttenDb('B', 15000, 1)).toBe(25); expect(maskAttenDb('B', 30000, 1)).toBe(35); expect(maskAttenDb('B', 60000, 100)).toBe(63);
    const f = Float64Array.from({ length: 101 }, (_, k) => 851e6 - 25e3 + k * 500), d = Float32Array.from(f, (x) => (Math.abs(x - 851e6) < 4000 ? 30 : -50));
    expect(checkMask(f, d, 851e6, 30, 'D', 50).pass).toBe(true); d[90] = 0; expect(checkMask(f, d, 851e6, 30, 'D', 50).pass).toBe(false);
  });
  it('grades RF receivers, NFPA 72 audibility, STI acceptance and audio chains', () => {
    expect(gradeRf({ levelErrorsDb: [0.4, -0.9], freqErrorPpm: 0.5, danlDbmHz: -160, sweepMHzPerS: 100, dynamicRangeDb: 60, linearityErrDb: 0.3, calibratedDaysAgo: 30 }).grade).toBe('Measurement grade');
    expect(gradeRf({ levelErrorsDb: [], freqErrorPpm: null, danlDbmHz: null, sweepMHzPerS: null, dynamicRangeDb: null, linearityErrDb: null, calibratedDaysAgo: null }).grade).toBe('Indicative only');
    const a = nfpaAudibility({ mode: 'public', ambientAvgDba: 55, ambientMax60sDba: 62, signalDba: 72 }); expect(a[0].pass).toBe(true); expect(nfpaAudibility({ mode: 'public', ambientAvgDba: 60, ambientMax60sDba: 62, signalDba: 72 })[0].pass).toBe(false);
    expect(overall(stiAcceptance([0.55, 0.52, 0.48, 0.6]))).toBe(true); expect(overall(stiAcceptance([0.55, 0.42, 0.44, 0.6]))).toBe(false);
    expect(gradeAudio({ calDeviationDb: 0.2, calStabilityDb: 0.05, selfNoiseDba: 25, micCalFile: true, processingOff: true, sampleRate: 48000, latencyMs: 10, loopbackFlatnessDb: null, loopbackThdPct: null }).grade).toBe('Class 1 tolerances met');
  });
});
