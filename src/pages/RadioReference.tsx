import { fmtAz, declinationDeg } from '../engine/azimuth';
import { useUnits } from '../units';
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { CODE_SETS } from '../compliance/codesets';
import { projectPlace } from '../compliance/place';
import { allCounties } from '../engine/refdata';
import { haversineKm } from '../engine/geo';
import {
  RrLogin, RrDownload, RrError, loadLogin, logIn, logOut, loadAppKey, checkOffline, onLoginChange, testLogin, downloadCounty, loadDownload, listDownloads, deleteDownload,
  saveDownload, importRrCsv, countFreqs, canReachApi, wipeAll, publicSafetyFreqs,
} from '../engine/radioref';
import type { StateCode } from '../types';
import { uid } from '../defaults';
import { useRrJob, startJob, stopJob, clearJob, timeLeft, elapsed, STAGES, summary, RrJob } from '../engine/rrjob';
import { bandsInUse, worstCaseMHz, bdaAdvice, donorSites, freqChoices, DonorSite } from '../engine/rrdesign';
import { askConfirm, askDelete } from '../components/askConfirm';

const STATES: StateCode[] = ['NC', 'SC', 'GA', 'TN', 'VA'];
const MHZ = (f: number | null) => (f == null ? '' : f.toFixed(5).replace(/0{1,2}$/, ''));
const day = (iso: string) => { try { return new Date(iso).toLocaleDateString(); } catch { return iso; } };

/** Hook: the saved download for a place (re-read when `tick` changes). */
export function useRrDownload(state: string, county: string, tick = 0) {
  const [d, setD] = useState<RrDownload | null>(null);
  useEffect(() => { let alive = true; if (!county) { setD(null); return; } loadDownload(state, county).then((v) => alive && setD(v)); return () => { alive = false; }; }, [state, county, tick]);
  return d;
}

