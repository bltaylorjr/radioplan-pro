// FCC public data built into the app, so it works offline: Antenna Structure Registrations (ASR) and active
// ULS licenses (land mobile, microwave, paging) with locations in NC, SC, GA, TN and VA.
// Each state is a separate chunk, unpacked only when an area in or near that state is looked at.
// Source: FCC ULS / ASR public weekly files (public domain), built by scripts/build-fccdata.py.
import { haversineKm, bearingDeg, type LatLon } from './geo';

export type FccState = 'NC' | 'SC' | 'GA' | 'TN' | 'VA';
export const FCC_STATES: FccState[] = ['NC', 'SC', 'GA', 'TN', 'VA'];

/** Rough state outlines (boxes) to decide which state files an area needs. */
const BOX: Record<FccState, [number, number, number, number]> = { // south, west, north, east
  NC: [33.75, -84.33, 36.6, -75.4], SC: [32.0, -83.36, 35.22, -78.5], GA: [30.35, -85.61, 35.0, -80.84],
  TN: [34.98, -90.31, 36.68, -81.65], VA: [36.54, -83.68, 39.47, -75.2],
};
export function statesNear(p: LatLon, radiusKm: number): FccState[] {
  const dLat = radiusKm / 110.6, dLon = radiusKm / (111.3 * Math.cos((p.lat * Math.PI) / 180));
  return FCC_STATES.filter((s) => { const [so, w, n, e] = BOX[s]; return p.lat >= so - dLat && p.lat <= n + dLat && p.lon >= w - dLon && p.lon <= e + dLon; });
}

type AsrRow = [number, number, number, number, string, number | null, number | null, number | null, string, string, string, string, string, number];
type LicRow = [string, number, string, number, number, [number, string, number, number][], string, string, string, number];
type LocRow = [number, number, number, number, string, number | null, number | null, number | null, string, number | null];
export interface FccStateData { v: number; state: FccState; built: string; names: string[]; asr: AsrRow[]; lic: LicRow[]; loc: LocRow[]; cty: Record<string, number[]> }

const LOADERS: Record<FccState, () => Promise<{ FCC_GZ_B64: string }>> = {
  NC: () => import('../data/fcc/nc'), SC: () => import('../data/fcc/sc'), GA: () => import('../data/fcc/ga'),
  TN: () => import('../data/fcc/tn'), VA: () => import('../data/fcc/va'),
};

/** Unpack gzip + base64 JSON (DecompressionStream: Chromium 80+, WebView2, Android WebView). */
export async function gunzipJson<T>(b64: string): Promise<T> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (typeof DecompressionStream === 'undefined') throw new Error('This device cannot unpack the built-in FCC data (browser too old).');
  const txt = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(txt) as T;
}

const cache = new Map<FccState, Promise<FccStateData>>();
export function loadFccState(s: FccState): Promise<FccStateData> {
  if (!cache.has(s)) cache.set(s, LOADERS[s]().then((m) => gunzipJson<FccStateData>(m.FCC_GZ_B64)).catch((e) => { cache.delete(s); throw e; }));
  return cache.get(s)!;
}

// ---------- readable forms ----------
export interface Tower {
  kind: 'asr'; state: FccState; regNo: number; usi: number; lat: number; lon: number; owner: string; type: string;
  heightAglM: number | null; groundM: number | null; amslM: number | null; status: 'Constructed' | 'Granted, not built'; faaStudy: string; city: string; address: string; lighting: string;
}
export interface Freq { mhz: number; cls: string; erpW: number; loc: number }
export interface License { state: FccState; call: string; usi: number; licensee: string; service: string; expires: string; granted: string; freqs: Freq[]; emissions: string[]; phone: string; file: string }
export interface LicLocation { lic: License; lat: number; lon: number; locNo: number; kind: string; groundM: number | null; structureM: number | null; asrNo: number | null; name: string; radiusKm: number | null; freqs: Freq[] }

