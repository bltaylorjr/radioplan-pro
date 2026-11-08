import { autoLoadEquipment } from './data/projectEquipment';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './types';
import { defaultProject } from './defaults';
import { repairProject } from './engine/repair';
import { loadCompanyDefault, applyCompanyDefault } from './engine/companyDefault';
import type { DemGrid, ProfileAnalysis } from './engine/terrain';
import type { CoverageResult } from './engine/coverage';
import { stampSync } from './engine/sync';
import { registerCustom } from './data/catalog';
import { addVersion, BackupEntry, deleteProject, listProjects, folderAllowed, folderCopySupported, getRecord, getVersion, importEntries, loadTerrain, newId, putProject, requestPersist, saveTerrain, savedDataFolder, storageAvailable, VERSION_EVERY_MS, writeToFolder } from './engine/projectdb';

const KEY = 'radioplan.project.v1';
const CUR = 'radioplan.currentId';

/** Runtime-only (not saved in the project file): large terrain grids and computed results. */
export interface LocateTarget { lat: number; lon: number; label: string; state?: string; county?: string }
export interface Runtime {
  dem: DemGrid | null; demAuto?: boolean; profile: ProfileAnalysis | null; coverage: CoverageResult | null;
  terrainStatus?: string; mapStatus?: string; locate?: LocateTarget | null; query?: string;
  /** Set after Save or an export with required fields empty: only then are they highlighted. */
  showRequired?: boolean;
}
export type SaveState = 'loading' | 'saving' | 'saved' | 'error' | 'unavailable';

interface Library {
  projectId: string; saveState: SaveState; saveError: string; libVersion: number;
  openProject: (id: string) => Promise<void>;
  newProject: (p?: Project, name?: string, terrainFrom?: string) => Promise<string>;
  importProjects: (entries: BackupEntry[]) => Promise<string[]>;
  restoreVersion: (vid: number) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  saveNow: (reason?: string) => Promise<void>;
  bump: () => void;
}
interface Ctx {
  project: Project; update: (fn: (d: Project) => void) => void; replace: (p: Project) => void;
  rt: Runtime; setRt: (fn: (r: Runtime) => Runtime) => void;
  page: string; go: (page: string) => void;
  lib: Library;
}
const C = createContext<Ctx | null>(null);

