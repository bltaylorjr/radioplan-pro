import React, { useState } from 'react';
import { useStore, downloadText } from '../store';
import { Card, Check, fmt } from '../components/ui';
import { designLink } from '../engine/design';
import { evaluateCompliance, severityOrder } from '../compliance/rules';
import { buildBom } from '../engine/materials';
import { ProfileChart } from '../components/ProfileChart';
import { sizeSolar } from '../engine/solar';
import { alarmBatteryAh, ercesDownlink } from '../engine/alarm';
import { PV_MODULES, byId } from '../data/catalog';
import { JURISDICTIONS } from '../compliance/jurisdictions';
import { mToFt, fsplDb, mpeComplianceDistanceM } from '../engine/rf';
import { bearingDeg } from '../engine/geo';
import { coverageStats } from '../engine/coverage';
import type { Project } from '../types';

const REPORTS = [
  ['site', 'Site Data Sheet'], ['link', 'Link Budget & Path Analysis'], ['coverage', 'Coverage Summary'], ['grounding', 'Grounding & Structure'],
  ['solar', 'Solar / DC Power Sizing'], ['alarm', 'Fire Alarm Battery Calculation'], ['erces', 'ERCES Design Summary'],
  ['compliance', 'Code Compliance Report'], ['bom', 'Materials List'], ['tests', 'Commissioning / Test Report'],
] as const;
type RK = (typeof REPORTS)[number][0];

