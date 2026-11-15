// Building materials: walls, floors, roofs, windows, doors, shafts and below-grade levels, with what each
// one does to radio signal (per band), sound (absorption), fire ratings and cable penetrations, and
// whether cameras and motion sensors can see through it. Presets by building type give sensible
// starting choices; the user can change any of them and compare two scenarios side by side.
// Values are typical published figures (ITU-R P.2040 / P.1238, NIST building penetration studies,
// common absorption-coefficient tables and IBC rating practice). Real buildings vary: measure on site
// (ERCES pre-construction survey, acoustic test) and confirm ratings with the architect and AHJ.
import type { BldgType } from './autodesign';

/** Bands the RF tables are given at (MHz). */
export const RF_BANDS = [150, 450, 800, 1900, 2400, 5000] as const;
export const RF_BAND_LABEL: Record<number, string> = { 150: 'VHF 150 MHz', 450: 'UHF 450 MHz', 800: '700/800 MHz public safety', 1900: 'Cellular 1900 MHz', 2400: 'Wi-Fi 2.4 GHz', 5000: 'Wi-Fi 5 GHz' };

export type MatUse = 'wall' | 'window' | 'door' | 'floor' | 'roof' | 'ceiling' | 'finish' | 'shaft' | 'grade';
export interface BuildingMaterial {
  id: string; label: string; use: MatUse[];
  /** One-pass RF loss in dB at each of RF_BANDS. */
  rf: number[];
  /** Sound absorption coefficient near 1 kHz (0 = reflects everything, 1 = absorbs everything). */
  alpha: number;
  /** Sound transmission class of a typical assembly (walls/floors), for privacy between rooms. */
  stc?: number;
  /** Fire-resistance rating (hours) the typical assembly can carry when built to a listed design. */
  fireHr: number;
  /** Cameras see through it (clear glass). Motion sensors (PIR) never see through glass. */
  seeThrough: boolean;
  /** Plan / 3D colour. */
  color: string;
  note: string;
}

