// Downloads and uses the online content packs (see contentpacks.ts).
import { PACKS, PackDef, Manifest, StoredPack, CONTENT_FORMAT, packShape, packUsable, jsonSafe } from './contentpacks';
import { APP_VERSION, cmpVersion, platform } from './update';
import { getChecked, putChecked, kvKeys, kvSet } from './projectdb';
import { registerDataset, sha256 } from './maintain';
import { notify, logRepair } from './carelog';

/** Where the website keeps the packs (published with every update of main). */
export const CONTENT_URL = 'https://bltaylorjr.github.io/radioplan-pro/content/';
const KEY = 'content.pack.v1:';
const keyOf = (name: string) => KEY + name;

/** Packs a pack-less app would use (built-in), by name: SHA-256 and shape, worked out once at start. */
const builtin = new Map<string, { sum: string; shape: string; snap: unknown }>();
const inUse = new Map<string, string>();
/** Packs in use now: name → version of the app they came from. */
export const packsInUse = () => new Map(inUse);

async function builtinOf(p: PackDef) {
  let b = builtin.get(p.name);
  if (!b) { const snap = JSON.parse(JSON.stringify(p.get())); b = { sum: await sha256(JSON.stringify(p.get())), shape: packShape(snap), snap }; builtin.set(p.name, b); }
  return b;
}
function useNow(p: PackDef, s: StoredPack, b: { snap: unknown }) {
  try { p.apply(structuredClone(s.data)); inUse.set(p.name, s.builtFrom); return true; }
  catch (e) { try { p.apply(structuredClone(b.snap)); } catch { /* built-in stays as it was */ } inUse.delete(p.name); logRepair(`${p.label}: downloaded update could not be used (${(e as Error).message}); kept the built-in copy`); return false; }
}

/** At start, before any page opens: put newer downloaded packs in place; drop packs the app has caught up with. */
export async function applyStoredPacks(): Promise<string[]> {
  const used: string[] = [];
  for (const k of await kvKeys(KEY)) {
    if (k.endsWith('#prev')) continue;
    const p = PACKS.find((x) => keyOf(x.name) === k);
    const { v } = await getChecked<StoredPack>(k).catch(() => ({ v: undefined }));
    if (!p || !v) continue;
    const b = await builtinOf(p);
    if (!packUsable(v, APP_VERSION, b.shape, cmpVersion)) {
      if (cmpVersion(v.builtFrom, APP_VERSION) <= 0) { await kvSet(k, undefined); await kvSet(k + '#prev', undefined); } // the app is as new: built-in copy wins
      continue;
    }
    if (useNow(p, v, b)) used.push(p.label);
  }
  return used;
}

async function fetchText(url: string) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`website answered ${r.status}`);
  return r.text();
}

/** Look for newer packs on the website and keep any that pass their checks. */
export async function refreshPacks(): Promise<{ updated: string[]; needApp: string[] }> {
  const m = JSON.parse(await fetchText(CONTENT_URL + 'manifest.json')) as Manifest;
  if (m?.format !== CONTENT_FORMAT || !Array.isArray(m.packs)) throw new Error('the website sent an unknown content list');
  const updated: string[] = [], needApp: string[] = [], notices: string[] = [];
  for (const e of m.packs) {
    const p = PACKS.find((x) => x.name === e.name); if (!p || !/^[a-z]+\.json$/.test(e.file)) continue;
    if (cmpVersion(e.builtFrom, APP_VERSION) <= 0) continue; // nothing newer than what is built in
    const b = await builtinOf(p);
    if (e.shape !== b.shape) { needApp.push(p.label); continue; } // laid out differently: comes with the app update
    if (e.sum === b.sum) continue; // same data as built in
    const have = (await getChecked<StoredPack>(keyOf(p.name)).catch(() => ({ v: undefined }))).v;
    if (have?.sum === e.sum) continue;
    const text = await fetchText(CONTENT_URL + e.file);
    if ((await sha256(text)) !== e.sum) throw new Error(`${p.label}: download did not match its checksum`);
    const data = JSON.parse(text);
    if (!jsonSafe(data) || packShape(data) !== b.shape) throw new Error(`${p.label}: download is not laid out as expected`);
    const s: StoredPack = { name: p.name, builtFrom: e.builtFrom, sum: e.sum, shape: e.shape, data };
    await putChecked(keyOf(p.name), s);
    if (!p.restartOnly) useNow(p, s, b);
    updated.push(p.label); if (p.notice) notices.push(p.label);
  }
  if (notices.length) notify(`📚 Updated from the LvPlan Pro website: ${notices.join(', ')}. These are in use now.`);
  return { updated, needApp };
}

registerDataset({
  id: 'content', label: 'Codes, contacts, catalog, help and magnetic model', everyHours: 24, needsOnline: true,
  available: () => platform() === 'web' ? 'The online version is always current' : true,
  async verify() {
    let bad = 0;
    for (const k of await kvKeys(KEY)) { if (k.endsWith('#prev')) continue; const r = await getChecked<StoredPack>(k).catch(() => ({ v: undefined, repaired: true })); if (r.repaired && !r.v) { await kvSet(k, undefined); bad++; } }
    return bad ? { ok: false, problem: `${bad} downloaded update${bad > 1 ? 's' : ''} damaged and removed (the built-in copy is used)` } : { ok: true };
  },
  async repair() { return 'removed damaged downloaded updates; they download again'; },
  async refresh() {
    const r = await refreshPacks();
    const using = [...inUse.keys()].length;
    return { changed: r.updated.length > 0, detail: r.updated.length ? `updated: ${r.updated.join(', ')}` : r.needApp.length ? `newer ${r.needApp.join(', ')} come with the next app update` : using ? `${using} online update${using > 1 ? 's' : ''} in use` : 'built-in copy is current' };
  },
});
