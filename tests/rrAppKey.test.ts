import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('../src/engine/projectdb', () => ({
  kvGet: async (k: string) => store.get(k),
  kvSet: async (k: string, v: unknown) => { if (v === undefined) store.delete(k); else store.set(k, v); },
  kvKeys: async (p: string) => [...store.keys()].filter((k) => k.startsWith(p)),
}));
vi.mock('../src/engine/update', () => ({ tauri: () => null }));

const rr = await import('../src/engine/radioref');
const old = { username: 'bob', password: 'pw', appKey: 'OLDKEY123', stay: true };

describe('RadioReference app key in User Settings', () => {
  beforeEach(async () => { store.clear(); await rr.logOut(); store.clear(); });

  it('moves a key saved by older versions inside the login to its own place', async () => {
    // older versions kept the key inside the sealed login record
    const sealed = await rr.seal(old);
    store.set(rr.LOGIN_KEY, sealed);
    expect(await rr.loadAppKey()).toBe('OLDKEY123');
    expect(store.has(rr.APPKEY_KEY)).toBe(true);
    const l = await rr.loadLogin();
    expect(l).toMatchObject({ username: 'bob', appKey: 'OLDKEY123', stay: true });
  });

  it('keeps the key after log out, and logging in no longer stores it with the password', async () => {
    await rr.saveAppKey('  NEWKEY  ');
    await rr.logIn({ username: 'bob', password: 'pw', appKey: '' }, true);
    expect((await rr.loadLogin())?.appKey).toBe('NEWKEY');
    await rr.logOut();
    expect(await rr.loadLogin()).toBeNull();
    expect(store.has(rr.LOGIN_KEY)).toBe(false);
    expect(await rr.loadAppKey()).toBe('NEWKEY');
  });

  it('session-only login keeps nothing but the key on the device', async () => {
    await rr.saveAppKey('K2');
    await rr.logIn({ username: 'bob', password: 'pw', appKey: 'K2' }, false);
    expect(store.has(rr.LOGIN_KEY)).toBe(false);
    expect(await rr.loadLogin()).toMatchObject({ username: 'bob', appKey: 'K2', stay: false });
  });

  it('a key typed by an older caller at login is saved when none is set', async () => {
    await rr.logIn({ username: 'bob', password: 'pw', appKey: 'LEGACY' }, true);
    expect(await rr.loadAppKey()).toBe('LEGACY');
  });

  it('"Log out and delete downloads" keeps the app key', async () => {
    await rr.saveAppKey('KEEPME');
    store.set('radioref.dl.v1:NC|buncombe', await rr.seal({ x: 1 }));
    await rr.wipeAll();
    expect(store.has('radioref.dl.v1:NC|buncombe')).toBe(false);
    expect(await rr.loadAppKey()).toBe('KEEPME');
  });

  it('saving an empty key removes it', async () => {
    await rr.saveAppKey('K');
    await rr.saveAppKey('');
    expect(await rr.loadAppKey()).toBe('');
  });
});
