// Recall and service bulletin alerts: a banner on every page of a project whose equipment matches a notice
// (until each one is marked as checked for that project), and the notices for one model in the library.
// New notices that arrive with the automatic weekly refresh show up as new alerts on projects already using
// that equipment.
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { kvGet, kvSet } from '../engine/projectdb';
import type { SpecItem } from '../data/speclib';
import { allNotices, noticesFor, noticesForText, loadMine, saveMine, escapeRe, Notice, NOTICES_EVENT, RECALLS_CHECKED } from '../data/recalls';
import { projectEquipment, loadMyItems, SPECLIB_EVENT } from '../data/projectEquipment';
import type { Project } from '../types';
import { askDelete } from './askConfirm';

export function useNotices() {
  const [list, setList] = useState<Notice[]>([]);
  useEffect(() => {
    let alive = true; const load = () => allNotices().then((l) => alive && setList(l)).catch(() => undefined);
    load(); window.addEventListener(NOTICES_EVENT, load); return () => { alive = false; window.removeEventListener(NOTICES_EVENT, load); };
  }, []);
  return list;
}
/** Notices that may apply to an item; free-text items (materials, device schedule) match on model numbers. */
export const itemNotices = (it: SpecItem, list: Notice[]) => {
  const a = noticesFor(it, list), b = noticesForText(`${it.brand} ${it.model}`, list);
  return [...new Map([...a, ...b].map((n) => [n.id, n])).values()];
};
export interface Hit { notice: Notice; items: string[] }
/** Every notice that may apply to equipment in this project (project equipment and library items used in it). */
export function projectHits(p: Project, mine: SpecItem[], list: Notice[]): Hit[] {
  const name = p.meta.name || 'Project';
  const items = [...projectEquipment(p), ...mine.filter((m) => (m.projects ?? []).includes(name))];
  const hits = new Map<string, Hit>();
  for (const it of items) for (const n of itemNotices(it, list)) {
    const h = hits.get(n.id) ?? { notice: n, items: [] }; const label = `${it.brand} ${it.model}`.replace(/^(Project device|Materials list) /, '');
    if (!h.items.includes(label)) h.items.push(label); hits.set(n.id, h);
  }
  return [...hits.values()].sort((a, b) => b.notice.date.localeCompare(a.notice.date));
}

export function NoticeView({ n, items }: { n: Notice; items?: string[] }) {
  return (
    <div className="notice">
      <div><b>{n.kind === 'Recall' ? '⚠ Recall' : n.kind === 'Service bulletin' ? '🛠 Service bulletin' : '⚠ Safety notice'}: {n.title}</b> <span className="small muted">· {n.firm} · {n.date}{n.loose ? ' · no model numbers in the notice: check the product name' : ''}</span></div>
      {items && items.length > 0 && <div className="small">In this project: {items.join(', ')}</div>}
      {n.modelList.length > 0 && <div className="small"><b>Models:</b> {n.modelList.join(', ')}</div>}
      {n.ranges && <div className="small"><b>Affected units:</b> {n.ranges}</div>}
      {n.hazard && <div className="small"><b>Problem:</b> {n.hazard}</div>}
      {n.remedy && <div className="small"><b>Remedy:</b> {n.remedy}</div>}
      {n.note && <div className="small"><b>Notes:</b> {n.note}</div>}
      <div className="small muted">{n.source}{n.contact ? ` · ${n.contact}` : ''}{n.url && <> · <a href={n.url} target="_blank" rel="noreferrer">Official notice ↗</a></>}</div>
    </div>
  );
}

