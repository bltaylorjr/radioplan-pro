import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { runMaintenance, noticeFor } from '../engine/maintain';
import { bootHealthy, HEALTHY_AFTER_MS } from '../engine/update';
import { logRepair, onNotice } from '../engine/carelog';

const PREF = 'radioplan.autoCare';
export const autoCareOn = () => { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } };
export const setAutoCare = (on: boolean) => { try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* ignore */ } };

/** Runs the automatic checks, repairs and downloads quietly in the background, and shows a short notice only when
 *  something the user would notice was fixed. */
export function Maintainer() {
  const { lib } = useStore();
  const [notice, setNotice] = useState('');
  useEffect(() => onNotice(setNotice), []);
  useEffect(() => {
    const ok = setTimeout(() => bootHealthy(), HEALTHY_AFTER_MS);
    let stop = false;
    const go = async () => {
      if (stop || !autoCareOn()) return;
      const { maintStore } = await import('../engine/datasets'); // registers the datasets
      const rep = await runMaintenance({ online: navigator.onLine, now: Date.now(), openProjectId: lib.projectId, log: logRepair }, maintStore).catch(() => null);
      if (rep) { const n = noticeFor(rep); if (n) setNotice(n); if (rep.repaired.length || rep.refreshed.length) lib.bump(); }
    };
    const first = setTimeout(go, 20000); // after the app has settled
    const iv = setInterval(go, 3600e3);
    const on = () => setTimeout(go, 15000);
    window.addEventListener('online', on);
    return () => { stop = true; clearTimeout(ok); clearTimeout(first); clearInterval(iv); window.removeEventListener('online', on); };
  }, [lib.projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!notice) return null;
  return <div className="update-bar" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>OK</button></div>;
}
