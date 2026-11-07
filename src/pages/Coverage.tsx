import React, { useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Stat, fmt } from '../components/ui';
import { MapView } from '../components/MapView';
import { computeCoverage, coverageStats, RSSI_SCALE } from '../engine/coverage';
import { designLink } from '../engine/design';

export default function CoveragePage() {
  const { project: p, update, rt, setRt } = useStore();
  const r = p.radio, L = designLink(p);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(0);
  const run = () => {
    if (!L.tx) return;
    setBusy(true);
    setTimeout(() => {
      const t0 = performance.now();
      const res = computeCoverage({ site: L.tx!, siteGroundM: L.tx!.groundElevM ?? undefined, antennaAglM: L.tx!.antennaAglM, fMHz: r.fMHz, eirpDbm: L.eirpDbm, rxGainDbi: r.rxAntGainDbi, rxLossDb: r.rxFeederLossDb + r.bodyLossDb + r.penetrationLossDb,
        mobileHeightM: r.mobileHeightM, env: r.env, city: r.city, azimuthDeg: r.azimuthDeg, tiltDeg: r.mechTiltDeg + r.elecTiltDeg, hBwDeg: L.ant?.hBwDeg ?? 360, vBwDeg: L.ant?.vBwDeg ?? 10,
        radiusKm: r.coverageRadiusKm, gridN: r.coverageGridN, dem: rt.dem, k: r.kFactor });
      setMs(performance.now() - t0); setRt((x) => ({ ...x, coverage: res })); setBusy(false);
    }, 30);
  };
  const st = rt.coverage ? coverageStats(rt.coverage, r.coverageThresholdDbm) : null;
  const designThreshold = r.rxSensitivityDbm + L.fadeMarginDb + r.interferenceMarginDb;
  return (
    <div className="stack">
      <Card title="Coverage settings" tour="cov-controls">
        <div className="form">
          <Field label="Analysis radius"><Num value={r.coverageRadiusKm} onChange={(v) => update((d) => { d.radio.coverageRadiusKm = v!; })} unit="km" /></Field>
          <Field label="Resolution (cells per side)" tip="70 = fast; 150 = detailed (slower)."><Num value={r.coverageGridN} step={10} onChange={(v) => update((d) => { d.radio.coverageGridN = Math.max(20, Math.min(250, Math.round(v!))); })} /></Field>
          <Field label="Design threshold" tip={`Suggested: sensitivity + shadow + interference margin = ${designThreshold.toFixed(1)} dBm`}><Num value={r.coverageThresholdDbm} onChange={(v) => update((d) => { d.radio.coverageThresholdDbm = v!; })} unit="dBm" /></Field>
          <Field label="Model"><span className="muted">{r.fMHz > 1500 ? 'COST-231 Hata' : 'Okumura-Hata'} · {r.env} · {rt.dem ? `terrain: ${rt.dem.source}` : 'no terrain loaded (smooth earth)'}</span></Field>
        </div>
        <div className="row"><button className="primary" disabled={busy} onClick={run}>{busy ? 'Computing…' : '📡 Run coverage prediction'}</button>
          <button onClick={() => update((d) => { d.radio.coverageThresholdDbm = Math.round(designThreshold); })}>Use design threshold</button></div>
      </Card>
      <Card title="Predicted signal strength" tour="cov-map">
        <MapView sites={p.sites} txId={r.txSiteId} rxId={r.rxSiteId} coverage={rt.coverage} floor={Math.min(r.coverageThresholdDbm, -105) - 10} height={560} />
        <div className="legend">{RSSI_SCALE.map((s) => <span key={s.min}><span className="lg" style={{ background: `rgb(${s.color.join(',')})` }} />{s.label}</span>)}</div>
        {st && <div className="stats">
          <Stat label={`Area ≥ ${r.coverageThresholdDbm} dBm`} value={fmt(st.pct, 1)} unit=" %" tone={st.pct >= 90 ? 'ok' : st.pct > 70 ? 'warn' : 'bad'} />
          <Stat label="Smooth-earth edge range" value={fmt(L.rangeKm, 2)} unit=" km" />
          <Stat label="Cells computed" value={st.cells} />
          <Stat label="Compute time" value={fmt(ms / 1000, 1)} unit=" s" />
        </div>}
      </Card>
    </div>
  );
}
