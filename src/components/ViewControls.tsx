import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useFullView } from './FullView';

/** Big, touch-friendly buttons laid over a map or 3D view while it is on its own full page:
 *  a Layers button (top right) that opens a list to switch things on and off, and a stack of
 *  zoom / tilt / turn buttons (bottom right). Hold a button down to keep going. */

export interface ViewApi {
  zoomIn: () => void; zoomOut: () => void;
  /** Tilt toward level (up) or toward straight down (down). Leave out on views that cannot tilt. */
  tiltUp?: () => void; tiltDown?: () => void;
  /** Turn the view left or right. */
  turnLeft?: () => void; turnRight?: () => void;
  /** Back to north at the top / the starting view. */
  north?: () => void;
  /** Show everything (all sites, the whole model). */
  fit?: () => void;
  /** Extra buttons, e.g. "Tilt in 3D" on the flat map. */
  extra?: { icon: string; label: string; title: string; onClick: () => void }[];
}

/** One button that repeats while held (zooming and tilting by holding feels natural on a phone). */
function HoldBtn({ label, title, onStep }: { label: string; title: string; onStep: () => void }) {
  const t = useRef<number>(); const i = useRef<number>(); const step = useRef(onStep); step.current = onStep;
  const fired = useRef(false);
  const stop = () => { window.clearTimeout(t.current); window.clearInterval(i.current); };
  useEffect(() => stop, []);
  return (
    <button type="button" className="vc-btn" title={title} aria-label={title}
      onPointerDown={(e) => { if (e.button) return; fired.current = true; step.current(); stop(); t.current = window.setTimeout(() => { i.current = window.setInterval(() => step.current(), 110); }, 400); }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!fired.current) step.current(); fired.current = false; }}>{label}</button>
  );
}

/** The zoom / tilt / turn stack. Shown only on a full page (or always, with `always`). */
export function ViewPad({ api, always }: { api: ViewApi | null; always?: boolean }) {
  const { on } = useFullView();
  if ((!on && !always) || !api) return null;
  return (
    <div className="vc-pad" role="group" aria-label="Zoom, tilt and turn">
      <HoldBtn label="＋" title="Zoom in" onStep={api.zoomIn} />
      <HoldBtn label="−" title="Zoom out" onStep={api.zoomOut} />
      {api.tiltUp && <HoldBtn label="⤒" title="Tilt up (toward level)" onStep={api.tiltUp} />}
      {api.tiltDown && <HoldBtn label="⤓" title="Tilt down (toward straight down)" onStep={api.tiltDown} />}
      {api.turnLeft && <HoldBtn label="⟲" title="Turn left" onStep={api.turnLeft} />}
      {api.turnRight && <HoldBtn label="⟳" title="Turn right" onStep={api.turnRight} />}
      {api.north && <button type="button" className="vc-btn" title="North at the top, looking straight down" aria-label="North at the top" onClick={api.north}>N</button>}
      {api.fit && <button type="button" className="vc-btn" title="Show everything" aria-label="Show everything" onClick={api.fit}>⤢</button>}
      {api.extra?.map((x) => <button key={x.label} type="button" className="vc-btn vc-labeled" title={x.title} aria-label={x.title} onClick={x.onClick}><span>{x.icon}</span><small>{x.label}</small></button>)}
    </div>
  );
}

export interface LayerItem { id: string; label: string; on: boolean; set: (on: boolean) => void; disabled?: boolean; note?: string }

/** A simple checklist of layers, with an optional "picture under the map" choice above it. */
export function LayerList({ items, bases, base, setBase, children }: {
  items: LayerItem[]; bases?: string[]; base?: string; setBase?: (b: string) => void; children?: React.ReactNode;
}) {
  return (
    <div className="vc-layers">
      {bases && setBase && <fieldset><legend>Map picture</legend>
        {bases.map((b) => <label key={b} className="vc-row"><input type="radio" name="vc-base" checked={b === base} onChange={() => setBase(b)} /> {b}</label>)}
      </fieldset>}
      {items.length > 0 && <fieldset><legend>Show on the map</legend>
        {items.map((l) => <label key={l.id} className="vc-row" title={l.note}><input type="checkbox" checked={l.on} disabled={l.disabled} onChange={(e) => l.set(e.target.checked)} /> <span>{l.label}{l.note && <small className="muted"> {l.note}</small>}</span></label>)}
      </fieldset>}
      {children}
    </div>
  );
}

/** "🗂 Layers" button that opens a panel over the view. Shown only on a full page (or always, with `always`). */
export function LayersButton({ children, always, title = 'Layers' }: { children: React.ReactNode; always?: boolean; title?: string }) {
  const { on } = useFullView();
  const [open, setOpen] = useState(false);
  if (!on && !always) return null;
  return (
    <div className="vc-layerbox">
      <button type="button" className={'vc-btn vc-wide' + (open ? ' primary' : '')} aria-expanded={open} onClick={() => setOpen(!open)}>🗂 {title}</button>
      {open && <div className="vc-sheet" role="dialog" aria-label={title}>
        <div className="vc-sheet-head"><b>{title}</b><button type="button" className="primary" onClick={() => setOpen(false)}>Done</button></div>
        {children}
      </div>}
    </div>
  );
}

// ---- three.js orbit views -------------------------------------------------

type Orbit = { camera: THREE.Camera; ctl: OrbitControls };
const DEG = Math.PI / 180;

/** Move an orbiting camera: zoom (factor on distance), tilt and turn (degrees). Keeps the point it looks at. */
export function orbitStep(o: Orbit, { zoom = 1, tilt = 0, turn = 0, north = false }: { zoom?: number; tilt?: number; turn?: number; north?: boolean }) {
  const { camera, ctl } = o;
  const off = camera.position.clone().sub(ctl.target), sph = new THREE.Spherical().setFromVector3(off);
  const minD = Math.max(ctl.minDistance || 0, 0.5), maxD = Number.isFinite(ctl.maxDistance) ? ctl.maxDistance : sph.radius * 50;
  sph.radius = Math.max(minD, Math.min(maxD, sph.radius * zoom));
  const maxPhi = Math.min(ctl.maxPolarAngle, Math.PI - 0.01), minPhi = Math.max(ctl.minPolarAngle, 0.01);
  if (north) { sph.theta = 0; sph.phi = minPhi; }
  sph.phi = Math.max(minPhi, Math.min(maxPhi, sph.phi + tilt * DEG));
  sph.theta += turn * DEG;
  sph.makeSafe();
  camera.position.copy(ctl.target.clone().add(new THREE.Vector3().setFromSpherical(sph)));
  camera.lookAt(ctl.target); ctl.update();
  return Math.round((sph.phi * 180) / Math.PI);
}

/** Zoom / tilt / turn buttons for a three.js view with OrbitControls. `get` returns the live camera and controls. */
export function orbitApi(get: () => Orbit | null, onTilt?: (deg: number) => void): ViewApi {
  const go = (s: Parameters<typeof orbitStep>[1]) => { const o = get(); if (!o) return; const t = orbitStep(o, s); if (s.tilt || s.north) onTilt?.(t); };
  return {
    zoomIn: () => go({ zoom: 0.85 }), zoomOut: () => go({ zoom: 1 / 0.85 }),
    tiltUp: () => go({ tilt: 6 }), tiltDown: () => go({ tilt: -6 }),
    turnLeft: () => go({ turn: -10 }), turnRight: () => go({ turn: 10 }),
    north: () => go({ north: true }),
  };
}
