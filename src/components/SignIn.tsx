import React, { useEffect, useRef, useState } from 'react';
import { loadRegistry, signInWithSecret, signInWithBio, checkRecovery, checkBioForReset, resetPassword, lockedFor, currentSession, type Account, type SecretKind } from '../engine/accounts';
import { cancelBio } from '../engine/biometric';

const isAndroidApp = () => typeof window !== 'undefined' && !!(window as unknown as { RadioPlanAndroid?: { bioAvailable?: () => string } }).RadioPlanAndroid?.bioAvailable;

export function Avatar({ a, size = 56 }: { a: Pick<Account, 'name' | 'color'>; size?: number }) {
  return <span className="avatar" style={{ background: a.color, width: size, height: size, fontSize: size * 0.45 }} aria-hidden>{a.name.trim().charAt(0).toUpperCase() || '?'}</span>;
}

/** Choose PIN or password, type it twice, optional hint. */
export function SecretFields({ onChange, label = 'Your PIN or password', initialKind = 'pin' }: { onChange: (v: { secret: string; kind: SecretKind; hint: string; ok: boolean; why: string }) => void; label?: string; initialKind?: SecretKind }) {
  const [kind, setKind] = useState<SecretKind>(initialKind);
  const [a, setA] = useState(''), [b, setB] = useState(''), [hint, setHint] = useState('');
  useEffect(() => {
    const why = kind === 'pin' ? (!/^\d{4,12}$/.test(a) ? 'A PIN is 4 to 12 numbers.' : '') : (a.length < 6 ? 'A password needs at least 6 characters.' : '');
    const same = a === b;
    onChange({ secret: a, kind, hint, ok: !why && same, why: why || (!same && b ? 'The two entries are not the same.' : !b ? 'Type it again to check.' : '') });
  }, [a, b, kind, hint]); // eslint-disable-line react-hooks/exhaustive-deps
  const im = kind === 'pin' ? 'numeric' : 'text';
  return (
    <div className="form signin-fields">
      <div className="row wrap" role="radiogroup" aria-label={label}>
        <label className="check"><input type="radio" checked={kind === 'pin'} onChange={() => { setKind('pin'); setA(''); setB(''); }} /> PIN (numbers only, easiest)</label>
        <label className="check"><input type="radio" checked={kind === 'password'} onChange={() => { setKind('password'); setA(''); setB(''); }} /> Password (letters and numbers)</label>
      </div>
      <label className="field"><span className="field-label">{kind === 'pin' ? 'New PIN (4 to 12 numbers)' : 'New password (6 or more characters)'}</span>
        <input type="password" inputMode={im} autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} data-tour="signin-new-secret" /></label>
      <label className="field"><span className="field-label">Type it again</span>
        <input type="password" inputMode={im} autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></label>
      <label className="field"><span className="field-label">Reminder (optional, shown on the sign-in screen; do not type the {kind === 'pin' ? 'PIN' : 'password'} here)</span>
        <input type="text" maxLength={60} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="for example: my truck number" /></label>
    </div>
  );
}

/** Shows a new recovery code once, with print and copy. */
export function RecoverySheet({ name, code, onDone }: { name: string; code: string; onDone: () => void }) {
  const [ok, setOk] = useState(false);
  const print = () => {
    // A hidden frame prints in the browser and in the installed apps (pop-up windows may be blocked there).
    const f = document.createElement('iframe'); f.style.position = 'fixed'; f.style.width = '0'; f.style.height = '0'; f.style.border = '0'; document.body.appendChild(f);
    const d = f.contentDocument!; const esc = (x: string) => x.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
    d.open(); d.write(`<html><head><title>LvPlan Pro recovery code</title></head><body style="font-family:system-ui;padding:32px"><h2>LvPlan Pro recovery code</h2><p>User: <b>${esc(name)}</b></p><p style="font-size:28px;font-family:monospace;letter-spacing:2px">${esc(code)}</p><p>Use this code on the sign-in screen with <b>Forgot PIN or password?</b> to set a new one. Keep it somewhere safe. Anyone with this code can open this user's projects.</p><p>Made ${new Date().toLocaleString()}</p></body></html>`); d.close();
    setTimeout(() => { try { f.contentWindow?.focus(); f.contentWindow?.print(); } finally { setTimeout(() => f.remove(), 2000); } }, 100);
  };
  return (
    <div className="recovery-sheet" data-tour="signin-recovery">
      <h3>Write down your recovery code</h3>
      <p>If you ever forget your PIN or password, this code lets you set a new one. <b>Nobody else can reset it for you</b>, and without this code or your fingerprint your projects cannot be opened.</p>
      <p className="recovery-code" aria-label="Recovery code">{code}</p>
      <div className="row wrap"><button onClick={print}>🖨 Print it</button><button onClick={() => navigator.clipboard?.writeText(code).catch(() => undefined)}>📋 Copy</button></div>
      <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I wrote it down or printed it and put it somewhere safe</label>
      <button className="primary big" disabled={!ok} onClick={onDone}>Done</button>
    </div>
  );
}

