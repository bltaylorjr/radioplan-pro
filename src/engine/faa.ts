// FAA notice screening (14 CFR 77.9) with airports built into the app, so it works offline.
// Airports: FAA NASR 28-day subscription (public domain), NC/SC/GA/TN/VA and neighbouring states, built by
// scripts/build-fccdata.py. 77.9 text read in the official eCFR (up to date as of 2026-10-22).
// This is a screening aid like the FAA Notice Criteria Tool: the FAA's own tool and a filed 7460-1 are what count.
import { gunzipJson } from './fccdata';
import { haversineKm, bearingDeg, type LatLon } from './geo';

export const FT_PER_M = 3.28084;
type AptRow = [string, string, string, string, string, string, string, number, number, number, number, number | null, [string, number, [number, number, number | null][]][]];
export interface Runway { id: string; lengthFt: number; ends: { lat: number; lon: number; elevFt: number | null }[] }
export interface Airport {
  id: string; name: string; city: string; state: string; type: 'A' | 'H' | 'C'; use: string; ownership: string; military: boolean; ils: boolean;
  lat: number; lon: number; elevFt: number | null; runways: Runway[];
}
export const AIRPORT_TYPE = { A: 'Airport', H: 'Heliport', C: 'Seaplane base' } as const;

let cache: Promise<{ cycle: string; built: string; airports: Airport[] }> | null = null;
export function loadAirports() {
  if (!cache) cache = import('../data/fcc/airports').then((m) => gunzipJson<{ cycle: string; built: string; apt: AptRow[] }>(m.APT_GZ_B64)).then((d) => ({
    cycle: d.cycle, built: d.built,
    airports: d.apt.map((r) => ({ id: r[0], name: r[1], city: r[2], state: r[3], type: r[4] as Airport['type'], use: r[5], ownership: r[6], military: !!r[7], ils: !!r[8], lat: r[9], lon: r[10], elevFt: r[11],
      runways: r[12].map(([id, lengthFt, ends]) => ({ id, lengthFt, ends: ends.map(([lat, lon, elevFt]) => ({ lat, lon, elevFt })) })) })),
  })).catch((e) => { cache = null; throw e; });
  return cache;
}

/** Does 77.9(d) make this an airport whose surfaces count? 'yes' | 'maybe' (only with an instrument approach) */
export function noticeAirport(a: Airport): 'yes' | 'maybe' {
  if (a.use === 'PU') return 'yes';                                    // (d)(1) public use
  if (a.military || ['MA', 'MN', 'MR', 'CG'].includes(a.ownership)) return 'yes'; // (d)(3) federal / DOD (Air Force, Navy, Army, Coast Guard)
  if (a.ils) return 'yes';                                             // (d)(4) instrument approach (ILS listed)
  return 'maybe';                                                      // private use: only if it has an FAA-approved instrument approach
}
export const ownershipName = (o: string) => ({ PU: 'Public', PR: 'Private', MA: 'Air Force', MN: 'Navy', MR: 'Army', CG: 'Coast Guard' } as Record<string, string>)[o] ?? o;

/** Nearest point of a runway (segment between its ends) to p: distance (ft) and runway elevation there (ft). */
export function nearestOnRunway(p: LatLon, rw: Runway, apt: Airport): { ft: number; elevFt: number | null; at: LatLon } | null {
  const e = rw.ends.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
  if (!e.length) return null;
  if (e.length === 1) return { ft: haversineKm(p, e[0]) * 1000 * FT_PER_M, elevFt: e[0].elevFt ?? apt.elevFt, at: e[0] };
  const [a, b] = e; const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lon - p.lon) * k, ay = a.lat - p.lat, bx = (b.lon - p.lon) * k, by = b.lat - p.lat;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
  const at = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  const ea = a.elevFt ?? apt.elevFt, eb = b.elevFt ?? apt.elevFt;
  return { ft: haversineKm(p, at) * 1000 * FT_PER_M, elevFt: ea != null && eb != null ? ea + (eb - ea) * t : ea ?? eb ?? apt.elevFt, at };
}

