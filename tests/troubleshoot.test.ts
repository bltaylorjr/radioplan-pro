import { describe, it, expect } from 'vitest';
import { builtInSpecs } from '../src/data/speclib';
import { guideFor, ALL_GUIDES } from '../src/data/troubleshoot';
import { defaultProject } from '../src/defaults';

describe('troubleshooting wizard', () => {
  it('gives every built-in item a guide whose steps all produce expected values', () => {
    const p = defaultProject();
    for (const it of builtInSpecs()) {
      const g = guideFor(it); expect(g.symptoms.length).toBeGreaterThan(0);
      for (const s of g.symptoms) for (const st of s.steps) { const v = st.expect({ it, s: it.specs, p }); expect(v.length).toBeGreaterThan(5); expect(v).not.toMatch(/NaN|undefined/); }
    }
    expect(ALL_GUIDES.length).toBeGreaterThan(5);
  });
  it('uses the item specs in expected values', () => {
    const p = defaultProject();
    const bat = { id: 'b', category: 'Batteries', sub: '', brand: 'X', model: 'Y', kind: 'My item' as const, specs: { 'Nominal voltage (V)': 12, 'Capacity (Ah)': 18 } };
    const steps = guideFor(bat).symptoms[0].steps;
    expect(steps[0].expect({ it: bat, s: bat.specs, p })).toContain('13.5');
    expect(steps[2].expect({ it: bat, s: bat.specs, p })).toContain('18 Ah');
    const rad = builtInSpecs().find((i) => i.category === 'Radios & repeaters')!;
    expect(guideFor(rad).symptoms[0].steps[1].expect({ it: rad, s: rad.specs, p })).toMatch(/dBm/);
  });
});
