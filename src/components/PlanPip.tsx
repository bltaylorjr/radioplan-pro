import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { PlanSheet2D, Plan3D, useSystemOverlay, LayerBoxes } from './PlanViews';
import { fmtFtIn } from '../engine/floorplan';
import { feetOf } from './PlanViews';
import { buildModel } from '../engine/models';
import { LayeredModel } from './LayeredModel';

function FallbackModel({ view }: { view: '2d' | '3d' }) { const { project: p } = useStore(); const scene = React.useMemo(() => { try { return buildModel(p); } catch { return null; } }, [p]); return scene ? <LayeredModel scene={scene} northDeg={p.blueprint?.planNorthDeg ?? 0} title="Building model" initialView={view} /> : <p>Describe the building on Auto-Design to see a model.</p>; }

// Picture in picture: a small always-on-top window with the live floor plan, so it can be watched while
// information is entered on any page. It is the same app (not a copy), so every change shows at once.
// Uses the browser's Document Picture-in-Picture window (Chrome / Edge 116+); elsewhere it is a floating
// panel inside the app that can be dragged and resized.

export type LiveMode = 'pip' | 'popout';
let state: { open: boolean; planId: string; view: '2d' | '3d'; mode: LiveMode; n: number } = { open: false, planId: '', view: '2d', mode: 'pip', n: 0 }; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export function openPlanPip(planId = '', o: { view?: '2d' | '3d'; mode?: LiveMode } = {}) { state = { open: true, planId, view: o.view ?? '2d', mode: o.mode ?? 'pip', n: state.n + 1 }; emit(); }
export function closePlanPip() { state = { ...state, open: false }; emit(); }
const usePip = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
export const pipSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

interface DocPip { requestWindow(o: { width: number; height: number }): Promise<Window> }

/** Button that opens the live plan window. */
export function PipButton({ planId }: { planId?: string; disabled?: boolean }) { return <LiveViewButton planId={planId} />; }

/** Header button: pick a 2D or 3D model, then show it in picture in picture or a pop-out window that updates live. */
export function LiveViewButton({ planId }: { planId?: string }) {
  const [open, setOpen] = useState(false), [view, setView] = useState<'2d' | '3d'>('2d');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); window.addEventListener('mousedown', off); window.addEventListener('keydown', esc); return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); }; }, [open]);
  const go = (mode: LiveMode) => { openPlanPip(planId ?? '', { view, mode }); setOpen(false); };
  return (
    <div className="live-btn" ref={box}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title="View the design live in 2D or 3D while you work: picture in picture or a pop-out window">⧉ Live view ▾</button>
      {open && <div className="live-menu" role="menu">
        <div className="small muted">Model</div>
        <div className="seg" role="radiogroup" aria-label="Model"><button role="radio" aria-checked={view === '2d'} className={view === '2d' ? 'primary' : ''} onClick={() => setView('2d')}>2D plan</button><button role="radio" aria-checked={view === '3d'} className={view === '3d' ? 'primary' : ''} onClick={() => setView('3d')}>3D model</button></div>
        <div className="small muted">Show it in</div>
        <button role="menuitem" onClick={() => go('pip')}>⧉ Picture in picture{pipSupported() ? '' : ' (floating panel)'}</button>
        <button role="menuitem" onClick={() => go('popout')}>↗ Pop-out window</button>
        <p className="small muted">Stays open while you fill in other pages and changes as you type.</p>
      </div>}
    </div>
  );
}

function LivePlan({ planId, onClose, inPip, initView = '2d' }: { planId: string; onClose: () => void; inPip: boolean; initView?: '2d' | '3d' }) {
  const { project: p, update } = useStore();
  const plans = p.floorPlans ?? [];
  const [id, setId] = useState(planId);
  const plan = plans.find((x) => x.id === id) ?? plans.find((x) => x.integrated) ?? plans[0] ?? null;
  const scene = useSystemOverlay(p, plan);
  const [view, setView] = useState<'2d' | '3d'>(initView);
  const [layers, setLayers] = useState(false);
  const [flash, setFlash] = useState(false);
  const sig = JSON.stringify([p.meta.name, p.autoDesign, p.buildingMaterials, p.meta.projectType, p.meta.subSystems, plan?.walls.length, plan?.rooms.map((r) => r.name + r.number), plan?.scale.ftPerPx, plan?.off, plan?.ceilingFt]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setFlash(true); const t = setTimeout(() => setFlash(false), 900); return () => clearTimeout(t); }, [sig]);
  if (!plan) return <div className="pip-body"><div className="pip-bar"><b className="pip-title">{p.meta.name || 'Project'}</b><span className="live-dot on">● LIVE</span>{!inPip && <button onClick={onClose} aria-label="Close">✕</button>}</div>
    <div className="pip-view"><FallbackModel view={initView} /></div><div className="pip-foot small">Building model from Auto-Design. Add a floor plan on Floor Plan to 2D / 3D for the real walls and rooms.</div></div>;
  const f = feetOf(plan);
  const setOff = (off: string[]) => update((d) => { const x = d.floorPlans?.find((y) => y.id === plan.id); if (x) x.off = off; });
  return (
    <div className={'pip-body' + (flash ? ' flash' : '')}>
      <div className="pip-bar">
        <b className="pip-title">{p.meta.name || 'Project'}</b>
        {plans.length > 1 && <select value={plan.id} onChange={(e) => setId(e.target.value)} aria-label="Floor">{plans.map((x) => <option key={x.id} value={x.id}>{x.level || x.name}</option>)}</select>}
        <span className="seg"><button className={view === '2d' ? 'primary' : ''} onClick={() => setView('2d')}>2D</button><button className={view === '3d' ? 'primary' : ''} onClick={() => setView('3d')}>3D</button></span>
        <button onClick={() => setLayers(!layers)} title="Layers">🗂</button>
        <span className={'live-dot' + (flash ? ' on' : '')} title="Updates live as you type">● LIVE</span>
        {!inPip && <button onClick={onClose} aria-label="Close">✕</button>}
      </div>
      {layers && <LayerBoxes plan={plan} scene={scene} off={plan.off ?? []} setOff={setOff} compact />}
      <div className="pip-view">{view === '2d' ? <PlanSheet2D plan={plan} scene={scene} off={plan.off ?? []} title={plan.level} maxHeight={2000} /> : <Plan3D plan={plan} scene={scene} off={plan.off ?? []} height={260} />}</div>
      <div className="pip-foot small">{plan.scale.ftPerPx ? `${fmtFtIn(f.L)} × ${fmtFtIn(f.W)} · ${f.rooms.length} rooms · ${Math.round(f.netSf).toLocaleString()} SF` : 'Scale not set'}{scene ? ` · ${scene.devices.filter((d) => d.floor === plan.floor).length} devices` : ''}{plan.integrated ? ' · in project' : ' · not in project yet'}</div>
    </div>
  );
}

