// Outdoor Warning Sirens (Design: low-voltage systems).
// One page for wide-area outdoor sirens: plan siren locations and coverage on the map, check a spot, the siren
// database (current and legacy models with rated output), the federal, state and local codes for the project
// address with their sources, signals, test procedures, and the test schedule and log for each siren.
// Everything is built in and works offline; the database and codes also refresh online as a content pack.
import React, { useMemo, useState } from 'react';
import L from 'leaflet';
import { useStore } from '../store';
import { uid } from '../defaults';
import { Card, Field, Num, Stat } from '../components/ui';
import { MapView } from '../components/MapView';
import { useUnits } from '../units';
import {
  SIREN_MODELS, SIREN_SOURCES, SIREN_PLANNING, GROUND_LABEL, SIREN_SIGNALS, SIREN_TEST_KINDS, SIREN_PROGRAMS, SIRENS_CHECKED, CPG, type SirenCode,
} from '../data/sirens';
import {
  sirenPlan, unitReach, checkPoint, codesFor, otherLocal, nearPlants, schedule, acceptanceRows, ratedDb, rangeFt, edgeTarget, modelOf, coverageShare,
  type SirenPlan, type SirenUnit, type Ground, type PointCheck,
} from '../engine/sirens';

const ASHEVILLE = { lat: 35.5951, lon: -82.5515 };
const COLORS = ['#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f'];
const today = () => new Date().toISOString().slice(0, 10);

