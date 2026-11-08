import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AutoResult, Kind } from '../engine/autodesign';

export const KIND_COLOR: Record<Kind, string> = { tr: '#6d4c41', facp: '#b71c1c', smoke: '#f5f5f5', pull: '#e53935', hornstrobe: '#ff7043', speaker: '#1e88e5', outlet: '#43a047', wap: '#00acc1', camera: '#263238', reader: '#fb8c00', contact: '#8d6e63', motion: '#ab47bc', keypad: '#5d4037', intercom: '#3949ab', nurse: '#ec407a', dome: '#fdd835', das: '#7e57c2', donor: '#512da8', callbox: '#0d47a1' };

/** 3-D model of the building: one slab per floor with every device the auto-design placed. Drag to turn, scroll to zoom. */
export function Building3D({ r, lengthFt, widthFt, floorHeightFt, floor, hidden }: { r: AutoResult; lengthFt: number; widthFt: number; floorHeightFt: number; floor: number | 'all'; hidden: Set<Kind> }) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mount.current; if (!el) return;
    const w = el.clientWidth, h = Math.max(360, Math.min(620, w * 0.62));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--panel').trim() || '#ffffff');
    const L = lengthFt, W = widthFt, FH = floorHeightFt;
    const floors = Math.max(1, ...r.trs.map((t) => t.floor + 1));
    const span = Math.max(L, W, floors * FH);
    const cam = new THREE.PerspectiveCamera(45, w / h, 1, span * 20); cam.position.set(L * 0.9, floors * FH + span * 0.7, W * 1.6);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { el.textContent = '3D view is not available on this device (no WebGL).'; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(w, h); el.innerHTML = ''; el.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75)); const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(L, span * 2, W * 2); scene.add(sun);
    const g = new THREE.Group(); g.position.set(-L / 2, 0, -W / 2); scene.add(g);
    const show = (f: number) => floor === 'all' || floor === f;
    // ground and parking
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L + 260, W + 260), new THREE.MeshLambertMaterial({ color: 0x9ccc65, transparent: true, opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(L / 2, -0.2, W / 2); g.add(ground);
    for (let f = 0; f < floors; f++) {
      const op = show(f) ? 1 : 0.15;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(L, 0.8, W), new THREE.MeshLambertMaterial({ color: 0xcfd8dc, transparent: true, opacity: 0.55 * op }));
      slab.position.set(L / 2, f * FH, W / 2); g.add(slab);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, FH, W)), new THREE.LineBasicMaterial({ color: 0x546e7a, transparent: true, opacity: 0.6 * op }));
      edges.position.set(L / 2, f * FH + FH / 2, W / 2); g.add(edges);
    }
    // riser
    if (floors > 1) { const riser = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, (floors - 1) * FH + 2, 12), new THREE.MeshLambertMaterial({ color: 0x795548 })); riser.position.set(r.trs[0].x, ((floors - 1) * FH) / 2 + 1, r.trs[0].y); g.add(riser); }
    const geo: Record<string, THREE.BufferGeometry> = { box: new THREE.BoxGeometry(5, 7, 4), sph: new THREE.SphereGeometry(1.4, 12, 8), cone: new THREE.ConeGeometry(1.4, 3, 10), disc: new THREE.CylinderGeometry(1.8, 1.8, 0.6, 16), small: new THREE.BoxGeometry(1.4, 2, 1), pole: new THREE.CylinderGeometry(0.5, 0.5, 12, 8) };
    const shape: Record<Kind, string> = { tr: 'box', facp: 'box', smoke: 'disc', pull: 'small', hornstrobe: 'small', speaker: 'disc', outlet: 'small', wap: 'disc', camera: 'cone', reader: 'small', contact: 'small', motion: 'sph', keypad: 'small', intercom: 'small', nurse: 'small', dome: 'sph', das: 'disc', donor: 'pole', callbox: 'pole' };
    const mats: Partial<Record<Kind, THREE.Material>> = {};
    for (const d of [...r.trs, ...r.devices]) {
      if (hidden.has(d.kind) || !show(d.floor)) continue;
      const m = (mats[d.kind] ??= new THREE.MeshLambertMaterial({ color: KIND_COLOR[d.kind] }));
      const mesh = new THREE.Mesh(geo[shape[d.kind]], m);
      const ceilingY = d.floor * FH + FH - 2.5, wallY = d.floor * FH + 4.5;
      const y = d.kind === 'donor' ? floors * FH + 6 : d.outdoor ? 6 : ['tr', 'facp'].includes(d.kind) ? d.floor * FH + 4 : ['smoke', 'speaker', 'wap', 'das', 'dome', 'motion', 'camera'].includes(d.kind) ? ceilingY : wallY;
      mesh.position.set(d.x, y, d.y); if (d.kind === 'camera') mesh.rotation.x = Math.PI; g.add(mesh);
    }
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.target.set(0, (floors * FH) / 3, 0); ctl.update();
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); renderer.render(scene, cam); }; loop();
    const onResize = () => { const nw = el.clientWidth; const nh = Math.max(360, Math.min(620, nw * 0.62)); cam.aspect = nw / nh; cam.updateProjectionMatrix(); renderer.setSize(nw, nh); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); ctl.dispose(); renderer.dispose(); scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); }); };
  }, [r, lengthFt, widthFt, floorHeightFt, floor, hidden]);
  return <div ref={mount} className="bldg3d" aria-label="3D model of the building and equipment" />;
}
