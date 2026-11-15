// Device hub: Bluetooth, USB / COM and Wi-Fi field devices connected once and used by every page.
// - Signal meter: readings for Live Signal Readings, and into any signal field you tap.
// - GPS receiver: every "use my GPS" button and the map's live position use it instead of the phone / laptop GPS.
// - Laser distance meter: each measurement goes into the field you tapped (lengths, heights, cable runs).
// - Barcode scanner: each scan finds or adds a device on Equipment & Asset Tags, or goes into the field you tapped.
import { parseMeterBytes, LineReader, parseMeterText, ByteFormat } from './signal';
import { Link, Transport, openBluetooth, openSerial, openWifi, openPhone } from './meter';

export type Role = 'meter' | 'gps' | 'distance' | 'scanner';
export const ROLE_LABEL: Record<Role, string> = { meter: 'Signal meter', gps: 'GPS receiver', distance: 'Laser distance meter', scanner: 'Barcode / QR scanner' };

// ---------------------------------------------------------------- parsers
export interface GpsFix { lat: number; lon: number; accM: number; altM?: number; sats?: number; quality?: number; speedMps?: number; courseDeg?: number; at: number }
const nmeaDeg = (v: string, h: string) => { if (!v) return NaN; const dot = v.indexOf('.'), d = Number(v.slice(0, dot - 2)), m = Number(v.slice(dot - 2)); const x = d + m / 60; return /[SW]/i.test(h) ? -x : x; };
export function nmeaChecksumOk(line: string): boolean {
  const m = /^\$([^*]+)\*([0-9A-F]{2})\s*$/i.exec(line.trim()); if (!m) return !line.includes('*');
  let c = 0; for (const ch of m[1]) c ^= ch.charCodeAt(0); return c === parseInt(m[2], 16);
}
/** Position from NMEA 0183 sentences (GGA, RMC, GST, GLL). Keeps the last fix and improves it with each sentence. */
export class NmeaReader {
  fix: Partial<GpsFix> = {};
  /** Returns a full fix when a sentence completes one. */
  line(raw: string, now = Date.now()): GpsFix | null {
    const l = raw.trim(); if (!l.startsWith('$') || !nmeaChecksumOk(l)) return null;
    const f = l.replace(/\*.*$/, '').split(','); const t = f[0].slice(3);
    if (t === 'GGA') {
      const q = Number(f[6]); if (!q) return null;
      const hdop = Number(f[8]);
      Object.assign(this.fix, { lat: nmeaDeg(f[2], f[3]), lon: nmeaDeg(f[4], f[5]), quality: q, sats: Number(f[7]) || undefined, altM: f[9] ? Number(f[9]) : undefined, at: now });
      // HDOP × ~5 m for a plain fix; RTK fixed / float are cm / dm level. A GST sentence replaces this with the receiver's own estimate.
      if (!this.gst || now - this.gst > 5000) this.fix.accM = q === 4 ? 0.03 : q === 5 ? 0.3 : q === 2 ? Math.max(0.5, hdop * 2) : Math.max(1, (hdop || 2) * 5);
    } else if (t === 'RMC') {
      if (f[2] !== 'A') return null;
      Object.assign(this.fix, { lat: nmeaDeg(f[3], f[4]), lon: nmeaDeg(f[5], f[6]), speedMps: f[7] ? Number(f[7]) * 0.514444 : undefined, courseDeg: f[8] ? Number(f[8]) : undefined, at: now });
      this.fix.accM ??= 5;
    } else if (t === 'GLL') {
      if (f[6] && f[6] !== 'A') return null;
      Object.assign(this.fix, { lat: nmeaDeg(f[1], f[2]), lon: nmeaDeg(f[3], f[4]), at: now }); this.fix.accM ??= 5;
    } else if (t === 'GST') {
      const a = Number(f[6]), b = Number(f[7]); if (Number.isFinite(a) && Number.isFinite(b)) { this.fix.accM = Math.round(Math.hypot(a, b) * 100) / 100; this.gst = now; }
      return null;
    } else return null;
    const x = this.fix; return Number.isFinite(x.lat) && Number.isFinite(x.lon) ? { ...(x as GpsFix) } : null;
  }
  private gst = 0;
}

