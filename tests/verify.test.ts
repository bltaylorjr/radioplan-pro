import { describe, it, expect } from 'vitest';
import { verifyWeather, verifySpaceWeather, checkLine } from '../src/engine/verify';
import { isogonicLines } from '../src/engine/isogonic';
import type { Weather } from '../src/engine/weather';
import type { SpaceWeather } from '../src/engine/spaceweather';

const NOW = Date.parse('2026-11-17T15:00:00Z');
const iso = (h: number) => new Date(NOW + h * 3600e3).toISOString();
const wx = (over: Partial<Weather['now']> = {}, extra: Partial<Weather> = {}): Weather => ({
  fetchedAt: NOW, place: { lat: 35.6, lon: -82.55, name: 'Asheville' }, point: {} as Weather['point'],
  now: { station: 'KAVL', stationName: 'Asheville', at: iso(-0.5), text: 'Clear', tempF: 41, dewF: 30, humidity: 64, windMph: 6, gustMph: 12, windDeg: 340, feelsF: 37, pressureInHg: 30.1, visibilityMi: 10, ...over },
  periods: [{ name: 'Today', start: iso(-2), end: iso(10), isDay: true, tempF: 52, windMph: 8, windText: '5 to 10 mph', windDir: 'NW', pop: 10, short: 'Sunny', detail: '' }],
  hours: [{ t: iso(0), tempF: 41, pop: 0, windMph: 6, windDir: 'NW', short: 'Sunny' }], alerts: [], problems: [], ...extra,
});

describe('weather download checks', () => {
  it('passes a good download and says verified', () => {
    const v = verifyWeather(wx(), NOW);
    expect(v.check.ok).toBe(true); expect(v.check.issues).toEqual([]);
    expect(checkLine(v.check)!.tone).toBe('ok');
  });
  it('drops values out of range instead of showing them', () => {
    const v = verifyWeather(wx({ tempF: 41, windMph: 400, pressureInHg: 3, gustMph: 2, windDeg: 340 }), NOW);
    expect(v.now!.windMph).toBeNull(); expect(v.now!.pressureInHg).toBeNull();
    expect(v.check.issues.join(' ')).toMatch(/out of range/);
  });
  it('flags an old station report and a forecast that has run out', () => {
    const v = verifyWeather(wx({ at: iso(-6) }, { periods: [{ ...wx().periods[0], start: iso(-30), end: iso(-20) }] }), NOW);
    expect(v.check.issues.join(' ')).toMatch(/6 hours old/);
    expect(v.check.issues.join(' ')).toMatch(/run out/);
    expect(v.check.ok).toBe(false);
    expect(checkLine(v.check)!.tone).toBe('warn');
  });
});

const sw = (kp: SpaceWeather['kp']): SpaceWeather => ({ fetchedAt: NOW, kp, scales: { now: { date: '2026-11-17', g: 0, s: 0, r: 0, rMinorProb: null, rMajorProb: null, sProb: null }, days: [] } });
const t = (h: number) => new Date(NOW + h * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
describe('space weather download checks', () => {
  it('passes recent measured Kp with a forecast ahead', () => {
    const v = verifySpaceWeather(sw([{ t: t(-3), kp: 2.33, kind: 'observed', scale: null }, { t: t(6), kp: 3, kind: 'predicted', scale: null }]), NOW);
    expect(v.check.ok).toBe(true);
  });
  it('drops impossible Kp values and refuses a download with none left', () => {
    expect(() => verifySpaceWeather(sw([{ t: t(-3), kp: 14, kind: 'observed', scale: null }]), NOW)).toThrow();
    const v = verifySpaceWeather(sw([{ t: t(-30), kp: 2, kind: 'observed', scale: null }, { t: t(-3), kp: -1, kind: 'observed', scale: null }]), NOW);
    expect(v.kp.length).toBe(1);
    expect(v.check.issues.join(' ')).toMatch(/left out/);
    expect(v.check.issues.join(' ')).toMatch(/hours old/);
  });
});

describe('declination map lines', () => {
  it('draws western declination lines in the east and eastern ones in the west, with the 0° line between', () => {
    const lines = isogonicLines(new Date('2026-11-17T12:00:00Z'));
    expect(lines.has(0)).toBe(true);
    expect([...lines.keys()].some((k) => k <= -14)).toBe(true);
    expect([...lines.keys()].some((k) => k >= 12)).toBe(true);
    const zero = lines.get(0)!.flat();
    const meanLon = zero.reduce((a, p) => a + p[1], 0) / zero.length;
    expect(meanLon).toBeGreaterThan(-100); expect(meanLon).toBeLessThan(-80);
  });
});
