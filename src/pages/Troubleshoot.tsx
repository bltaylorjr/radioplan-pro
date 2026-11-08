import React, { useEffect, useMemo, useState } from 'react';
import { useStore, deviceInfo } from '../store';
import { Card } from '../components/ui';
import { builtInSpecs, SpecItem } from '../data/speclib';
import { loadMyItems, SPECLIB_EVENT, autoLoadEquipment } from '../data/projectEquipment';
import { guideFor, Ctx } from '../data/troubleshoot';
import { uid } from '../defaults';
import { SYSTEMS, projectSystems } from '../data/systems';

type Result = { r: 'pass' | 'fail' | 'skip'; measured: string };

export function TroubleshootPage() {
  const { project: p, update, go } = useStore();
  const [mine, setMine] = useState<SpecItem[]>([]);
  useEffect(() => {
    const load = () => loadMyItems().then(setMine).catch(() => setMine([]));
    autoLoadEquipment(p).then(load); window.addEventListener(SPECLIB_EVENT, load);
    return () => window.removeEventListener(SPECLIB_EVENT, load);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const builtIn = useMemo(builtInSpecs, []);
  const pname = p.meta.name || 'Project';
  const inProject = mine.filter((m) => (m.projects ?? []).includes(pname));
  const otherMine = mine.filter((m) => !(m.projects ?? []).includes(pname));
  const mySys = projectSystems(p.meta);
  const sysItems: SpecItem[] = [...mySys, ...SYSTEMS.filter((x) => !mySys.includes(x))].filter((x) => x.libCats.length).map((x) => ({ id: `sys-${x.id}`, category: x.libCats[0], sub: 'System', brand: '', model: `${x.icon} ${x.label} (general)`, specs: {}, kind: 'Standard' as const }));
  const all = [...sysItems, ...inProject, ...otherMine, ...builtIn.filter((b) => b.kind !== 'Standard' || ['Batteries', 'Network & PoE', 'Structured cabling', 'Fiber optics', 'Conductors', 'Wi-Fi'].includes(b.category))];
  const [sel, setSel] = useState('');
  const [sym, setSym] = useState('');
  const [res, setRes] = useState<Record<number, Result>>({});
  const [msg, setMsg] = useState('');
  const item = all.find((i) => i.id === sel) ?? null;
  const guide = item ? guideFor(item) : null;
  const symptom = guide?.symptoms.find((s) => s.id === sym) ?? guide?.symptoms[0] ?? null;
  const ctx: Ctx | null = item ? { it: item, s: item.specs, p } : null;
  const reset = () => { setRes({}); setMsg(''); };
  const steps = symptom?.steps ?? [];
  const done = steps.filter((_, i) => res[i]).length;
  const firstFail = steps.findIndex((_, i) => res[i]?.r === 'fail');
  const name = item ? item.id.startsWith('sys-') ? item.model.replace(/^\S+\s/, '').replace(' (general)', '') : `${item.brand === 'Materials list' || item.brand.startsWith('Project') ? '' : item.brand + ' '}${item.model}` : '';
  const setR = (i: number, r: Partial<Result>) => setRes((x) => ({ ...x, [i]: { r: x[i]?.r ?? 'skip', measured: x[i]?.measured ?? '', ...r } }));

  const saveTests = () => {
    if (!ctx || !symptom) return;
    const date = new Date().toISOString().slice(0, 10), tech = deviceInfo().name;
    update((d) => { for (const [i, s] of steps.entries()) { const r = res[i]; if (!r || r.r === 'skip') continue;
      d.tests.push({ id: uid(), item: `${name}: ${s.check}`, standard: guide!.title, expected: s.expect(ctx), measured: r.measured, pass: r.r === 'pass', date, tech, notes: r.r === 'fail' ? s.ifFail : '' }); } });
    setMsg('Saved to Final Testing ✓');
  };
  const saveNote = () => {
    if (!ctx || !symptom) return;
    const lines = steps.map((s, i) => { const r = res[i]; return `${r ? (r.r === 'pass' ? '✓' : r.r === 'fail' ? '✗' : '–') : '○'} ${s.check}${r?.measured ? `: measured ${r.measured}` : ''}`; });
    update((d) => { d.fieldNotes = [{ id: uid(), at: new Date().toISOString(), title: `Troubleshooting: ${name} (${symptom.label})`, text: lines.join('\n'), category: 'Measurement', photos: [], tags: ['troubleshooting'], author: deviceInfo().name, followUp: firstFail >= 0, done: false }, ...(d.fieldNotes ?? [])]; });
    setMsg('Saved as a field note ✓');
  };

  return (
    <div className="stack">
      <Card title="Troubleshooting wizard" tip="Pick the equipment and the problem. Each step says what to check, how to check it, and the value to expect, using that equipment's specifications from the library.">
        <div className="form">
          <label className="field wide"><span>1. Equipment</span>
            <select value={sel} onChange={(e) => { setSel(e.target.value); setSym(''); reset(); }} aria-label="Equipment">
              <option value="">— pick equipment —</option>
              <optgroup label="By system (no specific model)">{sysItems.map((i) => <option key={i.id} value={i.id}>{i.model}</option>)}</optgroup>
              {inProject.length > 0 && <optgroup label="In this project">{inProject.map((i) => <option key={i.id} value={i.id}>{i.category}: {i.brand} {i.model}</option>)}</optgroup>}
              {otherMine.length > 0 && <optgroup label="My library">{otherMine.map((i) => <option key={i.id} value={i.id}>{i.category}: {i.brand} {i.model}</option>)}</optgroup>}
              <optgroup label="Built-in library">{all.filter((i) => i.kind !== 'My item' && !i.id.startsWith('sys-')).map((i) => <option key={i.id} value={i.id}>{i.category}: {i.brand} {i.model}</option>)}</optgroup>
            </select></label>
          {guide && <label className="field wide"><span>2. Problem</span>
            <select value={symptom?.id ?? ''} onChange={(e) => { setSym(e.target.value); reset(); }} aria-label="Problem">{guide.symptoms.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
        </div>
        {!item && <p className="muted">Pick a piece of equipment. Equipment you add to the project shows first; anything you add to the <a href="#library" onClick={(e) => { e.preventDefault(); go('library'); }}>Specifications Library</a> shows here too.</p>}
        {guide && <div className="warnbox"><b>⚠ Safety:</b> {guide.safety}</div>}
      </Card>

      {ctx && symptom && <Card title={`3. ${guide!.title}: ${symptom.label}`} actions={<span className="small muted">{done} of {steps.length} checked</span>}>
        <ol className="ts-steps">{steps.map((s, i) => { const r = res[i]; return (
          <li key={i} className={'ts-step ' + (r?.r ?? '')}>
            <div className="ts-check"><b>{s.check}</b>{s.tool && <span className="ts-tool small">🧰 {s.tool}</span>}</div>
            <div><b>How:</b> {s.how}</div>
            <div className="ts-expect"><b>Expected:</b> {s.expect(ctx)}</div>
            <div className="row wrap">
              <input value={r?.measured ?? ''} placeholder="Measured value" aria-label={`Measured: ${s.check}`} onChange={(e) => setR(i, { measured: e.target.value })} style={{ minWidth: 160 }} />
              <button className={r?.r === 'pass' ? 'primary' : ''} onClick={() => setR(i, { r: 'pass' })}>✓ OK</button>
              <button className={r?.r === 'fail' ? 'danger' : ''} onClick={() => setR(i, { r: 'fail' })}>✗ Not OK</button>
              <button className="ghost" onClick={() => setR(i, { r: 'skip' })}>Skip</button>
            </div>
            {r?.r === 'fail' && <div className="ts-fix"><b>What to do:</b> {s.ifFail}</div>}
          </li>); })}</ol>
        {done === steps.length && <p className={firstFail >= 0 ? 'warn-text' : 'ok-text'}>{firstFail >= 0 ? `Problem found at step ${firstFail + 1}: ${steps[firstFail].check}. Fix it, then run the checks again.` : 'All checks done with no fault found. If the problem continues, contact the manufacturer\'s technical support with these readings.'}</p>}
        <div className="row wrap">
          <button onClick={reset}>Start over</button>
          <span style={{ flex: 1 }} />
          <button disabled={!done} onClick={saveNote}>Save as field note</button>
          <button className="primary" disabled={!done} onClick={saveTests}>Save results to Final Testing</button>
        </div>
        {msg && <p className="note" role="status">{msg}</p>}
        <p className="small muted">Expected values use this item's library specifications where it has them, otherwise typical or standard values. The manufacturer's manual, the adopted code and the AHJ take priority. Work on live, RF or fire alarm systems only when qualified, with the system in test and the monitoring company notified.</p>
      </Card>}
    </div>
  );
}
