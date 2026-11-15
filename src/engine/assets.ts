// Equipment and asset tags: installed devices logged by scanning their barcode or QR tag, with install,
// warranty, preventive-maintenance and service history, linked to the project's systems and service contracts.
import { parseCsv, findCol, toCsv } from './csv';

export const ASSET_STATUS = ['In service', 'Needs service', 'Out of service', 'Removed'] as const;
export type AssetStatus = (typeof ASSET_STATUS)[number];
export const PM_EVERY = ['', 'Monthly', 'Quarterly', 'Semiannually', 'Annually', 'Every 2 years', 'Every 5 years'] as const;
export const EVENT_KINDS = ['Installed', 'Inspected', 'Tested', 'PM done', 'Repaired', 'Replaced', 'Programmed', 'Note'] as const;
export type AssetEventKind = (typeof EVENT_KINDS)[number];

export interface AssetEvent { id: string; date: string; kind: AssetEventKind; text: string; tech: string }
export interface Asset {
  id: string;
  /** The code on the tag: scanned barcode / QR, or one the app made. */
  tag: string; tagFormat?: string;
  name: string; system: string; make: string; model: string; serial: string;
  location: string; floor?: string; siteId?: string; lat?: number; lon?: number;
  installDate: string; warrantyEnd?: string;
  /** Preventive maintenance interval and last date done. */
  pmEvery?: string; lastPm?: string;
  status: AssetStatus;
  photos: { id: string; dataUrl: string; caption: string }[];
  notes: string; history: AssetEvent[]; addedAt: string;
}

const rid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
export const blankAsset = (o: Partial<Asset> = {}): Asset => ({ id: rid(), tag: '', name: '', system: '', make: '', model: '', serial: '', location: '', installDate: today(), status: 'In service', photos: [], notes: '', history: [], addedAt: new Date().toISOString(), ...o });