export const MATERIALS: BuildingMaterial[] = [
  // walls
  { id: 'drywall', label: 'Metal stud and drywall', use: ['wall', 'shaft'], rf: [1, 1.5, 2, 3, 3, 5], alpha: 0.05, stc: 40, fireHr: 1, seeThrough: false, color: '#9aa5b1', note: '1-hour with one layer of Type X each side on a listed design; 2-hour with two layers.' },
  { id: 'wood', label: 'Wood stud wall', use: ['wall'], rf: [1.5, 2, 3, 4, 4, 6], alpha: 0.08, stc: 35, fireHr: 1, seeThrough: false, color: '#b07a3b', note: 'Combustible construction (Type V). Rated only with Type X gypsum to a listed design.' },
  { id: 'brick', label: 'Brick (veneer or single wythe)', use: ['wall'], rf: [3, 4, 6, 8, 9, 14], alpha: 0.04, stc: 50, fireHr: 2, seeThrough: false, color: '#b5462d', note: 'Wet brick loses much more signal than dry.' },
  { id: 'block', label: 'Concrete block (CMU), 8 in', use: ['wall', 'shaft'], rf: [6, 8, 10, 12, 13, 18], alpha: 0.07, stc: 48, fireHr: 2, seeThrough: false, color: '#7b7b7b', note: 'Grouted and reinforced block loses more. Unpainted block absorbs more sound (about 0.3).' },
  { id: 'concrete', label: 'Poured concrete, 8 in', use: ['wall', 'shaft', 'floor', 'roof'], rf: [8, 11, 14, 18, 20, 30], alpha: 0.02, stc: 55, fireHr: 2, seeThrough: false, color: '#4a4a4a', note: 'Rebar mats add loss at the lower bands.' },
  { id: 'tiltup', label: 'Tilt-up concrete panel with rebar', use: ['wall'], rf: [10, 13, 16, 20, 22, 32], alpha: 0.02, stc: 55, fireHr: 3, seeThrough: false, color: '#5d5d5d', note: 'Typical warehouse / big-box wall. Usually needs a BDA for public-safety radio.' },
  { id: 'metalpanel', label: 'Metal wall panel (insulated)', use: ['wall'], rf: [20, 22, 25, 28, 30, 35], alpha: 0.03, fireHr: 0, seeThrough: false, color: '#455a64', note: 'Foil-faced insulation behind metal blocks almost all signal.' },
  { id: 'glass', label: 'Clear glass', use: ['window', 'wall'], rf: [1, 1.5, 2, 2.5, 3, 4], alpha: 0.04, stc: 28, fireHr: 0, seeThrough: true, color: '#62b6e8', note: 'Cameras see through; motion sensors do not. Watch for IR glare at night.' },
  { id: 'lowe', label: 'Low-E or tinted glass', use: ['window', 'wall'], rf: [15, 18, 20, 25, 30, 35], alpha: 0.04, stc: 32, fireHr: 0, seeThrough: true, color: '#1f6fa8', note: 'Metal oxide coating blocks radio like a metal wall.' },
  { id: 'firewall', label: 'Fire-rated glass / wired glass', use: ['window', 'door'], rf: [4, 5, 6, 8, 9, 12], alpha: 0.04, fireHr: 1, seeThrough: true, color: '#8ab4c8', note: 'Rated assembly; use in rated walls and doors.' },
  // doors
  { id: 'wooddoor', label: 'Wood door', use: ['door'], rf: [2, 2.5, 3, 4, 4, 5], alpha: 0.08, stc: 25, fireHr: 0.33, seeThrough: false, color: '#a1887f', note: '20-minute rated wood doors are common on corridors.' },
  { id: 'metaldoor', label: 'Hollow metal door (rated)', use: ['door'], rf: [8, 9, 10, 12, 13, 15], alpha: 0.03, stc: 30, fireHr: 1.5, seeThrough: false, color: '#607d8b', note: '90-minute doors at stairs and shafts; rated frames and closers.' },
  // floors and roofs
  { id: 'deckslab', label: 'Concrete on metal deck', use: ['floor', 'roof'], rf: [15, 18, 20, 24, 26, 30], alpha: 0.02, stc: 50, fireHr: 2, seeThrough: false, color: '#78909c', note: 'Most steel-frame buildings. Each floor costs about this much signal.' },
  { id: 'hollowcore', label: 'Precast hollow-core plank', use: ['floor', 'roof'], rf: [12, 14, 16, 20, 22, 26], alpha: 0.02, stc: 50, fireHr: 2, seeThrough: false, color: '#90a4ae', note: 'Hotels and apartments.' },
  { id: 'ptslab', label: 'Post-tensioned concrete slab', use: ['floor', 'roof'], rf: [14, 17, 20, 24, 26, 32], alpha: 0.02, stc: 55, fireHr: 2, seeThrough: false, color: '#607d8b', note: 'Do not drill or core without X-ray / GPR scanning for tendons.' },
  { id: 'woodfloor', label: 'Wood joists and subfloor', use: ['floor', 'roof'], rf: [4, 5, 6, 8, 9, 12], alpha: 0.07, stc: 40, fireHr: 1, seeThrough: false, color: '#bcaaa4', note: 'Rated only with a gypsum ceiling to a listed design.' },
  { id: 'metaldeck', label: 'Metal roof deck with insulation', use: ['roof'], rf: [18, 20, 24, 28, 30, 35], alpha: 0.05, fireHr: 0, seeThrough: false, color: '#546e7a', note: 'Donor antenna cable must come through a weather-tight roof penetration.' },
  { id: 'shingle', label: 'Wood truss with shingles', use: ['roof'], rf: [3, 4, 5, 7, 8, 10], alpha: 0.1, fireHr: 0, seeThrough: false, color: '#8d6e63', note: 'Light roof; little signal loss.' },
  // shafts and below grade
  { id: 'elevator', label: 'Elevator shaft (steel and CMU)', use: ['shaft'], rf: [25, 28, 30, 32, 33, 35], alpha: 0.03, fireHr: 2, seeThrough: false, color: '#222222', note: 'Shafts are usually 2-hour (4+ stories) or 1-hour (under 4). Cars need their own DAS antenna or leaky cable.' },
  { id: 'stair', label: 'Stairwell (rated CMU or drywall)', use: ['shaft'], rf: [10, 12, 14, 16, 18, 22], alpha: 0.05, fireHr: 2, seeThrough: false, color: '#6d4c41', note: 'ERCES critical area (99% coverage). Firestop every penetration into the stair.' },
  { id: 'earth', label: 'Below grade (earth and foundation)', use: ['grade'], rf: [30, 35, 40, 50, 55, 65], alpha: 0.02, fireHr: 3, seeThrough: false, color: '#5d4037', note: 'Basements and parking decks below ground get almost no outside signal.' },
  { id: 'none', label: 'None', use: ['grade', 'ceiling', 'window', 'shaft'], rf: [0, 0, 0, 0, 0, 0], alpha: 0, fireHr: 0, seeThrough: true, color: '#ffffff', note: '' },
  // ceilings and floor finishes (sound)
  { id: 'act', label: 'Acoustic ceiling tile', use: ['ceiling'], rf: [0.5, 0.5, 1, 1, 1, 2], alpha: 0.7, fireHr: 0, seeThrough: false, color: '#eeeeee', note: 'Above-ceiling space is often a return-air plenum: use plenum-rated cable (CMP / FPLP).' },
  { id: 'gypceil', label: 'Gypsum (hard) ceiling', use: ['ceiling'], rf: [1, 1.5, 2, 3, 3, 5], alpha: 0.05, fireHr: 1, seeThrough: false, color: '#e0e0e0', note: 'Access panels are needed to reach devices above.' },
  { id: 'opendeck', label: 'Open to structure (no ceiling)', use: ['ceiling'], rf: [0, 0, 0, 0, 0, 0], alpha: 0.05, fireHr: 0, seeThrough: true, color: '#ffffff', note: 'Pendant speakers and longer reverberation; cable must be supported and look neat.' },
  { id: 'carpet', label: 'Carpet', use: ['finish'], rf: [0, 0, 0, 0, 0, 0], alpha: 0.3, fireHr: 0, seeThrough: true, color: '#9575cd', note: '' },
  { id: 'vct', label: 'Vinyl / tile', use: ['finish'], rf: [0, 0, 0, 0, 0, 0], alpha: 0.03, fireHr: 0, seeThrough: true, color: '#cfd8dc', note: '' },
  { id: 'sealed', label: 'Sealed concrete', use: ['finish'], rf: [0, 0, 0, 0, 0, 0], alpha: 0.02, fireHr: 0, seeThrough: true, color: '#b0bec5', note: '' },
  { id: 'hardwood', label: 'Wood flooring', use: ['finish'], rf: [0, 0, 0, 0, 0, 0], alpha: 0.07, fireHr: 0, seeThrough: true, color: '#d7ccc8', note: '' },
];
export const MAT: Record<string, BuildingMaterial> = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));
export const materialsFor = (use: MatUse) => MATERIALS.filter((m) => m.use.includes(use));

