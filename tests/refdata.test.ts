import { describe, it, expect } from 'vitest';
import { countyAt, refSearch, refCounts } from '../src/engine/refdata';

describe('built-in reference data', () => {
  it('has every county in the five states (Virginia: 95 counties and 38 independent cities)', () => {
    const c = refCounts(); expect(c.counties).toBe(533); expect(c.zips).toBeGreaterThan(3000);
  });
  it('finds county and state offline', () => {
    expect(countyAt(35.7796, -78.6382)).toMatchObject({ county: 'Wake County', state: 'NC' });
    expect(countyAt(35.2271, -80.8431)).toMatchObject({ county: 'Mecklenburg County', state: 'NC' });
    expect(countyAt(33.749, -84.388)).toMatchObject({ county: 'Fulton County', state: 'GA' });
    expect(countyAt(36.1627, -86.7816)).toMatchObject({ county: 'Davidson County', state: 'TN' });
    expect(countyAt(34.0007, -81.0348)).toMatchObject({ county: 'Richland County', state: 'SC' });
    expect(countyAt(37.54, -77.43)).toMatchObject({ county: 'Richmond city', state: 'VA' });
    expect(countyAt(38.85, -77.35)).toMatchObject({ county: 'Fairfax County', state: 'VA' });
    expect(countyAt(37.27, -79.94)).toMatchObject({ county: 'Roanoke city', state: 'VA' });
    expect(countyAt(40.7, -74.0)).toBeNull();
  });
  it('searches ZIP codes, towns and counties offline', () => {
    expect(refSearch('28202')[0]).toMatchObject({ city: 'Charlotte', state: 'NC', county: 'Mecklenburg County' });
    expect(refSearch('Wake County')[0]).toMatchObject({ county: 'Wake County', state: 'NC' });
    const boone = refSearch('Boone, NC')[0]; expect(boone).toMatchObject({ city: 'Boone', state: 'NC', county: 'Watauga County' });
    expect(refSearch('Greenville SC').every((g) => g.state === 'SC')).toBe(true);
  });
});
