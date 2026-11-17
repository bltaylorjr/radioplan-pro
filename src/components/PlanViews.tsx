import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FullView } from './FullView';
import { ViewPad, orbitApi } from './ViewControls';
import { fmtFtIn, planInFeet, schedules, PLAN_LAYERS, type FloorPlanImport, type PlanFt } from '../engine/floorplan';
import { buildModel, layerGroups, deviceHeight, type ModelScene } from '../engine/models';
import type { Project } from '../types';

/** Feet per pixel to draw with: the plan's scale, or a stand-in (drawing marked NOT TO SCALE). */
const kOf = (p: FloorPlanImport) => p.scale.ftPerPx ?? 1 / 20;
export const feetOf = (p: FloorPlanImport): PlanFt => planInFeet({ ...p, scale: { ...p.scale, ftPerPx: kOf(p) } });

/** Systems drawn on the plan (from the 2D & 3D model), when the plan is in the project. */
export function useSystemOverlay(p: Project, plan: FloorPlanImport | null): ModelScene | null {
  return useMemo(() => { if (!plan?.integrated || !plan.scale.ftPerPx) return null; try { return buildModel(p); } catch { return null; } }, [p, plan?.integrated, plan?.scale.ftPerPx]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Layer ids for the systems in a scene ("firealarm:dev"…), grouped for the tick boxes. */
export const systemGroups = (s: ModelScene | null) => (s ? layerGroups(s).filter((g) => g.id !== 'base' && g.layers.some((l) => !l.id.endsWith(':heat'))) : []);

/** Tick boxes: building layers and each technology system's layers. */
export function LayerBoxes({ plan, scene, off, setOff, compact }: { plan: FloorPlanImport; scene: ModelScene | null; off: string[]; setOff: (v: string[]) => void; compact?: boolean }) {
  const has = (id: string) => !off.includes(id), set = (id: string, on: boolean) => setOff(on ? off.filter((x) => x !== id) : [...off, id]);
  const groups = systemGroups(scene);
  const all = (ids: string[], on: boolean) => setOff(on ? off.filter((x) => !ids.includes(x)) : [...new Set([...off, ...ids])]);
  return (
    <div className={'plan-layers' + (compact ? ' compact' : '')}>
      <fieldset><legend>Building <button type="button" className="ghost small" onClick={() => all(PLAN_LAYERS.map((l) => l.id), true)}>All</button><button type="button" className="ghost small" onClick={() => all(PLAN_LAYERS.map((l) => l.id), false)}>None</button></legend>
        {PLAN_LAYERS.filter((l) => l.id !== 'underlay' || plan.preview).map((l) => <label key={l.id} className="check" title={`${l.tip} CAD layer ${l.aia}.`}><input type="checkbox" checked={has(l.id)} onChange={(e) => set(l.id, e.target.checked)} /> {l.label}</label>)}
      </fieldset>
      {groups.map((g) => {
        const ids = g.layers.filter((l) => !l.id.endsWith(':heat')).map((l) => l.id);
        const allOn = ids.every(has);
        return (
          <fieldset key={g.id}><legend><label className="check"><input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = !allOn && ids.some(has); }} onChange={(e) => all(ids, e.target.checked)} /> <span className="swatch" style={{ background: g.color }} /> {g.label}</label></legend>
            {g.layers.filter((l) => !l.id.endsWith(':heat')).map((l) => <label key={l.id} className="check" title={l.tip}><input type="checkbox" checked={has(l.id)} onChange={(e) => set(l.id, e.target.checked)} /> {l.label}</label>)}
          </fieldset>);
      })}
      {!groups.length && <p className="small muted">{plan.integrated ? 'Pick the project systems (Project Systems & Toolkits) to see their devices and cabling here.' : 'Technology system layers (fire alarm, cabling, Wi-Fi, security, DAS…) appear once the plan is in the project plan and build.'}</p>}
    </div>
  );
}

export interface PlanPick { type: 'wall' | 'opening' | 'room'; id: string }

