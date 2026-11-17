// "Custom" project type: the user picks only the systems and pages/tools they need,
// and the menu, steps and Next/Previous follow that pick.
import type { LvSystem } from './systems';
import { MENU_GROUPS, MENU_PAGES, groupHeading } from './menu';

/** Pages that always show, so the custom pick can always be changed. */
export const ALWAYS_PAGES = ['company', 'systems', 'projects', 'settings'];

/** Menu groups and their pages, in menu order (from the menu list in menu.ts). */
export const PAGE_GROUPS: [string, string[]][] = MENU_GROUPS.map((g) => [groupHeading(g), MENU_PAGES.filter((p) => p.group === g.id).map((p) => p.id)]);

/** Pages most low-voltage jobs use, whatever the systems. */
const COMMON = ['floorplan', 'buildout', 'locate', 'sites', 'fieldnotes', 'compliance', 'materials', 'vendors', 'blueprints', 'testing', 'reports', 'troubleshoot', 'directions', 'service', 'assets', 'devices', 'install', 'theory', 'library', 'contacts', 'calculators'];
/** Extra pages for systems that need radio or design pages. */
const EXTRA: Record<string, string[]> = {
  firealarm: ['alarm', 'autodesign', 'models', 'campus'], massnotif: ['alarm', 'autodesign', 'models', 'campus'], security: ['autodesign', 'models', 'campus'], access: ['autodesign', 'models', 'campus'], cctv: ['autodesign', 'models', 'campus'],
  cabling: ['autodesign', 'models', 'campus'], nursecall: ['autodesign', 'models', 'campus'], paging: ['autodesign', 'models', 'campus'], sound: ['autodesign', 'models', 'campus'], intercom: ['autodesign', 'models', 'campus'],
  erces: ['photosurvey', 'erces', 'indoor', 'models', 'campus', 'survey', 'signal', 'grounding', 'fcc'], das: ['photosurvey', 'indoor', 'erces', 'models', 'campus', 'survey', 'signal', 'grounding', 'fcc'], wifi: ['wifi', 'indoor', 'models', 'campus', 'signal'],
  radio: ['photosurvey', 'terrain', 'equipment', 'path', 'coverage', 'optimize', 'network', 'scenarios', 'view3d', 'grounding', 'survey', 'signal', 'lfhf', 'fcc', 'faa', 'mappacks'],
  callbox: ['photosurvey', 'solar', 'terrain', 'coverage', 'equipment', 'faa', 'mappacks', 'signal'], solar: ['solar', 'grounding'],
};

/** Suggested pages for the picked systems. */
export function suggestPages(systems: LvSystem[]): string[] {
  const set = new Set([...ALWAYS_PAGES, ...COMMON]);
  for (const s of systems) { for (const pg of s.pages) set.add(pg); for (const pg of EXTRA[s.id] ?? []) set.add(pg); }
  return PAGE_GROUPS.flatMap(([, ids]) => ids).filter((id) => set.has(id));
}

/** Pages a system itself needs (its toolkit pages, design pages, calculators, library and service), without the common ones. */
export function systemPages(systems: LvSystem[]): string[] {
  const set = new Set<string>();
  for (const s of systems) {
    for (const pg of s.pages) set.add(pg); for (const pg of EXTRA[s.id] ?? []) set.add(pg);
    if (s.calcs.length) set.add('calculators'); if (s.libCats.length) set.add('library'); if (s.pm.length) set.add('service');
  }
  return PAGE_GROUPS.flatMap(([, ids]) => ids).filter((id) => set.has(id));
}
