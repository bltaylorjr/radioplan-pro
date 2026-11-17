// "Show all tools" and "Project complete" put the menu back to the default view.
import { describe, it, expect, beforeEach } from 'vitest';

const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; }, clear: () => { for (const k of Object.keys(store)) delete store[k]; }, key: () => null, length: 0,
} as Storage;
(globalThis as unknown as { window: unknown }).window = { dispatchEvent: () => true };

describe('menu reset', () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });
  it('Show all tools turns every hidden tool back on, opens folded sections and tells the user', async () => {
    const t = await import('../src/engine/toolPrefs');
    t.setHiddenTools(['spectrum', 'audio']); store['lvplan.menuFolded'] = '["tools"]';
    t.resetToolView('shown');
    expect(t.hiddenTools()).toEqual([]);
    expect(store['lvplan.menuFolded']).toBeUndefined();
    expect(t.toolNotice()?.reset).toBe('shown');
  });
  it('Project complete always shows its notice, even with nothing hidden', async () => {
    const t = await import('../src/engine/toolPrefs');
    t.clearToolNotice(); t.setHiddenTools([]);
    t.resetToolView('complete');
    expect(t.toolNotice()?.reset).toBe('complete');
  });
  it('a cleared project only tells the user when something was hidden', async () => {
    const t = await import('../src/engine/toolPrefs');
    t.clearToolNotice(); t.setHiddenTools([]);
    expect(t.resetToolView('cleared')).toBe(false);
    expect(t.toolNotice()).toBeNull();
  });
  it('the menu follows the job: readings before calibration, floor plans start design, build output with closeout', async () => {
    const { MENU_ORDER } = await import('../src/data/menu');
    const ids = MENU_ORDER.map((p) => p.id), at = (x: string) => ids.indexOf(x);
    expect(at('signal')).toBeLessThan(at('survey'));
    expect(at('floorplan')).toBeLessThan(at('autodesign'));
    expect(at('buildout')).toBeLessThan(at('reports'));
    expect(MENU_ORDER.find((p) => p.id === 'buildout')?.group).toBe('closeout');
  });
});