/** RF loss (dB) of one pass through a material at any frequency, interpolated in log-frequency. */
export function matLossDb(id: string, fMHz: number): number {
  const m = MAT[id] ?? MAT.drywall; const b = RF_BANDS as readonly number[];
  if (fMHz <= b[0]) return m.rf[0];
  if (fMHz >= b[b.length - 1]) return m.rf[b.length - 1];
  let i = 0; while (fMHz > b[i + 1]) i++;
  const t = Math.log(fMHz / b[i]) / Math.log(b[i + 1] / b[i]);
  return m.rf[i] + (m.rf[i + 1] - m.rf[i]) * t;
}

/** The materials chosen for a building. Every field is a material id. */
export interface BuildingSpec {
  exterior: string; window: string; windowPct: number; corridor: string; partition: string; door: string;
  floor: string; roof: string; ceiling: string; finish: string; elevator: string; stair: string;
  /** Floors below ground (basements, parking). */
  belowGrade: number;
  /** Ceiling space used for return air: cable must be plenum rated. */
  plenum: boolean;
  /** Corridor walls are fire-rated (healthcare, hotels, apartments, unsprinklered buildings). */
  ratedCorridor: boolean;
  /** Building has an elevator and enclosed stairs drawn in the model. */
  shafts: boolean;
}

