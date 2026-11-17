// Layered 2D plan and 3D model of the building, shared by the 2D & 3D Models page and Auto-Design.
// Every system has its own layers (devices, coverage, cable paths, heat map) that turn on and off in
// both views; the building has layers for floors, walls by material, shafts, labels, dimensions and site.
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FullView } from './FullView';
import { ViewPad, LayersButton, orbitApi } from './ViewControls';
import { KIND_COLOR } from './Building3D';
import { MeasureCtx } from './ui';
import { SYMBOL } from '../engine/blueprint';
import { MAT } from '../engine/bldgmaterials';
import { rssiColor, RSSI_SCALE } from '../engine/coverage';
import { layerGroups, ModelScene, MDevice, MHeat, Footprint } from '../engine/models';
import { downloadText } from '../store';

const LS = 'radioplan.modelLayers';
function loadVis(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(LS) || '{}') ?? {}; } catch { return {}; } }
function saveVis(v: Record<string, boolean>) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* private window */ } }

/** Which layers are showing: the saved choice, else each layer's default. */
export function useLayerVisibility(scene: ModelScene) {
  const [saved, setSaved] = useState<Record<string, boolean>>(loadVis);
  const on = (id: string) => saved[id] ?? scene.layers.find((l) => l.id === id)?.on ?? true;
  const set = (ids: string[], v: boolean) => setSaved((s) => { const n = { ...s }; ids.forEach((i) => { n[i] = v; }); saveVis(n); return n; });
  const visible = useMemo(() => new Set(scene.layers.filter((l) => on(l.id)).map((l) => l.id)), [scene, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  return { visible, set, reset: () => { setSaved({}); saveVis({}); } };
}

function heatCanvas(h: MHeat): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = h.nx; c.height = h.ny; const g = c.getContext('2d')!; const im = g.createImageData(h.nx, h.ny);
  for (let i = 0; i < h.nx * h.ny; i++) { const [r, gg, b, a] = rssiColor(h.v[i], -130); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = a ? 255 : 0; }
  g.putImageData(im, 0, 0); return c;
}

export function LayerPanel({ scene, visible, set, reset }: { scene: ModelScene; visible: Set<string>; set: (ids: string[], v: boolean) => void; reset: () => void }) {
  const groups = layerGroups(scene);
  return (
    <div className="layer-panel" aria-label="Layers">
      <div className="row wrap" style={{ marginBottom: 6 }}>
        <b>Layers</b>
        <button className="small-btn" onClick={() => set(scene.layers.map((l) => l.id), true)}>Show all</button>
        <button className="small-btn" onClick={() => set(scene.layers.filter((l) => l.group !== 'base' && l.group !== 'bldgs').map((l) => l.id), false)}>Hide all systems</button>
        <button className="small-btn" onClick={reset}>Start over</button>
      </div>
      {groups.map((g) => {
        const ids = g.layers.map((l) => l.id), n = ids.filter((i) => visible.has(i)).length;
        return (
          <fieldset key={g.id} className="layer-group">
            <legend>
              <label className="row"><input type="checkbox" checked={n === ids.length} ref={(el) => { if (el) el.indeterminate = n > 0 && n < ids.length; }} onChange={(e) => set(ids, e.target.checked)} /><i className="swatch" style={{ background: g.color }} /><b>{g.label}</b></label>
              {g.id !== 'base' && g.id !== 'bldgs' && <button className="small-btn" title={`Show only ${g.label}`} onClick={() => { set(scene.layers.filter((l) => l.group !== 'base' && l.group !== 'bldgs').map((l) => l.id), false); set(ids, true); }}>Only this</button>}
            </legend>
            <div className="row wrap">{g.layers.map((l) => <label key={l.id} className={'legend-chip' + (visible.has(l.id) ? '' : ' off')} title={l.tip}><input type="checkbox" checked={visible.has(l.id)} onChange={(e) => set([l.id], e.target.checked)} />{l.label}</label>)}</div>
          </fieldset>);
      })}
    </div>
  );
}

function symbolPath(shape: string, x: number, y: number, s: number): string {
  if (shape === 'square') return `M${x - s} ${y - s}h${2 * s}v${2 * s}h${-2 * s}Z`;
  if (shape === 'triangle') return `M${x} ${y - s * 1.2}L${x + s * 1.1} ${y + s * 0.8}L${x - s * 1.1} ${y + s * 0.8}Z`;
  if (shape === 'hex') { let d = ''; for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; d += (i ? 'L' : 'M') + (x + s * 1.1 * Math.cos(a)) + ' ' + (y + s * 1.1 * Math.sin(a)); } return d + 'Z'; }
  return `M${x - s} ${y}a${s} ${s} 0 1 0 ${2 * s} 0a${s} ${s} 0 1 0 ${-2 * s} 0`;
}

