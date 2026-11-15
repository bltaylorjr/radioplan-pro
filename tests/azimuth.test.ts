import { describe, it, expect } from 'vitest';
import { geomag, azimuthPair, trueToMag, magToTrue, compassPoint, fmtAz, fmtDeg, fmtDecl, decimalYear, elevationAngleDeg, reciprocal } from '../src/engine/azimuth';

// Official WMM2025 test values (NOAA NCEI WMM2025 report): year, height km, lat, lon, inclination °, declination °.
const WMM2025_TEST: number[][] = [
  [2025.000000, 28, 89, -121, 88.47, -99.77],
  [2025.000000, 65, 43, 93, 64.10, 0.50],
  [2025.000000, 3, -50, -103, -54.89, 27.96],
  [2025.000000, 18, 0, 21, -26.06, 1.29],
  [2025.500000, 69, 38, -144, 56.97, 12.93],
  [2025.500000, 8, -66, 17, -59.55, -33.14],
  [2025.500000, 44, 33, -118, 57.89, 11.10],
  [2026.000000, 46, -24, -122, -34.17, 14.01],
  [2026.000000, 47, -72, -22, -61.16, -6.32],
  [2026.000000, 82, -64, 87, -75.40, -81.74],
  [2026.500000, 14, 0, 80, -17.15, -3.10],
  [2026.500000, 43, 17, 52, 23.95, 1.19],
  [2026.500000, 12, -79, 115, -77.37, -137.58],
  [2026.500000, 86, -11, 167, -31.60, 10.24],
  [2027.000000, 44, 22, 174, 31.89, 6.46],
  [2027.000000, 44, -43, -111, -52.57, 24.31],
  [2027.000000, 61, 59, -77, 78.68, -16.48],
  [2027.500000, 77, -68, -7, -59.82, -16.19],
  [2027.500000, 60, 27, 65, 42.83, 1.85],
  [2027.500000, 0, -13, -59, -15.26, -17.49],
  [2028.000000, 49, 20, 167, 26.82, 5.10],
  [2028.000000, 86, -85, -79, -70.25, 41.09],
  [2028.000000, 21, 6, -32, -8.70, -14.34],
  [2028.000000, 11, -22, -21, -57.67, -23.24],
  [2028.500000, 39, -65, -88, -60.20, 29.45],
  [2028.500000, 72, -62, 65, -68.50, -67.87],
  [2028.500000, 65, 48, 148, 61.79, -9.55],
  [2029.000000, 95, -70, 42, -64.54, -55.06],
  [2029.000000, 57, 34, -13, 45.74, -1.89],
  [2029.000000, 90, -55, -171, -72.79, 38.65],
  [2029.500000, 31, 13, -132, 31.41, 9.04],
  [2029.500000, 64, 22, -132, 43.76, 10.23],
  [2029.500000, 18, 9, -172, 15.85, 9.24],
  [2029.500000, 77, -18, 138, -47.55, 4.45],
];

describe('WMM2025 magnetic declination', () => {
  it('matches the official test values', () => {
    for (const [yr, alt, lat, lon, incl, decl] of WMM2025_TEST) {
      const g = geomag(lat, lon, yr, alt);
      expect(g.decDeg).toBeCloseTo(decl, 1);
      expect(g.dipDeg).toBeCloseTo(incl, 1);
    }
  });
  it('gives a westerly declination around Asheville, NC', () => {
    const d = geomag(35.5951, -82.5515, 2026.9).decDeg;
    expect(d).toBeLessThan(-4); expect(d).toBeGreaterThan(-9);
  });
  it('flags dates outside 2025 to 2030', () => {
    expect(geomag(35.6, -82.5, 2031).outOfRange).toBe(true);
    expect(geomag(35.6, -82.5, 2027).outOfRange).toBe(false);
  });
  it('decimal year', () => { expect(decimalYear(new Date(Date.UTC(2026, 0, 1)))).toBe(2026); });
});

describe('azimuth helpers', () => {
  it('true and magnetic', () => {
    expect(trueToMag(90, -7)).toBeCloseTo(97); expect(magToTrue(97, -7)).toBeCloseTo(90);
    expect(trueToMag(3, 7)).toBeCloseTo(356);
  });
  it('compass points and formatting', () => {
    expect(compassPoint(0)).toBe('N'); expect(compassPoint(135)).toBe('SE'); expect(compassPoint(350)).toBe('N'); expect(compassPoint(260)).toBe('W');
    expect(fmtDeg(5.04)).toBe('005.0'); expect(fmtDeg(359.97)).toBe('000.0');
    expect(fmtAz(45, -7)).toBe('045.0°T (052.0°M) NE'); expect(fmtAz(45)).toBe('045.0°T NE');
    expect(fmtDecl(-6.94)).toBe('6.9° W'); expect(reciprocal(350)).toBe(170);
  });
  it('azimuth pair both ways', () => {
    const a = { lat: 35.5951, lon: -82.5515 }, b = { lat: 35.64, lon: -82.48 };
    const z = azimuthPair(a, b, 2026.9);
    expect(z.fwd).toBeGreaterThan(45); expect(z.fwd).toBeLessThan(60);
    expect(Math.abs(z.back - reciprocal(z.fwd))).toBeLessThan(0.2);
    expect(z.fwdMag).toBeCloseTo(trueToMag(z.fwd, z.decA), 6);
    expect(z.km).toBeGreaterThan(7);
  });
  it('elevation angle includes earth curve', () => {
    expect(elevationAngleDeg(10, 0, 0)).toBeLessThan(0);
    expect(elevationAngleDeg(1, 0, 100)).toBeCloseTo(5.7, 1);
  });
});
