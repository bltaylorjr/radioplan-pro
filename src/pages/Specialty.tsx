import React from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Check, Stat, Txt, Badge, fmt } from '../components/ui';
import { FindingList } from './Compliance';
import { evaluateCompliance, Area } from '../compliance/rules';
import { halfWaveDipoleFt, quarterWaveVerticalFt, monopoleEfficiency, groundwaveFieldMvM, mvmToDbuV, mufMHz, fotMHz, takeoffAngleDeg, nvisPlan } from '../engine/lfhf';
import { sizeSolar, PSH_REFERENCE, table6907Factor } from '../engine/solar';
import { alarmBatteryAh, nacVoltageDrop, ercesDownlink } from '../engine/alarm';
import { PV_MODULES, byId } from '../data/catalog';
import { AWG_SIZES, LV_RESISTANCE_OHM_PER_KFT } from '../engine/electrical';
import { wavelengthM } from '../engine/rf';
import type { Project } from '../types';
import { useUnits, DistNum } from '../units';

function useArea(area: Area) { const { project, rt } = useStore(); return evaluateCompliance({ project, profile: rt.profile }).filter((f) => f.area === area); }
type Upd = (fn: (d: Project) => void) => void;

export function LfHfPage() {
  const { project: p, update } = useStore();
  const u = useUnits();
  const l = p.lfhf;
  const set = <K extends keyof typeof l>(k: K, v: (typeof l)[K]) => update((d) => { d.lfhf[k] = v; });
  const lam = wavelengthM(l.fMHz);
  const eff = monopoleEfficiency(l.antennaHeightM, l.fMHz, l.groundLossOhm);
  const field = groundwaveFieldMvM(l.powerKw, eff.eff, l.distanceKm, l.fMHz, l.soilSigma);
  const muf = mufMHz(l.foF2, l.hopKm), nv = nvisPlan(l.foF2);
  return (
    <div className="grid2">
      <Card title="LF / MF / HF system" actions={<Badge kind="beta" />}>
        <div className="form">
          <Field label="Mode"><Sel value={l.mode} onChange={(v) => update((d) => { d.lfhf.mode = v; d.lfhf.fMHz = v === 'HF' ? 7.2 : 0.53; })} options={[['LF/MF', 'LF / MF (30 kHz – 3 MHz) groundwave'], ['HF', 'HF (3 – 30 MHz) skywave / NVIS']]} /></Field>
          <Field label="Frequency"><Num value={l.fMHz} onChange={(v) => set('fMHz', v!)} unit={`MHz (λ = ${lam.toFixed(1)} m)`} /></Field>
          <Field label="TX power"><Num value={l.powerKw} onChange={(v) => set('powerKw', v!)} unit="kW" /></Field>
          <Field label="Antenna (monopole) height"><Num value={l.antennaHeightM} onChange={(v) => set('antennaHeightM', v!)} unit={`m (${((l.antennaHeightM / lam) * 360).toFixed(0)}° electrical)`} /></Field>
          <Field label="Ground-system loss resistance" tip="≈ 2 Ω with 120 λ/4 radials; 10-30 Ω with a few rods."><Num value={l.groundLossOhm} onChange={(v) => set('groundLossOhm', v!)} unit="Ω" /></Field>
          <Field label="Radials"><Num value={l.radials} step={1} onChange={(v) => set('radials', Math.round(v!))} unit="× λ/4" /></Field>
          <Field label="Soil conductivity" tip="Piedmont clay ≈ 0.004-0.008 S/m; sandy coastal plain ≈ 0.002; mountains ≈ 0.001; seawater 5."><Num value={l.soilSigma} onChange={(v) => set('soilSigma', v!)} unit="S/m" /></Field>
          <Field label="Distance to receiver"><DistNum km={l.distanceKm} onChange={(v) => set('distanceKm', v ?? l.distanceKm)} /></Field>
          <Field label="foF2 (critical frequency)" tip="From the nearest ionosonde (e.g. Wallops Is., Eglin) or a real-time foF2 map."><Num value={l.foF2} onChange={(v) => set('foF2', v!)} unit="MHz" /></Field>
          <Field label="Skywave hop distance"><DistNum km={l.hopKm} onChange={(v) => set('hopKm', v ?? l.hopKm)} /></Field>
        </div>
      </Card>
      <Card title="Results">
        <h4>Antenna dimensions</h4>
        <div className="stats">
          <Stat label="½-wave dipole" value={fmt(halfWaveDipoleFt(l.fMHz), 1)} unit=" ft" tip="468 / f(MHz)" />
          <Stat label="¼-wave vertical" value={fmt(quarterWaveVerticalFt(l.fMHz), 1)} unit=" ft" tip="234 / f(MHz)" />
          <Stat label="Radiation resistance" value={fmt(eff.rr, 2)} unit=" Ω" />
          <Stat label="Antenna efficiency" value={fmt(eff.eff * 100, 1)} unit=" %" tone={eff.eff > 0.5 ? 'ok' : 'warn'} />
        </div>
        <h4>Groundwave (Sommerfeld-Norton, flat earth)</h4>
        <div className="stats">
          <Stat label={`Field at ${u.f(l.distanceKm, 0)}`} value={fmt(field, 3)} unit=" mV/m" />
          <Stat label="Field strength" value={fmt(mvmToDbuV(field), 1)} unit=" dBµV/m" />
        </div>
        <h4>HF skywave</h4>
        <div className="stats">
          <Stat label={`MUF (${u.f(l.hopKm, 0)} hop)`} value={fmt(muf, 1)} unit=" MHz" tip="Secant law, F2 at 300 km" />
          <Stat label="FOT (85%)" value={fmt(fotMHz(muf), 1)} unit=" MHz" />
          <Stat label="Take-off angle" value={fmt(takeoffAngleDeg(l.hopKm), 1)} unit="°" />
          <Stat label="NVIS frequency" value={fmt(nv.freqMHz, 2)} unit=" MHz" />
          <Stat label="NVIS dipole height" value={`${fmt(nv.heightMinM, 0)}–${fmt(nv.heightMaxM, 0)}`} unit=" m" />
        </div>
        <p className="small muted">Simplified planning models. Use ITU-R P.368 / FCC 73.184 groundwave curves and VOACAP / ITU-R P.533 for licensed or regulatory studies.</p>
      </Card>
    </div>
  );
}

