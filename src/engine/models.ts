// Layered building model shared by the 2D plan and the 3D view: building shell, walls by material,
// shafts, every system's devices, coverage (detector spacing, strobe areas, speaker cones, camera and
// motion views clipped by walls, Wi-Fi and DAS heat maps through the chosen materials), cable paths and
// circuits (home runs, SLC loops, NAC circuits, speaker zones, fiber backbone, DAS coax, conduit to call
// boxes), labels and the donor antenna aim. Everything is in feet, true scale, plan x along the length
// and y across the width. Coverage and routes follow stated rules of thumb; a designer must check them.
import type { Project } from '../types';
import { autoDesign, defaultInputs, AutoInputs, AutoResult, Device, Kind, KIND_LABEL } from './autodesign';
import { tagsFor } from './blueprint';
import { writeDxf, DxfEnt } from './fileformats';
import { specFor, BuildingSpec, MAT, matLossDb, rt60, rtAdvice, jacketFor, ratingsFor, outsideInLossDb } from './bldgmaterials';
import { SYSTEMS } from '../data/systems';
import { bearingDeg, haversineKm } from './geo';
import { planModelWalls } from './floorplan';
import { perProject } from './memo';

export const SYSTEM_COLOR: Record<string, string> = {
  cabling: '#2e7d32', fiber: '#f9a825', wifi: '#00acc1', firealarm: '#c62828', massnotif: '#ad1457', security: '#6a1b9a', access: '#ef6c00',
  cctv: '#37474f', intercom: '#3949ab', nursecall: '#d81b60', paging: '#1565c0', sound: '#0277bd', das: '#5e35b1', erces: '#4527a0', callbox: '#0d47a1',
};
export const sysLabel = (id: string) => SYSTEMS.find((s) => s.id === id)?.label ?? ({ wifi: 'Wireless network (Wi-Fi)' } as Record<string, string>)[id] ?? id;

export type SubLayer = 'dev' | 'cov' | 'cab' | 'heat';
export interface LayerDef { id: string; group: string; groupLabel: string; label: string; color: string; on: boolean; tip: string }
export interface MDevice { bld?: string; layer: string; floor: number; x: number; y: number; z: number; kind: Kind; system: string; tag: string; label: string; outdoor?: boolean; info: string }
/** A route; each point is [x, y, floor, height above that floor in ft]. */
export interface MPath { bld?: string; layer: string; pts: [number, number, number, number][]; color: string; label: string; dash?: boolean; width?: number }
export interface MArea { bld?: string; layer: string; floor: number; shape: 'circle' | 'square' | 'poly'; x: number; y: number; r: number; pts?: [number, number][]; z: number; color: string; label: string }
export interface MWall { bld?: string; layer: string; floor: number; x1: number; y1: number; x2: number; y2: number; material: string; color: string; ratedHr: number; part: string; height?: number }
export interface MHeat { bld?: string; layer: string; floor: number; nx: number; ny: number; v: Float32Array; label: string; fMHz: number; targetDbm: number; pct: number;
  /** Where the grid sits (site plans): top-left corner, size and clockwise turn. Default 0, 0, L × W, 0°. */
  ox?: number; oy?: number; w?: number; h?: number; rot?: number }
export interface MLabel { bld?: string; layer: string; floor: number; x: number; y: number; z: number; text: string }
export interface ModelScene {
  L: number; W: number; floorH: number; ceilingFt: number; floors: number; spec: BuildingSpec;
  layers: LayerDef[]; devices: MDevice[]; paths: MPath[]; areas: MArea[]; walls: MWall[]; heat: MHeat[]; labels: MLabel[];
  donor?: { x: number; y: number; bearing: number; km: number; name: string };
  stats: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad'; tip?: string }[];
  notes: string[]; r: AutoResult; firestops: number;
  /** Site plans with several buildings: each building's outline. When set, views draw these instead of one 0..L × 0..W shell. */
  footprints?: Footprint[];
}
export interface Footprint { id: string; name: string; x: number; y: number; L: number; W: number; rot: number; floors: number; floorH: number; spec: BuildingSpec }

/** How high a device sits above its floor (ft). */
export function deviceHeight(kind: Kind, ceilingFt: number, outdoor?: boolean): number {
  if (outdoor) return kind === 'callbox' ? 4 : 14;
  if (['smoke', 'speaker', 'wap', 'das', 'motion', 'camera'].includes(kind)) return Math.max(7, ceilingFt - 0.5);
  if (kind === 'dome') return 7.5;
  if (kind === 'hornstrobe') return 7.5;
  if (kind === 'pull') return 4;
  if (kind === 'tr' || kind === 'facp') return 4;
  if (kind === 'outlet') return 1.5;
  return 4;
}

function segHit(ax: number, ay: number, bx: number, by: number, w: { x1: number; y1: number; x2: number; y2: number }): number | null {
  const d = (bx - ax) * (w.y2 - w.y1) - (by - ay) * (w.x2 - w.x1); if (Math.abs(d) < 1e-9) return null;
  const t = ((w.x1 - ax) * (w.y2 - w.y1) - (w.y1 - ay) * (w.x2 - w.x1)) / d;
  const u = ((w.x1 - ax) * (by - ay) - (w.y1 - ay) * (bx - ax)) / d;
  return t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1 ? t : null;
}

