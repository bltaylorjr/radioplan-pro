// Floor plan import: turns a floor plan or blueprint (JPG/PNG scan or photo, PDF from CAD or a scan, DXF from CAD, SVG)
// into a true-scale 2D plan and 3D model: walls (exterior / interior, with thickness), doors, windows and rooms with
// their areas. It also grades the upload and lists what is wrong with it and how to fix it, so a model is only
// called accurate when the file is good enough and the scale is known.
//
// Everything here is plain TypeScript on pixel arrays (no DOM), so it runs and is tested in Node. The page
// (pages/FloorPlan.tsx) decodes the file to a grey image, calls analyzePlan(), and keeps the result on the project.
//
// Geometry is kept in pixels of the analysed image plus one scale (feet per pixel), so a new scale never needs a new
// detection. planInFeet() gives feet, with the building's top-left corner at 0, 0.

export interface Gray { w: number; h: number; d: Uint8Array }
export type SourceKind = 'image' | 'pdf-vector' | 'pdf-scan' | 'dxf' | 'svg' | 'drawn';
export type ScaleFrom = 'notation' | 'calibrated' | 'dimension' | 'cad-units' | 'estimated' | 'none';

export interface PlanWall { id: string; x1: number; y1: number; x2: number; y2: number; thick: number; exterior: boolean }
export interface PlanOpening { id: string; kind: 'door' | 'window'; x1: number; y1: number; x2: number; y2: number; thick: number; exterior: boolean }
export interface PlanRoom { id: string; number: string; name: string; x: number; y: number; px: number; bx: [number, number, number, number] }
export interface PlanText { text: string; x: number; y: number }
export interface QualityIssue { id: string; severity: 'bad' | 'warn' | 'info'; title: string; detail: string; fix: string }
export interface PlanMetrics {
  widthPx: number; heightPx: number; dpi: number | null; contrast: number; sharpness: number; skewDeg: number; squareShare: number;
  inkPct: number; colorful: number; wallPx: number; walls: number; openings: number; rooms: number; untracedPct: number; danglingEnds: number; closed: boolean;
}
export interface PlanQuality { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; accurate: boolean; issues: QualityIssue[]; metrics: PlanMetrics }
export interface PlanScale { ftPerPx: number | null; from: ScaleFrom; note: string }

/** One imported floor plan, kept on the project (project.floorPlans). */
export interface FloorPlanImport {
  id: string; name: string; fileType: string; size: number; addedAt: string; source: SourceKind;
  /** Floor this plan is (0 = first floor) and its level name (FIRST FLOOR PLAN, LEVEL 2…). */
  floor: number; level: string;
  w: number; h: number; scale: PlanScale; ceilingFt: number; wallHeightFt: number;
  walls: PlanWall[]; openings: PlanOpening[]; rooms: PlanRoom[]; quality: PlanQuality;
  /** The analysed sheet (JPEG), shown under the traced plan. Same pixel size as w × h divided by previewK. */
  preview?: string; previewK?: number;
  /** In the project plan and build (Models, Auto-Design sizes, Indoor Coverage, Materials). */
  integrated?: boolean; integratedAt?: string;
  /** Shown in Reports (Floor plans, schedules) and kept in Documents. */
  inDocs?: boolean;
  /** Layers turned off on the plan (ids from PLAN_LAYERS and the system layers). */
  off?: string[];
  /** Drawing scale for printing and export (none = fit to the page) and the sheet size. */
  drawScale?: ScaleNote | null; sheet?: string;
  /** Detection settings that gave this result (re-run keeps them). */
  tuned?: { rc: number; thick: number };
  textItems?: PlanText[];
}

import { writeDxf, type DxfEnt } from './fileformats';

let n = 0;
const uidp = (p: string) => p + (++n).toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- feet and inches ----------
/** 42.5 → 42'-6"  (architectural feet-inches, nearest inch). */
export function fmtFtIn(ft: number): string {
  if (!Number.isFinite(ft)) return '—';
  const neg = ft < 0; let tin = Math.round(Math.abs(ft) * 12); const f = Math.floor(tin / 12); tin -= f * 12;
  return `${neg ? '-' : ''}${f}'-${tin}"`;
}
/** Reads 42'-6", 42' 6", 42.5', 42-6, 510", 12.95 m, 42.5 → feet. */
export function parseFtIn(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/''/g, '"');
  if (!t) return null;
  let m = /^(-?\d+(?:\.\d+)?)\s*m$/.exec(t); if (m) return +m[1] / 0.3048;
  m = /^(-?\d+(?:\.\d+)?)\s*(?:mm)$/.exec(t); if (m) return +m[1] / 304.8;
  m = /^(\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)?(?:\s+(\d+)\/(\d+))?\s*"?$/.exec(t);
  if (m) return +m[1] + ((m[2] ? +m[2] : 0) + (m[3] ? +m[3] / +m[4] : 0)) / 12;
  m = /^(\d+(?:\.\d+)?)\s*"$/.exec(t); if (m) return +m[1] / 12;
  m = /^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/.exec(t); if (m) return +m[1] + +m[2] / 12;
  m = /^(\d+(?:\.\d+)?)$/.exec(t); if (m) return +m[1];
  return null;
}

// ---------- scale notation on the sheet ----------
const frac = (s: string) => { const m = /^(\d+)\s*-\s*(\d+)\/(\d+)$|^(\d+)\s+(\d+)\/(\d+)$/.exec(s.trim()); if (m) return m[1] ? +m[1] + +m[2] / +m[3] : +m[4] + +m[5] / +m[6]; const f = /^(\d+)\/(\d+)$/.exec(s.trim()); return f ? +f[1] / +f[2] : parseFloat(s); };
export interface ScaleNote { label: string; /** Real feet per paper inch. */ ftPerIn: number }
/** Finds drawing scales in sheet text: 1/4" = 1'-0", 1/8"=1', 3/16" = 1'-0", 1" = 20', 1:100, SCALE 1:50. "NTS" gives none. */
export function findScales(text: string): { scales: ScaleNote[]; nts: boolean } {
  const t = text.replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/''/g, '"');
  const out: ScaleNote[] = [];
  const arch = /(\d+(?:\s*-\s*\d+\/\d+|\s+\d+\/\d+|\/\d+)?)\s*"\s*=\s*1\s*'\s*(?:-\s*0\s*"?)?/g;
  for (let m; (m = arch.exec(t));) { const inch = frac(m[1]); if (inch > 0 && inch <= 12) out.push({ label: `${m[1].replace(/\s+/g, ' ')}" = 1'-0"`, ftPerIn: 1 / inch }); }
  const eng = /1\s*"\s*=\s*(\d+(?:\.\d+)?)\s*'(?!\s*-\s*[1-9])/g;
  for (let m; (m = eng.exec(t));) { const ft = +m[1]; if (ft > 1 || !/1\s*"\s*=\s*1\s*'\s*-\s*0/.test(m[0])) if (!out.some((o) => o.label.startsWith('1" = 1\'') && ft === 1)) out.push({ label: `1" = ${ft}'`, ftPerIn: ft }); }
  const met = /(?:scale\s*[:=]?\s*)?\b1\s*:\s*(\d{1,4})\b/gi;
  for (let m; (m = met.exec(t));) { const r = +m[1]; if (r >= 10 && r <= 2000) out.push({ label: `1:${r}`, ftPerIn: r / 12 }); }
  return { scales: out, nts: /\b(?:N\.?T\.?S\.?|NOT\s+TO\s+SCALE)\b/i.test(t) };
}
/** Feet per pixel for a scale when the sheet is drawn at `pxPerIn` pixels per paper inch. */
export const ftPerPxFor = (s: ScaleNote, pxPerIn: number) => s.ftPerIn / pxPerIn;

// ---------- image basics ----------
export function grayFromRgba(w: number, h: number, data: Uint8ClampedArray | Uint8Array): { g: Gray; colorful: number } {
  const d = new Uint8Array(w * h); let sat = 0, cnt = 0;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const a = data[j + 3] / 255, r = data[j] * a + 255 * (1 - a), g = data[j + 1] * a + 255 * (1 - a), b = data[j + 2] * a + 255 * (1 - a);
    d[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    if ((i & 7) === 0) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx - mn; cnt++; }
  }
  return { g: { w, h, d }, colorful: cnt ? sat / cnt / 255 : 0 };
}
/** Otsu threshold (0..255). */
export function otsu(g: Gray): number {
  const hist = new Float64Array(256); for (let i = 0; i < g.d.length; i++) hist[g.d[i]]++;
  const tot = g.d.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  return th;
}

