import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useUnits } from '../units';
import { Num } from './ui';
import { AddressInput } from './AddressInput';
import { AzLine } from './Azimuth';
import { useDrawnLines, useLineAnalysis, signalColor } from './RouteTools';
import { predictPoint } from '../engine/coverage';
import { Terrain3D, meshN, type PathPoint } from './Terrain3D';
import { BASEMAPS } from './basemaps';
import { LayerList, type LayerItem } from './ViewControls';
import { buildDrape, type Drape } from '../engine/drape';
import { downloadTerrain, boundsAround, demCovers, type Bounds } from '../engine/autoterrain';
import { bundledDem, cropDem } from '../engine/bundledTerrain';
import { sampleDem, demBounds, buildProfile, analyzeProfile, type DemGrid, type ProfileAnalysis } from '../engine/terrain';
import { findObstructions, viewshedGrid, visible, type Obstruction } from '../engine/los';
import { haversineKm, type LatLon } from '../engine/geo';
import { parseLatLon } from '../engine/locparse';
import { geocodeAddress } from '../engine/geocode';
import { refSearch } from '../engine/refdata';
import { loadCommSites, type CommSite } from '../engine/towers';
import type { Site } from '../types';

type Imagery = 'sat' | 'hybrid' | 'topo' | 'none';
const IMAGERY: Record<Imagery, { label: string; sources: string[] }> = {
  sat: { label: 'Satellite', sources: ['Satellite (Esri, high-res)', 'Satellite (USGS Imagery)', 'Satellite + Topo (USGS)'] },
  hybrid: { label: 'Satellite + topo', sources: ['Satellite + Topo (USGS)', 'Satellite (USGS Imagery)', 'Satellite (Esri, high-res)'] },
  topo: { label: 'Topo map', sources: ['USGS Topo', 'Topographic (OpenTopoMap)'] },
  none: { label: 'Height colors', sources: [] },
};
const TILTS: [string, number][] = [['Straight down', 1], ['Tilted', 50], ['Low angle', 72]];

interface Pt extends PathPoint { text: string }
const LS = 'radioplan.tiltpath';
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const fmtLL = (p: LatLon) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;

function heightColor(t: number): [number, number, number] {
  return t < 0.5 ? [64 + t * 153, 128 + t * 77, 51] : [140 + (t - 0.5) * 230, 115 + (t - 0.5) * 255, 77 + (t - 0.5) * 330];
}

/** Turn typed text into a spot: GPS coordinates (decimal or degrees-minutes-seconds) first, then an address.
 *  Addresses use the saved / built-in place list when offline and the map search when online. */
async function locate(text: string): Promise<(LatLon & { label: string }) | null> {
  const ll = parseLatLon(text); if (ll) return { ...ll, label: fmtLL(ll) };
  if (navigator.onLine !== false) { try { const g = await geocodeAddress(text); if (g[0]) return g[0]; } catch { /* offline: fall back below */ } }
  const r = refSearch(text, 1)[0]; return r ?? null;
}

/** 3D tilt view of the map: terrain with satellite or topo imagery on top, a tilt slider, a radio path you plot
 *  (A, relay points, B) and the spots where terrain blocks the line of sight. Works offline with saved data. */