/** Typical walls for each floor from the building size and the chosen materials. */
export function makeWalls(L: number, W: number, floors: number, s: BuildingSpec, x: AutoInputs): MWall[] {
  const out: MWall[] = [];
  const hasCorr = W >= 40 && !['warehouse', 'industrial', 'retail'].includes(x.bldg);
  const cy1 = W / 2 - 4, cy2 = W / 2 + 4;
  const roomW = x.bldg === 'school' ? 30 : x.bldg === 'healthcare' || x.bldg === 'hotel' || x.bldg === 'multifamily' ? 14 : 20;
  for (let f = 0; f < floors; f++) {
    // outside walls: solid with window bands (every 10 ft, windowPct of each bay is glass)
    const edge = (x1: number, y1: number, x2: number, y2: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(len / 10)), g = Math.max(0, Math.min(1, s.windowPct / 100));
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n, m1 = a + ((1 - g) / 2) * (b - a), m2 = b - ((1 - g) / 2) * (b - a);
        const P = (t: number) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
        const seg = (t1: number, t2: number, mat: string, part: string) => { if (t2 - t1 < 1e-6) return; const [p1x, p1y] = P(t1), [p2x, p2y] = P(t2); out.push({ layer: 'base:walls', floor: f, x1: p1x, y1: p1y, x2: p2x, y2: p2y, material: mat, color: MAT[mat]?.color ?? '#555', ratedHr: 0, part }); };
        if (g <= 0.01) seg(a, b, s.exterior, 'Outside wall');
        else { seg(a, m1, s.exterior, 'Outside wall'); seg(m1, m2, s.window, 'Window'); seg(m2, b, s.exterior, 'Outside wall'); }
      }
    };
    edge(0, 0, L, 0); edge(L, 0, L, W); edge(L, W, 0, W); edge(0, W, 0, 0);
    const rated = s.ratedCorridor ? 1 : 0;
    if (hasCorr) {
      // corridor walls with a door to each room
      for (const cy of [cy1, cy2]) for (let xr = 0; xr < L; xr += roomW) {
        const x2 = Math.min(L, xr + roomW), door = Math.min(3, (x2 - xr) / 3);
        out.push({ layer: 'base:walls', floor: f, x1: xr, y1: cy, x2: x2 - door - 1, y2: cy, material: s.corridor, color: MAT[s.corridor]?.color ?? '#999', ratedHr: rated, part: 'Corridor wall' });
        out.push({ layer: 'base:walls', floor: f, x1: x2 - door - 1, y1: cy, x2: x2 - 1, y2: cy, material: s.door, color: MAT[s.door]?.color ?? '#a1887f', ratedHr: rated ? 0.33 : 0, part: 'Door' });
        if (x2 - 1 < x2) out.push({ layer: 'base:walls', floor: f, x1: x2 - 1, y1: cy, x2, y2: cy, material: s.corridor, color: MAT[s.corridor]?.color ?? '#999', ratedHr: rated, part: 'Corridor wall' });
      }
      // room partitions from the corridor to the outside walls
      for (let xr = roomW; xr < L - 1; xr += roomW) {
        out.push({ layer: 'base:walls', floor: f, x1: xr, y1: 0, x2: xr, y2: cy1, material: s.partition, color: MAT[s.partition]?.color ?? '#999', ratedHr: ['multifamily', 'hotel'].includes(x.bldg) ? 1 : 0, part: 'Room wall' });
        out.push({ layer: 'base:walls', floor: f, x1: xr, y1: cy2, x2: xr, y2: W, material: s.partition, color: MAT[s.partition]?.color ?? '#999', ratedHr: ['multifamily', 'hotel'].includes(x.bldg) ? 1 : 0, part: 'Room wall' });
      }
    } else if (L > 60) {
      // open floor: an office / support strip at one end
      out.push({ layer: 'base:walls', floor: f, x1: 30, y1: 0, x2: 30, y2: W * 0.4, material: s.partition, color: MAT[s.partition]?.color ?? '#999', ratedHr: 0, part: 'Room wall' });
      out.push({ layer: 'base:walls', floor: f, x1: 0, y1: W * 0.4, x2: 30, y2: W * 0.4, material: s.partition, color: MAT[s.partition]?.color ?? '#999', ratedHr: 0, part: 'Room wall' });
    }
  }
  return out;
}

/** Stair and elevator shafts (plan boxes, present on every floor). */
export function shaftBoxes(L: number, W: number, s: BuildingSpec, floors: number): { x: number; y: number; w: number; h: number; material: string; part: string; ratedHr: number }[] {
  if (!s.shafts) return [];
  const hr = floors >= 4 ? 2 : 1, out = [];
  if (s.stair !== 'none') { out.push({ x: 2, y: 2, w: 10, h: 18, material: s.stair, part: 'Stair', ratedHr: hr }); if (L > 120) out.push({ x: L - 12, y: W - 20, w: 10, h: 18, material: s.stair, part: 'Stair', ratedHr: hr }); }
  if (s.elevator !== 'none' && floors > 1) out.push({ x: L / 2 + 10, y: W / 2 + 5, w: 8, h: 8, material: s.elevator, part: 'Elevator', ratedHr: hr });
  return out;
}

