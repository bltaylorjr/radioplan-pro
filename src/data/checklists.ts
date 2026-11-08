// Checklists shown on the pages where the work happens. Items come from general practice plus the
// steps for each system on the project. Ticks are saved in the project.
import type { Project } from '../types';
import { projectSystems } from './systems';

export interface CheckItem { id: string; text: string; group?: string; mine?: boolean }
export interface ChecklistDef { id: string; page: string; title: string; tip: string; items: (p: Project) => CheckItem[] }

const g = (prefix: string, group: string, list: string[]) => list.map((text, i) => ({ id: `${prefix}${i}`, text, group }));
const perSystem = (p: Project, key: 'plan' | 'install' | 'test') => projectSystems(p.meta).flatMap((s) => (s[key] ?? []).map((text, i) => ({ id: `${s.id}-${key}${i}`, text, group: `${s.icon} ${s.label}` })));

export const CHECKLISTS: ChecklistDef[] = [
  { id: 'survey', page: 'fieldnotes', title: 'Site survey checklist', tip: 'What to look at and record on the first site visit.',
    items: () => g('s', 'Site survey', [
      'Get the building drawings (floor plans, reflected ceiling plans) or sketch each floor',
      'Note ceiling type and height, and whether the space above is a plenum',
      'Find the telecom rooms and the main electrical room; check space, power, cooling and the ground bar',
      'Check existing pathways: conduit, sleeves, cable tray, J-hooks; note what is full',
      'Note fire-rated walls and floors that new cable will cross (firestopping needed)',
      'Record the make and model of existing panels, recorders, controllers and head-ends',
      'Check cellular signal and radio signal at the panel and in the stairwells and basement',
      'Note hazards and limits: asbestos, heights, lifts needed, work hours, escorts, badges',
      'Photograph each area, existing equipment and the outside of the building',
      'Get the owner contact, the AHJ and the monitoring company for the site',
    ]) },
  { id: 'permit', page: 'compliance', title: 'Permit and submittal checklist', tip: 'What the AHJ usually wants before you can start work.',
    items: () => g('p', 'Permit and submittal', [
      'Confirm the adopted codes and local amendments with the AHJ (see Codes for the project address)',
      'Check that the company and the qualifier hold the right state license',
      'Prepare drawings: floor plans with device locations, riser diagram, legend and title block',
      'Fire alarm: include NFPA 72 shop drawing items (sequence of operations, battery and voltage-drop calcs, device data sheets)',
      'ERCES / BDA: get the AHJ and frequency-licensee approval and FCC registration for the booster',
      'Attach equipment data sheets and listings (UL) for every device',
      'Submit the permit application and pay the fees',
      'Permit issued; post it on site',
    ]) },
  { id: 'install', page: 'install', title: 'Installation checklist', tip: 'Steps for each system on the project, plus the general ones.',
    items: (p) => [...g('i', 'Every job', [
      'Permit on site and drawings are the latest revision',
      'Materials delivered and checked against the Materials list',
      'Pathways and supports installed before pulling cable',
      'Every cable labeled at both ends to the labeling scheme',
      'Firestop every penetration of a rated wall or floor, with a listed system',
      'Bond equipment racks, panels and surge protectors to the building ground',
      'Clean up and protect installed devices from dust and paint',
    ]), ...perSystem(p, 'install')] },
  { id: 'testing', page: 'testing', title: 'Testing checklist', tip: 'Acceptance tests for each system before the AHJ inspection.',
    items: (p) => [...g('t', 'Every job', [
      'Notify the monitoring company and the building owner before testing',
      'Test every device and record the results',
      'Fix and re-test every failed item',
      'Schedule the AHJ acceptance test',
    ]), ...perSystem(p, 'test')] },
  { id: 'closeout', page: 'reports', title: 'Closeout checklist', tip: 'What to hand over to finish the job.',
    items: () => g('c', 'Closeout', [
      'AHJ final inspection passed; certificate or sign-off received',
      'As-built drawings updated with final device locations and cable routes',
      'Test reports and certification results handed over',
      'Fire alarm: NFPA 72 Record of Completion filled in and signed',
      'Owner training given; attendance signed',
      'O&M manuals, data sheets and warranty letters handed over',
      'Passwords, keys and software licenses handed over',
      'Spare parts and attic stock delivered',
      'Preventative maintenance or service contract offered',
      'Final invoice sent',
    ]) },
];

export const checklistFor = (page: string) => CHECKLISTS.find((c) => c.page === page);
/** Items for one list, including ones the user added. */
export function itemsOf(def: ChecklistDef, p: Project): CheckItem[] {
  return [...def.items(p), ...(p.checklistExtra ?? []).filter((x) => x.list === def.id).map((x) => ({ id: x.id, text: x.text, group: 'Added by me', mine: true }))];
}
export const doneKey = (list: string, item: string) => `${list}:${item}`;
export function progressOf(def: ChecklistDef, p: Project) {
  const items = itemsOf(def, p); const done = items.filter((i) => p.checklists?.[doneKey(def.id, i.id)]).length;
  return { done, total: items.length };
}
