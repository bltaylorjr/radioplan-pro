// Self-repair for project data: fills in anything missing or damaged with safe defaults,
// so an old, partly-synced or hand-edited project file always opens.
import type { Project } from '../types';
import { defaultProject } from '../defaults';
import { countyOfTown, placeFromText } from '../compliance/place';
import { normalizeIndoorSound, type IndoorSound } from './indoorSound';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const LISTS = ['tests', 'runLog', 'scenarios', 'fieldNotes', 'serviceLog', 'bomExtra', 'documents', 'proposal', 'photoSpots', 'signalReadings', 'assets', 'readingPins'] as const;

/** Merge a stored section onto its defaults, one level deep, fixing wrong types. */
function heal(def: Record<string, unknown>, got: unknown, path: string, fixes: string[]): Record<string, unknown> {
  if (!isObj(got)) { fixes.push(`${path} was missing; restored defaults`); return structuredClone(def); }
  const out: Record<string, unknown> = { ...got };
  for (const [k, dv] of Object.entries(def)) {
    const gv = got[k];
    if (gv === undefined) { out[k] = structuredClone(dv); continue; }
    if (typeof dv === 'number' && (typeof gv !== 'number' || !Number.isFinite(gv))) {
      const n = typeof gv === 'string' ? parseFloat(gv) : NaN;
      out[k] = Number.isFinite(n) ? n : dv; fixes.push(`${path}.${k} was not a number; reset`);
    } else if (typeof dv === 'boolean' && typeof gv !== 'boolean') { out[k] = !!gv; }
    else if (typeof dv === 'string' && typeof gv !== 'string') { out[k] = gv == null ? dv : String(gv); }
    else if (Array.isArray(dv) && !Array.isArray(gv)) { out[k] = structuredClone(dv); fixes.push(`${path}.${k} was damaged; reset`); }
    else if (isObj(dv) && !isObj(gv)) { out[k] = structuredClone(dv); fixes.push(`${path}.${k} was damaged; reset`); }
  }
  return out;
}

