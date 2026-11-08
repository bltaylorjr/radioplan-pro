import { describe, it, expect } from 'vitest';
import { parseOverpass, cellsFor, overpassQuery, siteLabel } from '../src/engine/towers';

describe('existing towers layer', () => {
  it('parses Overpass nodes and ways with labels', () => {
    const s = parseOverpass({ elements: [
      { type: 'node', id: 1, lat: 35.6, lon: -82.5, tags: { man_made: 'mast', 'tower:type': 'communication', name: 'WLOS Tower', operator: 'Sinclair', height: '300', 'communication:television': 'yes', 'ref:fcc:asr': '1012345' } },
      { type: 'way', id: 2, center: { lat: 35.61, lon: -82.51 }, tags: { man_made: 'tower', 'tower:type': 'communication', 'communication:mobile_phone': 'yes' } },
      { type: 'node', id: 3, tags: { man_made: 'mast' } },
    ] });
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ kind: 'Mast', name: 'WLOS Tower', operator: 'Sinclair', heightFt: 984, asr: '1012345', services: ['TV'] });
    expect(siteLabel(s[0])).toBe('WLOS Tower · 984 ft');
    expect(s[1]).toMatchObject({ kind: 'Communications tower', services: ['Cellular'] });
    expect(siteLabel(s[1])).toBe('Communications tower');
  });
  it('splits an area into cached cells', () => {
    expect(cellsFor(35.55, -82.6, 35.65, -82.45)).toEqual([[35.5, -82.75], [35.5, -82.5]]);
    expect(overpassQuery(35.5, -82.75, 35.75, -82.5)).toContain('(35.5,-82.75,35.75,-82.5)');
  });
});
