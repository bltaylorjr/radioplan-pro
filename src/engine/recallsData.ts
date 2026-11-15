// Recalls for low-voltage equipment, kept fresh by the automatic care engine: when online (about weekly) the app
// asks the official CPSC recalls API (saferproducts.gov) for recalls of fire alarm, security, access control,
// CCTV, intercom, paging, emergency lighting and radio equipment, and keeps them on this device so project alerts
// also work offline. A failed or odd answer never replaces the list the device already has.
import { registerDataset } from './maintain';
import { appGet, CPSC_API } from './radioref';
import { fromCpsc, loadFetched, saveFetched, LV_WORDS, Notice, CpscRecall } from '../data/recalls';

const QUERIES = ['fire alarm', 'smoke detector', 'smoke sensor', 'strobe', 'sounder', 'control panel', 'intercom', 'nurse call', 'access control',
  'card reader', 'electric strike', 'security camera', 'video recorder', 'emergency light', 'exit sign', 'signal booster', 'two-way radio', 'power supply', 'surge protector', 'amplifier'];
export const cpscUrl = (q: string, since?: string) => `${CPSC_API}format=json&ProductName=${encodeURIComponent(q)}${since ? `&RecallDateStart=${since}` : ''}`;

/** Keep only low-voltage recalls; newest first; never more than 400. */
export function mergeRecalls(old: Notice[], raw: CpscRecall[]): { list: Notice[]; added: number } {
  const byId = new Map(old.map((n) => [n.id, n]));
  let added = 0;
  for (const r of raw) {
    const text = `${r.Title ?? ''} ${(r.Products ?? []).map((p) => `${p.Name ?? ''} ${p.Description ?? ''}`).join(' ')}`;
    if (!LV_WORDS.test(text)) continue;
    const n = fromCpsc(r); if (!n) continue;
    if (!byId.has(n.id)) added++;
    byId.set(n.id, n);
  }
  const list = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 400);
  return { list, added };
}

registerDataset({
  id: 'recalls', label: 'Equipment recalls (CPSC)', everyHours: 24 * 7, verifyEveryHours: 24, needsOnline: true,
  async verify() { const v = await loadFetched().catch(() => null); return Array.isArray(v) ? { ok: true } : { ok: false, problem: 'the saved recall list is damaged' }; },
  async repair() { await saveFetched([]); return 'cleared the damaged recall list; the built-in recalls still work and new ones download when online'; },
  snapshot: () => loadFetched(),
  restore: async (s) => { await saveFetched((s as Notice[]) ?? []); },
  async refresh(ctx) {
    const old = await loadFetched();
    const since = old.length ? new Date(ctx.now - 400 * 864e5).toISOString().slice(0, 10) : '2000-01-01';
    const raw: CpscRecall[] = []; let ok = 0; let lastErr = '';
    for (const q of QUERIES) {
      try { const t = await appGet(cpscUrl(q, since)); const j = JSON.parse(t); if (Array.isArray(j)) { raw.push(...j); ok++; } }
      catch (e) { lastErr = (e as Error).message; }
    }
    if (!ok) throw new Error(lastErr || 'the CPSC recalls service did not answer');
    const { list, added } = mergeRecalls(old, raw);
    if (added) await saveFetched(list);
    return { changed: added > 0, detail: `${list.length} recall${list.length === 1 ? '' : 's'} on this device${added ? `, ${added} new` : ''}` };
  },
});