type Mask = Uint8Array;
/** Ones in the (2r+1)² box around each pixel. */
function boxSum(m: Mask, w: number, h: number, r: number): Int32Array {
  const a = new Int32Array(w * h), b = new Int32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -r; x < w; x++) { const xi = x + r; if (xi < w) s += m[o + xi]; const xo = x - r - 1; if (xo >= 0) s -= m[o + xo]; if (x >= 0) a[o + x] = s; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y < h; y++) { const yi = y + r; if (yi < h) s += a[yi * w + x]; const yo = y - r - 1; if (yo >= 0) s -= a[yo * w + x]; if (y >= 0) b[y * w + x] = s; } }
  return b;
}
function dilate(m: Mask, w: number, h: number, r: number): Mask { if (r <= 0) return m.slice(); const s = boxSum(m, w, h, r), o = new Uint8Array(w * h); for (let i = 0; i < o.length; i++) o[i] = s[i] > 0 ? 1 : 0; return o; }
function erode(m: Mask, w: number, h: number, r: number): Mask { if (r <= 0) return m.slice(); const s = boxSum(m, w, h, r), o = new Uint8Array(w * h), full = (2 * r + 1) ** 2; for (let i = 0; i < o.length; i++) o[i] = s[i] >= full ? 1 : 0; return o; }
const close = (m: Mask, w: number, h: number, r: number) => (r > 0 ? erode(dilate(m, w, h, r), w, h, r) : m);
const open = (m: Mask, w: number, h: number, r: number) => (r > 0 ? dilate(erode(m, w, h, r), w, h, r) : m);

// ---------- quality measures ----------
function measures(g: Gray, dark: Mask) {
  const { w, h, d } = g; let ink = 0, mD = 0, nD = 0, mL = 0, nL = 0;
  for (let i = 0; i < d.length; i++) if (dark[i]) { ink++; mD += d[i]; nD++; } else { mL += d[i]; nL++; }
  const contrast = nD && nL ? (mL / nL - mD / nD) / 255 : 0;
  const mags: number[] = []; const hist = new Float64Array(180); let tot = 0, sq = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 400000)));
  for (let y = 1; y < h - 1; y += step) for (let x = 1; x < w - 1; x += step) {
    const i = y * w + x, gx = (d[i + 1] - d[i - 1]) / 2, gy = (d[i + w] - d[i - w]) / 2, mg = Math.hypot(gx, gy);
    if (mg > 12) { mags.push(mg); let a = (Math.atan2(gy, gx) * 180) / Math.PI; a = ((a % 90) + 90) % 90; hist[Math.min(179, Math.floor(a * 2))] += mg; tot += mg; if (a < 3 || a > 87) sq += mg; }
  }
  mags.sort((a, b) => a - b);
  const sharp = mags.length ? mags[Math.floor(mags.length * 0.9)] : 0;
  let pk = 0, skewBin = 0; for (let i = 0; i < 180; i++) { const v = hist[i] + hist[(i + 1) % 180] + hist[(i + 179) % 180]; if (v > pk) { pk = v; skewBin = i; } }
  let a = skewBin / 2 + 0.25; if (a > 45) a -= 90;
  return { inkPct: (100 * ink) / d.length, contrast, sharpness: sharp, skewDeg: tot ? a : 0, squareShare: tot ? sq / tot : 0 };
}

// ---------- walls ----------
interface Rect { x1: number; x2: number; y1: number; y2: number }
/** Straight runs of `m` along rows (horizontal walls); for vertical walls pass the transposed mask. */
function runsToRects(m: Mask, w: number, h: number, minLen: number, tol: number): Rect[] {
  const done: Rect[] = []; let open: (Rect & { seen: boolean })[] = [];
  for (let y = 0; y < h; y++) {
    const o = y * w; for (const r of open) r.seen = false;
    for (let x = 0; x < w;) {
      if (!m[o + x]) { x++; continue; }
      let e = x; while (e < w && m[o + e]) e++;
      if (e - x >= minLen) {
        const r = open.find((q) => !q.seen && Math.abs(q.x1 - x) <= tol && Math.abs(q.x2 - (e - 1)) <= tol);
        if (r) { r.seen = true; r.y2 = y; r.x1 = Math.max(r.x1, x); r.x2 = Math.min(r.x2, e - 1); }
        else open.push({ x1: x, x2: e - 1, y1: y, y2: y, seen: true });
      }
      x = e;
    }
    const keep: typeof open = []; for (const r of open) (r.seen ? keep : done).push(r); open = keep;
  }
  done.push(...open);
  return done;
}
const transpose = (m: Mask, w: number, h: number): Mask => { const t = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[x * h + y] = m[y * w + x]; return t; };

function thicknessMode(m: Mask, w: number, h: number, lo: number, hi: number): number {
  const hist = new Float64Array(hi + 2);
  const scan = (get: (a: number, b: number) => number, A: number, B: number) => {
    for (let a = 0; a < A; a += 2) { let run = 0; for (let b = 0; b <= B; b++) { const v = b < B ? get(a, b) : 0; if (v) run++; else { if (run >= lo && run <= hi) hist[run] += run; run = 0; } } }
  };
  scan((x, y) => m[y * w + x], w, h); scan((y, x) => m[y * w + x], h, w);
  let best = 0, at = 0; for (let t = lo; t <= hi; t++) { const v = hist[t - 1] * 0.5 + hist[t] + hist[t + 1] * 0.5; if (v > best) { best = v; at = t; } }
  return at;
}

/** Fraction of [a, b] along a line where the original has ink within ±2 px. */
function inkAlong(dark: Mask, w: number, h: number, horiz: boolean, fixed: number, a: number, b: number): number {
  let hit = 0, tot = 0;
  for (let t = a; t <= b; t += 1) {
    tot++; let ok = false;
    for (let k = -2; k <= 2 && !ok; k++) { const f = Math.round(fixed) + k; const x = horiz ? t : f, y = horiz ? f : t; if (x >= 0 && y >= 0 && x < w && y < h && dark[y * w + x]) ok = true; }
    if (ok) hit++;
  }
  return tot ? hit / tot : 0;
}

export interface Detected { walls: PlanWall[]; openings: PlanOpening[]; rooms: PlanRoom[]; thick: number; rc: number; untracedPct: number; danglingEnds: number; closed: boolean; wallPx: number }

function wallsFor(g: Gray, dark: Mask, rc: number, forceThick?: number) {
  const { w, h } = g, s = Math.max(w, h) / 2000;
  const C = close(dark, w, h, rc);
  const thick = forceThick || thicknessMode(C, w, h, Math.max(3, Math.round(3 * s)), Math.round(90 * s));
  if (!thick) return null;
  const ro = Math.max(1, Math.floor(thick * 0.35));
  const O = open(C, w, h, ro);
  const minLen = Math.max(Math.round(thick * 2.5), Math.round(18 * s));
  const keep = (r: Rect, horiz: boolean): PlanWall | null => {
    const len = (horiz ? r.x2 - r.x1 : r.y2 - r.y1) + 1, th = (horiz ? r.y2 - r.y1 : r.x2 - r.x1) + 1;
    if (th < Math.max(2 * ro + 1, thick * 0.5) || th > thick * 2.6 || len < Math.max(minLen, th * 2.5)) return null;
    // both faces must be real lines on the original (filters text and hatching blobs)
    const e1 = horiz ? inkAlong(dark, w, h, true, r.y1, r.x1, r.x2) : inkAlong(dark, w, h, false, r.x1, r.y1, r.y2);
    const e2 = horiz ? inkAlong(dark, w, h, true, r.y2, r.x1, r.x2) : inkAlong(dark, w, h, false, r.x2, r.y1, r.y2);
    if (e1 < 0.72 || e2 < 0.72) return null;
    return horiz ? { id: '', x1: r.x1, y1: (r.y1 + r.y2) / 2, x2: r.x2 + 1, y2: (r.y1 + r.y2) / 2, thick: th, exterior: false }
      : { id: '', x1: (r.x1 + r.x2) / 2, y1: r.y1, x2: (r.x1 + r.x2) / 2, y2: r.y2 + 1, thick: th, exterior: false };
  };
  const tol = Math.max(2, Math.round(thick * 0.6));
  const hs = runsToRects(O, w, h, minLen, tol).map((r) => keep(r, true)).filter(Boolean) as PlanWall[];
  const vs = runsToRects(transpose(O, w, h), h, w, minLen, tol).map((r) => keep({ x1: r.y1, x2: r.y2, y1: r.x1, y2: r.x2 }, false)).filter(Boolean) as PlanWall[];
  let covered = 0, thickPx = 0;
  for (let i = 0; i < O.length; i++) if (O[i]) thickPx++;
  const all = [...hs, ...vs];
  for (const wl of all) covered += (Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1)) * wl.thick;
  return { walls: all, thick, O, thickPx, covered };
}

