import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './types';
import { defaultProject } from './defaults';
import type { DemGrid, ProfileAnalysis } from './engine/terrain';
import type { CoverageResult } from './engine/coverage';
import { stampSync } from './engine/sync';

const KEY = 'radioplan.project.v1';

/** Runtime-only (not saved in the project file): large terrain grids and computed results. */
export interface LocateTarget { lat: number; lon: number; label: string; state?: string; county?: string }
export interface Runtime {
  dem: DemGrid | null; demAuto?: boolean; profile: ProfileAnalysis | null; coverage: CoverageResult | null;
  terrainStatus?: string; locate?: LocateTarget | null; query?: string;
}

interface Ctx {
  project: Project; update: (fn: (d: Project) => void) => void; replace: (p: Project) => void;
  rt: Runtime; setRt: (fn: (r: Runtime) => Runtime) => void;
  page: string; go: (page: string) => void;
}
const C = createContext<Ctx | null>(null);

function load(): Project {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...defaultProject(), ...JSON.parse(s) };
  } catch { /* storage unavailable */ }
  return defaultProject();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<Project>(load);
  const [rt, setRtState] = useState<Runtime>({ dem: null, profile: null, coverage: null });
  const [page, setPage] = useState(() => (location.hash.slice(1) || 'company'));
  const t = useRef<number>();
  useEffect(() => {
    clearTimeout(t.current);
    t.current = window.setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(project)); } catch { /* quota */ } }, 300);
  }, [project]);
  // Stamp per-section change times for device-to-device sync (debounced).
  const st = useRef<number>();
  useEffect(() => {
    clearTimeout(st.current);
    st.current = window.setTimeout(() => setProject((p) => { const m = stampSync(p, deviceInfo()); return m ? { ...p, sync: m } : p; }), 800);
  }, [project]);
  useEffect(() => { const h = () => setPage(location.hash.slice(1) || 'company'); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const v = useMemo<Ctx>(() => ({
    project,
    update: (fn) => setProject((p) => { const d = structuredClone(p); fn(d); return d; }),
    replace: (p) => setProject({ ...defaultProject(), ...p }),
    rt, setRt: (fn) => setRtState(fn),
    page, go: (pg) => { location.hash = pg; setPage(pg); window.scrollTo(0, 0); },
  }), [project, rt, page]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
export const useStore = () => { const c = useContext(C); if (!c) throw new Error('no store'); return c; };

export function downloadText(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadBytes(name: string, data: Uint8Array | Blob, type = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
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
