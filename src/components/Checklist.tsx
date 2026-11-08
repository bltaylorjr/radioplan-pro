import React, { useState } from 'react';
import { useStore } from '../store';
import { Card } from './ui';
import { ChecklistDef, itemsOf, doneKey } from '../data/checklists';
import { uid } from '../defaults';

/** A checklist saved in the project, grouped by system, with your own items. */
export function Checklist({ def }: { def: ChecklistDef }) {
  const { project: p, update } = useStore();
  const [text, setText] = useState('');
  const items = itemsOf(def, p);
  const done = items.filter((i) => p.checklists?.[doneKey(def.id, i.id)]).length;
  const groups = [...new Set(items.map((i) => i.group ?? ''))];
  const set = (id: string, v: boolean) => update((d) => { d.checklists = { ...(d.checklists ?? {}), [doneKey(def.id, id)]: v }; });
  const add = () => { const t = text.trim(); if (!t) return; update((d) => { d.checklistExtra = [...(d.checklistExtra ?? []), { id: uid(), list: def.id, text: t }]; }); setText(''); };
  return (
    <Card title={`☑ ${def.title}`} tip={def.tip} className="checklist-card" actions={<span className={'small ' + (done === items.length && items.length ? 'ok-text' : 'muted')}>{done} of {items.length} done</span>}>
      <div className="meter" aria-hidden><i style={{ width: `${items.length ? (100 * done) / items.length : 0}%` }} /></div>
      {groups.map((gname) => <div key={gname}>{groups.length > 1 && <h4>{gname}</h4>}
        <ul className="checklist">{items.filter((i) => (i.group ?? '') === gname).map((i) => { const on = !!p.checklists?.[doneKey(def.id, i.id)]; return (
          <li key={i.id} className={on ? 'done' : ''}><label className="check"><input type="checkbox" checked={on} onChange={(e) => set(i.id, e.target.checked)} /> {i.text}</label>
            {i.mine && <button className="ghost small" aria-label={`Remove ${i.text}`} onClick={() => update((d) => { d.checklistExtra = (d.checklistExtra ?? []).filter((x) => x.id !== i.id); })}>✕</button>}</li>); })}</ul></div>)}
      <div className="row"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add your own item" aria-label={`Add item to ${def.title}`} style={{ flex: 1 }} /><button onClick={add} disabled={!text.trim()}>+ Add</button>
        {done > 0 && <button className="ghost" onClick={() => { if (confirm('Untick every item on this checklist?')) update((d) => { const c = { ...(d.checklists ?? {}) }; for (const k of Object.keys(c)) if (k.startsWith(def.id + ':')) delete c[k]; d.checklists = c; }); }}>Clear ticks</button>}</div>
    </Card>
  );
}