const isH = (w: { y1: number; y2: number; x1: number; x2: number }) => Math.abs(w.y2 - w.y1) < Math.abs(w.x2 - w.x1);

/** Ends of walls meet: each end moves onto the centreline of a crossing wall it stops near. */
function snap(walls: PlanWall[], thick: number): [number, number][] {
  const dangling: [number, number][] = [];
  for (const a of walls) {
    const ha = isH(a);
    for (const end of [1, 2] as const) {
      const ex = end === 1 ? a.x1 : a.x2, ey = end === 1 ? a.y1 : a.y2; let best: { d: number; v: number } | null = null;
      for (const b of walls) {
        if (b === a || isH(b) === ha) continue;
        const reach = Math.max(a.thick, b.thick) * 1.6 + 2;
        if (ha) { const bx = b.x1, lo = Math.min(b.y1, b.y2) - reach, hi = Math.max(b.y1, b.y2) + reach; const dd = Math.abs(ex - bx); if (ey >= lo && ey <= hi && dd <= reach && (!best || dd < best.d)) best = { d: dd, v: bx }; }
        else { const by = b.y1, lo = Math.min(b.x1, b.x2) - reach, hi = Math.max(b.x1, b.x2) + reach; const dd = Math.abs(ey - by); if (ex >= lo && ex <= hi && dd <= reach && (!best || dd < best.d)) best = { d: dd, v: by }; }
      }
      if (best) { if (ha) { if (end === 1) a.x1 = best.v; else a.x2 = best.v; } else { if (end === 1) a.y1 = best.v; else a.y2 = best.v; } }
      else dangling.push([ex, ey]);
    }
  }
  return dangling;
}

/** Gaps between two walls on one line: doors (2'-0" to 6'-8") and windows (glazing lines across the gap). */
function findOpenings(walls: PlanWall[], dark: Mask, w: number, h: number, thick: number, ftPerPx: number | null): PlanOpening[] {
  const out: PlanOpening[] = [];
  const lim = ftPerPx ? { lo: 1.8 / ftPerPx, door: 6.8 / ftPerPx, win: 16 / ftPerPx } : { lo: thick * 3, door: thick * 13, win: thick * 30 };
  for (const horiz of [true, false]) {
    const ws = walls.filter((x) => isH(x) === horiz).map((x) => ({ x, c: horiz ? x.y1 : x.x1, a: horiz ? Math.min(x.x1, x.x2) : Math.min(x.y1, x.y2), b: horiz ? Math.max(x.x1, x.x2) : Math.max(x.y1, x.y2) }));
    ws.sort((p, q) => p.c - q.c || p.a - q.a);
    for (let i = 0; i < ws.length; i++) {
      // nearest wall after this one on the same line
      let nb: typeof ws[number] | null = null;
      for (let j = 0; j < ws.length; j++) { const q = ws[j]; if (j === i || Math.abs(q.c - ws[i].c) > Math.max(ws[i].x.thick, q.x.thick) * 0.6 || q.a < ws[i].b) continue; if (!nb || q.a < nb.a) nb = q; }
      if (!nb) continue;
      const gap = nb.a - ws[i].b; if (gap < lim.lo || gap > lim.win) continue;
      const c = (ws[i].c + nb.c) / 2, th = (ws[i].x.thick + nb.x.thick) / 2;
      // a wall crossing the gap means it is a junction, not an opening
      const crossed = walls.some((v) => isH(v) !== horiz && (horiz ? v.x1 : v.y1) > ws[i].b + th && (horiz ? v.x1 : v.y1) < nb!.a - th && Math.min(horiz ? v.y1 : v.x1, horiz ? v.y2 : v.x2) <= c + th && Math.max(horiz ? v.y1 : v.x1, horiz ? v.y2 : v.x2) >= c - th);
      if (crossed) continue;
      let glazing = 0;
      for (let k = -Math.floor(th / 2); k <= Math.floor(th / 2); k++) glazing = Math.max(glazing, inkAlong(dark, w, h, horiz, c + k, Math.round(ws[i].b + 1), Math.round(nb.a - 1)));
      const kind: 'door' | 'window' = glazing >= 0.8 ? 'window' : 'door';
      if (kind === 'door' && gap > lim.door) continue;
      out.push(horiz ? { id: uidp('o'), kind, x1: ws[i].b, y1: c, x2: nb.a, y2: c, thick: th, exterior: false } : { id: uidp('o'), kind, x1: c, y1: ws[i].b, x2: c, y2: nb.a, thick: th, exterior: false });
    }
  }
  return out;
}

/** Draws walls and openings on a coarse grid, fills from the edge (outside), then finds the rooms left inside. */
function roomsAndOutside(walls: PlanWall[], ops: PlanOpening[], w: number, h: number, thick: number, minRoomPx: number) {
  const k = Math.max(1, Math.floor(Math.min(thick / 3, Math.max(w, h) / 900))) || 1;
  const W = Math.ceil(w / k), H = Math.ceil(h / k), bar = new Uint8Array(W * H);
  const draw = (x1: number, y1: number, x2: number, y2: number, t: number) => {
    const half = Math.max(1, t / 2 / k + 0.6), ax = Math.min(x1, x2) / k - (isH({ x1, x2, y1, y2 }) ? 0 : half), bx = Math.max(x1, x2) / k + (isH({ x1, x2, y1, y2 }) ? 0 : half);
    const ay = Math.min(y1, y2) / k - (isH({ x1, x2, y1, y2 }) ? half : 0), by = Math.max(y1, y2) / k + (isH({ x1, x2, y1, y2 }) ? half : 0);
    for (let y = Math.max(0, Math.floor(ay - (isH({ x1, x2, y1, y2 }) ? 0 : 1))); y <= Math.min(H - 1, Math.ceil(by)); y++) for (let x = Math.max(0, Math.floor(ax)); x <= Math.min(W - 1, Math.ceil(bx)); x++) bar[y * W + x] = 1;
  };
  for (const wl of walls) draw(wl.x1, wl.y1, wl.x2, wl.y2, wl.thick);
  for (const o of ops) draw(o.x1, o.y1, o.x2, o.y2, o.thick);
  const lab = new Int32Array(W * H); const q = new Int32Array(W * H);
  const fill = (s: number, id: number) => { let hd = 0, tl = 0; q[tl++] = s; lab[s] = id; let cnt = 0, sx = 0, sy = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (hd < tl) { const i = q[hd++], x = i % W, y = (i / W) | 0; cnt++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) if (j >= 0 && !bar[j] && !lab[j]) { lab[j] = id; q[tl++] = j; } }
    return { cnt, cx: sx / cnt, cy: sy / cnt, bx: [x0, y0, x1, y1] as [number, number, number, number] }; };
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = y * W + x; if (!bar[i] && !lab[i]) fill(i, -1); }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = y * W + x; if (!bar[i] && !lab[i]) fill(i, -1); }
  const rooms: PlanRoom[] = []; let id = 1;
  for (let i = 0; i < W * H; i++) if (!bar[i] && !lab[i]) {
    const r = fill(i, ++id);
    if (r.cnt * k * k >= minRoomPx) rooms.push({ id: uidp('r'), number: '', name: '', x: r.cx * k, y: r.cy * k, px: r.cnt * k * k, bx: [r.bx[0] * k, r.bx[1] * k, (r.bx[2] + 1) * k, (r.bx[3] + 1) * k] });
  }
  const outsideAt = (x: number, y: number) => { const gx = Math.floor(x / k), gy = Math.floor(y / k); return gx < 0 || gy < 0 || gx >= W || gy >= H || lab[gy * W + gx] === -1; };
  return { rooms, outsideAt };
}

