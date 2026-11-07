// GIS exports: GeoJSON (RFC 7946), KML 2.2 / KMZ, ESRI Shapefile (.shp/.shx/.dbf/.prj in a .zip),
// PNG + world file, and CSV grid. All WGS84 longitude/latitude.
import type { Site, SurveyPoint } from '../types';
import type { CoverageResult } from './coverage';
import { contourSegments, joinSegments, areaRectangles, ResolvedTier, mapLevel } from './acceptance';
import { toCsv } from './csv';

// ---------- ZIP (store, no compression) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const enc = (s: string) => new TextEncoder().encode(s);
export function zip(files: { name: string; data: Uint8Array | string }[]): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = []; let off = 0;
  for (const f of files) {
    const data = typeof f.data === 'string' ? enc(f.data) : f.data, name = enc(f.name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), name, data); central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, u) => s + u.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((s, u) => s + u.length, 0));
  let p = 0; for (const u of all) { out.set(u, p); p += u.length; }
  return out;
}

// ---------- Layer model ----------
export interface ExportLayers { sites: Site[]; coverage?: CoverageResult | null; tiers?: ResolvedTier[]; survey?: SurveyPoint[]; title: string }
type Ring = [number, number][];
export interface Feature { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'MultiLineString'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] }; properties: Record<string, string | number | boolean | null> }

export function buildFeatures(l: ExportLayers) {
  const sites: Feature[] = l.sites.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { layer: 'site', name: s.name, ground_m: s.groundElevM, agl_m: s.antennaAglM, struct_m: s.structureHeightM, structure: s.structure, freq_mhz: s.tx?.fMHz ?? null, power_dbm: s.tx?.txPowerDbm ?? null, azimuth: s.tx?.azimuthDeg ?? null, channel: s.tx?.channel ?? null } }));
  const contours: Feature[] = [], areas: Feature[] = [];
  if (l.coverage && l.tiers) for (const t of l.tiers) {
    const lvl = mapLevel(t), props = { layer: 'contour', tier: t.label, level_dbm: lvl, crit_dbm: t.dbm, loss_db: t.extraLossDb, req_pct: t.requiredPct };
    const lines = joinSegments(contourSegments(l.coverage, l.coverage.rssi, lvl)).map((ln) => ln.map(([la, lo]) => [lo, la] as [number, number]));
    if (lines.length) contours.push({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: lines }, properties: props });
    const rects = areaRectangles(l.coverage, l.coverage.rssi, lvl);
    if (rects.length) areas.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: rects.map((r) => [r]) }, properties: { ...props, layer: 'service_area' } });
  }
  const survey: Feature[] = (l.survey ?? []).map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { layer: 'survey', rssi_dbm: p.rssiDbm, time: p.t ?? null } }));
  return { sites, contours, areas, survey };
}

export function toGeoJson(l: ExportLayers): string {
  const f = buildFeatures(l);
  return JSON.stringify({ type: 'FeatureCollection', name: l.title, features: [...f.areas, ...f.contours, ...f.sites, ...f.survey] });
}

// ---------- KML ----------
const x = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
/** '#rrggbb' + alpha (0-255) → KML aabbggrr */
export function kmlColor(hex: string, a = 255): string { const h = hex.replace('#', ''); return a.toString(16).padStart(2, '0') + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); }
const coords = (r: Ring) => r.map(([lo, la]) => `${lo.toFixed(7)},${la.toFixed(7)},0`).join(' ');
export function toKml(l: ExportLayers, overlay?: { href: string }): string {
  const f = buildFeatures(l), tiers = l.tiers ?? [];
  const styles = tiers.map((t, i) => `<Style id="t${i}"><LineStyle><color>${kmlColor(t.color)}</color><width>2.5</width></LineStyle><PolyStyle><color>${kmlColor(t.color, 70)}</color><outline>0</outline></PolyStyle></Style>`).join('');
  const tierIdx = (lbl: unknown) => Math.max(0, tiers.findIndex((t) => t.label === lbl));
  const desc = (p: Feature['properties']) => `<![CDATA[${Object.entries(p).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join('<br>')}]]>`;
  const pm = (ft: Feature, style: string, name: string) => {
    const g = ft.geometry;
    const geom = g.type === 'Point' ? `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point>`
      : g.type === 'MultiLineString' ? `<MultiGeometry>${g.coordinates.map((ln) => `<LineString><tessellate>1</tessellate><coordinates>${coords(ln)}</coordinates></LineString>`).join('')}</MultiGeometry>`
      : `<MultiGeometry>${g.coordinates.map((poly) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(poly[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`).join('')}</MultiGeometry>`;
    return `<Placemark><name>${x(name)}</name><styleUrl>#${style}</styleUrl><description>${desc(ft.properties)}</description>${geom}</Placemark>`;
  };
  const folder = (name: string, body: string, visible = true) => body ? `<Folder><name>${x(name)}</name><visibility>${visible ? 1 : 0}</visibility>${body}</Folder>` : '';
  const ov = overlay && l.coverage ? `<GroundOverlay><name>Predicted signal (heat map)</name><color>b4ffffff</color><Icon><href>${x(overlay.href)}</href></Icon><LatLonBox><north>${l.coverage.north}</north><south>${l.coverage.south}</south><east>${l.coverage.east}</east><west>${l.coverage.west}</west></LatLonBox></GroundOverlay>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(l.title)}</name>
<Style id="site"><IconStyle><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/target.png</href></Icon></IconStyle></Style>
<Style id="survey"><IconStyle><scale>0.5</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>${styles}
${ov}
${folder('Service areas', f.areas.map((a) => pm(a, `t${tierIdx(a.properties.tier)}`, `${a.properties.tier} (≥ ${a.properties.level_dbm} dBm)`)).join(''))}
${folder('Service contours', f.contours.map((a) => pm(a, `t${tierIdx(a.properties.tier)}`, `${a.properties.tier} contour`)).join(''))}
${folder('Sites', f.sites.map((s) => pm(s, 'site', String(s.properties.name))).join(''))}
${folder('Field survey', f.survey.map((s) => pm(s, 'survey', `${s.properties.rssi_dbm} dBm`)).join(''), false)}
</Document></kml>`;
}

