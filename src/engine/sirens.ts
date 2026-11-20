// Outdoor warning siren planning and test math. Data is in src/data/sirens.ts.
//
// Sound level with distance (CPG 1-17 method): the rated level at 100 ft drops by a fixed number of dB each
// time the distance doubles. Free air is 6 dB per doubling; real ground, trees and buildings add "excess
// attenuation", so CPG 1-17 Fig. 1 works out to about 10 dB per doubling in suburban/rural areas and about
// 14 dB among high-rises. Closer than 100 ft only free-air spreading (6 dB per doubling) is used.
import { SIREN_MODELS, SIREN_PLANNING, SIREN_CODES, SIREN_PROGRAMS, SIREN_TEST_KINDS, NUCLEAR_PLANTS, type SirenModel, type SirenCode } from '../data/sirens';
import { haversineKm } from './geo';
import type { Project, TestRecord } from '../types';

export type Ground = keyof typeof SIREN_PLANNING.lossPerDoubling;

export interface SirenUnit {
  id: string; name: string; modelId: string;
  /** Rated output used when the model has no published value, or to override it (dBC at 100 ft). */
  dbc100?: number | null;
  lat: number; lon: number; heightFt: number;
  /** Existing siren being surveyed or serviced, or a new one being planned. */
  existing?: boolean; notes?: string;
}
export interface SirenTestLog { id: string; sirenId: string; kind: string; date: string; result: 'pass' | 'fail' | ''; measuredDb?: number | null; atFt?: number | null; tech?: string; notes?: string }
export interface SirenPlan {
  units: SirenUnit[];
  ambientDb: number; overDb: number; ground: Ground; program: string;
  tests: SirenTestLog[];
}
export const defaultSirenPlan = (): SirenPlan => ({ units: [], ambientDb: 60, overDb: SIREN_PLANNING.overAmbientDb, ground: 'suburban', program: 'community', tests: [] });
export const sirenPlan = (p: Project): SirenPlan => ({ ...defaultSirenPlan(), ...(p.sirens ?? {}) });

export const modelOf = (id: string): SirenModel | undefined => SIREN_MODELS.find((m) => m.id === id);
/** Rated dBC at 100 ft for a unit (its own value first, then the model's). */
export const ratedDb = (u: Pick<SirenUnit, 'modelId' | 'dbc100'>): number | null => (u.dbc100 != null && Number.isFinite(u.dbc100) ? u.dbc100 : modelOf(u.modelId)?.dbc100 ?? null);

/** Level (dBC) at a distance in feet from a siren rated L100 at 100 ft. */
export function levelAt(l100: number, dFt: number, perDoubling: number): number {
  const d = Math.max(1, dFt);
  return d <= 100 ? l100 + 6 * Math.log2(100 / d) : l100 - perDoubling * Math.log2(d / 100);
}
/** Distance (ft) where the level falls to `target` dBC. */
export function rangeFt(l100: number, target: number, perDoubling: number): number {
  if (target >= l100) return 100 * 2 ** ((l100 - target) / 6);
  return 100 * 2 ** ((l100 - target) / perDoubling);
}
/** The level a siren must reach at the edge: background + margin (never below CPG 1-17's 70 dBC curve unless the user lowers it). */
export const edgeTarget = (ambientDb: number, overDb: number) => ambientDb + overDb;
/** Distance in front of the horn inside which a person would hear more than 123 dBC (free air). */
export const hazardFt = (l100: number) => (l100 <= SIREN_PLANNING.maxExposureDb ? 0 : 100 * 2 ** ((l100 - SIREN_PLANNING.maxExposureDb) / 6));

/** Combined level from several sirens at one point (energy sum). */
export function combinedDb(levels: number[]): number {
  const s = levels.reduce((a, l) => a + 10 ** (l / 10), 0);
  return s > 0 ? 10 * Math.log10(s) : -Infinity;
}
export interface PointCheck { levels: { id: string; name: string; db: number; ft: number }[]; total: number; target: number; ok: boolean }
export function checkPoint(plan: SirenPlan, lat: number, lon: number): PointCheck {
  const k = SIREN_PLANNING.lossPerDoubling[plan.ground] ?? 10;
  const levels = plan.units.flatMap((u) => {
    const l = ratedDb(u); if (l == null) return [];
    const horizFt = haversineKm({ lat, lon }, u) * 3280.84; const ft = Math.hypot(horizFt, u.heightFt || 0);
    return [{ id: u.id, name: u.name, db: levelAt(l, ft, k), ft }];
  }).sort((a, b) => b.db - a.db);
  const target = edgeTarget(plan.ambientDb, plan.overDb), total = combinedDb(levels.map((x) => x.db));
  return { levels, total, target, ok: total >= target };
}

export interface UnitReach { id: string; rated: number | null; rangeFt: number; hazardFt: number; warnings: string[] }
export function unitReach(plan: SirenPlan, u: SirenUnit): UnitReach {
  const k = SIREN_PLANNING.lossPerDoubling[plan.ground] ?? 10;
  const rated = ratedDb(u); const m = modelOf(u.modelId); const warnings: string[] = [];
  if (rated == null) warnings.push('No published rating for this model: type the rated dBC at 100 ft from the datasheet.');
  else {
    if (rated < SIREN_PLANNING.minRatedDb) warnings.push(`Rated ${rated} dBC: below the 120 dB at 100 ft the FEMA 2006 bulletin asks of public alerting sirens (fine for a small campus or plant).`);
    if (rated > 130) warnings.push(`Rated ${rated} dBC: above the 130 dBC at 100 ft limit in the Texas flood siren guide; check for hearing risk near homes.`);
    if (rated >= 120 && (u.heightFt || 0) < SIREN_PLANNING.mount120Ft) warnings.push(`Mounted ${u.heightFt || 0} ft: CPG 1-17 says a 120 dBC siren goes at least ${SIREN_PLANNING.mount120Ft} ft up and above rooftops.`);
  }
  if (m?.status === 'Legacy') warnings.push(`Legacy model${m.replacedBy ? `; replaced by ${m.replacedBy}` : ''}. Parts may be hard to find.`);
  if (m && /AC only|no battery/i.test(m.power + (m.notes ?? ''))) warnings.push('AC only: no warning in a power outage. FEMA 2006 asks for backup power for at least 15 minutes of alerting.');
  return { id: u.id, rated, rangeFt: rated == null ? 0 : rangeFt(rated, edgeTarget(plan.ambientDb, plan.overDb), k), hazardFt: rated == null ? 0 : hazardFt(rated), warnings };
}

