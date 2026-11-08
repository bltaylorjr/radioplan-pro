// Map and directions to the project site: map of the location, one-tap directions in Google Maps,
// Apple Maps or Waze, from your office or where you are now, and the details a crew needs.
import React, { useState } from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { MapView } from '../components/MapView';
import { useUnits } from '../units';

const R = 6371;
const hav = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h));
};
const bearing = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r), x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
};
const compass = (d: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];

export function DirectionsPage() {
  const { project: p, go } = useStore();
  const u = useUnits();
  const m = p.meta, c = p.company, s = p.sites[0];
  const hasPos = !!s && Number.isFinite(s.lat) && (s.lat !== 0 || s.lon !== 0);
  const address = m.siteAddress?.trim() || [m.city, m.state].filter(Boolean).join(', ');
  const dest = address || (hasPos ? `${s.lat},${s.lon}` : '');
  const destLL = hasPos ? `${s.lat.toFixed(6)},${s.lon.toFixed(6)}` : '';
  const office = [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ');
  const [here, setHere] = useState<{ lat: number; lon: number; acc: number } | null>(null);
  const [msg, setMsg] = useState('');
  const locate = () => {
    if (!navigator.geolocation) { setMsg('This device does not share its location.'); return; }
    setMsg('Finding where you are…');
    navigator.geolocation.getCurrentPosition((g) => { setHere({ lat: g.coords.latitude, lon: g.coords.longitude, acc: g.coords.accuracy }); setMsg(''); }, (e) => setMsg(`Location not available: ${e.message}`), { enableHighAccuracy: true, timeout: 15000 });
  };
  const enc = encodeURIComponent;
  const gmaps = (from?: string) => `https://www.google.com/maps/dir/?api=1${from ? `&origin=${enc(from)}` : ''}&destination=${enc(address || destLL)}&travelmode=driving`;
  const apple = (from?: string) => `https://maps.apple.com/?${from ? `saddr=${enc(from)}&` : ''}daddr=${enc(address || destLL)}&dirflg=d`;
  const waze = `https://waze.com/ul?${address ? `q=${enc(address)}` : `ll=${enc(destLL)}`}&navigate=yes`;
  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => setMsg('Copied ✓'), () => setMsg(t)); };

  if (!dest) return <Card title="Map & directions"><p>Enter the project site address on <a href="#company" onClick={(e) => { e.preventDefault(); go('company'); }}>Company & Project</a> (or place Site A on the map) to see the map and get directions.</p></Card>;
  const fromHere = here ? `${here.lat.toFixed(6)},${here.lon.toFixed(6)}` : undefined;
  return (
    <div className="grid">
      <Card title="Project location" className="wide" tip="The project site address from Company & Project, shown at Site A's position. Directions open in the map app on this device.">
        <div className="dir-head">
          <div>
            <h3 style={{ margin: '0 0 4px' }}>📍 {m.name}</h3>
            <div>{address || 'No street address yet'}</div>
            <div className="small muted">{[m.county, m.state].filter(Boolean).join(', ')}{destLL && <> · GPS {destLL}</>}{hasPos && s.groundElevM != null && <> · elevation {u.len(s.groundElevM, 0)}</>}</div>
            {m.client && <div className="small">Client: {m.client}{m.clientContact ? ` · ${m.clientContact}` : ''}{m.clientPhone && <> · <a href={`tel:${m.clientPhone.replace(/[^0-9+]/g, '')}`}>{m.clientPhone}</a></>}</div>}
          </div>
          <div className="row wrap">
            <button onClick={() => copy(address || destLL)}>📋 Copy address</button>
            {destLL && <button onClick={() => copy(destLL)}>📋 Copy GPS</button>}
          </div>
        </div>
        {hasPos && m.siteAddress && !/geocod|address/i.test(s.positionSource ?? '') && <p className="note small">The map shows Site A's saved position, which may not be this address yet. <a href="#company" onClick={(e) => { e.preventDefault(); go('company'); }}>Press Find address → GPS</a> on Company & Project to move it. Directions already go to the address.</p>}
        {hasPos ? <MapView sites={p.sites} height={420} selectedId={s.id} center={{ lat: s.lat, lon: s.lon, zoom: 15 }} marker={here ? { lat: here.lat, lon: here.lon, label: 'You are here' } : null} />
          : <p className="note">The map needs a position for Site A. Press <b>Find address → GPS</b> on Company & Project; directions below already work from the address.</p>}
      </Card>

      <Card title="Directions" className="wide" tip="Opens turn-by-turn directions in Google Maps, Apple Maps or Waze. Needs internet for live routing.">
        <h4>From where you are now</h4>
        <div className="row wrap">
          <a className="button primary" href={gmaps(fromHere)} target="_blank" rel="noreferrer">🗺 Google Maps</a>
          <a className="button" href={apple(fromHere)} target="_blank" rel="noreferrer">🍎 Apple Maps</a>
          <a className="button" href={waze} target="_blank" rel="noreferrer">🚗 Waze</a>
          <button onClick={locate}>📡 Show me on the map</button>
        </div>
        {here && hasPos && <p className="small">You are {u.f(hav(here, s))} {compass(bearing(here, s))} of here in a straight line (±{Math.round(here.acc)} m).</p>}
        {office && <><h4>From your office</h4>
          <p className="small muted">{office}</p>
          <div className="row wrap">
            <a className="button" href={gmaps(office)} target="_blank" rel="noreferrer">🗺 Google Maps from the office</a>
            <a className="button" href={apple(office)} target="_blank" rel="noreferrer">🍎 Apple Maps from the office</a>
          </div></>}
        {!office && <p className="small muted">Add your company street address on Company & Project to get directions from the office.</p>}
        {p.sites.length > 1 && <><h4>Other sites on this project</h4>
          <ul>{p.sites.slice(1).map((x) => <li key={x.id}>{x.name}{x.address ? ` · ${x.address}` : ''} · <a href={`https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lon}`} target="_blank" rel="noreferrer">directions ↗</a></li>)}</ul></>}
        {msg && <p className="small note" role="status">{msg}</p>}
        <p className="small muted">Offline: the map shows saved map tiles and the GPS position; copy the address or GPS into your phone's map app when you have signal.</p>
      </Card>
    </div>
  );
}