/** Wall walls from the Indoor Coverage drawing (metres), stretched to the building footprint. */
export function indoorWallsAsFt(p: Project, L: number, W: number, floors: number): MWall[] {
  const d = p.indoor; if (!d?.walls?.length) return [];
  const sx = L / Math.max(1, d.widthM), sy = W / Math.max(1, d.heightM); const out: MWall[] = [];
  const map: Record<string, string> = { drywall: 'drywall', wood: 'wood', glass: 'glass', lowe: 'lowe', brick: 'brick', block: 'block', concrete: 'concrete', metal: 'metalpanel' };
  for (let f = 0; f < floors; f++) for (const w of d.walls) { const m = map[w.material] ?? 'drywall'; out.push({ layer: 'base:walls', floor: f, x1: w.x1 * sx, y1: w.y1 * sy, x2: w.x2 * sx, y2: w.y2 * sy, material: m, color: MAT[m].color, ratedHr: 0, part: 'Wall (your drawing)' }); }
  return out;
}

const greedyChain = <T extends { x: number; y: number }>(start: { x: number; y: number }, items: T[]): T[] => {
  const left = [...items], out: T[] = []; let c: { x: number; y: number } = start;
  while (left.length) { let bi = 0, bd = Infinity; left.forEach((d, i) => { const dd = Math.abs(d.x - c.x) + Math.abs(d.y - c.y); if (dd < bd) { bd = dd; bi = i; } }); const n = left.splice(bi, 1)[0]; c = n; out.push(n); }
  return out;
};

export interface ModelOptions { wallsFrom?: 'typical' | 'indoor' | 'plan'; spec?: Partial<BuildingSpec> }
/** Whether the project has an imported floor plan in its plan and build (Floor Plan to 2D / 3D). */
export const hasPlanWalls = (p: Project) => !!p.floorPlans?.some((f) => f.integrated && f.scale.ftPerPx);