export function SolarPage() {
  const { project: p, update } = useStore();
  const s = p.solar, mod = byId(PV_MODULES, s.moduleId) ?? PV_MODULES[0];
  const tx = p.sites.find((x) => x.id === p.radio.txSiteId);
  const r = sizeSolar({ ...s, module: mod, onBuilding: tx?.onBuilding ?? false });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => update((d) => { d.solar[k] = v; });
  const f = useArea('Solar / DC Power');
  return (
    <div className="grid2">
      <div className="stack">
        <Card title="Solar / DC power system" actions={<Check value={s.enabled} onChange={(v) => set('enabled', v)} label="Include in project" />}>
          <h4>Loads</h4>
          <LoadTable loads={s.loads} update={update} />
          <div className="form">
            <Field label="System voltage"><Sel value={String(s.systemVdc)} onChange={(v) => set('systemVdc', +v)} options={['12', '24', '48']} /></Field>
            <Field label="Days of autonomy"><Num value={s.autonomyDays} onChange={(v) => set('autonomyDays', v!)} unit="days" /></Field>
            <Field label="Depth of discharge"><Num value={s.depthOfDischarge * 100} onChange={(v) => set('depthOfDischarge', v! / 100)} unit="%" /></Field>
            <Field label="Battery chemistry"><Sel value={s.batteryChemistry} onChange={(v) => set('batteryChemistry', v)} options={['AGM', 'LiFePO4', 'Flooded']} /></Field>
            <Field label="Location (worst-month sun)"><Sel value={s.pshLocation} onChange={(v) => update((d) => { d.solar.pshLocation = v; d.solar.peakSunHours = PSH_REFERENCE[v] ?? d.solar.peakSunHours; })} options={Object.keys(PSH_REFERENCE)} /></Field>
            <Field label="Peak sun hours" tip="Approximate December values; verify with NREL PVWatts."><Num value={s.peakSunHours} onChange={(v) => set('peakSunHours', v!)} unit="h/day" /></Field>
            <Field label="System derate"><Num value={s.systemDerate} onChange={(v) => set('systemDerate', v!)} /></Field>
            <Field label="PV module"><Sel value={s.moduleId} onChange={(v) => set('moduleId', v)} options={PV_MODULES.map((m) => [m.id, `${m.brand} ${m.model}`] as [string, string])} /></Field>
            <Field label="Record low temperature" tip="ASHRAE extreme annual mean minimum for the site."><Num value={s.recordLowC} onChange={(v) => set('recordLowC', v!)} unit="°C" /></Field>
            <Field label="Controller max PV Voc"><Num value={s.controllerMaxVoc} onChange={(v) => set('controllerMaxVoc', v!)} unit="V" /></Field>
            <Field label="Controller max output"><Num value={s.controllerMaxA} onChange={(v) => set('controllerMaxA', v!)} unit="A" /></Field>
            <Field label="Array → controller (one way)"><Num value={s.arrayToControllerFt} onChange={(v) => set('arrayToControllerFt', v!)} unit="ft" /></Field>
            <Field label="Battery → load (one way)"><Num value={s.batteryToLoadFt} onChange={(v) => set('batteryToLoadFt', v!)} unit="ft" /></Field>
            <Field label="Installed PV conductor"><Sel value={s.installedPvAwg} onChange={(v) => set('installedPvAwg', v)} options={AWG_SIZES.map((a) => [a, `#${a} AWG`] as [string, string])} /></Field>
            <Field label="Options"><span className="stack-tight">
              <Check value={s.dwelling} onChange={(v) => set('dwelling', v)} label="One- or two-family dwelling (600 V limit)" />
              <Check value={s.rapidShutdown} onChange={(v) => set('rapidShutdown', v)} label="Rapid shutdown provided (690.12)" />
              <Check value={s.batteryDisconnect} onChange={(v) => set('batteryDisconnect', v)} label="Battery / ESS disconnect (706.15)" />
            </span></Field>
          </div>
        </Card>
      </div>
      <div className="stack">
        <Card title="Sizing results">
          <div className="stats">
            <Stat label="Daily energy" value={fmt(r.dailyWh, 0)} unit=" Wh/day" />
            <Stat label="Battery bank" value={fmt(r.batteryAh, 0)} unit={` Ah @ ${s.systemVdc} V (${fmt(r.batteryWh / 1000, 1)} kWh)`} />
            <Stat label="PV array (min)" value={fmt(r.arrayW, 0)} unit=" W" />
            <Stat label="Modules" value={`${r.strings} × ${r.modulesPerString}`} unit={` = ${r.modulesTotal} (${r.modulesTotal * mod.pmaxW} W)`} />
            <Stat label="Cold string Voc (690.7)" value={fmt(r.maxStringVoc, 1)} unit=" V" tone={r.maxStringVoc <= Math.min(s.controllerMaxVoc, r.maxSystemVoltageLimit) ? 'ok' : 'bad'} tip={`Correction ${r.vocCorrection.toFixed(3)} (module coefficient). Table 690.7(A) factor: ${table6907Factor(s.recordLowC)}`} />
            <Stat label="Max circuit current (690.8(A))" value={fmt(r.circuitCurrentA, 1)} unit=" A" />
            <Stat label="Conductor ampacity req. (690.8(B))" value={fmt(r.conductorAmpsRequired, 1)} unit=" A" />
            <Stat label="PV conductor" value={`#${r.pvConductor?.awg}`} unit={` AWG (${fmt(r.pvConductor?.vdPct ?? 0, 1)}% VD, ${r.pvConductor?.limitedBy})`} />
            <Stat label="PV OCPD" value={r.pvOcpdA} unit=" A" />
            <Stat label="Battery/load conductor" value={`#${r.batteryConductor?.awg}`} unit={` AWG (${fmt(r.batteryConductor?.vdPct ?? 0, 1)}% VD)`} />
          </div>
        </Card>
        <Card title="Code check: NEC 690 / 706 / 480"><FindingList findings={f} empty={s.enabled ? undefined : 'Enable “Include in project” to run solar code checks.'} /></Card>
      </div>
    </div>
  );
}

