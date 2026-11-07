import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { HELP, HelpTopic, TourStep } from './content';

/** Minimal markdown: paragraphs, "- " lists, numbered lists, **bold**. */
export function Md({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <React.Fragment key={i}>{p}</React.Fragment>));
  return <>{blocks.map((b, i) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*- /.test(l))) return <ul key={i}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*- /, ''))}</li>)}</ul>;
    if (lines.every((l) => /^\s*\d+\. /.test(l))) return <ol key={i}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*\d+\. /, ''))}</li>)}</ol>;
    if (lines.length > 1 && lines.slice(1).every((l) => /^\s*- /.test(l))) return <div key={i}><p>{inline(lines[0])}</p><ul>{lines.slice(1).map((l, k) => <li key={k}>{inline(l.replace(/^\s*- /, ''))}</li>)}</ul></div>;
    return <p key={i}>{inline(b)}</p>;
  })}</>;
}

export function HelpManual({ initial }: { initial?: string }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string>(initial || 'getting-started');
  useEffect(() => { if (initial) setSel(initial); }, [initial]);
  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return HELP;
    return HELP.map((h) => {
      const hay = `${h.title} ${h.keywords} ${h.summary} ${h.body}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 + (h.title.toLowerCase().includes(t) ? 2 : 0) + (h.keywords.includes(t) ? 1 : 0) : -100), 0);
      return { h, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.h);
  }, [q]);
  const topic = HELP.find((h) => h.id === sel) ?? HELP[0];
  return (
    <div className="manual">
      <aside>
        <input className="search" placeholder="Search the manual (e.g. fresnel, 690, battery)…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <ul>{results.map((h) => <li key={h.id} className={h.id === topic.id ? 'active' : ''} onClick={() => setSel(h.id)}><b>{h.title}</b><small>{h.summary}</small></li>)}</ul>
        {!results.length && <p className="muted">No topics match “{q}”.</p>}
      </aside>
      <article>
        <h2>{topic.title}</h2>
        <p className="lead">{topic.summary}</p>
        <Md text={topic.body} />
        {topic.page && <p><a className="btn" href={`#${topic.page}`}>Go to this page →</a></p>}
      </article>
    </div>
  );
}

/** Guided walkthrough: highlights each [data-tour] target in turn with an explanation bubble. */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  useLayoutEffect(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const upd = () => setRect(el.getBoundingClientRect());
    const t = setTimeout(upd, 350); upd();
    window.addEventListener('resize', upd); window.addEventListener('scroll', upd, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', upd); window.removeEventListener('scroll', upd, true); };
  }, [step]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, steps.length - 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose, steps.length]);
  const pad = 6;
  const below = rect ? rect.bottom + 170 < window.innerHeight : true;
  const bubbleTop = rect ? (below ? rect.bottom + 12 : Math.max(8, rect.top - 170)) : window.innerHeight / 2 - 80;
  const bubbleLeft = rect ? Math.min(Math.max(8, rect.left), window.innerWidth - 340) : window.innerWidth / 2 - 160;
  return (
    <div className="tour">
      {rect && <div className="tour-hole" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
      {!rect && <div className="tour-dim" />}
      <div className="tour-bubble" style={{ top: bubbleTop, left: bubbleLeft }} role="dialog" aria-live="polite">
        <div className="tour-count">Step {i + 1} of {steps.length}</div>
        <h4>{step.title}</h4><p>{step.text}</p>
        <div className="tour-actions">
          <button onClick={onClose} className="ghost">Close</button>
          <span>
            <button disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>{' '}
            {i < steps.length - 1 ? <button className="primary" onClick={() => setI(i + 1)}>Next</button> : <button className="primary" onClick={onClose}>Done</button>}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Slide-in contextual help panel for the current page. */
export function HelpPanel({ topic, onClose, onTour }: { topic: HelpTopic; onClose: () => void; onTour?: () => void }) {
  return (
    <div className="help-panel" role="complementary">
      <header><h3>Help: {topic.title}</h3><button className="ghost" onClick={onClose} aria-label="Close help">✕</button></header>
      <p className="lead">{topic.summary}</p>
      <Md text={topic.body} />
      <div className="row">
        {onTour && topic.tour && <button className="primary" onClick={onTour}>▶ Guide me through this page</button>}
        <a className="btn" href={`#help/${topic.id}`}>Open full manual</a>
      </div>
    </div>
  );
}
