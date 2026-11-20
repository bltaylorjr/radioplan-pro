import React, { useEffect, useState } from 'react';
import { useStore, downloadText, safeName } from '../store';
import { Card } from '../components/ui';
import { askConfirm, askDelete } from '../components/askConfirm';
import { Avatar, SecretFields, RecoverySheet } from '../components/SignIn';
import { loadRegistry, currentUser, enableSignIn, addUser, removeUser, disableSignIn, changePassword, makeNewRecoveryCode, setUpBio, removeBio, signOut, readInbox, onSessionChange, type Account, type SecretKind, type InboxItem } from '../engine/accounts';
import { bioSupport, type BioSupport } from '../engine/biometric';
import { teamWith, inviteUsers, acceptInvite, declineInvite, leaveTeam } from '../engine/team';
import { protectText, unprotectText, isProtectedFile } from '../engine/vault';
import { mergeProjects, stampSync, toPackage, fromPackage } from '../engine/sync';
import { deviceInfo } from '../store';
import { safeJsonParse, readBackup } from '../engine/projectdb';
import { notify } from '../engine/carelog';
import type { Project } from '../types';

type NewSecret = { secret: string; kind: SecretKind; hint: string; ok: boolean; why: string };
const fmtDate = (t?: number) => (t ? new Date(t).toLocaleString() : 'never');

