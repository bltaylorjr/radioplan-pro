import React from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Stat, fmt } from '../components/ui';
import { tiltFootprintKm, recommendedTiltDeg, dbmToWatts } from '../engine/rf';
import { designLink } from '../engine/design';

export function OptimizePage() {
  const { project: p, update, go } = useStore();
  const r = p.radio, L = designLink(p);
  const h = L.tx?.antennaAglM ?? 30, vbw = L.ant?.vBwDeg ?? 10;
  const tilt = r.mechTiltDeg + r.elecTiltDeg;
  const fp = tiltFootprintKm(h, tilt, vbw);
  const rec = recommendedTiltDeg(h, Math.max(L.rangeKm, 0.2), vbw);
  // side view diagram
  const W = 700, H = 200, maxD = Math.min(Math.max(L.rangeKm * 1.3, 2), 40);
  const x = (d: number) => 40 + (Math.min(d, maxD) / maxD) * (W - 60), y0 = H - 30, yT = 30;
  const ray = (deg: number) => { const d = deg <= 0 ? maxD : Math.min(h / Math.tan((deg * Math.PI) / 180) / 1000, maxD); const yy = deg <= 0 ? yT + (Math.tan((-deg * Math.PI) / 180) * maxD * 1000 / h) * (y0 - yT) * -1 : y0; return { d, yy: Math.max(yy, 0) }; };
  const m = ray(tilt), lo = ray(tilt + vbw / 2), up = ray(tilt - vbw / 2);
  return (
    <div className="grid2">
      <Card title="Antenna orientation & power">
        <div className="form">
          <Field label="Azimuth" tip="Direction of the main lobe, degrees true."><Num value={r.azimuthDeg} onChange={(v) => update((d) => { d.radio.azimuthDeg = ((v! % 360) + 360) % 360; })} unit="°T" /></Field>
          <Field label="Mechanical downtilt"><Num value={r.mechTiltDeg} onChange={(v) => update((d) => { d.radio.mechTiltDeg = v!; })} unit="°" /></Field>
          <Field label="Electrical downtilt (RET)"><Num value={r.elecTiltDeg} onChange={(v) => update((d) => { d.radio.elecTiltDeg = v!; })} unit="°" /></Field>
          <Field label="TX power"><Num value={r.txPowerDbm} onChange={(v) => update((d) => { d.radio.txPowerDbm = v!; })} unit={`dBm (${dbmToWatts(r.txPowerDbm).toFixed(1)} W)`} /></Field>
        </div>
        <div className="stats">
          <Stat label="Main beam hits ground" value={Number.isFinite(fp.mainBeamKm) ? fmt(fp.mainBeamKm, 2) : '∞'} unit=" km" />
          <Stat label="Inner −3 dB edge" value={fmt(fp.innerKm, 2)} unit=" km" />
          <Stat label="Outer −3 dB edge" value={Number.isFinite(fp.outerKm) ? fmt(fp.outerKm, 2) : '∞ (above horizon)'} unit={Number.isFinite(fp.outerKm) ? ' km' : ''} />
          <Stat label="Recommended total tilt" value={fmt(rec, 1)} unit="°" tip="Upper −3 dB edge at the predicted cell-edge range" tone="ok" />
        </div>
        <div className="row"><button className="primary" onClick={() => update((d) => { d.radio.elecTiltDeg = Math.max(0, Math.round((rec - d.radio.mechTiltDeg) * 10) / 10); })}>Apply recommended tilt</button><button onClick={() => go('coverage')}>Re-run coverage →</button></div>
        <p className="small muted">Antenna: {L.ant?.model} — {L.ant?.hBwDeg}° H / {vbw}° V beamwidth at {h} m AGL. Omni antennas have no azimuth effect.</p>
      </Card>
      <Card title="Side view (not to scale vertically)">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart">
          <line x1={40} x2={W - 20} y1={y0} y2={y0} className="grid" />
          <line x1={40} x2={40} y1={y0} y2={yT} className="tower" />
          <line x1={40} y1={yT} x2={x(up.d)} y2={up.yy} className="f60" />
          <line x1={40} y1={yT} x2={x(lo.d)} y2={lo.yy} className="f60" />
          <line x1={40} y1={yT} x2={x(m.d)} y2={m.yy} className="los ok" />
          <line x1={x(L.rangeKm)} x2={x(L.rangeKm)} y1={y0} y2={y0 - 40} className="worst" />
          <text x={x(L.rangeKm)} y={y0 - 44} textAnchor="middle">edge {fmt(L.rangeKm, 1)} km</text>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => <text key={t} x={x(t * maxD)} y={H - 10} textAnchor="middle">{(t * maxD).toFixed(1)}</text>)}
        </svg>
        <p className="small muted">Green = main beam, dashed = −3 dB edges. Over-tilting shrinks the footprint; under-tilting causes overshoot and interference.</p>
      </Card>
    </div>
  );
}