function LoadTable({ loads, update }: { loads: Project['solar']['loads']; update: Upd }) {
  return (
    <table className="tbl edit"><thead><tr><th>Load</th><th>W</th><th>h/day</th><th>Qty</th><th>Wh/day</th><th /></tr></thead>
      <tbody>{loads.map((l, i) => (
        <tr key={i}>
          <td><Txt value={l.name} onChange={(v) => update((d) => { d.solar.loads[i].name = v; })} /></td>
          <td><Num value={l.watts} onChange={(v) => update((d) => { d.solar.loads[i].watts = v!; })} /></td>
          <td><Num value={l.hoursPerDay} onChange={(v) => update((d) => { d.solar.loads[i].hoursPerDay = v!; })} /></td>
          <td><Num value={l.qty} onChange={(v) => update((d) => { d.solar.loads[i].qty = v!; })} /></td>
          <td>{(l.watts * l.hoursPerDay * l.qty).toFixed(0)}</td>
          <td><button className="ghost" onClick={() => update((d) => { d.solar.loads.splice(i, 1); })}>✕</button></td>
        </tr>))}</tbody>
      <tfoot><tr><td colSpan={6}><button onClick={() => update((d) => { d.solar.loads.push({ name: 'New load', watts: 10, hoursPerDay: 24, qty: 1 }); })}>+ Add load</button></td></tr></tfoot>
    </table>
  );
}

