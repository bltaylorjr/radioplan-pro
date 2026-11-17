// The app's own datasets, registered with the automatic care engine (maintain.ts).
// Other features add theirs the same way: registerDataset({...}) in their own module, imported once from here.
import { registerDataset, MaintCtx, MaintState } from './maintain';
import { addVersion, demIntact, getRecord, getRecordVerified, kvGet, kvKeys as kvKeysPrefix, kvSet, listProjects, listVersions, loadTerrain, recordIntact, terrainIds } from './projectdb';
import { cacheDelete, scanDamaged } from './tilecache';
import { prefetchTiles } from './offline';
import type { Bounds } from './autoterrain';
import { refCounts } from './refdata';
import { declinationDeg, getMagModel } from './azimuth';
import { canReachApi, checkDownload, countFreqs, downloadCounty, downloadKeys, keepSpare, loadDownloadByKey, loadLogin, restoreSpare, putDownloadRaw } from './radioref';
import { currentJob } from './rrjob';
import './contentupdate'; // codes, contacts, catalog, help and magnetic model from the website
import './recallsData'; // equipment recalls (registers itself)
import './weather'; // NOAA weather for the last place looked at (registers itself)

const H = 3600e3, DAY = 24 * H;
export const STATE_KEY = 'maint.state.v1';
export const loadMaintState = () => kvGet<MaintState>(STATE_KEY).then((s) => s ?? {});
export const saveMaintState = (s: MaintState) => kvSet(STATE_KEY, s);
export const maintStore = { get: loadMaintState, set: saveMaintState };

// ---------------------------------------------------------------- saved projects
registerDataset({
  id: 'projects', label: 'Saved projects', everyHours: 0, updatedBy: 'saved as you work', verifyEveryHours: 12,
  async verify(ctx) {
    const bad: string[] = [];
    for (const s of await listProjects()) { if (s.id === ctx.openProjectId) continue; if (!(await recordIntact(await getRecord(s.id)))) bad.push(s.name); }
    return bad.length ? { ok: false, problem: `${bad.length} saved project${bad.length > 1 ? 's' : ''} damaged (${bad.join(', ')})` } : { ok: true };
  },
  async repair(ctx) {
    const fixed: string[] = [], lost: string[] = [];
    for (const s of await listProjects()) {
      if (s.id === ctx.openProjectId) continue;
      const r = await getRecordVerified(s.id);
      if (r.restored) fixed.push(`${s.name} (from ${new Date(r.restored.at).toLocaleDateString()})`); else if (r.damaged) lost.push(s.name);
    }
    return [fixed.length && `put back the last good version of ${fixed.join(', ')}`, lost.length && `no good copy of ${lost.join(', ')} was found; open it to repair what can be read`].filter(Boolean).join('; ') || 'nothing needed';
  },
});

// ---------------------------------------------------------------- daily backup of every project changed that day
registerDataset({
  id: 'daily-backup', label: 'Daily backup of projects', everyHours: 24, needsOnline: false,
  async refresh(ctx) {
    let n = 0;
    for (const s of await listProjects()) {
      const last = (await listVersions(s.id)).find((v) => v.keep === 'daily');
      if (last && (s.updated <= last.at || ctx.now - last.at < 20 * H)) continue;
      const r = await getRecord(s.id); if (!r || !(await recordIntact(r))) continue; // never back up a damaged copy over good ones
      await addVersion(s.id, r.project, 'Daily automatic backup', ctx.now, 'daily'); n++;
    }
    return { changed: n > 0, detail: n ? `${n} project${n > 1 ? 's' : ''} backed up` : 'every project is backed up' };
  },
});

// ---------------------------------------------------------------- terrain kept with projects
registerDataset({
  id: 'terrain', label: 'Terrain saved with projects', everyHours: 0, updatedBy: 'downloads with each project',
  async verify() {
    // loadTerrain drops a damaged grid, so the app downloads it again by itself when the project is opened.
    let bad = 0;
    for (const id of await terrainIds()) { const g = await loadTerrain(id); if (!g || !demIntact(g)) bad++; }
    return bad ? { ok: false, problem: `${bad} damaged terrain file${bad > 1 ? 's' : ''}` } : { ok: true };
  },
  async repair() { return 'removed damaged terrain; it downloads again automatically when online'; },
});

