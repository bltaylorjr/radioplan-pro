import { describe, it, expect } from 'vitest';
import { analyzePlan, fillRect, line, planInFeet, findScales, parseFtIn, fmtFtIn, readDxf, rasterDxf, schedules, fileProblem, calibrate, regrade, integrationValues, type Gray } from '../src/engine/floorplan';

const PX = 20; // px per foot
/** 60' × 40' building: 6" exterior walls, 4-1/2" partitions, a corridor wall with doors, windows on the south side. */
function sheet(opts: { blur?: number; noScale?: boolean } = {}): Gray {
  const m = 60, w = 60 * PX + 2 * m, h = 40 * PX + 2 * m; const g: Gray = { w, h, d: new Uint8Array(w * h).fill(255) };
  const X = (ft: number) => m + ft * PX, Y = (ft: number) => m + ft * PX, T = 10, t = 8;
  const hw = (x1: number, x2: number, y: number, th: number) => fillRect(g, X(x1), Y(y) - th / 2, X(x2), Y(y) + th / 2);
  const vw = (y1: number, y2: number, x: number, th: number) => fillRect(g, X(x) - th / 2, Y(y1), X(x) + th / 2, Y(y2));
  // exterior: north wall solid with a 3' entry door at 28-31
  hw(0, 28, 0, T); hw(31, 60, 0, T);
  // south wall with two 6' windows (glazing lines) at 10-16 and 40-46
  hw(0, 10, 40, T); hw(16, 40, 40, T); hw(46, 60, 40, T);
  for (const [a, b] of [[10, 16], [40, 46]]) for (const k of [-3, 0, 3]) line(g, X(a), Y(40) + k, X(b), Y(40) + k, 1.2);
  vw(0, 40, 0, T); vw(0, 40, 60, T);
  // corridor wall at y = 20 with 3' doors into two rooms
  hw(0, 12, 20, t); hw(15, 42, 20, t); hw(45, 60, 20, t);
  // partition between south rooms at x = 30 and between north rooms at x = 20
  vw(20, 40, 30, t); vw(0, 20, 20, t);
  // text and a thin dimension line (should not become walls)
  for (let i = 0; i < 6; i++) fillRect(g, X(5) + i * 14, Y(8), X(5) + i * 14 + 3, Y(8) + 18);
  line(g, X(0), Y(-2), X(60), Y(-2), 1);
  if (opts.blur) { const s = g.d.slice(); const r = opts.blur; for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) { let a = 0, n = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { a += s[(y + j) * w + x + i]; n++; } g.d[y * w + x] = a / n; } }
  return g;
}

