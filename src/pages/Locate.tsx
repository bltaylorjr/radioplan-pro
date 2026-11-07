import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Stat, fmt, Badge } from '../components/ui';
import { MapView } from '../components/MapView';
import { Terrain3D } from '../components/Terrain3D';
import { geocodeAddress, GeoResult, cachedGeocode } from '../engine/geocode';
import { parseLatLon } from '../engine/locparse';
import { downloadTerrain, boundsAround, usgsPointElevation, demCovers } from '../engine/autoterrain';
import { sampleDem, DemGrid, buildProfile, analyzeProfile } from '../engine/terrain';
import { findCandidates, applyPlan, DEFAULT_PLAN, PlanOptions, Candidate } from '../engine/autoplan';
import { BAND_PRESETS } from '../data/catalog';
import { computeCoverage } from '../engine/coverage';
import { designLink } from '../engine/design';
import { uid } from '../defaults';

const toDms = (v: number, pos: string, neg: string) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60; return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(1)}"${v >= 0 ? pos : neg}`; };

export function LocatePage() {
  const { project, update, rt, setRt, go } = useStore();
  const [q, setQ] = useState(rt.query ?? '');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [msg, setMsg] = useState('');
  const [base, setBase] = useState<string | undefined>();
  const [dem, setDem] = useState<DemGrid | null>(null);
  const [terrMsg, setTerrMsg] = useState('');
  const [usgsZ, setUsgsZ] = useState<number | null>(null);
  const [opt, setOpt] = useState<PlanOptions>(DEFAULT_PLAN);
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const t = rt.locate ?? null;

  const choose = (g: GeoResult) => { setRt((r) => ({ ...r, locate: g })); setResults([]); setCands(null); setNotes([]); };
  const search = async (text = q) => {
    if (!text.trim()) return;
    setMsg(''); setRt((r) => ({ ...r, query: text }));
    const ll = parseLatLon(text);
    if (ll) { choose({ ...ll, label: `${ll.lat.toFixed(6)}, ${ll.lon.toFixed(6)}` }); return; }
    setMsg('Searching…');
    try { const r = await geocodeAddress(text); setResults(r); setMsg(r.length ? (cachedGeocode(text) && !navigator.onLine ? 'Offline: showing a saved result.' : '') : 'No match. Try adding city and state, or enter coordinates.'); if (r.length === 1) choose(r[0]); }
    catch (e) { setMsg((e as Error).message); }
  };
  useEffect(() => { if (rt.query && !t) search(rt.query); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Terrain + point elevation around the target
  useEffect(() => {
    if (!t) return;
    setUsgsZ(null); setTerrMsg('Downloading terrain for this location…');
    const b = boundsAround([t], opt.serviceRadiusKm + opt.searchRadiusKm + 1);
    if (rt.dem && demCovers(rt.dem, b)) { setDem(rt.dem); setTerrMsg(`Terrain: ${rt.dem.source}`); }
    else downloadTerrain(b, { maxTiles: 64, onProgress: (d, n) => setTerrMsg(`Terrain ${d}/${n} tiles…`) })
      .then((r) => { setDem(r.dem); setTerrMsg(`Terrain: ${r.dem.source}${r.fromCache === r.tiles ? ' — from offline cache' : ''}`); })
      .catch(() => setTerrMsg(navigator.onLine ? 'Terrain download failed.' : 'Offline and this area is not cached. Use "Save area for offline" on Map & Terrain next time you are online.'));
    usgsPointElevation(t).then(setUsgsZ).catch(() => setUsgsZ(null));
  }, [t?.lat, t?.lon, opt.serviceRadiusKm, opt.searchRadiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  const build = () => {
    if (!t || !dem) return;
    setBusy(true);
    setTimeout(() => {
      const c = findCandidates(dem, t, opt);
      setCands(c);
      if (c.length) usePlan(c[0]);
      setBusy(false);
    }, 20);
  };
  const usePlan = (c: Candidate) => {
    if (!t || !dem) return;
    let n: string[] = [];
    update((d) => { n = applyPlan(d, t, c, opt); });
    setNotes(n);
    // compute profile + coverage on the new design
    setTimeout(() => {
      setRt((r) => ({ ...r, dem, demAuto: true }));
    }, 0);
  };
  // After the project updates from a plan, run the analyses with the new design
  useEffect(() => {
    if (!notes.length || !dem) return;
    const L = designLink(project);
    const tx = L.tx, rx = L.rx;
    const profile = tx && rx && tx !== rx ? analyzeProfile(buildProfile(tx, rx, 120, (q2) => sampleDem(dem, q2)), tx.antennaAglM, rx.antennaAglM, project.radio.fMHz, project.radio.kFactor, project.radio.clutterM) : null;
    const r = project.radio;
    const coverage = tx ? computeCoverage({ site: tx, siteGroundM: tx.groundElevM ?? undefined, antennaAglM: tx.antennaAglM, fMHz: r.fMHz, eirpDbm: L.eirpDbm, rxGainDbi: r.rxAntGainDbi, rxLossDb: r.rxFeederLossDb + r.bodyLossDb + r.penetrationLossDb,
      mobileHeightM: r.mobileHeightM, env: r.env, city: r.city, azimuthDeg: r.azimuthDeg, tiltDeg: r.mechTiltDeg + r.elecTiltDeg, hBwDeg: L.ant?.hBwDeg ?? 360, vBwDeg: L.ant?.vBwDeg ?? 10, radiusKm: r.coverageRadiusKm, gridN: 70, dem, k: r.kFactor }) : null;
    setRt((x) => ({ ...x, profile, coverage }));
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const groundZ = t && dem ? sampleDem(dem, t) : null;
  const addSite = () => t && update((d) => { d.sites.push({ ...d.sites[0], id: uid(), name: t.label.split(',')[0] || 'New site', address: t.label, lat: t.lat, lon: t.lon, groundElevM: usgsZ ?? (groundZ != null ? Math.round(groundZ * 10) / 10 : null), positionSource: 'Location search', positionAccuracyM: null }); });
  const markerSite = { id: '_t', name: '', address: '', lat: 0, lon: 0, groundElevM: null, positionSource: '', positionAccuracyM: null, structure: 'monopole' as const, structureHeightM: 0, antennaAglM: 0, onBuilding: false, nearestAirportKm: null, nearestRunwayFt: null };
  void markerSite;
  return (
    <div className="stack">
      <Card title="Find a location" tip="Type an address, a place name, or coordinates (decimal, DMS or degrees-minutes). Click the map to pick a spot. Coordinates and the map work offline.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 600 E 4th St, Charlotte NC  ·  35.2271, -80.8431  ·  35°13'37&quot;N 80°50'35&quot;W" />
          <button className="primary" type="submit">🔎 Search</button>
        </form>
        {msg && <p className="note">{msg}</p>}
        {results.length > 1 && <ul className="results">{results.map((r, i) => <li key={i}><div><b>{r.label}</b><br /><small>{r.lat.toFixed(5)}, {r.lon.toFixed(5)}</small></div><button onClick={() => choose(r)}>View</button></li>)}</ul>}
      </Card>
      {t && <>
        <div className="grid2">
          <Card title="Map" actions={<span className="row"><button className={!base || base === 'USGS Topo' ? 'primary' : ''} onClick={() => setBase('USGS Topo')}>Topo</button><button className={base?.startsWith('Satellite (Esri') ? 'primary' : ''} onClick={() => setBase('Satellite (Esri, high-res)')}>Satellite</button><button className={base === 'Satellite + Topo (USGS)' ? 'primary' : ''} onClick={() => setBase('Satellite + Topo (USGS)')}>Hybrid</button></span>}>
            <MapView sites={project.sites} txId={project.radio.txSiteId} rxId={project.radio.rxSiteId} center={{ lat: t.lat, lon: t.lon, zoom: notes.length ? 13 : 15 }} marker={{ ...t }} base={base} dem={dem} coverage={notes.length ? rt.coverage : null}
              onClick={(lat, lon) => setRt((r) => ({ ...r, locate: { lat, lon, label: `${lat.toFixed(6)}, ${lon.toFixed(6)}` } }))} height={460} />
            <p className="small muted">Click anywhere on the map to move the search point. ◎ shows your live GPS position.</p>
          </Card>
          <Card title="Location">
            <p><b>{t.label}</b></p>
            <div className="stats">
              <Stat label="Latitude" value={t.lat.toFixed(6)} unit={`° (${toDms(t.lat, 'N', 'S')})`} />
              <Stat label="Longitude" value={t.lon.toFixed(6)} unit={`° (${toDms(t.lon, 'E', 'W')})`} />
              <Stat label="Ground elevation (USGS 3DEP)" value={usgsZ != null ? fmt(usgsZ, 1) : groundZ != null ? fmt(groundZ, 1) : '—'} unit={usgsZ != null ? ' m' : groundZ != null ? ' m (terrain tiles)' : ''} tip="USGS Elevation Point Query (1/3 arc-second 3DEP) when online; otherwise from the downloaded terrain." />
              {t.state && <Stat label="State / county" value={t.state} unit={t.county ? ` · ${t.county}` : ''} />}
            </div>
            <div className="row wrap"><button onClick={addSite}>+ Add as site</button><button onClick={() => go('sites')}>Open Site Data →</button></div>
            <p className="small muted">{terrMsg}</p>
            {dem ? <Terrain3D dem={dem} sites={notes.length ? project.sites : []} txId={project.radio.txSiteId} rxId={project.radio.rxSiteId} fMHz={project.radio.fMHz} kFactor={project.radio.kFactor} clutterM={0} exag={3} showFresnel={!!notes.length} profile={notes.length ? rt.profile : null} marker={t} height={300} />
              : <div className="three empty" style={{ height: 300 }}>3D terrain appears here once terrain is loaded.</div>}
          </Card>
        </div>
        <Card title="Build a plan for this location" tour="plan" actions={<Badge kind="beta">Auto-plan: review every result</Badge>}>
          <div className="form">
            <Field label="System / band"><Sel value={opt.bandPreset} onChange={(v) => setOpt({ ...opt, bandPreset: v })} options={Object.entries(BAND_PRESETS).filter(([, v]) => v.fMHz).map(([k, v]) => [k, v.label] as [string, string])} /></Field>
            <Field label="Service radius" tip="How far around the location you need coverage."><Num value={opt.serviceRadiusKm} onChange={(v) => setOpt({ ...opt, serviceRadiusKm: Math.max(0.5, Math.min(30, v!)) })} unit="km" /></Field>
            <Field label="Tower search radius" tip="How far from the location a tower may be placed. 0 = at the location."><Num value={opt.searchRadiusKm} onChange={(v) => setOpt({ ...opt, searchRadiusKm: Math.max(0, Math.min(10, v!)) })} unit="km" /></Field>
            <Field label="Antenna height (tower)"><Num value={opt.towerHeightM} onChange={(v) => setOpt({ ...opt, towerHeightM: v! })} unit="m" /></Field>
            <Field label="Facility antenna height"><Num value={opt.facilityAntennaM} onChange={(v) => setOpt({ ...opt, facilityAntennaM: v! })} unit="m" /></Field>
          </div>
          <div className="row"><button className="primary" disabled={!dem || busy} onClick={build}>{busy ? 'Analyzing terrain…' : '🛠 Build plan for this location'}</button>{!dem && <span className="muted small">Waiting for terrain…</span>}</div>
          {notes.length > 0 && <div className="note"><b>Plan created.</b><ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            {rt.profile && <p>Path tower → facility: {rt.profile.los ? 'line of sight' : 'obstructed'}, {fmt(rt.profile.minClearancePct, 0)}% Fresnel clearance ({rt.profile.meets60 ? 'meets' : 'below'} 60%).</p>}
            <div className="row wrap"><button onClick={() => go('equipment')}>Review equipment →</button><button onClick={() => go('path')}>Path profile →</button><button onClick={() => go('coverage')}>Coverage →</button><button onClick={() => go('compliance')}>Code checks →</button><button onClick={() => go('materials')}>Materials →</button><button onClick={() => go('reports')}>Reports →</button></div></div>}
          {cands && cands.length > 1 && <table className="tbl"><thead><tr><th>#</th><th>Position</th><th>Ground</th><th>From location</th><th>Area reached</th><th>LOS to facility</th><th /></tr></thead>
            <tbody>{cands.map((c, i) => <tr key={i}><td>{i + 1}</td><td>{c.lat.toFixed(5)}, {c.lon.toFixed(5)}</td><td>{fmt(c.groundM, 0)} m</td><td>{fmt(c.distKm, 2)} km</td><td>{fmt(c.score * 100, 0)}%</td><td>{c.targetLos ? 'Yes' : 'No'}</td><td><button onClick={() => usePlan(c)}>Use</button></td></tr>)}</tbody></table>}
          <p className="small muted">Candidates are scored by how much of the service area each spot can see over the terrain (near line-of-sight, &lt; 6 dB knife-edge loss) with your antenna height. Zoning, land ownership, FAA airspace and leasing are not considered — verify on site.</p>
        </Card>
      </>}
    </div>
  );
}