// ---------------------------------------------------------------- offline maps
export interface TileArea { id: string; templates: string[]; b: Bounds; zMin: number; zMax: number; savedAt: number }
const AREAS = 'maint.tileAreas.v1';
export const loadTileAreas = () => kvGet<TileArea[]>(AREAS).then((a) => a ?? []);
/** Remember an area saved for offline use, so it is kept complete and fresh automatically. */
export async function rememberTileArea(a: Omit<TileArea, 'id' | 'savedAt'>) {
  const id = [a.b.south, a.b.west, a.b.north, a.b.east].map((x) => x.toFixed(3)).join(',') + `|${a.zMax}|${a.templates.length}`;
  const list = (await loadTileAreas()).filter((x) => x.id !== id);
  await kvSet(AREAS, [{ ...a, id, savedAt: Date.now() }, ...list].slice(0, 12));
}
let lastTileFill = 0;
registerDataset({
  id: 'tiles', label: 'Offline maps', everyHours: 24 * 30, verifyEveryHours: 24 * 7,
  async verify() { const bad = await scanDamaged(); return bad.length ? { ok: false, problem: `${bad.length} damaged map tile${bad.length > 1 ? 's' : ''}` } : { ok: true }; },
  async repair() { const bad = await scanDamaged(); await cacheDelete(bad); return `removed ${bad.length} damaged map tile${bad.length > 1 ? 's' : ''}; they download again when needed`; },
  available: async () => (await loadTileAreas()).length ? true : 'No saved offline areas yet',
  async refresh(ctx) {
    // Fill gaps every month; download a fresh copy of every tile twice a year. A tile that fails keeps its old copy.
    let total = 0, failed = 0;
    for (const a of await loadTileAreas()) {
      const force = ctx.now - a.savedAt > 180 * DAY;
      const r = await prefetchTiles(a.templates, a.b, a.zMin, a.zMax, () => undefined, undefined, force);
      total += r.total; failed += r.failed;
      if (force && r.failed < r.total / 2) await rememberTileArea(a);
    }
    lastTileFill = ctx.now;
    if (total && failed > total / 2) throw new Error(`${failed} of ${total} map tiles could not be downloaded`);
    return { changed: total > failed, detail: `${(total - failed).toLocaleString()} map tiles current${failed ? `, ${failed} unavailable` : ''}` };
  },
});
export const tilesLastFilled = () => lastTileFill;

// ---------------------------------------------------------------- RadioReference counties (sealed, this device only)
const RR_REDO = 'maint.rrRedo.v1';
registerDataset({
  id: 'radioref', label: 'RadioReference county lists', everyHours: 24, verifyEveryHours: 24,
  async verify() {
    let bad = 0; for (const k of await downloadKeys()) if ((await checkDownload(k)) === 'damaged') bad++;
    return bad ? { ok: false, problem: `${bad} saved county list${bad > 1 ? 's' : ''} damaged` } : { ok: true };
  },
  async repair() {
    let back = 0, redo = 0; const later = new Set(await kvGet<string[]>(RR_REDO) ?? []);
    for (const k of await downloadKeys()) {
      if ((await checkDownload(k)) !== 'damaged') continue;
      if (await restoreSpare(k)) back++; else { later.add(k); redo++; }
    }
    await kvSet(RR_REDO, [...later]);
    return [back && `put back the previous copy of ${back} county list${back > 1 ? 's' : ''}`, redo && `${redo} will download again next time you are online and logged in`].filter(Boolean).join('; ');
  },
  available: async () => {
    if (!canReachApi()) return 'Updates in the Windows and Android apps';
    const l = await loadLogin(); if (!l?.username || !l.password || !l.appKey) return 'Log in to RadioReference to keep these up to date';
    if (currentJob()?.running) return 'A download is running';
    return true;
  },
  async refresh(ctx) {
    const login = (await loadLogin())!;
    const redo = new Set(await kvGet<string[]>(RR_REDO) ?? []);
    let done = 0; const fails: string[] = [];
    for (const key of [...new Set([...(await downloadKeys()), ...redo])]) {
      const old = await loadDownloadByKey(key);
      if (old && (old.source !== 'api' || ctx.now - Date.parse(old.fetchedAt) < 30 * DAY)) continue;
      const [state, county] = old ? [old.state, old.county] : key.slice(key.indexOf(':') + 1).split('|');
      if (!state || !county) continue;
      if (old) await keepSpare(key);
      try {
        const opts = old?.opts ?? { trunked: (old?.systems.length ?? 1) > 0, statewide: false };
        const got = await downloadCounty(state, county, login, { ...opts });
        // A sudden drop to nothing means the service answered badly: keep what we had.
        if (old && countFreqs(old) > 0 && countFreqs(got) === 0) throw new Error('the new list came back empty');
        redo.delete(key); done++;
      } catch (e) {
        if (old) { if (!(await restoreSpare(key))) await putDownloadRaw(key, old); }
        fails.push(`${county}: ${(e as Error).message}`);
      }
    }
    await kvSet(RR_REDO, [...redo]);
    if (fails.length && !done) throw new Error(fails.join('; '));
    return { changed: done > 0, detail: done ? `${done} county list${done > 1 ? 's' : ''} updated${fails.length ? `, ${fails.length} kept as they were` : ''}` : 'all county lists are current' };
  },
});

