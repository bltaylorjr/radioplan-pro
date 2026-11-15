import React, { useEffect, useState } from 'react';
import { autoUpdateOn, checkForUpdate, desktopInfo, dueForCheck, installWindowsUpdate, markChecked, platform, UpdateInfo } from '../engine/update';
import { useStore } from '../store';
import { logRepair } from '../engine/carelog';

/** Checks for a new version when online and installs it (Windows) or offers it in one tap (Android, flash drive).
 *  Before installing, a safety copy of the open project goes into its history; the download is checked against
 *  the SHA-256 that GitHub reports, and a version that will not start is undone (see bootStart in update.ts). */
export function Updater() {
  const { lib } = useStore();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [state, setState] = useState<'idle' | 'installing' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [hidden, setHidden] = useState(false);
  const install = async (u: UpdateInfo) => {
    setState('installing');
    await lib.saveNow(`Before updating to ${u.version}`, 'safety').catch(() => undefined);
    try { await installWindowsUpdate(u.url!, u.sha256, u.version); } catch (e) { setState('error'); setErr(String(e)); return; }
    // If the app is still running after 3 minutes, the download failed its check or did not finish: nothing was changed.
    setTimeout(() => { logRepair(`Update to ${u.version} did not finish; this version was kept`); setState('error'); setErr('The update did not finish (the download may have been interrupted or did not pass its safety check), so nothing was changed. The app will try again later.'); }, 180000);
  };
  useEffect(() => {
    if (platform() === 'web') return;
    let alive = true;
    const run = async (force = false) => {
      if (!navigator.onLine || (!force && !dueForCheck())) return;
      try {
        const u = await checkForUpdate(); markChecked(); if (!alive || !u) return;
        setInfo(u);
        if (platform() === 'windows' && u.url && autoUpdateOn() && !(await desktopInfo())?.portable) await install(u);
      } catch { /* try again later */ }
    };
    const t = setTimeout(() => run(), 4000);
    const iv = setInterval(() => run(), 3600e3);
    const on = () => run();
    window.addEventListener('online', on);
    return () => { alive = false; clearTimeout(t); clearInterval(iv); window.removeEventListener('online', on); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info || hidden) return null;
  const plat = platform();
  return (
    <div className="update-bar" role="status">
      {state === 'installing' ? <span>⬇ Installing LvPlan Pro {info.version}. The app will close and reopen by itself in about a minute. Your work is saved.</span> : <>
        <span>🎉 LvPlan Pro {info.version} is available.</span>
        {plat === 'android' && info.url && <button className="primary" onClick={() => { lib.saveNow(`Before updating to ${info.version}`, 'safety').catch(() => undefined); location.href = info.url!; }}>Download update</button>}
        {plat === 'windows' && info.url && <button className="primary" onClick={() => install(info)}>Install update</button>}
        {(plat === 'usb' || !info.url) && <a className="button primary" href={info.url ?? info.page} target="_blank" rel="noreferrer">Download update</a>}
        {plat === 'android' && <span className="small">Then tap the downloaded file and choose Install.</span>}
        {state === 'error' && <span className="small">{err}</span>}
        <button onClick={() => setHidden(true)}>Later</button>
      </>}
    </div>
  );
}
