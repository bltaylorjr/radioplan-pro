import { describe, it, expect } from 'vitest';
import { defaultProject } from '../src/defaults';
import { buildModel, layerGroups } from '../src/engine/models';
import { matLossDb, facadeLossDb, presetFor, rt60, specFor, MATERIALS, RF_BANDS } from '../src/engine/bldgmaterials';

const proj = (type = 'custom', subs: string[] = []) => { const p = structuredClone(defaultProject()); p.meta.projectType = type; p.meta.subSystems = subs; return p; };

describe('building materials', () => {
  it('has a loss for every band and interpolates between them', () => {
    for (const m of MATERIALS) expect(m.rf).toHaveLength(RF_BANDS.length);
    expect(matLossDb('concrete', 800)).toBe(14);
    const mid = matLossDb('concrete', 1200); expect(mid).toBeGreaterThan(14); expect(mid).toBeLessThan(18);
    expect(matLossDb('concrete', 50)).toBe(8); expect(matLossDb('concrete', 6000)).toBe(30);
  });
  it('low-E glass and metal walls lose far more than clear glass', () => {
    const s = presetFor('office');
    expect(facadeLossDb({ ...s, window: 'lowe', windowPct: 100 }, 800)).toBeGreaterThan(facadeLossDb({ ...s, window: 'glass', windowPct: 100 }, 800) + 10);
    expect(facadeLossDb({ ...s, exterior: 'metalpanel', windowPct: 0 }, 800)).toBe(25);
  });
  it('carpet and tile ceilings shorten the echo', () => {
    const s = presetFor('warehouse');
    expect(rt60({ ...s, ceiling: 'act', finish: 'carpet' }, 60, 40, 10)).toBeLessThan(rt60(s, 60, 40, 10));
  });
  it('fills saved choices over the preset', () => {
    expect(specFor({ exterior: 'wood' }, 'school')).toMatchObject({ exterior: 'wood', partition: 'block' });
  });
});

describe('layered model', () => {
  it('builds layers for each system on the project', () => {
    const p = proj('custom'); p.meta.subSystems = ['firealarm', 'cabling', 'cctv', 'security', 'paging', 'erces', 'nursecall', 'access', 'wifi'];
    p.autoDesign = { ...(p.autoDesign ?? {}), bldg: 'healthcare', floors: 3, lengthFt: 200, widthFt: 100, floorHeightFt: 14, ceilingFt: 10, exteriorDoors: 4, accessDoors: 6, rooms: 20, parkingSpaces: 80, callBoxes: 2, retentionDays: 30, smokeCoverage: 'full' } as never;
    const m = buildModel(p);
    const groups = layerGroups(m).map((g) => g.id);
    expect(groups[0]).toBe('base');
    for (const s of ['firealarm', 'cabling', 'cctv', 'security']) expect(groups).toContain(s);
    expect(m.paths.some((x) => x.label.startsWith('SLC'))).toBe(true);
    expect(m.paths.some((x) => x.label.startsWith('NAC'))).toBe(true);
    expect(m.areas.some((a) => a.shape === 'poly')).toBe(true);
    expect(m.walls.some((w) => w.part === 'Corridor wall' && w.ratedHr === 1)).toBe(true);
    expect(m.firestops).toBeGreaterThan(0);
  });
  it('walls change the predicted heat map', () => {
    const p = proj('custom'); p.meta.subSystems = ['erces'];
    const soft = buildModel(p, { spec: { corridor: 'drywall', partition: 'drywall', floor: 'woodfloor' } });
    const hard = buildModel(p, { spec: { corridor: 'concrete', partition: 'concrete', floor: 'ptslab' } });
    const pct = (m: ReturnType<typeof buildModel>) => m.heat.reduce((s, h) => s + h.v.reduce((a, b) => a + b, 0), 0);
    expect(soft.heat.length).toBeGreaterThan(0);
    expect(pct(hard)).toBeLessThan(pct(soft));
  });
});