export function RadioReferencePage() {
  const { project: p, go } = useStore();
  const here = projectPlace(p);
  const [st, setSt] = useState<StateCode>(here.state);
  const [county, setCounty] = useState(here.county ?? '');
  useEffect(() => { setSt(here.state); setCounty(here.county ?? ''); }, [here.state, here.county]);
  const counties = useMemo(() => allCounties().filter((c) => c.state === st).sort((a, b) => a.county.localeCompare(b.county)), [st]);

  const [login, setLogin] = useState<RrLogin>({ username: '', password: '', appKey: '' });
  const [hasLogin, setHasLogin] = useState(false);
  const [stay, setStay] = useState(true);
  useEffect(() => { const read = () => loadLogin().then((l) => { if (l) { setLogin(l); setStay(l.stay); setHasLogin(true); } else { setHasLogin(false); setLogin({ username: '', password: '', appKey: '' }); } }); read(); return onLoginChange(read); }, []);
  const [msg, setMsg] = useState<{ text: string; tone?: 'ok' | 'bad' } | null>(null);
  const job = useRrJob();
  const busy = !!job?.running;
  useEffect(() => { if (job?.result) setTick((t) => t + 1); }, [job?.result]);
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
    if (e instanceof RrError && e.kind === 'key') return `RadioReference did not accept the app key: ${m}. Check the key in User Settings → RadioReference app key.`;
    if (e instanceof RrError && e.kind === 'login') return `RadioReference did not accept the sign-in: ${m}. Check the username and password, and that your Premium subscription is active.`;
    return m;
  };
  const doLogout = async () => { await logOut(); setMsg({ text: 'Logged out. Your username and password were removed from this device.', tone: 'ok' }); };
  const forget = async () => {
    if (!(await askDelete('Log out and delete every downloaded frequency list from this device?'))) return;
    await wipeAll(); setTick((t) => t + 1);
    setMsg({ text: 'Removed from this device.', tone: 'ok' });
  };
  const download = async () => {
    setMsg(null); clearJob();
    const j = await startJob(st, county, login, { trunked, statewide });
    if (j.error) setMsg({ text: explain(j.error), tone: 'bad' });
    setTick((t) => t + 1);
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

      {!hasLogin ? <RrLoginPage msg={msg} onDone={(l, m) => { setLogin(l); setHasLogin(true); setMsg(m); }} />
        : <Card title="RadioReference" className="rr-status">
          <div className="row wrap">
            <span>🔓 Logged in as <b>{login.username}</b>{stay ? <span className="pill">stays logged in on this device</span> : <span className="pill">until the app is closed</span>}{login.appKey ? '' : <button className="ghost pill" onClick={() => go('settings')}>no app key yet: add it in User Settings</button>}</span>
            <button className="primary" onClick={doLogout}>Log out</button>
            <button className="ghost" onClick={forget}>Log out and delete downloads</button>
          </div>
          {msg && <p className={msg.tone === 'bad' ? 'bad-text' : msg.tone === 'ok' ? 'ok-text' : 'muted'} role="status">{msg.text}</p>}
        </Card>}
      {hasLogin && <>
      <Card title="Download a county (needs internet once)">
        <div className="form">
          <label className="field"><span>State</span><select value={st} onChange={(e) => { setSt(e.target.value as StateCode); setCounty(''); }} aria-label="State">{STATES.map((s) => <option key={s} value={s}>{CODE_SETS[s].name}</option>)}</select></label>
          <label className="field"><span>County</span><select value={county} onChange={(e) => setCounty(e.target.value)} aria-label="County"><option value="">— pick a county —</option>{counties.map((c) => <option key={c.fips} value={c.county}>{c.county}</option>)}</select></label>
        </div>
        <div className="stack-tight">
          <label className="check"><input type="checkbox" checked={trunked} onChange={(e) => setTrunked(e.target.checked)} /> Trunked radio systems, tower sites and talkgroups</label>
          <label className="check"><input type="checkbox" checked={statewide} onChange={(e) => setStatewide(e.target.checked)} /> Also statewide agencies and systems (State Highway Patrol, statewide radio network sites in this county). Takes longer.</label>
        </div>
        {job && (job.running || job.result || job.error) ? <RrProgress job={job} explain={explain} onClose={() => { clearJob(); setTick((t) => t + 1); }} /> : null}
        {busy ? null : <div className="row wrap">
            <button className="primary" disabled={!county || !hasLogin || !online || !appOk} onClick={download}>{d?.source === 'api' ? '⟳ Download again (update)' : '⬇ Download frequencies for this county'}</button>
            <button onClick={importFile} disabled={!county}>Import a CSV saved from RadioReference.com</button>
          </div>}
        {!online && <p className="small muted">This device is offline. Saved counties below still work.</p>}
        {online && !appOk && <p className="small muted">Downloading straight from RadioReference works in the installed Windows and Android apps. In this web browser, open the county on RadioReference.com, download its frequency list (CSV), then tap <b>Import a CSV</b>.</p>}
        {!hasLogin && <p className="small muted">Save your sign-in above first.</p>}
        {saved.length > 0 && <table className="tbl"><thead><tr><th>Saved on this device</th><th>Frequencies</th><th>Talkgroups</th><th>Updated</th><th></th></tr></thead>
          <tbody>{saved.map((s) => <tr key={s.key}><td><a href="#" onClick={(e) => { e.preventDefault(); setSt(s.state as StateCode); setCounty(s.county); }}>{s.county}, {s.state}</a></td><td>{s.nFreq}</td><td>{s.nTg}</td><td>{day(s.fetchedAt)}</td>
            <td><button className="ghost" onClick={async () => { if (await askDelete(<>Delete the saved list for <b>{s.county}</b>?</>)) { await deleteDownload(s.key); setTick((t) => t + 1); } }}>Delete</button></td></tr>)}</tbody></table>}
      </Card>

      {county && <RrBrowser d={d} county={county} state={st} />}
      </>}
      <p className="small muted">Data © RadioReference.com, for your own use with your Premium subscription. Always confirm frequencies and get the licensee’s and AHJ’s approval before you retransmit them (FCC 90.219).</p>
    </div>
  );
}

