// Address suggestions while typing. Local suggestions (recent places, saved geocoder results, project sites)
// work offline; online suggestions come from Photon (komoot, OpenStreetMap data), which is built for
// search-as-you-type. (Nominatim's usage policy does not allow autocomplete, so it is used only on submit.)
import type { GeoResult } from './geocode';
import { readCache, STATE_CODES } from './geocode';
import type { LatLon } from './geo';

const RECENT_KEY = 'radioplan.recentPlaces';
export function recentPlaces(): GeoResult[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } }
export function rememberPlace(g: GeoResult) {
  try { const list = [g, ...recentPlaces().filter((x) => x.label !== g.label)].slice(0, 25); localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
/** Every typed word must start some word of the label. */
export function matches(label: string, q: string): boolean {
  const lw = words(label), qw = words(q);
  return qw.length > 0 && qw.every((w) => lw.some((x) => x.startsWith(w)));
}

export function localSuggestions(q: string, extra: GeoResult[] = [], limit = 5): GeoResult[] {
  const seen = new Set<string>(), out: GeoResult[] = [];
  const add = (g: GeoResult, source: string) => { if (out.length >= limit || seen.has(g.label) || !matches(g.label, q)) return; seen.add(g.label); out.push({ ...g, source }); };
  for (const g of recentPlaces()) add(g, 'Recent');
  for (const g of extra) add(g, 'Project');
  for (const list of Object.values(readCache())) for (const g of list) add(g, 'Saved');
  return out;
}

interface PhotonFeature { geometry: { coordinates: [number, number] }; properties: { name?: string; housenumber?: string; street?: string; city?: string; district?: string; county?: string; state?: string; postcode?: string; countrycode?: string; type?: string } }
export function photonToGeo(f: PhotonFeature): GeoResult {
  const p = f.properties, street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const first = street || p.name || '';
  const st = STATE_CODES[p.state ?? ''] ?? p.state;
  const label = [first, p.name && street && p.name !== street ? p.name : null, p.city ?? p.district, p.county, [st, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label, state: st, county: p.county, street: street || undefined, city: p.city ?? p.district, postcode: p.postcode, source: 'Map search' };
}

/** Online suggestions (US only), biased toward `near`. */
export async function onlineSuggestions(q: string, near?: LatLon | null, signal?: AbortSignal, limit = 6): Promise<GeoResult[]> {
  const bias = near ? `&lat=${near.lat.toFixed(4)}&lon=${near.lon.toFixed(4)}` : '';
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit + 4}&lang=en&bbox=-125,24,-66,50${bias}`, { signal });
  if (!r.ok) throw new Error(`Suggestions HTTP ${r.status}`);
  const j = (await r.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  return j.features.filter((f) => !f.properties.countrycode || f.properties.countrycode === 'US').map(photonToGeo).filter((g) => (seen.has(g.label) ? false : (seen.add(g.label), true))).slice(0, limit);
}
