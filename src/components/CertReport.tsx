import React from 'react';
import { useStore } from '../store';
import { overall, type CertItem, type CertRecord } from '../engine/certification';
import { uid } from '../defaults';
import { askDelete } from './askConfirm';

const mark = (p: boolean | null) => (p === true ? 'PASS' : p === false ? 'FAIL' : '—');

/** One certification test report: project, location, standard, test equipment with calibration, results, overall verdict and signatures. */
export function CertSheet({ r }: { r: CertRecord }) {
  const { project: p } = useStore();
  return (
    <section className="cert-sheet">
      <header><div><small>CERTIFICATION TEST REPORT</small><h3>{r.title}</h3><div className="small">{r.standard}</div></div>
        <div className={'cert-verdict ' + (r.pass === true ? 'ok' : r.pass === false ? 'bad' : '')}>{r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : 'INCOMPLETE'}</div></header>
      <table className="rpt-tbl"><tbody>
        <tr><th>Project</th><td>{p.meta.name}{p.meta.number ? ` (No. ${p.meta.number})` : ''}</td><th>Date</th><td>{new Date(r.at).toLocaleString()}</td></tr>
        <tr><th>Owner</th><td>{p.meta.client || '—'}</td><th>Location tested</th><td>{r.location || [p.meta.siteAddress, p.meta.city, p.meta.state].filter(Boolean).join(', ') || '—'}</td></tr>
        <tr><th>Contractor</th><td>{p.company.name || '—'}{p.company.license ? `, Lic. ${p.company.license}` : ''}</td><th>Technician</th><td>{r.tech || '—'}</td></tr>
      </tbody></table>
      <h4>Test equipment</h4>
      <table className="rpt-tbl"><thead><tr><th>Instrument</th><th>Serial</th><th>Last calibrated</th><th>Grade (benchmark)</th></tr></thead><tbody>{r.equipment.map((e, i) => <tr key={i}><td>{e.name}</td><td>{e.serial || '—'}</td><td>{e.calibrated ? new Date(e.calibrated).toLocaleDateString() : 'not calibrated'}</td><td>{e.grade || '—'}</td></tr>)}</tbody></table>
      <h4>Results</h4>
      <table className="rpt-tbl"><thead><tr><th>Test</th><th>Requirement</th><th>Measured</th><th>Result</th></tr></thead><tbody>{r.items.map((it, i) => <tr key={i} className={it.pass === false ? 'violation' : ''}><td>{it.item}</td><td>{it.requirement}</td><td>{it.measured}</td><td><b>{mark(it.pass)}</b></td></tr>)}</tbody></table>
      {r.notes && <p className="small">{r.notes}</p>}
      <div className="cert-sign"><div>Tested by: ______________________ Date: ________</div><div>Witnessed (AHJ / owner): ______________________ Date: ________</div></div>
      <p className="small muted">Results apply to the conditions and locations tested. The adopted code edition and the Authority Having Jurisdiction decide acceptance.</p>
    </section>
  );
}

/** Saves a set of results as a certification record on the project. */
export function useSaveCert() {
  const { update, project: p } = useStore();
  return (c: Omit<CertRecord, 'id' | 'at' | 'pass' | 'tech'> & { tech?: string }) => {
    const rec: CertRecord = { ...c, id: uid(), at: new Date().toISOString(), pass: overall(c.items as CertItem[]), tech: c.tech ?? p.blueprint?.drawnBy ?? '' };
    update((d) => { d.certs = [rec, ...(d.certs ?? [])]; }); return rec;
  };
}

/** The project's certification records of one kind, newest first, each printable. */
export function CertList({ kind }: { kind: 'rf' | 'audio' }) {
  const { project: p, update } = useStore();
  const list = (p.certs ?? []).filter((c) => c.kind === kind);
  const [open, setOpen] = React.useState<string | null>(null);
  if (!list.length) return <p className="small muted">No certification tests saved yet.</p>;
  return (
    <div>
      <table className="tbl"><thead><tr><th>Date</th><th>Test</th><th>Standard</th><th>Result</th><th /></tr></thead>
        <tbody>{list.map((c) => <tr key={c.id}><td>{new Date(c.at).toLocaleString()}</td><td>{c.title}</td><td className="small">{c.standard}</td><td className={c.pass ? 'ok-text' : c.pass === false ? 'bad-text' : ''}><b>{c.pass === true ? 'PASS' : c.pass === false ? 'FAIL' : 'INCOMPLETE'}</b></td>
          <td className="nowrap"><button onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide' : 'View report'}</button><button className="ghost" onClick={async () => { if (await askDelete(<>Delete the <b>{c.title}</b> record?</>)) update((d) => { d.certs = (d.certs ?? []).filter((x) => x.id !== c.id); }); }}>Delete</button></td></tr>)}</tbody></table>
      {open && <div className="cert-print"><CertSheet r={list.find((c) => c.id === open)!} /><button onClick={() => window.print()}>🖨 Print report</button></div>}
      <p className="small muted">Every saved record is also in Reports → Certification test reports (Closeout package).</p>
    </div>
  );
}
