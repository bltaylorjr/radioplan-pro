// Microphone calibration library for the Audio & Acoustic Analyzer.
// Two kinds of curve:
//  • Built-in "typical" curves, written by LvPlan from each microphone's published specification (frequency range,
//    tolerance and the usual shape of that capsule type). They are LvPlan's own approximations, not copies of any
//    manufacturer's file, so they can be bundled freely. They correct the general shape only; a file made for the
//    mic's serial number is always more accurate.
//  • The user's own files (.txt / .cal / .frd / .csv: frequency, dB, optional phase, optional "Sens Factor" or
//    "Sensitivity … dBFS" header). Checked, then kept offline in the app's database and in backups.
// Convention (same as REW): a curve lists the mic's response error in dB; the analyzer subtracts it.
import { kvGet, kvSet } from './projectdb';

export type CalKind = 'measurement' | 'phone' | 'tablet' | 'computer' | 'flat';
export interface MicCal {
  id: string;
  name: string;
  brand: string;
  model: string;
  kind: CalKind;
  source: 'builtin' | 'file';
  /** Free text: orientation, notes. */
  note?: string;
  serial?: string;
  /** dBFS reading at 94 dB SPL with the interface gain the file was made for (UMIK "Sens Factor"). */
  sensDb: number | null;
  f: number[];
  db: number[];
  addedAt?: string;
  /** Auto-selected from the input device name (shown as "picked automatically"). */
  auto?: boolean;
}

