import { describe, it, expect } from 'vitest';
import { projectFromTemplate, defaultKeep } from '../src/engine/template';
import { defaultProject } from '../src/defaults';

describe('new project from a previous one', () => {
  const src = defaultProject();
  src.meta.name = 'Old job'; src.meta.client = 'ACME'; src.meta.projectType = 'firealarm'; src.meta.city = 'Knoxville';
  src.bomExtra = [{ id: 'b1', category: 'Cable', item: 'FPLP 18/2', brandModel: '', qty: 1000, unit: 'ft', notes: '' }];
  src.fieldNotes = [{ id: 'n', at: '', title: 'x', text: '', category: '', photos: [], tags: [], author: '', followUp: false, done: false }];
  src.checklists = { 'install:a': true };
  src.tests = [{} as never];
  it('keeps design and equipment, clears the job record', () => {
    const p = projectFromTemplate(src, defaultProject(), { name: 'New job', number: '42', keep: defaultKeep() });
    expect(p.meta.name).toBe('New job'); expect(p.meta.number).toBe('42');
    expect(p.meta.projectType).toBe('firealarm'); expect(p.bomExtra?.[0].qty).toBe(1000);
    expect(p.fieldNotes ?? []).toHaveLength(0); expect(p.checklists ?? {}).toEqual({}); expect(p.tests).toHaveLength(0);
    expect(p.meta.client).toBe(''); expect(p.meta.city).toBe('Asheville');
  });
  it('can keep client and location', () => {
    const p = projectFromTemplate(src, defaultProject(), { name: '', keep: { ...defaultKeep(), client: true, sites: true } });
    expect(p.meta.client).toBe('ACME'); expect(p.meta.city).toBe('Knoxville'); expect(p.meta.name).toBe('Old job (new)');
  });
  it('does not change the original', () => {
    const p = projectFromTemplate(src, defaultProject(), { name: 'A', keep: defaultKeep() });
    p.bomExtra![0].qty = 1; expect(src.bomExtra![0].qty).toBe(1000);
  });
});
describe('template output', () => {
  it('has no undefined fields (sync hashing needs JSON values)', () => {
    const p = projectFromTemplate(defaultProject(), defaultProject(), { name: 'x', keep: { ...defaultKeep(), documents: true, sites: true } });
    for (const v of Object.values(p)) expect(v).not.toBeUndefined();
  });
});
import { measureFor } from '../src/components/ui';
import { distUnits } from '../src/units';
describe('imperial / metric', () => {
  it('converts lengths both ways and leaves other units alone', () => {
    expect(measureFor('m', 'imperial').unit).toBe('ft'); expect(measureFor('m', 'imperial').k).toBeCloseTo(3.28084, 4);
    expect(measureFor(' ft', 'metric')).toEqual({ unit: ' m', k: 0.3048 });
    expect(measureFor('ft', 'imperial').k).toBe(1); expect(measureFor('dBm', 'metric').k).toBe(1);
    expect(distUnits('mi').len(10)).toBe('32.8 ft'); expect(distUnits('km').lenFt(100)).toBe('30.5 m');
  });
});
