import { JurisdictionInfo } from '../components/JurisdictionInfo';
import React, { useState } from 'react';
import { useStore } from '../store';
import { Card, Stat } from '../components/ui';
import { evaluateCompliance, Finding, severityOrder, Severity } from '../compliance/rules';
import { JURISDICTIONS } from '../compliance/jurisdictions';

export function FindingList({ findings, empty }: { findings: Finding[]; empty?: string }) {
  if (empty) return <p className="muted">{empty}</p>;
  const list = [...findings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  if (!list.length) return <p className="ok-text">✓ No issues found for this section.</p>;
  return (
    <ul className="findings">{list.map((f) => (
      <li key={f.id} className={`finding ${f.severity}`}>
        <div className="f-head"><span className={`sev ${f.severity}`}>{f.severity === 'violation' ? '⛔ Not in compliance' : f.severity === 'warning' ? '⚠ Warning' : 'ℹ Info'}</span>
          <span className="cite">{f.code} §{f.section}</span>
          {f.verified === 'primary' ? <span className="vchk ok" title="Section text checked in the official source">✓ checked</span> : f.verified === 'secondary' ? <span className="vchk" title="Section number from the published code book; not re-checked against the paywalled text">confirm in code book</span> : null}</div>
        <div className="f-title">{f.title}</div>
        <div className="f-detail">{f.detail}</div>
        {f.fix && <div className="f-fix"><b>Fix:</b> {f.fix}</div>}
      </li>))}</ul>
  );
}

export function CompliancePage() {
  const { project: p, rt } = useStore();
  const all = evaluateCompliance({ project: p, profile: rt.profile });
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  const areas = [...new Set(all.map((f) => f.area))];
  const count = (s: Severity) => all.filter((f) => f.severity === s).length;
  const j = JURISDICTIONS[p.meta.state];
  return (
    <div className="stack">
      <Card title={`Compliance summary — ${j.name}`}>
        <div className="stats">
          <Stat label="Not in compliance" value={count('violation')} tone={count('violation') ? 'bad' : 'ok'} />
          <Stat label="Warnings" value={count('warning')} tone={count('warning') ? 'warn' : 'ok'} />
          <Stat label="Info" value={count('info')} />
        </div>
        <div className="row">Show: {(['all', 'violation', 'warning', 'info'] as const).map((s) => <button key={s} className={filter === s ? 'primary' : ''} onClick={() => setFilter(s)}>{s}</button>)}</div>
        <JurisdictionInfo j={j} compact />
        <p className="small muted">NEC citations are stamped with the edition {j.name} has adopted. Each finding shows whether its section was <b>checked against the official text</b> (free eCFR for FAA/FCC rules) or is <b>from the code book, not re-checked</b> (NEC, NFPA 72, NFPA 1225 and IFC are paywalled and could not be read here). Findings are a planning aid and must be verified by a licensed professional and the AHJ.</p>
      </Card>
      {areas.map((a) => {
        const f = all.filter((x) => x.area === a && (filter === 'all' || x.severity === filter));
        return f.length ? <Card key={a} title={a}><FindingList findings={f} /></Card> : null;
      })}
    </div>
  );
}
