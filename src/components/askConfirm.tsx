import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

/** An in-app Yes / No box (works the same in the Windows app, Android and the browser). */
export function askConfirm(o: { title: string; message: React.ReactNode; ok?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: boolean) => { root.unmount(); host.remove(); resolve(v); };
    root.render(<Box {...o} done={done} />);
  });
}

function Box({ title, message, ok = 'OK', cancel = 'Cancel', danger, done }: { title: string; message: React.ReactNode; ok?: string; cancel?: string; danger?: boolean; done: (v: boolean) => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [done]);
  return (
    <div className="confirm-back" role="presentation" onClick={() => done(false)}>
      <div className="confirm-box" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{danger ? '⚠ ' : ''}{title}</h3>
        <div className="confirm-msg">{message}</div>
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
          <button autoFocus onClick={() => done(false)}>{cancel}</button>
          <button className={danger ? 'danger' : 'primary'} onClick={() => done(true)}>{ok}</button>
        </div>
      </div>
    </div>
  );
}