/** Projects & settings → Users & Sign-in: sign-in, fingerprint, password reset, users, and working together. */
export function UsersPage() {
  const { project: p, update, replace, lib, go } = useStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [me, setMe] = useState<Account | null>(currentUser());
  const [sup, setSup] = useState<BioSupport | null>(null);
  const [name, setName] = useState('');
  const [sec, setSec] = useState<NewSecret | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [recovery, setRecovery] = useState<{ name: string; code: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [filePw, setFilePw] = useState('');
  const [pending, setPending] = useState<{ name: string; text: string } | null>(null);
  const [openPw, setOpenPw] = useState('');

  const refresh = async () => { setAccounts((await loadRegistry()).accounts); setMe(currentUser()); if (currentUser()) setInbox((await readInbox().catch(() => [])).filter((i) => i.kind === 'invite')); };
  useEffect(() => { refresh(); bioSupport().then(setSup); return onSessionChange(() => setMe(currentUser())); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const iv = setInterval(refresh, 15000); return () => clearInterval(iv); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (label: string, f: () => Promise<void>) => { setBusy(label); setMsg(''); try { await f(); } catch (e) { const m = (e as Error).message; if (!/cancel|not allowed|abort/i.test(m)) setMsg(m); } setBusy(''); refresh(); };
  const others = accounts.filter((a) => a.id !== me?.id);
  const word = (a: Account) => (a.kind === 'pin' ? 'PIN' : 'password');

  if (recovery) return <div className="stack"><Card title="Recovery code"><RecoverySheet name={recovery.name} code={recovery.code} onDone={() => setRecovery(null)} /></Card></div>;

  // ---------- sign-in off ----------
  if (!me) return (
    <div className="stack">
      <Card title="Turn on sign-in" tour="users-enable" tip="Sign-in is off until you turn it on. Then the app asks who is using it each time it starts, and each person's projects are locked with their own key.">
        <p>Turn this on when more than one person uses this {/Android/i.test(navigator.userAgent) ? 'phone or tablet' : 'computer'}, or to protect your projects with a PIN or fingerprint.</p>
        <ul className="small">
          <li>You become the <b>owner</b>. All projects already in the app become yours.</li>
          <li>Each person you add gets their own private projects. Nobody else can open them, not even the owner.</li>
          <li>You get a <b>recovery code</b> to write down, for when a PIN or password is forgotten.</li>
          <li>Everything stays on this device and works without internet.</li>
        </ul>
        <div className="form"><label className="field"><span className="field-label">Your name</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="for example: Bobby" data-tour="users-name" /></label></div>
        <SecretFields onChange={setSec} />
        {sec && !sec.ok && sec.why && <p className="small muted">{sec.why}</p>}
        <button className="primary big" disabled={!name.trim() || !sec?.ok || !!busy} onClick={() => run('Turning on sign-in…', async () => {
          const r = await enableSignIn(name, sec!.secret, sec!.kind, sec!.hint, (m) => setBusy(m));
          await lib.saveNow('Before turning on sign-in', 'safety').catch(() => undefined);
          setRecovery({ name: r.session.account.name, code: r.recoveryCode });
          notify(`🔒 Sign-in is on. Your projects are locked with your ${sec!.kind === 'pin' ? 'PIN' : 'password'}.`);
        })}>🔒 Turn on sign-in</button>
        {busy && <p className="note">{busy}</p>}{msg && <p className="bad-text">{msg}</p>}
      </Card>
    </div>
  );

  // ---------- signed in ----------
  const isShared = !!p.team;
  const teamOthers = (p.team?.members ?? []).filter((m) => m.id !== me.id);
  const stamped = (x: Project): Project => { const s = stampSync(x, deviceInfo()); return s ? { ...x, sync: s } : x; };

  const share = () => run('Sharing…', async () => {
    const add = accounts.filter((a) => pick.includes(a.id)).map((a) => ({ id: a.id, name: a.name }));
    const team = teamWith(p, add);
    const next = { ...p, team };
    update((d) => { d.team = team; });
    await inviteUsers(next, pick, lib.projectId);
    setPick([]); setMsg(`Shared with ${add.map((a) => a.name).join(', ')}. They will see it in "Shared with you" next time they sign in.`);
  });
  const leave = () => run('Leaving…', async () => {
    if (!(await askConfirm({ title: 'Stop working together?', message: <>Your copy of <b>“{p.meta.name}”</b> stays yours. The others keep theirs, and changes stop going between you.</>, ok: 'Stop sharing' }))) return;
    replace(await leaveTeam(p));
  });
  const saveProtected = () => run('Locking the file…', async () => {
    if (filePw.length < 6) throw new Error('Use a file password with at least 6 characters, and tell it to your coworker by phone or in person (not in the same email).');
    const f = await protectText(filePw, JSON.stringify(toPackage(stamped(p))), `${p.meta.name} from ${me.name}`);
    downloadText(`${safeName(p.meta.name)}.lvshare.json`, JSON.stringify(f), 'application/json');
    setMsg('Saved. Send the file to your coworker (email, Bluetooth, USB or a cloud drive), and tell them the password another way.');
  });
  const pickFile = async (file?: File) => {
    if (!file) return; setMsg('');
    const text = await file.text();
    try { const j = safeJsonParse(text); if (isProtectedFile(j)) { setPending({ name: file.name, text }); setOpenPw(''); return; } } catch { /* not JSON */ }
    await bringIn(text, file.name);
  };
  const bringIn = async (text: string, from: string) => {
    let remote: Project; try { remote = fromPackage(text); } catch { remote = readBackup(text)[0].project; }
    const local = stamped(p);
    if (remote.sync && local.sync && remote.sync.projectId === local.sync.projectId) {
      const { project, report } = mergeProjects(local, stamped(remote)); replace(project);
      setMsg(`Merged ${report.remoteDevice}'s changes from ${from} into this project.`);
    } else {
      const ids = await lib.importProjects(readBackup(text)); if (ids[0]) await lib.openProject(ids[0]);
      setMsg(`Added “${remote.meta?.name}” from ${from} to your projects and opened it.`);
    }
  };

  return (
    <div className="stack">
      <div className="grid2">
        <Card title="You" tour="users-me">
          <div className="signin-who left"><Avatar a={me} size={56} /><div><h3 style={{ margin: 0 }}>{me.name}{me.owner ? ' (owner)' : ''}</h3><span className="small muted">Signed in {fmtDate(me.lastSignIn)}</span></div></div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => signOut()} data-tour="users-signout">🚪 Sign out / switch user</button>
            <button onClick={() => { setChanging(!changing); setSec(null); }}>🔑 Change my {word(me)}</button>
            <button onClick={() => run('Making a new recovery code…', async () => { if (!(await askConfirm({ title: 'New recovery code?', message: 'Your old recovery code will stop working. Write down the new one.', ok: 'Make a new code' }))) return; setRecovery({ name: me.name, code: await makeNewRecoveryCode() }); })}>🧾 New recovery code</button>
          </div>
          {changing && <div className="sub-card">
            <SecretFields initialKind={me.kind} onChange={setSec} />
            {sec && !sec.ok && sec.why && <p className="small muted">{sec.why}</p>}
            <button className="primary" disabled={!sec?.ok || !!busy} onClick={() => run('Saving…', async () => { await changePassword(sec!.secret, sec!.kind, sec!.hint); setChanging(false); setMsg(`Your ${sec!.kind === 'pin' ? 'PIN' : 'password'} is changed.`); })}>Save new {sec?.kind === 'password' ? 'password' : 'PIN'}</button>
          </div>}
          <h4>Fingerprint or face sign-in</h4>
          {me.bio ? <>
            <p className="small">✓ On: {me.bio.label}. It also lets you reset your {word(me)} if you forget it.</p>
            <div className="row wrap"><button onClick={() => run('Follow the prompt…', async () => { const l = await setUpBio(); setMsg(`${l} set up again.`); })}>Set up again</button>
              <button onClick={() => run('Turning off…', async () => { await removeBio(); setMsg('Fingerprint sign-in is off. Use your PIN or password.'); })}>Turn off</button></div>
          </> : sup?.kind ? <>
            <p className="small">Sign in with a touch instead of typing. Your {word(me)} still works too.</p>
            <button className="primary" data-tour="users-bio" onClick={() => run('Follow the fingerprint or face prompt…', async () => { const l = await setUpBio(); setMsg(`✓ ${l} sign-in is on. Next time, just touch the sensor.`); })}>👆 Set up {sup.label}</button>
          </> : <p className="small muted">{sup && !sup.kind ? sup.why : 'Checking this device…'}</p>}
        </Card>

        <Card title="Users on this device" tour="users-list" tip="Each user has their own projects, history, library, contacts and settings. They are locked with that user's own key.">
          <ul className="user-list">
            {accounts.map((a) => <li key={a.id}><Avatar a={a} size={32} /> <b>{a.name}</b>{a.owner && <span className="small muted"> owner</span>}{a.id === me.id && <span className="small muted"> (you)</span>}
              <span className="small muted"> · {a.bio ? `👆 ${a.bio.label}` : word(a)} · last sign-in {fmtDate(a.lastSignIn)}</span>
              {me.owner && !a.owner && <button className="ghost" onClick={async () => { if (await askDelete(<>the user <b>{a.name}</b> and <b>all their projects</b> on this device</>, 'Their projects cannot be opened by anyone else, so they cannot be moved first. Ask them to export what they need.')) run('Removing…', () => removeUser(a.id)); }}>Remove</button>}
            </li>)}
          </ul>
          {me.owner ? <>
            {!adding ? <button className="primary" data-tour="users-add" onClick={() => { setAdding(true); setName(''); setSec(null); }}>＋ Add a user</button> : <div className="sub-card">
              <p className="small"><b>Hand the device to the new person</b> so they can type their own PIN or password. You will not need to know it.</p>
              <div className="form"><label className="field"><span className="field-label">Their name</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label></div>
              <SecretFields onChange={setSec} />
              {sec && !sec.ok && sec.why && <p className="small muted">{sec.why}</p>}
              <div className="row wrap"><button className="primary" disabled={!name.trim() || !sec?.ok || !!busy} onClick={() => run('Adding…', async () => { const r = await addUser(name, sec!.secret, sec!.kind, sec!.hint); setAdding(false); setRecovery({ name: r.account.name, code: r.recoveryCode }); })}>Add user</button><button onClick={() => setAdding(false)}>Cancel</button></div>
            </div>}
            {others.length === 0 && <p className="small"><button className="link" onClick={() => run('Turning off sign-in…', async () => { if (!(await askConfirm({ title: 'Turn off sign-in?', message: 'The app will open without asking who you are, and your projects will no longer be locked with your PIN or password.', ok: 'Turn off sign-in', danger: true }))) return; await disableSignIn((m) => setBusy(m)); location.reload(); })}>Turn off sign-in</button></p>}
          </> : <p className="small muted">Only the owner can add or remove users.</p>}
        </Card>
      </div>

      <div className="grid2">
        <Card title="Work together on this project" tour="users-team" tip="Share a project with other users. Each person keeps a full copy that works offline; changes are merged section by section, newest change wins, and lists like sites, notes, tests and photos are combined.">
          {isShared ? <>
            <p className="small">🤝 Shared with: <b>{teamOthers.map((m) => m.name).join(', ') || 'nobody else yet'}</b>. On this device, your changes reach them on their next sign-in, and theirs come to you by themselves.</p>
            <button onClick={leave}>Stop working together</button>
          </> : <p className="small">This project is only yours. Share it with someone below.</p>}
          {others.length > 0 && <>
            <h4>Share with users on this device</h4>
            <div className="tool-list">{others.filter((a) => !p.team?.members.some((m) => m.id === a.id)).map((a) => <label key={a.id} className="check"><input type="checkbox" checked={pick.includes(a.id)} onChange={(e) => setPick((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))} /> {a.name}</label>)}</div>
            <button className="primary" data-tour="users-share" disabled={!pick.length || !!busy} onClick={share}>🤝 Share “{p.meta.name}”</button>
          </>}
          <h4>Shared with you</h4>
          {inbox.length ? <ul className="user-list">{inbox.map((it) => <li key={it.key}><b>{it.projectName}</b> <span className="small muted">from {it.from.name}, {fmtDate(it.at)}</span>
            <button className="primary" onClick={() => run('Adding…', async () => { const id = await acceptInvite(it, async (proj) => (await lib.importProjects(readBackup(JSON.stringify(proj))))[0]); await lib.openProject(id); setMsg(`“${it.projectName}” is in your projects and open now.`); })}>Open and join</button>
            <button onClick={() => run('…', async () => { await declineInvite(it); })}>No thanks</button></li>)}</ul> : <p className="small muted">Nothing new.</p>}
        </Card>

        <Card title="Coworkers on other devices" tour="users-files" tip="For someone using their own phone or computer. Works offline: send the file any way you like. Online automatic sync through the LvPlan website is planned for later.">
          <p className="small">Lock a copy of this project with a file password, send it any way you like, and tell them the password by phone or in person. When they send their copy back, open it here and the changes are merged in.</p>
          <div className="form"><label className="field"><span className="field-label">File password (6 or more characters)</span><input type="password" autoComplete="new-password" value={filePw} onChange={(e) => setFilePw(e.target.value)} /></label></div>
          <div className="row wrap">
            <button className="primary" disabled={!filePw || !!busy} onClick={saveProtected}>🔒 Save a locked copy to send</button>
            <label className="btn">📥 Open a copy from a coworker<input hidden type="file" accept=".json,application/json" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          </div>
          {pending && <div className="sub-card">
            <p className="small">“{pending.name}” is locked. Type the file password your coworker gave you.</p>
            <div className="row"><input type="password" value={openPw} onChange={(e) => setOpenPw(e.target.value)} aria-label="File password" /><button className="primary" disabled={!openPw} onClick={() => run('Opening…', async () => { const t = await unprotectText(openPw, safeJsonParse(pending.text)); if (t == null) throw new Error('That file password is not right.'); setPending(null); await bringIn(t, pending.name); })}>Open</button><button onClick={() => setPending(null)}>Cancel</button></div>
          </div>}
          <p className="small muted">For automatic syncing between your own devices over Wi-Fi, Bluetooth or a cloud folder, use <a href="#sync" onClick={(e) => { e.preventDefault(); go('sync'); }}>Sync Devices</a>.</p>
        </Card>
      </div>
      {busy && <p className="note" aria-live="polite">{busy}</p>}
      {msg && <p className="note" aria-live="polite">{msg}</p>}
    </div>
  );
}
