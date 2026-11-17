// Live space weather from NOAA's Space Weather Prediction Center (SWPC), public domain:
//   products/noaa-planetary-k-index-forecast.json  Kp every 3 hours: observed, estimated and predicted
//   products/noaa-scales.json                      G / S / R storm scales: yesterday, now and the next 3 days
// Downloaded when online (every 3 hours by automatic care, and when the Magnetic Field page opens),
// kept on this device so the page still shows the last forecast offline.
// Plain-language effects are for low-voltage and radio work: hand compass, GPS, HF radio, long cable runs.
import { kvGet, kvSet } from './projectdb';
import { registerDataset } from './maintain';

export const SWPC = 'https://services.swpc.noaa.gov/';
const KEY = 'spaceweather.last';

export interface KpPoint { t: string; kp: number; kind: 'observed' | 'estimated' | 'predicted'; scale: string | null }
export interface ScaleDay { date: string; g: number | null; s: number | null; r: number | null; rMinorProb: number | null; rMajorProb: number | null; sProb: number | null; gText?: string | null }
export interface SpaceWeather { fetchedAt: number; kp: KpPoint[]; scales: { yesterday?: ScaleDay; now?: ScaleDay; days: ScaleDay[] } }

const num = (v: unknown): number | null => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
/** SWPC times are UTC without a zone ("2026-11-09T00:00:00" or "2026-11-09 00:00:00"). */
export const swpcTime = (t: string) => new Date(t.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? '' : 'Z'));

/** Reads the Kp forecast. Accepts the current array-of-objects layout and the older header-row layout. */
export function parseKp(raw: unknown): KpPoint[] {
  if (!Array.isArray(raw)) throw new Error('Kp forecast is not a list');
  let rows: Record<string, unknown>[];
  if (raw.length && Array.isArray(raw[0])) {
    const head = (raw[0] as unknown[]).map((h) => String(h).toLowerCase());
    rows = raw.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r as unknown[])[i]])));
  } else rows = raw as Record<string, unknown>[];
  const out: KpPoint[] = [];
  for (const r of rows) {
    const o = Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const kp = num(o.kp), t = typeof o.time_tag === 'string' ? o.time_tag : '';
    if (kp == null || !t || Number.isNaN(swpcTime(t).getTime())) continue;
    const k = String(o.observed ?? '').toLowerCase();
    out.push({ t, kp: Math.max(0, Math.min(9, kp)), kind: k === 'observed' ? 'observed' : k === 'estimated' ? 'estimated' : 'predicted', scale: typeof o.noaa_scale === 'string' && o.noaa_scale ? o.noaa_scale : null });
  }
  if (!out.length) throw new Error('Kp forecast was empty');
  return out;
}

/** Reads the G / S / R scales ("-1" yesterday, "0" now, "1".."3" forecast days). */
export function parseScales(raw: unknown): SpaceWeather['scales'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('storm scales are not laid out as expected');
  const o = raw as Record<string, Record<string, Record<string, unknown> | string | undefined>>;
  const day = (k: string): ScaleDay | undefined => {
    const d = o[k]; if (!d || typeof d !== 'object') return undefined;
    const R = (d.R ?? {}) as Record<string, unknown>, S = (d.S ?? {}) as Record<string, unknown>, G = (d.G ?? {}) as Record<string, unknown>;
    return { date: String(d.DateStamp ?? ''), g: num(G.Scale), s: num(S.Scale), r: num(R.Scale), rMinorProb: num(R.MinorProb), rMajorProb: num(R.MajorProb), sProb: num(S.Prob), gText: typeof G.Text === 'string' ? G.Text : null };
  };
  const days = ['1', '2', '3'].map(day).filter((x): x is ScaleDay => !!x);
  return { yesterday: day('-1'), now: day('0'), days };
}

async function getJson(path: string) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 20000) : null;
  try {
    const r = await fetch(SWPC + path, { cache: 'no-store', signal: ctl?.signal });
    if (!r.ok) throw new Error(`NOAA answered ${r.status}`);
    return await r.json();
  } finally { if (timer) clearTimeout(timer); }
}

/** Download the latest forecast from NOAA and keep it on this device. */
export async function downloadSpaceWeather(now = Date.now()): Promise<SpaceWeather> {
  const [k, s] = await Promise.all([getJson('products/noaa-planetary-k-index-forecast.json'), getJson('products/noaa-scales.json')]);
  const sw: SpaceWeather = { fetchedAt: now, kp: parseKp(k), scales: parseScales(s) };
  await kvSet(KEY, sw);
  lastSeen = sw; listeners.forEach((f) => f(sw));
  return sw;
}

