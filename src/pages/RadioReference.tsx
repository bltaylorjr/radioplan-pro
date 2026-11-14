import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { CODE_SETS } from '../compliance/codesets';
import { projectPlace } from '../compliance/place';
import { allCounties } from '../engine/refdata';
import { haversineKm } from '../engine/geo';
import {
  RrLogin, RrDownload, RrError, loadLogin, saveLogin, testLogin, downloadCounty, loadDownload, listDownloads, deleteDownload,
  saveDownload, importRrCsv, countFreqs, canReachApi, wipeAll, publicSafetyFreqs,
} from '../engine/radioref';
import type { StateCode } from '../types';
import { uid } from '../defaults';
import { bandsInUse, worstCaseMHz, bdaAdvice, donorSites, freqChoices, DonorSite } from '../engine/rrdesign';

const STATES: StateCode[] = ['NC', 'SC', 'GA', 'TN', 'VA'];
const MHZ = (f: number | null) => (f == null ? '' : f.toFixed(5).replace(/0{1,2}$/, ''));
const APPLY_URL = 'https://www.radioreference.com/account/api/apply';
const day = (iso: string) => { try { return new Date(iso).toLocaleDateString(); } catch { return iso; } };

/** Hook: the saved download for a place (re-read when `tick` changes). */
export function useRrDownload(state: string, county: string, tick = 0) {
  const [d, setD] = useState<RrDownload | null>(null);
  useEffect(() => { let alive = true; if (!county) { setD(null); return; } loadDownload(state, county).then((v) => alive && setD(v)); return () => { alive = false; }; }, [state, county, tick]);
  return d;
}

