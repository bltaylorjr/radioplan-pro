// Costing and estimating for the Materials list: unit costs, vendors, labor, project budget.
// Everything here works offline. Prices come from what the person types (per project) or from
// their price list (saved on this device and reused on every project).
import type { Project } from '../types';
import type { BomLine } from './materials';
import { kvGet, kvSet } from './projectdb';

/** Per-line changes to a Materials list line (calculated or added). Keyed by the line's key. */
export interface BomCost {
  unitCost?: number;
  vendorId?: string;
  partNo?: string;
  /** Text changes to a calculated line (added lines are edited directly). */
  item?: string;
  brandModel?: string;
  unit?: string;
  /** Taken off the list (can be put back). */
  removed?: boolean;
}
export interface LaborLine { id: string; task: string; people: number; hours: number; rate: number; notes?: string }
export interface Estimate {
  labor: LaborLine[];
  /** Sales tax on materials (%). */
  taxPct: number;
  /** Shipping / freight ($). */
  shipping: number;
  /** Contingency on materials + labor (%). */
  contingencyPct: number;
  /** Overhead and profit on cost (%). */
  markupPct: number;
  /** Budgets ($); 0 means none set. */
  budgetMaterials: number;
  budgetLabor: number;
  budgetTotal: number;
}

export const defaultEstimate = (): Estimate => ({ labor: [], taxPct: 0, shipping: 0, contingencyPct: 0, markupPct: 0, budgetMaterials: 0, budgetLabor: 0, budgetTotal: 0 });
export const estimateOf = (p: Project): Estimate => ({ ...defaultEstimate(), ...(p.estimate ?? {}), labor: p.estimate?.labor ?? [] });

// ------------------------------------------------------------------ price list (this device, every project)
export interface PriceEntry { unitCost: number; vendorId?: string; partNo?: string; at: number }
export type PriceBook = Record<string, PriceEntry>;
export const PRICEBOOK_KEY = 'pricebook';
export const priceKey = (item: string, brandModel: string) => `${item}|${brandModel}`.toLowerCase().replace(/\s+/g, ' ').trim();
export async function loadPriceBook(): Promise<PriceBook> { try { return (await kvGet<PriceBook>(PRICEBOOK_KEY)) ?? {}; } catch { return {}; } }
export async function savePrice(item: string, brandModel: string, e: Omit<PriceEntry, 'at'>): Promise<PriceBook> {
  const book = await loadPriceBook();
  const k = priceKey(item, brandModel);
  if (!(e.unitCost > 0)) delete book[k]; else book[k] = { ...book[k], ...e, at: Date.now() };
  try { await kvSet(PRICEBOOK_KEY, book); } catch { /* storage unavailable */ }
  return book;
}

