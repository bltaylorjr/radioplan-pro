// Donor antenna aiming for ERCES / BDA and DAS: azimuth from the building's roof to the public-safety (donor) tower.
import React, { useState } from 'react';
import { useStore } from '../store';
import { useUnits } from '../units';
import { Card } from './ui';
import { AddressInput } from './AddressInput';
import { AzStats, useAzimuth, AZ_TIP } from './Azimuth';
import { fmtAz } from '../engine/azimuth';
import { Tip } from './ui';
import { parseLatLon } from '../engine/locparse';
import { geocodeAddress } from '../engine/geocode';
import { haversineKm } from '../engine/geo';

export function DonorAimCard({ title = 'Donor antenna aiming (azimuth)' }: { title?: string }) {
  const { project: p, update } = useStore();
  const u = useUnits();
  const e = p.erces, b = p.sites[0];
  const donor = e.donorLat != null && e.donorLon != null ? { lat: e.donorLat, lon: e.donorLon } : null;
  const [text, setText] = useState(donor ? `${donor.lat.toFixed(5)}, ${donor.lon.toFixed(5)}` : '');
  const [msg, setMsg] = useState('');
  const set = (lat: number, lon: number, name?: string) => update((d) => { d.erces.donorLat = lat; d.erces.donorLon = lon; if (name != null) d.erces.donorName = name; });
  const find = async () => {
    const ll = parseLatLon(text); if (ll) { set(ll.lat, ll.lon, e.donorName || `Tower at ${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}`); setMsg(''); return; }
    try { const [g] = await geocodeAddress(text); if (g) { set(g.lat, g.lon, e.donorName || g.label.slice(0, 60)); setMsg(''); } else setMsg('Not found. Type GPS coordinates like 35.6012, -82.5540.'); }
    catch { setMsg('Offline: type GPS coordinates like 35.6012, -82.5540.'); }
  };
  const others = p.sites.slice(1);
  const z = useAzimuth(b, donor);
  return (
    <Card title={title} tip="Where to point the roof donor (Yagi or panel) antenna so the BDA hears the public-safety tower. Uses the first site on Site Data & GPS as the building.">
      {!b ? <p className="small muted">Set the building position on Site Data & GPS first.</p> : <>
        <p className="small">Building: <b>{b.name}</b> ({b.lat.toFixed(5)}, {b.lon.toFixed(5)}). Donor tower: {e.donorName ? <b>{e.donorName}</b> : 'type its GPS position or address, pick a site, or use “Aim donor here” in the RadioReference list.'}</p>
        <div className="row wrap" style={{ alignItems: 'center' }}>
          <span style={{ flex: '1 1 240px', minWidth: 200 }}><AddressInput value={text} onChange={setText} ariaLabel="Donor tower location" placeholder="Donor tower GPS or address" onPick={(g) => set(g.lat, g.lon, g.label.slice(0, 60))} /></span>
          <button onClick={find}>Set donor</button>
          {others.length > 0 && <select aria-label="Use a project site as the donor" value="" onChange={(ev) => { const s = others.find((x) => x.id === ev.target.value); if (s) { set(s.lat, s.lon, s.name); setText(`${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`); } }}>
            <option value="">Use a project site…</option>{others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          {donor && <button className="ghost" onClick={() => { update((d) => { d.erces.donorLat = null; d.erces.donorLon = null; d.erces.donorName = ''; }); setText(''); }}>Clear</button>}
        </div>
        {msg && <p className="note">{msg}</p>}
        {donor && <>
          <div className="stats">
            <AzStats a={b} b={donor} aName="Roof" bName="Donor" />
          </div>
          {z && <p className="small">🧭 Point the roof donor antenna at <b>{fmtAz(z.fwd, z.decA)}</b>. <Tip text={AZ_TIP} /></p>}
          <p className="small muted">{u.f(haversineKm(b, donor))} to the donor. Aim on the true azimuth with a GPS alignment tool, or on the magnetic reading with a compass held well away from roof steel and HVAC units, then peak on measured signal. Keep at least the BDA maker's isolation (often 15 dB more than the BDA gain) between donor and indoor antennas: put the building between them where you can.</p>
        </>}
      </>}
    </Card>
  );
}
