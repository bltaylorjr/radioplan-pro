// User Settings: which tools (pages) show in the menu. Saved on this device for the user, not in a project,
// so every project follows the same choice. Picking a project type or sub-project turns back on any hidden
// tool that type needs and tells the user which ones.
import { useSyncExternalStore } from 'react';
import { ALWAYS_PAGES, PAGE_GROUPS, systemPages, suggestPages } from '../data/customPages';
import { projectSystems } from '../data/systems';
import { WORKFLOW_LABELS } from '../data/pageLabels';

const KEY = 'radioplan.hiddenTools';
type Listener = () => void;
const listeners = new Set<Listener>();
let hidden: string[] = read();
let notice: { pages: string[]; why: string; hid?: string[] } | null = null;
const AUTO = 'radioplan.autoHideTools';
let autoHide: boolean = (() => { try { return localStorage.getItem(AUTO) !== '0'; } catch { return true; } })();

function read(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && !ALWAYS_PAGES.includes(x)) : []; } catch { return []; }
}
function emit() { for (const l of listeners) l(); }
const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const hiddenTools = () => hidden;
/** Hide or show tools. Pages that must always show (Company, Project Systems, Projects, User Settings) cannot be hidden. */
export function setHiddenTools(ids: string[]) {
  hidden = [...new Set(ids)].filter((x) => !ALWAYS_PAGES.includes(x));
  try { localStorage.setItem(KEY, JSON.stringify(hidden)); } catch { /* storage unavailable: keep for this session */ }
  emit();
}
export const setToolOn = (id: string, on: boolean) => setHiddenTools(on ? hidden.filter((x) => x !== id) : [...hidden, id]);
export const useHiddenTools = () => useSyncExternalStore(subscribe, hiddenTools, hiddenTools);

/** Tools the project type and sub-projects need. */
export function neededTools(meta: { projectType?: string; subSystems?: string[] }): string[] {
  return systemPages(projectSystems(meta));
}
/** Which systems need a tool (for "needed by …" notes). */
export function neededBy(id: string, meta: { projectType?: string; subSystems?: string[] }): string[] {
  return projectSystems(meta).filter((s) => systemPages([s]).includes(id)).map((s) => s.label);
}

/** Turn on hidden tools the project type needs. Returns the ones turned on (empty if none were hidden). */
export function turnOnNeeded(meta: { projectType?: string; subSystems?: string[] }, hiddenNow: string[] = hidden): string[] {
  const need = new Set(neededTools(meta));
  const on = hiddenNow.filter((x) => need.has(x));
  if (on.length) {
    setHiddenTools(hiddenNow.filter((x) => !need.has(x)));
    const names = projectSystems(meta).map((s) => s.label);
    notice = { pages: on, why: names.join(', ') }; emit();
  }
  return on;
}

/** Automatically hide the tools a newly picked project type does not use (on unless the user turns it off). */
export const autoHideTools = () => autoHide;
export function setAutoHideTools(on: boolean) { autoHide = on; try { localStorage.setItem(AUTO, on ? '1' : '0'); } catch { /* ignore */ } emit(); }
export const useAutoHideTools = () => useSyncExternalStore(subscribe, autoHideTools, autoHideTools);

/**
 * The project type or sub-projects changed: turn on every hidden tool the job needs and, with automatic hiding on,
 * hide the tools it does not use (common job tools stay). Nothing is deleted. The notice lists both.
 */
export function applyTypeTools(meta: { projectType?: string; subSystems?: string[] }): { on: string[]; hid: string[] } {
  const systems = projectSystems(meta);
  if (!systems.length) return { on: [], hid: [] };
  const on = turnOnNeeded(meta);
  let hid: string[] = [];
  if (autoHide) {
    const keep = new Set([...suggestPages(systems), ...ALWAYS_PAGES, 'sync']);
    hid = PAGE_GROUPS.flatMap(([, ids]) => ids).filter((id) => !keep.has(id) && !hidden.includes(id));
    if (hid.length) setHiddenTools([...hidden, ...hid]);
  }
  if (on.length || hid.length) { notice = { pages: on, hid, why: systems.map((s) => s.label).join(', ') }; emit(); }
  return { on, hid };
}

/** Show the "turned on" notice for these pages. */
export function showToolNotice(pages: string[], why: string) { if (pages.length) { notice = { ...(notice ?? {}), pages: [...new Set([...(notice?.pages ?? []), ...pages])], why }; emit(); } }
export const toolNotice = () => notice;
export const useToolNotice = () => useSyncExternalStore(subscribe, toolNotice, toolNotice);
export function clearToolNotice() { notice = null; emit(); }
export const toolLabel = (id: string) => WORKFLOW_LABELS[id] ?? id;
