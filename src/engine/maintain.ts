// Automatic care for the app and its downloaded content.
//
// Every downloaded or stored dataset (RadioReference counties, offline maps, terrain, FCC/FAA packs, ...)
// registers here once. The app then, by itself and without asking:
//   1. checks each dataset on this device (checksums, structure) and repairs anything damaged or missing,
//   2. when online and due, downloads a fresh copy,
//   3. keeps the old copy until the new one is checked, and goes back to it if the refresh fails.
// Nothing here needs the user. Plain-language notices are only raised when something they would notice changed.
//
// To add a dataset (other features):
//   registerDataset({ id: 'fcc-uls', label: 'FCC licenses', everyHours: 24 * 7, needsOnline: true,
//     async verify(ctx)  { ...return { ok: true } or { ok: false, problem: 'why' } },
//     async repair(ctx)  { ...fix it, return a plain sentence of what was done },
//     async snapshot()   { ...return something restore() can put back },
//     async restore(s)   { ... },
//     async refresh(ctx) { ...download, return { changed: true, detail: '1,234 licenses' } } });
// Use putChecked / getChecked below to store a pack with a checksum and a previous good copy for free.

export interface MaintCtx {
  online: boolean;
  now: number;
  /** Project open in the editor: datasets must not rewrite it behind the editor's back. */
  openProjectId?: string;
  /** Set when the user pressed "Check now": refresh even if not due. */
  force?: boolean;
  log: (what: string) => void;
}
export interface VerifyResult { ok: boolean; problem?: string }
export interface RefreshResult { changed: boolean; detail?: string; skipped?: string }
export interface Dataset {
  id: string;
  /** Plain name shown on the Automatic care card. */
  label: string;
  /** How often to look for a fresh copy (hours). 0 = never refreshed, only checked. */
  everyHours: number;
  /** How often to check it on this device (hours, default 24). */
  verifyEveryHours?: number;
  needsOnline?: boolean;
  /** For datasets that are never downloaded: where new copies come from, in plain words (shown instead of a date). */
  updatedBy?: string;
  /** Can this dataset be refreshed on this device right now (logged in, right platform...)? Return a reason when not. */
  available?: () => Promise<true | string> | true | string;
  verify?: (ctx: MaintCtx) => Promise<VerifyResult>;
  repair?: (ctx: MaintCtx, problem: string) => Promise<string>;
  snapshot?: () => Promise<unknown>;
  restore?: (snap: unknown) => Promise<void>;
  refresh?: (ctx: MaintCtx) => Promise<RefreshResult>;
}
export interface DatasetState {
  lastVerify?: number; lastVerifyOk?: boolean; problem?: string;
  lastRefresh?: number; lastTry?: number; failures?: number; lastError?: string; detail?: string; lastRepair?: string;
}
export type MaintState = Record<string, DatasetState>;

const registry = new Map<string, Dataset>();
export function registerDataset(d: Dataset) { registry.set(d.id, d); }
export const datasets = () => [...registry.values()];
export const unregisterDataset = (id: string) => registry.delete(id);

const H = 3600e3;
/** Wait after a failed refresh: 1 h, 2 h, 4 h ... up to the dataset's normal interval (at least 1 h). */
export function retryAfterMs(failures: number, everyHours: number) {
  return Math.min(Math.max(everyHours, 1) * H, H * 2 ** Math.max(0, failures - 1));
}
export function dueForRefresh(d: Dataset, s: DatasetState | undefined, now: number, force = false) {
  if (!d.refresh || d.everyHours <= 0) return false;
  if (force) return true;
  if (s?.failures && s.lastTry) return now - s.lastTry >= retryAfterMs(s.failures, d.everyHours);
  return !s?.lastRefresh || now - s.lastRefresh >= d.everyHours * H;
}
export function dueForVerify(d: Dataset, s: DatasetState | undefined, now: number, force = false) {
  if (!d.verify) return false;
  return force || !s?.lastVerify || now - s.lastVerify >= (d.verifyEveryHours ?? 24) * H;
}

export interface MaintReport { repaired: string[]; refreshed: string[]; rolledBack: string[]; failed: string[] }

