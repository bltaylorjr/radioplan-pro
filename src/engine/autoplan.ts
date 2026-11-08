// One-click site plan for a location: terrain-based candidate search (viewshed scoring), then a design pre-fill.
import type { Project, StateCode } from '../types';
import type { DemGrid } from './terrain';
import { sampleDem } from './terrain';
import { LatLon, destination, haversineKm, interpolate, bearingDeg } from './geo';
import { earthBulgeM, diffractionV, knifeEdgeLossDb, recommendedTiltDeg } from './rf';
import { BAND_PRESETS, ANTENNAS } from '../data/catalog';
import { DEFAULT_TESTS, uid } from '../defaults';
import { withCounty } from './geocode';

export interface PlanOptions { bandPreset: string; serviceRadiusKm: number; searchRadiusKm: number; towerHeightM: number; mobileHeightM: number; facilityAntennaM: number }
export const DEFAULT_PLAN: PlanOptions = { bandPreset: 'UHF LMR', serviceRadiusKm: 10, searchRadiusKm: 3, towerHeightM: 45, mobileHeightM: 1.5, facilityAntennaM: 10 };

export interface Candidate extends LatLon { groundM: number; score: number; targetLos: boolean; distKm: number }

/** Fraction of service-area sample points reachable with < 6 dB knife-edge loss from a tower at `c`. */
export function scoreCandidate(dem: DemGrid, c: LatLon, samples: (LatLon & { w: number })[], o: PlanOptions, fMHz: number, k = 4 / 3) {
  const g0 = sampleDem(dem, c); if (g0 == null) return null;
  const txAbs = g0 + o.towerHeightM;
  let served = 0, total = 0, targetLos = false;
  for (const s of samples) {
    const gs = sampleDem(dem, s); if (gs == null) continue;
    const d = Math.max(haversineKm(c, s), 0.05), rxAbs = gs + (s.w > 1 ? o.facilityAntennaM : o.mobileHeightM);
    let worst = -Infinity;
    const steps = 18;
    for (let i = 1; i < steps; i++) {
      const t = i / steps, q = interpolate(c, s, t), z = sampleDem(dem, q); if (z == null) continue;
      const d1 = d * t, h = z + earthBulgeM(d1, d - d1, k) - (txAbs + (rxAbs - txAbs) * t);
      worst = Math.max(worst, diffractionV(h, d1, d - d1, fMHz));
    }
    const ok = knifeEdgeLossDb(worst) < 6;
    total += s.w; if (ok) served += s.w;
    if (s.w > 1) targetLos = ok;
  }
  return { score: total ? served / total : 0, groundM: g0, targetLos };
}

export function findCandidates(dem: DemGrid, target: LatLon, o: PlanOptions, top = 5): Candidate[] {
  const fMHz = BAND_PRESETS[o.bandPreset]?.fMHz || 460;
  const samples: (LatLon & { w: number })[] = [{ ...target, w: 8 }];
  for (const f of [0.25, 0.5, 0.75, 1]) for (let b = 0; b < 360; b += 15) samples.push({ ...destination(target, b, o.serviceRadiusKm * f), w: 1 });
  const cands: LatLon[] = [target];
  const n = 6;
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const dx = (i / n) * o.searchRadiusKm, dy = (j / n) * o.searchRadiusKm, r = Math.hypot(dx, dy);
    if (r === 0 || r > o.searchRadiusKm) continue;
    cands.push(destination(target, (Math.atan2(dx, dy) * 180) / Math.PI, r));
  }
  const out: Candidate[] = [];
  for (const c of cands) {
    const s = scoreCandidate(dem, c, samples, o, fMHz); if (!s) continue;
    out.push({ ...c, ...s, distKm: haversineKm(c, target) });
  }
  // Rank: coverage score, then line of sight to the facility, then closeness (shorter feeder/backhaul, easier leasing).
  out.sort((a, b) => b.score - a.score || Number(b.targetLos) - Number(a.targetLos) || a.distKm - b.distKm);
  return out.slice(0, top);
}

