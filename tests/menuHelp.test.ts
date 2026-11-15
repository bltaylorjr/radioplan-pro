import { describe, it, expect } from 'vitest';
import { MENU_GROUPS, MENU_PAGES, MENU_ORDER, groupHeading, isStepPage } from '../src/data/menu';
import { FEATURES, FEATURES_BY_VERSION, featuresFor } from '../src/help/features';
import { HELP } from '../src/help/content';
import { findTools } from '../src/components/NavFind';

describe('menu', () => {
  it('every page is in a known section, once', () => {
    expect(new Set(MENU_PAGES.map((p) => p.id)).size).toBe(MENU_PAGES.length);
    for (const p of MENU_PAGES) expect(MENU_GROUPS.some((g) => g.id === p.group), p.id).toBe(true);
    for (const g of MENU_GROUPS) expect(MENU_PAGES.some((p) => p.group === g.id), g.id).toBe(true);
    expect(MENU_ORDER.length).toBe(MENU_PAGES.length);
  });
  it('follows the project lifecycle: setup, survey, design, codes, equipment, install, test, service, reports, then tools', () => {
    const order = MENU_ORDER.map((p) => p.id);
    const at = (id: string) => order.indexOf(id);
    expect(order[0]).toBe('company');
    expect(at('terrain')).toBeLessThan(at('alarm'));
    expect(at('blueprints')).toBeLessThan(at('install'));
    expect(at('install')).toBeLessThan(at('testing'));
    expect(at('materials')).toBeLessThan(at('install'));
    expect(at('testing')).toBeLessThan(at('service'));
    expect(at('troubleshoot')).toBeLessThan(at('reports'));
    expect(at('reports')).toBeLessThan(at('calculators'));
    expect(at('settings')).toBe(order.length - 1);
    expect(isStepPage('service')).toBe(true);
    expect(isStepPage('calculators')).toBe(false);
    expect(groupHeading(MENU_GROUPS[0])).toBe('1 · Project setup');
    expect(groupHeading(MENU_GROUPS.find((g) => g.id === 'tools')!)).toBe('Tools & reference');
  });
});

describe('feature guide', () => {
  it('each feature points at a real page and help topic, with steps', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
    for (const f of FEATURES) {
      expect(MENU_PAGES.some((p) => p.id === f.page), `${f.id} page ${f.page}`).toBe(true);
      for (const pg of f.alsoOn ?? []) if (pg !== '*') expect(MENU_PAGES.some((p) => p.id === pg), `${f.id} alsoOn ${pg}`).toBe(true);
      if (f.topic) expect(HELP.some((h) => h.id === f.topic), `${f.id} topic ${f.topic}`).toBe(true);
      expect(f.steps.length).toBeGreaterThan(0);
      expect(f.version).toMatch(/^\d+\.\d+\.\d+$/);
      for (const t of f.tour ?? []) expect(t.target.length).toBeGreaterThan(0);
    }
  });
  it('covers the tools added in 1.5.35 to 1.5.44', () => {
    for (const id of ['rr-download', 'rr-login', 'rr-progress', 'tilt-view', 'relays', 'azimuth', 'measure', 'draw-lines', 'clear-page', 'delete-confirm', 'true-scale', 'az-calc', 'calc-kit']) expect(FEATURES.some((f) => f.id === id), id).toBe(true);
  });
  it("What's new lists everything, newest first", () => {
    const wn = HELP.find((h) => h.id === 'whats-new')!;
    expect(wn.features).toHaveLength(FEATURES.length);
    expect(FEATURES_BY_VERSION[0].version >= FEATURES_BY_VERSION[FEATURES_BY_VERSION.length - 1].version).toBe(true);
    expect(featuresFor('terrain').map((f) => f.id)).toContain('draw-lines');
    expect(featuresFor('alarm').map((f) => f.id)).not.toContain('clear-page');
    expect(featuresFor('alarm', true).map((f) => f.id)).toContain('clear-page');
  });
  it('the menu guide names every section', () => {
    const mg = HELP.find((h) => h.id === 'menu-guide')!;
    for (const g of MENU_GROUPS) expect(mg.body).toContain(g.title);
  });
});

describe('Find a tool', () => {
  it('finds pages, tools and help by plain words', () => {
    expect(findTools('relay').map((h) => h.id)).toContain('relays');
    expect(findTools('azimuth calculator')[0].id).toBe('az-calc');
    expect(findTools('battery').some((h) => h.id === 'alarm')).toBe(true);
    expect(findTools('clear fields').map((h) => h.id)).toContain('clear-page');
    expect(findTools('log in').map((h) => h.id)).toContain('rr-login');
    expect(findTools('zzzz')).toEqual([]);
    expect(findTools('')).toEqual([]);
    expect(findTools('relay', ['company']).every((h) => h.kind !== 'page' || h.id === 'company')).toBe(true);
  });
});
