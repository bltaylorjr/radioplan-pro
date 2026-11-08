import React, { useState } from 'react';
import { useStore, downloadText, deviceInfo, safeName } from '../store';
import { Card } from '../components/ui';
import { projectSystems, SYSTEMS } from '../data/systems';
import { toCsv } from '../engine/csv';
import { uid } from '../defaults';
import type { ServiceCall } from '../types';

const blank = (system = ''): ServiceCall => ({ id: uid(), date: new Date().toISOString().slice(0, 10), system, equipment: '', problem: '', cause: '', fix: '', parts: '', hours: 0, tech: deviceInfo().name, status: 'open' });
const MONTHS: [RegExp, number][] = [[/monthly/i, 1], [/quarter/i, 3], [/semiannual/i, 6], [/2 years/i, 24], [/annual/i, 12]];
/** Next due date from the last done date and the frequency text. */
export function nextDue(last: string | undefined, every: string): string | null {
  if (!last) return null; const m = MONTHS.find(([re]) => re.test(every))?.[1]; if (!m) return null;
  const d = new Date(last + 'T00:00:00'); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10);
}
export function serviceCsv(l: ServiceCall[]) { return toCsv([['Date', 'System', 'Equipment', 'Problem', 'Cause', 'Fix', 'Parts', 'Hours', 'Tech', 'Status'], ...l.map((c) => [c.date, SYSTEMS.find((s) => s.id === c.system)?.label ?? c.system, c.equipment, c.problem, c.cause, c.fix, c.parts, c.hours, c.tech, c.status])]); }

export function ServicePage() {
  const { project: p, update, go } = useStore();
  const systems = projectSystems(p.meta);
  const log = p.serviceLog ?? [];
  const done = p.pmDone ?? {};
  const [edit, setEdit] = useState<ServiceCall | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const save = (c: ServiceCall) => { update((d) => { const l = d.serviceLog ?? []; d.serviceLog = l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [c, ...l]; }); setEdit(null); };
  const set = <K extends keyof ServiceCall>(k: K, v: ServiceCall[K]) => setEdit((e) => (e ? { ...e, [k]: v } : e));
  return (
    <div className="grid">
      <Card title="Preventive maintenance schedule" className="wide" tip="Built from the systems on this project. Enter the date each task was last done to see when it is due next.">
        {!systems.some((s) => s.pm.length) ? <p className="muted">Pick the project type and sub-projects on <a href="#systems" onClick={(e) => { e.preventDefault(); go('systems'); }}>Project Systems</a> to build the schedule.</p> :
          <div className="tbl-wrap"><table className="tbl pm-tbl"><thead><tr><th>System</th><th>Task</th><th>How often</th><th>Last done</th><th>Next due</th><th>Reference</th></tr></thead>
            <tbody>{systems.flatMap((s) => s.pm.map((m) => { const key = `${s.id}|${m.task}`, nd = nextDue(done[key], m.every); return (
              <tr key={key}><td>{s.icon} {s.label}</td><td>{m.task}</td><td>{m.every}</td>
                <td><input type="date" value={done[key] ?? ''} aria-label={`Last done: ${m.task}`} onChange={(e) => update((d) => { d.pmDone = { ...(d.pmDone ?? {}), [key]: e.target.value }; })} /></td>
                <td className={nd && nd < today ? 'bad-text' : ''}>{nd ? (nd < today ? `${nd} (overdue)` : nd) : '—'}</td><td className="small">{m.ref}</td></tr>); }))}</tbody></table></div>}
        <p className="small muted">Frequencies are typical; the adopted code edition, the manufacturer and the contract set the real schedule.</p>
      </Card>

      {edit ? <Card title="Service call" className="wide">
        <div className="form">
          <label className="field"><span>Date</span><input type="date" value={edit.date} onChange={(e) => set('date', e.target.value)} /></label>
          <label className="field"><span>System</span><select value={edit.system} onChange={(e) => set('system', e.target.value)}><option value="">—</option>{(systems.length ? systems : SYSTEMS).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label className="field wide"><span>Equipment / location</span><input value={edit.equipment} onChange={(e) => set('equipment', e.target.value)} /></label>
          <label className="field wide"><span>Problem reported</span><textarea rows={2} value={edit.problem} onChange={(e) => set('problem', e.target.value)} /></label>
          <label className="field wide"><span>Cause found</span><textarea rows={2} value={edit.cause} onChange={(e) => set('cause', e.target.value)} /></label>
          <label className="field wide"><span>Repair done</span><textarea rows={2} value={edit.fix} onChange={(e) => set('fix', e.target.value)} /></label>
          <label className="field wide"><span>Parts used</span><input value={edit.parts} onChange={(e) => set('parts', e.target.value)} /></label>
          <label className="field"><span>Hours</span><input type="number" step="0.25" value={edit.hours} onChange={(e) => set('hours', parseFloat(e.target.value) || 0)} /></label>
          <label className="field"><span>Technician</span><input value={edit.tech} onChange={(e) => set('tech', e.target.value)} /></label>
          <label className="field"><span>Status</span><select value={edit.status} onChange={(e) => set('status', e.target.value as ServiceCall['status'])}><option value="open">Open</option><option value="done">Done</option></select></label>
        </div>
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}><button onClick={() => go('troubleshoot')}>Open Troubleshooting Wizard</button><span style={{ flex: 1 }} /><button onClick={() => setEdit(null)}>Cancel</button><button className="primary" onClick={() => save(edit)}>Save service call</button></div>
      </Card> :
      <Card title="Service and repair log" className="wide" actions={<div className="row wrap"><button className="primary" onClick={() => setEdit(blank(systems[0]?.id))}>+ New service call</button><button disabled={!log.length} onClick={() => downloadText(`${safeName(p.meta.name)}-service-log.csv`, serviceCsv(log), 'text/csv')}>Export CSV</button></div>}>
        {!log.length ? <p className="muted">No service calls yet.</p> :
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Date</th><th>System</th><th>Equipment</th><th>Problem</th><th>Fix</th><th>Hours</th><th>Status</th><th /></tr></thead>
            <tbody>{[...log].sort((a, b) => b.date.localeCompare(a.date)).map((c) => <tr key={c.id}><td>{c.date}</td><td>{SYSTEMS.find((s) => s.id === c.system)?.label ?? '—'}</td><td>{c.equipment}</td><td>{c.problem}</td><td>{c.fix}</td><td>{c.hours}</td>
              <td className={c.status === 'open' ? 'warn-text' : 'ok-text'}>{c.status === 'open' ? 'Open' : 'Done'}</td>
              <td><button onClick={() => setEdit(c)}>Edit</button> <button className="danger" onClick={() => { if (confirm('Delete this service call?')) update((d) => { d.serviceLog = (d.serviceLog ?? []).filter((x) => x.id !== c.id); }); }}>Delete</button></td></tr>)}</tbody></table></div>}
        <p className="small muted">{log.filter((c) => c.status === 'open').length} open · {log.reduce((a, c) => a + c.hours, 0)} hours logged.</p>
      </Card>}
    </div>
  );
}
