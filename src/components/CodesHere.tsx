import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { CODE_SETS, codesFor, keyCodes, localRule, CodeEntry, CodesHere as Here } from '../compliance/codesets';
import { projectPlace } from '../compliance/place';
import { allCounties } from '../engine/refdata';
import type { StateCode } from '../types';

const STATUS: Record<CodeEntry['status'], [string, string]> = {
  verified: ['✓ state source', 'Read on an official state page on the date checked'],
  secondary: ['confirm', 'From a secondary source or the code book’s referenced standards; confirm with the AHJ'],
  confirm: ['⚠ sources differ', 'Official sources disagree on the date or edition; confirm with the AHJ'],
};
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** The code table for one place. */
export function CodeTable({ h, compact }: { h: Here; compact?: boolean }) {
  const s = h.set;
  const list = compact ? s.current.filter((e) => ['Building', 'Residential', 'Fire', 'Fire alarm', 'Emergency responder radio', 'Electrical', 'Life safety'].includes(e.cat)) : s.current;
  return (
    <div className="codes-here">
      <p className={'small' + (h.local.exempt ? ' warn-text' : '')}><b>Local enforcement:</b> {h.local.text}</p>
      <table className="rpt-tbl codes-tbl"><thead><tr><th>Type</th><th>Code in effect</th><th>Effective</th><th>Status</th></tr></thead>
        <tbody>{list.map((e, i) => (
          <tr key={i}><td>{e.cat}{e.permissive ? <span className="small muted"> (local option)</span> : null}</td>
            <td>{e.code}{!compact && e.note ? <div className="small muted">{e.note}</div> : null}</td>
            <td className="nowrap">{e.effective ?? '—'}</td>
            <td title={STATUS[e.status][1]} className={'small ' + (e.status === 'verified' ? 'ok-text' : 'warn-text')}>{e.src && !compact ? <a href={e.src} target="_blank" rel="noreferrer">{STATUS[e.status][0]}</a> : STATUS[e.status][0]}</td></tr>))}</tbody></table>
      {s.upcoming.map((u) => <p key={u.title} className="small"><b>Coming next: {u.title}</b>, effective {u.effective}. {u.codes.join('; ')}. {!compact && u.note}</p>)}
      {h.local.exempt && <p className="small warn-text">This exempt jurisdiction may enforce different editions or local amendments than the state list above. Get its adopted code list before design.</p>}
      {!compact && <>
        <ul className="small">{s.enforcement.map((t) => <li key={t}>{t}</li>)}<li><b>Local amendments:</b> {s.localAmendments}</li><li><b>Who to call:</b> {s.ahj}</li></ul>
        <p className="small">Sources: {s.sources.map((u, i) => <span key={u}>{i ? ' · ' : ''}<a href={u} target="_blank" rel="noreferrer">{host(u)}</a></span>)}</p>
      </>}
      <p className="small muted">Checked {h.checked}. Codes change; this is a planning aid. A licensed PE and the AHJ must confirm the adopted editions and local amendments before design or permitting.</p>
    </div>
  );
}

/** Codes for the project's address, picked automatically. */
export function CodesHere({ compact }: { compact?: boolean }) {
  const { project: p } = useStore();
  const pl = projectPlace(p);
  const h = codesFor(pl.state, pl.county, pl.city);
  const where = [pl.city, pl.county, CODE_SETS[pl.state].name].filter(Boolean).join(', ');
  return (
    <div className="jur">
      <h4>Codes for {where}</h4>
      <p className="small muted">Picked from the {pl.from}. {CODE_SETS[pl.state].summary}</p>
      <CodeTable h={h} compact={compact} />
    </div>
  );
}

/** Browse every county in the four states and set one as the project's. */
export function CountyCodes() {
  const { project: p, update } = useStore();
  const all = useMemo(allCounties, []);
  const [st, setSt] = useState<StateCode | 'all'>(p.meta.state);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = all.filter((c) => (st === 'all' || c.state === st) && c.county.toLowerCase().includes(q.toLowerCase().trim()));
  return (
    <>
      <div className="row wrap">
        <select value={st} onChange={(e) => setSt(e.target.value as StateCode | 'all')} aria-label="State"><option value="all">All 4 states</option>{(['NC', 'SC', 'GA', 'TN'] as StateCode[]).map((s) => <option key={s} value={s}>{CODE_SETS[s].name}</option>)}</select>
        <input className="lib-search" style={{ flex: 1, minWidth: 160, marginBottom: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Find a county" aria-label="Find a county" />
        <span className="small muted">{list.length} counties</span>
      </div>
      <div className="county-list">{list.map((c) => {
        const k = c.fips, lr = localRule(c.state as StateCode, c.county); const mine = p.meta.county === c.county && p.meta.state === c.state;
        return (
          <div key={k} className={'county-row' + (mine ? ' mine' : '')}>
            <button className="ghost county-head" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
              <b>{c.county}, {c.state}</b>{lr.exempt && <span className="pill warn">exempt (own codes)</span>}{mine && <span className="pill">this project</span>}
              <span className="small muted county-key">{keyCodes(c.state as StateCode)}</span></button>
            {open === k && <div className="county-body">
              <CodeTable h={codesFor(c.state as StateCode, c.county)} />
              {!mine && <button onClick={() => update((d) => { d.meta.state = c.state as StateCode; d.meta.county = c.county; d.meta.city = undefined; })}>Use {c.county} for this project</button>}
              <a className="small" style={{ marginLeft: 12 }} href={`https://www.google.com/search?q=${encodeURIComponent(`${c.county} ${CODE_SETS[c.state as StateCode].name} building inspections department`)}`} target="_blank" rel="noreferrer">Find the local inspections office ↗</a>
            </div>}
          </div>);
      })}</div>
    </>
  );
}
