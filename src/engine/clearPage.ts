// "Clear all fields" on each page: puts only that page's entries back to a blank / starting value.
// Saved projects, the RadioReference login and downloads, the specifications library, contacts and
// other pages are never touched. Every clear can be undone, and a history copy is saved first.
import type { Project } from '../types';
import { defaultProject } from '../defaults';
import { checklistFor } from '../data/checklists';
import { applyCompanyDefault } from './companyDefault';

export interface PageClear {
  /** What gets cleared, in plain words (shown in the Yes / No box). */
  what: string;
  /** What stays, in plain words. */
  keeps?: string;
  /** Project fields this page owns, as dotted paths (e.g. 'radio.fMHz'). They go back to a new project's value. */
  paths?: string[];
  /** Fields that are emptied (removed) rather than set to a new project's value. */
  remove?: string[];
  /** Special cases that paths cannot express. */
  custom?: { clear: (d: Project) => void; restore: (d: Project, before: Project) => void };
  /** The page also has typed-in boxes that are not saved (calculators, search boxes): they are reset too. */
  local?: boolean;
}

const RADIO_EQUIPMENT = ['bandPreset', 'fMHz', 'txPowerDbm', 'txAntennaId', 'rxAntennaId', 'feederId', 'feederLenM', 'jumperLossDb', 'connectorLossDb',
  'rxSensitivityDbm', 'rxAntGainDbi', 'rxFeederLossDb', 'mobileHeightM', 'env', 'city', 'shadowSigmaDb', 'edgeReliability', 'penetrationLossDb',
  'bodyLossDb', 'interferenceMarginDb', 'azimuthDeg'].map((k) => 'radio.' + k);
const META_PROJECT = ['name', 'number', 'client', 'engineer', 'peLicense', 'state', 'county', 'city', 'jurisdictionNotes', 'revision'].map((k) => 'meta.' + k);
const META_OPTIONAL = ['clientContact', 'clientAddress', 'clientCity', 'clientState', 'clientZip', 'clientPhone', 'clientEmail', 'siteAddress', 'siteZip', 'poNumber'].map((k) => 'meta.' + k);

export const PAGE_CLEAR: Record<string, PageClear> = {
  company: { what: 'the project name and number, site address, client company, engineer, and your company details on this project', keeps: 'Measurements setting, project type and every other page. If you saved your company as the default, it fills back in.', paths: ['company', ...META_PROJECT], remove: [...META_OPTIONAL, 'company.logoDataUrl'] },
  systems: { what: 'the project type and the other systems picked for this job', keeps: 'Everything you entered on the other pages.', remove: ['meta.projectType', 'meta.subSystems', 'meta.customPages'], local: true },
  locate: { what: 'the search box and the spot found on the map', keeps: 'Sites already added to the project.', local: true },
  sites: { what: 'every site (back to the two starting sites in Asheville) and the cable runs between sites', keeps: 'Radio, equipment and the other pages.', paths: ['sites', 'radio.txSiteId', 'radio.rxSiteId'], remove: ['siteRuns'], local: true },
  fieldnotes: { what: 'every field note and photo, and the site survey checklist ticks', remove: ['fieldNotes'], local: true },
  photosurvey: { what: 'every photo survey spot with its photos, directions and saved report pictures', keeps: 'Field notes, sites and the other pages.', remove: ['photoSpots'], local: true },
  terrain: { what: 'the lines drawn on the map', keeps: 'Sites, downloaded terrain and offline maps.', remove: ['drawnLines'], local: true },
  wifi: { what: 'every Wi-Fi reading, the SSID filter, target signal and radius', paths: ['wifi'], local: true },
  signal: { what: 'every live signal reading (typed, from meters and imported) and this page’s boxes', keeps: 'Drive-test points, model tuning and connected devices.', remove: ['signalReadings'], local: true },
  assets: { what: 'every device on the equipment list, with its photos and history', keeps: 'Service resources and the other pages.', remove: ['assets'], local: true },
  survey: { what: 'the imported drive-test points', keeps: 'Model tuning already applied (clear it on Coverage Prediction).', paths: ['survey'], local: true },
  autodesign: { what: 'the auto-design answers and the equipment it added to the Materials list', keeps: 'Project type and the other pages.', remove: ['autoDesign'], local: true },
  models: { what: 'the building materials picked on this page (they go back to typical for the building type)', keeps: 'The building size and systems (shared with Auto-Design) and every other page.', remove: ['buildingMaterials'], local: true },
  campus: { what: 'the other buildings on the site, where each one sits, and the links between them', keeps: 'The main building (Auto-Design) and every other page.', remove: ['campus'], local: true },
  sirens: { what: 'every siren on this project, its test log and the coverage settings', keeps: 'The siren database, codes and the other pages.', remove: ['sirens'], local: true },
  alarm: { what: 'the fire alarm devices, battery and circuit entries', paths: ['alarm'], custom: { clear: (d) => { d.alarm.devices = []; }, restore: () => undefined } },
  erces: { what: 'the ERCES / BDA entries and the donor tower', paths: ['erces'], local: true },
  indoor: { what: 'the floor plan, walls, indoor antennas and settings', paths: ['indoor'], local: true },
  solar: { what: 'the solar loads, batteries, panels and wiring entries', paths: ['solar'], custom: { clear: (d) => { d.solar.loads = []; }, restore: () => undefined } },
  grounding: { what: 'the grounding, bonding and structure entries', paths: ['grounding'] },
  lfhf: { what: 'the LF / HF entries', paths: ['lfhf'] },
  equipment: { what: 'the band, frequency, radio, antennas, cable and link budget entries', keeps: 'Sites, tilt, coverage settings and the other pages.', paths: RADIO_EQUIPMENT },
  path: { what: 'the sites picked for the path, the earth curvature (k) and the clutter height', paths: ['radio.txSiteId', 'radio.rxSiteId', 'radio.kFactor', 'radio.clutterM'], local: true },
  coverage: { what: 'the coverage radius, grid and threshold, acceptance criteria, model tuning and the run history', keeps: 'Saved scenarios.', paths: ['radio.coverageRadiusKm', 'radio.coverageGridN', 'radio.coverageThresholdDbm', 'acceptance', 'propagation', 'runLog'], local: true },
  optimize: { what: 'the azimuth and the mechanical and electrical tilt', paths: ['radio.azimuthDeg', 'radio.mechTiltDeg', 'radio.elecTiltDeg'], local: true },
  network: {
    what: 'the transmitter at each site and the interference settings', keeps: 'The sites themselves.', paths: ['network'], local: true,
    custom: {
      clear: (d) => { for (const s of d.sites) delete s.tx; },
      restore: (d, b) => { for (const s of d.sites) { const o = b.sites.find((x) => x.id === s.id); if (o?.tx) s.tx = structuredClone(o.tx); } },
    },
  },
  scenarios: { what: 'every saved scenario', paths: ['scenarios'], local: true },
  compliance: { what: 'the permit checklist ticks and the items you added to it' },
  materials: { what: 'the materials you added, the quantities, prices and vendors you changed, the lines you removed, and the labor and budget', keeps: 'Materials worked out from the other pages, your vendors and your price list.', paths: ['bomOverrides'], remove: ['bomExtra', 'bomCost', 'estimate'], local: true },
  blueprints: { what: 'the sheet size, scale, drawn by / checked by, revisions, hidden sheets and plan north', remove: ['blueprint'], local: true },
  testing: { what: 'every test row and the testing checklist ticks', paths: ['tests'] },
  reports: { what: 'the proposal pricing, schedule and terms, and the closeout checklist ticks', keeps: 'Files attached to the project and the report pages you picked.', remove: ['proposal'], local: true },
  troubleshoot: { what: 'the system, equipment, symptom and the answers in the wizard', keeps: 'Field notes and tests it already saved.', local: true },
  install: { what: 'the installation checklist ticks and the items you added to it' },
  calculators: { what: 'every number typed into the calculators (back to the starting examples)', local: true },
  theory: { what: 'the numbers typed into the calculators on this page', local: true },
};

