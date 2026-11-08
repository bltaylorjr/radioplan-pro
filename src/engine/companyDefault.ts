// Your company information and logo saved once on this device and filled into every new project
// (and into any open project whose company fields are empty).
import type { Company, Project } from '../types';
import { kvGet, kvSet } from './projectdb';

export interface CompanyDefault { company: Company; engineer?: string; peLicense?: string; savedAt: string }
const KEY = 'company.default';
export const loadCompanyDefault = () => kvGet<CompanyDefault>(KEY);
export const saveCompanyDefault = (p: Project) => kvSet(KEY, { company: structuredClone(p.company), engineer: p.meta.engineer || undefined, peLicense: p.meta.peLicense || undefined, savedAt: new Date().toISOString() } as CompanyDefault);
export const clearCompanyDefault = () => kvSet(KEY, undefined);

/** Fill only the empty company fields (and engineer / PE license) from the saved default. Returns true when anything changed. */
export function applyCompanyDefault(d: Project, def: CompanyDefault | undefined): boolean {
  if (!def) return false; let changed = false;
  const c = d.company as unknown as Record<string, string | undefined>, src = def.company as unknown as Record<string, string | undefined>;
  for (const k of Object.keys(src)) if (src[k] && !c[k]) { c[k] = src[k]; changed = true; }
  if (def.engineer && !d.meta.engineer) { d.meta.engineer = def.engineer; changed = true; }
  if (def.peLicense && !d.meta.peLicense) { d.meta.peLicense = def.peLicense; changed = true; }
  return changed;
}
