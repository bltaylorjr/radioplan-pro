// Receivers for the spectrum analyzer: the list of compatible USB receivers and analyzers (what each can do,
// how it connects, how accurate its levels are), detection of the ones plugged in, and a driver for each
// family that has an open protocol: tinySA / tinySA Ultra (USB serial), RTL-SDR (WebUSB), HackRF One
// (WebUSB), plus file import for everything else and a built-in test signal source.
import { iq8, iqSpectrum, stitch, toPoints, freqs, type Sweep } from './spectrum';
import RTL2832U from '../vendor/rtlsdr/rtl2832u.js';

export type Link = 'serial' | 'webusb' | 'file' | 'sim';
export interface Receiver {
  id: string; name: string; maker: string; kind: 'Spectrum analyzer' | 'SDR receiver' | 'Test source';
  range: [number, number]; link: Link; live: boolean;
  /** USB IDs used to recognise it when plugged in. */
  usb?: { vendorId: number; productId?: number }[];
  accuracy: string; notes: string; where: string;
}
const MHz = 1e6, GHz = 1e9, kHz = 1e3;
export const RECEIVERS: Receiver[] = [
  { id: 'tinysa-ultra', name: 'tinySA Ultra / Ultra+', maker: 'tinySA (Erik Kaashoek)', kind: 'Spectrum analyzer', range: [100 * kHz, 6 * GHz], link: 'serial', live: true, usb: [{ vendorId: 0x0483, productId: 0x5740 }],
    accuracy: 'Calibrated level readout in dBm (typically within about ±2 dB below 800 MHz, wider above; check with a known source).', notes: 'Best low-cost choice for real dBm. Also works as a stand-alone handheld.', where: 'Chrome / Edge (Windows, Mac, Linux, ChromeOS); Android Chrome with a USB-C cable' },
  { id: 'tinysa', name: 'tinySA (Basic)', maker: 'tinySA', kind: 'Spectrum analyzer', range: [100 * kHz, 960 * MHz], link: 'serial', live: true, usb: [{ vendorId: 0x0483, productId: 0x5740 }],
    accuracy: 'Calibrated dBm readout (typically within a few dB).', notes: 'Low input 100 kHz–350 MHz, high input 240–960 MHz.', where: 'Chrome / Edge' },
  { id: 'rtlsdr', name: 'RTL-SDR (RTL2832U + R820T/R828D: RTL-SDR Blog V3/V4, Nooelec NESDR)', maker: 'various', kind: 'SDR receiver', range: [24 * MHz, 1766 * MHz], link: 'webusb', live: true, usb: [{ vendorId: 0x0bda, productId: 0x2838 }, { vendorId: 0x0bda, productId: 0x2832 }],
    accuracy: 'Not calibrated: levels are relative (dBFS) until you calibrate against a known signal; then about ±3 dB in one band at one gain.', notes: '8-bit, 2.4 MHz per step; sweeps by retuning. Windows needs the WinUSB driver (Zadig). Good for finding signals and interference.', where: 'Chrome / Edge on Windows (with WinUSB), Mac, Linux, Android' },
  { id: 'hackrf', name: 'HackRF One', maker: 'Great Scott Gadgets', kind: 'SDR receiver', range: [1 * MHz, 6 * GHz], link: 'webusb', live: true, usb: [{ vendorId: 0x1d50, productId: 0x6089 }],
    accuracy: 'Not calibrated: relative levels until calibrated; gain and flatness vary across frequency.', notes: '8-bit, up to 20 MHz per step; wide and fast sweeps. Keep the input below −5 dBm.', where: 'Chrome / Edge (Windows, Mac, Linux, Android)' },
  { id: 'airspy', name: 'Airspy R2 / Mini', maker: 'Airspy', kind: 'SDR receiver', range: [24 * MHz, 1.8 * GHz], link: 'file', live: false, usb: [{ vendorId: 0x1d50, productId: 0x60a1 }],
    accuracy: 'Relative levels; 12-bit, low noise.', notes: 'Record a sweep with airspy_power or SDR# and import the CSV.', where: 'File import' },
  { id: 'sdrplay', name: 'SDRplay RSP1A / RSPdx / RSPduo', maker: 'SDRplay', kind: 'SDR receiver', range: [1 * kHz, 2 * GHz], link: 'file', live: false,
    accuracy: 'Relative levels; 14-bit.', notes: 'Uses SDRplay\'s own API (no browser access). Export a sweep CSV from SDRuno or SDR Console and import it.', where: 'File import' },
  { id: 'signalhound', name: 'Signal Hound SA44B / SA124B / BB60 / SM200', maker: 'Signal Hound', kind: 'Spectrum analyzer', range: [9 * kHz, 20 * GHz], link: 'file', live: false,
    accuracy: 'Calibrated, lab grade (about ±1–2 dB).', notes: 'Save a trace from Spike as CSV and import it.', where: 'File import' },
  { id: 'bench', name: 'Bench / handheld analyzers (Keysight FieldFox, Anritsu Site Master, R&S, Siglent, Rigol)', maker: 'various', kind: 'Spectrum analyzer', range: [9 * kHz, 26.5 * GHz], link: 'file', live: false,
    accuracy: 'Calibrated (traceable).', notes: 'Save the trace as CSV on the instrument (or from its PC software) and import it.', where: 'File import' },
  { id: 'rtl_power', name: 'rtl_power / hackrf_sweep / soapy_power output', maker: 'command-line tools', kind: 'SDR receiver', range: [1 * MHz, 6 * GHz], link: 'file', live: false,
    accuracy: 'As the receiver.', notes: 'Their CSV format is read directly, including many sweeps (shown as a waterfall).', where: 'File import' },
  { id: 'sim', name: 'Built-in test signals (simulator)', maker: 'LvPlan Pro', kind: 'Test source', range: [100 * kHz, 6 * GHz], link: 'sim', live: true,
    accuracy: 'Exact: known signals at known levels, for training and for checking the measurements.', notes: 'Repeaters, a P25 carrier, a BDA oscillation, intermod products and noise.', where: 'Everywhere, offline' },
];