export const PRESETS: Record<BldgType, BuildingSpec & { why: string }> = {
  office: { exterior: 'brick', window: 'lowe', windowPct: 40, corridor: 'drywall', partition: 'drywall', door: 'wooddoor', floor: 'deckslab', roof: 'metaldeck', ceiling: 'act', finish: 'carpet', elevator: 'elevator', stair: 'stair', belowGrade: 0, plenum: true, ratedCorridor: false, shafts: true, why: 'Steel frame, brick and low-E glass outside, drywall offices, tile ceiling used as a return plenum, carpet.' },
  school: { exterior: 'brick', window: 'glass', windowPct: 25, corridor: 'block', partition: 'block', door: 'metaldoor', floor: 'deckslab', roof: 'metaldeck', ceiling: 'act', finish: 'vct', elevator: 'elevator', stair: 'stair', belowGrade: 0, plenum: true, ratedCorridor: true, shafts: true, why: 'Block classrooms and corridors, vinyl tile floors, tile ceilings. Block walls cut Wi-Fi and radio room to room.' },
  healthcare: { exterior: 'brick', window: 'lowe', windowPct: 30, corridor: 'drywall', partition: 'drywall', door: 'wooddoor', floor: 'ptslab', roof: 'concrete', ceiling: 'act', finish: 'vct', elevator: 'elevator', stair: 'stair', belowGrade: 1, plenum: false, ratedCorridor: true, shafts: true, why: 'Rated corridors and smoke compartments, concrete floors, ducted return (not a plenum). Lots of firestopping.' },
  warehouse: { exterior: 'tiltup', window: 'glass', windowPct: 3, corridor: 'block', partition: 'drywall', door: 'metaldoor', floor: 'concrete', roof: 'metaldeck', ceiling: 'opendeck', finish: 'sealed', elevator: 'none', stair: 'none', belowGrade: 0, plenum: false, ratedCorridor: false, shafts: false, why: 'Tilt-up concrete walls and a metal roof: very little outside signal gets in, and sound echoes for a long time.' },
  retail: { exterior: 'block', window: 'glass', windowPct: 20, corridor: 'drywall', partition: 'drywall', door: 'metaldoor', floor: 'concrete', roof: 'metaldeck', ceiling: 'opendeck', finish: 'vct', elevator: 'none', stair: 'none', belowGrade: 0, plenum: false, ratedCorridor: false, shafts: false, why: 'Block walls with a glass storefront, open ceiling to the deck.' },
  multifamily: { exterior: 'wood', window: 'lowe', windowPct: 20, corridor: 'drywall', partition: 'wood', door: 'wooddoor', floor: 'woodfloor', roof: 'shingle', ceiling: 'gypceil', finish: 'carpet', elevator: 'elevator', stair: 'stair', belowGrade: 0, plenum: false, ratedCorridor: true, shafts: true, why: 'Wood frame with 1-hour unit separations and corridors, gypsum ceilings, carpet.' },
  hotel: { exterior: 'block', window: 'lowe', windowPct: 25, corridor: 'drywall', partition: 'drywall', door: 'wooddoor', floor: 'hollowcore', roof: 'concrete', ceiling: 'gypceil', finish: 'carpet', elevator: 'elevator', stair: 'stair', belowGrade: 0, plenum: false, ratedCorridor: true, shafts: true, why: 'Precast plank floors, rated guest-room and corridor walls, hard ceilings.' },
  industrial: { exterior: 'metalpanel', window: 'glass', windowPct: 5, corridor: 'block', partition: 'block', door: 'metaldoor', floor: 'concrete', roof: 'metaldeck', ceiling: 'opendeck', finish: 'sealed', elevator: 'none', stair: 'stair', belowGrade: 0, plenum: false, ratedCorridor: false, shafts: false, why: 'Metal building: outside signal is blocked, high noise, long echo.' },
};
export function presetFor(b: BldgType): BuildingSpec { const { why: _w, ...s } = PRESETS[b] ?? PRESETS.office; return { ...s }; } // eslint-disable-line @typescript-eslint/no-unused-vars
/** The building materials saved on the project, filled in from the preset for the building type. */
export function specFor(saved: Partial<BuildingSpec> | undefined, bldg: BldgType): BuildingSpec { return { ...presetFor(bldg), ...(saved ?? {}) }; }

