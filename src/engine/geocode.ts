// Address -> coordinates via OpenStreetMap Nominatim (requires internet; fair-use: 1 request/second).
// Results are cached locally so previously searched places still resolve offline.
export interface GeoResult { lat: number; lon: number; label: string; state?: string; county?: string; street?: string; city?: string; postcode?: string; source?: string }
import { countyAt, refSearch } from './refdata';
const CACHE_KEY = 'radioplan.geocache';
export const STATE_CODES: Record<string, string> = { 'North Carolina': 'NC', 'South Carolina': 'SC', Georgia: 'GA', Tennessee: 'TN', Virginia: 'VA', Alabama: 'AL', Florida: 'FL', Kentucky: 'KY' };
const norm = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

export function readCache(): Record<string, GeoResult[]> { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
function writeCache(q: string, r: GeoResult[]) { try { const c = readCache(); c[norm(q)] = r; const keys = Object.keys(c); if (keys.length > 300) delete c[keys[0]]; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ } }
export function cachedGeocode(q: string): GeoResult[] | null { return readCache()[norm(q)] ?? null; }

export async function geocodeAddress(q: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=us&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Geocoder HTTP ${r.status}`);
    const j = (await r.json()) as { lat: string; lon: string; display_name: string; address?: { state?: string; county?: string; road?: string; house_number?: string; city?: string; town?: string; village?: string; hamlet?: string; postcode?: string } }[];
    const out = j.map((x) => ({ lat: parseFloat(x.lat), lon: parseFloat(x.lon), label: x.display_name, state: STATE_CODES[x.address?.state ?? ''] ?? x.address?.state, county: x.address?.county,
      street: [x.address?.house_number, x.address?.road].filter(Boolean).join(' ') || undefined, city: x.address?.city ?? x.address?.town ?? x.address?.village ?? x.address?.hamlet, postcode: x.address?.postcode }));
    for (const g of out) withCounty(g);
    writeCache(q, out);
    return out.length ? out : refSearch(q);
  } catch (e) {
    const hit = cachedGeocode(q);
    if (hit) return hit;
    const ref = refSearch(q);
    if (ref.length) return ref;
    throw new Error(navigator.onLine === false ? 'You are offline. Enter coordinates (e.g. 35.5951, -82.5515) or click the map.' : (e as Error).message);
  }
}
/** Fill a missing state / county from the built-in county boundaries. */
export function withCounty<T extends { lat: number; lon: number; state?: string; county?: string }>(g: T): T {
  if (g.state && g.county) return g;
  const c = countyAt(g.lat, g.lon); if (c) { g.state = g.state || c.state; g.county = g.county || c.county; }
  return g;
}
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
  if (!r.ok) throw new Error(`Geocoder HTTP ${r.status}`);
  return ((await r.json()) as { display_name?: string }).display_name ?? '';
}