export const webUsbOk = () => typeof navigator !== 'undefined' && 'usb' in navigator;
export const webSerialOk = () => typeof navigator !== 'undefined' && 'serial' in navigator;

export interface Detected { receiverId: string; label: string; via: Link; handle: unknown }
/** Receivers already allowed in this browser and plugged in now. */
export async function detect(): Promise<Detected[]> {
  const out: Detected[] = [];
  try {
    if (webUsbOk()) for (const d of await (navigator as unknown as { usb: { getDevices(): Promise<USBDeviceLike[]> } }).usb.getDevices()) {
      const r = RECEIVERS.find((x) => x.link === 'webusb' && x.usb?.some((u) => u.vendorId === d.vendorId && (u.productId == null || u.productId === d.productId)));
      if (r) out.push({ receiverId: r.id, label: `${r.name.split(' (')[0]}${d.serialNumber ? ` · ${d.serialNumber}` : ''}`, via: 'webusb', handle: d });
    }
    if (webSerialOk()) for (const p of await (navigator as unknown as { serial: { getPorts(): Promise<SerialPortLike[]> } }).serial.getPorts()) {
      const i = p.getInfo(); if (i.usbVendorId === 0x0483 && i.usbProductId === 0x5740) out.push({ receiverId: 'tinysa-ultra', label: 'tinySA (USB serial)', via: 'serial', handle: p });
    }
  } catch { /* permissions or policy */ }
  return out;
}