// ---------- parsing and validation ----------
export interface ParsedCal { sensDb: number | null; serial?: string; f: number[]; db: number[]; phase: boolean; skipped: number }
/** Reads a calibration file: REW / miniDSP / Dayton / .frd / CSV. Lines that do not begin with a number are headers or comments. */
export function parseCalText(text: string): ParsedCal {
  const t = text.replace(/^﻿/, '');
  const s = /sens\s*factor\s*=\s*([-+]?[\d.]+)\s*dB/i.exec(t) ?? /sensitivity\s*[:=]?\s*([-+]?[\d.]+)\s*dBFS/i.exec(t);
  const ser = /SERNO\s*[:=]?\s*([A-Za-z0-9-]+)/i.exec(t) ?? /serial(?:\s*(?:no|number))?\s*[:=]\s*([A-Za-z0-9-]+)/i.exec(t);
  const f: number[] = [], db: number[] = []; let phase = false, skipped = 0;
  for (const raw of t.split(/\r?\n/)) {
    const ln = raw.trim(); if (!ln || /^[*#;"'/!a-z]/i.test(ln)) continue;
    const parts = ln.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (parts.length < 2 || !parts.slice(0, 2).every(Number.isFinite)) { skipped++; continue; }
    if (parts.length >= 3 && Number.isFinite(parts[2])) phase = true;
    f.push(parts[0]); db.push(parts[1]);
  }
  return { sensDb: s ? +s[1] : null, serial: ser?.[1], f, db, phase, skipped };
}

/** Checks a parsed file. Returns a plain-language problem, or null when it is usable. Sorts and de-duplicates in place. */
export function validateCal(c: { f: number[]; db: number[] }): string | null {
  if (c.f.length < 2) return 'This file has no frequency and dB lines. A calibration file lists a frequency (Hz) and a correction (dB) on each line.';
  const pts = c.f.map((f, i) => [f, c.db[i]] as const).filter(([f]) => f > 0).sort((a, b) => a[0] - b[0]);
  const u: [number, number][] = []; for (const p of pts) if (!u.length || p[0] > u[u.length - 1][0]) u.push([p[0], p[1]]);
  if (u.length < 5) return 'This file has fewer than 5 usable points, so it cannot be a microphone calibration.';
  if (u[0][0] > 200 || u[u.length - 1][0] < 5000) return `This file only covers ${Math.round(u[0][0])} Hz to ${Math.round(u[u.length - 1][0])} Hz. A microphone calibration should cover at least 200 Hz to 5 kHz.`;
  if (u[u.length - 1][0] > 200000) return 'The frequencies in this file go above 200 kHz, so it does not look like a microphone calibration.';
  if (u.some(([, d]) => Math.abs(d) > 40)) return 'Some corrections in this file are larger than 40 dB. That is not a microphone calibration (it may be a measurement or a speaker response).';
  c.f.length = 0; c.db.length = 0; for (const [f, d] of u) { c.f.push(f); c.db.push(d); }
  return null;
}

/** Guesses the brand and model from a file name and its text (UMIK files are named by serial number). */
export function guessMic(fileName: string, text = ''): { brand: string; model: string; note?: string; serial?: string } {
  const s = `${fileName} ${text.slice(0, 400)}`;
  const note = /90\s*(deg|°)?|_90|-90/i.test(fileName) ? '90° (pointing up)' : /0\s*(deg|°)|_0\b|-0\b/i.test(fileName) ? '0° (pointing at the source)' : undefined;
  const serial = /(\d{6,8})/.exec(fileName)?.[1];
  if (/umik[-\s_]?2/i.test(s)) return { brand: 'miniDSP', model: 'UMIK-2', note, serial };
  if (/umik/i.test(s) || /^70\d{5}/.test(fileName)) return { brand: 'miniDSP', model: 'UMIK-1', note, serial };
  if (/^80\d{5}/.test(fileName)) return { brand: 'miniDSP', model: 'UMIK-2', note, serial };
  for (const m of ['iMM-6C', 'iMM-6', 'EMM-6', 'UMM-6']) if (new RegExp(m.replace('-', '[-\\s_]?'), 'i').test(s)) return { brand: 'Dayton Audio', model: m, note, serial };
  if (/ecm\s?8000/i.test(s)) return { brand: 'Behringer', model: 'ECM8000', note, serial };
  if (/xref/i.test(s)) return { brand: 'Sonarworks', model: 'XREF 20', note, serial };
  return { brand: 'My microphone', model: fileName.replace(/\.[a-z0-9]+$/i, ''), note, serial };
}

// ---------- correction ----------
/** Response error (dB) at f, interpolated on a log-frequency axis and held flat beyond the ends. */
export function calAt(c: { f: number[]; db: number[] } | null | undefined, f: number): number {
  if (!c || !c.f.length || !(f > 0)) return 0; const n = c.f.length;
  if (f <= c.f[0]) return c.db[0]; if (f >= c.f[n - 1]) return c.db[n - 1];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.f[m] <= f) lo = m; else hi = m; }
  const t = Math.log(f / c.f[lo]) / Math.log(c.f[hi] / c.f[lo]); return c.db[lo] + t * (c.db[hi] - c.db[lo]);
}
const gainCache = new WeakMap<object, Map<string, Float64Array>>();
/** Power multipliers per FFT bin (bin k at k·df) that remove the mic's response error. Cached per curve and bin layout. */
export function binGains(c: { f: number[]; db: number[] }, bins: number, df: number): Float64Array {
  let m = gainCache.get(c); if (!m) { m = new Map(); gainCache.set(c, m); }
  const key = `${bins}:${df}`; let g = m.get(key);
  if (!g) { g = new Float64Array(bins); for (let k = 0; k < bins; k++) g[k] = 10 ** (-calAt(c, k * df) / 10); m.set(key, g); }
  return g;
}
/** Applies a calibration curve to a power spectrum in place. */
export function applyCal(power: Float64Array, df: number, c: { f: number[]; db: number[] } | null | undefined): Float64Array {
  if (!c || !c.f.length) return power; const g = binGains(c, power.length, df); for (let k = 1; k < power.length; k++) power[k] *= g[k]; return power;
}

