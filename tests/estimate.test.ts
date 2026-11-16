import { describe, it, expect } from 'vitest';
import { defaultProject } from '../src/defaults';
import { buildBom, bomToCsv } from '../src/engine/materials';
import { totals, suggestLabor, costLines, priceKey, defaultEstimate } from '../src/engine/estimate';
import { parseStock, searchWords, fillUrl, healVendor, searchUrlFor, SEARCH_SITES, checkStock, blankVendor } from '../src/engine/vendors';
import { repairProject } from '../src/engine/repair';

const proj = () => { const p = defaultProject(); p.bomExtra = [{ id: 'a', category: 'Added items', item: 'Cat 6 plenum cable', brandModel: 'Belden 10GXS12', qty: 1000, unit: 'ft', notes: '' }, { id: 'b', category: 'Added items', item: 'Keystone jack', brandModel: 'Leviton 61110', qty: 24, unit: 'ea', notes: '' }]; return p; };

describe('materials costing', () => {
  it('prices lines, categories and the materials subtotal', () => {
    const p = proj(); p.bomCost = { 'x-a': { unitCost: 0.45 }, 'x-b': { unitCost: 3.2 } };
    const t = totals(p, buildBom(p));
    const a = t.lines.find((l) => l.key === 'x-a')!;
    expect(a.ext).toBe(450);
    expect(t.byCategory.find((c) => c.category === 'Added items')!.total).toBeCloseTo(450 + 76.8, 2);
    expect(t.materials).toBeGreaterThanOrEqual(526.8);
    expect(t.unpriced).toBe(t.lines.length - 2);
  });
  it('uses the price list when the project has no price, and the project price first', () => {
    const p = proj(); const book = { [priceKey('Keystone jack', 'Leviton 61110')]: { unitCost: 4, at: 0 } };
    expect(costLines(p, buildBom(p), book).find((l) => l.key === 'x-b')).toMatchObject({ unitCost: 4, source: 'pricelist' });
    p.bomCost = { 'x-b': { unitCost: 3 } };
    expect(costLines(p, buildBom(p), book).find((l) => l.key === 'x-b')).toMatchObject({ unitCost: 3, source: 'project' });
  });
  it('adds tax, shipping, labor, contingency and markup, and flags over budget', () => {
    const p = proj(); p.autoDesign = { ...(p.autoDesign ?? {}), applied: false } as never;
    p.bomCost = { 'x-a': { unitCost: 0.5 }, 'x-b': { unitCost: 5 } };
    p.estimate = { ...defaultEstimate(), taxPct: 7, shipping: 30, contingencyPct: 10, markupPct: 20, labor: [{ id: 'l', task: 'Pull', people: 2, hours: 10, rate: 50 }], budgetMaterials: 500, budgetTotal: 5000 };
    const t = totals(p, buildBom(p).filter((l) => l.extraId));
    expect(t.materials).toBe(620);
    expect(t.tax).toBeCloseTo(43.4, 2);
    expect(t.materialsTotal).toBeCloseTo(693.4, 2);
    expect(t.labor).toBe(1000);
    expect(t.laborHours).toBe(20);
    expect(t.contingency).toBeCloseTo(169.34, 2);
    expect(t.total).toBeCloseTo((1693.4 + 169.34) * 1.2, 1);
    expect(t.over.materials).toBeCloseTo(193.4, 2);
    expect(t.over.total).toBe(0);
    expect(t.over.labor).toBe(0);
  });
  it('removes calculated lines reversibly and applies text changes', () => {
    const p = defaultProject();
    const first = buildBom(p)[0];
    p.bomCost = { [first.key]: { removed: true } };
    expect(buildBom(p).some((l) => l.key === first.key)).toBe(false);
    expect(buildBom(p, { withRemoved: true }).find((l) => l.key === first.key)?.removed).toBe(true);
    p.bomCost = { [first.key]: { item: 'My item', unit: 'box' } };
    const l = buildBom(p).find((x) => x.key === first.key)!;
    expect(l).toMatchObject({ item: 'My item', unit: 'box', edited: true });
    expect(l.basis).toMatch(/\(changed\)$/);
  });
  it('suggests labor from the materials', () => {
    const L = suggestLabor(buildBom(proj()), 90);
    expect(L.length).toBeGreaterThanOrEqual(3);
    expect(L.every((l) => l.rate === 90 && l.hours > 0)).toBe(true);
    expect(L.some((l) => /cable/i.test(l.task))).toBe(true);
  });
  it('exports prices and vendors in the CSV once there are prices', () => {
    const csv = bomToCsv([{ key: 'k', category: 'C', item: 'I', brandModel: 'B', qty: 2, unit: 'ea', basis: 'x', unitCost: 1.5, ext: 3, partNo: 'P1', vendor: 'Acme' }]);
    expect(csv.split('\r\n')[0]).toContain('Unit cost');
    expect(csv).toContain('"Acme"');
    expect(csv).toContain('"3.00"');
    expect(bomToCsv([{ key: 'k', category: 'C', item: 'I', brandModel: 'B', qty: 2, unit: 'ea', basis: 'x' }]).split('\r\n')[0]).toBe('Category,Item,Brand/Model,Qty,Unit,Basis');
  });
  it('repairs damaged costing data', () => {
    const p = { ...defaultProject(), bomCost: 'bad', estimate: { labor: 'x', taxPct: 'abc' } } as unknown;
    const r = repairProject(p).project;
    expect(r.bomCost).toBeUndefined();
    expect(Array.isArray(r.estimate!.labor)).toBe(true);
    expect(r.estimate!.taxPct).toBe(0);
  });
});

