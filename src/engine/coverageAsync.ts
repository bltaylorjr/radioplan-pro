// Coverage maps worked out in background helpers (web workers), split across the device's processor cores.
// The screen stays responsive, and on a 4-core phone a detailed map finishes about 3x sooner.
// If helpers are not available (very old browser, locked-down page) it quietly works the old way.
import CoverageWorker from './coverage.worker?worker&inline';
import { computeCoverage, boundsFor, type CoverageInputs, type CoverageResult } from './coverage';
import type { DemGrid } from './terrain';

let jobId = 0;
let broken = false;

/** Crop terrain to the map area (plus a margin) so each helper gets only the part it needs. */
export function cropFor(dem: DemGrid, b: { north: number; south: number; east: number; west: number }): DemGrid {
  const cy = dem.cellDegY ?? dem.cellDeg;
  const c0 = Math.max(0, Math.floor((b.west - dem.west) / dem.cellDeg) - 2), c1 = Math.min(dem.ncols, Math.ceil((b.east - dem.west) / dem.cellDeg) + 2);
  const r0 = Math.max(0, Math.floor((dem.north - b.north) / cy) - 2), r1 = Math.min(dem.nrows, Math.ceil((dem.north - b.south) / cy) + 2);
  if (c1 - c0 <= 1 || r1 - r0 <= 1 || (c1 - c0) * (r1 - r0) > dem.ncols * dem.nrows * 0.8) return dem;
  const nc = c1 - c0, nr = r1 - r0, data = new Float32Array(nc * nr);
  for (let r = 0; r < nr; r++) data.set(dem.data.subarray((r + r0) * dem.ncols + c0, (r + r0) * dem.ncols + c1), r * nc);
  return { ...dem, ncols: nc, nrows: nr, west: dem.west + c0 * dem.cellDeg, north: dem.north - r0 * cy, data };
}

export function helperCount(n: number): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, cores - 1, Math.ceil(n / 20)));
}

export async function computeCoverageAsync(i: CoverageInputs, onProgress?: (frac: number) => void): Promise<CoverageResult> {
  const b = i.bounds ?? boundsFor(i.site, i.radiusKm), n = i.gridN;
  if (broken || typeof Worker === 'undefined') return computeCoverage(i);
  // The transmitter's own ground height comes from the full terrain, before cropping.
  const siteGroundM = i.siteGroundM ?? (i.dem ? undefined : 0);
  let inp: CoverageInputs = { ...i, bounds: b };
  if (i.dem) {
    const { sampleDem } = await import('./terrain');
    inp = { ...inp, siteGroundM: siteGroundM ?? sampleDem(i.dem, i.site) ?? 0, dem: cropFor(i.dem, b) };
  }
  const grid = { n, ...b }, rssi = new Float32Array(n * n), W = helperCount(n), id = ++jobId;
  const workers: Worker[] = [];
  try {
    const bands = Array.from({ length: W }, (_, k) => [Math.floor((k * n) / W), Math.floor(((k + 1) * n) / W)] as const);
    let done = 0;
    await Promise.all(bands.map(([r0, r1]) => new Promise<void>((resolve, reject) => {
      const w = new CoverageWorker(); workers.push(w);
      w.onerror = (e) => reject(new Error(e.message || 'helper failed'));
      w.onmessage = (e: MessageEvent<{ id: number; r0: number; out?: Float32Array; error?: string }>) => {
        if (e.data.id !== id) return;
        if (e.data.error || !e.data.out) { reject(new Error(e.data.error)); return; }
        rssi.set(e.data.out, e.data.r0 * n); done++; onProgress?.(done / W); resolve();
      };
      w.postMessage({ id, inp, grid, r0, r1 });
    })));
    return { ...grid, rssi };
  } catch {
    broken = true; // remember for this session and use the plain way from now on
    return computeCoverage(i);
  } finally {
    workers.forEach((w) => w.terminate());
  }
}

/** Several maps at once (multi-site analysis), each split across the helpers. */
export async function computeManyAsync(list: CoverageInputs[]): Promise<CoverageResult[]> {
  const out: CoverageResult[] = [];
  for (const i of list) out.push(await computeCoverageAsync(i));
  return out;
}
