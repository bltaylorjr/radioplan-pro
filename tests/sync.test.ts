import { describe, it, expect } from 'vitest';
import { defaultProject } from '../src/defaults';
import { stampSync, mergeProjects, packCode, unpackCode, fromPackage, toPackage } from '../src/engine/sync';
import type { Project } from '../src/types';

const stamp = (p: Project, dev: string, t: number) => { const s = stampSync(p, { id: dev, name: dev }, t); if (s) p.sync = s; return p; };

describe('sync', () => {
  it('stamps only changed sections and records deletions', () => {
    const p = stamp(defaultProject(), 'pc', 1000);
    expect(stampSync(p, { id: 'pc', name: 'pc' }, 2000)).toBeNull();
    p.radio.txPowerDbm = 40; p.sites = p.sites.filter((s) => s.id !== 'B');
    stamp(p, 'pc', 3000);
    expect(p.sync!.sections.radio.at).toBe(3000); expect(p.sync!.sections.meta.at).toBe(1000);
    expect(p.sync!.tombstones['sites:B']).toBe(3000);
  });
  it('merges two devices: newest section wins, collections union, deletions propagate', () => {
    const base = stamp(defaultProject(), 'pc', 1000);
    const phone = structuredClone(base); phone.sync!.deviceId = 'phone';
    // PC edits radio at t=2000 and deletes site B
    base.radio.txPowerDbm = 40; base.sites = base.sites.filter((s) => s.id !== 'B'); stamp(base, 'pc', 2000);
    // phone edits company name at 2500, adds a site and a Wi-Fi reading
    phone.company.name = 'Field Co'; phone.sites.push({ ...phone.sites[0], id: 'C', name: 'Phone site' });
    phone.wifi.readings.push({ id: 'w1', x: 1, y: 2, t: 'now', aps: [] }); stamp(phone, 'phone', 2500);
    const { project: m, report } = mergeProjects(base, phone, 3000);
    expect(m.radio.txPowerDbm).toBe(40);
    expect(m.company.name).toBe('Field Co');
    expect(m.sites.map((s) => s.id).sort()).toEqual(['A', 'C']);
    expect(m.wifi.readings.length).toBe(1);
    expect(report.sameProject).toBe(true);
    // and the other direction converges to the same content
    const { project: m2 } = mergeProjects(phone, base, 3000);
    expect(m2.sites.map((s) => s.id).sort()).toEqual(['A', 'C']); expect(m2.radio.txPowerDbm).toBe(40); expect(m2.company.name).toBe('Field Co');
  });
  it('packs codes and reads packages', async () => {
    const o = { sdp: 'v=0\r\n'.repeat(50), t: 'offer' };
    expect(await unpackCode(await packCode(o))).toEqual(o);
    const p = stamp(defaultProject(), 'pc', 1);
    expect(fromPackage(JSON.stringify(toPackage(p))).meta.name).toBe(p.meta.name);
    expect(fromPackage(JSON.stringify(p)).meta.name).toBe(p.meta.name);
    expect(() => fromPackage('{"a":1}')).toThrow();
  });
});
