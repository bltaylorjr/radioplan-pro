import { describe, it, expect } from 'vitest';
import { builtInSpecs, CATEGORIES } from '../src/data/speclib';
import { LV_CATALOG, LEGACY, DOC, legacyTag } from '../src/data/lvequipment';
import { RADIOS, FEEDERS } from '../src/data/catalog';
import { SYSTEMS } from '../src/data/systems';

const docUrls = new Set(Object.values(DOC).map(([, u]) => u));

describe('low-voltage catalog and legacy equipment', () => {
  it('files every item under a library category with unique ids', () => {
    const all = builtInSpecs(); const ids = all.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of [...LV_CATALOG, ...LEGACY]) expect(CATEGORIES as readonly string[]).toContain(i.category);
  });
  it('gives every legacy item a status, replacements and service notes', () => {
    const legacy = builtInSpecs().filter((i) => i.legacy);
    expect(legacy.length).toBeGreaterThanOrEqual(LEGACY.length + RADIOS.filter((r) => r.legacy).length + FEEDERS.filter((f) => f.legacy).length);
    for (const i of legacy) {
      expect(i.legacy!.replacedBy.length).toBeGreaterThan(0);
      expect(i.legacy!.service.length).toBeGreaterThan(0);
      expect(i.specs['Status']).toBe(i.legacy!.status);
    }
  });
  it('links only https manufacturer pages', () => {
    for (const i of builtInSpecs()) for (const [, u] of i.docs ?? []) { expect(u).toMatch(/^https:\/\//); }
    for (const i of [...LV_CATALOG, ...LEGACY]) for (const [, u] of i.docs ?? []) expect(docUrls.has(u)).toBe(true);
  });
  it('covers access control and every low-voltage system with library entries', () => {
    const ac = builtInSpecs().filter((i) => i.category === 'Security & access control');
    for (const sub of ['Controller', 'Card reader', 'Credential', 'Lock', 'Power supply', 'Request to exit']) expect(ac.some((i) => i.sub === sub)).toBe(true);
    for (const s of SYSTEMS) for (const c of s.libCats) expect(builtInSpecs().some((i) => i.category === c)).toBe(true);
  });
  it('marks legacy items in selection lists', () => {
    expect(legacyTag(RADIOS.find((r) => r.legacy)!)).toMatch(/Legacy/);
    expect(legacyTag(RADIOS[0])).toBe('');
  });
});