const ymd = (n: number) => { const s = String(n); return n ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''; };
const STRUCT: Record<string, string> = { TOWER: 'Free-standing or guyed tower', LTOWER: 'Lattice tower', MTOWER: 'Monopole', GTOWER: 'Guyed tower', POLE: 'Pole', MAST: 'Mast', UPOLE: 'Utility pole', TANK: 'Water tank', B: 'Building', BANT: 'Building with antenna', BTWR: 'Tower on a building', TREE: 'Stealth tree', BMAST: 'Mast on a building', BPOLE: 'Pole on a building', NNTANK: 'Tank', SIGN: 'Sign', STACK: 'Smokestack', SILO: 'Silo', RIG: 'Rig', '2TA': 'Array of towers', '3TA': 'Array of towers' };
export const structureName = (t: string) => STRUCT[t] ?? (/^\d+TA/.test(t) ? 'Tower in an array' : STRUCT[t.replace(/\d.*$/, '')]) ?? (t || 'Structure');

export function towerOf(d: FccStateData, r: AsrRow): Tower {
  return { kind: 'asr', state: d.state, regNo: r[0], lat: r[1], lon: r[2], owner: d.names[r[3]] ?? '', type: r[4], heightAglM: r[5], groundM: r[6], amslM: r[7], status: r[8] === 'G' ? 'Granted, not built' : 'Constructed', faaStudy: r[9], city: r[10], address: r[11], lighting: r[12], usi: r[13] };
}
const licCache = new WeakMap<LicRow, License>();
export function licenseOf(d: FccStateData, r: LicRow): License {
  let l = licCache.get(r);
  if (!l) { l = { state: d.state, call: r[0], licensee: d.names[r[1]] ?? '', service: r[2], expires: ymd(r[3]), granted: ymd(r[4]), freqs: r[5].map(([mhz, cls, erpW, loc]) => ({ mhz, cls, erpW, loc })), emissions: r[6] ? r[6].split(',') : [], phone: r[7], file: r[8], usi: r[9] }; licCache.set(r, l); }
  return l;
}
export function locationOf(d: FccStateData, r: LocRow): LicLocation {
  const lic = licenseOf(d, d.lic[r[0]]);
  const at = lic.freqs.filter((f) => f.loc === r[3]);
  return { lic, lat: r[1], lon: r[2], locNo: r[3], kind: r[4], groundM: r[5], structureM: r[6], asrNo: r[7], name: r[8], radiusKm: r[9], freqs: at.length ? at : lic.freqs };
}

