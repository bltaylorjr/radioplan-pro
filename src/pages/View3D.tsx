import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../store';
import { Card, Field, Num, Check } from '../components/ui';
import { fetchDemArea, sampleDem, demBounds, buildProfile, analyzeProfile } from '../engine/terrain';
import { fresnelRadiusM } from '../engine/rf';
import { haversineKm } from '../engine/geo';

function colorFor(t: number) { // green lowlands -> brown -> white peaks
  const c = new THREE.Color();
  if (t < 0.5) c.setRGB(0.25 + t * 0.6, 0.5 + t * 0.3, 0.2); else c.setRGB(0.55 + (t - 0.5) * 0.9, 0.45 + (t - 0.5) * 1.0, 0.3 + (t - 0.5) * 1.3);
  return c;
}

export default function View3DPage() {
  const { project: p, rt, setRt } = useStore();
  const mount = useRef<HTMLDivElement>(null);
  const [exag, setExag] = useState(3);
  const [showF, setShowF] = useState(true);
  const [msg, setMsg] = useState('');
  const tx = p.sites.find((s) => s.id === p.radio.txSiteId) ?? p.sites[0];
  const rx = p.sites.find((s) => s.id === p.radio.rxSiteId) ?? p.sites[1];

  const fetchArea = async () => {
    setMsg('Fetching online terrain…');
    try {
      const c = rx ? { lat: (tx.lat + rx.lat) / 2, lon: (tx.lon + rx.lon) / 2 } : tx;
      const rad = rx ? Math.max(3, haversineKm(tx, rx) * 0.75) : 8;
      const g = await fetchDemArea(c, rad, 60);
      setRt((r) => ({ ...r, dem: g })); setMsg(`Loaded ${g.source}.`);
    } catch (e) { setMsg(`Failed: ${(e as Error).message}`); }
  };

  useEffect(() => {
    const el = mount.current; if (!el || !rt.dem) return;
    const dem = rt.dem, b = demBounds(dem);
    const lat0 = (b.north + b.south) / 2, lon0 = (b.east + b.west) / 2;
    const mx = (lon: number) => (lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180);
    const mz = (lat: number) => -(lat - lat0) * 110540;
    const N = Math.min(160, Math.max(dem.ncols, dem.nrows));
    const widthM = mx(b.east) - mx(b.west), depthM = mz(b.south) - mz(b.north);
    let zmin = Infinity, zmax = -Infinity;
    const zs: number[] = [];
    for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) {
      const z = sampleDem(dem, { lat: b.north - ((b.north - b.south) * r) / N, lon: b.west + ((b.east - b.west) * c) / N }) ?? 0;
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
    for (let i = 0; i < pos.count; i++) { pos.setY(i, (zs[i] - zmin) * exag); colorFor((zs[i] - zmin) / Math.max(1, zmax - zmin)).toArray(cols, i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    scene.add(new THREE.AmbientLight(0xffffff, 0.55)); const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(-1, 2, 1); scene.add(sun);
    const top = (s: typeof tx) => { const g = sampleDem(dem, s) ?? s.groundElevM ?? zmin; return new THREE.Vector3(mx(s.lon), (g - zmin) * exag + s.antennaAglM * exag, mz(s.lat)); };
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
    if (rx && tx && sampleDem(dem, tx) != null && sampleDem(dem, rx) != null) {
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
    const span = Math.max(widthM, depthM);
    camera.position.set(-span * 0.4, span * 0.5, span * 0.7);
    const ctl = new OrbitControls(camera, renderer.domElement); ctl.target.set(0, (zmax - zmin) * exag * 0.3, 0); ctl.update();
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); renderer.render(scene, camera); }; loop();
    const onR = () => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    window.addEventListener('resize', onR);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onR); ctl.dispose(); renderer.dispose(); geo.dispose(); };
  }, [rt.dem, rt.profile, exag, showF, p.sites, p.radio.fMHz, tx, rx]);

  return (
    <Card title="3D terrain model" tip="Drag to orbit · right-drag to pan · scroll to zoom">
      <div className="form">
        <Field label="Vertical exaggeration"><Num value={exag} onChange={(v) => setExag(Math.max(1, Math.min(20, v!)))} unit="×" /></Field>
        <Field label="Overlays"><Check value={showF} onChange={setShowF} label="First Fresnel zone" /></Field>
        <Field label="Terrain"><span className="row"><span className="muted">{rt.dem ? rt.dem.source : 'none loaded'}</span><button onClick={fetchArea}>🌐 Fetch online terrain</button></span></Field>
      </div>
      {msg && <p className="note">{msg}</p>}
      {rt.dem ? <div ref={mount} className="three" /> : <div className="three empty">Load terrain on <a href="#terrain">Map & Terrain</a> or click <b>Fetch online terrain</b>.</div>}
      <p className="small muted">Towers: red = TX, blue = RX. Path line turns red when the path profile fails 60% Fresnel clearance.</p>
    </Card>
  );
}
