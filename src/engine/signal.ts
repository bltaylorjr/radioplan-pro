// Live signal readings: readings typed in, read from a Bluetooth / USB signal meter, read from the phone
// (Android app) or imported from common phone and meter apps. Compared with the prediction at the same spot.
import { parseCsv, findCol, num } from './csv';
import { pointsFromKml, pointsFromGpx } from './fileformats';
import { haversineKm } from './geo';

export type ReadingSource = 'typed' | 'bluetooth' | 'serial' | 'wifi' | 'phone' | 'file';
export interface SignalReading {
  id: string; at: string; dbm: number; source: ReadingSource;
  lat?: number; lon?: number; accM?: number;
  /** Walk / drive / test name the reading belongs to. */
  session: string;
  /** Meter or phone it came from, and what was measured. */
  device?: string; tech?: string; fMHz?: number; channel?: string;
  /** Indoor grid tests: floor, room or grid cell, and whether the spot is a critical area (NFPA 1225: 99%). */
  floor?: string; spot?: string; critical?: boolean;
  note?: string;
}
export const SOURCE_LABEL: Record<ReadingSource, string> = { typed: 'Typed', bluetooth: 'Bluetooth meter', serial: 'USB / COM meter', wifi: 'Wi-Fi meter', phone: 'Phone', file: 'File' };

const rid = () => Math.random().toString(36).slice(2, 10);
const okDbm = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v >= -160 && v <= 30;

/** dBµV across 50 Ω to dBm. */
export const dbuvToDbm = (dbuv: number) => dbuv - 107;

