import React, { useEffect, useRef } from 'react';
import { FullView } from './FullView';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { sampleDem, demBounds, buildProfile, analyzeProfile, DemGrid, ProfileAnalysis } from '../engine/terrain';
import { fresnelRadiusM } from '../engine/rf';
import { haversineKm, LatLon } from '../engine/geo';
import type { Site } from '../types';
import { siteLabel, type CommSite } from '../engine/towers';
import { drapeUv, type Drape } from '../engine/drape';
import type { Obstruction } from '../engine/los';
import { rssiColor } from '../engine/coverage';

export interface PathPoint { name: string; lat: number; lon: number; aglM: number }

/** Mesh resolution used for a DEM (vertices per side = meshN + 1). Viewshed grids must use the same value. */
export const meshN = (dem: DemGrid) => Math.min(160, Math.max(dem.ncols, dem.nrows));

function labelSprite(txt: string, bg: string, fg: string, widthM: number, scale = 5) {
  const font = 'bold 26px sans-serif', probe = document.createElement('canvas').getContext('2d')!; probe.font = font;
  const W = Math.ceil(probe.measureText(txt).width + 16);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = 56; const cx = cv.getContext('2d')!;
  cx.fillStyle = bg; cx.fillRect(0, 0, W, 56); cx.font = font; cx.fillStyle = fg; cx.fillText(txt, 8, 37);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  spr.center.set(0, 0); spr.scale.set(widthM / scale * W / 384, widthM / scale * 56 / 384, 1); return spr;
}

function colorFor(t: number) { // green lowlands -> brown -> pale peaks
  const c = new THREE.Color();
  if (t < 0.5) c.setRGB(0.25 + t * 0.6, 0.5 + t * 0.3, 0.2); else c.setRGB(0.55 + (t - 0.5) * 0.9, 0.45 + (t - 0.5) * 1.0, 0.3 + (t - 0.5) * 1.3);
  return c;
}

export interface Terrain3DProps {
  dem: DemGrid; sites: Site[]; txId?: string; rxId?: string; fMHz: number; kFactor: number; clutterM: number;
  exag: number; showFresnel: boolean; profile?: ProfileAnalysis | null; marker?: LatLon | null; height?: number;
  /** Existing towers / comm sites (OpenStreetMap) to stand up on the terrain with a label. */
  comm?: CommSite[];
  /** Satellite / topo picture draped over the terrain (otherwise colored by height). */
  drape?: Drape | null;
  /** Camera tilt in degrees: 0 = looking straight down like a map, 80 = almost level with the ground. */
  tilt?: number;
  /** Called when the person tilts the view by dragging, so a tilt slider can follow. */
  onTilt?: (deg: number) => void;
  /** Visible (1) / hidden (0) per mesh vertex, (meshN+1)² values, row 0 = north. Hidden ground is shaded red. */
  viewshed?: Uint8Array | null;
  /** Points along the path where terrain blocks the line of sight or crowds the Fresnel zone. */
  obstructions?: (Obstruction & { from?: string })[];
  /** A radio path you plotted: point A, any relay (bounce) points, point B. Replaces the TX→RX line when given. */
  /** Lines drawn on the map, laid on the ground; one CSS color per point (e.g. by predicted signal). */
  routes?: { pts: LatLon[]; colors: string[] }[];
  /** Predicted signal (dBm) per mesh vertex, (meshN+1)² values, painted over the ground as a heat map. */
  heat?: Float32Array | null;
  /** Antenna beam: a see-through wedge from the antenna out to where each part of the beam meets the ground. */
  beam?: { lat: number; lon: number; aglM: number; azimuthDeg: number; tiltDeg: number; hBwDeg: number; vBwDeg: number; maxKm: number } | null;
  /** Tap / click on the ground: gives the spot's latitude and longitude (used to plot path points). */
  onPick?: (p: LatLon) => void;
  path?: { points: PathPoint[]; hops: { ok: boolean; los: boolean }[] } | null;
  /** Formats a height in metres and a distance in km in the person's units (labels on obstructions). */
  fmtLen?: (m: number) => string; fmtDist?: (km: number) => string;
}

