import { describe, it, expect } from 'vitest';
import { simplifyLine, densify, analyzeLine, moveVertex, insertVertex, removeVertex, lineLengthKm, type DrawnLine } from '../src/engine/routes';
import type { DemGrid } from '../src/engine/terrain';
import type { CoverageInputs } from '../src/engine/coverage';

function ridgeDem(): DemGrid { // 100 m plain with a 400 m north-south ridge at lon -82.6
  const n = 200, data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = Math.abs(c - 100) < 3 ? 500 : 100;
  return { name: 't', ncols: n, nrows: n, west: -82.7, north: 35.7, cellDeg: 0.001, data, nodata: -9999, source: 'test' };
}
const cov = (site: { lat: number; lon: number }): CoverageInputs => ({ site, antennaAglM: 30, fMHz: 450, eirpDbm: 50, rxGainDbi: 0, rxLossDb: 0, mobileHeightM: 1.5, env: 'suburban', city: 'small-medium', azimuthDeg: 0, tiltDeg: 0, hBwDeg: 360, vBwDeg: 10, radiusKm: 30, gridN: 10, k: 4 / 3 });

describe('drawn lines', () => {
  it('simplifies a wobbly freehand stroke but keeps a corner', () => {
    const pts = [] as { lat: number; lon: number }[];
    for (let i = 0; i <= 50; i++) pts.push({ lat: 35.6 + (i % 2) * 0.000005, lon: -82.68 + i * 0.0004 }); // ~0.5 m wobble
    for (let i = 1; i <= 50; i++) pts.push({ lat: 35.6 + i * 0.0004, lon: -82.66 });
    const s = simplifyLine(pts, 15);
    expect(s.length).toBe(3);
    expect(s[0]).toEqual(pts[0]); expect(s[2]).toEqual(pts[pts.length - 1]);
  });
  it('densifies with distances that add up to the length', () => {
    const pts = [{ lat: 35.6, lon: -82.68 }, { lat: 35.6, lon: -82.62 }, { lat: 35.65, lon: -82.62 }];
    const d = densify(pts, 0.1);
    expect(d[d.length - 1].dKm).toBeCloseTo(lineLengthKm(pts), 6);
    expect(d.length).toBeGreaterThan(100);
  });
  it('finds the stretch hidden from the transmitter behind the ridge, and weaker signal there', () => {
    const dem = ridgeDem(), tx = { lat: 35.6, lon: -82.68 };
    const line: DrawnLine = { id: 'a', name: 'x', mode: 'free', pts: [{ lat: 35.62, lon: -82.67 }, { lat: 35.62, lon: -82.52 }] };
    const r = analyzeLine(line, dem, cov(tx), { thresholdDbm: -95 });
    expect(r.hiddenKm!).toBeGreaterThan(5);
    const before = r.samples.find((s) => s.lon < -82.65)!, after = r.samples.find((s) => s.lon > -82.58)!;
    expect(before.seen).toBe(true); expect(after.seen).toBe(false);
    expect(after.rssi!).toBeLessThan(before.rssi! - 10);
    expect(r.legs[0].fwd).toBeCloseTo(90, 0);
    expect(r.pctAbove).not.toBeNull();
  });
  it('checks line of sight end to end on a straight two-point line', () => {
    const dem = ridgeDem();
    const r = analyzeLine({ id: 'b', name: 'y', mode: 'straight', endAglM: 20, pts: [{ lat: 35.6, lon: -82.68 }, { lat: 35.6, lon: -82.52 }] }, dem, null);
    expect(r.ends!.an.los).toBe(false);
    expect(r.ends!.obs[0].kind).toBe('blocks');
    expect(r.samples.every((s) => s.rssi == null)).toBe(true);
  });
  it('edits points', () => {
    let l: DrawnLine = { id: 'c', name: 'z', mode: 'straight', pts: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] };
    l = insertVertex(l, 0, { lat: 1.5, lon: 1.2 }); expect(l.pts.length).toBe(3); expect(l.pts[1]).toEqual({ lat: 1.5, lon: 1.2 });
    l = moveVertex(l, 1, { lat: 1.4, lon: 1.1 }); expect(l.pts[1].lat).toBe(1.4);
    l = removeVertex(l, 1); expect(l.pts.length).toBe(2);
    expect(removeVertex(l, 0).pts.length).toBe(2); // keeps at least two points
  });
});
