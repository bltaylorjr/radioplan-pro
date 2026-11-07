import { describe, it, expect } from 'vitest';
import * as rf from '../src/engine/rf';
import { haversineKm, parseNmeaGga, averageFixes, utmToLatLon } from '../src/engine/geo';
import { analyzeProfile, parseEsriAscii, sampleDem } from '../src/engine/terrain';
import { sizeSolar, table6907Factor } from '../src/engine/solar';
import { alarmBatteryAh } from '../src/engine/alarm';
import { sizeConductor, voltageDropV } from '../src/engine/electrical';
import { halfWaveDipoleFt, mufMHz } from '../src/engine/lfhf';
import { p1238LossDb, multiWallLossDb } from '../src/engine/indoor';

describe('radio horizon (4/3 earth)', () => {
  it('100 m antenna ≈ 41.2 km', () => expect(rf.radioHorizonKm(100)).toBeCloseTo(41.22, 1));
  it('matches 4.12·√h rule of thumb', () => expect(rf.radioHorizonKm(50)).toBeCloseTo(4.12 * Math.sqrt(50), 0));
  it('LOS distance sums both horizons', () => expect(rf.losDistanceKm(100, 2)).toBeCloseTo(41.22 + 5.83, 1));
  it('earth bulge midpoint of 40 km path ≈ 23.5 m', () => expect(rf.earthBulgeM(20, 20)).toBeCloseTo(23.5, 0));
});

describe('Fresnel zone', () => {
  it('900 MHz 10 km midpoint F1 ≈ 28.9 m (17.32·√(d1d2/fD))', () => expect(rf.fresnelRadiusM(5, 5, 900)).toBeCloseTo(17.32 * Math.sqrt(25 / (0.9 * 10)), 0));
  it('zero at endpoints', () => expect(rf.fresnelRadiusM(0, 10, 900)).toBe(0));
});

describe('path loss models', () => {
  it('FSPL 900 MHz 1 km = 91.53 dB', () => expect(rf.fsplDb(900, 1)).toBeCloseTo(91.53, 1));
  it('Hata urban 900 MHz, hb 30 m, hm 1.5 m, 1 km ≈ 126.4 dB', () =>
    expect(rf.okumuraHata({ fMHz: 900, hbM: 30, hmM: 1.5, dKm: 1, env: 'urban' }).lossDb).toBeCloseTo(126.4, 0));
  it('Hata suburban < urban, rural < suburban', () => {
    const b = { fMHz: 900, hbM: 50, hmM: 1.5, dKm: 5 } as const;
    const u = rf.okumuraHata({ ...b, env: 'urban' }).lossDb, s = rf.okumuraHata({ ...b, env: 'suburban' }).lossDb, r = rf.okumuraHata({ ...b, env: 'rural' }).lossDb;
    expect(s).toBeLessThan(u); expect(r).toBeLessThan(s);
  });
  it('COST-231 1800 MHz urban 1 km, hb 30 ≈ 136.9 dB (metro +3)', () => {
    const l = rf.cost231Hata({ fMHz: 1800, hbM: 30, hmM: 1.5, dKm: 1, env: 'urban', city: 'small-medium' }).lossDb;
    const expected = 46.3 + 33.9 * Math.log10(1800) - 13.82 * Math.log10(30) - rf.mobileCorrectionDb(1800, 1.5, 'small-medium');
    expect(l).toBeCloseTo(expected, 3);
  });
  it('flags out-of-range inputs', () => expect(rf.okumuraHata({ fMHz: 100, hbM: 10, hmM: 1.5, dKm: 30, env: 'urban' }).warnings.length).toBe(3));
  it('range inversion round-trips', () => {
    const base = { fMHz: 850, hbM: 45, hmM: 1.5, env: 'suburban' as const };
    const L = rf.okumuraHata({ ...base, dKm: 7.3 }).lossDb;
    expect(rf.rangeForPathLossKm(L, base)).toBeCloseTo(7.3, 2);
  });
});