/** Share of a square grid around the sirens (or the project sites) that is covered. */
export function coverageShare(plan: SirenPlan, area: { south: number; west: number; north: number; east: number }, n = 30): number {
  if (!plan.units.length) return 0;
  let ok = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const lat = area.south + ((i + 0.5) / n) * (area.north - area.south), lon = area.west + ((j + 0.5) / n) * (area.east - area.west);
    if (checkPoint(plan, lat, lon).ok) ok++;
  }
  return ok / (n * n);
}

// ───────────── codes for the project address
const norm = (s?: string) => (s ?? '').toLowerCase().replace(/\s+county$/, '').trim();
/** Codes that apply to a project: federal and guidance everywhere, the state's laws, and local entries for its county / city. */
export function codesFor(state?: string, county?: string, city?: string): SirenCode[] {
  const c = norm(county), t = norm(city);
  return SIREN_CODES.filter((x) => {
    if (x.level === 'Federal' || x.level === 'Guidance') return true;
    if (x.state && x.state !== state) return false;
    if (x.level === 'State') return true;
    const counties = (x.county ?? '').split(',').map(norm).filter(Boolean), cities = (x.city ?? '').split(',').map(norm).filter(Boolean);
    return (!!c && counties.includes(c)) || (!!t && cities.includes(t));
  });
}
/** Other local entries in the same state (shown as "nearby examples"). */
export const otherLocal = (state?: string, shown: SirenCode[] = []) => SIREN_CODES.filter((x) => x.state === state && !['State'].includes(x.level) && !shown.includes(x));

/** Nuclear plants within `mi` miles of a point (approximate: use the utility's EPZ map). */
export function nearPlants(lat: number, lon: number, mi = 10) {
  return NUCLEAR_PLANTS.map((pl) => ({ ...pl, mi: haversineKm({ lat, lon }, pl) / 1.609344 })).filter((pl) => pl.mi <= mi).sort((a, b) => a.mi - b.mi);
}

// ───────────── test schedule
const DAY = 86400e3;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export interface DueTest { sirenId: string; sirenName: string; kind: string; kindName: string; last?: string; next: string; overdue: boolean; everyDays: number }
export function schedule(plan: SirenPlan, today = iso(Date.now())): DueTest[] {
  const prog = SIREN_PROGRAMS.find((x) => x.id === plan.program) ?? SIREN_PROGRAMS[0];
  const out: DueTest[] = []; const now = Date.parse(today);
  for (const u of plan.units) for (const [kind, every] of Object.entries(prog.every)) {
    const k = SIREN_TEST_KINDS.find((x) => x.id === kind); if (!k) continue;
    const done = plan.tests.filter((t) => t.sirenId === u.id && t.kind === kind && t.result === 'pass' && t.date).map((t) => t.date).sort();
    const last = done[done.length - 1];
    const next = last ? iso(Date.parse(last) + every * DAY) : today;
    out.push({ sirenId: u.id, sirenName: u.name, kind, kindName: k.name, last, next, overdue: !last || Date.parse(next) < now, everyDays: every });
  }
  return out.sort((a, b) => a.next.localeCompare(b.next) || a.sirenName.localeCompare(b.sirenName));
}

/** Acceptance test rows for the Final Testing page, one set per siren. */
export function acceptanceRows(plan: SirenPlan): Omit<TestRecord, 'id'>[] {
  const target = edgeTarget(plan.ambientDb, plan.overDb);
  return plan.units.flatMap((u) => {
    const r = unitReach(plan, u);
    return [
      { item: `${u.name}: activation from every control point`, standard: 'Part 90 license / IPAWS / NFPA 1225', expected: 'Responds to each activation point (silent or growl mode)', measured: '', pass: null, date: '', tech: '', notes: '' },
      { item: `${u.name}: full-cycle sound test`, standard: 'FEMA 2006 bulletin §5', expected: 'Full rotation / tone sequence, no stalls', measured: '', pass: null, date: '', tech: '', notes: '' },
      { item: `${u.name}: sound level at coverage edge (C-weighted)`, standard: 'CPG 1-17 / FEMA 2006 (10 dB over background)', expected: `≥ ${Math.round(target)} dBC at ${Math.round(r.rangeFt)} ft`, measured: '', pass: null, date: '', tech: '', notes: '' },
      { item: `${u.name}: backup power`, standard: 'FEMA 2006 bulletin', expected: '≥ 15 min alerting on battery; 80% recharge in 24 h', measured: '', pass: null, date: '', tech: '', notes: '' },
      { item: `${u.name}: grounding and surge protection`, standard: 'NFPA 780 / maker', expected: 'Per maker; bonded to the pole ground', measured: '', pass: null, date: '', tech: '', notes: '' },
    ];
  });
}