export function detect(g: Gray, opts: { ftPerPx?: number | null; rc?: number; thick?: number } = {}): Detected {
  const th = otsu(g), dark = new Uint8Array(g.d.length); for (let i = 0; i < g.d.length; i++) dark[i] = g.d[i] <= th ? 1 : 0;
  const s = Math.max(g.w, g.h) / 2000;
  const tries = opts.rc != null ? [opts.rc] : [0, Math.max(1, Math.round(2 * s)), Math.max(2, Math.round(4 * s))];
  let best: ReturnType<typeof wallsFor> & { rc: number } | null = null;
  for (const rc of tries) { const r = wallsFor(g, dark, rc, opts.thick); if (r && (!best || r.covered > best.covered * 1.08)) best = { ...r, rc }; }
  if (!best || !best.walls.length) return { walls: [], openings: [], rooms: [], thick: best?.thick ?? 0, rc: best?.rc ?? 0, untracedPct: 100, danglingEnds: 0, closed: false, wallPx: best?.thick ?? 0 };
  const walls = best.walls.map((x) => ({ ...x, id: uidp('w') }));
  const ends = snap(walls, best.thick);
  const openings = findOpenings(walls, dark, g.w, g.h, best.thick, opts.ftPerPx ?? null);
  // wall ends at a door or window jamb are meant to stop there
  const dangling = ends.filter(([x, y]) => !openings.some((o) => Math.hypot(o.x1 - x, o.y1 - y) <= o.thick * 1.5 + 2 || Math.hypot(o.x2 - x, o.y2 - y) <= o.thick * 1.5 + 2)).length;
  const minRoom = opts.ftPerPx ? 12 / (opts.ftPerPx * opts.ftPerPx) : (best.thick * 14) ** 2;
  const { rooms, outsideAt } = roomsAndOutside(walls, openings, g.w, g.h, best.thick, minRoom);
  for (const wl of walls) {
    const mx = (wl.x1 + wl.x2) / 2, my = (wl.y1 + wl.y2) / 2, off = wl.thick / 2 + Math.max(3, wl.thick);
    wl.exterior = isH(wl) ? outsideAt(mx, my - off) || outsideAt(mx, my + off) : outsideAt(mx - off, my) || outsideAt(mx + off, my);
  }
  for (const o of openings) {
    const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2, off = o.thick / 2 + Math.max(3, o.thick);
    o.exterior = isH(o) ? outsideAt(mx, my - off) || outsideAt(mx, my + off) : outsideAt(mx - off, my) || outsideAt(mx + off, my);
  }
  rooms.sort((a, b) => a.y - b.y || a.x - b.x);
  rooms.forEach((r, i) => { r.number = String(101 + i); r.name = 'ROOM'; });
  const untraced = best.thickPx ? Math.max(0, 1 - best.covered / best.thickPx) * 100 : 0;
  return { walls, openings, rooms, thick: best.thick, rc: best.rc, untracedPct: untraced, danglingEnds: dangling, closed: rooms.length > 0, wallPx: best.thick };
}

// ---------- scale from door widths (fallback) ----------
/** Interior doors are usually 3'-0": the median door opening gives a rough scale (about ±10 %). */
export function scaleFromDoors(ops: PlanOpening[]): number | null {
  const w = (o: PlanOpening) => Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
  let d = ops.filter((o) => o.kind === 'door' && !o.exterior).map(w);
  if (d.length < 3) d = ops.filter((o) => o.kind === 'door').map(w);
  d.sort((a, b) => a - b);
  if (d.length < 2) return null;
  return 3 / d[Math.floor(d.length / 2)];
}

// ---------- names from sheet text ----------
const NOT_NAME = /(\d+'\s*-?\s*\d*"?|\d+\/\d+"|scale|plan$|^n$|north|sheet|drawn|date|rev|project|^[a-z]?\d{1,2}$|=)/i;
/** Puts room names (OFFICE, CORRIDOR, MECH.) and numbers (101, 1.02) printed on the plan onto the rooms they sit in. */
export function nameRooms(rooms: PlanRoom[], texts: PlanText[]): void {
  for (const r of rooms) {
    const inside = texts.filter((t) => t.x >= r.bx[0] && t.x <= r.bx[2] && t.y >= r.bx[1] && t.y <= r.bx[3]);
    const num = inside.find((t) => /^[A-Z]?\d{2,4}[A-Z]?$|^\d\.\d{2}$/.test(t.text.trim()));
    const nm = inside.filter((t) => /[A-Za-z]{3,}/.test(t.text) && !NOT_NAME.test(t.text.trim())).sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];
    if (num) r.number = num.text.trim();
    if (nm) r.name = nm.text.trim().toUpperCase().slice(0, 28);
  }
}

// ---------- grading ----------
export function grade(m: PlanMetrics, scale: PlanScale, source: SourceKind): PlanQuality {
  const issues: QualityIssue[] = []; let score = 100;
  const add = (sev: QualityIssue['severity'], id: string, title: string, detail: string, fix: string, cost: number) => { issues.push({ id, severity: sev, title, detail, fix }); score -= cost; };
  const raster = source === 'image' || source === 'pdf-scan' || source === 'svg';
  const minDim = Math.min(m.widthPx, m.heightPx);
  if (raster) {
    if (minDim < 700) add('bad', 'res', 'Resolution too low', `The image is ${m.widthPx} × ${m.heightPx} px. Walls and door openings are only a few pixels wide, so sizes cannot be measured reliably.`, 'Rescan at 300 DPI (at least 2500 px on the long side), or export the PDF straight from the CAD program instead of a screenshot.', 30);
    else if (minDim < 1200) add('warn', 'res', 'Resolution is marginal', `The image is ${m.widthPx} × ${m.heightPx} px. Thin walls and small rooms may be missed.`, 'Scan at 300 DPI or larger; for photos, move closer so the plan fills the frame.', 10);
    if (m.contrast < 0.3) add('bad', 'contrast', 'Low contrast', `Lines are faint against the paper (contrast ${(m.contrast * 100).toFixed(0)} %). Faded prints, pencil and blueline copies trace poorly.`, 'Scan in black & white (line art) or grayscale with the contrast raised; use the original drawing, not a copy of a copy.', 25);
    else if (m.contrast < 0.45) add('warn', 'contrast', 'Contrast could be better', `Contrast ${(m.contrast * 100).toFixed(0)} %.`, 'Scan in grayscale or black & white with a white background.', 8);
    if (m.sharpness < 30) add('bad', 'blur', 'Image is blurry', 'Edges are soft, so wall faces and door gaps cannot be found exactly (out of focus, motion blur or heavy compression).', 'Rescan, or retake the photo in good light with the camera held steady; save as PNG or high-quality JPG.', 25);
    else if (m.sharpness < 55) add('warn', 'blur', 'Slightly soft', 'Some edges are soft.', 'Use a flatbed scanner or a sharper photo; avoid heavy JPG compression.', 8);
    if (Math.abs(m.skewDeg) > 1.5) add(Math.abs(m.skewDeg) > 4 ? 'bad' : 'warn', 'skew', `Sheet is rotated ${Math.abs(m.skewDeg).toFixed(1)}°`, 'Walls are not square to the image, so straight walls trace as broken pieces.', 'Lay the sheet straight on the scanner glass, or straighten (deskew) the image before uploading.', Math.abs(m.skewDeg) > 4 ? 25 : 10);
    if (m.squareShare < 0.45) add('warn', 'perspective', 'Plan is not square to the camera', 'Most lines are at an angle. This usually means a photo taken at a slant (perspective), or a plan with many angled or curved walls.', 'Photograph straight down from above, with all four sheet edges visible, or scan the sheet. Angled walls are drawn as you trace them on the 2D plan.', 12);
    if (m.colorful > 0.18) add('warn', 'color', 'Colour photo or colour markups', 'Colour (markups, shading, a desk around the sheet) can be read as walls.', 'Scan in grayscale; crop to the drawing; use a clean sheet without redline markups.', 6);
    if (m.inkPct > 35) add('bad', 'dark', 'Too dark / heavily shaded', `${m.inkPct.toFixed(0)} % of the image is dark: shadows, a dark background or solid fills hide the walls.`, 'Scan with even light on white paper; turn off hatch and fill layers when plotting.', 20);
    else if (m.inkPct < 0.6) add('bad', 'blank', 'Almost no linework found', 'The file looks blank or the lines are too thin to see.', 'Check the right page was uploaded and plot with line weights on.', 30);
  }
  if (m.walls < 4) add('bad', 'walls', 'Walls not found', `Only ${m.walls} wall${m.walls === 1 ? '' : 's'} could be traced.`, 'Upload a floor plan (not an elevation, section or site plan) where walls are drawn as solid (poché) or double lines.', 35);
  else if (!m.closed) add('bad', 'closed', 'Building outline is not closed', 'The outside walls do not form a closed outline, so rooms and areas cannot be measured.', 'Upload the whole floor on one sheet (not a partial or match-line sheet), and make sure exterior walls are shown.', 25);
  if (m.danglingEnds > Math.max(6, m.walls * 0.5)) add('warn', 'ends', 'Many walls end without meeting', `${m.danglingEnds} wall ends do not meet another wall.`, 'Higher resolution or a CAD export helps; check corners on the 2D plan and fix any that are off.', 8);
  if (m.untracedPct > 25 && m.walls >= 4) add('warn', 'untraced', 'Some walls not traced', `About ${m.untracedPct.toFixed(0)} % of the heavy linework is not a straight, square wall (angled or curved walls, columns, casework or furniture).`, 'Turn off furniture, casework and hatch layers before export; angled walls can be added by hand.', 8);
  if (scale.from === 'none') add('bad', 'scale', 'Scale unknown', 'No scale notation or known dimension, so the plan cannot be sized.', 'Enter one known dimension (for example the overall building length from the dimension string), or calibrate by clicking both ends of a dimension line. Include the scale note (e.g. 1/4" = 1\'-0") in the title block.', 30);
  else if (scale.from === 'estimated') add('bad', 'scale', 'Scale is only estimated', scale.note, 'Enter one known dimension or calibrate two points so every size is exact.', 20);
  else if (scale.from === 'notation') add('info', 'scale', 'Scale read from the sheet', scale.note + ' Check one dimension to confirm the sheet was printed at 100 % (not "fit to page").', 'Enter a known dimension to confirm.', 0);
  if (source === 'pdf-vector' || source === 'dxf') add('info', 'source', source === 'dxf' ? 'CAD drawing' : 'Vector PDF', 'Linework comes straight from CAD, which gives the most accurate model.', '—', 0);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const gr = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
  const accurate = !issues.some((i) => i.severity === 'bad') && score >= 75;
  return { score, grade: gr, accurate, issues, metrics: m };
}

