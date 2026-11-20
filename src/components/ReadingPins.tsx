// Reading pins panel shared by every heat map: drop a pin (tap the map or plan, or use GPS), type the reading,
// add a note and a photo, then see the signal balance check and plain-language advice for that system.
import React, { useMemo, useState } from 'react';
import { useStore, downloadText, safeName } from '../store';
import { Num, Stat, Tip, fmt } from './ui';
import { useUnits } from '../units';
import { toCsv } from '../engine/csv';
import { analyzeBalance, normFor, fmtQ, QTY, shrinkPhoto, pinColor, pinsCsvRows, type BPoint, type BSource, type Qty } from '../engine/balance';
import { sysLabel } from '../engine/models';

export interface PinRow { id: string; v: number; pred?: number | null; where: string; at?: string; note?: string; photo?: string; critical?: boolean; src?: string; readOnly?: boolean }
export interface PinDraft { v: number; note?: string; photo?: string; critical?: boolean }

const TONE: Record<string, string> = { ok: 'okbox', warn: 'warnbox', bad: 'warnbox bad', info: 'note' };
const ICON: Record<string, string> = { ok: '✅', coverage: '📶', raise: '🔼', lower: '🔽', balance: '⚖', add: '➕', move: '↔', tilt: '📐', model: '🧪', device: '🔧', uniform: '〰', code: '📘', info: 'ℹ' };

