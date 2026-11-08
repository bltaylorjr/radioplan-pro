// Start a new project from a previous one: keep the design and build parts, clear the job-specific record.
import type { Project } from '../types';

export interface KeepGroup { id: string; label: string; detail: string; on: boolean }
/** What can be carried over, and whether it is ticked by default. */
export const KEEP_GROUPS: KeepGroup[] = [
  { id: 'systems', label: 'Project type and sub-projects', detail: 'Main system and the other systems on the job', on: true },
  { id: 'design', label: 'Design', detail: 'Auto-design building and device inputs, fire alarm, ERCES/DAS, grounding, solar, radio, network and indoor settings', on: true },
  { id: 'equipment', label: 'Equipment and materials', detail: 'Equipment library choices, materials you added and quantity changes', on: true },
  { id: 'proposal', label: 'Pricing, schedule and terms', detail: 'Labor rate and hours, markup, tax, payment terms, exclusions', on: true },
  { id: 'drawings', label: 'Drawing set settings', detail: 'Sheet size, scale, drawn and checked by (revisions start over)', on: true },
  { id: 'checklists', label: 'Checklist items you added', detail: 'Your own checklist items (all ticks start empty)', on: true },
  { id: 'client', label: 'Client', detail: 'Client name and contact details, for repeat work for the same customer', on: false },
  { id: 'sites', label: 'Sites and location', detail: 'Site positions, address, state, county and city, and downloaded terrain', on: false },
  { id: 'documents', label: 'Attached files', detail: 'Drawings, PDFs and data sheets attached to the project', on: false },
];
export const defaultKeep = () => Object.fromEntries(KEEP_GROUPS.map((g) => [g.id, g.on])) as Record<string, boolean>;

export interface TemplateOpts { name: string; number?: string; keep: Record<string, boolean> }

/** A new, editable project based on `src`. `fresh` is a brand-new default project used for anything not kept. */
export function projectFromTemplate(src: Project, fresh: Project, o: TemplateOpts): Project {
  const s = structuredClone(src), p = structuredClone(fresh), k = o.keep;
  p.company = s.company; p.settings = s.settings; p.propagation = s.propagation; p.acceptance = s.acceptance;
  p.meta.engineer = s.meta.engineer; p.meta.peLicense = s.meta.peLicense;
  if (k.systems) { p.meta.projectType = s.meta.projectType; p.meta.subSystems = s.meta.subSystems; if (s.meta.customPages) p.meta.customPages = s.meta.customPages; if (s.meta.skipped) p.meta.skipped = s.meta.skipped; }
  if (k.design) {
    p.radio = s.radio; p.grounding = s.grounding; p.solar = s.solar; p.alarm = s.alarm; p.erces = s.erces; p.lfhf = s.lfhf;
    p.indoor = s.indoor; p.network = s.network; p.scenarios = s.scenarios;
    if (s.autoDesign) p.autoDesign = s.autoDesign;
  }
  if (k.equipment) { p.customCatalog = s.customCatalog; p.bomExtra = (s.bomExtra ?? []).map((b) => ({ ...b })); p.bomOverrides = s.bomOverrides ?? {}; }
  if (k.proposal && s.proposal) p.proposal = { ...s.proposal, startDate: '' };
  if (k.drawings && s.blueprint) p.blueprint = { ...s.blueprint, revisions: [] };
  if (k.checklists) p.checklistExtra = s.checklistExtra;
  if (k.client) for (const f of ['client', 'clientContact', 'clientAddress', 'clientCity', 'clientState', 'clientZip', 'clientPhone', 'clientEmail'] as const) (p.meta as unknown as Record<string, unknown>)[f] = s.meta[f];
  if (k.sites) {
    p.sites = s.sites; p.siteRuns = (s.siteRuns ?? []).map((r) => ({ ...r, via: r.via.map((v) => ({ ...v })) })); p.meta.state = s.meta.state; p.meta.county = s.meta.county; p.meta.city = s.meta.city;
    p.meta.siteAddress = s.meta.siteAddress; p.meta.jurisdictionNotes = s.meta.jurisdictionNotes;
  }
  if (k.documents) p.documents = s.documents;
  // Never carried: field notes, photos, test results, service calls, PM dates, checklist ticks, run log, Wi-Fi survey, survey answers, sync data.
  p.meta.name = o.name.trim() || `${s.meta.name} (new)`;
  p.meta.number = o.number?.trim() ?? '';
  p.meta.revision = 'A';
  p.meta.created = new Date().toISOString().slice(0, 10);
  delete p.sync;
  // Drop fields left undefined by carried-over parts that the old project did not have.
  for (const key of Object.keys(p) as (keyof Project)[]) if (p[key] === undefined) delete p[key];
  return p;
}
