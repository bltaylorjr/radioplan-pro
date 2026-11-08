// Cable and conduit runs between sites, measured on the map and over the ground (terrain), so the
// materials list and the labor estimate follow the real route instead of a typed-in guess.
import { haversineKm, interpolate, type LatLon } from './geo';
import type { Project, Site } from '../types';

export type RunCable = 'fiber-sm' | 'fiber-mm' | 'cat6' | 'coax' | 'power' | 'conduit';
export type RunMethod = 'underground' | 'direct-bury' | 'aerial' | 'building';
export interface RunMeasure {
  /** Map (straight-line, segment by segment) length. */
  horizFt: number;
  /** Length along the ground, following the rise and fall of the terrain. */
  groundFt: number;
  climbFt: number; dropFt: number; maxGradePct: number;
  /** Ground elevation at each end (ft above sea level), when known. */
  endElevFt: [number | null, number | null];
  /** Where the elevations came from. */
  source: string; at: string;
  /** Route and end elevations when measured; a different key means the route changed since. */
  key?: string;
  /** Elevation along the route (distance ft, elevation ft) for the profile chart. */
  profile: [number, number][];
}
export interface SiteRun {
  id: string; name: string; fromId: string; toId: string;
  /** Bend points between the two sites, clicked on the map (follow the road, avoid the creek…). */
  via: LatLon[];
  cable: RunCable; method: RunMethod;
  /** Strand count (fiber) or conductor count (power); 0 = default. */
  count?: number;
  measured?: RunMeasure;
}

export const CABLES: [RunCable, string][] = [['fiber-sm', 'Fiber, single-mode (outdoor)'], ['fiber-mm', 'Fiber, multimode (OM4)'], ['cat6', 'Copper Cat 6 (outdoor)'], ['coax', 'Coax (1/2 in)'], ['power', 'Power conductors'], ['conduit', 'Empty conduit only']];
export const METHODS: [RunMethod, string][] = [['underground', 'Underground in conduit'], ['direct-bury', 'Direct-buried cable'], ['aerial', 'Aerial on poles'], ['building', 'Inside / between buildings']];

const M_TO_FT = 3.28084;

/** The full route: from-site, bend points, to-site. */
export function runPath(run: SiteRun, sites: Site[]): LatLon[] | null {
  const a = sites.find((s) => s.id === run.fromId), b = sites.find((s) => s.id === run.toId);
  if (!a || !b) return null;
  return [{ lat: a.lat, lon: a.lon }, ...run.via, { lat: b.lat, lon: b.lon }];
}

/** Points every `stepM` metres along a path (corners kept). */
export function densify(path: LatLon[], stepM = 20): { p: LatLon; dM: number }[] {
  const out: { p: LatLon; dM: number }[] = []; let d = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const segM = haversineKm(path[i], path[i + 1]) * 1000, n = Math.max(1, Math.ceil(segM / stepM));
    for (let k = 0; k < n; k++) out.push({ p: interpolate(path[i], path[i + 1], k / n), dM: d + (segM * k) / n });
    d += segM;
  }
  if (path.length) out.push({ p: path[path.length - 1], dM: d });
  return out;
}

/** Fill unknown elevations by straight-line interpolation between known ones (ends held flat). */
export function fillGaps(z: (number | null)[]): number[] | null {
  const known = z.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  if (!known.length) return null;
  return z.map((v, i) => {
    if (v != null) return v;
    const lo = [...known].reverse().find((k) => k < i), hi = known.find((k) => k > i);
    if (lo == null) return z[hi!]!; if (hi == null) return z[lo]!;
    return z[lo]! + ((z[hi]! - z[lo]!) * (i - lo)) / (hi - lo);
  });
}

/**
 * Measure a route. `elev` gives ground elevation in metres (or null when unknown) for each sample point;
 * the two end elevations (site ground elevations) are used where the terrain has no value.
 */