// ---------- services and bands ----------
/** FCC radio service codes seen in these files. */
export const SERVICES: Record<string, { name: string; group: ServiceGroup }> = {
  PW: { name: 'Public Safety Pool, conventional', group: 'Public safety' },
  YW: { name: 'Public Safety Pool, trunked', group: 'Public safety' },
  GE: { name: 'Public Safety 800 MHz, conventional', group: 'Public safety' },
  YE: { name: 'Public Safety 800 MHz, trunked', group: 'Public safety' },
  GF: { name: 'Public Safety 821-824 / 866-869 MHz, conventional', group: 'Public safety' },
  YF: { name: 'Public Safety 821-824 / 866-869 MHz, trunked', group: 'Public safety' },
  SG: { name: 'Public Safety 700 MHz, conventional', group: 'Public safety' },
  SY: { name: 'Public Safety 700 MHz, trunked', group: 'Public safety' },
  SL: { name: 'Public Safety 700 MHz, low power', group: 'Public safety' },
  SP: { name: 'Public Safety 700 MHz, State License', group: 'Public safety' },
  PA: { name: 'Public Safety 4.9 GHz', group: 'Public safety' },
  MW: { name: 'Microwave, Public Safety Pool', group: 'Microwave' },
  IG: { name: 'Industrial / Business Pool, conventional', group: 'Business & industrial' },
  YG: { name: 'Industrial / Business Pool, trunked', group: 'Business & industrial' },
  IK: { name: 'Industrial / Business Pool, commercial, conventional', group: 'Business & industrial' },
  GJ: { name: 'Business & Industrial 800 MHz, conventional', group: 'Business & industrial' },
  YJ: { name: 'Business & Industrial 800 MHz, trunked', group: 'Business & industrial' },
  GI: { name: 'Industrial / Land Transportation 900 MHz, conventional', group: 'Business & industrial' },
  YI: { name: 'Industrial / Land Transportation 900 MHz, trunked', group: 'Business & industrial' },
  GO: { name: 'Industrial / Land Transportation 800 MHz, conventional', group: 'Business & industrial' },
  YO: { name: 'Industrial / Land Transportation 800 MHz, trunked', group: 'Business & industrial' },
  GB: { name: 'Business 800 MHz, conventional', group: 'Business & industrial' },
  YB: { name: 'Business 800 MHz, trunked', group: 'Business & industrial' },
  GU: { name: 'Business 900 MHz, conventional', group: 'Business & industrial' },
  YU: { name: 'Business 900 MHz, trunked', group: 'Business & industrial' },
  RS: { name: 'Land Mobile Radiolocation', group: 'Business & industrial' },
  LN: { name: '902-928 MHz Location and Monitoring', group: 'Commercial' },
  GM: { name: 'SMR 800 MHz, conventional', group: 'Commercial' },
  YM: { name: 'SMR 800 MHz, trunked', group: 'Commercial' },
  GR: { name: 'SMR 900 MHz, conventional', group: 'Commercial' },
  YS: { name: 'SMR 900 MHz, trunked', group: 'Commercial' },
  GX: { name: 'SMR, conventional', group: 'Commercial' },
  YX: { name: 'SMR, trunked', group: 'Commercial' },
  YK: { name: 'Trunked SMR', group: 'Commercial' },
  GS: { name: 'Private Carrier Paging 929-930 MHz', group: 'Paging' },
  QT: { name: '220-222 MHz', group: 'Commercial' },
  CD: { name: 'Paging and Radiotelephone', group: 'Paging' },
  CG: { name: 'General Aviation Air-Ground', group: 'Paging' },
  CB: { name: 'Rural Radiotelephone (BETRS)', group: 'Paging' },
  CF: { name: 'Common Carrier Fixed Point-to-Point Microwave', group: 'Microwave' },
  MG: { name: 'Microwave, Industrial / Business Pool', group: 'Microwave' },
  TI: { name: 'TV Intercity Relay', group: 'Microwave' },
  TS: { name: 'TV Studio Transmitter Link', group: 'Microwave' },
  TP: { name: 'TV Pickup', group: 'Microwave' },
  TT: { name: 'TV Translator Relay', group: 'Microwave' },
  AS: { name: 'Aural Studio Transmitter Link', group: 'Microwave' },
  AI: { name: 'Aural Intercity Relay', group: 'Microwave' },
  PF: { name: 'Local Television Transmission (fixed)', group: 'Microwave' },
  CT: { name: 'Local Television Transmission', group: 'Microwave' },
};
export type ServiceGroup = 'Public safety' | 'Business & industrial' | 'Commercial' | 'Microwave' | 'Paging' | 'Other';
export const SERVICE_GROUPS: ServiceGroup[] = ['Public safety', 'Business & industrial', 'Commercial', 'Microwave', 'Paging', 'Other'];
export const serviceName = (c: string) => SERVICES[c]?.name ?? `FCC radio service ${c}`;
export const serviceGroup = (c: string): ServiceGroup => SERVICES[c]?.group ?? 'Other';

export const BANDS: { id: string; label: string; ranges: [number, number][] }[] = [
  { id: 'low', label: 'VHF low band (25-50 MHz)', ranges: [[25, 50]] },
  { id: 'vhf', label: 'VHF high band (136-174 MHz)', ranges: [[136, 174]] },
  { id: '220', label: '220 MHz', ranges: [[216, 225]] },
  { id: 'uhf', label: 'UHF (380-512 MHz)', ranges: [[380, 512]] },
  { id: '700', label: '700 MHz public safety (758-775 / 788-805)', ranges: [[758, 775], [788, 805]] },
  { id: '800', label: '800 MHz (806-824 / 851-869)', ranges: [[806, 824], [851, 869]] },
  { id: '900', label: '900 MHz (896-901 / 935-940)', ranges: [[896, 901], [935, 940]] },
  { id: 'paging', label: '929-932 MHz paging', ranges: [[928, 932]] },
  { id: 'mw', label: 'Microwave (above 1 GHz)', ranges: [[1000, 100000]] },
];
export const bandOf = (mhz: number) => BANDS.find((b) => b.ranges.some(([a, z]) => mhz >= a && mhz <= z))?.id ?? 'other';
export const inBand = (mhz: number, band: string) => band === 'all' || bandOf(mhz) === band;