// ---------- driver interface ----------
export interface SweepRequest { start: number; stop: number; points: number; rbwHz?: number; gainDb?: number | null; detector?: 'peak' | 'average' | 'sample' }
export interface Driver { id: string; label: string; range: [number, number]; calibrated: boolean; sweep(r: SweepRequest, abort?: AbortSignal): Promise<Sweep>; close(): Promise<void>; info?: string }

interface USBDeviceLike { vendorId: number; productId: number; serialNumber?: string; open(): Promise<void>; close(): Promise<void>; selectConfiguration(n: number): Promise<void>; claimInterface(n: number): Promise<void>; releaseInterface(n: number): Promise<void>;
  controlTransferOut(s: object, d?: BufferSource): Promise<unknown>; controlTransferIn(s: object, n: number): Promise<{ data?: DataView }>; transferIn(ep: number, n: number): Promise<{ data?: DataView }>; productName?: string }
interface SerialPortLike { getInfo(): { usbVendorId?: number; usbProductId?: number }; open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }

/** Asks the browser for a device (shows its picker). */
export async function pickUsb(ids: { vendorId: number; productId?: number }[]): Promise<USBDeviceLike> {
  return (navigator as unknown as { usb: { requestDevice(o: object): Promise<USBDeviceLike> } }).usb.requestDevice({ filters: ids });
}
export async function pickSerial(): Promise<SerialPortLike> {
  return (navigator as unknown as { serial: { requestPort(o: object): Promise<SerialPortLike> } }).serial.requestPort({ filters: [{ usbVendorId: 0x0483, usbProductId: 0x5740 }] });
}

// ---------- tinySA (USB serial shell) ----------
/** Parses `scan start stop points 3` output: one "frequency level" pair per line. */
export function parseTinyScan(text: string): { f: number[]; d: number[] } {
  const f: number[] = [], d: number[] = [];
  for (const ln of text.split(/\r?\n/)) { const m = /^\s*(\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*$/i.exec(ln); if (m) { f.push(+m[1]); d.push(+m[2]); } }
  return { f, d };
}
export async function openTinySA(port: SerialPortLike): Promise<Driver> {
  await port.open({ baudRate: 115200 });
  const enc = new TextEncoder(), dec = new TextDecoder(); let buf = '';
  const reader = port.readable.getReader(), writer = port.writable.getWriter();
  const pump = (async () => { for (;;) { const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true })); if (done) break; if (value) buf += dec.decode(value); } })();
  const cmd = async (c: string, ms = 60000) => {
    buf = ''; await writer.write(enc.encode(c + '\r'));
    const t0 = Date.now(); while (!/ch> $/.test(buf) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15));
    return buf.replace(/^.*?\r?\n/, '').replace(/ch> $/, '');
  };
  const ver = (await cmd('version', 3000)).trim(); const ultra = /ultra|ZS-?407/i.test(ver), label = ver.split(/\r?\n/)[0] || 'tinySA';
  return {
    id: ultra ? 'tinysa-ultra' : 'tinysa', label, range: ultra ? [100 * kHz, 6 * GHz] : [100 * kHz, 960 * MHz], calibrated: true, info: ver,
    async sweep(r) {
      const pts = Math.max(51, Math.min(450, r.points));
      if (r.rbwHz) await cmd(`rbw ${Math.max(3, Math.round(r.rbwHz / 1000))}`, 3000); else await cmd('rbw auto', 3000);
      const txt = await cmd(`scan ${Math.round(r.start)} ${Math.round(r.stop)} ${pts} 3`);
      const s = parseTinyScan(txt); const rbw = r.rbwHz ?? (r.stop - r.start) / pts;
      return { f: freqs(r.start, r.stop, r.points), dbm: toPoints(s.f, s.d, r.start, r.stop, r.points, r.detector), at: Date.now(), device: label, calibrated: true, rbwHz: rbw };
    },
    async close() { try { reader.cancel(); await pump; reader.releaseLock(); writer.releaseLock(); await port.close(); } catch { /* already closed */ } },
  };
}

