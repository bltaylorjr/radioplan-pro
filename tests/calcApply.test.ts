import { describe, it, expect } from 'vitest';
import { defaultProject } from '../src/defaults';
import { applyTargets, undoTargets, targetIsSame, getPath, setPath, type ApplyTarget } from '../src/engine/calcApply';
import { azimuthCalc, azimuthTargets, type AzInputs } from '../src/engine/azcalc';
import { LV_CALCS } from '../src/data/lvcalcs';

const t = (path: (string | number)[], v: unknown, id = path.join('.')): ApplyTarget => ({ id, label: id, page: 'x', sets: [[path, v]], to: String(v), now: () => '' });

describe('Apply to fields', () => {
  it('writes only the chosen fields and leaves the original alone', () => {
    const p = defaultProject();
    const q = applyTargets(p, [t(['radio', 'azimuthDeg'], 123.4), t(['erces', 'donorLat'], 35.6)]);
    expect(q.radio.azimuthDeg).toBe(123.4); expect(q.erces.donorLat).toBe(35.6);
    expect(p.radio.azimuthDeg).toBe(0);
    expect({ ...q.radio, azimuthDeg: 0 }).toEqual(p.radio);
  });
  it('undo puts back only those fields, keeping later edits elsewhere', () => {
    const p = defaultProject(), ts = [t(['radio', 'mechTiltDeg'], 4.2)];
    const q = applyTargets(p, ts); q.radio.txPowerDbm = 40;
    const u = undoTargets(q, p, ts);
    expect(u.radio.mechTiltDeg).toBe(p.radio.mechTiltDeg); expect(u.radio.txPowerDbm).toBe(40);
  });
  it('undo removes a field that did not exist before', () => {
    const p = defaultProject(); delete (p.erces as { donorName?: string }).donorName;
    const ts = [t(['erces', 'donorName'], 'Mt Pisgah')];
    expect(undoTargets(applyTargets(p, ts), p, ts).erces.donorName).toBeUndefined();
  });
  it('paths through arrays and missing objects', () => {
    const o: Record<string, unknown> = {}; setPath(o, ['a', 0, 'b'], 5);
    expect(getPath(o, ['a', 0, 'b'])).toBe(5); expect(Array.isArray(o.a)).toBe(true);
    expect(getPath(o, ['nope', 'x'])).toBeUndefined();
  });
  it('knows when a field already has the value', () => {
    const p = defaultProject();
    expect(targetIsSame(p, t(['radio', 'fMHz'], p.radio.fMHz))).toBe(true);
    expect(targetIsSame(p, t(['radio', 'fMHz'], 851))).toBe(false);
  });
});

describe('Azimuth calculator', () => {
  const base: AzInputs = { a: { lat: 35.5951, lon: -82.5515, label: 'A' }, b: { lat: 35.64, lon: -82.48, label: 'B' }, aGroundM: 650, bGroundM: 900, aAntM: 30, bAntM: 10, k: 4 / 3 };
  it('gives azimuths both ways, distance and tilt', () => {
    const r = azimuthCalc(base)!;
    expect(r.z.fwd).toBeGreaterThan(45); expect(r.z.fwd).toBeLessThan(60); // toward the north-east
    expect(Math.abs(((r.z.back - r.z.fwd + 360) % 360) - 180)).toBeLessThan(0.2);
    expect(r.z.km).toBeGreaterThan(7.5); expect(r.z.km).toBeLessThan(8.5);
    expect(r.tiltA!).toBeGreaterThan(0); expect(r.tiltB!).toBeLessThan(0); // B is higher: A tilts up, B down
    expect(r.aAmsl).toBe(680); expect(r.bAmsl).toBe(910);
    expect(r.z.fwdMag).toBeCloseTo((r.z.fwd - r.z.decA + 360) % 360, 6);
  });
  it('has no tilt without both ground heights, and no result for one point', () => {
    expect(azimuthCalc({ ...base, bGroundM: null })!.tiltA).toBeNull();
    expect(azimuthCalc({ ...base, b: null })).toBeNull();
    expect(azimuthCalc({ ...base, b: { ...base.a!, label: 'same' } })).toBeNull();
  });
  it('offers the antenna, donor and site fields; downtilt is positive when aiming down', () => {
    const p = defaultProject();
    const down = { ...base, aGroundM: 900, bGroundM: 650 };
    const ts = azimuthTargets(p, down, azimuthCalc(down)!);
    const tilt = ts.find((x) => x.id === 'radio-tilt')!;
    expect(tilt.sets[0][1] as number).toBeGreaterThan(0);
    expect(ts.find((x) => x.id === 'radio-az')!.sets[0][1]).toBeCloseTo(azimuthCalc(down)!.z.fwd, 1);
    const donor = ts.find((x) => x.id === 'donor')!;
    const q = applyTargets(p, [donor]);
    expect(q.erces.donorLat).toBe(35.64); expect(q.erces.donorLon).toBe(-82.48);
  });
  it('ticks the donor when point A is the first site', () => {
    const p = defaultProject(), s = p.sites[0];
    const x = { ...base, a: { lat: s.lat, lon: s.lon, label: s.name, siteId: s.id } };
    const ts = azimuthTargets(p, x, azimuthCalc(x)!);
    expect(ts.find((y) => y.id === 'donor')!.on).toBe(true);
    expect(ts.some((y) => y.id === 'a-height')).toBe(true);
  });
});

describe('Low-voltage calculators', () => {
  it('fire alarm battery applies to the Fire Alarm page and reads the project', () => {
    const c = LV_CALCS.find((x) => x.id === 'fa-battery')!, p = defaultProject();
    const x = { ...Object.fromEntries(c.inputs.map((i) => [i.k, i.v])), ...c.fromProject!(p) };
    expect(x.h).toBe(p.alarm.standbyHours); expect(x.sf).toBe(20);
    const a = c.apply!(x);
    expect(a.find((y) => y.id === 'fa-sf')!.value).toBeCloseTo(1.2, 6);
    expect(a.find((y) => y.id === 'fa-ah')!.on).toBe(false);
  });
});
