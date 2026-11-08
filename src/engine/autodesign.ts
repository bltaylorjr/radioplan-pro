// Auto-design: from a few facts about the building and the systems on the project, lay out devices on
// each floor, recommend head-end equipment, and estimate cable and materials from the layout.
// Rules of thumb are stated in each line's basis. Results are a starting point for a designer, not a
// code-compliant design: device spacing, candela, audibility and coverage must be checked against the
// adopted codes, the manufacturer's listing and the AHJ.
import type { Project } from '../types';
import { projectSystems } from '../data/systems';

export type BldgType = 'office' | 'school' | 'healthcare' | 'warehouse' | 'retail' | 'multifamily' | 'hotel' | 'industrial';
export interface AutoInputs {
  bldg: BldgType; floors: number; lengthFt: number; widthFt: number; floorHeightFt: number; ceilingFt: number;
  exteriorDoors: number; accessDoors: number; rooms: number; parkingSpaces: number; callBoxes: number; retentionDays: number;
  smokeCoverage: 'full' | 'corridors';
}
export const BLDG: Record<BldgType, { label: string; drops1000: number; wapSqft: number; camSqft: number; ambient: number; dasSqft: number; smoke: 'full' | 'corridors' }> = {
  office: { label: 'Office', drops1000: 10, wapSqft: 2500, camSqft: 5000, ambient: 50, dasSqft: 8000, smoke: 'corridors' },
  school: { label: 'School', drops1000: 4, wapSqft: 1000, camSqft: 2500, ambient: 55, dasSqft: 7000, smoke: 'corridors' },
  healthcare: { label: 'Healthcare', drops1000: 8, wapSqft: 2000, camSqft: 4000, ambient: 50, dasSqft: 6000, smoke: 'full' },
  warehouse: { label: 'Warehouse', drops1000: 0.5, wapSqft: 8000, camSqft: 6000, ambient: 75, dasSqft: 15000, smoke: 'corridors' },
  retail: { label: 'Retail', drops1000: 2, wapSqft: 3000, camSqft: 1200, ambient: 60, dasSqft: 10000, smoke: 'corridors' },
  multifamily: { label: 'Apartments / multifamily', drops1000: 3, wapSqft: 1500, camSqft: 4000, ambient: 45, dasSqft: 5000, smoke: 'full' },
  hotel: { label: 'Hotel', drops1000: 3, wapSqft: 1500, camSqft: 3000, ambient: 45, dasSqft: 5000, smoke: 'full' },
  industrial: { label: 'Industrial / plant', drops1000: 1, wapSqft: 6000, camSqft: 6000, ambient: 80, dasSqft: 12000, smoke: 'corridors' },
};
export const defaultInputs = (): AutoInputs => ({ bldg: 'office', floors: 2, lengthFt: 200, widthFt: 100, floorHeightFt: 14, ceilingFt: 10, exteriorDoors: 4, accessDoors: 6, rooms: 0, parkingSpaces: 80, callBoxes: 0, retentionDays: 30, smokeCoverage: 'corridors' });

export type Kind = 'tr' | 'facp' | 'smoke' | 'pull' | 'hornstrobe' | 'speaker' | 'outlet' | 'wap' | 'camera' | 'reader' | 'contact' | 'motion' | 'keypad' | 'intercom' | 'nurse' | 'dome' | 'das' | 'donor' | 'callbox';
export interface Device { kind: Kind; floor: number; x: number; y: number; system: string; outdoor?: boolean }
export interface Rec { key: string; system: string; item: string; spec: string; qty: number; unit: string; basis: string }
export interface AutoResult { devices: Device[]; trs: Device[]; equipment: Rec[]; materials: Rec[]; notes: string[]; areaSqft: number }
export interface TerrainInfo { elevM: number; reliefM: number; lowerByM: number }

export const KIND_LABEL: Record<Kind, string> = { tr: 'Telecom room / head-end', facp: 'Fire alarm control unit', smoke: 'Smoke detector', pull: 'Manual pull station', hornstrobe: 'Horn/strobe', speaker: 'Speaker', outlet: 'Data outlet (2 drops)', wap: 'Wireless access point',
  camera: 'Camera', reader: 'Card reader door', contact: 'Door contact', motion: 'Motion detector', keypad: 'Keypad', intercom: 'Intercom station', nurse: 'Nurse call station', dome: 'Dome light', das: 'DAS antenna', donor: 'Donor antenna', callbox: 'Emergency call box' };