/** Mounted once in the app: shows the live plan window when it is open, whatever page is showing. */
export function PlanPipHost() {
  const s = usePip();
  const [win, setWin] = useState<Window | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!s.open || s.mode !== 'pip' || !pipSupported() || failed) return;
    let w: Window | null = null, live = true;
    (window as unknown as { documentPictureInPicture: DocPip }).documentPictureInPicture.requestWindow({ width: 460, height: 420 }).then((pw) => {
      if (!live) { pw.close(); return; }
      w = pw;
      for (const sh of Array.from(document.styleSheets)) {
        try { const st = pw.document.createElement('style'); st.textContent = Array.from(sh.cssRules).map((r) => r.cssText).join('\n'); pw.document.head.appendChild(st); }
        catch { if (sh.href) { const l = pw.document.createElement('link'); l.rel = 'stylesheet'; l.href = sh.href; pw.document.head.appendChild(l); } }
      }
      pw.document.title = 'LvPlan Pro: live floor plan';
      pw.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? '';
      pw.document.body.className = 'pip-doc';
      pw.addEventListener('pagehide', () => { closePlanPip(); setWin(null); });
      setWin(pw);
    }).catch(() => { setWin(null); setFailed(true); });
    return () => { live = false; w?.close(); setWin(null); };
  }, [s.open, s.n, failed]); // eslint-disable-line react-hooks/exhaustive-deps
  // pop-out window
  const [pop, setPop] = useState<Window | null>(null);
  useEffect(() => {
    if (!s.open || s.mode !== 'popout') return;
    const pw = window.open('', 'lvplan-live-design', 'popup,width=980,height=760'); if (!pw) { setFailed(true); return; }
    pw.document.title = 'LvPlan Pro: live design'; pw.document.head.innerHTML = ''; pw.document.body.innerHTML = '';
    for (const sh of Array.from(document.styleSheets)) { try { const st = pw.document.createElement('style'); st.textContent = Array.from(sh.cssRules).map((r) => r.cssText).join('\n'); pw.document.head.appendChild(st); } catch { if (sh.href) { const l = pw.document.createElement('link'); l.rel = 'stylesheet'; l.href = sh.href; pw.document.head.appendChild(l); } } }
    pw.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? ''; pw.document.body.className = 'pip-doc popout-doc';
    const gone = () => { closePlanPip(); setPop(null); }; pw.addEventListener('pagehide', gone); pw.focus(); setPop(pw);
    return () => { pw.removeEventListener('pagehide', gone); setPop(null); };
  }, [s.open, s.mode, s.n]);
  if (!s.open) return null;
  if (s.mode === 'popout' && pop) return createPortal(<LivePlan key={s.n} planId={s.planId} initView={s.view} onClose={() => { pop.close(); closePlanPip(); }} inPip />, pop.document.body);
  if (s.mode === 'popout' && !failed) return null;
  if (pipSupported() && !failed) return win ? createPortal(<LivePlan key={s.n} planId={s.planId} initView={s.view} onClose={() => { win.close(); closePlanPip(); }} inPip />, win.document.body) : null;
  // floating panel
  const drag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    const sx = e.clientX - pos.x, sy = e.clientY - pos.y; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => setPos({ x: ev.clientX - sx, y: ev.clientY - sy });
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  return <div className="pip-float no-print" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} onPointerDown={drag} role="dialog" aria-label="Live floor plan"><LivePlan key={s.n} planId={s.planId} initView={s.view} onClose={closePlanPip} inPip={false} /></div>;
}
