// FCC Towers & Licenses: registered antenna structures (ASR) and licensed transmitters (ULS) near any spot,
// from FCC public data built into the app (works offline). Who is on each tower, and on what frequencies.
import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { useStore, downloadText } from '../store';
import { Card, Field, Sel, Txt, Badge, Stat } from '../components/ui';
import { DistNum, useUnits } from '../units';
import { MapView } from '../components/MapView';
import { PointPicker, type PickedPoint } from '../components/PointPicker';
import { declinationDeg, fmtAz } from '../engine/azimuth';
import { searchFcc, BANDS, SERVICE_GROUPS, serviceName, serviceGroup, className, emissionWords, uniqueFreqs, structureName, ulsLicenseUrl, asrUrl, type FccResult, type NearTower, type License, type Freq, type ServiceGroup } from '../engine/fccdata';
import { FT_PER_M } from '../engine/faa';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const mhz = (f: number) => f >= 1000 ? `${(f / 1000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} GHz` : `${f.toFixed(5).replace(/0+$/, '').replace(/\.$/, '')}`;
export const freqList = (fs: Freq[], max = 8) => { const u = uniqueFreqs(fs); return u.slice(0, max).map((f) => mhz(f.mhz)).join(', ') + (u.length > max ? ` +${u.length - max} more` : ''); };
const GROUP_COLOR: Record<ServiceGroup, string> = { 'Public safety': '#d62728', 'Business & industrial': '#1f77b4', Commercial: '#9467bd', Microwave: '#2ca02c', Paging: '#8c564b', Other: '#7f7f7f' };
const asrIcon = L.divIcon({ className: 'tower-pin', html: '<div style="background:#ff9800;color:#000;border-radius:3px;padding:0 2px;font-size:12px">🗼</div>', iconSize: [20, 20], iconAnchor: [10, 18] });

