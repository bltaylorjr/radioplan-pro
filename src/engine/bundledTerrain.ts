// Terrain shipped inside the app for the default area (Asheville, NC), so 3D views work offline from the first start.
import type { DemGrid } from './terrain';
import type { Bounds } from './autoterrain';

let cache: Promise<DemGrid | null> | null = null;

/** Decode the bundled grid (gzip + row delta Int16). Null if this device cannot unzip (very old browser). */
export function bundledDem(): Promise<DemGrid | null> {
  if (!cache) cache = (async () => {
    if (typeof DecompressionStream === 'undefined') return null;
    const { AVL_DEM, AVL_DEM_GZ_B64 } = await import('../data/ashevilleTerrain');
    const bin = Uint8Array.from(atob(AVL_DEM_GZ_B64), (c) => c.charCodeAt(0));
    const buf = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return decodeDeltaRows(buf, AVL_DEM.ncols, AVL_DEM.nrows, AVL_DEM.west, AVL_DEM.north, AVL_DEM.cellDeg);
  })().catch(() => null);
  return cache;
}

export function decodeDeltaRows(buf: ArrayBuffer, ncols: number, nrows: number, west: number, north: number, cellDeg: number): DemGrid {
  const dv = new DataView(buf), data = new Float32Array(ncols * nrows);
  for (let r = 0; r < nrows; r++) { let v = 0; for (let c = 0; c < ncols; c++) { const i = r * ncols + c; v += dv.getInt16(i * 2, true); data[i] = v; } }
  return { name: 'Built-in terrain (Asheville area)', ncols, nrows, west, north, cellDeg, data, nodata: -32768, source: 'Built-in USGS 3DEP terrain, Asheville area (~60 m, works offline)' };
}

/** Cut a box out of a grid, clipped to the grid (null if they do not overlap). */
export function cropDem(g: DemGrid, b: Bounds): DemGrid | null {
  const cy = g.cellDegY ?? g.cellDeg;
  const c0 = Math.floor((b.west - g.west) / g.cellDeg), c1 = Math.ceil((b.east - g.west) / g.cellDeg);
  const r0 = Math.floor((g.north - b.north) / cy), r1 = Math.ceil((g.north - b.south) / cy);
  const cc0 = Math.max(0, c0), cc1 = Math.min(g.ncols, c1), rr0 = Math.max(0, r0), rr1 = Math.min(g.nrows, r1);
  if (cc1 - cc0 < 2 || rr1 - rr0 < 2) return null;
  return cropIdx(g, cc0, cc1, rr0, rr1, cy);
}
function cropIdx(g: DemGrid, c0: number, c1: number, r0: number, r1: number, cy: number): DemGrid {
  const nc = c1 - c0, nr = r1 - r0, data = new Float32Array(nc * nr);
  for (let r = 0; r < nr; r++) data.set(g.data.subarray((r0 + r) * g.ncols + c0, (r0 + r) * g.ncols + c1), r * nc);
  return { ...g, ncols: nc, nrows: nr, west: g.west + c0 * g.cellDeg, north: g.north - r0 * cy, data };
}