/** Put the camera at `deg` from straight down (0) toward level (88), keeping its compass direction and distance. */
function setTilt(camera: THREE.PerspectiveCamera, ctl: OrbitControls, deg: number, dist?: number) {
  const off = camera.position.clone().sub(ctl.target), sph = new THREE.Spherical().setFromVector3(off);
  sph.phi = (Math.max(0.5, Math.min(88, deg)) * Math.PI) / 180; if (dist) sph.radius = dist;
  if (deg < 3) sph.theta = 0; // straight down: north at the top, like the flat map
  sph.makeSafe();
  camera.position.copy(ctl.target.clone().add(new THREE.Vector3().setFromSpherical(sph)));
}

/** Interactive three.js terrain model with towers, the radio path and the first Fresnel zone. */
export function Terrain3D(props: Terrain3DProps) {
  const mount = useRef<HTMLDivElement>(null);
  const { dem, sites, fMHz, exag, marker, comm, drape, viewshed, obstructions, routes, heat, beam } = props;
  const cam = useRef<{ camera: THREE.PerspectiveCamera; ctl: OrbitControls } | null>(null);
  const saved = useRef<{ dem: DemGrid; pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const tiltRef = useRef(props.tilt); tiltRef.current = props.tilt;
  const onTiltRef = useRef(props.onTilt); onTiltRef.current = props.onTilt;
  const onPickRef = useRef(props.onPick); onPickRef.current = props.onPick;
  const fmtLen = props.fmtLen ?? ((m: number) => `${Math.round(m / 0.3048)} ft`);
  const fmtDist = props.fmtDist ?? ((km: number) => `${(km / 1.609344).toFixed(2)} mi`);
  const showF = props.showFresnel;
  const tx = sites.find((s) => s.id === props.txId) ?? sites[0];
  const rx = sites.find((s) => s.id === props.rxId && s.id !== tx?.id);
  const p = { sites, radio: { fMHz, kFactor: props.kFactor, clutterM: props.clutterM } };
  const rt = { dem, profile: props.profile ?? null };
  useEffect(() => {
    const el = mount.current; if (!el || !rt.dem) return;
    const dem = rt.dem, b = demBounds(dem);
    const lat0 = (b.north + b.south) / 2, lon0 = (b.east + b.west) / 2;
    const mx = (lon: number) => (lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180);
    const mz = (lat: number) => -(lat - lat0) * 110540;
    const N = meshN(dem);
    const widthM = mx(b.east) - mx(b.west), depthM = mz(b.south) - mz(b.north);
    let zmin = Infinity, zmax = -Infinity;
    const zs: number[] = [];
    for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) {
      // sample half a cell inside the edges so the border does not fall off the grid (that drew walls down to 0 m)
      const iy = (dem.cellDegY ?? dem.cellDeg) / 2, ix = dem.cellDeg / 2;
      const q = { lat: Math.min(b.north - iy, Math.max(b.south + iy, b.north - ((b.north - b.south) * r) / N)), lon: Math.min(b.east - ix, Math.max(b.west + ix, b.west + ((b.east - b.west) * c) / N)) };
      const z = sampleDem(dem, q) ?? (zs.length ? zs[zs.length - 1] : 0);
      zs.push(z); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
    }
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdfe9f3);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 10, 1e6);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(el.clientWidth, el.clientHeight); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    el.innerHTML = ''; el.appendChild(renderer.domElement);
    const geo = new THREE.PlaneGeometry(widthM, depthM, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    const uvs = drape ? new Float32Array(pos.count * 2) : null;
    const vsOk = viewshed && viewshed.length === pos.count;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, (zs[i] - zmin) * exag);
      const c = drape ? new THREE.Color(1, 1, 1) : colorFor((zs[i] - zmin) / Math.max(1, zmax - zmin));
      if (heat && heat.length === pos.count) { const h = rssiColor(heat[i], -125); if (h[3]) c.lerp(new THREE.Color(h[0] / 255, h[1] / 255, h[2] / 255), 0.65); }
      if (vsOk && !viewshed![i]) c.multiply(new THREE.Color(1, 0.38, 0.38)); // hidden from the transmitter: red shade
      c.toArray(cols, i * 3);
      if (uvs) { const r = Math.floor(i / (N + 1)), cc = i % (N + 1); uvs.set(drapeUv(drape!, b.north - ((b.north - b.south) * r) / N, b.west + ((b.east - b.west) * cc) / N), i * 2); }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
    if (uvs) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    let tex: THREE.Texture | null = null;
    if (drape) { tex = new THREE.CanvasTexture(drape.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: tex }));
    scene.add(ground);
    // a tap (not a drag) on the ground reports where it landed
    let down: { x: number; y: number } | null = null;
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const pu = (e: PointerEvent) => {
      if (!down || !onPickRef.current || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
      down = null; const rc = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), camera);
      const hit = ray.intersectObject(ground)[0]; if (!hit) return;
      onPickRef.current({ lat: lat0 - hit.point.z / 110540, lon: lon0 + hit.point.x / (111320 * Math.cos((lat0 * Math.PI) / 180)) });
    };
    renderer.domElement.addEventListener('pointerdown', pd); renderer.domElement.addEventListener('pointerup', pu);
    scene.add(new THREE.AmbientLight(0xffffff, drape ? 1.6 : 0.55)); const sun = new THREE.DirectionalLight(0xffffff, drape ? 1.1 : 0.9); sun.position.set(-1, 2, 1); scene.add(sun);
    const top = (s: typeof tx) => { const g = sampleDem(dem, s) ?? s.groundElevM ?? zmin; return new THREE.Vector3(mx(s.lon), (g - zmin) * exag + s.antennaAglM * exag, mz(s.lat)); };
    const path = props.path;
    p.sites.forEach((s) => {
      const g = sampleDem(dem, s); if (g == null) return;
      const hgt = s.structureHeightM * exag;
      const col = s.id === tx.id ? 0xc62828 : s.id === rx?.id ? 0x1565c0 : 0x555555;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(widthM / 700, widthM / 350, hgt, 8), new THREE.MeshLambertMaterial({ color: col }));
      m.position.set(mx(s.lon), (g - zmin) * exag + hgt / 2, mz(s.lat)); scene.add(m);
      // Marker + label so sites stay visible at regional scale
      const ball = new THREE.Mesh(new THREE.SphereGeometry(widthM / 150, 16, 12), new THREE.MeshLambertMaterial({ color: col }));
      ball.position.set(mx(s.lon), (g - zmin) * exag + hgt, mz(s.lat)); scene.add(ball);
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const cx = cv.getContext('2d')!;
      cx.fillStyle = 'rgba(255,255,255,.85)'; cx.fillRect(0, 0, 256, 64); cx.fillStyle = '#111'; cx.font = 'bold 30px sans-serif'; cx.fillText(s.name.slice(0, 14), 8, 42);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
      spr.scale.set(widthM / 7, widthM / 28, 1); spr.position.set(mx(s.lon), (g - zmin) * exag + hgt + widthM / 30, mz(s.lat)); scene.add(spr);
    });
    if (!path && rx && tx && tx !== rx && sampleDem(dem, tx) != null && sampleDem(dem, rx) != null) {
      const a = top(tx), c = top(rx);
      const ok = (rt.profile ?? analyzeProfile(buildProfile(tx, rx, 120, (q) => sampleDem(dem, q)), tx.antennaAglM, rx.antennaAglM, p.radio.fMHz, p.radio.kFactor, p.radio.clutterM)).meets60;
      const beam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, c), 2, widthM / 900, 6), new THREE.MeshBasicMaterial({ color: ok ? 0x2e7d32 : 0xc62828 }));
      scene.add(beam);
      if (showF) {
        const D = haversineKm(tx, rx), r1 = fresnelRadiusM(D / 2, D / 2, p.radio.fMHz);
        const len = a.distanceTo(c);
        const e = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshLambertMaterial({ color: 0x42a5f5, transparent: true, opacity: 0.25, depthWrite: false }));
        e.scale.set(len / 2, r1 * exag, r1);
        e.position.copy(a.clone().add(c).multiplyScalar(0.5));
        e.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), c.clone().sub(a).normalize());
        scene.add(e);
      }
    }
    if (path && path.points.length) {
      // plotted path: masts at A, relays and B, one beam per hop (green = clear, orange = Fresnel crowded, red = blocked)
      const ptop = (q: PathPoint) => { const g = sampleDem(dem, q) ?? zmin; return new THREE.Vector3(mx(q.lon), (g - zmin) * exag + q.aglM * exag, mz(q.lat)); };
      path.points.forEach((q, i) => {
        const g = sampleDem(dem, q); if (g == null) return;
        const last = i === path.points.length - 1, col = i === 0 ? 0xc62828 : last ? 0x1565c0 : 0xef6c00;
        const hgt = Math.max(widthM / 120, q.aglM * exag);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(widthM / 700, widthM / 350, hgt, 8), new THREE.MeshLambertMaterial({ color: col }));
        m.position.set(mx(q.lon), (g - zmin) * exag + hgt / 2, mz(q.lat)); scene.add(m);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(widthM / 150, 16, 12), new THREE.MeshLambertMaterial({ color: col }));
        ball.position.set(mx(q.lon), (g - zmin) * exag + hgt, mz(q.lat)); scene.add(ball);
        const spr = labelSprite(q.name.slice(0, 28), 'rgba(255,255,255,.95)', '#111', widthM, 4.5); spr.renderOrder = 10;
        spr.position.set(mx(q.lon), (g - zmin) * exag + hgt + widthM / 60, mz(q.lat)); scene.add(spr);
      });
      for (let i = 0; i + 1 < path.points.length; i++) {
        const a = path.points[i], c = path.points[i + 1], h = path.hops[i];
        if (sampleDem(dem, a) == null || sampleDem(dem, c) == null) continue;
        const va = ptop(a), vc = ptop(c);
        const color = h?.ok ? 0x2e7d32 : h?.los ? 0xff8f00 : 0xd50000;
        scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(va, vc), 2, widthM / 900, 6), new THREE.MeshBasicMaterial({ color })));
        if (showF) {
          const D = haversineKm(a, c), r1 = fresnelRadiusM(D / 2, D / 2, p.radio.fMHz), len = va.distanceTo(vc);
          const e = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshLambertMaterial({ color: 0x42a5f5, transparent: true, opacity: 0.22, depthWrite: false }));
          e.scale.set(len / 2, r1 * exag, r1); e.position.copy(va.clone().add(vc).multiplyScalar(0.5));
          e.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), vc.clone().sub(va).normalize()); scene.add(e);
        }
      }
    }
    if (obstructions?.length && (path || (rx && tx))) {
      // red posts where the ground (plus trees / buildings and earth curve) blocks or crowds the radio path
      obstructions.forEach((o, i) => {
        const g = sampleDem(dem, o); if (g == null) return;
        const base = (g - zmin) * exag, topY = Math.max(base + widthM / 200, (o.topM - zmin) * exag);
        const bad = o.kind === 'blocks', col = bad ? 0xd50000 : 0xff8f00;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(widthM / 450, widthM / 450, topY - base + widthM / 80, 10), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
        post.position.set(mx(o.lon), (base + topY + widthM / 80) / 2, mz(o.lat)); scene.add(post);
        const hit = new THREE.Mesh(new THREE.SphereGeometry(widthM / 260, 16, 12), new THREE.MeshBasicMaterial({ color: col }));
        hit.position.set(mx(o.lon), (o.beamM - zmin) * exag, mz(o.lat)); scene.add(hit);
        if (i < 4) {
          const txt = bad ? `⚠ Blocked: ground ${fmtLen(o.byM)} above the beam, ${fmtDist(o.dKm)} from ${o.from ?? 'TX'}` : `⚠ Fresnel ${Math.round(o.clearancePct)}%: ground ${fmtLen(o.byM)} below the beam, ${fmtDist(o.dKm)} from ${o.from ?? 'TX'}`;
          const spr = labelSprite(txt, bad ? 'rgba(255,235,238,.95)' : 'rgba(255,243,224,.95)', bad ? '#b71c1c' : '#e65100', widthM, 4);
          spr.position.set(mx(o.lon), Math.max(topY, (o.beamM - zmin) * exag) + widthM / 60, mz(o.lat)); scene.add(spr);
        }
      });
    }
    routes?.forEach((rt) => { // drawn lines: a colored tube just above the ground
      const pts: THREE.Vector3[] = [], cs: THREE.Color[] = [];
      rt.pts.forEach((q, i) => { const g = sampleDem(dem, q); if (g == null) return; pts.push(new THREE.Vector3(mx(q.lon), (g - zmin) * exag + widthM / 250, mz(q.lat))); cs.push(new THREE.Color(rt.colors[i] ?? '#7b1fa2')); });
      if (pts.length < 2) return;
      const R = 6, tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), pts.length - 1, widthM / 500, R, false);
      const col = new Float32Array(tube.attributes.position.count * 3);
      for (let ring = 0; ring < pts.length; ring++) for (let j = 0; j <= R; j++) { const k = ring * (R + 1) + j; if (k * 3 < col.length) cs[ring].toArray(col, k * 3); }
      tube.setAttribute('color', new THREE.BufferAttribute(col, 3));
      scene.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ vertexColors: true })));
    });
    if (beam) { // the antenna beam: rays across the horizontal and vertical beamwidth, each stopped where it meets the ground
      const g0 = sampleDem(dem, beam) ?? zmin, apexM = g0 + beam.aglM, ax = mx(beam.lon), az = mz(beam.lat);
      const omni = beam.hBwDeg >= 360, nA = omni ? 49 : 15, nE = 5, step = Math.max(10, widthM / 300), maxM = beam.maxKm * 1000;
      const ground = (x: number, z: number) => sampleDem(dem, { lat: lat0 - z / 110540, lon: lon0 + x / (111320 * Math.cos((lat0 * Math.PI) / 180)) });
      const cast = (azDeg: number, downDeg: number) => {
        const a = (azDeg * Math.PI) / 180, e = (downDeg * Math.PI) / 180, hx = Math.sin(a) * Math.cos(e), hz = -Math.cos(a) * Math.cos(e), vy = -Math.sin(e);
        let t = step, hit = false;
        for (; t <= maxM; t += step) { const g = ground(ax + hx * t, az + hz * t); if (g == null) break; if (apexM + vy * t <= g) { hit = true; break; } }
        t = Math.min(t, maxM);
        return { v: new THREE.Vector3(ax + hx * t, (apexM + vy * t - zmin) * exag, az + hz * t), hit };
      };
      const apex = new THREE.Vector3(ax, (apexM - zmin) * exag, az);
      const grid: { v: THREE.Vector3; hit: boolean }[][] = [];
      for (let i = 0; i < nA; i++) {
        const azd = omni ? (360 * i) / (nA - 1) : beam.azimuthDeg - beam.hBwDeg / 2 + (beam.hBwDeg * i) / (nA - 1);
        const row: { v: THREE.Vector3; hit: boolean }[] = [];
        for (let j = 0; j < nE; j++) row.push(cast(azd, beam.tiltDeg - beam.vBwDeg / 2 + (beam.vBwDeg * j) / (nE - 1)));
        grid.push(row);
      }
      const vs: number[] = [], tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => vs.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      for (let i = 0; i + 1 < nA; i++) {
        for (let j = 0; j + 1 < nE; j++) { if (!grid[i][j].hit && !grid[i + 1][j].hit && !grid[i][j + 1].hit && !grid[i + 1][j + 1].hit) continue; // no wall in the air where the beam never comes down
          tri(grid[i][j].v, grid[i + 1][j].v, grid[i + 1][j + 1].v); tri(grid[i][j].v, grid[i + 1][j + 1].v, grid[i][j + 1].v); }
        tri(apex, grid[i][0].v, grid[i + 1][0].v); tri(apex, grid[i][nE - 1].v, grid[i + 1][nE - 1].v);
      }
      if (!omni) for (const i of [0, nA - 1]) for (let j = 0; j + 1 < nE; j++) tri(apex, grid[i][j].v, grid[i][j + 1].v);
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3)); wg.computeVertexNormals();
      const wedge = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: 0x43a047, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })); wedge.renderOrder = 5; scene.add(wedge);
      // footprint outline on the ground and the main-beam line
      for (const j of [0, nE - 1]) { const run = grid.map((r) => r[j]); if (run.every((q) => q.hit)) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(run.map((q) => q.v)), new THREE.LineBasicMaterial({ color: 0x1b5e20 }))); }
      const mid = cast(beam.azimuthDeg, beam.tiltDeg);
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(apex, mid.v), 2, widthM / 900, 6), new THREE.MeshBasicMaterial({ color: 0x1b5e20 })));
      if (mid.hit) { const dot = new THREE.Mesh(new THREE.SphereGeometry(widthM / 200, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffeb3b })); dot.position.copy(mid.v); scene.add(dot);
        const spr = labelSprite(`Main beam meets the ground ${fmtDist(Math.hypot(mid.v.x - ax, mid.v.z - az) / 1000)} out`, 'rgba(232,245,233,.95)', '#1b5e20', widthM, 4.5); spr.renderOrder = 10; spr.position.set(mid.v.x, mid.v.y + widthM / 60, mid.v.z); scene.add(spr); }
    }
    if (comm?.length) {
      // existing towers: purple masts; the 15 nearest the middle (named ones first) get labels so the view stays readable
      const inside = comm.filter((c) => c.lat <= b.north && c.lat >= b.south && c.lon >= b.west && c.lon <= b.east);
      const byMid = [...inside].sort((a, c) => (mx(a.lon) ** 2 + mz(a.lat) ** 2) - (mx(c.lon) ** 2 + mz(c.lat) ** 2));
      const mastMat = new THREE.MeshLambertMaterial({ color: 0x6a1b9a }), headMat = new THREE.MeshLambertMaterial({ color: 0xab47bc });
      const labeled = new Set([...byMid.filter((c) => c.name || c.operator), ...byMid].slice(0, 15).map((c) => c.id));
      byMid.forEach((c) => {
        const g = sampleDem(dem, c); if (g == null) return;
        const hM = Math.max(widthM / 60, (c.heightFt ? c.heightFt * 0.3048 : 30) * exag);
        const base = (g - zmin) * exag;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(widthM / 1400, widthM / 600, hM, 6), mastMat); mast.position.set(mx(c.lon), base + hM / 2, mz(c.lat)); scene.add(mast);
        const head = new THREE.Mesh(new THREE.OctahedronGeometry(widthM / 220), headMat); head.position.set(mx(c.lon), base + hM, mz(c.lat)); scene.add(head);
        if (!labeled.has(c.id)) return;
        const txt = siteLabel(c).slice(0, 24);
        const cv = document.createElement('canvas'); cv.width = 384; cv.height = 56; const cx = cv.getContext('2d')!;
        cx.font = 'bold 26px sans-serif'; const tw = Math.min(380, cx.measureText(txt).width + 16);
        cx.fillStyle = 'rgba(243,229,245,.92)'; cx.fillRect(0, 0, tw, 56); cx.fillStyle = '#4a148c'; cx.fillText(txt, 8, 37);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
        spr.center.set(0, 0); spr.scale.set(widthM / 5, widthM / 5 * 56 / 384, 1); spr.position.set(mx(c.lon), base + hM + widthM / 120, mz(c.lat)); scene.add(spr);
      });
    }
    if (marker) {
      const g = sampleDem(dem, marker);
      if (g != null) {
        const pin = new THREE.Mesh(new THREE.ConeGeometry(widthM / 120, widthM / 30, 16), new THREE.MeshLambertMaterial({ color: 0xef6c00 }));
        pin.rotation.x = Math.PI; pin.position.set(mx(marker.lon), (g - zmin) * exag + widthM / 60, mz(marker.lat)); scene.add(pin);
      }
    }
    const span = Math.max(widthM, depthM);
    camera.position.set(-span * 0.4, span * 0.5, span * 0.7);
    const ctl = new OrbitControls(camera, renderer.domElement); ctl.target.set(0, (zmax - zmin) * exag * 0.3, 0);
    ctl.maxPolarAngle = Math.PI * 0.49; // keep the camera above the ground
    if (saved.current && saved.current.dem === dem) { camera.position.copy(saved.current.pos); ctl.target.copy(saved.current.target); }
    else if (tiltRef.current != null) setTilt(camera, ctl, tiltRef.current, span * 1.05);
    ctl.update();
    cam.current = { camera, ctl };
    ctl.addEventListener('end', () => onTiltRef.current?.(Math.round((ctl.getPolarAngle() * 180) / Math.PI)));
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); renderer.render(scene, camera); }; loop();
    const onR = () => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    window.addEventListener('resize', onR);
    return () => { saved.current = { dem, pos: camera.position.clone(), target: ctl.target.clone() }; cam.current = null; cancelAnimationFrame(raf); window.removeEventListener('resize', onR); ctl.dispose(); renderer.dispose(); geo.dispose(); tex?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dem, props.profile, exag, showF, sites, fMHz, props.txId, props.rxId, marker?.lat, marker?.lon, comm, drape, viewshed, obstructions, props.path, routes, heat, beam?.lat, beam?.lon, beam?.aglM, beam?.azimuthDeg, beam?.tiltDeg, beam?.hBwDeg, beam?.vBwDeg, beam?.maxKm]);
  useEffect(() => { // tilt slider: swing the camera up or down around the same point, keeping direction and distance
    const c = cam.current; if (!c || props.tilt == null) return;
    if (Math.abs((c.ctl.getPolarAngle() * 180) / Math.PI - props.tilt) < 0.5) return;
    setTilt(c.camera, c.ctl, props.tilt); c.ctl.update();
  }, [props.tilt]);
  return <FullView title="3D terrain model"><div ref={mount} className="three" style={props.height ? { height: props.height } : undefined} /></FullView>;
}
