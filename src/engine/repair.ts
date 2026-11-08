// Self-repair for project data: fills in anything missing or damaged with safe defaults,
// so an old, partly-synced or hand-edited project file always opens.
import type { Project } from '../types';
import { defaultProject } from '../defaults';
import { countyOfTown } from '../compliance/place';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const LISTS = ['tests', 'runLog', 'scenarios', 'fieldNotes', 'serviceLog', 'bomExtra', 'documents', 'proposal'] as const;

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
  // Sites need an id, a name and real coordinates.
  const sites = (out.sites as Record<string, unknown>[]).filter(isObj);
  const seen = new Set<string>();
  out.sites = sites.filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon))).map((s, i) => {
    let id = String(s.id ?? ''); if (!id || seen.has(id)) { id = `S${i + 1}-${Math.random().toString(36).slice(2, 6)}`; fixes.push('A site had a missing or duplicate id; fixed'); }
    seen.add(id); return { ...s, id, name: String(s.name ?? `Site ${i + 1}`), lat: Number(s.lat), lon: Number(s.lon) };
  });
  if ((out.sites as unknown[]).length < sites.length) fixes.push('A site with bad coordinates was removed');
  // Ids inside every list must be unique, or edits hit the wrong row.
  for (const k of ['tests', 'fieldNotes', 'serviceLog', 'bomExtra', 'documents'] as const) {
    const arr = out[k]; if (!Array.isArray(arr)) continue; const ids = new Set<string>();
    out[k] = arr.filter(isObj).map((x) => { let id = String(x.id ?? ''); if (!id || ids.has(id)) { id = Math.random().toString(36).slice(2, 10); fixes.push(`A ${k} entry had a duplicate id; fixed`); } ids.add(id); return { ...x, id }; });
  }
  // The county must be the one the project's city is in (an older default paired Asheville with Mecklenburg County).
  const meta = out.meta as { state?: string; county?: string; city?: string } | undefined;
  if (meta?.city && meta.state) { const c = countyOfTown(meta.city, meta.state); if (c && c !== meta.county) { fixes.push(`County corrected to ${c} for ${meta.city}`); out.meta = { ...meta, county: c }; } }
  return { project: out as unknown as Project, fixes: [...new Set(fixes)] };
}
