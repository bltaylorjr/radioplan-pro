// Existing towers and comm sites (OpenStreetMap) nearest to a site: co-location candidates, and what is
// already up in the area before a new structure is planned.
import React, { useState } from 'react';
import { loadCommSites, nearestSites } from '../engine/towers';
import type { Site } from '../types';
import { useUnits } from '../units';
import { declinationDeg, fmtAz } from '../engine/azimuth';
import { searchFcc, structureName, type NearTower } from '../engine/fccdata';
import { useStore } from '../store';

export function NearbyTowers({ site }: { site: Site }) {
  const u = useUnits();
  const [rows, setRows] = useState<ReturnType<typeof nearestSites> | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fcc, setFcc] = useState<NearTower[] | null>(null);
  const { go, setRt } = useStore();
  const find = async () => {
    setBusy(true); setMsg('Looking up existing towers near this site…');
    searchFcc(site, 13).then((r) => setFcc(r.towers.slice(0, 8))).catch(() => setFcc([]));
    try {
      const d = 0.12; // about 8 miles
      const r = await loadCommSites(site.lat - d, site.lon - d, site.lat + d, site.lon + d, { online: navigator.onLine });
      setRows(nearestSites(site, r.sites));
      setMsg(r.missing ? `Part of this area is not saved for offline use${navigator.onLine ? ' and the lookup failed' : ''}; the list may be incomplete.` : r.sites.length ? '' : 'No towers or comm sites are mapped in OpenStreetMap near this site.');
    } catch (e) { setMsg(`Lookup failed: ${(e as Error).message}`); } finally { setBusy(false); }
  };
  return (
    <div>
      <h4>Existing towers nearby</h4>
      <p className="small">Before planning a new structure, check what is already up: an existing tower may be a place to co-locate, and nearby transmitters matter for interference.</p>
      <button onClick={find} disabled={busy}>📡 Find existing towers near {site.name}</button>
      {msg && <p className="note">{msg}</p>}
      {fcc && fcc.length > 0 && <><p className="small"><b>FCC-registered towers</b> (built in, works offline):</p><div className="scroll-x"><table className="tbl"><thead><tr><th>ASR / owner</th><th>Structure</th><th>Height</th><th>Distance</th><th>Azimuth from site</th><th>Licenses on it</th></tr></thead>
        <tbody>{fcc.map((t) => <tr key={t.regNo}><td><b>{t.regNo}</b> {t.owner}</td><td className="small">{structureName(t.type)}</td><td>{u.len(t.heightAglM, 0)}</td><td>{u.f(t.km, 2)}</td><td className="nowrap">{fmtAz(t.brg, declinationDeg(site), 0)}</td><td>{new Set(t.on.map((x) => x.lic.call)).size}</td></tr>)}</tbody></table></div>
        <button className="ghost small" onClick={() => { setRt((r) => ({ ...r, focus: { lat: site.lat, lon: site.lon, label: site.name } })); go('fcc'); }}>See who is on each tower and their frequencies →</button>
        <p className="small"><b>Other towers and comm sites</b> (OpenStreetMap):</p></>}
      {rows && rows.length > 0 && <div className="scroll-x"><table className="tbl"><thead><tr><th>Name / operator</th><th>Type</th><th>Height</th><th>Distance</th><th>Azimuth from site</th></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.id}><td>{c.name || c.operator || '(no name)'}{c.name && c.operator ? <span className="small"> · {c.operator}</span> : null}</td><td>{c.kind}{c.services.length ? <span className="small"> ({c.services.join(', ')})</span> : null}</td>
          <td>{c.heightFt ? `${c.heightFt} ft` : '—'}</td><td>{u.f(c.km, 2)}</td><td className="nowrap">{fmtAz(c.brg, declinationDeg(site), 0)}</td></tr>)}</tbody></table></div>}
      {rows && rows.length > 0 && <p className="small muted">Source: OpenStreetMap contributors. Heights and owners may be missing or out of date; check the FCC Antenna Structure Registration (ASR) database and the owner before relying on a tower.</p>}
    </div>
  );
}