/** Codes on labels this app prints start with this, so a scan is known to be one of ours. */
export const LABEL_PREFIX = 'LVA:';
/** The tag in a scanned code: our label prefix removed, a URL's last part, whitespace and control characters trimmed. */
export function tagFromScan(raw: string): string {
  let s = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (s.toUpperCase().startsWith(LABEL_PREFIX)) s = s.slice(LABEL_PREFIX.length);
  return s.trim();
}
const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');
/** The asset with this tag (or, failing that, this serial number). */
export function findByTag(list: Asset[], code: string): Asset | undefined {
  const k = norm(tagFromScan(code)); if (!k) return undefined;
  return list.find((a) => norm(a.tag) === k) ?? list.find((a) => a.serial && norm(a.serial) === k);
}
/** Next free app-made tag: LV-0001, LV-0002… */
export function nextTag(list: Asset[], prefix = 'LV-'): string {
  const max = list.reduce((m, a) => { const x = new RegExp(`^${prefix}(\\d+)$`, 'i').exec(a.tag); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** Guess make / model / serial from what a scanned equipment label says (e.g. "S/N: 12345", GS1 "(21)12345"). */
export function fieldsFromScan(raw: string): Partial<Pick<Asset, 'serial' | 'model' | 'make'>> {
  const s = raw.replace(/[\u001d]/g, '|');
  const out: Partial<Pick<Asset, 'serial' | 'model' | 'make'>> = {};
  const sn = /(?:s\/?n|serial(?:\s*no\.?|\s*number)?)\s*[:#=]?\s*([A-Z0-9-]{4,})/i.exec(s) ?? /\(21\)([A-Z0-9-]{4,})/i.exec(s);
  if (sn) out.serial = sn[1];
  const mn = /(?:m\/?n|model(?:\s*no\.?)?|p\/?n|part\s*no\.?)\s*[:#=]?\s*([A-Z0-9][A-Z0-9./-]{2,})/i.exec(s); if (mn) out.model = mn[1];
  const mk = /(?:mfr|manufacturer|make|brand)\s*[:#=]?\s*([A-Za-z][\w &.-]{1,30})/i.exec(s); if (mk) out.make = mk[1].trim();
  return out;
}

/** Date of the next PM from the interval text and the last date done (or the install date). */
export function nextPm(a: Pick<Asset, 'pmEvery' | 'lastPm' | 'installDate'>): string | null {
  const months: Record<string, number> = { Monthly: 1, Quarterly: 3, Semiannually: 6, Annually: 12, 'Every 2 years': 24, 'Every 5 years': 60 };
  const m = months[a.pmEvery ?? '']; const from = a.lastPm || a.installDate; if (!m || !from) return null;
  const d = new Date(from + 'T12:00:00'); if (isNaN(+d)) return null; const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + m); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
}
export type PmState = 'overdue' | 'soon' | 'ok' | 'none';
/** Overdue, due within 30 days, fine, or no PM set. */
export function pmState(a: Asset, on = today()): { state: PmState; next: string | null; days: number } {
  if (a.status === 'Removed') return { state: 'none', next: null, days: NaN };
  const next = nextPm(a); if (!next) return { state: 'none', next: null, days: NaN };
  const days = Math.round((+new Date(next + 'T12:00:00') - +new Date(on + 'T12:00:00')) / 864e5);
  return { state: days < 0 ? 'overdue' : days <= 30 ? 'soon' : 'ok', next, days };
}
export const warrantyActive = (a: Asset, on = today()) => !!a.warrantyEnd && a.warrantyEnd >= on;

export function assetsCsv(list: Asset[], sysLabel: (id: string) => string, siteName: (id?: string) => string): string {
  return toCsv([['Tag', 'Name', 'System', 'Make', 'Model', 'Serial', 'Location', 'Floor', 'Site', 'Latitude', 'Longitude', 'Installed', 'Warranty ends', 'PM every', 'Last PM', 'Next PM', 'Status', 'Photos', 'History', 'Notes'],
    ...list.map((a) => [a.tag, a.name, sysLabel(a.system), a.make, a.model, a.serial, a.location, a.floor ?? '', siteName(a.siteId), a.lat ?? '', a.lon ?? '', a.installDate, a.warrantyEnd ?? '', a.pmEvery ?? '', a.lastPm ?? '', nextPm(a) ?? '', a.status, a.photos.length,
      a.history.map((h) => `${h.date} ${h.kind}${h.text ? ': ' + h.text : ''}`).join(' | '), a.notes])]);
}

/** Assets from a spreadsheet (an owner's equipment list, a panel export): tag, name, make, model, serial, location… */
export function parseAssetsCsv(text: string, systemOf: (s: string) => string = (s) => s): { assets: Asset[]; skipped: number } {
  const rows = parseCsv(text); const h = rows[0] ?? [];
  const c = (a: string[]) => findCol(h, a);
  const tg = c(['tag', 'assettag', 'asset', 'barcode', 'qr', 'label', 'id']), nm = c(['name', 'description', 'device', 'item', 'equipment']), sy = c(['system', 'category', 'type']);
  const mk = c(['make', 'manufacturer', 'mfr', 'brand']), md = c(['model', 'modelnumber', 'partnumber', 'pn']), sn = c(['serial', 'serialnumber', 'sn']);
  const lc = c(['location', 'room', 'area', 'address']), fl = c(['floor', 'level']), ins = c(['installed', 'installdate', 'install', 'date']), wr = c(['warranty', 'warrantyend', 'warrantyexpires']);
  const pm = c(['pmevery', 'pm', 'frequency', 'interval']), lp = c(['lastpm', 'lastinspection', 'lastservice']), st = c(['status']), no = c(['notes', 'note', 'comments']);
  if (tg < 0 && sn < 0 && nm < 0) throw new Error('Need a tag, serial or name column. Found: ' + h.join(', '));
  const g = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const isoDate = (s: string) => { if (!s) return ''; if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const d = new Date(s); return isNaN(+d) ? '' : d.toISOString().slice(0, 10); };
  const out: Asset[] = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    if (!g(r, tg) && !g(r, sn) && !g(r, nm)) { skipped++; continue; }
    const stv = ASSET_STATUS.find((x) => x.toLowerCase() === g(r, st).toLowerCase());
    const pmv = PM_EVERY.find((x) => x && x.toLowerCase().startsWith(g(r, pm).toLowerCase().slice(0, 5)) && g(r, pm));
    out.push(blankAsset({ tag: g(r, tg) || g(r, sn), name: g(r, nm), system: systemOf(g(r, sy)), make: g(r, mk), model: g(r, md), serial: g(r, sn), location: g(r, lc), floor: g(r, fl) || undefined,
      installDate: isoDate(g(r, ins)) || today(), warrantyEnd: isoDate(g(r, wr)) || undefined, pmEvery: pmv || undefined, lastPm: isoDate(g(r, lp)) || undefined, status: stv ?? 'In service', notes: g(r, no) }));
  }
  return { assets: out, skipped };
}
