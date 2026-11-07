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