function load(): Project {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return repairProject(JSON.parse(s)).project;
  } catch { /* storage unavailable */ }
  return defaultProject();
}
const fresh = (p: Project): Project => repairProject(p).project;
function currentId(): string { try { const v = localStorage.getItem(CUR); if (v) return v; const id = newId(); localStorage.setItem(CUR, id); return id; } catch { return newId(); } }
function setCurrentIdLS(id: string) { try { localStorage.setItem(CUR, id); } catch { /* ignore */ } }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project>(load);
  const [rt, setRtState] = useState<Runtime>({ dem: null, profile: null, coverage: null });
  const [page, setPage] = useState(() => (location.hash.slice(1) || 'company'));
  const [projectId, setProjectId] = useState(currentId);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [saveError, setSaveError] = useState('');
  const [libVersion, setLibVersion] = useState(0);
  const lastVersion = useRef(0);
  const lastDem = useRef<DemGrid | null>(null);
  const live = useRef({ project, projectId, dem: rt.dem }); live.current = { project, projectId, dem: rt.dem };

  // Startup: open the built-in library, migrate the browser copy, restore this project's terrain.
  useEffect(() => {
    (async () => {
      if (!storageAvailable()) { setSaveState('unavailable'); setReady(true); return; }
      try {
        requestPersist();
        const id = live.current.projectId;
        const rec = await getRecord(id);
        if (rec) setProject(fresh(rec.project)); else await putProject(id, live.current.project);
        const dem = await loadTerrain(id);
        if (dem) { lastDem.current = dem; setRtState((r) => ({ ...r, dem, demAuto: dem.auto !== false, terrainStatus: `Terrain ✓ (saved with project)` })); }
        lastVersion.current = Date.now();
        setSaveState('saved');
      } catch (e) { setSaveState('error'); setSaveError(String((e as Error)?.message ?? e)); }
      setReady(true); setLibVersion((v) => v + 1);
    })();
  }, []);

  // Autosave: quick browser copy + the built-in library (+ a history version every 10 minutes of editing).
  const t = useRef<number>();
  useEffect(() => {
    clearTimeout(t.current);
    t.current = window.setTimeout(async () => {
      try { localStorage.setItem(KEY, JSON.stringify(project)); } catch { /* quota: the library still has it */ }
      if (!ready || saveState === 'unavailable') return;
      setSaveState('saving');
      try {
        await putProject(projectId, project);
        if (Date.now() - lastVersion.current > VERSION_EVERY_MS) { lastVersion.current = Date.now(); await addVersion(projectId, project, 'Autosave'); }
        setSaveState('saved'); setSaveError('');
        mirrorToFolder(projectId, project);
      } catch (e) { setSaveState('error'); setSaveError(String((e as Error)?.message ?? e)); }
    }, 400);
  }, [project, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Equipment added to the project goes into the specifications library automatically.
  const eqT = useRef<number>();
  useEffect(() => {
    if (!ready || saveState === 'unavailable') return;
    clearTimeout(eqT.current); eqT.current = window.setTimeout(() => { autoLoadEquipment(project); }, 2500);
  }, [project, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the downloaded / imported terrain with the project so it is there next time without internet.
  useEffect(() => {
    if (!ready || saveState === 'unavailable' || rt.dem === lastDem.current) return;
    lastDem.current = rt.dem;
    if (rt.dem) saveTerrain(projectId, rt.dem, !!rt.demAuto).catch(() => undefined);
  }, [rt.dem, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Make library equipment used by this project available to the calculations.
  useMemo(() => registerCustom(project.customCatalog), [project.customCatalog]);

  // Stamp per-section change times for device-to-device sync (debounced).
  const st = useRef<number>();
  useEffect(() => {
    clearTimeout(st.current);
    st.current = window.setTimeout(() => setProject((p) => { const m = stampSync(p, deviceInfo()); return m ? { ...p, sync: m } : p; }), 800);
  }, [project]);
  useEffect(() => { const h = () => setPage(location.hash.slice(1) || 'company'); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);

  const lib = useMemo<Library>(() => {
    const flush = async () => { const c = live.current; try { await putProject(c.projectId, c.project); } catch { /* ignore */ } };
    const switchTo = async (id: string, p: Project) => {
      const dem = await loadTerrain(id);
      lastDem.current = dem; lastVersion.current = Date.now();
      setCurrentIdLS(id); setProjectId(id); setProject(fresh(p));
      setRtState({ dem, demAuto: dem ? dem.auto !== false : false, profile: null, coverage: null, terrainStatus: dem ? 'Terrain ✓ (saved with project)' : undefined });
      setLibVersion((v) => v + 1);
    };
    const api: Library = {
      projectId, saveState, saveError, libVersion,
      bump: () => setLibVersion((v) => v + 1),
      saveNow: async (reason = 'Saved by user') => { const c = live.current; await putProject(c.projectId, c.project); await addVersion(c.projectId, c.project, reason); lastVersion.current = Date.now(); setSaveState('saved'); setLibVersion((v) => v + 1); },
      openProject: async (id) => { if (id === live.current.projectId) return; await flush(); const r = await getRecord(id); if (!r) throw new Error('Project not found'); await switchTo(id, r.project); },
      newProject: async (p, name, terrainFrom) => {
        await flush();
        const np = fresh(p ? structuredClone(p) : defaultProject()); delete np.sync;
        applyCompanyDefault(np, await loadCompanyDefault().catch(() => undefined));
        if (name) np.meta.name = name;
        const id = newId(); await putProject(id, np);
        if (terrainFrom) { const d = await loadTerrain(terrainFrom); if (d) await saveTerrain(id, d); }
        await switchTo(id, np); return id;
      },
      importProjects: async (entries) => { const ids = await importEntries(entries); setLibVersion((v) => v + 1); return ids; },
      restoreVersion: async (vid) => {
        const v = await getVersion(vid); if (!v) throw new Error('Version not found');
        const c = live.current; await addVersion(c.projectId, c.project, 'Before restoring an earlier version');
        setProject(fresh(v.project)); setLibVersion((x) => x + 1);
      },
      removeProject: async (id) => {
        if (id === live.current.projectId) {
          // Deleting the open project: switch to the most recently saved other project, or a new blank one.
          const others = (await listProjects()).filter((x) => x.id !== id);
          if (others.length) await api.openProject(others[0].id); else await api.newProject(undefined, 'New project');
        }
        await deleteProject(id); setLibVersion((v) => v + 1);
      },
    };
    return api;
  }, [projectId, saveState, saveError, libVersion]);

  const v = useMemo<Ctx>(() => ({
    project,
    update: (fn) => setProject((p) => { const d = structuredClone(p); fn(d); return d; }),
    replace: (p) => setProject(fresh(p)),
    rt, setRt: (fn) => setRtState(fn),
    page, go: (pg) => { location.hash = pg; setPage(pg); window.scrollTo(0, 0); },
    lib,
  }), [project, rt, page, lib]);
  return <C.Provider value={v}>{children}</C.Provider>;
}

/** If the user chose a data folder (e.g. on the USB drive), keep a copy of each saved project there. */
let mirrorTimer = 0;
function mirrorToFolder(id: string, p: Project) {
  if (!folderCopySupported()) return;
  clearTimeout(mirrorTimer);
  mirrorTimer = window.setTimeout(async () => {
    try { const h = await savedDataFolder(); if (h && (await folderAllowed(h, false))) await writeToFolder(h, id, p); } catch { /* folder unplugged or permission lost */ }
  }, 2500);
}
export const useStore = () => { const c = useContext(C); if (!c) throw new Error('no store'); return c; };

/** Native bridge provided by the Android app (file save dialog and share sheet). */
interface AndroidBridge { saveFile(name: string, mime: string, b64: string): void; shareFile?(name: string, mime: string, b64: string, text: string): void }
export const androidBridge = (): AndroidBridge | null => (typeof window !== 'undefined' && (window as unknown as { RadioPlanAndroid?: AndroidBridge }).RadioPlanAndroid) || null;
export async function blobToB64(b: Blob): Promise<string> {
  const u = new Uint8Array(await b.arrayBuffer()); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function saveBlob(name: string, blob: Blob) {
  const a = androidBridge();
  if (a) { blobToB64(blob).then((b64) => a.saveFile(name, blob.type || 'application/octet-stream', b64)); return; }
  const el = document.createElement('a');
  el.href = URL.createObjectURL(blob);
  el.download = name; el.click();
  setTimeout(() => URL.revokeObjectURL(el.href), 2000);
}
export function downloadText(name: string, text: string, type = 'text/plain') { saveBlob(name, new Blob([text], { type })); }
export function downloadBytes(name: string, data: Uint8Array | Blob, type = 'application/octet-stream') { saveBlob(name, data instanceof Blob ? data : new Blob([data], { type })); }
export const safeName = (s: string) => (s || 'radioplan').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'radioplan';

/** This device's identity for sync (stored per browser / install). */
export function deviceInfo(): { id: string; name: string } {
  try {
    const raw = localStorage.getItem('radioplan.device'); if (raw) return JSON.parse(raw);
    const ua = navigator.userAgent;
    const kind = /Android/i.test(ua) ? (/Mobile/i.test(ua) ? 'Android phone' : 'Android tablet') : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows PC' : /Mac/i.test(ua) ? 'Mac' : 'Computer';
    const d = { id: Math.random().toString(36).slice(2, 10), name: kind };
    localStorage.setItem('radioplan.device', JSON.stringify(d)); return d;
  } catch { return { id: 'local', name: 'This device' }; }
}
export function setDeviceName(name: string) { const d = deviceInfo(); try { localStorage.setItem('radioplan.device', JSON.stringify({ ...d, name })); } catch { /* ignore */ } }