export function measurePath(path: LatLon[], elev: (p: LatLon) => number | null, ends: [number | null, number | null] = [null, null], source = 'terrain', stepM = 20): RunMeasure {
  const pts = densify(path, stepM);
  const raw = pts.map((x, i) => elev(x.p) ?? (i === 0 ? ends[0] : i === pts.length - 1 ? ends[1] : null));
  const known = raw.filter((v) => v != null).length;
  const z = fillGaps(raw);
  let ground = 0, climb = 0, drop = 0, maxG = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].dM - pts[i - 1].dM; if (dx <= 0) continue;
    const dz = z ? z[i] - z[i - 1] : 0;
    ground += Math.hypot(dx, dz); if (dz > 0) climb += dz; else drop -= dz;
    maxG = Math.max(maxG, Math.abs(dz / dx) * 100);
  }
  const horizM = pts.length ? pts[pts.length - 1].dM : 0;
  const step = Math.max(1, Math.floor(pts.length / 60));
  const profile: [number, number][] = [];
  if (z) pts.forEach((x, i) => { if (i % step === 0 || i === pts.length - 1) profile.push([Math.round(x.dM * M_TO_FT), Math.round(z[i] * M_TO_FT)]); });
  const src = !z ? 'map distance only (no elevation)' : known >= pts.length * 0.8 ? source : known <= 2 ? 'map distance + the two site elevations' : `${source} (partly filled in)`;
  return {
    horizFt: Math.round(horizM * M_TO_FT), groundFt: Math.round((z ? ground : horizM) * M_TO_FT),
    climbFt: Math.round(climb * M_TO_FT), dropFt: Math.round(drop * M_TO_FT), maxGradePct: Math.round(maxG * 10) / 10,
    endElevFt: [z ? Math.round(z[0] * M_TO_FT) : null, z ? Math.round(z[z.length - 1] * M_TO_FT) : null],
    source: src, at: new Date().toISOString(), profile,
  };
}

export interface RunItem { key: string; item: string; spec: string; qty: number; unit: string; basis: string }
export interface RunTakeoff { items: RunItem[]; hours: { task: string; hours: number; basis: string }[]; totalHours: number; warnings: string[]; pullPoints: number }

/** Planning production rates (crew-hours). Starting points only; change them to your crew's numbers. */
export const RATES = { trenchFtPerH: 60, conduitFtPerH: 150, pullFtPerH: 250, aerialFtPerH: 100, buildingFtPerH: 120, handholeH: 3, poleAttachH: 0.75, fiberEndH: 4, copperEndH: 1, pullBoxSpacingFt: 500, poleSpacingFt: 150 };

