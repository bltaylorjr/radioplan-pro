import React, { useState } from 'react';
import { ResetBtn, CalcActions } from './CalcKit';
import { getPath } from '../engine/calcApply';
import { useStore } from '../store';
import { SYSTEMS, ENABLES, SystemId, projectSystems } from '../data/systems';
import { PAGE_GROUPS, ALWAYS_PAGES, suggestPages } from '../data/customPages';
import { WORKFLOW_LABELS } from '../data/pageLabels';
import { LvCalc, checkCalc } from '../data/lvcalcs';
import { Issue, issueText } from '../engine/validate';
import { CALC_INPUT_INFO, FieldInfo } from '../data/fieldInfo';
import type { Project } from '../types';
import { Num, MeasureCtx, shownIn, fieldInfoFor } from './ui';

/** Set the main type and sub-projects; turns on the matching design pages. */
export function applySystems(d: Project, type: string | undefined, subs: string[]) {
  if (type === 'custom' && d.meta.projectType !== 'custom') {
    // Start the custom pick from what was already chosen.
    subs = [d.meta.projectType, ...subs].filter((x): x is string => !!x && x !== 'custom');
    d.meta.customPages = suggestPages(projectSystems({ subSystems: subs }));
  }
  d.meta.projectType = type || undefined;
  d.meta.subSystems = subs.filter((s) => s !== type);
  for (const id of [type, ...subs]) { const f = ENABLES[id as SystemId]; if (f) d[f].enabled = true; }
}

