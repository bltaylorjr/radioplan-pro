// Declination map: lines of equal compass declination (isogonic lines) across the US for today, drawn from the
// World Magnetic Model built into the app, so it works with no internet. Red = east, blue = west, green = 0°.
import React, { useMemo } from 'react';
import L from 'leaflet';
import { useStore } from '../store';
import { MapView } from './MapView';
import { geomag, fmtDecl, getMagModel } from '../engine/azimuth';

type Seg = [[number, number], [number, number]];
const LAT0 = 18, LAT1 = 56, LON0 = -132, LON1 = -60, STEP = 1;

/** Isogonic line segments for each whole-degree level (marching squares over a 1° grid). */
export function isogonicLines(when: Date, every = 2): Map<number, Seg[]> {
  const ny = Math.round((LAT1 - LAT0) / STEP) + 1, nx = Math.round((LON1 - LON0) / STEP) + 1;
  const g: number[][] = [];
  for (let j = 0; j < ny; j++) { g.push([]); for (let i = 0; i < nx; i++) g[j].push(geomag(LAT0 + j * STEP, LON0 + i * STEP, when).decDeg); }
  let lo = Infinity, hi = -Infinity; g.forEach((r) => r.forEach((v) => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
  const out = new Map<number, Seg[]>();
  for (let lv = Math.ceil(lo / every) * every; lv <= hi; lv += every) {
    const segs: Seg[] = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const c = [[j, i], [j, i + 1], [j + 1, i + 1], [j + 1, i]] as const;
      const v = c.map(([a, b]) => g[a][b]);
      const pts: [number, number][] = [];
      for (let k = 0; k < 4; k++) {
        const a = v[k], b = v[(k + 1) % 4];
        if ((a < lv) !== (b < lv)) {
          const t = (lv - a) / (b - a), [ja, ia] = c[k], [jb, ib] = c[(k + 1) % 4];
          pts.push([LAT0 + (ja + t * (jb - ja)) * STEP, LON0 + (ia + t * (ib - ia)) * STEP]);
        }
      }
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
      else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
    }
    out.set(lv, segs);
  }
  return out;
}

export function DeclinationMap({ at }: { at: { lat: number; lon: number } }) {
  const { project: p } = useStore();
  const day = new Date().toISOString().slice(0, 10);
  const lines = useMemo(() => isogonicLines(new Date(day + 'T12:00:00Z')), [day]);
  const here = geomag(at.lat, at.lon, new Date()).decDeg;
  const draw = (g: L.LayerGroup) => {
    for (const [lv, segs] of lines) {
      const color = lv === 0 ? '#2e7d32' : lv > 0 ? '#c62828' : '#1565c0';
      L.polyline(segs as unknown as L.LatLngExpression[][], { color, weight: lv === 0 ? 3 : lv % 10 === 0 ? 2.2 : 1.4, opacity: 0.85, interactive: false }).addTo(g);
      // label near the middle of the US for each line
      const mid = segs.filter((s) => s[0][0] > 30 && s[0][0] < 46).sort((a, b) => Math.abs(a[0][0] - 38) - Math.abs(b[0][0] - 38))[0];
      if (mid) L.tooltip({ permanent: true, direction: 'center', className: 'measure-label' }).setLatLng(mid[0]).setContent(lv === 0 ? '0°' : `${Math.abs(lv)}°${lv > 0 ? 'E' : 'W'}`).addTo(g);
    }
    L.circleMarker([at.lat, at.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#ef6c00', fillOpacity: 1 }).bindTooltip(`Here: ${fmtDecl(here)}`, { permanent: true, direction: 'right' }).addTo(g);
  };
  return <>
    <MapView sites={p.sites} height={420} center={{ lat: at.lat, lon: at.lon, zoom: 5 }} extra={draw} extraKey={`${at.lat},${at.lon},${day}`} />
    <p className="small muted">Lines of equal declination for today from {getMagModel().name} (built into the app, works offline), every 2°. Blue lines: the compass points west of true north; red: east; green: no difference. Here: <b>{fmtDecl(here)}</b>.</p>
  </>;
}