/** A signal level in a line of text from a meter or app: "-87.5 dBm", "RSSI:-87", "33 dBuV". Null when there is none. */
export function parseMeterText(s: string): number | null {
  const t = s.replace(/−/g, '-');
  const withUnit = [...t.matchAll(/(-?\d+(?:\.\d+)?)\s*(dbm|db[µu]v)\b/gi)];
  for (const m of withUnit) { const v = Number(m[1]), dbm = /u|µ/i.test(m[2]) ? dbuvToDbm(v) : v; if (okDbm(dbm)) return Math.round(dbm * 10) / 10; }
  const tagged = t.match(/(?:rssi|rsrp|signal|level|dbm|power|rx)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  if (tagged && okDbm(Number(tagged[1])) && Number(tagged[1]) < 0) return Number(tagged[1]);
  const all = [...t.matchAll(/-\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter((v) => okDbm(v) && v <= -20);
  return all.length ? all[0] : null;
}

export type ByteFormat = 'auto' | 'text' | 'int8' | 'int16le' | 'int16le10' | 'int16le100' | 'float32le';
export const BYTE_FORMATS: [ByteFormat, string][] = [['auto', 'Automatic (recommended)'], ['text', 'Text, like "-87.5 dBm"'], ['int8', '1 byte, signed dBm'], ['int16le', '2 bytes, signed dBm'],
  ['int16le10', '2 bytes, tenths of a dBm'], ['int16le100', '2 bytes, hundredths of a dBm'], ['float32le', '4-byte decimal (float)']];

/** A reading in a Bluetooth notification. `auto` reads printable text first, then the usual binary layouts. */
export function parseMeterBytes(dv: DataView, fmt: ByteFormat = 'auto'): number | null {
  const n = dv.byteLength; if (!n) return null;
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset, n);
  const printable = bytes.every((b) => (b >= 32 && b < 127) || b === 9 || b === 10 || b === 13 || b === 0xb5 || b === 0xc2);
  const tryText = () => parseMeterText(new TextDecoder().decode(bytes));
  const r1 = (v: number) => Math.round(v * 10) / 10;
  switch (fmt) {
    case 'text': return tryText();
    case 'int8': return okDbm(dv.getInt8(0)) ? dv.getInt8(0) : null;
    case 'int16le': return n >= 2 && okDbm(dv.getInt16(0, true)) ? dv.getInt16(0, true) : null;
    case 'int16le10': return n >= 2 && okDbm(dv.getInt16(0, true) / 10) ? r1(dv.getInt16(0, true) / 10) : null;
    case 'int16le100': return n >= 2 && okDbm(dv.getInt16(0, true) / 100) ? r1(dv.getInt16(0, true) / 100) : null;
    case 'float32le': return n >= 4 && okDbm(dv.getFloat32(0, true)) ? r1(dv.getFloat32(0, true)) : null;
  }
  if (printable && n > 1) return tryText();
  if (n === 1) { const v = dv.getInt8(0); return v < 0 && okDbm(v) ? v : null; }
  if (n >= 4) { const f = dv.getFloat32(0, true); if (Number.isFinite(f) && f < -20 && f > -160) return r1(f); }
  if (n >= 2) { const v = dv.getInt16(0, true); if (v < -20 && v > -160) return v; if (v < -200 && v > -1600) return r1(v / 10); if (v < -2000 && v > -16000) return r1(v / 100); }
  return null;
}

/** Splits a text stream (UART over Bluetooth or a COM port) into lines and returns the readings in it. */
export class LineReader {
  private buf = '';
  push(chunk: string): number[] {
    this.buf += chunk; const out: number[] = [];
    const parts = this.buf.split(/\r\n|\n|\r/); this.buf = parts.pop() ?? '';
    for (const l of parts) { const v = parseMeterText(l); if (v != null) out.push(v); }
    if (this.buf.length > 200) { const v = parseMeterText(this.buf); this.buf = ''; if (v != null) out.push(v); }
    return out;
  }
  /** Text left without a line end (some meters never send one). */
  flush(): number | null { const v = parseMeterText(this.buf); this.buf = ''; return v; }
}

export interface ParsedReadings { readings: SignalReading[]; skipped: number; signalColumn: string; app: string }

/** Readings from a file: CSV / TSV from phone apps (G-NetTrack, Network Cell Info, WiGLE, CellMapper-style), meter logs,
 *  GeoJSON, KML or GPX with the level in the name or description. Rows with a floor or room but no GPS are kept (indoor tests). */
export function parseReadingsFile(text: string, fileName = '', session = fileName || 'Imported'): ParsedReadings {
  const t = text.replace(/^﻿/, '').trim();
  const now = new Date().toISOString();
  const mk = (r: Partial<SignalReading> & { dbm: number }): SignalReading => { const o: SignalReading = { id: rid(), source: 'file', session, ...r, at: r.at || now }; for (const k of Object.keys(o) as (keyof SignalReading)[]) if (o[k] === undefined) delete o[k]; return o; };
  if (/^<\?xml|<kml|<gpx/i.test(t.slice(0, 400)) || /\.(kml|gpx)$/i.test(fileName)) {
    const pts = /<gpx/i.test(t.slice(0, 2000)) ? pointsFromGpx(t) : pointsFromKml(t);
    const out: SignalReading[] = []; let skipped = 0;
    for (const p of pts) { const v = parseMeterText(`${p.name} ${p.note ?? ''}`); if (v == null) { skipped++; continue; } out.push(mk({ dbm: v, lat: p.lat, lon: p.lon, note: p.name })); }
    return { readings: out, skipped, signalColumn: 'name / description', app: /<gpx/i.test(t) ? 'GPX' : 'KML' };
  }
  if (t.startsWith('{') || /\.(geo)?json$/i.test(fileName)) {
    const j = JSON.parse(t); const feats = j.type === 'FeatureCollection' ? j.features : [j];
    const out: SignalReading[] = []; let skipped = 0, col = '';
    for (const f of feats) {
      const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : null; const pr = f.properties ?? {};
      const key = Object.keys(pr).find((k) => /^(rssi|rsrp|signal|dbm|level|rxlev|power|strength)/i.test(k.replace(/[^a-z]/gi, '')));
      const v = key ? num(String(pr[key])) : null;
      if (!c || !okDbm(v)) { skipped++; continue; } col = key!;
      out.push(mk({ dbm: v, lon: c[0], lat: c[1], at: pr.time ?? pr.timestamp, tech: pr.tech ?? pr.network }));
    }
    return { readings: out, skipped, signalColumn: col, app: 'GeoJSON' };
  }
  let lines = t.split(/\r?\n/), app = 'Spreadsheet';
  if (/^WigleWifi/i.test(lines[0])) { lines = lines.slice(1); app = 'WiGLE'; }
  // Some apps write a title or comment lines before the header: start at the first line naming latitude or a signal.
  const hdr = lines.findIndex((l) => /lat|signal|rssi|rsrp|level|dbm|floor|room/i.test(l));
  if (hdr > 0) lines = lines.slice(hdr);
  const rows = parseCsv(lines.join('\n')); const h = rows[0] ?? [];
  if (h.some((x) => /^operatorname$/i.test(x)) || h.some((x) => /^networktech$/i.test(x))) app = 'G-NetTrack';
  const la = findCol(h, ['latitude', 'lat', 'currentlatitude', 'gpslat', 'y']), lo = findCol(h, ['longitude', 'lon', 'long', 'lng', 'currentlongitude', 'gpslon', 'x']);
  const sigNames = ['dbm', 'rssi_dbm', 'signal_dbm', 'rsrp', 'rssi', 'level', 'signalstrength', 'signal', 'ss', 'rxlev', 'rxlevel', 'power', 'measured', 'strength', 'dbuv'];
  const sv = findCol(h, sigNames);
  const fl = findCol(h, ['floor', 'level_floor', 'storey']), sp = findCol(h, ['room', 'spot', 'grid', 'cell_id_grid', 'location', 'area']);
  const tm = findCol(h, ['timestamp', 'time', 'datetime', 'date', 'firstseen']), tech = findCol(h, ['networktech', 'technology', 'tech', 'network', 'type', 'mode']);
  const fq = findCol(h, ['frequency_mhz', 'freqmhz', 'frequency', 'freq', 'mhz']), ch = findCol(h, ['channel', 'ssid', 'cellid', 'pci', 'cell']);
  const cr = findCol(h, ['critical', 'criticalarea']), ac = findCol(h, ['accuracy', 'accuracymeters', 'acc', 'hdop']);
  if (sv < 0) throw new Error('No signal column found. The file needs a column such as dBm, RSSI, RSRP, Level or Signal. Found: ' + h.join(', '));
  if ((la < 0 || lo < 0) && fl < 0 && sp < 0) throw new Error('No position found. The file needs latitude and longitude columns, or floor / room columns for an indoor test. Found: ' + h.join(', '));
  const isUv = /dbu|dbµ/i.test(h[sv]);
  const out: SignalReading[] = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    let v = num(r[sv]); if (v != null && isUv) v = dbuvToDbm(v);
    const lat = la >= 0 ? num(r[la]) : null, lon = lo >= 0 ? num(r[lo]) : null;
    const hasPos = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
    const floor = fl >= 0 ? r[fl] : '', spot = sp >= 0 ? r[sp] : '';
    if (!okDbm(v) || v! > 0 || (!hasPos && !floor && !spot)) { skipped++; continue; }
    const f = fq >= 0 ? num(r[fq]) : null;
    out.push(mk({ dbm: Math.round(v! * 10) / 10, ...(hasPos ? { lat: lat!, lon: lon! } : {}), at: tm >= 0 && r[tm] ? r[tm] : undefined,
      tech: tech >= 0 ? r[tech] || undefined : undefined, fMHz: f != null && f > 0 ? f : undefined, channel: ch >= 0 ? r[ch] || undefined : undefined,
      floor: floor || undefined, spot: spot || undefined, critical: cr >= 0 ? /^(y|yes|true|1|x|critical)$/i.test(r[cr]) : undefined,
      accM: ac >= 0 ? num(r[ac]) ?? undefined : undefined }));
  }
  return { readings: out, skipped, signalColumn: h[sv], app };
}

export interface CompareRow { r: SignalReading; predicted: number; delta: number; km: number }
export interface CompareStats { n: number; meanDelta: number; rmsDelta: number; sdDelta: number; within6Pct: number; measuredMean: number; predictedMean: number }

/** Measured − predicted at each reading with a GPS position. `predict` returns NaN where there is no prediction. */
export function compareReadings(rs: SignalReading[], predict: (p: { lat: number; lon: number }) => number, from?: { lat: number; lon: number }): { rows: CompareRow[]; stats: CompareStats } {
  const rows: CompareRow[] = [];
  for (const r of rs) {
    if (r.lat == null || r.lon == null) continue;
    const pr = predict({ lat: r.lat, lon: r.lon }); if (!Number.isFinite(pr)) continue;
    rows.push({ r, predicted: Math.round(pr * 10) / 10, delta: Math.round((r.dbm - pr) * 10) / 10, km: from ? haversineKm(from, { lat: r.lat, lon: r.lon }) : NaN });
  }
  const n = rows.length, d = rows.map((x) => x.delta);
  const mean = n ? d.reduce((a, b) => a + b, 0) / n : NaN;
  return { rows, stats: { n, meanDelta: mean, rmsDelta: n ? Math.sqrt(d.reduce((a, b) => a + b * b, 0) / n) : NaN,
    sdDelta: n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN,
    within6Pct: n ? (100 * d.filter((x) => Math.abs(x) <= 6).length) / n : NaN,
    measuredMean: n ? rows.reduce((a, b) => a + b.r.dbm, 0) / n : NaN, predictedMean: n ? rows.reduce((a, b) => a + b.predicted, 0) / n : NaN } };
}

/** Plain-language verdict on the comparison, for a non-technical user. */
export function compareVerdict(s: CompareStats): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  if (!s.n) return { tone: 'warn', text: 'No readings with GPS inside the prediction area yet.' };
  const m = s.meanDelta;
  if (Math.abs(m) <= 3 && s.sdDelta <= 8) return { tone: 'ok', text: `Readings match the prediction well (on average ${Math.abs(m).toFixed(1)} dB ${m >= 0 ? 'stronger' : 'weaker'}).` };
  if (m > 3) return { tone: 'warn', text: `Real signal is ${m.toFixed(1)} dB stronger than predicted on average: the prediction is cautious. Calibrate to tighten it.` };
  if (m < -3) return { tone: 'bad', text: `Real signal is ${(-m).toFixed(1)} dB weaker than predicted on average. Check the antenna, feeder, power and aim, or calibrate the model.` };
  return { tone: 'warn', text: `Average is close, but readings scatter ±${s.sdDelta.toFixed(1)} dB around the prediction: check for blocked spots.` };
}

