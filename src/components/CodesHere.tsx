import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { CODE_SETS, codesFor, keyCodes, localRule, CodeEntry, CodesHere as Here } from '../compliance/codesets';
import { projectPlace } from '../compliance/place';
import { allCounties } from '../engine/refdata';
import type { StateCode } from '../types';
import { LOCAL_CODES, LOCAL_CHECKED, LocalCodeSet, localCodes } from '../compliance/citycodes';
import { towns, countyAt } from '../engine/refdata';

const STATUS: Record<CodeEntry['status'], [string, string]> = {
  verified: ['✓ state source', 'Read on an official state page on the date checked'],
  secondary: ['confirm', 'From a secondary source or the code book’s referenced standards; confirm with the AHJ'],
  confirm: ['⚠ sources differ', 'Official sources disagree on the date or edition; confirm with the AHJ'],
};
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** Codes a city or county adopted itself, from its own web page. */
export function LocalTable({ l }: { l: LocalCodeSet }) {
  return (
    <div className="local-codes">
      <p className="small"><b>Adopted by {l.name}{l.level === 'city' ? ` (city)` : ''}</b> · <a href={l.src} target="_blank" rel="noreferrer">{host(l.src)}</a> · read {LOCAL_CHECKED}{l.stale && <span className="warn-text"> · page may be out of date</span>}</p>
      <table className="rpt-tbl codes-tbl"><thead><tr><th>Type</th><th>Code in effect</th><th>Effective</th></tr></thead>
        <tbody>{l.codes.map((e, i) => <tr key={i}><td>{e.cat}</td><td>{e.code}</td><td className="nowrap">{e.effective ?? '—'}</td></tr>)}</tbody></table>
      <p className="small muted">{l.note}</p>
    </div>
  );
}

/** The code table for one place. */
export function CodeTable({ h, compact }: { h: Here; compact?: boolean }) {
  const s = h.set;
  const list = compact ? s.current.filter((e) => ['Building', 'Residential', 'Fire', 'Fire alarm', 'Emergency responder radio', 'Electrical', 'Life safety'].includes(e.cat)) : s.current;
  return (
    <div className="codes-here">
      <p className={'small' + (h.local.exempt ? ' warn-text' : '')}><b>Local enforcement:</b> {h.local.text}</p>
      {h.localSet && <LocalTable l={h.localSet} />}
      {h.localSet && <p className="small"><b>State codes ({s.name})</b>{h.localSet.level === 'city' || h.local.exempt ? ' apply where the local list is silent.' : ':'}</p>}
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

const cityCache = new Map<string, { city: string; state: string; county: string; lat: number; lon: number }[]>();
/** Every town in a state with the county it sits in (from the built-in map data). */
export function citiesIn(st: StateCode) {
  let l = cityCache.get(st);
  if (!l) { l = towns().filter((t) => t.state === st).map((t) => ({ city: t.city, state: t.state, county: countyAt(t.lat, t.lon)?.county ?? '', lat: t.lat, lon: t.lon })).sort((a, b) => a.city.localeCompare(b.city)); cityCache.set(st, l); }
  return l;
}

/** Browse cities and towns, with the codes that apply in each. */
export function CityCodes() {
  const { project: p, update } = useStore();
  const [st, setSt] = useState<StateCode>(p.meta.state);
  const [q, setQ] = useState('');
  const [onlyLocal, setOnlyLocal] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const all = useMemo(() => citiesIn(st), [st]);
  const list = all.filter((c) => c.city.toLowerCase().includes(q.toLowerCase().trim()) && (!onlyLocal || localCodes(st, c.county, c.city)?.level === 'city' || localRule(st, c.county, c.city).by === 'city'));
  const shown = list.slice(0, 150);
  return (
    <>
      <div className="row wrap">
        <select value={st} onChange={(e) => setSt(e.target.value as StateCode)} aria-label="State for cities">{(['NC', 'SC', 'GA', 'TN'] as StateCode[]).map((s) => <option key={s} value={s}>{CODE_SETS[s].name}</option>)}</select>
        <input className="lib-search" style={{ flex: 1, minWidth: 160, marginBottom: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Find a city or town" aria-label="Find a city" />
        <label className="check"><input type="checkbox" checked={onlyLocal} onChange={(e) => setOnlyLocal(e.target.checked)} /> Only cities with their own codes</label>
        <span className="small muted">{list.length} places{list.length > shown.length ? ` (first ${shown.length} shown; type to narrow)` : ''}</span>
      </div>
      <div className="county-list">{shown.map((c) => {
        const k = c.city + c.county, h = codesFor(st, c.county, c.city), own = h.localSet?.level === 'city' || h.local.by === 'city';
        const mine = (p.meta.city ?? '').toLowerCase() === c.city.toLowerCase() && p.meta.state === st;
        return (
          <div key={k} className={'county-row' + (mine ? ' mine' : '')}>
            <button className="ghost county-head" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
              <b>{c.city}, {st}</b><span className="small muted">{c.county}</span>{h.localSet?.level === 'city' && <span className="pill">local code list ✓</span>}{own && !h.localSet && <span className="pill warn">own codes (ask the city)</span>}{mine && <span className="pill">this project</span>}</button>
            {open === k && <div className="county-body">
              <CodeTable h={h} />
              {!mine && <button onClick={() => update((d) => { d.meta.state = st; d.meta.county = c.county; d.meta.city = c.city; })}>Use {c.city} for this project</button>}
              <a className="small" style={{ marginLeft: 12 }} href={`https://www.google.com/search?q=${encodeURIComponent(`${c.city} ${st} building codes adopted inspections`)}`} target="_blank" rel="noreferrer">Find the city's codes page ↗</a>
            </div>}
          </div>);
      })}</div>
      <p className="small muted">{LOCAL_CODES.length} cities and counties have their own code list built in, read from their official pages on {LOCAL_CHECKED}. Other places follow the state codes, but many cities enforce them through their own inspections office: check with the city.</p>
    </>
  );
}
