import { describe, it, expect } from 'vitest';
import { lvCalc, runCalc } from '../src/data/lvcalcs';
import { aWeightDb, spectrumLevelDb } from '../src/components/SoundTools';

const val = (o: { label: string; value: string }[], l: string) => parseFloat(o.find((x) => x.label.startsWith(l))!.value.replace(/,/g, ''));

describe('sound and audio tools', () => {
  it('A-weighting is 0 dB at 1 kHz and strongly negative at 50 Hz', () => {
    expect(aWeightDb(1000)).toBeCloseTo(0, 1); expect(aWeightDb(50)).toBeCloseTo(-30.2, 0); expect(aWeightDb(4000)).toBeCloseTo(1.0, 0);
  });
  it('spectrum level sums bin powers', () => {
    const bins = new Float32Array(1024).fill(-200); bins[100] = -20; bins[200] = -20;
    expect(spectrumLevelDb(bins, 48000, false)).toBeCloseTo(-20 + 10 * Math.log10(2), 1);
  });
  it('amplifier sizing adds headroom and picks a standard size', () => {
    const o = runCalc(lvCalc('amp-size')!, { n: 40, tap: 1, head: 25, zones: 1 });
    expect(val(o, 'Amplifier power needed')).toBe(50); expect(o.find((x) => x.label.startsWith('Suggested'))!.value).toBe('60 W');
  });
  it('speaker wire: 60 W on 70 V allows long #16 runs, 8 Ω does not', () => {
    const hi = runCalc(lvCalc('spk-wire')!, { taps: 60, v: 70.7, loss: 0.5 }), lo = runCalc(lvCalc('spk-wire')!, { taps: 60, v: 0, loss: 0.5 });
    expect(val(hi, '#16')).toBeGreaterThan(500); expect(val(lo, '#16')).toBeLessThan(80);
  });
  it('RT60 by Sabine', () => {
    const o = runCalc(lvCalc('rt60')!, { l: 100, w: 80, h: 24, a: 0.1 });
    expect(val(o, 'RT60')).toBeCloseTo(0.049 * 192000 / (2 * (8000 + 2400 + 1920) * 0.1), 1);
  });
  it('STI drops with distance and reverberation', () => {
    const near = runCalc(lvCalc('sti')!, { d: 10, t: 1, v: 190000, q: 5, n: 1 }), far = runCalc(lvCalc('sti')!, { d: 120, t: 2.5, v: 190000, q: 5, n: 2 });
    expect(val(near, 'Estimated STI')).toBeGreaterThan(0.6); expect(val(far, 'Estimated STI')).toBeLessThan(0.5);
  });
  it('dB sum, delay, series-parallel and level conversions', () => {
    expect(val(runCalc(lvCalc('db-sum')!, { a: 85, b: 85, c: 0, d1: 10, d2: 20 }), 'Combined')).toBeCloseTo(88, 0);
    expect(val(runCalc(lvCalc('spk-delay')!, { main: 90, fill: 20, haas: 10, temp: 70 }), 'Set the fill')).toBeCloseTo(70 / 1129 * 1000 + 10, 0);
    expect(val(runCalc(lvCalc('lo-z')!, { z: 8, n: 4, how: 3, min: 4 }), 'Load')).toBe(8);
    expect(val(runCalc(lvCalc('audio-level')!, { v: 1.228, ohm: 8 }), 'dBu')).toBeCloseTo(4, 1);
    expect(val(runCalc(lvCalc('horn-range')!, { spl: 120, amb: 60, over: 10 }), 'Usable reach')).toBeGreaterThan(300);
  });
});
