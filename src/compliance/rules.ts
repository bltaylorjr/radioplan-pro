// Code-compliance rule engine. Each rule cites the specific section it checks.
// Section numbers follow NFPA 70 (NEC) 2020/2023, NFPA 72 (2019/2022), NFPA 1225 (2022), IFC 2021 and federal rules.
// THESE ARE PLANNING AIDS. A licensed professional engineer / the AHJ must verify every finding and the adopted edition.
import type { Project } from '../types';
import { JURISDICTIONS } from './jurisdictions';
import { awgAtLeast } from '../engine/electrical';
import { sizeSolar } from '../engine/solar';
import { alarmBatteryAh, nacVoltageDrop, ercesDownlink } from '../engine/alarm';
import { LV_RESISTANCE_OHM_PER_KFT, Awg, AMPACITY_75C_CU } from '../engine/electrical';
import { linkBudget, mpeComplianceDistanceM, cableLossPer100ft, mToFt } from '../engine/rf';
import { ANTENNAS, FEEDERS, PV_MODULES, byId } from '../data/catalog';
import type { ProfileAnalysis } from '../engine/terrain';

export type Severity = 'violation' | 'warning' | 'info';
export type Area = 'RF / Structure' | 'Grounding & Bonding' | 'Regulatory (FAA/FCC)' | 'Solar / DC Power' | 'Fire Alarm' | 'Emergency Radio (ERCES)' | 'Jurisdiction';
export interface Finding { id: string; severity: Severity; area: Area; code: string; section: string; title: string; detail: string; fix?: string }
export interface RuleContext { project: Project; profile?: ProfileAnalysis | null }

const F = (f: Finding) => f;

export function txEirp(p: Project) {
  const r = p.radio;
  const ant = byId(ANTENNAS, r.txAntennaId), fd = byId(FEEDERS, r.feederId);
  const feederLoss = fd ? (cableLossPer100ft(fd.points, r.fMHz) * mToFt(r.feederLenM)) / 100 : 0;
  return linkBudget({ txPowerDbm: r.txPowerDbm, txAntGainDbi: ant?.gainDbi ?? 0, txFeederLossDb: feederLoss + r.jumperLossDb, txConnectorLossDb: r.connectorLossDb,
    rxAntGainDbi: r.rxAntGainDbi, rxFeederLossDb: r.rxFeederLossDb, rxSensitivityDbm: r.rxSensitivityDbm });
}

