import { tauri } from './update';
// Low-level connections to field devices: Bluetooth Low Energy (Web Bluetooth), a USB or paired-Bluetooth COM port
// (Web Serial), a Wi-Fi device on the local network (through the installed app), or the phone's own radio (Android app).
// The device hub (devices.ts) turns what they send into readings, GPS fixes, distances or scanned codes.

/** Serial-over-Bluetooth services most meters, GPS receivers, laser meters and BLE modules use. */
export const UART_SERVICES = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC254x
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip transparent UART
  '0000fff0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffb0-0000-1000-8000-00805f9b34fb', '0000fee0-0000-1000-8000-00805f9b34fb',
  '0000181a-0000-1000-8000-00805f9b34fb', // environmental sensing
  '0000180f-0000-1000-8000-00805f9b34fb', // battery (shown, not read)
  '3ab10100-f831-4395-b29d-570977d5bf94', // Leica DISTO
  '02a6c0d0-0451-4000-b000-fb3210111989', // Bosch GLM
];
/** Standard characteristics that notify but carry no reading (battery, heart rate, time, device info). */
const NOT_DATA = /^0000(2a19|2a37|2a2b|2a05|2a00|2a01|2a24|2a25|2a26|2a27|2a28|2a29)/i;

export interface Link { name: string; transport: Transport; close: () => void }
export type Transport = 'bluetooth' | 'serial' | 'wifi' | 'phone';
export const TRANSPORT_LABEL: Record<Transport, string> = { bluetooth: 'Bluetooth', serial: 'USB / COM port', wifi: 'Wi-Fi', phone: 'This phone' };

