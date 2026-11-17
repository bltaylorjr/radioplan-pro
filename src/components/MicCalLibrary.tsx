import React, { useEffect, useMemo, useState } from 'react';
import { DropZone } from './DropZone';
import { BUILTIN_CALS, KIND_LABEL, calAt, calFromFile, deleteUserCal, loadUserCals, saveUserCal, searchCals, type CalKind, type MicCal } from '../engine/miccal';

/** Small picture of a calibration curve (20 Hz to 20 kHz, ±12 dB). */
export function CalCurve({ c, w = 160, h = 44 }: { c: { f: number[]; db: number[] }; w?: number; h?: number }) {
  const pts: string[] = []; for (let i = 0; i <= 60; i++) { const f = 20 * 1000 ** (i / 60), d = Math.max(-12, Math.min(12, calAt(c, f))); pts.push(`${(i / 60 * w).toFixed(1)},${(h / 2 - d / 12 * (h / 2 - 2)).toFixed(1)}`); }
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Calibration curve, 20 Hz to 20 kHz" style={{ background: 'var(--card2, rgba(127,127,127,.08))', borderRadius: 4, flex: 'none' }}>
    <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="3 3" />
    <polyline points={pts.join(' ')} fill="none" stroke="var(--accent, #2b7bd6)" strokeWidth={1.6} /></svg>;
}

type Filter = 'all' | 'mine' | CalKind;
/** Microphone calibration: what is active, a searchable library of built-in curves and the user's own files, and file upload. */
export function MicCalPanel({ active, onPick, onError }: { active: MicCal | null; onPick: (c: MicCal | null) => void; onError: (msg: string) => void }) {
  const [mine, setMine] = useState<MicCal[]>([]); const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [kind, setKind] = useState<Filter>('all'); const [msg, setMsg] = useState('');
  useEffect(() => { loadUserCals().then(setMine).catch(() => {}); }, []);
  const lib = useMemo(() => [...mine, ...BUILTIN_CALS], [mine]);
  const shown = useMemo(() => searchCals(lib, q, kind), [lib, q, kind]);
  const addFiles = async (fs: File[]) => {
    setMsg(''); let last: MicCal | null = null; const bad: string[] = [];
    for (const f of fs) { try { const c = calFromFile(f.name, await f.text()); setMine(await saveUserCal(c)); last = c; } catch (e) { bad.push(`${f.name}: ${(e as Error).message}`); } }
    if (last) { onPick(last); setMsg(`Added and turned on: ${last.name}. It is saved in the app and works offline.`); }
    onError(bad.join(' '));
  };
  const sourceText = (c: MicCal) => c.source === 'file' ? 'your own file' : c.kind === 'flat' ? 'no correction' : 'typical curve';
  return <div className="miccal">
    <div className="row wrap" style={{ alignItems: 'center', gap: 10 }}>
      {active ? <>
        <span className="badge badge-real" role="status" data-testid="cal-active">✓ Mic calibration on</span>
        <span><b>{active.name}</b> <span className="small muted">({sourceText(active)}{active.auto ? ', picked automatically from the input name' : ''})</span></span>
        <CalCurve c={active} />
        <button className="ghost" onClick={() => onPick(null)}>Remove calibration</button>
      </> : <><span className="badge badge-beta" role="status" data-testid="cal-active">No mic calibration</span><span className="small muted">Readings are not corrected for the microphone. Pick your mic below.</span></>}
      <button onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close calibration library' : '📚 Calibration library'}</button>
    </div>
    {active && active.source !== 'file' && active.kind !== 'flat' && <p className="small muted">A typical curve fixes the general shape of this model. For the best accuracy, add the file made for your mic's serial number (miniDSP and Dayton let you download it from their website using the serial number on the mic).</p>}
    {open && <div className="card2" style={{ marginTop: 8, padding: 10, border: '1px solid var(--line, #ccd)', borderRadius: 6 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: brand, model or serial (e.g. UMIK, iPhone)" aria-label="Search calibration library" style={{ flex: 1, minWidth: 200 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value as Filter)} aria-label="Show" style={{ width: 'auto' }} data-no-choose>
          <option value="all">All ({lib.length})</option><option value="mine">My files ({mine.length})</option><option value="measurement">Measurement mics</option><option value="phone">Phones</option><option value="tablet">Tablets</option><option value="computer">Computers and headsets</option>
        </select>
      </div>
      <DropZone accept=".txt,.cal,.frd,.csv,.mic" multiple compact onFiles={addFiles} label="Add my mic's own calibration file" hint=".txt, .cal, .frd or .csv (miniDSP, Dayton, REW). Saved in the app, works offline." />
      {msg && <p className="ok-text small" role="status">{msg}</p>}
      <div role="list" aria-label="Calibration library" style={{ maxHeight: 360, overflowY: 'auto', marginTop: 6 }}>
        {shown.map((c) => <div role="listitem" key={c.id} className="row" style={{ alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line, rgba(127,127,127,.2))' }}>
          <CalCurve c={c} w={96} h={30} />
          <div style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b> <span className="small muted">· {c.source === 'file' ? 'My file' : KIND_LABEL[c.kind]}</span>{c.sensDb != null && <span className="small muted"> · sens {c.sensDb} dB</span>}
            {c.note && <div className="small muted">{c.note}</div>}</div>
          {active?.id === c.id ? <span className="badge badge-real">In use</span> : <button onClick={() => { onPick(c); setMsg(''); }}>Use</button>}
          {c.source === 'file' && <button className="ghost" title="Delete this file from the app" onClick={async () => { setMine(await deleteUserCal(c.id)); if (active?.id === c.id) onPick(null); }}>Delete</button>}
        </div>)}
        {!shown.length && <p className="small muted">Nothing matches. Try another word, or add your mic's file above.</p>}
      </div>
      <p className="small muted">Built-in curves are typical shapes made by LvPlan from each model's published specifications, not the maker's own files. Phone and laptop curves are rough: remove the case and point the bottom of the phone at the sound.</p>
    </div>}
  </div>;
}
