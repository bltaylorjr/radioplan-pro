import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SYSTEMS, projectSystems } from '../src/data/systems';
import { LV_CALCS, lvCalc, runCalc } from '../src/data/lvcalcs';
import { WORKFLOW_LABELS } from '../src/data/pageLabels';
import { CATEGORIES, builtInSpecs } from '../src/data/speclib';
import { guideFor } from '../src/data/troubleshoot';
import { nextDue } from '../src/pages/Service';
import { defaultProject } from '../src/defaults';

describe('low-voltage systems', () => {
  it('covers the 16 service lines with valid links', () => {
    expect(SYSTEMS.length).toBeGreaterThanOrEqual(16);
    for (const s of SYSTEMS) {
      for (const c of s.calcs) expect(lvCalc(c), `${s.id} calc ${c}`).toBeTruthy();
      for (const pg of s.pages) expect(WORKFLOW_LABELS[pg], `${s.id} page ${pg}`).toBeTruthy();
      for (const c of s.libCats) expect(CATEGORIES as readonly string[]).toContain(c);
    }
    expect(projectSystems({ projectType: 'cctv', subSystems: ['access', 'cctv'] }).map((s) => s.id)).toEqual(['cctv', 'access']);
  });
  it('menu labels match the app menu', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const ids = [...app.matchAll(/\{ id: '(\w+)', label: '([^']+)'/g)].map((m) => [m[1], m[2]]);
    expect(Object.fromEntries(ids)).toEqual(WORKFLOW_LABELS);
  });
  it('calculators give sensible numbers', () => {
    for (const c of LV_CALCS) for (const o of runCalc(c)) expect(o.value).not.toMatch(/NaN|Infinity/);
    const st = runCalc(lvCalc('cctv-storage')!, { cams: 1, mbps: 8, hours: 24, days: 1, motion: 100 });
    expect(st[0].value).toBe('0.09'); // 8 Mb/s × 86400 s / 8 = 86.4 GB
    const spl = runCalc(lvCalc('spl')!, { sens: 90, w: 1, d: 3.28084, amb: 55 });
    expect(spl[0].value).toBe('90');
    const fb = runCalc(lvCalc('fiber-budget')!, { km: 1, att: 3.5, pairs: 2, splices: 1, meas: 5 });
    expect(fb[0].value).toBe('5.3'); expect(fb[1].value).toBe('PASS');
    const bat = runCalc(lvCalc('fa-battery')!, { sb: 0.5, al: 3, h: 24, m: 5, sf: 20 });
    expect(bat[0].value).toBe('14.7'); expect(bat[1].value).toBe('18');
  });
  it('every library category has a troubleshooting guide', () => {
    const p = defaultProject();
    for (const it of builtInSpecs()) for (const s of guideFor(it).symptoms) for (const st of s.steps) expect(st.expect({ it, s: it.specs, p })).not.toMatch(/NaN|undefined/);
    expect(guideFor({ id: 'x', category: 'CCTV', sub: '', brand: '', model: '', specs: {}, kind: 'My item' }).id).toBe('cctv');
  });
  it('works out the next maintenance date', () => {
    expect(nextDue('2026-01-15', 'Annually')).toBe('2027-01-15');
    expect(nextDue('2026-01-15', 'Semiannually (VRLA)')).toBe('2026-07-15');
    expect(nextDue(undefined, 'Annually')).toBeNull();
  });
});
