// Vendors database (saved on this device, shared by every project), online parts search links and
// optional vendor stock / price checks. Searching and stock checks need the internet; everything
// else works offline.
import { kvGet, kvSet } from './projectdb';

export interface VendorField { id: string; label: string; value: string }
export interface Vendor {
  id: string;
  name: string;
  contact: string; phone: string; email: string; website: string;
  address: string; city: string; state: string; zip: string;
  account: string; terms: string; notes: string;
  /** Web address of the vendor's search page, with {part} where the part goes. */
  searchUrl: string;
  /** Optional stock / price address from the vendor (their API or a lookup page), with {part} and {qty}. */
  stockUrl: string;
  /** Optional key the vendor gave for that address (sent as the X-Api-Key header and in {key}). */
  apiKey: string;
  /** Check stock by itself when the Materials list opens and the internet is on. */
  autoCheck: boolean;
  /** Fields the person added with + Add field. */
  custom: VendorField[];
  updated: number;
}

export const VENDORS_KEY = 'vendors';
export const VENDORS_EVENT = 'lvplan-vendors';
const vid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const blankVendor = (): Vendor => ({ id: vid(), name: '', contact: '', phone: '', email: '', website: '', address: '', city: '', state: '', zip: '', account: '', terms: '', notes: '', searchUrl: '', stockUrl: '', apiKey: '', autoCheck: false, custom: [], updated: Date.now() });

/** Fill in anything missing on a stored vendor so older or damaged entries still open. */
export function healVendor(input: unknown): Vendor {
  const v = (input ?? {}) as Record<string, unknown> & { custom?: unknown };
  const b = blankVendor(), out = { ...b } as unknown as Record<string, unknown>;
  for (const [k, dv] of Object.entries(b)) { const gv = v[k]; if (gv !== undefined && typeof gv === typeof dv && (Array.isArray(dv) === Array.isArray(gv))) out[k] = gv; }
  out.id = typeof v.id === 'string' && v.id ? v.id : b.id;
  out.custom = (Array.isArray(v.custom) ? v.custom : []).filter((f) => f && typeof f === 'object').map((f: Partial<VendorField>, i: number) => ({ id: String(f.id ?? `f${i}`), label: String(f.label ?? ''), value: String(f.value ?? '') }));
  return out as unknown as Vendor;
}

export async function loadVendors(): Promise<Vendor[]> {
  try { const v = await kvGet<Vendor[]>(VENDORS_KEY); return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map(healVendor) : []; } catch { return []; }
}
export async function saveVendors(v: Vendor[]) { await kvSet(VENDORS_KEY, v); window.dispatchEvent(new Event(VENDORS_EVENT)); }

/** Labels used by custom fields on any vendor, so + Add field can suggest them. */
export const customLabels = (vs: Vendor[]) => [...new Set(vs.flatMap((v) => v.custom.map((f) => f.label.trim()).filter(Boolean)))].sort();

// ------------------------------------------------------------------ online parts search
export interface SearchSite { id: string; name: string; url: string }
/** Well-known search pages. {part} is replaced by the words to look for. */
export const SEARCH_SITES: SearchSite[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={part}' },
  { id: 'shopping', name: 'Google Shopping', url: 'https://www.google.com/search?tbm=shop&q={part}' },
  { id: 'amazon', name: 'Amazon', url: 'https://www.amazon.com/s?k={part}' },
  { id: 'octopart', name: 'Octopart (many distributors)', url: 'https://octopart.com/search?q={part}' },
  { id: 'digikey', name: 'Digi-Key', url: 'https://www.digikey.com/en/products/result?keywords={part}' },
  { id: 'mouser', name: 'Mouser', url: 'https://www.mouser.com/c/?q={part}' },
];

