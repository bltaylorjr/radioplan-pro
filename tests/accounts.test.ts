// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { wrapWithSecret, unwrapWithSecret, newRecoveryCode, normalizeRecovery, cipherFor, seal, open, newShareKeys, sealFor, openShare, protectText, unprotectText, randomBytes } from '../src/engine/vault';
import { derToRaw, verifyAssertion } from '../src/engine/biometric';
import { lockoutMs } from '../src/engine/accounts';
import { defaultProject } from '../src/defaults';

// A tiny in-memory localStorage for the account list's quick copy.
beforeAll(() => {
  const m = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 } as Storage;
  (globalThis as unknown as { location: { reload: () => void; protocol: string } }).location = { reload: () => undefined, protocol: 'https:' };
});

describe('vault (encryption)', () => {
  it('locks a key with a PIN and only the right PIN opens it', async () => {
    const key = randomBytes(32);
    const w = await wrapWithSecret('4821', key, 1000);
    expect(await unwrapWithSecret('4821', w, )).toEqual(key);
    expect(await unwrapWithSecret('4822', w)).toBeNull();
  });
  it('recovery codes ignore case, spaces and dashes', () => {
    const c = newRecoveryCode();
    expect(c).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
    expect(normalizeRecovery(c.toLowerCase().replace(/-/g, ' '))).toBe(c.replace(/-/g, ''));
  });
  it('seals values with files and terrain inside, and opens them back', async () => {
    const c = await cipherFor(randomBytes(32));
    const v = { a: 1, list: [{ blob: new Blob(['hello'], { type: 'text/plain' }) }], grid: new Float32Array([1.5, -2]) };
    const s = await seal(c, v);
    expect(JSON.stringify(s)).not.toContain('hello');
    const back = await open<typeof v>(c, s);
    expect(back.a).toBe(1); expect(await back.list[0].blob.text()).toBe('hello'); expect(back.list[0].blob.type).toBe('text/plain');
    expect(Array.from(back.grid)).toEqual([1.5, -2]);
    const other = await cipherFor(randomBytes(32));
    await expect(open(other, s)).rejects.toBeTruthy();
  });
  it('a shared package opens only for the user it was sent to', async () => {
    const ann = await newShareKeys(), joe = await newShareKeys();
    const pkg = await sealFor(ann.pub, { hi: 'there' });
    expect(await openShare(ann.priv, pkg)).toEqual({ hi: 'there' });
    await expect(openShare(joe.priv, pkg)).rejects.toBeTruthy();
  });
  it('password-locked files', async () => {
    const f = await protectText('secret1', 'project text');
    expect(JSON.stringify(f)).not.toContain('project text');
    expect(await unprotectText('secret1', f)).toBe('project text');
    expect(await unprotectText('wrong', f)).toBeNull();
  });
});

describe('fingerprint checks', () => {
  it('converts DER signatures and verifies a WebAuthn answer', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', kp.publicKey)).toString('base64');
    const challenge = randomBytes(32);
    const b64url = (u: Uint8Array) => Buffer.from(u).toString('base64url');
    const cdj = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: b64url(challenge), origin: 'https://x' }));
    const auth = new Uint8Array(37); auth[32] = 0x05; // user present + verified
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', cdj));
    const signed = new Uint8Array([...auth, ...h]);
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed));
    // raw → DER
    const int = (b: Uint8Array) => { let x = Array.from(b); while (x.length > 1 && x[0] === 0) x = x.slice(1); if (x[0] & 0x80) x = [0, ...x]; return [0x02, x.length, ...x]; };
    const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
    const der = new Uint8Array([0x30, body.length, ...body]);
    expect(derToRaw(der)).toEqual(raw);
    expect(await verifyAssertion(spki, -7, challenge, auth, cdj, der)).toBe(true);
    expect(await verifyAssertion(spki, -7, randomBytes(32), auth, cdj, der)).toBe(false); // old challenge
    const noUv = auth.slice(); noUv[32] = 0x01;
    expect(await verifyAssertion(spki, -7, challenge, noUv, cdj, der)).toBe(false); // fingerprint not checked
  });
});

