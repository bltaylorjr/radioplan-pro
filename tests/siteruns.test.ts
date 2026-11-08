import { describe, it, expect } from 'vitest';
import { measurePath, runTakeoff, fillGaps, densify, type SiteRun } from '../src/engine/siteruns';
import { nearestSites } from '../src/engine/towers';

const A = { lat: 35.5951, lon: -82.5515 }, B = { lat: 35.5951, lon: -82.5405 }; // about 1 km east
const run = (o: Partial<SiteRun> = {}): SiteRun => ({ id: 'r', name: 'R', fromId: 'a', toId: 'b', via: [], cable: 'fiber-sm', method: 'underground', ...o });

describe('site-to-site runs', () => {
  it('flat ground: ground length equals map length', () => {
    const m = measurePath([A, B], () => 600);
    expect(m.horizFt).toBeGreaterThan(3000); expect(m.horizFt).toBeLessThan(3300);
    expect(Math.abs(m.groundFt - m.horizFt)).toBeLessThanOrEqual(1);
    expect(m.climbFt).toBe(0); expect(m.maxGradePct).toBe(0);
  });
  it('a hill makes the ground length longer and reports climb and grade', () => {
    // 60 m bump in the middle of the route
    const m = measurePath([A, B], (p) => 600 + 60 * Math.sin(Math.PI * (p.lon - A.lon) / (B.lon - A.lon)));
    expect(m.groundFt).toBeGreaterThan(m.horizFt);
    expect(m.climbFt).toBeGreaterThan(180); expect(m.climbFt).toBeLessThan(215);
    expect(m.dropFt).toBeGreaterThan(180);
    expect(m.maxGradePct).toBeGreaterThan(15);
    expect(m.profile.length).toBeGreaterThan(10);
  });
  it('with no terrain, the two site elevations are used', () => {
    const m = measurePath([A, B], () => null, [600, 630]);
    expect(m.endElevFt).toEqual([1969, 2067]);
    expect(m.climbFt).toBe(98); expect(m.source).toMatch(/two site elevations/);
    expect(measurePath([A, B], () => null).source).toMatch(/map distance only/);
  });
  it('fills gaps linearly', () => { expect(fillGaps([0, null, null, 30])).toEqual([0, 10, 20, 30]); expect(fillGaps([null, null])).toBeNull(); });
  it('bend points add length and keep corners', () => {
    const C = { lat: 35.6, lon: -82.546 };
    const d = densify([A, C, B]);
    expect(d.some((x) => Math.abs(x.p.lat - C.lat) < 1e-9 && Math.abs(x.p.lon - C.lon) < 1e-9)).toBe(true);
    expect(measurePath([A, C, B], () => 600).horizFt).toBeGreaterThan(measurePath([A, B], () => 600).horizFt);
  });
  it('underground fiber takeoff: conduit, handholes, slack and hours', () => {
    const m = measurePath([A, B], () => 600);
    const t = runTakeoff(run({ via: [{ lat: 35.596, lon: -82.546 }] }), m);
    const q = (k: string) => t.items.find((i) => i.key === k)?.qty ?? 0;
    expect(q('trench')).toBe(m.groundFt);
    expect(q('conduit')).toBeGreaterThan(m.groundFt);
    expect(q('hh')).toBe(Math.ceil(m.groundFt / 500) - 1 + 1);
    expect(q('cable')).toBe(m.groundFt + 100 + q('hh') * 50);
    expect(t.totalHours).toBeGreaterThan(m.groundFt / 60);
  });
  it('steep routes take longer to trench and warn', () => {
    const flat = runTakeoff(run(), { ...measurePath([A, B], () => 600) });
    const steep = runTakeoff(run(), { ...measurePath([A, B], () => 600), maxGradePct: 25 });
    const h = (t: typeof flat) => t.hours.find((x) => x.task.startsWith('Trench'))!.hours;
    expect(h(steep)).toBeCloseTo(h(flat) * 2, 0);
    expect(steep.warnings.join(' ')).toMatch(/erosion/);
  });
  it('Cat 6 past 328 ft warns and asks for protectors', () => {
    const t = runTakeoff(run({ cable: 'cat6', method: 'aerial' }), measurePath([A, B], () => 600));
    expect(t.warnings.join(' ')).toMatch(/328 ft/); expect(t.warnings.join(' ')).toMatch(/800\.90/);
    expect(t.items.find((i) => i.key === 'strand')).toBeTruthy();
  });
  it('nearest towers are sorted by distance', () => {
    const s = [{ id: 'x', lat: 35.7, lon: -82.5, kind: 'Mast', name: 'far', services: [] }, { id: 'y', lat: 35.6, lon: -82.55, kind: 'Mast', name: 'near', services: [] }];
    const n = nearestSites(A, s);
    expect(n[0].name).toBe('near'); expect(n[0].km).toBeLessThan(1);
  });
});