let lastSeen: SpaceWeather | null = null;
const listeners = new Set<(s: SpaceWeather) => void>();
export function onSpaceWeather(f: (s: SpaceWeather) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** The last forecast kept on this device (null if never downloaded). */
export async function savedSpaceWeather(): Promise<SpaceWeather | null> {
  if (lastSeen) return lastSeen;
  const v = await kvGet<SpaceWeather>(KEY).catch(() => undefined);
  if (v && Array.isArray(v.kp) && v.scales && Number.isFinite(v.fetchedAt)) lastSeen = v;
  return lastSeen;
}

/** Kp → NOAA G scale (Kp 5 = G1 ... Kp 9 = G5). */
export const gOfKp = (kp: number) => (kp >= 9 ? 5 : kp >= 8 ? 4 : kp >= 7 ? 3 : kp >= 6 ? 2 : kp >= 5 ? 1 : 0);
export const G_WORDS = ['Quiet', 'Minor storm', 'Moderate storm', 'Strong storm', 'Severe storm', 'Extreme storm'];
export const kpWord = (kp: number) => (kp < 3 ? 'Quiet' : kp < 4 ? 'Unsettled' : kp < 5 ? 'Active' : G_WORDS[gOfKp(kp)]);
export const kpTone = (kp: number): 'ok' | 'warn' | 'bad' => (kp >= 6 ? 'bad' : kp >= 5 ? 'warn' : 'ok');

/** Kp now (latest observed or estimated value at or before `now`), and the highest Kp predicted in the next 72 hours. */
export function kpSummary(sw: SpaceWeather, now = Date.now()) {
  const past = sw.kp.filter((p) => swpcTime(p.t).getTime() <= now);
  const current = past.length ? past[past.length - 1] : null;
  const next = sw.kp.filter((p) => { const t = swpcTime(p.t).getTime(); return t > now - 3 * 3600e3 && t <= now + 72 * 3600e3; });
  const peak = next.reduce<KpPoint | null>((a, p) => (!a || p.kp > a.kp ? p : a), null);
  return { current, peak, next };
}

/** What a geomagnetic storm level means for the work, in plain words. */
export function stormEffects(g: number): string[] {
  if (g <= 0) return ['Hand compass readings are normal (only the usual local iron and power lines throw them off).', 'GPS and HF radio are normal.'];
  const e: string[] = [];
  e.push(g >= 3 ? 'A hand compass can swing a degree or more and drift during the day. Aim antennas with GPS or a satellite alignment tool, not a compass.' : 'A hand compass can be off by a fraction of a degree. Fine for most work; double-check long-path antenna aiming.');
  e.push(g >= 3 ? 'GPS positions can wander and drop out for minutes. Re-check survey points.' : 'GPS is normally fine; high-precision GPS can be a little less accurate.');
  e.push(g >= 2 ? 'HF (shortwave) radio can fade, especially at night. VHF/UHF two-way radio and cell are normally not affected.' : 'HF radio may fade at high latitudes; no effect here for VHF/UHF.');
  if (g >= 4) e.push('Very long cable runs, power lines and pipelines can pick up induced currents. Expect more surge-protector and power trouble calls.');
  return e;
}

/** A short warning when a storm strong enough to throw off a compass is happening now (shown beside compass bearings). */
export function compassWarning(sw: SpaceWeather | null, now = Date.now()): string | null {
  if (!sw || now - sw.fetchedAt > 12 * 3600e3) return null;
  const c = kpSummary(sw, now).current;
  if (!c || c.kp < 5) return null;
  return `⚠ ${G_WORDS[gOfKp(c.kp)]} (Kp ${c.kp.toFixed(0)}) right now: compass readings can be off. Aim with GPS if you can.`;
}

registerDataset({
  id: 'spaceweather', label: 'Space weather forecast (NOAA)', everyHours: 3, needsOnline: true,
  async verify() {
    const v = await kvGet<SpaceWeather>(KEY).catch(() => undefined);
    if (v !== undefined && (!v || !Array.isArray(v.kp) || !v.scales)) return { ok: false, problem: 'the saved space weather forecast is damaged' };
    return { ok: true };
  },
  async repair() { await kvSet(KEY, undefined); lastSeen = null; return 'removed the damaged forecast; a fresh one downloads when online'; },
  async refresh(ctx) {
    const sw = await downloadSpaceWeather(ctx.now);
    const s = kpSummary(sw, ctx.now);
    return { changed: false, detail: `Kp ${s.current ? s.current.kp.toFixed(1) : '—'} now, up to ${s.peak ? s.peak.kp.toFixed(1) : '—'} in the next 3 days` };
  },
});
