// Multi-building sites (campuses): several buildings on one site plan, each with its own size, floors,
// type and materials, the links between them (underground or aerial fiber and copper, conduit, wireless
// bridges), one site-wide layered model, outdoor signal around the buildings, a cable schedule and a
// campus materials list. Positions are feet east (x) and south (y) of the main building's top-left
// corner, with north up; turns are clockwise degrees. Routes and quantities are starting estimates.
import type { Project } from '../types';
import { defaultInputs, AutoInputs, autoDesign, BldgType, Rec } from './autodesign';
import { buildModel, ModelScene, MHeat, LayerDef, Footprint, SYSTEM_COLOR } from './models';
import { BuildingSpec, specFor, facadeLossDb, matLossDb } from './bldgmaterials';

export interface CampusBuilding {
  id: string; name: string; x: number; y: number; rot: number;
  inputs: Partial<AutoInputs>; materials?: Partial<BuildingSpec>;
}
export type LinkKind = 'fiber-ug' | 'fiber-aerial' | 'copper-ug' | 'conduit' | 'wireless';
export interface CampusLink { id: string; from: string; to: string; kind: LinkKind; strands: number; fMHz?: number; notes?: string }
export interface Campus { main: { name: string; x: number; y: number; rot: number }; buildings: CampusBuilding[]; links: CampusLink[] }

export const LINK_KIND: Record<LinkKind, { label: string; color: string; z: number; dash: boolean; what: string }> = {
  'fiber-ug': { label: 'Fiber, underground in conduit', color: '#f9a825', z: -3, dash: true, what: 'Single-mode OSP fiber (armored or dielectric, gel-free) in 2 in HDPE conduit with innerduct' },
  'fiber-aerial': { label: 'Fiber, aerial on poles', color: '#fbc02d', z: 22, dash: false, what: 'Single-mode ADSS or lashed fiber on messenger strand, poles every 150 ft' },
  'copper-ug': { label: 'Copper, underground in conduit', color: '#6d4c41', z: -3, dash: true, what: 'OSP copper (gel-filled) with primary protectors at each building entry (NEC 800.90)' },
  'conduit': { label: 'Empty conduit (for later)', color: '#78909c', z: -3, dash: true, what: '2 in HDPE or Schedule 40 PVC with pull tape' },
  'wireless': { label: 'Wireless bridge', color: '#8e24aa', z: 0, dash: false, what: 'Point-to-point radio pair on the roofs (5 GHz unlicensed by default)' },
};

export const defaultCampus = (p: Project): Campus => ({ main: { name: p.meta.name && p.meta.name !== 'New project' ? p.meta.name : 'Main building', x: 0, y: 0, rot: 0 }, buildings: [], links: [] });
export const campusOf = (p: Project): Campus => { const c = p.campus; const d = defaultCampus(p); return c ? { main: { ...d.main, ...c.main }, buildings: c.buildings ?? [], links: c.links ?? [] } : d; };

export interface SiteBuilding { id: string; name: string; code: string; x: number; y: number; rot: number; inputs: AutoInputs; spec: BuildingSpec; project: Project }
/** Every building on the site, the main one first (its size and materials come from Auto-Design and the Models page). */
export function siteBuildings(p: Project): SiteBuilding[] {
  const c = campusOf(p); const main = { ...defaultInputs(), ...(p.autoDesign ?? {}) };
  const out: SiteBuilding[] = [{ id: 'main', name: c.main.name, code: 'A', x: c.main.x, y: c.main.y, rot: c.main.rot, inputs: main, spec: specFor(p.buildingMaterials, main.bldg), project: p }];
  c.buildings.forEach((b, i) => {
    const inputs = { ...defaultInputs(), ...b.inputs } as AutoInputs;
    const proj = { ...p, autoDesign: { ...inputs, applied: false }, buildingMaterials: b.materials ?? {} } as Project;
    out.push({ id: b.id, name: b.name || `Building ${String.fromCharCode(66 + i)}`, code: String.fromCharCode(66 + i), x: b.x, y: b.y, rot: b.rot, inputs, spec: specFor(b.materials, inputs.bldg), project: proj });
  });
  return out;
}