describe('accounts on one device', () => {
  it('waits longer after repeated wrong tries', () => {
    expect(lockoutMs(4)).toBe(0); expect(lockoutMs(5)).toBe(30_000); expect(lockoutMs(6)).toBe(60_000); expect(lockoutMs(20)).toBe(15 * 60_000);
  });
  it('turns on sign-in, locks old projects, keeps users apart, resets a password and shares', async () => {
    const db = await import('../src/engine/projectdb');
    const acc = await import('../src/engine/accounts');
    // A project saved before sign-in was turned on.
    const p = defaultProject(); p.meta.name = 'Old tower job';
    await db.putProject('p1', p);
    await db.kvSet('contacts.v1', { mine: [{ id: 'c1', name: 'Inspector' }], hidden: [] });
    await db.kvSet('content.pack.v1:codes', { shared: true });

    const { session, recoveryCode } = await acc.enableSignIn('Bobby', '1234', 'pin');
    expect(session.account.owner).toBe(true);
    // Stored sealed: the name is no longer readable in the raw database.
    const raw = await new Promise<unknown>((res) => { const r = indexedDB.open('radioplan-data'); r.onsuccess = () => { const t = r.result.transaction('projects').objectStore('projects').get('p1'); t.onsuccess = () => res(t.result); }; });
    expect(JSON.stringify(raw)).not.toContain('Old tower job');
    expect((await db.getRecord('p1'))?.project.meta.name).toBe('Old tower job');
    expect((await db.listProjects())[0].name).toBe('Old tower job');
    expect((await db.kvGet<{ mine: { name: string }[] }>('contacts.v1'))?.mine[0].name).toBe('Inspector');
    expect(await db.kvGet('content.pack.v1:codes')).toEqual({ shared: true }); // shared download, not sealed

    const { account: ann } = await acc.addUser('Ann', 'annpass1', 'password');
    expect(ann.db).not.toBe('radioplan-data');
    await expect(acc.signInWithSecret(ann.id, 'wrong')).rejects.toThrow(/not right/);
    await acc.signInWithSecret(ann.id, 'annpass1');
    expect(await db.listProjects()).toHaveLength(0); // Bobby's projects are not in Ann's list
    expect(await db.kvGet('contacts.v1')).toBeUndefined();
    expect(await db.kvGet('content.pack.v1:codes')).toEqual({ shared: true });
    const q = defaultProject(); q.meta.name = 'Ann job'; await db.putProject('a1', q);

    // Bobby forgot his PIN: the recovery code sets a new one and his projects open again.
    const key = await acc.checkRecovery(session.account.id, recoveryCode.toLowerCase());
    await acc.resetPassword(session.account.id, key, '9999', 'pin');
    expect((await db.getRecord('p1'))?.project.meta.name).toBe('Old tower job');
    expect((await db.listProjects()).map((r) => r.name)).toEqual(['Old tower job']);
    await expect(acc.signInWithSecret(session.account.id, '1234')).rejects.toThrow();
    await expect(acc.checkRecovery(ann.id, recoveryCode)).rejects.toThrow(/recovery code/);

    // Bobby shares his project with Ann; only Ann can read it.
    await acc.sendToUser(ann.id, 'invite', 'team1', p, [{ id: session.account.id, name: 'Bobby' }, { id: ann.id, name: 'Ann' }]);
    expect(await acc.readInbox()).toHaveLength(0); // not for Bobby
    await acc.signInWithSecret(ann.id, 'annpass1');
    const box = await acc.readInbox();
    expect(box).toHaveLength(1); expect(box[0].projectName).toBe('Old tower job'); expect(box[0].from.name).toBe('Bobby');

    // Owner removes Ann; her database goes with her.
    await acc.signInWithSecret(session.account.id, '9999');
    await acc.removeUser(ann.id);
    expect((await acc.loadRegistry()).accounts.map((a) => a.name)).toEqual(['Bobby']);

    // Turning sign-in off unlocks the projects again.
    await acc.disableSignIn();
    db.useUserStorage('radioplan-data', null);
    expect((await db.getRecord('p1'))?.project.meta.name).toBe('Old tower job');
    expect(await acc.signInOn()).toBe(false);
  }, 60000);
});
