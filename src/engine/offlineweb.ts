import { platform } from './update';
import { logRepair } from './carelog';

/** Online version: keep a saved copy of the whole app in the browser so it opens and works with no internet.
 *  The Windows app, Android app and flash drive already carry their files, so they skip this. */
export function installOfflineWeb() {
  if (platform() !== 'web' || !('serviceWorker' in navigator) || !import.meta.env.PROD || location.hostname === 'localhost') return;
  const reg = () => navigator.serviceWorker.register('./sw.js').catch((e) => logRepair(`Offline copy could not be set up: ${(e as Error).message}`));
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg, { once: true });
}
