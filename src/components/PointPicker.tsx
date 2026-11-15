// Pick a spot for a tool: a project site, an address, GPS coordinates or this device's GPS.
import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { AddressInput } from './AddressInput';
import { parseLatLon } from '../engine/locparse';
import { geocodeAddress } from '../engine/geocode';

export interface PickedPoint { lat: number; lon: number; label: string; siteId?: string }

export function PointPicker({ value, onChange, label = 'Where' }: { value: PickedPoint | null; onChange: (p: PickedPoint) => void; label?: string }) {
  const { project: p } = useStore();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!value && p.sites[0]) onChange({ lat: p.sites[0].lat, lon: p.sites[0].lon, label: p.sites[0].name, siteId: p.sites[0].id }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const find = async () => {
    const ll = parseLatLon(text); if (ll) { onChange({ ...ll, label: `${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}` }); setMsg(''); return; }
    if (!text.trim()) return;
    try { const [g] = await geocodeAddress(text); if (g) { onChange({ lat: g.lat, lon: g.lon, label: g.label.slice(0, 70) }); setMsg(''); } else setMsg('Not found. Type GPS coordinates like 35.5951, -82.5515.'); }
    catch { setMsg('Offline: address search needs internet. Type GPS coordinates like 35.5951, -82.5515, or pick a project site.'); }
  };
  const gps = () => {
    if (!navigator.geolocation) { setMsg('No GPS on this device.'); return; }
    setMsg('Finding your position…');
    navigator.geolocation.getCurrentPosition((g) => { onChange({ lat: g.coords.latitude, lon: g.coords.longitude, label: `My position (±${Math.round(g.coords.accuracy)} m)` }); setMsg(''); }, (e) => setMsg('GPS: ' + e.message), { enableHighAccuracy: true, timeout: 20000 });
  };
  return (
    <div className="stack-tight">
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <b className="small">{label}:</b>
        {p.sites.length > 0 && <select aria-label="Use a project site" value={value?.siteId ?? ''} onChange={(e) => { const s = p.sites.find((x) => x.id === e.target.value); if (s) onChange({ lat: s.lat, lon: s.lon, label: s.name, siteId: s.id }); }}>
          <option value="">Project site…</option>{p.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        <span style={{ flex: '1 1 220px', minWidth: 180 }}><AddressInput value={text} onChange={setText} ariaLabel="Address or GPS coordinates" placeholder="Address or GPS (35.5951, -82.5515)" onPick={(g) => onChange({ lat: g.lat, lon: g.lon, label: g.label.slice(0, 70) })} /></span>
        <button onClick={find}>Go</button>
        <button onClick={gps} title="Use this device's GPS">📍 My GPS</button>
      </div>
      {value && <span className="small muted">Using <b>{value.label}</b> ({value.lat.toFixed(5)}, {value.lon.toFixed(5)})</span>}
      {msg && <p className="note">{msg}</p>}
    </div>
  );
}
