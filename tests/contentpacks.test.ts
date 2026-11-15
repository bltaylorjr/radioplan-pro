import { describe, it, expect } from 'vitest';
import { PACKS, packShape, jsonSafe, packUsable, shapeOf } from '../src/engine/contentpacks';
import { cmpVersion } from '../src/engine/update';
import { CODE_SETS } from '../src/compliance/codesets';
import { CONTACTS } from '../src/data/contacts';
import { declinationDeg, getMagModel, setMagModel } from '../src/engine/azimuth';

describe('online content packs', () => {
  it('every built-in dataset can travel as a pack', () => {
    for (const p of PACKS) { expect(jsonSafe(p.get()), p.name).toBe(true); expect(packShape(p.get()).length, p.name).toBeGreaterThan(10); }
  });
  it('a pack with new entries keeps its shape; a new field changes it', () => {
    const c = JSON.parse(JSON.stringify(PACKS.find((p) => p.name === 'contacts')!.get()));
    const base = packShape(c);
    c.CONTACTS.push({ ...c.CONTACTS[0], id: 'new-one' });
    expect(packShape(c)).toBe(base);
    c.CONTACTS[0].brandNewField = 'x';
    expect(packShape(c)).not.toBe(base);
    expect(shapeOf({ NC: { a: 1 }, SC: { a: 2 } })).toBe(shapeOf({ NC: { a: 1 }, SC: { a: 2 }, VA: { a: 3 } }));
  });
  it('is used only when newer than the app and laid out the same', () => {
    expect(packUsable({ builtFrom: '1.5.55', shape: 's' }, '1.5.54', 's', cmpVersion)).toBe(true);
    expect(packUsable({ builtFrom: '1.5.54', shape: 's' }, '1.5.54', 's', cmpVersion)).toBe(false);
    expect(packUsable({ builtFrom: '1.6.0', shape: 'other' }, '1.5.54', 's', cmpVersion)).toBe(false);
  });
  it('puts new data in place where every page sees it, and back again', () => {
    const p = PACKS.find((x) => x.name === 'codes')!;
    const orig = JSON.parse(JSON.stringify(p.get()));
    const next = JSON.parse(JSON.stringify(orig)); next.CODE_SETS.NC.name = 'Test edition';
    p.apply(next); expect((CODE_SETS.NC as { name?: string }).name).toBe('Test edition');
    p.apply(orig); expect(JSON.stringify(p.get())).toBe(JSON.stringify(orig));
    const c = PACKS.find((x) => x.name === 'contacts')!; const co = JSON.parse(JSON.stringify(c.get()));
    c.apply({ ...co, CONTACTS: co.CONTACTS.slice(0, 2) }); expect(CONTACTS).toHaveLength(2); c.apply(co); expect(CONTACTS.length).toBe(co.CONTACTS.length);
    expect(() => p.apply({ CODE_SETS: {} })).toThrow(); p.apply(orig);
  });
  it('the magnetic model can be replaced, and a broken one is refused', () => {
    const m = getMagModel(); const d0 = declinationDeg({ lat: 35.6, lon: -82.55 }, Date.UTC(2026, 0, 1));
    expect(() => setMagModel({ name: 'bad', epoch: 2030, coef: [[1, 0, 1]] })).toThrow();
    setMagModel({ ...m, coef: m.coef.map((r) => [...r]) });
    expect(declinationDeg({ lat: 35.6, lon: -82.55 }, Date.UTC(2026, 0, 1))).toBeCloseTo(d0, 6);
  });
});
