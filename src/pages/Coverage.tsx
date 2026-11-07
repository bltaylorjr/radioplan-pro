import React, { useState } from 'react';
import L from 'leaflet';
import { useStore } from '../store';
import { Card, Field, Num, Stat, fmt, Sel, Txt } from '../components/ui';
import { MapView } from '../components/MapView';
import { GisExport } from '../components/GisExport';
import { computeCoverage, RSSI_SCALE } from '../engine/coverage';
import { designLink } from '../engine/design';
import { primaryCoverageInputs } from '../engine/network';
import { resolveTiers, evaluateAcceptance, contourSegments, mapLevel } from '../engine/acceptance';
import { makeRunRecord, makeScenario, diffInputs } from '../engine/scenario';
import { ACCEPTANCE_PRESETS, acceptancePreset, uid } from '../defaults';
import type { AcceptanceTier } from '../types';
import { useUnits, DistNum } from '../units';

export default function CoveragePage() {
  const { project: p, update, rt, setRt, go } = useStore();
  const r = p.radio, L0 = designLink(p), t = p.propagation, u = useUnits();
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(0);
  const [scName, setScName] = useState('');
  const [showContours, setShowContours] = useState(true);
  const tiers = resolveTiers(p);
  const run = () => {
    const inp = primaryCoverageInputs(p, rt.dem); if (!inp) return;
    setBusy(true);
    setTimeout(() => {
      const t0 = performance.now();
      const res = computeCoverage(inp);
      setMs(performance.now() - t0); setRt((x) => ({ ...x, coverage: res })); setBusy(false);
      const rec = makeRunRecord(p, rt.dem, res);
      update((d) => { d.runLog = [rec, ...d.runLog].slice(0, 50); });
    }, 30);
  };
  const ev = rt.coverage ? evaluateAcceptance(rt.coverage, tiers) : null;
  const designThreshold = r.rxSensitivityDbm + L0.fadeMarginDb + r.interferenceMarginDb;
  const setTier = (i: number, fn: (t: AcceptanceTier) => void) => update((d) => { fn(d.acceptance.tiers[i]); d.acceptance.profile = 'custom'; });
  const setTune = <K extends keyof typeof t>(k: K, v: (typeof t)[K]) => update((d) => { d.propagation[k] = v; d.propagation.source = d.propagation.source.startsWith('Manual') ? d.propagation.source : 'Manual adjustment'; });
  const drawContours = (g: L.LayerGroup) => {
    if (!rt.coverage || !showContours) return;
    for (const tier of tiers) {
      const segs = contourSegments(rt.coverage, rt.coverage.rssi, mapLevel(tier));
      if (segs.length) L.polyline(segs as unknown as L.LatLngExpression[][], { color: tier.color, weight: 2.5, interactive: false }).addTo(g);
    }
  };
  const log = p.runLog.slice(0, 8);
  return (
    <div className="stack">
      <Card title="Coverage settings" tour="cov-controls">
        <div className="form">
          <Field label="Analysis radius"><DistNum km={r.coverageRadiusKm} onChange={(v) => update((d) => { d.radio.coverageRadiusKm = Math.max(0.5, v ?? 15); })} /></Field>
          <Field label="Resolution (cells per side)" tip="70 = fast; 150 = detailed (slower)."><Num value={r.coverageGridN} step={10} onChange={(v) => update((d) => { d.radio.coverageGridN = Math.max(20, Math.min(250, Math.round(v!))); })} /></Field>
          <Field label="Design threshold" tip={`Suggested: sensitivity + shadow + interference margin = ${designThreshold.toFixed(1)} dBm. Used by the "Design target" criterion.`}><Num value={r.coverageThresholdDbm} onChange={(v) => update((d) => { d.radio.coverageThresholdDbm = v!; })} unit="dBm" /></Field>
          <Field label="Model"><span className="muted">{r.fMHz > 1500 ? 'COST-231 Hata' : 'Okumura-Hata'} + ITU-R P.526 knife-edge · {r.env} · {rt.dem ? `terrain: ${rt.dem.source}` : 'no terrain loaded (smooth earth)'}</span></Field>
        </div>
        <div className="row wrap"><button className="primary" disabled={busy} onClick={run}>{busy ? 'Computing…' : '📡 Run coverage prediction'}</button>
          <button onClick={() => update((d) => { d.radio.coverageThresholdDbm = Math.round(designThreshold); })}>Use design threshold</button></div>
        <p className="small muted">The map shows street-level signal at {r.mobileHeightM} m with the receive antenna gain from the Equipment page. Body and building losses are applied by each acceptance criterion below, so one run answers mobile, portable and in-building coverage together.</p>
      </Card>

      <div className="grid2">
        <Card title="Acceptance criteria" tour="acceptance" tip="Each criterion passes when the area with (signal − extra loss) ≥ threshold is at least the required percentage of the analysis area. Leave a value blank to follow the live design value.">
          <div className="row">Preset: <Sel value={p.acceptance.profile} onChange={(v) => update((d) => { d.acceptance.profile = v; if (v !== 'custom') d.acceptance.tiers = acceptancePreset(v); })} options={Object.entries(ACCEPTANCE_PRESETS) as [string, string][]} /></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Criterion</th><th>Threshold dBm</th><th>Extra loss dB</th><th>Required %</th><th></th><th></th></tr></thead>
            <tbody>{p.acceptance.tiers.map((tr, i) => <tr key={tr.id}>
              <td><Txt value={tr.label} onChange={(v) => setTier(i, (x) => { x.label = v; })} /></td>
              <td><Num value={tr.dbm} nullable onChange={(v) => setTier(i, (x) => { x.dbm = v; })} /></td>
              <td><Num value={tr.extraLossDb} nullable onChange={(v) => setTier(i, (x) => { x.extraLossDb = v; })} /></td>
              <td><Num value={tr.requiredPct} onChange={(v) => setTier(i, (x) => { x.requiredPct = Math.max(0, Math.min(100, v ?? 0)); })} /></td>
              <td><input type="color" value={tr.color} onChange={(e) => setTier(i, (x) => { x.color = e.target.value; })} aria-label="Contour colour" /></td>
              <td><button className="small" onClick={() => update((d) => { d.acceptance.tiers.splice(i, 1); d.acceptance.profile = 'custom'; })} aria-label="Remove criterion">✕</button></td></tr>)}</tbody></table></div>
          <button onClick={() => update((d) => { d.acceptance.tiers.push({ id: uid(), label: 'New criterion', dbm: -100, extraLossDb: 0, requiredPct: 90, color: '#ef6c00' }); d.acceptance.profile = 'custom'; })}>+ Add criterion</button>
          <p className="small muted">Preset values are starting points. Public-safety projects should use the agency's channel performance criterion (TSB-88 / the RFP) and the AHJ's ERCES rules.</p>
        </Card>
        <Card title="Propagation model tuning" tour="tuning" tip="Adjust the model to local conditions, or calibrate it automatically from drive-test data on the Field Survey page.">
          <div className="form">
            <Field label="Offset" tip="Added to every prediction. Positive = stronger."><Num value={t.offsetDb} onChange={(v) => setTune('offsetDb', v ?? 0)} unit="dB" /></Field>
            <Field label="Distance slope correction" tip="Added per decade of distance (dB × log10 of distance in km; a decade is ×10 in distance). Negative = signal falls off faster."><Num value={t.slopeDbPerDecade} onChange={(v) => setTune('slopeDbPerDecade', v ?? 0)} unit="dB/decade" /></Field>
            <Field label="Diffraction weighting" tip="1 = full ITU-R P.526 knife-edge loss; 0.5 = half (rounded hills); 0 = ignore terrain obstruction."><Num value={t.diffractionFactor} step={0.1} onChange={(v) => setTune('diffractionFactor', Math.max(0, Math.min(2, v ?? 1)))} /></Field>
            <Field label="Extra clutter loss" tip="Foliage / building clutter not captured by the environment class."><Num value={t.clutterDb} onChange={(v) => setTune('clutterDb', v ?? 0)} unit="dB" /></Field>
            <Field label="k-factor"><Num value={r.kFactor} step={0.01} onChange={(v) => update((d) => { d.radio.kFactor = v ?? 4 / 3; })} /></Field>
          </div>
          <p className="small"><b>Status:</b> {t.source}</p>
          <div className="row wrap"><button onClick={() => update((d) => { d.propagation = { offsetDb: 0, slopeDbPerDecade: 0, diffractionFactor: 1, clutterDb: 0, source: 'Default (uncalibrated)' }; })}>Reset tuning</button><button onClick={() => go('survey')}>Calibrate from field data →</button></div>
        </Card>
      </div>

      <Card title="Predicted signal strength" tour="cov-map" actions={<label className="check"><input type="checkbox" checked={showContours} onChange={(e) => setShowContours(e.target.checked)} /> Service contours</label>}>
        <MapView sites={p.sites} txId={r.txSiteId} rxId={r.rxSiteId} coverage={rt.coverage} floor={Math.min(...tiers.map(mapLevel), -105) - 10} height={560} extra={drawContours} extraKey={[rt.coverage, showContours, JSON.stringify(tiers)]} />
        <div className="legend">{RSSI_SCALE.map((s) => <span key={s.min}><span className="lg" style={{ background: `rgb(${s.color.join(',')})` }} />{s.label}</span>)}
          {showContours && tiers.map((tr) => <span key={tr.id}><span className="lg line" style={{ background: tr.color }} />{tr.label} contour ({mapLevel(tr)} dBm at street)</span>)}</div>
        {ev && <>
          <div className="stats">
            <Stat label="Acceptance" value={ev.allPass ? 'PASS' : 'FAIL'} tone={ev.allPass ? 'ok' : 'bad'} />
            <Stat label="Mean predicted signal" value={fmt(ev.meanDbm, 1)} unit=" dBm" />
            <Stat label="Cells computed" value={ev.cells} />
            <Stat label="Compute time" value={fmt(ms / 1000, 1)} unit=" s" />
          </div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Criterion</th><th>Needs</th><th>Achieved</th><th>Required</th><th>Margin</th><th>Result</th></tr></thead>
            <tbody>{ev.results.map((x) => <tr key={x.tier.id} className={x.pass ? 'ok-row' : 'bad-row'}><td><span className="lg line" style={{ background: x.tier.color }} /> {x.tier.label}</td><td>{x.tier.dbm} dBm after {x.tier.extraLossDb} dB loss</td><td>{fmt(x.pct, 1)} %</td><td>{x.tier.requiredPct} %</td><td>{x.marginPct >= 0 ? '+' : ''}{fmt(x.marginPct, 1)} %</td><td><b>{x.pass ? '✓ PASS' : '✗ FAIL'}</b></td></tr>)}</tbody></table></div>
          <div className="row wrap"><Txt value={scName} onChange={setScName} placeholder="Scenario name (e.g. 45 m, 6° tilt)" />
            <button className="primary" onClick={() => { const s = makeScenario(p, rt.dem, rt.coverage!, scName || `Scenario ${p.scenarios.length + 1}`); update((d) => { d.scenarios.unshift(s); }); setScName(''); }}>💾 Save as scenario</button>
            <button onClick={() => go('scenarios')}>Compare scenarios →</button></div>
          <h4>Export for GIS</h4>
          <GisExport title={`${p.meta.name} coverage`} sites={p.sites} coverage={rt.coverage} tiers={tiers} survey={p.survey.points} floor={Math.min(...tiers.map(mapLevel), -105) - 10} />
        </>}
      </Card>

      {log.length > 0 && <Card title="Run history" tip="Every run is logged with the inputs it used, so changes between runs are traceable.">
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>When</th>{log[0].results.map((x) => <th key={x.label}>{x.label}</th>)}<th>Mean dBm</th><th>What changed vs. the run before</th></tr></thead>
          <tbody>{log.map((rec, i) => { const prev = p.runLog[i + 1]; const ch = prev ? diffInputs(prev.inputs, rec.inputs) : [];
            return <tr key={rec.id}><td>{new Date(rec.at).toLocaleString()}</td>{rec.results.map((x) => { const pr = prev?.results.find((y) => y.label === x.label); const d = pr ? x.pct - pr.pct : 0;
              return <td key={x.label} className={x.pass ? 'ok-text' : 'bad-text'}>{fmt(x.pct, 1)}%{pr && Math.abs(d) >= 0.05 ? <small> ({d > 0 ? '+' : ''}{fmt(d, 1)})</small> : null}</td>; })}
              <td>{fmt(rec.meanDbm, 1)}</td><td className="small">{prev ? (ch.length ? ch.map((c) => `${c.key}: ${c.a} → ${c.b}`).join('; ') : 'no input changes') : 'first run'}</td></tr>; })}</tbody></table></div>
        <button onClick={() => update((d) => { d.runLog = []; })}>Clear history</button>
      </Card>}
    </div>
  );
}