const ceil = Math.ceil;
function grid(L: number, W: number, s: number): [number, number][] {
  const nx = Math.max(1, ceil(L / s)), ny = Math.max(1, ceil(W / s)); const out: [number, number][] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push([((i + 0.5) * L) / nx, ((j + 0.5) * W) / ny]);
  return out;
}
const along = (L: number, W: number, n: number, y: number): [number, number][] => Array.from({ length: n }, (_, i) => [((i + 0.5) * L) / n, y] as [number, number]);
/** Points spread around the outside walls. */
function perimeter(L: number, W: number, n: number): [number, number][] {
  const per = 2 * (L + W); return Array.from({ length: n }, (_, i) => { let d = ((i + 0.5) * per) / n;
    if (d < L) return [d, 0]; d -= L; if (d < W) return [L, d]; d -= W; if (d < L) return [L - d, W]; d -= L; return [0, W - d]; });
}
const boxes = (ft: number) => ceil(ft / 1000);

export function autoDesign(p: Project, x: AutoInputs, terrain?: TerrainInfo): AutoResult {
  const sys = new Set(projectSystems(p.meta).map((s) => s.id));
  const B = BLDG[x.bldg] ?? BLDG.office;
  const L = Math.max(20, x.lengthFt), W = Math.max(20, x.widthFt), F = Math.max(1, Math.round(x.floors)), floorArea = L * W, area = floorArea * F;
  const drop = Math.max(0, x.ceilingFt - 1.5);
  const dev: Device[] = []; const notes: string[] = [];
  const put = (kind: Kind, f: number, pts: [number, number][], system: string, outdoor = false) => pts.forEach(([a, b]) => dev.push({ kind, floor: f, x: a, y: b, system, outdoor }));

  // Telecom rooms: at least one per floor; more when the floor is over about 10,000 sq ft or a run would pass 90 m.
  let nTr = Math.max(1, ceil(floorArea / 10000));
  while (nTr < 12 && ((L / nTr) / 2 + W / 2) * 1.15 + drop + 10 > 295) nTr++;
  if (((L / nTr) / 2 + W / 2) * 1.15 + drop + 10 > 295) notes.push('Some horizontal runs may pass 90 m even with several telecom rooms: split the floor across the width or use fiber to the zone.');
  const trs: Device[] = [];
  for (let f = 0; f < F; f++) along(L, W, nTr, W / 2).forEach(([a, b]) => trs.push({ kind: 'tr', floor: f, x: a, y: b, system: 'cabling' }));
  const nearestTr = (d: Device) => trs.filter((t) => t.floor === d.floor).reduce((best, t) => (Math.abs(t.x - d.x) + Math.abs(t.y - d.y) < Math.abs(best.x - d.x) + Math.abs(best.y - d.y) ? t : best));
  const run = (d: Device) => { if (d.outdoor) return 150; const t = nearestTr(d); return (Math.abs(t.x - d.x) + Math.abs(t.y - d.y)) * 1.15 + drop + 10; };

  const has = (...ids: string[]) => ids.some((i) => sys.has(i as never));
  const fa = has('firealarm', 'massnotif');
  if (fa) {
    put('facp', 0, [[6, W / 2]], 'firealarm');
    for (let f = 0; f < F; f++) {
      put('smoke', f, x.smokeCoverage === 'full' ? grid(L, W, 30) : along(L, W, Math.max(1, ceil(L / 30)), W / 2), 'firealarm');
      put('pull', f, [[5, W / 2 + 4], [L - 5, W / 2 + 4]], 'firealarm');
      put(sys.has('massnotif') ? 'speaker' : 'hornstrobe', f, grid(L, W, 50), sys.has('massnotif') ? 'massnotif' : 'firealarm');
      if (sys.has('massnotif')) put('hornstrobe', f, grid(L, W, 50).map(([a, b]) => [a + 3, b] as [number, number]), 'massnotif');
    }
    if (x.exteriorDoors > 2) put('pull', 0, perimeter(L, W, x.exteriorDoors - 2), 'firealarm');
  }
  if (has('cabling', 'wifi', 'cctv')) {
    const outlets = ceil((area * B.drops1000) / 1000 / 2);
    if (has('cabling') && outlets) for (let f = 0; f < F; f++) put('outlet', f, grid(L, W, Math.sqrt(floorArea / Math.max(1, ceil(outlets / F)))), 'cabling');
    if (has('cabling', 'wifi')) for (let f = 0; f < F; f++) put('wap', f, grid(L, W, Math.sqrt(B.wapSqft)), 'wifi');
  }
  if (has('cctv')) {
    put('camera', 0, perimeter(L, W, Math.max(1, x.exteriorDoors)), 'cctv');
    for (let f = 0; f < F; f++) put('camera', f, grid(L, W, Math.sqrt(B.camSqft)).map(([a, b]) => [a, b + 2] as [number, number]), 'cctv');
    if (x.parkingSpaces > 0) put('camera', 0, perimeter(L + 120, W + 120, ceil(x.parkingSpaces / 40)).map(([a, b]) => [a - 60, b - 60] as [number, number]), 'cctv', true);
  }
  if (has('access') && x.accessDoors > 0) {
    const ext = Math.min(x.accessDoors, x.exteriorDoors); put('reader', 0, perimeter(L, W, ext).map(([a, b]) => [a, b] as [number, number]), 'access');
    const rest = x.accessDoors - ext; for (let i = 0; i < rest; i++) { const f = i % F; dev.push({ kind: 'reader', floor: f, x: ((i / F + 1) * L) / (rest / F + 2), y: W / 2 - 6, system: 'access' }); }
  }
  if (has('security')) {
    put('contact', 0, perimeter(L, W, Math.max(1, x.exteriorDoors)).map(([a, b]) => [a + 2, b] as [number, number]), 'security');
    put('motion', 0, grid(L, W, 40).map(([a, b]) => [a, b - 2] as [number, number]), 'security');
    put('keypad', 0, [[8, W / 2 - 4]], 'security');
  }
  if (has('intercom')) {
    put('intercom', 0, perimeter(L, W, Math.min(2, Math.max(1, x.exteriorDoors))).map(([a, b]) => [a - 2, b] as [number, number]), 'intercom');
    put('intercom', 0, [[10, W / 2]], 'intercom');
    if (x.bldg === 'multifamily' && x.rooms > 0) for (let i = 0; i < x.rooms; i++) { const f = i % F; dev.push({ kind: 'intercom', floor: f, x: ((Math.floor(i / F) + 0.5) * L) / ceil(x.rooms / F), y: W - 8, system: 'intercom' }); }
  }
  if (has('nursecall') && x.rooms > 0) for (let i = 0; i < x.rooms; i++) {
    const f = i % F, per = ceil(x.rooms / F), k = Math.floor(i / F), side = k % 2 ? W - 10 : 10, cx = ((Math.floor(k / 2) + 0.5) * L) / ceil(per / 2);
    dev.push({ kind: 'nurse', floor: f, x: cx, y: side, system: 'nursecall' }, { kind: 'nurse', floor: f, x: cx + 6, y: side, system: 'nursecall' }, { kind: 'dome', floor: f, x: cx, y: side === 10 ? W / 2 - 5 : W / 2 + 5, system: 'nursecall' });
  }
  if (has('paging', 'sound')) {
    const sp = Math.max(10, 2 * Math.max(1, x.ceilingFt - 5) * Math.tan(Math.PI / 3) * (sys.has('sound') && !sys.has('paging') ? 0.75 : 1));
    for (let f = 0; f < F; f++) put('speaker', f, grid(L, W, sp).map(([a, b]) => [a, b - 3] as [number, number]), sys.has('paging') ? 'paging' : 'sound');
  }
  if (has('das', 'erces')) {
    for (let f = 0; f < F; f++) put('das', f, grid(L, W, Math.sqrt(B.dasSqft)).map(([a, b]) => [a + 4, b + 4] as [number, number]), sys.has('erces') ? 'erces' : 'das');
    put('donor', F - 1, [[L - 10, 10]], sys.has('erces') ? 'erces' : 'das', true);
  }
  if (has('callbox') && x.callBoxes > 0) put('callbox', 0, perimeter(L + 160, W + 160, x.callBoxes).map(([a, b]) => [a - 80, b - 80] as [number, number]), 'callbox', true);

  // ---------- Equipment ----------
  const eq: Rec[] = []; const mat: Rec[] = [];
  const count = (k: Kind, s?: string) => dev.filter((d) => d.kind === k && (!s || d.system === s)).length;
  const E = (system: string, key: string, item: string, spec: string, qty: number, unit: string, basis: string) => { if (qty > 0) eq.push({ key, system, item, spec, qty: Math.round(qty * 100) / 100, unit, basis }); };
  const M = (system: string, key: string, item: string, spec: string, qty: number, unit: string, basis: string) => { if (qty > 0) mat.push({ key, system, item, spec, qty: Math.round(qty), unit, basis }); };
  const sumRuns = (pred: (d: Device) => boolean) => dev.filter(pred).reduce((a, d) => a + run(d), 0);
  const label = (s: string) => projectSystems({ projectType: s })[0]?.label ?? s;

  if (fa) {
    const smoke = count('smoke'), pull = count('pull'), hs = count('hornstrobe'), spk = dev.filter((d) => d.kind === 'speaker' && d.system === 'massnotif').length;
    const points = smoke + pull + ceil((smoke + pull) * 0.1);
    const nacA = hs * 0.14 + spk * 0.03, ext = Math.max(0, ceil(nacA / 6) - 1);
    const sbA = 0.25 + smoke * 0.0003 + ext * 0.05, alA = 0.5 + nacA, voice = sys.has('massnotif');
    const ah = (sbA * 24 + (alA * (voice ? 15 : 5)) / 60) * 1.2;
    const S = 'Fire alarm';
    E(S, 'facp', voice ? 'Fire alarm control unit with emergency voice / mass notification' : 'Addressable fire alarm control unit', `≥ ${ceil(points * 1.25)} addressable points, UL 864`, 1, 'ea', `${points} points + 25% spare`);
    E(S, 'smoke', 'Addressable smoke detectors', 'Photoelectric, UL 268', smoke, 'ea', x.smokeCoverage === 'full' ? '30 ft spacing, full coverage (NFPA 72 17.6.3)' : 'Corridors at 30 ft + required areas (confirm the code requirement)');
    E(S, 'pull', 'Manual pull stations', 'Addressable, dual action', pull, 'ea', 'At each exit / stair (NFPA 72 17.15), within 5 ft of the door');
    E(S, 'hs', 'Horn/strobes, wall', '75 cd typical, 24 V, UL 1971/464', hs, 'ea', 'About one per 2,500 sq ft (50 ft grid); set candela per NFPA 72 Table 18.5.5.4.1');
    if (voice) E('Mass notification', 'mns-spk', 'Ceiling speakers for voice', '25 / 70 V, UL 1480', spk, 'ea', '50 ft grid; check STI intelligibility');
    E(S, 'nac-ext', 'NAC power extenders', '6 A usable each, with batteries', ext, 'ea', `${nacA.toFixed(1)} A of notification load`);
    E(S, 'batt', 'Standby batteries', `${ah.toFixed(1)} Ah at 24 V (2 × 12 V)`, 2, 'ea', `${voice ? '24 h + 15 min voice' : '24 h + 5 min alarm'}, +20% (NFPA 72)`);
    E(S, 'mods', 'Monitor / control modules', 'Sprinkler flow, tamper, HVAC shutdown, door release', ceil((smoke + pull) * 0.1), 'ea', '10% allowance; set from the sequence of operations');
    M(S, 'fa-slc', 'SLC cable', '18/2 FPLP red, shielded if the panel requires', smoke * 30 * 1.15 + F * (L + W), 'ft', 'Device spacing + home run per floor');
    M(S, 'fa-nac', 'NAC cable', '14/2 FPLP red (check voltage drop)', (hs + spk) * 50 * 1.15 + F * (L + W), 'ft', 'Device spacing + home run per floor');
    M(S, 'fa-riser', 'Riser cable', 'FPLR', (F - 1) * x.floorHeightFt * 3 + 30, 'ft', 'SLC + NAC between floors');
    M(S, 'fa-box', 'Backboxes', '4 in square with ring', smoke + pull + hs + spk, 'ea', 'One per device');
  }
  const dataDevices = dev.filter((d) => ['outlet', 'wap', 'camera'].includes(d.kind) || (d.kind === 'intercom' && d.system === 'intercom'));
  if (dataDevices.length) {
    const drops = dataDevices.reduce((a, d) => a + (d.kind === 'outlet' ? 2 : 1), 0);
    const cat6 = dataDevices.reduce((a, d) => a + run(d) * (d.kind === 'outlet' ? 2 : 1), 0);
    const nT = trs.length, S = 'Structured cabling', perTr = drops / nT;
    const poeW = count('wap') * 30 + count('camera') * 15.4 + dev.filter((d) => d.kind === 'intercom').length * 15.4;
    const ports = ceil(perTr * 1.2);
    E(S, 'switch', 'PoE access switches', `48-port, PoE budget ≥ ${ceil((poeW / nT) * 1.25)} W per room`, nT * Math.max(1, ceil(ports / 48)), 'ea', `${drops} drops in ${nT} rooms + 20% spare; ${Math.round(poeW)} W PoE total`);
    E(S, 'pp', 'Patch panels, Cat 6', '48-port', nT * Math.max(1, ceil(perTr / 48)), 'ea', 'Per telecom room');
    E(S, 'rack', 'Equipment racks', '2-post, 45U, with vertical managers', nT * Math.max(1, ceil(perTr / 192)), 'ea', 'One per room (more over 192 drops)');
    E(S, 'ups', 'UPS for each telecom room', `≥ ${ceil(((poeW / nT) + 150) * 1.5 / 100) * 100} VA`, nT, 'ea', 'PoE + switch load × 1.5');
    M(S, 'cat6', 'Cat 6 cable (plenum)', `CMP, ${boxes(cat6 * 1.1)} boxes of 1000 ft`, cat6 * 1.1, 'ft', 'Measured from each device to its telecom room +10% waste');
    M(S, 'jack', 'Cat 6 jacks', 'T568B', drops * 2, 'ea', 'Both ends of each drop');
    M(S, 'fp', 'Faceplates / surface boxes', '2-port', count('outlet') + count('wap') + count('camera'), 'ea', 'One per outlet or device');
    M(S, 'patch', 'Patch cords', '3 ft and 7 ft, Cat 6', drops * 2, 'ea', 'One each end');
    if (nT > 1) { const fib = trs.filter((t) => t !== trs[0]).reduce((a, t) => a + Math.abs(t.x - trs[0].x) + t.floor * x.floorHeightFt + 30, 0); M(S, 'fiber', 'Backbone fiber', '12-strand OM4 (plenum / riser rated)', fib, 'ft', `From the main room to ${nT - 1} other rooms`); M(S, 'lc', 'LC connectors / fiber panels', 'LC duplex, pre-terminated or splice', (nT - 1) * 24, 'ea', '12 strands × 2 ends'); }
  }
  if (count('wap')) E('Wi-Fi', 'wap', 'Wireless access points', 'Wi-Fi 6E / 7, PoE+', count('wap'), 'ea', `About one per ${B.wapSqft.toLocaleString()} sq ft (${B.label}); verify with a survey`);
  if (count('camera')) {
    const n = count('camera'), tb = (n * 4 * 3600 * 24 * x.retentionDays) / 8 / 1e6;
    E('CCTV', 'cams', 'IP cameras', '4 MP, IR, PoE (outdoor-rated where outside)', n, 'ea', `Entrances, one per ${B.camSqft.toLocaleString()} sq ft inside, one per 40 parking spaces`);
    E('CCTV', 'nvr', 'NVR / video server', `${(tb * 1.2).toFixed(1)} TB usable, ${n}+ channels`, 1, 'ea', `${x.retentionDays} days at 4 Mb/s per camera +20%`);
    M('CCTV', 'cam-mount', 'Camera mounts / junction boxes', 'Wall, pole or pendant per location', n, 'ea', 'One per camera');
  }
  if (count('reader')) {
    const n = count('reader'), S = 'Access control';
    E(S, 'ctl', 'Door controllers', '2-door or 4-door, OSDP', ceil(n / 4), 'ea', '4 doors per controller');
    E(S, 'rdr', 'Card readers', 'OSDP, multi-technology', n, 'ea', 'One per controlled door');
    E(S, 'lock', 'Electric locks / strikes', 'Fail-secure strikes or electrified locksets (maglocks need fire alarm release)', n, 'ea', 'One per door; coordinate with the door hardware schedule');
    E(S, 'rex', 'Request-to-exit + door position switches', 'Sensor REX + recessed DPS', n, 'set', 'One set per door');
    E(S, 'lps', 'Lock power supplies', `12/24 V, ≥ ${(n * 0.6 * 1.25).toFixed(1)} A with battery, fire alarm input`, ceil(n / 8), 'ea', '0.6 A per door +25%');
    M(S, 'comp', 'Access control composite cable', 'Reader + lock + REX + DPS (plenum)', sumRuns((d) => d.kind === 'reader') * 1.1, 'ft', 'Each door to its telecom room +10%');
  }
  if (count('motion') || count('contact')) {
    const S = 'Security (intrusion)';
    E(S, 'panel', 'Intrusion control panel', `≥ ${count('motion') + count('contact') + 4} zones, cellular + IP communicator`, 1, 'ea', 'All sensors + 4 spare zones');
    E(S, 'motion', 'Motion detectors', 'Dual-tech or PIR, 35 × 40 ft pattern', count('motion'), 'ea', 'About one per 1,600 sq ft on the ground floor');
    E(S, 'contact', 'Door contacts', 'Recessed or surface, wide gap where needed', count('contact'), 'ea', 'Each exterior door');
    E(S, 'keypad', 'Keypads', 'At the main entry', count('keypad'), 'ea', 'Main entrance');
    M(S, 'sec-wire', 'Alarm cable', '22/4 CMP', sumRuns((d) => ['motion', 'contact', 'keypad'].includes(d.kind)) * 1.1, 'ft', 'Each sensor to the panel area +10%');
  }
  if (dev.some((d) => d.kind === 'intercom')) E('Intercom', 'ic', 'Intercom stations', 'IP / SIP, video at entries', count('intercom'), 'ea', 'Main entries, a master station' + (x.bldg === 'multifamily' && x.rooms ? ', one per apartment' : ''));
  if (count('nurse')) {
    const S = 'Nurse call';
    E(S, 'pat', 'Patient / bed stations', 'UL 1069', x.rooms, 'ea', 'One per room (more for multi-bed rooms)');
    E(S, 'pull', 'Bath / shower pull-cord stations', 'UL 1069', x.rooms, 'ea', 'One per toilet room');
    E(S, 'dome', 'Corridor dome lights', 'Multi-color', count('dome'), 'ea', 'Outside each room');
    E(S, 'duty', 'Staff / duty stations and master console', 'UL 1069', F + ceil(x.rooms / 20), 'ea', 'One master per floor + one duty station per 20 rooms');
    M(S, 'nc-cable', 'Nurse call cable', 'Manufacturer-specified (often Cat 6 or 22 AWG multi-conductor)', sumRuns((d) => d.kind === 'nurse' || d.kind === 'dome') * 1.1, 'ft', 'Each station to the floor\'s controller +10%');
  }
  const spkPA = dev.filter((d) => d.kind === 'speaker' && (d.system === 'paging' || d.system === 'sound'));
  if (spkPA.length) {
    const tap = sys.has('sound') && !sys.has('paging') ? 2 : 1, w = (spkPA.length * tap) / 0.8, amp = [60, 120, 250, 500, 1000].find((a) => a >= w) ?? ceil(w / 500) * 500;
    E('Paging / sound', 'spk', 'Ceiling speakers', '8 in, 70 V transformer', spkPA.length, 'ea', `Spacing about ${(2 * Math.max(1, x.ceilingFt - 5) * Math.tan(Math.PI / 3)).toFixed(0)} ft for a ${x.ceilingFt} ft ceiling`);
    E('Paging / sound', 'amp', '70 V amplifier', `${amp} W (${spkPA.length} × ${tap} W taps ≤ 80%)`, 1, 'ea', `Ambient about ${B.ambient} dBA: aim 10–15 dB above`);
    M('Paging / sound', 'spk-wire', 'Speaker cable', '16/2 CMP', spkPA.length * 25 + F * (L + W), 'ft', 'Daisy-chain + home run per floor');
  }
  if (count('das')) {
    const n = count('das'), S = sys.has('erces') ? 'ERCES' : 'DAS';
    E(S, 'bda', sys.has('erces') ? 'Public safety BDA (Class A/B)' : 'DAS head-end / cellular booster', sys.has('erces') ? 'UL 2524, NEMA 4, 12 h battery' : 'Carrier-approved', 1, 'ea', 'In the main telecom / fire command room');
    E(S, 'donor', 'Donor antenna', 'Directional (Yagi / panel), on the roof', 1, 'ea', terrain ? `Site elevation ${Math.round(terrain.elevM)} m` : 'Aim at the serving site');
    E(S, 'ant', 'Indoor antennas', 'Omni ceiling, low-PIM', n, 'ea', `About one per ${B.dasSqft.toLocaleString()} sq ft (${B.label}); confirm with a design`);
    E(S, 'split', 'Splitters / tappers', 'Low-PIM', Math.max(0, n - 1), 'ea', 'Antennas − 1');
    M(S, 'coax', 'Coax cable', '1/2 in plenum (CMP)', sumRuns((d) => d.kind === 'das') * 1.1 + (F - 1) * x.floorHeightFt + 100, 'ft', 'Each antenna to the riser +10%, riser and donor run');
    if (sys.has('erces')) M(S, 'surv', '2-hour rated riser pathway', 'Listed enclosure or CI cable', (F - 1) * x.floorHeightFt + 30, 'ft', 'IFC 510 survivability');
  }
  if (count('callbox')) {
    const ah = (60 * 24 + 4 * (5 / 60) * 1500 + 12 * 150) / 1000, bank = (ah * 5) / 0.5, pv = (ah * 12 * 1.3) / Math.max(2, p.solar.peakSunHours || 3.5);
    E('Call boxes', 'cb', 'Emergency call boxes', `Cellular, blue light, ${Math.ceil(pv / 10) * 10} W solar + ${Math.ceil(bank / 5) * 5} Ah battery`, count('callbox'), 'ea', 'Solar sized for 5 days without sun at the project\'s peak sun hours');
  }
  // Shared pathway materials
  if (dev.length) {
    const sysCount = new Set(dev.map((d) => d.system)).size;
    M('Pathways', 'jhook', 'J-hooks', '2 in, with beam clamps', (F * (L * nTr ? 2 * L + W : L)) / 5 * Math.min(2, sysCount), 'ea', 'Main pathways every 5 ft (TIA-569), split by system');
    M('Pathways', 'sleeve', 'Firestop sleeves / devices', 'Listed for the wall or floor rating', F * 2 * sysCount, 'ea', 'Each floor and rated wall crossing per system');
    M('Pathways', 'label', 'Labels', 'TIA-606 printable', dev.length * 2, 'ea', 'Both ends');
  }

  // ---------- Notes ----------
  notes.unshift(`${F} floor(s) of ${L} × ${W} ft = ${area.toLocaleString()} sq ft (${B.label}); ${trs.length} telecom room(s), ${nTr} per floor so runs stay under 90 m.`);
  if (terrain) {
    notes.push(`Site ground elevation ${Math.round(terrain.elevM)} m; terrain varies ${Math.round(terrain.reliefM)} m within 2 km.`);
    if (has('das', 'erces', 'callbox', 'radio')) notes.push(terrain.lowerByM > 30 ? `The site sits about ${Math.round(terrain.lowerByM)} m below the surrounding high ground: expect weaker outdoor signal. Put the donor antenna on the highest roof corner and survey before setting BDA gain; check cellular signal at each call box spot.` : 'The site is not in a low spot: outdoor signal should not be blocked by nearby terrain. Still survey the donor signal before setting gain.');
  } else if (has('das', 'erces', 'callbox')) notes.push('Download terrain (Map & Terrain) to include the site\'s elevation and surrounding hills in the donor and call box advice.');
  if (!sys.size) notes.push('Pick the project type and sub-projects first (Project Systems).');
  return { devices: dev, trs, equipment: eq, materials: mat, notes, areaSqft: area };
}