/** True-scale 2D floor plan drawn like an architectural sheet: poché walls, door swings, glazing, room tags, dimensions, north arrow and graphic scale. */
export function PlanSheet2D({ plan, scene, off = [], pick, onPick, onPoint, marks, title, maxHeight = 640, northDeg = 0, toScale }: {
  plan: FloorPlanImport; scene?: ModelScene | null; off?: string[]; pick?: PlanPick | null; onPick?: (p: PlanPick | null) => void;
  onPoint?: (xPx: number, yPx: number) => void; marks?: [number, number][]; title?: string; maxHeight?: number; northDeg?: number;
  /** Size the drawing in paper inches at the plan's drawing scale (printing and export at true scale). */
  toScale?: boolean;
}) {
  const f = feetOf(plan), k = kOf(plan), on = (id: string) => !off.includes(id);
  const span = Math.max(f.L, f.W, 10), fs = Math.max(0.55, span / 52), pad = fs * 9;
  const x0 = -pad, y0 = -pad, w = f.L + pad * 2, h = f.W + pad * 2.6;
  const svg = useRef<SVGSVGElement>(null);
  if (!plan.walls.length) return <div className="plan-empty">{plan.preview ? <img src={plan.preview} alt="Uploaded sheet" style={{ maxWidth: '100%', maxHeight, opacity: 0.8 }} /> : null}<p className="small muted">No walls could be traced from this file, so there is no plan to draw yet.</p></div>;
  const toFt = (e: React.MouseEvent) => { const s = svg.current; if (!s) return null; const pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = s.getScreenCTM(); if (!m) return null; const q = pt.matrixTransform(m.inverse()); return [q.x, q.y] as [number, number]; };
  const floorOf = plan.floor;
  const sysOn = (layer: string) => on(layer);
  const bar = [5, 10, 20, 50, 100].find((b) => b >= span / 6) ?? 100;
  const isH = (a: { x1: number; x2: number; y1: number; y2: number }) => Math.abs(a.y2 - a.y1) < Math.abs(a.x2 - a.x1);
  const ds = plan.scale.ftPerPx ? plan.drawScale : null, paperIn = ds ? { w: w / ds.ftPerIn, h: h / ds.ftPerIn } : null;
  const scaleText = !plan.scale.ftPerPx ? 'NOT TO SCALE — SCALE NOT SET' : ds ? `SCALE: ${ds.label}` : plan.scale.from === 'notation' ? `SCALE: ${/Scale (.+?) read/.exec(plan.scale.note)?.[1] ?? 'AS NOTED'}` : 'SCALE: GRAPHIC (SEE BAR)';
  const ul = plan.preview && on('underlay') ? { x: -f.ox * k, y: -f.oy * k, w: plan.w * k, h: plan.h * k } : null;
  return (
    <svg ref={svg} className="plan-sheet" viewBox={`${x0} ${y0} ${w} ${h}`} role="img" aria-label={title ?? 'Floor plan'} style={toScale && paperIn ? undefined : { maxHeight }}
      {...(toScale && paperIn ? { width: `${paperIn.w.toFixed(3)}in`, height: `${paperIn.h.toFixed(3)}in` } : {})}
      onClick={(e) => { if (onPoint) { const q = toFt(e); if (q) onPoint(q[0] / k + f.ox, q[1] / k + f.oy); } else onPick?.(null); }}>
      <rect x={x0} y={y0} width={w} height={h} fill="#fff" />
      {ul && <image href={plan.preview} x={ul.x} y={ul.y} width={ul.w} height={ul.h} opacity={0.35} preserveAspectRatio="none" />}
      {/* walls: solid poché (exterior black, partitions dark grey) */}
      {f.walls.filter((wl) => on(wl.exterior ? 'wall-ext' : 'wall-int')).map((wl) => {
        const t = wl.thickFt / 2, hz = isH(wl), sel = pick?.type === 'wall' && pick.id === wl.id;
        const r = hz ? { x: Math.min(wl.x1, wl.x2) - (wl.exterior ? t : 0), y: wl.y1 - t, width: Math.abs(wl.x2 - wl.x1) + (wl.exterior ? 2 * t : 0), height: 2 * t } : { x: wl.x1 - t, y: Math.min(wl.y1, wl.y2) - (wl.exterior ? t : 0), width: 2 * t, height: Math.abs(wl.y2 - wl.y1) + (wl.exterior ? 2 * t : 0) };
        return <rect key={wl.id} {...r} fill={sel ? '#d32f2f' : wl.exterior ? '#111' : '#424242'} onClick={onPick ? (e) => { e.stopPropagation(); onPick({ type: 'wall', id: wl.id }); } : undefined} style={onPick ? { cursor: 'pointer' } : undefined}><title>{wl.exterior ? 'Exterior wall' : 'Interior wall'} {fmtFtIn(wl.lenFt)} long, {fmtFtIn(wl.thickFt)} thick</title></rect>;
      })}
      {/* openings */}
      {f.openings.map((o, i) => {
        if (!on(o.kind === 'door' ? 'doors' : 'windows')) return null;
        const hz = isH(o), sel = pick?.type === 'opening' && pick.id === o.id, col = sel ? '#d32f2f' : '#111', sw = Math.max(0.05, fs / 12), t = o.thick / 2;
        const doorNo = f.openings.filter((x, j) => x.kind === o.kind && j < i).length;
        const mark = o.kind === 'door' ? `${(plan.level.match(/\d+/)?.[0] ?? String(plan.floor + 1))}${String(doorNo + 1).padStart(2, '0')}` : String.fromCharCode(65 + (doorNo % 26));
        const cx = (o.x1 + o.x2) / 2, cy = (o.y1 + o.y2) / 2;
        const click = onPick ? (e: React.MouseEvent) => { e.stopPropagation(); onPick({ type: 'opening', id: o.id }); } : undefined;
        if (o.kind === 'window') {
          return <g key={o.id} onClick={click} style={onPick ? { cursor: 'pointer' } : undefined}><title>Window {mark}: {fmtFtIn(o.widthFt)}</title>
            {hz ? <><rect x={o.x1} y={o.y1 - t} width={o.x2 - o.x1} height={2 * t} fill="#fff" stroke={col} strokeWidth={sw} /><line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke={col} strokeWidth={sw} /></>
              : <><rect x={o.x1 - t} y={o.y1} width={2 * t} height={o.y2 - o.y1} fill="#fff" stroke={col} strokeWidth={sw} /><line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke={col} strokeWidth={sw} /></>}
            {on('rooms') && <g transform={`translate(${hz ? cx : cx + fs * 2.2} ${hz ? cy + fs * 2.2 * (o.exterior && cy > f.W / 2 ? 1 : -1) : cy})`}><polygon points={`0,${-fs * 0.9} ${fs * 0.9},0 0,${fs * 0.9} ${-fs * 0.9},0`} fill="#fff" stroke="#111" strokeWidth={sw} /><text y={fs * 0.35} fontSize={fs * 0.95} textAnchor="middle" fill="#111">{mark}</text></g>}
          </g>;
        }
        // door: leaf drawn open 90° from the hinge jamb with its swing arc
        const wd = o.widthFt, hx = o.x1, hy = o.y1, dir = 1;
        const leaf = hz ? [hx, hy, hx, hy - wd * dir] : [hx, hy, hx + wd * dir, hy];
        const arc = hz ? `M ${hx} ${hy - wd * dir} A ${wd} ${wd} 0 0 1 ${o.x2} ${o.y2}` : `M ${hx + wd * dir} ${hy} A ${wd} ${wd} 0 0 1 ${o.x2} ${o.y2}`;
        return <g key={o.id} onClick={click} style={onPick ? { cursor: 'pointer' } : undefined}><title>Door {mark}: {fmtFtIn(wd)} {o.exterior ? 'exterior' : 'interior'}</title>
          <line x1={leaf[0]} y1={leaf[1]} x2={leaf[2]} y2={leaf[3]} stroke={col} strokeWidth={sw * 2} /><path d={arc} fill="none" stroke={col} strokeWidth={sw} strokeDasharray={`${fs / 3} ${fs / 5}`} />
          {hz ? <><line x1={o.x1} y1={o.y1 - t} x2={o.x1} y2={o.y1 + t} stroke={col} strokeWidth={sw} /><line x1={o.x2} y1={o.y2 - t} x2={o.x2} y2={o.y2 + t} stroke={col} strokeWidth={sw} /></> : <><line x1={o.x1 - t} y1={o.y1} x2={o.x1 + t} y2={o.y1} stroke={col} strokeWidth={sw} /><line x1={o.x2 - t} y1={o.y2} x2={o.x2 + t} y2={o.y2} stroke={col} strokeWidth={sw} /></>}
          {on('rooms') && <g transform={`translate(${hz ? cx : cx - fs * 1.8} ${hz ? cy + fs * 1.8 : cy})`}><circle r={fs * 0.95} fill="#fff" stroke="#111" strokeWidth={sw} /><text y={fs * 0.32} fontSize={fs * 0.85} textAnchor="middle" fill="#111">{mark}</text></g>}
        </g>;
      })}
      {/* systems from the project (devices, coverage, cabling) */}
      {scene && <g className="plan-systems">
        {scene.areas.filter((a) => a.floor === floorOf && sysOn(a.layer) && a.shape === 'circle').map((a, i) => <circle key={'a' + i} cx={a.x} cy={a.y} r={a.r} fill={a.color} fillOpacity={0.07} stroke={a.color} strokeOpacity={0.5} strokeWidth={fs / 14}><title>{a.label}</title></circle>)}
        {scene.paths.filter((pa) => sysOn(pa.layer)).map((pa, i) => { const pts = pa.pts.filter((q) => q[2] === floorOf); return pts.length > 1 ? <polyline key={'p' + i} points={pts.map((q) => `${q[0]},${q[1]}`).join(' ')} fill="none" stroke={pa.color} strokeWidth={fs / 8} strokeDasharray={pa.dash ? `${fs / 2} ${fs / 3}` : undefined} opacity={0.85}><title>{pa.label}</title></polyline> : null; })}
        {scene.devices.filter((d) => d.floor === floorOf && sysOn(d.layer)).map((d, i) => <g key={'d' + i}><circle cx={d.x} cy={d.y} r={fs * 0.55} fill={scene.layers.find((l) => l.id === d.layer)?.color ?? '#555'} stroke="#000" strokeWidth={fs / 20}><title>{d.tag}: {d.label}</title></circle>{on('rooms') && span < 160 && <text x={d.x + fs * 0.8} y={d.y + fs * 0.3} fontSize={fs * 0.7} fill="#333">{d.tag}</text>}</g>)}
      </g>}
      {/* room tags */}
      {on('rooms') && f.rooms.map((r) => { const sel = pick?.type === 'room' && pick.id === r.id;
        return <g key={r.id} transform={`translate(${r.x} ${r.y})`} onClick={onPick ? (e) => { e.stopPropagation(); onPick({ type: 'room', id: r.id }); } : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
          <text y={-fs * 0.5} fontSize={fs * 1.05} fontWeight={700} textAnchor="middle" fill={sel ? '#d32f2f' : '#111'}>{r.name}</text>
          <rect x={-fs * 1.6} y={-fs * 0.1} width={fs * 3.2} height={fs * 1.25} fill="#fff" stroke="#111" strokeWidth={fs / 16} />
          <text y={fs * 0.85} fontSize={fs * 0.9} textAnchor="middle" fill="#111">{r.number}</text>
          {plan.scale.ftPerPx && <text y={fs * 2.25} fontSize={fs * 0.8} textAnchor="middle" fill="#333">{Math.round(r.areaSf).toLocaleString()} SF</text>}
        </g>; })}
      {/* overall dimension strings */}
      {on('dims') && plan.scale.ftPerPx && <g stroke="#111" strokeWidth={fs / 18} fill="#111" fontSize={fs * 0.95}>
        <line x1={0} y1={-pad * 0.45} x2={f.L} y2={-pad * 0.45} /><line x1={0} y1={-pad * 0.62} x2={0} y2={-pad * 0.15} /><line x1={f.L} y1={-pad * 0.62} x2={f.L} y2={-pad * 0.15} />
        <line x1={-fs * 0.5} y1={-pad * 0.45 + fs * 0.5} x2={fs * 0.5} y2={-pad * 0.45 - fs * 0.5} /><line x1={f.L - fs * 0.5} y1={-pad * 0.45 + fs * 0.5} x2={f.L + fs * 0.5} y2={-pad * 0.45 - fs * 0.5} />
        <text x={f.L / 2} y={-pad * 0.45 - fs * 0.4} textAnchor="middle" stroke="none">{fmtFtIn(f.L)}</text>
        <line x1={-pad * 0.45} y1={0} x2={-pad * 0.45} y2={f.W} /><line x1={-pad * 0.62} y1={0} x2={-pad * 0.15} y2={0} /><line x1={-pad * 0.62} y1={f.W} x2={-pad * 0.15} y2={f.W} />
        <line x1={-pad * 0.45 - fs * 0.5} y1={fs * 0.5} x2={-pad * 0.45 + fs * 0.5} y2={-fs * 0.5} /><line x1={-pad * 0.45 - fs * 0.5} y1={f.W + fs * 0.5} x2={-pad * 0.45 + fs * 0.5} y2={f.W - fs * 0.5} />
        <text transform={`translate(${-pad * 0.45 - fs * 0.4} ${f.W / 2}) rotate(-90)`} textAnchor="middle" stroke="none">{fmtFtIn(f.W)}</text>
      </g>}
      {/* title, graphic scale and north arrow */}
      {on('annot') && <g>
        <g transform={`translate(0 ${f.W + pad * 0.9})`}>
          <circle cx={fs * 1.3} cy={0} r={fs * 1.3} fill="none" stroke="#111" strokeWidth={fs / 14} /><line x1={0} y1={0} x2={fs * 2.6} y2={0} stroke="#111" strokeWidth={fs / 14} />
          <text x={fs * 1.3} y={-fs * 0.25} fontSize={fs * 0.8} textAnchor="middle">1</text><text x={fs * 1.3} y={fs * 0.95} fontSize={fs * 0.62} textAnchor="middle">A-{101 + plan.floor}</text>
          <text x={fs * 3.3} y={fs * 0.1} fontSize={fs * 1.3} fontWeight={700}>{(title ?? plan.level ?? 'FLOOR PLAN').toUpperCase()}</text>
          <text x={fs * 3.3} y={fs * 1.3} fontSize={fs * 0.8}>{scaleText}</text>
        </g>
        {plan.scale.ftPerPx && <g transform={`translate(${f.L - bar} ${f.W + pad * 0.75})`} fontSize={fs * 0.7}>
          {[0, 1, 2, 3].map((i) => <rect key={i} x={(bar / 4) * i} y={0} width={bar / 4} height={fs * 0.45} fill={i % 2 ? '#fff' : '#111'} stroke="#111" strokeWidth={fs / 20} />)}
          {[0, bar / 4, bar / 2, bar].map((v) => <text key={v} x={v} y={fs * 1.4} textAnchor="middle">{v}'</text>)}
        </g>}
        <g transform={`translate(${f.L + pad * 0.55} ${f.W + pad * 0.75}) rotate(${-northDeg})`}><circle r={fs * 1.4} fill="none" stroke="#111" strokeWidth={fs / 14} /><polygon points={`0,${-fs * 1.3} ${fs * 0.55},${fs * 0.6} 0,${fs * 0.25} ${-fs * 0.55},${fs * 0.6}`} fill="#111" /><text y={-fs * 1.65} fontSize={fs * 0.9} textAnchor="middle" fontWeight={700}>N</text></g>
      </g>}
      {marks?.map(([x, y], i) => <g key={i}><circle cx={(x - f.ox) * k} cy={(y - f.oy) * k} r={fs * 0.6} fill="none" stroke="#d32f2f" strokeWidth={fs / 6} /><line x1={(x - f.ox) * k - fs} y1={(y - f.oy) * k} x2={(x - f.ox) * k + fs} y2={(y - f.oy) * k} stroke="#d32f2f" strokeWidth={fs / 10} /><line x1={(x - f.ox) * k} y1={(y - f.oy) * k - fs} x2={(x - f.ox) * k} y2={(y - f.oy) * k + fs} stroke="#d32f2f" strokeWidth={fs / 10} /></g>)}
      {marks?.length === 2 && <line x1={(marks[0][0] - f.ox) * k} y1={(marks[0][1] - f.oy) * k} x2={(marks[1][0] - f.ox) * k} y2={(marks[1][1] - f.oy) * k} stroke="#d32f2f" strokeWidth={fs / 8} strokeDasharray={`${fs / 2} ${fs / 3}`} />}
    </svg>
  );
}

/** 3D model of the plan: walls to their height with door and window heads, glazing, the floor slab, and the project's devices. */
export function Plan3D({ plan, scene, off = [], height = 460 }: { plan: FloorPlanImport; scene?: ModelScene | null; off?: string[]; height?: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const orb = useRef<{ camera: THREE.Camera; ctl: OrbitControls } | null>(null);
  const api = useMemo(() => orbitApi(() => orb.current), []);
  const f = useMemo(() => feetOf(plan), [plan]);
  const empty = !plan.walls.length;
  const offKey = off.join(',');
  useEffect(() => {
    const el = mount.current; if (!el || empty) return;
    const on = (id: string) => !off.includes(id);
    const w = el.clientWidth || 640, h = height, H = Math.max(7.5, plan.wallHeightFt || 10), span = Math.max(f.L, f.W, 10);
    const scene3 = new THREE.Scene(); scene3.background = new THREE.Color('#eef2f6');
    const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, span * 30); cam.position.set(f.L * 0.1, span * 0.95, f.W * 1.35);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { el.textContent = '3D view is not available on this device (no WebGL).'; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(w, h); el.innerHTML = ''; el.appendChild(renderer.domElement);
    scene3.add(new THREE.AmbientLight(0xffffff, 0.75)); const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(f.L * 0.7, span * 2, f.W * 1.6); scene3.add(sun);
    const g = new THREE.Group(); g.position.set(-f.L / 2, 0, -f.W / 2); scene3.add(g);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(f.L, 0.4, f.W), new THREE.MeshLambertMaterial({ color: 0xd7dce1 })); slab.position.set(f.L / 2, -0.2, f.W / 2); g.add(slab);
    const box = (x1: number, y1: number, x2: number, y2: number, t: number, z0: number, z1: number, m: THREE.Material) => {
      const len = Math.hypot(x2 - x1, y2 - y1); if (len < 0.05 || z1 <= z0) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, z1 - z0, Math.max(0.15, t)), m); mesh.position.set((x1 + x2) / 2, (z0 + z1) / 2, (y1 + y2) / 2); mesh.rotation.y = -Math.atan2(y2 - y1, x2 - x1); g.add(mesh);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x37474f, transparent: true, opacity: 0.45 })); e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); g.add(e);
    };
    const ext = new THREE.MeshLambertMaterial({ color: 0xb0a48f }), int = new THREE.MeshLambertMaterial({ color: 0xf2f2ee }), glass = new THREE.MeshLambertMaterial({ color: 0x7ec8f0, transparent: true, opacity: 0.4 }), frame = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    for (const wl of f.walls) if (on(wl.exterior ? 'wall-ext' : 'wall-int')) box(wl.x1, wl.y1, wl.x2, wl.y2, wl.thickFt, 0, H, wl.exterior ? ext : int);
    for (const o of f.openings) {
      const m = o.exterior ? ext : int;
      if (o.kind === 'door' && on('doors')) { box(o.x1, o.y1, o.x2, o.y2, o.thick, 7, H, m); }
      if (o.kind === 'window' && on('windows')) { box(o.x1, o.y1, o.x2, o.y2, o.thick, 0, 3, m); box(o.x1, o.y1, o.x2, o.y2, o.thick, 7, H, m); box(o.x1, o.y1, o.x2, o.y2, Math.min(0.15, o.thick), 3, 7, glass); box(o.x1, o.y1, o.x2, o.y2, o.thick * 1.05, 2.9, 3.05, frame); }
    }
    if (scene) for (const d of scene.devices) if (d.floor === plan.floor && on(d.layer)) {
      const col = scene.layers.find((l) => l.id === d.layer)?.color ?? '#555';
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshLambertMaterial({ color: col })); s.position.set(d.x, Math.min(H - 0.4, deviceHeight(d.kind, plan.ceilingFt || 9, d.outdoor)), d.y); g.add(s);
    }
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.target.set(0, 0, 0); ctl.maxPolarAngle = Math.PI / 2.05; ctl.update(); orb.current = { camera: cam, ctl };
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); renderer.render(scene3, cam); }; loop();
    const ro = new ResizeObserver(() => { const nw = el.clientWidth || w, nh = el.closest('.fullview-on') ? Math.max(300, el.clientHeight) : h; cam.aspect = nw / nh; cam.updateProjectionMatrix(); renderer.setSize(nw, nh); }); ro.observe(el);
    return () => { orb.current = null; cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); renderer.dispose(); scene3.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); }); };
  }, [f, scene, offKey, plan.wallHeightFt, plan.ceilingFt, plan.floor, height]); // eslint-disable-line react-hooks/exhaustive-deps
  if (empty) return <div className="plan-empty"><p className="small muted">No 3D model: no walls were traced.</p></div>;
  return <FullView title="3D model of the floor plan"><div className="vc-host"><div ref={mount} className="bldg3d" style={{ height }} aria-label="3D model of the floor plan" /><ViewPad api={api} /></div></FullView>;
}

