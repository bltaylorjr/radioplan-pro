import { describe, it, expect } from 'vitest';
import { careFor, dueForRefresh, retryAfterMs, runMaintenance, registerDataset, unregisterDataset, datasets, wrapChecked, isIntact, sha256, noticeFor, Dataset, MaintCtx, MaintReport, MaintState } from '../src/engine/maintain';
import { pruneIds, demIntact, recordIntact, summarize } from '../src/engine/projectdb';
import { checksumOf } from '../src/engine/maintain';
import { defaultProject } from '../src/defaults';

const H = 3600e3;
const ctx = (o: Partial<MaintCtx> = {}): MaintCtx => ({ online: true, now: 1000 * H, log: () => undefined, ...o });
const rep = (): MaintReport => ({ repaired: [], refreshed: [], rolledBack: [], failed: [] });

describe('automatic care engine', () => {
  it('checksums: known SHA-256 and damage is noticed', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const c = await wrapChecked({ a: 1, list: [1, 2] });
    expect(await isIntact(c)).toBe(true);
    expect(await isIntact({ ...c, v: { a: 2, list: [1, 2] } })).toBe(false);
    expect(await isIntact(undefined)).toBe(false);
  });
  it('repairs damaged data, then checks it again', async () => {
    let broken = true;
    const d: Dataset = { id: 't', label: 'Test', everyHours: 0, verify: async () => broken ? { ok: false, problem: 'bad' } : { ok: true }, repair: async () => { broken = false; return 'fixed it'; } };
    const r = rep(); const s = await careFor(d, undefined, ctx(), r);
    expect(r.repaired).toEqual(['Test: fixed it']); expect(s.lastVerifyOk).toBe(true); expect(s.problem).toBeUndefined();
    expect(noticeFor(r)).toMatch(/fixed a problem/);
  });
  it('keeps the old copy when a refresh fails, and backs off', async () => {
    let data = 'old';
    const d: Dataset = { id: 't', label: 'Pack', everyHours: 24, snapshot: async () => data, restore: async (s) => { data = s as string; },
      refresh: async () => { data = 'half-written'; throw new Error('network'); } };
    const r = rep(); const s = await careFor(d, undefined, ctx(), r);
    expect(data).toBe('old'); expect(r.rolledBack).toEqual(['Pack']); expect(s.failures).toBe(1); expect(s.lastRefresh).toBeUndefined();
    expect(dueForRefresh(d, s, s.lastTry! + 0.5 * H)).toBe(false);
    expect(dueForRefresh(d, s, s.lastTry! + 1.1 * H)).toBe(true);
    expect(retryAfterMs(3, 24)).toBe(4 * H); expect(retryAfterMs(10, 24)).toBe(24 * H);
  });
  it('rolls back a refresh whose new copy fails its check', async () => {
    let data = 'good';
    const d: Dataset = { id: 't', label: 'Pack', everyHours: 24, verify: async () => ({ ok: data !== 'corrupt', problem: 'corrupt' }),
      snapshot: async () => data, restore: async (s) => { data = s as string; }, refresh: async () => { data = 'corrupt'; return { changed: true }; } };
    const r = rep(); await careFor(d, undefined, ctx(), r);
    expect(data).toBe('good'); expect(r.failed).toEqual(['Pack']);
  });
  it('waits for a connection and for the dataset to be available', async () => {
    let calls = 0;
    const d: Dataset = { id: 't', label: 'Pack', everyHours: 24, needsOnline: true, refresh: async () => { calls++; return { changed: true }; } };
    await careFor(d, undefined, ctx({ online: false }), rep()); expect(calls).toBe(0);
    const s = await careFor({ ...d, available: () => 'Log in first' }, undefined, ctx(), rep()); expect(calls).toBe(0); expect(s.detail).toBe('Log in first');
    const s2 = await careFor(d, undefined, ctx(), rep()); expect(calls).toBe(1); expect(s2.lastRefresh).toBe(1000 * H);
    expect(dueForRefresh(d, s2, 1000 * H + 23 * H)).toBe(false); expect(dueForRefresh(d, s2, 1000 * H + 25 * H)).toBe(true);
  });
  it('runs every registered dataset and saves state; other features plug in', async () => {
    for (const x of datasets()) unregisterDataset(x.id);
    registerDataset({ id: 'a', label: 'A', everyHours: 1, refresh: async () => ({ changed: true }) });
    registerDataset({ id: 'b', label: 'B', everyHours: 0, verify: async () => { throw new Error('unreadable'); } });
    let saved: MaintState = {};
    const r = await runMaintenance(ctx(), { get: async () => saved, set: async (s) => { saved = s; } });
    expect(r.refreshed).toEqual(['A']); expect(saved.a.lastRefresh).toBe(1000 * H); expect(saved.b.problem).toBe('unreadable');
  });
});

describe('stored data checks', () => {
  it('keeps daily backups and safety copies apart from autosaves', () => {
    const v = [
      ...Array.from({ length: 30 }, (_, i) => ({ vid: i + 1, at: 1000 + i })),
      ...Array.from({ length: 9 }, (_, i) => ({ vid: 100 + i, at: 500 + i, keep: 'daily' as const })),
      ...Array.from({ length: 6 }, (_, i) => ({ vid: 200 + i, at: 400 + i, keep: 'safety' as const })),
    ];
    const del = pruneIds(v, 25).sort((a, b) => a - b);
    expect(del).toEqual([1, 2, 3, 4, 5, 100, 101, 200]);
  });
  it('notices a damaged project record', async () => {
    const p = defaultProject(); const r = { ...summarize('x', p, 1, 2), sum: await checksumOf(p) };
    expect(await recordIntact(r)).toBe(true);
    expect(await recordIntact({ ...r, project: { ...p, sites: [] } })).toBe(false);
    expect(await recordIntact({ project: { nope: 1 } })).toBe(false);
    expect(await recordIntact({ ...r, sum: undefined })).toBe(true); // saved by an older version: structure only
  });
  it('notices a damaged terrain grid', () => {
    const g = { name: 't', ncols: 2, nrows: 2, west: -82, north: 35, cellDeg: 0.001, data: new Float32Array([1, 2, 3, 4]), nodata: -9999, source: 'x' };
    expect(demIntact(g)).toBe(true);
    expect(demIntact({ ...g, data: new Float32Array(3) })).toBe(false);
    expect(demIntact({ ...g, data: new Float32Array([NaN, NaN, NaN, NaN]) })).toBe(false);
    expect(demIntact(null)).toBe(false);
  });
});
