import React, { useEffect, useState } from 'react';

/** Wraps a map, 3D view or diagram with a "Full page" button. Full page fills the screen with a big Close button
 *  (Esc also closes). The content stays mounted, so maps and 3D views keep their position and zoom. */
export function FullView({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // let maps and 3D views size themselves to the new box
    const t = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    if (!on) return () => window.clearTimeout(t);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOn(false); };
    window.addEventListener('keydown', k);
    return () => { window.clearTimeout(t); document.body.style.overflow = prev; window.removeEventListener('keydown', k); };
  }, [on]);
  return (
    <div className={'fullview' + (on ? ' fullview-on' : '') + (className ? ' ' + className : '')} role={on ? 'dialog' : undefined} aria-modal={on || undefined} aria-label={on ? title : undefined}>
      {on ? <div className="fullview-bar"><b>{title}</b><button className="primary big" onClick={() => setOn(false)} aria-label={`Close full page ${title}`}>✕ Close</button></div> : null}
      {!on ? <div className="fullview-open"><button className="small-btn" onClick={() => setOn(true)} title="Show this on its own full page">⛶ Full page</button></div> : null}
      <div className="fullview-body">{children}</div>
    </div>
  );
}
