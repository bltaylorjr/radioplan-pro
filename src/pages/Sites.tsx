import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Txt, Num, Sel, Check, Stat, fmt } from '../components/ui';
import { parseNmeaGga, averageFixes, NmeaFix, haversineKm, bearingDeg } from '../engine/geo';
import { fetchElevations, sampleDem } from '../engine/terrain';
import { geocodeAddress } from '../engine/geocode';
import { usgsPointElevation } from '../engine/autoterrain';
import { parseLatLon } from '../engine/locparse';
import { radioHorizonKm, mToFt } from '../engine/rf';
import type { Site, StructureType } from '../types';
import { uid } from '../defaults';
import { SiteDatabase } from '../components/SiteDatabase';
import { useUnits, DistNum } from '../units';
import { AddressInput } from '../components/AddressInput';

export function SitesPage() {
  const { project: p, update, rt } = useStore();
  const u = useUnits();
  const [selId, setSel] = useState(p.sites[0]?.id);
  const s = p.sites.find((x) => x.id === selId) ?? p.sites[0];
  const [msg, setMsg] = useState('');
  const [live, setLive] = useState<NmeaFix[]>([]);
  const serialStop = useRef<() => void>();
  const set = <K extends keyof Site>(k: K, v: Site[K]) => update((d) => { const t = d.sites.find((x) => x.id === s.id); if (t) t[k] = v; });
  const setPos = (lat: number, lon: number, src: string, acc: number | null, alt?: number | null) => update((d) => { const t = d.sites.find((x) => x.id === s.id)!; Object.assign(t, { lat, lon, positionSource: src, positionAccuracyM: acc }); if (alt != null) t.groundElevM = alt; });

  const deviceGps = () => {
    if (!navigator.geolocation) { setMsg('This device has no location service.'); return; }
    setMsg('Acquiring position (high accuracy)…');
    navigator.geolocation.getCurrentPosition(
      (g) => { setPos(g.coords.latitude, g.coords.longitude, 'Device GPS', g.coords.accuracy, null); setMsg(`Fix ±${g.coords.accuracy.toFixed(1)} m${g.coords.altitude != null ? `, GNSS altitude ${g.coords.altitude.toFixed(1)} m (ellipsoidal; ground elevation not changed)` : ''}.`); },
      (e) => setMsg(`GPS error: ${e.message}`), { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  };
  const importNmea = async (f?: File) => {
    if (!f) return;
    const fixes = parseNmeaGga(await f.text());
    const a = averageFixes(fixes);
    if (!a) { setMsg('No valid GGA sentences found.'); return; }
    setPos(a.lat, a.lon, `NMEA (${a.quality}, ${a.count} fixes)`, a.stdDev2dM, null);
    setMsg(`Averaged ${a.count} ${a.quality} fixes: σ2D = ${a.stdDev2dM.toFixed(2)} m, MSL altitude ${a.altM.toFixed(2)} m (antenna height of receiver not removed).`);
  };
  const serial = async () => {
    const nav = navigator as unknown as { serial?: { requestPort: () => Promise<{ open: (o: { baudRate: number }) => Promise<void>; readable: ReadableStream<Uint8Array>; close: () => Promise<void> }> } };
    if (!nav.serial) { setMsg('Web Serial not available here (use Chrome/Edge desktop, or import an NMEA log).'); return; }
    try {
      const port = await nav.serial.requestPort(); await port.open({ baudRate: 9600 });
      const reader = port.readable.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader();
      let stop = false, buf = '';
      serialStop.current = () => { stop = true; reader.cancel(); };
      setMsg('Streaming NMEA from receiver… press Stop & average when done.');
      while (!stop) { const { value, done } = await reader.read(); if (done) break; buf += value; const lines = buf.split('\n'); buf = lines.pop() ?? ''; const fx = parseNmeaGga(lines.join('\n')); if (fx.length) setLive((l) => [...l, ...fx].slice(-3600)); }
      await port.close();
    } catch (e) { setMsg(`Serial: ${(e as Error).message}`); }
  };
  const stopSerial = () => { serialStop.current?.(); const a = averageFixes(live); if (a) { setPos(a.lat, a.lon, `Live GNSS (${a.quality}, ${a.count} fixes)`, a.stdDev2dM, null); setMsg(`Averaged ${a.count} live fixes, σ2D ${a.stdDev2dM.toFixed(2)} m.`); } setLive([]); };
  const elev = async () => {
    const fromDem = rt.dem ? sampleDem(rt.dem, s) : null;
    if (fromDem != null) { set('groundElevM', Math.round(fromDem * 10) / 10); setMsg(`Ground elevation from ${rt.dem!.source}: ${fromDem.toFixed(1)} m.`); return; }
    try { const z = await usgsPointElevation(s); set('groundElevM', Math.round(z * 100) / 100); setMsg(`Ground elevation (USGS 3DEP point query): ${z.toFixed(2)} m NAVD88.`); return; } catch { /* outside US / offline */ }
    try { const [z] = await fetchElevations([s]); set('groundElevM', z); setMsg(`Ground elevation (Copernicus 90 m DEM): ${z} m.`); } catch (e) { setMsg(`Elevation lookup failed (offline?): ${(e as Error).message}. Terrain cached for this area is used automatically when available.`); }
  };
  const geocode = async () => {
    const ll = parseLatLon(s.address); if (ll) { setPos(ll.lat, ll.lon, 'Typed coordinates', null); setMsg('Coordinates applied.'); return; }
    try { const [r] = await geocodeAddress(s.address); if (!r) { setMsg('Address not found.'); return; } setPos(r.lat, r.lon, 'Geocoded address', 50); setMsg(`Geocoded: ${r.label}`); } catch (e) { setMsg(`Geocoding failed: ${(e as Error).message}`); }
  };
  const add = () => { const id = uid(); update((d) => { d.sites.push({ ...s, id, name: `Site ${String.fromCharCode(65 + d.sites.length)}` }); }); setSel(id); };
  const del = () => { if (p.sites.length <= 1) return; update((d) => { d.sites = d.sites.filter((x) => x.id !== s.id); }); setSel(p.sites[0].id); };
  if (!s) return null;
  const other = p.sites.find((x) => x.id !== s.id);
  return (
    <div className="grid2">
      <Card title="Sites" tour="site-list" actions={<span className="row"><button onClick={add}>+ Add site</button><button onClick={del} disabled={p.sites.length <= 1}>Delete</button></span>}>
        <div className="scroll-x"><table className="tbl"><thead><tr><th>Name</th><th>Lat</th><th>Lon</th><th>Ground (m)</th><th>Antenna AGL</th><th>Role</th></tr></thead>
          <tbody>{p.sites.map((x) => (
            <tr key={x.id} className={x.id === s.id ? 'sel' : ''} onClick={() => setSel(x.id)}>
              <td>{x.name}</td><td>{x.lat.toFixed(5)}</td><td>{x.lon.toFixed(5)}</td><td>{x.groundElevM ?? '—'}</td><td>{x.antennaAglM} m</td>
              <td>{p.radio.txSiteId === x.id ? 'TX' : p.radio.rxSiteId === x.id ? 'RX' : ''}</td></tr>))}</tbody></table></div>
        <div className="row">
          <button onClick={() => update((d) => { d.radio.txSiteId = s.id; })}>Set as TX</button>
          <button onClick={() => update((d) => { d.radio.rxSiteId = s.id; })}>Set as RX / far end</button>
        </div>
        {other && <div className="stats">
          <Stat label={`Distance to ${other.name}`} value={fmt(u.d(haversineKm(s, other)), 2)} unit={` ${u.unit}`} />
          <Stat label="Bearing" value={fmt(bearingDeg(s, other), 1)} unit="°T" />
          <Stat label="Radio horizon (4/3 earth)" value={fmt(u.d(radioHorizonKm(s.antennaAglM)), 1)} unit={` ${u.unit}`} tip="d = √(2·k·Re·h) ≈ 4.12·√h(m)" />
        </div>}
      </Card>
      <Card title={`Edit: ${s.name}`} tour="site-gps">
        <div className="form">
          <Field label="Site name"><Txt value={s.name} onChange={(v) => set('name', v)} /></Field>
          <Field label="Street address" wide><span className="row"><AddressInput value={s.address} onChange={(v) => set('address', v)} onPick={(g) => { setPos(g.lat, g.lon, 'Address suggestion', 50); setMsg(`Located: ${g.label}`); }} /><button onClick={geocode} disabled={!s.address}>📍 Geocode</button></span></Field>
          <Field label="Latitude (WGS84)" tip="Decimal degrees, north positive."><Num value={s.lat} onChange={(v) => setPos(v!, s.lon, 'Manual', null)} unit="°" /></Field>
          <Field label="Longitude (WGS84)" tip="Decimal degrees, west negative (e.g. -80.84)."><Num value={s.lon} onChange={(v) => setPos(s.lat, v!, 'Manual', null)} unit="°" /></Field>
          <Field label="Ground elevation (AMSL)" tip="Ground height above mean sea level (NAVD88)."><span className="row"><Num value={s.groundElevM} nullable onChange={(v) => set('groundElevM', v)} unit="m" /><button onClick={elev}>Lookup</button></span></Field>
          <Field label="Position source"><span className="muted">{s.positionSource}{s.positionAccuracyM != null && ` (±${s.positionAccuracyM.toFixed(1)} m)`}</span></Field>
        </div>
        <div className="row wrap">
          <button className="primary" onClick={deviceGps}>🛰 Use this device's GPS</button>
          <label className="btn">📄 Import NMEA log<input hidden type="file" accept=".nmea,.txt,.log,.ubx" onChange={(e) => importNmea(e.target.files?.[0])} /></label>
          {live.length ? <button onClick={stopSerial}>■ Stop & average ({live.length})</button> : <button onClick={serial} title="USB GNSS receiver via Web Serial">🔌 Live GNSS (USB serial)</button>}
        </div>
        {msg && <p className="note">{msg}</p>}
        <h4 data-tour="site-structure">Structure</h4>
        <div className="form">
          <Field label="Structure type"><Sel<StructureType> value={s.structure} onChange={(v) => set('structure', v)} options={['monopole', 'self-support lattice', 'guyed lattice', 'rooftop', 'water tank', 'wood pole']} /></Field>
          <Field label="Structure height AGL" tip="Overall height including appurtenances (for FAA Part 77)."><Num value={s.structureHeightM} onChange={(v) => set('structureHeightM', v!)} unit={`m (${mToFt(s.structureHeightM).toFixed(0)} ft)`} /></Field>
          <Field label="Antenna centerline AGL"><Num value={s.antennaAglM} onChange={(v) => set('antennaAglM', v!)} unit={`m (${mToFt(s.antennaAglM).toFixed(0)} ft)`} /></Field>
          <Field label="On / in a building"><Check value={s.onBuilding} onChange={(v) => set('onBuilding', v)} label="Yes" /></Field>
          <Field label="Nearest public-use airport" tip="Distance to nearest runway for 14 CFR 77.9(b)."><DistNum km={s.nearestAirportKm} nullable onChange={(v) => set('nearestAirportKm', v)} /></Field>
          <Field label="Longest runway"><Num value={s.nearestRunwayFt} nullable onChange={(v) => set('nearestRunwayFt', v)} unit="ft" /></Field>
        </div>
      </Card>
      <SiteDatabase />
    </div>
  );
}