/** Flat plan of one or every floor with the visible layers. */
export function Plan2D({ scene, visible, floor, northDeg = 0, heatOpacity = 0.55, planImage, onPick, parking = 0, onMoveBuilding }: { scene: ModelScene; visible: Set<string>; floor: number | 'all'; northDeg?: number; heatOpacity?: number; planImage?: string; onPick?: (s: string) => void; parking?: number; onMoveBuilding?: (id: string, dx: number, dy: number) => void }) {
  const metric = useContext(MeasureCtx) === 'metric';
  const { L, W } = scene; const v = (id: string) => visible.has(id);
  const on = (el: { layer: string; bld?: string }) => visible.has(el.layer) && (!el.bld || visible.has('bldg:' + el.bld));
  const svgRef = useRef<SVGSVGElement | null>(null); const [drag, setDrag] = useState<{ id: string; sx: number; sy: number; dx: number; dy: number } | null>(null);
  const toSvg = (e: React.PointerEvent) => { const sv = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement); const m = sv.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: pt.x, y: pt.y }; };
  const fpPoly = (fp: Footprint, dx = 0, dy = 0) => { const a = (fp.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return ([[0, 0], [fp.L, 0], [fp.L, fp.W], [0, fp.W]] as [number, number][]).map(([x, y]) => `${fp.x + dx + x * c - y * sn},${fp.y + dy + x * sn + y * c}`).join(' '); };
  const floors = floor === 'all' ? Array.from({ length: scene.floors }, (_, i) => i) : [floor];
  const heatUrls = useMemo(() => new Map(scene.heat.map((h) => [h, heatCanvas(h).toDataURL()])), [scene]);
  const outdoor = scene.devices.filter((d) => d.outdoor && on(d));
  const lotW = parking > 0 ? Math.min(L, Math.ceil(parking / 2) * 9) : 0, lotH = parking > 0 ? 60 : 0;
  const xs = [0, L, ...(v('base:site') ? outdoor.map((d) => d.x) : [])], ys = [0, W, ...(v('base:site') ? [...outdoor.map((d) => d.y), lotH ? W + 20 + lotH : W] : [])];
  const pad = Math.max(14, L / 14), x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) + pad - x0, h = Math.max(...ys) + pad - y0;
  const u = Math.max(w, h) / 120; // one "unit" for symbol and text sizes
  const bar = Math.max(10, Math.round(L / 4 / 10) * 10);
  return (
    <div className={floors.length > 1 ? 'plan2d' : ''}>{floors.map((f) => (
      <figure key={f} style={{ margin: 0 }}>
        <figcaption className="small"><b>Floor {f + 1}</b> · {L} × {W} ft{metric ? ` (${(L * 0.3048).toFixed(1)} × ${(W * 0.3048).toFixed(1)} m)` : ''} · true scale</figcaption>
        <svg ref={svgRef} viewBox={`${x0} ${y0} ${w} ${h}`} role="img" aria-label={`Floor ${f + 1} plan with layers`} style={{ width: '100%', height: 'auto', maxHeight: floors.length > 1 ? 460 : 640, background: 'var(--panel)', touchAction: 'manipulation' }}>
          {v('base:site') && <rect x={x0} y={y0} width={w} height={h} fill="#9ccc65" opacity={0.18} />}
          {v('base:site') && f === 0 && lotH > 0 && <g><rect x={(L - lotW) / 2} y={W + 20} width={lotW} height={lotH} fill="#90a4ae" opacity={0.35} />{Array.from({ length: Math.ceil(parking / 2) + 1 }, (_, i) => <line key={i} x1={(L - lotW) / 2 + i * 9} y1={W + 20} x2={(L - lotW) / 2 + i * 9} y2={W + 38} stroke="#fff" strokeWidth={0.3} />)}<text x={L / 2} y={W + 20 + lotH / 2 + u} fontSize={u * 2.4} textAnchor="middle" fill="var(--text)">Parking ({parking})</text></g>}
          {v('base:shell') && !scene.footprints && <rect x={0} y={0} width={L} height={W} fill="var(--bg, #fff)" stroke="var(--text)" strokeWidth={u * 0.3} />}
          {v('base:shell') && scene.footprints?.filter((fp) => v('bldg:' + fp.id) && f < fp.floors).map((fp) => <polygon key={fp.id} points={fpPoly(fp)} fill="var(--bg, #fff)" stroke="var(--text)" strokeWidth={u * 0.3}><title>{fp.name}</title></polygon>)}
          {drag && scene.footprints?.filter((fp) => fp.id === drag.id).map((fp) => <polygon key="drag" points={fpPoly(fp, drag.dx, drag.dy)} fill="none" stroke="#ff9800" strokeWidth={u * 0.5} strokeDasharray={`${u} ${u}`} pointerEvents="none" />)}
          {planImage && v('base:shell') && <image href={planImage} x={0} y={0} width={L} height={W} preserveAspectRatio="none" opacity={0.6} />}
          {scene.heat.filter((m) => m.floor === f && on(m)).map((m, i) => <image key={'h' + i} href={heatUrls.get(m)} x={0} y={0} width={m.w ?? L} height={m.h ?? W} transform={m.ox != null ? `translate(${m.ox} ${m.oy}) rotate(${m.rot ?? 0})` : undefined} pointerEvents="none" preserveAspectRatio="none" opacity={heatOpacity} style={{ imageRendering: 'auto' }} />)}
          {scene.areas.filter((a) => a.floor === f && on(a)).map((a, i) => {
            const p = { fill: a.color, fillOpacity: 0.12, stroke: a.color, strokeOpacity: 0.6, strokeWidth: u * 0.15, onClick: () => onPick?.(a.label) };
            return a.shape === 'circle' ? <circle key={'a' + i} cx={a.x} cy={a.y} r={a.r} {...p}><title>{a.label}</title></circle>
              : a.shape === 'square' ? <rect key={'a' + i} x={a.x - a.r} y={a.y - a.r} width={2 * a.r} height={2 * a.r} {...p}><title>{a.label}</title></rect>
                : <polygon key={'a' + i} points={(a.pts ?? []).map((q) => q.join(',')).join(' ')} {...p} fillOpacity={0.09}><title>{a.label}</title></polygon>;
          })}
          {scene.walls.filter((wl) => wl.floor === f && on(wl)).map((wl, i) => <line key={'w' + i} x1={wl.x1} y1={wl.y1} x2={wl.x2} y2={wl.y2} stroke={wl.color} strokeWidth={wl.part === 'Outside wall' || wl.part === 'Window' ? u * 0.9 : wl.ratedHr >= 1 ? u * 0.75 : u * 0.4} strokeLinecap="butt" onClick={() => onPick?.(`${wl.part}: ${MAT[wl.material]?.label ?? wl.material}${wl.ratedHr >= 1 ? `, ${wl.ratedHr}-hour rated` : ''}`)}><title>{wl.part}: {MAT[wl.material]?.label}{wl.ratedHr >= 1 ? ` (${wl.ratedHr} h rated)` : ''}</title></line>)}
          {scene.paths.filter((pa) => on(pa)).map((pa, i) => {
            const segs: string[] = []; const risers: [number, number][] = [];
            for (let k = 1; k < pa.pts.length; k++) { const a = pa.pts[k - 1], b = pa.pts[k]; if (a[2] === f && b[2] === f && (a[0] !== b[0] || a[1] !== b[1])) segs.push(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`); else if (a[2] !== b[2] && (a[2] === f || b[2] === f)) risers.push([b[0], b[1]]); }
            if (!segs.length && !risers.length) return null;
            return <g key={'p' + i} onClick={() => onPick?.(pa.label)}><path d={segs.join('')} fill="none" stroke={pa.color} strokeWidth={u * 0.22 * (pa.width ?? 1)} strokeOpacity={0.75} strokeDasharray={pa.dash ? `${u} ${u * 0.6}` : undefined}><title>{pa.label}</title></path>
              {risers.map(([rx, ry], k) => <g key={k}><circle cx={rx} cy={ry} r={u * 0.9} fill="none" stroke={pa.color} strokeWidth={u * 0.2} /><circle cx={rx} cy={ry} r={u * 0.3} fill={pa.color} /><title>Riser: {pa.label}</title></g>)}</g>;
          })}
          {scene.devices.filter((d) => (d.floor === f || (d.outdoor && f === 0)) && on(d)).map((d, i) => <path key={'d' + i} d={symbolPath(SYMBOL[d.kind].shape, d.x, d.y, d.kind === 'tr' || d.kind === 'facp' ? u * 1.5 : u * 0.9)} fill={KIND_COLOR[d.kind]} stroke="#000" strokeWidth={u * 0.15} onClick={() => onPick?.(`${d.tag}: ${d.info}`)} style={{ cursor: 'pointer' }}><title>{d.tag}: {d.info}</title></path>)}
          {v('base:labels') && scene.devices.filter((d) => (d.floor === f || (d.outdoor && f === 0)) && on(d)).map((d, i) => <text key={'t' + i} x={d.x + u * 1.2} y={d.y - u * 0.6} fontSize={d.kind === 'tr' || d.kind === 'facp' ? u * 2 : u * 1.25} fill="var(--text)" pointerEvents="none">{d.tag}</text>)}
          {v('base:labels') && scene.labels.filter((t) => t.floor === f && (!t.bld || v('bldg:' + t.bld))).map((t, i) => <text key={'l' + i} x={t.x} y={t.y} fontSize={u * 1.6} textAnchor="middle" fill="var(--text)" pointerEvents="none">{t.text}</text>)}
          {scene.donor && v('rf:donor') && f === scene.floors - 1 && (() => { const a = ((scene.donor.bearing - northDeg) * Math.PI) / 180, len = Math.max(L, W) * 0.45, ex = scene.donor.x + Math.sin(a) * len, ey = scene.donor.y - Math.cos(a) * len; return <g onClick={() => onPick?.(`Donor antenna aim ${scene.donor!.bearing.toFixed(0)}° true to ${scene.donor!.name}, ${(scene.donor!.km * 0.621).toFixed(1)} mi`)}><line x1={scene.donor.x} y1={scene.donor.y} x2={ex} y2={ey} stroke="#311b92" strokeWidth={u * 0.4} markerEnd="url(#arr)" /><text x={ex} y={ey - u} fontSize={u * 2} fill="#311b92" textAnchor="middle">{scene.donor.name} {scene.donor.bearing.toFixed(0)}°T</text></g>; })()}
          {scene.footprints?.filter((fp) => v('bldg:' + fp.id)).map((fp) => { const a = (fp.rot * Math.PI) / 180, cx = fp.x + (fp.L / 2) * Math.cos(a) - (fp.W / 2) * Math.sin(a), cy = fp.y + (fp.L / 2) * Math.sin(a) + (fp.W / 2) * Math.cos(a), bw = u * (fp.name.length * 1.15 + 4);
            return <g key={'hd' + fp.id} transform={`translate(${cx + (drag?.id === fp.id ? drag.dx : 0)} ${cy + (drag?.id === fp.id ? drag.dy : 0)})`} style={{ cursor: onMoveBuilding ? 'move' : undefined, userSelect: 'none', touchAction: 'none' }}
              onPointerDown={onMoveBuilding ? (e) => { e.preventDefault(); const q = toSvg(e); (e.currentTarget as Element).setPointerCapture(e.pointerId); setDrag({ id: fp.id, sx: q.x, sy: q.y, dx: 0, dy: 0 }); } : undefined}
              onPointerMove={(e) => { if (drag?.id === fp.id) { const q = toSvg(e); setDrag({ ...drag, dx: q.x - drag.sx, dy: q.y - drag.sy }); } }}
              onPointerUp={() => { if (drag?.id === fp.id) { if (Math.hypot(drag.dx, drag.dy) > 1) onMoveBuilding?.(fp.id, drag.dx, drag.dy); setDrag(null); } }}>
              <rect x={-bw / 2} y={-u * 1.8} width={bw} height={u * 3.6} rx={u} fill="#263238" opacity={0.85} /><text x={0} y={u * 0.8} fontSize={u * 2.2} textAnchor="middle" fill="#fff">{onMoveBuilding ? '✥ ' : ''}{fp.name}</text>
              <title>{fp.name}{onMoveBuilding ? ': drag to move this building' : ''}</title></g>; })}
          <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#311b92" /></marker></defs>
          {v('base:dims') && <g pointerEvents="none">
            <g transform={`translate(${x0 + pad / 2} ${y0 + h - pad / 3})`}><line x1={0} y1={0} x2={bar} y2={0} stroke="var(--text)" strokeWidth={u * 0.4} /><line x1={0} y1={-u} x2={0} y2={u} stroke="var(--text)" strokeWidth={u * 0.3} /><line x1={bar} y1={-u} x2={bar} y2={u} stroke="var(--text)" strokeWidth={u * 0.3} /><text x={0} y={-u * 1.4} fontSize={u * 2} fill="var(--text)">{metric ? `${(bar * 0.3048).toFixed(1)} m` : `${bar} ft`}</text></g>
            <g transform={`translate(${x0 + w - pad / 2} ${y0 + pad / 1.4}) rotate(${-northDeg})`}><path d={`M0 ${-u * 3}L${u * 1.3} ${u * 1.5}L0 ${u * 0.6}L${-u * 1.3} ${u * 1.5}Z`} fill="var(--text)" /><text x={0} y={-u * 3.5} fontSize={u * 2.2} textAnchor="middle" fill="var(--text)">N</text></g>
            <text x={L / 2} y={-u * 1.6} fontSize={u * 1.8} textAnchor="middle" fill="var(--text)">{metric ? `${(L * 0.3048).toFixed(1)} m` : `${L} ft`}</text>
            <text x={-u * 1.6} y={W / 2} fontSize={u * 1.8} textAnchor="middle" fill="var(--text)" transform={`rotate(-90 ${-u * 1.6} ${W / 2})`}>{metric ? `${(W * 0.3048).toFixed(1)} m` : `${W} ft`}</text>
          </g>}
        </svg>
      </figure>))}</div>
  );
}

const SHAPE: Record<string, string> = { tr: 'box', facp: 'box', smoke: 'disc', pull: 'small', hornstrobe: 'small', speaker: 'disc', outlet: 'small', wap: 'disc', camera: 'cone', reader: 'small', contact: 'small', motion: 'sph', keypad: 'small', intercom: 'small', nurse: 'small', dome: 'sph', das: 'disc', donor: 'pole', callbox: 'pole' };

function textSprite(text: string, color = '#111', size = 3) {
  const c = document.createElement('canvas'); const g = c.getContext('2d')!; g.font = 'bold 40px sans-serif'; const w = Math.ceil(g.measureText(text).width) + 16; c.width = w; c.height = 56;
  const g2 = c.getContext('2d')!; g2.fillStyle = 'rgba(255,255,255,0.8)'; g2.fillRect(0, 0, w, 56); g2.font = 'bold 40px sans-serif'; g2.fillStyle = color; g2.fillText(text, 8, 42);
  const t = new THREE.CanvasTexture(c); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set((size * w) / 56, size, 1); return s;
}

/** 3D model: floors stacked (optionally pulled apart), walls standing at ceiling height in their material colour. */
export function Model3D({ scene, visible, floor, explode, heatOpacity = 0.7, northDeg = 0, onPick, parking = 0 }: { scene: ModelScene; visible: Set<string>; floor: number | 'all'; explode: number; heatOpacity?: number; northDeg?: number; onPick?: (s: string) => void; parking?: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const byLayer = useRef<Map<string, THREE.Object3D[]>>(new Map());
  const camState = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const orb = useRef<{ camera: THREE.Camera; ctl: OrbitControls } | null>(null);
  const api = useMemo(() => orbitApi(() => orb.current), []);
  const pickRef = useRef(onPick); pickRef.current = onPick;
  const visRef = useRef(visible); visRef.current = visible;
  const [err, setErr] = useState('');
  const applyVis = () => { const v = visRef.current; for (const [id, objs] of byLayer.current) for (const o of objs) o.visible = v.has(id) && (!o.userData.layer || v.has(o.userData.layer)) && (!o.userData.bld || v.has('bldg:' + o.userData.bld)); };
  useEffect(() => {
    const el = mount.current; if (!el) return;
    const w = el.clientWidth || 800, h = el.closest('.fullview-on') ? Math.max(300, el.clientHeight) : Math.max(380, Math.min(640, w * 0.62));
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { setErr('3D view is not available on this device (no WebGL). Use the 2D plan.'); return; }
    const { L, W, floorH: FH, ceilingFt: CF, floors: F } = scene; const gap = explode; const base = (f: number) => f * (FH + gap);
    const scene3 = new THREE.Scene(); scene3.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--panel').trim() || '#ffffff');
    const span = Math.max(L, W, F * (FH + gap));
    const cam = new THREE.PerspectiveCamera(45, w / h, 0.5, span * 30);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(w, h); el.innerHTML = ''; el.appendChild(renderer.domElement);
    scene3.add(new THREE.AmbientLight(0xffffff, 0.8)); const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(L, span * 2, W * 2); scene3.add(sun);
    const g = new THREE.Group(); g.position.set(-L / 2, 0, -W / 2); scene3.add(g);
    const map = new Map<string, THREE.Object3D[]>(); const put = (layer: string, o: THREE.Object3D, bld?: string) => { if (bld) o.userData.bld = bld; g.add(o); (map.get(layer) ?? map.set(layer, []).get(layer)!).push(o); };
    const show = (f: number) => floor === 'all' || floor === f;
    const mats = new Map<string, THREE.Material>(); const mat = (key: string, make: () => THREE.Material) => mats.get(key) ?? (mats.set(key, make()), mats.get(key)!);
    const textures: THREE.Texture[] = [];
    // site and shell
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L + 300, W + 300), new THREE.MeshLambertMaterial({ color: 0x9ccc65, transparent: true, opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(L / 2, -0.3, W / 2); put('base:site', ground);
    if (parking > 0) { const lw = Math.min(L, Math.ceil(parking / 2) * 9); const lot = new THREE.Mesh(new THREE.PlaneGeometry(lw, 60), new THREE.MeshLambertMaterial({ color: 0x90a4ae })); lot.rotation.x = -Math.PI / 2; lot.position.set(L / 2, -0.2, W + 50); put('base:site', lot); }
    const fps = scene.footprints ?? [{ id: '', name: '', x: 0, y: 0, L, W, rot: 0, floors: F, floorH: FH, spec: scene.spec }];
    for (const fp of fps) {
    const fg = new THREE.Group(); fg.position.set(fp.x, 0, fp.y); fg.rotation.y = (-fp.rot * Math.PI) / 180;
    const putF = (layer: string, o: THREE.Object3D) => { put(layer, o, fp.id || undefined); g.remove(o); fg.add(o); };
    for (let f = 0; f < fp.floors; f++) {
      const op = show(f) ? 1 : 0.12;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(fp.L, 0.8, fp.W), new THREE.MeshLambertMaterial({ color: MAT[fp.spec.floor]?.color ?? '#cfd8dc', transparent: true, opacity: 0.5 * op }));
      slab.position.set(fp.L / 2, base(f) - 0.4, fp.W / 2); putF('base:shell', slab);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(fp.L, fp.floorH, fp.W)), new THREE.LineBasicMaterial({ color: 0x546e7a, transparent: true, opacity: 0.5 * op }));
      edges.position.set(fp.L / 2, base(f) + fp.floorH / 2, fp.W / 2); putF('base:shell', edges);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(fp.L, 0.6, fp.W), new THREE.MeshLambertMaterial({ color: MAT[fp.spec.roof]?.color ?? '#546e7a', transparent: true, opacity: floor === 'all' ? 0.25 : 0.06 }));
    roof.position.set(fp.L / 2, base(fp.floors - 1) + fp.floorH, fp.W / 2); putF('base:shell', roof);
    g.add(fg);
    }
    // heat maps
    for (const hm of scene.heat) {
      if (!show(hm.floor)) continue; const tex = new THREE.CanvasTexture(heatCanvas(hm)); tex.colorSpace = THREE.SRGBColorSpace; textures.push(tex);
      const hw = hm.w ?? L, hh = hm.h ?? W;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(hw, hh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: heatOpacity, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(hw / 2, base(hm.floor) + (hm.ox != null && hm.layer.endsWith('siteheat') ? 0.05 : 0.15), hh / 2);
      const hg = new THREE.Group(); hg.position.set(hm.ox ?? 0, 0, hm.oy ?? 0); hg.rotation.y = (-(hm.rot ?? 0) * Math.PI) / 180; hg.add(m); put(hm.layer, hg, hm.bld);
    }
    // coverage areas
    for (const a of scene.areas) {
      if (!show(a.floor)) continue;
      const mm = mat('a' + a.color, () => new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      let geo: THREE.BufferGeometry;
      if (a.shape === 'circle') geo = new THREE.CircleGeometry(a.r, 40);
      else if (a.shape === 'square') geo = new THREE.PlaneGeometry(2 * a.r, 2 * a.r);
      else { const sh = new THREE.Shape(); (a.pts ?? []).forEach(([px, py], i) => { if (i) sh.lineTo(px - a.x, -(py - a.y)); else sh.moveTo(px - a.x, -(py - a.y)); }); geo = new THREE.ShapeGeometry(sh); }
      const m = new THREE.Mesh(geo, mm); m.rotation.x = -Math.PI / 2; m.position.set(a.x, base(a.floor) + a.z, a.y); m.userData.info = a.label; put(a.layer, m, a.bld);
    }
    // walls
    for (const wl of scene.walls) {
      if (!show(wl.floor)) continue; const len = Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1); if (len < 0.05) continue;
      const glass = MAT[wl.material]?.seeThrough; const hgt = wl.part === 'Door' ? 7 : wl.layer === 'base:shafts' ? FH : CF;
      const mm = mat('w' + wl.material + wl.part, () => new THREE.MeshLambertMaterial({ color: wl.color, transparent: true, opacity: glass ? 0.3 : wl.part === 'Outside wall' ? 0.45 : 0.75 }));
      const th = wl.part === 'Outside wall' || wl.part === 'Window' ? 1 : wl.ratedHr >= 1 ? 0.7 : 0.4;
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, hgt, th), mm);
      m.position.set((wl.x1 + wl.x2) / 2, base(wl.floor) + hgt / 2, (wl.y1 + wl.y2) / 2); m.rotation.y = -Math.atan2(wl.y2 - wl.y1, wl.x2 - wl.x1);
      m.userData.info = `${wl.part}: ${MAT[wl.material]?.label ?? wl.material}${wl.ratedHr >= 1 ? `, ${wl.ratedHr}-hour rated` : ''}`; put(wl.layer, m, wl.bld);
    }
    // cable paths
    for (const pa of scene.paths) {
      const pts = pa.pts.filter((q) => show(q[2]) || floor === 'all').map(([px, py, pf, pz]) => new THREE.Vector3(px, base(pf) + pz, py)); if (pts.length < 2) continue;
      if (floor !== 'all' && !pa.pts.some((q) => q[2] === floor)) continue;
      const lm = pa.dash ? new THREE.LineDashedMaterial({ color: pa.color, dashSize: 2, gapSize: 1.2 }) : mat('l' + pa.color, () => new THREE.LineBasicMaterial({ color: pa.color }));
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm); if (pa.dash) ln.computeLineDistances(); ln.userData.info = pa.label; put(pa.layer, ln, pa.bld);
    }
    // devices
    const geo: Record<string, THREE.BufferGeometry> = { box: new THREE.BoxGeometry(5, 7, 4), sph: new THREE.SphereGeometry(1.3, 12, 8), cone: new THREE.ConeGeometry(1.3, 2.8, 10), disc: new THREE.CylinderGeometry(1.7, 1.7, 0.6, 16), small: new THREE.BoxGeometry(1.4, 2, 1), pole: new THREE.CylinderGeometry(0.5, 0.5, 12, 8) };
    const pickables: THREE.Object3D[] = [];
    const tagAll = scene.devices.length < 260 || floor !== 'all';
    for (const d of scene.devices as MDevice[]) {
      if (!show(d.floor) && !(d.outdoor && floor === 'all')) continue;
      const m = new THREE.Mesh(geo[SHAPE[d.kind]], mat('d' + d.kind, () => new THREE.MeshLambertMaterial({ color: KIND_COLOR[d.kind] })));
      const y = d.kind === 'donor' ? base(F - 1) + FH + 6 : d.outdoor ? (d.kind === 'callbox' ? 6 : d.z) : base(d.floor) + d.z;
      m.position.set(d.x, y, d.y); if (d.kind === 'camera') m.rotation.x = Math.PI; m.userData.info = `${d.tag}: ${d.info}`; put(d.layer, m, d.bld); pickables.push(m);
      if (tagAll || d.kind === 'tr' || d.kind === 'facp') { const s = textSprite(d.tag, '#111', d.kind === 'tr' || d.kind === 'facp' ? 3.2 : 2); s.position.set(d.x, y + 3, d.y); put('base:labels', s, d.bld); s.userData.layer = d.layer; }
    }
    for (const t of scene.labels) { if (!show(t.floor)) continue; const s = textSprite(t.text, '#333', 2.6); s.position.set(t.x, base(t.floor) + t.z + 4, t.y); put('base:labels', s, t.bld); }
    // north arrow and donor aim
    const nA = ((-northDeg) * Math.PI) / 180, nDir = new THREE.Vector3(Math.sin(nA), 0, -Math.cos(nA));
    put('base:dims', new THREE.ArrowHelper(nDir, new THREE.Vector3(L + 20, 0.5, -10), 30, 0x263238, 8, 5));
    const nS = textSprite('N', '#263238', 5); nS.position.set(L + 20 + nDir.x * 36, 3, -10 + nDir.z * 36); put('base:dims', nS);
    const dimS = textSprite(scene.footprints ? `Site ${Math.round(L)} × ${Math.round(W)} ft, ${scene.footprints.length} buildings` : `${L} × ${W} ft, ${F} floor${F > 1 ? 's' : ''}`, '#263238', 3.5); dimS.position.set(L / 2, -2, W + 14); put('base:dims', dimS);
    if (scene.donor) { const a = ((scene.donor.bearing - northDeg) * Math.PI) / 180, dir = new THREE.Vector3(Math.sin(a), 0.05, -Math.cos(a)).normalize(); const o = new THREE.Vector3(scene.donor.x, base(F - 1) + FH + 12, scene.donor.y); put('rf:donor', new THREE.ArrowHelper(dir, o, Math.max(L, W) * 0.6, 0x311b92, 10, 6)); const s = textSprite(`${scene.donor.name} ${scene.donor.bearing.toFixed(0)}°T`, '#311b92', 3.5); s.position.copy(o.clone().add(dir.clone().multiplyScalar(Math.max(L, W) * 0.6 + 8))); put('rf:donor', s); }
    byLayer.current = map; applyVis();
    // camera
    const ctl = new OrbitControls(cam, renderer.domElement);
    if (camState.current) { cam.position.copy(camState.current.pos); ctl.target.copy(camState.current.target); }
    else { cam.position.set(L * 0.7, F * (FH + gap) + span * 0.75, W * 1.5); ctl.target.set(0, (F * (FH + gap)) / 3, 0); }
    ctl.maxPolarAngle = Math.PI * 0.49; ctl.update(); orb.current = { camera: cam, ctl };
    // tap to identify
    const ray = new THREE.Raycaster(); let downAt = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      const rc = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), cam);
      const hit = ray.intersectObjects(pickables.filter((o) => o.visible), false)[0] ?? ray.intersectObjects([...map.values()].flat().filter((o) => o.visible && o.userData.info && (o as THREE.Mesh).isMesh), false)[0];
      if (hit) pickRef.current?.(hit.object.userData.info);
    };
    renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp);
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); renderer.render(scene3, cam); }; loop();
    const onResize = () => { const nw = el.clientWidth; const nh = el.closest('.fullview-on') ? Math.max(300, el.clientHeight) : Math.max(380, Math.min(640, nw * 0.62)); cam.aspect = nw / nh; cam.updateProjectionMatrix(); renderer.setSize(nw, nh); };
    window.addEventListener('resize', onResize);
    return () => {
      camState.current = { pos: cam.position.clone(), target: ctl.target.clone() }; orb.current = null;
      cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp);
      ctl.dispose(); textures.forEach((t) => t.dispose());
      scene3.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const sm = (o as THREE.Sprite).material as THREE.SpriteMaterial | undefined; if ((o as THREE.Sprite).isSprite) { sm?.map?.dispose(); sm?.dispose(); } });
      mats.forEach((m) => m.dispose()); renderer.dispose();
    };
  }, [scene, floor, explode, heatOpacity, northDeg, parking]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { applyVis(); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <p className="warn-text">{err}</p>;
  return <div className="vc-host"><div ref={mount} className="bldg3d" aria-label="3D model of the building with layers" /><ViewPad api={api} /></div>;
}

/** The whole viewer: 2D/3D switch, floor picker, pull-apart slider, layer panel, legend and tap-to-identify. */
export function LayeredModel({ scene, northDeg = 0, planImage, parking = 0, title = '2D & 3D model', onMoveBuilding, initialView }: { scene: ModelScene; northDeg?: number; planImage?: string; parking?: number; title?: string; onMoveBuilding?: (id: string, dx: number, dy: number) => void; initialView?: '2d' | '3d' }) {
  const { visible, set, reset } = useLayerVisibility(scene);
  const [view, setView] = useState<'2d' | '3d'>(() => { if (initialView) return initialView; try { return localStorage.getItem('radioplan.designView') === '2d' ? '2d' : '3d'; } catch { return '3d'; } });
  const pickView = (v: '2d' | '3d') => { setView(v); try { localStorage.setItem('radioplan.designView', v); } catch { /* ignore */ } };
  const [floor, setFloor] = useState<number | 'all'>('all');
  const [explode, setExplode] = useState(0);
  const [heatOp, setHeatOp] = useState(0.6);
  const [picked, setPicked] = useState('');
  const fl = floor !== 'all' && floor >= scene.floors ? 'all' : floor;
  const svgWrap = useRef<HTMLDivElement>(null);
  const savePicture = () => {
    if (view === '3d') { const c = svgWrap.current?.querySelector('canvas'); if (!c) return; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'building-3d.png'; a.click(); return; }
    const s = svgWrap.current?.querySelector('svg'); if (s) downloadText('building-plan.svg', new XMLSerializer().serializeToString(s), 'image/svg+xml');
  };
  const heatOn = scene.heat.some((h) => visible.has(h.layer));
  return (
    <div className="layered-model">
      <div className="row wrap toolbar">
        <span className="seg" role="group" aria-label="View"><button className={view === '2d' ? 'primary' : ''} aria-pressed={view === '2d'} onClick={() => pickView('2d')}>🗺 2D plan</button><button className={view === '3d' ? 'primary' : ''} aria-pressed={view === '3d'} onClick={() => pickView('3d')}>🧊 3D model</button></span>
        <select value={String(fl)} onChange={(e) => setFloor(e.target.value === 'all' ? 'all' : +e.target.value)} aria-label="Floor to show" data-no-choose><option value="all">All floors</option>{Array.from({ length: scene.floors }, (_, i) => <option key={i} value={i}>Floor {i + 1}</option>)}</select>
        {view === '3d' && scene.floors > 1 && <label className="row small">Pull floors apart <input type="range" min={0} max={40} step={2} value={explode} onChange={(e) => setExplode(+e.target.value)} aria-label="Pull floors apart" /></label>}
        {heatOn && <label className="row small">Heat map <input type="range" min={0.2} max={1} step={0.05} value={heatOp} onChange={(e) => setHeatOp(+e.target.value)} aria-label="Heat map strength" /></label>}
        <button className="small-btn" onClick={savePicture}>⬇ Save picture</button>
      </div>
      <div className="layered-body">
        <div className="layered-view" ref={svgWrap}>
          <FullView title={title}>
            <LayersButton><LayerPanel scene={scene} visible={visible} set={set} reset={reset} /></LayersButton>
            {view === '2d' ? <Plan2D scene={scene} visible={visible} floor={fl} northDeg={northDeg} heatOpacity={heatOp} planImage={planImage} onPick={setPicked} parking={parking} onMoveBuilding={onMoveBuilding} /> : <Model3D scene={scene} visible={visible} floor={fl} explode={explode} heatOpacity={heatOp} northDeg={northDeg} onPick={setPicked} parking={parking} />}
          </FullView>
          <p className="small" role="status" aria-live="polite">{picked ? <><b>Selected:</b> {picked} <button className="ghost small-btn" onClick={() => setPicked('')}>✕</button></> : <span className="muted">{view === '3d' ? 'Drag to turn, scroll or pinch to zoom, tap anything to see what it is.' : 'Tap any device, wall or cable to see what it is.'} Turn layers on and off on the right (below on a phone).</span>}</p>
          {heatOn && <div className="legend small">{RSSI_SCALE.map((s) => <span key={s.min}><span className="lg" style={{ background: `rgb(${s.color.join(',')})` }} />{s.label}</span>)}</div>}
        </div>
        <LayerPanel scene={scene} visible={visible} set={set} reset={reset} />
      </div>
    </div>
  );
}
