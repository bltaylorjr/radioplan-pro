import React from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Stat, fmt, Tip } from '../components/ui';
import { ANTENNAS, FEEDERS, RADIOS, BAND_PRESETS } from '../data/catalog';
import { designLink } from '../engine/design';
import type { RadioDesign } from '../types';
import { dbmToWatts, wattsToDbm } from '../engine/rf';
import { useUnits, DistNum } from '../units';

export function EquipmentPage() {
  const { project: p, update } = useStore();
  const u = useUnits();
  const r = p.radio, L = designLink(p);
  const set = <K extends keyof RadioDesign>(k: K, v: RadioDesign[K]) => update((d) => { d.radio[k] = v; });
  const radios = RADIOS.filter((x) => r.fMHz >= x.bandMHz[0] && r.fMHz <= x.bandMHz[1]);
  const ants = ANTENNAS.filter((a) => r.fMHz >= a.bandMHz[0] && r.fMHz <= a.bandMHz[1]);
  return (
    <div className="grid2">
      <div className="stack">
        <Card title="Band & frequency" tour="eq-band">
          <div className="form">
            <Field label="Band preset"><Sel value={r.bandPreset} onChange={(v) => update((d) => { d.radio.bandPreset = v; if (BAND_PRESETS[v].fMHz) d.radio.fMHz = BAND_PRESETS[v].fMHz; })} options={Object.entries(BAND_PRESETS).map(([k, v]) => [k, v.label] as [string, string])} /></Field>
            <Field label="Design frequency" topic="coverage"><Num value={r.fMHz} onChange={(v) => update((d) => { d.radio.fMHz = v!; d.radio.bandPreset = 'Custom'; })} unit="MHz" /></Field>
          </div>
        </Card>
        <Card title="Transmit chain" tour="eq-chain" tip="EIRP = P_tx − feeder − jumper − connector losses + antenna gain">
          <div className="form">
            <Field label="Radio (band-matched)"><select onChange={(e) => { const x = RADIOS.find((q) => q.id === e.target.value); if (x) update((d) => { d.radio.txPowerDbm = Math.round(wattsToDbm(x.maxPowerW) * 10) / 10; d.radio.rxSensitivityDbm = x.sensitivityDbm; }); }} defaultValue="">
              <option value="">— pick to load power/sensitivity —</option>{radios.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} ({x.maxPowerW} W)</option>)}</select></Field>
            <Field label="TX power at radio" tip="Transmitter output at the antenna port of the radio."><Num value={r.txPowerDbm} onChange={(v) => set('txPowerDbm', v!)} unit={`dBm (${dbmToWatts(r.txPowerDbm).toFixed(1)} W)`} /></Field>
            <Field label="TX antenna"><Sel value={r.txAntennaId} onChange={(v) => set('txAntennaId', v)} options={(ants.length ? ants : ANTENNAS).map((a) => [a.id, `${a.brand} ${a.model} · ${a.gainDbi} dBi`] as [string, string])} /></Field>
            <Field label="Main feeder"><Sel value={r.feederId} onChange={(v) => set('feederId', v)} options={FEEDERS.map((f) => [f.id, `${f.brand} ${f.model}`] as [string, string])} /></Field>
            <Field label="Feeder length" tip="Total run: vertical on the structure + horizontal to the equipment."><Num value={r.feederLenM} onChange={(v) => set('feederLenM', v!)} unit="m" /></Field>
            <Field label="Jumper loss"><Num value={r.jumperLossDb} onChange={(v) => set('jumperLossDb', v!)} unit="dB" /></Field>
            <Field label="Connector / combiner loss"><Num value={r.connectorLossDb} onChange={(v) => set('connectorLossDb', v!)} unit="dB" /></Field>
            <Field label="Antenna azimuth"><Num value={r.azimuthDeg} onChange={(v) => set('azimuthDeg', v!)} unit="°T" /></Field>
          </div>
          {L.ant && <p className="small muted">{L.ant.type}, {L.ant.hBwDeg}° H / {L.ant.vBwDeg}° V beamwidth, {L.ant.connector}. Feeder {fmt(L.feederPer100, 2)} dB/100 ft at {r.fMHz} MHz.</p>}
        </Card>
        <Card title="Receive side & margins" tour="eq-margins">
          <div className="form">
            <Field label="RX sensitivity" tip="e.g. -116 dBm for 12 dB SINAD analog / 5% BER P25. Use the DAQ 3.4 level for public safety."><Num value={r.rxSensitivityDbm} onChange={(v) => set('rxSensitivityDbm', v!)} unit="dBm" /></Field>
            <Field label="RX antenna gain"><Num value={r.rxAntGainDbi} onChange={(v) => set('rxAntGainDbi', v!)} unit="dBi" /></Field>
            <Field label="RX cable loss"><Num value={r.rxFeederLossDb} onChange={(v) => set('rxFeederLossDb', v!)} unit="dB" /></Field>
            <Field label="Mobile / handheld height"><Num value={r.mobileHeightM} onChange={(v) => set('mobileHeightM', v!)} unit="m" /></Field>
            <Field label="Environment"><Sel value={r.env} onChange={(v) => set('env', v)} options={['urban', 'suburban', 'rural']} /></Field>
            <Field label="City size" tip="Large metro uses the large-city mobile correction and +3 dB in COST-231."><Sel value={r.city} onChange={(v) => set('city', v)} options={[['small-medium', 'Small / medium city'], ['large', 'Large metropolitan']]} /></Field>
            <Field label="Shadow fading σ" topic="equipment"><Num value={r.shadowSigmaDb} onChange={(v) => set('shadowSigmaDb', v!)} unit="dB" /></Field>
            <Field label="Cell-edge reliability"><Num value={r.edgeReliability * 100} onChange={(v) => set('edgeReliability', Math.min(99.9, Math.max(50.1, v!)) / 100)} unit="%" /></Field>
            <Field label="Building penetration"><Num value={r.penetrationLossDb} onChange={(v) => set('penetrationLossDb', v!)} unit="dB" /></Field>
            <Field label="Body loss"><Num value={r.bodyLossDb} onChange={(v) => set('bodyLossDb', v!)} unit="dB" /></Field>
            <Field label="Interference margin"><Num value={r.interferenceMarginDb} onChange={(v) => set('interferenceMarginDb', v!)} unit="dB" /></Field>
          </div>
        </Card>
      </div>
      <Card title="Link budget results" tour="eq-results">
        <div className="stats">
          <Stat label="EIRP" value={fmt(L.eirpDbm)} unit={` dBm (${fmt(L.eirpW, 0)} W)`} tip="Effective Isotropic Radiated Power" />
          <Stat label="ERP" value={fmt(L.erpDbm)} unit={` dBm (${fmt(dbmToWatts(L.erpDbm), 0)} W)`} tip="ERP = EIRP − 2.15 dB (referenced to a dipole)" />
          <Stat label="Feeder loss" value={fmt(L.feederLoss, 2)} unit=" dB" />
          <Stat label="Shadow margin" value={fmt(L.fadeMarginDb)} unit=" dB" tip="σ × Q⁻¹(1 − edge reliability)" />
          <Stat label="Total margins" value={fmt(L.totalMarginsDb)} unit=" dB" />
          <Stat label="MAPL" value={fmt(L.maplDb)} unit=" dB" tone="ok" tip="Maximum Allowable Path Loss at the cell edge" />
          <Stat label={`Cell-edge range (${L.modelName})`} value={fmt(u.d(L.rangeKm), 2)} unit={` ${u.unit}`} tone={L.rangeKm < 1 ? 'warn' : 'ok'} />
          <Stat label="Radio horizon to mobile" value={fmt(u.d(L.losKm), 1)} unit={` ${u.unit}`} tip="4/3-earth smooth-earth LOS from base to mobile antenna" />
          <Stat label="Area reliability (Jakes)" value={fmt(L.areaReliability * 100, 1)} unit=" %" />
        </div>
        <table className="tbl budget"><tbody>
          <tr><td>TX power</td><td>{fmt(r.txPowerDbm)} dBm</td></tr>
          <tr><td>− Feeder ({L.fd?.model}, {r.feederLenM} m)</td><td>{fmt(-L.feederLoss, 2)} dB</td></tr>
          <tr><td>− Jumpers / connectors</td><td>{fmt(-(r.jumperLossDb + r.connectorLossDb), 2)} dB</td></tr>
          <tr><td>+ TX antenna gain</td><td>{fmt(L.ant?.gainDbi ?? 0)} dBi</td></tr>
          <tr className="sum"><td>= EIRP</td><td>{fmt(L.eirpDbm)} dBm</td></tr>
          <tr><td>+ RX antenna gain − RX losses</td><td>{fmt(r.rxAntGainDbi - r.rxFeederLossDb)} dB</td></tr>
          <tr><td>− RX sensitivity</td><td>{fmt(-r.rxSensitivityDbm)} dB</td></tr>
          <tr><td>− Margins (fade, penetration, body, interference)</td><td>{fmt(-L.totalMarginsDb)} dB</td></tr>
          <tr className="sum"><td>= MAPL</td><td>{fmt(L.maplDb)} dB</td></tr>
        </tbody></table>
        {L.modelWarnings.length > 0 && <div className="warnbox"><b>Model validity <Tip topic="coverage" /></b><ul>{L.modelWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
        {L.mobileLimitedKm < L.rangeKm && <div className="warnbox">Range is limited by the radio horizon ({u.f(L.losKm, 1)}) before path loss — raise the antenna for more range.</div>}
      </Card>
    </div>
  );
}
