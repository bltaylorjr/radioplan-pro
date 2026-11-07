// Terrain models: DEM grids (ESRI ASCII, SRTM .hgt, GeoTIFF), LiDAR LAS -> DSM gridding,
// online elevation lookup, and path-profile clearance analysis.
import { LatLon, haversineKm, interpolate, utmToLatLon } from './geo';
import { earthBulgeM, fresnelRadiusM, diffractionV, knifeEdgeLossDb } from './rf';

/** Geographic grid (WGS84 degrees). Row 0 is the NORTH edge. */
export interface DemGrid {
  name: string; ncols: number; nrows: number;
  west: number; north: number; cellDeg: number; cellDegY?: number;
  data: Float32Array; nodata: number; source: string;
}

export function demBounds(g: DemGrid) {
  const cy = g.cellDegY ?? g.cellDeg;
  return { west: g.west, east: g.west + g.ncols * g.cellDeg, north: g.north, south: g.north - g.nrows * cy };
}

/** Bilinear elevation (m) or null when outside the grid / nodata. */
export function sampleDem(g: DemGrid, p: LatLon): number | null {
  const cy = g.cellDegY ?? g.cellDeg;
  const x = (p.lon - g.west) / g.cellDeg - 0.5, y = (g.north - p.lat) / cy - 0.5;
  if (x < -0.5 || y < -0.5 || x > g.ncols - 0.5 || y > g.nrows - 0.5) return null;
  const x0 = Math.max(0, Math.min(g.ncols - 1, Math.floor(x))), y0 = Math.max(0, Math.min(g.nrows - 1, Math.floor(y)));
  const x1 = Math.min(g.ncols - 1, x0 + 1), y1 = Math.min(g.nrows - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
  const v = (c: number, r: number) => g.data[r * g.ncols + c];
  const vals = [v(x0, y0), v(x1, y0), v(x0, y1), v(x1, y1)];
  if (vals.some((z) => z === g.nodata || Number.isNaN(z))) {
    const ok = vals.filter((z) => z !== g.nodata && !Number.isNaN(z));
    return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
  }
  return (vals[0] * (1 - fx) + vals[1] * fx) * (1 - fy) + (vals[2] * (1 - fx) + vals[3] * fx) * fy;
}

/** ESRI ASCII grid (.asc) in geographic coordinates. */
export function parseEsriAscii(text: string, name = 'grid.asc'): DemGrid {
  const lines = text.split(/\r?\n/);
  const hdr: Record<string, number> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].trim().match(/^([a-zA-Z_]+)\s+(-?[\d.eE+-]+)$/);
    if (!m) break;
    hdr[m[1].toLowerCase()] = parseFloat(m[2]);
  }
  const ncols = hdr.ncols, nrows = hdr.nrows, cell = hdr.cellsize;
  if (!ncols || !nrows || !cell) throw new Error('Not an ESRI ASCII grid (missing ncols/nrows/cellsize).');
  const west = hdr.xllcorner ?? hdr.xllcenter - cell / 2;
  const south = hdr.yllcorner ?? hdr.yllcenter - cell / 2;
  if (Math.abs(west) > 180 || Math.abs(south) > 90) throw new Error('Grid appears projected; export it in WGS84 (EPSG:4326) geographic degrees.');
  const data = new Float32Array(ncols * nrows);
  let k = 0;
  for (; i < lines.length && k < data.length; i++) for (const t of lines[i].trim().split(/\s+/)) if (t) data[k++] = parseFloat(t);
  return { name, ncols, nrows, west, north: south + nrows * cell, cellDeg: cell, data, nodata: hdr.nodata_value ?? -9999, source: 'ESRI ASCII' };
}

/** SRTM / NASADEM .hgt tile (1201x1201 = 3", 3601x3601 = 1"). Name like N35W080.hgt gives SW corner. */
export function parseHgt(buf: ArrayBuffer, filename: string): DemGrid {
  const m = filename.toUpperCase().match(/([NS])(\d{2})([EW])(\d{3})/);
  if (!m) throw new Error('HGT filename must contain the tile corner, e.g. N35W080.hgt');
  const n = Math.round(Math.sqrt(buf.byteLength / 2));
  if (n * n * 2 !== buf.byteLength) throw new Error('Unexpected .hgt size');
  const lat = (m[1] === 'S' ? -1 : 1) * parseInt(m[2], 10), lon = (m[3] === 'W' ? -1 : 1) * parseInt(m[4], 10);
  const dv = new DataView(buf), data = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { const v = dv.getInt16(i * 2, false); data[i] = v === -32768 ? -9999 : v; }
  const cell = 1 / (n - 1);
  // .hgt samples are cell centres on integer degree lines; shift half a cell.
  return { name: filename, ncols: n, nrows: n, west: lon - cell / 2, north: lat + 1 + cell / 2, cellDeg: cell, data, nodata: -9999, source: n > 2000 ? 'SRTM 1 arc-second' : 'SRTM 3 arc-second' };
}

