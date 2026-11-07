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
export interface UpdateInfo { version: string; notes: string; url: string | null; page: string }
interface Release { tag_name: string; body?: string; html_url: string; draft?: boolean; prerelease?: boolean; assets: { name: string; browser_download_url: string }[] }
export function pickUpdate(rel: Release, current: string, plat: Platform): UpdateInfo | null {
  if (!rel?.tag_name || rel.draft || rel.prerelease || cmpVersion(rel.tag_name, current) <= 0) return null;
  const want = plat === 'web' ? null : ASSETS[plat];
  const a = want ? rel.assets.find((x) => x.name === want) : null;
  return { version: rel.tag_name.replace(/^v/i, ''), notes: (rel.body ?? '').slice(0, 600), url: a?.browser_download_url ?? null, page: rel.html_url };
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
export const dueForCheck = (now = Date.now()) => { try { return now - Number(localStorage.getItem(LAST) || 0) > 6 * 3600e3; } catch { return true; } };
export const markChecked = (now = Date.now()) => { try { localStorage.setItem(LAST, String(now)); } catch { /* ignore */ } };
export async function desktopInfo(): Promise<{ portable: boolean } | null> { try { return (await tauri()?.invoke('app_info')) as { portable: boolean }; } catch { return null; } }
export async function installWindowsUpdate(url: string) { await tauri()!.invoke('install_update', { url }); }