export interface GridResult { n: number; pass: number; pct: number; critN: number; critPass: number; critPct: number; floors: { floor: string; n: number; pct: number; critPct: number }[]; generalOk: boolean; criticalOk: boolean }
/** ERCES / BDA grid test: share of readings at or above the minimum signal, general and critical areas, per floor.
 *  NFPA 1225 (2022) §18.8.7 / IFC 510.4.1: 90% of each floor's general areas and 99% of critical areas at ≥ −95 dBm. */
export function gridTest(rs: SignalReading[], minDbm = -95, generalReq = 90, criticalReq = 99): GridResult {
  const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : NaN);
  const gen = rs.filter((r) => !r.critical), crit = rs.filter((r) => r.critical);
  const passG = gen.filter((r) => r.dbm >= minDbm).length, passC = crit.filter((r) => r.dbm >= minDbm).length;
  const floors = [...new Set(rs.map((r) => r.floor || ''))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((f) => {
    const g = gen.filter((r) => (r.floor || '') === f), c = crit.filter((r) => (r.floor || '') === f);
    return { floor: f || '(no floor)', n: g.length + c.length, pct: pct(g.filter((r) => r.dbm >= minDbm).length, g.length), critPct: pct(c.filter((r) => r.dbm >= minDbm).length, c.length) };
  });
  const gp = pct(passG, gen.length), cp = pct(passC, crit.length);
  return { n: gen.length, pass: passG, pct: gp, critN: crit.length, critPass: passC, critPct: cp, floors,
    generalOk: !gen.length || floors.every((f) => !Number.isFinite(f.pct) || f.pct >= generalReq), criticalOk: !crit.length || cp >= criticalReq };
}