// ---------- RTL-SDR (WebUSB) ----------
/** The connection object the vendored RTL2832U driver talks to. */
function webUsbConn(d: USBDeviceLike) {
  return {
    claimInterface: (n: number) => d.claimInterface(n), releaseInterface: (n: number) => d.releaseInterface(n),
    controlTransfer: async (ti: { direction: 'in' | 'out'; data?: ArrayBuffer; length?: number }) => { if (ti.direction === 'out') { await d.controlTransferOut(ti, ti.data); return undefined; } const r = await d.controlTransferIn(ti, ti.length ?? 0); return r.data!.buffer; },
    bulkTransfer: async (ti: { endpoint: number; length: number }) => (await d.transferIn(ti.endpoint, ti.length)).data!.buffer,
  };
}
export async function openRtlSdr(d: USBDeviceLike, opts: { ppm?: number; gain?: number | null } = {}): Promise<Driver> {
  await d.open(); await d.selectConfiguration(1);
  const rtl = RTL2832U(webUsbConn(d), opts.ppm ?? 0, opts.gain ?? null); await rtl.open();
  const rate = await rtl.setSampleRate(2_400_000), label = d.productName || 'RTL-SDR';
  return {
    id: 'rtlsdr', label, range: [24 * MHz, 1766 * MHz], calibrated: false,
    async sweep(r, abort) {
      const n = 1024, useBw = rate * 0.75, acc = { f: [] as number[], d: [] as number[] };
      for (let c = r.start + useBw / 2; c - useBw / 2 < r.stop; c += useBw) {
        if (abort?.aborted) break;
        await rtl.setCenterFrequency(c); await rtl.resetBuffer();
        await rtl.readSamples(16384); // settle after retune
        const { i, q } = iq8(await rtl.readSamples(n * 16), false);
        stitch(acc, c, rate, iqSpectrum(i, q, n), 0.75);
      }
      return { f: freqs(r.start, r.stop, r.points), dbm: toPoints(acc.f, acc.d, r.start, r.stop, r.points, r.detector), at: Date.now(), device: label, calibrated: false, rbwHz: (rate / n) * 2.0 };
    },
    async close() { try { await rtl.close(); } catch { /* */ } try { await d.close(); } catch { /* */ } },
  };
}

// ---------- HackRF One (WebUSB) ----------
const HR = { MODE: 1, RATE: 6, BBF: 7, FREQ: 16, AMP: 17, LNA: 19, VGA: 20 } as const;
const MAX2837_FT = [1750000, 2500000, 3500000, 5000000, 5500000, 6000000, 7000000, 8000000, 9000000, 10000000, 12000000, 14000000, 15000000, 20000000, 24000000, 28000000];
export async function openHackRF(d: USBDeviceLike, opts: { lna?: number; vga?: number; amp?: boolean } = {}): Promise<Driver> {
  await d.open(); await d.selectConfiguration(1); await d.claimInterface(0);
  const out = (req: number, value: number, index: number, data?: ArrayBuffer) => d.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: req, value, index }, data ?? new ArrayBuffer(0));
  const inn = (req: number, value: number, index: number, len: number) => d.controlTransferIn({ requestType: 'vendor', recipient: 'device', request: req, value, index }, len);
  const u32 = (a: number, b: number) => { const v = new DataView(new ArrayBuffer(8)); v.setUint32(0, a, true); v.setUint32(4, b, true); return v.buffer; };
  const rate = 20_000_000;
  await out(HR.RATE, 0, 0, u32(rate, 1));
  const bbf = [...MAX2837_FT].reverse().find((b) => b <= rate * 0.75) ?? 15_000_000; await out(HR.BBF, bbf & 0xffff, bbf >>> 16);
  await inn(HR.LNA, 0, Math.round((opts.lna ?? 24) / 8) * 8, 1); await inn(HR.VGA, 0, Math.round((opts.vga ?? 20) / 2) * 2, 1); await out(HR.AMP, opts.amp ? 1 : 0, 0);
  const tune = (hz: number) => out(HR.FREQ, 0, 0, u32(Math.floor(hz / 1e6), Math.round(hz % 1e6))), label = d.productName || 'HackRF One';
  return {
    id: 'hackrf', label, range: [1 * MHz, 6 * GHz], calibrated: false,
    async sweep(r, abort) {
      const n = 2048, useBw = rate * 0.6, acc = { f: [] as number[], d: [] as number[] };
      for (let c = r.start + useBw / 2; c - useBw / 2 < r.stop; c += useBw) {
        if (abort?.aborted) break;
        await tune(c); await out(HR.MODE, 1, 0);
        await d.transferIn(1, 262144); // discard while the tuner settles
        const res = await d.transferIn(1, n * 2 * 8); await out(HR.MODE, 0, 0);
        const { i, q } = iq8(res.data!.buffer as ArrayBuffer, true);
        stitch(acc, c, rate, iqSpectrum(i, q, n), 0.6);
      }
      return { f: freqs(r.start, r.stop, r.points), dbm: toPoints(acc.f, acc.d, r.start, r.stop, r.points, r.detector), at: Date.now(), device: label, calibrated: false, rbwHz: (rate / n) * 2.0 };
    },
    async close() { try { await out(HR.MODE, 0, 0); await d.releaseInterface(0); } catch { /* */ } try { await d.close(); } catch { /* */ } },
  };
}