describe('link budget / EIRP / MAPL', () => {
  it('EIRP = P - L + G', () => expect(rf.eirpDbm(46, 17, 3, 0.5)).toBe(59.5));
  it('ERP = EIRP - 2.15', () => expect(rf.erpDbm(50)).toBeCloseTo(47.85));
  it('MAPL', () => {
    const r = rf.linkBudget({ txPowerDbm: 43, txAntGainDbi: 15, txFeederLossDb: 3, rxAntGainDbi: 0, rxFeederLossDb: 0, rxSensitivityDbm: -110, fadeMarginDb: 8, bodyLossDb: 3, penetrationLossDb: 10 });
    expect(r.eirpDbm).toBe(55); expect(r.maplDb).toBe(55 + 110 - 21);
  });
  it('dBm/W conversions', () => { expect(rf.dbmToWatts(30)).toBeCloseTo(1); expect(rf.wattsToDbm(100)).toBeCloseTo(50); });
});

describe('statistics & diffraction', () => {
  it('invNorm(0.9) = 1.2816', () => expect(rf.invNorm(0.9)).toBeCloseTo(1.2816, 3));
  it('90% edge, σ=8 → 10.25 dB margin', () => expect(rf.shadowMarginDb(8, 0.9)).toBeCloseTo(10.25, 1));
  it('Jakes: 0 dB edge margin, σ/n=2 → ~77% area', () => expect(rf.areaReliability(0, 8, 4)).toBeGreaterThan(0.7));
  it('knife edge v=0 ≈ 6 dB', () => expect(rf.knifeEdgeLossDb(0)).toBeCloseTo(6.0, 0));
  it('knife edge v=-1 = 0 dB', () => expect(rf.knifeEdgeLossDb(-1)).toBe(0));
});

describe('tilt & RF exposure', () => {
  it('30 m antenna, 3° tilt main beam ≈ 0.57 km', () => expect(rf.tiltFootprintKm(30, 3, 10).mainBeamKm).toBeCloseTo(0.572, 2));
  it('MPE 850 MHz general = f/1500', () => expect(rf.mpeLimitMwCm2(850, 'general')).toBeCloseTo(0.5667, 3));
  it('MPE 150 MHz general = 0.2', () => expect(rf.mpeLimitMwCm2(150, 'general')).toBe(0.2));
  it('compliance distance consistent with density', () => {
    const d = rf.mpeComplianceDistanceM(1000, 850, 'general');
    expect(rf.powerDensityMwCm2(1000, d)).toBeCloseTo(rf.mpeLimitMwCm2(850, 'general'), 4);
  });
  it('cable loss fit reproduces datasheet points', () => {
    const pts: [number, number][] = [[150, 1.5], [450, 2.7], [900, 3.9], [2400, 6.6]];
    expect(rf.cableLossPer100ft(pts, 900)).toBeCloseTo(3.9, 0);
  });
});

describe('geo / GPS', () => {
  it('haversine Charlotte→Raleigh ≈ 209 km', () => expect(haversineKm({ lat: 35.2271, lon: -80.8431 }, { lat: 35.7796, lon: -78.6382 })).toBeCloseTo(209, -1));
  it('parses and averages GGA with checksum', () => {
    const s = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47';
    const f = parseNmeaGga(s);
    expect(f.length).toBe(1); expect(f[0].lat).toBeCloseTo(48.1173, 3); expect(f[0].lon).toBeCloseTo(11.5167, 3);
    expect(averageFixes(f)!.count).toBe(1);
  });
  it('rejects bad checksum', () => expect(parseNmeaGga('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*00').length).toBe(0));
  it('UTM 17N → lat/lon (Charlotte area)', () => {
    const p = utmToLatLon(514000, 3898000, 17);
    expect(p.lat).toBeCloseTo(35.226, 2); expect(p.lon).toBeCloseTo(-80.845, 2);
  });
});

