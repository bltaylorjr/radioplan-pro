// The app's own repair / upkeep log (kept on this device), and plain-language notices for the notice bar.
const LOG = 'radioplan.repairLog';
export function logRepair(what: string) {
  try { const l = JSON.parse(localStorage.getItem(LOG) || '[]') as { at: string; what: string }[]; l.unshift({ at: new Date().toISOString(), what }); localStorage.setItem(LOG, JSON.stringify(l.slice(0, 100))); } catch { /* ignore */ }
}
export function repairLog(): { at: string; what: string }[] { try { return JSON.parse(localStorage.getItem(LOG) || '[]'); } catch { return []; } }

const NOTICE = 'lvplan-notice';
/** Show one plain sentence to the user (only for things they would otherwise wonder about). */
export function notify(text: string) { logRepair(text); try { window.dispatchEvent(new CustomEvent(NOTICE, { detail: text })); } catch { /* not in a page */ } }
export const onNotice = (f: (text: string) => void) => { const h = (e: Event) => f(String((e as CustomEvent).detail)); window.addEventListener(NOTICE, h); return () => window.removeEventListener(NOTICE, h); };