/** Dropdown for the project type, with check boxes to add sub-projects. */
export function ProjectTypePicker({ compact }: { compact?: boolean }) {
  const { project: p, update } = useStore();
  const type = p.meta.projectType ?? '';
  const subs = p.meta.subSystems ?? [];
  const [open, setOpen] = useState(!compact || subs.length > 0);
  return (
    <div className="ptype">
      <label className="field wide"><span>Project type</span>
        <select value={type} onChange={(e) => update((d) => applySystems(d, e.target.value, subs))} aria-label="Project type">
          <option value="">— pick the main system —</option>
          {SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
          <option value="custom">⚙ Custom: pick only the systems and tools I need</option>
        </select></label>
      {type === 'custom' ? <CustomPicker compact={compact} /> : compact && !open ? <button className="ghost" onClick={() => setOpen(true)}>+ Add sub-projects ({subs.length})</button> : (
        <fieldset className="subsys"><legend>Sub-projects on the same job</legend>
          {SYSTEMS.filter((s) => s.id !== type).map((s) => (
            <label key={s.id} className="check"><input type="checkbox" checked={subs.includes(s.id)} onChange={(e) => update((d) => applySystems(d, type, e.target.checked ? [...subs, s.id] : subs.filter((x) => x !== s.id)))} /> {s.icon} {s.label}</label>))}
        </fieldset>)}
    </div>
  );
}

/** Custom project: tick the systems on this job, then the pages and tools to show in the menu. */
function CustomPicker({ compact }: { compact?: boolean }) {
  const { project: p, update, go } = useStore();
  const subs = p.meta.subSystems ?? [];
  const pages = p.meta.customPages ?? [];
  const setSubs = (next: string[]) => update((d) => applySystems(d, 'custom', next));
  const setPages = (next: string[]) => update((d) => { d.meta.customPages = next; });
  const togglePage = (id: string, on: boolean) => setPages(on ? [...pages, id] : pages.filter((x) => x !== id));
  return (
    <div className="custom-pick">
      <fieldset className="subsys"><legend>1. Systems on this job</legend>
        {SYSTEMS.map((s) => (
          <label key={s.id} className="check"><input type="checkbox" checked={subs.includes(s.id)} onChange={(e) => setSubs(e.target.checked ? [...subs, s.id] : subs.filter((x) => x !== s.id))} /> {s.icon} {s.label}</label>))}
      </fieldset>
      {!compact && <fieldset className="subsys custom-pages"><legend>2. Pages and tools to show</legend>
        <div className="row wrap" style={{ marginBottom: 6 }}>
          <button onClick={() => setPages(suggestPages(projectSystems({ subSystems: subs })))}>Suggest for my systems</button>
          <button className="ghost" onClick={() => setPages(PAGE_GROUPS.flatMap(([, ids]) => ids))}>All</button>
          <button className="ghost" onClick={() => setPages([...ALWAYS_PAGES])}>None</button>
          <span className="small muted">{pages.filter((x) => !ALWAYS_PAGES.includes(x)).length} picked. The menu, step numbers and Next / Previous follow this list.</span>
        </div>
        {PAGE_GROUPS.map(([g, ids]) => (
          <div key={g} className="custom-group"><b className="small">{g.replace(/^\d+ · /, '')}</b>
            {ids.map((id) => { const always = ALWAYS_PAGES.includes(id); return (
              <label key={id} className="check"><input type="checkbox" disabled={always} checked={always || pages.includes(id)} onChange={(e) => togglePage(id, e.target.checked)} /> {WORKFLOW_LABELS[id] ?? id}{always && <span className="small muted"> (always shown)</span>}</label>); })}
          </div>))}
      </fieldset>}
      {compact && <p className="small"><button className="ghost" onClick={() => go('systems')}>Pick pages and tools on Project Systems →</button></p>}
    </div>
  );
}

/** One data-driven calculator. Blank boxes are never counted as zero; wrong entries get a message and a fix. */
export function LvCalcCard({ c }: { c: LvCalc }) {
  const [v, setV] = useState<Record<string, number | null>>({});
  const chk = checkCalc(c, v); const sys = React.useContext(MeasureCtx);
  const notes = chk.issues.filter((i) => !i.msg.endsWith('is empty.') && !isRangeIssue(i));
  const full = () => Object.fromEntries(c.inputs.map((i) => [i.k, v[i.k] ?? i.v])) as Record<string, number>;
  return (
    <section className="card calc" data-calc={c.id}><header><h3>{c.title}</h3><ResetBtn onReset={() => setV({})} /></header>
      <div className="form">{c.inputs.map((i) => (
        <label key={i.k} className="field"><span className="field-label">{i.label}</span>
          {i.options ? <select value={v[i.k] ?? i.v} onChange={(e) => setV({ ...v, [i.k]: parseFloat(e.target.value) })}>{i.options.map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select>
            : <Num nullable required={!i.optional} label={i.label} min={i.min} max={i.max} integer={i.integer} step={i.step ?? 'any'} value={i.k in v ? v[i.k] : i.v} onChange={(x) => setV({ ...v, [i.k]: x })} unit={i.unit} info={calcInputInfo(c, i)} />}
        </label>))}</div>
      {notes.length > 0 && <ul className="calc-msgs">{notes.map((i, n) => <li key={n} className={i.level}>⚠ {issueText(i)}</li>)}</ul>}
      {chk.out ? chk.out.map((o) => { const [val, un] = shownIn(o.value, o.unit, sys); return <div key={o.label} className={'calc-out' + (o.tone ? ' ' + o.tone : '')}><span>{o.label}</span><b>{val}{un && <small> {un}</small>}</b></div>; })
        : <p className="small calc-wait">{chk.missing.length ? `Fill in ${chk.missing.join(', ')} to see the result.` : notes.some((i) => i.level === 'bad') ? 'Fix the problem above to see the result.' : 'Fix the entry marked in red to see the result.'}</p>}
      {c.note && <p className="small muted">{c.note}</p>}
      <CalcActions applyWhat={`“${c.title}”`}
        apply={c.apply && chk.out ? () => c.apply!(full()).map((t) => ({ id: t.id, label: t.label, page: t.page, sets: [[t.path, t.value]], to: t.to, on: t.on, now: (p) => { const x = getPath(p, t.path); return x == null ? '' : t.show ? t.show(x) : String(x); } })) : undefined}
        fromProject={c.fromProject ? (p) => setV({ ...v, ...c.fromProject!(p) }) : undefined} />
    </section>
  );
}
/** Range problems are shown next to the box itself, so the card list only shows cross-checks and general notes. */
const isRangeIssue = (i: Issue) => / must be | is not a number/.test(i.msg);

/** ⓘ text for a calculator input: its explanation, and the calculator's standard value as the default. */
function calcInputInfo(c: LvCalc, i: LvCalc['inputs'][number]): FieldInfo {
  const what = CALC_INPUT_INFO[`${c.id}.${i.k}`] ?? fieldInfoFor(i.label, i.unit)?.what ?? `${i.label.replace(/\s*\(optional\)$/i, '')} for this calculation.`;
  return { what, def: i.optional ? undefined : i.v, src: 'common value; see the note under this calculator' };
}
