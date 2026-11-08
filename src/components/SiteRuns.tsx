// Runs between sites: draw the route on the map, measure it over the terrain, and see the conduit, cable,
// handholes and crew-hours that follow. Measured runs feed the Materials list and the proposal's labor.
import React, { useState } from 'react';
import L from 'leaflet';
import { useStore } from '../store';
import { Card, Field, Txt, Num, Sel, Stat } from './ui';
import { MapView } from './MapView';
import { sampleDem, fetchElevations } from '../engine/terrain';
import { downloadTerrain, boundsAround, demCovers } from '../engine/autoterrain';
import { CABLES, METHODS, densify, measurePath, measureKey, runPath, runTakeoff, type SiteRun, type RunCable, type RunMethod, type RunMeasure } from '../engine/siteruns';
import type { LatLon } from '../engine/geo';
import { uid } from '../defaults';

function Profile({ m }: { m: RunMeasure }) {
  if (m.profile.length < 2) return null;
  const W = 520, H = 110, P = 28;
  const xs = m.profile.map((p) => p[0]), zs = m.profile.map((p) => p[1]);
  const x0 = 0, x1 = Math.max(1, xs[xs.length - 1]), z0 = Math.min(...zs), z1 = Math.max(z0 + 10, ...zs);
  const X = (x: number) => P + ((x - x0) / (x1 - x0)) * (W - P - 6), Y = (z: number) => H - 16 - ((z - z0) / (z1 - z0)) * (H - 26);
  const d = m.profile.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="run-profile" role="img" aria-label="Ground profile along the route">
      <path d={`${d} L${X(x1)},${H - 16} L${P},${H - 16} Z`} fill="rgba(138,90,43,.18)" />
      <path d={d} fill="none" stroke="#8a5a2b" strokeWidth="2" />
      <text x={2} y={Y(z1) + 4} fontSize="10">{z1} ft</text><text x={2} y={Y(z0)} fontSize="10">{z0} ft</text>
      <text x={P} y={H - 3} fontSize="10">0</text><text x={W - 6} y={H - 3} fontSize="10" textAnchor="end">{x1.toLocaleString()} ft</text>
    </svg>
  );
}

