import React, { useEffect, useRef, useState } from 'react';

/** The introduction video, bundled with the app (public/intro.mp4) so it plays offline. */
const ONLINE = 'https://bltaylorjr.github.io/radioplan-pro/intro.mp4';
/** Set once the video has opened by itself on the first visit, so it never opens by itself again. */
export const SEEN_VIDEO_KEY = 'radioplan.seenVideo';

/** True only the first time the app is opened on this device; marks it as seen. */
export function firstVisitVideo(): boolean {
  try { if (localStorage.getItem(SEEN_VIDEO_KEY)) return false; localStorage.setItem(SEEN_VIDEO_KEY, '1'); return true; } catch { return false; }
}

export function IntroVideo({ onClose, first }: { onClose: () => void; first?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(false);
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  // Some browsers will not start a video with sound before the first tap: then it plays muted with a big "turn on sound" button.
  useEffect(() => {
    const el = v.current; if (!el) return;
    el.muted = false;
    el.play().catch(() => { el.muted = true; setMuted(true); el.play().catch(() => {}); });
  }, [failed]);
  const sound = () => { const el = v.current; if (!el) return; el.muted = false; setMuted(false); el.play().catch(() => {}); };
  return (
    <div className="intro-video" role="dialog" aria-label="Introduction video" onClick={onClose}>
      <div className="intro-video-box" onClick={(e) => e.stopPropagation()}>
        <header className="row"><h3 style={{ margin: 0, flex: 1 }}>▶ {first ? 'Welcome! Here is a quick tour of LvPlan Pro' : 'LvPlan Pro introduction'}</h3><button className="ghost" onClick={onClose} aria-label="Close video">✕</button></header>
        <div style={{ position: 'relative' }}>
          <video ref={v} key={failed ? 'online' : 'local'} src={failed ? ONLINE : './intro.mp4'} controls playsInline onError={() => { if (!failed) setFailed(true); }} />
          {muted && <button className="primary big intro-sound" onClick={sound}>🔊 Tap to turn on the sound</button>}
        </div>
        <div className="row wrap">
          <p className="small muted" style={{ flex: 1 }}>A tour of every page and tool, with captions. {first && 'You can watch it again any time with the ▶ Video button at the top. '}{failed && 'The copy inside the app could not be opened, so this plays the online copy.'}</p>
          {first && <button className="big" onClick={onClose}>Skip the video</button>}
        </div>
      </div>
    </div>
  );
}
