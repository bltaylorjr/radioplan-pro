// "Custom" project type: the user picks only the systems and pages/tools they need,
// and the menu, steps and Next/Previous follow that pick.
import type { LvSystem } from './systems';

/** Pages that always show, so the custom pick can always be changed. */
export const ALWAYS_PAGES = ['company', 'systems', 'projects'];

/** Menu groups and their pages, in menu order (kept in step with WORKFLOW in App.tsx by a test). */
export const PAGE_GROUPS: [string, string[]][] = [
  ['1 · Project setup', ['company', 'systems', 'locate', 'sites']],
  ['2 · Planning: site survey', ['fieldnotes', 'terrain', 'wifi', 'survey']],
  ['3 · Planning: low-voltage design', ['autodesign', 'alarm', 'erces', 'indoor', 'solar', 'grounding']],
  ['4 · Planning: radio & RF', ['equipment', 'path', 'coverage', 'optimize', 'network', 'scenarios', 'view3d', 'lfhf']],
  ['5 · Planning: codes & materials', ['compliance', 'materials', 'blueprints']],
  ['6 · Testing & closeout', ['testing', 'reports']],
  ['7 · Troubleshooting & repair', ['troubleshoot']],
  ['Tools', ['directions', 'service', 'install', 'theory', 'library', 'contacts', 'calculators', 'projects', 'sync']],
];

/** Pages most low-voltage jobs use, whatever the systems. */
const COMMON = ['locate', 'sites', 'fieldnotes', 'compliance', 'materials', 'blueprints', 'testing', 'reports', 'troubleshoot', 'directions', 'service', 'install', 'theory', 'library', 'contacts', 'calculators'];
/** Extra pages for systems that need radio or design pages. */
const EXTRA: Record<string, string[]> = {
  firealarm: ['alarm', 'autodesign'], massnotif: ['alarm', 'autodesign'], security: ['autodesign'], access: ['autodesign'], cctv: ['autodesign'],
  cabling: ['autodesign'], nursecall: ['autodesign'], paging: ['autodesign'], sound: ['autodesign'], intercom: ['autodesign'],
  erces: ['erces', 'indoor', 'survey', 'grounding'], das: ['indoor', 'erces', 'survey', 'grounding'], wifi: ['wifi', 'indoor'],
  radio: ['terrain', 'equipment', 'path', 'coverage', 'optimize', 'network', 'scenarios', 'view3d', 'grounding', 'survey', 'lfhf'],
  callbox: ['solar', 'terrain', 'coverage', 'equipment'], solar: ['solar', 'grounding'],
};

/** Suggested pages for the picked systems. */
export function suggestPages(systems: LvSystem[]): string[] {
  const set = new Set([...ALWAYS_PAGES, ...COMMON]);
  for (const s of systems) { for (const pg of s.pages) set.add(pg); for (const pg of EXTRA[s.id] ?? []) set.add(pg); }
  return PAGE_GROUPS.flatMap(([, ids]) => ids).filter((id) => set.has(id));
}