// ---------------------------------------------------------------- data built into the app (comes with app updates)
registerDataset({
  id: 'builtin', label: 'Built-in county and ZIP maps', everyHours: 0, updatedBy: 'comes with app updates',
  async verify(ctx: MaintCtx) {
    const c = refCounts();
    if (!c.counties || !c.zips) return { ok: false, problem: 'built-in county / ZIP data did not load; restart the app' };
    const mm = getMagModel(); if (new Date(ctx.now).getUTCFullYear() >= mm.epoch + 5) return { ok: false, problem: `the magnetic model (${mm.name}) has ended; the new one downloads by itself when online` };
    if (!Number.isFinite(declinationDeg({ lat: 35.6, lon: -82.55 }, ctx.now))) return { ok: false, problem: 'the magnetic model could not be read' };
    return { ok: true };
  },
});

// ---------------------------------------------------------------- datasheets saved from a web link
// Saved from a manufacturer link: fetched again twice a year so the newest revision is kept. A download that is
// not a real document (an error page, empty) never replaces the saved one. Attached files (no link) are left alone.
interface Sheet { name: string; type: string; size: number; blob: Blob; savedAt: string; from?: string }
const SHEET = 'datasheet:';
registerDataset({
  id: 'datasheets', label: 'Saved datasheets', everyHours: 24 * 7, verifyEveryHours: 24 * 7,
  async verify() {
    let bad = 0; for (const k of await kvKeysPrefix(SHEET)) { const v = await kvGet<Sheet>(k); if (!v || !(v.blob instanceof Blob) || !v.blob.size) bad++; }
    return bad ? { ok: false, problem: `${bad} saved datasheet${bad > 1 ? 's' : ''} empty or unreadable` } : { ok: true };
  },
  async repair() {
    let fixed = 0, gone = 0;
    for (const k of await kvKeysPrefix(SHEET)) {
      const v = await kvGet<Sheet>(k); if (v && v.blob instanceof Blob && v.blob.size) continue;
      const got = v?.from ? await fetchSheet(v.from) : null;
      if (got) { await kvSet(k, got); fixed++; } else gone++;
    }
    return [fixed && `downloaded ${fixed} again`, gone && `${gone} need to be attached again (open it in the Specifications Library)`].filter(Boolean).join('; ');
  },
  async refresh(ctx) {
    let n = 0;
    for (const k of await kvKeysPrefix(SHEET)) {
      const v = await kvGet<Sheet>(k); if (!v?.from || ctx.now - Date.parse(v.savedAt) < 180 * DAY) continue;
      const got = await fetchSheet(v.from);
      if (got) { await kvSet(k, got); n++; } else await kvSet(k, { ...v, savedAt: new Date(ctx.now).toISOString() }); // try again in six months
    }
    return { changed: n > 0, detail: n ? `${n} datasheet${n > 1 ? 's' : ''} refreshed` : 'datasheets current' };
  },
});
async function fetchSheet(url: string): Promise<Sheet | null> {
  try {
    const r = await fetch(url, { mode: 'cors', cache: 'no-store' }); if (!r.ok) return null;
    const blob = await r.blob(); if (blob.size < 1024 || /text\/html/.test(blob.type)) return null;
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    if (/pdf/.test(blob.type) || /\.pdf($|\?)/i.test(url)) { if (String.fromCharCode(...head) !== '%PDF-') return null; }
    return { name: decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'datasheet.pdf'), type: blob.type || 'application/pdf', size: blob.size, blob, savedAt: new Date().toISOString(), from: url };
  } catch { return null; }
}
