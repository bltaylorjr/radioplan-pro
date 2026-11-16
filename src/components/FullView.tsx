import React, { createContext, useContext, useEffect, useState } from 'react';

/** Tells maps and 3D views inside whether they are showing full page, so they can show their big Layers / zoom /
 *  tilt buttons (ViewControls.tsx). A view nested in another full page view (the 3D tilt view inside the map)
 *  counts as full page while the outer one is open. */
export const FullViewCtx = createContext<{ on: boolean }>({ on: false });
const ON = { on: true }, OFF = { on: false };
export const useFullView = () => useContext(FullViewCtx);

/** Wraps a map, 3D view or diagram with a "Full page" button. Full page fills the screen with a big Close button
 *  (Esc also closes). The content stays mounted, so maps and 3D views keep their position and zoom. */
export function FullView({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  const [on, setOn] = useState(false);
  const parent = useContext(FullViewCtx);
  useEffect(() => {
    // let maps and 3D views size themselves to the new box
    const t = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    if (!on) return () => window.clearTimeout(t);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOn(false); };
    window.addEventListener('keydown', k);
    return () => { window.clearTimeout(t); document.body.style.overflow = prev; window.removeEventListener('keydown', k); };
  }, [on]);
  const ctx = on || parent.on ? ON : OFF;
  return (
    <div className={'fullview' + (on ? ' fullview-on' : '') + (className ? ' ' + className : '')} role={on ? 'dialog' : undefined} aria-modal={on || undefined} aria-label={on ? title : undefined}>
      {on ? <div className="fullview-bar"><b>{title}</b><button className="primary big" onClick={() => setOn(false)} aria-label={`Close full page ${title}`}>✕ Close</button></div> : null}
      {!on && !parent.on ? <div className="fullview-open"><button className="small-btn" onClick={() => setOn(true)} title="Show this on its own full page">⛶ Full page</button></div> : null}
      <FullViewCtx.Provider value={ctx}><div className="fullview-body">{children}</div></FullViewCtx.Provider>
    </div>
  );
}
