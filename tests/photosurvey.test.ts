import { describe, it, expect } from 'vitest';
import { readPhotoMeta, parseXmp, type PhotoMeta } from '../src/engine/exif';
import {
  hfovFromFocal35, cameraFromMeta, project, unproject, horizonProfile, horizonAt, viewTargets, groupByPlace, stripFor, stripX, arrangeInOrder,
  detectSkyline, matchHorizon, visibleGround, type SurveyPhoto,
} from '../src/engine/photosurvey';
import type { DemGrid } from '../src/engine/terrain';

/** Build a tiny JPEG (SOI, EXIF APP1 with GPS, SOF0, EOI) in little-endian TIFF. */
function fakeJpeg(o: { lat: number; lon: number; alt: number; dir?: number; dirRef?: 'T' | 'M'; f35?: number; w: number; h: number }): ArrayBuffer {
  const entries: { tag: number; type: number; count: number; data: number[] }[][] = [[], [], []];
  const rat = (v: number, d = 10000) => [Math.round(v * d), d];
  const dms = (v: number) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = (a - d - m / 60) * 3600; return [d, 1, m, 1, Math.round(s * 1000), 1000]; };
  // IFD0: pointers to Exif and GPS IFDs (filled later)
  entries[0].push({ tag: 0x8769, type: 4, count: 1, data: [0] }, { tag: 0x8825, type: 4, count: 1, data: [0] });
  if (o.f35) entries[1].push({ tag: 0xa405, type: 3, count: 1, data: [o.f35] });
  entries[1].push({ tag: 0x9003, type: 2, count: 20, data: [...'2026:11:15 14:30:05'].map((c) => c.charCodeAt(0)).concat([0]) });
  entries[2].push({ tag: 1, type: 2, count: 2, data: [o.lat < 0 ? 83 : 78, 0] }, { tag: 2, type: 5, count: 3, data: dms(o.lat) },
    { tag: 3, type: 2, count: 2, data: [o.lon < 0 ? 87 : 69, 0] }, { tag: 4, type: 5, count: 3, data: dms(o.lon) },
    { tag: 5, type: 1, count: 1, data: [0] }, { tag: 6, type: 5, count: 1, data: rat(o.alt, 100) });
  if (o.dir != null) entries[2].push({ tag: 16, type: 2, count: 2, data: [(o.dirRef ?? 'T').charCodeAt(0), 0] }, { tag: 17, type: 5, count: 1, data: rat(o.dir, 100) });
  const size = (t: number) => ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 } as Record<number, number>)[t];
  const bytes: number[] = [];
  const w16 = (a: number[], at: number, v: number) => { a[at] = v & 255; a[at + 1] = (v >> 8) & 255; };
  const w32 = (a: number[], at: number, v: number) => { for (let i = 0; i < 4; i++) a[at + i] = (v >>> (8 * i)) & 255; };
  // TIFF header
  bytes.push(0x49, 0x49, 42, 0, 8, 0, 0, 0);
  const ifdLen = (e: typeof entries[0]) => 2 + e.length * 12 + 4;
  const offs = [8]; offs[1] = offs[0] + ifdLen(entries[0]); offs[2] = offs[1] + ifdLen(entries[1]);
  let extra = offs[2] + ifdLen(entries[2]);
  entries[0][0].data = [offs[1]]; entries[0][1].data = [offs[2]];
  const tail: number[] = [];
  entries.forEach((e, k) => {
    const at = offs[k]; w16(bytes, at, e.length);
    e.forEach((en, i) => {
      const p = at + 2 + i * 12; w16(bytes, p, en.tag); w16(bytes, p + 2, en.type); w32(bytes, p + 4, en.count);
      const raw: number[] = [];
      if (en.type === 5) for (let j = 0; j < en.data.length; j++) { const t: number[] = []; w32(t, 0, en.data[j]); raw.push(...t); }
      else if (en.type === 3) for (const v of en.data) { const t: number[] = []; w16(t, 0, v); raw.push(...t); }
      else if (en.type === 4) for (const v of en.data) { const t: number[] = []; w32(t, 0, v); raw.push(...t); }
      else raw.push(...en.data);
      if (raw.length <= 4) raw.forEach((b, j) => { bytes[p + 8 + j] = b; });
      else { w32(bytes, p + 8, extra); raw.forEach((b, j) => { tail[extra - (offs[2] + ifdLen(entries[2])) + j] = b; }); extra += raw.length; }
      void size;
    });
    w32(bytes, at + 2 + e.length * 12, 0);
  });
  for (let i = 0; i < bytes.length; i++) bytes[i] ??= 0;
  const tiff = [...bytes, ...Array.from(tail, (b) => b ?? 0)];
  const app1 = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], tiff);
  const sof = [8, o.h >> 8, o.h & 255, o.w >> 8, o.w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const out = [0xff, 0xd8, 0xff, 0xe1, ((app1.length + 2) >> 8) & 255, (app1.length + 2) & 255, ...app1, 0xff, 0xc0, ((sof.length + 2) >> 8) & 255, (sof.length + 2) & 255, ...sof, 0xff, 0xd9];
  return new Uint8Array(out).buffer;
}