/** Plain words for common FCC station classes. */
const CLASS: Record<string, string> = { FB: 'base', FB2: 'repeater', FB4: 'community repeater', FB6: 'base (shared)', FB8: 'trunked base', FBT: 'temporary base', FX1: 'control station', FX: 'fixed', MO: 'mobile', MO3: 'mobile (repeater input)', MO8: 'trunked mobile', MOI: 'mobile', FB2C: 'repeater (SMR)', FB2S: 'repeater (SMR)', FB8S: 'trunked base', FBBS: 'paging base', FXO: 'operational fixed', MR: 'radiolocation', FXOT: 'fixed (temporary)' };
export const className = (c: string) => CLASS[c] ?? CLASS[c.replace(/[A-Z]$/, '')] ?? c;
/** Emission designator in plain words (bandwidth + analog / digital). */
export function emissionWords(e: string): string {
  const m = /^(\d+)([HKMG])(\d*)([A-Z0-9])([A-Z0-9])([A-Z0-9])/.exec(e);
  if (!m) return e;
  const bw = `${m[1]}${m[3] ? '.' + m[3] : ''} ${{ H: 'Hz', K: 'kHz', M: 'MHz', G: 'GHz' }[m[2]]}`;
  const kind = m[5] === '1' || m[5] === '7' ? 'digital' : m[5] === '3' ? 'analog' : m[5] === '2' ? 'data' : '';
  const hint = /^8K10F1[EDW]/.test(e) ? ' (P25 Phase 1)' : /^4K00F1/.test(e) || /^6K00F7W/.test(e) ? ' (NXDN / dPMR narrow)' : /^7K60FXE/.test(e) || /^7K60FXD/.test(e) ? ' (DMR)' : /^9K80D7W/.test(e) ? ' (P25 Phase 2)' : '';
  return `${e}: ${bw}${kind ? ` ${kind}` : ''}${hint}`;
}

// ---------- search ----------
export interface NearTower extends Tower { km: number; brg: number; on: LicLocation[] }
export interface NearLicense { lic: License; loc: LicLocation; km: number; brg: number }
export interface FccFilter { band?: string; group?: ServiceGroup | 'all'; text?: string }
export interface FccResult { towers: NearTower[]; licenses: NearLicense[]; countyWide: License[]; built: string; states: FccState[] }

const matchesText = (l: License, t: string) => !t || l.call.toLowerCase().includes(t) || l.licensee.toLowerCase().includes(t) || l.freqs.some((f) => String(f.mhz).startsWith(t));
export const licenseMatches = (l: License, f: FccFilter, freqs = l.freqs) =>
  (!f.group || f.group === 'all' || serviceGroup(l.service) === f.group) && (!f.band || f.band === 'all' || freqs.some((x) => inBand(x.mhz, f.band!))) && matchesText(l, (f.text ?? '').trim().toLowerCase());

