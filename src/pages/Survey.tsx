import React, { useMemo, useState } from 'react';
import L from 'leaflet';
import { useStore } from '../store';
import { Card, Field, Num, Stat, fmt, Check } from '../components/ui';
import { MapView } from '../components/MapView';
import { GisExport } from '../components/GisExport';
import { parseSurvey, calibrate, Calibration } from '../engine/calibrate';
import { primaryCoverageInputs } from '../engine/network';
import { predictPoint } from '../engine/coverage';
import { rssiColor } from '../engine/coverage';
import { useUnits, DistNum } from '../units';

export function SurveyPage() {
  const { project: p, update, rt, go } = useStore();
  const u = useUnits();
  const sv = p.survey;
  const [msg, setMsg] = useState('');
  const [fitSlope, setFitSlope] = useState(true);
  const [floor, setFloor] = useState(p.radio.rxSensitivityDbm + 3);
  const [setSigma, setSetSigma] = useState(true);
  const [rssiIn, setRssiIn] = useState<number | null>(null);
  const [cal, setCal] = useState<Calibration | null>(null);
  const inp = primaryCoverageInputs(p, rt.dem, 40);
  const load = async (f?: File) => {
    if (!f) return;
    try { const r = parseSurvey(await f.text(), f.name); update((d) => { d.survey = { name: f.name, importedAt: new Date().toISOString(), points: r.points }; }); setCal(null);
      setMsg(`Imported ${r.points.length} points from ${f.name} (signal column "${r.rssiColumn}")${r.skipped ? `, ${r.skipped} rows skipped` : ''}.`); }
    catch (e) { setMsg(`Import failed: ${(e as Error).message}`); }
  };
  const record = () => {
    if (rssiIn == null) { setMsg('Type the measured signal (dBm) first.'); return; }
    if (!navigator.geolocation) { setMsg('No location service on this device.'); return; }
    navigator.geolocation.getCurrentPosition((g) => { update((d) => { d.survey.points.push({ lat: g.coords.latitude, lon: g.coords.longitude, rssiDbm: rssiIn, t: new Date().toISOString() }); if (!d.survey.name) d.survey.name = 'Field readings'; }); setMsg(`Recorded ${rssiIn} dBm at ±${g.coords.accuracy.toFixed(0)} m.`); },
      (e) => setMsg(`GPS error: ${e.message}`), { enableHighAccuracy: true, timeout: 20000 });
  };
  const preds = useMemo(() => (inp ? sv.points.map((pt) => predictPoint(inp, pt)) : []), [p.radio, p.propagation, p.sites, rt.dem, sv.points]); // eslint-disable-line react-hooks/exhaustive-deps
  const draw = (g: L.LayerGroup) => {
    sv.points.forEach((pt, i) => { const c = rssiColor(pt.rssiDbm, -200); const col = c[3] ? `rgb(${c[0]},${c[1]},${c[2]})` : '#888';
      L.circleMarker([pt.lat, pt.lon], { radius: 5, weight: 1, color: '#333', fillColor: col, fillOpacity: 0.9 }).bindTooltip(`${pt.rssiDbm} dBm measured${Number.isFinite(preds[i]) ? `, ${preds[i].toFixed(1)} predicted` : ''}`).addTo(g); });
  };
  const run = () => { if (!inp) return; setCal(calibrate(inp, sv.points, p.propagation, { fitSlope, floorDbm: floor })); };
  const apply = () => { if (!cal) return; update((d) => { d.propagation = cal.tuning; if (setSigma && Number.isFinite(cal.after.sdErr)) d.radio.shadowSigmaDb = Math.round(cal.after.sdErr * 10) / 10; }); setMsg('Calibration applied. Re-run coverage to see the calibrated prediction.'); setCal(null); };
  return (
    <div className="stack">
      <div className="grid2">
        <Card title="Field survey / drive test" tour="survey-import" tip="Import measured signal points from a drive-test tool, scanner, or spreadsheet. CSV needs latitude, longitude and signal (dBm) columns; GeoJSON points with an rssi/signal property also work.">
          <div className="row wrap"><label className="btn primary">📂 Import survey (CSV / GeoJSON)<input hidden type="file" accept=".csv,.txt,.tsv,.geojson,.json" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <button disabled={!sv.points.length} onClick={() => { if (confirm('Delete all survey points?')) update((d) => { d.survey = { name: '', importedAt: '', points: [] }; }); }}>Clear</button></div>
          <h4>Record a reading here (device GPS)</h4>
          <div className="row wrap"><Num value={rssiIn} nullable onChange={setRssiIn} unit="dBm measured" /><button onClick={record}>📍 Record point</button></div>
          {msg && <p className="note">{msg}</p>}
          <div className="stats">
            <Stat label="Points" value={sv.points.length} />
            <Stat label="Measured range" value={sv.points.length ? `${Math.min(...sv.points.map((x) => x.rssiDbm))} to ${Math.max(...sv.points.map((x) => x.rssiDbm))}` : '—'} unit=" dBm" />
            <Stat label="Source" value={sv.name || '—'} />
          </div>
        </Card>
        <Card title="Calibrate the prediction model" tour="calibrate" tip="Compares each measured point with the model's prediction at the same spot, then fits an offset (and optionally a distance slope) that minimises the error.">
          <div className="form">
            <Field label="Ignore readings at or below" tip="Points near the receiver noise floor are censored and would bias the fit."><Num value={floor} onChange={(v) => setFloor(v ?? -110)} unit="dBm" /></Field>
            <Field label="Fit"><Check value={fitSlope} onChange={setFitSlope} label="Offset + distance slope (needs 10+ points)" /></Field>
            <Field label="Location variability"><Check value={setSigma} onChange={setSetSigma} label="Set shadow σ from residual spread" /></Field>
          </div>
          <button className="primary" disabled={!sv.points.length || !inp} onClick={run}>🎯 Calibrate against {sv.points.length} points</button>
          <p className="small"><b>Current model:</b> {p.propagation.source} (offset {p.propagation.offsetDb} dB, slope {p.propagation.slopeDbPerDecade} dB/decade)</p>
          {cal && <>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th></th><th>Mean error</th><th>RMS error</th><th>Std dev</th><th>Points</th></tr></thead>
              <tbody><tr><td>Before</td><td>{fmt(cal.before.meanErr, 1)} dB</td><td>{fmt(cal.before.rmsErr, 1)} dB</td><td>{fmt(cal.before.sdErr, 1)} dB</td><td>{cal.used} used, {cal.excluded} excluded</td></tr>
                <tr className="ok-row"><td>After</td><td>{fmt(cal.after.meanErr, 1)} dB</td><td>{fmt(cal.after.rmsErr, 1)} dB</td><td>{fmt(cal.after.sdErr, 1)} dB</td><td></td></tr></tbody></table></div>
            <p>New tuning: offset <b>{cal.tuning.offsetDb} dB</b>{cal.fitSlope && <>, slope <b>{cal.tuning.slopeDbPerDecade} dB/decade</b></>}. Error = measured − predicted (positive means the model was pessimistic).</p>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Distance</th><th>Points</th><th>Mean error before</th></tr></thead><tbody>{cal.bins.map((b) => <tr key={b.fromKm}><td>{fmt(u.d(b.fromKm), 1)}–{u.f(b.toKm, 1)}</td><td>{b.n}</td><td>{fmt(b.meanErr, 1)} dB</td></tr>)}</tbody></table></div>
            {cal.after.sdErr > 10 && <p className="warnbox">Residual spread is over 10 dB: check that the survey used the same transmitter, frequency and receive antenna height as this design.</p>}
            <div className="row wrap"><button className="primary" onClick={apply}>Apply calibration</button><button onClick={() => go('coverage')}>Coverage →</button></div>
          </>}
        </Card>
      </div>
      <Card title="Measured points" tour="survey-map">
        <MapView sites={p.sites} txId={p.radio.txSiteId} coverage={rt.coverage} floor={-125} height={500} extra={draw} extraKey={[sv.points, preds]} />
        <p className="small muted">Points are coloured with the same scale as the coverage map. Hover a point to compare measured and predicted.</p>
        {sv.points.length > 0 && <GisExport title={`${p.meta.name} survey`} sites={p.sites} survey={sv.points} />}
      </Card>
    </div>
  );
}