// ---------- built-in typical curves ----------
// Each shape is written as anchor points (Hz, dB response error). Values follow the published frequency range and
// tolerance of each model and the usual behaviour of the capsule type (electret, MEMS, phone port resonance).
type Shape = [number, number][];
const ISO = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
function curve(sh: Shape): { f: number[]; db: number[] } {
  const c = { f: sh.map((p) => p[0]), db: sh.map((p) => p[1]) };
  return { f: [...ISO], db: ISO.map((f) => +calAt(c, f).toFixed(2)) };
}
// Shapes for capsule families.
const S = {
  flat: [[20, 0], [20000, 0]] as Shape,
  class1: [[20, -0.3], [100, 0], [4000, 0], [8000, 0.2], [12500, 0.4], [16000, 0.3], [20000, -0.5]] as Shape,
  umik1_0: [[20, -1.6], [40, -0.6], [100, -0.1], [1000, 0], [3150, 0.3], [5000, 0.8], [8000, 1.9], [10000, 2.6], [12500, 3.6], [16000, 4.1], [20000, 2.2]] as Shape,
  umik1_90: [[20, -1.6], [40, -0.6], [100, -0.1], [1000, 0], [3150, 0], [5000, -0.2], [8000, -0.4], [10000, -0.6], [12500, -0.9], [16000, -1.8], [20000, -4.0]] as Shape,
  umik2_0: [[20, -0.8], [50, -0.3], [100, 0], [1000, 0], [4000, 0.4], [8000, 1.5], [10000, 2.1], [12500, 2.9], [16000, 3.5], [20000, 2.0]] as Shape,
  umik2_90: [[20, -0.8], [50, -0.3], [100, 0], [1000, 0], [4000, 0], [8000, -0.3], [12500, -0.8], [16000, -1.6], [20000, -3.5]] as Shape,
  daytonElectret: [[20, -1.2], [40, -0.5], [100, 0], [1000, 0], [4000, 0.4], [6300, 1.0], [8000, 1.6], [10000, 2.2], [12500, 2.8], [16000, 2.4], [20000, 0.5]] as Shape,
  imm6: [[20, -3.0], [40, -1.5], [80, -0.5], [150, 0], [1000, 0], [4000, 0.6], [6300, 1.5], [8000, 2.4], [10000, 3.0], [12500, 3.2], [16000, 1.5], [20000, -2.5]] as Shape,
  ecm8000: [[20, -1.0], [50, -0.3], [100, 0], [1000, 0], [3150, 0.5], [5000, 1.2], [8000, 2.2], [10000, 2.8], [12500, 3.3], [16000, 2.6], [20000, 0.0]] as Shape,
  smallPrecision: [[20, -0.5], [50, -0.1], [100, 0], [5000, 0], [10000, 0.4], [16000, 0.8], [20000, 0.3]] as Shape,
  iphone: [[20, -18], [40, -11], [63, -6], [100, -2.5], [160, -0.8], [250, -0.2], [1000, 0], [2500, 0.3], [4000, 1.0], [6300, 2.5], [8000, 3.5], [10000, 3.0], [12500, 1.0], [16000, -3.0], [20000, -9]] as Shape,
  android: [[20, -22], [40, -14], [63, -8], [100, -4], [160, -1.5], [250, -0.5], [1000, 0], [2500, 0.5], [4000, 1.5], [6300, 3.5], [8000, 4.5], [10000, 3.5], [12500, 1.0], [16000, -4.0], [20000, -12]] as Shape,
  tablet: [[20, -16], [40, -9], [63, -5], [100, -2], [160, -0.6], [250, 0], [1000, 0], [4000, 0.8], [6300, 2.0], [8000, 2.8], [10000, 2.2], [12500, 0.5], [16000, -3.5], [20000, -10]] as Shape,
  laptop: [[20, -25], [40, -17], [63, -11], [100, -6], [160, -3], [250, -1], [500, 0], [1000, 0], [2500, 0.8], [4000, 2.0], [6300, 3.0], [8000, 2.0], [10000, 0], [12500, -3], [16000, -8], [20000, -15]] as Shape,
  headset: [[20, -20], [50, -12], [100, -6], [200, -2], [400, 0], [1000, 0], [3150, 1.5], [5000, 2.5], [8000, 0], [10000, -4], [16000, -15], [20000, -22]] as Shape,
};
type Def = [brand: string, model: string, kind: CalKind, shape: Shape, note?: string, sensDb?: number];
const DEFS: Def[] = [
  ['Flat', 'No correction (flat)', 'flat', S.flat, 'Use for a microphone that is already flat, such as a sound level meter microphone'],
  ['miniDSP', 'UMIK-1', 'measurement', S.umik1_0, '0° (pointing at the source)'],
  ['miniDSP', 'UMIK-1', 'measurement', S.umik1_90, '90° (pointing up, for rooms)'],
  ['miniDSP', 'UMIK-2', 'measurement', S.umik2_0, '0° (pointing at the source)'],
  ['miniDSP', 'UMIK-2', 'measurement', S.umik2_90, '90° (pointing up, for rooms)'],
  ['Dayton Audio', 'EMM-6', 'measurement', S.daytonElectret, 'XLR, needs an audio interface with phantom power'],
  ['Dayton Audio', 'UMM-6', 'measurement', S.daytonElectret, 'USB'],
  ['Dayton Audio', 'iMM-6', 'measurement', S.imm6, 'Plugs into a phone headset jack'],
  ['Dayton Audio', 'iMM-6C', 'measurement', S.imm6, 'USB-C, for phones and tablets'],
  ['Behringer', 'ECM8000', 'measurement', S.ecm8000, 'XLR, needs phantom power'],
  ['Behringer', 'ECM8000 (90°)', 'measurement', S.umik1_90, '90° (pointing up)'],
  ['Superlux', 'ECM999', 'measurement', S.ecm8000, 'XLR, needs phantom power'],
  ['PreSonus', 'PRM1', 'measurement', S.daytonElectret, 'XLR, needs phantom power'],
  ['Audix', 'TM1', 'measurement', S.smallPrecision, 'XLR, needs phantom power'],
  ['Sonarworks', 'XREF 20', 'measurement', S.smallPrecision, 'XLR, needs phantom power'],
  ['IK Multimedia', 'ARC MEMS mic', 'measurement', S.smallPrecision, 'USB'],
  ['Earthworks', 'M23 / M30', 'measurement', S.flat, 'Precision mic, ±1 dB: flat is the right typical curve'],
  ['Beyerdynamic', 'MM 1', 'measurement', S.smallPrecision, 'XLR, needs phantom power'],
  ['Sound level meter', 'Class 1 microphone (IEC 61672)', 'measurement', S.class1, 'Free-field class 1 capsule'],
  ['Sound level meter', 'Class 2 microphone (IEC 61672)', 'measurement', S.ecm8000, 'Typical class 2 meter or app mic'],
  ['Apple', 'iPhone (built-in mic)', 'phone', S.iphone, 'Bottom microphone, case off, measurement mode'],
  ['Apple', 'iPad (built-in mic)', 'tablet', S.tablet, 'Case off'],
  ['Samsung', 'Galaxy phone (built-in mic)', 'phone', S.android, 'Bottom microphone, case off'],
  ['Google', 'Pixel phone (built-in mic)', 'phone', S.android, 'Bottom microphone, case off'],
  ['Android', 'Other Android phone (built-in mic)', 'phone', S.android, 'Bottom microphone, case off'],
  ['Android', 'Android tablet (built-in mic)', 'tablet', S.tablet, 'Case off'],
  ['Windows / Mac', 'Laptop built-in mic', 'computer', S.laptop, 'Rough only: laptop mics are made for voice'],
  ['Windows / Mac', 'USB or Bluetooth headset mic', 'computer', S.headset, 'Rough only: voice band'],
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const BUILTIN_CALS: MicCal[] = DEFS.map(([brand, model, kind, sh, note, sensDb]) => ({
  id: `builtin:${slug(`${brand} ${model} ${note?.startsWith('90') ? '90' : ''}`)}`, name: `${brand === 'Flat' ? '' : `${brand} `}${model}${note && /^\d+°/.test(note) ? `, ${note.split(' ')[0]}` : ''}`,
  brand, model, kind, source: 'builtin', note, sensDb: sensDb ?? null, ...curve(sh),
}));
export const KIND_LABEL: Record<CalKind, string> = { measurement: 'Measurement mic', phone: 'Phone', tablet: 'Tablet', computer: 'Computer / headset', flat: 'Flat' };

/** Picks the best curve for an input device name (e.g. "Umik-1  Gain: 18dB", "iMM-6C"), preferring the user's own file. */
export function matchDevice(label: string, lib: MicCal[], isPhone = false): MicCal | null {
  const l = label.toLowerCase();
  const pick = (brand: string, model: string) => lib.find((c) => c.source === 'file' && c.brand === brand && c.model === model)
    ?? lib.find((c) => c.source === 'builtin' && c.brand === brand && c.model === model && (c.note ?? '').startsWith('90')) ?? lib.find((c) => c.source === 'builtin' && c.brand === brand && c.model === model) ?? null;
  if (/umik[-\s]?2/.test(l)) return pick('miniDSP', 'UMIK-2');
  if (/umik/.test(l)) return pick('miniDSP', 'UMIK-1');
  if (/imm[-\s]?6c/.test(l)) return pick('Dayton Audio', 'iMM-6C');
  if (/imm[-\s]?6/.test(l)) return pick('Dayton Audio', 'iMM-6');
  if (/umm[-\s]?6/.test(l)) return pick('Dayton Audio', 'UMM-6');
  if (/xref/.test(l)) return pick('Sonarworks', 'XREF 20');
  if (/headset|airpods|bluetooth|hands-free/.test(l)) return pick('Windows / Mac', 'USB or Bluetooth headset mic');
  if (isPhone && (!l || /default|built-in|internal|microphone|iphone|bottom|front|back/.test(l))) {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/iPhone/.test(ua)) return pick('Apple', 'iPhone (built-in mic)');
    if (/iPad/.test(ua)) return pick('Apple', 'iPad (built-in mic)');
    if (/Pixel/.test(ua)) return pick('Google', 'Pixel phone (built-in mic)');
    if (/SM-|Samsung/i.test(ua)) return pick('Samsung', 'Galaxy phone (built-in mic)');
    return pick('Android', /Mobile/.test(ua) ? 'Other Android phone (built-in mic)' : 'Android tablet (built-in mic)');
  }
  return null;
}