type Nav = Navigator & { bluetooth?: { requestDevice: (o: object) => Promise<any> }; serial?: { requestPort: (o?: object) => Promise<any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const nav = () => (typeof navigator === 'undefined' ? undefined : (navigator as Nav));
export const bluetoothSupported = () => !!nav()?.bluetooth;
export const serialSupported = () => !!nav()?.serial;

// ---------------------------------------------------------------- Bluetooth
/** Ask for a Bluetooth device, connect and pass on every notification from every data characteristic. */
export async function openBluetooth(onData: (dv: DataView) => void, onStatus: (s: string) => void, onGone?: () => void): Promise<Link> {
  const bt = nav()?.bluetooth; if (!bt) throw new Error('Bluetooth is not available here. Use Chrome or Edge on a computer or Android, or the Wi-Fi / file options.');
  onStatus('Choose your device in the list…');
  const dev = await bt.requestDevice({ acceptAllDevices: true, optionalServices: UART_SERVICES });
  onStatus(`Connecting to ${dev.name || 'device'}…`);
  const server = await dev.gatt.connect();
  const services = await server.getPrimaryServices();
  let subs = 0;
  for (const s of services) {
    let chars: any[] = []; try { chars = await s.getCharacteristics(); } catch { continue; } // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const c of chars) {
      if (!(c.properties.notify || c.properties.indicate) || NOT_DATA.test(c.uuid)) continue;
      try { await c.startNotifications(); subs++; c.addEventListener('characteristicvaluechanged', (e: Event) => onData((e.target as unknown as { value: DataView }).value)); } catch { /* not readable */ }
    }
  }
  if (!subs) { server.disconnect(); throw new Error(`${dev.name || 'This device'} connected but sends nothing the app can read. Try its Wi-Fi or USB option, or import its file.`); }
  dev.addEventListener('gattserverdisconnected', () => { onStatus(`${dev.name || 'Device'} disconnected.`); onGone?.(); });
  return { name: dev.name || 'Bluetooth device', transport: 'bluetooth', close: () => { try { server.disconnect(); } catch { /* gone */ } } };
}

// ---------------------------------------------------------------- COM port
/** Ask for a COM port (USB device, or a Bluetooth device paired in Windows) and pass on the text it sends. */
export async function openSerial(baud: number, onText: (s: string) => void, onStatus: (s: string) => void, onGone?: () => void): Promise<Link> {
  const se = nav()?.serial; if (!se) throw new Error('USB / COM ports are not available here. Use Chrome or Edge on a computer, or the Bluetooth / Wi-Fi options.');
  onStatus('Choose the device’s port…');
  const port = await se.requestPort();
  await port.open({ baudRate: baud });
  const reader = port.readable.getReader(); const dec = new TextDecoder(); let stop = false;
  (async () => {
    try { while (!stop) { const { value, done } = await reader.read(); if (done) break; onText(dec.decode(value, { stream: true })); } }
    catch (e) { if (!stop) onStatus(`Stopped: ${(e as Error).message}`); }
    if (!stop) onGone?.();
  })();
  return { name: 'USB / COM device', transport: 'serial', close: () => { stop = true; reader.cancel().catch(() => undefined).finally(() => { try { reader.releaseLock(); port.close(); } catch { /* closed */ } }); } };
}

// ---------------------------------------------------------------- Wi-Fi
/** Only devices on the local network: 10.x, 172.16–31.x, 192.168.x, 169.254.x, or a .local name. */
export function lanAddressOk(url: string): boolean {
  const m = /^(https?|tcp|ws):\/\/([^/:@\s]+)(?::(\d{1,5}))?(\/[^\s@]*)?$/i.exec(url.trim()); if (!m) return false;
  const h = m[2].toLowerCase();
  if (/\.local$/.test(h)) return true;
  const ip = h.split('.').map(Number); if (ip.length !== 4 || ip.some((x) => !(x >= 0 && x <= 255))) return false;
  return ip[0] === 10 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168) || (ip[0] === 169 && ip[1] === 254);
}
type AndroidLan = { lanRead?: (id: string, url: string) => void };
const android = (): AndroidLan | null => (typeof window !== 'undefined' && (window as unknown as { RadioPlanAndroid?: AndroidLan }).RadioPlanAndroid) || null;
const waiting = new Map<string, (ok: boolean, text: string) => void>(); let seq = 0;
if (typeof window !== 'undefined') (window as unknown as { __lanDone: unknown }).__lanDone = (id: string, ok: boolean, b64: string) => {
  const f = waiting.get(id); waiting.delete(id); let t = ''; try { t = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); } catch { /* empty */ } f?.(ok, t);
};
/** One read from a Wi-Fi device: an http:// page (GET) or a tcp:// stream (what arrives in about a second). */
export async function lanRead(url: string): Promise<string> {
  if (!lanAddressOk(url)) throw new Error('Use the device’s local address, like http://192.168.4.1/ or tcp://192.168.1.20:10110.');
  const t = tauri(); if (t) return (await t.invoke('lan_read', { url })) as string;
  const a = android();
  if (a?.lanRead) return new Promise((res, rej) => { const id = 'lan' + ++seq; const tm = setTimeout(() => { waiting.delete(id); rej(new Error('The device did not answer.')); }, 8000);
    waiting.set(id, (ok, text) => { clearTimeout(tm); if (ok) res(text); else rej(new Error(text || 'The device did not answer.')); }); a.lanRead!(id, url); });
  if (!/^https?:/i.test(url)) throw new Error('tcp:// devices work in the installed Windows or Android app.');
  const r = await fetch(url, { cache: 'no-store' }).catch(() => { throw new Error('This browser could not reach the device. Use the installed Windows or Android app on the same Wi-Fi.'); });
  return r.text();
}
/** Wi-Fi device: a ws:// address streams text; http:// and tcp:// are read again and again. */
export function openWifi(url: string, everyMs: number, onText: (s: string) => void, onStatus: (s: string) => void): Link {
  if (!lanAddressOk(url)) throw new Error('Use the device’s local address, like http://192.168.4.1/ or tcp://192.168.1.20:10110.');
  if (/^ws:/i.test(url)) {
    const ws = new WebSocket(url); ws.onmessage = (e) => onText(String(e.data) + '\n'); ws.onerror = () => onStatus('Could not reach the device on Wi-Fi.'); ws.onclose = () => onStatus('Wi-Fi device closed the connection.');
    return { name: url, transport: 'wifi', close: () => ws.close() };
  }
  let stop = false, fails = 0;
  const loop = async () => { while (!stop) { try { onText((await lanRead(url)) + '\n'); fails = 0; } catch (e) { if (++fails === 3) onStatus((e as Error).message); } await new Promise((r) => setTimeout(r, everyMs)); } };
  loop();
  return { name: url.replace(/^\w+:\/\//, ''), transport: 'wifi', close: () => { stop = true; } };
}

// ---------------------------------------------------------------- this phone (Android app)
interface PhoneBridge { phoneSignal?: () => string }
const phoneBridge = (): PhoneBridge | null => (typeof window !== 'undefined' && (window as unknown as { RadioPlanAndroid?: PhoneBridge }).RadioPlanAndroid) || null;
export const phoneSignalSupported = () => typeof phoneBridge()?.phoneSignal === 'function';
export interface PhoneCell { tech: string; dbm: number; registered: boolean; id?: string }
export interface PhoneSignal { cells: PhoneCell[]; wifi?: { ssid: string; dbm: number; mhz?: number }; error?: string }
/** The phone's own cellular and Wi-Fi signal (Android app only). */
export function readPhoneSignal(): PhoneSignal | null {
  const b = phoneBridge(); if (!b?.phoneSignal) return null;
  try { const j = JSON.parse(b.phoneSignal()) as PhoneSignal; j.cells = (j.cells ?? []).filter((c) => Number.isFinite(c.dbm) && c.dbm < 0 && c.dbm > -160); if (j.wifi && !(j.wifi.dbm < 0 && j.wifi.dbm > -127)) delete j.wifi; return j; }
  catch (e) { return { cells: [], error: String(e) }; }
}
/** The serving cell (the one the phone is on), else the strongest cell heard. */
export function bestCell(s: PhoneSignal | null): PhoneCell | null {
  if (!s?.cells.length) return null; const reg = s.cells.filter((c) => c.registered);
  return [...(reg.length ? reg : s.cells)].sort((a, b) => b.dbm - a.dbm)[0];
}
export function openPhone(which: 'cell' | 'wifi', onValue: (dbm: number, info: string) => void, onStatus: (s: string) => void): Link {
  if (!phoneSignalSupported()) throw new Error('Reading the phone’s own signal works in the LvPlan Pro Android app.');
  const tick = () => {
    const s = readPhoneSignal(); if (s?.error) { onStatus(s.error); return; }
    if (which === 'wifi') { if (s?.wifi) onValue(s.wifi.dbm, `Wi-Fi ${s.wifi.ssid}${s.wifi.mhz ? ` ${s.wifi.mhz} MHz` : ''}`); else onStatus('Not connected to Wi-Fi.'); return; }
    const c = bestCell(s); if (c) onValue(c.dbm, `${c.tech}${c.id ? ` ${c.id}` : ''}`); else onStatus('No cell signal heard. Check that Location is on for the app.');
  };
  tick(); const t = window.setInterval(tick, 1000);
  return { name: which === 'wifi' ? 'This phone’s Wi-Fi' : 'This phone’s cell signal', transport: 'phone', close: () => clearInterval(t) };
}