export function SiteRunsCard() {
  const { project: p, update, rt, setRt } = useStore();
  const runs = p.siteRuns ?? [];
  const [sel, setSel] = useState<string | undefined>(runs[0]?.id);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = runs.find((r) => r.id === sel) ?? runs[0];
  const name = (id: string) => p.sites.find((s) => s.id === id)?.name ?? '?';
  const edit = (fn: (r: SiteRun) => void) => run && update((d) => { const r = (d.siteRuns ?? []).find((x) => x.id === run.id); if (r) fn(r); });
  const addRun = () => {
    if (p.sites.length < 2) return;
    const id = uid(), [a, b] = p.sites;
    update((d) => { (d.siteRuns ??= []).push({ id, name: `Run ${(d.siteRuns.length + 1)}`, fromId: a.id, toId: b.id, via: [], cable: 'fiber-sm', method: 'underground' }); });
    setSel(id); setDrawing(true);
  };
  const delRun = () => { if (!run) return; update((d) => { d.siteRuns = (d.siteRuns ?? []).filter((x) => x.id !== run.id); }); setSel(undefined); setDrawing(false); };

  /** Measure over the best elevation we can get: downloaded terrain, then the terrain tile cache/online, then a point service, then the two site elevations. */
  const measure = async (r: SiteRun) => {
    const path = runPath(r, p.sites); if (!path) return;
    const a = p.sites.find((s) => s.id === r.fromId)!, b = p.sites.find((s) => s.id === r.toId)!;
    const ends: [number | null, number | null] = [a.groundElevM, b.groundElevM];
    const key = measureKey(r, p.sites), bounds = boundsAround(path, 0.3);
    const save = (m: RunMeasure) => update((d) => { const t = (d.siteRuns ?? []).find((x) => x.id === r.id); if (t) t.measured = { ...m, key }; });
    setBusy(true); setMsg('Measuring the route over the ground…');
    try {
      let dem = rt.dem && demCovers(rt.dem, bounds) ? rt.dem : null;
      if (!dem) {
        try {
          const got = await downloadTerrain(bounds, { maxTiles: 24 });
          dem = got.dem; if (!rt.dem) setRt((x) => ({ ...x, dem: got.dem, demAuto: true }));
        } catch { /* offline and not cached */ }
      }
      if (dem) { const g = dem; save(measurePath(path, (q) => sampleDem(g, q), ends, `terrain (${g.source})`)); setMsg(`Measured over ${dem.source}.`); return; }
      const pts = densify(path, 20), step = Math.max(1, Math.ceil(pts.length / 200)), pick = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
      try {
        const z = await fetchElevations(pick.map((x) => x.p)); const look = new Map(pick.map((x, i) => [`${x.p.lat.toFixed(6)},${x.p.lon.toFixed(6)}`, z[i]]));
        save(measurePath(path, (q) => look.get(`${q.lat.toFixed(6)},${q.lon.toFixed(6)}`) ?? null, ends, 'online elevation (90 m)'));
        setMsg('Measured with the online elevation service.');
      } catch {
        save(measurePath(path, () => null, ends, 'terrain'));
        setMsg('Offline and no terrain for this area, so the length uses the map and the two site elevations.');
      }
    } finally { setBusy(false); }
  };

  const draw = (g: L.LayerGroup) => {
    for (const r of runs) {
      const path = runPath(r, p.sites); if (!path) continue;
      const on = run && r.id === run.id;
      L.polyline(path.map((q) => [q.lat, q.lon]), { color: r.method === 'aerial' ? '#6a1b9a' : '#2e7d32', weight: on ? 5 : 3, dashArray: r.method === 'aerial' ? '8 6' : undefined, opacity: on ? 1 : 0.6 })
        .bindTooltip(`${r.name}${r.measured ? ` · ${r.measured.groundFt.toLocaleString()} ft` : ''}`, { sticky: true }).addTo(g);
      if (on) r.via.forEach((q, i) => L.circleMarker([q.lat, q.lon], { radius: 5, color: '#2e7d32', fillOpacity: 1 }).bindTooltip(`Bend ${i + 1}`).addTo(g));
    }
  };
  const addBend = (lat: number, lon: number) => {
    if (!drawing || !run) return;
    const path = runPath(run, p.sites)!; const q: LatLon = { lat, lon };
    // Put the new point in the segment it is closest to, so points can be added in any order.
    let best = path.length - 2, bestD = Infinity;
    for (let i = 0; i < path.length - 1; i++) { const m = { lat: (path[i].lat + path[i + 1].lat) / 2, lon: (path[i].lon + path[i + 1].lon) / 2 }; const dd = (m.lat - lat) ** 2 + ((m.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2; if (dd < bestD) { bestD = dd; best = i; } }
    edit((r) => { r.via.splice(best, 0, q); });
  };

  const stale = run?.measured && run.measured.key !== measureKey(run, p.sites);
  const t = run?.measured ? runTakeoff(run, run.measured) : null;
  return (
    <Card title="Runs between sites (measured on the map)" tour="site-runs" className="span2" actions={<span className="row"><button onClick={addRun} disabled={p.sites.length < 2}>+ Add run</button>{run && <button onClick={delRun}>Delete run</button>}</span>}
      tip="Fiber, copper, coax, power or conduit between two sites. Lengths follow the route you draw and the rise and fall of the ground, and go into the Materials list and the labor estimate.">
      {p.sites.length < 2 ? <p className="muted">Add a second site above to plan a run between sites.</p> : !runs.length ? <p className="muted">No runs yet. Press <b>+ Add run</b>, then click the map to add bend points along the route.</p> : <>
        <div className="scroll-x"><table className="tbl"><thead><tr><th>Run</th><th>From → To</th><th>How</th><th>Map length</th><th>Over the ground</th><th>Climb / drop</th><th>Steepest</th><th>Crew-hours</th></tr></thead>
          <tbody>{runs.map((r) => { const tk = r.measured ? runTakeoff(r, r.measured) : null; return (
            <tr key={r.id} className={run && r.id === run.id ? 'sel' : ''} onClick={() => setSel(r.id)}>
              <td>{r.name}</td><td>{name(r.fromId)} → {name(r.toId)}</td><td>{METHODS.find((x) => x[0] === r.method)?.[1]}</td>
              <td>{r.measured ? `${r.measured.horizFt.toLocaleString()} ft` : '—'}</td><td>{r.measured ? `${r.measured.groundFt.toLocaleString()} ft` : 'not measured'}</td>
              <td>{r.measured ? `${r.measured.climbFt} / ${r.measured.dropFt} ft` : '—'}</td><td>{r.measured ? `${r.measured.maxGradePct}%` : '—'}</td><td>{tk ? tk.totalHours : '—'}</td></tr>); })}</tbody></table></div>
        {run && <>
          <div className="form">
            <Field label="Run name"><Txt value={run.name} onChange={(v) => edit((r) => { r.name = v; })} /></Field>
            <Field label="From site"><Sel value={run.fromId} onChange={(v) => edit((r) => { r.fromId = v; })} options={p.sites.map((s) => [s.id, s.name] as [string, string])} /></Field>
            <Field label="To site"><Sel value={run.toId} onChange={(v) => edit((r) => { r.toId = v; })} options={p.sites.map((s) => [s.id, s.name] as [string, string])} /></Field>
            <Field label="How it is installed"><Sel<RunMethod> value={run.method} onChange={(v) => edit((r) => { r.method = v; })} options={METHODS} /></Field>
            <Field label="Cable"><Sel<RunCable> value={run.cable} onChange={(v) => edit((r) => { r.cable = v; })} options={CABLES} /></Field>
            {(run.cable.startsWith('fiber') || run.cable === 'power') && <Field label={run.cable === 'power' ? 'Conductors' : 'Fiber strands'}><Num value={run.count || (run.cable === 'power' ? 3 : 12)} min={1} onChange={(v) => edit((r) => { r.count = v ?? undefined; })} /></Field>}
          </div>
          <div className="row wrap">
            <button className={drawing ? 'primary' : ''} onClick={() => setDrawing(!drawing)}>{drawing ? '✓ Done adding bend points' : '✎ Add bend points on the map'}</button>
            <button onClick={() => edit((r) => { r.via.pop(); })} disabled={!run.via.length}>Undo last point</button>
            <button onClick={() => edit((r) => { r.via = []; })} disabled={!run.via.length}>Straight line</button>
            <button className={!run.measured || stale ? 'primary' : ''} onClick={() => measure(run)} disabled={busy || run.fromId === run.toId}>{busy ? 'Measuring…' : '📏 Measure over the ground'}</button>
          </div>
          {drawing && <p className="note">Click the map along the route (follow the road, go around the building or the creek). Each point is a bend; underground runs get a handhole there.</p>}
          {stale && <p className="warnbox">The route or a site changed since this run was measured. Press <b>Measure over the ground</b> again.</p>}
          {msg && <p className="note">{msg}</p>}
        </>}
      </>}
      <MapView sites={p.sites} height={420} onClick={addBend} extra={draw} extraKey={[JSON.stringify(runs), run?.id]} />
      {run?.measured && t && <>
        <div className="stats">
          <Stat label="Map length" value={run.measured.horizFt.toLocaleString()} unit=" ft" />
          <Stat label="Over the ground" value={run.measured.groundFt.toLocaleString()} unit=" ft" tip="Follows the rise and fall of the terrain along the route." />
          <Stat label="Elevation at the ends" value={`${run.measured.endElevFt[0] ?? '?'} → ${run.measured.endElevFt[1] ?? '?'}`} unit=" ft" />
          <Stat label="Steepest grade" value={run.measured.maxGradePct} unit="%" tone={run.measured.maxGradePct > 15 ? 'warn' : undefined} />
          <Stat label="Crew-hours" value={t.totalHours} unit=" h" />
        </div>
        <Profile m={run.measured} />
        <p className="small">Elevation from {run.measured.source}.</p>
        <div className="scroll-x"><table className="tbl"><thead><tr><th>Item</th><th>Spec</th><th>Qty</th><th>Basis</th></tr></thead>
          <tbody>{t.items.map((i) => <tr key={i.key}><td>{i.item}</td><td>{i.spec}</td><td>{i.qty.toLocaleString()} {i.unit}</td><td className="small">{i.basis}</td></tr>)}
            {t.hours.map((h) => <tr key={h.task}><td>Labor: {h.task}</td><td /><td>{h.hours} h</td><td className="small">{h.basis}</td></tr>)}</tbody></table></div>
        {t.warnings.map((w) => <p key={w} className="warnbox">{w}</p>)}
        <p className="small muted">Planning estimate from the map and terrain. Walk the route, and call 811 to have utilities marked before any digging. Production rates are starting points; adjust the hours on the Reports page if your crew differs.</p>
      </>}
    </Card>
  );
}