/** Turn a point from a building's own plan into site feet. */
export function toSite(b: { x: number; y: number; rot: number }, px: number, py: number): [number, number] {
  const a = (b.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [b.x + px * c - py * s, b.y + px * s + py * c];
}
/** The four corners of a building on the site. */
export function corners(b: SiteBuilding): [number, number][] { const L = Math.max(20, b.inputs.lengthFt), W = Math.max(20, b.inputs.widthFt); return [toSite(b, 0, 0), toSite(b, L, 0), toSite(b, L, W), toSite(b, 0, W)]; }
export const center = (b: SiteBuilding): [number, number] => toSite(b, Math.max(20, b.inputs.lengthFt) / 2, Math.max(20, b.inputs.widthFt) / 2);
function inside(pt: [number, number], poly: [number, number][]): boolean {
  let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c;
}
/** Where the straight line from a building's centre toward a point leaves its outline. */
function edgeToward(b: SiteBuilding, tx: number, ty: number): [number, number] {
  const [cx, cy] = center(b), poly = corners(b); let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (inside([cx + (tx - cx) * m, cy + (ty - cy) * m], poly)) lo = m; else hi = m; }
  return [cx + (tx - cx) * hi, cy + (ty - cy) * hi];
}

export interface LinkResult {
  link: CampusLink; from: SiteBuilding; to: SiteBuilding; a: [number, number]; b: [number, number]; straightFt: number; routeFt: number; cableFt: number;
  handholes: number; poles: number; conduitFt: number;
  wireless?: { km: number; fsplDb: number; rslDbm: number; marginDb: number; fresnelFt: number; blockedBy: string[]; ok: boolean };
  label: string;
}
/** Lengths, handholes and (for wireless) the link budget and line-of-sight check of each link. */
export function linkResults(p: Project, bs = siteBuildings(p)): LinkResult[] {
  const c = campusOf(p); const out: LinkResult[] = [];
  for (const l of c.links) {
    const A = bs.find((b) => b.id === l.from), B = bs.find((b) => b.id === l.to); if (!A || !B || A === B) continue;
    const [bcx, bcy] = center(B), [acx, acy] = center(A);
    const a = edgeToward(A, bcx, bcy), b = edgeToward(B, acx, acy);
    const straight = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const r: LinkResult = { link: l, from: A, to: B, a, b, straightFt: straight, routeFt: 0, cableFt: 0, handholes: 0, poles: 0, conduitFt: 0, label: '' };
    if (l.kind === 'wireless') {
      const fMHz = l.fMHz || 5800, km = Math.max(0.001, (straight * 0.3048) / 1000);
      const fspl = 32.45 + 20 * Math.log10(fMHz) + 20 * Math.log10(km);
      const rsl = 23 + 23 + 23 - 2 - fspl; // 23 dBm radio, 23 dBi dish each end, 2 dB cables
      const fres = (17.32 * Math.sqrt(km / (4 * (fMHz / 1000)))) / 0.3048;
      const hA = A.inputs.floors * A.inputs.floorHeightFt + 10, hB = B.inputs.floors * B.inputs.floorHeightFt + 10;
      const blockedBy: string[] = [];
      for (const o of bs) {
        if (o === A || o === B) continue; const poly = corners(o), roof = o.inputs.floors * o.inputs.floorHeightFt;
        for (let t = 0.05; t < 0.96; t += 0.05) { const pt: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; if (inside(pt, poly) && roof + 0.6 * fres * Math.sin(Math.PI * t) > hA + (hB - hA) * t) { blockedBy.push(o.name); break; } }
      }
      r.wireless = { km, fsplDb: fspl, rslDbm: rsl, marginDb: rsl - -70, fresnelFt: fres, blockedBy, ok: !blockedBy.length && rsl - -70 >= 20 };
      r.routeFt = straight; r.cableFt = (hA + hB) * 1.2 + 60;
      r.label = `${A.code}→${B.code} wireless ${(fMHz / 1000).toFixed(1)} GHz, ${(straight).toFixed(0)} ft`;
    } else {
      const route = straight * 1.15; // routes bend around paving and utilities
      r.routeFt = route;
      r.handholes = l.kind === 'fiber-aerial' ? 0 : Math.max(0, Math.ceil(route / 300) - 1) + (route > 600 ? 1 : 0);
      r.poles = l.kind === 'fiber-aerial' ? Math.max(1, Math.ceil(route / 150) - 1) : 0;
      r.conduitFt = l.kind === 'fiber-aerial' ? 2 * 30 : route + 2 * 20;
      r.cableFt = l.kind === 'conduit' ? 0 : route + 2 * 50 + r.handholes * 30; // risers into the TRs, service loops
      r.label = `${A.code}→${B.code} ${LINK_KIND[l.kind].label.toLowerCase()}, ${Math.round(r.cableFt || r.routeFt)} ft`;
    }
    out.push(r);
  }
  return out;
}

