import React, { useEffect, useMemo, useState } from 'react';
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

/** Trade codes hidden unless ticked: low-voltage work rarely needs them. */
export const OPTIONAL_CATS = ['Plumbing', 'Mechanical', 'Fuel gas'] as const;
const OPT_KEY = 'radioplan.codeExtras', OPT_EVENT = 'radioplan-code-extras';
const readOpt = (): string[] => { try { return JSON.parse(localStorage.getItem(OPT_KEY) || '[]'); } catch { return []; } };
export function useOptionalCats(): [string[], (v: string[]) => void] {
  const [v, setV] = useState<string[]>(readOpt);
  useEffect(() => { const on = () => setV(readOpt()); window.addEventListener(OPT_EVENT, on); return () => window.removeEventListener(OPT_EVENT, on); }, []);
  return [v, (n) => { try { localStorage.setItem(OPT_KEY, JSON.stringify(n)); } catch { /* ignore */ } setV(n); window.dispatchEvent(new Event(OPT_EVENT)); }];
}
/** Check boxes to include plumbing, mechanical and fuel gas codes. */
export function OptionalCodes() {
  const [on, set] = useOptionalCats();
  return <div className="row wrap small"><span className="muted">Also show:</span>{OPTIONAL_CATS.map((c) => <label key={c} className="check"><input type="checkbox" checked={on.includes(c)} onChange={(e) => set(e.target.checked ? [...on, c] : on.filter((x) => x !== c))} /> {c === 'Fuel gas' ? 'Fuel gas' : c} code</label>)}</div>;
}
const visible = (cat: string, on: string[]) => !(OPTIONAL_CATS as readonly string[]).includes(cat) || on.includes(cat);

/** Codes a city or county adopted itself, from its own web page. */
export function LocalTable({ l }: { l: LocalCodeSet }) {
  const [on] = useOptionalCats();
  return (
    <div className="local-codes">
      <p className="small"><b>Adopted by {l.name}{l.level === 'city' ? ` (city)` : ''}</b> · <a href={l.src} target="_blank" rel="noreferrer">{host(l.src)}</a> · read {LOCAL_CHECKED}{l.stale && <span className="warn-text"> · page may be out of date</span>}</p>
      <table className="rpt-tbl codes-tbl"><thead><tr><th>Type</th><th>Code in effect</th><th>Effective</th></tr></thead>
        <tbody>{l.codes.filter((e) => visible(e.cat, on)).map((e, i) => <tr key={i}><td>{e.cat}</td><td>{e.code}</td><td className="nowrap">{e.effective ?? '—'}</td></tr>)}</tbody></table>
      <p className="small muted">{l.note}</p>
    </div>
  );
}

/** The code table for one place. */
export function CodeTable({ h, compact }: { h: Here; compact?: boolean }) {
  const s = h.set; const [on] = useOptionalCats();
  const list = (compact ? s.current.filter((e) => ['Building', 'Residential', 'Fire', 'Fire alarm', 'Emergency responder radio', 'Electrical', 'Life safety'].includes(e.cat)) : s.current).filter((e) => visible(e.cat, on));
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

const cityCache = new Map<string, { city: string; state: string; county: string; lat: number; lon: number }[]>();
/** Every town in a state with the county it sits in (from the built-in map data). */
export function citiesIn(st: StateCode) {
  let l = cityCache.get(st);
  if (!l) { l = towns().filter((t) => t.state === st).map((t) => ({ city: t.city, state: t.state, county: countyAt(t.lat, t.lon)?.county ?? '', lat: t.lat, lon: t.lon })).sort((a, b) => a.city.localeCompare(b.city)); cityCache.set(st, l); }
  return l;
}

/** Codes for any place: pick the state, then the county, then the city. */
export function CodesByPlace() {
  const { project: p, update } = useStore();
  const here = projectPlace(p);
  const [st, setSt] = useState<StateCode>(here.state);
  const [county, setCounty] = useState(here.county ?? '');
  const [city, setCity] = useState(here.city ?? '');
  const counties = useMemo(() => allCounties().filter((c) => c.state === st), [st]);
  const cities = useMemo(() => citiesIn(st).filter((c) => !county || c.county === county), [st, county]);
  const h = codesFor(st, county || undefined, city || undefined);
  const where = [city, county, CODE_SETS[st].name].filter(Boolean).join(', ');
  const mine = here.state === st && (here.county ?? '') === county && (here.city ?? '') === city;
  const ownCity = (c: { city: string; county: string }) => localCodes(st, c.county, c.city)?.level === 'city' || localRule(st, c.county, c.city).by === 'city';
  return (
    <>
      <div className="form">
        <label className="field"><span>State</span><select value={st} onChange={(e) => { setSt(e.target.value as StateCode); setCounty(''); setCity(''); }} aria-label="State">{(['NC', 'SC', 'GA', 'TN', 'VA'] as StateCode[]).map((s) => <option key={s} value={s}>{CODE_SETS[s].name}</option>)}</select></label>
        <label className="field"><span>County</span><select value={county} onChange={(e) => { setCounty(e.target.value); setCity(''); }} aria-label="County"><option value="">— whole state —</option>{counties.map((c) => <option key={c.fips} value={c.county}>{c.county}{localRule(st, c.county).exempt || localCodes(st, c.county)?.level === 'county' ? ' ★' : ''}</option>)}</select></label>
        <label className="field"><span>City or town</span><select value={city} onChange={(e) => { const c = cities.find((x) => x.city === e.target.value); setCity(e.target.value); if (c && !county) setCounty(c.county); }} aria-label="City"><option value="">— none —</option>{cities.map((c) => <option key={c.city + c.county} value={c.city}>{c.city}{county ? '' : ` (${c.county})`}{ownCity(c) ? ' ★' : ''}</option>)}</select></label>
      </div>
      <div className="row wrap"><h4 style={{ margin: 0 }}>📍 {where}</h4>{mine ? <span className="pill">this project</span> : <>
        <button onClick={() => update((d) => { d.meta.state = st; d.meta.county = county; d.meta.city = city || undefined; })} disabled={!county}>Use for this project</button>
        <button className="ghost" onClick={() => { setSt(here.state); setCounty(here.county ?? ''); setCity(here.city ?? ''); }}>Back to the project location</button></>}</div>
      <p className="small muted">★ = has its own code list or does its own inspections.</p>
      <CodeTable h={h} />
      {county && <a className="small" href={`https://www.google.com/search?q=${encodeURIComponent(`${city || county} ${CODE_SETS[st].name} building codes adopted inspections`)}`} target="_blank" rel="noreferrer">Find the local codes page ↗</a>}
    </>
  );
}