/** Top-bar badge while a RadioReference download runs (and briefly after): tap to open the page. */
export { RrJobBadge } from '../components/RrJobBadge';

/** The download progress panel: bar with percent, the stages, what is being read now, counts so far and time left. */
function RrProgress({ job, explain, onClose }: { job: RrJob; explain: (e: unknown) => string; onClose: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { if (!job.running) return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [job.running]);
  const p = job.p, pct = Math.round(job.frac * 100);
  const stageIdx = p ? Math.max(0, STAGES.findIndex(([s]) => s === (p.stage === 'county' ? 'start' : p.stage === 'done' ? 'saving' : p.stage))) : 0;
  const left = timeLeft(job);
  const stopped = job.error instanceof RrError && /stopped/i.test((job.error as Error).message);
  return (
    <div className="rr-progress" role="status" aria-live="polite">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <b>{job.running ? `Downloading ${job.county}, ${job.state}…` : job.result ? `✓ ${job.county}, ${job.state} downloaded` : stopped ? `Download of ${job.county} stopped` : `Download of ${job.county} did not finish`}</b>
        <span className="small muted">{pct}% · {elapsed(job)}{left ? ` · ${left}` : ''}</span>
      </div>
      <div className="rr-bar" aria-label={`${pct} percent`}><div className={job.error ? 'bad' : job.result ? 'ok' : ''} style={{ width: `${Math.max(2, pct)}%` }} /></div>
      <ol className="rr-stages">{STAGES.map(([id, label], k) => <li key={id} className={job.result || k < stageIdx ? 'done' : k === stageIdx && job.running ? 'now' : ''}>{job.result || k < stageIdx ? '✓ ' : ''}{label}</li>)}</ol>
      {job.running && <div className="small">{job.text}{p && p.of > 1 ? <span className="muted"> ({p.step} of {p.of})</span> : null}</div>}
      {p && <div className="rr-counts small">
        <span><b>{p.freqs}</b> frequencies</span><span><b>{p.lists}</b> lists</span>{p.agencies > 0 && <span><b>{p.agencies}</b> agencies</span>}
        <span><b>{p.systems}</b> trunked systems</span><span><b>{p.sites}</b> sites</span><span><b>{p.talkgroups}</b> talkgroups</span>
        {p.problems > 0 && <span className="warn-text">{p.problems} part{p.problems > 1 ? 's' : ''} could not be read</span>}
      </div>}
      {job.result && <p className="ok-text small">Saved on this device (encrypted): {summary(job.result)}. They work offline from now on.</p>}
      {job.error != null && !stopped && <p className="bad-text small">{explain(job.error)}</p>}
      <div className="row">{job.running ? <button className="ghost" onClick={stopJob}>Stop download</button> : <button className="ghost" onClick={onClose}>Close</button>}</div>
      {job.running && <p className="small muted">You can open other pages while this runs. The ⬇ badge at the top shows how far along it is.</p>}
    </div>
  );
}

/** The RadioReference login page: username, password, "Stay logged in". The app key is in User Settings. */
export function RrLoginPage({ msg: msg0, onDone }: { msg?: { text: string; tone?: 'ok' | 'bad' } | null; onDone: (l: RrLogin, m: { text: string; tone?: 'ok' | 'bad' }) => void }) {
  const { go } = useStore();
  const [u, setU] = useState(''), [pw, setPw] = useState(''), [key, setKey] = useState(''), [stay, setStay] = useState(true), [show, setShow] = useState(false);
  const [msg, setMsg] = useState(msg0 ?? null), [busy, setBusy] = useState(false);
  useEffect(() => { const read = () => loadAppKey().then(setKey); read(); return onLoginChange(read); }, []);
  useEffect(() => { if (msg0) setMsg(msg0); }, [msg0]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const l = { username: u.trim(), password: pw, appKey: key.trim() };
    if (!l.username || !l.password) return;
    setBusy(true); setMsg({ text: 'Logging in…' });
    let note = '';
    if (navigator.onLine && canReachApi() && l.appKey) {
      try { note = await testLogin(l); }
      catch (err) {
        setBusy(false);
        const m = (err as Error).message;
        if (err instanceof RrError && err.kind === 'key') { setMsg({ text: `RadioReference did not accept the app key: ${m}. Check it in User Settings → RadioReference app key.`, tone: 'bad' }); return; }
        if (err instanceof RrError && err.kind === 'login') { setMsg({ text: `Wrong username or password, or the Premium subscription is not active (${m}).`, tone: 'bad' }); return; }
        note = `Could not reach RadioReference to check (${m}); you are logged in on this device.`;
      }
    } else {
      const c = await checkOffline(l.username, l.password);
      if (c === 'wrong') { setBusy(false); setMsg({ text: 'Wrong username or password.', tone: 'bad' }); return; }
      note = c === 'ok' ? 'Logged in (offline).' : 'Logged in. RadioReference checks the password the first time you download.';
    }
    await logIn(l, stay); setBusy(false); setPw('');
    onDone(l, { text: '✓ ' + note, tone: 'ok' });
  };
  return (
    <div className="rr-login">
      <Card title="Log in to RadioReference">
        <form onSubmit={submit} className="stack-tight" autoComplete="off">
          <p className="small muted">Use your RadioReference.com Premium account. Your login is only sent to RadioReference.com.</p>
          <label className="field"><span>Username</span><input autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} value={u} onChange={(e) => setU(e.target.value)} aria-label="RadioReference username" /></label>
          <label className="field"><span>Password</span><span className="row"><input type={show ? 'text' : 'password'} autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="RadioReference password" style={{ flex: 1 }} /><button type="button" className="ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></span></label>
          <label className="check"><input type="checkbox" checked={stay} onChange={(e) => setStay(e.target.checked)} /> <b>Stay logged in</b> on this device</label>
          <p className="small muted" style={{ marginTop: 0 }}>{stay ? 'Your login is kept encrypted on this device until you tap Log out.' : 'You are logged out when the app is closed.'}</p>
          <button className="primary" type="submit" disabled={busy || !u.trim() || !pw}>{busy ? 'Logging in…' : 'Log in'}</button>
          {msg && <p className={msg.tone === 'bad' ? 'bad-text' : msg.tone === 'ok' ? 'ok-text' : 'muted'} role="status">{msg.text}</p>}
          {!key && <p className="note small" data-testid="rr-nokey">The RadioReference app key is not set yet. You can log in now, but downloads need it. <button type="button" onClick={() => go('settings')}>Add it in User Settings →</button></p>}
        </form>
      </Card>
      <p className="small muted">🔒 Frequencies and talkgroups you download are protected information: kept only on this device, encrypted, and shown only while you are logged in.</p>
    </div>
  );
}

