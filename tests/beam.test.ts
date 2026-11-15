import { describe, it, expect } from 'vitest';
import { beamProfile, niceLen, curveDropM } from '../src/engine/beam';
import { frameFor } from '../src/components/scale';
import type { DemGrid } from '../src/engine/terrain';

function ridgeDem(): DemGrid { // 100 m plain with a 500 m north-south ridge at lon -82.6
  const n = 200, data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = Math.abs(c - 100) < 3 ? 500 : 100;
  return { name: 't', ncols: n, nrows: n, west: -82.7, north: 35.7, cellDeg: 0.001, data, nodata: -9999, source: 'test' };
}

describe('antenna beam side view', () => {
  it('lands the main beam where height / tan(tilt) says on flat ground', () => {
    const b = beamProfile(null, { lat: 35.6, lon: -82.68 }, { azimuthDeg: 90, tiltDeg: 3, vBwDeg: 10, aglM: 50, maxKm: 5, k: 1e9, groundM: 100, n: 2000 });
    expect(b.main.hitKm!).toBeCloseTo(50 / Math.tan((3 * Math.PI) / 180) / 1000, 2);
    expect(b.lower.hitKm!).toBeLessThan(b.main.hitKm!);
    expect(b.upper.hitKm).toBeNull(); // 2 degrees above level never comes down
  });
  it('stops the beam at a ridge in the way', () => {
    const dem = ridgeDem(), at = { lat: 35.6, lon: -82.68 }; // ridge about 7 km east
    const b = beamProfile(dem, at, { azimuthDeg: 90, tiltDeg: 0, vBwDeg: 8, aglM: 30, maxKm: 15 });
    expect(b.main.hitKm!).toBeGreaterThan(6.5); expect(b.main.hitKm!).toBeLessThan(7.5);
    expect(b.antennaM).toBeCloseTo(130, 0);
  });
  it('earth curve and round numbers', () => {
    expect(curveDropM(10)).toBeCloseTo(5.9, 0);
    expect(niceLen(0.37)).toBe(0.2); expect(niceLen(730)).toBe(500); expect(niceLen(1.2)).toBe(1);
  });
  it('true scale draws a metre up the same size as a metre across', () => {
    const f = frameFor({ km: 2, plotW: 500, lo: 100, hi: 300, ex: 1, autoH: 200 });
    expect(f.mPerPxV).toBeCloseTo(f.mPerPx, 6); expect(f.E).toBe(1);
    const s = frameFor({ km: 2, plotW: 500, lo: 100, hi: 300, ex: 5, autoH: 200 });
    expect(s.mPerPx / s.mPerPxV).toBeCloseTo(5, 6);
    const a = frameFor({ km: 20, plotW: 500, lo: 100, hi: 300, ex: 0, autoH: 200 });
    expect(a.ph).toBe(200); expect(a.E).toBeGreaterThan(20);
  });
});
