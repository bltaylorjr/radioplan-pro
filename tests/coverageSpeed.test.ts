import { computeCoverage, fillRows, boundsFor, type CoverageInputs } from '../src/engine/coverage';
import { cropFor } from '../src/engine/coverageAsync';
import { sampleDem, type DemGrid } from '../src/engine/terrain';

// Rolling synthetic terrain 0.2° square around Asheville, with a hole of missing data.
function dem(): DemGrid {
  const ncols = 300, nrows = 300, cellDeg = 0.4 / 300, data = new Float32Array(ncols * nrows);
  for (let r = 0; r < nrows; r++) for (let c = 0; c < ncols; c++) data[r * ncols + c] = 650 + 200 * Math.sin(r / 17) * Math.cos(c / 23);
  data[150 * ncols + 160] = -9999;
  return { name: 't', ncols, nrows, west: -82.75, north: 35.8, cellDeg, data, nodata: -9999, source: 'test' };
}
const inp = (d: DemGrid): CoverageInputs => ({ site: { lat: 35.6, lon: -82.55 }, antennaAglM: 30, fMHz: 460, eirpDbm: 50, rxGainDbi: 0, rxLossDb: 0, mobileHeightM: 1.5,
  env: 'suburban' as CoverageInputs['env'], city: 'medium' as CoverageInputs['city'], azimuthDeg: 0, tiltDeg: 0, hBwDeg: 360, vBwDeg: 10, radiusKm: 8, gridN: 40, dem: d });

describe('faster coverage maps give the same answers', () => {
  it('rows worked out in bands match the whole map', () => {
    const i = inp(dem()), full = computeCoverage(i);
    const res = { ...full, rssi: new Float32Array(40 * 40) };
    fillRows(i, res, 0, 13); fillRows(i, res, 13, 27); fillRows(i, res, 27, 40);
    expect(Array.from(res.rssi)).toEqual(Array.from(full.rssi));
  });
  it('terrain cropped to the map area gives identical signal', () => {
    const d = dem(), i = inp(d), full = computeCoverage(i);
    const crop = cropFor(d, boundsFor(i.site, i.radiusKm));
    expect(crop.data.length).toBeLessThan(d.data.length);
    const c = computeCoverage({ ...i, dem: crop, siteGroundM: sampleDem(d, i.site)!, bounds: boundsFor(i.site, i.radiusKm) });
    expect(Array.from(c.rssi)).toEqual(Array.from(full.rssi));
  });
  it('terrain lookup averages around missing data', () => {
    const d = dem();
    const p = { lat: d.north - 150.5 * d.cellDeg, lon: d.west + 160.5 * d.cellDeg };
    expect(sampleDem(d, p)).not.toBeNull();
  });
});