export function SirensPage() {
  const { project: p, update, go } = useStore();
  const u = useUnits();
  const plan = sirenPlan(p);
  const setPlan = (f: (s: SirenPlan) => void) => update((d) => { const s = sirenPlan(d); f(s); d.sirens = s; });
  const site = p.sites[0];
  const here = site && (site.lat || site.lon) ? { lat: site.lat, lon: site.lon } : ASHEVILLE;
  const [mode, setMode] = useState<'place' | 'check'>('place');
  const [pt, setPt] = useState<(PointCheck & { lat: number; lon: number }) | null>(null);
  const [newModel, setNewModel] = useState('fs-508-128');
  const k = SIREN_PLANNING.lossPerDoubling[plan.ground];
  const target = edgeTarget(plan.ambientDb, plan.overDb);
  const plants = nearPlants(here.lat, here.lon, 12);
  // The map centers once when the page opens (on the first siren, else Site A), so taps are not lost to a moving map.
  const [mapCenter] = useState(() => ({ ...(plan.units[0] ?? here), zoom: 13 }));

  const addAt = (lat: number, lon: number) => setPlan((s) => { s.units.push({ id: uid(), name: `Siren ${s.units.length + 1}`, modelId: newModel, lat: +lat.toFixed(6), lon: +lon.toFixed(6), heightFt: 50 }); });
  const onClick = (lat: number, lon: number) => { if (mode === 'place') addAt(lat, lon); else setPt({ ...checkPoint(plan, lat, lon), lat, lon }); };
  const setUnit = (id: string, f: (x: SirenUnit) => void) => setPlan((s) => { const x = s.units.find((y) => y.id === id); if (x) f(x); });

  const share = useMemo(() => {
    if (!plan.units.length) return null;
    const lats = [...plan.units.map((x) => x.lat), here.lat], lons = [...plan.units.map((x) => x.lon), here.lon];
    const pad = 0.01;
    return coverageShare(plan, { south: Math.min(...lats) - pad, north: Math.max(...lats) + pad, west: Math.min(...lons) - pad, east: Math.max(...lons) + pad }, 24);
  }, [JSON.stringify(plan.units), plan.ambientDb, plan.overDb, plan.ground]); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = (g: L.LayerGroup) => {
    plan.units.forEach((x, i) => {
      const r = unitReach(plan, x); const color = COLORS[i % COLORS.length];
      if (r.rangeFt > 0) L.circle([x.lat, x.lon], { radius: r.rangeFt * 0.3048, color, weight: 2, fillOpacity: 0.12 }).bindTooltip(`${x.name}: ${Math.round(target)} dBC edge at ${u.lenFt(r.rangeFt)}`).addTo(g);
      if (r.hazardFt > 0) L.circle([x.lat, x.lon], { radius: r.hazardFt * 0.3048, color: '#b71c1c', weight: 1, dashArray: '4 4', fill: false, interactive: false }).addTo(g);
      L.circleMarker([x.lat, x.lon], { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(`📢 ${x.name}${x.existing ? ' (existing)' : ''}`, { permanent: true, direction: 'right', offset: [8, 0] }).addTo(g);
    });
    if (pt) L.circleMarker([pt.lat, pt.lon], { radius: 6, color: pt.ok ? '#2e7d32' : '#c62828', weight: 3, fillOpacity: 0.3 }).bindTooltip(`${Math.round(pt.total)} dBC here`).addTo(g);
    for (const pl of plants) L.circle([pl.lat, pl.lon], { radius: 16093, color: '#6a1b9a', weight: 1, dashArray: '6 6', fill: false, interactive: false }).addTo(g);
  };

  return <>
    <Card title="Outdoor warning sirens" tour="siren-top" tip="Plan, check, test and service wide-area outdoor sirens. Built in; works offline.">
      <p>Plan where sirens go and how far they reach, pick models from the siren database (current and legacy), see the federal, state and local rules for this address, and keep each siren’s test schedule and test log. Sirens warn people <b>outdoors</b>; pair them with phone alerts (IPAWS/WEA), NOAA Weather Radio and indoor notification.</p>
      <div className="row wrap">
        <Stat label="Sirens on this project" value={plan.units.length} />
        <Stat label="Level needed at the edge" value={Math.round(target)} unit="dBC" tip="Background noise + margin (FEMA: 10 dB over background)." />
        {share != null && <Stat label="Area around the sirens covered" value={Math.round(share * 100)} unit="%" tone={share > 0.9 ? 'ok' : share > 0.6 ? 'warn' : 'bad'} />}
        <Stat label="Codes for" value={[p.meta.city, p.meta.county && (/county$/i.test(p.meta.county) ? p.meta.county : `${p.meta.county} County`), p.meta.state].filter(Boolean).join(', ') || 'Asheville, NC'} />
      </div>
      {plants.length > 0 && <p className="warn-text">☢ This site is about {plants[0].mi.toFixed(1)} miles from the {plants[0].name} nuclear plant ({plants[0].owner}). Inside its 10-mile emergency planning zone the utility owns the sirens and a FEMA-approved design sets the rules: coordinate with {plants[0].owner} and {plants[0].county} County before any work. (Distance is approximate; use the utility’s zone map.)</p>}
    </Card>

    <Card title="Siren plan and coverage" tour="siren-plan" tip="Tap the map to place a siren, or switch to Check a spot to see the level there.">
      <div className="row wrap">
        <Field label="Background noise" tip="Typical outdoor background: quiet rural 40–50, suburban 50–60, busy street 65–75 dBA. Measure it at the site."><Num value={plan.ambientDb} onChange={(v) => setPlan((s) => { s.ambientDb = v ?? 60; })} unit="dB" /></Field>
        <Field label="Needed above background" tip="FEMA 2006 bulletin: 10 dB. CPG 1-17: about 9 dB."><Num value={plan.overDb} onChange={(v) => setPlan((s) => { s.overDb = v ?? 10; })} unit="dB" /></Field>
        <Field label="Surroundings" tip="How fast sound drops with distance (CPG 1-17 Fig. 1).">
          <select value={plan.ground} onChange={(e) => setPlan((s) => { s.ground = e.target.value as Ground; })}>{Object.entries(GROUND_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        </Field>
      </div>
      <div className="row wrap" data-tour="siren-mode">
        <button className={mode === 'place' ? 'primary' : ''} onClick={() => setMode('place')}>📢 Tap map to place a siren</button>
        <button className={mode === 'check' ? 'primary' : ''} onClick={() => setMode('check')}>🎯 Tap map to check a spot</button>
        <label className="field"><span>Model for new sirens</span><ModelSelect value={newModel} onChange={setNewModel} /></label>
        <button onClick={() => addAt(here.lat, here.lon)}>+ Add at Site A</button>
      </div>
      <MapView sites={p.sites} height={440} center={mapCenter} onClick={onClick} extra={draw} extraKey={JSON.stringify([plan, pt?.lat, pt?.lon])} />
      <p className="small muted">Colored circles: where each siren is {Math.round(target)} dBC or more ({k} dB less each time the distance doubles past 100 ft). Dashed red: closer than this, a person in front of the horn hears more than 123 dBC (CPG 1-17 limit). Dashed purple: about 10 miles around a nuclear plant. Hills, buildings, wind and trees change real reach: confirm with a sound test.</p>
      {pt && <div className={pt.ok ? 'ok-text' : 'bad-text'}>🎯 At this spot: <b>{Number.isFinite(pt.total) ? `${Math.round(pt.total)} dBC` : 'no siren heard'}</b> (needs {Math.round(pt.target)}). {pt.levels.slice(0, 3).map((x) => `${x.name} ${Math.round(x.db)} dBC at ${u.lenFt(x.ft)}`).join(' · ')}</div>}
      {plan.units.length > 0 && <div className="scroll-x"><table className="tbl edit"><thead><tr><th>Name</th><th>Model</th><th>Rated dBC @100 ft</th><th>Height</th><th>Existing</th><th>Reach to {Math.round(target)} dBC</th><th>Notes</th><th /></tr></thead>
        <tbody>{plan.units.map((x) => { const r = unitReach(plan, x); const m = modelOf(x.modelId); return <React.Fragment key={x.id}>
          <tr>
            <td><input value={x.name} onChange={(e) => setUnit(x.id, (y) => { y.name = e.target.value; })} /></td>
            <td><ModelSelect value={x.modelId} onChange={(v) => setUnit(x.id, (y) => { y.modelId = v; })} /></td>
            <td><Num value={x.dbc100 ?? m?.dbc100 ?? null} nullable onChange={(v) => setUnit(x.id, (y) => { y.dbc100 = v === m?.dbc100 ? undefined : v; })} unit="dB" /></td>
            <td><Num value={x.heightFt} onChange={(v) => setUnit(x.id, (y) => { y.heightFt = v ?? 0; })} unit="ft" /></td>
            <td><input type="checkbox" checked={!!x.existing} onChange={(e) => setUnit(x.id, (y) => { y.existing = e.target.checked; })} /></td>
            <td><b>{r.rangeFt ? `${u.lenFt(r.rangeFt)} (${u.f(r.rangeFt * 0.0003048, 2)})` : '—'}</b></td>
            <td><input value={x.notes ?? ''} onChange={(e) => setUnit(x.id, (y) => { y.notes = e.target.value; })} /></td>
            <td><button className="ghost" onClick={() => setPlan((s) => { s.units = s.units.filter((y) => y.id !== x.id); s.tests = s.tests.filter((t) => t.sirenId !== x.id); })}>✕</button></td>
          </tr>
          {r.warnings.length > 0 && <tr><td colSpan={8} className="small warn-text">{r.warnings.map((w) => `⚠ ${w}`).join(' ')}</td></tr>}
        </React.Fragment>; })}</tbody></table></div>}
    </Card>

    <SirenTests plan={plan} setPlan={setPlan} onFinal={() => { const rows = acceptanceRows(plan); update((d) => { d.tests.push(...rows.map((r) => ({ ...r, id: uid() }))); }); go('testing'); }} />
    <SirenCodes state={p.meta.state} county={p.meta.county} city={p.meta.city} />
    <SirenDatabase ground={plan.ground} target={target} />
    <Card title="Siren signals and test procedures" tour="siren-procs">
      <table className="tbl"><thead><tr><th>Signal</th><th>Sound</th><th>Meaning</th></tr></thead><tbody>{SIREN_SIGNALS.map((s) => <tr key={s.name}><td><b>{s.name}</b></td><td>{s.sound}</td><td>{s.use}</td></tr>)}</tbody></table>
      <h4>Test procedures</h4>
      {SIREN_TEST_KINDS.map((t) => <details key={t.id}><summary><b>{t.name}</b>{t.audible ? ' 🔊' : ' 🔇'} <span className="small muted">({t.ref})</span></summary><p>{t.how}</p><p><b>Pass:</b> {t.pass}</p></details>)}
      <p className="small muted">Before any audible test: tell dispatch (911), the National Weather Service office and the public; test in daytime; cancel if severe weather is near; wear hearing protection and lock out the siren before climbing.</p>
    </Card>
  </>;
}

function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const groups = ['Current', 'Special order', 'Legacy'] as const;
  return <select value={value} onChange={(e) => onChange(e.target.value)}>
    {groups.map((g) => <optgroup key={g} label={g === 'Legacy' ? 'Legacy (discontinued)' : g}>{SIREN_MODELS.filter((m) => m.status === g).map((m) => <option key={m.id} value={m.id}>{m.maker.replace(/ \(.*\)/, '')} {m.model}{m.dbc100 != null ? ` · ${m.dbc100} dBC` : ''}</option>)}</optgroup>)}
  </select>;
}

function SirenTests({ plan, setPlan, onFinal }: { plan: SirenPlan; setPlan: (f: (s: SirenPlan) => void) => void; onFinal: () => void }) {
  const due = schedule(plan);
  const prog = SIREN_PROGRAMS.find((x) => x.id === plan.program) ?? SIREN_PROGRAMS[0];
  const [f, setF] = useState({ sirenId: '', kind: 'monthly', date: today(), result: 'pass' as 'pass' | 'fail' | '', measuredDb: null as number | null, atFt: null as number | null, tech: '', notes: '' });
  const name = (id: string) => plan.units.find((x) => x.id === id)?.name ?? '—';
  const kindName = (id: string) => SIREN_TEST_KINDS.find((x) => x.id === id)?.name ?? id;
  return <Card title="Siren test schedule and log" tour="siren-tests" tip="Pick a test program; each siren's next test date follows from its last passed test.">
    <div className="row wrap">
      <Field label="Test program"><select value={plan.program} onChange={(e) => setPlan((s) => { s.program = e.target.value; })}>{SIREN_PROGRAMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
      <button onClick={onFinal} disabled={!plan.units.length}>➕ Add siren acceptance tests to Final Testing</button>
    </div>
    <p className="small">{prog.note} Source: <a href={prog.url} target="_blank" rel="noreferrer">{prog.source}</a>.</p>
    {!plan.units.length ? <p className="muted">Place a siren on the map above to get its test schedule.</p> : <>
      <div className="scroll-x"><table className="tbl"><thead><tr><th>Siren</th><th>Test</th><th>Every</th><th>Last passed</th><th>Next due</th></tr></thead>
        <tbody>{due.map((x) => <tr key={x.sirenId + x.kind} className={x.overdue ? 'fail' : ''}><td>{x.sirenName}</td><td>{x.kindName}</td><td>{x.everyDays === 1 ? 'daily' : `${x.everyDays} days`}</td><td>{x.last ?? 'never'}</td><td>{x.overdue ? <b className="bad-text">{x.last ? `overdue (${x.next})` : 'due now'}</b> : x.next}</td></tr>)}</tbody></table></div>
      <h4>Log a test</h4>
      <div className="row wrap" data-tour="siren-log">
        <label className="field"><span>Siren</span><select value={f.sirenId} onChange={(e) => setF({ ...f, sirenId: e.target.value })}><option value="">All sirens</option>{plan.units.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field"><span>Test</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{SIREN_TEST_KINDS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field"><span>Date</span><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="field"><span>Result</span><select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value as 'pass' | 'fail' | '' })}><option value="pass">Pass</option><option value="fail">Fail</option><option value="">Not finished</option></select></label>
        <Field label="Measured"><Num value={f.measuredDb} nullable onChange={(v) => setF({ ...f, measuredDb: v })} unit="dB" /></Field>
        <Field label="At distance"><Num value={f.atFt} nullable onChange={(v) => setF({ ...f, atFt: v })} unit="ft" /></Field>
        <label className="field"><span>Tech</span><input value={f.tech} onChange={(e) => setF({ ...f, tech: e.target.value })} /></label>
        <label className="field"><span>Notes</span><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <button className="primary" onClick={() => setPlan((s) => { for (const id of f.sirenId ? [f.sirenId] : s.units.map((x) => x.id)) s.tests.unshift({ ...f, id: uid(), sirenId: id }); })}>Save test</button>
      </div>
      {plan.tests.length > 0 && <div className="scroll-x"><table className="tbl"><thead><tr><th>Date</th><th>Siren</th><th>Test</th><th>Result</th><th>Measured</th><th>Tech</th><th>Notes</th><th /></tr></thead>
        <tbody>{plan.tests.map((t) => <tr key={t.id} className={t.result === 'fail' ? 'fail' : t.result === 'pass' ? 'pass' : ''}><td>{t.date}</td><td>{name(t.sirenId)}</td><td>{kindName(t.kind)}</td><td>{t.result || 'not finished'}</td><td>{t.measuredDb != null ? `${t.measuredDb} dBC${t.atFt != null ? ` at ${t.atFt} ft` : ''}` : ''}</td><td>{t.tech}</td><td>{t.notes}</td>
          <td><button className="ghost" onClick={() => setPlan((s) => { s.tests = s.tests.filter((y) => y.id !== t.id); })}>✕</button></td></tr>)}</tbody></table></div>}
    </>}
  </Card>;
}

function CodeRow({ c }: { c: SirenCode }) {
  return <details><summary><b>{c.title}</b> <span className="small muted">· {c.cite}</span> {c.checked ? <span className="small ok-text">✓ read {SIRENS_CHECKED}</span> : <span className="small warn-text">confirm in code book / with AHJ</span>}</summary>
    <p>{c.summary}</p><p className="small"><b>Applies:</b> {c.applies}{c.date ? ` · Dated ${c.date}` : ''} · <a href={c.url} target="_blank" rel="noreferrer">Source</a></p></details>;
}
function SirenCodes({ state, county, city }: { state?: string; county?: string; city?: string }) {
  const list = codesFor(state || 'NC', county || (state ? '' : 'Buncombe'), city || (state ? '' : 'Asheville'));
  const more = otherLocal(state || 'NC', list);
  const levels: [string, SirenCode[]][] = [
    ['Federal law, standards and codes', list.filter((x) => x.level === 'Federal')],
    ['Federal and national guidance', list.filter((x) => x.level === 'Guidance')],
    [`State law (${state || 'NC'})`, list.filter((x) => x.level === 'State')],
    ['County, city and tribal rules for this address', list.filter((x) => ['County', 'City', 'Tribal'].includes(x.level))],
  ];
  return <Card title="Codes, laws and ordinances for outdoor sirens" tour="siren-codes" tip="Picked from the project address. A licensed PE and the AHJ must verify.">
    {levels.map(([h, xs]) => <div key={h}><h4>{h}</h4>{xs.length ? xs.map((c) => <CodeRow key={c.id} c={c} />) : <p className="small muted">None listed for this address. Ask the county emergency management office for its siren standard and test day, and check the city and county noise ordinance.</p>}</div>)}
    {more.length > 0 && <><h4>Other local programs in {state || 'NC'} (examples)</h4>{more.map((c) => <CodeRow key={c.id} c={c} />)}</>}
    <p className="small muted">✓ means the summary was read on the source page on {SIRENS_CHECKED}. Others give the citation to confirm; the code text itself is not bundled. Code editions change: a licensed PE and the authority having jurisdiction must verify. The list refreshes automatically when online.</p>
  </Card>;
}

function SirenDatabase({ ground, target }: { ground: Ground; target: number }) {
  const [q, setQ] = useState(''); const [st, setSt] = useState('all'); const [voice, setVoice] = useState(false);
  const u = useUnits(); const k = SIREN_PLANNING.lossPerDoubling[ground];
  const rows = SIREN_MODELS.filter((m) => (st === 'all' || m.status === st) && (!voice || m.voice) && (`${m.maker} ${m.model} ${m.kind} ${m.signals} ${m.power}`.toLowerCase().includes(q.toLowerCase())));
  return <Card title="Siren database (current and legacy)" tour="siren-db" tip="Rated output is the maker's published dBC at 100 ft. Confirm on the datasheet.">
    <div className="row wrap">
      <input placeholder="Search maker, model, type…" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={st} onChange={(e) => setSt(e.target.value)}><option value="all">All</option><option value="Current">Current</option><option value="Legacy">Legacy (discontinued)</option><option value="Special order">Special order</option></select>
      <label className="check"><input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Voice capable</label>
      <span className="small muted">{rows.length} of {SIREN_MODELS.length} models</span>
    </div>
    <div className="scroll-x"><table className="tbl"><thead><tr><th>Maker</th><th>Model</th><th>Type</th><th>dBC @100 ft</th><th>Reach to {Math.round(target)} dBC</th><th>Signals</th><th>Power</th><th>Years</th><th>Status</th><th>Source</th></tr></thead>
      <tbody>{rows.map((m) => { const db = ratedDb({ modelId: m.id }); return <tr key={m.id}>
        <td>{m.maker}</td><td><b>{m.model}</b>{m.notes ? <div className="small muted">{m.notes}</div> : null}</td><td>{m.kind}</td><td>{db ?? 'see datasheet'}</td>
        <td>{db != null ? u.f(rangeFt(db, target, k) * 0.0003048, 2) : '—'}</td><td>{m.signals}</td><td>{m.power}</td><td>{m.years}</td>
        <td>{m.status === 'Legacy' ? <span className="warn-text">Legacy{m.replacedBy ? ` → ${m.replacedBy}` : ''}</span> : m.status}</td>
        <td><a href={SIREN_SOURCES[m.src]?.[1]} target="_blank" rel="noreferrer">{SIREN_SOURCES[m.src]?.[0] ?? m.src}</a></td></tr>; })}</tbody></table></div>
    <p className="small muted">Reach uses the surroundings picked above ({k} dB per doubling past 100 ft, <a href={CPG[1]} target="_blank" rel="noreferrer">CPG 1-17</a>). Makers rate on the horn axis in their own way; a rotating siren reaches farther than an omni of the same rating only in the direction it points at that moment. Datasheets are not bundled: open the maker’s site and attach the PDF in the Specifications Library.</p>
  </Card>;
}
