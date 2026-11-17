import { describe, it, expect, beforeAll } from 'vitest';
import { geomag, loadHighResMagModel, magModelDegree, magModelName } from '../src/engine/azimuth';

// Reference values printed in NOAA's own WMMHR Python package (wmmhr 1.2.4 README, get_all() example).
const REF = [
  { lat: 23.35, lon: 40, altKm: 21, date: '2025-12-06', dec: 3.67287636, inc: 35.14607142, f: 41456.66922383 },
  { lat: 24.5, lon: 45, altKm: 21, date: '2026-01-15', dec: 3.3006066, inc: 37.96160489, f: 42567.38939334 },
];
const decYear = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'), y = d.getUTCFullYear(); const s = Date.UTC(y, 0, 1), e = Date.UTC(y + 1, 0, 1); return y + (d.getTime() - s) / (e - s); };

describe('World Magnetic Model High Resolution (WMMHR2025)', () => {
  beforeAll(async () => { expect(await loadHighResMagModel()).toBe(true); });
  it('is loaded at full resolution', () => {
    expect(magModelName()).toBe('WMMHR2025');
    expect(magModelDegree()).toBe(133);
  });
  it('matches NOAA reference values', () => {
    for (const r of REF) {
      const g = geomag(r.lat, r.lon, decYear(r.date), r.altKm);
      expect(Math.abs(g.decDeg - r.dec)).toBeLessThan(0.01);
      expect(Math.abs(g.dipDeg - r.inc)).toBeLessThan(0.01);
      expect(Math.abs(g.totalNt - r.f) / r.f).toBeLessThan(1e-4);
    }
  });
  it('gives Asheville about 7° W and is fast enough for the declination map', () => {
    const d = geomag(35.5951, -82.5515, 2026.9).decDeg;
    expect(d).toBeLessThan(-6); expect(d).toBeGreaterThan(-8.5);
    const t = performance.now();
    for (let i = 0; i < 200; i++) geomag(30 + i * 0.1, -90 + i * 0.1, 2026.9);
    expect((performance.now() - t) / 200).toBeLessThan(20);
  });
});
