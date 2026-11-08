import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WALL_MATERIALS } from '../engine/indoor';
import { rssiColor } from '../engine/coverage';
import type { IndoorDesign } from '../types';

export const WALL_HEIGHT_M = 3;

/** 3-D view of the room: the walls you drew stand up 3 m tall in their material colour, the coverage heat map lies on the floor, antennas hang from the ceiling. Drag to turn, scroll to zoom. */
export function Indoor3D({ d, grid }: { d: IndoorDesign; grid: { nx: number; ny: number; v: Float32Array } }) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mount.current; if (!el) return;
    const w = el.clientWidth || 800, h = Math.max(340, Math.min(560, w * 0.6));
    const W = d.widthM, D = d.heightM, H = WALL_HEIGHT_M, span = Math.max(W, D);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--panel').trim() || '#ffffff');
    const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, span * 20); cam.position.set(W * 0.15, span * 0.75, D * 1.15);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { el.textContent = '3D view is not available on this device (no WebGL).'; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(w, h); el.innerHTML = ''; el.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8)); const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(W, span * 2, D * 1.5); scene.add(sun);
    const g = new THREE.Group(); g.position.set(-W / 2, 0, -D / 2); scene.add(g);
    // floor with the heat map painted on it
    const tc = document.createElement('canvas'); tc.width = grid.nx; tc.height = grid.ny;
    const tg = tc.getContext('2d')!; tg.fillStyle = '#eceff1'; tg.fillRect(0, 0, grid.nx, grid.ny);
    const im = tg.getImageData(0, 0, grid.nx, grid.ny);
    for (let i = 0; i < grid.nx * grid.ny; i++) { const [r, gg, b, a] = rssiColor(grid.v[i], -130); if (a) { im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; } }
    tg.putImageData(im, 0, 0);
    const tex = new THREE.CanvasTexture(tc); tex.magFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, D / 2); g.add(floor);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.01, D)), new THREE.LineBasicMaterial({ color: 0x78909c }));
    outline.position.set(W / 2, 0, D / 2); g.add(outline);
    // walls, extruded
    const mats: Record<string, THREE.Material> = {};
    for (const wl of d.walls) {
      const len = Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1); if (len < 0.05) continue;
      const col = WALL_MATERIALS[wl.material]?.color ?? '#607d8b';
      const m = (mats[col] ??= new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.9 }));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, H, 0.2), m);
      mesh.position.set((wl.x1 + wl.x2) / 2, H / 2, (wl.y1 + wl.y2) / 2);
      mesh.rotation.y = -Math.atan2(wl.y2 - wl.y1, wl.x2 - wl.x1); g.add(mesh);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x37474f }));
      e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); g.add(e);
    }
    // antennas on the ceiling, with a drop line to the floor
    const am = new THREE.MeshLambertMaterial({ color: 0xc62828 }), ag = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 20);
    for (const a of d.antennas) {
      const s = new THREE.Mesh(ag, am); s.position.set(a.x, H - 0.1, a.y); g.add(s);
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, H - 0.1, a.y), new THREE.Vector3(a.x, 0.02, a.y)]), new THREE.LineDashedMaterial({ color: 0xc62828, dashSize: 0.2, gapSize: 0.15 }));
      ln.computeLineDistances(); g.add(ln);
    }
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.target.set(0, 0, 0); ctl.maxPolarAngle = Math.PI / 2.05; ctl.update();
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); renderer.render(scene, cam); }; loop();
    const onResize = () => { const nw = el.clientWidth; const nh = Math.max(340, Math.min(560, nw * 0.6)); cam.aspect = nw / nh; cam.updateProjectionMatrix(); renderer.setSize(nw, nh); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); ctl.dispose(); tex.dispose(); renderer.dispose(); scene.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); }); };
  }, [d.walls, d.antennas, d.widthM, d.heightM, grid]);
  return <div ref={mount} className="bldg3d indoor3d" aria-label="3D view of the walls and coverage" />;
}
