import React, { useEffect, useRef, useState } from 'react';

/** The introduction video, bundled with the app (public/intro.mp4 and intro-2.mp4) so it plays offline. */
const ONLINE = 'https://bltaylorjr.github.io/radioplan-pro/';
/** Set once the video has opened by itself on the first visit, so it never opens by itself again. */
export const SEEN_VIDEO_KEY = 'radioplan.seenVideo';
/** The intro comes in two parts (each file stays under the 100 MB hosting limit): Part 2 plays as soon as Part 1 ends. */
export const INTRO_PARTS = [
  { file: 'intro.mp4', label: 'Part 1: a job from start to finish' },
  { file: 'intro-2.mp4', label: 'Part 2: tools, projects and settings' },
];
/** The files to play in order for a video: both intro parts for the intro, else just that file. */
export const partsFor = (file: string) => (file === INTRO_PARTS[0].file ? INTRO_PARTS : [{ file, label: '' }]);

/** True only the first time the app is opened on this device; marks it as seen. */
export function firstVisitVideo(): boolean {
  try { if (localStorage.getItem(SEEN_VIDEO_KEY)) return false; localStorage.setItem(SEEN_VIDEO_KEY, '1'); return true; } catch { return false; }
}

/** Also plays the other short how-to videos in public/ (file, title and about text given). */
export function IntroVideo({ onClose, first, file = 'intro.mp4', title, about }: { onClose: () => void; first?: boolean; file?: string; title?: string; about?: string }) {
  const parts = partsFor(file);
  const [part, setPart] = useState(0);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(false);
  const cur = parts[part].file;
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  // Some browsers will not start a video with sound before the first tap: then it plays muted with a big "turn on sound" button.
  useEffect(() => {
    const el = v.current; if (!el) return;
    el.muted = false;
    el.play().catch(() => { el.muted = true; setMuted(true); el.play().catch(() => {}); });
  }, [failed, part]);
  const goPart = (i: number) => { setFailed(false); setPart(i); };
  const ended = () => { if (part < parts.length - 1) goPart(part + 1); };
  const sound = () => { const el = v.current; if (!el) return; el.muted = false; setMuted(false); el.play().catch(() => {}); };
  return (
    <div className="intro-video" role="dialog" aria-label={title ?? 'Introduction video'} onClick={onClose}>
      <div className="intro-video-box" onClick={(e) => e.stopPropagation()}>
        <header className="row"><h3 style={{ margin: 0, flex: 1 }}>▶ {title ?? (first ? 'Welcome! Here is a quick tour of LvPlan Pro' : 'LvPlan Pro introduction')}</h3><button className="ghost" onClick={onClose} aria-label="Close video">✕</button></header>
        <div style={{ position: 'relative' }}>
          <video ref={v} key={`${cur}-${failed ? 'online' : 'local'}`} src={failed ? ONLINE + cur : './' + cur} controls playsInline onEnded={ended} onError={() => { if (!failed) setFailed(true); }} />
          {muted && <button className="primary big intro-sound" onClick={sound}>🔊 Tap to turn on the sound</button>}
        </div>
        {parts.length > 1 && <div className="row wrap" role="group" aria-label="Video parts">{parts.map((x, i) => <button key={x.file} className={i === part ? 'primary' : ''} aria-pressed={i === part} onClick={() => goPart(i)}>{x.label}</button>)}</div>}
        <div className="row wrap">
          <p className="small muted" style={{ flex: 1 }}>{about ?? 'A tour of every page and tool, with captions, in two parts: Part 2 starts by itself when Part 1 ends. '}{first && 'You can watch it again any time with the ▶ Video button at the top. '}{failed && 'The copy inside the app could not be opened, so this plays the online copy.'}</p>
          {first && <button className="big" onClick={onClose}>Skip the video</button>}
        </div>
      </div>
    </div>
  );
}
