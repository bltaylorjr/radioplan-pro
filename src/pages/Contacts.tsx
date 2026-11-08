import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { CODE_SETS } from '../compliance/codesets';
import { projectPlace } from '../compliance/place';
import { allCounties } from '../engine/refdata';
import { citiesIn } from '../components/CodesHere';
import { kvGet, kvSet } from '../engine/projectdb';
import { uid } from '../defaults';
import { CONTACTS, RESOURCES, CONTACT_KINDS, RESOURCE_KINDS, Contact, Resource, Level, atPlace, lookupUrl, mergeMine } from '../data/contacts';
import type { StateCode } from '../types';

const STATES: StateCode[] = ['NC', 'SC', 'GA', 'TN'];
type Mine<T> = T & { replaces?: string };
interface Store<T> { mine: Mine<T>[]; hidden: string[] }
const KEYS = { contacts: 'contacts.v1', resources: 'resources.v1' } as const;

function useSaved<T>(key: string) {
  const [s, setS] = useState<Store<T>>({ mine: [], hidden: [] });
  useEffect(() => { kvGet<Store<T>>(key).then((v) => v && setS({ mine: v.mine ?? [], hidden: v.hidden ?? [] })); }, [key]);
  const save = (n: Store<T>) => { setS(n); kvSet(key, n).catch(() => { /* kept in memory */ }); };
  return [s, save] as const;
}
const levelOf = (county: string, city: string): Level => (city ? 'city' : county ? 'county' : 'state');
const tel = (p: string) => 'tel:' + p.replace(/[^0-9+]/g, '');

