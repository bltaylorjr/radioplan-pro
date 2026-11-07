import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './types';
import { defaultProject } from './defaults';
import type { DemGrid, ProfileAnalysis } from './engine/terrain';
import type { CoverageResult } from './engine/coverage';

const KEY = 'radioplan.project.v1';

/** Runtime-only (not saved in the project file): large terrain grids and computed results. */
export interface Runtime { dem: DemGrid | null; profile: ProfileAnalysis | null; coverage: CoverageResult | null }

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
