import React from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Stat, fmt } from '../components/ui';
import { tiltFootprintKm, recommendedTiltDeg, dbmToWatts } from '../engine/rf';
import { designLink } from '../engine/design';
import { useUnits, DistNum } from '../units';
import { MagNote } from '../components/Azimuth';
import { bearingDeg } from '../engine/geo';
import { BeamSideView } from '../components/BeamSideView';

export function OptimizePage() {
  const { project: p, update, go } = useStore();
  const u = useUnits();
  const r = p.radio, L = designLink(p);
  const h = L.tx?.antennaAglM ?? 30, vbw = L.ant?.vBwDeg ?? 10;
  const tilt = r.mechTiltDeg + r.elecTiltDeg;
  const fp = tiltFootprintKm(h, tilt, vbw);
  const rec = recommendedTiltDeg(h, Math.max(L.rangeKm, 0.2), vbw);
  return (
    <div className="grid2">
      <Card title="Antenna orientation & power">
        <div className="form">
          <Field label="Azimuth" tip="Direction of the main lobe, degrees true (°T). The compass (magnetic) reading is shown below it."><span className="stack-tight"><span className="row"><Num value={r.azimuthDeg} onChange={(v) => update((d) => { d.radio.azimuthDeg = ((v! % 360) + 360) % 360; })} unit="°T" />
            {L.tx && L.rx && L.tx !== L.rx && <button onClick={() => update((d) => { d.radio.azimuthDeg = Math.round(bearingDeg(L.tx!, L.rx!) * 10) / 10; })} title="Point the main lobe at the far-end (RX) site">🎯 Aim at {L.rx.name}</button>}</span>
            <MagNote trueDeg={r.azimuthDeg} at={L.tx} /></span></Field>
          <Field label="Mechanical downtilt"><Num value={r.mechTiltDeg} onChange={(v) => update((d) => { d.radio.mechTiltDeg = v!; })} unit="°" /></Field>
          <Field label="Electrical downtilt (RET)"><Num value={r.elecTiltDeg} onChange={(v) => update((d) => { d.radio.elecTiltDeg = v!; })} unit="°" /></Field>
          <Field label="TX power"><Num value={r.txPowerDbm} onChange={(v) => update((d) => { d.radio.txPowerDbm = v!; })} unit={`dBm (${dbmToWatts(r.txPowerDbm).toFixed(1)} W)`} /></Field>
        </div>
        <div className="stats">
          <Stat label="Main beam hits ground" value={Number.isFinite(fp.mainBeamKm) ? fmt(u.d(fp.mainBeamKm), 2) : '∞'} unit={` ${u.unit}`} />
          <Stat label="Inner −3 dB edge" value={fmt(u.d(fp.innerKm), 2)} unit={` ${u.unit}`} />
          <Stat label="Outer −3 dB edge" value={Number.isFinite(fp.outerKm) ? fmt(u.d(fp.outerKm), 2) : '∞ (above horizon)'} unit={Number.isFinite(fp.outerKm) ? ` ${u.unit}` : ''} />
          <Stat label="Recommended total tilt" value={fmt(rec, 1)} unit="°" tip="Upper −3 dB edge at the predicted cell-edge range" tone="ok" />
        </div>
        <div className="row"><button className="primary" onClick={() => update((d) => { d.radio.elecTiltDeg = Math.max(0, Math.round((rec - d.radio.mechTiltDeg) * 10) / 10); })}>Apply recommended tilt</button><button onClick={() => go('coverage')}>Re-run coverage →</button></div>
        <p className="small muted">Antenna: {L.ant?.model} — {L.ant?.hBwDeg}° H / {vbw}° V beamwidth at {h} m AGL. Omni antennas have no azimuth effect.</p>
      </Card>
      <Card title="Side view of the beam" className="span2">
        <BeamSideView />
      </Card>
    </div>
  );
}
