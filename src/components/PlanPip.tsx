import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { PlanSheet2D, Plan3D, useSystemOverlay, LayerBoxes } from './PlanViews';
import { fmtFtIn } from '../engine/floorplan';
import { feetOf } from './PlanViews';

// Picture in picture: a small always-on-top window with the live floor plan, so it can be watched while
// information is entered on any page. It is the same app (not a copy), so every change shows at once.
// Uses the browser's Document Picture-in-Picture window (Chrome / Edge 116+); elsewhere it is a floating
// panel inside the app that can be dragged and resized.

let state = { open: false, planId: '' }; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export function openPlanPip(planId = '') { state = { open: true, planId }; emit(); }
export function closePlanPip() { state = { ...state, open: false }; emit(); }
const usePip = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
export const pipSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

interface DocPip { requestWindow(o: { width: number; height: number }): Promise<Window> }

/** Button that opens the live plan window. */
export function PipButton({ planId, disabled }: { planId?: string; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={() => openPlanPip(planId)} title={pipSupported() ? 'Open the live floor plan in a small window that stays on top while you fill in other pages. Every change shows right away.' : 'Open the live floor plan in a floating panel that stays on screen while you fill in other pages.'}>⧉ Picture in picture</button>;
}

function LivePlan({ planId, onClose, inPip }: { planId: string; onClose: () => void; inPip: boolean }) {
  const { project: p, update } = useStore();
  const plans = p.floorPlans ?? [];
  const [id, setId] = useState(planId);
  const plan = plans.find((x) => x.id === id) ?? plans.find((x) => x.integrated) ?? plans[0] ?? null;
  const scene = useSystemOverlay(p, plan);
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [layers, setLayers] = useState(false);
  const [flash, setFlash] = useState(false);
  const sig = JSON.stringify([p.meta.name, p.autoDesign, p.buildingMaterials, p.meta.projectType, p.meta.subSystems, plan?.walls.length, plan?.rooms.map((r) => r.name + r.number), plan?.scale.ftPerPx, plan?.off, plan?.ceilingFt]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setFlash(true); const t = setTimeout(() => setFlash(false), 900); return () => clearTimeout(t); }, [sig]);
  if (!plan) return <div className="pip-body"><p>No floor plan yet. Upload one on <b>Floor Plan to 2D / 3D</b>.</p><button onClick={onClose}>Close</button></div>;
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
    if (!s.open || !pipSupported() || failed) return;
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
  }, [s.open, failed]);
  if (!s.open) return null;
  if (pipSupported() && !failed) return win ? createPortal(<LivePlan planId={s.planId} onClose={() => { win.close(); closePlanPip(); }} inPip />, win.document.body) : null;
  // floating panel
  const drag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    const sx = e.clientX - pos.x, sy = e.clientY - pos.y; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => setPos({ x: ev.clientX - sx, y: ev.clientY - sy });
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  return <div className="pip-float no-print" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} onPointerDown={drag} role="dialog" aria-label="Live floor plan"><LivePlan planId={s.planId} onClose={closePlanPip} inPip={false} /></div>;
}
