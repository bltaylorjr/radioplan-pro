import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { FullView } from './FullView';
import L from 'leaflet';
import type { Site } from '../types';
import type { CoverageResult } from '../engine/coverage';
import { rssiColor } from '../engine/coverage';
import { DemGrid, demBounds } from '../engine/terrain';
import { CachedTileLayer } from './cachedTiles';
import type { LatLon } from '../engine/geo';
import { loadCommSites, siteLabel, CommSite } from '../engine/towers';
import { azimuthPair, fmtAz, fmtDecl } from '../engine/azimuth';
import { useUnits } from '../units';
import { AZ_TIP } from './Azimuth';
import { Tip } from './ui';

const TiltView = lazy(() => loadChunk(() => import('./TiltView')));
import { RouteTools } from './RouteTools';
import { useStore } from '../store';
import { destination } from '../engine/geo';
import type { PhotoSpot } from '../engine/photosurvey';

const camIcon = L.divIcon({ className: 'photo-pin', html: '<div>📷</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
const PHOTO_SPOT_KEY = 'radioplan.photospot';
/** Photo survey spots: a camera pin and a see-through cone for the direction and width of each photo. */
export function drawPhotoSpots(g: L.LayerGroup, spots: PhotoSpot[], open?: (id: string) => void, radiusKm = 0.45) {
  g.clearLayers();
  for (const s of spots) {
    s.photos.forEach((ph, i) => {
      if (ph.hidden || ph.headingDeg == null) return;
      const color = ['#1565c0', '#00838f', '#6a1b9a', '#ef6c00', '#2e7d32'][i % 5];
      if (ph.hfovDeg >= 350) { L.circle([s.lat, s.lon], { radius: radiusKm * 1000, color, weight: 1, fillOpacity: 0.12, interactive: false }).addTo(g); return; }
      const pts: [number, number][] = [[s.lat, s.lon]];
      for (let k = 0; k <= 12; k++) { const q = destination(s, ph.headingDeg - ph.hfovDeg / 2 + (ph.hfovDeg * k) / 12, radiusKm); pts.push([q.lat, q.lon]); }
      L.polygon(pts, { color, weight: 1, fillOpacity: 0.16, interactive: false }).addTo(g);
    });
    const thumb = s.photos.find((q) => !q.hidden)?.dataUrl;
    const m = L.marker([s.lat, s.lon], { icon: camIcon }).bindPopup(`<b>📷 ${esc(s.name)}</b><br>${s.photos.length} photo(s)${thumb ? `<br><img src="${thumb}" alt="" style="width:180px;max-height:110px;object-fit:cover;border-radius:4px;margin-top:4px">` : ''}${open ? `<br><a href="#photosurvey" data-spot="${s.id}">Open the photo survey →</a>` : ''}`).addTo(g);
    if (open) m.on('popupopen', (e) => { const a = (e.popup.getElement() as HTMLElement | undefined)?.querySelector('a[data-spot]'); a?.addEventListener('click', (ev) => { ev.preventDefault(); open(s.id); }); });
  }
}

const towerIcon = L.divIcon({ className: 'tower-pin', html: '<div>📡</div>', iconSize: [22, 22], iconAnchor: [11, 20] });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Overlay with existing towers and communications sites (OpenStreetMap), labelled, cached for offline. */
function towersOverlay(m: L.Map): L.LayerGroup {
  const g = L.layerGroup(); let timer: number | undefined; let ctrl: AbortController | undefined;
  const status = L.DomUtil.create('div', 'tower-status leaflet-bar'); status.style.display = 'none';
  const C = L.Control.extend({ onAdd: () => status }); new C({ position: 'bottomleft' }).addTo(m);
  const say = (t: string) => { status.textContent = t; status.style.display = t ? '' : 'none'; };
  const draw = (sites: CommSite[]) => {
    g.clearLayers(); const labels = m.getZoom() >= 12;
    for (const c of sites) {
      const pop = `<b>${esc(c.name || c.kind)}</b><br>${esc(c.kind)}${c.operator ? `<br>Operator: ${esc(c.operator)}` : ''}${c.heightFt ? `<br>Height: ${c.heightFt} ft` : ''}${c.services.length ? `<br>Use: ${esc(c.services.join(', '))}` : ''}${c.asr ? `<br>FCC ASR: ${esc(c.asr)}` : ''}<br>${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}<br><span style="color:#777">Source: OpenStreetMap. Verify in the FCC ASR database.</span>`;
      L.marker([c.lat, c.lon], { icon: towerIcon, keyboard: false }).bindPopup(pop)
        .bindTooltip(esc(siteLabel(c)), { permanent: labels, direction: 'right', offset: [10, -8], className: 'tower-label' }).addTo(g);
    }
  };
  const refresh = () => {
    if (!m.hasLayer(g)) return;
    if (m.getZoom() < 9) { g.clearLayers(); say('📡 Zoom in to see towers'); return; }
    ctrl?.abort(); ctrl = new AbortController(); const b = m.getBounds(); say('📡 Loading towers…');
    loadCommSites(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), { online: navigator.onLine, signal: ctrl.signal })
      .then((r) => { draw(r.sites); say(r.missing ? `📡 ${r.sites.length} towers · ${r.missing} area(s) not saved yet${navigator.onLine ? ' (try again later)' : ' (go online once)'}` : `📡 ${r.sites.length} tower${r.sites.length === 1 ? "" : "s"} and comm sites`); })
      .catch((e) => { if ((e as Error).name !== 'AbortError') say('📡 Towers unavailable'); });
  };
  m.on('moveend zoomend', () => { window.clearTimeout(timer); timer = window.setTimeout(refresh, 500); });
  g.on('add', () => { try { localStorage.setItem('radioplan.towers', '1'); } catch { /* ignore */ } refresh(); });
  g.on('remove', () => { // only a user switching it off counts, not the map closing when you leave the page
    if (!(m as unknown as { _lvClosing?: boolean })._lvClosing) try { localStorage.setItem('radioplan.towers', '0'); } catch { /* ignore */ } ctrl?.abort(); g.clearLayers(); say(''); });
  return g;
}

const asrIcon = L.divIcon({ className: 'tower-pin', html: '<div style="background:#ff9800;color:#000;border-radius:3px;padding:0 2px">🗼</div>', iconSize: [22, 22], iconAnchor: [11, 20] });
/** FCC Antenna Structure Registrations (built in, works offline) as a map layer. */
function fccOverlay(m: L.Map): L.LayerGroup {
  const g = L.layerGroup(); let timer: number | undefined; let seq = 0;
  const refresh = () => {
    if (!m.hasLayer(g)) return;
    if (m.getZoom() < 9) { g.clearLayers(); return; }
    const b = m.getBounds(), my = ++seq;
    import('../engine/fccdata').then(({ towersInBox, structureName }) => towersInBox(b.getSouth(), b.getWest(), b.getNorth(), b.getEast()).then((ts) => {
      if (my !== seq) return; g.clearLayers(); const labels = m.getZoom() >= 12;
      for (const t of ts.slice(0, 800)) {
        const h = t.heightAglM != null ? `${Math.round(t.heightAglM * 3.28084)} ft` : '';
        L.marker([t.lat, t.lon], { icon: asrIcon, keyboard: false })
          .bindPopup(`<b>FCC ASR ${t.regNo}</b><br>${esc(t.owner)}<br>${esc(structureName(t.type))}${h ? `, ${h} above ground` : ''}<br>${esc(t.status)}${t.faaStudy ? `<br>FAA study ${esc(t.faaStudy)}` : ''}<br>${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}<br><span style="color:#777">Who is on it: FCC Towers & Licenses page.</span>`)
          .bindTooltip(esc(`${h}${h ? ' · ' : ''}${t.owner.split(/[,]/)[0]}`), { permanent: labels, direction: 'right', offset: [10, -8], className: 'tower-label' }).addTo(g);
      }
    })).catch(() => g.clearLayers());
  };
  m.on('moveend zoomend', () => { window.clearTimeout(timer); timer = window.setTimeout(refresh, 400); });
  g.on('add', () => { try { localStorage.setItem('radioplan.fccTowers', '1'); } catch { /* ignore */ } refresh(); });
  g.on('remove', () => { if (!(m as unknown as { _lvClosing?: boolean })._lvClosing) try { localStorage.setItem('radioplan.fccTowers', '0'); } catch { /* ignore */ } g.clearLayers(); });
  return g;
}

import { BASEMAPS, DEFAULT_BASE } from './basemaps';
import { loadChunk } from '../engine/chunkload';
export { BASEMAPS, DEFAULT_BASE };

const icon = (label: string, color: string) => L.divIcon({ className: 'site-pin', html: `<div style="background:${color}">${label}</div>`, iconSize: [28, 28], iconAnchor: [14, 28] });

/** Paint any lat/lon grid to a PNG data URL with a per-cell colour function (null = transparent). */
export function gridCanvas(g: { n: number }, color: (i: number) => [number, number, number] | null, alpha = 160): string {
  const cv = document.createElement('canvas'); cv.width = g.n; cv.height = g.n;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(g.n, g.n);
  for (let i = 0; i < g.n * g.n; i++) { const c = color(i); if (c) img.data.set([c[0], c[1], c[2], alpha], i * 4); }
  ctx.putImageData(img, 0, 0); return cv.toDataURL();
}

export function coverageCanvas(c: CoverageResult, floor: number): string {
  const cv = document.createElement('canvas'); cv.width = c.n; cv.height = c.n;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(c.n, c.n);
  for (let i = 0; i < c.rssi.length; i++) { const [r, g, b, a] = rssiColor(c.rssi[i], floor); img.data.set([r, g, b, a], i * 4); }
  ctx.putImageData(img, 0, 0); return cv.toDataURL();
}

/** "Show my location" control: live GNSS position with accuracy circle (watchPosition). */
function addLocateControl(m: L.Map) {
  let watch: number | null = null; let dot: L.CircleMarker | null = null; let ring: L.Circle | null = null; let first = true;
  const C = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('a', 'leaflet-bar locate-btn'); b.href = '#'; b.title = 'Show my live GPS location'; b.innerHTML = '◎';
      L.DomEvent.on(b, 'click', (e) => {
        L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e);
        if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; dot?.remove(); ring?.remove(); dot = ring = null; b.classList.remove('on'); return; }
        if (!navigator.geolocation) { alert('No location service on this device.'); return; }
        b.classList.add('on'); first = true;
        watch = navigator.geolocation.watchPosition((p) => {
          const ll: L.LatLngExpression = [p.coords.latitude, p.coords.longitude];
          if (!dot) { dot = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#1e88e5', fillOpacity: 1 }).addTo(m); ring = L.circle(ll, { radius: p.coords.accuracy, color: '#1e88e5', weight: 1, fillOpacity: 0.1 }).addTo(m); }
          dot.setLatLng(ll).bindTooltip(`You are here ±${p.coords.accuracy.toFixed(0)} m`); ring!.setLatLng(ll).setRadius(p.coords.accuracy);
          if (first) { m.setView(ll, Math.max(m.getZoom(), 15)); first = false; }
        }, (err) => { alert('GPS: ' + err.message); b.classList.remove('on'); }, { enableHighAccuracy: true, maximumAge: 2000 });
      });
      return b;
    },
  });
  new C({ position: 'topleft' }).addTo(m);
}

