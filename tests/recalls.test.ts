import { describe, it, expect } from 'vitest';
import { BUILTIN_NOTICES, noticesFor, noticesForText, fromCpsc } from '../src/data/recalls';
import { mergeRecalls, cpscUrl } from '../src/engine/recallsData';
import { builtInSpecs } from '../src/data/speclib';

describe('recalls and bulletins', () => {
  it('built-in notices are official CPSC pages with models', () => {
    for (const n of BUILTIN_NOTICES) { expect(n.url).toMatch(/^https:\/\/www\.cpsc\.gov\/Recalls\//); expect(n.models.length).toBeGreaterThan(0); for (const m of n.models) expect(() => new RegExp(m, 'i')).not.toThrow(); }
  });
  it('matches by manufacturer and model, not by model alone', () => {
    expect(noticesFor({ brand: 'Notifier', model: 'NFS2-640 addressable control panel' }, BUILTIN_NOTICES).map((n) => n.id)).toContain('cpsc-09-717');
    expect(noticesFor({ brand: 'Fire-Lite', model: 'NFS2-640' }, BUILTIN_NOTICES)).toHaveLength(0);
    expect(noticesFor({ brand: 'Typical', model: 'BEAM1224S' }, BUILTIN_NOTICES)).toHaveLength(0);
    expect(noticesFor({ brand: 'System Sensor', model: 'BEAM1224S beam detector' }, BUILTIN_NOTICES).map((n) => n.id)).toEqual(['cpsc-14-713']);
    expect(noticesForText('Smoke detectors FSP-951-IV (Notifier)', BUILTIN_NOTICES).map((n) => n.id)).toContain('cpsc-19-141');
    expect(noticesForText('FSP-951 photo', BUILTIN_NOTICES)).toHaveLength(0);
  });
  it('flags the legacy AM2020 entry in the library', () => {
    const am = builtInSpecs().find((i) => i.id === 'legacy-notifier-am2020')!;
    expect(noticesFor(am, BUILTIN_NOTICES).map((n) => n.id)).toContain('cpsc-04-508');
  });
  it('reads CPSC API records and keeps only low-voltage ones', () => {
    const raw = [
      { RecallNumber: '99-001', RecallDate: '2025-01-02T00:00:00', Title: 'Acme Recalls Fire Alarm Strobes', URL: 'https://www.cpsc.gov/Recalls/2025/x', Manufacturers: [{ Name: 'Acme Signal Co.' }], Products: [{ Name: 'Strobe', Model: 'AS-100, AS-200' }], Hazards: [{ Name: 'May not flash.' }], Remedies: [{ Name: 'Replace' }] },
      { RecallNumber: '99-002', RecallDate: '2025-01-03', Title: 'Toy cars recalled', Manufacturers: [{ Name: 'Toyco' }], Products: [{ Name: 'Toy car' }] },
    ];
    const { list, added } = mergeRecalls([], raw);
    expect(added).toBe(1); expect(list[0].modelList).toEqual(['AS-100', 'AS-200']);
    expect(noticesFor({ brand: 'Acme', model: 'AS 200 strobe' }, list)).toHaveLength(1);
    expect(fromCpsc({})).toBeNull();
    expect(cpscUrl('fire alarm')).toMatch(/^https:\/\/www\.saferproducts\.gov\/RestWebServices\/Recall\?format=json&ProductName=fire%20alarm/);
  });
});
