// Where the project is, for picking local codes: state, county and city from the project address,
// falling back to the first site's position and the built-in county and town data.
import type { Project, StateCode } from '../types';
import { countyAt, towns } from '../engine/refdata';

export interface Place { state: StateCode; county?: string; city?: string; from: string }
const STATES = ['NC', 'SC', 'GA', 'TN'];

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
  const county = m.county || here?.county;
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
