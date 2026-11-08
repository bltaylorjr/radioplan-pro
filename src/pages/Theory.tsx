// Low-voltage principles: a reading page with a clickable index, levels, search, and the related
import { FullView } from '../components/FullView';
// calculators shown right under each section. Works offline (the text is built into the app).
import React, { useMemo, useState } from 'react';
import { THEORY, LEVELS, type Level } from '../data/theory';
import { Md } from '../help/HelpUI';
import { lvCalc } from '../data/lvcalcs';
import { LvCalcCard } from '../components/SystemsUI';
import { useStore } from '../store';
import { THEORY_DIAGRAMS } from '../components/TheoryDiagrams';
import { GUIDES, guideCtx } from './Install';

export function TheoryPage() {
  const { go, project } = useStore();
  const [q, setQ] = useState('');
  const [lv, setLv] = useState<Level | 'All'>('All');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const parts = useMemo(() => THEORY.map((p) => ({ ...p, sections: p.sections.filter((s) => (lv === 'All' || s.level === lv) && words.every((w) => `${s.title} ${s.body} ${p.title}`.toLowerCase().includes(w))) })).filter((p) => p.sections.length), [q, lv]); // eslint-disable-line react-hooks/exhaustive-deps
  const jump = (id: string) => { const el = document.getElementById(`th-${id}`); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' }); };
  const count = parts.reduce((a, p) => a + p.sections.length, 0);
  return (
    <div className="theory">
      <div className="card">
        <div className="row wrap">
          <input className="search" type="search" placeholder="Search the text (e.g. voltage drop, plenum, EOL, STI)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search low-voltage principles" />
          <span className="row" role="group" aria-label="Level">{(['All', ...LEVELS] as const).map((l) => <button key={l} className={lv === l ? 'primary' : ''} onClick={() => setLv(l)}>{l}</button>)}</span>
        </div>
        <p className="small muted">From the basics to advanced design, in the order you need them: fundamentals, cabling, each system, installation, then design and troubleshooting. Built into the app, so it reads offline. General training text: the adopted code edition, the manufacturer's instructions and the AHJ decide what applies on a job.</p>
      </div>
      <div className="theory-wrap">
        <nav className="card theory-index" aria-label="Index">
          <h3>Index</h3>
          {!count && <p className="small muted">Nothing matches.</p>}
          <ol>{parts.map((p) => <li key={p.id}><a href={`#theory`} onClick={(e) => { e.preventDefault(); jump(p.id); }}><b>{p.title}</b></a>
            <ol>{p.sections.map((s) => <li key={s.id}><a href="#theory" onClick={(e) => { e.preventDefault(); jump(s.id); }}>{s.title}</a> <span className={`lvl lvl-${s.level.toLowerCase()}`}>{s.level}</span></li>)}</ol></li>)}</ol>
        </nav>
        <div className="theory-body">
          {parts.map((p) => (
            <section key={p.id} id={`th-${p.id}`} className="card">
              <h2>{p.title}</h2>
              <p className="muted">{p.intro}</p>
              {p.sections.map((s) => (
                <article key={s.id} id={`th-${s.id}`} className="theory-sec">
                  <h3>{s.title} <span className={`lvl lvl-${s.level.toLowerCase()}`}>{s.level}</span></h3>
                  <Md text={s.body} />
                  {s.diagrams?.map((d) => { const td = THEORY_DIAGRAMS[d], g = GUIDES.find((x) => x.id === d); return td || g ? <FullView key={d} title={td ? td.title : `Wiring diagram: ${g!.title}`}><figure className="theory-fig"><figcaption><b>{td ? td.title : `Wiring diagram: ${g!.title}`}</b></figcaption>{td ? <td.el /> : g!.diagram(guideCtx(project))}</figure></FullView> : null; })}
                  {(s.pages?.length || s.calcs?.length) ? <div className="row wrap">
                    {s.pages?.map(([id, label]) => <button key={id + label} onClick={() => go(id)}>Open {label} →</button>)}
                    {s.calcs?.length ? <button onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>{open[s.id] ? 'Hide calculators' : `🧮 Calculators (${s.calcs.length})`}</button> : null}
                  </div> : null}
                  {open[s.id] && <div className="calc-grid">{s.calcs!.map((c) => lvCalc(c)).filter(Boolean).map((c) => <LvCalcCard key={c!.id} c={c!} />)}</div>}
                  <p className="small"><a href="#theory" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>↑ Back to the index</a></p>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