/** A distance from a laser meter's text: "12.345 m", "40.5 ft", "40' 6\"", "485 in", "1234 mm". Returns metres. */
export function parseDistanceText(s: string): number | null {
  const t = s.replace(/,(?=\d{3}\b)/g, '').replace(/(\d),(\d)/g, '$1.$2');
  const fi = /(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(\d+(?:\.\d+)?)\s*(?:"|in)/i.exec(t); if (fi) return Number(fi[1]) * 0.3048 + Number(fi[2]) * 0.0254;
  const m = /(\d+(?:\.\d+)?)\s*(mm|cm|feet|ft|yd|in|m|'|")(?![a-z])/i.exec(t);
  if (m) { const v = Number(m[1]), k = ({ mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, feet: 0.3048, "'": 0.3048, in: 0.0254, '"': 0.0254, yd: 0.9144 } as Record<string, number>)[m[2].toLowerCase()]; if (k) return v * k; }
  const bare = /(?:^|[^\d.-])(\d+\.\d{1,4})(?![\d.])/.exec(t); return bare ? Number(bare[1]) : null; // most meters send metres
}

// ---------------------------------------------------------------- hub
export interface DeviceState { role: Role; transport: Transport; name: string; status: string; connected: boolean; last?: { text: string; at: number }; fix?: GpsFix }
type Listener = () => void;
const state: Partial<Record<Role, DeviceState>> = {};
const links: Partial<Record<Role, Link>> = {};
const listeners = new Set<Listener>();
const valueListeners: { [K in Role]: Set<(v: K extends 'scanner' ? string : number, info?: string) => void> } = { meter: new Set(), gps: new Set(), distance: new Set(), scanner: new Set() };
let version = 0;
const emit = () => { version++; listeners.forEach((f) => f()); };
export const subscribeDevices = (f: Listener) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const devicesVersion = () => version;
export const deviceState = (r: Role): DeviceState | undefined => state[r];
export const connectedRoles = () => (Object.keys(state) as Role[]).filter((r) => state[r]?.connected);
/** Listen for values from a role (dBm, metres, scanned text, or GPS = accuracy in metres). */
export function onDeviceValue<R extends Role>(r: R, f: (v: R extends 'scanner' ? string : number, info?: string) => void) { (valueListeners[r] as Set<typeof f>).add(f); return () => { (valueListeners[r] as Set<typeof f>).delete(f); }; }
const setS = (r: Role, patch: Partial<DeviceState>) => { state[r] = { ...(state[r] as DeviceState), ...patch }; emit(); };

/** Type a value into the field that has the focus (React-safe), so a laser or scanner fills any box in the app. */
export function typeIntoFocused(text: string): boolean {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.readOnly || el.disabled || ['checkbox', 'radio', 'file', 'button'].includes((el as HTMLInputElement).type)) return false;
  if (el instanceof HTMLInputElement && el.type === 'number' && !Number.isFinite(Number(text))) return false;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
/** Where laser distances go: 'ft' or 'm' (the app's measuring system). */
let distUnit: 'ft' | 'm' = 'ft';
export const setDistanceUnit = (u: 'ft' | 'm') => { distUnit = u; };
/** When true, signal meter readings also go into the field you tapped. */
let meterTypes = false;
export const setMeterTypes = (b: boolean) => { meterTypes = b; };

export interface ConnectOpts { format?: ByteFormat; baud?: number; url?: string; everyMs?: number; phone?: 'cell' | 'wifi' }
/** Connect a device for a role over a transport. Replaces any device already in that role. */
export async function connectDevice(role: Role, transport: Transport, o: ConnectOpts = {}): Promise<void> {
  disconnectDevice(role, true);
  const status = (s: string) => setS(role, { status: s });
  state[role] = { role, transport, name: '', status: 'Connecting…', connected: false }; emit();
  const lr = new LineReader(), nmea = new NmeaReader(); let tail = '', timer = 0;
  const got = (text: string, v: number | string | null, info?: string) => {
    if (v == null) return;
    setS(role, { last: { text, at: Date.now() }, connected: true, status: 'Connected' });
    (valueListeners[role] as Set<(v: unknown, i?: string) => void>).forEach((f) => f(v, info));
    if (role === 'distance' && typeof v === 'number') typeIntoFocused(String(Math.round((distUnit === 'ft' ? v / 0.3048 : v) * 100) / 100));
    if (role === 'meter' && meterTypes && typeof v === 'number') typeIntoFocused(String(v));
    if (role === 'scanner' && typeof v === 'string') { if (!valueListeners.scanner.size) typeIntoFocused(v); }
  };
  const onLine = (l: string) => {
    if (!l.trim()) return;
    if (role === 'gps') { const f = nmea.line(l); if (f) { setS(role, { fix: f, last: { text: `±${f.accM} m${f.sats ? `, ${f.sats} satellites` : ''}`, at: Date.now() }, connected: true, status: 'Connected' }); gpsFix(f); } return; }
    if (role === 'distance') { const m = parseDistanceText(l); got(m != null ? `${Math.round(m * 1000) / 1000} m` : l, m); return; }
    if (role === 'scanner') { got(l.trim(), l.trim()); return; }
    const v = parseMeterText(l); got(v != null ? `${v} dBm` : l, v);
  };
  const onText = (chunk: string) => {
    if (role === 'meter') { lr.push(chunk).forEach((v) => got(`${v} dBm`, v)); clearTimeout(timer); timer = window.setTimeout(() => { const v = lr.flush(); if (v != null) got(`${v} dBm`, v); }, 250); return; }
    tail += chunk; const parts = tail.split(/\r\n|\n|\r/); tail = parts.pop() ?? '';
    parts.forEach(onLine);
    clearTimeout(timer); if (tail && role !== 'gps') timer = window.setTimeout(() => { const t = tail; tail = ''; onLine(t); }, 300);
  };
  const onBytes = (dv: DataView) => {
    const b = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    const text = b.every((x) => (x >= 32 && x < 127) || x === 10 || x === 13 || x === 9 || x === 0xb5 || x === 0xc2 || x === 0xb0);
    if (role === 'meter' && (o.format && o.format !== 'auto' && o.format !== 'text' || !text)) { const v = parseMeterBytes(dv, o.format ?? 'auto'); if (v != null) got(`${v} dBm`, v); return; }
    if (role === 'distance' && !text && dv.byteLength >= 4) { const f = dv.getFloat32(0, true); if (f > 0 && f < 500) got(`${f.toFixed(3)} m`, f); return; } // Leica / Bosch send metres as a float
    onText(new TextDecoder().decode(b));
  };
  const gone = () => setS(role, { connected: false });
  try {
    let link: Link;
    if (transport === 'bluetooth') link = await openBluetooth(onBytes, status, gone);
    else if (transport === 'serial') link = await openSerial(o.baud ?? (role === 'gps' ? 4800 : 9600), onText, status, gone);
    else if (transport === 'wifi') link = openWifi(o.url ?? '', o.everyMs ?? 1000, onText, status);
    else link = openPhone(o.phone ?? 'cell', (v, info) => got(`${v} dBm${info ? ` · ${info}` : ''}`, v, info), status);
    links[role] = link;
    setS(role, { name: link.name, status: 'Connected. Waiting for data…', connected: true });
    if (role === 'gps') installGps();
  } catch (e) {
    const m = (e as Error).message; delete state[role]; emit();
    throw new Error(/cancel|chosen|No port selected|User cancelled/i.test(m) ? 'Nothing was chosen.' : m);
  }
}
export function disconnectDevice(role: Role, quiet = false) {
  links[role]?.close(); delete links[role];
  if (state[role]) { delete state[role]; if (!quiet) emit(); }
  if (role === 'gps') gpsGone();
}

// ---------------------------------------------------------------- external GPS for the whole app
type Pos = GeolocationPosition; type Ok = PositionCallback; type Err = PositionErrorCallback | null | undefined;
const watchers = new Map<number, Ok>(); let wid = 900000; let installed = false;
let orig: { get: Geolocation['getCurrentPosition']; watch: Geolocation['watchPosition']; clear: Geolocation['clearWatch'] } | null = null;
const origIds = new Map<number, number>();
const toPos = (f: GpsFix): Pos => ({ timestamp: f.at, coords: { latitude: f.lat, longitude: f.lon, accuracy: f.accM, altitude: f.altM ?? null, altitudeAccuracy: null, heading: f.courseDeg ?? null, speed: f.speedMps ?? null, toJSON() { return this; } }, toJSON() { return this; } } as unknown as Pos);
const extFix = () => { const f = state.gps?.fix; return state.gps?.connected && f && Date.now() - f.at < 10000 ? f : null; };
function gpsFix(f: GpsFix) { const p = toPos(f); watchers.forEach((cb) => cb(p)); }
function gpsGone() { /* watchers fall back to the device GPS on their next call */ }
/** Route navigator.geolocation through the external receiver while it has a fresh fix. */
function installGps() {
  if (installed || typeof navigator === 'undefined' || !navigator.geolocation) return; installed = true;
  const g = navigator.geolocation; orig = { get: g.getCurrentPosition.bind(g), watch: g.watchPosition.bind(g), clear: g.clearWatch.bind(g) };
  g.getCurrentPosition = (ok: Ok, err?: Err, opt?: PositionOptions) => {
    const f = extFix(); if (f) { setTimeout(() => ok(toPos(f)), 0); return; }
    if (state.gps?.connected) { // wait a few seconds for the receiver before falling back
      const t0 = Date.now(); const iv = setInterval(() => { const x = extFix(); if (x) { clearInterval(iv); ok(toPos(x)); } else if (Date.now() - t0 > 4000) { clearInterval(iv); orig!.get(ok, err ?? undefined, opt); } }, 250); return;
    }
    orig!.get(ok, err ?? undefined, opt);
  };
  g.watchPosition = (ok: Ok, err?: Err, opt?: PositionOptions) => {
    const id = ++wid; watchers.set(id, (p) => ok(p));
    const f = extFix(); if (f) setTimeout(() => ok(toPos(f)), 0);
    // the device GPS keeps feeding the watcher while the receiver has no fresh fix
    origIds.set(id, orig!.watch((p) => { if (!extFix()) ok(p); }, (e) => { if (!extFix()) err?.(e); }, opt));
    return id;
  };
  g.clearWatch = (id: number) => { watchers.delete(id); const o = origIds.get(id); if (o != null) { orig!.clear(o); origIds.delete(id); } else orig!.clear(id); };
}
