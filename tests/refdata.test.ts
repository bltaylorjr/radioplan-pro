import { describe, it, expect } from 'vitest';
import { countyAt, refSearch, refCounts } from '../src/engine/refdata';

describe('built-in reference data', () => {
  it('has every county in the four states', () => {
    const c = refCounts(); expect(c.counties).toBe(400); expect(c.zips).toBeGreaterThan(3000);
  });
  it('finds county and state offline', () => {
    expect(countyAt(35.7796, -78.6382)).toMatchObject({ county: 'Wake County', state: 'NC' });
    expect(countyAt(35.2271, -80.8431)).toMatchObject({ county: 'Mecklenburg County', state: 'NC' });
    expect(countyAt(33.749, -84.388)).toMatchObject({ county: 'Fulton County', state: 'GA' });
    expect(countyAt(36.1627, -86.7816)).toMatchObject({ county: 'Davidson County', state: 'TN' });
    expect(countyAt(34.0007, -81.0348)).toMatchObject({ county: 'Richland County', state: 'SC' });
    expect(countyAt(37.54, -77.43)).toBeNull();
  });
  it('searches ZIP codes, towns and counties offline', () => {
    expect(refSearch('28202')[0]).toMatchObject({ city: 'Charlotte', state: 'NC', county: 'Mecklenburg County' });
    expect(refSearch('Wake County')[0]).toMatchObject({ county: 'Wake County', state: 'NC' });
    const boone = refSearch('Boone, NC')[0]; expect(boone).toMatchObject({ city: 'Boone', state: 'NC', county: 'Watauga County' });
    expect(refSearch('Greenville SC').every((g) => g.state === 'SC')).toBe(true);
  });
});
