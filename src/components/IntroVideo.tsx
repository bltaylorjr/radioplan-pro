import React, { useEffect, useState } from 'react';

/** The introduction video, bundled with the app (public/intro.mp4) so it plays offline. */
const ONLINE = 'https://bltaylorjr.github.io/radioplan-pro/intro.mp4';

export function IntroVideo({ onClose }: { onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="intro-video" role="dialog" aria-label="Introduction video" onClick={onClose}>
      <div className="intro-video-box" onClick={(e) => e.stopPropagation()}>
        <header className="row"><h3 style={{ margin: 0, flex: 1 }}>▶ LvPlan Pro introduction</h3><button className="ghost" onClick={onClose} aria-label="Close video">✕</button></header>
        {!failed
          ? <video src="./intro.mp4" controls autoPlay playsInline onError={() => setFailed(true)} />
          : <video src={ONLINE} controls autoPlay playsInline />}
        <p className="small muted">A tour of every page and tool, with captions. {failed && 'The copy inside the app could not be opened, so this plays the online copy.'}</p>
      </div>
    </div>
  );
}
