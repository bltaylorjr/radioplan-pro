// Equipment added to a project is loaded into "My library" automatically, so its specifications can be
// looked up and edited. Items are matched by category + manufacturer + model; edits are never overwritten.
import type { Project } from '../types';
import { ANTENNAS, FEEDERS, RADIOS, PV_MODULES, byId } from './catalog';
import { antennaSpec, feederSpec, radioSpec, pvSpec, SpecItem } from './speclib';
import { buildBom } from '../engine/materials';
import { kvGet, kvSet, newId } from '../engine/projectdb';

export const SPECLIB_KEY = 'speclib';
export const SPECLIB_EVENT = 'radioplan-speclib';
export async function loadMyItems(): Promise<SpecItem[]> { return (await kvGet<SpecItem[]>(SPECLIB_KEY)) ?? []; }
export async function saveMyItems(items: SpecItem[]) { await kvSet(SPECLIB_KEY, items); window.dispatchEvent(new Event(SPECLIB_EVENT)); }

const BOM_CAT: Record<string, string> = { 'RF equipment': 'Antennas', 'Transmission line': 'Coax & feeders', 'Grounding': 'Surge & grounding', 'Solar / DC power': 'Solar & DC power', 'Fire alarm': 'Fire alarm', 'ERCES / DAS': 'ERCES / BDA & DAS' };
export const originKey = (category: string, brand: string, model: string) => `${category}|${brand}|${model}`.toLowerCase().replace(/\s+/g, ' ').trim();

/** Library entries for the equipment this project uses. */
export function projectEquipment(p: Project): SpecItem[] {
  const out: SpecItem[] = [];
  const put = (it: SpecItem, from: string) => out.push({ ...it, kind: 'My item', origin: originKey(it.category, it.brand, it.model), notes: it.notes ?? `Loaded from the project (${from}). Typical values: confirm against the manufacturer datasheet.` });
  const r = p.radio;
  for (const id of new Set([r.txAntennaId, r.rxAntennaId])) { const a = byId(ANTENNAS, id); if (a) put(antennaSpec(a), 'antenna'); }
  const fd = byId(FEEDERS, r.feederId); if (fd) put(feederSpec(fd), 'main feeder');
  const radio = RADIOS.find((x) => r.fMHz >= x.bandMHz[0] && r.fMHz <= x.bandMHz[1]); if (radio && p.sites.length) put(radioSpec(radio), 'base station');
  if (p.solar.enabled) { const m = byId(PV_MODULES, p.solar.moduleId) ?? PV_MODULES[0]; if (m) put(pvSpec(m), 'PV module'); }
  if (p.alarm.enabled) for (const d of p.alarm.devices) if (d.name.trim())
    put({ id: '', category: 'Fire alarm', sub: 'Device', brand: 'Project device', model: d.name.trim(), kind: 'My item', specs: { 'Device type': d.name.trim(), 'Standby current (mA)': d.standbyMa, 'Alarm current (mA)': d.alarmMa, 'Listing': 'UL 864 / 268 / 1971 (confirm)' } }, 'fire alarm device schedule');
  if (p.erces.enabled) put({ id: '', category: 'ERCES / BDA & DAS', sub: 'BDA', brand: 'Project BDA', model: 'Public-safety BDA (Class A/B)', kind: 'My item', specs: { 'Class': 'A or B (confirm)', 'Max gain (dB)': p.erces.bdaGainDb, 'Max output (dBm)': p.erces.bdaMaxOutputDbm, 'Battery standby (h)': p.erces.standbyHours, 'Enclosure': p.erces.nema4Enclosure ? 'NEMA 4 / 4X' : 'Confirm', 'Listing': 'UL 2524' } }, 'ERCES design');
  const covered = new Set(['radio', 'antenna', 'feeder', 'pv', 'bda']);
  for (const l of buildBom(p)) {
    if (covered.has(l.key) || /^fa-\d/.test(l.key) || !l.brandModel.trim()) continue;
    put({ id: '', category: BOM_CAT[l.category] ?? 'Other', sub: l.item, brand: 'Materials list', model: l.brandModel, kind: 'My item', specs: { 'Description': l.item, 'Unit': l.unit, 'Basis': l.basis } }, 'materials list');
  }
  const seen = new Set<string>();
  return out.filter((i) => !seen.has(i.origin!) && seen.add(i.origin!));
}

/** Add new project equipment to the library; never change specs the person may have edited. */
export function mergeProjectEquipment(mine: SpecItem[], items: SpecItem[], projectName: string): { next: SpecItem[]; added: number; changed: boolean } {
  const byOrigin = new Map(mine.filter((m) => m.origin).map((m) => [m.origin!, m]));
  let added = 0, changed = false; const fresh: SpecItem[] = [];
  const next = mine.map((m) => m);
  for (const it of items) {
    const have = byOrigin.get(it.origin!);
    if (have) {
      if (!(have.projects ?? []).includes(projectName)) { const i = next.indexOf(have); next[i] = { ...have, projects: [...(have.projects ?? []), projectName] }; changed = true; }
    } else { fresh.push({ ...it, id: newId(), added: Date.now(), projects: [projectName] }); added++; }
  }
  if (added) changed = true;
  return { next: [...fresh, ...next], added, changed };
}

let busy: Promise<void> = Promise.resolve();
/** Run after project changes: loads any newly added equipment into the library. */
export function autoLoadEquipment(p: Project): Promise<void> {
  busy = busy.then(async () => {
    const mine = await loadMyItems();
    const r = mergeProjectEquipment(mine, projectEquipment(p), p.meta.name || 'Project');
    if (r.changed) await saveMyItems(r.next);
  }).catch(() => { /* storage unavailable: skip */ });
  return busy;
}