/** Returns a project that is safe to open, and a list of what was fixed. */
export function repairProject(input: unknown): { project: Project; fixes: string[] } {
  const fixes: string[] = [];
  const def = defaultProject() as unknown as Record<string, unknown>;
  const src = isObj(input) ? input : (fixes.push('Project data was unreadable; started a new project'), {});
  const out: Record<string, unknown> = { ...src };
  for (const [k, dv] of Object.entries(def)) {
    const gv = src[k];
    if (Array.isArray(dv)) {
      if (!Array.isArray(gv)) { if (gv !== undefined) fixes.push(`${k} list was damaged; reset`); out[k] = gv === undefined ? structuredClone(dv) : []; }
      else out[k] = gv.filter((x) => x != null);
    } else if (isObj(dv)) out[k] = heal(dv, gv, k, fixes);
    else if (gv === undefined || typeof gv !== typeof dv) out[k] = dv;
  }
  for (const k of LISTS) if (out[k] !== undefined && k !== 'proposal' && !Array.isArray(out[k])) { out[k] = []; fixes.push(`${k} list was damaged; reset`); }
  // Materials costing and estimate (optional): drop damaged parts so the Materials page always opens.
  if (out.bomCost !== undefined && !isObj(out.bomCost)) { delete out.bomCost; fixes.push('Materials prices were damaged; reset'); }
  if (out.estimate !== undefined) {
    if (!isObj(out.estimate)) { delete out.estimate; fixes.push('Materials estimate was damaged; reset'); }
    else {
      const e = out.estimate as Record<string, unknown>;
      for (const k of ['taxPct', 'shipping', 'contingencyPct', 'markupPct', 'budgetMaterials', 'budgetLabor', 'budgetTotal']) if (e[k] !== undefined && !Number.isFinite(Number(e[k]))) e[k] = 0; else if (e[k] !== undefined) e[k] = Number(e[k]);
      e.labor = (Array.isArray(e.labor) ? e.labor : []).filter(isObj).map((l, i) => ({ ...l, id: String(l.id ?? `lab${i}`), task: String(l.task ?? ''), people: Number(l.people) || 0, hours: Number(l.hours) || 0, rate: Number(l.rate) || 0 }));
    }
  }
  // Sites need an id, a name and real coordinates.
  const sites = (out.sites as Record<string, unknown>[]).filter(isObj);
  const seen = new Set<string>();
  out.sites = sites.filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon))).map((s, i) => {
    let id = String(s.id ?? ''); if (!id || seen.has(id)) { id = `S${i + 1}-${Math.random().toString(36).slice(2, 6)}`; fixes.push('A site had a missing or duplicate id; fixed'); }
    seen.add(id); return { ...s, id, name: String(s.name ?? `Site ${i + 1}`), lat: Number(s.lat), lon: Number(s.lon) };
  });
  if ((out.sites as unknown[]).length < sites.length) fixes.push('A site with bad coordinates was removed');
  // Ids inside every list must be unique, or edits hit the wrong row.
  for (const k of ['tests', 'fieldNotes', 'serviceLog', 'bomExtra', 'documents', 'photoSpots', 'signalReadings', 'assets', 'readingPins'] as const) {
    const arr = out[k]; if (!Array.isArray(arr)) continue; const ids = new Set<string>();
    out[k] = arr.filter(isObj).map((x) => { let id = String(x.id ?? ''); if (!id || ids.has(id)) { id = Math.random().toString(36).slice(2, 10); fixes.push(`A ${k} entry had a duplicate id; fixed`); } ids.add(id); return { ...x, id }; });
  }
  // Readings need a numeric signal; assets need their lists.
  if (Array.isArray(out.signalReadings)) out.signalReadings = (out.signalReadings as Record<string, unknown>[]).filter((r) => Number.isFinite(Number(r.dbm))).map((r) => ({ ...r, dbm: Number(r.dbm), session: String(r.session ?? 'Readings') }));
  if (Array.isArray(out.readingPins)) out.readingPins = (out.readingPins as Record<string, unknown>[]).filter((r) => Number.isFinite(Number(r.v)) && Number.isFinite(Number(r.x)) && Number.isFinite(Number(r.y)))
    .map((r) => ({ ...r, v: Number(r.v), x: Number(r.x), y: Number(r.y), map: String(r.map ?? 'indoor'), system: String(r.system ?? 'rf'), qty: ['dbm', 'dba', 'lux'].includes(String(r.qty)) ? r.qty : 'dbm', at: String(r.at ?? new Date().toISOString()) }));
  // Indoor sound plan (speakers, horns, STIPA readings): fill gaps from older or shared copies.
  if (isObj(out.indoor) && (out.indoor as Record<string, unknown>).sound !== undefined) {
    const ind = out.indoor as Record<string, unknown>;
    if (!isObj(ind.sound)) { delete ind.sound; fixes.push('The indoor sound plan was damaged; reset'); }
    else ind.sound = normalizeIndoorSound(ind.sound as Partial<IndoorSound>);
    if (ind.mode !== undefined && ind.mode !== 'rf' && ind.mode !== 'sound') ind.mode = 'rf';
  }
  if (out.pinTargets !== undefined && !isObj(out.pinTargets)) { delete out.pinTargets; fixes.push('Reading pin targets were damaged; reset'); }
  if (Array.isArray(out.assets)) out.assets = (out.assets as Record<string, unknown>[]).map((a) => ({ ...a, tag: String(a.tag ?? ''), name: String(a.name ?? ''), photos: Array.isArray(a.photos) ? a.photos : [], history: Array.isArray(a.history) ? a.history : [], status: a.status ?? 'In service' }));
  // Outdoor sirens: lists must be lists, sirens need a real position.
  if (isObj(out.sirens)) {
    const sr = out.sirens as Record<string, unknown>;
    const units = Array.isArray(sr.units) ? (sr.units as unknown[]).filter(isObj) : [];
    sr.units = units.filter((u) => Number.isFinite(Number(u.lat)) && Number.isFinite(Number(u.lon))).map((u, i) => ({ ...u, id: String(u.id ?? `siren${i}`), name: String(u.name ?? `Siren ${i + 1}`), modelId: String(u.modelId ?? ''), lat: Number(u.lat), lon: Number(u.lon), heightFt: Number.isFinite(Number(u.heightFt)) ? Number(u.heightFt) : 50 }));
    if ((sr.units as unknown[]).length < units.length) fixes.push('A siren with bad coordinates was removed');
    sr.tests = Array.isArray(sr.tests) ? (sr.tests as unknown[]).filter(isObj) : [];
  } else if (out.sirens !== undefined) { delete out.sirens; fixes.push('Damaged siren plan removed'); }
  // Older default sites sat in Charlotte; move untouched ones to the project's town (or the Asheville default).
  const OLD: Record<string, [number, number]> = { A: [35.2271, -80.8431], B: [35.2896, -80.734] };
  const mm = out.meta as { city?: string; state?: string; siteAddress?: string };
  if (!/charlotte/i.test(mm?.city ?? '')) {
    const town = placeFromText(mm?.siteAddress || `${mm?.city ?? ''}, ${mm?.state ?? ''}`, mm?.state);
    const base = town ? { lat: town.lat, lon: town.lon } : { lat: 35.5951, lon: -82.5515 };
    out.sites = (out.sites as Record<string, unknown>[]).map((s) => {
      const o = OLD[String(s.id)]; if (!o || s.lat !== o[0] || s.lon !== o[1] || s.positionSource !== 'Manual') return s;
      fixes.push(`${s.name} moved from the old Charlotte default to ${town?.city ?? 'Asheville'}`);
      return { ...s, lat: +(base.lat + (s.id === 'B' ? 0.045 : 0)).toFixed(6), lon: +(base.lon + (s.id === 'B' ? 0.07 : 0)).toFixed(6), groundElevM: null };
    });
  }
  // Older default name.
  if ((out.meta as { name?: string })?.name === 'New radio site project') out.meta = { ...(out.meta as object), name: 'New project' };
  // The county must be the one the project's city is in (an older default paired Asheville with Mecklenburg County).
  const meta = out.meta as { state?: string; county?: string; city?: string } | undefined;
  if (meta?.city && meta.state) { const c = countyOfTown(meta.city, meta.state); if (c && c !== meta.county) { fixes.push(`County corrected to ${c} for ${meta.city}`); out.meta = { ...meta, county: c }; } }
  return { project: out as unknown as Project, fixes: [...new Set(fixes)] };
}
