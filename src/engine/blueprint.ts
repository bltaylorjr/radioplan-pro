// Drawing-sheet rules for permit and shop drawings: sheet sizes, architectural scales, symbols,
// sheet numbering and the NFPA 72 shop-drawing checklist.
import type { AutoResult, Device, Kind } from './autodesign';
import { KIND_LABEL } from './autodesign';
import { writeDxf, DxfEnt } from './fileformats';

export const SHEETS = {
  'ARCH D': { w: 36, h: 24, note: '24 × 36 in, the usual size for permit drawings' },
  'ARCH E1': { w: 42, h: 30, note: '30 × 42 in' },
  'ARCH C': { w: 24, h: 18, note: '18 × 24 in' },
  'ANSI D': { w: 34, h: 22, note: '22 × 34 in' },
  'ANSI B': { w: 17, h: 11, note: '11 × 17 in (half-size sets, many AHJs accept for small jobs)' },
  'Letter': { w: 11, h: 8.5, note: '8.5 × 11 in (reference only)' },
} as const;
export type SheetSize = keyof typeof SHEETS;

/** Architectural scales: inches on paper per foot of building. */
export const SCALES: { id: string; label: string; inPerFt: number }[] = [
  { id: '1/4', label: '1/4" = 1\'-0"', inPerFt: 0.25 },
  { id: '3/16', label: '3/16" = 1\'-0"', inPerFt: 0.1875 },
  { id: '1/8', label: '1/8" = 1\'-0"', inPerFt: 0.125 },
  { id: '3/32', label: '3/32" = 1\'-0"', inPerFt: 0.09375 },
  { id: '1/16', label: '1/16" = 1\'-0"', inPerFt: 0.0625 },
  { id: '1/32', label: '1/32" = 1\'-0"', inPerFt: 0.03125 },
];

/** Discipline prefix for sheet numbers (US National CAD Standard style). */
export const DISCIPLINE: Record<string, { prefix: string; title: string }> = {
  firealarm: { prefix: 'FA', title: 'Fire alarm' }, massnotif: { prefix: 'FA', title: 'Mass notification' },
  cabling: { prefix: 'T', title: 'Telecommunications' }, fiber: { prefix: 'T', title: 'Fiber optic' }, wifi: { prefix: 'T', title: 'Wireless network' },
  security: { prefix: 'SS', title: 'Intrusion detection' }, access: { prefix: 'SS', title: 'Access control' }, cctv: { prefix: 'SS', title: 'Video surveillance' }, intercom: { prefix: 'SS', title: 'Intercom' }, callbox: { prefix: 'SS', title: 'Emergency call boxes' },
  nursecall: { prefix: 'NC', title: 'Nurse call' }, paging: { prefix: 'AV', title: 'Paging' }, sound: { prefix: 'AV', title: 'Sound' },
  das: { prefix: 'RF', title: 'Distributed antenna system' }, erces: { prefix: 'RF', title: 'Emergency responder radio' },
};

/** Plan symbols: shape and tag letters, after NFPA 170 for fire alarm and common low-voltage practice. */
export const SYMBOL: Record<Kind, { shape: 'circle' | 'square' | 'triangle' | 'hex'; tag: string }> = {
  tr: { shape: 'square', tag: 'TR' }, facp: { shape: 'square', tag: 'FACP' }, smoke: { shape: 'circle', tag: 'S' }, pull: { shape: 'square', tag: 'F' }, hornstrobe: { shape: 'square', tag: 'HS' },
  speaker: { shape: 'circle', tag: 'SP' }, outlet: { shape: 'triangle', tag: '2' }, wap: { shape: 'hex', tag: 'WAP' }, camera: { shape: 'circle', tag: 'C' }, reader: { shape: 'square', tag: 'CR' },
  contact: { shape: 'circle', tag: 'DC' }, motion: { shape: 'circle', tag: 'M' }, keypad: { shape: 'square', tag: 'KP' }, intercom: { shape: 'square', tag: 'IC' }, nurse: { shape: 'circle', tag: 'NC' },
  dome: { shape: 'circle', tag: 'DL' }, das: { shape: 'hex', tag: 'A' }, donor: { shape: 'hex', tag: 'DA' }, callbox: { shape: 'square', tag: 'CB' },
};

/** Largest standard scale at which the floor fits the drawing area; falls back to the smallest. */
export function pickScale(lengthFt: number, widthFt: number, areaW: number, areaH: number) {
  return SCALES.find((s) => lengthFt * s.inPerFt <= areaW && widthFt * s.inPerFt <= areaH) ?? SCALES[SCALES.length - 1];
}
/** Drawing area left of the title block, in inches. */
export function drawArea(size: SheetSize) {
  const { w, h } = SHEETS[size]; const tb = Math.min(3.25, Math.max(2, w * 0.1)), m = w >= 24 ? 0.75 : 0.4;
  return { x: m, y: m, w: w - tb - 2 * m - 0.25, h: h - 2 * m, tb, m };
}

