import { describe, it, expect } from 'vitest';
import { parseCalText, validateCal, calAt, applyCal, BUILTIN_CALS, matchDevice, searchCals, calFromFile, guessMic } from '../src/engine/miccal';

describe('mic calibration library', () => {
  it('reads a miniDSP UMIK file with Sens Factor and serial', () => {
    const t = '"Sens Factor =-1.378dB, SERNO: 7012345"\n10.054\t-3.1\n20.0\t-1.2\n100\t-0.1\n1000\t0.0\n5000\t0.5\n10000\t2.0\n20000\t1.0\n';
    const p = parseCalText(t); expect(p.sensDb).toBeCloseTo(-1.378); expect(p.serial).toBe('7012345'); expect(p.f.length).toBe(7);
    const c = calFromFile('7012345_90deg.txt', t); expect(c.brand).toBe('miniDSP'); expect(c.model).toBe('UMIK-1'); expect(c.note).toMatch(/90/); expect(c.source).toBe('file');
  });
  it('reads .frd with phase, comma CSV with header, REW Sensitivity header', () => {
    const frd = '* Dayton EMM-6 cal\n* Freq dB Phase\n20 -0.5 3.1\n100 0 0\n1000 0 0\n5000 0.4 -2\n10000 1.2 -5\n20000 0.8 -9\n';
    const p = parseCalText(frd); expect(p.phase).toBe(true); expect(p.f).toEqual([20, 100, 1000, 5000, 10000, 20000]);
    const csv = 'Frequency,dB\n20, -1\n200, 0\n1000, 0\n4000, 1\n8000, 2\n';
    expect(parseCalText(csv).f.length).toBe(5);
    expect(parseCalText('Sensitivity -12.34 dBFS\n20 0\n').sensDb).toBeCloseTo(-12.34);
    expect(guessMic('EMM-6 1234567.frd').model).toBe('EMM-6');
  });
  it('rejects files that are not mic calibrations, in plain language', () => {
    expect(validateCal({ f: [], db: [] })).toMatch(/no frequency/i);
    expect(validateCal({ f: [1000, 2000, 3000, 4000, 4500], db: [0, 0, 0, 0, 0] })).toMatch(/only covers/);
    expect(validateCal({ f: [20, 100, 1000, 5000, 20000], db: [0, 0, 60, 0, 0] })).toMatch(/40 dB/);
    expect(() => calFromFile('x.txt', 'hello')).toThrow();
    const c = { f: [20000, 20, 1000, 1000, 100, 5000], db: [1, 2, 0, 9, 0, 0] }; expect(validateCal(c)).toBeNull(); expect(c.f).toEqual([20, 100, 1000, 5000, 20000]);
  });
  it('interpolates on log frequency and corrects a spectrum', () => {
    const c = { f: [100, 1000, 10000], db: [0, 0, 6] };
    expect(calAt(c, 50)).toBe(0); expect(calAt(c, 3162.28)).toBeCloseTo(3, 2); expect(calAt(c, 20000)).toBe(6);
    const p = new Float64Array(11).fill(1); applyCal(p, 1000, c); expect(p[10]).toBeCloseTo(10 ** (-0.6), 5); expect(p[1]).toBeCloseTo(1, 6);
  });
  it('bundles a searchable library with unique ids and full-band curves', () => {
    expect(BUILTIN_CALS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(BUILTIN_CALS.map((c) => c.id)).size).toBe(BUILTIN_CALS.length);
    for (const c of BUILTIN_CALS) { expect(validateCal({ f: [...c.f], db: [...c.db] })).toBeNull(); expect(Math.abs(calAt(c, 1000))).toBeLessThan(0.5); }
    expect(searchCals(BUILTIN_CALS, 'umik 90').map((c) => c.name)).toEqual(['miniDSP UMIK-1, 90°', 'miniDSP UMIK-2, 90°']);
    expect(searchCals(BUILTIN_CALS, '', 'phone').length).toBeGreaterThanOrEqual(4);
  });
  it('picks a curve from the input name, preferring the user file', () => {
    expect(matchDevice('Umik-1  Gain: 18dB', BUILTIN_CALS)?.name).toBe('miniDSP UMIK-1, 90°');
    expect(matchDevice('iMM-6C', BUILTIN_CALS)?.model).toBe('iMM-6C');
    const mine = calFromFile('7012345.txt', '"Sens Factor =-1dB"\n20 0\n100 0\n1000 0\n5000 0\n20000 0\n');
    expect(matchDevice('UMIK-1', [mine, ...BUILTIN_CALS])?.id).toBe(mine.id);
    expect(matchDevice('Realtek HD Audio', BUILTIN_CALS)).toBeNull();
  });
});