export function RadioReferencePage() {
  const { project: p } = useStore();
  const here = projectPlace(p);
  const [st, setSt] = useState<StateCode>(here.state);
  const [county, setCounty] = useState(here.county ?? '');
  useEffect(() => { setSt(here.state); setCounty(here.county ?? ''); }, [here.state, here.county]);
  const counties = useMemo(() => allCounties().filter((c) => c.state === st).sort((a, b) => a.county.localeCompare(b.county)), [st]);

  const [login, setLogin] = useState<RrLogin>({ username: '', password: '', appKey: '' });
  const [hasLogin, setHasLogin] = useState(false);
  const [editLogin, setEditLogin] = useState(false);
  useEffect(() => { loadLogin().then((l) => { if (l) { setLogin(l); setHasLogin(true); } else setEditLogin(true); }); }, []);
  const [msg, setMsg] = useState<{ text: string; tone?: 'ok' | 'bad' } | null>(null);
  const [busy, setBusy] = useState<{ text: string; frac: number } | null>(null);
  const [stopper] = useState({ cancelled: false });
  const [trunked, setTrunked] = useState(true);
  const [statewide, setStatewide] = useState(false);
  const [tick, setTick] = useState(0);
  const d = useRrDownload(st, county, tick);
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof listDownloads>>>([]);
  useEffect(() => { listDownloads().then(setSaved); }, [tick]);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  const appOk = canReachApi();

  const explain = (e: unknown) => {
    const m = (e as Error).message || String(e);
    if (e instanceof RrError && e.kind === 'key') return `RadioReference did not accept the app key: ${m}. Check the key you were sent, or apply for one (step 1 below).`;
    if (e instanceof RrError && e.kind === 'login') return `RadioReference did not accept the sign-in: ${m}. Check the username and password, and that your Premium subscription is active.`;
    return m;
  };
  const doSaveLogin = async () => {
    const l = { username: login.username.trim(), password: login.password, appKey: login.appKey.trim() };
    await saveLogin(l); setLogin(l); setHasLogin(true); setEditLogin(false);
    if (!online || !appOk) { setMsg({ text: 'Sign-in saved on this device. It will be checked the first time you download.', tone: 'ok' }); return; }
    setMsg({ text: 'Checking with RadioReference…' });
    try { setMsg({ text: '✓ ' + await testLogin(l), tone: 'ok' }); } catch (e) { setMsg({ text: explain(e), tone: 'bad' }); }
  };
  const forget = async () => {
    if (!confirm('Remove your RadioReference sign-in and every downloaded frequency list from this device?')) return;
    await wipeAll(); setLogin({ username: '', password: '', appKey: '' }); setHasLogin(false); setEditLogin(true); setTick((t) => t + 1);
    setMsg({ text: 'Removed from this device.', tone: 'ok' });
  };
  const download = async () => {
    stopper.cancelled = false; setMsg(null); setBusy({ text: 'Connecting to RadioReference…', frac: 0 });
    try {
      const got = await downloadCounty(st, county, login, { trunked, statewide, signal: stopper, progress: (text, frac) => setBusy({ text, frac }) });
      setMsg({ text: `✓ Saved ${countFreqs(got)} frequencies and ${got.systems.reduce((a, s) => a + s.talkgroups.length, 0)} talkgroups for ${county} on this device. They work offline from now on.${got.warnings.length ? ` (${got.warnings.length} parts could not be read.)` : ''}`, tone: 'ok' });
    } catch (e) { setMsg({ text: explain(e), tone: 'bad' }); }
    setBusy(null); setTick((t) => t + 1);
  };
  const importFile = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,text/csv,text/plain';
    i.onchange = async () => {
      const f = i.files?.[0]; if (!f) return;
      try { const r = importRrCsv(await f.text(), st, county, d); await saveDownload(r.dl); setMsg({ text: `✓ ${r.added} ${r.kind === 'freqs' ? 'frequencies' : 'talkgroups'} saved for ${county} on this device. You can now delete the file you downloaded.`, tone: 'ok' }); setTick((t) => t + 1); }
      catch (e) { setMsg({ text: 'Could not read that file: ' + (e as Error).message, tone: 'bad' }); }
    };
    i.click();
  };

  return (
    <div className="stack">
      <p className="note">🔒 Frequencies and talkgroups from RadioReference are protected information. LvPlan Pro keeps them <b>only on this device, encrypted</b>. They are never put in project files, backups, reports, exports or Sync Devices, and never sent anywhere except to RadioReference.com when you download.</p>

      <Card title="Your RadioReference sign-in" tip="Uses your RadioReference Premium subscription. The sign-in is saved encrypted on this device and is only sent to RadioReference.com.">
        {!editLogin && hasLogin ? <div className="row wrap">
          <span>Signed in as <b>{login.username}</b>{login.appKey ? '' : ' (no app key yet)'}.</span>
          <button onClick={() => setEditLogin(true)}>Change</button>
          <button className="ghost" onClick={forget}>Remove sign-in and downloads</button>
        </div> : <>
          <div className="form">
            <label className="field"><span>RadioReference username</span><input autoComplete="off" value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} aria-label="RadioReference username" /></label>
            <label className="field"><span>Password</span><input type="password" autoComplete="off" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} aria-label="RadioReference password" /></label>
            <label className="field wide"><span>App key (from RadioReference)</span><input autoComplete="off" spellCheck={false} value={login.appKey} onChange={(e) => setLogin({ ...login, appKey: e.target.value })} aria-label="RadioReference app key" placeholder="paste the key RadioReference emailed you" /></label>
          </div>
          <div className="row"><button className="primary" disabled={!login.username.trim() || !login.password} onClick={doSaveLogin}>Save sign-in</button>{hasLogin && <button onClick={() => setEditLogin(false)}>Cancel</button>}</div>
          <details className="small"><summary>How to get the app key (one time)</summary><ol>
            <li>Sign in at RadioReference.com with your Premium account.</li>
            <li>Open <a href={APPLY_URL} target="_blank" rel="noreferrer">the API key application page ↗</a>.</li>
            <li>Describe the app: “LvPlan Pro, an internal, single-user tool for my low-voltage company. It looks up public-safety frequencies, trunked sites and talkgroups for the county of a job, to design and test in-building emergency radio (ERCES / BDA / DAS) and program radios. Only I use it, with my own Premium login. Data stays on my device and is not shared or published.”</li>
            <li>When RadioReference emails the key, paste it in the box above and tap Save.</li>
          </ol></details>
        </>}
        {msg && <p className={msg.tone === 'bad' ? 'bad-text' : msg.tone === 'ok' ? 'ok-text' : 'muted'} role="status">{msg.text}</p>}
      </Card>

      <Card title="Download a county (needs internet once)">
        <div className="form">
          <label className="field"><span>State</span><select value={st} onChange={(e) => { setSt(e.target.value as StateCode); setCounty(''); }} aria-label="State">{STATES.map((s) => <option key={s} value={s}>{CODE_SETS[s].name}</option>)}</select></label>
          <label className="field"><span>County</span><select value={county} onChange={(e) => setCounty(e.target.value)} aria-label="County"><option value="">— pick a county —</option>{counties.map((c) => <option key={c.fips} value={c.county}>{c.county}</option>)}</select></label>
        </div>
        <div className="stack-tight">
          <label className="check"><input type="checkbox" checked={trunked} onChange={(e) => setTrunked(e.target.checked)} /> Trunked radio systems, tower sites and talkgroups</label>
          <label className="check"><input type="checkbox" checked={statewide} onChange={(e) => setStatewide(e.target.checked)} /> Also statewide agencies and systems (State Highway Patrol, statewide radio network sites in this county). Takes longer.</label>
        </div>
        {busy ? <div className="stack-tight"><progress value={busy.frac} max={1} style={{ width: '100%' }} /><div className="row"><span className="small">{busy.text}</span><button className="ghost" onClick={() => { stopper.cancelled = true; }}>Stop</button></div></div>
          : <div className="row wrap">
            <button className="primary" disabled={!county || !hasLogin || !online || !appOk} onClick={download}>{d?.source === 'api' ? '⟳ Download again (update)' : '⬇ Download frequencies for this county'}</button>
            <button onClick={importFile} disabled={!county}>Import a CSV saved from RadioReference.com</button>
          </div>}
        {!online && <p className="small muted">This device is offline. Saved counties below still work.</p>}
        {online && !appOk && <p className="small muted">Downloading straight from RadioReference works in the installed Windows and Android apps. In this web browser, open the county on RadioReference.com, download its frequency list (CSV), then tap <b>Import a CSV</b>.</p>}
        {!hasLogin && <p className="small muted">Save your sign-in above first.</p>}
        {saved.length > 0 && <table className="tbl"><thead><tr><th>Saved on this device</th><th>Frequencies</th><th>Talkgroups</th><th>Updated</th><th></th></tr></thead>
          <tbody>{saved.map((s) => <tr key={s.key}><td><a href="#" onClick={(e) => { e.preventDefault(); setSt(s.state as StateCode); setCounty(s.county); }}>{s.county}, {s.state}</a></td><td>{s.nFreq}</td><td>{s.nTg}</td><td>{day(s.fetchedAt)}</td>
            <td><button className="ghost" onClick={async () => { if (confirm(`Delete the saved list for ${s.county}?`)) { await deleteDownload(s.key); setTick((t) => t + 1); } }}>Delete</button></td></tr>)}</tbody></table>}
      </Card>

      {county && <RrBrowser d={d} county={county} state={st} />}
      <p className="small muted">Data © RadioReference.com, for your own use with your Premium subscription. Always confirm frequencies and get the licensee’s and AHJ’s approval before you retransmit them (FCC 90.219).</p>
    </div>
  );
}