type Mode = { m: 'pick' } | { m: 'secret'; a: Account } | { m: 'forgot'; a: Account } | { m: 'newpw'; a: Account; key: Uint8Array };

/** Before the app opens: who is using it? Shows nothing when sign-in is turned off. */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'open' | 'signin'>('checking');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mode, setMode] = useState<Mode>({ m: 'pick' });
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [code, setCode] = useState('');
  const [np, setNp] = useState<{ secret: string; kind: SecretKind; hint: string; ok: boolean; why: string } | null>(null);
  const [, tick] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { (async () => {
    if (currentSession()) { setState('open'); return; }
    const r = await loadRegistry().catch(() => null);
    if (!r || !r.accounts.length) { setState('open'); return; }
    setAccounts(r.accounts); setState('signin');
    const last = r.accounts.find((a) => a.id === r.lastUser);
    if (r.accounts.length === 1 || last) choose(last ?? r.accounts[0], false);
  })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state !== 'signin') return; const iv = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(iv); }, [state]);
  useEffect(() => { if (mode.m === 'secret') setTimeout(() => input.current?.focus(), 50); }, [mode]);

  const refresh = async () => { const r = await loadRegistry(); setAccounts(r.accounts); return r.accounts; };
  const done = () => { setState('open'); setBusy(''); };
  const choose = (a: Account, autoBio = true) => { setMode({ m: 'secret', a }); setSecret(''); setMsg(''); if (autoBio && a.bio && !lockedFor(a)) bio(a); };
  const bio = async (a: Account) => {
    setBusy(isAndroidApp() ? 'Touch the fingerprint sensor…' : 'Follow the fingerprint or face prompt…'); setMsg('');
    try { await signInWithBio(a.id); done(); } catch (e) { setBusy(''); const m = (e as Error).message; if (!/cancel|not allowed|abort/i.test(m)) setMsg(m); else setMsg(`Fingerprint cancelled. Type your ${a.kind === 'pin' ? 'PIN' : 'password'} instead.`); }
  };
  const go = async (a: Account) => {
    if (!secret) return;
    setBusy('Checking…'); setMsg('');
    try { await signInWithSecret(a.id, secret); done(); } catch (e) { setBusy(''); setSecret(''); setMsg((e as Error).message); await refresh(); }
  };

  if (state === 'checking') return <div className="signin"><div className="signin-box"><p>Starting…</p></div></div>;
  if (state === 'open') return <>{children}</>;
  const fresh = (a: Account) => accounts.find((x) => x.id === a.id) ?? a;
  const word = (a: Account) => (a.kind === 'pin' ? 'PIN' : 'password');

  return (
    <div className="signin" data-tour="signin">
      <div className="signin-box">
        <div className="brand big"><span className="logo">◉</span> LvPlan <b>Pro</b></div>
        {mode.m === 'pick' && <>
          <h2>Who is using LvPlan Pro?</h2>
          <div className="user-tiles">
            {accounts.map((a) => <button key={a.id} className="user-tile" onClick={() => choose(a)}><Avatar a={a} /><span>{a.name}</span>{a.bio && <small>👆 {a.bio.label}</small>}</button>)}
          </div>
          <p className="small muted">Each person has their own private projects. Ask the owner of this device to add you in Projects & settings → Users & Sign-in.</p>
        </>}

        {mode.m === 'secret' && (() => { const a = fresh(mode.a); const wait = lockedFor(a); return <>
          <div className="signin-who"><Avatar a={a} size={72} /><h2>{a.name}</h2></div>
          {a.bio && <button className="primary big" disabled={!!busy || !!wait} onClick={() => bio(a)}>👆 Sign in with {a.bio.label}</button>}
          <form onSubmit={(e) => { e.preventDefault(); go(a); }} className="form">
            <label className="field"><span className="field-label">{a.kind === 'pin' ? 'PIN' : 'Password'}</span>
              <input ref={input} type="password" inputMode={a.kind === 'pin' ? 'numeric' : 'text'} autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} disabled={!!wait} aria-label={a.kind === 'pin' ? 'PIN' : 'Password'} data-tour="signin-secret" /></label>
            {a.hint && <p className="small muted">Reminder: {a.hint}</p>}
            <button type="submit" className={a.bio ? 'big' : 'primary big'} disabled={!secret || !!busy || !!wait}>Sign in</button>
          </form>
          {wait > 0 && <p className="bad-text">Too many wrong tries. Try again in {Math.ceil(wait / 1000)} seconds.</p>}
          <div className="row wrap signin-links">
            <button className="link" onClick={() => { setMode({ m: 'forgot', a }); setMsg(''); setCode(''); }} data-tour="signin-forgot">Forgot {word(a)}?</button>
            {accounts.length > 1 && <button className="link" onClick={() => { setMode({ m: 'pick' }); setMsg(''); }}>Someone else</button>}
          </div>
        </>; })()}

        {mode.m === 'forgot' && (() => { const a = fresh(mode.a); return <>
          <div className="signin-who"><Avatar a={a} size={56} /><h2>Set a new {word(a)} for {a.name}</h2></div>
          <p>To keep each person's projects private, a {word(a)} can only be reset by the person who owns it, with one of these:</p>
          {a.bio && <button className="primary big" disabled={!!busy} onClick={async () => { setBusy('Follow the fingerprint prompt…'); setMsg(''); try { const key = await checkBioForReset(a.id); setBusy(''); setMode({ m: 'newpw', a, key }); } catch (e) { setBusy(''); setMsg((e as Error).message); } }}>👆 Use my {a.bio.label}</button>}
          <form className="form" onSubmit={async (e) => { e.preventDefault(); setBusy('Checking…'); setMsg(''); try { const key = await checkRecovery(a.id, code); setBusy(''); setMode({ m: 'newpw', a, key }); } catch (err) { setBusy(''); setMsg((err as Error).message); await refresh(); } }}>
            <label className="field"><span className="field-label">Recovery code (the 20 letters and numbers you wrote down or printed)</span>
              <input type="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH-JKLM-NPQR-STUV" data-tour="signin-recovery-code" /></label>
            <button type="submit" className={a.bio ? 'big' : 'primary big'} disabled={code.replace(/[^a-z0-9]/gi, '').length < 20 || !!busy}>Use recovery code</button>
          </form>
          <p className="small muted">Lost both? The device owner can remove this user and add them again, but the old projects cannot be opened without the code or fingerprint.</p>
          <button className="link" onClick={() => choose(a, false)}>← Back to sign in</button>
        </>; })()}

        {mode.m === 'newpw' && <>
          <h2>Choose a new {mode.a.kind === 'pin' ? 'PIN' : 'password'}</h2>
          <SecretFields initialKind={mode.a.kind} onChange={setNp} />
          {np && !np.ok && np.why && <p className="small muted">{np.why}</p>}
          <button className="primary big" disabled={!np?.ok || !!busy} onClick={async () => { if (!np) return; setBusy('Saving…'); try { await resetPassword(mode.a.id, mode.key, np.secret, np.kind, np.hint); done(); } catch (e) { setBusy(''); setMsg((e as Error).message); } }}>Save and sign in</button>
          <p className="small muted">Your recovery code still works. You can make a new one after signing in (Users & Sign-in).</p>
        </>}

        {busy && <p className="note" aria-live="polite">{busy} {busy.includes('fingerprint') || busy.includes('Touch') ? <button onClick={() => { cancelBio(); setBusy(''); }}>Cancel</button> : null}</p>}
        {msg && <p className="bad-text" aria-live="polite">{msg}</p>}
      </div>
    </div>
  );
}
