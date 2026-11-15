// Photo site survey: phone photos (single shots, several views, or a panorama) placed where and in the direction
// they were taken, and matched to the terrain. Works out the terrain horizon around the spot, where towers, sites,
// obstructions and drawn lines fall in each picture, and lines the pictures up into one panorama strip.
// Pure math (no DOM) so it can be tested; drawing lives in pages/PhotoSurvey.tsx.
import type { DemGrid } from './terrain';
import { sampleDem } from './terrain';
import { haversineKm, bearingDeg, destination, type LatLon } from './geo';
import { norm360, declinationDeg } from './azimuth';
import type { PhotoMeta } from './exif';

/** How a picture maps directions to pixels. rect = normal photo, cyl = phone panorama, equi = 360° photo sphere. */
export type Projection = 'rect' | 'cyl' | 'equi';

export interface SurveyPhoto {
  id: string; name: string; dataUrl: string; w: number; h: number; takenAt?: string;
  lat?: number; lon?: number; altM?: number;
  /** Degrees TRUE the middle of the picture faces; null = not known yet. */
  headingDeg: number | null;
  /** Where the direction came from: photo, phone compass, drone, matched to the terrain, or typed in. */
  headingSrc: 'photo' | 'compass' | 'drone' | 'terrain' | 'manual' | 'arranged' | 'none';
  pitchDeg: number; rollDeg: number;
  /** Width of the view, degrees left to right. */
  hfovDeg: number; proj: Projection;
  caption: string; camera?: string; hidden?: boolean;
}
export interface PhotoSpot {
  id: string; name: string; at: string; lat: number; lon: number;
  posSrc: 'photo' | 'gps' | 'map' | 'typed' | 'site';
  /** Camera height above the ground (m). */
  eyeM: number;
  photos: SurveyPhoto[]; notes: string;
  /** Picture with the overlays, saved for reports. */
  snapshot?: string; snapshotAt?: string;
  /** What is in view, saved with the snapshot for the report. */
  inView?: ViewItem[];
}
export interface ViewItem { name: string; kind: string; km: number; az: number; el: number; visible: boolean | null; blockKm?: number }

const R_EARTH = 6371000;
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
/** Signed difference a − b folded into −180…180. */
export const angDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/** Horizontal width of view (degrees) from the 35 mm equivalent focal length and the picture's shape. */
export function hfovFromFocal35(f35: number, w: number, h: number): number {
  const ar = w / Math.max(1, h), diag = 43.27; // 35 mm film diagonal
  const width = (diag * ar) / Math.sqrt(1 + ar * ar);
  return deg(2 * Math.atan(width / (2 * f35)));
}

/** Camera set-up for a new photo from what was read in the file (and sensible phone defaults). */
export function cameraFromMeta(m: PhotoMeta, w: number, h: number, when = new Date()): Pick<SurveyPhoto, 'headingDeg' | 'headingSrc' | 'pitchDeg' | 'rollDeg' | 'hfovDeg' | 'proj'> {
  let heading: number | null = m.headingDeg ?? null, src: SurveyPhoto['headingSrc'] = heading == null ? 'none' : m.dirSource === 'drone gimbal' ? 'drone' : 'photo';
  if (heading != null && m.headingRef === 'M' && m.lat != null && m.lon != null) heading = norm360(heading + declinationDeg({ lat: m.lat, lon: m.lon }, when)); // magnetic → true
  const ar = w / Math.max(1, h);
  if (m.pano) {
    const P = m.pano, hf = Math.min(360, (P.cropW / P.fullW) * 360);
    const center = P.headingDeg != null ? norm360(P.headingDeg + ((P.cropLeft + P.cropW / 2) / P.fullW - 0.5) * 360) : heading;
    // vertical middle of the crop, as an up / down angle in the full sphere
    const mid = 90 - ((P.cropTop + P.cropH / 2) / P.fullH) * 180;
    return { headingDeg: center ?? null, headingSrc: center != null ? 'photo' : 'none', pitchDeg: (P.pitchDeg ?? 0) + mid, rollDeg: P.rollDeg ?? 0, hfovDeg: hf, proj: 'equi' };
  }
  if (ar >= 2.2) { // phone panorama without tags: assume the usual ~60° tall strip
    return { headingDeg: heading, headingSrc: src, pitchDeg: m.pitchDeg ?? 0, rollDeg: 0, hfovDeg: Math.min(360, Math.round(ar * 55)), proj: 'cyl' };
  }
  const f35 = m.focal35 ?? (m.focalMm && m.focalMm > 10 ? m.focalMm : 26); // most phone main cameras are about 26 mm equivalent
  return { headingDeg: heading, headingSrc: src, pitchDeg: m.pitchDeg ?? 0, rollDeg: m.rollDeg ?? 0, hfovDeg: Math.round(hfovFromFocal35(f35, w, h) * 10) / 10, proj: 'rect' };
}

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Unit vector (east, north, up) for an azimuth and up / down angle. */
export const dirVec = (azDeg: number, elDeg: number): V3 => [Math.sin(rad(azDeg)) * Math.cos(rad(elDeg)), Math.cos(rad(azDeg)) * Math.cos(rad(elDeg)), Math.sin(rad(elDeg))];

