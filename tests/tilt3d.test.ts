import { describe, it, expect } from 'vitest';
import { findObstructions, visible, viewshedGrid } from '../src/engine/los';
import { drapeUv, drapeZoom, tileUrl } from '../src/engine/drape';
import { cropDem, decodeDeltaRows } from '../src/engine/bundledTerrain';
import { buildProfile, analyzeProfile, sampleDem, type DemGrid } from '../src/engine/terrain';
import { latToTileY } from '../src/engine/webmercator';
import { AVL_DEM, AVL_DEM_GZ_B64 } from '../src/data/ashevilleTerrain';

// flat 100 m plain, 0.2° square, with a 400 m ridge running north-south through the middle
function ridgeDem(ridge = 400): DemGrid {
  const n = 200, data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = Math.abs(c - 100) < 3 ? 100 + ridge : 100;
  return { name: 't', ncols: n, nrows: n, west: -82.7, north: 35.7, cellDeg: 0.001, data, nodata: -9999, source: 'test' };
}
const A = { lat: 35.6, lon: -82.68 }, B = { lat: 35.6, lon: -82.52 };

describe('line of sight', () => {
  it('finds the ridge as an obstruction and none on a flat path', () => {
    const dem = ridgeDem();
    const an = analyzeProfile(buildProfile(A, B, 300, (q) => sampleDem(dem, q)), 30, 30, 450);
    expect(an.los).toBe(false);
    const obs = findObstructions(an);
    expect(obs.length).toBe(1);
    expect(obs[0].kind).toBe('blocks');
    expect(obs[0].lon).toBeCloseTo(-82.6, 2);
    expect(obs[0].byM).toBeGreaterThan(300);
    const flat = ridgeDem(0);
    const an2 = analyzeProfile(buildProfile(A, B, 300, (q) => sampleDem(flat, q)), 30, 30, 450);
    expect(findObstructions(an2).filter((o) => o.kind === 'blocks')).toHaveLength(0);
  });
  it('a relay on top of the ridge sees both ends; the ends cannot see each other', () => {
    const dem = ridgeDem(), top = { lat: 35.6, lon: -82.6 };
    const o = { observerAglM: 30, targetAglM: 30 };
    expect(visible(dem, A, B, o)).toBe(false);
    expect(visible(dem, A, top, o)).toBe(true);
    expect(visible(dem, top, B, o)).toBe(true);
  });
  it('viewshed hides the far side of the ridge', () => {
    const dem = ridgeDem(), n = 20, b = { north: 35.7, south: 35.5, west: -82.7, east: -82.5 };
    const g = viewshedGrid(dem, A, n, { observerAglM: 10, targetAglM: 2 }, b);
    expect(g.length).toBe((n + 1) ** 2);
    expect(g[10 * (n + 1) + 2]).toBe(1); // near A, same side
    expect(g[10 * (n + 1) + 18]).toBe(0); // behind the ridge
  });
});

describe('imagery drape', () => {
  it('maps tile corners to texture corners', () => {
    const d = { z: 12, x0: 1100, y0: 1600, nx: 3, ny: 2 };
    const lon = (x: number) => (x / 2 ** 12) * 360 - 180;
    const [u0] = drapeUv(d, 35.6, lon(1100)); expect(u0).toBeCloseTo(0, 6);
    const [u1] = drapeUv(d, 35.6, lon(1103)); expect(u1).toBeCloseTo(1, 6);
    const lat = 35.6, [, v] = drapeUv(d, lat, -82.5); expect(v).toBeCloseTo(1 - (latToTileY(lat, 12) - 1600) / 2, 6);
  });
  it('keeps the tile count in budget and fills URL templates', () => {
    const b = { north: 35.7, south: 35.5, east: -82.4, west: -82.7 };
    const z = drapeZoom(b, 36);
    expect(z).toBeGreaterThan(8);
    expect(tileUrl('https://{s}.x/{z}/{x}/{y}.png', 3, 1, 2)).toBe('https://a.x/3/1/2.png');
  });
});

describe('built-in Asheville terrain', () => {
  it('decodes row-delta Int16 and crops to a box', () => {
    const vals = [100, 105, 103, 200, 210, 190];
    const d = new Int16Array(6); for (let r = 0; r < 2; r++) { let prev = 0; for (let c = 0; c < 3; c++) { d[r * 3 + c] = vals[r * 3 + c] - prev; prev = vals[r * 3 + c]; } }
    const g = decodeDeltaRows(d.buffer, 3, 2, -83, 36, 0.1);
    expect(Array.from(g.data)).toEqual(vals);
    const c = cropDem(g, { north: 36, south: 35.85, west: -82.95, east: -82.75 })!;
    expect(c.ncols).toBe(3); expect(c.nrows).toBe(2);
    expect(cropDem(g, { north: 10, south: 9, west: 0, east: 1 })).toBeNull();
  });
  it('bundled data covers Asheville with sensible heights', async () => {
    const { gunzipSync } = await import('node:zlib');
    const buf = gunzipSync(Buffer.from(AVL_DEM_GZ_B64, 'base64'));
    const g = decodeDeltaRows(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), AVL_DEM.ncols, AVL_DEM.nrows, AVL_DEM.west, AVL_DEM.north, AVL_DEM.cellDeg);
    const avl = sampleDem(g, { lat: 35.5951, lon: -82.5515 })!;
    expect(avl).toBeGreaterThan(600); expect(avl).toBeLessThan(750); // downtown Asheville ~ 650 m
    const pisgah = sampleDem(g, { lat: 35.4231, lon: -82.7473 })!; // Mount Pisgah 1742 m
    expect(pisgah).toBeGreaterThan(1550);
  });
});