export function ContactsPage() {
  const { project: p } = useStore();
  const here = projectPlace(p);
  const [st, setSt] = useState<StateCode | 'mine'>(here.state);
  const [county, setCounty] = useState(here.county ?? '');
  const [city, setCity] = useState(here.city ?? '');
  const [tab, setTab] = useState<'contacts' | 'resources'>('contacts');
  const [cs, saveC] = useSaved<Contact>(KEYS.contacts);
  const [rs, saveR] = useSaved<Resource>(KEYS.resources);
  const [edit, setEdit] = useState<{ type: 'contact'; v: Mine<Contact> } | { type: 'resource'; v: Mine<Resource> } | null>(null);
  const state = st === 'mine' ? here.state : st;
  const counties = useMemo(() => allCounties().filter((c) => c.state === state), [state]);
  const cities = useMemo(() => citiesIn(state).filter((c) => !county || c.county === county), [state, county]);
  const contacts = mergeMine(CONTACTS, cs.mine, cs.hidden), resources = mergeMine(RESOURCES, rs.mine, rs.hidden);
  const shownC = st === 'mine' ? contacts.filter((c) => c.mine) : atPlace(contacts, state, county || undefined, city || undefined);
  const shownR = st === 'mine' ? resources.filter((r) => r.mine) : atPlace(resources, state, county || undefined, city || undefined);
  const where = st === 'mine' ? 'Added by me' : [city, county, CODE_SETS[state].name].filter(Boolean).join(', ');

  const newContact = (): Mine<Contact> => ({ id: '', level: levelOf(county, city), state, county: county || undefined, city: city || undefined, office: '', kind: 'Building inspections', address: '', phone: '', email: '', url: '', note: '' });
  const newResource = (): Mine<Resource> => ({ id: '', level: levelOf(county, city), state, county: county || undefined, city: city || undefined, title: '', kind: 'Adopted codes', url: '', note: '' });
  const remove = (type: 'contact' | 'resource', x: { id: string; mine?: boolean }) => {
    if (!confirm('Remove this entry?')) return;
    if (type === 'contact') saveC(x.mine ? { ...cs, mine: cs.mine.filter((m) => m.id !== x.id) } : { ...cs, hidden: [...cs.hidden, x.id] });
    else saveR(x.mine ? { ...rs, mine: rs.mine.filter((m) => m.id !== x.id) } : { ...rs, hidden: [...rs.hidden, x.id] });
  };
  const saveEdit = () => {
    if (!edit) return;
    const v = { ...edit.v, id: edit.v.id && edit.v.mine ? edit.v.id : uid(), replaces: edit.v.mine ? edit.v.replaces : edit.v.id || undefined, mine: true, checked: undefined };
    if (edit.type === 'contact') saveC({ ...cs, mine: [...cs.mine.filter((m) => m.id !== edit.v.id), v as Mine<Contact>] });
    else saveR({ ...rs, mine: [...rs.mine.filter((m) => m.id !== edit.v.id), v as Mine<Resource>] });
    setEdit(null);
  };
  const restore = () => { if (confirm('Show the built-in entries you removed again?')) { saveC({ ...cs, hidden: [] }); saveR({ ...rs, hidden: [] }); } };
  const hasLocal = (lvl: Level) => shownC.some((c) => c.level === lvl);

  return (
    <div className="stack">
      <Card title="Pick a place" tip="Choose the state, then the county, then the city. Contacts and web resources for that place show below. Pick “My contacts” to see only the ones you added.">
        <div className="form">
          <label className="field"><span>State</span>
            <select value={st} onChange={(e) => { setSt(e.target.value as StateCode | 'mine'); setCounty(''); setCity(''); }} aria-label="State">
              {STATES.map((s) => <option key={s} value={s}>{CODE_SETS[s].name}</option>)}
              <option value="mine">★ My contacts and resources (added by me)</option>
            </select></label>
          {st !== 'mine' && <label className="field"><span>County</span>
            <select value={county} onChange={(e) => { setCounty(e.target.value); setCity(''); }} aria-label="County"><option value="">— all of {CODE_SETS[state].name} —</option>{counties.map((c) => <option key={c.fips} value={c.county}>{c.county}</option>)}</select></label>}
          {st !== 'mine' && <label className="field"><span>City or town</span>
            <select value={city} onChange={(e) => { const c = cities.find((x) => x.city === e.target.value); setCity(e.target.value); if (c && !county) setCounty(c.county); }} aria-label="City"><option value="">— none (county or state) —</option>{cities.map((c) => <option key={c.city + c.county} value={c.city}>{c.city}{county ? '' : ` (${c.county})`}</option>)}</select></label>}
        </div>
        <div className="row wrap"><h3 style={{ margin: 0 }}>📍 {where}</h3>
          {st !== 'mine' && (here.state !== state || here.county !== (county || undefined) || (here.city ?? '') !== city) && <button className="ghost" onClick={() => { setSt(here.state); setCounty(here.county ?? ''); setCity(here.city ?? ''); }}>Use the project location</button>}
        </div>
        <div className="row" style={{ marginTop: 8 }} role="tablist">
          <button role="tab" aria-selected={tab === 'contacts'} className={tab === 'contacts' ? 'primary' : ''} onClick={() => setTab('contacts')}>☎ Contacts ({shownC.length})</button>
          <button role="tab" aria-selected={tab === 'resources'} className={tab === 'resources' ? 'primary' : ''} onClick={() => setTab('resources')}>🌐 Web resources ({shownR.length})</button>
        </div>
      </Card>

      {edit && <Card title={edit.v.id ? 'Edit' : edit.type === 'contact' ? 'Add a contact' : 'Add a web resource'}>
        <div className="form">
          {edit.type === 'contact' ? <>
            <label className="field wide"><span>Office or person</span><input value={edit.v.office} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, office: e.target.value } })} aria-label="Office or person" /></label>
            <label className="field"><span>Type</span><select value={edit.v.kind} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, kind: e.target.value } })}>{CONTACT_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
            <label className="field"><span>Phone</span><input type="tel" value={edit.v.phone ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, phone: e.target.value } })} aria-label="Phone" /></label>
            <label className="field"><span>Email</span><input type="email" value={edit.v.email ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, email: e.target.value } })} /></label>
            <label className="field wide"><span>Address</span><input value={edit.v.address ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, address: e.target.value } })} /></label>
            <label className="field wide"><span>Website</span><input type="url" value={edit.v.url ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, url: e.target.value } })} placeholder="https://" /></label>
          </> : <>
            <label className="field wide"><span>Title</span><input value={edit.v.title} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, title: e.target.value } })} aria-label="Title" /></label>
            <label className="field"><span>Type</span><select value={edit.v.kind} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, kind: e.target.value } })}>{RESOURCE_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
            <label className="field wide"><span>Web address</span><input type="url" value={edit.v.url} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, url: e.target.value } })} placeholder="https://" aria-label="Web address" /></label>
          </>}
          <label className="field"><span>Applies to</span><select value={edit.v.level} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, level: e.target.value as Level } } as typeof edit)}>
            <option value="state">{CODE_SETS[edit.v.state ?? state].name} (state)</option>{edit.v.county && <option value="county">{edit.v.county}</option>}{edit.v.city && <option value="city">{edit.v.city}</option>}</select></label>
          <label className="field wide"><span>Notes</span><textarea rows={2} value={edit.v.note ?? ''} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, note: e.target.value } } as typeof edit)} /></label>
        </div>
        <div className="row"><button className="primary" disabled={edit.type === 'contact' ? !edit.v.office.trim() : !edit.v.title.trim() || !edit.v.url.trim()} onClick={saveEdit}>Save</button><button onClick={() => setEdit(null)}>Cancel</button></div>
        {!edit.v.mine && edit.v.id && <p className="small muted">Your edited copy replaces the built-in entry on this device.</p>}
      </Card>}

      {tab === 'contacts' ? <Card title={`Contacts: ${where}`} actions={<button className="primary" onClick={() => setEdit({ type: 'contact', v: newContact() })}>+ Add contact</button>}>
        {st !== 'mine' && county && !hasLocal(city ? 'city' : 'county') && <p className="note">No verified {city ? 'city' : 'county'} office is built in for {city || county}. <a href={lookupUrl('building inspections department phone', state, county, city || undefined)} target="_blank" rel="noreferrer">Look it up ↗</a>, then tap <b>+ Add contact</b> to keep it here.</p>}
        {!shownC.length ? <p className="muted">No contacts here yet.</p> : <div className="contact-list">{(['city', 'county', 'state'] as Level[]).map((lvl) => {
          const l = shownC.filter((c) => c.level === lvl); if (!l.length) return null;
          return <div key={lvl}><h4>{lvl === 'state' ? `State offices` : lvl === 'county' ? 'County offices' : 'City offices'}</h4>{l.map((c) => (
            <div key={c.id} className="contact">
              <div><b>{c.office}</b> <span className="pill">{c.kind}</span>{c.mine ? <span className="pill">added by me</span> : c.checked ? <span className="small ok-text"> ✓ official page, {c.checked}</span> : null}</div>
              {c.address && <div>📍 <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer">{c.address}</a></div>}
              <div className="row wrap">{c.phone && <a className="button" href={tel(c.phone)}>📞 {c.phone}</a>}{c.email && <a className="button" href={`mailto:${c.email}`}>✉ {c.email}</a>}{c.url && <a className="button" href={c.url} target="_blank" rel="noreferrer">🌐 Website</a>}</div>
              {c.note && <div className="small muted">{c.note}</div>}
              <div className="row"><button className="ghost" onClick={() => setEdit({ type: 'contact', v: { ...c } })}>Edit</button><button className="ghost" onClick={() => remove('contact', c)}>Remove</button></div>
            </div>))}</div>;
        })}</div>}
      </Card> : <Card title={`Web resources: ${where}`} actions={<button className="primary" onClick={() => setEdit({ type: 'resource', v: newResource() })}>+ Add web resource</button>}>
        {!shownR.length ? <p className="muted">No web resources here yet.</p> : <table className="tbl"><thead><tr><th>Resource</th><th>Type</th><th>For</th><th></th></tr></thead>
          <tbody>{shownR.map((r) => <tr key={r.id}><td><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>{r.mine && <span className="pill">added by me</span>}{r.note && <div className="small muted">{r.note}</div>}</td><td>{r.kind}</td><td className="small">{r.level === 'national' ? 'All states' : r.level === 'state' ? r.state : r.level === 'county' ? r.county : r.city}</td>
            <td className="nowrap"><button className="ghost" onClick={() => setEdit({ type: 'resource', v: { ...r } })}>Edit</button><button className="ghost" onClick={() => remove('resource', r)}>Remove</button></td></tr>)}</tbody></table>}
        {st !== 'mine' && <p className="small"><a href={lookupUrl('building codes permits inspections', state, county || undefined, city || undefined)} target="_blank" rel="noreferrer">Search the web for more ↗</a></p>}
      </Card>}
      <p className="small muted">Built-in phone numbers and addresses were copied from each office’s official web page on the date shown; offices move and numbers change, so confirm before you rely on one. Your own entries stay on this device and are kept when the app updates. {(cs.hidden.length + rs.hidden.length) > 0 && <button className="ghost" onClick={restore}>Show removed built-in entries ({cs.hidden.length + rs.hidden.length})</button>}</p>
    </div>
  );
}