export function AlarmPage() {
  const { project: p, update } = useStore();
  const a = p.alarm, b = alarmBatteryAh(a);
  const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => update((d) => { d.alarm[k] = v; });
  const v = nacVoltageDrop(a.nacLoadA, a.nacOneWayFt, LV_RESISTANCE_OHM_PER_KFT[a.nacAwg] ?? 3.07);
  const f = useArea('Fire Alarm');
  return (
    <div className="grid2">
      <Card title="Fire alarm system (NFPA 72)" actions={<Check value={a.enabled} onChange={(x) => set('enabled', x)} label="Include in project" />}>
        <table className="tbl edit"><thead><tr><th>Device</th><th>Qty</th><th>Standby mA</th><th>Alarm mA</th><th /></tr></thead>
          <tbody>{a.devices.map((d, i) => (
            <tr key={i}>
              <td><Txt value={d.name} onChange={(x) => update((q) => { q.alarm.devices[i].name = x; })} /></td>
              <td><Num value={d.qty} onChange={(x) => update((q) => { q.alarm.devices[i].qty = x!; })} /></td>
              <td><Num value={d.standbyMa} onChange={(x) => update((q) => { q.alarm.devices[i].standbyMa = x!; })} /></td>
              <td><Num value={d.alarmMa} onChange={(x) => update((q) => { q.alarm.devices[i].alarmMa = x!; })} /></td>
              <td><button className="ghost" onClick={() => update((q) => { q.alarm.devices.splice(i, 1); })}>✕</button></td>
            </tr>))}</tbody>
          <tfoot><tr><td colSpan={5}><button onClick={() => update((q) => { q.alarm.devices.push({ name: 'Device', qty: 1, standbyMa: 0, alarmMa: 0 }); })}>+ Add device</button></td></tr></tfoot>
        </table>
        <div className="form">
          <Field label="Standby duration"><Num value={a.standbyHours} onChange={(x) => set('standbyHours', x!)} unit="h" /></Field>
          <Field label="Alarm duration" tip="5 min (15 min for EVACS / mass notification)."><Num value={a.alarmMinutes} onChange={(x) => set('alarmMinutes', x!)} unit="min" /></Field>
          <Field label="Safety factor" tip="1.2 (20%) is common practice/manufacturer guidance."><Num value={a.safetyFactor} onChange={(x) => set('safetyFactor', x!)} /></Field>
          <Field label="Installed battery"><Num value={a.installedBatteryAh} onChange={(x) => set('installedBatteryAh', x!)} unit="Ah" /></Field>
          <Field label="Worst NAC load"><Num value={a.nacLoadA} onChange={(x) => set('nacLoadA', x!)} unit="A" /></Field>
          <Field label="NAC one-way length"><Num value={a.nacOneWayFt} onChange={(x) => set('nacOneWayFt', x!)} unit="ft" /></Field>
          <Field label="NAC conductor"><Sel value={a.nacAwg} onChange={(x) => set('nacAwg', x)} options={['18', '16', ...AWG_SIZES.slice(0, 4)].map((s) => [s, `#${s} AWG`] as [string, string])} /></Field>
          <Field label="Device minimum voltage"><Num value={a.minDeviceV} onChange={(x) => set('minDeviceV', x!)} unit="V" /></Field>
          <Field label="Communicator"><Sel value={a.communicatorType} onChange={(x) => set('communicatorType', x)} options={['DACT 2-line', 'cellular', 'IP', 'radio']} /></Field>
          <Field label="Power supply"><span className="stack-tight">
            <Check value={a.dedicatedBranchCircuit} onChange={(x) => set('dedicatedBranchCircuit', x)} label="Dedicated branch circuit (760.41)" />
            <Check value={a.circuitLockedAndMarked} onChange={(x) => set('circuitLockedAndMarked', x)} label='Red-marked, locked, labelled "FIRE ALARM CIRCUIT"' />
          </span></Field>
        </div>
      </Card>
      <div className="stack">
        <Card title="Battery & NAC calculation">
          <div className="stats">
            <Stat label="Standby current" value={fmt(b.standbyA, 3)} unit=" A" />
            <Stat label="Alarm current" value={fmt(b.alarmA, 3)} unit=" A" />
            <Stat label="Calculated capacity" value={fmt(b.rawAh, 2)} unit=" Ah" />
            <Stat label={`Required (× ${a.safetyFactor})`} value={fmt(b.requiredAh, 2)} unit=" Ah" tone={a.installedBatteryAh >= b.requiredAh ? 'ok' : 'bad'} />
            <Stat label="Recommended battery" value={b.recommendedBatteryAh} unit=" Ah" />
            <Stat label="NAC end-of-line" value={fmt(v.eolV, 2)} unit={` V (${fmt(v.pct, 1)}% drop)`} tone={v.eolV >= a.minDeviceV ? 'ok' : 'bad'} />
          </div>
        </Card>
        <Card title="Code check: NFPA 72 / NEC 760"><FindingList findings={f} empty={a.enabled ? undefined : 'Enable “Include in project” to run alarm checks.'} /></Card>
      </div>
    </div>
  );
}

