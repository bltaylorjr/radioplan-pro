import React, { useState } from 'react';
import { useStore, downloadText, deviceInfo, safeName } from '../store';
import { Card } from '../components/ui';
import { projectSystems, SYSTEMS } from '../data/systems';
import { toCsv } from '../engine/csv';
import { uid } from '../defaults';
import type { ServiceCall } from '../types';
import { ManualShelf } from '../components/Manuals';

const blank = (system = ''): ServiceCall => ({ id: uid(), date: new Date().toISOString().slice(0, 10), system, equipment: '', problem: '', cause: '', fix: '', parts: '', hours: 0, tech: deviceInfo().name, status: 'open' });
const MONTHS: [RegExp, number][] = [[/monthly/i, 1], [/quarter/i, 3], [/semiannual/i, 6], [/2 years/i, 24], [/annual/i, 12]];
/** Next due date from the last done date and the frequency text. */
export function nextDue(last: string | undefined, every: string): string | null {
  if (!last) return null; const m = MONTHS.find(([re]) => re.test(every))?.[1]; if (!m) return null;
  const d = new Date(last + 'T00:00:00'); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10);
}
export function serviceCsv(l: ServiceCall[]) { return toCsv([['Date', 'System', 'Equipment', 'Problem', 'Cause', 'Fix', 'Parts', 'Hours', 'Tech', 'Status'], ...l.map((c) => [c.date, SYSTEMS.find((s) => s.id === c.system)?.label ?? c.system, c.equipment, c.problem, c.cause, c.fix, c.parts, c.hours, c.tech, c.status])]); }

/** Service & maintenance resources for every system: what to maintain and how often, common faults and
 *  fixes, test steps, standards, manuals and the tools in the app. Reference only, no record keeping. */
export function ServicePage() {
  const { project: p, go } = useStore();
  const mine = projectSystems(p.meta);
  const [sid, setSid] = useState<string>(mine[0]?.id ?? '');
  const s = SYSTEMS.find((x) => x.id === sid);
  const others = SYSTEMS.filter((x) => !mine.some((m) => m.id === x.id));
  const link = (pg: string, label: string) => <a key={pg} className="button" href={`#${pg}`} onClick={(e) => { e.preventDefault(); go(pg); }}>{label}</a>;
  const PAGE: Record<string, string> = { install: '📐 Installation guide', troubleshoot: '🛠 Troubleshooting wizard', testing: '✅ Final testing', alarm: '🔔 Fire alarm & batteries', erces: '📡 ERCES / BDA', compliance: '📘 Code compliance', materials: '📦 Materials', calculators: '🧮 Calculators', indoor: '📶 Indoor coverage & DAS', solar: '☀️ Solar & DC power', grounding: '⚡ Grounding' };
  return (
    <div className="grid">
      <Card title="Service & maintenance resources" className="wide" tip="Maintenance intervals, common faults and fixes, test steps, standards and manuals for each system. Reference only; nothing here is saved to the project.">
        <label className="field" style={{ maxWidth: 520 }}><span>System</span>
          <select value={sid} onChange={(e) => setSid(e.target.value)} aria-label="System">
            {mine.length > 0 && <optgroup label="On this project">{mine.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.label}</option>)}</optgroup>}
            <optgroup label={mine.length ? 'Other systems' : 'All systems'}>{others.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.label}</option>)}</optgroup>
          </select></label>
        {!s ? <p className="muted">Choose a system to see its maintenance schedule, common faults and fixes, tests, standards and manuals.</p> : <>
          <p className="muted">{s.summary}</p>
          <details open><summary>Preventive maintenance: what and how often ({s.pm.length})</summary>
            {s.pm.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Task</th><th>How often</th><th>Reference</th></tr></thead>
              <tbody>{s.pm.map((m) => <tr key={m.task}><td>{m.task}</td><td>{m.every}</td><td className="small">{m.ref}</td></tr>)}</tbody></table></div> : <p className="small muted">No fixed schedule; follow the manufacturer and the contract.</p>}
            <p className="small muted">Typical intervals. The adopted code edition, the manufacturer and the service contract set the real schedule.</p>
          </details>
          <details open><summary>Common faults and fixes ({s.repair.length})</summary><ul>{s.repair.map((t) => <li key={t}>{t}</li>)}</ul>
            {link('troubleshoot', '🛠 Step-by-step troubleshooting wizard')}</details>
          <details><summary>Test and inspection steps ({s.test.length})</summary><ul>{s.test.map((t) => <li key={t}>{t}</li>)}</ul></details>
          <details><summary>Installation reminders ({s.install.length})</summary><ul>{s.install.map((t) => <li key={t}>{t}</li>)}</ul></details>
          <details><summary>Standards and codes ({s.standards.length})</summary><ul>{s.standards.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="small muted">Editions vary by jurisdiction; a licensed professional and the AHJ must verify which apply.</p></details>
          <h4>Tools in the app</h4>
          <div className="row wrap">{[...new Set([...s.pages, 'calculators'])].filter((pg) => PAGE[pg]).map((pg) => link(pg, PAGE[pg]))}{link('library', '📚 Equipment specs and manuals')}</div>
          <h4>Find online</h4>
          <div className="row wrap">
            <a className="button" href={`https://www.google.com/search?q=${encodeURIComponent(`${s.label} service manual pdf`)}`} target="_blank" rel="noreferrer">🔎 Service manuals</a>
            <a className="button" href={`https://www.google.com/search?q=${encodeURIComponent(`${s.label} troubleshooting guide`)}`} target="_blank" rel="noreferrer">🔎 Troubleshooting guides</a>
            <a className="button" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${s.label} maintenance troubleshooting`)}`} target="_blank" rel="noreferrer">▶ How-to videos</a>
          </div>
        </>}
      </Card>
      <Card title="Service manuals and documents" className="wide" tip="Panel programming guides, service bulletins and procedures you keep on this device. They open with no internet.">
        <ManualShelf owner={s ? `service:${s.id}` : 'general'} title={s ? `${s.label}: my manuals` : 'My manuals'} searchFor={s ? `${s.label}` : undefined} />
        <p className="small muted">Manuals for one model are kept with that item in the <a href="#library" onClick={(e) => { e.preventDefault(); go('library'); }}>Specifications Library</a>.</p>
      </Card>
    </div>
  );
}