export interface SurfaceCheck {
  airport: Airport; qualifies: 'yes' | 'maybe'; distFt: number; brg: number; runway: string; longestFt: number;
  slope: 100 | 50 | 25; reachFt: number; within: boolean; baseElevFt: number | null;
  /** Height of the imaginary surface above the site's ground (ft); null when an elevation is missing. */
  surfaceAglFt: number | null; exceedsFt: number | null;
}
export interface FaaResult {
  heightAglFt: number; groundFt: number | null; over200: boolean;
  checks: SurfaceCheck[]; nearest: SurfaceCheck[];
  verdict: 'notice' | 'no-notice' | 'check';
  /** Tallest structure (ft AGL) without notice under 77.9(a)/(b), counting only airports that surely qualify. */
  maxNoNoticeFt: number | null;
  reasons: string[];
  cycle: string;
}

/** Screen a structure against 77.9(a) and (b). */
export async function faaCheck(p: LatLon, heightAglFt: number, groundFt: number | null): Promise<FaaResult> {
  const { airports, cycle } = await loadAirports();
  const all: SurfaceCheck[] = [];
  for (const a of airports) {
    const roughKm = haversineKm(p, a); if (roughKm > 40) continue;
    const longest = Math.max(0, ...a.runways.map((r) => r.lengthFt));
    let best: { ft: number; elevFt: number | null; id: string } | null = null;
    for (const rw of a.runways) { const n = nearestOnRunway(p, rw, a); if (n && (!best || n.ft < best.ft)) best = { ft: n.ft, elevFt: n.elevFt, id: rw.id }; }
    if (!best) best = { ft: roughKm * 1000 * FT_PER_M, elevFt: a.elevFt, id: 'airport reference point' };
    const heli = a.type === 'H';
    const slope = heli ? 25 : longest > 3200 ? 100 : 50;
    const reach = heli ? 5000 : longest > 3200 ? 20000 : 10000;
    const base = best.elevFt ?? a.elevFt;
    const surfAgl = groundFt != null && base != null ? base + best.ft / slope - groundFt : null;
    all.push({ airport: a, qualifies: noticeAirport(a), distFt: best.ft, brg: bearingDeg(p, a), runway: best.id, longestFt: longest, slope, reachFt: reach, within: best.ft <= reach,
      baseElevFt: base, surfaceAglFt: surfAgl, exceedsFt: surfAgl != null ? heightAglFt - surfAgl : null });
  }
  all.sort((x, y) => x.distFt - y.distFt);
  const checks = all.filter((c) => c.within);
  const reasons: string[] = [];
  const over200 = heightAglFt > 200;
  if (over200) reasons.push(`77.9(a): ${heightAglFt.toFixed(0)} ft is more than 200 ft above ground.`);
  let verdict: FaaResult['verdict'] = over200 ? 'notice' : 'no-notice';
  let maxNo: number | null = 200;
  for (const c of checks) {
    const nm = `${c.airport.name} (${c.airport.id})`;
    if (c.surfaceAglFt == null) { if (c.qualifies === 'yes' && verdict !== 'notice') verdict = 'check'; reasons.push(`${nm}: within ${c.reachFt.toLocaleString()} ft but a ground or runway elevation is missing; enter the ground elevation.`); continue; }
    if (c.qualifies === 'yes') maxNo = Math.min(maxNo ?? 200, Math.max(0, c.surfaceAglFt));
    if ((c.exceedsFt ?? -1) > 0) {
      if (c.qualifies === 'yes') { verdict = 'notice'; reasons.push(`77.9(b): exceeds the ${c.slope}:1 surface from ${nm} by ${c.exceedsFt!.toFixed(0)} ft (${(c.distFt).toFixed(0)} ft from the nearest runway point).`); }
      else { if (verdict === 'no-notice') verdict = 'check'; reasons.push(`${nm} is private use: it exceeds its ${c.slope}:1 surface by ${c.exceedsFt!.toFixed(0)} ft, which needs notice only if that airport has an FAA instrument approach. Check with the FAA tool.`); }
    }
  }
  if (groundFt == null && checks.length) maxNo = null;
  return { heightAglFt, groundFt, over200, checks, nearest: all.slice(0, 8), verdict, maxNoNoticeFt: maxNo, reasons, cycle };
}

export const FAA_NOTICE_TOOL = 'https://oeaaa.faa.gov/oeaaa/external/gisTools/gisAction.jsp?action=showNoNoticeRequiredToolForm';
export const FAA_OEAAA = 'https://oeaaa.faa.gov/oeaaa/external/portal.jsp';
export const FCC_TOWAIR = 'https://www.fcc.gov/wireless/systems-utilities/towair';