// ------------------------------------------------------------------ totals
export type CostSource = 'project' | 'pricelist' | 'none';
export interface CostedLine extends BomLine { unitCost: number; ext: number; source: CostSource; vendorId?: string; partNo?: string }
export interface Totals {
  lines: CostedLine[];
  byCategory: { category: string; total: number; priced: number; count: number }[];
  materials: number; tax: number; shipping: number; materialsTotal: number;
  laborHours: number; labor: number;
  cost: number; contingency: number; markup: number; total: number;
  unpriced: number;
  over: { materials: number; labor: number; total: number };
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function costLines(p: Project, lines: BomLine[], book: PriceBook = {}): CostedLine[] {
  return lines.map((l) => {
    const c = p.bomCost?.[l.key] ?? {};
    const pb = book[priceKey(l.item, l.brandModel)];
    const own = c.unitCost != null && Number.isFinite(c.unitCost) && c.unitCost > 0;
    const unitCost = own ? c.unitCost! : pb?.unitCost ?? 0;
    return { ...l, unitCost, ext: r2(unitCost * l.qty), source: own ? 'project' : pb ? 'pricelist' : 'none', vendorId: c.vendorId ?? pb?.vendorId, partNo: c.partNo ?? pb?.partNo };
  });
}

export const laborCost = (l: LaborLine) => r2(Math.max(0, l.people || 0) * Math.max(0, l.hours || 0) * Math.max(0, l.rate || 0));

export function totals(p: Project, lines: BomLine[], book: PriceBook = {}): Totals {
  const e = estimateOf(p);
  const cl = costLines(p, lines, book);
  const cats = [...new Set(cl.map((l) => l.category))];
  const byCategory = cats.map((c) => { const ls = cl.filter((l) => l.category === c); return { category: c, total: r2(ls.reduce((a, l) => a + l.ext, 0)), priced: ls.filter((l) => l.unitCost > 0).length, count: ls.length }; });
  const materials = r2(cl.reduce((a, l) => a + l.ext, 0));
  const tax = r2(materials * Math.max(0, e.taxPct) / 100), shipping = r2(Math.max(0, e.shipping));
  const materialsTotal = r2(materials + tax + shipping);
  const laborHours = r2(e.labor.reduce((a, l) => a + Math.max(0, l.people || 0) * Math.max(0, l.hours || 0), 0));
  const labor = r2(e.labor.reduce((a, l) => a + laborCost(l), 0));
  const cost = r2(materialsTotal + labor);
  const contingency = r2(cost * Math.max(0, e.contingencyPct) / 100);
  const markup = r2((cost + contingency) * Math.max(0, e.markupPct) / 100);
  const total = r2(cost + contingency + markup);
  const overBy = (v: number, b: number) => (b > 0 && v > b ? r2(v - b) : 0);
  return {
    lines: cl, byCategory, materials, tax, shipping, materialsTotal, laborHours, labor, cost, contingency, markup, total,
    unpriced: cl.filter((l) => !(l.unitCost > 0)).length,
    over: { materials: overBy(materialsTotal, e.budgetMaterials), labor: overBy(labor, e.budgetLabor), total: overBy(total, e.budgetTotal) },
  };
}

/** A starting set of labor lines worked out from the materials: about 1 hour per device or piece of
 *  equipment, 1 hour per 100 ft of cable, plus programming and testing for each system. The person adjusts them. */
export function suggestLabor(lines: BomLine[], rate = 85): LaborLine[] {
  const isLen = (u: string) => u === 'ft';
  const devices = lines.filter((l) => !isLen(l.unit) && ['ea', 'set'].includes(l.unit)).reduce((a, l) => a + l.qty, 0);
  const feet = lines.filter((l) => isLen(l.unit)).reduce((a, l) => a + l.qty, 0);
  const systems = new Set(lines.map((l) => l.category.replace(/^Auto-design: /, '').replace(/^Site runs: .*/, 'Site runs'))).size;
  const id = (k: string) => `lab-${k}-${Math.random().toString(36).slice(2, 6)}`;
  const out: LaborLine[] = [];
  if (feet > 0) out.push({ id: id('cable'), task: 'Cable pulling and pathways', people: 2, hours: Math.max(1, Math.ceil(feet / 100 / 2)), rate, notes: `${Math.round(feet).toLocaleString()} ft at about 100 ft per hour` });
  if (devices > 0) out.push({ id: id('dev'), task: 'Mount and terminate devices and equipment', people: 1, hours: Math.max(1, Math.ceil(devices)), rate, notes: `${Math.round(devices).toLocaleString()} pieces at about 1 hour each` });
  out.push({ id: id('prog'), task: 'Programming, testing and commissioning', people: 1, hours: 8 * Math.max(1, systems), rate, notes: `${Math.max(1, systems)} system(s) at about 8 hours each` });
  out.push({ id: id('pm'), task: 'Project management, submittals and closeout', people: 1, hours: Math.max(4, Math.ceil(out.reduce((a, l) => a + l.people * l.hours, 0) * 0.1)), rate, notes: 'About 10% of the field hours' });
  return out;
}

export const money = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
