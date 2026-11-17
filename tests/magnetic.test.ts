import { describe, it, expect } from 'vitest';
import { parseKp, parseScales, kpSummary, gOfKp, compassWarning, stormEffects, swpcTime } from '../src/engine/spaceweather';
import { geomag } from '../src/engine/azimuth';
import { MENU_PAGES } from '../src/data/menu';
import { FEATURES } from '../src/help/features';

describe('space weather (NOAA SWPC)', () => {
  const kpRaw = [
    { time_tag: '2026-11-16T00:00:00', kp: 3.0, observed: 'observed', noaa_scale: null },
    { time_tag: '2026-11-16T03:00:00', kp: 5.33, observed: 'estimated', noaa_scale: 'G1' },
    { time_tag: '2026-11-16T06:00:00', kp: 7.0, observed: 'predicted', noaa_scale: 'G3' },
  ];
  it('reads the current object layout and the older header-row layout', () => {
    const a = parseKp(kpRaw);
    expect(a).toHaveLength(3); expect(a[1]).toMatchObject({ kp: 5.33, kind: 'estimated', scale: 'G1' });
    const b = parseKp([['time_tag', 'kp', 'observed', 'noaa_scale'], ['2026-11-16 00:00:00', '2.67', 'observed', null]]);
    expect(b[0].kp).toBeCloseTo(2.67); expect(swpcTime(b[0].t).toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(() => parseKp({})).toThrow();
  });
  it('reads the G/S/R scales', () => {
    const s = parseScales({ '-1': { DateStamp: '2026-11-15', G: { Scale: '0', Text: 'none' }, R: { Scale: '0' }, S: { Scale: '0' } }, '0': { DateStamp: '2026-11-16', G: { Scale: '0' }, R: {}, S: {} },
      '1': { DateStamp: '2026-11-16', R: { Scale: null, MinorProb: '25', MajorProb: '5' }, S: { Scale: null, Prob: '5' }, G: { Scale: '0' } }, '2': { DateStamp: '2026-11-17', G: { Scale: '1', Text: 'minor' }, R: {}, S: {} } });
    expect(s.days).toHaveLength(2); expect(s.days[0]).toMatchObject({ rMinorProb: 25, rMajorProb: 5, sProb: 5, g: 0 }); expect(s.days[1].g).toBe(1);
  });
  it('summarises now and the peak, and warns beside compass bearings in a storm', () => {
    const sw = { fetchedAt: Date.parse('2026-11-16T04:00:00Z'), kp: parseKp(kpRaw), scales: { days: [] } };
    const now = Date.parse('2026-11-16T04:00:00Z');
    const k = kpSummary(sw, now);
    expect(k.current?.kp).toBeCloseTo(5.33); expect(k.peak?.kp).toBe(7);
    expect(compassWarning(sw, now)).toMatch(/Minor storm/);
    expect(compassWarning(sw, now + 24 * 3600e3)).toBeNull(); // stale forecast: no warning
    expect(gOfKp(4.9)).toBe(0); expect(gOfKp(9)).toBe(5);
    expect(stormEffects(3).join(' ')).toMatch(/GPS/);
  });
});

describe('magnetic model page', () => {
  it('is under Tools & reference with a feature entry', () => {
    expect(MENU_PAGES.find((p) => p.id === 'magnetic')?.group).toBe('tools');
    expect(FEATURES.some((f) => f.page === 'magnetic')).toBe(true);
  });
  it('Asheville declination is about 6-7° W and drifting west', () => {
    const a = geomag(35.5951, -82.5515, 2026.0), b = geomag(35.5951, -82.5515, 2027.0);
    expect(a.decDeg).toBeLessThan(-5.5); expect(a.decDeg).toBeGreaterThan(-8);
    expect(b.decDeg).toBeLessThan(a.decDeg);
  });
});
