// Automatic updates from the project's GitHub Releases (free, no account needed by the user).
import pkg from '../../package.json';
export const APP_VERSION: string = (pkg as { version: string }).version;
export const UPDATE_REPO = 'bltaylorjr/radioplan-pro';
export const ASSETS = { windows: 'RadioPlan-Pro-Setup.exe', android: 'RadioPlan-Pro.apk', usb: 'RadioPlan-Pro-FlashDrive.zip' } as const;
export type Platform = 'windows' | 'android' | 'usb' | 'web';

type TauriInternals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
export const tauri = (): TauriInternals | null => (typeof window !== 'undefined' && (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__) || null;
export function platform(): Platform {
  if (tauri()) return 'windows';
  if (typeof window !== 'undefined' && 'RadioPlanAndroid' in window) return 'android';
  if (typeof location !== 'undefined' && location.protocol === 'file:') return 'usb';
  return 'web';
}
/** Compare dotted versions: >0 when a is newer than b. */
export function cmpVersion(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d; }
  return 0;
}
export interface UpdateInfo { version: string; notes: string; url: string | null; page: string; /** SHA-256 GitHub reports for the file; the app checks the download against it. */ sha256?: string }
interface Release { tag_name: string; body?: string; html_url: string; draft?: boolean; prerelease?: boolean; assets: { name: string; browser_download_url: string; digest?: string | null }[] }
export function pickUpdate(rel: Release, current: string, plat: Platform): UpdateInfo | null {
  if (!rel?.tag_name || rel.draft || rel.prerelease || cmpVersion(rel.tag_name, current) <= 0) return null;
  if (skippedVersion() && cmpVersion(rel.tag_name, skippedVersion()!) <= 0) return null; // went back from this one: wait for a newer fix
  const want = plat === 'web' ? null : ASSETS[plat];
  const a = want ? rel.assets.find((x) => x.name === want) : null;
  const sha = /^sha256:([0-9a-f]{64})$/i.exec(a?.digest ?? '')?.[1]?.toLowerCase();
  return { version: rel.tag_name.replace(/^v/i, ''), notes: (rel.body ?? '').slice(0, 600), url: a?.browser_download_url ?? null, page: rel.html_url, ...(sha ? { sha256: sha } : {}) };
}
export async function checkForUpdate(signal?: AbortSignal): Promise<UpdateInfo | null> {
  const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal });
  if (r.status === 404) return null; // no release published yet
  if (!r.ok) throw new Error(`Update check HTTP ${r.status}`);
  return pickUpdate(await r.json(), APP_VERSION, platform());
}
const PREF = 'radioplan.autoUpdate', LAST = 'radioplan.updateChecked';
export const autoUpdateOn = () => { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } };
export const setAutoUpdate = (on: boolean) => { try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* ignore */ } };
export const dueForCheck = (now = Date.now()) => { try { return now - Number(localStorage.getItem(LAST) || 0) > 3600e3; } catch { return true; } };
export const markChecked = (now = Date.now()) => { try { localStorage.setItem(LAST, String(now)); } catch { /* ignore */ } };
export async function desktopInfo(): Promise<{ portable: boolean } | null> { try { return (await tauri()?.invoke('app_info')) as { portable: boolean }; } catch { return null; } }
/** Download, check (SHA-256) and run the installer. The current version is remembered so a bad update can be undone. */
export async function installWindowsUpdate(url: string, sha256?: string, to?: string) {
  markPending(to ?? (/\/v?(\d+\.\d+\.\d+)\//.exec(url)?.[1] ?? ''));
  await tauri()!.invoke('install_update', { url, sha256: sha256 ?? null });
}

// ---------------------------------------------------------------- update safety: notice a bad update, go back
// Each start counts up; 8 s of the app running normally (its pages open) counts it back to zero and marks this version good.
// If a freshly updated version fails to start 3 times in a row, the Windows app reinstalls the last good one,
// and skips the bad version until a newer one is published.
const BOOTS = 'radioplan.bootFails', GOOD = 'radioplan.lastGoodVersion', PENDING = 'radioplan.pendingUpdate', SKIP = 'radioplan.skipVersion';
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } } };
export const skippedVersion = () => ls.get(SKIP);
export const lastGoodVersion = () => ls.get(GOOD);
export function markPending(to: string, from = APP_VERSION) { ls.set(PENDING, JSON.stringify({ from, to, at: Date.now() })); }
export function pendingUpdate(): { from: string; to: string; at: number } | null { try { return JSON.parse(ls.get(PENDING) || 'null'); } catch { return null; } }
export const BOOT_FAILS_TO_ROLL_BACK = 3, HEALTHY_AFTER_MS = 8000;
/** Called first thing at start. Returns the version to go back to, when this one keeps failing. */
export function bootStart(version = APP_VERSION): { rollbackTo: string | null; justUpdated: { from: string; to: string } | null; fails: number } {
  const fails = (parseInt(ls.get(BOOTS) || '0', 10) || 0) + 1; ls.set(BOOTS, String(fails));
  const good = lastGoodVersion(); const p = pendingUpdate();
  const justUpdated = p && p.to === version && p.from !== version ? { from: p.from, to: p.to } : null;
  const rollbackTo = fails >= BOOT_FAILS_TO_ROLL_BACK && good && cmpVersion(version, good) > 0 ? good : null;
  return { rollbackTo, justUpdated, fails };
}
/** Called once the app has run normally for a while. */
export function bootHealthy(version = APP_VERSION) {
  ls.set(BOOTS, '0'); ls.set(GOOD, version); ls.set(PENDING, null);
  const s = skippedVersion(); if (s && cmpVersion(version, s) > 0) ls.set(SKIP, null);
}
export const windowsInstallerUrl = (version: string) => `https://github.com/${UPDATE_REPO}/releases/download/v${version}/${ASSETS.windows}`;
/** Reinstall an earlier version (Windows). The bad version is skipped by the automatic updater. */
export async function rollBackTo(version: string) {
  ls.set(SKIP, APP_VERSION); ls.set(BOOTS, '0');
  let sha: string | null = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/tags/v${version}`, { headers: { Accept: 'application/vnd.github+json' } });
    const rel = r.ok ? (await r.json()) as Release : null;
    sha = /^sha256:([0-9a-f]{64})$/i.exec(rel?.assets.find((x) => x.name === ASSETS.windows)?.digest ?? '')?.[1]?.toLowerCase() ?? null;
  } catch { /* install unchecked by digest; the address is still limited to this project's releases */ }
  await tauri()!.invoke('install_update', { url: windowsInstallerUrl(version), sha256: sha });
}