/** Camera axes for a normal (rectilinear) photo. */
function axes(ph: Pick<SurveyPhoto, 'headingDeg' | 'pitchDeg' | 'rollDeg'>) {
  const h = ph.headingDeg ?? 0, fwd = dirVec(h, ph.pitchDeg);
  let right: V3 = [Math.cos(rad(h)), -Math.sin(rad(h)), 0];
  let up: V3 = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
  up = [-up[0], -up[1], -up[2]]; // right × fwd points down; flip to up
  if (ph.rollDeg) { const c = Math.cos(rad(ph.rollDeg)), s = Math.sin(rad(ph.rollDeg)); const r2: V3 = [right[0] * c + up[0] * s, right[1] * c + up[1] * s, right[2] * c + up[2] * s]; up = [up[0] * c - right[0] * s, up[1] * c - right[1] * s, up[2] * c - right[2] * s]; right = r2; }
  return { fwd, right, up };
}

/** A fast direction → pixel function for one photo (camera set-up worked out once). Null when outside the picture. */
export function projector(ph: SurveyPhoto, margin = 0): (azDeg: number, elDeg: number) => { x: number; y: number } | null {
  const W = ph.w, H = ph.h, cx = W / 2, cy = H / 2, inside = (x: number, y: number) => !(x < -margin || x > W + margin || y < -margin || y > H + margin);
  if (ph.proj === 'rect') {
    const { fwd, right, up } = axes(ph), f = cx / Math.tan(rad(ph.hfovDeg / 2));
    return (azDeg, elDeg) => {
      const d = dirVec(azDeg, elDeg), z = dot(d, fwd); if (z <= 1e-3) return null;
      const x = cx + (f * dot(d, right)) / z, y = cy - (f * dot(d, up)) / z;
      return inside(x, y) ? { x, y } : null;
    };
  }
  const ppd = W / ph.hfovDeg, h0 = ph.headingDeg ?? 0, half = ph.hfovDeg / 2 + margin / ppd, fr = W / rad(ph.hfovDeg), tp = Math.tan(rad(ph.pitchDeg)), equi = ph.proj === 'equi';
  return (azDeg, elDeg) => {
    const da = angDiff(azDeg, h0); if (Math.abs(da) > half) return null;
    const x = cx + da * ppd, y = equi ? cy - (elDeg - ph.pitchDeg) * ppd : cy - fr * (Math.tan(rad(elDeg)) - tp);
    return inside(x, y) ? { x, y } : null;
  };
}

/** Where a direction (azimuth °T, up / down angle) lands in a photo, in pixels; null when outside the picture. */
export function project(ph: SurveyPhoto, azDeg: number, elDeg: number, margin = 0): { x: number; y: number } | null {
  return projector(ph, margin)(azDeg, elDeg);
}

/** The direction (azimuth °T, up / down angle) seen at pixel x, y of a photo. */
export function unproject(ph: SurveyPhoto, x: number, y: number): { az: number; el: number } {
  const W = ph.w, cx = W / 2, cy = ph.h / 2;
  if (ph.proj === 'rect') {
    const { fwd, right, up } = axes(ph), f = cx / Math.tan(rad(ph.hfovDeg / 2)), a = (x - cx) / f, b = (cy - y) / f;
    const d: V3 = [fwd[0] + a * right[0] + b * up[0], fwd[1] + a * right[1] + b * up[1], fwd[2] + a * right[2] + b * up[2]];
    const n = Math.hypot(...d); return { az: norm360(deg(Math.atan2(d[0], d[1]))), el: deg(Math.asin(d[2] / n)) };
  }
  const ppd = W / ph.hfovDeg, az = norm360((ph.headingDeg ?? 0) + (x - cx) / ppd);
  const el = ph.proj === 'equi' ? ph.pitchDeg + (cy - y) / ppd : deg(Math.atan(Math.tan(rad(ph.pitchDeg)) + (cy - y) / (W / rad(ph.hfovDeg))));
  return { az, el };
}