export function evaluateCompliance(ctx: RuleContext): Finding[] {
  const p = ctx.project, out: Finding[] = [];
  const g = p.grounding, j = JURISDICTIONS[p.meta.state];
  const tx = p.sites.find((s) => s.id === p.radio.txSiteId) ?? p.sites[0];

  // ---------- Jurisdiction ----------
  out.push(F({ id: 'jur-editions', severity: 'info', area: 'Jurisdiction', code: j.name, section: 'Adopted codes',
    title: `${j.name}: verify adopted editions with the AHJ`,
    detail: `Electrical: ${j.electrical}. Building: ${j.building}. Fire: ${j.fire}. Authority: ${j.electricalAuthority}. ${j.amendmentNotes.join(' ')} State amendment text is not bundled; confirm at ${j.verifyUrl}.` }));
  out.push(F({ id: 'jur-license', severity: 'info', area: 'Jurisdiction', code: j.name, section: 'Licensing', title: 'Licensing / permits', detail: j.licensing.join(' • ') + '. Electrical and low-voltage permits are typically required before installation.' }));

  // ---------- Grounding & bonding (NEC 810, 250, 800) ----------
  if (!g.bondingConductorAwg) out.push(F({ id: 'nec-810-15', severity: 'violation', area: 'Grounding & Bonding', code: 'NEC', section: '810.15', title: 'Antenna mast / metal structure not grounded', detail: 'Masts and metal structures supporting antennas shall be grounded in accordance with 810.21.', fix: 'Specify a bonding conductor from the mast/tower to the grounding electrode system.' }));
  else if (!awgAtLeast(g.bondingConductorAwg, '10')) out.push(F({ id: 'nec-810-21-h', severity: 'violation', area: 'Grounding & Bonding', code: 'NEC', section: '810.21(H) / 810.58(C)', title: `Bonding conductor #${g.bondingConductorAwg} AWG is undersized`, detail: 'Antenna mast/discharge-unit bonding conductor shall be not smaller than 10 AWG copper (receiving) and, for transmitting stations, not smaller than the lead-in and not smaller than 10 AWG.', fix: 'Use #10 AWG copper minimum; industry practice (R56 / TIA-607) uses #6 AWG or larger, #2 AWG solid tinned for tower grounding.' }));
  if (!g.surgeProtector) out.push(F({ id: 'nec-810-20', severity: 'violation', area: 'Grounding & Bonding', code: 'NEC', section: '810.20', title: 'No antenna discharge unit (surge protector) on lead-in', detail: 'Each conductor of a lead-in from an outdoor antenna shall be provided with a listed antenna discharge unit.', fix: 'Add a listed coaxial surge protector (e.g. PolyPhaser/Times LP series) at the building entry, bonded to the entrance ground bar.' }));
  if (!g.intersystemBond) out.push(F({ id: 'nec-250-94', severity: 'violation', area: 'Grounding & Bonding', code: 'NEC', section: '250.94', title: 'No intersystem bonding termination', detail: 'An intersystem bonding termination for connecting bonding conductors of communications systems shall be provided at the service equipment/metering equipment.', fix: 'Install a listed intersystem bonding termination and bond the antenna system to it (810.21(F)).' }));
  if (g.bondingConductorLengthM > 6.0) out.push(F({ id: 'nec-800-100', severity: 'warning', area: 'Grounding & Bonding', code: 'NEC', section: '800.100(A)(4)', title: `Bonding conductor ${g.bondingConductorLengthM} m exceeds 6.0 m (20 ft)`, detail: 'For one- and two-family dwellings the bonding conductor shall be as short as practicable, not to exceed 6.0 m (20 ft); otherwise a separate electrode bonded to the system is required. Good practice for all occupancies.', fix: 'Relocate the entry point or install a supplemental electrode bonded with #6 AWG to the building electrode system.' }));
  if (g.leadInClearanceToPowerM < 0.6) out.push(F({ id: 'nec-810-18', severity: 'violation', area: 'Grounding & Bonding', code: 'NEC', section: '810.18(A) / 810.13', title: 'Lead-in too close to power conductors', detail: `Lead-in clearance ${g.leadInClearanceToPowerM} m. Outdoor lead-in conductors shall be kept not less than 600 mm (2 ft) from open conductors of light/power circuits (≤250 V) and shall avoid contact with conductors of other systems.`, fix: 'Re-route the lead-in to maintain ≥ 0.6 m separation or use a permitted separation method.' }));
  if (g.rodLengthFt < 8) out.push(F({ id: 'nec-250-52', severity: 'violation', area: 'Grounding & Bonding', code: 'NEC', section: '250.52(A)(5) / 250.53(A)(4)', title: `Ground rod ${g.rodLengthFt} ft is shorter than 8 ft`, detail: 'Rod electrodes shall be not less than 2.44 m (8 ft) in length and installed with at least 2.44 m in contact with soil.', fix: 'Use 5/8" × 8 ft (or 10 ft) copper-bonded rods.' }));
  if (g.groundRods >= 2 && g.rodSpacingFt < 6) out.push(F({ id: 'nec-250-53-a3', severity: 'violation', area: 'Grounding & Bonding', code: 'NEC', section: '250.53(A)(3)', title: 'Rod electrodes closer than 6 ft', detail: 'Where multiple rod electrodes are used they shall be not less than 1.8 m (6 ft) apart.', fix: 'Space rods ≥ 6 ft; R56 recommends ≥ 2× rod length.' }));
  else if (g.groundRods >= 2 && g.rodSpacingFt < 2 * g.rodLengthFt) out.push(F({ id: 'r56-rod-spacing', severity: 'warning', area: 'Grounding & Bonding', code: 'Motorola R56 / TIA-607', section: 'R56 Ch. 4', title: 'Rod spacing below 2× rod length', detail: 'Industry standard practice spaces rods at least twice the rod length to avoid overlapping spheres of influence.', fix: `Space rods ≥ ${2 * g.rodLengthFt} ft.` }));
  if (g.groundRods === 1 && (g.measuredResistanceOhm == null || g.measuredResistanceOhm > 25)) out.push(F({ id: 'nec-250-53-a2', severity: 'violation', area: 'Grounding & Bonding', code: 'NEC', section: '250.53(A)(2)', title: 'Single rod electrode not supplemented', detail: 'A single rod shall be supplemented by an additional electrode unless it has a resistance to earth of 25 Ω or less.', fix: 'Add a second rod ≥ 6 ft away or document a measured resistance ≤ 25 Ω.' }));
  if (g.measuredResistanceOhm != null && g.measuredResistanceOhm > 10) out.push(F({ id: 'r56-10ohm', severity: 'warning', area: 'Grounding & Bonding', code: 'Motorola R56 / TIA-607 / IEEE 142', section: 'R56 Ch. 4 (≤10 Ω objective)', title: `Measured ground resistance ${g.measuredResistanceOhm} Ω exceeds 10 Ω objective`, detail: 'Communications sites target ≤ 10 Ω (≤ 5 Ω for high-lightning sites) by fall-of-potential test.', fix: 'Add radials/rods, a ground ring, or chemical electrodes and retest (IEEE 81).' }));
  if (g.towerGroundKits < 3) out.push(F({ id: 'r56-kits', severity: 'warning', area: 'Grounding & Bonding', code: 'Motorola R56 / TIA-222-H', section: 'R56 Ch. 4 — transmission line grounding', title: `Only ${g.towerGroundKits} feeder ground kit(s) per line`, detail: 'Industry practice: bond each coax at the top of the tower, at the bottom before the bend, and at the building entry; add one every 61 m (200 ft) on tall towers.', fix: 'Specify ≥ 3 ground kits per feeder.' }));
  if (!g.lightningProtection && tx && (tx.structure === 'rooftop' || tx.onBuilding)) out.push(F({ id: 'nfpa-780', severity: 'warning', area: 'Grounding & Bonding', code: 'NFPA 780', section: '4.x / Ch. 4 & 7', title: 'Rooftop antenna without lightning protection system', detail: 'Rooftop antennas and masts should be bonded to a lightning protection system per NFPA 780 where one exists or is required.', fix: 'Evaluate risk per NFPA 780 Annex L and bond mast to the LPS.' }));

  // ---------- RF / structure ----------
  if (tx) {
    out.push(F({ id: 'tia-222', severity: 'info', area: 'RF / Structure', code: 'ANSI/TIA-222-H', section: 'Sec. 2 & Annex B (county wind/ice)', title: 'Structural analysis required for antenna loading', detail: `Structure: ${tx.structure}, ${tx.structureHeightM} m, Risk Category ${g.structureClass}${g.ice ? ', design ice considered' : ''}. Mount and antenna loading must be verified by a licensed PE using TIA-222-H and the adopted IBC wind speeds.` }));
    const hFt = mToFt(tx.structureHeightM);
    let needsFaa = false;
    if (hFt > 200) { needsFaa = true; out.push(F({ id: 'faa-77-9a', severity: 'warning', area: 'Regulatory (FAA/FCC)', code: '14 CFR Part 77', section: '77.9(a)', title: `Structure ${hFt.toFixed(0)} ft AGL exceeds 200 ft`, detail: 'Notice to the FAA (Form 7460-1, OE/AAA) is required for any construction more than 200 ft AGL.', fix: 'File 7460-1 at least 45 days before construction.' })); }
    if (tx.nearestAirportKm != null && tx.nearestRunwayFt != null) {
      const dFt = tx.nearestAirportKm * 3280.84;
      const long = tx.nearestRunwayFt > 3200;
      const lim = long ? 20000 : 10000, slope = long ? 100 : 50;
      if (dFt <= lim && hFt > dFt / slope) { needsFaa = true; out.push(F({ id: 'faa-77-9b', severity: 'warning', area: 'Regulatory (FAA/FCC)', code: '14 CFR Part 77', section: '77.9(b)', title: `Exceeds ${slope}:1 imaginary surface near airport`, detail: `Site is ${dFt.toFixed(0)} ft from an airport with a ${tx.nearestRunwayFt} ft runway; structure ${hFt.toFixed(0)} ft exceeds ${(dFt / slope).toFixed(0)} ft allowed by the ${slope}:1 slope.`, fix: 'File FAA Form 7460-1 and run the FAA Notice Criteria Tool.' })); }
    }
    if (needsFaa) out.push(F({ id: 'fcc-17-4', severity: 'warning', area: 'Regulatory (FAA/FCC)', code: '47 CFR Part 17', section: '17.4', title: 'FCC Antenna Structure Registration (ASR) likely required', detail: 'Structures requiring FAA notice must be registered with the FCC before construction; marking/lighting per FAA AC 70/7460-1.' }));
    const eirp = txEirp(p);
    const dGen = mpeComplianceDistanceM(eirp.eirpW, p.radio.fMHz, 'general');
    const dOcc = mpeComplianceDistanceM(eirp.eirpW, p.radio.fMHz, 'occupational');
    if (tx.antennaAglM - 2 < dGen) out.push(F({ id: 'fcc-1-1310', severity: 'warning', area: 'Regulatory (FAA/FCC)', code: '47 CFR 1.1310 / OET Bulletin 65', section: '1.1310 Table 1; 1.1307(b)', title: 'RF exposure may exceed general-population MPE at ground/roof level', detail: `EIRP ${eirp.eirpW.toFixed(0)} W at ${p.radio.fMHz} MHz: general-public compliance distance ≈ ${dGen.toFixed(1)} m, occupational ≈ ${dOcc.toFixed(1)} m (OET-65 far-field, ground reflection). Antenna centerline is ${tx.antennaAglM} m AGL.`, fix: 'Raise the antenna, reduce EIRP, or establish a controlled zone with RF signage and barriers.' }));
    else out.push(F({ id: 'fcc-1-1310-ok', severity: 'info', area: 'Regulatory (FAA/FCC)', code: '47 CFR 1.1310 / OET-65', section: '1.1310', title: 'RF exposure screening passes', detail: `General-public MPE distance ≈ ${dGen.toFixed(1)} m vs. ${tx.antennaAglM} m antenna height.` }));
  }
  if (ctx.profile) {
    const a = ctx.profile;
    if (!a.los) out.push(F({ id: 'eng-los', severity: 'warning', area: 'RF / Structure', code: 'Engineering criterion', section: 'TIA TSB-88 / 4/3-earth LOS', title: 'Path is obstructed (no line of sight)', detail: `Terrain/clutter blocks the direct ray. Estimated knife-edge diffraction loss ${a.diffractionLossDb.toFixed(1)} dB (v=${a.worstV.toFixed(2)}).`, fix: 'Raise antenna heights, choose an alternate site, or add a repeater.' }));
    else if (!a.meets60) out.push(F({ id: 'eng-fresnel', severity: 'warning', area: 'RF / Structure', code: 'Engineering criterion', section: '60% first-Fresnel-zone clearance', title: `Only ${a.minClearancePct.toFixed(0)}% of F1 clear`, detail: 'Industry practice requires ≥ 60% of the first Fresnel zone to be clear at k = 4/3 (and typically ≥ 0.3 F1 at k = 2/3 for microwave).', fix: 'Increase antenna height at the end nearest the obstruction.' }));
  }

  // ---------- Solar (NEC 690 / 706 / 480) ----------
  if (p.solar.enabled) {
    const s = p.solar, mod = byId(PV_MODULES, s.moduleId) ?? PV_MODULES[0];
    const r = sizeSolar({ ...s, module: mod, onBuilding: tx?.onBuilding ?? false });
    if (r.maxStringVoc > r.maxSystemVoltageLimit) out.push(F({ id: 'nec-690-7', severity: 'violation', area: 'Solar / DC Power', code: 'NEC', section: '690.7', title: `PV max system voltage ${r.maxStringVoc.toFixed(0)} V exceeds ${r.maxSystemVoltageLimit} V`, detail: 'Maximum PV system voltage (temperature-corrected Voc) shall not exceed 600 V for one- and two-family dwellings or 1000 V for other buildings.', fix: 'Reduce modules per string.' }));
    if (r.maxStringVoc > s.controllerMaxVoc) out.push(F({ id: 'nec-110-3b', severity: 'violation', area: 'Solar / DC Power', code: 'NEC', section: '110.3(B) / 690.7', title: 'String Voc exceeds charge controller rating', detail: `Cold-corrected string Voc ${r.maxStringVoc.toFixed(1)} V > controller ${s.controllerMaxVoc} V.` }));
    if (!awgAtLeast(s.installedPvAwg, r.pvConductor?.awg ?? '14') || AMPACITY_75C_CU[s.installedPvAwg as Awg] < r.conductorAmpsRequired) out.push(F({ id: 'nec-690-8', severity: 'violation', area: 'Solar / DC Power', code: 'NEC', section: '690.8(A)(1) & 690.8(B)', title: `PV conductor #${s.installedPvAwg} is undersized`, detail: `Circuit current = Isc × strings × 1.25 = ${r.circuitCurrentA.toFixed(1)} A; conductor ampacity must be ≥ 125% of that = ${r.conductorAmpsRequired.toFixed(1)} A (Table 310.16 75 °C).`, fix: `Use #${r.pvConductor?.awg} AWG Cu or larger.` }));
    if (r.pvConductor && r.pvConductor.vdPct > 3) out.push(F({ id: 'nec-vd-pv', severity: 'warning', area: 'Solar / DC Power', code: 'NEC', section: '210.19(A) Informational Note / 215.2(A) Informational Note', title: `PV circuit voltage drop ${r.pvConductor.vdPct.toFixed(1)}%`, detail: 'Informational notes recommend ≤ 3% branch / 5% total voltage drop; not mandatory but affects performance.' }));
    if (s.dwelling || tx?.onBuilding) { if (!s.rapidShutdown) out.push(F({ id: 'nec-690-12', severity: 'violation', area: 'Solar / DC Power', code: 'NEC', section: '690.12', title: 'Rapid shutdown not provided for PV on/in a building', detail: 'PV system circuits installed on or in buildings shall include a rapid shutdown function.', fix: 'Add a listed rapid-shutdown system (module-level or array-boundary) with initiator.' })); }
    if (!s.batteryDisconnect) out.push(F({ id: 'nec-706-15', severity: 'violation', area: 'Solar / DC Power', code: 'NEC', section: '706.15 / 480.7', title: 'No ESS / battery disconnecting means', detail: 'A disconnecting means shall be provided for all ungrounded conductors derived from an energy storage system; DC battery disconnect where voltage exceeds 60 V DC (480.7).', fix: 'Add a listed DC-rated disconnect within sight of the battery bank.' }));
    if (r.batteryWh > 1000) out.push(F({ id: 'nec-706-1', severity: 'info', area: 'Solar / DC Power', code: 'NEC / NFPA 855 / IFC 1207', section: '706.1; IFC 1207', title: `ESS ${(r.batteryWh / 1000).toFixed(1)} kWh — ESS rules apply`, detail: `Battery bank ${(r.batteryWh / 1000).toFixed(1)} kWh (${s.batteryChemistry}). NEC 706 applies to ESS > 1 kWh; IFC 1207 / NFPA 855 thresholds apply for larger systems (e.g. 20 kWh for lithium). Provide working space per 110.26.` }));
    r.notes.forEach((n, k) => out.push(F({ id: `solar-note-${k}`, severity: 'info', area: 'Solar / DC Power', code: 'NEC', section: '690', title: 'Solar design note', detail: n })));
  }

  // ---------- Fire alarm (NFPA 72 / NEC 760) ----------
  if (p.alarm.enabled) {
    const a = p.alarm, b = alarmBatteryAh(a);
    if (a.standbyHours < 24) out.push(F({ id: 'nfpa72-standby', severity: 'violation', area: 'Fire Alarm', code: 'NFPA 72', section: '10.6.7.2.1', title: `Standby duration ${a.standbyHours} h < 24 h`, detail: 'Secondary power shall operate the system under quiescent load for a minimum of 24 hours and then alarm for 5 minutes (15 minutes for EVACS / in-building mass notification).' }));
    if (a.alarmMinutes < 5) out.push(F({ id: 'nfpa72-alarm', severity: 'violation', area: 'Fire Alarm', code: 'NFPA 72', section: '10.6.7.2.1', title: `Alarm duration ${a.alarmMinutes} min < 5 min`, detail: 'Minimum 5 minutes of alarm operation (15 minutes for EVACS) after the standby period.' }));
    if (a.installedBatteryAh < b.requiredAh) out.push(F({ id: 'nfpa72-battery', severity: 'violation', area: 'Fire Alarm', code: 'NFPA 72', section: '10.6.7.2.1 / 10.6.10', title: `Battery ${a.installedBatteryAh} Ah < required ${b.requiredAh.toFixed(1)} Ah`, detail: `Standby ${b.standbyA.toFixed(3)} A × ${a.standbyHours} h + alarm ${b.alarmA.toFixed(3)} A × ${a.alarmMinutes} min = ${b.rawAh.toFixed(2)} Ah, × ${a.safetyFactor} safety factor.`, fix: `Install ≥ ${b.recommendedBatteryAh} Ah batteries.` }));
    if (!a.dedicatedBranchCircuit) out.push(F({ id: 'nec-760-41', severity: 'violation', area: 'Fire Alarm', code: 'NEC / NFPA 72', section: 'NEC 760.41(B); NFPA 72 10.6.5.1', title: 'Fire alarm primary power not on a dedicated branch circuit', detail: 'The branch circuit supplying fire alarm equipment shall supply no other loads.' }));
    if (!a.circuitLockedAndMarked) out.push(F({ id: 'nfpa72-marking', severity: 'violation', area: 'Fire Alarm', code: 'NEC / NFPA 72', section: 'NEC 760.41(B); NFPA 72 10.6.5.2', title: 'FA circuit disconnect not marked / locked', detail: 'The circuit disconnecting means shall have a red marking, be accessible only to authorized personnel, and be identified as "FIRE ALARM CIRCUIT"; location shall be permanently identified at the control unit.' }));
    const r = LV_RESISTANCE_OHM_PER_KFT[a.nacAwg] ?? 3.07;
    const v = nacVoltageDrop(a.nacLoadA, a.nacOneWayFt, r);
    if (v.eolV < a.minDeviceV) out.push(F({ id: 'nfpa72-nac-vd', severity: 'violation', area: 'Fire Alarm', code: 'NFPA 72 / UL 1971 listing', section: 'NFPA 72 10.3.1 (installed per listing)', title: `NAC end-of-line voltage ${v.eolV.toFixed(1)} V below device minimum ${a.minDeviceV} V`, detail: `Drop ${v.dropV.toFixed(2)} V on #${a.nacAwg} over ${a.nacOneWayFt} ft at ${a.nacLoadA} A (from 20.4 V end-of-discharge).`, fix: 'Upsize conductors, split the NAC, or add a NAC power extender.' }));
  }

  // ---------- ERCES (IFC 510 / NFPA 1225 / FCC 90.219) ----------
  if (p.erces.enabled) {
    const e = p.erces, dl = ercesDownlink(e);
    if (dl.edgeRssiDbm < -95) out.push(F({ id: 'ifc-510-4-1-1-pred', severity: 'warning', area: 'Emergency Radio (ERCES)', code: 'IFC 2021 / NFPA 1225', section: 'IFC 510.4.1.1; NFPA 1225 §18.8', title: `Predicted edge signal ${dl.edgeRssiDbm.toFixed(1)} dBm below -95 dBm`, detail: 'Minimum inbound signal strength of -95 dBm is required throughout the coverage area (90% of each floor, 99% in critical areas).', fix: 'Add antennas, reduce splits, or raise BDA output.' }));
    if (e.measuredGeneralPct != null && e.measuredGeneralPct < 90) out.push(F({ id: 'nfpa1225-90', severity: 'violation', area: 'Emergency Radio (ERCES)', code: 'NFPA 1225 / IFC', section: 'NFPA 1225 §18.8.7 (90% general areas); IFC 510.4.1', title: `Measured general-area coverage ${e.measuredGeneralPct}% < 90%` , detail: 'Grid test shall show ≥ 90% of each floor meets the minimum signal and DAQ.' }));
    if (e.measuredCriticalPct != null && e.measuredCriticalPct < 99) out.push(F({ id: 'nfpa1225-99', severity: 'violation', area: 'Emergency Radio (ERCES)', code: 'NFPA 1225 / IFC', section: 'NFPA 1225 §18.8.7 (99% critical areas)', title: `Measured critical-area coverage ${e.measuredCriticalPct}% < 99%`, detail: 'Critical areas (fire command center, stairwells, elevator lobbies, standpipe cabinets, sprinkler riser rooms, exit passageways) require 99%.' }));
    if (e.standbyHours < 12) out.push(F({ id: 'ifc-510-standby', severity: 'violation', area: 'Emergency Radio (ERCES)', code: 'IFC 2021 / NFPA 1225', section: 'IFC 510.4.2.3; NFPA 1225 §18.13', title: `Secondary power ${e.standbyHours} h < 12 h`, detail: 'ERCES secondary power shall operate the system at 100% capacity for not less than 12 hours.' }));
    if (!e.nema4Enclosure) out.push(F({ id: 'nfpa1225-nema4', severity: 'violation', area: 'Emergency Radio (ERCES)', code: 'NFPA 1225 / IFC', section: 'NFPA 1225 §18.10; IFC 510.4.2.2', title: 'BDA / battery enclosures not NEMA 4 or 4X', detail: 'Signal boosters and battery systems shall be in NEMA 4- or 4X-type enclosures.' }));
    if (!e.survivabilityRated) out.push(F({ id: 'nfpa1225-surv', severity: 'violation', area: 'Emergency Radio (ERCES)', code: 'NFPA 1225 / IFC', section: 'NFPA 1225 §18.10 pathway survivability (Level 2 or per AHJ)', title: 'Backbone pathway survivability not provided', detail: 'Backbone cabling and riser shall meet the survivability level required by the AHJ (commonly 2-hour, Level 2).' }));
    if (!e.ahjFreqApproval) out.push(F({ id: 'fcc-90-219', severity: 'violation', area: 'Emergency Radio (ERCES)', code: '47 CFR 90.219', section: '90.219(b)', title: 'No licensee consent / FCC registration for signal booster', detail: 'Industrial (Class A/B) signal boosters require consent of the FCC licensee(s) and Class B boosters must be registered with the FCC.', fix: 'Obtain written retransmission authorization from the public-safety licensee and register.' }));
    if (!e.annunciator) out.push(F({ id: 'ifc-510-monitor', severity: 'violation', area: 'Emergency Radio (ERCES)', code: 'IFC 2021 / NFPA 1225', section: 'IFC 510.4.2.5; NFPA 1225 §18.14', title: 'ERCES not monitored by fire alarm / no dedicated annunciator', detail: 'System shall include automatic supervisory signals (antenna malfunction, booster failure, power loss, low battery) to the fire alarm system and a dedicated annunciator.' }));
    if (dl.compressed) out.push(F({ id: 'erces-compress', severity: 'warning', area: 'Emergency Radio (ERCES)', code: 'Engineering', section: 'BDA linearity', title: 'BDA is output-limited (compression/AGC)', detail: 'Donor level × gain exceeds max output; reduce gain to avoid intermodulation and oscillation (maintain ≥ 15 dB isolation margin).' }));
  }
  return out;
}

export const severityOrder: Record<Severity, number> = { violation: 0, warning: 1, info: 2 };
