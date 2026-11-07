import { describe, it, expect } from 'vitest';
import { defaultProject } from '../src/defaults';
import { summarize, pruneIds, encodeDem, decodeDem, makeBackup, readBackup, BACKUP_FORMAT, folderFileName } from '../src/engine/projectdb';
import { toPackage } from '../src/engine/sync';

describe('built-in project storage', () => {
  it('summarizes a project for the library list', () => {
    const p = defaultProject(); p.meta.name = 'Tower A'; p.meta.number = '24-117'; p.meta.client = 'County EM';
    const r = summarize('x1', p, 100, 200);
    expect(r).toMatchObject({ id: 'x1', name: 'Tower A', number: '24-117', client: 'County EM', created: 100, updated: 200, sites: p.sites.length });
    expect(r.bytes).toBe(JSON.stringify(p).length);
  });
  it('keeps only the newest versions', () => {
    const v = Array.from({ length: 30 }, (_, i) => ({ vid: i + 1, at: i * 10 }));
    const del = pruneIds(v, 25);
    expect(del).toHaveLength(5); expect(del.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
  it('round-trips terrain through the backup encoding', () => {
    const data = new Float32Array([1.5, -2, 300.25, -9999]);
    const g = { name: 't', ncols: 2, nrows: 2, west: -80, north: 35, cellDeg: 0.001, data, nodata: -9999, source: 'test' };
    const back = decodeDem(JSON.parse(JSON.stringify(encodeDem(g))));
    expect(Array.from(back.data)).toEqual(Array.from(data)); expect(back.west).toBe(-80);
  });
  it('reads full backups, sync files and plain project files', () => {
    const p = defaultProject(); p.meta.name = 'B';
    const b = makeBackup([{ record: { ...summarize('id1', p, 1, 2), project: undefined } as never, project: p }]);
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(readBackup(JSON.stringify(b))[0].project.meta.name).toBe('B');
    expect(readBackup(JSON.stringify(toPackage(p)))[0].project.meta.name).toBe('B');
    expect(readBackup('﻿' + JSON.stringify(p))[0].record.name).toBe('B');
    expect(() => readBackup('{"a":1}')).toThrow();
  });
  it('names folder copies by project and id', () => {
    const p = defaultProject(); p.meta.name = 'Main St / Tower #2';
    expect(folderFileName('abc123', p)).toBe('Main_St_Tower_2.abc123.radioplan.json');
  });
});
