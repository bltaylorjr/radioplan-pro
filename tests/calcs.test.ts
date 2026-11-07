import { describe, it, expect } from 'vitest';
import * as c from '../src/engine/calcs';

describe('calculators', () => {
  it('levels', () => {
    expect(c.dbmToUv(-107)).toBeCloseTo(1, 1); // 1 µV ≈ −107 dBm in 50 Ω
    expect(c.uvToDbm(1)).toBeCloseTo(-107, 0);
    expect(c.dbmToDbuv(-60)).toBeCloseTo(47, 0);
    expect(c.fieldStrengthDbuvM(-60, 100, 0)).toBeCloseTo(57.2, 1);
    expect(c.receivedFromField(57.2, 100, 0)).toBeCloseTo(-60, 5);
  });
  it('antennas', () => {
    expect(c.antennaLengths(146).halfWaveFt468).toBeCloseTo(3.205, 2);
    expect(c.dbdToDbi(0)).toBe(2.15);
    expect(c.isolationVerticalDb(c.antennaLengths(150).lambdaM * 10, 150)).toBeCloseTo(68, 0);
    expect(c.tiltToDistanceDeg(30, 3)).toBeGreaterThan((Math.atan(30 / 3000) * 180) / Math.PI);
  });
  it('vswr / noise / erlang / im', () => {
    const v = c.vswrCalc(1.5); expect(v.returnLossDb).toBeCloseTo(13.98, 1); expect(v.mismatchLossDb).toBeCloseTo(0.177, 2);
    expect(c.returnLossToVswr(13.98)).toBeCloseTo(1.5, 2);
    expect(c.thermalNoiseDbm(1)).toBeCloseTo(-174, 0);
    expect(c.thermalNoiseDbm(12500, 5)).toBeCloseTo(-128, 0);
    expect(c.erlangB(10, 5)).toBeCloseTo(0.0184, 3);
    expect(c.channelsForGos(5, 0.02)).toBe(10);
    const im = c.intermodHits([460.1, 460.3], [459.9, 465], 6.25);
    expect(im.hits.length).toBe(1); expect(im.hits[0].order).toBe(3);
  });
  it('electrical', () => {
    expect(c.ohmsLaw(12, 2)).toMatchObject({ r: 6, p: 24 });
    expect(c.ohmsLaw(null, null, 10, 40)?.v).toBeCloseTo(20);
    const vd = c.voltageDrop(10, 100, '12', 120, '1ph'); expect(vd.vd).toBeCloseTo(3.86, 2);
    expect(c.voltageDrop(10, 100, '12', 208, '3ph').vd).toBeCloseTo(3.343, 2);
    expect(c.batteryAh(100, 24, 24, 0.5)).toBeCloseTo(200);
    expect(c.groundRodOhms(100, 2.44, 0.0159)).toBeCloseTo(40.0, 0);
    expect(c.awgToMm2('10').areaMm2).toBeCloseTo(5.26, 1);
    expect(c.awgToMm2('4/0').kcmil).toBeCloseTo(211.6, 0);
    expect(c.ddToDms(-80.5, 'E', 'W')).toBe('80° 30′ 00.00″ W');
  });
});