export function ErcesPage() {
  const { project: p, update } = useStore();
  const e = p.erces, dl = ercesDownlink(e);
  const set = <K extends keyof typeof e>(k: K, v: (typeof e)[K]) => update((d) => { d.erces[k] = v; });
  const f = useArea('Emergency Radio (ERCES)');
  return (
    <div className="grid2">
      <Card title="Emergency responder radio coverage (ERCES)" actions={<Check value={e.enabled} onChange={(x) => set('enabled', x)} label="Include in project" />}>
        <div className="form">
          <Field label="Floors"><Num value={e.floors} step={1} onChange={(x) => set('floors', Math.max(1, Math.round(x!)))} /></Field>
          <Field label="Area per floor"><Num value={e.areaPerFloorSqft} onChange={(x) => set('areaPerFloorSqft', x!)} unit="ft²" /></Field>
          <Field label="Donor signal at roof" tip="Measured from the public-safety site at the donor antenna."><Num value={e.donorRssiDbm} onChange={(x) => set('donorRssiDbm', x!)} unit="dBm" /></Field>
          <Field label="BDA gain"><Num value={e.bdaGainDb} onChange={(x) => set('bdaGainDb', x!)} unit="dB" /></Field>
          <Field label="BDA max composite output"><Num value={e.bdaMaxOutputDbm} onChange={(x) => set('bdaMaxOutputDbm', x!)} unit="dBm" /></Field>
          <Field label="DAS cable loss (worst run)"><Num value={e.dasCableLossDb} onChange={(x) => set('dasCableLossDb', x!)} unit="dB" /></Field>
          <Field label="Splitter excess loss"><Num value={e.splitterLossDb} onChange={(x) => set('splitterLossDb', x!)} unit="dB" /></Field>
          <Field label="Indoor antenna gain"><Num value={e.indoorAntGainDbi} onChange={(x) => set('indoorAntGainDbi', x!)} unit="dBi" /></Field>
          <Field label="Antennas per floor"><Num value={e.antennasPerFloor} step={1} onChange={(x) => set('antennasPerFloor', Math.max(1, Math.round(x!)))} /></Field>
          <Field label="Path loss antenna → worst point" tip="From the Indoor Planner, or ~55-70 dB typical office."><Num value={e.avgPathLossToEdgeDb} onChange={(x) => set('avgPathLossToEdgeDb', x!)} unit="dB" /></Field>
          <Field label="Secondary power"><Num value={e.standbyHours} onChange={(x) => set('standbyHours', x!)} unit="h" /></Field>
          <Field label="Measured coverage (grid test)"><span className="row"><Num value={e.measuredGeneralPct} nullable onChange={(x) => set('measuredGeneralPct', x)} unit="% general" /><Num value={e.measuredCriticalPct} nullable onChange={(x) => set('measuredCriticalPct', x)} unit="% critical" /></span></Field>
          <Field label="Requirements" wide><span className="stack-tight">
            <Check value={e.nema4Enclosure} onChange={(x) => set('nema4Enclosure', x)} label="NEMA 4/4X enclosures for BDA and batteries" />
            <Check value={e.survivabilityRated} onChange={(x) => set('survivabilityRated', x)} label="Backbone pathway survivability (2-hour) provided" />
            <Check value={e.annunciator} onChange={(x) => set('annunciator', x)} label="Supervised by fire alarm + dedicated annunciator" />
            <Check value={e.ahjFreqApproval} onChange={(x) => set('ahjFreqApproval', x)} label="FCC licensee consent obtained / Class B registered (90.219)" />
          </span></Field>
        </div>
      </Card>
      <div className="stack">
        <Card title="Downlink budget">
          <div className="stats">
            <Stat label="BDA output" value={fmt(dl.bdaOutputDbm)} unit=" dBm" tone={dl.compressed ? 'warn' : 'ok'} />
            <Stat label="Total antennas" value={e.floors * e.antennasPerFloor} />
            <Stat label="Power per antenna" value={fmt(dl.perAntennaDbm)} unit=" dBm" />
            <Stat label="Signal at worst point" value={fmt(dl.edgeRssiDbm)} unit=" dBm" tone={dl.edgeRssiDbm >= -95 ? 'ok' : 'bad'} tip="Must be ≥ −95 dBm (IFC 510.4.1.1)" />
          </div>
        </Card>
        <Card title="Code check: IFC 510 / NFPA 1225 / FCC 90.219"><FindingList findings={f} empty={e.enabled ? undefined : 'Enable “Include in project” to run ERCES checks.'} /></Card>
      </div>
    </div>
  );
}