/** Towers and licensed transmitter locations within `radiusKm` of a point (nearest first). County-wide mobile licenses when a county is given. */
export async function searchFcc(p: LatLon, radiusKm: number, f: FccFilter = {}, county?: string, maxRows = 400): Promise<FccResult> {
  const states = statesNear(p, radiusKm);
  const data = await Promise.all(states.map(loadFccState));
  const towers: NearTower[] = [], licenses: NearLicense[] = [], countyWide: License[] = [];
  const dLat = radiusKm / 110.6 + 0.01, dLon = radiusKm / (111.3 * Math.cos((p.lat * Math.PI) / 180)) + 0.01;
  const box = (lat: number, lon: number) => Math.abs(lat - p.lat) <= dLat && Math.abs(lon - p.lon) <= dLon;
  for (const d of data) {
    const byAsr = new Map<number, LicLocation[]>(); const locs: LicLocation[] = [];
    for (const r of d.loc) { if (!box(r[1], r[2])) continue; const L = locationOf(d, r); locs.push(L); if (L.asrNo) { const a = byAsr.get(L.asrNo) ?? []; a.push(L); byAsr.set(L.asrNo, a); } }
    for (const r of d.asr) {
      if (!box(r[1], r[2])) continue;
      const t = towerOf(d, r), km = haversineKm(p, t); if (km > radiusKm) continue;
      // licenses on this structure: by ASR number, else located within ~40 m
      const on = (byAsr.get(t.regNo) ?? []).concat(locs.filter((L) => !L.asrNo && haversineKm(L, t) < 0.04));
      towers.push({ ...t, km, brg: bearingDeg(p, t), on });
    }
    for (const L of locs) {
      const km = haversineKm(p, L); if (km > radiusKm) continue;
      if (!licenseMatches(L.lic, f, L.freqs.length ? L.freqs : L.lic.freqs)) continue;
      licenses.push({ lic: L.lic, loc: L, km, brg: bearingDeg(p, L) });
    }
    if (county) { const ix = d.cty[county.replace(/ County$/i, '').trim()] ?? []; for (const i of ix) { const l = licenseOf(d, d.lic[i]); if (licenseMatches(l, f)) countyWide.push(l); } }
  }
  towers.sort((a, b) => a.km - b.km); licenses.sort((a, b) => a.km - b.km);
  // one row per license (its nearest location)
  const seen = new Set<string>(); const uniq = licenses.filter((x) => { const k = `${x.lic.call}|${x.loc.lat}|${x.loc.lon}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { towers: towers.slice(0, maxRows), licenses: uniq.slice(0, maxRows), countyWide: [...new Map(countyWide.map((l) => [l.call, l])).values()].slice(0, maxRows), built: data[0]?.built ?? '', states };
}

/** Towers in a map box (for the map layer). */
export async function towersInBox(s: number, w: number, n: number, e: number): Promise<Tower[]> {
  const c = { lat: (s + n) / 2, lon: (w + e) / 2 }; const rKm = haversineKm(c, { lat: n, lon: e });
  const data = await Promise.all(statesNear(c, rKm).map(loadFccState));
  const out: Tower[] = [];
  for (const d of data) for (const r of d.asr) if (r[1] >= s && r[1] <= n && r[2] >= w && r[2] <= e) out.push(towerOf(d, r));
  return out;
}

/** Public-safety licensees with frequencies inside a booster's passbands near a building (for licensee consent, 47 CFR 90.219(b)). */
export async function publicSafetyNear(p: LatLon, radiusKm: number, passbands: [number, number][], county?: string): Promise<{ lic: License; km: number | null; freqs: Freq[] }[]> {
  const r = await searchFcc(p, radiusKm, { group: 'Public safety' }, county, 2000);
  const inPass = (mhz: number) => !passbands.length || passbands.some(([a, b]) => mhz >= a && mhz <= b);
  const best = new Map<string, { lic: License; km: number | null; freqs: Freq[] }>();
  for (const x of r.licenses) { const fr = x.lic.freqs.filter((f) => inPass(f.mhz)); if (!fr.length) continue; const o = best.get(x.lic.call); if (!o || (o.km ?? 1e9) > x.km) best.set(x.lic.call, { lic: x.lic, km: x.km, freqs: fr }); }
  for (const l of r.countyWide) { if (best.has(l.call)) continue; const fr = l.freqs.filter((f) => inPass(f.mhz)); if (fr.length) best.set(l.call, { lic: l, km: null, freqs: fr }); }
  return [...best.values()].sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
}

export const ulsLicenseUrl = (usi: number) => `https://wireless2.fcc.gov/UlsApp/UlsSearch/license.jsp?licKey=${usi}`;
export const asrUrl = (usi: number) => `https://wireless2.fcc.gov/UlsApp/AsrSearch/asrRegistration.jsp?regKey=${usi}`;
export const uniqueFreqs = (fs: Freq[]) => [...new Map(fs.map((f) => [f.mhz, f])).values()].sort((a, b) => a.mhz - b.mhz);