describe('floor plan import', () => {
  it('traces walls, doors, windows and rooms at true scale', () => {
    const r = analyzePlan({ g: sheet(), source: 'image', scale: { ftPerPx: 1 / PX, from: 'calibrated', note: '' } });
    const f = planInFeet({ ...r });
    expect(f.L).toBeGreaterThan(59.5); expect(f.L).toBeLessThan(61);
    expect(f.W).toBeGreaterThan(39.5); expect(f.W).toBeLessThan(41);
    const ext = r.walls.filter((w) => w.exterior).length, int = r.walls.filter((w) => !w.exterior).length;
    expect(ext).toBeGreaterThanOrEqual(4); expect(int).toBeGreaterThanOrEqual(4);
    const doors = f.openings.filter((o) => o.kind === 'door'), wins = f.openings.filter((o) => o.kind === 'window');
    expect(doors.length).toBe(3); expect(wins.length).toBe(2);
    for (const d of doors) expect(Math.abs(d.widthFt - 3)).toBeLessThan(0.6);
    for (const d of wins) expect(Math.abs(d.widthFt - 6)).toBeLessThan(0.6);
    expect(doors.filter((d) => d.exterior).length).toBe(1);
    expect(f.rooms.length).toBe(4);
    const total = f.rooms.reduce((a, x) => a + x.areaSf, 0); expect(total).toBeGreaterThan(2150); expect(total).toBeLessThan(2400);
    expect(r.quality.accurate).toBe(true);
    const s = schedules(f, 'FIRST FLOOR PLAN'); expect(s.doors[0].mark).toBe('101'); expect(s.windows.map((x) => x.mark)).toEqual(['A', 'B']);
  });
  it('estimates scale from doors but does not call it accurate; calibration fixes that', () => {
    const r = analyzePlan({ g: sheet(), source: 'image' });
    expect(r.scale.from).toBe('estimated'); expect(Math.abs(r.scale.ftPerPx! * PX - 1)).toBeLessThan(0.15);
    expect(r.quality.accurate).toBe(false); expect(r.quality.issues.some((i) => i.id === 'scale' && i.severity === 'bad')).toBe(true);
    const p = { ...r, scale: calibrate(60 * PX, 60), id: 'x', name: 'a', fileType: '', size: 0, addedAt: '', source: 'image' as const, floor: 0, level: '', ceilingFt: 9, wallHeightFt: 10 };
    expect(regrade(p).accurate).toBe(true);
    expect(Math.abs(integrationValues([{ ...p, integrated: true }])!.lengthFt - 60)).toBeLessThanOrEqual(1);
  });
  it('flags a blurry, low-resolution upload with fixes', () => {
    const big = sheet({ blur: 4 }); const k = 3, w = Math.floor(big.w / k), h = Math.floor(big.h / k); const g: Gray = { w, h, d: new Uint8Array(w * h) };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.d[y * w + x] = big.d[y * k * big.w + x * k];
    const r = analyzePlan({ g, source: 'image' });
    expect(r.quality.accurate).toBe(false);
    const ids = r.quality.issues.map((i) => i.id); expect(ids).toContain('res');
    for (const i of r.quality.issues) expect(i.fix.length).toBeGreaterThan(1);
  });
  it('reads scales, feet-inches and file types', () => {
    expect(findScales('FIRST FLOOR PLAN  SCALE: 1/4" = 1\'-0"').scales[0].ftPerIn).toBe(4);
    expect(findScales('3/16" = 1\'-0"').scales[0].ftPerIn).toBeCloseTo(16 / 3);
    expect(findScales('SITE PLAN 1" = 20\'').scales[0].ftPerIn).toBe(20);
    expect(findScales('SCALE 1:100').scales[0].ftPerIn).toBeCloseTo(100 / 12);
    expect(findScales('N.T.S.').nts).toBe(true);
    expect(parseFtIn('42\'-6"')).toBe(42.5); expect(parseFtIn('12.5')).toBe(12.5); expect(parseFtIn('3 m')).toBeCloseTo(9.843, 2); expect(parseFtIn('30"')).toBe(2.5);
    expect(fmtFtIn(42.5)).toBe('42\'-6"');
    expect(fileProblem('a.dwg')).toMatch(/DXF/); expect(fileProblem('a.PDF')).toBeNull();
  });
  it('reads a CAD (DXF) plan on its A-WALL layer with its units', () => {
    const L: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
    const ln = (x1: number, y1: number, x2: number, y2: number, layer = 'A-WALL') => L.push('0', 'LINE', '8', layer, '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2));
    // 40' × 30' box in inches, double-line 6" walls
    const box = (o: number) => { ln(o, o, 480 - o, o); ln(480 - o, o, 480 - o, 360 - o); ln(480 - o, 360 - o, o, 360 - o); ln(o, 360 - o, o, o); };
    box(0); box(6); ln(-100, -50, 600, -50, 'A-ANNO-DIMS');
    L.push('0', 'TEXT', '8', 'A-AREA-IDEN', '10', '200', '20', '180', '1', 'OFFICE', '0', 'ENDSEC', '0', 'EOF');
    const d = readDxf(L.join('\n')); expect(d.unitsName).toBe('inches'); expect(d.lines.length).toBe(9);
    const r = rasterDxf(d); expect(r.wallLayers).toBe(true);
    const a = analyzePlan({ g: r.g, source: 'dxf', scale: { ftPerPx: r.ftPerPx, from: 'cad-units', note: '' }, texts: r.texts });
    const f = planInFeet(a); expect(Math.abs(f.L - 40)).toBeLessThan(0.6); expect(Math.abs(f.W - 30)).toBeLessThan(0.6);
    expect(a.rooms.length).toBe(1); expect(a.rooms[0].name).toBe('OFFICE');
  });
});