/** The layered model of the building (cached for each version of the project). */
export const buildModel = perProject((p: Project, opts: ModelOptions = {}): ModelScene => buildModelNow(p, opts), (opts?: ModelOptions) => JSON.stringify(opts ?? {}));
function buildModelNow(p: Project, opts: ModelOptions = {}): ModelScene {
  const x: AutoInputs = { ...defaultInputs(), ...(p.autoDesign ?? {}) };
  const r = autoDesign(p, x);
  const L = Math.max(20, x.lengthFt), W = Math.max(20, x.widthFt), FH = Math.max(8, x.floorHeightFt), CF = Math.max(7, Math.min(FH - 1, x.ceilingFt)), F = Math.max(1, Math.round(x.floors));
  const spec = { ...specFor(p.buildingMaterials, x.bldg), ...(opts.spec ?? {}) };
  const layers: LayerDef[] = []; const add = (l: LayerDef) => { if (!layers.some((v) => v.id === l.id)) layers.push(l); };
  const base = (id: string, label: string, on: boolean, tip: string, color = '#546e7a') => add({ id: 'base:' + id, group: 'base', groupLabel: 'Building', label, color, on, tip });
  base('shell', 'Floors and outline', true, 'Floor slabs, outside outline and the ground around the building.');
  base('walls', 'Walls, windows and doors', true, 'Coloured by the material you picked. Fire-rated walls are drawn thicker.');
  base('shafts', 'Stairs and elevator', true, 'Rated shafts that run through every floor.');
  base('labels', 'Labels and tags', false, 'Device tags (S-101, WAP-201…) and room names.');
  base('dims', 'Dimensions, scale and north', true, 'Overall size, a scale bar and the north arrow. Everything is drawn to true scale.');
  base('site', 'Site, parking and outdoor', true, 'Ground, parking area and outdoor equipment.');
  const sl = (sys: string, sub: SubLayer, label: string, on: boolean, tip: string) => add({ id: `${sys}:${sub}`, group: sys, groupLabel: sysLabel(sys), label, color: SYSTEM_COLOR[sys] ?? '#555', on, tip });

  // walls
  const from = opts.wallsFrom ?? (hasPlanWalls(p) ? 'plan' : 'typical');
  let walls: MWall[] = from === 'indoor' ? indoorWallsAsFt(p, L, W, F) : from === 'plan' ? planModelWalls(p.floorPlans ?? [], spec, MAT) : [];
  const fromPlan = from === 'plan' && walls.length > 0;
  if (!walls.length) walls = makeWalls(L, W, F, spec, x);
  const shafts = fromPlan ? [] : shaftBoxes(L, W, spec, F);
  for (let f = 0; f < F; f++) for (const s of shafts) {
    const c: [number, number][] = [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]];
    c.forEach((a, i) => { const b = c[(i + 1) % 4]; walls.push({ layer: 'base:shafts', floor: f, x1: a[0], y1: a[1], x2: b[0], y2: b[1], material: s.material, color: MAT[s.material]?.color ?? '#333', ratedHr: s.ratedHr, part: s.part }); });
  }
  const labels: MLabel[] = [];
  for (const s of shafts) for (let f = 0; f < F; f++) labels.push({ layer: 'base:labels', floor: f, x: s.x + s.w / 2, y: s.y + s.h / 2, z: 4, text: s.part === 'Stair' ? 'STAIR' : 'ELEV' });

  // devices
  const all = [...r.trs, ...r.devices]; const tagsByFloor = new Map<number, string[]>();
  const devices: MDevice[] = [];
  for (let f = 0; f < F; f++) {
    const list = all.filter((d) => d.floor === f); const tags = tagsFor(list);
    list.forEach((d, i) => {
      const sys = d.kind === 'tr' ? 'cabling' : d.system;
      sl(sys, 'dev', 'Devices', true, 'Every device the design placed, with its tag.');
      devices.push({ layer: `${sys}:dev`, floor: f, x: d.x, y: d.y, z: deviceHeight(d.kind, CF, d.outdoor), kind: d.kind, system: sys, tag: tags[i], label: KIND_LABEL[d.kind], outdoor: d.outdoor, info: `${KIND_LABEL[d.kind]} · ${sysLabel(sys)} · floor ${f + 1}${d.outdoor ? ' (outside)' : ''}` });
    });
    tagsByFloor.set(f, tags);
  }

  // coverage
  const areas: MArea[] = [];
  const opaque = (wl: MWall, pir: boolean) => !(MAT[wl.material]?.seeThrough && !pir) && wl.part !== 'Door';
  const viewPoly = (d: MDevice, dir: number, spread: number, range: number, pir: boolean): [number, number][] => {
    const ws = walls.filter((w) => w.floor === d.floor && opaque(w, pir)); const pts: [number, number][] = [[d.x, d.y]];
    for (let a = -spread / 2; a <= spread / 2 + 1e-6; a += spread / 24) {
      const t = ((dir + a) * Math.PI) / 180, ex = d.x + Math.cos(t) * range, ey = d.y + Math.sin(t) * range; let best = 1;
      if (!d.outdoor) for (const w of ws) { const h = segHit(d.x + Math.cos(t) * 0.6, d.y + Math.sin(t) * 0.6, ex, ey, w); if (h != null && h < best) best = h; }
      pts.push([d.x + Math.cos(t) * 0.6 + (ex - d.x - Math.cos(t) * 0.6) * best, d.y + Math.sin(t) * 0.6 + (ey - d.y - Math.sin(t) * 0.6) * best]);
    }
    return pts;
  };
  const aimOf = (d: MDevice): number => {
    if (d.outdoor) return (Math.atan2(W / 2 - d.y, L / 2 - d.x) * 180) / Math.PI;
    if (d.y <= 3) return d.kind === 'camera' ? -90 : 90; if (d.y >= W - 3) return d.kind === 'camera' ? 90 : -90;
    if (d.x <= 3) return d.kind === 'camera' ? 180 : 0; if (d.x >= L - 3) return d.kind === 'camera' ? 0 : 180;
    return d.x < L / 2 ? 0 : 180;
  };
  const rt = rt60(spec, Math.min(L, 60), Math.min(W, 40), CF, 0);
  const adv = rtAdvice(rt);
  for (const d of devices) {
    const lay = (sub: SubLayer, label: string, tip: string, on = true) => { sl(d.system, sub, label, on, tip); return `${d.system}:${sub}`; };
    if (d.kind === 'smoke') areas.push({ layer: lay('cov', 'Coverage', 'Circle of radius 0.7 × 30 ft spacing = 21 ft (NFPA 72 smooth ceiling). Beams, high or sloped ceilings change this.'), floor: d.floor, shape: 'circle', x: d.x, y: d.y, r: 21, z: 0.15, color: SYSTEM_COLOR.firealarm, label: 'Smoke detector coverage, 21 ft radius' });
    if (d.kind === 'hornstrobe') areas.push({ layer: lay('cov', 'Coverage', 'Square area each strobe lights at the design spacing. Pick the candela from the NFPA 72 room-size tables.'), floor: d.floor, shape: 'square', x: d.x, y: d.y, r: 25, z: 0.2, color: '#ff7043', label: 'Strobe coverage area 50 × 50 ft' });
    if (d.kind === 'speaker') { const rr = Math.max(5, (CF - 5) * Math.tan(Math.PI / 3)) * adv.spacing; areas.push({ layer: lay('cov', 'Coverage', `Ear-height circle of a ceiling speaker with 120° spread: (ceiling − 5 ft) × tan 60°${adv.spacing < 1 ? ', reduced for the echo of the chosen materials' : ''}.`), floor: d.floor, shape: 'circle', x: d.x, y: d.y, r: rr, z: 0.25, color: SYSTEM_COLOR[d.system] ?? '#1e88e5', label: `Speaker coverage, ${rr.toFixed(0)} ft radius at ear height` }); }
    if (d.kind === 'camera') { const range = d.outdoor ? 90 : 45; areas.push({ layer: lay('cov', 'Coverage', 'Each camera\'s field of view (90°, about 45 ft inside and 90 ft outside for face/plate detail with a typical lens), stopped by walls that cameras cannot see through.'), floor: d.floor, shape: 'poly', x: d.x, y: d.y, r: range, pts: viewPoly(d, aimOf(d), 90, range, false), z: 0.3, color: '#455a64', label: `Camera view ${range} ft` }); }
    if (d.kind === 'motion') areas.push({ layer: lay('cov', 'Coverage', 'Typical PIR pattern 90° × 35 ft. PIR cannot see through glass or walls.'), floor: d.floor, shape: 'poly', x: d.x, y: d.y, r: 35, pts: viewPoly(d, aimOf(d), 90, 35, true), z: 0.3, color: SYSTEM_COLOR.security, label: 'Motion detector view 35 ft' });
    if (d.kind === 'reader' || d.kind === 'contact') areas.push({ layer: lay('cov', 'Coverage', 'Door swing at each controlled or monitored door.'), floor: d.floor, shape: 'circle', x: d.x, y: d.y, r: 3, z: 0.1, color: SYSTEM_COLOR[d.system], label: 'Controlled door' });
  }

  // heat maps: Wi-Fi and DAS through the chosen walls and floors
  const heat: MHeat[] = [];
  const heatFor = (sys: string, kinds: Kind[], fMHz: number, eirp: number, target: number, label: string) => {
    const ants = devices.filter((d) => kinds.includes(d.kind) && d.system === sys && !d.outdoor); if (!ants.length) return;
    sl(sys, 'heat', 'Signal heat map', !heat.length, `Predicted ${label} signal at ${fMHz} MHz: free-space loss plus every wall and floor it passes through, using the materials you picked. Target ${target} dBm.`);
    const nx = 64, ny = Math.max(8, Math.round((64 * W) / L));
    for (let f = 0; f < F; f++) {
      const v = new Float32Array(nx * ny); let ok = 0; const ws = walls.filter((w) => w.floor === f).map((w) => ({ ...w, loss: matLossDb(w.material, fMHz) }));
      const floorLoss = matLossDb(spec.floor, fMHz);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const px = ((i + 0.5) / nx) * L, py = ((j + 0.5) / ny) * W; let best = -200;
        for (const a of ants) {
          const nf = Math.abs(a.floor - f); if (nf > 2) continue;
          const dm = Math.max(1, Math.hypot(px - a.x, py - a.y, nf * FH) * 0.3048);
          let loss = 20 * Math.log10(fMHz) + 20 * Math.log10(dm) - 27.55 + nf * floorLoss;
          if (nf === 0) for (const w of ws) if (segHit(a.x, a.y, px, py, w) != null) loss += w.loss;
          if (nf > 0) loss += 6; // walls on the way, not traced on other floors
          best = Math.max(best, eirp - loss);
        }
        v[j * nx + i] = best; if (best >= target) ok++;
      }
      heat.push({ layer: `${sys}:heat`, floor: f, nx, ny, v, label, fMHz, targetDbm: target, pct: (ok / (nx * ny)) * 100 });
    }
  };
  heatFor('wifi', ['wap'], 5180, 20, -67, 'Wi-Fi 5 GHz');
  const dasSys = devices.some((d) => d.system === 'erces') ? 'erces' : 'das';
  const e = p.erces; const dasEirp = Math.min(20, Math.max(0, (e?.bdaMaxOutputDbm ?? 27) - (e?.dasCableLossDb ?? 6) - (e?.splitterLossDb ?? 7) + (e?.indoorAntGainDbi ?? 2)));
  heatFor(dasSys, ['das'], dasSys === 'erces' ? 800 : 1900, dasEirp, dasSys === 'erces' ? -95 : -85, dasSys === 'erces' ? 'Public-safety radio 800 MHz' : 'Cellular 1900 MHz');

  // cable routes
  const paths: MPath[] = [];
  const trs = devices.filter((d) => d.kind === 'tr');
  const corrY = W / 2; const zc = CF + 1;
  const nearTr = (d: MDevice) => trs.filter((t) => t.floor === d.floor).reduce((b, t) => (Math.abs(t.x - d.x) + Math.abs(t.y - d.y) < Math.abs(b.x - d.x) + Math.abs(b.y - d.y) ? t : b), trs[0]);
  const homeRun = (d: MDevice, layer: string, color: string, label: string) => {
    const t = nearTr(d); if (!t) return;
    if (d.outdoor) { const ex = Math.max(0, Math.min(L, d.x)), ey = Math.max(0, Math.min(W, d.y)); paths.push({ layer, pts: [[d.x, d.y, 0, -2], [ex, ey, 0, -2], [ex, ey, 0, zc], [ex, corrY, 0, zc], [t.x, corrY, 0, zc], [t.x, t.y, 0, zc]], color, label: label + ' (underground conduit, then ceiling)', dash: true }); return; }
    paths.push({ layer, pts: [[d.x, d.y, d.floor, d.z], [d.x, d.y, d.floor, zc], [d.x, corrY, d.floor, zc], [t.x, corrY, d.floor, zc], [t.x, t.y, d.floor, zc], [t.x, t.y, d.floor, t.z + 3]], color, label, width: 0.6 });
  };
  for (const d of devices) {
    if (['outlet', 'wap', 'camera', 'reader', 'intercom', 'callbox'].includes(d.kind) || (['contact', 'motion', 'keypad'].includes(d.kind))) {
      const what = { outlet: 'Cat 6 home run (2 cables)', wap: 'Cat 6A home run', camera: 'Cat 6 home run (PoE)', reader: 'Composite access cable to the controller', intercom: 'Cat 6 home run', callbox: 'Conduit and cable to the head-end', contact: '22/2 zone cable to the panel', motion: '22/4 zone cable to the panel', keypad: '22/4 keypad bus' } as Record<string, string>;
      sl(d.system, 'cab', 'Cable runs', false, 'Home runs from each device up into the ceiling, along the corridor and back to the telecom room or panel.');
      homeRun(d, `${d.system}:cab`, SYSTEM_COLOR[d.system] ?? '#555', what[d.kind] ?? 'Cable');
    }
  }
  // fire alarm SLC and NAC, mass notification speaker circuits
  const facp = devices.find((d) => d.kind === 'facp');
  if (facp) {
    const riser = { x: facp.x + 2, y: facp.y };
    sl('firealarm', 'cab', 'SLC loop and NAC circuits', false, 'Signaling line circuit (SLC) through every detector and pull station, and notification circuits (NAC) of up to 12 horn/strobes each, on every floor through the riser.');
    const slc: [number, number, number, number][] = [[facp.x, facp.y, 0, facp.z + 2]];
    for (let f = 0; f < F; f++) {
      slc.push([riser.x, riser.y, f, zc]);
      for (const d of greedyChain(riser, devices.filter((v) => v.floor === f && ['smoke', 'pull'].includes(v.kind)))) slc.push([d.x, d.y, f, zc], [d.x, d.y, f, d.z], [d.x, d.y, f, zc]);
      slc.push([riser.x, riser.y, f, zc]);
      const ns = greedyChain(riser, devices.filter((v) => v.floor === f && v.kind === 'hornstrobe'));
      for (let k = 0; k < ns.length; k += 12) {
        const grp = ns.slice(k, k + 12); const pts: [number, number, number, number][] = [[facp.x, facp.y, 0, facp.z + 2], [riser.x, riser.y, 0, zc], [riser.x, riser.y, f, zc]];
        for (const d of grp) pts.push([d.x, d.y, f, zc], [d.x, d.y, f, d.z], [d.x, d.y, f, zc]);
        paths.push({ layer: `${ns[0].system}:cab`, pts, color: '#ff7043', label: `NAC ${f + 1}.${k / 12 + 1}: ${grp.length} horn/strobes`, dash: true });
        sl(ns[0].system, 'cab', ns[0].system === 'massnotif' ? 'Speaker and strobe circuits' : 'SLC loop and NAC circuits', false, 'Notification circuits.');
      }
    }
    paths.push({ layer: 'firealarm:cab', pts: slc, color: SYSTEM_COLOR.firealarm, label: 'SLC loop (Class B) through every detector and pull station', width: 0.9 });
  }
  // speakers: 70 V zones per floor
  for (const sys of ['paging', 'sound', 'massnotif']) for (let f = 0; f < F; f++) {
    const sp = devices.filter((d) => d.system === sys && d.kind === 'speaker' && d.floor === f); if (!sp.length) continue;
    const start = sys === 'massnotif' && facp ? { x: facp.x + 2, y: facp.y } : trs.find((t) => t.floor === f) ?? sp[0];
    sl(sys, 'cab', sys === 'massnotif' ? 'Speaker and strobe circuits' : 'Speaker zones (70 V)', false, 'Speakers daisy-chained on one 70 V circuit per floor zone (up to 20 per circuit).');
    const ch = greedyChain(start, sp);
    for (let k = 0; k < ch.length; k += 20) {
      const pts: [number, number, number, number][] = [[start.x, start.y, f, zc]];
      for (const d of ch.slice(k, k + 20)) pts.push([d.x, d.y, f, zc], [d.x, d.y, f, d.z], [d.x, d.y, f, zc]);
      paths.push({ layer: `${sys}:cab`, pts, color: SYSTEM_COLOR[sys], label: `${sysLabel(sys)} zone ${f + 1}.${k / 20 + 1}: ${Math.min(20, ch.length - k)} speakers` });
    }
  }
  // nurse call bus along the corridor
  for (let f = 0; f < F; f++) {
    const nc = devices.filter((d) => d.system === 'nursecall' && d.floor === f); if (!nc.length) continue;
    const t = trs.find((v) => v.floor === f) ?? nc[0]; const pts: [number, number, number, number][] = [[t.x, t.y, f, zc]];
    for (const d of greedyChain(t, nc)) pts.push([d.x, d.y, f, zc], [d.x, d.y, f, d.z], [d.x, d.y, f, zc]);
    sl('nursecall', 'cab', 'Nurse call bus', false, 'Station and dome-light bus from the controller in the telecom room.');
    paths.push({ layer: 'nursecall:cab', pts, color: SYSTEM_COLOR.nursecall, label: `Nurse call bus, floor ${f + 1}` });
  }
  // backbone: TR to TR on each floor, and the riser through the floors
  if (trs.length > 1) {
    const bsys = r.devices.some((d) => d.system === 'fiber') || (p.meta.subSystems ?? []).includes('fiber') || p.meta.projectType === 'fiber' ? 'fiber' : 'cabling';
    sl(bsys, 'cab', bsys === 'fiber' ? 'Fiber backbone and riser' : 'Backbone and riser', false, 'Backbone cable from the main telecom room to every other telecom room, through the riser sleeves at each floor.');
    const main = trs[0];
    for (const t of trs.slice(1)) paths.push({ layer: `${bsys}:cab`, pts: [[main.x, main.y, 0, main.z + 3], [main.x, main.y, 0, zc], [main.x, main.y, t.floor, zc], [t.x, corrY, t.floor, zc], [t.x, t.y, t.floor, t.z + 3]], color: SYSTEM_COLOR.fiber, label: `Backbone MDF → TR on floor ${t.floor + 1}`, width: 1.4 });
  }
  // DAS coax: head-end, riser, antennas, roof donor
  const das = devices.filter((d) => d.kind === 'das' || d.kind === 'donor');
  if (das.length) {
    const sys = das[0].system, he = trs[0];
    sl(sys, 'cab', 'Coax, splitters and riser', false, 'Coax from the BDA in the head-end room up the riser, splitting to each antenna; the donor cable runs to the roof antenna.');
    for (let f = 0; f < F; f++) {
      const fl = das.filter((d) => d.kind === 'das' && d.floor === f); if (!fl.length) continue;
      const pts: [number, number, number, number][] = [[he.x, he.y, 0, he.z + 3], [he.x, he.y, 0, zc], [he.x, he.y, f, zc]];
      for (const d of greedyChain(he, fl)) pts.push([d.x, d.y, f, zc], [d.x, d.y, f, d.z]);
      paths.push({ layer: `${sys}:cab`, pts, color: SYSTEM_COLOR[sys], label: `DAS coax, floor ${f + 1}: ${fl.length} antennas` });
    }
    const dn = das.find((d) => d.kind === 'donor');
    if (dn) paths.push({ layer: `${sys}:cab`, pts: [[he.x, he.y, 0, he.z + 3], [he.x, he.y, 0, zc], [he.x, he.y, F - 1, zc], [dn.x, dn.y, F - 1, zc], [dn.x, dn.y, F - 1, FH + 6]], color: '#311b92', label: 'Donor cable to the roof antenna (1/2 in plenum coax, grounded at entry)', width: 1.2 });
  }

  // donor aim from the ERCES page
  let donor: ModelScene['donor'];
  const site = p.sites?.[0];
  if (site && e?.donorLat != null && e?.donorLon != null) {
    const brg = bearingDeg({ lat: site.lat, lon: site.lon }, { lat: e.donorLat, lon: e.donorLon }), km = haversineKm({ lat: site.lat, lon: site.lon }, { lat: e.donorLat, lon: e.donorLon });
    const dn = devices.find((d) => d.kind === 'donor');
    donor = { x: dn?.x ?? L - 10, y: dn?.y ?? 10, bearing: brg, km, name: e.donorName || 'Donor tower' };
    add({ id: 'rf:donor', group: 'rf', groupLabel: 'Outdoor radio', label: 'Donor antenna aim', color: '#311b92', on: true, tip: 'Arrow from the roof donor antenna toward the public-safety tower set on the ERCES page.' });
  }

  // firestops: cable paths crossing rated walls, plus one sleeve per floor per system riser
  let firestops = 0; const ratedWalls = walls.filter((w) => w.ratedHr > 0.4);
  for (const pa of paths) for (let i = 1; i < pa.pts.length; i++) {
    const [ax, ay, af] = pa.pts[i - 1], [bx, by, bf] = pa.pts[i];
    if (af !== bf) { firestops += Math.abs(bf - af); continue; }
    for (const w of ratedWalls) if (w.floor === af && segHit(ax, ay, bx, by, w) != null) firestops++;
  }
  const riserSystems = new Set(paths.filter((pa) => pa.pts.some((q) => q[2] > 0)).map((pa) => pa.layer.split(':')[0])).size;

  // stats
  const stats: ModelScene['stats'] = [];
  for (const h of heat) if (h.floor === 0) { const avg = heat.filter((v) => v.layer === h.layer).reduce((s, v) => s + v.pct, 0) / F; stats.push({ label: `${h.label} area ≥ ${h.targetDbm} dBm`, value: `${avg.toFixed(0)} %`, tone: avg >= 95 ? 'ok' : avg >= 85 ? 'warn' : 'bad', tip: 'Average of all floors, through the chosen walls and floors.' }); }
  const outIn = outsideInLossDb(spec, 800, W);
  stats.push({ label: 'Outside signal lost reaching mid-floor (800 MHz)', value: `${outIn.toFixed(0)} dB`, tone: outIn < 15 ? 'ok' : outIn < 25 ? 'warn' : 'bad', tip: 'Outside wall and window mix plus the inside walls to the middle of the floor. Over about 15–20 dB usually means a BDA/DAS for public-safety radio.' });
  if (spec.belowGrade > 0) { const bg = outIn + matLossDb('earth', 800); stats.push({ label: 'Outside signal lost reaching the level below ground (800 MHz)', value: `${bg.toFixed(0)} dB`, tone: 'bad', tip: 'Below-grade levels need their own DAS antennas for public-safety radio.' }); }
  stats.push({ label: 'Echo (reverberation) in a typical room', value: `${rt.toFixed(1)} s`, tone: adv.tone, tip: adv.text });
  stats.push({ label: 'Firestop penetrations (estimate)', value: String(firestops), tip: 'Cable paths crossing fire-rated walls plus every floor crossing. Each needs a listed firestop system.' });
  const jk = jacketFor(spec);
  const notes = [
    `Cable jacket: ${jk.copper} copper, ${jk.fa} fire alarm, ${jk.fiber} fiber, ${jk.coax}. ${jk.why}`,
    ...ratingsFor(spec, F).filter((v) => v.hr > 0).map((v) => `${v.part}: ${v.hr}-hour. ${v.why}`),
    `Sound: ${adv.text}`,
    riserSystems ? `${riserSystems} system${riserSystems > 1 ? 's' : ''} pass through the floors: plan riser sleeves and firestop at each floor.` : '',
    spec.belowGrade > 0 ? `${spec.belowGrade} level${spec.belowGrade > 1 ? 's' : ''} below grade: outside signal there drops by another ${matLossDb('earth', 800).toFixed(0)} dB at 800 MHz, so public-safety radio needs DAS antennas on those levels.` : '',
    'Cameras are stopped by solid walls; motion sensors are also stopped by glass.',
  ].filter(Boolean);
  // dims and site: drawn by the views from L, W
  return { L, W, floorH: FH, ceilingFt: CF, floors: F, spec, layers, devices, paths, areas, walls, heat, labels, donor, stats, notes, r, firestops };
}