// ---------- Shapefile ----------
export const WGS84_PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
type ShpGeom = { type: 1; pt: [number, number] } | { type: 3 | 5; parts: Ring[] };
interface DbfField { name: string; type: 'C' | 'N'; len: number; dec: number }

function bbox(pts: [number, number][]) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [px, py] of pts) { a = Math.min(a, px); b = Math.min(b, py); c = Math.max(c, px); d = Math.max(d, py); } return pts.length ? [a, b, c, d] : [0, 0, 0, 0]; }
export function writeShapefile(shapeType: 1 | 3 | 5, geoms: ShpGeom[], fields: DbfField[], rows: (string | number | null)[][]): { shp: Uint8Array; shx: Uint8Array; dbf: Uint8Array } {
  const contents = geoms.map((g) => {
    if (g.type === 1) { const v = new DataView(new ArrayBuffer(20)); v.setInt32(0, 1, true); v.setFloat64(4, g.pt[0], true); v.setFloat64(12, g.pt[1], true); return { buf: v, pts: [g.pt] }; }
    const pts = g.parts.flat(), np = g.parts.length, len = 44 + 4 * np + 16 * pts.length, v = new DataView(new ArrayBuffer(len)), bb = bbox(pts);
    v.setInt32(0, g.type, true); bb.forEach((b, i) => v.setFloat64(4 + 8 * i, b, true)); v.setInt32(36, np, true); v.setInt32(40, pts.length, true);
    let idx = 0; g.parts.forEach((p, i) => { v.setInt32(44 + 4 * i, idx, true); idx += p.length; });
    pts.forEach(([px, py], i) => { v.setFloat64(44 + 4 * np + 16 * i, px, true); v.setFloat64(52 + 4 * np + 16 * i, py, true); });
    return { buf: v, pts };
  });
  const all = contents.flatMap((c) => c.pts) as [number, number][], bb = bbox(all);
  const header = (lenBytes: number) => { const v = new DataView(new ArrayBuffer(100)); v.setInt32(0, 9994, false); v.setInt32(24, lenBytes / 2, false); v.setInt32(28, 1000, true); v.setInt32(32, shapeType, true); bb.forEach((b, i) => v.setFloat64(36 + 8 * i, b, true)); return new Uint8Array(v.buffer); };
  const shpLen = 100 + contents.reduce((s, c) => s + 8 + c.buf.byteLength, 0);
  const shp = new Uint8Array(shpLen), shx = new Uint8Array(100 + 8 * contents.length);
  shp.set(header(shpLen)); shx.set(header(shx.length));
  let off = 100; const sv = new DataView(shp.buffer), xv = new DataView(shx.buffer);
  contents.forEach((c, i) => {
    sv.setInt32(off, i + 1, false); sv.setInt32(off + 4, c.buf.byteLength / 2, false); shp.set(new Uint8Array(c.buf.buffer), off + 8);
    xv.setInt32(100 + 8 * i, off / 2, false); xv.setInt32(104 + 8 * i, c.buf.byteLength / 2, false);
    off += 8 + c.buf.byteLength;
  });
  // dBase III
  const recLen = 1 + fields.reduce((s, f) => s + f.len, 0), hdrLen = 32 + 32 * fields.length + 1;
  const dbf = new Uint8Array(hdrLen + recLen * rows.length + 1), dv = new DataView(dbf.buffer), now = new Date();
  dbf[0] = 3; dbf[1] = now.getFullYear() - 1900; dbf[2] = now.getMonth() + 1; dbf[3] = now.getDate();
  dv.setInt32(4, rows.length, true); dv.setInt16(8, hdrLen, true); dv.setInt16(10, recLen, true);
  fields.forEach((f, i) => { const o = 32 + 32 * i; dbf.set(enc(f.name.slice(0, 10)), o); dbf[o + 11] = f.type.charCodeAt(0); dbf[o + 16] = f.len; dbf[o + 17] = f.dec; });
  dbf[hdrLen - 1] = 0x0d;
  rows.forEach((r, ri) => {
    let o = hdrLen + ri * recLen; dbf[o++] = 0x20;
    fields.forEach((f, fi) => {
      const v = r[fi]; let s = v == null ? '' : f.type === 'N' ? Number(v).toFixed(f.dec) : String(v);
      let b = enc(s); while (b.length > f.len) { s = s.slice(0, -1); b = enc(s); }
      const cell = new Uint8Array(f.len).fill(0x20); if (f.type === 'N') cell.set(b, f.len - b.length); else cell.set(b);
      dbf.set(cell, o); o += f.len;
    });
  });
  dbf[dbf.length - 1] = 0x1a;
  return { shp, shx, dbf };
}