/** Signal outside the buildings from every indoor antenna (each through its own outside wall). */
function siteHeat(bs: SiteBuilding[], scenes: ModelScene[], sys: string, fMHz: number, eirp: number, target: number, x0: number, y0: number, w: number, h: number): MHeat | null {
  const ants: { x: number; y: number; loss: number }[] = [];
  scenes.forEach((s, i) => { for (const d of s.devices) if (d.system === sys && (d.kind === 'das' || d.kind === 'wap') && d.floor === 0 && !d.outdoor) { const [x, y] = toSite(bs[i], d.x, d.y); ants.push({ x, y, loss: facadeLossDb(bs[i].spec, fMHz) }); } });
  if (!ants.length) return null;
  const nx = 90, ny = Math.max(10, Math.round((90 * h) / w)), v = new Float32Array(nx * ny).fill(NaN); const polys = bs.map(corners); let ok = 0, n = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const px = x0 + ((i + 0.5) / nx) * w, py = y0 + ((j + 0.5) / ny) * h;
    if (polys.some((q) => inside([px, py], q))) continue; // inside: the building's own heat map shows it
    let best = -200; for (const a of ants) { const dm = Math.max(1, Math.hypot(px - a.x, py - a.y) * 0.3048); best = Math.max(best, eirp - (20 * Math.log10(fMHz) + 20 * Math.log10(dm) - 27.55) - a.loss); }
    v[j * nx + i] = best; n++; if (best >= target) ok++;
  }
  return { layer: `${sys}:siteheat`, floor: 0, nx, ny, v, label: 'Outdoor signal', fMHz, targetDbm: target, pct: n ? (ok / n) * 100 : 0, ox: x0, oy: y0, w, h, rot: 0 };
}

