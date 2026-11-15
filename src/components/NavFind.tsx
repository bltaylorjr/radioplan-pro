import { useMemo, useState } from 'react';
import { MENU_PAGES } from '../data/menu';
import { HELP } from '../help/content';
import { FEATURES, showFeature } from '../help/features';

interface Hit { kind: 'page' | 'tool' | 'help'; id: string; title: string; sub: string; score: number }

/** Score how well the typed words match a piece of text; 0 when any word is missing. */
export function matchScore(words: string[], title: string, rest: string): number {
  const t = title.toLowerCase(), r = rest.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (t.includes(w)) score += t.split(/[^a-z0-9°]+/).some((x) => x.startsWith(w)) ? 4 : 3;
    else if (r.includes(w)) score += 1;
    else return 0;
  }
  return score;
}

/** Search every menu page, tool and help topic. */
export function findTools(q: string, visiblePages?: string[]): Hit[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (!words.length) return [];
  const hits: Hit[] = [];
  for (const p of MENU_PAGES) {
    if (visiblePages && !visiblePages.includes(p.id)) continue;
    const h = HELP.find((x) => x.page === p.id);
    const s = matchScore(words, p.label, `${p.keywords ?? ''} ${h?.title ?? ''} ${h?.keywords ?? ''}`);
    if (s) hits.push({ kind: 'page', id: p.id, title: p.label, sub: h?.summary ?? '', score: s + 1 });
  }
  for (const f of FEATURES) {
    const s = matchScore(words, f.title, `${f.keywords} ${f.summary} ${f.where}`);
    if (s) hits.push({ kind: 'tool', id: f.id, title: f.title, sub: f.where, score: s + 1.5 });
  }
  for (const h of HELP) {
    if (h.page) continue;
    const s = matchScore(words, h.title, `${h.keywords} ${h.summary}`);
    if (s) hits.push({ kind: 'help', id: h.id, title: h.title, sub: h.summary, score: s });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 8);
}

const ICON = { page: '→', tool: '▶', help: '?' } as const;

/** "Find a tool" box at the top of the menu. */
export function NavFind({ pages, onGo }: { pages: { id: string }[]; onGo: (id: string) => void }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => findTools(q, pages.map((p) => p.id)), [q, pages]);
  const pick = (h: Hit) => {
    setQ('');
    if (h.kind === 'page') onGo(h.id);
    else if (h.kind === 'tool') showFeature(h.id);
    else location.hash = `help/${h.id}`;
  };
  return (
    <div className="nav-find" data-tour="nav-find">
      <input type="search" placeholder="🔎 Find a tool…" aria-label="Find a tool" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) pick(hits[0]); if (e.key === 'Escape') setQ(''); }} />
      {q.trim() && (
        <div className="nav-find-hits" role="listbox">
          {hits.map((h) => (
            <button type="button" key={h.kind + h.id} role="option" onClick={() => pick(h)} title={h.sub}>
              <span className="step-dot tool">{ICON[h.kind]}</span>
              <span><b>{h.title}</b><small>{h.kind === 'tool' ? h.sub : h.kind === 'help' ? 'Help topic' : 'Page'}</small></span>
            </button>
          ))}
          {!hits.length && <p className="small">Nothing matches “{q}”. Try another word, or open the <a href="#help">Help manual</a>.</p>}
        </div>
      )}
    </div>
  );
}