const cw = (r: Ring): Ring => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += (r[i + 1][0] - r[i][0]) * (r[i + 1][1] + r[i][1]); return a > 0 ? r : [...r].reverse(); };
/** Zip with one shapefile set per non-empty layer: sites (points), service_areas (polygons), contours (lines), survey (points). */
export function toShapefileZip(l: ExportLayers): Uint8Array {
  const f = buildFeatures(l), files: { name: string; data: Uint8Array | string }[] = [];
  const add = (base: string, t: 1 | 3 | 5, feats: Feature[], fields: DbfField[], row: (p: Feature['properties']) => (string | number | null)[]) => {
    if (!feats.length) return;
    const geoms: ShpGeom[] = feats.map((ft) => ft.geometry.type === 'Point' ? { type: 1, pt: ft.geometry.coordinates } : ft.geometry.type === 'MultiLineString' ? { type: 3, parts: ft.geometry.coordinates } : { type: 5, parts: ft.geometry.coordinates.map((p) => cw(p[0])) });
    const s = writeShapefile(t, geoms, fields, feats.map((ft) => row(ft.properties)));
    files.push({ name: `${base}.shp`, data: s.shp }, { name: `${base}.shx`, data: s.shx }, { name: `${base}.dbf`, data: s.dbf }, { name: `${base}.prj`, data: WGS84_PRJ }, { name: `${base}.cpg`, data: 'UTF-8' });
  };
  const C = (name: string, len = 60): DbfField => ({ name, type: 'C', len, dec: 0 }), N = (name: string, dec = 1): DbfField => ({ name, type: 'N', len: 12, dec });
  add('sites', 1, f.sites, [C('NAME'), N('GROUND_M'), N('AGL_M'), N('STRUCT_M'), C('STRUCTURE', 24), N('FREQ_MHZ', 4), N('POWER_DBM'), N('AZIMUTH'), C('CHANNEL', 16)],
    (p) => [p.name as string, p.ground_m as number, p.agl_m as number, p.struct_m as number, p.structure as string, p.freq_mhz as number, p.power_dbm as number, p.azimuth as number, p.channel as string]);
  const tf = [C('TIER'), N('LEVEL_DBM'), N('CRIT_DBM'), N('LOSS_DB'), N('REQ_PCT')], tr = (p: Feature['properties']) => [p.tier as string, p.level_dbm as number, p.crit_dbm as number, p.loss_db as number, p.req_pct as number];
  add('service_areas', 5, f.areas, tf, tr);
  add('contours', 3, f.contours, tf, tr);
  add('survey', 1, f.survey, [N('RSSI_DBM'), C('TIME', 32)], (p) => [p.rssi_dbm as number, p.time as string]);
  return zip(files);
}

/** World file (.pgw) for a north-up PNG of the coverage grid. */
export function worldFile(c: CoverageResult): string {
  const dx = (c.east - c.west) / c.n, dy = (c.north - c.south) / c.n;
  return [dx, 0, 0, -dy, c.west + dx / 2, c.north - dy / 2].map((v) => v.toFixed(10)).join('\n') + '\n';
}
export function gridCsv(c: CoverageResult): string {
  const rows: (string | number)[][] = [['latitude', 'longitude', 'rssi_dbm']];
  for (let r = 0; r < c.n; r++) for (let k = 0; k < c.n; k++) { const v = c.rssi[r * c.n + k]; if (Number.isNaN(v)) continue; rows.push([(c.north - ((r + 0.5) / c.n) * (c.north - c.south)).toFixed(6), (c.west + ((k + 0.5) / c.n) * (c.east - c.west)).toFixed(6), v.toFixed(1)]); }
  return toCsv(rows);
}