export function MapView({ sites, txId, rxId, coverage, floor = -110, dem, onClick, height = 520, selectedId, center, marker, onMap, base, extra, extraKey }: {
  sites: Site[]; txId?: string; rxId?: string; coverage?: CoverageResult | null; floor?: number; dem?: DemGrid | null;
  onClick?: (lat: number, lon: number) => void; height?: number; selectedId?: string;
  center?: { lat: number; lon: number; zoom?: number } | null; marker?: (LatLon & { label?: string }) | null; onMap?: (m: L.Map) => void; base?: string;
  /** Draw additional layers (contours, survey points, network maps). Redrawn when extraKey changes. */
  extra?: (g: L.LayerGroup) => void; extraKey?: unknown;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const layer = useRef<L.LayerGroup>();
  const bases = useRef<Record<string, L.TileLayer>>({});
  const clickRef = useRef(onClick); clickRef.current = onClick;
  const extraRef = useRef(extra); extraRef.current = extra;
  const [mode3d, setMode3d] = useState(false);
  const u = useUnits();
  const { project: proj, go } = useStore();
  const photoLayer = useRef<L.LayerGroup>();
  // Measure tool: tap points on the map for distance and azimuth (true and magnetic) of each leg.
  const [measuring, setMeasuring] = useState(false);
  const [mpts, setMpts] = useState<LatLon[]>([]);
  const measRef = useRef(false); measRef.current = measuring;
  const [drawing, setDrawing] = useState(false);
  const [resEl, setResEl] = useState<HTMLDivElement | null>(null);
  const drawRef = useRef(false); drawRef.current = drawing;
  const [mapObj, setMapObj] = useState<L.Map | null>(null);
  const mlayer = useRef<L.LayerGroup>();
  const [view, setView] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const baseName = useRef<string>(base ?? DEFAULT_BASE);
  const open3d = () => {
    const m = map.current; if (m) { const b = m.getBounds(); setView({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }); }
    setMode3d(true);
  };
  const close3d = () => { setMode3d(false); window.setTimeout(() => map.current?.invalidateSize(), 50); };
  useEffect(() => {
    if (!el.current || map.current) return;
    const start = center ?? sites[0] ?? { lat: 35.2, lon: -80.8 };
    const m = L.map(el.current, { zoomControl: true }).setView([start.lat, start.lon], center?.zoom ?? 11);
    for (const [k, v] of Object.entries(BASEMAPS)) bases.current[k] = new CachedTileLayer(v.url, { attribution: v.attr, maxZoom: v.max, maxNativeZoom: v.max } as L.TileLayerOptions);
    let chosen = base ?? DEFAULT_BASE;
    try { chosen = base ?? localStorage.getItem('radioplan.basemap') ?? DEFAULT_BASE; } catch { /* ignore */ }
    (bases.current[chosen] ?? bases.current[DEFAULT_BASE]).addTo(m); baseName.current = bases.current[chosen] ? chosen : DEFAULT_BASE;
    m.on('baselayerchange', (e: L.LayersControlEvent) => { baseName.current = e.name; try { localStorage.setItem('radioplan.basemap', e.name); } catch { /* ignore */ } });
    const towers = towersOverlay(m), fcc = fccOverlay(m);
    const photos = L.layerGroup(); photoLayer.current = photos;
    L.control.layers(bases.current, { '📡 Existing towers & comm sites': towers, '🗼 FCC registered towers (offline)': fcc, '📷 Photo survey spots': photos }, { position: 'topright' }).addTo(m);
    try { if (localStorage.getItem('radioplan.photomap') !== '0') photos.addTo(m); } catch { photos.addTo(m); }
    photos.on('add', () => { try { localStorage.setItem('radioplan.photomap', '1'); } catch { /* ignore */ } });
    photos.on('remove', () => { if (!(m as unknown as { _lvClosing?: boolean })._lvClosing) try { localStorage.setItem('radioplan.photomap', '0'); } catch { /* ignore */ } });
    try { if (localStorage.getItem('radioplan.towers') === '1') towers.addTo(m); } catch { /* ignore */ }
    try { if (localStorage.getItem('radioplan.fccTowers') === '1') fcc.addTo(m); } catch { /* ignore */ }
    L.control.scale({ imperial: true, metric: true }).addTo(m);
    addLocateControl(m);
    m.on('click', (e: L.LeafletMouseEvent) => { if (drawRef.current) return; if (measRef.current) setMpts((x) => [...x, { lat: e.latlng.lat, lon: e.latlng.lng }]); else clickRef.current?.(e.latlng.lat, e.latlng.lng); });
    layer.current = L.layerGroup().addTo(m);
    mlayer.current = L.layerGroup().addTo(m);
    map.current = m; setMapObj(m);
    if (!center && sites.length > 1) m.fitBounds(L.latLngBounds(sites.map((s) => [s.lat, s.lon])), { padding: [40, 40] });
    onMap?.(m);
    return () => { (m as unknown as { _lvClosing?: boolean })._lvClosing = true; m.remove(); map.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (center && map.current) map.current.setView([center.lat, center.lon], center.zoom ?? map.current.getZoom()); }, [center?.lat, center?.lon, center?.zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = map.current; if (!m || !base || !bases.current[base]) return;
    Object.values(bases.current).forEach((l) => m.hasLayer(l) && m.removeLayer(l)); bases.current[base].addTo(m);
  }, [base]);
  useEffect(() => {
    const g = layer.current; if (!g) return;
    g.clearLayers();
    if (dem) { const b = demBounds(dem); L.rectangle([[b.south, b.west], [b.north, b.east]], { color: '#8a5a2b', weight: 1, dashArray: '4 4', fill: false, interactive: false }).addTo(g); }
    if (coverage) L.imageOverlay(coverageCanvas(coverage, floor), [[coverage.south, coverage.west], [coverage.north, coverage.east]], { opacity: 0.75, interactive: false }).addTo(g);
    const tx = sites.find((s) => s.id === txId), rx = sites.find((s) => s.id === rxId);
    if (tx && rx && tx !== rx) {
      const z = azimuthPair(tx, rx);
      L.polyline([[tx.lat, tx.lon], [rx.lat, rx.lon]], { color: '#1565c0', weight: 3 })
        .bindTooltip(`${esc(tx.name)} → ${esc(rx.name)}: ${u.f(z.km)}<br>Azimuth ${fmtAz(z.fwd, z.decA)}<br>Back azimuth ${fmtAz(z.back, z.decB)}`, { sticky: true }).addTo(g);
    }
    sites.forEach((s, i) => {
      const color = s.id === txId ? '#c62828' : s.id === rxId ? '#1565c0' : '#555';
      const z = tx && s.id !== tx.id ? azimuthPair(tx, s) : null;
      L.marker([s.lat, s.lon], { icon: icon(i < 26 ? String.fromCharCode(65 + i) : String(i + 1), s.id === selectedId ? '#ef6c00' : color) })
        .bindPopup(`<b>${esc(s.name)}</b><br>${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}<br>Ground ${s.groundElevM ?? '?'} m, antenna ${s.antennaAglM} m AGL`
          + (z ? `<br>From ${esc(tx!.name)}: ${u.f(z.km)} at ${fmtAz(z.fwd, z.decA)}<br>Aim back at ${fmtAz(z.back, z.decB)}` : '')).addTo(g);
    });
    if (marker) L.marker([marker.lat, marker.lon], { icon: icon('★', '#ef6c00') }).bindPopup(marker.label ?? 'Search location').addTo(g);
    extraRef.current?.(g);
  }, [sites, txId, rxId, coverage, floor, dem, selectedId, marker, extraKey, u.unit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const g = photoLayer.current; if (!g) return;
    drawPhotoSpots(g, proj.photoSpots ?? [], (id) => { try { localStorage.setItem(PHOTO_SPOT_KEY, id); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent('lv-photospot', { detail: id })); go('photosurvey'); });
  }, [proj.photoSpots, mapObj]); // eslint-disable-line react-hooks/exhaustive-deps
  const legs = mpts.slice(1).map((b, i) => azimuthPair(mpts[i], b));
  useEffect(() => {
    const g = mlayer.current; if (!g) return; g.clearLayers();
    if (!mpts.length) return;
    L.polyline(mpts.map((q) => [q.lat, q.lon] as [number, number]), { color: '#ef6c00', weight: 3, dashArray: '6 4', interactive: false }).addTo(g);
    mpts.forEach((q, i) => L.circleMarker([q.lat, q.lon], { radius: 5, color: '#fff', weight: 2, fillColor: '#ef6c00', fillOpacity: 1 }).bindTooltip(String(i + 1), { permanent: true, direction: 'top', className: 'measure-label' }).addTo(g));
    legs.forEach((z, i) => { const a = mpts[i], b = mpts[i + 1];
      L.tooltip({ permanent: true, direction: 'center', className: 'measure-label' }).setLatLng([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2]).setContent(`${u.f(z.km)} · ${fmtAz(z.fwd, z.decA, 0)}`).addTo(g); });
  }, [mpts, u.unit]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FullView title="Map">
      <div className="row map-modes" role="group" aria-label="Map view">
        <button className={!mode3d ? 'primary' : ''} onClick={close3d} aria-pressed={!mode3d}>🗺 Flat map</button>
        <button className={mode3d ? 'primary' : ''} onClick={open3d} aria-pressed={mode3d} title="Tilt the map in 3D with satellite pictures and line of sight">⛰ 3D tilt view</button>
        {!mode3d && <button className={drawing ? 'primary' : ''} aria-pressed={drawing} onClick={() => { setDrawing(!drawing); setMeasuring(false); setMpts([]); }} title="Draw lines by hand or point to point and see signal and obstacles along them">✏️ {drawing ? 'Close drawing' : 'Draw lines'}</button>}
        {!mode3d && <button className={measuring ? 'primary' : ''} aria-pressed={measuring} onClick={() => { setMeasuring(!measuring); setDrawing(false); if (measuring) setMpts([]); }} title="Tap points on the map to measure distance and azimuth">📏 {measuring ? 'Stop measuring' : 'Measure distance & azimuth'}</button>}
      </div>
      {measuring && !mode3d && <div className="note measure-panel">
        {mpts.length < 2 ? <span>Tap the map to drop point {mpts.length + 1}. Each leg shows its distance and the azimuth to aim. <Tip text={AZ_TIP} /></span>
          : <><ol className="small" style={{ margin: '2px 0 4px', paddingLeft: 20 }}>{legs.map((z, i) => <li key={i}><b>{i + 1} → {i + 2}</b>: {u.f(z.km)}, azimuth <b>{fmtAz(z.fwd, z.decA)}</b>, back azimuth {fmtAz(z.back, z.decB)}</li>)}</ol>
            <span className="small">Total {u.f(legs.reduce((t, z) => t + z.km, 0))}. Magnetic declination here {fmtDecl(legs[0].decA)} (WMM2025). <Tip text={AZ_TIP} /></span></>}
        {mpts.length > 0 && <span className="row" style={{ gap: 6, marginTop: 4 }}><button onClick={() => setMpts((x) => x.slice(0, -1))}>↶ Undo point</button><button onClick={() => setMpts([])}>Clear</button></span>}
      </div>}
      {!mode3d && <RouteTools map={mapObj} projectDem={dem} active={drawing} onClose={() => setDrawing(false)} resultsEl={resEl} />}
      <div ref={el} className="map" style={{ height, display: mode3d ? 'none' : undefined }} data-tour="map" />
      {!mode3d && <div ref={setResEl} />}
      {mode3d && <Suspense fallback={<div className="three empty" style={{ height }}>Loading 3D view…</div>}>
        <TiltView view={view} sites={sites} txId={txId} rxId={rxId} dem={dem} base={baseName.current} height={height} />
      </Suspense>}
    </FullView>
  );
}