/** Pre-fill the whole project for a location and chosen candidate. Returns a list of what was set. */
export function applyPlan(d: Project, target: LatLon & { label: string; state?: string; county?: string; city?: string }, best: Candidate, o: PlanOptions, dist: (km: number) => string = (km) => `${km.toFixed(2)} km`): string[] {
  const notes: string[] = [];
  const preset = BAND_PRESETS[o.bandPreset];
  const short = target.label.split(',').slice(0, 2).join(',').trim() || `${target.lat.toFixed(4)}, ${target.lon.toFixed(4)}`;
  d.meta.name = `Site plan — ${short}`;
  target = withCounty({ ...target });
  if (target.state && ['NC', 'SC', 'GA', 'TN', 'VA'].includes(target.state)) { d.meta.state = target.state as StateCode; notes.push(`Jurisdiction set to ${target.state}${target.county ? `, ${target.county}` : ''}.`); }
  else notes.push('Location is outside NC/SC/GA/TN/VA (or unknown): check the project state on Company & Project.');
  if (target.county) d.meta.county = target.county;
  if (target.city) d.meta.city = target.city; else if (target.county) d.meta.city = undefined;
  const sameSpot = best.distKm < 0.05;
  const base = d.sites[0];
  d.sites = [
    { ...base, id: 'A', name: sameSpot ? 'Proposed tower (at location)' : 'Proposed tower (best terrain)', address: sameSpot ? target.label : '', lat: best.lat, lon: best.lon, groundElevM: Math.round(best.groundM * 10) / 10,
      positionSource: 'Auto-plan terrain search', positionAccuracyM: null, structure: 'monopole', structureHeightM: o.towerHeightM + 2, antennaAglM: o.towerHeightM, onBuilding: false, nearestAirportKm: null, nearestRunwayFt: null },
  ];
  if (!sameSpot) d.sites.push({ ...base, id: 'B', name: 'Facility / service point', address: target.label, lat: target.lat, lon: target.lon, groundElevM: null, positionSource: 'Search location', positionAccuracyM: null,
    structure: 'rooftop', structureHeightM: o.facilityAntennaM, antennaAglM: o.facilityAntennaM, onBuilding: true, nearestAirportKm: null, nearestRunwayFt: null });
  d.radio.txSiteId = 'A'; d.radio.rxSiteId = sameSpot ? 'A' : 'B';
  d.radio.bandPreset = o.bandPreset; if (preset?.fMHz) d.radio.fMHz = preset.fMHz;
  const omni = ANTENNAS.find((a) => a.type === 'Omni' && d.radio.fMHz >= a.bandMHz[0] && d.radio.fMHz <= a.bandMHz[1] && a.gainDbi > 2);
  const sector = ANTENNAS.find((a) => a.type === 'Sector panel' && d.radio.fMHz >= a.bandMHz[0] && d.radio.fMHz <= a.bandMHz[1]);
  const ant = omni ?? sector ?? ANTENNAS[0];
  d.radio.txAntennaId = ant.id; d.radio.rxAntennaId = ANTENNAS.find((a) => a.type === 'Yagi' && d.radio.fMHz >= a.bandMHz[0] && d.radio.fMHz <= a.bandMHz[1])?.id ?? ant.id;
  d.radio.azimuthDeg = sameSpot ? 0 : Math.round(bearingDeg(best, target));
  d.radio.feederLenM = Math.round(o.towerHeightM + 15);
  d.radio.mobileHeightM = o.mobileHeightM;
  d.radio.mechTiltDeg = 0;
  d.radio.elecTiltDeg = ant.hBwDeg >= 360 ? 0 : Math.max(0, Math.round(recommendedTiltDeg(o.towerHeightM, o.serviceRadiusKm, ant.vBwDeg) * 10) / 10);
  d.radio.coverageRadiusKm = Math.max(o.serviceRadiusKm * 1.2, 3);
  d.radio.clutterM = 0;
  d.bomOverrides = {};
  if (!d.tests.length) d.tests = DEFAULT_TESTS.map((x) => ({ ...x, id: uid() }));
  d.taskDone = { company: false, sites: true, terrain: true };
  notes.push(`Tower placed ${sameSpot ? 'at the location' : `${dist(best.distKm)} from the location`} on ground at ${best.groundM.toFixed(0)} m; reaches ${(best.score * 100).toFixed(0)}% of the ${dist(o.serviceRadiusKm)} service area with near line-of-sight.`);
  notes.push(`${preset?.label ?? 'Band'} at ${d.radio.fMHz} MHz, ${ant.brand} ${ant.model}, ${o.towerHeightM} m antenna, ${d.radio.feederLenM} m feeder.`);
  notes.push('Materials list, code checks and commissioning test plan were filled from this design.');
  return notes;
}
