// Declination map: lines of equal compass declination (isogonic lines) across the US for today, drawn from the
// World Magnetic Model built into the app, so it works with no internet. Red = east, blue = west, green = 0°.
import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { useStore } from '../store';
import { MapView } from './MapView';
import { geomag, fmtDecl, getMagModel, onMagModel } from '../engine/azimuth';
import { isogonicLines } from '../engine/isogonic';

export function DeclinationMap({ at }: { at: { lat: number; lon: number } }) {
  const { project: p } = useStore();
  const day = new Date().toISOString().slice(0, 10);
  const [, setMv] = useState(0);
  useEffect(() => onMagModel(() => setMv((x) => x + 1)), []);
  const name = getMagModel().name;
  const lines = useMemo(() => isogonicLines(new Date(day + 'T12:00:00Z')), [day, name]);
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
    <MapView sites={p.sites} height={420} center={{ lat: at.lat, lon: at.lon, zoom: 5 }} extra={draw} extraKey={`${at.lat},${at.lon},${day},${name}`} />
    <p className="small muted">Lines of equal declination for today from {getMagModel().name} (built into the app, works offline), every 2°. Blue lines: the compass points west of true north; red: east; green: no difference. Here: <b>{fmtDecl(here)}</b>.</p>
  </>;
}