/** Group the layers for the layer panel, in a stable order: building first, then each system. */
export function layerGroups(s: ModelScene): { id: string; label: string; color: string; layers: LayerDef[] }[] {
  const out: { id: string; label: string; color: string; layers: LayerDef[] }[] = [];
  for (const l of s.layers) { let g = out.find((v) => v.id === l.group); if (!g) { g = { id: l.group, label: l.groupLabel, color: l.group === 'base' ? '#546e7a' : l.color, layers: [] }; out.push(g); } g.layers.push(l); }
  return out;
}
export const deviceList = (s: ModelScene): Device[] => [...s.r.trs, ...s.r.devices];

/** The model as a DXF drawing in feet with one CAD layer per app layer (and per wall material); floors side by side. */
export function modelDxf(s: ModelScene): string {
  const ents: DxfEnt[] = []; const layers = new Map<string, number>();
  const COL: Record<string, number> = { base: 7, firealarm: 1, massnotif: 6, cabling: 3, fiber: 2, wifi: 4, security: 6, access: 30, cctv: 8, intercom: 5, nursecall: 6, paging: 5, sound: 5, das: 200, erces: 200, callbox: 5, rf: 200 };
  const lay = (id: string, extra = '') => { const n = (id.replace(':', '-') + extra).toUpperCase(); layers.set(n, COL[id.split(':')[0]] ?? 7); return n; };
  const ox = (f: number) => f * (s.L + 60), Y = (y: number) => s.W - y;
  for (let f = 0; f < s.floors; f++) {
    const t = lay('base:labels');
    ents.push({ t: 'text', layer: t, x: ox(f), y: s.W + 10, h: 4, s: `FLOOR ${f + 1}` });
    for (const w of s.walls.filter((v) => v.floor === f)) ents.push({ t: 'line', layer: lay(w.layer, '-' + w.material + (w.ratedHr >= 1 ? `-${w.ratedHr}HR` : '')), x1: ox(f) + w.x1, y1: Y(w.y1), x2: ox(f) + w.x2, y2: Y(w.y2) });
    for (const a of s.areas.filter((v) => v.floor === f)) {
      const L = lay(a.layer);
      if (a.shape === 'circle') ents.push({ t: 'circle', layer: L, x: ox(f) + a.x, y: Y(a.y), r: a.r });
      else { const pts: [number, number][] = a.shape === 'square' ? [[a.x - a.r, a.y - a.r], [a.x + a.r, a.y - a.r], [a.x + a.r, a.y + a.r], [a.x - a.r, a.y + a.r]] : a.pts ?? []; pts.forEach((q, i) => { const n = pts[(i + 1) % pts.length]; ents.push({ t: 'line', layer: L, x1: ox(f) + q[0], y1: Y(q[1]), x2: ox(f) + n[0], y2: Y(n[1]) }); }); }
    }
    for (const pa of s.paths) for (let i = 1; i < pa.pts.length; i++) { const a = pa.pts[i - 1], b = pa.pts[i]; if (a[2] === f && b[2] === f && (a[0] !== b[0] || a[1] !== b[1])) ents.push({ t: 'line', layer: lay(pa.layer), x1: ox(f) + a[0], y1: Y(a[1]), x2: ox(f) + b[0], y2: Y(b[1]) }); }
    for (const d of s.devices.filter((v) => v.floor === f)) { const L = lay(d.layer); ents.push({ t: 'circle', layer: L, x: ox(f) + d.x, y: Y(d.y), r: 1 }, { t: 'text', layer: lay('base:labels'), x: ox(f) + d.x + 1.4, y: Y(d.y) + 0.6, h: 0.9, s: d.tag }); }
  }
  return writeDxf([...layers].map(([name, color]) => ({ name, color })), ents);
}