describe('photo metadata', () => {
  it('reads GPS position, altitude, direction, lens and time from EXIF', () => {
    const m = readPhotoMeta(fakeJpeg({ lat: 35.5951, lon: -82.5515, alt: 650.5, dir: 123.45, f35: 26, w: 4032, h: 3024 }));
    expect(m.lat).toBeCloseTo(35.5951, 5); expect(m.lon).toBeCloseTo(-82.5515, 5);
    expect(m.altM).toBeCloseTo(650.5, 2); expect(m.headingDeg).toBeCloseTo(123.45, 2); expect(m.headingRef).toBe('T');
    expect(m.focal35).toBe(26); expect(m.width).toBe(4032); expect(m.height).toBe(3024); expect(m.takenAt).toBe('2026-11-15T14:30:05');
  });
  it('turns a magnetic compass direction into degrees true', () => {
    const m = readPhotoMeta(fakeJpeg({ lat: 35.5951, lon: -82.5515, alt: 650, dir: 100, dirRef: 'M', w: 4000, h: 3000 }));
    const c = cameraFromMeta(m, 4000, 3000, new Date('2026-11-15'));
    expect(c.headingDeg!).toBeGreaterThan(91); expect(c.headingDeg!).toBeLessThan(95); // ~7° W declination at Asheville
  });
  it('ignores files that are not JPEG', () => { expect(readPhotoMeta(new Uint8Array([1, 2, 3, 4]).buffer)).toEqual({}); });
  it('reads phone panorama (GPano) and drone gimbal tags', () => {
    const m: PhotoMeta = {};
    parseXmp('<x GPano:FullPanoWidthPixels="8000" GPano:FullPanoHeightPixels="4000" GPano:CroppedAreaImageWidthPixels="6000" GPano:CroppedAreaImageHeightPixels="1500" GPano:CroppedAreaLeftPixels="1000" GPano:CroppedAreaTopPixels="1250" GPano:PoseHeadingDegrees="90"/>', m);
    const c = cameraFromMeta(m, 6000, 1500);
    expect(c.proj).toBe('equi'); expect(c.hfovDeg).toBeCloseTo(270); expect(c.headingDeg!).toBeCloseTo(90 + ((1000 + 3000) / 8000 - 0.5) * 360);
    const d: PhotoMeta = {}; parseXmp('drone-dji:GimbalYawDegree="-45.5" drone-dji:GimbalPitchDegree="-30.0"', d);
    expect(d.headingDeg).toBeCloseTo(314.5); expect(d.pitchDeg).toBe(-30);
  });
  it('works out the width of view from the 35 mm focal length', () => {
    expect(hfovFromFocal35(26, 4032, 3024)).toBeCloseTo(67.3, 0);
    expect(hfovFromFocal35(26, 3024, 4032)).toBeLessThan(55);
    expect(cameraFromMeta({}, 9000, 2000).proj).toBe('cyl'); // a wide panorama with no tags
  });
});

const photo = (o: Partial<SurveyPhoto> = {}): SurveyPhoto => ({ id: 'p', name: 'p', dataUrl: '', w: 4000, h: 3000, headingDeg: 90, headingSrc: 'photo', pitchDeg: 0, rollDeg: 0, hfovDeg: 66, proj: 'rect', caption: '', ...o });

describe('camera model', () => {
  it('puts the facing direction in the middle and round-trips pixels for every projection', () => {
    for (const proj of ['rect', 'cyl', 'equi'] as const) {
      const ph = photo({ proj, pitchDeg: 5, hfovDeg: proj === 'rect' ? 66 : 180 });
      const c = project(ph, 90, 5)!; expect(c.x).toBeCloseTo(2000, 0); expect(c.y).toBeCloseTo(1500, 0);
      for (const [x, y] of [[300, 400], [3700, 2600], [2000, 100]]) { const d = unproject(ph, x, y), q = project(ph, d.az, d.el)!; expect(q.x).toBeCloseTo(x, 3); expect(q.y).toBeCloseTo(y, 3); }
    }
    const ph = photo();
    expect(project(ph, 270, 0)).toBeNull(); // behind the camera
    expect(project(ph, 90 + 33, 0)!.x).toBeCloseTo(4000, 0); // right edge
    expect(project(ph, 90, 10)!.y).toBeLessThan(1500); // up is up
    expect(project(photo({ rollDeg: 10 }), 100, 0)!.y).not.toBeCloseTo(1500, 0); // roll tips the horizon
  });
});