const ackKey = (pid: string) => `notices.ack.${pid}`;
/** Banner shown on every page of a project while a matching notice has not been marked as checked. */
export function ProjectNoticeBanner() {
  const { project, lib } = useStore();
  const list = useNotices();
  const [mine, setMine] = useState<SpecItem[]>([]);
  const [ack, setAck] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { const l = () => loadMyItems().then(setMine).catch(() => undefined); l(); window.addEventListener(SPECLIB_EVENT, l); return () => window.removeEventListener(SPECLIB_EVENT, l); }, []);
  useEffect(() => { kvGet<string[]>(ackKey(lib.projectId)).then((a) => setAck(a ?? [])).catch(() => setAck([])); setOpen(false); }, [lib.projectId]);
  const hits = useMemo(() => projectHits(project, mine, list), [project, mine, list]);
  const fresh = hits.filter((h) => !ack.includes(h.notice.id));
  if (!fresh.length) return null;
  const mark = async (ids: string[]) => { const n = [...new Set([...ack, ...ids])]; setAck(n); await kvSet(ackKey(lib.projectId), n); };
  const recalls = fresh.filter((h) => h.notice.kind === 'Recall').length;
  return (
    <div className="warnbox notice-banner no-print" role="alert">
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <b>⚠ {recalls ? `${recalls} recall${recalls > 1 ? 's' : ''}` : ''}{recalls && fresh.length > recalls ? ' and ' : ''}{fresh.length > recalls ? `${fresh.length - recalls} bulletin${fresh.length - recalls > 1 ? 's' : ''}` : ''} may affect equipment in this project.</b>
        <span className="small">Check the model and date code on the label.</span>
        <button onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && <div className="stack" style={{ marginTop: 8 }}>
        {fresh.map((h) => <div key={h.notice.id}><NoticeView n={h.notice} items={h.items} />
          <button className="small" onClick={() => mark([h.notice.id])}>✓ Checked for this project</button></div>)}
        <p className="small muted">Built-in recalls are official CPSC notices (read {RECALLS_CHECKED}); new ones download automatically about once a week when online. Marking one as checked hides it on this project only.</p>
      </div>}
    </div>
  );
}

/** Notices for one library item, and a form to add a manufacturer service bulletin for it. */
export function ItemNotices({ item }: { item: SpecItem }) {
  const list = useNotices();
  const hits = useMemo(() => itemNotices(item, list), [item, list]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', date: new Date().toISOString().slice(0, 10), models: item.model, url: '', note: '' });
  if (item.brand === 'Standard') return null;
  const save = async () => {
    const models = f.models.split(',').map((s) => s.trim()).filter(Boolean);
    if (!f.title.trim() || !models.length) return;
    const brandWord = item.brand.split(/[\s(/]+/)[0];
    const n: Notice = { id: `mine-${Date.now().toString(36)}`, kind: 'Service bulletin', source: 'Added by you (manufacturer bulletin)', date: f.date, firm: item.brand, title: f.title.trim(),
      brand: /^(typical|project|materials)/i.test(brandWord) ? '.' : escapeRe(brandWord), models: models.map(escapeRe), modelList: models, hazard: '', remedy: '', url: /^https?:\/\//.test(f.url) ? f.url : undefined, note: f.note.trim() || undefined };
    await saveMine([...(await loadMine()), n]); setAdding(false);
  };
  const remove = async (id: string) => { if (await askDelete('Remove this bulletin from the app?')) await saveMine((await loadMine()).filter((x) => x.id !== id)); };
  return (
    <div className="item-notices">
      <h4>Recalls and service bulletins</h4>
      {hits.length ? hits.map((n) => <div key={n.id}><NoticeView n={n} />{n.id.startsWith('mine-') && <button className="ghost small" onClick={() => remove(n.id)}>Remove</button>}</div>)
        : <p className="small muted">No recall or bulletin on file for this model. Official CPSC recalls are built in and refresh automatically when online.</p>}
      {!adding ? <button className="small" onClick={() => setAdding(true)}>+ Add a service bulletin for this model</button> : (
        <div className="form">
          <label className="field wide"><span>Bulletin number and title</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. TSB-123: replace power supply fuse" /></label>
          <label className="field"><span>Date</span><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="field wide"><span>Model numbers it covers (comma separated)</span><input value={f.models} onChange={(e) => setF({ ...f, models: e.target.value })} /></label>
          <label className="field wide"><span>Link (manufacturer page)</span><input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" /></label>
          <label className="field wide"><span>What it says / what to do</span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <div className="row"><button className="primary" onClick={save}>Save bulletin</button><button onClick={() => setAdding(false)}>Cancel</button></div>
          <p className="small muted">Keep the bulletin PDF with this item: use <b>Attach file</b> under manuals (type “Firmware / software notes” or “Other”). Projects using this model get an alert.</p>
        </div>)}
    </div>
  );
}