/** Searches the library: every word must appear in the brand, model, note, serial or type. */
export function searchCals(lib: MicCal[], q: string, kind: 'all' | 'mine' | CalKind = 'all'): MicCal[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return lib.filter((c) => (kind === 'all' || (kind === 'mine' ? c.source === 'file' : c.kind === kind))
    && words.every((w) => `${c.brand} ${c.model} ${c.note ?? ''} ${c.serial ?? ''} ${KIND_LABEL[c.kind]}`.toLowerCase().includes(w)));
}

// ---------- the user's own files (offline, app-wide, included in backups) ----------
const KEY = 'miccal:library';
export async function loadUserCals(): Promise<MicCal[]> { const v = await kvGet<MicCal[]>(KEY); return Array.isArray(v) ? v.filter((c) => c && Array.isArray(c.f) && Array.isArray(c.db)) : []; }
export async function saveUserCal(c: MicCal): Promise<MicCal[]> { const l = (await loadUserCals()).filter((x) => x.id !== c.id); l.unshift(c); await kvSet(KEY, l); return l; }
export async function deleteUserCal(id: string): Promise<MicCal[]> { const l = (await loadUserCals()).filter((x) => x.id !== id); await kvSet(KEY, l); return l; }

/** Builds a library entry from a file's text. Throws a plain-language Error when the file is not usable. */
export function calFromFile(fileName: string, text: string): MicCal {
  const p = parseCalText(text); const c = { f: p.f, db: p.db }; const bad = validateCal(c); if (bad) throw new Error(bad);
  const g = guessMic(fileName, text); const serial = p.serial ?? g.serial;
  return { id: `file:${slug(fileName)}-${Date.now().toString(36)}`, name: `${g.brand === 'My microphone' ? g.model : `${g.brand} ${g.model}`}${serial ? ` #${serial}` : ''}${g.note ? `, ${g.note.split(' ')[0]}` : ''}`,
    brand: g.brand, model: g.model, kind: 'measurement', source: 'file', note: g.note ? `${g.note}. Your own file: ${fileName}` : `Your own file: ${fileName}`, serial, sensDb: p.sensDb, f: c.f, db: c.db, addedAt: new Date().toISOString() };
}
