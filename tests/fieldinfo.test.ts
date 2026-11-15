// 1.5.50: every ⓘ explanation belongs to a real field, and every industry default passes that field's own checks.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { FIELD_INFO, CALC_INPUT_INFO } from '../src/data/fieldInfo';
import { LV_CALCS, checkCalc } from '../src/data/lvcalcs';
import { checkValue, defaultRange } from '../src/engine/validate';

const src = ['src/pages', 'src/components'].flatMap((d) => readdirSync(d).map((f) => readFileSync(`${d}/${f}`, 'utf8'))).join('\n');

describe('value info', () => {
  it('every entry is for a label that exists in the app', () => {
    for (const k of Object.keys(FIELD_INFO)) {
      const label = k.split('|')[0];
      expect(src.includes(`label="${label}"`), label).toBe(true);
    }
  });
  it('every entry explains the value, and every default has a typical range or source', () => {
    for (const [k, v] of Object.entries(FIELD_INFO)) {
      expect(v.what.length, k).toBeGreaterThan(10);
      if (v.def != null) expect(!!(v.typical || v.src), k).toBe(true);
    }
  });
  it('defaults pass the unit checks', () => {
    for (const [k, v] of Object.entries(FIELD_INFO)) if (v.def != null) {
      const unit = k.split('|')[1];
      expect(checkValue(v.def, defaultRange(unit)), k).toBeNull();
    }
  });
  it('code-based defaults match the code', () => {
    expect(FIELD_INFO['Standby duration'].def).toBe(24);
    expect(FIELD_INFO['Alarm duration'].def).toBe(5);
    expect(FIELD_INFO['Rod length'].def).toBe(8);
    expect(FIELD_INFO['Secondary power'].def).toBe(12);
    expect(FIELD_INFO['Channel bandwidth'].def).toBe(12.5);
    expect(FIELD_INFO['Lead-in clearance to power conductors'].def).toBeCloseTo(0.1016, 4); // 4 in
  });
  it('calculator explanations point at real inputs, and calculator defaults pass their checks', () => {
    for (const k of Object.keys(CALC_INPUT_INFO)) {
      const [id, input] = k.split('.');
      expect(LV_CALCS.find((c) => c.id === id)?.inputs.some((i) => i.k === input), k).toBe(true);
    }
    for (const c of LV_CALCS) expect(checkCalc(c).issues.filter((i) => i.level === 'bad'), c.id).toEqual([]);
  });
});
