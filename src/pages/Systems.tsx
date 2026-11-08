import React, { useState } from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { projectSystems, LvSystem } from '../data/systems';
import { lvCalc } from '../data/lvcalcs';
import { ProjectTypePicker, LvCalcCard } from '../components/SystemsUI';
import { WORKFLOW_LABELS } from '../data/pageLabels';

const TABS = [['plan', '1 · Plan'], ['install', '2 · Install'], ['test', '3 · Test & troubleshoot'], ['repair', '4 · Repair & maintain'], ['tools', 'Tools & reference']] as const;
type Tab = typeof TABS[number][0];

function SystemCard({ s }: { s: LvSystem }) {
  const { go } = useStore();
  const [tab, setTab] = useState<Tab>('plan');
  const link = (pg: string) => <button key={pg} onClick={() => go(pg)}>{WORKFLOW_LABELS[pg] ?? pg} →</button>;
  const list = (items: string[]) => <ol className="sys-list">{items.map((t) => <li key={t}>{t}</li>)}</ol>;
  return (
    <Card title={`${s.icon} ${s.label}`} className="wide">
      <p className="muted">{s.summary}</p>
      <div className="sys-tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={'chip-btn' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'plan' && <>{list(s.plan)}<div className="row wrap">{link('compliance')}{s.pages.filter((x) => !['install', 'troubleshoot', 'testing', 'service', 'compliance'].includes(x)).map(link)}</div></>}
      {tab === 'install' && <>{list(s.install)}<div className="row wrap">{link('install')}{link('materials')}</div></>}
      {tab === 'test' && <>{list(s.test)}<div className="row wrap">{link('testing')}{link('troubleshoot')}</div></>}
      {tab === 'repair' && <>{list(s.repair)}
        {s.pm.length > 0 && <table className="tbl"><thead><tr><th>Maintenance task</th><th>How often</th><th>Reference</th></tr></thead><tbody>{s.pm.map((m) => <tr key={m.task}><td>{m.task}</td><td>{m.every}</td><td className="small">{m.ref}</td></tr>)}</tbody></table>}
        <div className="row wrap">{link('service')}{link('troubleshoot')}</div></>}
      {tab === 'tools' && <>
        <h4>Standards and codes</h4><ul className="small">{s.standards.map((t) => <li key={t}>{t}</li>)}</ul>
        <p className="small muted">Editions depend on what the state and city adopted; see Code Compliance for this address. A licensed PE and the AHJ must confirm.</p>
        {s.libCats.length > 0 && <p><button onClick={() => go('library')}>Specifications Library ({s.libCats.join(', ')}) →</button></p>}
        <div className="calc-grid">{s.calcs.map((id) => { const c = lvCalc(id); return c ? <LvCalcCard key={id} c={c} /> : null; })}</div>
      </>}
    </Card>
  );
}

export function SystemsPage() {
  const { project: p } = useStore();
  const systems = projectSystems(p.meta);
  return (
    <div className="grid">
      <Card title="Project type and sub-projects" className="wide" tip="Pick the main system for this job, then tick any other systems on the same job. Each one gets its own planning, installation, testing, troubleshooting, repair and maintenance toolkit below.">
        <ProjectTypePicker />
      </Card>
      {!systems.length && <Card title="Nothing picked yet" className="wide"><p className="muted">Pick a project type above to see its toolkit.</p></Card>}
      {systems.map((s) => <SystemCard key={s.id} s={s} />)}
    </div>
  );
}
