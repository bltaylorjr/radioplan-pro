import React, { useEffect, useState } from 'react';
import { autoUpdateOn, checkForUpdate, desktopInfo, dueForCheck, installWindowsUpdate, markChecked, platform, UpdateInfo } from '../engine/update';

/** Checks for a new version when online and installs it (Windows) or offers it in one tap (Android, flash drive). */
export function Updater() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [state, setState] = useState<'idle' | 'installing' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (platform() === 'web') return;
    let alive = true;
    const run = async (force = false) => {
      if (!navigator.onLine || (!force && !dueForCheck())) return;
      try {
        const u = await checkForUpdate(); markChecked(); if (!alive || !u) return;
        setInfo(u);
        if (platform() === 'windows' && u.url && autoUpdateOn() && !(await desktopInfo())?.portable) {
          setState('installing');
          await installWindowsUpdate(u.url).catch((e) => { setState('error'); setErr(String(e)); });
        }
      } catch { /* try again later */ }
    };
    const t = setTimeout(() => run(), 4000);
    const iv = setInterval(() => run(), 3600e3);
    const on = () => run();
    window.addEventListener('online', on);
    return () => { alive = false; clearTimeout(t); clearInterval(iv); window.removeEventListener('online', on); };
  }, []);
  if (!info || hidden) return null;
  const plat = platform();
  return (
    <div className="update-bar" role="status">
      {state === 'installing' ? <span>⬇ Installing RadioPlan Pro {info.version}. The app will close and reopen by itself in about a minute. Your work is saved.</span> : <>
        <span>🎉 RadioPlan Pro {info.version} is available.</span>
        {plat === 'android' && info.url && <button className="primary" onClick={() => { location.href = info.url!; }}>Download update</button>}
        {plat === 'windows' && info.url && <button className="primary" onClick={() => { setState('installing'); installWindowsUpdate(info.url!).catch((e) => { setState('error'); setErr(String(e)); }); }}>Install update</button>}
        {(plat === 'usb' || !info.url) && <a className="button primary" href={info.url ?? info.page} target="_blank" rel="noreferrer">Download update</a>}
        {plat === 'android' && <span className="small">Then tap the downloaded file and choose Install.</span>}
        {state === 'error' && <span className="small">{err}</span>}
        <button onClick={() => setHidden(true)}>Later</button>
      </>}
    </div>
  );
}