/** Pages that get a "Clear all fields" button. Pages with nothing to type in (and RadioReference, Projects, Sync, Library, Contacts) have none. */
export const canClearPage = (page: string) => page in PAGE_CLEAR;

const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((x, k) => (x == null ? undefined : (x as Record<string, unknown>)[k]), o);
function put(o: unknown, path: string, v: unknown) {
  const ks = path.split('.'); const last = ks.pop()!;
  let t = o as Record<string, unknown>;
  for (const k of ks) { if (t[k] == null || typeof t[k] !== 'object') t[k] = {}; t = t[k] as Record<string, unknown>; }
  if (v === undefined) delete t[last]; else t[last] = structuredClone(v);
}

function checklistKeys(page: string) {
  const def = checklistFor(page); return def ? def.id : null;
}

/** A copy of the project with only this page's entries cleared. */
export function clearPage(page: string, p: Project): Project {
  const c = PAGE_CLEAR[page]; const d = structuredClone(p);
  if (!c) return d;
  const def = defaultProject();
  for (const k of c.paths ?? []) put(d, k, get(def, k));
  for (const k of c.remove ?? []) put(d, k, undefined);
  c.custom?.clear(d);
  const list = checklistKeys(page);
  if (list) {
    if (d.checklists) { const ch = { ...d.checklists }; for (const k of Object.keys(ch)) if (k.startsWith(list + ':')) delete ch[k]; d.checklists = ch; }
    if (d.checklistExtra) d.checklistExtra = d.checklistExtra.filter((x) => x.list !== list);
  }
  return d;
}

/** Put this page's entries back from `before` into the current project, keeping anything changed elsewhere since. */
export function undoClear(page: string, now: Project, before: Project): Project {
  const c = PAGE_CLEAR[page]; const d = structuredClone(now);
  if (!c) return d;
  for (const k of [...(c.paths ?? []), ...(c.remove ?? [])]) put(d, k, get(before, k));
  c.custom?.restore(d, before);
  const list = checklistKeys(page);
  if (list) {
    const ch = { ...(d.checklists ?? {}) };
    for (const [k, v] of Object.entries(before.checklists ?? {})) if (k.startsWith(list + ':')) ch[k] = v;
    d.checklists = ch;
    d.checklistExtra = [...(d.checklistExtra ?? []).filter((x) => x.list !== list), ...(before.checklistExtra ?? []).filter((x) => x.list === list)];
  }
  return d;
}

/** True when the page has anything to clear (so the button can say "Nothing to clear"). */
export function pageHasEntries(page: string, p: Project): boolean {
  const c = PAGE_CLEAR[page]; if (!c) return false;
  if (c.local) return true;
  return JSON.stringify(clearPage(page, p)) !== JSON.stringify(p);
}

/** The whole project cleared on every page (Reset project). Keeps only settings (units, automatic terrain / maps)
 *  and sync bookkeeping, and fills your saved company default back in. */
export function resetProject(p: Project, companyDefault?: Parameters<typeof applyCompanyDefault>[1]): Project {
  const d = defaultProject();
  d.settings = structuredClone(p.settings);
  if (p.sync) d.sync = structuredClone(p.sync);
  applyCompanyDefault(d, companyDefault);
  d.alarm.devices = []; d.solar.loads = [];
  return d;
}