export interface AnalyzeInput {
  g: Gray; colorful?: number; source: SourceKind; dpi?: number | null;
  /** Known scale (CAD units, sheet notation). */
  scale?: PlanScale; texts?: PlanText[];
}
/** Whole pipeline: measure, trace, size, name, grade. */
export function analyzePlan(inp: AnalyzeInput): Pick<FloorPlanImport, 'w' | 'h' | 'scale' | 'walls' | 'openings' | 'rooms' | 'quality' | 'tuned'> {
  const { g } = inp; const th = otsu(g), dark = new Uint8Array(g.d.length); for (let i = 0; i < g.d.length; i++) dark[i] = g.d[i] <= th ? 1 : 0;
  const ms = measures(g, dark);
  let scale: PlanScale = inp.scale ?? { ftPerPx: null, from: 'none', note: '' };
  const det = detect(g, { ftPerPx: scale.ftPerPx });
  if (!scale.ftPerPx) { const f = scaleFromDoors(det.openings); if (f) scale = { ftPerPx: f, from: 'estimated', note: 'Scale estimated from the door openings (assumes 3\'-0" interior doors, about ±10 %).' }; }
  else if (scale.from !== 'estimated') { const again = detect(g, { ftPerPx: scale.ftPerPx, rc: det.rc, thick: det.thick }); Object.assign(det, again); }
  if (inp.texts?.length) nameRooms(det.rooms, inp.texts);
  const metrics: PlanMetrics = { widthPx: g.w, heightPx: g.h, dpi: inp.dpi ?? null, contrast: ms.contrast, sharpness: ms.sharpness, skewDeg: ms.skewDeg, squareShare: ms.squareShare, inkPct: ms.inkPct, colorful: inp.colorful ?? 0,
    wallPx: det.wallPx, walls: det.walls.length, openings: det.openings.length, rooms: det.rooms.length, untracedPct: det.untracedPct, danglingEnds: det.danglingEnds, closed: det.closed };
  return { w: g.w, h: g.h, scale, walls: det.walls, openings: det.openings, rooms: det.rooms, quality: grade(metrics, scale, inp.source), tuned: { rc: det.rc, thick: det.thick } };
}

/** New grade after the scale or the traced plan changes by hand (calibration, edits). */
export function regrade(p: FloorPlanImport): PlanQuality {
  const m = { ...p.quality.metrics, walls: p.walls.length, openings: p.openings.length, rooms: p.rooms.length, closed: p.rooms.length > 0 || p.quality.metrics.closed };
  return grade(m, p.scale, p.source);
}

// ---------- results in feet ----------
export interface PlanFt {
  L: number; W: number; ox: number; oy: number; k: number;
  walls: (PlanWall & { lenFt: number; thickFt: number })[]; openings: (PlanOpening & { widthFt: number })[];
  rooms: (PlanRoom & { areaSf: number })[]; grossSf: number; netSf: number;
}
/** The plan in feet: building outline from 0, 0 (top-left), every wall, opening and room. */
export function planInFeet(p: Pick<FloorPlanImport, 'walls' | 'openings' | 'rooms' | 'scale'>): PlanFt {
  const k = p.scale.ftPerPx ?? 0;
  const xs = p.walls.flatMap((w) => [w.x1, w.x2]), ys = p.walls.flatMap((w) => [w.y1, w.y2]);
  const pad = Math.max(0, ...p.walls.map((w) => w.thick / 2));
  const ox = xs.length ? Math.min(...xs) - pad : 0, oy = ys.length ? Math.min(...ys) - pad : 0;
  const L = xs.length ? (Math.max(...xs) + pad - ox) * k : 0, W = ys.length ? (Math.max(...ys) + pad - oy) * k : 0;
  const tx = (x: number) => (x - ox) * k, ty = (y: number) => (y - oy) * k;
  const walls = p.walls.map((w) => ({ ...w, x1: tx(w.x1), y1: ty(w.y1), x2: tx(w.x2), y2: ty(w.y2), thick: w.thick * k, lenFt: Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * k, thickFt: w.thick * k }));
  const openings = p.openings.map((o) => ({ ...o, x1: tx(o.x1), y1: ty(o.y1), x2: tx(o.x2), y2: ty(o.y2), thick: o.thick * k, widthFt: Math.hypot(o.x2 - o.x1, o.y2 - o.y1) * k }));
  const rooms = p.rooms.map((r) => ({ ...r, x: tx(r.x), y: ty(r.y), bx: [tx(r.bx[0]), ty(r.bx[1]), tx(r.bx[2]), ty(r.bx[3])] as [number, number, number, number], areaSf: r.px * k * k }));
  return { L, W, ox, oy, k, walls, openings, rooms, grossSf: L * W, netSf: rooms.reduce((a, r) => a + r.areaSf, 0) };
}

/** Scale from a known distance between two points (calibration) or a known overall length. */
export function calibrate(px: number, ft: number): PlanScale { return { ftPerPx: ft / px, from: 'calibrated', note: `Calibrated: ${px.toFixed(0)} px = ${fmtFtIn(ft)}.` }; }

/** Door, window and room schedules (industry layout: Mark, Size, Type, Location). */
export function schedules(f: PlanFt, level = '') {
  const pre = level.match(/\d+/)?.[0] ?? '1';
  const doors = f.openings.filter((o) => o.kind === 'door').map((o, i) => ({ mark: `${pre}${String(i + 1).padStart(2, '0')}`, width: fmtFtIn(o.widthFt), height: `7'-0"`, type: o.widthFt > 4.5 ? 'PAIR' : 'SINGLE', loc: o.exterior ? 'EXTERIOR' : 'INTERIOR' }));
  const windows = f.openings.filter((o) => o.kind === 'window').map((o, i) => ({ mark: String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : ''), width: fmtFtIn(o.widthFt), loc: o.exterior ? 'EXTERIOR' : 'INTERIOR' }));
  const rooms = f.rooms.map((r) => ({ number: r.number, name: r.name, area: Math.round(r.areaSf) }));
  return { doors, windows, rooms };
}

