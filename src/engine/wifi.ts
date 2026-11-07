// Indoor / outdoor Wi-Fi survey: parse scan output from common tools, then build floor-plan
// heat maps for signal, noise, SNR, channel, access point and co-channel views.
// Browsers (and Android web views) cannot scan Wi-Fi, so readings come from pasted/imported scan files.
import type { WifiAp, WifiReading } from '../types';
import { parseCsv, findCol, num } from './csv';
import { uid } from '../defaults';

export function freqToChannel(mhz: number): number {
  if (mhz >= 2412 && mhz <= 2472) return Math.round((mhz - 2407) / 5);
  if (mhz === 2484) return 14;
  if (mhz >= 5955 && mhz <= 7115) return Math.round((mhz - 5950) / 5);
  if (mhz >= 5000 && mhz < 5950) return Math.round((mhz - 5000) / 5);
  return 0;
}
export function bandOf(ch: number, band?: string, freq?: number): string {
  if (band) return /6/.test(band) && !/2\.4/.test(band) ? '6 GHz' : /5/.test(band) ? '5 GHz' : '2.4 GHz';
  if (freq) return freq < 3000 ? '2.4 GHz' : freq >= 5925 ? '6 GHz' : '5 GHz';
  return ch <= 14 ? '2.4 GHz' : '5 GHz';
}
/** Windows / NetworkManager report signal quality in %; common linear mapping dBm = q/2 − 100. */
export const qualityToDbm = (q: number) => Math.round(q / 2 - 100);
const MAC = /([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i;

export type ScanFormat = 'netsh' | 'nmcli' | 'iw' | 'airport' | 'airport-I' | 'csv' | 'unknown';
export function detectFormat(t: string): ScanFormat {
  if (/^\s*SSID \d+ :/m.test(t) && /BSSID \d+\s*:/m.test(t)) return 'netsh';
  if (/^BSS [0-9a-f:]{17}/m.test(t)) return 'iw';
  if (/agrCtlRSSI/.test(t)) return 'airport-I';
  if (/^\s*SSID\s+BSSID\s+RSSI\s+CHANNEL/m.test(t)) return 'airport';
  if (/BSSID/.test(t) && /CHAN/.test(t) && /SIGNAL/.test(t)) return 'nmcli';
  if (/^[^\n]*(bssid|mac)[^\n]*[,;\t|]/im.test(t)) return 'csv';
  if (/^[^:\n]*:([0-9A-F]{2}\\:){5}[0-9A-F]{2}:\d+:\d+/im.test(t)) return 'nmcli';
  return 'unknown';
}

/** Parse one scan (one location) from the output of a scanning tool. */
export function parseScan(t: string): { aps: WifiAp[]; format: ScanFormat } {
  const fmt = detectFormat(t), aps: WifiAp[] = [];
  if (fmt === 'netsh') {
    let ssid = '', cur: Partial<WifiAp> | null = null;
    const flush = () => { if (cur?.bssid && cur.rssiDbm != null) aps.push({ ssid, bssid: cur.bssid, channel: cur.channel ?? 0, band: bandOf(cur.channel ?? 0, cur.band), rssiDbm: cur.rssiDbm }); cur = null; };
    for (const line of t.split(/\r?\n/)) {
      const m = line.match(/^\s*([^:]+?)\s*:\s*(.*)$/); if (!m) continue;
      const k = m[1].trim(), v = m[2].trim();
      if (/^SSID \d+$/.test(k)) { flush(); ssid = v; }
      else if (/^BSSID \d+$/.test(k)) { flush(); cur = { bssid: v.toLowerCase() }; }
      else if (cur && /^Signal$/i.test(k)) cur.rssiDbm = qualityToDbm(num(v) ?? 0);
      else if (cur && /^Channel$/i.test(k)) cur.channel = num(v) ?? 0;
      else if (cur && /^Band$/i.test(k)) cur.band = v;
    }
    flush();
  } else if (fmt === 'iw') {
    let cur: Partial<WifiAp> & { freq?: number } | null = null;
    const flush = () => { if (cur?.bssid && cur.rssiDbm != null) { const ch = cur.channel || freqToChannel(cur.freq ?? 0); aps.push({ ssid: cur.ssid ?? '', bssid: cur.bssid, channel: ch, band: bandOf(ch, undefined, cur.freq), rssiDbm: cur.rssiDbm }); } cur = null; };
    for (const line of t.split(/\r?\n/)) {
      let m;
      if ((m = line.match(/^BSS ([0-9a-f:]{17})/i))) { flush(); cur = { bssid: m[1].toLowerCase() }; }
      else if (!cur) continue;
      else if ((m = line.match(/^\s*signal:\s*(-?[\d.]+)\s*dBm/))) cur.rssiDbm = Math.round(Number(m[1]));
      else if ((m = line.match(/^\s*SSID:\s?(.*)$/))) cur.ssid = m[1];
      else if ((m = line.match(/^\s*freq:\s*([\d.]+)/))) cur.freq = Number(m[1]);
      else if ((m = line.match(/(?:DS Parameter set: channel|primary channel:)\s*(\d+)/))) cur.channel = Number(m[1]);
    }
    flush();
  } else if (fmt === 'airport-I') {
    const g = (k: string) => t.match(new RegExp(`^\\s*${k}:\\s*(.*)$`, 'm'))?.[1]?.trim();
    const ch = num(g('channel')?.split(',')[0]) ?? 0;
    aps.push({ ssid: g('SSID') ?? '', bssid: (g('BSSID') ?? '').toLowerCase(), channel: ch, band: bandOf(ch), rssiDbm: num(g('agrCtlRSSI')) ?? -100, noiseDbm: num(g('agrCtlNoise')) ?? undefined });
  } else if (fmt === 'airport') {
    for (const line of t.split(/\r?\n/)) {
      const m = line.match(/^\s*(.*?)\s+((?:[0-9a-f]{2}:){5}[0-9a-f]{2})\s+(-?\d+)\s+(\d+)/i);
      if (m) { const ch = Number(m[4]); aps.push({ ssid: m[1], bssid: m[2].toLowerCase(), rssiDbm: Number(m[3]), channel: ch, band: bandOf(ch) }); }
    }
  } else if (fmt === 'nmcli') {
    const lines = t.split(/\r?\n/).filter((l) => l.trim());
    const hi = lines.findIndex((l) => /BSSID/.test(l) && /SIGNAL/.test(l));
    if (hi >= 0) {
      const h = lines[hi], cols = ['SSID', 'BSSID', 'CHAN', 'SIGNAL'].map((c) => h.indexOf(c));
      for (const l of lines.slice(hi + 1)) {
        const mac = l.match(MAC); if (!mac) continue;
        const after = l.slice((mac.index ?? 0) + mac[0].length);
        const ssidPart = cols[0] >= 0 && cols[0] > (mac.index ?? 0) ? after.trim().split(/\s{2,}/)[0] : l.slice(0, mac.index).replace(/^\s*\*?\s*/, '').trim();
        const nums = after.match(/\b(\d{1,3})\b/g)?.map(Number) ?? [];
        const sig = Number(l.slice(cols[3]).trim().split(/\s+/)[0]), ch = Number(l.slice(cols[2]).trim().split(/\s+/)[0]) || nums[0] || 0;
        aps.push({ ssid: ssidPart, bssid: mac[0].toLowerCase().replace(/-/g, ':'), channel: ch, band: bandOf(ch), rssiDbm: qualityToDbm(Number.isFinite(sig) ? sig : 0) });
      }
    } else for (const l of lines) { // terse: SSID:BSSID:CHAN:SIGNAL with escaped colons
      const parts = l.split(/(?<!\\):/).map((x) => x.replace(/\\:/g, ':'));
      const bi = parts.findIndex((x) => MAC.test(x)); if (bi < 0) continue;
      const ch = num(parts[bi + 1]) ?? 0, sig = num(parts[bi + 2]) ?? 0;
      aps.push({ ssid: parts.slice(0, bi).join(':'), bssid: parts[bi].toLowerCase(), channel: ch, band: bandOf(ch), rssiDbm: qualityToDbm(sig) });
    }
  } else if (fmt === 'csv') {
    const r = parseCsv(t); return { aps: csvAps(r[0], r.slice(1)), format: fmt };
  }
  return { aps, format: fmt };
}

function csvCols(h: string[]) {
  return { bssid: findCol(h, ['bssid', 'mac', 'macaddress', 'apmac']), ssid: findCol(h, ['ssid', 'network', 'name']), ch: findCol(h, ['channel', 'primarychannel', 'chan', 'ch']),
    freq: findCol(h, ['frequency', 'primaryfrequency', 'freq', 'freqmhz']), rssi: findCol(h, ['rssi', 'rssidbm', 'signal', 'signaldbm', 'strength', 'level', 'dbm']),
    noise: findCol(h, ['noise', 'noisedbm', 'noisefloor']), band: findCol(h, ['band']), x: findCol(h, ['x', 'xm', 'xmeters']), y: findCol(h, ['y', 'ym', 'ymeters']),
    lat: findCol(h, ['latitude', 'lat']), lon: findCol(h, ['longitude', 'lon', 'lng']), pt: findCol(h, ['point', 'pointid', 'reading', 'location', 'spot']), t: findCol(h, ['time', 'timestamp', 'timestamp'.replace('s', 's')]) };
}
function csvAps(h: string[], rows: string[][]): WifiAp[] {
  const c = csvCols(h), out: WifiAp[] = [];
  for (const r of rows) {
    let rssi = c.rssi >= 0 ? num(r[c.rssi]) : null; if (rssi == null) continue; if (rssi > 0 && rssi <= 100) rssi = qualityToDbm(rssi);
    const f = c.freq >= 0 ? num(r[c.freq]) ?? undefined : undefined;
    const ch = (c.ch >= 0 ? num(r[c.ch]) : null) ?? (f ? freqToChannel(f) : 0);
    out.push({ bssid: (c.bssid >= 0 ? r[c.bssid] : '').toLowerCase(), ssid: c.ssid >= 0 ? r[c.ssid] : '', channel: ch, band: bandOf(ch, c.band >= 0 ? r[c.band] : undefined, f), rssiDbm: rssi, noiseDbm: c.noise >= 0 ? num(r[c.noise]) ?? undefined : undefined });
  }
  return out;
}

/** A survey file with many locations: CSV rows with x/y (metres on the plan) or lat/lon, one row per AP heard. */
export function importSurveyFile(text: string): { readings: WifiReading[]; rows: number; positioned: 'xy' | 'latlon' | 'none' } {
  const rows = parseCsv(text); const h = rows[0] ?? []; const c = csvCols(h);
  const pos = c.x >= 0 && c.y >= 0 ? 'xy' : c.lat >= 0 && c.lon >= 0 ? 'latlon' : 'none';
  if (pos === 'none') throw new Error('The file needs x/y (metres on the floor plan) or latitude/longitude columns for each reading. For a single scan, use "Add reading" and paste it.');
  const groups = new Map<string, { r: string[][] }>();
  for (const r of rows.slice(1)) {
    const key = c.pt >= 0 && r[c.pt] ? r[c.pt] : pos === 'xy' ? `${r[c.x]},${r[c.y]}` : `${r[c.lat]},${r[c.lon]}`;
    (groups.get(key) ?? groups.set(key, { r: [] }).get(key)!).r.push(r);
  }
  const readings: WifiReading[] = [];
  for (const g of groups.values()) {
    const f = g.r[0], aps = csvAps(h, g.r);
    const x = pos === 'xy' ? num(f[c.x]) ?? 0 : 0, y = pos === 'xy' ? num(f[c.y]) ?? 0 : 0;
    readings.push({ id: uid(), x, y, lat: pos === 'latlon' ? num(f[c.lat]) ?? undefined : undefined, lon: pos === 'latlon' ? num(f[c.lon]) ?? undefined : undefined, t: c.t >= 0 ? f[c.t] : new Date().toISOString(), aps });
  }
  return { readings, rows: rows.length - 1, positioned: pos };
}

export type WifiView = 'signal' | 'noise' | 'snr' | 'channel' | 'ap' | 'cochannel' | 'count';
export const WIFI_VIEWS: [WifiView, string][] = [['signal', 'Signal (RSSI)'], ['noise', 'Noise floor'], ['snr', 'SNR'], ['channel', 'Channel (strongest AP)'], ['ap', 'Access point (strongest)'], ['cochannel', 'Co-channel APs'], ['count', 'APs heard ≥ target']];

export function filtered(r: WifiReading, ssid: string): WifiAp[] { return ssid ? r.aps.filter((a) => a.ssid === ssid) : r.aps; }
export function readingMetrics(r: WifiReading, ssid: string, targetDbm: number) {
  const aps = filtered(r, ssid); const best = aps.reduce<WifiAp | null>((b, a) => (!b || a.rssiDbm > b.rssiDbm ? a : b), null);
  const noises = r.aps.map((a) => a.noiseDbm).filter((v): v is number => v != null);
  const noise = noises.length ? Math.max(...noises) : undefined;
  const cochannel = best ? r.aps.filter((a) => a !== best && a.channel === best.channel && a.rssiDbm >= -82).length : 0;
  return { best, noise, snr: best && noise != null ? best.rssiDbm - noise : undefined, cochannel, count: aps.filter((a) => a.rssiDbm >= targetDbm).length };
}

/** Interpolated grid for a view. Numeric views use inverse-distance weighting; categorical views use the nearest reading. */
export function wifiGrid(readings: WifiReading[], view: WifiView, opts: { widthM: number; heightM: number; nx: number; ssid: string; targetDbm: number; radiusM: number }) {
  const ny = Math.max(4, Math.round((opts.nx * opts.heightM) / opts.widthM)), N = opts.nx * ny;
  const vals = new Float32Array(N).fill(NaN), cats: (string | null)[] = new Array(N).fill(null);
  const pts = readings.map((r) => ({ r, m: readingMetrics(r, opts.ssid, opts.targetDbm) }));
  const metric = (m: (typeof pts)[number]['m']): number | undefined => view === 'signal' ? m.best?.rssiDbm : view === 'noise' ? m.noise : view === 'snr' ? m.snr : view === 'cochannel' ? m.cochannel : view === 'count' ? m.count : undefined;
  const cat = (m: (typeof pts)[number]['m']) => (view === 'channel' ? (m.best ? `Ch ${m.best.channel} (${m.best.band})` : null) : view === 'ap' ? (m.best ? `${m.best.ssid || '(hidden)'} ${m.best.bssid}` : null) : null);
  for (let j = 0; j < ny; j++) for (let i = 0; i < opts.nx; i++) {
    const x = ((i + 0.5) / opts.nx) * opts.widthM, y = ((j + 0.5) / ny) * opts.heightM;
    let ws = 0, s = 0, nd = Infinity, nc: string | null = null;
    for (const p of pts) {
      const d = Math.hypot(p.r.x - x, p.r.y - y); if (d > opts.radiusM) continue;
      if (view === 'channel' || view === 'ap') { if (d < nd) { nd = d; nc = cat(p.m); } continue; }
      const v = metric(p.m); if (v == null) continue;
      const w = 1 / Math.max(d, 0.5) ** 2; ws += w; s += w * v;
    }
    if (ws > 0) vals[j * opts.nx + i] = s / ws; cats[j * opts.nx + i] = nc;
  }
  return { nx: opts.nx, ny, vals, cats };
}

/** Stable categorical colours (12-colour qualitative set). */
export const CAT_COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f', '#393b79', '#ad494a'];
export function signalColor(v: number, view: WifiView): [number, number, number] | null {
  if (Number.isNaN(v)) return null;
  if (view === 'signal') return v >= -60 ? [0, 160, 60] : v >= -67 ? [120, 200, 40] : v >= -72 ? [250, 210, 30] : v >= -80 ? [245, 130, 30] : [220, 40, 40];
  if (view === 'snr') return v >= 30 ? [0, 160, 60] : v >= 25 ? [120, 200, 40] : v >= 20 ? [250, 210, 30] : v >= 15 ? [245, 130, 30] : [220, 40, 40];
  if (view === 'noise') return v <= -95 ? [0, 160, 60] : v <= -90 ? [120, 200, 40] : v <= -85 ? [250, 210, 30] : v <= -80 ? [245, 130, 30] : [220, 40, 40];
  if (view === 'cochannel') return v < 0.5 ? [0, 160, 60] : v < 1.5 ? [250, 210, 30] : v < 2.5 ? [245, 130, 30] : [220, 40, 40];
  return v >= 2.5 ? [0, 160, 60] : v >= 1.5 ? [120, 200, 40] : v >= 0.5 ? [250, 210, 30] : [220, 40, 40];
}
export const WIFI_LEGENDS: Record<string, [string, string][]> = {
  signal: [['#00a03c', '≥ −60 dBm'], ['#78c828', '−67 to −60 (voice/video target −67)'], ['#fad21e', '−72 to −67'], ['#f5821e', '−80 to −72'], ['#dc2828', '< −80']],
  snr: [['#00a03c', '≥ 30 dB'], ['#78c828', '25–30 dB'], ['#fad21e', '20–25 dB'], ['#f5821e', '15–20 dB'], ['#dc2828', '< 15 dB']],
  noise: [['#00a03c', '≤ −95 dBm'], ['#78c828', '−95 to −90'], ['#fad21e', '−90 to −85'], ['#f5821e', '−85 to −80'], ['#dc2828', '> −80']],
  cochannel: [['#00a03c', 'None ≥ −82 dBm'], ['#fad21e', '1 other AP'], ['#f5821e', '2'], ['#dc2828', '3 or more']],
  count: [['#00a03c', '3+ APs (roaming)'], ['#78c828', '2 APs'], ['#fad21e', '1 AP'], ['#dc2828', 'None']],
};