/** GeoTIFF DEM in EPSG:4326 (e.g. USGS 3DEP 1/3" or 1" GeoTIFF). */
export async function parseGeoTiff(buf: ArrayBuffer, name: string): Promise<DemGrid> {
  const { fromArrayBuffer } = await import('geotiff');
  const tiff = await fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const [west, south, east, north] = img.getBoundingBox();
  if (Math.abs(west) > 180 || Math.abs(north) > 90) throw new Error('GeoTIFF is projected; reproject to EPSG:4326 (e.g. gdalwarp -t_srs EPSG:4326).');
  const ras = (await img.readRasters({ samples: [0], interleave: true })) as unknown as ArrayLike<number>;
  const ncols = img.getWidth(), nrows = img.getHeight();
  const nd = img.getGDALNoData();
  const data = Float32Array.from(ras as ArrayLike<number>);
  return { name, ncols, nrows, west, north, cellDeg: (east - west) / ncols, cellDegY: (north - south) / nrows, data, nodata: nd ?? -9999, source: 'GeoTIFF' };
}

export interface LasOptions { utmZone?: number; northern?: boolean; zUnitsFeet?: boolean; cellM?: number; mode?: 'dsm' | 'dtm' }

/** Read a LAS 1.0-1.4 point cloud and grid it into a surface model (DSM = max Z, DTM = class 2 ground min Z). */
export function parseLas(buf: ArrayBuffer, name: string, o: LasOptions = {}): DemGrid {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'LASF') throw new Error('Not a LAS file (LAZ must be decompressed first, e.g. laszip).');
  const offset = dv.getUint32(96, true), fmt = dv.getUint8(104) & 0x3f, recLen = dv.getUint16(105, true);
  let count = dv.getUint32(107, true);
  const minor = dv.getUint8(25);
  if (count === 0 && minor >= 4) count = Number(dv.getBigUint64(247, true));
  const sx = dv.getFloat64(131, true), sy = dv.getFloat64(139, true), sz = dv.getFloat64(147, true);
  const ox = dv.getFloat64(155, true), oy = dv.getFloat64(163, true), oz = dv.getFloat64(171, true);
  const maxX = dv.getFloat64(179, true), minX = dv.getFloat64(187, true), maxY = dv.getFloat64(195, true), minY = dv.getFloat64(203, true);
  const geographic = Math.abs(maxX) <= 180 && Math.abs(maxY) <= 90;
  if (!geographic && !o.utmZone) throw new Error('LAS is projected. Enter its UTM zone (state-plane files: reproject to UTM or WGS84 first).');
  const toLL = (x: number, y: number) => (geographic ? { lat: y, lon: x } : utmToLatLon(x, y, o.utmZone!, o.northern ?? true));
  const sw = toLL(minX, minY), ne = toLL(maxX, maxY);
  const cellM = o.cellM ?? 2;
  const cellDegY = cellM / 111320, cellDeg = cellM / (111320 * Math.cos((((sw.lat + ne.lat) / 2) * Math.PI) / 180));
  const ncols = Math.max(1, Math.ceil((ne.lon - sw.lon) / cellDeg)), nrows = Math.max(1, Math.ceil((ne.lat - sw.lat) / cellDegY));
  if (ncols * nrows > 25e6) throw new Error('Grid too large; increase cell size.');
  const data = new Float32Array(ncols * nrows).fill(NaN);
  const zf = o.zUnitsFeet ? 0.3048 : 1, dtm = o.mode === 'dtm';
  const classOff = fmt >= 6 ? 16 : 15;
  for (let i = 0; i < count; i++) {
    const b = offset + i * recLen;
    if (b + 20 > buf.byteLength) break;
    if (dtm) { const cls = dv.getUint8(b + classOff) & (fmt >= 6 ? 0xff : 0x1f); if (cls !== 2) continue; }
    const ll = toLL(dv.getInt32(b, true) * sx + ox, dv.getInt32(b + 4, true) * sy + oy);
    const z = (dv.getInt32(b + 8, true) * sz + oz) * zf;
    const c = Math.floor((ll.lon - sw.lon) / cellDeg), r = Math.floor((ne.lat - ll.lat) / cellDegY);
    if (c < 0 || r < 0 || c >= ncols || r >= nrows) continue;
    const k = r * ncols + c, cur = data[k];
    if (Number.isNaN(cur) || (dtm ? z < cur : z > cur)) data[k] = z;
  }
  return { name, ncols, nrows, west: sw.lon, north: ne.lat, cellDeg, cellDegY, data, nodata: NaN, source: `LiDAR LAS ${dtm ? 'DTM (ground class 2)' : 'DSM (first/max return)'}` };
}