/** Up / down angle from the eye to a point, with earth curve and normal radio refraction (k). */
export function elevAngle(distM: number, dzM: number, k = 4 / 3) { return distM <= 0 ? (dzM >= 0 ? 90 : -90) : deg(Math.atan(dzM / distM - distM / (2 * k * R_EARTH))); }

export interface Horizon {
  stepDeg: number;
  /** Highest up / down angle of the ground for each azimuth (index = az / stepDeg). */
  el: Float32Array;
  /** How far away (km) that skyline ridge is. */
  km: Float32Array;
  /** Ground height at the spot (m) and the eye height above sea level used. */
  groundM: number; eyeAmslM: number; maxKm: number;
}

/** Distances (m) to sample along each ray: close together near the camera, farther apart in the distance. */
export function raySteps(maxKm: number): number[] {
  const out: number[] = []; let d = 15;
  while (d < maxKm * 1000) { out.push(d); d += Math.max(15, d * 0.02); }
  out.push(maxKm * 1000); return out;
}

/** How far the terrain grid reaches from a spot, in km (the shortest way to its edge). */
export function demReachKm(dem: DemGrid, q: LatLon): number {
  const cy = dem.cellDegY ?? dem.cellDeg, south = dem.north - dem.nrows * cy, east = dem.west + dem.ncols * dem.cellDeg;
  const dLat = Math.min(dem.north - q.lat, q.lat - south) * 111.32, dLon = Math.min(east - q.lon, q.lon - dem.west) * 111.32 * Math.cos(rad(q.lat));
  return Math.max(0, Math.min(dLat, dLon));
}

/** The terrain skyline all the way around a spot. */
export function horizonProfile(dem: DemGrid, at: LatLon, eyeM = 1.7, o: { stepDeg?: number; maxKm?: number; k?: number; clutterM?: number } = {}): Horizon | null {
  const g0 = sampleDem(dem, at); if (g0 == null) return null;
  const step = o.stepDeg ?? 0.5, n = Math.round(360 / step), k = o.k ?? 4 / 3, clut = o.clutterM ?? 0;
  const maxKm = Math.max(0.5, Math.min(o.maxKm ?? 40, demReachKm(dem, at)));
  const eye = g0 + eyeM, steps = raySteps(maxKm), el = new Float32Array(n), km = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const az = i * step; let best = -90, bestD = 0;
    for (const d of steps) {
      const q = destination(at, az, d / 1000), z = sampleDem(dem, q); if (z == null) break;
      const a = elevAngle(d, z + (d > 200 ? clut : 0) - eye, k);
      if (a > best) { best = a; bestD = d; }
    }
    el[i] = best; km[i] = bestD / 1000;
  }
  return { stepDeg: step, el, km, groundM: g0, eyeAmslM: eye, maxKm };
}

/** The horizon angle at any azimuth (interpolated). */
export function horizonAt(h: Horizon, az: number): number {
  const n = h.el.length, x = norm360(az) / h.stepDeg, i = Math.floor(x) % n, j = (i + 1) % n, f = x - Math.floor(x);
  return h.el[i] * (1 - f) + h.el[j] * f;
}

/** A thing to show in the photos: a project site, an existing tower, a RadioReference site. */
export interface Target { name: string; kind: 'site' | 'tower' | 'rr' | 'tx' | 'rx'; lat: number; lon: number; aglM: number; note?: string }
export interface TargetView extends ViewItem { lat: number; lon: number; aglM: number; kindKey: Target['kind']; note?: string }

/** Direction, up / down angle and whether the terrain hides each target from the camera. */
export function viewTargets(dem: DemGrid | null, at: LatLon, eyeAmslM: number, targets: Target[], o: { k?: number; maxKm?: number } = {}): TargetView[] {
  const k = o.k ?? 4 / 3;
  return targets.map((t) => {
    const kmD = haversineKm(at, t), az = bearingDeg(at, t);
    const g = dem ? sampleDem(dem, t) : null, top = (g ?? eyeAmslM - 1.7) + t.aglM;
    const el = elevAngle(kmD * 1000, top - eyeAmslM, k);
    let visible: boolean | null = null, blockKm: number | undefined;
    if (dem && g != null && kmD > 0.02) {
      visible = true; const n = Math.max(20, Math.min(400, Math.round(kmD / 0.03)));
      for (let i = 1; i < n; i++) {
        const dM = (kmD * 1000 * i) / n, q = destination(at, az, dM / 1000), z = sampleDem(dem, q); if (z == null) continue;
        if (elevAngle(dM, z - eyeAmslM, k) > el + 0.02) { visible = false; blockKm = dM / 1000; break; }
      }
    }
    return { name: t.name, kind: t.kind, kindKey: t.kind, km: kmD, az, el, visible, blockKm, lat: t.lat, lon: t.lon, aglM: t.aglM, note: t.note };
  }).filter((t) => o.maxKm == null || t.km <= o.maxKm).sort((a, b) => a.km - b.km);
}