/** Ready-made "what if" scenarios to compare against the current choices. */
export const SCENARIOS: { id: string; label: string; spec: Partial<BuildingSpec> }[] = [
  { id: 'steel', label: 'Steel and concrete, low-E glass', spec: { exterior: 'concrete', window: 'lowe', windowPct: 50, floor: 'deckslab', roof: 'metaldeck' } },
  { id: 'woodframe', label: 'Wood frame', spec: { exterior: 'wood', window: 'glass', windowPct: 20, partition: 'wood', floor: 'woodfloor', roof: 'shingle' } },
  { id: 'tiltup', label: 'Tilt-up warehouse', spec: { exterior: 'tiltup', window: 'glass', windowPct: 3, roof: 'metaldeck', ceiling: 'opendeck', finish: 'sealed' } },
  { id: 'metal', label: 'Metal building', spec: { exterior: 'metalpanel', windowPct: 5, roof: 'metaldeck', ceiling: 'opendeck', finish: 'sealed' } },
  { id: 'block', label: 'Block walls throughout (school style)', spec: { corridor: 'block', partition: 'block', finish: 'vct' } },
  { id: 'glass', label: 'Glass curtain wall (clear)', spec: { exterior: 'glass', window: 'glass', windowPct: 80 } },
  { id: 'basement', label: 'Add a basement level', spec: { belowGrade: 1 } },
  { id: 'soft', label: 'Acoustic tile and carpet', spec: { ceiling: 'act', finish: 'carpet' } },
  { id: 'hard', label: 'Hard ceiling and hard floors', spec: { ceiling: 'gypceil', finish: 'vct' } },
];

/** Signal lost from outside to just inside the outside wall: wall and window mix (power-averaged). */
export function facadeLossDb(s: BuildingSpec, fMHz: number): number {
  const w = Math.max(0, Math.min(100, s.windowPct)) / 100;
  const lw = matLossDb(s.exterior, fMHz), lg = matLossDb(s.window, fMHz);
  return -10 * Math.log10((1 - w) * 10 ** (-lw / 10) + w * 10 ** (-lg / 10));
}
/** Outside to the middle of the floor: facade + interior walls crossed (about one wall every 25 ft) + below grade. */
export function outsideInLossDb(s: BuildingSpec, fMHz: number, widthFt: number, opts: { belowGrade?: boolean } = {}): number {
  const walls = Math.max(0, Math.round(widthFt / 2 / 25) - 1);
  const inner = s.corridor === s.partition ? walls * matLossDb(s.partition, fMHz) : Math.max(0, walls - 1) * matLossDb(s.partition, fMHz) + (walls ? matLossDb(s.corridor, fMHz) : 0);
  return facadeLossDb(s, fMHz) + inner + (opts.belowGrade ? matLossDb('earth', fMHz) : 0);
}

