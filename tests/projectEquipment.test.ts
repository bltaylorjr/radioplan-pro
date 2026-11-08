import { describe, it, expect } from 'vitest';
import { projectEquipment, mergeProjectEquipment } from '../src/data/projectEquipment';
import { defaultProject } from '../src/defaults';

describe('project equipment into the library', () => {
  it('lists the antenna, feeder and alarm devices used', () => {
    const p = structuredClone(defaultProject()); p.alarm.enabled = true; p.alarm.devices = [{ name: 'Horn strobe 75cd', qty: 10, standbyMa: 0, alarmMa: 120 }];
    const items = projectEquipment(p);
    expect(items.some((i) => i.category === 'Antennas')).toBe(true);
    expect(items.some((i) => i.category === 'Coax & feeders')).toBe(true);
    const fa = items.find((i) => i.model === 'Horn strobe 75cd');
    expect(fa?.specs['Alarm current (mA)']).toBe(120);
    expect(new Set(items.map((i) => i.origin)).size).toBe(items.length);
  });
  it('adds new items once and keeps edits', () => {
    const p = structuredClone(defaultProject());
    const a = mergeProjectEquipment([], projectEquipment(p), 'Job 1');
    expect(a.added).toBeGreaterThan(0);
    const edited = a.next.map((i, k) => (k === 0 ? { ...i, specs: { ...i.specs, 'Gain (dBi)': 99 } } : i));
    const b = mergeProjectEquipment(edited, projectEquipment(p), 'Job 2');
    expect(b.added).toBe(0); expect(b.next[0].specs['Gain (dBi)']).toBe(99); expect(b.next[0].projects).toEqual(['Job 1', 'Job 2']);
    expect(mergeProjectEquipment(b.next, projectEquipment(p), 'Job 2').changed).toBe(false);
  });
});
