// Built-in project storage: a project library kept inside the app (IndexedDB).
// In the Windows app this lives in the app's own data folder, on Android in the app's private storage,
// and in the USB / browser build in the browser profile. Optionally mirrored to a folder (e.g. on the USB drive).
import type { Project } from '../types';
import type { DemGrid } from './terrain';
import { checksumOf, isIntact, wrapChecked, Checked, sha256 } from './maintain';

export interface ProjectRecord {
  id: string; name: string; number: string; client: string; state: string;
  created: number; updated: number; bytes: number; sites: number; project: Project;
  /** SHA-256 of the project, to notice damaged storage. */
  sum?: string;
}
export type ProjectSummary = Omit<ProjectRecord, 'project'> & { hasTerrain?: boolean };
/** daily = automatic daily backup, safety = taken before an update or repair. These are kept longer than autosaves. */
export type VersionKeep = 'daily' | 'safety';
export interface VersionRecord { vid?: number; pid: string; at: number; reason: string; name: string; bytes: number; project: Project; sum?: string; keep?: VersionKeep }
export const KEEP_DAILY = 7, KEEP_SAFETY = 5;
export interface BackupEntry { record: Omit<ProjectRecord, 'project'>; project: Project; terrain?: SerialDem | null }
export interface SerialDem extends Omit<DemGrid, 'data'> { b64: string }
export const BACKUP_FORMAT = 'radioplan-backup/1';
export const KEEP_VERSIONS = 25;
export const VERSION_EVERY_MS = 10 * 60 * 1000;

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- pure helpers (unit-tested) ----------
export function summarize(id: string, p: Project, created: number, now = Date.now(), json = JSON.stringify(p)): ProjectRecord {
  return {
    id, name: p.meta?.name || 'Untitled project', number: p.meta?.number || '', client: p.meta?.client || '',
    state: p.meta?.state || '', created, updated: now, bytes: json.length, sites: p.sites?.length ?? 0, project: p,
  };
}
/** Version ids to delete so that only the newest `keep` remain. */
export function pruneIds(versions: { vid?: number; at: number; keep?: VersionKeep }[], keep = KEEP_VERSIONS): number[] {
  // Autosaves: the newest `keep`. Daily backups (last week) and safety copies (before updates/repairs) are kept apart,
  // so a long day of autosaves never pushes them out.
  const old = (kind: VersionKeep | undefined, n: number) => [...versions].filter((v) => v.keep === kind).sort((a, b) => b.at - a.at).slice(n);
  return [...old(undefined, keep), ...old('daily', KEEP_DAILY), ...old('safety', KEEP_SAFETY)].map((v) => v.vid!).filter((v) => v != null);
}
/** Is a stored project record readable and unchanged since it was saved? */
export async function recordIntact(r: { project?: unknown; sum?: string } | undefined): Promise<boolean> {
  const p = r?.project as Project | undefined;
  if (!p || typeof p !== 'object' || !p.meta || typeof p.meta !== 'object' || !p.radio || !Array.isArray(p.sites)) return false;
  return !r!.sum || (await checksumOf(p)) === r!.sum;
}
/** Is a terrain grid complete (right number of heights, real numbers)? */
export function demIntact(g: unknown): boolean {
  const d = g as DemGrid | undefined;
  if (!d || !(d.data instanceof Float32Array) || !(d.ncols > 0) || !(d.nrows > 0) || !Number.isFinite(d.west) || !Number.isFinite(d.north) || !(d.cellDeg > 0)) return false;
  if (d.data.length !== d.ncols * d.nrows) return false;
  let good = 0; for (let i = 0; i < d.data.length; i += 97) if (Number.isFinite(d.data[i])) good++;
  return good > 0;
}
export function encodeDem(g: DemGrid): SerialDem {
  const u = new Uint8Array(g.data.buffer, g.data.byteOffset, g.data.byteLength);
  let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  const { data: _d, ...rest } = g; void _d;
  return { ...rest, b64: btoa(s) };
}
export function decodeDem(s: SerialDem): DemGrid {
  const bin = atob(s.b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const { b64: _b, ...rest } = s; void _b;
  return { ...rest, data: new Float32Array(u.buffer) };
}
export function makeBackup(entries: BackupEntry[], now = Date.now()) {
  return { format: BACKUP_FORMAT, exportedAt: now, count: entries.length, projects: entries };
}
/** Read a full backup, a sync file, or a single project file. Returns one entry per project. */
/** JSON from outside the app (project, backup or sync files): keys that could change built-in objects are dropped. */
export function safeJsonParse(text: string): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  return JSON.parse(text, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
}
/** Largest project / backup file the app reads (keeps a damaged or hostile file from freezing the app). */
export const MAX_PROJECT_FILE = 512 * 1024 * 1024;

export function readBackup(text: string): BackupEntry[] {
  if (text.length > MAX_PROJECT_FILE) throw new Error('File is too large to be a LvPlan project, sync or backup file');
  const j = safeJsonParse(text.replace(/^\uFEFF/, ''));
  if (j?.format === BACKUP_FORMAT && Array.isArray(j.projects)) return j.projects as BackupEntry[];
  const p: Project | undefined = j?.format?.startsWith?.('radioplan-sync') ? j.project : j;
  if (!p || typeof p !== 'object' || !p.meta || !p.radio) throw new Error('Not a LvPlan project, sync or backup file');
  const r = summarize('', p, Date.now()); const { project: _p, ...record } = r; void _p;
  return [{ record, project: p }];
}
export const fmtBytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`;

// ---------- IndexedDB ----------
const DB = 'radioplan-data';
let dbp: Promise<IDBDatabase> | null = null;
export const storageAvailable = () => typeof indexedDB !== 'undefined';
function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (!storageAvailable()) { rej(new Error('Built-in storage is not available on this device')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('terrain');
      d.createObjectStore('versions', { keyPath: 'vid', autoIncrement: true }).createIndex('pid', 'pid');
      d.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode); const r = fn(t.objectStore(store));
    t.oncomplete = () => res((r ? r.result : undefined) as T); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
export const getRecord = (id: string) => run<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(id));
/** `json` = JSON.stringify(p) when the caller already has it (autosave), so a big project is turned into text only once. */
export async function putProject(id: string, p: Project, now = Date.now(), json?: string): Promise<ProjectRecord> {
  const old = await getRecord(id);
  const text = json ?? JSON.stringify(p);
  const r = summarize(id, p, old?.created ?? now, now, text);
  r.sum = await sha256(text).catch(() => undefined);
  await run('projects', 'readwrite', (s) => s.put(r)); return r;
}
export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await run<ProjectRecord[]>('projects', 'readonly', (s) => s.getAll());
  const terr = new Set(await run<string[]>('terrain', 'readonly', (s) => s.getAllKeys()));
  return all.map(({ project: _p, ...r }) => ({ ...r, hasTerrain: terr.has(r.id) })).sort((a, b) => b.updated - a.updated);
}
export async function deleteProject(id: string) {
  await run('projects', 'readwrite', (s) => s.delete(id));
  await run('terrain', 'readwrite', (s) => s.delete(id));
  for (const v of await listVersions(id)) await run('versions', 'readwrite', (s) => s.delete(v.vid!));
}
export type StoredDem = DemGrid & { auto?: boolean };
export const saveTerrain = (id: string, g: DemGrid | null, auto?: boolean) => run('terrain', 'readwrite', (s) => g ? s.put(auto === undefined ? g : { ...g, auto }, id) : s.delete(id));
/** A damaged terrain grid is dropped, so the app downloads it again by itself. */
export const loadTerrain = (id: string) => run<StoredDem | undefined>('terrain', 'readonly', (s) => s.get(id)).then(async (g) => {
  if (g && !demIntact(g)) { await run('terrain', 'readwrite', (s) => s.delete(id)).catch(() => undefined); return null; }
  return g ?? null;
}).catch(() => null);
export const terrainIds = () => run<IDBValidKey[]>('terrain', 'readonly', (s) => s.getAllKeys()).then((k) => k.map(String)).catch(() => [] as string[]);
export async function addVersion(pid: string, p: Project, reason: string, now = Date.now(), keep?: VersionKeep) {
  const sum = await checksumOf(p).catch(() => undefined);
  await run('versions', 'readwrite', (s) => s.add({ pid, at: now, reason, name: p.meta?.name ?? '', bytes: JSON.stringify(p).length, project: p, sum, ...(keep ? { keep } : {}) } as VersionRecord));
  const del = pruneIds(await listVersions(pid));
  for (const vid of del) await run('versions', 'readwrite', (s) => s.delete(vid));
}
export async function listVersions(pid: string): Promise<VersionRecord[]> {
  const v = await run<VersionRecord[]>('versions', 'readonly', (s) => s.index('pid').getAll(pid));
  return v.sort((a, b) => b.at - a.at);
}
export const getVersion = (vid: number) => run<VersionRecord | undefined>('versions', 'readonly', (s) => s.get(vid));
export const kvGet = <T,>(k: string) => run<T | undefined>('kv', 'readonly', (s) => s.get(k)).catch(() => undefined);
export const kvSet = (k: string, v: unknown) => run('kv', 'readwrite', (s) => v === undefined ? s.delete(k) : s.put(v, k));
/** The project as saved, checked. If the saved copy is damaged, the newest good version from history is put back.
 *  `restored` says when that happened (for a plain notice). */
export async function getRecordVerified(id: string): Promise<{ record: ProjectRecord | undefined; restored?: VersionRecord; damaged?: boolean }> {
  const r = await getRecord(id).catch(() => undefined);
  if (!r || (await recordIntact(r))) return { record: r };
  for (const v of await listVersions(id).catch(() => [] as VersionRecord[])) {
    if (!(await recordIntact(v))) continue;
    return { record: await putProject(id, v.project), restored: v };
  }
  return { record: r, damaged: true };
}
/** Store a value with a checksum and keep the previous good copy (key + '#prev'). */
export async function putChecked(k: string, v: unknown) {
  const cur = await kvGet<Checked<unknown>>(k);
  if (cur && (await isIntact(cur))) await kvSet(k + '#prev', cur);
  await kvSet(k, await wrapChecked(v));
}
/** Read a checked value; a damaged one is replaced by the previous good copy. */
export async function getChecked<T>(k: string): Promise<{ v: T | undefined; repaired?: boolean }> {
  const cur = await kvGet<Checked<T>>(k);
  if (cur && (await isIntact(cur))) return { v: cur.v };
  const prev = await kvGet<Checked<T>>(k + '#prev');
  if (prev && (await isIntact(prev))) { await kvSet(k, prev); return { v: prev.v, repaired: true }; }
  return { v: undefined, repaired: cur !== undefined };
}
/** Keys in the app database that start with a prefix. */
export const kvKeys = async (prefix: string) => ((await run<IDBValidKey[]>('kv', 'readonly', (s) => s.getAllKeys()).catch(() => [] as IDBValidKey[])).map(String).filter((k) => k.startsWith(prefix)));

/** Full backup of every project (with terrain) as one JSON text. */
export async function backupAll(): Promise<string> {
  const entries: BackupEntry[] = [];
  for (const s of await listProjects()) {
    const r = await getRecord(s.id); if (!r) continue;
    const { project, ...record } = r; const t = await loadTerrain(s.id);
    entries.push({ record, project, terrain: t ? encodeDem(t) : null });
  }
  return JSON.stringify({ ...makeBackup(entries), kv: await kvDump() });
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** Everything in the app's own database besides projects: your library, contacts, web links and saved datasheets. */
/** Keys that are protected information: kept on this device only (not in backups, sync or exports). */
export const isPrivateKey = (k: string) => k.startsWith('radioref.');
/** Keys that only describe this device (automatic care state, spare copies): not carried in backups or sync. */
export const isDeviceKey = (k: string) => k.startsWith('maint.') || k.endsWith('#prev');
export async function kvDump(): Promise<Record<string, unknown>> {
  const keys = await run<IDBValidKey[]>('kv', 'readonly', (s) => s.getAllKeys()).catch(() => [] as IDBValidKey[]);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (isPrivateKey(String(k))) continue; // RadioReference data and sign-in never leave the device
    if (isDeviceKey(String(k))) continue; // this device's own upkeep records and spare copies
    const v = await kvGet<unknown>(String(k)); if (v === undefined) continue;
    const enc1 = async (x: unknown) => { const blob = (x as { blob?: Blob })?.blob; return blob instanceof Blob ? { ...(x as object), blob: { __b64: b64(new Uint8Array(await blob.arrayBuffer())), type: blob.type } } : x; };
    out[String(k)] = Array.isArray(v) ? await Promise.all(v.map(enc1)) : await enc1(v);
  }
  return out;
}
/** Put library, contacts and datasheets from a backup back, adding to what is on this device. */
export async function kvRestore(kv: Record<string, unknown> | undefined): Promise<number> {
  let n = 0;
  for (const [k, raw] of Object.entries(kv ?? {})) {
    if (isPrivateKey(k) || isDeviceKey(k)) continue;
    const dec1 = (x: unknown) => { const enc = (x as { blob?: { __b64?: string; type?: string } })?.blob; return enc?.__b64 ? { ...(x as object), blob: new Blob([unb64(enc.__b64)], { type: enc.type }) } : x; };
    let v = (Array.isArray(raw) ? raw.map(dec1) : dec1(raw)) as Record<string, unknown> | unknown[];
    const cur = await kvGet<unknown>(k);
    const ids = (a: unknown[]) => new Set(a.map((x) => (x as { id?: string })?.id));
    if (Array.isArray(v) && Array.isArray(cur)) { const have = ids(cur); v = [...cur, ...v.filter((x) => !have.has((x as { id?: string })?.id))]; }
    else if (v && !Array.isArray(v) && Array.isArray((v as { mine?: unknown[] }).mine) && cur && Array.isArray((cur as { mine?: unknown[] }).mine)) {
      const c = cur as { mine: unknown[]; hidden?: string[] }, have = ids(c.mine), nv = v as { mine: unknown[]; hidden?: string[] };
      v = { mine: [...c.mine, ...nv.mine.filter((x) => !have.has((x as { id?: string })?.id))], hidden: [...new Set([...(c.hidden ?? []), ...(nv.hidden ?? [])])] };
    } else if (cur !== undefined) continue;
    await kvSet(k, v); n++;
  }
  return n;
}
/** Import entries; existing ids are kept as separate copies unless `overwrite`. Returns the new ids. */
export async function importEntries(entries: BackupEntry[], overwrite = false): Promise<string[]> {
  const ids: string[] = [];
  for (const e of entries) {
    let id = e.record.id || newId();
    if (!overwrite && (await getRecord(id))) id = newId();
    const r = summarize(id, e.project, e.record.created || Date.now(), e.record.updated || Date.now());
    await run('projects', 'readwrite', (s) => s.put(r));
    if (e.terrain) await saveTerrain(id, decodeDem(e.terrain));
    ids.push(id);
  }
  return ids;
}

export interface StorageInfo { usage: number; quota: number; persisted: boolean | null }
export async function storageInfo(): Promise<StorageInfo> {
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  const est = await sm?.estimate?.().catch(() => undefined);
  const persisted = sm?.persisted ? await sm.persisted().catch(() => null) : null;
  return { usage: est?.usage ?? 0, quota: est?.quota ?? 0, persisted };
}
/** Ask the browser / webview to never evict the app's storage. */
export async function requestPersist(): Promise<boolean | null> {
  try { return (await navigator.storage?.persist?.()) ?? null; } catch { return null; }
}

// ---------- optional folder copy (Chrome / Edge desktop, e.g. a folder on the USB drive) ----------
type Dir = FileSystemDirectoryHandle & { requestPermission?: (o: { mode: string }) => Promise<string>; queryPermission?: (o: { mode: string }) => Promise<string>; values?: () => AsyncIterable<FileSystemHandle & { getFile?: () => Promise<File> }> };
export const folderCopySupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;
export async function pickDataFolder(): Promise<Dir> {
  const h = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<Dir> }).showDirectoryPicker({ id: 'radioplan-data', mode: 'readwrite' });
  await kvSet('dataFolder', h); return h;
}
export const savedDataFolder = () => kvGet<Dir>('dataFolder').then((h) => h ?? null);
export const forgetDataFolder = () => kvSet('dataFolder', undefined);
export async function folderAllowed(h: Dir, ask: boolean) {
  if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
  return ask ? (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted' : false;
}
export const folderFileName = (id: string, p: Project) => `${(p.meta?.name || 'project').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 50)}.${id}.radioplan.json`;
export async function writeToFolder(h: Dir, id: string, p: Project) {
  const fh = await h.getFileHandle(folderFileName(id, p), { create: true });
  const w = await fh.createWritable(); await w.write(JSON.stringify(p, null, 1)); await w.close();
  // Remove an older file of the same project saved under a previous name.
  if (h.values) for await (const e of h.values()) if (e.kind === 'file' && e.name.endsWith(`.${id}.radioplan.json`) && e.name !== folderFileName(id, p)) await h.removeEntry(e.name).catch(() => undefined);
}
/** Delete this project's file(s) from the data folder. */
export async function removeFromFolder(h: Dir, id: string) {
  if (!h.values) return;
  const names: string[] = [];
  for await (const e of h.values()) if (e.kind === 'file' && e.name.endsWith(`.${id}.radioplan.json`)) names.push(e.name);
  for (const n of names) await h.removeEntry(n).catch(() => undefined);
}
/** Projects deleted on this device: a folder sync must not bring them back. */
const DELETED = 'deletedProjects';
export const deletedProjectIds = async () => new Set((await kvGet<string[]>(DELETED)) ?? []);
export async function markProjectDeleted(id: string, deleted = true) {
  const ids = await deletedProjectIds(); if (deleted) ids.add(id); else ids.delete(id);
  await kvSet(DELETED, [...ids].slice(-500));
}
export async function readFolder(h: Dir): Promise<BackupEntry[]> {
  const out: BackupEntry[] = [];
  if (!h.values) return out;
  for await (const e of h.values()) {
    if (e.kind !== 'file' || !e.name.endsWith('.radioplan.json') || !e.getFile) continue;
    try {
      const f = await e.getFile(); const [entry] = readBackup(await f.text());
      const m = e.name.match(/\.([a-z0-9]+)\.radioplan\.json$/i);
      out.push({ ...entry, record: { ...entry.record, id: m?.[1] ?? '', updated: f.lastModified } });
    } catch { /* skip unreadable files */ }
  }
  return out;
}