export interface SheetDef { no: string; title: string; kind: 'cover' | 'plan' | 'riser' | 'schedule'; floor?: number; disc: string }
/** The sheet list for a set: cover, one plan per floor per discipline, riser and schedules. */
export function sheetList(r: AutoResult, floors: number): SheetDef[] {
  const discs = [...new Set(r.devices.map((d) => DISCIPLINE[d.system]?.prefix ?? 'T'))];
  const out: SheetDef[] = [{ no: 'G-001', title: 'Cover sheet, sheet index, symbols and general notes', kind: 'cover', disc: 'G' }];
  for (const d of discs) {
    const title = [...new Set(r.devices.filter((x) => (DISCIPLINE[x.system]?.prefix ?? 'T') === d).map((x) => DISCIPLINE[x.system]?.title ?? x.system))].join(', ');
    for (let f = 0; f < floors; f++) out.push({ no: `${d}-${101 + f}`, title: `${title}: floor ${f + 1} plan`, kind: 'plan', floor: f, disc: d });
    out.push({ no: `${d}-501`, title: `${title}: riser diagram`, kind: 'riser', disc: d });
    out.push({ no: `${d}-601`, title: `${title}: schedules${d === 'FA' ? ', calculations and sequence of operations' : ''}`, kind: 'schedule', disc: d });
  }
  return out;
}
export const devicesFor = (r: AutoResult, disc: string, floor?: number): Device[] =>
  [...r.trs, ...r.devices].filter((d) => (d.kind === 'tr' || (DISCIPLINE[d.system]?.prefix ?? 'T') === disc) && (floor == null || d.floor === floor || (d.outdoor && floor === 0)));
/** Device tags like S-101, numbered per floor in plan order. */
export function tagsFor(list: Device[]): string[] {
  const n: Record<string, number> = {};
  return list.map((d) => { const t = SYMBOL[d.kind].tag; n[t] = (n[t] ?? 0) + 1; return `${t}-${(d.floor + 1) * 100 + n[t]}`; });
}

/** Items NFPA 72 (2022, 7.4) asks for in fire alarm shop drawings, and whether this set includes them. */
export const NFPA72_SHOP = [
  { item: 'Name of protected premises, owner, occupant and designer', in: 'Title block and cover' },
  { item: 'Authority having jurisdiction and applicable codes, standards and editions', in: 'Cover sheet' },
  { item: 'Type of system(s) and description', in: 'Cover sheet, general notes' },
  { item: 'Floor plans, to an indicated scale, with device locations and symbols legend', in: 'FA-1xx plans, cover legend' },
  { item: 'Riser diagram', in: 'FA-501' },
  { item: 'Sequence of operation (input/output matrix)', in: 'FA-601' },
  { item: 'Equipment and device list with listing and quantity', in: 'FA-601' },
  { item: 'Battery (secondary power) calculation', in: 'FA-601' },
  { item: 'Voltage drop calculations for notification circuits', in: 'Add from Calculators → Wire voltage drop' },
  { item: 'Candela ratings and audibility design', in: 'Set per room before submittal' },
  { item: 'Point-to-point wiring, terminal identification, circuit numbering', in: 'Add from the panel manufacturer’s software' },
  { item: 'Mounting heights and details', in: 'General notes' },
  { item: 'Designer’s qualification (NICET level or PE seal) as the AHJ requires', in: 'Seal box in the title block' },
];

export const GENERAL_NOTES = [
  'Install all work per the adopted codes and standards listed on this sheet, the manufacturer’s instructions and the AHJ.',
  'Device locations are shown for design intent. Coordinate with architectural, mechanical and lighting plans; field-verify before rough-in.',
  'Wall-mounted notification appliances: 80 to 96 in. above finished floor to the bottom of the lens (NFPA 72). Manual stations: operable part 42 to 48 in. AFF.',
  'Smoke detectors: at least 36 in. from supply air diffusers and 12 in. from lights (or per the manufacturer).',
  'All low-voltage cable: listed for the space (plenum CMP/FPLP where above ceilings used for air return). Support at 5 ft maximum; do not lay on ceiling tiles.',
  'Firestop every penetration of a fire-rated assembly with a listed system.',
  'Label all cables at both ends (TIA-606). Bond all equipment per TIA-607 and NEC.',
  'Horizontal copper links not to exceed 90 m (295 ft).',
  'Contractor to submit record (as-built) drawings at completion.',
];

/** The floor plans as a DXF drawing in feet, one layer per system, each floor offset to the right. */
export function plansDxf(r: AutoResult, lengthFt: number, widthFt: number, floors: number): string {
  const ents: DxfEnt[] = []; const layers = new Map<string, number>(); const lay = (n: string, c: number) => { layers.set(n, c); return n; };
  const COL: Record<string, number> = { FA: 1, T: 4, SS: 3, NC: 6, AV: 5, RF: 30 };
  for (let f = 0; f < floors; f++) {
    const ox = f * (lengthFt + 40), wall = lay('A-WALL', 7), txt = lay('G-ANNO', 7);
    ents.push({ t: 'line', layer: wall, x1: ox, y1: 0, x2: ox + lengthFt, y2: 0 }, { t: 'line', layer: wall, x1: ox + lengthFt, y1: 0, x2: ox + lengthFt, y2: widthFt }, { t: 'line', layer: wall, x1: ox + lengthFt, y1: widthFt, x2: ox, y2: widthFt }, { t: 'line', layer: wall, x1: ox, y1: widthFt, x2: ox, y2: 0 });
    ents.push({ t: 'text', layer: txt, x: ox, y: widthFt + 8, h: 3, s: `FLOOR ${f + 1}` });
    const list = [...r.trs, ...r.devices].filter((d) => d.floor === f || (d.outdoor && f === 0)), tags = tagsFor(list);
    list.forEach((d, i) => {
      const disc = d.kind === 'tr' ? 'T' : DISCIPLINE[d.system]?.prefix ?? 'T', L = lay(`${disc}-${d.kind.toUpperCase()}`, COL[disc] ?? 7), y = widthFt - d.y;
      ents.push({ t: 'circle', layer: L, x: ox + d.x, y, r: 1 }, { t: 'text', layer: L, x: ox + d.x + 1.4, y: y + 0.6, h: 0.9, s: tags[i] });
    });
  }
  return writeDxf([...layers].map(([name, color]) => ({ name, color })), ents);
}
export const kindTitle = (k: Kind) => KIND_LABEL[k];