describe('vendors and online search', () => {
  it('builds search words and addresses', () => {
    expect(searchWords({ item: 'x', brandModel: 'y', partNo: 'ABC-123' })).toBe('ABC-123');
    expect(searchWords({ item: 'Indoor DAS antennas', brandModel: 'CommScope CELLMAX-O or equal' })).toBe('CommScope CELLMAX-O Indoor DAS antennas');
    expect(searchWords({ item: 'Ground rod', brandModel: 'UL 467 listed' })).toBe('Ground rod UL 467 listed');
    expect(fillUrl('https://v.com/s?q={part}&n={qty}', { part: 'a b', qty: 2.2 })).toBe('https://v.com/s?q=a%20b&n=3');
    expect(searchUrlFor(SEARCH_SITES[0], { item: 'Jack', brandModel: '', partNo: 'P 1' })).toBe('https://www.google.com/search?q=P%201');
    expect(searchUrlFor({ ...blankVendor(), searchUrl: 'not a url' }, { item: 'a', brandModel: '' })).toBeNull();
  });
  it('reads stock and price from common vendor answers', () => {
    expect(parseStock('{"Parts":[{"Availability":"1,250 In Stock","PriceBreaks":[{"Quantity":1,"Price":"$3.41"}]}]}')).toEqual({ qty: 1250, price: 3.41 });
    expect(parseStock('{"product":{"quantityAvailable":0,"unitPrice":12.5}}')).toEqual({ qty: 0, price: 12.5 });
    expect(parseStock('<html>42 in stock, now $9.99</html>')).toEqual({ qty: 42, price: 9.99 });
  });
  it('checks stock through the vendor address and reports failures plainly', async () => {
    const v = { ...blankVendor(), name: 'Acme', stockUrl: 'https://api.acme.test/stock?p={part}&k={key}', apiKey: 'K' };
    let got = '';
    const ok = await checkStock(v, 'P1', 5, (async (u: string) => { got = u; return new Response('{"stock":7,"price":2}'); }) as unknown as typeof fetch);
    expect(got).toBe('https://api.acme.test/stock?p=P1&k=K');
    expect(ok).toMatchObject({ ok: true, qty: 7, price: 2 });
    const bad = await checkStock(v, 'P1', 5, (async () => { throw new TypeError('cors'); }) as unknown as typeof fetch);
    expect(bad.ok).toBe(false);
    expect((await checkStock({ ...v, stockUrl: '' }, 'P1', 1)).ok).toBe(false);
  });
  it('heals stored vendors and keeps custom fields', () => {
    const v = healVendor({ id: 'v1', name: 'A', phone: 5, custom: [{ label: 'Branch', value: 'Asheville' }, null] });
    expect(v.name).toBe('A'); expect(v.phone).toBe(''); expect(v.custom).toHaveLength(1); expect(v.custom[0].label).toBe('Branch'); expect(v.autoCheck).toBe(false);
  });
});
