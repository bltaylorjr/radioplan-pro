import { describe, it, expect } from 'vitest';
import { terrariumElevation, lonToTileX, latToTileY, tileXToLon, tileYToLat, tileRange, metersPerPixel } from '../src/engine/webmercator';
import { chooseZoom, boundsAround, demCovers } from '../src/engine/autoterrain';
import { parseLatLon } from '../src/engine/locparse';

describe('terrain tiles', () => {
  it('Terrarium decode: 0 m and 1000.5 m', () => {
    expect(terrariumElevation(128, 0, 0)).toBe(0);
    expect(terrariumElevation(131, 232, 128)).toBeCloseTo(1000.5, 3);
  });
  it('tile math round-trips', () => {
    expect(tileXToLon(lonToTileX(-80.84, 12), 12)).toBeCloseTo(-80.84, 6);
    expect(tileYToLat(latToTileY(35.22, 12), 12)).toBeCloseTo(35.22, 6);
  });
  it('z14 resolution at 35° ≈ 7.8 m/px', () => expect(metersPerPixel(35, 14)).toBeCloseTo(7.83, 1));
  it('chooses a zoom within the tile budget', () => {
    const b = boundsAround([{ lat: 35.22, lon: -80.84 }, { lat: 35.29, lon: -80.73 }], 5);
    const z = chooseZoom(b, 48);
    expect(tileRange(b, z).count).toBeLessThanOrEqual(48);
    expect(tileRange(b, z + 1).count).toBeGreaterThan(48);
  });
  it('demCovers', () => {
    const dem = { name: '', ncols: 10, nrows: 10, west: -81, north: 36, cellDeg: 0.1, data: new Float32Array(100), nodata: NaN, source: '' };
    expect(demCovers(dem, { north: 35.5, south: 35.2, east: -80.5, west: -80.9 })).toBe(true);
    expect(demCovers(dem, { north: 36.5, south: 35.2, east: -80.5, west: -80.9 })).toBe(false);
  });
});

describe('location parsing', () => {
  it('decimal', () => expect(parseLatLon('35.2271, -80.8431')).toEqual({ lat: 35.2271, lon: -80.8431 }));
  it('decimal with space', () => expect(parseLatLon('35.2271 -80.8431')).toEqual({ lat: 35.2271, lon: -80.8431 }));
  it('DMS', () => { const p = parseLatLon(`35°13'37.6"N 80°50'35.2"W`)!; expect(p.lat).toBeCloseTo(35.22711, 4); expect(p.lon).toBeCloseTo(-80.84311, 4); });
  it('hemisphere-first DDM', () => { const p = parseLatLon('N35 13.627 W80 50.587')!; expect(p.lat).toBeCloseTo(35.22712, 4); expect(p.lon).toBeCloseTo(-80.84312, 4); });
  it('lon/lat order with hemispheres', () => { const p = parseLatLon('80.8431 W, 35.2271 N')!; expect(p.lat).toBeCloseTo(35.2271); expect(p.lon).toBeCloseTo(-80.8431); });
  it('street address is not coordinates', () => expect(parseLatLon('600 E 4th St, Charlotte NC')).toBeNull());
});

import { findCandidates, applyPlan, DEFAULT_PLAN } from '../src/engine/autoplan';
import { defaultProject } from '../src/defaults';
describe('auto plan', () => {
  // Synthetic DEM: flat 100 m with a 300 m hill 2 km north of the target
  const n = 200, west = -81, north = 35.3, cell = 0.001;
  const data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const lat = north - (r + 0.5) * cell, lon = west + (c + 0.5) * cell;
    data[r * n + c] = 100 + 200 * Math.exp(-(((lat - 35.218) / 0.006) ** 2 + ((lon + 80.9) / 0.006) ** 2));
  }
  const dem = { name: 't', ncols: n, nrows: n, west, north, cellDeg: cell, data, nodata: NaN, source: 'test' };
  const target = { lat: 35.2, lon: -80.9 };
  it('prefers the hilltop', () => {
    const c = findCandidates(dem, target, { ...DEFAULT_PLAN, serviceRadiusKm: 5, searchRadiusKm: 3 })[0];
    expect(c.groundM).toBeGreaterThan(200);
  });
  it('applyPlan fills sites, radio and tests', () => {
    const p = defaultProject();
    const c = findCandidates(dem, target, { ...DEFAULT_PLAN, serviceRadiusKm: 5 })[0];
    const notes = applyPlan(p, { ...target, label: 'Test St, Charlotte, NC', state: 'SC' }, c, DEFAULT_PLAN);
    expect(p.meta.state).toBe('SC'); expect(p.sites[0].lat).toBeCloseTo(c.lat); expect(p.tests.length).toBeGreaterThan(5); expect(notes.length).toBeGreaterThan(2);
  });
});
