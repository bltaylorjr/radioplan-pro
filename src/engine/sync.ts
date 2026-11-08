// Cross-device sync without a server. Each project carries per-section change times and deletion
// tombstones; two copies are merged section by section (newest wins) and collection by collection
// (sites, scenarios, run log, tests, Wi-Fi readings and survey points are merged item by item).
import type { Project, SyncMeta } from '../types';

export const SYNC_FORMAT = 'radioplan-sync/1';
const SKIP = new Set(['sync', 'version']);
/** Collections merged item-by-item: path → id function. */
const COLLECTIONS: Record<string, (x: any) => string> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  sites: (x) => x.id, scenarios: (x) => x.id, runLog: (x) => x.id, tests: (x) => x.id, fieldNotes: (x) => x.id, serviceLog: (x) => x.id,
  'wifi.readings': (x) => x.id, 'survey.points': (x) => `${x.lat.toFixed(6)},${x.lon.toFixed(6)},${x.rssiDbm},${x.t ?? ''}`,
};
const get = (o: any, path: string) => path.split('.').reduce((a, k) => a?.[k], o); // eslint-disable-line @typescript-eslint/no-explicit-any
const set = (o: any, path: string, v: unknown) => { const ks = path.split('.'); const last = ks.pop()!; ks.reduce((a, k) => a[k], o)[last] = v; }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function fnv(s: string): string { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + s.length.toString(36); }
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function newSyncMeta(deviceId: string, deviceName: string): SyncMeta {
  return { projectId: rid(), deviceId, deviceName, sections: {}, items: {}, tombstones: {}, peers: {} };
}

/** Record which sections changed (and which collection items disappeared) since the last stamp. Returns null when nothing changed. */
export function stampSync(p: Project, device: { id: string; name: string }, now = Date.now()): SyncMeta | null {
  const prev = p.sync ?? newSyncMeta(device.id, device.name);
  const next: SyncMeta = { ...prev, deviceId: device.id, deviceName: device.name, sections: { ...prev.sections }, items: { ...prev.items }, tombstones: { ...prev.tombstones } };
  let changed = !p.sync;
  for (const k of Object.keys(p)) {
    if (SKIP.has(k)) continue;
    const h = fnv(JSON.stringify((p as unknown as Record<string, unknown>)[k]));
    if (next.sections[k]?.hash !== h) { next.sections[k] = { hash: h, at: now }; changed = true; }
  }
  for (const [path, idOf] of Object.entries(COLLECTIONS)) {
    const ids = ((get(p, path) as unknown[]) ?? []).map(idOf);
    const before = prev.items[path];
    if (before) for (const id of before) if (!ids.includes(id)) { next.tombstones[`${path}:${id}`] = now; changed = true; }
    if (!before || before.length !== ids.length || before.some((x, i) => x !== ids[i])) { next.items[path] = ids; changed = true; }
  }
  return changed ? next : null;
}

export interface MergeReport { fromRemote: string[]; kept: string[]; added: number; updated: number; removed: number; remoteDevice: string; sameProject: boolean }

/** Merge a remote copy into the local copy. Both should have been stamped. */
export function mergeProjects(local: Project, remote: Project, now = Date.now()): { project: Project; report: MergeReport } {
  const L = local.sync!, R = remote.sync ?? newSyncMeta('unknown', 'Unknown device');
  const out = structuredClone(local) as Project;
  const rep: MergeReport = { fromRemote: [], kept: [], added: 0, updated: 0, removed: 0, remoteDevice: R.deviceName, sameProject: L.projectId === R.projectId };
  const tomb = { ...L.tombstones }; for (const [k, t] of Object.entries(R.tombstones)) tomb[k] = Math.max(tomb[k] ?? 0, t);
  const sec = { ...L.sections };
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)].filter((k) => !SKIP.has(k)));
  for (const k of keys) {
    const lt = L.sections[k]?.at ?? 0, rt = R.sections[k]?.at ?? 0;
    const remoteNewer = rt > lt && (remote as unknown as Record<string, unknown>)[k] !== undefined;
    const collPaths = Object.keys(COLLECTIONS).filter((p) => p === k || p.startsWith(k + '.'));
    if (remoteNewer && JSON.stringify((local as unknown as Record<string, unknown>)[k]) !== JSON.stringify((remote as unknown as Record<string, unknown>)[k])) {
      // take the whole remote section, then re-merge any collections inside it
      (out as unknown as Record<string, unknown>)[k] = structuredClone((remote as unknown as Record<string, unknown>)[k]);
      rep.fromRemote.push(k); sec[k] = { hash: R.sections[k].hash, at: rt };
    } else if (rt > 0 || lt > 0) rep.kept.push(k);
    for (const path of collPaths) {
      const idOf = COLLECTIONS[path];
      const winner = (get(out, path) as unknown[]) ?? [];
      const loser = ((remoteNewer ? get(local, path) : get(remote, path)) as unknown[]) ?? [];
      const byId = new Map(winner.map((x) => [idOf(x), x]));
      for (const x of loser) { const id = idOf(x); if (!byId.has(id) && !tomb[`${path}:${id}`]) { byId.set(id, x); rep.added++; } }
      const merged = [...byId.values()].filter((x) => { const dead = !!tomb[`${path}:${idOf(x)}`]; if (dead) rep.removed++; return !dead; });
      if (path === 'runLog') merged.sort((a: any, b: any) => (b.at as string).localeCompare(a.at)); // eslint-disable-line @typescript-eslint/no-explicit-any
      set(out, path, path === 'runLog' ? merged.slice(0, 50) : merged);
    }
  }
  // keep cross-references valid
  if (!out.sites.some((s) => s.id === out.radio.txSiteId)) out.radio.txSiteId = out.sites[0]?.id ?? '';
  if (!out.sites.some((s) => s.id === out.radio.rxSiteId)) out.radio.rxSiteId = (out.sites[1] ?? out.sites[0])?.id ?? '';
  out.sync = { ...L, sections: sec, tombstones: tomb, peers: { ...L.peers, ...R.peers, [R.deviceId]: { name: R.deviceName, at: now } } };
  // sections whose content changed by item merge get a fresh stamp so the next sync propagates them
  const st = stampSync(out, { id: L.deviceId, name: L.deviceName }, now); if (st) out.sync = st;
  return { project: out, report: rep };
}

export interface SyncPackage { format: typeof SYNC_FORMAT; exportedAt: number; device: string; project: Project }
export const toPackage = (p: Project): SyncPackage => ({ format: SYNC_FORMAT, exportedAt: Date.now(), device: p.sync?.deviceName ?? '', project: p });
export function fromPackage(text: string): Project {
  const j = JSON.parse(text);
  if (j?.format === SYNC_FORMAT && j.project) return j.project as Project;
  if (j?.meta && j?.radio) return j as Project; // plain .radioplan.json project file
  throw new Error('Not a RadioPlan project or sync file.');
}

// ---- compact text codes for the Wi-Fi direct handshake (QR / copy-paste) ----
export async function packCode(obj: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const cs = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  let data = bytes, tag = 'R';
  if (cs) { data = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new cs('deflate-raw'))).arrayBuffer()); tag = 'D'; }
  let s = ''; for (const b of data) s += String.fromCharCode(b);
  return tag + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function unpackCode<T>(code: string): Promise<T> {
  const c = code.trim(); const tag = c[0];
  const b64 = c.slice(1).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  let data = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  if (tag === 'D') { const ds = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream!; data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new ds('deflate-raw'))).arrayBuffer()); }
  return JSON.parse(new TextDecoder().decode(data)) as T;
}