/** Group imported photos by where they were taken: shots within `radiusM` of each other make one survey spot. */
export function groupByPlace<T extends { lat?: number; lon?: number }>(items: T[], radiusM = 30): { lat: number | null; lon: number | null; items: T[] }[] {
  const groups: { lat: number | null; lon: number | null; items: T[] }[] = [];
  for (const it of items) {
    if (it.lat == null || it.lon == null) { const g = groups.find((x) => x.lat == null); if (g) g.items.push(it); else groups.push({ lat: null, lon: null, items: [it] }); continue; }
    const g = groups.find((x) => x.lat != null && haversineKm({ lat: x.lat, lon: x.lon! }, { lat: it.lat!, lon: it.lon! }) * 1000 <= radiusM);
    if (g) { g.items.push(it); const n = g.items.filter((x) => x.lat != null).length; g.lat = g.lat! + (it.lat - g.lat!) / n; g.lon = g.lon! + (it.lon - g.lon!) / n; }
    else groups.push({ lat: it.lat, lon: it.lon, items: [it] });
  }
  return groups;
}

/** The panorama strip that holds all of a spot's photos: azimuth range (°T) and up / down range. */
export interface Strip { az0: number; spanDeg: number; elTop: number; elBottom: number; ppd: number; w: number; h: number }
export function stripFor(photos: SurveyPhoto[], maxW = 3600): Strip {
  const use = photos.filter((p) => !p.hidden && p.headingDeg != null);
  let elTop = 20, elBottom = -20;
  const spans = use.map((p) => {
    const half = p.hfovDeg / 2, vf = (p.hfovDeg * p.h) / p.w; // the vertical view, near enough for the strip size
    elTop = Math.max(elTop, p.pitchDeg + vf / 2); elBottom = Math.min(elBottom, p.pitchDeg - vf / 2);
    return [norm360(p.headingDeg! - half), p.hfovDeg] as [number, number];
  });
  elTop = Math.min(60, elTop); elBottom = Math.max(-60, elBottom);
  let az0 = 0, span = 360;
  if (spans.length && spans.reduce((t, s) => t + s[1], 0) < 330) {
    // the widest empty gap between the photos is where the strip starts and ends
    const marks = spans.flatMap(([a, w]) => { const out: [number, number][] = []; for (let x = 0; x < w; x += 1) out.push([norm360(a + x), 1]); return out; });
    const cov = new Uint8Array(360); marks.forEach(([a]) => { cov[Math.floor(a) % 360] = 1; });
    if (cov.some((c) => !c)) {
      let best = 0, bestAt = 0;
      for (let s = 0; s < 360; s++) { if (cov[s] || !cov[(s + 359) % 360]) continue; let n = 0; while (n < 360 && !cov[(s + n) % 360]) n++; if (n > best) { best = n; bestAt = s; } }
      az0 = norm360(bestAt + best - 5); span = Math.min(360, 360 - best + 10);
    }
  }
  const ppd = Math.min(12, maxW / span), w = Math.round(span * ppd), h = Math.round((elTop - elBottom) * ppd);
  return { az0, spanDeg: span, elTop, elBottom, ppd, w, h };
}
export const stripX = (s: Strip, az: number) => norm360(az - s.az0) * s.ppd;
export const stripY = (s: Strip, el: number) => (s.elTop - el) * s.ppd;
export const stripAz = (s: Strip, x: number) => norm360(s.az0 + x / s.ppd);
export const stripEl = (s: Strip, y: number) => s.elTop - y / s.ppd;

/**
 * Find the skyline in a picture: for each column, the row where the bright sky ends and the darker ground starts.
 * `lum` is the brightness of each pixel (0..255) row by row. Returns NaN for columns with no clear skyline.
 */
