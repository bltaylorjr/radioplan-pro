import { describe, it, expect } from 'vitest';
import { builtInSpecs, CATEGORIES } from '../src/data/speclib';
import { specsToCsv, specsFromCsv, toEquipment } from '../src/pages/SpecLibrary';
import { notesCsv } from '../src/pages/FieldNotes';

describe('specifications library', () => {
  it('has built-in entries in valid categories with unique ids', () => {
    const b = builtInSpecs(); const ids = new Set(b.map((x) => x.id));
    expect(ids.size).toBe(b.length);
    expect(b.every((x) => (CATEGORIES as readonly string[]).includes(x.category))).toBe(true);
    expect(b.find((x) => x.id === 'std-poe-at')?.specs['Power at PSE (W)']).toBe(30);
    expect(b.find((x) => x.id === 'std-ps-800')?.specs['Base / downlink TX (MHz)']).toBe('851 – 869');
  });
  it('round-trips my items through CSV', () => {
    const items = specsFromCsv('category,brand,model,Gain (dBi),Band low (MHz),Band high (MHz),Connector\nAntennas,Acme,X-100,9.5,450,470,N-female\n');
    expect(items).toHaveLength(1); expect(items[0].specs['Gain (dBi)']).toBe(9.5);
    const back = specsFromCsv(specsToCsv(items)); expect(back[0].model).toBe('X-100'); expect(back[0].specs['Connector']).toBe('N-female');
  });
  it('turns library items into equipment the calculations use', () => {
    const [a] = specsFromCsv('category,brand,model,Gain (dBi),Band low (MHz),Band high (MHz)\nAntennas,Acme,X-100,9.5,450,470\n');
    expect(toEquipment(a)?.antenna).toMatchObject({ gainDbi: 9.5, bandMHz: [450, 470] });
    const [f] = specsFromCsv('category,brand,model,Loss @150 MHz (dB/100 ft),Loss @450 MHz (dB/100 ft)\nCoax & feeders,Acme,C-1,1.2,2.2\n');
    expect(toEquipment(f)?.feeder?.points).toEqual([[150, 1.2], [450, 2.2]]);
    const [x] = specsFromCsv('category,brand,model\nAntennas,Acme,NoData\n'); expect(toEquipment(x)).toBeNull();
  });
  it('exports field notes', () => {
    const csv = notesCsv([{ id: '1', at: '2026-11-07T12:00:00Z', title: 'Roof', text: 'Mast, north side', category: 'Site visit', photos: [], tags: [], author: 'PC', followUp: true, done: false, siteId: 'A', lat: 35.1, lon: -80.2 }], (id) => `${id} Main`);
    expect(csv.split('\r\n')[1]).toContain('"Mast, north side"'); expect(csv).toContain('A Main');
  });
});
