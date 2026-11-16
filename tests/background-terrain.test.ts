import { describe, it, expect } from 'vitest';
import { finestDem, demCellM, type DemGrid } from '../src/engine/terrain';
import { linkBounds } from '../src/engine/autoterrain';

const grid = (west: number, north: number, n: number, cellDeg: number, source: string): DemGrid =>
  ({ name: source, ncols: n, nrows: n, west, north, cellDeg, data: new Float32Array(n * n).fill(500), nodata: NaN, source });

describe('background terrain', () => {
  const tx = { lat: 35.6, lon: -82.6 }, rx = { lat: 35.65, lon: -82.5 };
  const area = grid(-83, 36, 100, 0.01, 'area ~900 m');
  const link = grid(-82.65, 35.7, 200, 0.001, 'link ~90 m');
  it('link area covers both ends of the path with room around it', () => {
    const b = linkBounds(tx, rx);
    expect(b.south).toBeLessThan(35.6); expect(b.north).toBeGreaterThan(35.65);
    expect(b.west).toBeLessThan(-82.6); expect(b.east).toBeGreaterThan(-82.5);
  });
  it('uses the sharper link terrain when it holds every point', () => {
    expect(demCellM(link)).toBeLessThan(demCellM(area));
    expect(finestDem([link, area], [tx, rx])).toBe(link);
  });
  it('falls back to the area terrain for points outside the link terrain', () => {
    expect(finestDem([link, area], [{ lat: 35.2, lon: -82.9 }])).toBe(area);
    expect(finestDem([null, undefined], [tx])).toBeNull();
  });
});
