// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { defaultProject } from '../src/defaults';
import type { Project } from '../src/types';

beforeAll(() => {
  const m = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 } as Storage;
});

describe('working together on one device', () => {
  it('invite, join, and changes flow both ways by themselves', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const acc = await import('../src/engine/accounts');
    const db = await import('../src/engine/projectdb');
    const team = await import('../src/engine/team');
    const { session: bob } = await acc.enableSignIn('Bobby', '1111', 'pin');
    const { account: ann } = await acc.addUser('Ann', '2222', 'pin');
    // Bobby shares his open project
    let p: Project = defaultProject(); p.meta.name = 'Hospital nurse call';
    p = { ...p, team: team.teamWith(p, [{ id: ann.id, name: 'Ann' }]) };
    await db.putProject('bp', p);
    await team.inviteUsers(p, [ann.id], 'bp');
    // Ann signs in and joins
    await acc.signInWithSecret(ann.id, '2222');
    let annOpen = { id: 'none', project: defaultProject(), replace: (_: Project) => undefined as void };
    const r1 = await team.collectTeamChanges(annOpen);
    expect(r1.invites).toHaveLength(1);
    const annId = await team.acceptInvite(r1.invites[0], async (proj) => (await db.importEntries(db.readBackup(JSON.stringify(proj))))[0]);
    const annP = (await db.getRecord(annId))!.project;
    expect(annP.meta.name).toBe('Hospital nurse call');
    // Ann adds a field note and saves; the change goes to Bobby's box
    const edited: Project = { ...annP, fieldNotes: [{ id: 'n1', at: '2026-11-20T10:00:00Z', title: 'Ann was here', text: '', category: 'Site visit', photos: [], tags: [], author: 'Ann', followUp: false, done: false }] } as Project;
    await db.putProject(annId, edited);
    team.pushTeamUpdate(edited);
    await vi.advanceTimersByTimeAsync(3500);
    // Bobby signs in: his stored copy (not open) gets Ann's note merged in
    await acc.signInWithSecret(bob.account.id, '1111');
    let shown: Project | null = null;
    const r2 = await team.collectTeamChanges({ id: 'bp', project: (await db.getRecord('bp'))!.project, replace: (x) => { shown = x; } });
    expect(r2.merged).toEqual([{ name: 'Hospital nurse call', from: 'Ann' }]);
    expect((shown as Project | null)?.fieldNotes?.map((n) => n.title)).toEqual(['Ann was here']);
    vi.useRealTimers();
  }, 60000);
});
