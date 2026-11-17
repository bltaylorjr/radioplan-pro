import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'fs';
import { INTRO_PARTS, partsFor } from '../src/components/IntroVideo';

describe('intro video in two parts', () => {
  it('plays both intro parts in order, and other videos alone', () => {
    expect(partsFor('intro.mp4').map((p) => p.file)).toEqual(['intro.mp4', 'intro-2.mp4']);
    expect(partsFor('panorama-howto.mp4').map((p) => p.file)).toEqual(['panorama-howto.mp4']);
  });
  it('ships every part in public/, each under the 100 MB hosting limit', () => {
    for (const p of INTRO_PARTS) {
      const f = `public/${p.file}`;
      expect(existsSync(f)).toBe(true);
      expect(statSync(f).size).toBeLessThan(100 * 1024 * 1024);
    }
  });
});
