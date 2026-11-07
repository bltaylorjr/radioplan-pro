// Built-in reference data (no internet needed): county boundaries, ZIP codes and towns for NC, SC, GA, TN.
import data from '../data/refdata.json';
import type { GeoResult } from './geocode';

interface County { f: string; n: string; s: string; b: [number, number, number, number]; r: number[][] }
type Zip = [string, number, number, string, string];
const REF = data as unknown as { source: string; states: string[]; counties: County[]; zips: Zip[] };
export const REF_SOURCE = REF.source;
export const refCounts = () => ({ counties: REF.counties.length, zips: REF.zips.length, towns: towns().length, states: REF.states });

let decoded: { c: County; rings: Float64Array[] }[] | null = null;
function polys() {
  if (!decoded) decoded = REF.counties.map((c) => ({ c, rings: c.r.map((d) => { const a = new Float64Array(d.length); let x = 0, y = 0; for (let i = 0; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; a[i] = x / 1e4; a[i + 1] = y / 1e4; } return a; }) }));
  return decoded;
}
function inRing(r: Float64Array, lon: number, lat: number) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** County and state at a point (even-odd over all rings handles holes and islands). */
export function countyAt(lat: number, lon: number): { county: string; state: string; fips: string } | null {
  for (const { c, rings } of polys()) {
    const [w, s, e, n] = c.b; if (lon < w || lon > e || lat < s || lat > n) continue;
    let k = 0; for (const r of rings) if (inRing(r, lon, lat)) k++;
    if (k % 2 === 1) return { county: countyLabel(c), state: c.s, fips: c.f };
  }
  return null;
}
const countyLabel = (c: County) => /city$/i.test(c.n) ? c.n : `${c.n} County`;
export function countyCenter(c: County) { const [w, s, e, n] = c.b; return { lat: (s + n) / 2, lon: (w + e) / 2 }; }

let townList: { city: string; state: string; lat: number; lon: number; zips: string[] }[] | null = null;
export function towns() {
  if (!townList) {
    const m = new Map<string, { city: string; state: string; la: number; lo: number; k: number; zips: string[] }>();
    for (const [zip, la, lo, city, st] of REF.zips) {
      const key = `${city}|${st}`; const t = m.get(key) ?? { city, state: st, la: 0, lo: 0, k: 0, zips: [] };
      t.la += la; t.lo += lo; t.k++; t.zips.push(zip); m.set(key, t);
    }
    townList = [...m.values()].map((t) => ({ city: t.city, state: t.state, lat: t.la / t.k, lon: t.lo / t.k, zips: t.zips }));
  }
  return townList;
}
const norm = (s: string) => s.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
const STATE_NAMES: Record<string, string> = { 'north carolina': 'NC', 'south carolina': 'SC', georgia: 'GA', tennessee: 'TN', nc: 'NC', sc: 'SC', ga: 'GA', tn: 'TN' };

/** Search the built-in data: ZIP code, "Town, ST", or "Name County". */
export function refSearch(q: string, limit = 6): GeoResult[] {
  const raw = norm(q); if (raw.length < 2) return [];
  let st: string | undefined; let text = raw;
  for (const [name, code] of Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)) {
    if (text.endsWith(' ' + name) || text === name) { st = code; text = text.slice(0, text.length - name.length).trim(); break; }
  }
  const out: GeoResult[] = [];
  const zip = raw.match(/\b(\d{5})\b/);
  if (zip) for (const [z, la, lo, city, s] of REF.zips) if (z === zip[1]) {
    const c = countyAt(la, lo);
    out.push({ lat: la, lon: lo, label: `${city}, ${s} ${z} (ZIP area)`, city, state: s, postcode: z, county: c?.county, source: 'Built-in' });
  }
  if (!text) return out.slice(0, limit);
  const isCounty = /\bcounty$/.test(text); const name = text.replace(/\s*county$/, '').trim();
  if (name.length >= 2) {
    for (const { c } of polys()) {
      if (st && c.s !== st) continue;
      const cn = norm(c.n);
      if (cn === name || (cn.startsWith(name) && (isCounty || name.length >= 3))) { const ctr = countyCenter(c); out.push({ ...ctr, label: `${countyLabel(c)}, ${c.s}`, county: countyLabel(c), state: c.s, source: 'Built-in' }); }
      if (out.length >= limit * 2) break;
    }
    if (!isCounty) for (const t of towns()) {
      if (st && t.state !== st) continue;
      const tn = norm(t.city);
      if (tn === name || tn.startsWith(name)) { const c = countyAt(t.lat, t.lon); out.push({ lat: t.lat, lon: t.lon, label: `${t.city}, ${t.state}`, city: t.city, state: t.state, county: c?.county, postcode: t.zips[0], source: 'Built-in' }); }
    }
  }
  // Exact name matches first, towns before counties when not asked for a county.
  const score = (g: GeoResult) => (norm(g.city ?? g.county ?? '') === name || norm(g.county ?? '').replace(/ county$/, '') === name ? 0 : 1) + (isCounty === !!(g.county && !g.city) ? 0 : 0.5);
  return out.sort((a, b) => score(a) - score(b)).slice(0, limit);
}

/** Every built-in county: name ("X County"), state, FIPS and centre point. */
export function allCounties(): { county: string; state: string; fips: string; lat: number; lon: number }[] {
  return REF.counties.map((c) => ({ county: countyLabel(c), state: c.s, fips: c.f, ...countyCenter(c) })).sort((a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county));
}