export function FccPage() {
  const { project: p, update, go, setRt, rt } = useStore();
  const u = useUnits();
  const ft = (m: number | null | undefined) => u.len(m, 0);
  const [pt, setPt] = useState<PickedPoint | null>(rt.focus ? { lat: rt.focus.lat, lon: rt.focus.lon, label: rt.focus.label ?? 'Chosen spot' } : null);
  const [radiusKm, setRadiusKm] = useState(8.04672);
  const [band, setBand] = useState('all');
  const [group, setGroup] = useState<ServiceGroup | 'all'>('all');
  const [text, setText] = useState('');
  const [res, setRes] = useState<FccResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [tab, setTab] = useState<'towers' | 'licenses' | 'county'>('towers');
  useEffect(() => {
    if (!pt) return; let live = true; setBusy(true); setMsg('');
    const t = setTimeout(() => searchFcc(pt, radiusKm, { band, group, text }, p.meta.county).then((r) => { if (live) setRes(r); }).catch((e) => live && setMsg((e as Error).message)).finally(() => live && setBusy(false)), 150);
    return () => { live = false; clearTimeout(t); };
  }, [pt?.lat, pt?.lon, radiusKm, band, group, text, p.meta.county]); // eslint-disable-line react-hooks/exhaustive-deps
  const dec = pt ? declinationDeg(pt) : 0;
  const shownTowers = useMemo(() => !res ? [] : res.towers.filter((t) => band === 'all' && group === 'all' && !text ? true : t.on.some((L2) => res.licenses.some((x) => x.lic === L2.lic))), [res, band, group, text]);

  const addSite = (t: { lat: number; lon: number; name: string; groundM?: number | null; heightM?: number | null }) => update((d) => {
    const base = d.sites[0]; const id = Date.now().toString(36);
    d.sites.push({ ...base, id, name: t.name.slice(0, 40), address: '', lat: t.lat, lon: t.lon, groundElevM: t.groundM ?? null, positionSource: 'FCC ASR', positionAccuracyM: null, structureHeightM: t.heightM ?? base.structureHeightM, antennaAglM: Math.min(base.antennaAglM, t.heightM ?? base.antennaAglM), onBuilding: false, nearestAirportKm: null, nearestRunwayFt: null, tx: undefined });
  });
  const donor = (lat: number, lon: number, name: string) => { update((d) => { d.erces.donorLat = lat; d.erces.donorLon = lon; d.erces.donorName = name.slice(0, 60); }); setMsg(`✓ Set as the ERCES donor tower: ${name}. See Emergency Radio (ERCES / BDA).`); };
  const faa = (t: NearTower) => { setRt((r) => ({ ...r, focus: { lat: t.lat, lon: t.lon, label: `ASR ${t.regNo} · ${t.owner}`, heightFt: t.heightAglM != null ? Math.round(t.heightAglM * FT_PER_M) : undefined, groundM: t.groundM } })); go('faa'); };
  const csv = () => {
    if (!res) return;
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Kind', 'ASR / call sign', 'Owner / licensee', 'Service', 'Frequencies (MHz)', 'Height AGL (ft)', 'Latitude', 'Longitude', 'Distance (mi)', 'Azimuth (°T)']];
    for (const t of res.towers) rows.push(['Tower (ASR)', String(t.regNo), t.owner, structureName(t.type), '', t.heightAglM != null ? String(Math.round(t.heightAglM * FT_PER_M)) : '', String(t.lat), String(t.lon), (t.km / 1.609344).toFixed(2), t.brg.toFixed(0)]);
    for (const x of res.licenses) rows.push(['License location', x.lic.call, x.lic.licensee, serviceName(x.lic.service), uniqueFreqs(x.loc.freqs).map((f) => f.mhz).join(' '), x.loc.structureM != null ? String(Math.round(x.loc.structureM * FT_PER_M)) : '', String(x.loc.lat), String(x.loc.lon), (x.km / 1.609344).toFixed(2), x.brg.toFixed(0)]);
    downloadText('fcc-towers-licenses.csv', rows.map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv');
  };
  const draw = (g: L.LayerGroup) => {
    if (!pt || !res) return;
    L.circle([pt.lat, pt.lon], { radius: radiusKm * 1000, color: '#ff9800', weight: 1, fill: false, dashArray: '4 4' }).addTo(g);
    L.circleMarker([pt.lat, pt.lon], { radius: 6, color: '#000', fillColor: '#ffeb3b', fillOpacity: 1 }).bindTooltip(esc(pt.label)).addTo(g);
    for (const x of res.licenses.slice(0, 300)) {
      const c = GROUP_COLOR[serviceGroup(x.lic.service)];
      L.circleMarker([x.loc.lat, x.loc.lon], { radius: 4, color: c, fillColor: c, fillOpacity: 0.8, weight: 1 })
        .bindPopup(`<b>${esc(x.lic.call)}</b> · ${esc(x.lic.licensee)}<br>${esc(serviceName(x.lic.service))}<br>${esc(freqList(x.loc.freqs, 12))} MHz<br>${esc(x.loc.name)}`).addTo(g);
    }
    for (const t of res.towers) {
      L.marker([t.lat, t.lon], { icon: asrIcon, keyboard: false })
        .bindPopup(`<b>ASR ${t.regNo}</b> · ${esc(t.owner)}<br>${esc(structureName(t.type))}, ${ft(t.heightAglM)} above ground<br>${t.on.length} license location(s) on it<br>${esc(t.status)}`)
        .bindTooltip(`${ft(t.heightAglM)}`, { direction: 'right', offset: [8, -6], className: 'tower-label' }).addTo(g);
    }
  };
  const licRow = (l: License, fs: Freq[], km: number | null, brg: number | null, key: string, at?: { lat: number; lon: number; name: string }) => (
    <tr key={key}>
      <td className="nowrap"><b>{l.call}</b>{l.usi ? <> <a href={ulsLicenseUrl(l.usi)} target="_blank" rel="noreferrer" className="small" title="Open the FCC license page (online)">FCC ↗</a></> : null}</td>
      <td>{l.licensee}{l.phone && <div className="small muted">{l.phone.replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}</div>}</td>
      <td><span className="pill" style={{ marginLeft: 0, background: GROUP_COLOR[serviceGroup(l.service)], color: '#fff' }}>{serviceGroup(l.service)}</span><div className="small">{serviceName(l.service)}</div></td>
      <td className="small">{freqList(fs, 10)}<div className="muted">{[...new Set(fs.map((f) => className(f.cls)))].slice(0, 3).join(', ')}{fs.some((f) => f.erpW) ? ` · up to ${Math.max(...fs.map((f) => f.erpW))} W ERP` : ''}</div>{l.emissions.length > 0 && <div className="muted" title={l.emissions.map(emissionWords).join('\n')}>{emissionWords(l.emissions[0])}{l.emissions.length > 1 ? ` +${l.emissions.length - 1}` : ''}</div>}</td>
      <td className="nowrap">{km != null ? u.f(km, 2) : 'county-wide'}</td><td className="nowrap">{brg != null ? fmtAz(brg, dec, 0) : '—'}</td>
      <td className="small nowrap">{l.expires}</td>
      <td>{at && <button className="small" onClick={() => donor(at.lat, at.lon, `${l.call} ${l.licensee}`)} title="Aim the ERCES donor antenna at this transmitter">Use as donor</button>}</td>
    </tr>);
  return (
    <div className="stack">
      <Card title="Find towers and licenses" tip="FCC public data built into the app: registered antenna structures and active land-mobile, microwave and paging licenses in NC, SC, GA, TN and VA. Works offline.">
        <PointPicker value={pt} onChange={setPt} label="Look around" />
        <div className="form" style={{ marginTop: 8 }}>
          <Field label="Distance"><DistNum km={radiusKm} onChange={(v) => setRadiusKm(Math.max(0.2, Math.min(40, v ?? 8)))} suffix=" around the spot" /></Field>
          <Field label="Band"><Sel value={band} onChange={setBand} options={[['all', 'All bands'], ...BANDS.map((b) => [b.id, b.label] as [string, string])]} /></Field>
          <Field label="Kind of user"><Sel value={group} onChange={(v) => setGroup(v as ServiceGroup | 'all')} options={[['all', 'Everyone'], ...SERVICE_GROUPS.map((g) => [g, g] as [string, string])]} /></Field>
          <Field label="Search" tip="Licensee name, call sign or frequency (for example: sheriff, WQXW739, 155.)"><Txt value={text} onChange={setText} placeholder="Name, call sign or MHz" /></Field>
        </div>
        {busy && <p className="small muted">Looking it up…</p>}
        {msg && <p className="note">{msg}</p>}
        {res && <div className="stats">
          <Stat label="Registered towers" value={shownTowers.length} />
          <Stat label="Licensed transmitter spots" value={res.licenses.length} />
          <Stat label="County-wide mobile licenses" value={res.countyWide.length} />
        </div>}
      </Card>
      {pt && <Card title="Map" tip="Orange = FCC-registered towers. Dots = licensed transmitters: red public safety, blue business, purple commercial, green microwave, brown paging. Tap the map to look somewhere else.">
        <MapView sites={p.sites} height={460} center={{ lat: pt.lat, lon: pt.lon, zoom: radiusKm > 15 ? 10 : radiusKm > 6 ? 11 : 13 }} onClick={(lat, lon) => setPt({ lat, lon, label: `${lat.toFixed(5)}, ${lon.toFixed(5)}` })} extra={draw} extraKey={[res, pt.lat, pt.lon, radiusKm]} />
      </Card>}
      {res && <Card title="Results" actions={<span className="row wrap"><button className={tab === 'towers' ? 'primary' : ''} onClick={() => setTab('towers')}>🗼 Towers ({shownTowers.length})</button><button className={tab === 'licenses' ? 'primary' : ''} onClick={() => setTab('licenses')}>📻 Licenses ({res.licenses.length})</button>{p.meta.county && <button className={tab === 'county' ? 'primary' : ''} onClick={() => setTab('county')}>{p.meta.county.replace(/ County$/i, '')} County ({res.countyWide.length})</button>}<button onClick={csv}>⬇ CSV</button></span>}>
        {tab === 'towers' && (shownTowers.length ? <div className="scroll-x"><table className="tbl"><thead><tr><th>ASR</th><th>Owner</th><th>Structure</th><th>Height</th><th>Distance</th><th>Azimuth</th><th>On it</th><th></th></tr></thead><tbody>
          {shownTowers.map((t) => <React.Fragment key={t.regNo}>
            <tr>
              <td className="nowrap"><b>{t.regNo}</b>{t.usi ? <> <a href={asrUrl(t.usi)} target="_blank" rel="noreferrer" className="small" title="Open the FCC registration (online)">FCC ↗</a></> : null}{t.status !== 'Constructed' && <div className="small bad-text">{t.status}</div>}</td>
              <td>{t.owner}<div className="small muted">{t.address}{t.city ? `, ${t.city}` : ''}</div></td>
              <td className="small">{structureName(t.type)}{t.lighting && t.lighting !== 'NONE' ? <div className="muted">FAA marking/lighting: {t.lighting}</div> : null}</td>
              <td className="nowrap">{ft(t.heightAglM)}<div className="small muted">ground {ft(t.groundM)}</div></td>
              <td className="nowrap">{u.f(t.km, 2)}</td><td className="nowrap">{fmtAz(t.brg, dec, 0)}</td>
              <td>{t.on.length ? <button className="small" onClick={() => setOpen(open === t.regNo ? null : t.regNo)}>{open === t.regNo ? '▾' : '▸'} {new Set(t.on.map((x) => x.lic.call)).size} licenses</button> : <span className="small muted">none listed</span>}</td>
              <td><span className="row wrap" style={{ gap: 4 }}><button className="small" onClick={() => addSite({ lat: t.lat, lon: t.lon, name: `${t.owner.split(/[ ,]/)[0]} ASR ${t.regNo}`, groundM: t.groundM, heightM: t.heightAglM })}>+ Add as site</button>
                <button className="small" onClick={() => donor(t.lat, t.lon, `ASR ${t.regNo} ${t.owner}`)}>Use as donor</button>
                <button className="small" onClick={() => faa(t)}>FAA check</button></span></td>
            </tr>
            {open === t.regNo && <tr><td colSpan={8}><table className="tbl small"><tbody>{[...new Map(t.on.map((x) => [x.lic.call, x])).values()].map((x) => licRow(x.lic, x.freqs, null, null, x.lic.call))}</tbody></table></td></tr>}
          </React.Fragment>)}
        </tbody></table></div> : <p className="small muted">No FCC-registered towers here. Towers under 200 ft away from airports usually don't need to register; see 📡 Existing towers on the map for others.</p>)}
        {tab === 'licenses' && (res.licenses.length ? <div className="scroll-x"><table className="tbl"><thead><tr><th>Call sign</th><th>Licensee</th><th>Service</th><th>Frequencies (MHz)</th><th>Distance</th><th>Azimuth</th><th>Expires</th><th></th></tr></thead>
          <tbody>{res.licenses.map((x, i) => licRow(x.lic, x.loc.freqs, x.km, x.brg, `${x.lic.call}${i}`, { lat: x.loc.lat, lon: x.loc.lon, name: x.loc.name }))}</tbody></table></div> : <p className="small muted">No licensed transmitter locations match.</p>)}
        {tab === 'county' && (res.countyWide.length ? <><p className="small">Licenses for mobile radios and portables anywhere in {p.meta.county.replace(/ County$/i, '')} County (no fixed spot listed).</p><div className="scroll-x"><table className="tbl"><thead><tr><th>Call sign</th><th>Licensee</th><th>Service</th><th>Frequencies (MHz)</th><th>Distance</th><th>Azimuth</th><th>Expires</th><th></th></tr></thead>
          <tbody>{res.countyWide.map((l) => licRow(l, l.freqs, null, null, l.call))}</tbody></table></div></> : <p className="small muted">No county-wide licenses match.</p>)}
        <p className="small muted">Source: FCC Antenna Structure Registration and Universal Licensing System public files, built into this version on {res.built} (updates with each app update). Active licenses only. <Badge kind="real">FCC public data</Badge> FCC data is public; RadioReference talkgroups stay separate and protected. Check the FCC page (↗, online) before relying on a license.</p>
      </Card>}
    </div>
  );
}

export default FccPage;
