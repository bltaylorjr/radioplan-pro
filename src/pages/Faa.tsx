// FAA Height Check: does a new tower, mast or antenna need FAA notice (Form 7460-1) under 14 CFR 77.9?
// Airports and runways are built in (FAA NASR), so it works offline.
import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import { useStore } from '../store';
import { Card, Field, Num, Stat, Badge, Tip } from '../components/ui';
import { useUnits } from '../units';
import { MapView } from '../components/MapView';
import { PointPicker, type PickedPoint } from '../components/PointPicker';
import { faaCheck, FT_PER_M, AIRPORT_TYPE, ownershipName, FAA_NOTICE_TOOL, FAA_OEAAA, FCC_TOWAIR, type FaaResult } from '../engine/faa';
import { declinationDeg, fmtAz } from '../engine/azimuth';
import { sampleDem, finestDem } from '../engine/terrain';
import { bundledDem } from '../engine/bundledTerrain';
import { usgsPointElevation } from '../engine/autoterrain';

export function FaaPage() {
  const { project: p, update, rt } = useStore();
  const u = useUnits();
  const f0 = rt.focus;
  const [pt, setPt] = useState<PickedPoint | null>(f0 ? { lat: f0.lat, lon: f0.lon, label: f0.label ?? 'Chosen spot' } : null);
  const site = p.sites.find((s) => s.id === pt?.siteId);
  const [heightFt, setHeightFt] = useState<number>(f0?.heightFt ?? Math.round(((p.sites[0]?.structureHeightM ?? 30) + 1) * FT_PER_M));
  const [groundFt, setGroundFt] = useState<number | null>(null);
  const [groundSrc, setGroundSrc] = useState('');
  const [manualGround, setManualGround] = useState(false);
  const [res, setRes] = useState<FaaResult | null>(null);
  const [msg, setMsg] = useState('');
  // height from the chosen project site (structure + antenna above it)
  useEffect(() => { if (site) setHeightFt(Math.round(Math.max(site.structureHeightM, site.antennaAglM) * FT_PER_M) + 3); }, [site?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // ground elevation: the site's surveyed value, the project terrain, the built-in terrain, then USGS online
  useEffect(() => {
    if (!pt || manualGround) return; let live = true;
    (async () => {
      const set = (m: number, src: string) => { if (live) { setGroundFt(Math.round(m * FT_PER_M)); setGroundSrc(src); } };
      if (f0 && f0.lat === pt.lat && f0.lon === pt.lon && f0.groundM != null) return set(f0.groundM, 'FCC tower registration');
      if (site?.groundElevM != null) return set(site.groundElevM, 'Site Data & GPS');
      const g = finestDem([rt.demPath, rt.dem], [pt]), d = g ? sampleDem(g, pt) : null; if (d != null && Number.isFinite(d)) return set(d, 'project terrain');
      const b = await bundledDem(); const v = b ? sampleDem(b, pt) : null; if (v != null && Number.isFinite(v) && v > -1000) return set(v, 'built-in terrain');
      try { set(await usgsPointElevation(pt), 'USGS 3DEP (online)'); } catch { if (live) { setGroundFt(null); setGroundSrc(''); } }
    })();
    return () => { live = false; };
  }, [pt?.lat, pt?.lon, manualGround, rt.dem, rt.demPath]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pt) return; let live = true; faaCheck(pt, heightFt, groundFt).then((r) => live && setRes(r)).catch((e) => live && setMsg((e as Error).message)); return () => { live = false; }; }, [pt?.lat, pt?.lon, heightFt, groundFt]); // eslint-disable-line react-hooks/exhaustive-deps

  const dec = pt ? declinationDeg(pt) : 0;
  const nearestQ = res?.nearest.find((c) => c.qualifies === 'yes');
  const apply = () => { if (!site || !nearestQ) return; update((d) => { const s = d.sites.find((x) => x.id === site.id); if (s) { s.nearestAirportKm = nearestQ.distFt / FT_PER_M / 1000; s.nearestRunwayFt = nearestQ.longestFt; } }); setMsg(`✓ ${site.name}: nearest public airport ${nearestQ.airport.id} and its longest runway saved; Code Compliance uses them.`); };
  const tone = res?.verdict === 'notice' ? 'bad' : res?.verdict === 'check' ? 'warn' : 'ok';
  const draw = (g: L.LayerGroup) => {
    if (!pt || !res) return;
    for (const c of res.nearest) {
      const col = c.within && (c.exceedsFt ?? -1) > 0 ? '#d62728' : c.within ? '#ff9800' : '#1f77b4';
      for (const rw of c.airport.runways) if (rw.ends.length === 2) L.polyline(rw.ends.map((e) => [e.lat, e.lon] as [number, number]), { color: col, weight: 5 }).addTo(g);
      L.circle([c.airport.lat, c.airport.lon], { radius: c.reachFt / FT_PER_M, color: col, weight: 1, fill: false, dashArray: '5 5' }).addTo(g);
      L.circleMarker([c.airport.lat, c.airport.lon], { radius: 4, color: col }).bindTooltip(`${c.airport.id} ${c.airport.name}`).addTo(g);
    }
    L.circleMarker([pt.lat, pt.lon], { radius: 7, color: '#000', fillColor: tone === 'bad' ? '#d62728' : tone === 'warn' ? '#ff9800' : '#2ca02c', fillOpacity: 1 }).bindTooltip(`${heightFt} ft structure`).addTo(g);
  };
  return (
    <div className="stack">
      <Card title="Structure" tip="14 CFR 77.9: FAA notice is needed for anything taller than 200 ft above ground, or taller than the sloping surface around a public-use or military airport or heliport.">
        <PointPicker value={pt} onChange={(x) => { setPt(x); setManualGround(false); }} label="Structure location" />
        <div className="form" style={{ marginTop: 8 }}>
          <Field label="Overall height above ground" tip="The very top: tower or mast, plus antennas, lightning rod and anything else on top."><Num value={heightFt} step={1} onChange={(v) => setHeightFt(Math.max(0, Math.round(v ?? 0)))} unit="ft" /></Field>
          <Field label="Ground elevation" tip="Above mean sea level, at the base of the structure. Filled in for you; type a surveyed value if you have one."><span className="row wrap"><Num value={groundFt} nullable step={1} onChange={(v) => { setGroundFt(v == null ? null : Math.round(v)); setManualGround(true); setGroundSrc('typed in'); }} unit="ft" />{groundSrc && <span className="small muted">from {groundSrc}</span>}{manualGround && <button className="small ghost" onClick={() => setManualGround(false)}>Auto</button>}</span></Field>
        </div>
      </Card>
      {res && <Card title="Result">
        <div className="stats">
          <Stat label="FAA notice (Form 7460-1)" value={res.verdict === 'notice' ? 'Needed' : res.verdict === 'check' ? 'Check' : 'Not needed'} tone={tone} />
          <Stat label="Tallest without notice here" value={res.maxNoNoticeFt == null ? '—' : u.lenFt(Math.floor(res.maxNoNoticeFt))} tip="Under 77.9(a) and (b), counting public-use, military and instrument-approach airports and heliports." />
          <Stat label="Your structure" value={u.lenFt(heightFt)} />
          <Stat label="Nearest airport" value={res.nearest[0] ? `${res.nearest[0].airport.id} · ${u.f(res.nearest[0].distFt / FT_PER_M / 1000, 1)}` : '—'} />
        </div>
        {res.verdict === 'notice' && <p className="note bad-text">⚠ File FAA Form 7460-1 on the FAA OE/AAA website at least 45 days before construction (or the date the permit application is filed, whichever is earlier). Because FAA notice is needed, the structure also needs <b>FCC Antenna Structure Registration</b> before it is built (47 CFR 17.4) if it will hold FCC-licensed antennas.</p>}
        {res.verdict === 'check' && <p className="note">Probably fine, but check: see the notes below, then confirm with the FAA Notice Criteria Tool.</p>}
        {res.verdict === 'no-notice' && <p className="note">✓ No FAA notice needed for {heightFt} ft at this spot under 77.9(a) and (b). Keep a printout of the FAA Notice Criteria Tool result in the job file.</p>}
        {res.reasons.length > 0 && <ul className="small">{res.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
        <div className="row wrap">
          <a className="btn" href={FAA_NOTICE_TOOL} target="_blank" rel="noreferrer">FAA Notice Criteria Tool ↗</a>
          <a className="btn" href={FAA_OEAAA} target="_blank" rel="noreferrer">File 7460-1 (FAA OE/AAA) ↗</a>
          <a className="btn" href={FCC_TOWAIR} target="_blank" rel="noreferrer">FCC TOWAIR ↗</a>
          {site && nearestQ && <button onClick={apply} title="Save the nearest public airport distance and runway length on the site, for the code checks">Save airport on {site.name}</button>}
        </div>
        {msg && <p className="note">{msg}</p>}
      </Card>}
      {res && pt && <Card title="Airports nearby" tip="Distance is to the nearest point of the nearest runway. The surface rises 1 ft for every 100 ft (runway over 3,200 ft, out to 20,000 ft), 1 for 50 (shorter runways, out to 10,000 ft) or 1 for 25 (heliports, out to 5,000 ft) from the runway elevation.">
        <MapView sites={[]} height={380} center={{ lat: pt.lat, lon: pt.lon, zoom: 11 }} extra={draw} extraKey={[res, pt.lat, pt.lon]} />
        <div className="scroll-x"><table className="tbl"><thead><tr><th>Airport</th><th>Kind</th><th>Distance to runway</th><th>Azimuth</th><th>Longest runway</th><th>Rule</th><th>Surface height here <Tip text="Height of the 77.9(b) surface above the ground at your structure." /></th><th>Your margin</th></tr></thead>
          <tbody>{res.nearest.map((c) => <tr key={c.airport.id + c.airport.state}>
            <td><b>{c.airport.id}</b> {c.airport.name}<div className="small muted">{c.airport.city}, {c.airport.state}</div></td>
            <td className="small">{AIRPORT_TYPE[c.airport.type]} · {c.airport.use === 'PU' ? 'public use' : 'private use'}{c.airport.military ? ' · military' : ''}<div className="muted">{ownershipName(c.airport.ownership)} owned{c.qualifies === 'maybe' ? ' · counts only with an instrument approach' : ''}</div></td>
            <td className="nowrap">{u.lenFt(c.distFt)}<div className="small muted">{u.f(c.distFt / FT_PER_M / 1000, 2)}</div></td>
            <td className="nowrap">{fmtAz(c.brg, dec, 0)}</td>
            <td className="nowrap">{c.airport.type === 'H' ? '—' : u.lenFt(c.longestFt)}</td>
            <td className="small">{c.slope}:1 to {u.lenFt(c.reachFt)}{c.within ? '' : <div className="muted">out of reach</div>}</td>
            <td className="nowrap">{c.within && c.surfaceAglFt != null ? u.lenFt(c.surfaceAglFt) : '—'}</td>
            <td className={'nowrap ' + (c.within && (c.exceedsFt ?? -1) > 0 ? 'bad-text' : '')}>{c.within && c.exceedsFt != null ? (c.exceedsFt > 0 ? `${u.lenFt(c.exceedsFt)} too tall` : `${u.lenFt(-c.exceedsFt)} to spare`) : '—'}</td>
          </tr>)}</tbody></table></div>
        <p className="small muted">Airports: FAA NASR 28-day data, cycle {res.cycle.replace(/_/g, ' ')}, built in. Not counted here: 77.9(c) roads and railroads under the structure (add 17 ft for an Interstate, 15 ft other public roads, 23 ft railroads), shielding by nearby taller structures or terrain (77.9(e)(1)), and antennas 20 ft or shorter that don't make another antenna structure taller (77.9(e)(4)). <Badge kind="real">14 CFR 77.9, checked against the eCFR</Badge> A planning screen only: the FAA tool and the FAA's determination decide.</p>
      </Card>}
    </div>
  );
}

export default FaaPage;