function kml(p: Project) {
  const esc = (s: string) => s.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
  const tx = p.sites.find((s) => s.id === p.radio.txSiteId), rx = p.sites.find((s) => s.id === p.radio.rxSiteId);
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(p.meta.name)}</name>
${p.sites.map((s) => `<Placemark><name>${esc(s.name)}</name><description>Antenna ${s.antennaAglM} m AGL, ${s.structure} ${s.structureHeightM} m</description><Point><altitudeMode>relativeToGround</altitudeMode><coordinates>${s.lon},${s.lat},${s.antennaAglM}</coordinates></Point></Placemark>`).join('\n')}
${tx && rx ? `<Placemark><name>Path ${esc(tx.name)} - ${esc(rx.name)}</name><LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>${tx.lon},${tx.lat},${tx.antennaAglM} ${rx.lon},${rx.lat},${rx.antennaAglM}</coordinates></LineString></Placemark>` : ''}
</Document></kml>`;
}

export function ReportsPage() {
  const { project: p, rt } = useStore();
  const [sel, setSel] = useState<Record<RK, boolean>>({ site: true, link: true, coverage: true, grounding: true, solar: p.solar.enabled, alarm: p.alarm.enabled, erces: p.erces.enabled, compliance: true, bom: true, tests: p.tests.length > 0 });
  const L = designLink(p), c = p.company, m = p.meta;
  const findings = evaluateCompliance({ project: p, profile: rt.profile }).sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const Head = ({ title }: { title: string }) => (
    <div className="rpt-head">
      <div className="rpt-co">{c.logoDataUrl && <img src={c.logoDataUrl} alt="" />}<div><b>{c.name || 'Company name'}</b><br />{c.title && <>{c.title}<br /></>}{[c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')}<br />{[c.phone, c.email].filter(Boolean).join(' · ')}{c.license && <><br />License {c.license}</>}</div></div>
      <div className="rpt-meta"><h2>{title}</h2><div>{m.name}{m.number && ` · #${m.number}`} · Rev {m.revision}</div><div>Client: {m.client || '—'} · {m.county ? `${m.county}, ` : ''}{JURISDICTIONS[m.state].name}</div><div>Engineer: {m.engineer || '—'}{m.peLicense && ` (PE ${m.peLicense})`} · {m.created}</div></div>
    </div>
  );
  const Foot = () => <div className="rpt-foot">Prepared with RadioPlan Pro. Planning document — calculations and code citations must be verified by a licensed professional engineer and the Authority Having Jurisdiction.</div>;
  const KV = ({ rows }: { rows: [string, React.ReactNode][] }) => <table className="rpt-kv"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>;
  const mod = byId(PV_MODULES, p.solar.moduleId) ?? PV_MODULES[0];
  const sections: Record<RK, () => React.ReactNode> = {
    site: () => <><table className="rpt-tbl"><thead><tr><th>Site</th><th>Lat / Lon (WGS84)</th><th>Ground AMSL</th><th>Structure</th><th>Antenna AGL</th><th>Position source</th></tr></thead>
      <tbody>{p.sites.map((s) => <tr key={s.id}><td>{s.name}<br /><small>{s.address}</small></td><td>{s.lat.toFixed(6)}, {s.lon.toFixed(6)}</td><td>{s.groundElevM ?? '—'} m</td><td>{s.structure}, {s.structureHeightM} m ({mToFt(s.structureHeightM).toFixed(0)} ft)</td><td>{s.antennaAglM} m ({mToFt(s.antennaAglM).toFixed(0)} ft)</td><td>{s.positionSource}{s.positionAccuracyM != null && ` ±${s.positionAccuracyM.toFixed(1)} m`}</td></tr>)}</tbody></table>
      {rt.dem && <p>Terrain source: {rt.dem.source} ({rt.dem.name}).</p>}</>,
    link: () => <><KV rows={[
      ['Path', `${L.tx?.name} → ${L.rx?.name}: ${fmt(L.pathKm, 2)} km, bearing ${L.tx && L.rx ? fmt(bearingDeg(L.tx, L.rx), 1) : '—'}°T`],
      ['Frequency', `${p.radio.fMHz} MHz`], ['TX power', `${p.radio.txPowerDbm} dBm`],
      ['Antenna', `${L.ant?.brand} ${L.ant?.model} (${L.ant?.gainDbi} dBi)`], ['Feeder', `${L.fd?.model}, ${p.radio.feederLenM} m, ${fmt(L.feederLoss, 2)} dB`],
      ['EIRP / ERP', `${fmt(L.eirpDbm)} dBm (${fmt(L.eirpW, 0)} W) / ${fmt(L.erpDbm)} dBm`],
      ['Margins', `shadow ${fmt(L.fadeMarginDb)} dB (σ ${p.radio.shadowSigmaDb} dB, ${(p.radio.edgeReliability * 100).toFixed(0)}% edge), penetration ${p.radio.penetrationLossDb}, body ${p.radio.bodyLossDb}, interference ${p.radio.interferenceMarginDb} dB`],
      ['MAPL', `${fmt(L.maplDb)} dB`], [`Cell-edge range (${L.modelName}, ${p.radio.env})`, `${fmt(L.rangeKm, 2)} km`],
      ['Radio horizon (k=' + p.radio.kFactor.toFixed(2) + ')', `TX ${fmt(L.horizonTxKm, 1)} km; LOS to RX ${fmt(L.losKm, 1)} km`],
      ['Free-space loss over path', `${fmt(fsplDb(p.radio.fMHz, Math.max(L.pathKm, 0.01)))} dB`],
      ...(rt.profile ? [['Min. Fresnel clearance', `${fmt(rt.profile.minClearancePct, 0)}% of F1 (${rt.profile.meets60 ? 'meets' : 'FAILS'} 60%), LOS ${rt.profile.los ? 'clear' : 'obstructed'}, diffraction ${fmt(rt.profile.diffractionLossDb)} dB`] as [string, string]] : []),
      ['RF exposure', `General-public MPE distance ${fmt(mpeComplianceDistanceM(L.eirpW, p.radio.fMHz, 'general'), 1)} m (OET-65)`],
    ]} />{rt.profile ? <ProfileChart a={rt.profile} height={260} /> : <p className="muted">Path profile not computed this session.</p>}</>,
    coverage: () => <KV rows={[['Model', `${L.modelName}, ${p.radio.env}, ${p.radio.city}`], ['Analysis radius', `${p.radio.coverageRadiusKm} km`], ['Threshold', `${p.radio.coverageThresholdDbm} dBm`],
      ['Area above threshold', rt.coverage ? `${fmt(coverageStats(rt.coverage, p.radio.coverageThresholdDbm).pct, 1)} %` : 'not computed this session'], ['Azimuth / tilt', `${p.radio.azimuthDeg}°T / ${p.radio.mechTiltDeg + p.radio.elecTiltDeg}°`], ['Terrain', rt.dem ? rt.dem.source : 'smooth earth']]} />,
    grounding: () => { const g = p.grounding; return <KV rows={[['Bonding conductor', `#${g.bondingConductorAwg} AWG Cu, ${g.bondingConductorLengthM} m`], ['Ground ring', `#${g.groundRingAwg} AWG tinned`], ['Rods', `${g.groundRods} × ${g.rodLengthFt} ft at ${g.rodSpacingFt} ft spacing`], ['Feeder ground kits', g.towerGroundKits], ['Surge protector / IBT', `${g.surgeProtector ? 'Yes' : 'No'} / ${g.intersystemBond ? 'Yes' : 'No'}`], ['Measured resistance', g.measuredResistanceOhm != null ? `${g.measuredResistanceOhm} Ω` : 'not measured'], ['TIA-222-H', `Risk Category ${g.structureClass}${g.ice ? ', ice' : ''}`]]} />; },
    solar: () => { const r = sizeSolar({ ...p.solar, module: mod, onBuilding: L.tx?.onBuilding ?? false }); return <KV rows={[['Daily load', `${fmt(r.dailyWh, 0)} Wh/day`], ['Battery', `${fmt(r.batteryAh, 0)} Ah @ ${p.solar.systemVdc} V, ${p.solar.autonomyDays} days, ${p.solar.depthOfDischarge * 100}% DoD`], ['Array', `${r.modulesTotal} × ${mod.brand} ${mod.model} (${r.strings} strings × ${r.modulesPerString})`], ['Peak sun hours', `${p.solar.peakSunHours} (${p.solar.pshLocation})`], ['Cold Voc (690.7)', `${fmt(r.maxStringVoc, 1)} V`], ['690.8 currents', `${fmt(r.circuitCurrentA, 1)} A max circuit; ${fmt(r.conductorAmpsRequired, 1)} A conductor`], ['PV conductor / OCPD', `#${r.pvConductor?.awg} AWG / ${r.pvOcpdA} A`]]} />; },
    alarm: () => { const b = alarmBatteryAh(p.alarm); return <><table className="rpt-tbl"><thead><tr><th>Device</th><th>Qty</th><th>Standby mA</th><th>Alarm mA</th></tr></thead><tbody>{p.alarm.devices.map((d, i) => <tr key={i}><td>{d.name}</td><td>{d.qty}</td><td>{d.standbyMa}</td><td>{d.alarmMa}</td></tr>)}</tbody></table>
      <KV rows={[['Standby', `${fmt(b.standbyA, 3)} A × ${p.alarm.standbyHours} h`], ['Alarm', `${fmt(b.alarmA, 3)} A × ${p.alarm.alarmMinutes} min`], ['Required', `${fmt(b.rawAh, 2)} Ah × ${p.alarm.safetyFactor} = ${fmt(b.requiredAh, 2)} Ah`], ['Installed', `${p.alarm.installedBatteryAh} Ah`]]} /></>; },
    erces: () => { const d = ercesDownlink(p.erces); return <KV rows={[['Building', `${p.erces.floors} floors × ${p.erces.areaPerFloorSqft} ft²`], ['Donor', `${p.erces.donorRssiDbm} dBm`], ['BDA output', `${fmt(d.bdaOutputDbm)} dBm`], ['Per antenna', `${fmt(d.perAntennaDbm)} dBm (${p.erces.floors * p.erces.antennasPerFloor} antennas)`], ['Worst-point signal', `${fmt(d.edgeRssiDbm)} dBm (≥ −95 required)`], ['Secondary power', `${p.erces.standbyHours} h`]]} />; },
    compliance: () => <table className="rpt-tbl"><thead><tr><th>Status</th><th>Code / section</th><th>Finding</th><th>Recommended fix</th></tr></thead>
      <tbody>{findings.map((f) => <tr key={f.id} className={f.severity}><td>{f.severity === 'violation' ? 'NOT IN COMPLIANCE' : f.severity.toUpperCase()}</td><td>{f.code} §{f.section}</td><td><b>{f.title}</b><br />{f.detail}</td><td>{f.fix ?? ''}</td></tr>)}</tbody></table>,
    bom: () => <table className="rpt-tbl"><thead><tr><th>Category</th><th>Item</th><th>Brand / model</th><th>Qty</th><th>Unit</th></tr></thead><tbody>{buildBom(p).map((l) => <tr key={l.key}><td>{l.category}</td><td>{l.item}</td><td>{l.brandModel}</td><td>{l.qty}</td><td>{l.unit}</td></tr>)}</tbody></table>,
    tests: () => <><table className="rpt-tbl"><thead><tr><th>Test</th><th>Standard</th><th>Acceptance</th><th>Measured</th><th>Result</th><th>Date / tech</th></tr></thead><tbody>{p.tests.map((t) => <tr key={t.id}><td>{t.item}</td><td>{t.standard}</td><td>{t.expected}</td><td>{t.measured}</td><td>{t.pass == null ? 'Pending' : t.pass ? 'PASS' : 'FAIL'}</td><td>{t.date} {t.tech}</td></tr>)}</tbody></table>
      <div className="sign"><div>Technician signature ____________________ Date ________</div><div>Engineer signature ____________________ Date ________</div></div></>,
  };
  return (
    <div className="stack">
      <Card title="Generate reports" className="no-print" actions={<span className="row">
        <button onClick={() => downloadText(`${m.name || 'project'}.kml`, kml(p), 'application/vnd.google-earth.kml+xml')}>⬇ KML (Google Earth)</button>
        <button className="primary" onClick={() => window.print()}>🖨 Print / Save PDF</button></span>}>
        <div className="row wrap">{REPORTS.map(([k, label]) => <Check key={k} value={sel[k]} onChange={(v) => setSel({ ...sel, [k]: v })} label={label} />)}</div>
      </Card>
      <div className="report">
        {REPORTS.filter(([k]) => sel[k]).map(([k, label]) => <section key={k} className="rpt-page"><Head title={label} />{sections[k]()}<Foot /></section>)}
      </div>
    </div>
  );
}