/** Online elevation lookup (Open-Meteo, Copernicus GLO-90 DEM). Batches of 100. Requires internet. */
export async function fetchElevations(points: LatLon[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p.lat.toFixed(6)).join(',')}&longitude=${chunk.map((p) => p.lon.toFixed(6)).join(',')}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Elevation service HTTP ${r.status}`);
    const j = await r.json();
    out.push(...(j.elevation as number[]));
  }
  return out;
}

export interface ProfilePoint { dKm: number; groundM: number; lat: number; lon: number }
export interface ProfileAnalysis {
  points: (ProfilePoint & { losM: number; bulgeM: number; effGroundM: number; f1M: number; clearanceM: number; clearancePct: number })[];
  distanceKm: number; minClearancePct: number; worstIndex: number; los: boolean; meets60: boolean;
  diffractionLossDb: number; worstV: number;
}

export function buildProfile(a: LatLon, b: LatLon, n: number, elev: (p: LatLon) => number | null): ProfilePoint[] {
  const D = haversineKm(a, b), pts: ProfilePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = interpolate(a, b, t);
    pts.push({ dKm: D * t, groundM: elev(p) ?? 0, lat: p.lat, lon: p.lon });
  }
  return pts;
}

/**
 * Line-of-sight & Fresnel analysis over a terrain profile with earth bulge (k-factor).
 * Antenna heights are AGL at each end; clutterM is added to intermediate ground (trees/buildings).
 */
export function analyzeProfile(profile: ProfilePoint[], txAglM: number, rxAglM: number, fMHz: number, k = 4 / 3, clutterM = 0): ProfileAnalysis {
  const D = profile[profile.length - 1].dKm;
  const hA = profile[0].groundM + txAglM, hB = profile[profile.length - 1].groundM + rxAglM;
  let minPct = Infinity, worst = 0, worstV = -Infinity, worstVd = 0, worstH = 0;
  const points = profile.map((p, i) => {
    const d1 = p.dKm, d2 = D - p.dKm;
    const bulge = earthBulgeM(d1, d2, k);
    const interior = i > 0 && i < profile.length - 1;
    const eff = p.groundM + bulge + (interior ? clutterM : 0);
    const los = hA + ((hB - hA) * d1) / D;
    const f1 = fresnelRadiusM(d1, d2, fMHz);
    const clr = los - eff;
    const pct = f1 > 0 ? (clr / f1) * 100 : Infinity;
    if (interior) {
      if (pct < minPct) { minPct = pct; worst = i; }
      const v = diffractionV(-clr, d1, d2, fMHz);
      if (v > worstV) { worstV = v; worstVd = d1; worstH = -clr; }
    }
    return { ...p, losM: los, bulgeM: bulge, effGroundM: eff, f1M: f1, clearanceM: clr, clearancePct: pct };
  });
  void worstVd; void worstH;
  return {
    points, distanceKm: D, minClearancePct: minPct === Infinity ? 100 : minPct, worstIndex: worst,
    los: points.every((p, i) => i === 0 || i === points.length - 1 || p.clearanceM > 0),
    meets60: minPct >= 60, diffractionLossDb: knifeEdgeLossDb(worstV), worstV,
  };
}

/** Build a DemGrid from a rectangular fetch of online elevations (for 3D view & coverage when no file is loaded). */
export async function fetchDemArea(center: LatLon, radiusKm: number, n = 40): Promise<DemGrid> {
  const dLat = radiusKm / 111.32, dLon = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const cellDeg = (2 * dLon) / n, cellDegY = (2 * dLat) / n;
  const north = center.lat + dLat, west = center.lon - dLon;
  const pts: LatLon[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) pts.push({ lat: north - (r + 0.5) * cellDegY, lon: west + (c + 0.5) * cellDeg });
  const z = await fetchElevations(pts);
  return { name: `Online DEM ${radiusKm} km`, ncols: n, nrows: n, west, north, cellDeg, cellDegY, data: Float32Array.from(z), nodata: -9999, source: 'Open-Meteo / Copernicus GLO-90' };
}
