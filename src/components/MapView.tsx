import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Site } from '../types';
import type { CoverageResult } from '../engine/coverage';
import { rssiColor } from '../engine/coverage';
import { DemGrid, demBounds } from '../engine/terrain';
import { CachedTileLayer } from './cachedTiles';
import type { LatLon } from '../engine/geo';

/** Base maps. `bulk: true` = public-domain (USGS) sources that may be pre-downloaded for offline use.
 *  OSM-community and Esri tiles are cached only as you view them, per their usage policies. */
export const BASEMAPS: Record<string, { url: string; attr: string; max: number; bulk: boolean }> = {
  'USGS Topo': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map', max: 16, bulk: true },
  'Topographic (OpenTopoMap)': { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', max: 17, bulk: false },
  'Satellite (USGS Imagery)': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map: Orthoimagery', max: 16, bulk: true },
  'Satellite + Topo (USGS)': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map', max: 16, bulk: true },
  'Satellite (Esri, high-res)': { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, Maxar, Earthstar Geographics', max: 19, bulk: false },
  'Shaded relief (USGS)': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map', max: 16, bulk: true },
  'Streets (OSM)': { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', max: 19, bulk: false },
};
export const DEFAULT_BASE = 'USGS Topo';

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
  useEffect(() => {
    if (!el.current || map.current) return;
    const start = center ?? sites[0] ?? { lat: 35.2, lon: -80.8 };
    const m = L.map(el.current, { zoomControl: true }).setView([start.lat, start.lon], center?.zoom ?? 11);
    for (const [k, v] of Object.entries(BASEMAPS)) bases.current[k] = new CachedTileLayer(v.url, { attribution: v.attr, maxZoom: v.max, maxNativeZoom: v.max } as L.TileLayerOptions);
    let chosen = base ?? DEFAULT_BASE;
    try { chosen = base ?? localStorage.getItem('radioplan.basemap') ?? DEFAULT_BASE; } catch { /* ignore */ }
    (bases.current[chosen] ?? bases.current[DEFAULT_BASE]).addTo(m);
    m.on('baselayerchange', (e: L.LayersControlEvent) => { try { localStorage.setItem('radioplan.basemap', e.name); } catch { /* ignore */ } });
    L.control.layers(bases.current, {}, { position: 'topright' }).addTo(m);
    L.control.scale({ imperial: true, metric: true }).addTo(m);
    addLocateControl(m);
    m.on('click', (e: L.LeafletMouseEvent) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    if (!center && sites.length > 1) m.fitBounds(L.latLngBounds(sites.map((s) => [s.lat, s.lon])), { padding: [40, 40] });
    onMap?.(m);
    return () => { m.remove(); map.current = undefined; };
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
    if (tx && rx && tx !== rx) L.polyline([[tx.lat, tx.lon], [rx.lat, rx.lon]], { color: '#1565c0', weight: 3 }).addTo(g);
    sites.forEach((s, i) => {
      const color = s.id === txId ? '#c62828' : s.id === rxId ? '#1565c0' : '#555';
      L.marker([s.lat, s.lon], { icon: icon(i < 26 ? String.fromCharCode(65 + i) : String(i + 1), s.id === selectedId ? '#ef6c00' : color) })
        .bindPopup(`<b>${s.name}</b><br>${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}<br>Ground ${s.groundElevM ?? '?'} m, antenna ${s.antennaAglM} m AGL`).addTo(g);
    });
    if (marker) L.marker([marker.lat, marker.lon], { icon: icon('★', '#ef6c00') }).bindPopup(marker.label ?? 'Search location').addTo(g);
    extraRef.current?.(g);
  }, [sites, txId, rxId, coverage, floor, dem, selectedId, marker, extraKey]);
  return <div ref={el} className="map" style={{ height }} data-tour="map" />;
}