/** Materials and labor for one measured run. */
export function runTakeoff(run: SiteRun, m: RunMeasure, rates = RATES): RunTakeoff {
  const items: RunItem[] = [], hours: RunTakeoff['hours'] = [], warnings: string[] = [];
  const L = m.groundFt, bends = run.via.length;
  const add = (key: string, item: string, spec: string, qty: number, unit: string, basis: string) => { if (qty > 0) items.push({ key, item, spec, qty: Math.ceil(qty), unit, basis }); };
  const hr = (task: string, h: number, basis: string) => { if (h > 0) hours.push({ task, hours: Math.round(h * 10) / 10, basis }); };
  // Steeper ground is slower to trench and needs erosion control.
  const slope = m.maxGradePct > 20 ? 2 : m.maxGradePct > 10 ? 1.5 : 1;
  const slopeNote = slope > 1 ? ` × ${slope} for slopes up to ${m.maxGradePct}%` : '';
  let pullPoints = 0;
  if (run.method === 'underground' || run.method === 'direct-bury') {
    pullPoints = run.method === 'underground' ? Math.max(0, Math.ceil(L / rates.pullBoxSpacingFt) - 1) + bends : 0;
    add('trench', 'Trench (24–36 in cover)', run.method === 'underground' ? 'Machine trench, 6 in wide' : 'Machine trench or plow', L, 'ft', `Ground length ${L} ft (map ${m.horizFt} ft + terrain)`);
    add('tape', 'Underground warning tape', 'Detectable, orange (comm) / red (power)', L * 1.05, 'ft', 'Trench length + 5%');
    hr('Trenching and backfill', (L / rates.trenchFtPerH) * slope, `${rates.trenchFtPerH} ft/h${slopeNote}`);
    if (run.method === 'underground') {
      add('conduit', 'Conduit 2 in (HDPE or Sch 40 PVC)', 'With pull tape', L * 1.05 + 20, 'ft', 'Ground length + 5% + 10 ft riser each end');
      add('sweeps', 'Long-radius sweeps 2 in (36 in radius)', 'Fiberglass or PVC', 2 + bends, 'ea', 'One each end + each bend point');
      add('hh', 'Handholes / pull boxes 17×30 in', 'Tier 15 or Tier 22 in drive areas', pullPoints, 'ea', `Every ${rates.pullBoxSpacingFt} ft and at each bend point`);
      hr('Conduit placement', L / rates.conduitFtPerH, `${rates.conduitFtPerH} ft/h`);
      hr('Handholes', pullPoints * rates.handholeH, `${rates.handholeH} h each`);
    } else {
      add('markers', 'Route markers', 'Marker posts or flush markers', Math.ceil(L / 500) + 1 + bends, 'ea', 'Every 500 ft, ends and bends');
      if (run.cable !== 'conduit') warnings.push('Direct-buried cable must be listed for direct burial (armored or gel-filled).');
    }
    if (m.maxGradePct > 15) warnings.push(`The route has slopes up to ${m.maxGradePct}%: plan silt fence and erosion control, and think about directional boring on the steep part.`);
  } else if (run.method === 'aerial') {
    const spans = Math.max(1, Math.ceil(m.horizFt / rates.poleSpacingFt));
    add('strand', 'Messenger strand 1/4 in EHS', 'Galvanized', L * 1.03 + 40, 'ft', 'Ground length + 3% sag + dead-ends');
    add('lash', 'Lashing wire', '0.045 in stainless', L * 1.1, 'ft', 'Strand length + 10%');
    add('attach', 'Pole attachment hardware', 'Bolt, clamp, extension arm as needed', spans + 1, 'ea', `About one pole every ${rates.poleSpacingFt} ft`);
    add('guys', 'Down guys and anchors', 'At ends and bend points', 2 + bends, 'ea', 'Ends + bends');
    hr('Strand and lash', L / rates.aerialFtPerH, `${rates.aerialFtPerH} ft/h`);
    hr('Pole attachments', (spans + 1) * rates.poleAttachH, `${rates.poleAttachH} h per pole`);
    warnings.push('Aerial runs on utility poles need a pole attachment agreement with the pole owner, and NESC clearances.');
  } else {
    hr('Pathway and cable', L / rates.buildingFtPerH, `${rates.buildingFtPerH} ft/h`);
  }
  // Cable itself, with slack.
  const fiber = run.cable === 'fiber-sm' || run.cable === 'fiber-mm';
  if (fiber) {
    const strands = run.count || 12;
    const len = L + 100 + pullPoints * 50;
    add('cable', `Fiber cable, ${strands}-strand ${run.cable === 'fiber-sm' ? 'single-mode OS2' : 'multimode OM4'}`, run.method === 'aerial' ? 'Outdoor, lashed (or ADSS)' : run.method === 'building' ? 'Indoor/outdoor, riser rated' : 'Outdoor loose-tube, gel-free', len, 'ft', `Ground length + 50 ft coil each end${pullPoints ? ` + 50 ft slack in each of ${pullPoints} handholes` : ''}`);
    add('fpanel', 'Fiber enclosures / patch panels', 'Rack or wall mount, LC', 2, 'ea', 'One each end');
    add('pig', 'Pigtails / splice-on connectors', 'LC', strands * 2, 'ea', `${strands} strands × 2 ends`);
    hr('Fiber pull', len / rates.pullFtPerH, `${rates.pullFtPerH} ft/h`);
    hr('Fiber splicing and testing', 2 * rates.fiberEndH, `${rates.fiberEndH} h per end (OTDR + power meter)`);
    if (run.cable === 'fiber-mm' && L > 1300) warnings.push(`Multimode at ${L} ft is past the 10G limit (about 1,300 ft for OM4); use single-mode.`);
  } else if (run.cable === 'cat6') {
    const len = L * 1.1 + 20;
    add('cable', 'Cat 6 outdoor cable', run.method === 'direct-bury' ? 'Direct-burial rated, gel-filled' : 'Outdoor rated (OSP)', len, 'ft', 'Ground length + 10% + 10 ft each end');
    add('prot', 'Primary protectors (building entrance)', 'Listed, one per pair or per data line', 2, 'ea', 'NEC 800.90, each building');
    hr('Cable pull', len / rates.pullFtPerH, `${rates.pullFtPerH} ft/h`);
    hr('Terminations and testing', 2 * rates.copperEndH, `${rates.copperEndH} h per end`);
    if (L > 328) warnings.push(`Cat 6 is limited to 328 ft (100 m) per channel; this run is ${L} ft. Use fiber or add a powered switch.`);
    warnings.push('Copper between buildings needs primary protection and bonding at each building entrance (NEC 800.90, 800.100).');
  } else if (run.cable === 'coax') {
    const len = L * 1.1 + 20;
    add('cable', 'Coax 1/2 in (outdoor)', 'Low-loss foam, UV-rated jacket', len, 'ft', 'Ground length + 10% + 10 ft each end');
    add('conn', 'Coax connectors', 'N or 4.3-10, matched to cable', 2, 'ea', 'One each end');
    add('surge', 'Coax surge protectors', 'At each building entry', 2, 'ea', 'NEC 820.93 / 810.20');
    hr('Cable pull', len / rates.pullFtPerH, `${rates.pullFtPerH} ft/h`);
  } else if (run.cable === 'power') {
    const n = run.count || 3, len = (L * 1.05 + 20) * n;
    add('cable', `Power conductors (${n}: hot, neutral, ground)`, 'THWN-2 copper, size per voltage drop', len, 'ft', `${n} conductors × (ground length + 5% + 10 ft each end)`);
    hr('Conductor pull', len / n / rates.pullFtPerH, `${rates.pullFtPerH} ft/h`);
    warnings.push(`Size the conductors for voltage drop over ${L} ft (Calculators page). Power and communications cables need separate conduits.`);
  }
  if (m.source.startsWith('map distance only')) warnings.push('No elevation was available, so lengths are from the map only. Get terrain for this area (Terrain page) for lengths over the ground.');
  const totalHours = Math.round(hours.reduce((a, h) => a + h.hours, 0) * 10) / 10;
  return { items, hours, totalHours, warnings, pullPoints };
}

/** All measured runs in a project, with their takeoffs. */
export function projectRuns(p: Project): { run: SiteRun; t: RunTakeoff }[] {
  return (p.siteRuns ?? []).filter((r) => r.measured).map((run) => ({ run, t: runTakeoff(run, run.measured!) }));
}
/** Crew-hours for all measured site-to-site runs (added to the proposal's labor estimate). */
export function siteRunHours(p: Project): number {
  return Math.round(projectRuns(p).reduce((a, r) => a + r.t.totalHours, 0));
}
/** The run's measure is out of date when the sites or bend points moved since it was measured. */
export function measureKey(run: SiteRun, sites: Site[]): string {
  return JSON.stringify([runPath(run, sites), sites.find((s) => s.id === run.fromId)?.groundElevM, sites.find((s) => s.id === run.toId)?.groundElevM]);
}