/** Words to search for: the part number if there is one, else brand/model, else the item. "or equal" and similar words are dropped. */
export function searchWords(l: { item: string; brandModel: string; partNo?: string }): string {
  if (l.partNo?.trim()) return l.partNo.trim();
  const bm = l.brandModel.replace(/\bor equal\b|\bor approved equal\b|\be\.g\.\s*/gi, ' ').replace(/[()]/g, ' ').split(/[,;/]| — /)[0].replace(/\s+/g, ' ').trim();
  const generic = !bm || /^(listed|ul|typical|design|factory|bare|rated|sized|deep-cycle)\b/i.test(bm);
  return (generic ? `${l.item} ${bm}` : `${bm} ${l.item}`).replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function fillUrl(template: string, vals: { part: string; qty?: number; key?: string }): string {
  return template.replace(/\{part\}/g, encodeURIComponent(vals.part)).replace(/\{qty\}/g, String(Math.max(1, Math.ceil(vals.qty ?? 1)))).replace(/\{key\}/g, encodeURIComponent(vals.key ?? ''));
}
export const isWebUrl = (s: string) => /^https?:\/\/[^\s]+$/i.test(s.trim());

/** Search address for a line at a site, or at a vendor's own search page. */
export function searchUrlFor(siteOrVendor: SearchSite | Vendor, l: { item: string; brandModel: string; partNo?: string }): string | null {
  const t = 'url' in siteOrVendor ? siteOrVendor.url : siteOrVendor.searchUrl;
  if (!t || !isWebUrl(t.replace(/\{\w+\}/g, 'x'))) return null;
  const part = searchWords(l);
  return t.includes('{part}') ? fillUrl(t, { part }) : t;
}

// ------------------------------------------------------------------ stock and availability
export interface StockResult { ok: boolean; at: number; qty?: number; price?: number; text: string }
export const STOCK_KEY = 'vendorStock';
const stockKey = (vendorId: string, part: string) => `${vendorId}|${part.toLowerCase().trim()}`;
export async function loadStock(): Promise<Record<string, StockResult>> { try { return (await kvGet<Record<string, StockResult>>(STOCK_KEY)) ?? {}; } catch { return {}; } }
export const stockFor = (cache: Record<string, StockResult>, vendorId?: string, part?: string) => (vendorId && part ? cache[stockKey(vendorId, part)] : undefined);

const QTY_KEY = /^(qty|quantity|available|availability|availableqty|quantityavailable|qtyavailable|instock|in_stock|stock|onhand|on_hand|qtyonhand|inventory|factorystock|availabilityinstock)$/i;
const PRICE_KEY = /^(price|unitprice|unit_price|cost|unitcost|yourprice|netprice|sellprice)$/i;
const toNum = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/); if (m) return parseFloat(m[0]); }
  return undefined;
};
/** Pull an in-stock quantity and a price out of whatever the vendor sent back (JSON or text). */
export function parseStock(body: string): { qty?: number; price?: number } {
  let qty: number | undefined, price: number | undefined;
  try {
    const walk = (o: unknown, depth: number) => {
      if (depth > 6 || o == null || typeof o !== 'object') return;
      if (Array.isArray(o)) { for (const x of o.slice(0, 20)) walk(x, depth + 1); return; }
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        const kk = k.replace(/[\s-]/g, '');
        if (qty === undefined && QTY_KEY.test(kk)) { if (typeof v === 'boolean') qty = v ? 1 : 0; else qty = toNum(v); }
        else if (price === undefined && PRICE_KEY.test(kk) && (typeof v !== 'object' || v === null)) price = toNum(v);
        else if (price === undefined && /^pricebreaks?$/i.test(kk) && Array.isArray(v) && v[0]) price = toNum((v[0] as Record<string, unknown>).Price ?? (v[0] as Record<string, unknown>).price ?? (v[0] as Record<string, unknown>).UnitPrice);
        if (typeof v === 'object') walk(v, depth + 1);
      }
    };
    walk(JSON.parse(body), 0);
  } catch {
    const q = body.match(/(\d[\d,]*)\s*(in stock|available|on hand)/i) ?? body.match(/(?:in stock|available|on hand)\D{0,12}(\d[\d,]*)/i);
    if (q) qty = toNum(q[1]);
    const pr = body.match(/\$\s?(\d[\d,]*\.\d{2})/); if (pr) price = toNum(pr[1]);
  }
  return { qty, price };
}

/** Ask a vendor for stock and price on one part. Needs the internet and a stock address on the vendor. */
export async function checkStock(v: Vendor, part: string, qty: number, fetcher: typeof fetch = fetch): Promise<StockResult> {
  const at = Date.now();
  if (!v.stockUrl.trim()) return { ok: false, at, text: 'No stock address saved for this vendor' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, at, text: 'No internet connection' };
  const url = fillUrl(v.stockUrl.trim(), { part, qty, key: v.apiKey });
  if (!isWebUrl(url)) return { ok: false, at, text: 'The stock address is not a web address' };
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), 15000);
  try {
    const r = await fetcher(url, { headers: v.apiKey ? { 'X-Api-Key': v.apiKey, Accept: 'application/json, text/plain, */*' } : { Accept: 'application/json, text/plain, */*' }, signal: ctl?.signal });
    const body = await r.text();
    if (!r.ok) return { ok: false, at, text: `The vendor answered with an error (${r.status})` };
    const s = parseStock(body);
    const text = s.qty === undefined && s.price === undefined ? 'Answered, but no stock number was found. Open the vendor page to check.'
      : [s.qty !== undefined ? (s.qty > 0 ? `${s.qty.toLocaleString()} in stock` : 'Out of stock') : '', s.price !== undefined ? `$${s.price.toFixed(2)} each` : ''].filter(Boolean).join(' · ');
    return { ok: true, at, ...s, text };
  } catch {
    return { ok: false, at, text: 'Could not reach the vendor. Their site may not allow apps to check, or the internet is off.' };
  } finally { clearTimeout(timer); }
}

export async function saveStock(vendorId: string, part: string, res: StockResult) {
  const all = await loadStock(); all[stockKey(vendorId, part)] = res;
  try { await kvSet(STOCK_KEY, all); } catch { /* storage unavailable */ }
  return all;
}
/** Automatic checks are repeated at most every 12 hours per part. */
export const STOCK_STALE_MS = 12 * 3600 * 1000;