// ---------- DXF (CAD) ----------
export interface DxfLine { x1: number; y1: number; x2: number; y2: number; layer: string }
/** Reads LINE, LWPOLYLINE and POLYLINE/VERTEX linework and TEXT/MTEXT from an ASCII DXF, plus its drawing units. */
export function readDxf(text: string): { lines: DxfLine[]; texts: { text: string; x: number; y: number; layer: string }[]; unitsFt: number | null; unitsName: string } {
  const rows = text.split(/\r?\n/); const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < rows.length; i += 2) pairs.push([parseInt(rows[i].trim(), 10), rows[i + 1].trim()]);
  let ins = 0; for (let i = 0; i < pairs.length - 2; i++) if (pairs[i][0] === 9 && pairs[i][1] === '$INSUNITS') { ins = parseInt(pairs[i + 1][1], 10) || 0; break; }
  const U: Record<number, [number, string]> = { 1: [1 / 12, 'inches'], 2: [1, 'feet'], 4: [1 / 304.8, 'millimetres'], 5: [1 / 30.48, 'centimetres'], 6: [1 / 0.3048, 'metres'] };
  const lines: DxfLine[] = [], texts: { text: string; x: number; y: number; layer: string }[] = [];
  let inEnt = false;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 2 && pairs[i][1] === 'ENTITIES' ) inEnt = true;
    if (!inEnt || pairs[i][0] !== 0) continue;
    const type = pairs[i][1]; const g: Record<number, string[]> = {}; let j = i + 1;
    for (; j < pairs.length && pairs[j][0] !== 0; j++) (g[pairs[j][0]] ??= []).push(pairs[j][1]);
    const f = (c: number, k = 0) => parseFloat(g[c]?.[k] ?? 'NaN'); const layer = g[8]?.[0] ?? '0';
    if (type === 'LINE') lines.push({ x1: f(10), y1: f(20), x2: f(11), y2: f(21), layer });
    else if (type === 'LWPOLYLINE') { const xs = g[10] ?? [], ys = g[20] ?? []; const closed = (parseInt(g[70]?.[0] ?? '0', 10) & 1) === 1; for (let k = 0; k + 1 < xs.length; k++) lines.push({ x1: +xs[k], y1: +ys[k], x2: +xs[k + 1], y2: +ys[k + 1], layer }); if (closed && xs.length > 2) lines.push({ x1: +xs[xs.length - 1], y1: +ys[ys.length - 1], x2: +xs[0], y2: +ys[0], layer }); }
    else if (type === 'POLYLINE') {
      const pts: [number, number][] = []; const closed = (parseInt(g[70]?.[0] ?? '0', 10) & 1) === 1; let k = j;
      while (k < pairs.length && !(pairs[k][0] === 0 && pairs[k][1] === 'SEQEND')) { if (pairs[k][0] === 0 && pairs[k][1] === 'VERTEX') { let x = NaN, y = NaN; let m = k + 1; for (; m < pairs.length && pairs[m][0] !== 0; m++) { if (pairs[m][0] === 10) x = +pairs[m][1]; if (pairs[m][0] === 20) y = +pairs[m][1]; } pts.push([x, y]); k = m; } else k++; }
      for (let a = 0; a + 1 < pts.length; a++) lines.push({ x1: pts[a][0], y1: pts[a][1], x2: pts[a + 1][0], y2: pts[a + 1][1], layer });
      if (closed && pts.length > 2) lines.push({ x1: pts[pts.length - 1][0], y1: pts[pts.length - 1][1], x2: pts[0][0], y2: pts[0][1], layer });
      j = k;
    }
    else if (type === 'TEXT' || type === 'MTEXT') texts.push({ text: (g[1]?.join('') ?? '').replace(/\\P/g, ' ').replace(/\{\\[^;]*;|\}|\\[A-Za-z][^;]*;/g, ''), x: f(10), y: f(20), layer });
    i = j - 1;
  }
  const u = U[ins];
  return { lines: lines.filter((l) => [l.x1, l.y1, l.x2, l.y2].every(Number.isFinite)), texts, unitsFt: u ? u[0] : null, unitsName: u ? u[1] : 'not set' };
}

/** AIA / US National CAD Standard wall layers (A-WALL, A-WALL-EXTR, I-WALL…), else any layer named like a wall. */
export const isWallLayer = (l: string) => /(^|[-_ ])WALL/i.test(l);

/** Draws DXF linework onto a grey sheet at about `maxPx` on the long side; returns the image and feet per pixel. */
export function rasterDxf(d: ReturnType<typeof readDxf>, maxPx = 2400): { g: Gray; ftPerPx: number | null; texts: PlanText[]; wallLayers: boolean } {
  const wallOnly = d.lines.some((l) => isWallLayer(l.layer)) ? d.lines.filter((l) => isWallLayer(l.layer)) : d.lines;
  const xs = wallOnly.flatMap((l) => [l.x1, l.x2]), ys = wallOnly.flatMap((l) => [l.y1, l.y2]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0) || 1, margin = 40, k = (maxPx - 2 * margin) / span;
  const w = Math.ceil((x1 - x0) * k) + 2 * margin, h = Math.ceil((y1 - y0) * k) + 2 * margin; const g: Gray = { w, h, d: new Uint8Array(w * h).fill(255) };
  const P = (x: number, y: number): [number, number] => [(x - x0) * k + margin, (y1 - y) * k + margin];
  for (const l of wallOnly) { const [ax, ay] = P(l.x1, l.y1), [bx, by] = P(l.x2, l.y2); line(g, ax, ay, bx, by, 2); }
  const unitsFt = d.unitsFt ?? 1 / 12;
  // double-line walls: fill between two parallel faces 2" to 16" apart, where they overlap (solid poché, like a plotted plan)
  const lo = 2 / 12 / unitsFt, hi = 16 / 12 / unitsFt;
  for (let i = 0; i < wallOnly.length; i++) for (let j = i + 1; j < wallOnly.length; j++) {
    const a = wallOnly[i], b = wallOnly[j], ax = a.x2 - a.x1, ay = a.y2 - a.y1, la = Math.hypot(ax, ay); if (la < lo) continue;
    const ux = ax / la, uy = ay / la, bx = b.x2 - b.x1, by = b.y2 - b.y1, lb = Math.hypot(bx, by); if (lb < lo) continue;
    if (Math.abs(ux * by - uy * bx) / lb > 0.02) continue; // not parallel
    const dist = (b.x1 - a.x1) * -uy + (b.y1 - a.y1) * ux; if (Math.abs(dist) < lo || Math.abs(dist) > hi) continue;
    const t1 = (b.x1 - a.x1) * ux + (b.y1 - a.y1) * uy, t2 = (b.x2 - a.x1) * ux + (b.y2 - a.y1) * uy;
    const s0 = Math.max(0, Math.min(t1, t2)), s1 = Math.min(la, Math.max(t1, t2)); if (s1 - s0 < lo) continue;
    const q = [[s0, 0], [s1, 0], [s1, dist], [s0, dist]].map(([t, n]) => P(a.x1 + ux * t - uy * n, a.y1 + uy * t + ux * n));
    fillPoly(g, q);
  }
  const texts = d.texts.map((t) => { const [x, y] = P(t.x, t.y); return { text: t.text, x, y }; });
  return { g, ftPerPx: unitsFt / k, texts, wallLayers: wallOnly !== d.lines };
}

/** Thick dark line on a grey image (used for DXF sheets and test drawings). */
export function line(g: Gray, x1: number, y1: number, x2: number, y2: number, t: number, v = 0) {
  const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(len)), r = t / 2;
  for (let i = 0; i <= n; i++) { const cx = x1 + ((x2 - x1) * i) / n, cy = y1 + ((y2 - y1) * i) / n;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r) - (t <= 1 ? 1 : 0); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r) - (t <= 1 ? 1 : 0); x++) if (x >= 0 && y >= 0 && x < g.w && y < g.h && Math.abs(x + 0.5 - cx) <= r + 0.01 && Math.abs(y + 0.5 - cy) <= r + 0.01) g.d[y * g.w + x] = v; }
}
/** Fills a convex polygon (scanline). */
export function fillPoly(g: Gray, pts: [number, number][], v = 0) {
  const ys = pts.map((p) => p[1]), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(g.h - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) { const yc = y + 0.5, xs: number[] = [];
    for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]; if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay)); }
    if (xs.length < 2) continue; const a = Math.min(...xs), b = Math.max(...xs);
    for (let x = Math.max(0, Math.round(a)); x < Math.min(g.w, Math.round(b)); x++) g.d[y * g.w + x] = v; }
}
export function fillRect(g: Gray, x1: number, y1: number, x2: number, y2: number, v = 0) { for (let y = Math.max(0, Math.round(y1)); y < Math.min(g.h, Math.round(y2)); y++) for (let x = Math.max(0, Math.round(x1)); x < Math.min(g.w, Math.round(x2)); x++) g.d[y * g.w + x] = v; }