/** The shared panel. `pending` is where the next pin goes (set by the map or plan); `onSave` stores it. */
export function PinsPanel({ system, systems, onSystem, armed, setArmed, pending, onCancel, onSave, onGps, rows, points, sources, outdoor, targetKey, onDelete, title = 'Reading pins and signal balance', canDrop = true, dropHint, defaults }: {
  system: string; systems?: string[]; onSystem?: (s: string) => void;
  armed: boolean; setArmed: (v: boolean) => void;
  pending: { where: string } | null; onCancel: () => void; onSave?: (d: PinDraft) => void; onGps?: () => void;
  rows: PinRow[]; points: BPoint[]; sources: BSource[]; outdoor?: boolean; targetKey: string;
  onDelete?: (id: string) => void; title?: string; canDrop?: boolean; dropHint?: string;
  /** The page's own target, used until the user changes it here. */ defaults?: { target?: number; hot?: number };
}) {
  const { project: p, update } = useStore();
  const u = useUnits();
  const nm = normFor(system), q: Qty = nm.qty, unit = QTY[q].unit;
  const saved = p.pinTargets?.[`${targetKey}|${system}`];
  const target = saved?.target ?? defaults?.target ?? nm.target, hot = saved?.hot ?? defaults?.hot ?? nm.hot;
  const setT = (k: 'target' | 'hot', v: number | null) => update((d) => { const key = `${targetKey}|${system}`; d.pinTargets = { ...(d.pinTargets ?? {}), [key]: { ...(d.pinTargets?.[key] ?? {}), [k]: v ?? undefined } }; });
  const res = useMemo(() => analyzeBalance(points, sources, { system, target, hot, outdoor, fmtLen: (m) => u.len(m, 0) }), [points, sources, system, target, hot, outdoor, u.unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const [val, setVal] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [critical, setCritical] = useState(false);
  const [err, setErr] = useState('');
  const srcName = (id?: string) => sources.find((s) => s.id === id)?.label ?? '';
  const save = () => {
    if (val == null || !Number.isFinite(val)) { setErr(`Type the ${QTY[q].word} your meter shows, for example ${QTY[q].example} ${unit}.`); return; }
    if (q === 'dbm' && val > 0) { setErr('Signal levels in dBm are negative, for example -87.'); return; }
    if (q !== 'dbm' && val < 0) { setErr(`${QTY[q].label} cannot be negative.`); return; }
    onSave?.({ v: Math.round(val * 10) / 10, note: note.trim() || undefined, photo, critical: critical || undefined });
    setVal(null); setNote(''); setPhoto(undefined); setCritical(false); setErr('');
  };
  const addPhoto = async (f?: File) => { if (!f) return; try { setPhoto(await shrinkPhoto(f)); } catch (e) { setErr((e as Error).message); } };
  const assigned = useMemo(() => new Map(points.map((pt) => [pt.id, pt.src])), [points]);
  return (
    <div className="pins-panel" data-tour="pins-panel">
      <div className="row wrap toolbar">
        <b>📌 {title}</b>
        {canDrop && onSave && <button className={armed ? 'primary' : ''} aria-pressed={armed} onClick={() => setArmed(!armed)} data-tour="pins-drop" title="Then tap the heat map where you took the reading">{armed ? '✋ Stop dropping pins' : '📌 Drop a reading pin'}</button>}
        {canDrop && onSave && onGps && <button onClick={onGps} title="Put the pin where you are standing (GPS)">📍 Pin at my GPS position</button>}
        {systems && systems.length > 1 && onSystem && <select value={system} onChange={(e) => onSystem(e.target.value)} aria-label="System measured" data-no-choose>{systems.map((s) => <option key={s} value={s}>{pinSysLabel(s)}</option>)}</select>}
        <Tip text={`Drop a pin where you measured, type what the meter shows, and add a note or photo. Each pin is compared with the target and the prediction; the advice below says what to turn up, turn down, move or add to balance the ${QTY[q].word}. ${nm.note}`} />
      </div>
      {armed && !pending && canDrop && <p className="note small">{dropHint ?? 'Tap the heat map where you took the reading.'}</p>}
      {pending && onSave && <div className="pin-form" data-tour="pins-form">
        <p className="small"><b>New pin</b> at {pending.where}</p>
        <div className="row wrap">
          <span style={{ width: 150 }}><Num value={val} nullable onChange={setVal} unit={unit} label={QTY[q].label} /></span>
          <input style={{ flex: '1 1 200px' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (what you see, room name, meter used…)" aria-label="Note" />
          <label className="btn">📷 {photo ? 'Change photo' : 'Add photo'}<input hidden type="file" accept="image/*" capture="environment" onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ''; }} /></label>
          {system === 'erces' && <label className="check"><input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} /> Critical area</label>}
        </div>
        {photo && <img src={photo} alt="Pin photo" style={{ maxWidth: 160, maxHeight: 110, borderRadius: 4, marginTop: 4 }} />}
        {err && <p className="warn-text small">{err}</p>}
        <div className="row wrap"><button className="primary" onClick={save}>📌 Save pin</button><button className="ghost" onClick={() => { onCancel(); setErr(''); }}>Cancel</button></div>
      </div>}
      <div className="row wrap small" style={{ gap: 10 }}>
        <span>{QTY[q].label} target <span style={{ display: 'inline-block', width: 110 }}><Num value={target} onChange={(v) => setT('target', v)} unit={unit} /></span></span>
        <span>Too strong above <span style={{ display: 'inline-block', width: 110 }}><Num value={hot} onChange={(v) => setT('hot', v)} unit={unit} /></span></span>
        {saved && <button className="ghost small-btn" onClick={() => update((d) => { const n = { ...(d.pinTargets ?? {}) }; delete n[`${targetKey}|${system}`]; d.pinTargets = n; })}>Use the usual values</button>}
      </div>
      <div className="balance" data-tour="pins-advice">
        {res.n > 0 && <p className={res.verdict.tone === 'ok' ? 'okbox' : res.verdict.tone === 'bad' ? 'warnbox bad' : 'warnbox'}><b>Balance check:</b> {res.verdict.text}</p>}
        <ol className="advice">{res.advice.map((a, i) => <li key={i} className={TONE[a.tone]}><span aria-hidden>{ICON[a.kind] ?? '•'} </span>{a.text}</li>)}</ol>
        {res.n > 0 && <div className="stats">
          <Stat label="Pins" value={res.n} />
          <Stat label="Meet the target" value={fmt(res.pctOk, 0)} unit=" %" tone={res.pctOk >= nm.needPct ? 'ok' : res.pctOk >= nm.needPct - 10 ? 'warn' : 'bad'} />
          <Stat label="Average" value={fmtQ(res.mean, q)} />
          <Stat label="Weakest / strongest" value={`${fmtQ(res.min, q)} / ${fmtQ(res.max, q)}`} />
          <Stat label="Evenness (σ)" value={`±${fmt(res.sd, 1)} dB`} tone={res.uniform === 'good' ? 'ok' : res.uniform === 'fair' ? 'warn' : 'bad'} tip={`Spread from spot to spot. About ±${nm.tol} dB or less is even for this system.`} />
          {res.imbalanceDb != null && <Stat label={`Between ${nm.source}s`} value={fmt(res.imbalanceDb, 1)} unit=" dB" tone={res.imbalanceDb <= Math.max(6, nm.tol) ? 'ok' : 'warn'} tip={`Difference between the average of the strongest and weakest ${nm.source} areas.`} />}
          {res.meanDelta != null && <Stat label="Measured − predicted" value={fmt(res.meanDelta, 1)} unit=" dB" tone={Math.abs(res.meanDelta) <= 3 ? 'ok' : Math.abs(res.meanDelta) <= 6 ? 'warn' : 'bad'} tip="Positive: real readings are stronger than the heat map predicts." />}
        </div>}
        {res.perSource.length > 1 && <details><summary className="small">By {nm.source} ({res.perSource.length})</summary>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{cap(nm.source)}</th><th>Pins</th><th>Average</th><th>Weakest</th><th>Strongest</th><th>vs. design</th></tr></thead>
            <tbody>{res.perSource.map((s) => <tr key={s.id}><td>{s.label}</td><td>{s.n}</td><td>{fmtQ(s.mean, q)}</td><td className={s.cold ? 'bad-text' : ''}>{fmtQ(s.min, q)}</td><td>{fmtQ(s.max, q)}</td><td>{s.meanDelta != null ? `${s.meanDelta >= 0 ? '+' : ''}${s.meanDelta.toFixed(1)} dB` : '—'}</td></tr>)}</tbody></table></div></details>}
        <p className="small muted">Rules of thumb from the readings you entered. A designer{nm.qty === 'dba' || system === 'erces' ? ' and the AHJ' : ''} must confirm changes; measure again after each change.</p>
      </div>
      {rows.length > 0 && <details><summary className="small">Pins ({rows.length})</summary>
        <div className="row wrap"><button className="small-btn" onClick={() => downloadText(`${safeName(p.meta.name)}-${system}-reading-pins.csv`, toCsv(pinsCsvRows(rows.map((r) => ({ ...r, src: srcName(assigned.get(r.id)) })), q)), 'text/csv')}>⬇ Export pins CSV</button></div>
        <div className="tbl-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}><table className="tbl"><thead><tr><th>Reading</th><th>Predicted</th><th>Where</th><th>Note</th><th></th></tr></thead>
          <tbody>{[...rows].reverse().slice(0, 400).map((r) => <tr key={r.id}>
            <td><b style={{ color: pinColor(r.v, target, hot, q) }}>●</b> {fmtQ(r.v, q)}{r.critical && <span className="pill warn" style={{ marginLeft: 4 }}>critical</span>}</td>
            <td>{r.pred != null && Number.isFinite(r.pred) ? fmtQ(r.pred, q) : '—'}</td>
            <td className="small">{r.where}{srcName(assigned.get(r.id)) ? ` · ${srcName(assigned.get(r.id))}` : ''}</td>
            <td className="small">{r.note}{r.photo && <img src={r.photo} alt="" style={{ display: 'block', maxWidth: 90, maxHeight: 60, borderRadius: 3 }} />}</td>
            <td>{!r.readOnly && onDelete && <button className="ghost" aria-label="Delete pin" onClick={() => onDelete(r.id)}>✕</button>}</td></tr>)}</tbody></table></div>
      </details>}
    </div>
  );
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PIN_SYS_LABEL: Record<string, string> = { rf: 'Outdoor radio (coverage map)', das: 'Cellular / DAS', erces: 'Emergency responder radio (ERCES / BDA)', wifi: 'Wi-Fi', callbox: 'Emergency call boxes', security: 'Wireless security sensors', access: 'Wireless locks (access control)', cctv: 'Camera lighting (CCTV)' };
/** Name of a system in the "System measured" list. */
export const pinSysLabel = (s: string) => PIN_SYS_LABEL[s] ?? sysLabel(s);

/** SVG pin marker for floor plans and models (size in plan units). */
export function PlanPin({ x, y, s, color, label, title }: { x: number; y: number; s: number; color: string; label?: string; title?: string }) {
  return <g pointerEvents="visiblePainted"><path d={`M${x} ${y}l${-s * 0.7} ${-s * 1.6}a${s * 0.8} ${s * 0.8} 0 1 1 ${s * 1.4} 0z`} fill={color} stroke="#fff" strokeWidth={s * 0.18} />
    {label && <text x={x + s * 0.9} y={y - s * 1.4} fontSize={s * 1.2} fill={color} stroke="#fff" strokeWidth={s * 0.25} paintOrder="stroke" fontWeight={700}>{label}</text>}{title && <title>{title}</title>}</g>;
}

/** Canvas pin marker (Indoor planner, Wi-Fi survey). */
export function drawCanvasPin(g: CanvasRenderingContext2D, x: number, y: number, color: string, label: string) {
  g.save(); g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x - 7, y - 15); g.arc(x, y - 17, 7.5, Math.PI * 0.85, Math.PI * 0.15); g.closePath(); g.fill(); g.stroke();
  g.font = 'bold 12px system-ui'; g.lineWidth = 3; g.strokeText(label, x + 9, y - 14); g.fillText(label, x + 9, y - 14); g.restore();
}