// ---------- simulator (test signals) ----------
export interface SimSignal { f: number; dbm: number; bw: number; label: string }
/** Signals a typical site might show: a VHF repeater pair, UHF, 700/800 public safety, an oscillating BDA, and an intermod product. */
export const SIM_SIGNALS: SimSignal[] = [
  { f: 155.475e6, dbm: -62, bw: 11e3, label: 'VHF repeater output' }, { f: 154.25e6, dbm: -78, bw: 11e3, label: 'VHF mobile' },
  { f: 462.55e6, dbm: -55, bw: 11e3, label: 'UHF repeater' }, { f: 467.55e6, dbm: -71, bw: 11e3, label: 'UHF input' },
  { f: 769.40625e6, dbm: -80, bw: 9e3, label: '700 MHz P25 control channel' },
  { f: 851.0125e6, dbm: -66, bw: 9e3, label: '800 MHz P25 site' }, { f: 852.0125e6, dbm: -69, bw: 9e3, label: '800 MHz P25 voice' }, { f: 850.0125e6, dbm: -88, bw: 9e3, label: 'Intermod 2×851.0125 − 852.0125' },
  { f: 859.3e6, dbm: -58, bw: 400e3, label: 'BDA oscillation (wideband hump)' },
  { f: 2.437e9, dbm: -50, bw: 18e6, label: 'Wi-Fi channel 6' }, { f: 98.1e6, dbm: -40, bw: 180e3, label: 'FM station' },
];
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export function simSweep(r: SweepRequest, noiseDbm = -105, signals = SIM_SIGNALS): Sweep {
  const f = freqs(r.start, r.stop, r.points), d = new Float32Array(r.points), rbw = r.rbwHz ?? Math.max(1000, (r.stop - r.start) / r.points);
  for (let k = 0; k < r.points; k++) {
    let p = 10 ** ((noiseDbm + 10 * Math.log10(rbw / 10e3) + (rnd() - 0.5) * 4) / 10);
    for (const s of signals) {
      // Gaussian-shaped signal whose total (channel) power is s.dbm: each point holds the power inside one RBW
      const sk = s.bw > 100e3 ? 0.15 : 1, a = 2.763 * sk, area = (s.bw / 2) * Math.sqrt(Math.PI / a), x = (f[k] - s.f) / (s.bw / 2);
      if (Math.abs(x) < 8) p += 10 ** (s.dbm / 10) * Math.min(1, rbw / area) * Math.exp(-a * x * x);
    }
    d[k] = 10 * Math.log10(p);
  }
  return { f, dbm: d, at: Date.now(), device: 'Built-in test signals', calibrated: true, rbwHz: rbw };
}
export function openSim(): Driver { return { id: 'sim', label: 'Built-in test signals', range: [100 * kHz, 6 * GHz], calibrated: true, async sweep(r) { await new Promise((ok) => setTimeout(ok, 120)); return simSweep(r); }, async close() { /* */ } }; }