// ---------- into the project ----------
export const extOfName = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
/** Accepted uploads and what to do with the others. */
export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.dxf,image/*,application/pdf';
export function fileProblem(name: string): string | null {
  const e = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
  if (['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'dxf'].includes(e)) return null;
  if (e === 'dwg') return 'DWG is AutoCAD\'s own closed format. In AutoCAD, Revit or another CAD program, use Save As → DXF (any version) or Plot → DWG To PDF, then upload that file.';
  if (['rvt', 'skp', 'pln', 'ifc'].includes(e)) return `.${e} models cannot be read here. Export the floor plan view as DXF or PDF (vector) and upload that.`;
  if (['tif', 'tiff', 'heic', 'heif'].includes(e)) return `.${e} images do not open in the browser. Save the scan as PDF, PNG or JPG and upload that.`;
  return `.${e || '?'} is not a floor plan format this page reads. Use PDF, DXF, JPG, PNG, WebP, GIF, BMP or SVG.`;
}

export const PLAN_LAYERS: { id: string; label: string; tip: string; aia: string }[] = [
  { id: 'underlay', label: 'Original sheet (underlay)', tip: 'The uploaded drawing under the traced plan, to check the tracing.', aia: 'A-ANNO-REFR' },
  { id: 'wall-ext', label: 'Exterior walls', tip: 'Outside walls (A-WALL-EXTR).', aia: 'A-WALL-EXTR' },
  { id: 'wall-int', label: 'Interior walls', tip: 'Partitions (A-WALL-INTR).', aia: 'A-WALL-INTR' },
  { id: 'doors', label: 'Doors and swings', tip: 'Door openings with 90° swings and door marks (A-DOOR).', aia: 'A-DOOR' },
  { id: 'windows', label: 'Windows / glazing', tip: 'Windows and storefront (A-GLAZ) with window marks.', aia: 'A-GLAZ' },
  { id: 'rooms', label: 'Room tags (name, number, area)', tip: 'Room name, number and area in square feet (A-AREA-IDEN).', aia: 'A-AREA-IDEN' },
  { id: 'dims', label: 'Dimensions', tip: 'Overall dimension strings in feet-inches (A-ANNO-DIMS).', aia: 'A-ANNO-DIMS' },
  { id: 'annot', label: 'North arrow, scale and title', tip: 'North arrow, graphic scale and the drawing title (A-ANNO-SYMB).', aia: 'A-ANNO-SYMB' },
];

/** Floor plan walls as model walls (feet) for the 2D & 3D models, materials from the building spec. */
export function planModelWalls(plans: FloorPlanImport[], mat: { exterior: string; partition: string; window: string; door: string }, colors: Record<string, { color: string }>) {
  const out: { layer: string; floor: number; x1: number; y1: number; x2: number; y2: number; material: string; color: string; ratedHr: number; part: string }[] = [];
  for (const p of plans.filter((x) => x.integrated && x.scale.ftPerPx)) {
    const f = planInFeet(p);
    for (const w of f.walls) { const m = w.exterior ? mat.exterior : mat.partition; out.push({ layer: 'base:walls', floor: p.floor, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, material: m, color: colors[m]?.color ?? '#555', ratedHr: 0, part: w.exterior ? 'Exterior wall (floor plan)' : 'Interior wall (floor plan)' }); }
    for (const o of f.openings) { const m = o.kind === 'window' ? mat.window : mat.door; out.push({ layer: 'base:walls', floor: p.floor, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, material: m, color: colors[m]?.color ?? '#999', ratedHr: 0, part: o.kind === 'window' ? 'Window (floor plan)' : 'Door (floor plan)' }); }
  }
  return out;
}

/** What integrating plans changes in the project plan: building size, floors, rooms, doors, ceiling. */
export function integrationValues(plans: FloorPlanImport[]) {
  const ok = plans.filter((p) => p.integrated && p.scale.ftPerPx); if (!ok.length) return null;
  const fs = ok.map((p) => planInFeet(p));
  return {
    lengthFt: +Math.max(...fs.map((f) => f.L)).toFixed(2), widthFt: +Math.max(...fs.map((f) => f.W)).toFixed(2), floors: Math.max(...ok.map((p) => p.floor + 1)),
    rooms: fs.reduce((a, f) => a + f.rooms.length, 0), exteriorDoors: fs.reduce((a, f) => a + f.openings.filter((o) => o.kind === 'door' && o.exterior).length, 0),
    ceilingFt: ok[0].ceilingFt, floorHeightFt: Math.max(ok[0].wallHeightFt + 2, ok[0].ceilingFt + 2),
  };
}

/** AIA-layer DXF of the traced plan in feet (opens in AutoCAD, Revit, BricsCAD…). */
export function planDxf(p: FloorPlanImport): string {
  const f = planInFeet(p), ents: DxfEnt[] = [];
  const Y = (y: number) => f.W - y;
  for (const w of f.walls) {
    const h = isH(w), t = w.thickFt / 2;
    const a = h ? [[w.x1, w.y1 - t, w.x2, w.y2 - t], [w.x1, w.y1 + t, w.x2, w.y2 + t]] : [[w.x1 - t, w.y1, w.x2 - t, w.y2], [w.x1 + t, w.y1, w.x2 + t, w.y2]];
    for (const s of a) ents.push({ t: 'line', layer: w.exterior ? 'A-WALL-EXTR' : 'A-WALL-INTR', x1: s[0], y1: Y(s[1]), x2: s[2], y2: Y(s[3]) });
  }
  for (const o of f.openings) ents.push({ t: 'line', layer: o.kind === 'door' ? 'A-DOOR' : 'A-GLAZ', x1: o.x1, y1: Y(o.y1), x2: o.x2, y2: Y(o.y2) });
  for (const r of f.rooms) { ents.push({ t: 'text', layer: 'A-AREA-IDEN', x: r.x, y: Y(r.y), h: 0.75, s: `${r.name} ${r.number}` }); ents.push({ t: 'text', layer: 'A-AREA-IDEN', x: r.x, y: Y(r.y) - 1.1, h: 0.6, s: `${Math.round(r.areaSf)} SF` }); }
  return writeDxf([{ name: 'A-WALL-EXTR', color: 7 }, { name: 'A-WALL-INTR', color: 8 }, { name: 'A-DOOR', color: 3 }, { name: 'A-GLAZ', color: 4 }, { name: 'A-AREA-IDEN', color: 2 }], ents);
}

