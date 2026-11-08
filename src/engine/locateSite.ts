// Put Site A at the project site address: the street address online (OpenStreetMap), otherwise
// the town or ZIP area from the built-in data (offline, approximate).
import type { Project } from '../types';
import { geocodeAddress } from './geocode';
import { placeFromText } from '../compliance/place';
import { countyAt } from './refdata';

export interface SiteSpot { lat: number; lon: number; source: string; acc: number; label: string }
export async function findProjectSpot(p: Project): Promise<SiteSpot | null> {
  const q = p.meta.siteAddress?.trim() || [p.meta.city, p.meta.state].filter(Boolean).join(', ');
  if (!q) return null;
  if (navigator.onLine) { try { const r = (await geocodeAddress(q))[0]; if (r) return { lat: r.lat, lon: r.lon, source: 'Geocoded address', acc: 50, label: r.label }; } catch { /* offline */ } }
  const t = placeFromText(q, p.meta.state) ?? placeFromText(`${p.meta.city ?? ''}, ${p.meta.state}`, p.meta.state);
  return t ? { lat: t.lat, lon: t.lon, source: `Town / ZIP center (approximate): ${t.city}`, acc: 3000, label: `${t.city}, ${t.state}` } : null;
}
/** True when Site A is not in the project's county (e.g. still at an old default). */
export function siteOutsideProject(p: Project): boolean {
  const s = p.sites[0]; if (!s || !p.meta.county) return false;
  const c = countyAt(s.lat, s.lon); return !!c && (c.county !== p.meta.county || c.state !== p.meta.state);
}
export function moveSiteA(d: Project, spot: SiteSpot) {
  const s = d.sites[0]; if (!s) return;
  Object.assign(s, { lat: spot.lat, lon: spot.lon, groundElevM: null, positionSource: spot.source, positionAccuracyM: spot.acc, address: d.meta.siteAddress || spot.label });
}
