// Primary project information that must be filled in before reports, proposals and drawings go out.
import type { Project } from '../types';

export const REQUIRED: { key: string; label: string; get: (p: Project) => string | undefined }[] = [
  { key: 'name', label: 'Project name', get: (p) => (/^new (radio site )?project$/i.test(p.meta.name.trim()) ? '' : p.meta.name) },
  { key: 'type', label: 'Project type', get: (p) => p.meta.projectType },
  { key: 'client', label: 'Client company name', get: (p) => p.meta.client },
  { key: 'address', label: 'Project site address', get: (p) => p.meta.siteAddress },
  { key: 'city', label: 'City / town', get: (p) => p.meta.city },
  { key: 'county', label: 'County', get: (p) => p.meta.county },
  { key: 'state', label: 'Project state', get: (p) => p.meta.state },
  { key: 'company', label: 'Your company name', get: (p) => p.company.name },
];
/** Required fields that are still empty. */
export const missingRequired = (p: Project) => REQUIRED.filter((r) => !(r.get(p) ?? '').toString().trim());
export const isMissing = (p: Project, key: string) => missingRequired(p).some((r) => r.key === key);
