import { describe, it, expect } from 'vitest';
import { removeFromFolder } from '../src/engine/projectdb';

describe('deleting a project from the data folder', () => {
  it('removes every file of that project and leaves the others', async () => {
    const files = new Set(['Job_A.p1.radioplan.json', 'Old_name.p1.radioplan.json', 'Job_B.p2.radioplan.json', 'notes.txt']);
    const dir = {
      async *values() { for (const name of [...files]) yield { kind: 'file', name }; },
      async removeEntry(n: string) { files.delete(n); },
    };
    await removeFromFolder(dir as never, 'p1');
    expect([...files].sort()).toEqual(['Job_B.p2.radioplan.json', 'notes.txt']);
  });
});