/** Reverberation time (Sabine, seconds) of a space L × W × H ft with the chosen ceiling, floor finish and walls. */
export function rt60(s: BuildingSpec, L: number, W: number, H: number, interiorWallFt = 0): number {
  const V = L * W * H;
  const w = Math.max(0, Math.min(100, s.windowPct)) / 100, perim = 2 * (L + W) * H;
  const ceilA = s.ceiling === 'opendeck' ? MAT[s.roof]?.alpha ?? 0.05 : MAT[s.ceiling]?.alpha ?? 0.05;
  const A = L * W * ceilA + L * W * (MAT[s.finish]?.alpha ?? 0.03) + perim * ((1 - w) * (MAT[s.exterior]?.alpha ?? 0.05) + w * (MAT[s.window]?.alpha ?? 0.04))
    + interiorWallFt * H * 2 * (MAT[s.partition]?.alpha ?? 0.05);
  // a furnished room adds absorption: about 0.05 sabin per sq ft of floor (people, furniture)
  const furnish = 0.05 * L * W;
  return (0.049 * V) / Math.max(1, A + furnish);
}
/** What the reverberation time means for paging, sound and voice evacuation. */
export function rtAdvice(t: number): { tone: 'ok' | 'warn' | 'bad'; text: string; spacing: number } {
  if (t <= 0.8) return { tone: 'ok', text: 'Good for speech: normal speaker spacing.', spacing: 1 };
  if (t <= 1.5) return { tone: 'warn', text: 'Some echo: space speakers about 20% closer and run them at lower taps to keep speech clear (STI 0.5 for voice evacuation).', spacing: 0.8 };
  return { tone: 'bad', text: 'Long echo: speech will blur. Use more speakers closer together at low power, directional (horn or line-array) speakers aimed at the listeners, and add absorption where you can. Verify intelligibility (STI ≥ 0.5) at acceptance.', spacing: 0.65 };
}

/** Cable jacket the ceiling space needs. */
export function jacketFor(s: BuildingSpec): { copper: string; fa: string; fiber: string; coax: string; why: string } {
  return s.plenum
    ? { copper: 'CMP (plenum)', fa: 'FPLP (plenum)', fiber: 'OFNP (plenum)', coax: 'CATVP / plenum coax', why: 'The ceiling space is used for return air (NEC 300.22(C)).' }
    : { copper: 'CMR (riser) or CM', fa: 'FPLR (riser) or FPL', fiber: 'OFNR (riser)', coax: 'CATVR / riser coax', why: 'Ducted return: riser-rated cable is enough, plenum is still fine.' };
}

/** Required ratings of the main parts (typical IBC practice; the architect's code plan governs). */
export function ratingsFor(s: BuildingSpec, floors: number) {
  const shaftHr = floors >= 4 ? 2 : 1;
  return [
    { part: 'Stairs and elevator shafts', hr: s.shafts ? shaftHr : 0, why: floors >= 4 ? 'Shaft enclosures connecting 4 or more stories: 2 hours (IBC 713.4).' : 'Shafts connecting fewer than 4 stories: 1 hour (IBC 713.4).' },
    { part: 'Corridor walls', hr: s.ratedCorridor ? 1 : 0, why: s.ratedCorridor ? 'Rated corridor (IBC Table 1020.2 for the occupancy / sprinkler status).' : 'Not rated in a sprinklered building of this type (check IBC Table 1020.2).' },
    { part: 'Floors', hr: floors > 1 ? Math.min(2, MAT[s.floor]?.fireHr ?? 1) : 0, why: 'Floor/ceiling assembly rating from the construction type (IBC Table 601).' },
  ];
}
