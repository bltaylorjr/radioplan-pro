import { describe, it, expect } from 'vitest';
import { CODE_SETS, localRule, codesFor, keyCodes } from '../src/compliance/codesets';
import { allCounties } from '../src/engine/refdata';
import { applyAddress, projectPlace, nearestTown, placeFromText } from '../src/compliance/place';
import { defaultProject } from '../src/defaults';

describe('code sets by location', () => {
  it('every state lists building, fire and electrical codes with sources', () => {
    for (const s of Object.values(CODE_SETS)) {
      for (const cat of ['Building', 'Fire', 'Electrical'] as const) expect(s.current.some((e) => e.cat === cat)).toBe(true);
      for (const e of s.current) if (e.status === 'verified') expect(e.src).toMatch(/^https:/);
    }
    expect(keyCodes('NC')).toContain('2018 NC Building Code');
    expect(CODE_SETS.SC.upcoming[0].effective).toBe('2027-01-01');
  });
  it('covers all 533 counties and independent cities', () => {
    const c = allCounties(); expect(c.length).toBe(533);
    for (const x of c) expect(codesFor(x.state as 'NC', x.county).set.current.length).toBeGreaterThan(5);
  });
  it('detects Tennessee exempt jurisdictions', () => {
    expect(localRule('TN', 'Knox County').exempt).toBe(true);
    expect(localRule('TN', 'Sullivan County', 'Kingsport').exempt).toBe(true);
    expect(localRule('TN', 'Shelby County', 'Lakeland').exempt).toBe(false);
    expect(localRule('TN', 'Rutherford County', 'Smyrna').exempt).toBe(false);
    expect(localRule('TN', 'Wilson County', 'Mt. Juliet').exempt).toBe(true);
    expect(localRule('NC', 'Wake County').exempt).toBe(false);
  });
  it('takes state, county and city from the project address', () => {
    const p = structuredClone(defaultProject());
    applyAddress(p, { label: '400 Main St, Knoxville, TN', lat: 35.9606, lon: -83.9207 });
    expect(p.meta.state).toBe('TN'); expect(p.meta.county).toBe('Knox County'); expect(p.meta.city).toBe('Knoxville');
    expect(projectPlace(p).from).toBe('project address');
    expect(nearestTown(0, 0)).toBeUndefined();
  });
});

describe('Virginia', () => {
  it('has the 2021 USBC, the 2020 NEC and the no-local-amendments rule', () => {
    const c = codesFor('VA', 'Fairfax County');
    expect(c.set.current.find((e) => e.cat === 'Electrical')?.code).toMatch(/NEC 2020/);
    expect(c.set.current.find((e) => e.cat === 'Building')?.effective).toBe('2024-01-18');
    expect(c.local.text).toMatch(/USBC/);
  });
  it('reads a Virginia address', () => {
    const p = placeFromText('Roanoke, VA');
    expect(p?.state).toBe('VA');
  });
});