describe('terrain profile', () => {
  it('ESRI ASCII parse + sample', () => {
    const g = parseEsriAscii('ncols 2\nnrows 2\nxllcorner -81\nyllcorner 35\ncellsize 0.5\nNODATA_value -9999\n100 200\n300 400\n');
    expect(sampleDem(g, { lat: 35.75, lon: -80.75 })).toBeCloseTo(100);
    expect(sampleDem(g, { lat: 35.25, lon: -80.25 })).toBeCloseTo(400);
  });
  it('flat path with tall towers is clear; ridge blocks', () => {
    const flat = Array.from({ length: 11 }, (_, i) => ({ dKm: i, groundM: 0, lat: 0, lon: 0 }));
    expect(analyzeProfile(flat, 60, 60, 900).meets60).toBe(true);
    const ridge = flat.map((p, i) => (i === 5 ? { ...p, groundM: 80 } : p));
    const a = analyzeProfile(ridge, 30, 30, 900);
    expect(a.los).toBe(false); expect(a.diffractionLossDb).toBeGreaterThan(10);
  });
});

describe('electrical / solar / alarm / HF / indoor', () => {
  it('voltage drop 10 A, 100 ft, #10 = 2.42 V', () => expect(voltageDropV(10, 100, '10')).toBeCloseTo(2.42, 2));
  it('conductor sized up for voltage drop', () => expect(sizeConductor(20, 200, 24, 3)!.limitedBy).toBe('voltage drop'));
  it('Table 690.7(A) factor at -10 °C = 1.14', () => expect(table6907Factor(-10)).toBe(1.14));
  it('solar sizing applies 156% rule', () => {
    const r = sizeSolar({ loads: [{ name: 'Radio', watts: 50, hoursPerDay: 24, qty: 1 }], systemVdc: 24, autonomyDays: 5, depthOfDischarge: 0.5, peakSunHours: 3.6, systemDerate: 0.77, batteryTempFactor: 0.9, inverterEff: 1,
      module: { name: 'm', pmaxW: 400, vocV: 49, vmpV: 41, iscA: 10.4, impA: 9.8, tempCoeffVocPctPerC: -0.27 }, recordLowC: -15, controllerMaxVoc: 150, controllerMaxA: 60, arrayToControllerFt: 50, batteryToLoadFt: 10, dwelling: false, onBuilding: false });
    expect(r.dailyWh).toBe(1200);
    expect(r.conductorAmpsRequired).toBeCloseTo(r.strings * 10.4 * 1.5625, 3);
    expect(r.maxStringVoc).toBeLessThanOrEqual(150);
  });
  it('NFPA 72 battery: 24 h standby + 5 min alarm', () => {
    const r = alarmBatteryAh({ devices: [{ name: 'panel', qty: 1, standbyMa: 200, alarmMa: 400 }, { name: 'horn strobe', qty: 20, standbyMa: 0, alarmMa: 100 }], standbyHours: 24, alarmMinutes: 5, safetyFactor: 1.2 });
    expect(r.rawAh).toBeCloseTo(0.2 * 24 + 2.4 * (5 / 60), 5);
  });
  it('half-wave dipole 7.2 MHz ≈ 65 ft', () => expect(halfWaveDipoleFt(7.2)).toBeCloseTo(65, 0));
  it('MUF > foF2 for oblique path', () => expect(mufMHz(7, 1500)).toBeGreaterThan(7));
  it('P.1238 office 2.4 GHz 10 m ≈ 69.6 dB', () => expect(p1238LossDb(2400, 10, 'office')).toBeCloseTo(20 * Math.log10(2400) + 30 - 28, 1));
  it('multi-wall adds wall loss', () => {
    const open = multiWallLossDb(2400, 0, 0, 10, 0, []);
    const walled = multiWallLossDb(2400, 0, 0, 10, 0, [{ x1: 5, y1: -1, x2: 5, y2: 1, material: 'concrete' }]);
    expect(walled - open).toBeCloseTo(20, 0);
  });
});