/** Room finish, door and window schedules in the usual layout (Mark · Size · Type · Location). */
export function PlanSchedules({ plan }: { plan: FloorPlanImport }) {
  const f = feetOf(plan), s = schedules(f, plan.level);
  return (
    <div className="sched">
      <table className="tbl rpt-tbl"><caption>ROOM SCHEDULE — {plan.level}</caption><thead><tr><th>Room No.</th><th>Room name</th><th>Area (SF)</th><th>Ceiling ht.</th></tr></thead>
        <tbody>{s.rooms.map((r) => <tr key={r.number + r.name}><td>{r.number}</td><td>{r.name}</td><td>{r.area.toLocaleString()}</td><td>{fmtFtIn(plan.ceilingFt)}</td></tr>)}</tbody></table>
      <table className="tbl rpt-tbl"><caption>DOOR SCHEDULE</caption><thead><tr><th>Mark</th><th>Width</th><th>Height</th><th>Type</th><th>Location</th></tr></thead>
        <tbody>{s.doors.map((d) => <tr key={d.mark}><td>{d.mark}</td><td>{d.width}</td><td>{d.height}</td><td>{d.type}</td><td>{d.loc}</td></tr>)}</tbody></table>
      <table className="tbl rpt-tbl"><caption>WINDOW SCHEDULE</caption><thead><tr><th>Mark</th><th>Width</th><th>Location</th></tr></thead>
        <tbody>{s.windows.map((d) => <tr key={d.mark}><td>{d.mark}</td><td>{d.width}</td><td>{d.loc}</td></tr>)}</tbody></table>
    </div>
  );
}