function RrBrowser({ d, county, state }: { d: RrDownload | null; county: string; state: string }) {
  const { project: p } = useStore();
  const [q, setQ] = useState('');
  const [onlyPs, setOnlyPs] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  if (!d) return <Card title={`Frequencies: ${county}, ${state}`}><p className="muted">Nothing saved for {county} yet. Download it above while you have internet.</p></Card>;
  const s0 = p.sites[0], hasPos = s0 && (s0.lat !== 0 || s0.lon !== 0);
  const ql = q.trim().toLowerCase();
  const hit = (...t: (string | number | null)[]) => !ql || t.some((x) => String(x ?? '').toLowerCase().includes(ql));
  const ps = new Set(onlyPs ? publicSafetyFreqs(d).map((f) => `${f.where}|${f.out}|${f.alpha}`) : []);
  return (
    <Card title={`Frequencies: ${county}, ${state}`} actions={<span className="small muted">saved {day(d.fetchedAt)} · works offline</span>}>
      <div className="row wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: fire, 154.430, sheriff…" aria-label="Search frequencies" style={{ minWidth: 220 }} />
        <label className="check"><input type="checkbox" checked={onlyPs} onChange={(e) => setOnlyPs(e.target.checked)} /> Only public safety (what a BDA usually must pass)</label>
      </div>
      {d.groups.map((g) => g.subcats.map((s) => {
        const fs = s.freqs.filter((f) => hit(f.out, f.in, f.alpha, f.descr, f.tone, f.mode, f.tags, s.name, g.name) && (!onlyPs || ps.has(`${g.name} · ${s.name}|${f.out}|${f.alpha}`)));
        if (!fs.length) return null;
        return <details key={g.name + s.name} open={!!ql || onlyPs}><summary><b>{g.kind === 'agency' ? g.name + ' · ' : ''}{s.name}</b> <span className="small muted">({fs.length})</span></summary>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Frequency MHz</th><th>Input</th><th>Tone / NAC</th><th>Mode</th><th>Alpha tag</th><th>Description</th><th>Tag</th></tr></thead>
            <tbody>{fs.map((f, i) => <tr key={i}><td className="nowrap"><b>{MHZ(f.out)}</b></td><td>{MHZ(f.in)}</td><td>{f.tone}</td><td>{f.mode}{f.enc ? ' 🔒' : ''}</td><td>{f.alpha}</td><td>{f.descr}</td><td className="small">{f.tags}</td></tr>)}</tbody></table></div>
        </details>;
      }))}
      {d.systems.length > 0 && <h3>Trunked systems</h3>}
      {d.systems.map((sys, k) => {
        const tgs = sys.talkgroups.filter((t) => hit(t.dec, t.alpha, t.descr, t.tag, t.cat) && (!onlyPs || /fire|law|ems|interop|emergency|sheriff|police|dispatch/i.test(`${t.tag} ${t.cat} ${t.descr}`)));
        const sites = [...sys.sites].map((x) => ({ ...x, km: hasPos && x.lat != null && x.lon != null ? haversineKm(s0, { lat: x.lat, lon: x.lon }) : null })).sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
        return <details key={k} open={open === k} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setOpen(k)}>
          <summary><b>{sys.name}</b> <span className="small muted">{[sys.type, sys.city, sys.sysid && `System ID ${sys.sysid}`].filter(Boolean).join(' · ')} · {sites.length} sites · {tgs.length} talkgroups</span></summary>
          {sites.length > 0 && <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Site</th><th>County</th><th>Distance</th><th>Frequencies (c = control)</th></tr></thead>
            <tbody>{sites.map((x, i) => <tr key={i}><td>{x.number} {x.name}{x.nac && <span className="small muted"> NAC {x.nac}</span>}</td><td>{x.county}</td><td className="nowrap">{x.km == null ? '' : `${(x.km * 0.621371).toFixed(1)} mi`}</td>
              <td className="small">{x.freqs.map((f) => MHZ(f.freq) + (/c|a/i.test(f.use) ? 'c' : '')).join(', ')}</td></tr>)}</tbody></table></div>}
          {tgs.length > 0 && <div className="tbl-wrap"><table className="tbl"><thead><tr><th>DEC</th><th>Alpha tag</th><th>Description</th><th>Mode</th><th>Tag</th><th>Group</th></tr></thead>
            <tbody>{tgs.map((t, i) => <tr key={i}><td>{t.dec}</td><td>{t.alpha}</td><td>{t.descr}</td><td>{t.mode}{t.enc ? ' 🔒' : ''}</td><td className="small">{t.tag}</td><td className="small">{t.cat}</td></tr>)}</tbody></table></div>}
        </details>;
      })}
      {d.warnings.length > 0 && <details className="small muted"><summary>{d.warnings.length} parts could not be read</summary><ul>{d.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
    </Card>
  );
}

/** Frequency picker for design pages: every frequency in the project county's saved RadioReference list. */
export function RrFreqPicker({ onPick }: { onPick: (fMHz: number) => void }) {
  const { project: p } = useStore();
  const here = projectPlace(p);
  const d = useRrDownload(here.state, here.county ?? '');
  const choices = useMemo(() => (d ? freqChoices(d) : []), [d]);
  if (!choices.length) return null;
  const groups = [...new Set(choices.map((c) => c.group))];
  return <select value="" onChange={(e) => { const f = parseFloat(e.target.value); if (Number.isFinite(f)) onPick(f); }} aria-label="Pick a RadioReference frequency">
    <option value="">— or pick from RadioReference ({here.county}) —</option>
    {groups.map((g) => <optgroup key={g} label={g}>{choices.filter((c) => c.group === g).map((c, i) => <option key={i} value={c.fMHz}>{c.label}</option>)}</optgroup>)}
  </select>;
}

/** ERCES page card: bands the BDA must pass, worst-case frequency, donor site candidates and estimated donor signal. */
export function RrErcesCard() {
  const { project: p, update, go } = useStore();
  const here = projectPlace(p);
  const d = useRrDownload(here.state, here.county ?? '');
  const [all, setAll] = useState(false);
  if (!d) return <Card title="Public-safety channels here (RadioReference)"><p className="small">No RadioReference list saved for {here.county || 'the project county'} yet. <button className="ghost" onClick={() => go('radioref')}>Open RadioReference Frequencies</button></p></Card>;
  const ps = publicSafetyFreqs(d);
  const bands = bandsInUse(d);
  const worst = worstCaseMHz(bands);
  const s0 = p.sites[0], hasPos = s0 && (s0.lat !== 0 || s0.lon !== 0);
  const donors = hasPos ? donorSites(d, s0, s0.antennaAglM || 15).slice(0, all ? 50 : 5) : [];
  const addSite = (x: DonorSite) => { if (!confirm('Add this donor tower as a site in the project? Its position will be saved in the project file.')) return; update((q) => { q.sites.push({ ...q.sites[0], id: uid(), name: `Donor: ${x.system} ${x.site}`.slice(0, 60), address: '', lat: x.lat, lon: x.lon, groundElevM: null, positionSource: 'RadioReference', positionAccuracyM: null, onBuilding: false }); }); };
  return (
    <Card title="Public-safety radio here (RadioReference)" tip="From the RadioReference list saved (encrypted) on this device for the project county. Used to size the BDA and DAS. Estimates only: always measure the donor signal on the roof.">
      <h4>Bands the BDA must pass</h4>
      {bands.length ? <ul className="small">{bdaAdvice(bands).map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="small muted">No public-safety channels found in the saved list.</p>}
      {worst && <div className="row wrap small"><span>Highest frequency to pass: <b>{MHZ(worst)} MHz</b> (worst case for walls and cable loss).</span>
        <button className="ghost" onClick={() => update((q) => { q.indoor.fMHz = Math.round(worst); })} disabled={Math.round(p.indoor.fMHz) === Math.round(worst)}>Use for Indoor Coverage & DAS</button>
        <button className="ghost" onClick={() => update((q) => { q.radio.fMHz = Math.round(worst * 1000) / 1000; q.radio.bandPreset = 'Custom'; })}>Use for link budget</button></div>}
      {hasPos && donors.length > 0 && <>
        <h4>Nearest trunked tower sites (donor candidates)</h4>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Site</th><th>Distance</th><th>Bearing</th><th>Est. donor signal</th><th></th></tr></thead>
          <tbody>{donors.map((x, i) => <tr key={i}><td>{x.system}<div className="small muted">{x.site}{x.county ? `, ${x.county}` : ''}</div></td><td className="nowrap">{(x.km * 0.621371).toFixed(1)} mi</td><td>{Math.round(x.bearing)}°</td>
            <td className="nowrap">{x.estDbm} dBm</td>
            <td className="nowrap"><button className="ghost" onClick={() => update((q) => { q.erces.donorRssiDbm = x.estDbm; })}>Use estimate</button><button className="ghost" onClick={() => addSite(x)}>Add as site</button></td></tr>)}</tbody></table></div>
        <p className="small muted">Estimate assumes 100 W ERP from a 60 m tower antenna, a 10 dBi donor antenna aimed at the site, and suburban terrain. Point the donor antenna on the bearing shown and measure. <button className="ghost" onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show more sites'}</button></p>
      </>}
      {!hasPos && d.systems.length > 0 && <p className="small muted">Set the building position on Site Data & GPS to list the nearest donor towers.</p>}
      <details className="small"><summary>{ps.length} conventional public-safety channels</summary>
        <div className="tbl-wrap" style={{ maxHeight: 220, overflow: 'auto' }}><table className="tbl"><tbody>{ps.slice(0, 200).map((f, i) => <tr key={i}><td className="nowrap">{MHZ(f.out)}</td><td>{f.alpha || f.descr}</td><td className="small muted">{f.where}</td></tr>)}</tbody></table></div></details>
      <button className="ghost" onClick={() => go('radioref')}>See all, with sites and talkgroups</button>
    </Card>
  );
}
