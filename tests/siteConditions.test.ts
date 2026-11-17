import { describe, it, expect } from 'vitest';
import { batteryTempFactor, siteEffects, siteVars, USGS_FE_MEDIAN } from '../src/engine/siteConditions';
import { defaultProject } from '../src/defaults';

describe('site conditions in calculations', () => {
  it('uses IEEE 485 temperature factors', () => {
    expect(batteryTempFactor(77)).toBe(1); expect(batteryTempFactor(90)).toBe(1);
    expect(batteryTempFactor(60)).toBeCloseTo(1.11); expect(batteryTempFactor(40)).toBeCloseTo(1.3); expect(batteryTempFactor(52.5)).toBeCloseTo(1.17, 2);
  });
  it('raises the battery safety factor in the cold and notes the soil iron for compass work', () => {
    const p = defaultProject();
    p.weather = { at: Date.parse('2026-11-16'), lat: 35.6, lon: -82.6, place: 'Asheville, NC', station: 'KAVL', obsAt: '', tempF: 45, windMph: 5, gustMph: 20, humidity: 40, lowF: 40, highF: 60, maxWindMph: 15, alerts: [], notes: [] };
    const vars = siteVars(p);
    expect(vars.find((v) => v.id === 'fe')!.value).toBe(USGS_FE_MEDIAN); expect(vars.find((v) => v.id === 'fe')!.estimate).toBe(true);
    const e = siteEffects('fa-battery', vars, { sb: 0.45, al: 2.2, h: 24, m: 5, sf: 20 });
    expect(e[0].adjust!.sf).toBe(Math.round((1.2 * 1.3 - 1) * 100));
    expect(siteEffects('decl', vars, {}).some((x) => x.varId === 'fe')).toBe(true);
    expect(siteEffects('rod', vars, {}).map((x) => x.varId)).toEqual(['fe', 'lowF', 'rh']);
    p.siteSoil = { fePct: 6.1, source: 'USGS' }; expect(siteVars(p).find((v) => v.id === 'fe')!.estimate).toBeUndefined();
  });
});
