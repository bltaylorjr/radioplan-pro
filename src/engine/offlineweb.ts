import { platform } from './update';
import { logRepair } from './carelog';

/** Online version: keep a saved copy of the whole app in the browser so it opens and works with no internet.
 *  The Windows app, Android app and flash drive already carry their files, so they skip this. */
export function installOfflineWeb() {
  if (platform() !== 'web' || !('serviceWorker' in navigator) || !import.meta.env.PROD || location.hostname === 'localhost') return;
  const reg = () => navigator.serviceWorker.register('./sw.js').then((r) => {
    warmLater();
    // The app opens from the saved copy, so look for a newer version now and every half hour; it is saved
    // in the background and used from the next time the app is opened.
    const check = () => { if (navigator.onLine) r.update().catch(() => undefined); };
    check(); setInterval(check, 30 * 60000);
  }, (e) => logRepair(`Offline copy could not be set up: ${(e as Error).message}`));
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg, { once: true });
}

/** Ask the offline helper to save the big data files once the app has been quiet for 20 seconds (not when the
 *  phone is set to save data), so it never slows down opening pages or maps. */
function warmLater() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  let timer = 0;
  const kick = () => { clearTimeout(timer); timer = window.setTimeout(send, 20000); };
  const send = () => {
    const go = () => navigator.serviceWorker.ready.then((r) => r.active?.postMessage('save-data-files')).catch(() => undefined);
    if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(go); else go();
    for (const ev of ['pointerdown', 'keydown', 'hashchange']) window.removeEventListener(ev, kick);
  };
  for (const ev of ['pointerdown', 'keydown', 'hashchange']) window.addEventListener(ev, kick, { passive: true });
  kick();
}
