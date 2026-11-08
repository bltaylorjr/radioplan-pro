import { describe, it, expect } from 'vitest';
import { THEORY } from '../src/data/theory';
import { lvCalc } from '../src/data/lvcalcs';
import { WORKFLOW_LABELS } from '../src/data/pageLabels';
import { BODIES, bodySpecs } from '../src/data/bodies';
import { RESOURCES } from '../src/data/contacts';

describe('low-voltage principles and reference bodies', () => {
  it('every section has a unique id, a body, and links that exist', () => {
    const ids = THEORY.flatMap((p) => p.sections.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(35);
    for (const p of THEORY) for (const s of p.sections) {
      expect(s.body.length).toBeGreaterThan(150);
      for (const c of s.calcs ?? []) expect(lvCalc(c), `${s.id} calc ${c}`).toBeTruthy();
      for (const [pg] of s.pages ?? []) expect(WORKFLOW_LABELS[pg], `${s.id} page ${pg}`).toBeTruthy();
    }
    expect(WORKFLOW_LABELS.theory).toBeTruthy();
  });
  it('covers all three levels', () => {
    const lv = new Set(THEORY.flatMap((p) => p.sections.map((s) => s.level)));
    expect([...lv].sort()).toEqual(['Advanced', 'Basic', 'Intermediate']);
  });
  it('reference bodies use official https links and appear in the library and resources', () => {
    for (const b of BODIES) { expect(b.links.length).toBeGreaterThan(0); for (const [, u] of b.links) expect(u).toMatch(/^https:\/\//); }
    for (const id of ['nfpa', 'bicsi', 'tia', 'ul', 'nicet', 'esa', 'ahj', 'nc-beec', 'sc-clb', 'ga-cilb', 'tn-blc']) expect(BODIES.some((b) => b.id === id), id).toBe(true);
    expect(bodySpecs().length).toBe(BODIES.length);
    expect(RESOURCES.some((r) => r.url === 'https://www.nicet.org/')).toBe(true);
  });
});
import { THEORY_DIAGRAMS } from '../src/components/TheoryDiagrams';
import { GUIDES } from '../src/pages/Install';
describe('principles diagrams', () => {
  it('every diagram id resolves', () => {
    for (const p of THEORY) for (const s of p.sections) for (const d of s.diagrams ?? []) expect(THEORY_DIAGRAMS[d] || GUIDES.find((g) => g.id === d), d).toBeTruthy();
  });
});
