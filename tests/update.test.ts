import { describe, it, expect } from 'vitest';
import { cmpVersion, pickUpdate, ASSETS } from '../src/engine/update';

const rel = (tag: string, extra = {}) => ({ tag_name: tag, html_url: 'https://github.com/x/y/releases/tag/' + tag, body: 'notes',
  assets: Object.values(ASSETS).map((n) => ({ name: n, browser_download_url: `https://github.com/bltaylorjr/radioplan-pro/releases/download/${tag}/${n}` })), ...extra });

describe('updates', () => {
  it('compares versions', () => {
    expect(cmpVersion('v1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(cmpVersion('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(cmpVersion('1.0.0', '1.0.0')).toBe(0);
    expect(cmpVersion('1.0', '1.0.1')).toBeLessThan(0);
  });
  it('offers the right file for each install', () => {
    expect(pickUpdate(rel('v1.1.0'), '1.0.0', 'windows')?.url).toMatch(/RadioPlan-Pro-Setup\.exe$/);
    expect(pickUpdate(rel('v1.1.0'), '1.0.0', 'android')?.url).toMatch(/\.apk$/);
    expect(pickUpdate(rel('v1.1.0'), '1.0.0', 'usb')?.url).toMatch(/FlashDrive\.zip$/);
    expect(pickUpdate(rel('v1.0.0'), '1.0.0', 'windows')).toBeNull();
    expect(pickUpdate(rel('v2.0.0', { prerelease: true }), '1.0.0', 'windows')).toBeNull();
  });
});

describe('update safety', () => {
  const mem = new Map<string, string>();
  beforeEachSetup();
  function beforeEachSetup() {
    (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } } as Storage;
  }
  it('passes on the checksum GitHub reports for the file', () => {
    const r = rel('v1.1.0'); r.assets[0] = { ...r.assets[0], digest: 'sha256:' + 'AB'.repeat(32) } as typeof r.assets[0];
    expect(pickUpdate(r, '1.0.0', 'windows')?.sha256).toBe('ab'.repeat(32));
    expect(pickUpdate(rel('v1.1.0'), '1.0.0', 'windows')?.sha256).toBeUndefined();
  });
  it('goes back to the last good version after 3 failed starts, then skips the bad one', async () => {
    const u = await import('../src/engine/update');
    mem.clear();
    expect(u.bootStart('1.0.0').rollbackTo).toBeNull(); u.bootHealthy('1.0.0');
    u.markPending('1.1.0', '1.0.0');
    expect(u.bootStart('1.1.0').justUpdated).toEqual({ from: '1.0.0', to: '1.1.0' });
    expect(u.bootStart('1.1.0').rollbackTo).toBeNull();
    expect(u.bootStart('1.1.0').rollbackTo).toBe('1.0.0');
    mem.set('radioplan.skipVersion', '1.1.0');
    expect(pickUpdate(rel('v1.1.0'), '1.0.0', 'windows')).toBeNull();
    expect(pickUpdate(rel('v1.1.1'), '1.0.0', 'windows')?.version).toBe('1.1.1');
    u.bootHealthy('1.1.1'); expect(u.skippedVersion()).toBeNull(); expect(u.lastGoodVersion()).toBe('1.1.1');
  });
});

describe('update source after the move to the new account', () => {
  it('asks the new downloads repo first and falls back to the old one when it has no release', async () => {
    const { checkForUpdate, UPDATE_REPO, OLD_UPDATE_REPO } = await import('../src/engine/update');
    const asked: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: string) => {
      asked.push(u);
      if (u.includes(UPDATE_REPO)) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(rel('v99.0.0')), { status: 200 });
    }) as typeof fetch;
    try {
      const got = await checkForUpdate();
      expect(got?.version).toBe('99.0.0');
      expect(asked[0]).toContain('lvplanpro/lvplan-pro');
      expect(asked[1]).toContain(OLD_UPDATE_REPO);
    } finally { globalThis.fetch = orig; }
  });
  it('uses the new repo alone when it has a release', async () => {
    const { checkForUpdate } = await import('../src/engine/update');
    const asked: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: string) => { asked.push(u); return new Response(JSON.stringify(rel('v99.0.1')), { status: 200 }); }) as typeof fetch;
    try { expect((await checkForUpdate())?.version).toBe('99.0.1'); expect(asked.length).toBe(1); } finally { globalThis.fetch = orig; }
  });
});
