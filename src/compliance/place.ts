// Where the project is, for picking local codes: state, county and city from the project address,
// falling back to the first site's position and the built-in county and town data.
import type { Project, StateCode } from '../types';
import { countyAt, towns } from '../engine/refdata';

/** State, county and city from a ZIP code, "City, ST", a full address or a town name, using the built-in data (works offline). */
export function placeFromText(text: string, preferState?: string): { state: StateCode; county?: string; city?: string; lat: number; lon: number } | null {
  const t = (text ?? '').trim(); if (!t) return null;
  const zipM = t.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipM) for (const tw of towns()) if (tw.zips.includes(zipM[1])) return { state: tw.state as StateCode, county: countyAt(tw.lat, tw.lon)?.county, city: tw.city, lat: tw.lat, lon: tw.lon };
  const low = t.toLowerCase();
  const stM = low.match(/\b(nc|sc|ga|tn|va|north carolina|south carolina|georgia|tennessee|virginia)\b/);
  const st = stM ? ({ 'north carolina': 'NC', 'south carolina': 'SC', georgia: 'GA', tennessee: 'TN', virginia: 'VA' } as Record<string, string>)[stM[1]] ?? stM[1].toUpperCase() : undefined;
  const parts = low.split(',').map((x) => x.trim()).filter(Boolean);
  // Try each comma part (the town is usually just before the state) as a town name.
  const cands = parts.length > 1 ? [...parts.slice(0, -1).reverse(), parts[parts.length - 1].replace(/\b(nc|sc|ga|tn|va|north carolina|south carolina|georgia|tennessee|virginia)\b.*$/, '').trim()] : [low];
  for (const c of cands) {
    if (!c) continue;
    const hits = towns().filter((tw) => tw.city.toLowerCase() === c && (!st || tw.state === st));
    const tw = hits.find((h) => h.state === preferState) ?? hits[0];
    if (tw) return { state: tw.state as StateCode, county: countyAt(tw.lat, tw.lon)?.county, city: tw.city, lat: tw.lat, lon: tw.lon };
  }
  return null;
}
/** The county a town is in, or undefined when the town isn't in the built-in list. */
export const countyOfTown = (city: string, state: string) => { const tw = towns().find((t) => t.state === state && t.city.toLowerCase() === city.trim().toLowerCase()); return tw ? countyAt(tw.lat, tw.lon)?.county : undefined; };

export interface Place { state: StateCode; county?: string; city?: string; from: string }
const STATES = ['NC', 'SC', 'GA', 'TN', 'VA'];

/** Nearest built-in town (ZIP post-office name) within maxKm of a point. */
export function nearestTown(lat: number, lon: number, maxKm = 6): string | undefined {
  let best: string | undefined, bd = maxKm;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const t of towns()) { const d = 111.2 * Math.hypot(t.lat - lat, (t.lon - lon) * k); if (d < bd) { bd = d; best = t.city; } }
  return best;
}

export function projectPlace(p: Project): Place {
  const m = p.meta; const s = p.sites[0];
  const hasPos = s && Number.isFinite(s.lat) && Number.isFinite(s.lon) && (s.lat !== 0 || s.lon !== 0);
  const here = hasPos ? countyAt(s.lat, s.lon) : null;
  const townCounty = m.city ? countyOfTown(m.city, m.state) : undefined;
  const county = townCounty || m.county || here?.county;
  const sameArea = here && (!m.county || (here.county === m.county && here.state === m.state));
  const city = m.city || (hasPos && sameArea ? nearestTown(s.lat, s.lon) : undefined);
  const from = m.county ? (m.siteAddress ? 'project address' : 'project county') : here ? 'site position' : 'project state';
  return { state: m.state, county, city, from };
}

/** Fill state, county and city on the project from a picked address. */
export function applyAddress(d: Project, g: { label: string; state?: string; county?: string; city?: string; lat?: number; lon?: number }) {
  d.meta.siteAddress = g.label;
  const at = g.lat != null && g.lon != null ? countyAt(g.lat, g.lon) : null;
  const st = g.state && STATES.includes(g.state) ? g.state : at?.state;
  if (st) d.meta.state = st as StateCode;
  const county = g.county || at?.county; if (county) d.meta.county = county;
  const city = g.city || (g.lat != null && g.lon != null ? nearestTown(g.lat, g.lon) : undefined);
  d.meta.city = city || undefined;
}
