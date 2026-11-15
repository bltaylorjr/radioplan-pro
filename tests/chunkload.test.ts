import { isChunkError, loadChunk } from '../src/engine/chunkload';

describe('page files that fail to load after an update', () => {
  it('recognizes the Safari, Chrome and Firefox messages', () => {
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Terrain-abc.js'))).toBe(true);
    expect(isChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkError(new TypeError("Cannot read properties of undefined (reading 'sites')"))).toBe(false);
  });
  it('tries again after a short network drop', async () => {
    let n = 0;
    const v = await loadChunk(async () => { if (n++ === 0) throw new TypeError('Importing a module script failed.'); return 42; });
    expect(v).toBe(42); expect(n).toBe(2);
  });
  it('passes other errors straight through', async () => {
    await expect(loadChunk(async () => { throw new Error('bug'); })).rejects.toThrow('bug');
  });
});
