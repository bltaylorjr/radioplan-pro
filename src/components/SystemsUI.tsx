import React, { useState } from 'react';
import { useStore } from '../store';
import { SYSTEMS, ENABLES, SystemId } from '../data/systems';
import { LvCalc, runCalc } from '../data/lvcalcs';
import type { Project } from '../types';
import { Num, MeasureCtx, shownIn } from './ui';

/** Set the main type and sub-projects; turns on the matching design pages. */
export function applySystems(d: Project, type: string | undefined, subs: string[]) {
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
        </select></label>
      {compact && !open ? <button className="ghost" onClick={() => setOpen(true)}>+ Add sub-projects ({subs.length})</button> : (
        <fieldset className="subsys"><legend>Sub-projects on the same job</legend>
          {SYSTEMS.filter((s) => s.id !== type).map((s) => (
            <label key={s.id} className="check"><input type="checkbox" checked={subs.includes(s.id)} onChange={(e) => update((d) => applySystems(d, type, e.target.checked ? [...subs, s.id] : subs.filter((x) => x !== s.id)))} /> {s.icon} {s.label}</label>))}
        </fieldset>)}
    </div>
  );
}

/** One data-driven calculator. */
export function LvCalcCard({ c }: { c: LvCalc }) {
  const [v, setV] = useState<Record<string, number>>({});
  const out = runCalc(c, v); const sys = React.useContext(MeasureCtx);
  return (
    <section className="card calc"><header><h3>{c.title}</h3></header>
      <div className="form">{c.inputs.map((i) => (
        <label key={i.k} className="field"><span className="field-label">{i.label}</span>
          {i.options ? <select value={v[i.k] ?? i.v} onChange={(e) => setV({ ...v, [i.k]: parseFloat(e.target.value) })}>{i.options.map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select>
            : <Num step={i.step ?? 'any'} value={v[i.k] ?? i.v} onChange={(x) => setV({ ...v, [i.k]: x ?? 0 })} unit={i.unit} />}
        </label>))}</div>
      {out.map((o) => { const [val, un] = shownIn(o.value, o.unit, sys); return <div key={o.label} className={'calc-out' + (o.tone ? ' ' + o.tone : '')}><span>{o.label}</span><b>{val}{un && <small> {un}</small>}</b></div>; })}
      {c.note && <p className="small muted">{c.note}</p>}
    </section>
  );
}