/** One layered model of the whole site: every building turned and placed, links between them, outdoor signal. */
export function buildCampus(p: Project): { scene: ModelScene; buildings: SiteBuilding[]; links: LinkResult[]; scenes: ModelScene[] } {
  const bs = siteBuildings(p); const scenes = bs.map((b) => buildModel(b.project));
  const layers: LayerDef[] = []; const add = (l: LayerDef) => { if (!layers.some((v) => v.id === l.id)) layers.push(l); };
  for (const b of bs) add({ id: 'bldg:' + b.id, group: 'bldgs', groupLabel: 'Buildings', label: `${b.code}. ${b.name}`, color: '#455a64', on: true, tip: 'Show or hide everything in this building.' });
  scenes.forEach((s) => s.layers.forEach(add));
  const sc: ModelScene = { ...scenes[0], layers, devices: [], paths: [], areas: [], walls: [], heat: [], labels: [], stats: [], notes: [], footprints: [], firestops: 0, floors: Math.max(...bs.map((b) => Math.max(1, Math.round(b.inputs.floors)))) };
  scenes.forEach((s, i) => {
    const b = bs[i], T = (x: number, y: number) => toSite(b, x, y), bld = b.id;
    for (const d of s.devices) { const [x, y] = T(d.x, d.y); sc.devices.push({ ...d, x, y, bld, tag: `${b.code}-${d.tag}`, info: `${b.name}: ${d.info}` }); }
    for (const pa of s.paths) sc.paths.push({ ...pa, bld, label: `${b.name}: ${pa.label}`, pts: pa.pts.map(([x, y, f, z]) => { const [X, Y] = T(x, y); return [X, Y, f, z]; }) });
    for (const a of s.areas) {
      const [x, y] = T(a.x, a.y);
      if (a.shape === 'circle') sc.areas.push({ ...a, bld, x, y });
      else { const pts: [number, number][] = a.shape === 'square' ? [[a.x - a.r, a.y - a.r], [a.x + a.r, a.y - a.r], [a.x + a.r, a.y + a.r], [a.x - a.r, a.y + a.r]] : a.pts ?? []; sc.areas.push({ ...a, bld, shape: 'poly', x, y, pts: pts.map(([px, py]) => T(px, py)) }); }
    }
    for (const w of s.walls) { const [x1, y1] = T(w.x1, w.y1), [x2, y2] = T(w.x2, w.y2); sc.walls.push({ ...w, bld, x1, y1, x2, y2 }); }
    for (const t of s.labels) { const [x, y] = T(t.x, t.y); sc.labels.push({ ...t, bld, x, y }); }
    for (const hm of s.heat) sc.heat.push({ ...hm, bld, ox: b.x, oy: b.y, w: s.L, h: s.W, rot: b.rot });
    const [cx, cy] = center(b); sc.labels.push({ layer: 'base:labels', bld, floor: 0, x: cx, y: cy, z: s.floors * s.floorH + 6, text: `${b.code}. ${b.name}` });
    sc.footprints!.push({ id: b.id, name: `${b.code}. ${b.name}`, x: b.x, y: b.y, L: s.L, W: s.W, rot: b.rot, floors: s.floors, floorH: s.floorH, spec: s.spec });
    sc.firestops += s.firestops;
  });
  // links between buildings
  const links = linkResults(p, bs);
  if (links.length) add({ id: 'site:links', group: 'site', groupLabel: 'Between buildings', label: 'Links between buildings', color: '#f9a825', on: true, tip: 'Fiber, copper and conduit routes (dashed = underground) and wireless bridges between the buildings.' });
  if (links.some((l) => l.handholes || l.poles)) add({ id: 'site:hh', group: 'site', groupLabel: 'Between buildings', label: 'Handholes and poles', color: '#78909c', on: true, tip: 'A handhole about every 300 ft of underground route; a pole about every 150 ft aerial.' });
  for (const r of links) {
    const k = LINK_KIND[r.link.kind];
    const zA = r.link.kind === 'wireless' ? r.from.inputs.floors * r.from.inputs.floorHeightFt + 10 : k.z, zB = r.link.kind === 'wireless' ? r.to.inputs.floors * r.to.inputs.floorHeightFt + 10 : k.z;
    sc.paths.push({ layer: 'site:links', pts: [[r.a[0], r.a[1], 0, zA], [r.b[0], r.b[1], 0, zB]], color: r.wireless && !r.wireless.ok ? '#c62828' : k.color, label: r.label + (r.wireless ? `, ${r.wireless.ok ? 'clear' : r.wireless.blockedBy.length ? 'blocked by ' + r.wireless.blockedBy.join(', ') : 'weak signal'}` : ''), dash: k.dash, width: 2.2 });
    const n = r.handholes || r.poles;
    for (let i = 1; i <= n; i++) { const t = i / (n + 1); sc.areas.push({ layer: 'site:hh', floor: 0, shape: 'square', x: r.a[0] + (r.b[0] - r.a[0]) * t, y: r.a[1] + (r.b[1] - r.a[1]) * t, r: r.poles ? 1.2 : 2, z: 0.3, color: k.color, label: r.poles ? 'Pole' : 'Handhole (17 × 30 in, Tier 15 in traffic areas)' }); }
  }
  // outdoor signal around the buildings
  const all = bs.flatMap(corners); const minX = Math.min(...all.map((q) => q[0])) - 120, minY = Math.min(...all.map((q) => q[1])) - 120, maxX = Math.max(...all.map((q) => q[0])) + 120, maxY = Math.max(...all.map((q) => q[1])) + 120;
  const e = p.erces; const dasEirp = Math.min(20, Math.max(0, (e?.bdaMaxOutputDbm ?? 27) - (e?.dasCableLossDb ?? 6) - (e?.splitterLossDb ?? 7) + (e?.indoorAntGainDbi ?? 2)));
  for (const [sys, f, eirp, tgt, lab] of [['wifi', 5180, 20, -67, 'Wi-Fi'], ['erces', 800, dasEirp, -95, 'public-safety radio'], ['das', 1900, dasEirp, -85, 'cellular']] as [string, number, number, number, string][]) {
    const hm = siteHeat(bs, scenes, sys, f, eirp, tgt, minX, minY, maxX - minX, maxY - minY);
    if (hm) { add({ id: `${sys}:siteheat`, group: sys, groupLabel: layers.find((l) => l.group === sys)?.groupLabel ?? sys, label: 'Outdoor signal', color: SYSTEM_COLOR[sys] ?? '#555', on: false, tip: `Indoor ${lab} antennas leaking outside through each building's outside walls and windows (worked out from the materials picked). Shows how far coverage reaches across the site.` }); sc.heat.push(hm); }
  }
  // stats for the whole site
  const devs = sc.devices.filter((d) => d.kind !== 'tr').length;
  sc.stats = [
    { label: 'Buildings', value: String(bs.length) },
    { label: 'Devices on the site', value: devs.toLocaleString() },
    { label: 'Links between buildings', value: String(links.length) },
    { label: 'Underground route', value: `${Math.round(links.filter((l) => l.link.kind !== 'wireless' && l.link.kind !== 'fiber-aerial').reduce((s, l) => s + l.routeFt, 0)).toLocaleString()} ft` },
    { label: 'Firestop penetrations (estimate)', value: String(sc.firestops) },
  ];
  const wbad = links.filter((l) => l.wireless && !l.wireless.ok);
  sc.notes = [
    ...wbad.map((l) => `${l.label}: ${l.wireless!.blockedBy.length ? `blocked by ${l.wireless!.blockedBy.join(', ')}; raise the antennas or route through another building` : `only ${l.wireless!.marginDb.toFixed(0)} dB fade margin; use bigger dishes or a lower band`}.`),
    links.some((l) => l.link.kind === 'copper-ug') ? 'Copper between buildings needs listed primary protectors where it enters each building (NEC 800.90) and bonding to the building grounding electrode system.' : '',
    links.some((l) => l.link.kind !== 'wireless') ? 'Call 811 before digging. Bury conduit at least 24 in (18 in under concrete per local rules); use a detectable warning tape or tracer wire on dielectric fiber.' : '',
    'Each building keeps its own size, floors, type and materials; the main building is the one on Auto-Design and 2D & 3D Models.',
  ].filter(Boolean);
  // shift everything so the site starts at 0, 0 (views draw from 0, 0)
  const dx = -minX, dy = -minY;
  sc.devices.forEach((d) => { d.x += dx; d.y += dy; }); sc.paths.forEach((pa) => pa.pts.forEach((q) => { q[0] += dx; q[1] += dy; }));
  sc.areas.forEach((a) => { a.x += dx; a.y += dy; a.pts?.forEach((q) => { q[0] += dx; q[1] += dy; }); }); sc.walls.forEach((w) => { w.x1 += dx; w.x2 += dx; w.y1 += dy; w.y2 += dy; });
  sc.labels.forEach((t) => { t.x += dx; t.y += dy; }); sc.heat.forEach((h) => { h.ox = (h.ox ?? 0) + dx; h.oy = (h.oy ?? 0) + dy; }); sc.footprints!.forEach((f) => { f.x += dx; f.y += dy; });
  sc.L = maxX - minX; sc.W = maxY - minY; sc.donor = undefined;
  return { scene: sc, buildings: bs, links, scenes };
}
/** Offset that buildCampus added (to turn a site-plan drag back into building feet). */
export function campusOrigin(p: Project): [number, number] { const all = siteBuildings(p).flatMap(corners); return [Math.min(...all.map((q) => q[0])) - 120, Math.min(...all.map((q) => q[1])) - 120]; }