// ---------- drawing scales and sheets ----------
/** Standard drawing scales: architectural, engineering and metric. ftPerIn = real feet per paper inch. */
export const STD_SCALES: ScaleNote[] = [
  ...([['1/16', 1 / 16], ['3/32', 3 / 32], ['1/8', 1 / 8], ['3/16', 3 / 16], ['1/4', 1 / 4], ['3/8', 3 / 8], ['1/2', 1 / 2], ['3/4', 3 / 4], ['1', 1], ['1-1/2', 1.5], ['3', 3]] as [string, number][]).map(([l, i]) => ({ label: `${l}" = 1'-0"`, ftPerIn: 1 / i })),
  ...[10, 20, 30, 40, 50, 60, 100].map((f) => ({ label: `1" = ${f}'`, ftPerIn: f })),
  ...[20, 50, 100, 200, 500].map((r) => ({ label: `1:${r}`, ftPerIn: r / 12 })),
];
/** Sheet sizes in inches (landscape), ANSI and ARCH. */
export const SHEETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'ansi-a', label: 'ANSI A (Letter) 11 × 8.5 in', w: 11, h: 8.5 }, { id: 'ansi-b', label: 'ANSI B (Tabloid) 17 × 11 in', w: 17, h: 11 },
  { id: 'arch-c', label: 'ARCH C 24 × 18 in', w: 24, h: 18 }, { id: 'ansi-d', label: 'ANSI D 34 × 22 in', w: 34, h: 22 },
  { id: 'arch-d', label: 'ARCH D 36 × 24 in', w: 36, h: 24 }, { id: 'arch-e1', label: 'ARCH E1 42 × 30 in', w: 42, h: 30 }, { id: 'arch-e', label: 'ARCH E 48 × 36 in', w: 48, h: 36 },
];
/** Drawing area on a sheet: 1/2" border all round, title block strip 3" down the right side (or 1.5" on small sheets). */
export const drawArea = (s: { w: number; h: number }) => ({ w: s.w - 1 - (s.w >= 24 ? 3 : 1.5), h: s.h - 1 });
/** A custom scale typed like 3/32" = 1'-0", 1" = 15', 1:75, or 1/4. */
export function parseScale(s: string): ScaleNote | null {
  const t = s.trim(); if (!t) return null;
  const f = findScales(/=|:/.test(t) ? t : `${t}" = 1'-0"`).scales[0]; if (f) return f;
  const m = /^1\s*"?\s*=\s*(\d+(?:\.\d+)?)\s*'?$/.exec(t); return m ? { label: `1" = ${m[1]}'`, ftPerIn: +m[1] } : null;
}
/** Largest standard scale of the same family at which a building L × W ft (plus margins for dimensions) fits the sheet. */
export function fitScale(Lft: number, Wft: number, sheet: { w: number; h: number }, family: 'arch' | 'eng' | 'metric' = 'arch'): ScaleNote | null {
  const a = drawArea(sheet), list = STD_SCALES.filter((s) => (family === 'arch' ? s.label.includes("1'-0") : family === 'eng' ? /^1" = \d/.test(s.label) : s.label.startsWith('1:'))).sort((x, y) => x.ftPerIn - y.ftPerIn);
  const need = (s: ScaleNote) => ({ w: (Lft * 1.18) / s.ftPerIn, h: (Wft * 1.3) / s.ftPerIn });
  return list.find((s) => need(s).w <= a.w && need(s).h <= a.h) ?? null;
}
/** Paper size of the plan drawing at a scale (inches), with room for dimensions and the title. */
export const paperSize = (Lft: number, Wft: number, s: ScaleNote) => ({ w: (Lft * 1.18) / s.ftPerIn, h: (Wft * 1.3) / s.ftPerIn });

/** A new plan drawn to scale from the building's outside size: four exterior walls, ready to add rooms, doors and windows. */
export function blankPlan(Lft: number, Wft: number, o: { floor: number; level: string; ceilingFt: number; wallHeightFt: number; extThickIn?: number }): FloorPlanImport {
  const k = 1 / 24, m = 48, t = (o.extThickIn ?? 8) / 12 / k, w = Math.round(Lft / k) + 2 * m, h = Math.round(Wft / k) + 2 * m;
  const x1 = m + t / 2, y1 = m + t / 2, x2 = w - m - t / 2, y2 = h - m - t / 2;
  const walls: PlanWall[] = [[x1, y1, x2, y1], [x2, y1, x2, y2], [x1, y2, x2, y2], [x1, y1, x1, y2]].map(([a, b, c, d]) => ({ id: uidp('w'), x1: a, y1: b, x2: c, y2: d, thick: t, exterior: true }));
  const rooms: PlanRoom[] = [{ id: uidp('r'), number: '101', name: 'OPEN AREA', x: w / 2, y: h / 2, px: (x2 - x1 - t) * (y2 - y1 - t), bx: [x1, y1, x2, y2] }];
  const metrics: PlanMetrics = { widthPx: w, heightPx: h, dpi: null, contrast: 1, sharpness: 127, skewDeg: 0, squareShare: 1, inkPct: 2, colorful: 0, wallPx: t, walls: 4, openings: 0, rooms: 1, untracedPct: 0, danglingEnds: 0, closed: true };
  const scale: PlanScale = { ftPerPx: k, from: 'dimension', note: `Drawn to scale from the building size ${fmtFtIn(Lft)} × ${fmtFtIn(Wft)}.` };
  return { id: 'fp' + Date.now().toString(36), name: 'Drawn in LvPlan Pro', fileType: 'new', size: 0, addedAt: new Date().toISOString(), source: 'drawn', floor: o.floor, level: o.level, ceilingFt: o.ceilingFt, wallHeightFt: o.wallHeightFt,
    w, h, scale, walls, openings: [], rooms, quality: grade(metrics, scale, 'drawn') };
}

/** Recomputes rooms after walls are added or moved by hand (keeps the names of rooms that stay put). */
export function reRoom(p: FloorPlanImport): PlanRoom[] {
  const thick = Math.max(2, ...p.walls.map((w) => w.thick));
  const min = p.scale.ftPerPx ? 12 / (p.scale.ftPerPx ** 2) : (thick * 14) ** 2;
  const { rooms } = roomsAndOutside(p.walls, p.openings, p.w, p.h, thick, min);
  rooms.sort((a, b) => a.y - b.y || a.x - b.x);
  return rooms.map((r, i) => { const old = p.rooms.find((o) => o.x >= r.bx[0] && o.x <= r.bx[2] && o.y >= r.bx[1] && o.y <= r.bx[3]); return { ...r, number: old?.number ?? String(101 + i), name: old?.name ?? 'ROOM', id: old?.id ?? r.id }; });
}

/** Adds a wall between two points (snapped square to the plan); a wall drawn over an existing wall's gap is a door or window. */
export function addWall(p: FloorPlanImport, a: [number, number], b: [number, number], exterior: boolean, thickIn: number): FloorPlanImport {
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const t = p.scale.ftPerPx ? thickIn / 12 / p.scale.ftPerPx : Math.max(4, ...p.walls.map((w) => w.thick));
  const wl: PlanWall = horiz ? { id: uidp('w'), x1: Math.min(a[0], b[0]), y1: a[1], x2: Math.max(a[0], b[0]), y2: a[1], thick: t, exterior } : { id: uidp('w'), x1: a[0], y1: Math.min(a[1], b[1]), x2: a[0], y2: Math.max(a[1], b[1]), thick: t, exterior };
  const walls = [...p.walls, wl]; snap(walls, t);
  const n = { ...p, walls }; n.rooms = reRoom(n); return n;
}
/** Adds a door or window between two points on a wall: the wall is split and the opening placed in the gap. */
export function addOpening(p: FloorPlanImport, a: [number, number], b: [number, number], kind: 'door' | 'window'): FloorPlanImport {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  let best: PlanWall | null = null, bd = Infinity;
  for (const w of p.walls) { const h = isH(w), d = h ? (mx >= Math.min(w.x1, w.x2) && mx <= Math.max(w.x1, w.x2) ? Math.abs(my - w.y1) : Infinity) : (my >= Math.min(w.y1, w.y2) && my <= Math.max(w.y1, w.y2) ? Math.abs(mx - w.x1) : Infinity); if (d < bd) { bd = d; best = w; } }
  if (!best || bd > best.thick * 4) return p;
  const h = isH(best), s = h ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), e = h ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
  const lo = h ? Math.min(best.x1, best.x2) : Math.min(best.y1, best.y2), hi = h ? Math.max(best.x1, best.x2) : Math.max(best.y1, best.y2);
  const s2 = Math.max(lo, s), e2 = Math.min(hi, e); if (e2 - s2 < 2) return p;
  const part = (u: number, v: number): PlanWall | null => (v - u < 1 ? null : h ? { ...best!, id: uidp('w'), x1: u, x2: v } : { ...best!, id: uidp('w'), y1: u, y2: v });
  const walls = p.walls.filter((w) => w !== best); for (const w of [part(lo, s2), part(e2, hi)]) if (w) walls.push(w);
  const c = h ? best.y1 : best.x1;
  const op: PlanOpening = h ? { id: uidp('o'), kind, x1: s2, y1: c, x2: e2, y2: c, thick: best.thick, exterior: best.exterior } : { id: uidp('o'), kind, x1: c, y1: s2, x2: c, y2: e2, thick: best.thick, exterior: best.exterior };
  const n = { ...p, walls, openings: [...p.openings, op] }; n.rooms = reRoom(n); return n;
}
