import { describe, it, expect } from 'vitest';
import { perProject, noteProject } from '../src/engine/memo';
describe('per-project cache', () => {
  it('caches only the current project and drops results when it changes', () => {
    let n = 0; const f = perProject((p: { v: number }) => { n++; return p.v * 2; });
    const a = { v: 1 }; expect(f(a)).toBe(2); expect(f(a)).toBe(2); expect(n).toBe(2); // not current: fresh each time
    noteProject(a); f(a); f(a); expect(n).toBe(3);
    a.v = 5; const b = { ...a }; noteProject(b); expect(f(b)).toBe(10); expect(n).toBe(4);
    expect(f(a)).toBe(10); expect(n).toBe(5); // old version: fresh
  });
});
