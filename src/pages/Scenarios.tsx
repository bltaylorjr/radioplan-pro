import React, { useMemo, useState } from 'react';
import L from 'leaflet';
import { useStore, downloadText, safeName } from '../store';
import { Card, Stat, fmt, Sel } from '../components/ui';
import { MapView, gridCanvas } from '../components/MapView';
import { decodeGrid, diffInputs, diffResults, diffGrid, tierChange } from '../engine/scenario';
import { toCsv } from '../engine/csv';

const DIFF_SCALE: [number, [number, number, number], string][] = [[6, [0, 120, 50], '≥ +6 dB'], [2, [120, 200, 120], '+2 to +6'], [-2, [235, 235, 235], 'within ±2 dB'], [-6, [240, 150, 120], '−2 to −6'], [-999, [200, 40, 40], '≤ −6 dB']];
const diffColor = (v: number): [number, number, number] | null => { if (Number.isNaN(v)) return null; for (const [m, c] of DIFF_SCALE) if (v >= m) return c; return null; };

export function ScenariosPage() {
  const { project: p, update, setRt, go } = useStore();
  const sc = p.scenarios;
  const [aId, setA] = useState(sc[1]?.id ?? sc[0]?.id ?? '');
  const [bId, setB] = useState(sc[0]?.id ?? '');
  const [view, setView] = useState<'diff' | 'a' | 'b'>('diff');
  const A = sc.find((s) => s.id === aId), B = sc.find((s) => s.id === bId);
  const ga = useMemo(() => (A ? decodeGrid(A.grid) : null), [A]);
  const gb = useMemo(() => (B ? decodeGrid(B.grid) : null), [B]);
  const D = useMemo(() => (ga && gb ? diffGrid(ga, gb) : null), [ga, gb]);
  const inDiff = A && B ? diffInputs(A.inputs, B.inputs) : [];
  const resDiff = A && B ? diffResults(A, B) : [];
  const draw = (g: L.LayerGroup) => {
    if (view === 'diff' && D) L.imageOverlay(gridCanvas(D, (i) => diffColor(D.rssi[i]), 170), [[D.south, D.west], [D.north, D.east]], { interactive: false }).addTo(g);
  };
  const opts: [string, string][] = sc.map((s) => [s.id, `${s.label} (${new Date(s.at).toLocaleDateString()})`]);
  const exportCsv = () => {
    const rows: (string | number | undefined)[][] = [['Item', A?.label, B?.label, 'Change']];
    for (const r of resDiff) rows.push([`${r.label} area %`, r.a, r.b, r.delta != null ? r.delta.toFixed(1) : '']);
    rows.push(['Mean signal dBm', A?.meanDbm, B?.meanDbm, A && B ? (B.meanDbm - A.meanDbm).toFixed(1) : '']);
    for (const k of Object.keys({ ...A?.inputs, ...B?.inputs })) rows.push([k, A?.inputs[k], B?.inputs[k], String(A?.inputs[k]) !== String(B?.inputs[k]) ? 'changed' : '']);
    downloadText(`${safeName(p.meta.name)}_scenario_compare.csv`, toCsv(rows), 'text/csv');
  };
  return (
    <div className="stack">
      <Card title="Saved scenarios" tour="scenarios" tip="Save a scenario from the Coverage page after a run. Each one stores its inputs, acceptance results and the full signal grid.">
        {!sc.length ? <p className="muted">No scenarios yet. Run a prediction on the Coverage page and press <b>Save as scenario</b>. <button onClick={() => go('coverage')}>Go to Coverage →</button></p> :
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Saved</th>{sc[0].results.map((r) => <th key={r.label}>{r.label}</th>)}<th>Mean dBm</th><th></th></tr></thead>
            <tbody>{sc.map((s) => <tr key={s.id} className={s.id === aId || s.id === bId ? 'sel' : ''}>
              <td><input type="text" value={s.label} onChange={(e) => update((d) => { d.scenarios.find((x) => x.id === s.id)!.label = e.target.value; })} /></td>
              <td className="small">{new Date(s.at).toLocaleString()}</td>
              {s.results.map((r) => <td key={r.label} className={r.pass ? 'ok-text' : 'bad-text'}>{fmt(r.pct, 1)}% {r.pass ? '✓' : '✗'}</td>)}
              <td>{fmt(s.meanDbm, 1)}</td>
              <td className="row"><button className="small" title="Show this scenario on the Coverage map" onClick={() => { setRt((x) => ({ ...x, coverage: decodeGrid(s.grid) })); go('coverage'); }}>Show</button>
                <button className="small" title="Put this scenario's radio settings, tuning and TX site back into the project" onClick={() => { if (!confirm(`Restore the inputs of "${s.label}"? Current radio settings will be replaced.`)) return; update((d) => { d.radio = structuredClone(s.project.radio); d.propagation = structuredClone(s.project.propagation); if (s.project.tx) { const i = d.sites.findIndex((x) => x.id === s.project.tx!.id); if (i >= 0) d.sites[i] = structuredClone(s.project.tx); } }); }}>Restore inputs</button>
                <button className="small" onClick={() => update((d) => { d.scenarios = d.scenarios.filter((x) => x.id !== s.id); })} aria-label="Delete scenario">✕</button></td></tr>)}</tbody></table></div>}
      </Card>
      {sc.length >= 2 && <>
        <Card title="Compare two scenarios" actions={<button onClick={exportCsv}>⬇ Comparison CSV</button>}>
          <div className="row wrap">Baseline (A): <Sel value={aId} onChange={setA} options={opts} /> Compare (B): <Sel value={bId} onChange={setB} options={opts} /></div>
          {A && B && <>
            <div className="stats">
              <Stat label="Inputs changed" value={inDiff.length} />
              <Stat label="Mean signal change" value={`${B.meanDbm - A.meanDbm >= 0 ? '+' : ''}${fmt(B.meanDbm - A.meanDbm, 1)}`} unit=" dB" tone={B.meanDbm >= A.meanDbm ? 'ok' : 'warn'} />
              <Stat label="A acceptance" value={A.results.every((r) => r.pass) ? 'PASS' : 'FAIL'} tone={A.results.every((r) => r.pass) ? 'ok' : 'bad'} />
              <Stat label="B acceptance" value={B.results.every((r) => r.pass) ? 'PASS' : 'FAIL'} tone={B.results.every((r) => r.pass) ? 'ok' : 'bad'} />
            </div>
            <div className="grid2">
              <div><h4>Results</h4><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Criterion</th><th>A</th><th>B</th><th>Change</th><th>Area gained / lost</th></tr></thead>
                <tbody>{resDiff.map((r) => { const lvl = B.results.find((x) => x.label === r.label)!.dbm; const tc = ga && gb ? tierChange(ga, gb, lvl) : null;
                  return <tr key={r.label}><td>{r.label}</td><td className={r.passA ? 'ok-text' : 'bad-text'}>{r.a != null ? `${fmt(r.a, 1)}%` : '—'}</td><td className={r.passB ? 'ok-text' : 'bad-text'}>{fmt(r.b, 1)}%</td>
                    <td>{r.delta != null ? `${r.delta >= 0 ? '+' : ''}${fmt(r.delta, 1)} pts` : 'new'}</td><td>{tc ? `+${fmt(tc.gainedPct, 1)}% / −${fmt(tc.lostPct, 1)}%` : ''}</td></tr>; })}</tbody></table></div></div>
              <div><h4>Inputs that differ</h4>{inDiff.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Input</th><th>A</th><th>B</th></tr></thead><tbody>{inDiff.map((d) => <tr key={d.key}><td>{d.key}</td><td>{String(d.a ?? '—')}</td><td>{String(d.b ?? '—')}</td></tr>)}</tbody></table></div> : <p className="muted">The two scenarios used identical inputs.</p>}</div>
            </div>
          </>}
        </Card>
        <Card title="Difference map (B − A)" actions={<Sel value={view} onChange={setView} options={[['diff', 'Difference B − A'], ['a', 'Scenario A'], ['b', 'Scenario B']]} />}>
          <MapView sites={p.sites} txId={p.radio.txSiteId} coverage={view === 'a' ? ga : view === 'b' ? gb : null} floor={-125} height={520} extra={draw} extraKey={[D, view]} />
          {view === 'diff' && <div className="legend">{DIFF_SCALE.map(([m, c, l]) => <span key={m}><span className="lg" style={{ background: `rgb(${c.join(',')})` }} />{l}</span>)}</div>}
        </Card>
      </>}
    </div>
  );
}