export default function TiltView({ view, sites, txId, rxId, dem: projectDem, height = 520 }: {
  view: Bounds | null; sites: Site[]; txId?: string; rxId?: string; dem?: DemGrid | null; base?: string; height?: number;
}) {
  const { project: p } = useStore();
  const u = useUnits();
  const [imagery, setImageryS] = useState<Imagery>(() => load<Imagery>('radioplan.tiltimg', 'sat'));
  const setImagery = (v: Imagery) => { setImageryS(v); save('radioplan.tiltimg', v); };
  const [tilt, setTilt] = useState(55);
  const [exag, setExag] = useState(2);
  const [showLos, setShowLos] = useState(true);
  const [showView, setShowView] = useState(false);
  const [showF, setShowF] = useState(true);
  const [showT, setShowT] = useState(false);
  const [showPh, setShowPh] = useState(true);
  const [placing, setPlacing] = useState<number | null>(null);
  const tx = sites.find((s) => s.id === txId) ?? sites[0], rx = sites.find((s) => s.id === rxId && s.id !== tx?.id);
  const [pts, setPtsS] = useState<Pt[]>(() => {
    const saved = load<Pt[] | null>(LS + '.' + p.meta?.name, null);
    if (saved?.length) return saved;
    const out: Pt[] = [];
    if (tx) out.push({ name: `A: ${tx.name}`, lat: tx.lat, lon: tx.lon, aglM: tx.antennaAglM, text: fmtLL(tx) });
    if (rx) out.push({ name: `B: ${rx.name}`, lat: rx.lat, lon: rx.lon, aglM: rx.antennaAglM, text: fmtLL(rx) });
    return out;
  });
  const setPts = (f: (x: Pt[]) => Pt[]) => setPtsS((x) => { const n = f(x); save(LS + '.' + p.meta?.name, n); return n; });
  const [msg, setMsg] = useState('');
  const [dem, setDem] = useState<DemGrid | null>(null);
  const [drape, setDrape] = useState<Drape | null>(null);
  const [comm, setComm] = useState<CommSite[]>([]);

  // Area shown: the whole plotted path (when it has two or more points), otherwise what the map was showing.
  const area = useMemo<Bounds | null>(() => {
    if (pts.length >= 2) { const span = Math.max(...pts.slice(1).map((q, i) => haversineKm(pts[i], q))); return boundsAround(pts, Math.max(1.5, span * 0.2)); }
    if (view) return view;
    const c = tx ?? { lat: 35.5951, lon: -82.5515 }; return boundsAround([c], 8); // default: Asheville, NC
  }, [JSON.stringify(pts.map((q) => [q.lat.toFixed(4), q.lon.toFixed(4)])), view?.north, view?.south, view?.east, view?.west]); // eslint-disable-line react-hooks/exhaustive-deps

  // Terrain for the area: the project's terrain if it covers it, otherwise saved / downloaded tiles, otherwise the built-in Asheville terrain.
  useEffect(() => {
    if (!area) return; let live = true;
    (async () => {
      if (projectDem && demCovers(projectDem, area)) { setDem(cropDem(projectDem, area) ?? projectDem); setMsg(''); return; }
      setMsg('Loading terrain…');
      try {
        const r = await downloadTerrain(area, { maxTiles: 64, retries: navigator.onLine === false ? 1 : 2 });
        if (r.missingTiles) throw new Error('part missing');
        if (live) { setDem(r.dem); setMsg(''); } return;
      } catch { /* try the built-in terrain */ }
      const b = await bundledDem(); const c = b && cropDem(b, area);
      if (!live) return;
      if (c) { setDem(c); setMsg(navigator.onLine === false ? 'Offline: using the built-in Asheville-area terrain.' : ''); }
      else setMsg('No terrain saved for this area yet. Connect to the internet once with this area showing and it is saved for offline use.');
    })();
    return () => { live = false; };
  }, [area, projectDem]);

  // Imagery draped over the terrain (cached tiles first, so it works offline where the map was viewed or saved before).
  useEffect(() => {
    if (!dem) return; const ac = new AbortController(); const b = demBounds(dem);
    const sources = IMAGERY[imagery].sources.map((n) => ({ name: n, ...BASEMAPS[n] })).filter((s) => s.url);
    if (!sources.length) { setDrape(null); return; }
    let zmin = Infinity, zmax = -Infinity; for (const z of dem.data) if (Number.isFinite(z) && z !== dem.nodata) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
    buildDrape(b, sources, {
      maxTiles: 160, signal: ac.signal,
      under: (ctx, d) => { // height colors under any tile that is not saved, so the view is never blank
        const step = 4; for (let y = 0; y < d.ny * 256; y += step) for (let x = 0; x < d.nx * 256; x += step) {
          const lon = ((d.x0 + x / 256) / 2 ** d.z) * 360 - 180, n = Math.PI - (2 * Math.PI * (d.y0 + y / 256)) / 2 ** d.z, lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
          const z = sampleDem(dem, { lat, lon }); if (z == null) continue;
          const [r, g, bb] = heightColor((z - zmin) / Math.max(1, zmax - zmin)); ctx.fillStyle = `rgb(${r | 0},${g | 0},${bb | 0})`; ctx.fillRect(x, y, step, step);
        }
      },
    }).then((d) => {
      if (ac.signal.aborted) return; setDrape(d);
      if (d.missing && !d.loaded) setMsg(`${IMAGERY[imagery].label} pictures are not saved for this area, so heights are shown in color. Go online once to see them.`);
      else if (d.missing) setMsg(`${d.missing} of ${d.missing + d.loaded} picture tiles are not saved for offline use yet.`);
    }).catch(() => setDrape(null));
    return () => ac.abort();
  }, [dem, imagery]);

  useEffect(() => {
    if (!showT || !dem) { setComm([]); return; } const b = demBounds(dem); const ac = new AbortController();
    loadCommSites(b.south, b.west, b.north, b.east, { online: navigator.onLine, signal: ac.signal }).then((r) => setComm(r.sites)).catch(() => undefined);
    return () => ac.abort();
  }, [showT, dem]);

  // Line of sight for each hop of the plotted path.
  const hops = useMemo(() => {
    if (!dem || pts.length < 2) return [] as { a: Pt; b: Pt; an: ProfileAnalysis; obs: (Obstruction & { from: string })[] }[];
    return pts.slice(1).map((b, i) => {
      const a = pts[i], d = haversineKm(a, b);
      const an = analyzeProfile(buildProfile(a, b, Math.max(60, Math.min(400, Math.round(d / 0.03))), (q) => sampleDem(dem, q)), a.aglM, b.aglM, p.radio.fMHz, p.radio.kFactor, p.radio.clutterM);
      return { a, b, an, obs: findObstructions(an, 4).map((o) => ({ ...o, from: a.name.replace(/^[^:]*:\s*/, '') || a.name })) };
    });
  }, [dem, pts, p.radio.fMHz, p.radio.kFactor, p.radio.clutterM]);

  // What point A can see (red = hidden), for a receiver at point B's antenna height.
  const [vs, setVs] = useState<Uint8Array | null>(null);
  useEffect(() => {
    if (!showView || !dem || !pts[0]) { setVs(null); return; }
    const t = window.setTimeout(() => setVs(viewshedGrid(dem, pts[0], meshN(dem), { observerAglM: pts[0].aglM, targetAglM: pts[pts.length - 1]?.aglM ?? 2, k: p.radio.kFactor, clutterM: p.radio.clutterM }, demBounds(dem))), 30);
    return () => window.clearTimeout(t);
  }, [showView, dem, pts[0]?.lat, pts[0]?.lon, pts[0]?.aglM, pts[pts.length - 1]?.aglM]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lines drawn on the flat map, and the predicted-signal heat map, laid over the 3D ground
  const { lines } = useDrawnLines();
  const [showLines, setShowLines] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  const la = useLineAnalysis(lines, dem);
  const routes = useMemo(() => (showLines ? lines.map((l) => { const r = la.res[l.id]; const s = r?.samples ?? l.pts; return { pts: s, colors: s.map((q) => ('rssi' in q && (q as { rssi: number | null }).rssi != null ? signalColor((q as { rssi: number }).rssi) : l.color ?? '#7b1fa2')) }; }) : []), [showLines, lines, la]);
  const [heat, setHeat] = useState<Float32Array | null>(null);
  useEffect(() => {
    if (!showHeat || !dem || !la.cov) { setHeat(null); return; }
    const t = window.setTimeout(() => {
      const N = meshN(dem), b = demBounds(dem), out = new Float32Array((N + 1) * (N + 1)), cov = { ...la.cov!, dem, radiusKm: 1e6 };
      for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) out[r * (N + 1) + c] = predictPoint(cov, { lat: b.north - ((b.north - b.south) * r) / N, lon: b.west + ((b.east - b.west) * c) / N });
      setHeat(out);
    }, 30);
    return () => window.clearTimeout(t);
  }, [showHeat, dem, la.cov]);
  const obstructions = useMemo(() => (showLos ? hops.flatMap((h) => h.obs) : []), [hops, showLos]);
  const photos = useMemo(() => (showPh ? (p.photoSpots ?? []).map((s) => ({ lat: s.lat, lon: s.lon, name: s.name, views: s.photos.filter((q) => !q.hidden && q.headingDeg != null).map((q) => ({ headingDeg: q.headingDeg!, hfovDeg: Math.min(360, q.hfovDeg) })) })) : undefined), [showPh, p.photoSpots]);
  const path = useMemo(() => (pts.length ? { points: pts, hops: hops.map((h) => ({ ok: h.an.meets60, los: h.an.los })) } : null), [pts, hops]);

  const setPoint = (i: number, q: LatLon, text?: string) => setPts((x) => x.map((o, j) => (j === i ? { ...o, lat: q.lat, lon: q.lon, text: text ?? fmtLL(q) } : o)));
  const find = async (i: number) => {
    const t = pts[i]?.text.trim(); if (!t) return; setMsg(`Finding “${t}”…`);
    const r = await locate(t);
    if (r) { setPoint(i, r, t); setMsg(''); } else setMsg(`Could not find “${t}”. Type GPS coordinates like 35.5951, -82.5515, or pick the spot on the 3D view.`);
  };
  const gps = (i: number) => {
    if (!navigator.geolocation) { setMsg('No GPS on this device.'); return; }
    setMsg('Getting your GPS position…');
    navigator.geolocation.getCurrentPosition((g) => { setPoint(i, { lat: g.coords.latitude, lon: g.coords.longitude }); setMsg(`GPS position ±${Math.round(g.coords.accuracy)} m.`); }, (e) => setMsg('GPS: ' + e.message), { enableHighAccuracy: true, timeout: 20000 });
  };
  const relabel = (x: Pt[]) => x.map((o, i) => {
    const bare = o.name.replace(/^(A|B|Relay \d+):\s*/, ''); const tag = i === 0 ? 'A' : i === x.length - 1 ? 'B' : `Relay ${i}`;
    return { ...o, name: bare && !/^(A|B|Relay( \d+)?)$/.test(bare) ? `${tag}: ${bare}` : tag };
  });
  const c0 = area ? { lat: (area.north + area.south) / 2, lon: (area.east + area.west) / 2 } : { lat: 35.5951, lon: -82.5515 };
  const addPoint = () => setPts((x) => {
    const n = [...x]; const at = x.length >= 2 ? x.length - 1 : x.length;
    const near = x.length >= 2 ? { lat: (x[at - 1].lat + x[at].lat) / 2, lon: (x[at - 1].lon + x[at].lon) / 2 } : c0;
    n.splice(at, 0, { name: 'Relay', lat: near.lat, lon: near.lon, aglM: u.unit === 'mi' ? 50 * 0.3048 : 15, text: fmtLL(near) });
    if (x.length < 2) n[n.length - 1].name = n.length === 1 ? 'A' : 'B';
    setPlacing(at); return relabel(n);
  });
  const remove = (i: number) => setPts((x) => relabel(x.filter((_, j) => j !== i)));
  const suggestRelay = () => {
    if (!dem || pts.length < 2) return;
    const i = hops.findIndex((h) => !h.an.los); if (i < 0) { setMsg('Every hop already has a clear line of sight.'); return; }
    const a = pts[i], b = pts[i + 1], bb = demBounds(dem), N = 45;
    let best: { q: LatLon; score: number } | null = null, agl = 15;
    for (const h of (u.unit === 'mi' ? [50, 100, 200].map((f) => f * 0.3048) : [15, 30, 60])) { // try a short mast first, then taller ones
      agl = h; best = null;
      for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) {
      const q = { lat: bb.north - ((bb.north - bb.south) * r) / N, lon: bb.west + ((bb.east - bb.west) * c) / N };
      const o1 = { observerAglM: a.aglM, targetAglM: agl, k: p.radio.kFactor, clutterM: p.radio.clutterM }, o2 = { observerAglM: agl, targetAglM: b.aglM, k: p.radio.kFactor, clutterM: p.radio.clutterM };
      if (!visible(dem, a, q, o1) || !visible(dem, q, b, o2)) continue;
      const score = haversineKm(a, q) + haversineKm(q, b);
      if (!best || score < best.score) best = { q, score };
      }
      if (best) break;
    }
    if (!best) { setMsg('No single relay spot (up to ' + u.len(u.unit === 'mi' ? 200 * 0.3048 : 60, 0) + ' antenna) in this area sees both ends. Try two relay points, taller antennas, or zoom the map out.'); return; }
    const q = best.q;
    setPts((x) => { const n = [...x]; n.splice(i + 1, 0, { name: 'Relay', lat: q.lat, lon: q.lon, aglM: agl, text: fmtLL(q) }); return relabel(n); });
    setMsg(`Suggested a relay spot with ${u.len(agl, 0)} antenna that sees both ends (shortest total path). Check access, power and land ownership there before relying on it.`);
  };

  // The same switches appear under the tilt slider and, on a full page, in the 🗂 Layers panel over the 3D view.
  const layerItems: LayerItem[] = [
    { id: 'los', label: 'Line of sight and obstructions', on: showLos, set: setShowLos },
    { id: 'fresnel', label: 'Fresnel zone', on: showF, set: setShowF },
    { id: 'view', label: 'What point A can see (red = hidden)', on: showView, set: setShowView },
    { id: 'towers', label: 'Existing towers', on: showT, set: setShowT },
    ...((p.photoSpots?.length ?? 0) > 0 ? [{ id: 'photos', label: 'Photo survey spots', on: showPh, set: setShowPh }] : []),
    ...(lines.length > 0 ? [{ id: 'lines', label: 'Drawn lines', on: showLines, set: setShowLines }] : []),
    { id: 'heat', label: 'Signal heat map', on: showHeat, set: setShowHeat, disabled: !la.cov, note: la.cov ? undefined : '(set a transmit site and radio first)' },
  ];
  const imageryKeys = Object.keys(IMAGERY) as Imagery[];
  const layersPanel = (
    <LayerList items={layerItems} bases={imageryKeys.map((k) => IMAGERY[k].label)} base={IMAGERY[imagery].label} setBase={(l) => setImagery(imageryKeys.find((k) => IMAGERY[k].label === l) ?? 'sat')}>
      <fieldset><legend>Height boost</legend>
        <label className="vc-row"><input type="range" min={1} max={5} step={0.5} value={exag} onChange={(e) => setExag(+e.target.value)} aria-label="Height boost" style={{ flex: 1 }} /> {exag === 1 ? 'true scale' : `${exag}×`}</label>
      </fieldset>
    </LayerList>
  );

  const onPick = (q: LatLon) => { if (placing == null) return; setPoint(placing, q); setPlacing(null); setMsg(''); };

  return (
    <div className="tiltview stack">
      <div className="row wrap tilt-controls">
        <label className="row" style={{ gap: 6, minWidth: 260 }}>
          <b>Tilt</b>
          <input type="range" min={1} max={85} value={tilt} onChange={(e) => setTilt(+e.target.value)} aria-label="Tilt the 3D view" style={{ flex: 1 }} />
          <span className="small">{tilt}°</span>
        </label>
        {TILTS.map(([l, v]) => <button key={l} className={Math.abs(tilt - v) < 3 ? 'primary' : ''} onClick={() => setTilt(v)}>{l}</button>)}
        <span className="row" style={{ gap: 4 }}>
          {(Object.keys(IMAGERY) as Imagery[]).map((k) => <button key={k} className={imagery === k ? 'primary' : ''} onClick={() => setImagery(k)}>{IMAGERY[k].label}</button>)}
        </span>
        <label className="row small" style={{ gap: 4 }}>Height boost <input type="range" min={1} max={5} step={0.5} value={exag} onChange={(e) => setExag(+e.target.value)} aria-label="Height boost" /> {exag === 1 ? 'true scale' : `${exag}×`}</label>
        <button className={exag === 1 ? 'primary' : ''} aria-pressed={exag === 1} onClick={() => setExag(exag === 1 ? 2 : 1)} title="Heights and distances to the same scale (no height boost)">True scale</button>
      </div>
      <div className="row wrap small">
        {layerItems.map((l) => <label key={l.id} title={l.disabled ? 'Set a transmit site and radio first' : ''}><input type="checkbox" checked={l.on} disabled={l.disabled} onChange={(e) => l.set(e.target.checked)} /> {l.label}</label>)}
      </div>
      {placing != null && <p className="note">👆 Tap the ground in the 3D view to place <b>{pts[placing]?.name}</b>. <button onClick={() => setPlacing(null)}>Cancel</button></p>}
      {dem ? <Terrain3D dem={dem} sites={path ? [] : sites} txId={txId} rxId={rxId} fMHz={p.radio.fMHz} kFactor={p.radio.kFactor} clutterM={p.radio.clutterM}
        exag={exag} showFresnel={showF} drape={drape} tilt={tilt} onTilt={setTilt} viewshed={vs} obstructions={obstructions} path={path} onPick={onPick}
        comm={showT ? comm : undefined} routes={routes} heat={heat} photos={photos} height={height} layers={layersPanel} fmtLen={(m) => u.len(m, 0)} fmtDist={(km) => u.f(km)} />
        : <div className="three empty" style={{ height }}>{msg || 'Loading terrain…'}</div>}
      {msg && dem && <p className="note">{msg}</p>}

      <div className="card-lite">
        <h4 style={{ margin: '4px 0' }}>Radio path: point A, relay points, point B</h4>
        <p className="small muted">Type GPS coordinates (35.5951, -82.5515 or 35°35'42"N 82°33'05"W) or an address, use your GPS, or tap “Pick on 3D”. Add relay points to bounce the signal around a hill.</p>
        {pts.map((q, i) => (
          <div key={i} className="row wrap tilt-point" style={{ alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <b style={{ minWidth: 70 }}>{q.name.split(':')[0]}</b>
            <span style={{ flex: '1 1 240px', minWidth: 200 }}><AddressInput value={q.text} ariaLabel={`Location of ${q.name}`} placeholder="GPS coordinates or address"
              onChange={(v) => setPts((x) => x.map((o, j) => (j === i ? { ...o, text: v } : o)))} onPick={(g) => setPoint(i, g, g.label)} /></span>
            <button onClick={() => find(i)}>Find</button>
            <button onClick={() => gps(i)} title="Use this device's GPS position">◎ My GPS</button>
            <button className={placing === i ? 'primary' : ''} onClick={() => setPlacing(placing === i ? null : i)}>📍 Pick on 3D</button>
            <span className="row small tilt-agl" style={{ gap: 4 }}>Antenna <Num value={q.aglM} unit="m" onChange={(v) => setPts((x) => x.map((o, j) => (j === i ? { ...o, aglM: Math.max(0, v ?? 0) } : o)))} /></span>
            <button onClick={() => remove(i)} aria-label={`Remove ${q.name}`}>✕</button>
          </div>
        ))}
        <div className="row wrap">
          <button className="primary" onClick={addPoint}>＋ {pts.length === 0 ? 'Add point A' : pts.length === 1 ? 'Add point B' : 'Add relay point'}</button>
          {pts.length >= 2 && hops.some((h) => !h.an.los) && <button onClick={suggestRelay}>💡 Suggest a relay spot</button>}
          {pts.length > 0 && <button onClick={() => { setPts(() => []); setPlacing(null); }}>Clear points</button>}
        </div>
        {hops.length > 0 && <ul className="small tilt-hops">
          {hops.map((h, i) => {
            const w = h.obs[0];
            return <li key={i}>
              <b>{h.a.name.split(':')[0]} → {h.b.name.split(':')[0]}</b>, {u.f(h.an.distanceKm)}:{' '}
              {h.an.meets60 ? <span style={{ color: '#2e7d32' }}>✓ clear line of sight ({Math.round(h.an.minClearancePct)}% of the Fresnel zone clear)</span>
                : h.an.los ? <span style={{ color: '#e65100' }}>⚠ line of sight, but the ground comes within {Math.round(h.an.minClearancePct)}% of the Fresnel zone{w ? ` ${u.f(w.dKm)} from ${w.from}` : ''} (60% is the usual minimum)</span>
                : <span style={{ color: '#c62828' }}>✗ blocked by terrain{w ? `: ground is ${u.len(w.byM, 0)} above the beam ${u.f(w.dKm)} from ${w.from}` : ''}. Add a relay point or raise the antennas.</span>}
              <br /><AzLine a={h.a} b={h.b} aName={h.a.name.split(':')[0]} bName={h.b.name.split(':')[0]}
                elev={{ aAmslM: h.an.points[0].groundM + h.a.aglM, bAmslM: h.an.points[h.an.points.length - 1].groundM + h.b.aglM, k: p.radio.kFactor }} />
            </li>;
          })}
        </ul>}
        <p className="small muted">Uses terrain heights, earth curve (k = {p.radio.kFactor.toFixed(2)}) and {u.len(p.radio.clutterM, 0)} of trees / buildings (set on Radio design). Satellite pictures show what is there but are not used as heights. Always confirm with a site visit.</p>
      </div>
    </div>
  );
}