export function detectSkyline(lum: Float32Array | Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w).fill(NaN);
  for (let x = 0; x < w; x++) {
    // sky is the bright run from the top; the skyline is the strongest drop in brightness below it
    let best = 0, at = -1; const top = lum[x];
    if (top < 90) continue; // dark at the very top: no sky in this column
    for (let y = 2; y < h * 0.9; y++) {
      const a = (lum[(y - 2) * w + x] + lum[(y - 1) * w + x]) / 2, b = (lum[(y + 1) * w + x] + lum[Math.min(h - 1, y + 2) * w + x]) / 2, drop = a - b;
      if (drop > best) { best = drop; at = y; }
      if (lum[y * w + x] < top * 0.45 && at >= 0) break; // well into the ground already
    }
    if (best > 18 && at > 0) out[x] = at;
  }
  // smooth out single-column spikes (wires, poles, birds)
  const sm = new Float32Array(w).fill(NaN);
  for (let x = 0; x < w; x++) { const v = [out[x - 2], out[x - 1], out[x], out[x + 1], out[x + 2]].filter((q) => q != null && Number.isFinite(q)).sort((a, b) => a - b); if (v.length >= 3) sm[x] = v[Math.floor(v.length / 2)]; }
  return sm;
}

/**
 * Turn a photo so its skyline lines up with the terrain horizon. Searches the direction (all the way round when
 * the photo has none) and a small up / down offset. Returns the best direction, tilt and how well it fits.
 */
export function matchHorizon(ph: SurveyPhoto, skyline: Float32Array, scale: number, hz: Horizon, o: { searchDeg?: number; pitchDeg?: number } = {}): { headingDeg: number; pitchDeg: number; errDeg: number; cols: number } | null {
  const xs: number[] = []; for (let i = 0; i < skyline.length; i += Math.max(1, Math.floor(skyline.length / 120))) if (Number.isFinite(skyline[i])) xs.push(i);
  if (xs.length < 12) return null;
  const base = { ...ph, headingDeg: 0 };
  const rel = xs.map((i) => unproject(base, i / scale, skyline[i] / scale)); // directions relative to a heading of 0
  const search = o.searchDeg ?? (ph.headingDeg == null ? 180 : 25), center = ph.headingDeg ?? 0, pRange = o.pitchDeg ?? 6;
  const fit = (h: number, dp: number) => {
    const e = rel.map((r) => Math.abs(r.el + dp - horizonAt(hz, r.az + h))).sort((a, b) => a - b);
    return e.slice(0, Math.ceil(e.length * 0.8)).reduce((t, v) => t + v, 0) / Math.ceil(e.length * 0.8); // ignore the worst 20 % (trees, buildings)
  };
  let best = { h: center, dp: 0, err: Infinity };
  for (let h = center - search; h <= center + search; h += search > 60 ? 1 : 0.5) for (let dp = -pRange; dp <= pRange; dp += 1) { const e = fit(h, dp); if (e < best.err) best = { h, dp, err: e }; }
  for (let h = best.h - 1; h <= best.h + 1; h += 0.1) for (let dp = best.dp - 1; dp <= best.dp + 1; dp += 0.1) { const e = fit(h, dp); if (e < best.err) best = { h, dp, err: e }; }
  // the relief must actually vary, or any direction fits a flat skyline equally well
  const relief = Math.max(...Array.from(hz.el)) - Math.min(...Array.from(hz.el));
  if (relief < 0.6) return null;
  return { headingDeg: norm360(best.h), pitchDeg: ph.pitchDeg + best.dp, errDeg: best.err, cols: xs.length };
}

/** Line the photos up side by side when only some (or none) have a direction: each one starts where the last ends, with a little overlap. */
export function arrangeInOrder(photos: SurveyPhoto[], overlapPct = 20): SurveyPhoto[] {
  let next: number | null = null;
  return photos.map((p) => {
    if (p.headingDeg != null && p.headingSrc !== 'arranged' && p.headingSrc !== 'none') { next = norm360(p.headingDeg + p.hfovDeg * (0.5 - overlapPct / 100)); return p; }
    const at: number = next ?? 0, h = norm360(at + p.hfovDeg / 2); next = norm360(h + p.hfovDeg * (0.5 - overlapPct / 100));
    return { ...p, headingDeg: h, headingSrc: 'arranged' as const };
  });
}

/** Ground points around a spot that the camera can see, for painting predicted signal onto the picture. */
export function visibleGround(dem: DemGrid, at: LatLon, eyeAmslM: number, az: number, maxKm: number, k = 4 / 3): { el: number; lat: number; lon: number; dM: number }[] {
  const out: { el: number; lat: number; lon: number; dM: number }[] = []; let best = -90;
  for (const d of raySteps(maxKm)) {
    const q = destination(at, az, d / 1000), z = sampleDem(dem, q); if (z == null) break;
    const a = elevAngle(d, z - eyeAmslM, k);
    if (a > best) { out.push({ el: a, lat: q.lat, lon: q.lon, dM: d }); best = a; }
  }
  return out;
}

/** Text for a direction: degrees true and compass point. */
export const POINTS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
