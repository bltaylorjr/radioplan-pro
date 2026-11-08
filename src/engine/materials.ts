// Materials list (bill of materials) generator. Quantities are derived from the design; the user can override any line.
import { autoDesign, defaultInputs } from './autodesign';
import { projectSystems } from '../data/systems';
import type { Project } from '../types';
import { ANTENNAS, FEEDERS, RADIOS, PV_MODULES, byId } from '../data/catalog';
import { mToFt } from './rf';
import { sizeSolar } from './solar';
import { alarmBatteryAh } from './alarm';
import { halfWaveDipoleFt } from './lfhf';

export interface BomLine { key: string; category: string; item: string; brandModel: string; qty: number; unit: string; basis: string; extraId?: string }

export function buildBom(p: Project): BomLine[] {
  const L: BomLine[] = [];
  const add = (category: string, key: string, item: string, brandModel: string, qty: number, unit: string, basis: string) => {
    if (qty <= 0) return;
    const q = p.bomOverrides[key] ?? qty;
    L.push({ key, category, item, brandModel, qty: Math.ceil(q * 100) / 100, unit, basis: p.bomOverrides[key] != null ? `${basis} (overridden)` : basis });
  };
  const r = p.radio;
  const tx = p.sites.find((s) => s.id === r.txSiteId) ?? p.sites[0];
  const ant = byId(ANTENNAS, r.txAntennaId), fd = byId(FEEDERS, r.feederId);
  const radio = RADIOS.find((x) => r.fMHz >= x.bandMHz[0] && r.fMHz <= x.bandMHz[1]);
  // Tower, feedline, site grounding and HF lines only for radio projects (or projects with no type picked yet).
  const sys = projectSystems(p.meta).map((s) => s.id), rf = !sys.length || sys.includes('radio'), tower = rf || sys.includes('solar') || sys.includes('callbox');
  if (tx && rf) {
    const vertFt = mToFt(tx.antennaAglM), runFt = mToFt(r.feederLenM);
    if (radio) add('RF equipment', 'radio', 'Base station / repeater', `${radio.brand} ${radio.model}`, 1, 'ea', `Band match ${r.fMHz} MHz`);
    if (ant) {
      add('RF equipment', 'antenna', `${ant.type} antenna`, `${ant.brand} ${ant.model}`, 1, 'ea', `${ant.gainDbi} dBi`);
      add('RF equipment', 'mount', 'Antenna mount', ant.mount, 1, 'ea', 'Per antenna');
    }
    if (fd) {
      add('Transmission line', 'feeder', `Main feeder ${fd.size}`, `${fd.brand} ${fd.model}`, Math.ceil(runFt * 1.1), 'ft', 'Design length + 10% service/drip loop');
      add('Transmission line', 'connectors', 'Feeder connectors', `${fd.connector}`, 2, 'ea', 'One each end');
      add('Transmission line', 'jumpers', 'Jumper cables 6 ft (1/2" superflex)', 'Factory-terminated, PIM-rated', 2, 'ea', 'Antenna + equipment jumpers');
      add('Transmission line', 'hangers', 'Cable hangers', fd.hanger, Math.ceil(vertFt / fd.hangerSpacingFt) + 2, 'ea', `Every ${fd.hangerSpacingFt} ft of vertical run`);
      add('Transmission line', 'adapters', 'Hanger adapters / angle adapters', 'Round-member or angle adapter', Math.ceil(Math.ceil(vertFt / fd.hangerSpacingFt) / 3), 'ea', '1 per 3 hangers (stackable)');
      add('Grounding', 'gkits', 'Feeder ground kits', fd.groundKit, Math.max(p.grounding.towerGroundKits, 3 + Math.floor(vertFt / 200)), 'ea', 'Top, bottom, entry + every 200 ft (R56)');
      add('Transmission line', 'wpk', 'Weatherproofing kits (butyl + tape)', '3M 2228 / Scotch 33+', 2, 'kit', 'Each outdoor connection');
      add('Transmission line', 'boot', 'Wall entry port / cable boot', 'Entry panel w/ boots', 1, 'ea', 'Shelter / building entry');
    }
    add('Grounding', 'surge', 'Coaxial surge protector (antenna discharge unit)', 'PolyPhaser / Times LP, band-matched', 1, 'ea', 'NEC 810.20, at entry');
  }
  const g = p.grounding;
  if (tower) {
  add('Grounding', 'rods', `Ground rod 5/8" × ${g.rodLengthFt} ft copper-bonded`, 'UL 467 listed', g.groundRods, 'ea', 'Design');
  add('Grounding', 'ring', `Ground ring #${g.groundRingAwg} AWG solid tinned Cu`, 'Bare tinned copper', Math.ceil(Math.max(g.groundRods, 1) * g.rodSpacingFt * 1.1), 'ft', 'Rods × spacing + 10%');
  add('Grounding', 'cad', 'Exothermic weld connections', 'Cadweld / ERICO, mold per conductor', g.groundRods * 2 + 4, 'shot', '2 per rod + tower legs/bars');
  add('Grounding', 'tgb', 'Tower ground bar + master ground bar', 'Tinned copper, insulated standoffs', 2, 'ea', 'TGB + MGB (TIA-607)');
  add('Grounding', 'bond', `Bonding conductor #${g.bondingConductorAwg || '6'} AWG Cu green`, 'THHN/THWN green or bare', Math.ceil(mToFt(g.bondingConductorLengthM) * 1.1), 'ft', 'Design length + 10%');
  add('Grounding', 'ibt', 'Intersystem bonding termination', 'Listed IBT', g.intersystemBond ? 1 : 1, 'ea', 'NEC 250.94');
  }

  if (p.solar.enabled) {
    const s = p.solar, mod = byId(PV_MODULES, s.moduleId) ?? PV_MODULES[0];
    const res = sizeSolar({ ...s, module: mod, onBuilding: tx?.onBuilding ?? false });
    add('Solar / DC power', 'pv', 'PV modules', `${mod.brand} ${mod.model}`, res.modulesTotal, 'ea', `${res.strings} string(s) × ${res.modulesPerString}`);
    add('Solar / DC power', 'cc', 'MPPT charge controller', `≥ ${s.controllerMaxVoc} Voc / ≥ ${Math.ceil(res.controllerOutputA)} A`, Math.ceil(res.controllerOutputA / s.controllerMaxA), 'ea', 'Output current');
    const blockV = s.batteryChemistry === 'LiFePO4' ? 12.8 : 12, blockAh = 100;
    const series = Math.round(s.systemVdc / 12), par = Math.ceil(res.batteryAh / blockAh);
    add('Solar / DC power', 'batt', `Battery ${blockV} V ${blockAh} Ah (${s.batteryChemistry})`, 'Deep-cycle, UL 1973 (Li)', series * par, 'ea', `${series}S × ${par}P = ${(par * blockAh).toFixed(0)} Ah`);
    add('Solar / DC power', 'pvwire', `PV wire #${res.pvConductor?.awg ?? '10'} AWG (UL 4703)`, 'PV Wire 2000 V, red/black', Math.ceil(2 * s.arrayToControllerFt * 1.1), 'ft', '690.8 sizing, both conductors');
    add('Solar / DC power', 'battwire', `Battery cable #${res.batteryConductor?.awg ?? '4'} AWG`, 'Welding/battery cable', Math.ceil(2 * s.batteryToLoadFt * 1.1), 'ft', 'Load current × 1.25');
    add('Solar / DC power', 'pvocpd', `PV OCPD ${res.pvOcpdA} A DC`, 'DC-rated breaker/fuse', res.strings > 2 ? res.strings : 1, 'ea', '690.9');
    if (res.strings > 2) add('Solar / DC power', 'combiner', 'PV combiner box', 'Listed, DC fused', 1, 'ea', `${res.strings} strings`);
    add('Solar / DC power', 'disc', 'DC disconnect (PV + battery)', 'Listed, lockable', 2, 'ea', 'NEC 690.13, 706.15');
    if (s.rapidShutdown) add('Solar / DC power', 'rsd', 'Rapid shutdown devices', 'Module-level RSD (e.g. Tigo TS4-A-F)', res.modulesTotal, 'ea', 'NEC 690.12');
    add('Solar / DC power', 'rack', 'Ground-mount / pole-mount racking', 'Sized for TIA/IBC wind', Math.ceil(res.modulesTotal / 4), 'set', '4 modules per set');
  }
  if (p.alarm.enabled) {
    const a = p.alarm, b = alarmBatteryAh(a);
    a.devices.forEach((d, i) => add('Fire alarm', `fa-${i}`, d.name, 'Listed to UL 864/1971/268', d.qty, 'ea', 'Device schedule'));
    add('Fire alarm', 'fa-batt', `Battery 12 V ${b.recommendedBatteryAh} Ah SLA`, 'UL-recognized', 2, 'ea', `NFPA 72 calc ${b.requiredAh.toFixed(1)} Ah (2 in series for 24 V)`);
    add('Fire alarm', 'fa-nac', `NAC cable #${a.nacAwg} FPLP`, 'Red jacket, power-limited', Math.ceil(a.nacOneWayFt * 1.15), 'ft', 'One-way run + 15%');
  }
  if (p.erces.enabled) {
    const e = p.erces, n = e.floors * e.antennasPerFloor;
    add('ERCES / DAS', 'bda', 'Public-safety BDA (Class A/B)', 'Honeywell/Fiplex, ADRF, Comba — UL 2524', 1, 'ea', 'NFPA 1225 / UL 2524');
    add('ERCES / DAS', 'donor', 'Donor antenna (directional)', 'Laird PD7-800 or equal', 1, 'ea', 'Aim at serving site');
    add('ERCES / DAS', 'das-ant', 'Indoor DAS antennas', 'CommScope CELLMAX-O or equal', n, 'ea', `${e.floors} floors × ${e.antennasPerFloor}`);
    add('ERCES / DAS', 'das-coax', '1/2" plenum coax', 'CommScope HL4RPV-50 or equal', n * 100 + e.floors * 15, 'ft', '~100 ft per antenna + riser');
    add('ERCES / DAS', 'das-split', 'Splitters / tappers (PIM-rated)', 'Low-PIM, 4.3-10/N', Math.max(0, n - 1), 'ea', 'Antennas − 1');
    add('ERCES / DAS', 'annun', 'ERCES annunciator panel', 'Dedicated, per IFC 510.4.2.5', 1, 'ea', 'At fire command center');
    add('ERCES / DAS', 'batt', 'ERCES battery cabinet (NEMA 4X, 12 h)', 'Listed BBU', 1, 'ea', 'IFC 510.4.2.3');
    add('ERCES / DAS', 'surv', '2-hour rated pathway (enclosure or CI cable)', 'Listed 2-hr system', e.floors * 15, 'ft', 'Riser survivability');
  }
  if (p.indoor.antennas.length) add('Indoor', 'in-ant', 'Indoor antennas / APs (indoor plan)', [...new Set(p.indoor.antennas.map((a) => a.model))].join(', '), p.indoor.antennas.length, 'ea', 'Indoor planner');
  if (!rf) { /* no HF / LF antenna lines */ } else if (p.lfhf.mode === 'HF') {
    const len = halfWaveDipoleFt(p.lfhf.fMHz);
    add('HF / LF', 'hf-wire', `Antenna wire #12 Cu-clad steel (λ/2 @ ${p.lfhf.fMHz} MHz)`, 'Hard-drawn copperweld', Math.ceil(len * 1.1), 'ft', `468/f = ${len.toFixed(1)} ft + 10% trim`);
    add('HF / LF', 'hf-balun', '1:1 current balun', '5 kW-rated', 1, 'ea', 'Feedpoint');
    add('HF / LF', 'hf-ins', 'End insulators + UV halyard rope', 'Dacron 3/16"', 3, 'ea', 'Ends + center');
  } else {
    add('HF / LF', 'lf-radials', `Ground radials #10 Cu (${p.lfhf.radials} × λ/4)`, 'Bare copper', Math.ceil(p.lfhf.radials * mToFt(75 / p.lfhf.fMHz)), 'ft', '47 CFR 73.189 practice: 120 × λ/4');
  }
  // Equipment and materials worked out from the project type, building and devices. On unless turned off.
  if (p.autoDesign?.applied !== false) {
    const r = autoDesign(p, { ...defaultInputs(), ...(p.autoDesign ?? {}) });
    for (const m of [...r.equipment, ...r.materials]) add(`Auto-design: ${m.system}`, `ad-${m.key}`, m.item, m.spec, m.qty, m.unit, m.basis);
  }
  for (const x of p.bomExtra ?? []) L.push({ key: `x-${x.id}`, category: x.category || 'Added items', item: x.item, brandModel: x.brandModel, qty: x.qty, unit: x.unit, basis: x.notes || 'Added by you', extraId: x.id });
  return L;
}

export function bomToCsv(lines: BomLine[]): string {
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  return ['Category,Item,Brand/Model,Qty,Unit,Basis', ...lines.map((l) => [l.category, l.item, l.brandModel, l.qty, l.unit, l.basis].map(esc).join(','))].join('\r\n');
}