/** True while someone is logged in to RadioReference (updates on log in / log out). */
export function useRrLoggedIn() {
  const [on, setOn] = useState(false);
  useEffect(() => { const read = () => loadLogin().then((l) => setOn(!!l)); read(); return onLoginChange(read); }, []);
  return on;
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
  const { project: p, go } = useStore();
  const here = projectPlace(p);
  const on = useRrLoggedIn();
  const d0 = useRrDownload(here.state, here.county ?? '');
  const d = on ? d0 : null;
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
  const on = useRrLoggedIn();
  const d = useRrDownload(here.state, here.county ?? '');
  const [all, setAll] = useState(false);
  const u = useUnits();
  if (d && !on) return <Card title="Public-safety radio here (RadioReference)"><p className="small">🔒 Log in to RadioReference to see the saved channels, bands and donor sites for {here.county}. <button className="ghost" onClick={() => go('radioref')}>Log in</button></p></Card>;
  if (!d) return <Card title="Public-safety channels here (RadioReference)"><p className="small">No RadioReference list saved for {here.county || 'the project county'} yet. <button className="ghost" onClick={() => go('radioref')}>Open RadioReference Frequencies</button></p></Card>;
  const ps = publicSafetyFreqs(d);
  const bands = bandsInUse(d);
  const worst = worstCaseMHz(bands);
  const s0 = p.sites[0], hasPos = s0 && (s0.lat !== 0 || s0.lon !== 0);
  const donors = hasPos ? donorSites(d, s0, s0.antennaAglM || 15).slice(0, all ? 50 : 5) : [];
  const addSite = async (x: DonorSite) => { if (!(await askConfirm({ title: 'Add as a site?', message: 'Add this donor tower as a site in the project? Its position will be saved in the project file.', ok: 'Add site', cancel: 'Cancel' }))) return; update((q) => { q.sites.push({ ...q.sites[0], id: uid(), name: `Donor: ${x.system} ${x.site}`.slice(0, 60), address: '', lat: x.lat, lon: x.lon, groundElevM: null, positionSource: 'RadioReference', positionAccuracyM: null, onBuilding: false }); }); };
  return (
    <Card title="Public-safety radio here (RadioReference)" tip="From the RadioReference list saved (encrypted) on this device for the project county. Used to size the BDA and DAS. Estimates only: always measure the donor signal on the roof.">
      <h4>Bands the BDA must pass</h4>
      {bands.length ? <ul className="small">{bdaAdvice(bands).map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="small muted">No public-safety channels found in the saved list.</p>}
      {worst && <div className="row wrap small"><span>Highest frequency to pass: <b>{MHZ(worst)} MHz</b> (worst case for walls and cable loss).</span>
        <button className="ghost" onClick={() => update((q) => { q.indoor.fMHz = Math.round(worst); })} disabled={Math.round(p.indoor.fMHz) === Math.round(worst)}>Use for Indoor Coverage & DAS</button>
        <button className="ghost" onClick={() => update((q) => { q.radio.fMHz = Math.round(worst * 1000) / 1000; q.radio.bandPreset = 'Custom'; })}>Use for link budget</button></div>}
      {hasPos && donors.length > 0 && <>
        <h4>Nearest trunked tower sites (donor candidates)</h4>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Site</th><th>Distance</th><th>Azimuth to aim</th><th>Est. donor signal</th><th></th></tr></thead>
          <tbody>{donors.map((x, i) => <tr key={i}><td>{x.system}<div className="small muted">{x.site}{x.county ? `, ${x.county}` : ''}</div></td><td className="nowrap">{u.f(x.km, 1)}</td><td className="nowrap">{fmtAz(x.bearing, declinationDeg(s0), 0)}</td>
            <td className="nowrap">{x.estDbm} dBm</td>
            <td className="nowrap"><button className="ghost" onClick={() => update((q) => { q.erces.donorRssiDbm = x.estDbm; })}>Use estimate</button><button className="ghost" onClick={() => update((q) => { q.erces.donorLat = x.lat; q.erces.donorLon = x.lon; q.erces.donorName = `${x.system} ${x.site}`.slice(0, 60); })}>Aim donor here</button><button className="ghost" onClick={() => addSite(x)}>Add as site</button></td></tr>)}</tbody></table></div>
        <p className="small muted">Estimate assumes 100 W ERP from a 60 m tower antenna, a 10 dBi donor antenna aimed at the site, and suburban terrain. Point the donor antenna on the azimuth shown (°T true, °M on a compass) and measure. <button className="ghost" onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show more sites'}</button></p>
      </>}
      {!hasPos && d.systems.length > 0 && <p className="small muted">Set the building position on Site Data & GPS to list the nearest donor towers.</p>}
      <details className="small"><summary>{ps.length} conventional public-safety channels</summary>
        <div className="tbl-wrap" style={{ maxHeight: 220, overflow: 'auto' }}><table className="tbl"><tbody>{ps.slice(0, 200).map((f, i) => <tr key={i}><td className="nowrap">{MHZ(f.out)}</td><td>{f.alpha || f.descr}</td><td className="small muted">{f.where}</td></tr>)}</tbody></table></div></details>
      <button className="ghost" onClick={() => go('radioref')}>See all, with sites and talkgroups</button>
    </Card>
  );
}
