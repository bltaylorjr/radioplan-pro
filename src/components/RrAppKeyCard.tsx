import React, { useEffect, useState } from 'react';
import { Card } from './ui';
import { loadAppKey, saveAppKey, onLoginChange } from '../engine/radioref';
import { askConfirm, askDelete } from './askConfirm';

const APPLY_URL = 'https://www.radioreference.com/account/api/apply';

/** User Settings card: the RadioReference app key, with a warning not to change it. */
export function RrAppKeyCard() {
  const [key, setKey] = useState(''), [loaded, setLoaded] = useState(false), [edit, setEdit] = useState(false), [draft, setDraft] = useState(''), [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { const read = () => loadAppKey().then((k) => { setKey(k); setLoaded(true); }); read(); return onLoginChange(read); }, []);
  const masked = key.length > 4 ? '•'.repeat(Math.min(12, key.length - 4)) + key.slice(-4) : '••••';
  const change = async () => {
    const ok = await askConfirm({ title: 'Change the app key?', danger: true, ok: 'Yes, change it', cancel: 'No, keep it', message: <><p><b>Do not change the app key</b> unless RadioReference sent you a new one.</p><p className="small muted">A wrong key stops every RadioReference download until the right key is put back.</p></> });
    if (ok) { setDraft(key); setEdit(true); setMsg(null); }
  };
  const save = async () => {
    if (key && !draft.trim() && !(await askDelete('Remove the RadioReference app key?', 'Downloads stop until the key is entered again.'))) return;
    await saveAppKey(draft); setEdit(false); setShow(false);
    setMsg(draft.trim() ? '✓ App key saved.' : 'App key removed.');
  };
  return (
    <Card title="RadioReference app key" className="wide" tour="rr-appkey">
      <p className="warn-text" role="note" data-testid="rr-key-warning">⚠ <b>Do not change this.</b> The app key identifies LvPlan Pro to RadioReference. Changing or deleting it stops RadioReference downloads until the right key is entered again. Your username and password are on the RadioReference page.</p>
      {!loaded ? null : key && !edit ? <>
        <div className="row wrap">
          <span>App key saved ✓ <code aria-label="Saved app key">{show ? key : masked}</code></span>
          <button className="ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          <button className="ghost" onClick={change}>Change…</button>
        </div>
      </> : <>
        <label className="field"><span>App key (from RadioReference, one time)</span><input autoComplete="off" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="RadioReference app key" placeholder="paste the key RadioReference emailed you" /></label>
        <div className="row wrap">
          <button className="primary" onClick={save} disabled={!key && !draft.trim()}>Save app key</button>
          {edit && <button className="ghost" onClick={() => { setEdit(false); setDraft(''); }}>Cancel (keep the saved key)</button>}
        </div>
        {!key && <details className="small"><summary>How to get the app key (one time)</summary><ol>
          <li>Sign in at RadioReference.com with your Premium account.</li>
          <li>Open <a href={APPLY_URL} target="_blank" rel="noreferrer">the API key application page ↗</a>.</li>
          <li>Describe the app: “LvPlan Pro, an internal, single-user tool for my low-voltage company. It looks up public-safety frequencies, trunked sites and talkgroups for the county of a job, to design and test in-building emergency radio (ERCES / BDA / DAS) and program radios. Only I use it, with my own Premium login. Data stays on my device and is not shared or published.”</li>
          <li>When RadioReference emails the key, paste it in the box above and tap Save.</li>
        </ol></details>}
      </>}
      {msg && <p className="ok-text small" role="status">{msg}</p>}
      <p className="small muted">🔒 Kept encrypted on this device only. It is never put in project files, backups, exports or Sync Devices.</p>
    </Card>
  );
}
