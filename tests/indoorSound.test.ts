import { describe, it, expect } from 'vitest';
import { defaultIndoorSound, soundGrid, soundRule, stiFrom, levelAt1m, normalizeIndoorSound, soundAdvice, soundAt } from '../src/engine/indoorSound';

const o = { walls: [], ceilingM: 2.7, rt60: 0.8, widthM: 20, heightM: 12 };
describe('indoor sound', () => {
  it('rules follow NFPA 72 public / private / sleeping', () => {
    const s = defaultIndoorSound();
    expect(soundRule({ ...s, occupancy: 'public', ambientDba: 55 }).target).toBe(70);
    expect(soundRule({ ...s, occupancy: 'private', ambientDba: 55 }).target).toBe(65);
    expect(soundRule({ ...s, occupancy: 'sleeping', ambientDba: 45 }).target).toBe(75);
    expect(soundRule({ ...s, targetDba: 80 }).target).toBe(80);
  });
  it('tap doubling adds 3 dB and horns are rated at 10 ft', () => {
    expect(levelAt1m({ kind: 'ceiling', ref: 89, watts: 2 }) - levelAt1m({ kind: 'ceiling', ref: 89, watts: 1 })).toBeCloseTo(3.01, 1);
    expect(levelAt1m({ kind: 'fahorn', ref: 88, watts: 1 })).toBeCloseTo(97.7, 0);
  });
  it('STI drops with echo and noise', () => {
    expect(stiFrom(1e7, 1e6, 0.5, 40)).toBeGreaterThan(0.7);
    expect(stiFrom(1e7, 1e7, 3, 40)).toBeLessThan(stiFrom(1e7, 1e7, 0.8, 40));
    expect(stiFrom(1e6, 1e5, 0.6, 60)).toBeLessThan(stiFrom(1e6, 1e5, 0.6, 30));
  });
  it('grid: walls cut sound and more speakers fill the floor', () => {
    const s = { ...defaultIndoorSound(), ambientDba: 68, speakers: [{ id: 'a', label: 'S1', x: 5, y: 6, kind: 'ceiling' as const, watts: 1, ref: 89 }] };
    const g1 = soundGrid(s, o);
    const s2 = { ...s, speakers: [...s.speakers, { id: 'b', label: 'S2', x: 15, y: 6, kind: 'ceiling' as const, watts: 1, ref: 89 }] };
    const g2 = soundGrid(s2, o);
    expect(g2.pct).toBeGreaterThan(g1.pct);
    const open = soundAt(15, 6, s, o).dba!, walled = soundAt(15, 6, s, { ...o, walls: [{ x1: 10, y1: 0, x2: 10, y2: 12, material: 'block' }] }).dba!;
    expect(open - walled).toBeGreaterThan(20);
    expect(g2.stiAvg).toBeGreaterThan(0.3);
    expect(soundAdvice(s2, g2, soundRule(s2), (m) => `${m.toFixed(1)} m`).length).toBeGreaterThan(1);
  });
  it('normalize fills older and shared copies', () => {
    const n = normalizeIndoorSound({ speakers: [{ id: 'x', x: 1, y: 1, kind: 'bogus' } as never], sti: undefined as never });
    expect(n.speakers[0].kind).toBe('ceiling'); expect(n.sti).toEqual([]); expect(n.rt60).toBe(1);
  });
});