// ---------- file import ----------
/** Reads a sweep file: rtl_power / hackrf_sweep / soapy_power CSV (date, time, f_low, f_high, step, samples, dB…), or any CSV / text with
 *  frequency and level columns (Hz, kHz, MHz or GHz; dBm), as saved by tinySA, Signal Hound Spike, FieldFox, Anritsu, Siglent and Rigol. */
export function parseSweepFile(text: string, name = 'file'): { sweeps: Sweep[]; note: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rp = lines.filter((l) => /^\d{4}-\d{2}-\d{2},\s*[\d:]+,\s*\d+,\s*\d+,\s*[\d.]+,\s*\d+,/.test(l));
  if (rp.length) {
    const byTime = new Map<string, { f: number[]; d: number[] }>();
    for (const l of rp) { const c = l.split(',').map((x) => x.trim()); const lo = +c[2], step = +c[4], vals = c.slice(6).map(Number); const k = c[0] + ' ' + c[1]; const a = byTime.get(k) ?? { f: [], d: [] }; vals.forEach((v, i) => { a.f.push(lo + step * (i + 0.5)); a.d.push(v); }); byTime.set(k, a); }
    const sweeps: Sweep[] = [];
    for (const [k, a] of byTime) { const o = a.f.map((_, i) => i).sort((x, y) => a.f[x] - a.f[y]); const f = Float64Array.from(o.map((i) => a.f[i])), d = Float32Array.from(o.map((i) => a.d[i])); sweeps.push({ f, dbm: d, at: Date.parse(k.replace(' ', 'T')) || Date.now(), device: name, calibrated: false, rbwHz: f.length > 1 ? f[1] - f[0] : 0 }); }
    return { sweeps, note: `${sweeps.length} sweep${sweeps.length > 1 ? 's' : ''} from rtl_power / hackrf_sweep format (levels relative unless calibrated).` };
  }
  const head = lines.slice(0, 40).join('\n'), unit = /\bGHz\b/i.test(head) ? 1e9 : /\bMHz\b/i.test(head) ? 1e6 : /\bkHz\b/i.test(head) ? 1e3 : 0;
  const f: number[] = [], d: number[] = [];
  for (const l of lines) { const c = l.split(/[,;\t]|\s+/).map((x) => x.trim()).filter(Boolean); if (c.length < 2) continue; const a = parseFloat(c[0]), b = parseFloat(c[1]); if (!Number.isFinite(a) || !Number.isFinite(b)) continue; f.push(a); d.push(b); }
  if (!f.length) throw new Error('No frequency and level columns found. Save the trace as CSV (frequency, level).');
  const k = unit || (Math.max(...f) < 1e5 ? (Math.max(...f) < 100 ? 1e9 : 1e6) : 1);
  const o = f.map((_, i) => i).sort((x, y) => f[x] - f[y]);
  const F = Float64Array.from(o.map((i) => f[i] * k)), D = Float32Array.from(o.map((i) => d[i]));
  return { sweeps: [{ f: F, dbm: D, at: Date.now(), device: name, calibrated: true, rbwHz: F.length > 1 ? F[1] - F[0] : 0 }], note: `${F.length} points from ${name}${unit ? '' : ` (frequency read as ${k === 1 ? 'Hz' : k === 1e6 ? 'MHz' : 'GHz'})`}.` };
}
