import { describe, it, expect } from 'vitest';
import { searchFcc, statesNear, emissionWords, bandOf, publicSafetyNear, serviceGroup } from '../src/engine/fccdata';
import { faaCheck, nearestOnRunway, loadAirports } from '../src/engine/faa';
import { estimatePack, packUrls, boundsAroundPoint, bestZoomFor, etaText } from '../src/engine/mappacks';

const AVL = { lat: 35.5951, lon: -82.5515 }; // downtown Asheville

describe('FCC built-in data', () => {
  it('picks the states near a point', () => {
    expect(statesNear(AVL, 10)).toContain('NC');
    expect(statesNear(AVL, 10)).not.toContain('VA');
    expect(statesNear({ lat: 36.58, lon: -81.7 }, 10).sort()).toEqual(expect.arrayContaining(['NC', 'TN', 'VA']));
  });
  it('finds registered towers and licenses around Asheville', async () => {
    const r = await searchFcc(AVL, 5, {}, 'Buncombe');
    expect(r.towers.length).toBeGreaterThan(10);
    expect(r.towers[0].km).toBeLessThan(2);
    expect(r.towers.every((t, i) => i === 0 || t.km >= r.towers[i - 1].km)).toBe(true);
    expect(r.licenses.some((l) => /asheville/i.test(l.lic.licensee))).toBe(true);
    expect(r.countyWide.some((l) => /buncombe/i.test(l.licensee))).toBe(true);
    const ps = await searchFcc(AVL, 5, { group: 'Public safety', band: '800' });
    expect(ps.licenses.length).toBeGreaterThan(0);
    expect(ps.licenses.every((l) => serviceGroup(l.lic.service) === 'Public safety')).toBe(true);
  }, 30000);
  it('lists public-safety licensees in a BDA passband', async () => {
    const r = await publicSafetyNear(AVL, 8, [[806, 824], [851, 869]], 'Buncombe');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.freqs.every((f) => (f.mhz >= 806 && f.mhz <= 824) || (f.mhz >= 851 && f.mhz <= 869)))).toBe(true);
  }, 30000);
  it('reads emission designators and bands', () => {
    expect(emissionWords('8K10F1E')).toMatch(/P25 Phase 1/);
    expect(emissionWords('11K2F3E')).toMatch(/11.2 kHz analog/);
    expect(bandOf(155.1)).toBe('vhf'); expect(bandOf(856.1)).toBe('800'); expect(bandOf(769.5)).toBe('700'); expect(bandOf(6000)).toBe('mw');
  });
});

describe('FAA height check (14 CFR 77.9)', () => {
  it('has Asheville Regional with its runway', async () => {
    const { airports } = await loadAirports();
    const avl = airports.find((a) => a.id === 'AVL')!;
    expect(avl.use).toBe('PU');
    expect(Math.max(...avl.runways.map((r) => r.lengthFt))).toBeGreaterThan(3200);
  });
  it('nearest runway point is on the segment', () => {
    const apt = { elevFt: 100 } as never;
    const rw = { id: '1/19', lengthFt: 6000, ends: [{ lat: 35.0, lon: -82.0, elevFt: 100 }, { lat: 35.02, lon: -82.0, elevFt: 120 }] };
    const n = nearestOnRunway({ lat: 35.01, lon: -81.99 }, rw, apt)!;
    expect(n.at.lat).toBeCloseTo(35.01, 4);
    expect(n.elevFt).toBeCloseTo(110, 0);
    expect(n.ft).toBeGreaterThan(2900); expect(n.ft).toBeLessThan(3000); // 0.01° lon at 35° N ≈ 912 m ≈ 2990 ft
  });
  it('flags towers over 200 ft and near runways', async () => {
    const tall = await faaCheck({ lat: 35.8, lon: -82.9 }, 250, 2500);
    expect(tall.over200).toBe(true); expect(tall.verdict).toBe('notice');
    // 1 mile from Asheville Regional (AVL), 2,165 ft field: 100:1 surface ≈ 53 ft above the runway there
    const { airports } = await loadAirports(); const avl = airports.find((a) => a.id === 'AVL')!;
    const p = { lat: avl.lat, lon: avl.lon + 0.03 };
    const near = await faaCheck(p, 150, avl.elevFt);
    expect(near.verdict).toBe('notice');
    expect(near.checks[0].airport.id).toBe('AVL');
    expect(near.checks[0].slope).toBe(100);
    const low = await faaCheck(p, 10, avl.elevFt);
    expect(low.maxNoNoticeFt).toBeGreaterThan(10);
    expect(low.verdict).toBe('no-notice');
  });
  it('a short tower far from airports needs no notice', async () => {
    const r = await faaCheck({ lat: 35.75, lon: -82.95 }, 60, 3000);
    expect(r.over200).toBe(false);
    expect(r.checks.filter((c) => c.qualifies === 'yes').every((c) => (c.exceedsFt ?? -1) <= 0)).toBe(true);
  });
});

describe('Offline map packs', () => {
  const b = boundsAroundPoint(35.6, -82.55, 8);
  it('counts tiles and size before download', () => {
    const e = estimatePack({ bounds: b, zMin: 8, zMax: 14, layers: ['satellite', 'topo'], terrain: true });
    expect(e.tiles).toBe(packUrls({ bounds: b, zMin: 8, zMax: 14, layers: ['satellite', 'topo'], terrain: true }).length);
    expect(e.mb).toBeGreaterThan(1);
    expect(e.perLayer.map((x) => x.key)).toEqual(['satellite', 'topo', 'terrain']);
  });
  it('terrain stops at zoom 13 and best zoom fits the limit', () => {
    const urls = packUrls({ bounds: b, zMin: 8, zMax: 16, layers: [], terrain: true });
    expect(urls.every((u) => !/terrarium\/(1[4-9])\//.test(u))).toBe(true);
    const z = bestZoomFor({ bounds: b, zMin: 8, layers: ['satellite'], terrain: true }, 5000);
    expect(estimatePack({ bounds: b, zMin: 8, zMax: z, layers: ['satellite'], terrain: true }).tiles).toBeLessThanOrEqual(5000);
  });
  it('estimates time left', () => {
    expect(etaText({ done: 10, total: 100, failed: 0, bytes: 0, skipped: 0, startedAt: 0 }, 5000)).toBe('about 45 s left');
  });
});
