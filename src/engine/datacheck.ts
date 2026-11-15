// "Check my data": goes through the whole project and lists entries that are empty, out of range, or do not agree
// with each other, each with the page to fix it on and a plain-language fix. Nothing is changed automatically.
import type { Project } from '../types';
import { checkValue, Issue, Range } from './validate';
import { missingRequired } from './required';

export interface DataIssue extends Issue { page: string; where: string }

const FT = 3.28084;
const len = (m: number, imperial: boolean) => (imperial ? `${Math.round(m * FT).toLocaleString('en-US')} ft` : `${Math.round(m).toLocaleString('en-US')} m`);

export function checkProject(p: Project, opts: { imperial?: boolean } = {}): DataIssue[] {
  const imp = opts.imperial ?? p.settings.units !== 'km';
  const out: DataIssue[] = [];
  const add = (page: string, where: string, i: Issue | null) => { if (i) out.push({ ...i, page, where }); };
  /** Range check; lengths stored in metres are checked and reported in the user's units. */
  const v = (page: string, where: string, val: number | null | undefined, r: Range, metres = false) => {
    if (metres && imp && val != null) add(page, where, checkValue(val * FT, { ...r, min: r.min == null ? r.min : r.min * FT, max: r.max == null ? r.max : r.max * FT, unit: 'ft' }));
    else add(page, where, checkValue(val, metres ? { ...r, unit: 'm' } : r));
  };

  // Project information.
  const miss = missingRequired(p);
  if (miss.length) out.push({ level: 'warn', page: 'company', where: 'Company & Project', msg: `${miss.length} required item${miss.length > 1 ? 's are' : ' is'} empty: ${miss.map((m) => m.label).join(', ')}.`, fix: 'Fill them in on Company & Project before reports and proposals go out.' });

  // Sites.
  p.sites.forEach((s, n) => {
    const w = `Site ${n + 1}${s.name ? ` (${s.name})` : ''}`;
    v('sites', w, s.lat, { min: -90, max: 90, label: 'Latitude', unit: '°' });
    v('sites', w, s.lon, { min: -180, max: 180, label: 'Longitude', unit: '°' });
    if (Number.isFinite(s.lat) && Number.isFinite(s.lon) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180) {
      if (s.lon > 0 && s.lat > 24 && s.lat < 40 && -s.lon < -74 && -s.lon > -92) add('sites', w, { level: 'bad', msg: `Longitude ${s.lon} is east of Greenwich; the Carolinas, Georgia, Tennessee and Virginia are west (negative).`, fix: `Did you mean ${-s.lon}? Add the minus sign.` });
      else if (s.lat < 30 || s.lat > 40 || s.lon < -92 || s.lon > -75) add('sites', w, { level: 'warn', msg: `The position (${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}) is outside NC, SC, GA, TN and VA.`, fix: 'Check that latitude and longitude were not swapped, or look the address up again.' });
    }
    v('sites', w, s.structureHeightM, { min: 0, max: 610, label: 'Structure height' }, true);
    v('sites', w, s.antennaAglM, { min: 0, max: 610, label: 'Antenna height above ground' }, true);
    if (s.antennaAglM > s.structureHeightM + 6 && !s.onBuilding) add('sites', w, { level: 'warn', msg: `The antenna (${len(s.antennaAglM, imp)}) is higher than the top of the structure (${len(s.structureHeightM, imp)}).`, fix: 'Check both heights; the antenna is normally at or below the top of the structure.' });
    if (s.groundElevM != null) v('sites', w, s.groundElevM, { min: -100, max: 2100, label: 'Ground elevation' }, true);
    if (s.nearestRunwayFt != null) add('sites', w, checkValue(s.nearestRunwayFt, { min: 0, max: 20000, label: 'Nearest runway length', unit: 'ft' }));
  });

  // Radio design.
  const r = p.radio, rw = 'Radio design';
  v('equipment', rw, r.fMHz, { min: 0.003, max: 100000, label: 'Frequency', unit: 'MHz' });
  v('equipment', rw, r.txPowerDbm, { min: -30, max: 70, label: 'Transmit power', unit: 'dBm' });
  v('equipment', rw, r.rxSensitivityDbm, { min: -150, max: -20, label: 'Receiver sensitivity', unit: 'dBm' });
  if (r.rxSensitivityDbm >= r.txPowerDbm) add('equipment', rw, { level: 'bad', msg: 'Receiver sensitivity is not lower than the transmit power.', fix: 'Sensitivity is a large negative number, for example −116 dBm. Check the sign.' });
  v('equipment', rw, r.feederLenM, { min: 0, max: 1000, label: 'Feeder length' }, true);
  v('coverage', rw, r.mobileHeightM, { min: 0.3, max: 100, label: 'Receive (mobile) height' }, true);
  v('coverage', rw, r.edgeReliability, { min: 0.5, max: 0.9999, label: 'Edge reliability (0–1)' });
  v('coverage', rw, r.coverageRadiusKm, { min: 0.01, max: 300, label: 'Coverage radius', unit: 'km' });
  v('path', rw, r.kFactor, { min: 0.3, max: 10, label: 'k-factor' });
  v('coverage', rw, r.shadowSigmaDb, { min: 0, max: 20, label: 'Shadow fading sigma', unit: 'dB' });
  const ids = new Set(p.sites.map((s) => s.id));
  if (p.sites.length && r.txSiteId && !ids.has(r.txSiteId)) add('equipment', rw, { level: 'bad', msg: 'The transmit site was deleted.', fix: 'Pick the transmit site again on Equipment & Link Budget.' });
  if (p.sites.length && r.rxSiteId && !ids.has(r.rxSiteId)) add('path', rw, { level: 'bad', msg: 'The receive site was deleted.', fix: 'Pick the receive site again on Path Profile.' });
  if (p.sites.length > 1 && r.txSiteId && r.txSiteId === r.rxSiteId) add('path', rw, { level: 'warn', msg: 'Transmit and receive are the same site, so the path has no length.', fix: 'Pick a different receive site.' });

  // Fire alarm.
  const a = p.alarm, aw = 'Fire alarm';
  if (a.enabled) {
    a.devices.forEach((d, n) => {
      const dw = `${aw}: device ${n + 1}${d.name ? ` (${d.name})` : ''}`;
      add('alarm', dw, checkValue(d.qty, { min: 0, max: 10000, integer: true, required: true, label: 'Quantity' }));
      add('alarm', dw, checkValue(d.standbyMa, { min: 0, max: 10000, required: true, label: 'Standby current', unit: 'mA' }));
      add('alarm', dw, checkValue(d.alarmMa, { min: 0, max: 20000, required: true, label: 'Alarm current', unit: 'mA' }));
      if (Number.isFinite(d.alarmMa) && Number.isFinite(d.standbyMa) && d.alarmMa < d.standbyMa) add('alarm', dw, { level: 'warn', msg: 'Alarm current is lower than standby current.', fix: 'Check that the two columns were not swapped.' });
    });
    v('alarm', aw, a.standbyHours, { min: 0, max: 168, label: 'Standby time', unit: 'h' });
    if (a.standbyHours < 24) add('alarm', aw, { level: 'warn', msg: `Standby time is ${a.standbyHours} h.`, fix: 'NFPA 72 needs 24 h standby for fire alarm. Use 24 unless the AHJ allows less.' });
    v('alarm', aw, a.alarmMinutes, { min: 0, max: 240, label: 'Alarm time', unit: 'min' });
    if (a.alarmMinutes < 5) add('alarm', aw, { level: 'warn', msg: `Alarm time is ${a.alarmMinutes} min.`, fix: 'NFPA 72 needs 5 min of alarm (15 min for voice evacuation).' });
    v('alarm', aw, a.safetyFactor, { min: 1, max: 2, label: 'Safety factor (×)' });
    v('alarm', aw, a.installedBatteryAh, { min: 0, max: 1000, label: 'Installed battery', unit: 'Ah' });
    v('alarm', aw, a.nacLoadA, { min: 0, max: 20, label: 'NAC load', unit: 'A' });
    v('alarm', aw, a.minDeviceV, { min: 0, max: 30, label: 'Device minimum voltage', unit: 'V' });
  }

  // ERCES / BDA.
  const e = p.erces, ew = 'Emergency radio (ERCES)';
  if (e.enabled) {
    v('erces', ew, e.floors, { min: 1, max: 200, integer: true, label: 'Floors' });
    v('erces', ew, e.areaPerFloorSqft, { min: 1, max: 5000000, label: 'Area per floor', unit: 'sq ft' });
    v('erces', ew, e.donorRssiDbm, { min: -130, max: -10, label: 'Donor signal', unit: 'dBm' });
    v('erces', ew, e.bdaGainDb, { min: 0, max: 110, label: 'BDA gain', unit: 'dB' });
    v('erces', ew, e.standbyHours, { min: 0, max: 72, label: 'Standby time', unit: 'h' });
    if (e.standbyHours < 12) add('erces', ew, { level: 'warn', msg: `Standby time is ${e.standbyHours} h.`, fix: 'IFC 510 / NFPA 1225 need at least 12 h of standby power for ERCES.' });
    for (const [k, l] of [['measuredGeneralPct', 'Measured general-area coverage'], ['measuredCriticalPct', 'Measured critical-area coverage']] as const) if (e[k] != null) v('erces', ew, e[k], { min: 0, max: 100, label: l, unit: '%' });
  }

  // Solar.
  const s = p.solar, sw = 'Solar & DC power';
  if (s.enabled) {
    s.loads.forEach((l, n) => {
      const lw = `${sw}: load ${n + 1}${l.name ? ` (${l.name})` : ''}`;
      add('solar', lw, checkValue(l.watts, { min: 0, max: 100000, required: true, label: 'Watts', unit: 'W' }));
      add('solar', lw, checkValue(l.hoursPerDay, { min: 0, max: 24, required: true, label: 'Hours per day', unit: 'h' }));
      add('solar', lw, checkValue(l.qty, { min: 0, max: 10000, integer: true, required: true, label: 'Quantity' }));
    });
    if (![12, 24, 36, 48].includes(s.systemVdc)) add('solar', sw, { level: 'warn', msg: `System voltage is ${s.systemVdc} V.`, fix: 'Most battery banks are 12, 24 or 48 V.' });
    v('solar', sw, s.depthOfDischarge, { min: 0.1, max: 1, label: 'Depth of discharge (0–1)' });
    v('solar', sw, s.peakSunHours, { min: 0.5, max: 12, label: 'Peak sun hours', unit: 'h' });
    v('solar', sw, s.autonomyDays, { min: 0, max: 30, label: 'Days of autonomy' });
    v('solar', sw, s.inverterEff, { min: 0.5, max: 1, label: 'Inverter efficiency (0–1)' });
    v('solar', sw, s.systemDerate, { min: 0.3, max: 1, label: 'System derate (0–1)' });
  }

  // Grounding.
  const g = p.grounding, gw = 'Grounding';
  v('grounding', gw, g.groundRods, { min: 0, max: 100, integer: true, label: 'Ground rods' });
  v('grounding', gw, g.rodLengthFt, { min: 1, max: 40, label: 'Rod length', unit: 'ft' });
  if (g.groundRods > 1 && g.rodSpacingFt < g.rodLengthFt) add('grounding', gw, { level: 'warn', msg: `Rods are ${g.rodSpacingFt} ft apart but ${g.rodLengthFt} ft long.`, fix: 'Space rods at least one rod length apart, ideally twice (NEC 250.53(A)(3) needs at least 6 ft).' });
  if (g.measuredResistanceOhm != null) {
    v('grounding', gw, g.measuredResistanceOhm, { min: 0, max: 10000, label: 'Measured ground resistance', unit: 'Ω' });
    if (g.measuredResistanceOhm > 25) add('grounding', gw, { level: 'warn', msg: `Measured ground resistance is ${g.measuredResistanceOhm} Ω.`, fix: 'Over 25 Ω a single rod needs a supplemental electrode (NEC 250.53(A)(2)); radio sites often aim for 5–10 Ω (R56).' });
  }

  // Materials you added and service calls.
  (p.bomExtra ?? []).forEach((x, n) => add('materials', `Materials: added item ${n + 1}${x.item ? ` (${x.item})` : ''}`, checkValue(x.qty, { min: 0.01, max: 1000000, required: true, label: 'Quantity' })));
  (p.serviceLog ?? []).forEach((c, n) => add('service', `Service call ${n + 1}${c.date ? ` (${c.date})` : ''}`, checkValue(c.hours, { min: 0, max: 500, label: 'Hours' })));

  // Proposal.
  const pr = p.proposal;
  if (pr) {
    v('reports', 'Proposal', pr.markupPct, { min: 0, max: 300, label: 'Markup', unit: '%' });
    v('reports', 'Proposal', pr.taxPct, { min: 0, max: 20, label: 'Sales tax', unit: '%' });
    v('reports', 'Proposal', pr.laborRate, { min: 0, max: 1000, label: 'Labor rate', unit: '$/h' });
    v('reports', 'Proposal', pr.laborHours, { min: 0, max: 100000, label: 'Labor hours', unit: 'h' });
  }
  return out.sort((x, y) => (x.level === y.level ? 0 : x.level === 'bad' ? -1 : 1));
}
