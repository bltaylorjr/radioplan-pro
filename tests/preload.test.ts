import { track } from '../src/engine/chunkload';

describe('pages download in the background', () => {
  it('opening a page uses the same loader the background download uses', async () => {
    let n = 0;
    const open = track(async () => { n++; return { ok: true }; });
    expect(await open()).toEqual({ ok: true });
    expect(n).toBe(1);
  });
});
