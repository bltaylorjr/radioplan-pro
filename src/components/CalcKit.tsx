// Shared calculator pieces: each calculator keeps its own numbers (never tied to the project), has its own
// Reset button, and can optionally "Use project values" or "Apply to fields" when the user asks.
import React, { useCallback, useRef, useState } from 'react';
import { useStore } from '../store';
import { askConfirm } from './askConfirm';
import { addVersion } from '../engine/projectdb';
import { applyTargets, undoTargets, targetIsSame, type ApplyTarget } from '../engine/calcApply';
import type { Project } from '../types';

type Reg = Map<string, Set<() => void>>;

/** A registry of reset functions, one group per calculator. */
export function useCalcRegistry() {
  const reg = useRef<Reg>(new Map()).current;
  const reset = useCallback((id: string) => reg.get(id)?.forEach((f) => f()), [reg]);
  return { reg, reset };
}

/** useState for a calculator box. `g` = the calculator(s) whose Reset puts it back to `init`. */
export function useCalcValue<T>(reg: Reg, g: string | string[], init: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [v, set] = useState<T>(init);
  const f = useRef(() => set(init)).current;
  for (const k of Array.isArray(g) ? g : [g]) { let s = reg.get(k); if (!s) reg.set(k, (s = new Set())); s.add(f); }
  return [v, set];
}

export const CalcResetCtx = React.createContext<(id: string) => void>(() => undefined);

/** The ↺ Reset button for one calculator. */
export function ResetBtn({ onReset, title }: { onReset: () => void; title?: string }) {
  const [done, setDone] = useState(false);
  return <button className="ghost small calc-reset" data-calc-reset title={title ?? 'Put this calculator back to its starting example. Nothing else changes.'}
    onClick={() => { onReset(); setDone(true); window.setTimeout(() => setDone(false), 1200); }}>{done ? '✓ Reset' : '↺ Reset'}</button>;
}

/** The checklist shown in the "Apply to fields" box. */
function ApplyList({ p, targets, chosen }: { p: Project; targets: ApplyTarget[]; chosen: Set<string> }) {
  const [, force] = useState(0);
  return (
    <div className="apply-list">
      {targets.map((t) => {
        const same = targetIsSame(p, t);
        return (
          <label key={t.id} className={'apply-row' + (same ? ' muted' : '')}>
            <input type="checkbox" checked={chosen.has(t.id)} disabled={same} onChange={(e) => { if (e.target.checked) chosen.add(t.id); else chosen.delete(t.id); force((n) => n + 1); }} />
            <span><b>{t.label}</b> <span className="small muted">({t.page})</span><br />
              <span className="small">{same ? <>Already {t.to}</> : <>{t.now(p) || 'empty'} → <b>{t.to}</b></>}</span></span>
          </label>
        );
      })}
    </div>
  );
}

/** "Apply to fields…" button: lists every field that would change (old → new), applies only the ticked ones, and offers Undo. */
export function ApplyBtn({ targets, what }: { targets: () => ApplyTarget[]; what: string }) {
  const { project, replace, lib } = useStore();
  const [last, setLast] = useState<{ before: Project; ts: ApplyTarget[] } | null>(null);
  const live = useRef(project); live.current = project;
  const run = async () => {
    const ts = targets();
    if (!ts.length) { await askConfirm({ title: 'Nothing to apply', message: <p>Finish the calculator first: there is no result to put in the project yet.</p>, ok: 'OK', cancel: 'Close' }); return; }
    if (ts.every((t) => targetIsSame(project, t))) { await askConfirm({ title: 'Already in the project', message: <p>The project already has these values: {ts.map((t) => `${t.label} ${t.to}`).join('; ')}.</p>, ok: 'OK', cancel: 'Close' }); return; }
    const chosen = new Set(ts.filter((t) => t.on !== false && !targetIsSame(project, t)).map((t) => t.id));
    const ok = await askConfirm({
      title: `Apply ${what} to the project?`, ok: 'Apply the ticked fields', cancel: 'No, leave the project as it is',
      message: <>
        <p className="small">Tick the fields to fill in. Each line shows the value now → the new value. Nothing else in the project changes.</p>
        <ApplyList p={project} targets={ts} chosen={chosen} />
        <p className="small muted">You can press Undo right after, and a copy from before is kept in Projects → History.</p>
      </>,
    });
    const pick = ts.filter((t) => chosen.has(t.id));
    if (!ok || !pick.length) return;
    const before = live.current;
    try { await addVersion(lib.projectId, before, `Before applying ${what}`); lib.bump(); } catch { /* storage unavailable: Undo still works */ }
    replace(applyTargets(live.current, pick));
    setLast({ before, ts: pick });
  };
  return <>
    <button className="small" data-calc-apply onClick={run} title="Put this result into the matching fields on the other pages (asks first and shows what changes)">➜ Apply to fields…</button>
    {last && <p className="note small apply-done" role="status">✓ Applied to {last.ts.length} field{last.ts.length > 1 ? 's' : ''}: {last.ts.map((t) => t.label).join(', ')}.{' '}
      <button className="small" onClick={() => { replace(undoTargets(live.current, last.before, last.ts)); setLast(null); }}>↶ Undo</button>{' '}
      <button className="ghost small" aria-label="Close" onClick={() => setLast(null)}>✕</button></p>}
  </>;
}

/** "Use project values" button: copies project numbers into this calculator only (the project is not changed). */
export function FromProjectBtn({ onUse, title }: { onUse: (p: Project) => void; title?: string }) {
  const { project } = useStore();
  return <button className="ghost small" data-calc-from onClick={() => onUse(project)} title={title ?? 'Copy the matching numbers from this project into this calculator. The project itself is not changed.'}>⇣ Use project values</button>;
}

/** Footer row with the optional project buttons. */
export function CalcActions({ apply, applyWhat, fromProject }: { apply?: () => ApplyTarget[]; applyWhat?: string; fromProject?: (p: Project) => void }) {
  if (!apply && !fromProject) return null;
  return <div className="calc-actions no-print">{fromProject && <FromProjectBtn onUse={fromProject} />}{apply && <ApplyBtn targets={apply} what={applyWhat ?? 'this result'} />}</div>;
}