/** Inverse-distance-weighted heat map of readings on an n × n grid (row 0 = north). NaN where no reading is within maxKm. */
export function idwGrid(rs: { lat: number; lon: number; v: number }[], n = 80, maxKm = 0.3, power = 2) {
  if (!rs.length) return null;
  let north = Math.max(...rs.map((r) => r.lat)), south = Math.min(...rs.map((r) => r.lat)), east = Math.max(...rs.map((r) => r.lon)), west = Math.min(...rs.map((r) => r.lon));
  const padLat = Math.max((north - south) * 0.08, maxKm / 111 / 2), padLon = Math.max((east - west) * 0.08, maxKm / (111 * Math.cos((north * Math.PI) / 180)) / 2);
  north += padLat; south -= padLat; east += padLon; west -= padLon;
  const out = new Float32Array(n * n).fill(NaN);
  const kx = 111.32 * Math.cos((((north + south) / 2) * Math.PI) / 180), ky = 110.57;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const lat = north - ((i + 0.5) / n) * (north - south), lon = west + ((j + 0.5) / n) * (east - west);
    let w = 0, s = 0, hit = false;
    for (const r of rs) {
      const d = Math.hypot((r.lat - lat) * ky, (r.lon - lon) * kx); if (d > maxKm) continue; hit = true;
      if (d < 1e-4) { w = 1; s = r.v; break; } const k = 1 / d ** power; w += k; s += k * r.v;
    }
    if (hit) out[i * n + j] = s / w;
  }
  return { n, north, south, east, west, v: out };
}

export function readingsCsvRows(rs: SignalReading[], pred?: Map<string, number>): unknown[][] {
  return [['Time', 'Session', 'Signal (dBm)', 'Predicted (dBm)', 'Measured - predicted (dB)', 'Latitude', 'Longitude', 'GPS accuracy (m)', 'Floor', 'Room / grid', 'Critical area', 'Source', 'Device', 'Technology', 'Frequency (MHz)', 'Channel', 'Note'],
    ...rs.map((r) => { const p = pred?.get(r.id); return [r.at, r.session, r.dbm, p ?? '', p != null ? Math.round((r.dbm - p) * 10) / 10 : '', r.lat ?? '', r.lon ?? '', r.accM ?? '', r.floor ?? '', r.spot ?? '', r.critical ? 'yes' : '', SOURCE_LABEL[r.source], r.device ?? '', r.tech ?? '', r.fMHz ?? '', r.channel ?? '', r.note ?? '']; })];
}

/** Colour for measured − predicted: green near zero, blue stronger than predicted, red weaker. */
export function deltaColor(d: number): [number, number, number] {
  if (d >= 6) return [37, 99, 235]; if (d >= 3) return [96, 165, 250]; if (d > -3) return [22, 163, 74]; if (d > -6) return [245, 158, 11]; return [220, 38, 38];
}