// flat 300 m plain with a 600 m tall ridge 5 km east of the spot
function dem(peak = false): DemGrid {
  const n = 300, data = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data[r * n + c] = c >= 200 && c <= 204 ? 900 : 300;
  // optional cone-shaped hill north-east of the spot, so the skyline has a shape to match
  if (peak) for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const dd = Math.hypot(r - 145, c - 190); if (dd < 12) data[r * n + c] = Math.max(data[r * n + c], 300 + 700 * (1 - dd / 12)); }
  return { name: 't', ncols: n, nrows: n, west: -82.8, north: 35.8, cellDeg: 0.002, data, nodata: -9999, source: 'test' };
}
const at = { lat: 35.5, lon: -82.455 }; // the ridge (lon -82.4) is about 5 km east

describe('terrain horizon and targets', () => {
  const d = dem(), hz = horizonProfile(d, at, 1.7, { stepDeg: 1, maxKm: 20 })!;
  it('rises where the ridge is and stays flat elsewhere', () => {
    expect(hz.groundM).toBeCloseTo(300, 0);
    expect(horizonAt(hz, 90)).toBeGreaterThan(5); // 600 m up, ~5 km away ≈ 6.8°
    expect(horizonAt(hz, 90)).toBeLessThan(8);
    expect(hz.km[90]).toBeGreaterThan(4); expect(hz.km[90]).toBeLessThan(6.5);
    expect(Math.abs(horizonAt(hz, 270))).toBeLessThan(1);
  });
  it('knows a tower behind the ridge is hidden and one in front is visible', () => {
    const v = viewTargets(d, at, hz.eyeAmslM, [
      { name: 'behind', kind: 'tower', lat: at.lat, lon: -82.3, aglM: 60 },
      { name: 'front', kind: 'site', lat: at.lat, lon: at.lon + 0.02, aglM: 30 },
      { name: 'west', kind: 'tower', lat: at.lat, lon: at.lon - 0.05, aglM: 60 }]);
    expect(v.find((x) => x.name === 'behind')!.visible).toBe(false);
    expect(v.find((x) => x.name === 'behind')!.blockKm!).toBeGreaterThan(4);
    expect(v.find((x) => x.name === 'front')!.visible).toBe(true);
    expect(v.find((x) => x.name === 'west')!.az).toBeCloseTo(270, 0);
    expect(v[0].km).toBeLessThanOrEqual(v[1].km);
  });
  it('lines a photo up with the terrain from its skyline, with no compass', () => {
    const hz = horizonProfile(dem(true), at, 1.7, { stepDeg: 0.5, maxKm: 20 })!;
    const truth = photo({ w: 400, h: 300, headingDeg: 80, pitchDeg: 2 });
    // draw the "photo": sky above the true horizon, ground below
    const lum = new Float32Array(400 * 300);
    for (let x = 0; x < 400; x++) for (let y = 0; y < 300; y++) { const dd = unproject(truth, x, y); lum[y * 400 + x] = dd.el > horizonAt(hz, dd.az) ? 220 : 70; }
    const sky = detectSkyline(lum, 400, 300);
    expect(sky.filter(Number.isFinite).length).toBeGreaterThan(300);
    const m = matchHorizon({ ...truth, headingDeg: null, pitchDeg: 0 }, sky, 1, hz)!;
    expect(Math.abs(((m.headingDeg - 80 + 540) % 360) - 180)).toBeLessThan(2);
    expect(m.pitchDeg).toBeCloseTo(2, 0);
    expect(m.errDeg).toBeLessThan(0.5);
  });
  it('finds the ground the camera can see, nearest first', () => {
    const g = visibleGround(d, at, hz.eyeAmslM, 90, 15);
    expect(g.length).toBeGreaterThan(5);
    expect(g[g.length - 1].dM).toBeLessThan(6000); // nothing past the ridge
  });
});

describe('arranging photos', () => {
  it('groups photos taken at the same spot', () => {
    const g = groupByPlace([{ lat: 35.5, lon: -82.5 }, { lat: 35.50005, lon: -82.50003 }, { lat: 35.51, lon: -82.5 }, {}]);
    expect(g.map((x) => x.items.length)).toEqual([2, 1, 1]);
  });
  it('builds a panorama strip over the photos and leaves out the empty part', () => {
    const s = stripFor([photo({ headingDeg: 80 }), photo({ headingDeg: 130 })]);
    expect(s.spanDeg).toBeLessThan(140); expect(stripX(s, 80)).toBeGreaterThan(0); expect(stripX(s, 130)).toBeLessThan(s.w);
    expect(stripFor([photo({ headingDeg: 0, hfovDeg: 360, proj: 'equi' })]).spanDeg).toBe(360);
  });
  it('lines photos with no direction up after the last known one', () => {
    const r = arrangeInOrder([photo({ headingDeg: 0 }), photo({ headingDeg: null, headingSrc: 'none' }), photo({ headingDeg: null, headingSrc: 'none' })]);
    expect(r[1].headingDeg!).toBeCloseTo(52.8, 0); expect(r[2].headingDeg!).toBeGreaterThan(r[1].headingDeg!); expect(r[1].headingSrc).toBe('arranged');
  });
});