/** Check, repair and refresh one dataset. Never throws. */
export async function careFor(d: Dataset, s0: DatasetState | undefined, ctx: MaintCtx, rep: MaintReport): Promise<DatasetState> {
  const s: DatasetState = { ...s0 };
  const check = async (): Promise<VerifyResult> => { try { return d.verify ? await d.verify(ctx) : { ok: true }; } catch (e) { return { ok: false, problem: (e as Error).message || 'could not be read' }; } };
  // 1. Check what is on this device, and repair it.
  if (dueForVerify(d, s, ctx.now, ctx.force)) {
    let v = await check();
    if (!v.ok && d.repair) {
      try {
        const did = await d.repair(ctx, v.problem ?? 'damaged');
        s.lastRepair = did; rep.repaired.push(`${d.label}: ${did}`); ctx.log(`${d.label}: ${did}`);
      } catch (e) { ctx.log(`${d.label}: repair failed (${(e as Error).message})`); }
      v = await check();
    }
    s.lastVerify = ctx.now; s.lastVerifyOk = v.ok; s.problem = v.ok ? undefined : v.problem;
  }
  // 2. Fresh copy when online and due, keeping the old one until the new one checks out.
  if (!dueForRefresh(d, s, ctx.now, ctx.force)) return s;
  if (d.needsOnline !== false && !ctx.online) return s;
  const avail = await Promise.resolve(d.available ? d.available() : true).catch((e) => String((e as Error).message ?? e));
  if (avail !== true) { s.detail = avail; return s; }
  s.lastTry = ctx.now;
  let snap: unknown, haveSnap = false;
  try { if (d.snapshot) { snap = await d.snapshot(); haveSnap = true; } } catch { /* nothing to keep */ }
  try {
    const r = await d.refresh!(ctx);
    const v = await check();
    if (!v.ok) throw new Error(`new copy failed its check (${v.problem ?? 'damaged'})`);
    s.lastRefresh = ctx.now; s.failures = 0; s.lastError = undefined; s.lastVerify = ctx.now; s.lastVerifyOk = true; s.problem = undefined;
    if (r.skipped) s.detail = r.skipped; else if (r.detail) s.detail = r.detail;
    if (r.changed) { rep.refreshed.push(d.label); ctx.log(`${d.label}: updated${r.detail ? ` (${r.detail})` : ''}`); }
  } catch (e) {
    s.failures = (s.failures ?? 0) + 1; s.lastError = (e as Error).message || String(e);
    rep.failed.push(d.label); ctx.log(`${d.label}: update failed, will try again later (${s.lastError})`);
    if (haveSnap && d.restore) {
      try { await d.restore(snap); rep.rolledBack.push(d.label); ctx.log(`${d.label}: kept the previous copy`); } catch { /* restore is best effort */ }
    }
  }
  return s;
}

let running: Promise<MaintReport> | null = null;
export const maintenanceRunning = () => !!running;
/** Run every registered dataset once (one run at a time). */
export function runMaintenance(ctx: MaintCtx, store: { get: () => Promise<MaintState>; set: (s: MaintState) => Promise<unknown> }): Promise<MaintReport> {
  if (running) return running;
  running = (async () => {
    const rep: MaintReport = { repaired: [], refreshed: [], rolledBack: [], failed: [] };
    const state = { ...(await store.get().catch(() => ({} as MaintState))) };
    for (const d of datasets()) {
      state[d.id] = await careFor(d, state[d.id], ctx, rep);
      await store.set(state).catch(() => undefined);
    }
    return rep;
  })().finally(() => { running = null; });
  return running;
}

/** Plain sentence for the notice bar, or '' when nothing worth interrupting for happened. */
export function noticeFor(rep: MaintReport): string {
  if (rep.repaired.length) return `🔧 LvPlan Pro found and fixed ${rep.repaired.length === 1 ? 'a problem' : `${rep.repaired.length} problems`} with saved data: ${rep.repaired.join('; ')}. Nothing was lost.`;
  return '';
}

// ---------------------------------------------------------------- checksums

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function sha256(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  return hex(await crypto.subtle.digest('SHA-256', buf));
}
export const checksumOf = (v: unknown) => sha256(JSON.stringify(v) ?? 'undefined');

/** A stored value with its checksum, so damage is noticed instead of silently used. */
export interface Checked<T> { v: T; sum: string; at: number }
export async function wrapChecked<T>(v: T, now = Date.now()): Promise<Checked<T>> { return { v, sum: await checksumOf(v), at: now }; }
export async function isIntact(c: unknown): Promise<boolean> {
  const x = c as Checked<unknown> | undefined;
  return !!x && typeof x === 'object' && typeof x.sum === 'string' && (await checksumOf(x.v)) === x.sum;
}