/** Materials for the whole site: every building's equipment and materials added up, plus the links. */
export function campusBom(p: Project, bs = siteBuildings(p), links = linkResults(p, bs), skipMain = false): (Rec & { where: string })[] {
  const m = new Map<string, Rec & { where: string }>();
  const addR = (r: Rec, where: string) => { const k = r.system + '|' + r.item + '|' + r.spec; const o = m.get(k); if (o) { o.qty += r.qty; if (!o.where.includes(where)) o.where += ', ' + where; } else m.set(k, { ...r, where }); };
  for (const b of bs) { if (skipMain && b.id === 'main') continue; const r = autoDesign(b.project, b.inputs); [...r.equipment, ...r.materials].forEach((x) => addR(x, b.code)); }
  const L = (system: string, key: string, item: string, spec: string, qty: number, unit: string, basis: string, where: string) => { if (qty > 0) addR({ key, system, item, spec, qty: Math.round(qty), unit, basis }, where); };
  for (const r of links) {
    const w = `${r.from.code}→${r.to.code}`, s = r.link.strands || 12;
    if (r.link.kind === 'fiber-ug') { L('Between buildings', 'osp-fiber', `${s}-strand single-mode OSP fiber`, 'Armored or dielectric, gel-free, OS2', r.cableFt, 'ft', 'Route × 1.15 + 50 ft riser/loop each end + 30 ft per handhole', w); L('Between buildings', 'fiber-enc', 'Fiber enclosure / patch panel with splice trays', `${s}-port LC/APC or LC/UPC`, 2, 'ea', 'One each end', w); }
    if (r.link.kind === 'fiber-aerial') { L('Between buildings', 'adss', `${s}-strand ADSS / lashed fiber`, 'Single-mode, aerial rated', r.cableFt, 'ft', 'Route × 1.15 + 50 ft each end', w); L('Between buildings', 'pole', 'Poles (or attachments on existing poles)', 'Class 4 wood, 35 ft, or utility attachment', r.poles, 'ea', 'About every 150 ft', w); L('Between buildings', 'fiber-enc', 'Fiber enclosure / patch panel with splice trays', `${s}-port`, 2, 'ea', 'One each end', w); }
    if (r.link.kind === 'copper-ug') { L('Between buildings', 'osp-cu', `${s}-pair OSP copper`, 'Gel-filled, 24 AWG, shielded', r.cableFt, 'ft', 'Route × 1.15 + loops', w); L('Between buildings', 'prot', 'Building entrance protector', `${s}-pair, listed primary protection (NEC 800.90)`, 2, 'ea', 'One each building entry', w); }
    if (r.link.kind !== 'wireless' && r.link.kind !== 'fiber-aerial') { L('Between buildings', 'conduit', '2 in HDPE conduit with pull tape', 'Plus one spare conduit recommended', r.conduitFt, 'ft', 'Route + 20 ft into each building', w); L('Between buildings', 'hh', 'Handholes', '17 × 30 in polymer concrete, Tier 15 (Tier 22 in drive lanes)', r.handholes, 'ea', 'About every 300 ft and at bends', w); L('Between buildings', 'trench', 'Trenching / boring', '24 in cover; bore under paving', r.routeFt, 'ft', 'Route length', w); L('Between buildings', 'tape', 'Warning tape / tracer wire', 'Orange, detectable', r.routeFt, 'ft', 'Route length', w); }
    if (r.link.kind === 'wireless') { L('Between buildings', 'ptp', 'Point-to-point radio pair with dishes', `${((r.link.fMHz || 5800) / 1000).toFixed(1)} GHz, 23 dBi`, 1, 'pair', `${r.straightFt.toFixed(0)} ft path, ${r.wireless!.marginDb.toFixed(0)} dB margin`, w); L('Between buildings', 'ptp-mount', 'Roof mounts, grounding kits and surge protectors', 'Non-penetrating or wall mount; outdoor Cat 6 shielded', 2, 'set', 'One each roof', w); L('Between buildings', 'ptp-cable', 'Outdoor shielded Cat 6', 'UV rated, with grounded surge protector at entry', r.cableFt, 'ft', 'Roof to TR each end', w); }
  }
  return [...m.values()].sort((a, b) => a.system.localeCompare(b.system));
}

export const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map((v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
export const BUILDING_TYPES: BldgType[] = ['office', 'school', 'healthcare', 'warehouse', 'retail', 'multifamily', 'hotel', 'industrial'];
export { matLossDb };
