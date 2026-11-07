import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Site } from '../types';
import type { CoverageResult } from '../engine/coverage';
import { rssiColor } from '../engine/coverage';
import { DemGrid, demBounds } from '../engine/terrain';

export const BASEMAPS: Record<string, { url: string; attr: string; max: number }> = {
  'Topographic (OpenTopoMap)': { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', max: 17 },
  'USGS Topo': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map', max: 16 },
  'Satellite (Esri)': { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, Maxar, Earthstar Geographics', max: 19 },
  'Streets (OSM)': { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', max: 19 },
  'USGS Shaded Relief': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map', max: 16 },
};

const icon = (label: string, color: string) => L.divIcon({ className: 'site-pin', html: `<div style="background:${color}">${label}</div>`, iconSize: [28, 28], iconAnchor: [14, 28] });

export function coverageCanvas(c: CoverageResult, floor: number): string {
  const cv = document.createElement('canvas'); cv.width = c.n; cv.height = c.n;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(c.n, c.n);
  for (let i = 0; i < c.rssi.length; i++) { const [r, g, b, a] = rssiColor(c.rssi[i], floor); img.data.set([r, g, b, a], i * 4); }
  ctx.putImageData(img, 0, 0); return cv.toDataURL();
}

export function MapView({ sites, txId, rxId, coverage, floor = -110, dem, onClick, height = 520, selectedId }: {
  sites: Site[]; txId?: string; rxId?: string; coverage?: CoverageResult | null; floor?: number; dem?: DemGrid | null;
  onClick?: (lat: number, lon: number) => void; height?: number; selectedId?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const layer = useRef<L.LayerGroup>();
  const clickRef = useRef(onClick); clickRef.current = onClick;
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView([sites[0]?.lat ?? 35.2, sites[0]?.lon ?? -80.8], 11);
    const bases: Record<string, L.TileLayer> = {};
    for (const [k, v] of Object.entries(BASEMAPS)) bases[k] = L.tileLayer(v.url, { attribution: v.attr, maxZoom: v.max, crossOrigin: true });
    bases['Topographic (OpenTopoMap)'].addTo(m);
    L.control.layers(bases, {}, { position: 'topright' }).addTo(m);
    L.control.scale({ imperial: true, metric: true }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => clickRef.current?.(e.latlng.lat, e.latlng.lng));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    if (sites.length > 1) m.fitBounds(L.latLngBounds(sites.map((s) => [s.lat, s.lon])), { padding: [40, 40] });
    return () => { m.remove(); map.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const g = layer.current; if (!g) return;
    g.clearLayers();
    if (dem) { const b = demBounds(dem); L.rectangle([[b.south, b.west], [b.north, b.east]], { color: '#8a5a2b', weight: 1, dashArray: '4 4', fill: false }).bindTooltip(`DEM: ${dem.name}`).addTo(g); }
    if (coverage) L.imageOverlay(coverageCanvas(coverage, floor), [[coverage.south, coverage.west], [coverage.north, coverage.east]], { opacity: 0.75, interactive: false }).addTo(g);
    const tx = sites.find((s) => s.id === txId), rx = sites.find((s) => s.id === rxId);
    if (tx && rx && tx !== rx) L.polyline([[tx.lat, tx.lon], [rx.lat, rx.lon]], { color: '#1565c0', weight: 3 }).addTo(g);
    sites.forEach((s, i) => {
      const color = s.id === txId ? '#c62828' : s.id === rxId ? '#1565c0' : '#555';
      L.marker([s.lat, s.lon], { icon: icon(String.fromCharCode(65 + i), s.id === selectedId ? '#ef6c00' : color) })
        .bindPopup(`<b>${s.name}</b><br>${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}<br>Ground ${s.groundElevM ?? '?'} m, antenna ${s.antennaAglM} m AGL`).addTo(g);
    });
  }, [sites, txId, rxId, coverage, floor, dem, selectedId]);
  return <div ref={el} className="map" style={{ height }} data-tour="map" />;
}
