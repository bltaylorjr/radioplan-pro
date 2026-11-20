import { describe, it, expect } from 'vitest';
import { SIREN_MODELS, SIREN_SOURCES, SIREN_CODES, SIREN_PROGRAMS, SIREN_TEST_KINDS, SIREN_PLANNING } from '../src/data/sirens';
import { levelAt, rangeFt, hazardFt, checkPoint, codesFor, nearPlants, schedule, acceptanceRows, unitReach, defaultSirenPlan, combinedDb, type SirenPlan } from '../src/engine/sirens';
import { builtInSpecs } from '../src/data/speclib';
import { PACKS, jsonSafe } from '../src/engine/contentpacks';
import { repairProject } from '../src/engine/repair';
import { defaultProject } from '../src/defaults';

describe('outdoor siren database', () => {
  it('has unique ids, a source for every model, and sane ratings', () => {
    expect(new Set(SIREN_MODELS.map((m) => m.id)).size).toBe(SIREN_MODELS.length);
    for (const m of SIREN_MODELS) {
      expect(SIREN_SOURCES[m.src], m.id).toBeTruthy();
      if (m.dbc100 != null) { expect(m.dbc100).toBeGreaterThanOrEqual(100); expect(m.dbc100).toBeLessThanOrEqual(140); }
      if (m.status === 'Legacy') expect(m.replacedBy, m.id).toBeTruthy();
    }
    expect(SIREN_MODELS.filter((m) => m.status === 'Legacy').length).toBeGreaterThan(10);
    for (const [, u] of Object.values(SIREN_SOURCES)) expect(u).toMatch(/^https:\/\//);
  });
  it('is in the specifications library under Mass notification, legacy ones marked', () => {
    const s = builtInSpecs().filter((i) => i.sub === 'Outdoor warning siren');
    expect(s.length).toBe(SIREN_MODELS.length);
    expect(s.every((i) => i.category === 'Mass notification')).toBe(true);
    expect(s.filter((i) => i.legacy).length).toBe(SIREN_MODELS.filter((m) => m.status === 'Legacy').length);
  });
  it('ships as an online content pack that survives JSON', () => {
    const p = PACKS.find((x) => x.name === 'sirens')!;
    expect(p).toBeTruthy();
    expect(jsonSafe(p.get())).toBe(true);
    p.apply(JSON.parse(JSON.stringify(p.get())));
    expect(SIREN_MODELS.length).toBeGreaterThan(40);
  });
});

describe('siren coverage math (CPG 1-17)', () => {
  it('matches CPG 1-17 Figure 1 ranges', () => {
    const k = SIREN_PLANNING.lossPerDoubling;
    // 120 dBC suburban/rural reaches about 3,700 ft at 70 dBC; 125 dBC about 5,900 ft; 120 dBC among high-rises about 1,200 ft.
    expect(rangeFt(120, 70, k.suburban)).toBeGreaterThan(3000); expect(rangeFt(120, 70, k.suburban)).toBeLessThan(3700 * 1.05);
    expect(rangeFt(125, 70, k.suburban)).toBeGreaterThan(4400); // 10 dB per doubling is a little conservative against the chart expect(rangeFt(125, 70, k.suburban)).toBeLessThan(5900 * 1.15);
    expect(Math.abs(rangeFt(120, 70, k.urban) - 1200)).toBeLessThan(150);
    expect(levelAt(120, 100, 10)).toBe(120);
    expect(levelAt(120, 200, 10)).toBeCloseTo(110);
    expect(levelAt(120, 50, 10)).toBeCloseTo(126); // closer than 100 ft: free air only
  });
  it('flags hearing risk, low mounting, legacy and AC-only units', () => {
    expect(hazardFt(120)).toBe(0);
    expect(hazardFt(129)).toBeCloseTo(200, 0);
    const plan: SirenPlan = { ...defaultSirenPlan(), units: [{ id: 'a', name: 'A', modelId: 'se-10v2t', lat: 35.6, lon: -82.55, heightFt: 20 }] };
    const r = unitReach(plan, plan.units[0]);
    expect(r.warnings.join(' ')).toMatch(/32 ft/);
    expect(r.warnings.join(' ')).toMatch(/Legacy/);
    expect(r.warnings.join(' ')).toMatch(/power outage/);
  });
  it('adds sirens heard at one spot', () => {
    expect(combinedDb([70, 70])).toBeCloseTo(73.01, 1);
    const plan: SirenPlan = { ...defaultSirenPlan(), units: [{ id: 'a', name: 'A', modelId: 'fs-508-128', lat: 35.6, lon: -82.55, heightFt: 50 }] };
    expect(checkPoint(plan, 35.6005, -82.55).ok).toBe(true);
    expect(checkPoint(plan, 35.70, -82.55).ok).toBe(false);
  });
});

describe('siren codes and tests', () => {
  it('picks federal, state and local codes from the address', () => {
    const avl = codesFor('NC', 'Buncombe', 'Asheville').map((c) => c.id);
    for (const id of ['cpg-1-17', 'fema-owstb-2006', 'nfpa72-ch24', 'ipaws', 'nc-166a', 'asheville-noise', 'buncombe-flood']) expect(avl).toContain(id);
    expect(avl).not.toContain('tn-58-2');
    expect(avl).not.toContain('hamilton-tn');
    const chatt = codesFor('TN', 'Hamilton County', 'Chattanooga').map((c) => c.id);
    expect(chatt).toContain('hamilton-tn'); expect(chatt).toContain('tn-58-2');
    for (const st of ['NC', 'SC', 'GA', 'TN', 'VA']) expect(SIREN_CODES.some((c) => c.level === 'State' && c.state === st)).toBe(true);
    for (const c of SIREN_CODES) expect(c.url).toMatch(/^https:\/\//);
  });
  it('finds the nuclear plant zone', () => {
    expect(nearPlants(35.226, -85.06).map((p) => p.name)).toContain('Sequoyah');
    expect(nearPlants(35.5951, -82.5515)).toHaveLength(0);
  });
  it('builds the test schedule from the last passed test', () => {
    const plan: SirenPlan = { ...defaultSirenPlan(), program: 'community', units: [{ id: 'a', name: 'A', modelId: 'fs-508-128', lat: 35.6, lon: -82.55, heightFt: 50 }],
      tests: [{ id: 't', sirenId: 'a', kind: 'monthly', date: '2026-11-04', result: 'pass' }] };
    const due = schedule(plan, '2026-11-20');
    const m = due.find((d) => d.kind === 'monthly')!;
    expect(m.next).toBe('2026-12-04'); expect(m.overdue).toBe(false);
    expect(due.find((d) => d.kind === 'battery')!.overdue).toBe(true);
    for (const p of SIREN_PROGRAMS) for (const k of Object.keys(p.every)) expect(SIREN_TEST_KINDS.some((t) => t.id === k), `${p.id}:${k}`).toBe(true);
    expect(acceptanceRows(plan)).toHaveLength(5);
  });
  it('repairs a damaged siren plan', () => {
    const p = { ...defaultProject(), sirens: { units: [{ id: 'a', lat: 'x', lon: 1 }, { id: 'b', lat: 35, lon: -82 }], tests: 'bad' } } as unknown as ReturnType<typeof defaultProject>;
    const r = repairProject(p);
    const fixed = r.project;
    expect(fixed.sirens!.units).toHaveLength(1);
    expect(Array.isArray(fixed.sirens!.tests)).toBe(true);
  });
});
