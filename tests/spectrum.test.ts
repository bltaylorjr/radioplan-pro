import { describe, it, expect } from 'vitest';
import { fft, windowOf, iqSpectrum, toPoints, freqs, channelPower, occupiedBw, acpr, checkLimit, intermodHits, findPeaks, noiseFloor, toUnit, NO_CORR, corrected, traceStep, danl } from '../src/engine/spectrum';
import { simSweep, parseSweepFile, parseTinyScan, RECEIVERS } from '../src/engine/sdr';

describe('spectrum analyzer maths', () => {
  it('FFT finds a tone at the right bin and level', () => {
    const n = 1024, i = new Float32Array(n * 4), q = new Float32Array(n * 4), k0 = 100;
    for (let t = 0; t < i.length; t++) { i[t] = 0.5 * Math.cos((2 * Math.PI * k0 * t) / n); q[t] = 0.5 * Math.sin((2 * Math.PI * k0 * t) / n); }
    const s = iqSpectrum(i, q, n, 'flattop'); let b = 0; for (let k = 1; k < n; k++) if (s[k] > s[b]) b = k;
    expect(b).toBe(n / 2 + k0); expect(s[b]).toBeCloseTo(20 * Math.log10(0.5), 0); // −6 dBFS, flat-top keeps amplitude
    const re = Float64Array.from([1, 0, 0, 0]), im = new Float64Array(4); fft(re, im); expect(Array.from(re)).toEqual([1, 1, 1, 1]);
    expect(windowOf('hann', 4096).enbw).toBeCloseTo(1.5, 2); expect(windowOf('blackman-harris', 4096).enbw).toBeCloseTo(2.0, 1);
  });
  it('measures channel power, occupied bandwidth, ACPR and limits', () => {
    const f = freqs(0, 100e3, 101), d = new Float32Array(101).fill(-120); for (let k = 45; k <= 55; k++) d[k] = -60; // 11 points of −60 dBm per 1 kHz RBW
    expect(channelPower(f, d, 50e3, 10e3, 1e3)).toBeCloseTo(-60 + 10 * Math.log10(11), 1);
    const o = occupiedBw(f, d); expect(o.bw).toBeGreaterThanOrEqual(9e3); expect(o.bw).toBeLessThanOrEqual(11e3);
    expect(acpr(f, d, 50e3, 10e3, 20e3, 1e3).upper).toBeLessThan(-55);
    expect(checkLimit(f, d, [{ f: 0, dbm: -70 }, { f: 100e3, dbm: -70 }]).pass).toBe(false);
    expect(checkLimit(f, d, [{ f: 0, dbm: -50 }, { f: 100e3, dbm: -50 }]).worstMarginDb).toBeCloseTo(10);
    expect(noiseFloor(d)).toBe(-120); expect(findPeaks(f, d, 20).length).toBeGreaterThan(0);
  });
  it('finds the intermod product in the test signals', () => {
    const sw = simSweep({ start: 849e6, stop: 853e6, points: 4001, rbwHz: 1e3 });
    const pk = findPeaks(sw.f, sw.dbm, 15, 20e3).map((p) => p.f);
    const im = intermodHits(pk.filter((x) => Math.abs(x - 850.0125e6) > 5e3), pk, 2e3);
    expect(im.some((x) => Math.abs(x.f - 850.0125e6) < 2e3 && x.order === 3)).toBe(true);
  });
  it('converts units and applies corrections', () => {
    expect(toUnit(-60, 'dBuV', 1e8, NO_CORR)).toBe(47);
    expect(toUnit(-60, 'dBuV/m', 100e6, { ...NO_CORR, antennaGainDbi: 0 })).toBeCloseTo(47 + 40 - 29.79, 2);
    expect(corrected(-80, { ...NO_CORR, cableLossDb: 3, calOffsetDb: 1.5 })).toBe(-75.5);
    expect(danl(10e3, 7)).toBeCloseTo(-127, 0);
    const a = Float32Array.from([-80, -90]), b = Float32Array.from([-85, -70]);
    expect(Array.from(traceStep(a, b, 'max'))).toEqual([-80, -70]); expect(Array.from(traceStep(a, b, 'min'))).toEqual([-85, -90]);
  });
  it('reads rtl_power / hackrf_sweep CSV, generic CSV and tinySA scan output', () => {
    const csv = '2026-11-16, 22:01:01, 88000000, 90000000, 500000.00, 100, -40.1, -42.5, -39.9, -44.0\n2026-11-16, 22:01:01, 90000000, 92000000, 500000.00, 100, -50, -51, -52, -53\n2026-11-16, 22:01:05, 88000000, 90000000, 500000.00, 100, -41, -42, -43, -44';
    const r = parseSweepFile(csv, 'rtl_power.csv'); expect(r.sweeps.length).toBe(2); expect(r.sweeps[0].f.length).toBe(8); expect(r.sweeps[0].f[0]).toBe(88.25e6);
    const g = parseSweepFile('Frequency (MHz),Level (dBm)\n850.0,-90\n851.0,-60\n852.0,-91', 'trace.csv'); expect(g.sweeps[0].f[1]).toBe(851e6);
    const t = parseTinyScan('scan 1 2 3 3\r\n100000000 -80.5\r\n101000000 -70.25\r\n'); expect(t.f).toEqual([1e8, 1.01e8]); expect(t.d[1]).toBe(-70.25);
    const p = toPoints(Float64Array.from([1, 2, 3, 4]), Float32Array.from([-10, -5, -20, -1]), 1, 4, 2); expect(Array.from(p)).toEqual([-5, -1]);
  });
  it('lists receivers with live support and USB ids', () => {
    for (const id of ['tinysa-ultra', 'rtlsdr', 'hackrf', 'sim']) expect(RECEIVERS.find((r) => r.id === id)?.live).toBe(true);
    expect(RECEIVERS.find((r) => r.id === 'hackrf')!.usb![0]).toEqual({ vendorId: 0x1d50, productId: 0x6089 });
  });
});
describe('test signals', () => {
  it('give the stated channel power, so the self-test can pass', () => {
    const sw = simSweep({ start: 849e6, stop: 853e6, points: 4001, rbwHz: 1e3 });
    expect(channelPower(sw.f, sw.dbm, 851.0125e6, 12.5e3, sw.rbwHz)).toBeCloseTo(-66, 0);
  });
});
