import React, { useEffect, useMemo, useState } from 'react';
import { useStore, deviceInfo } from '../store';
import { Card } from '../components/ui';
import { builtInSpecs, SpecItem } from '../data/speclib';
import { loadMyItems, SPECLIB_EVENT, autoLoadEquipment } from '../data/projectEquipment';
import { guideFor, Ctx } from '../data/troubleshoot';
import { uid } from '../defaults';
import { SYSTEMS, projectSystems, LvSystem } from '../data/systems';
import { EQUIP_TYPES, EquipType, equipTypeOf } from '../data/equiptrouble';

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
  const sysList = [...mySys, ...SYSTEMS.filter((x) => !mySys.includes(x))].filter((x) => x.libCats.length);
  const libAll = [...inProject, ...otherMine, ...builtIn.filter((b) => b.kind !== 'Standard' || ['Batteries', 'Network & PoE', 'Structured cabling', 'Fiber optics', 'Conductors', 'Wi-Fi'].includes(b.category))];
  const [sysId, setSysId] = useState('');
  const [sel, setSel] = useState('');
  const [cat, setCat] = useState('');
  const [model, setModel] = useState('');
  const [sym, setSym] = useState('');
  const [res, setRes] = useState<Record<number, Result>>({});
  const [msg, setMsg] = useState('');
  const sys = sysList.find((x) => x.id === sysId) ?? null;
  const anySys = sysId === 'all';
  const types = anySys ? EQUIP_TYPES : EQUIP_TYPES.filter((t) => t.system === sysId);
  const libHere = anySys ? libAll : sys ? libAll.filter((i) => sys.libCats.includes(i.category)) : [];
  const cats = [...new Set(libHere.map((i) => i.category))].sort();
  const libCat = libHere.filter((i) => i.category === cat);
  const sysItem = (x: LvSystem): SpecItem => ({ id: `sys-${x.id}`, category: x.libCats[0], sub: 'System', brand: '', model: `${x.icon} ${x.label} (general)`, specs: {}, kind: 'Standard' as const });
  const typeItem = (t: EquipType): SpecItem => { const sd = SYSTEMS.find((x) => x.id === t.system); return { id: `type-${t.id}`, category: sys?.libCats[0] ?? sd?.libCats[0] ?? 'Other', sub: t.label, brand: '', model: t.label, specs: { 'Device type': t.label }, kind: 'Standard' as const }; };
  const selType = sel.startsWith('type-') ? EQUIP_TYPES.find((t) => `type-${t.id}` === sel) : undefined;
  const item: SpecItem | null = !sysId ? null : selType ? typeItem(selType) : sel === 'lib' ? libAll.find((i) => i.id === model) ?? null : sys ? sysItem(sys) : null;
  const eqType = selType ?? (item && !item.id.startsWith('sys-') ? equipTypeOf(item) : undefined);
  const baseGuide = item ? guideFor(item) : null;
  const guide = baseGuide ? { ...baseGuide, symptoms: [...(eqType?.symptoms ?? []), ...baseGuide.symptoms] } : null;
  const symptom = guide?.symptoms.find((s) => s.id === sym) ?? guide?.symptoms[0] ?? null;
  const ctx: Ctx | null = item ? { it: item, s: item.specs, p } : null;
  const reset = () => { setRes({}); setMsg(''); };
  const steps = symptom?.steps ?? [];
  const done = steps.filter((_, i) => res[i]).length;
  const firstFail = steps.findIndex((_, i) => res[i]?.r === 'fail');
  const name = item ? item.id.startsWith('sys-') ? item.model.replace(/^\S+\s/, '').replace(' (general)', '') : item.id.startsWith('type-') ? item.model : `${item.brand === 'Materials list' || item.brand.startsWith('Project') ? '' : item.brand + ' '}${item.model}` : '';
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
      <Card title="Troubleshooting wizard" tip="Pick the system, the equipment (general or a specific type or model) and the problem. Each step says what to check, how to check it, and the value to expect, using that equipment's specifications from the library.">
        <div className="form">
          <label className="field wide"><span>1. System</span>
            <select value={sysId} onChange={(e) => { setSysId(e.target.value); setSel(''); setCat(''); setModel(''); setSym(''); reset(); }} aria-label="System">
              <option value="" disabled>— Choose one —</option>
              {mySys.length > 0 && <optgroup label="This project's systems">{sysList.filter((x) => mySys.includes(x)).map((x) => <option key={x.id} value={x.id}>{x.icon} {x.label}</option>)}</optgroup>}
              <optgroup label={mySys.length ? 'Other systems' : 'Systems'}>{sysList.filter((x) => !mySys.includes(x)).map((x) => <option key={x.id} value={x.id}>{x.icon} {x.label}</option>)}</optgroup>
              <option value="all">🔎 Any system (all equipment)</option>
            </select></label>
          {sysId && <label className="field"><span>2. Equipment</span>
            <select data-no-choose value={sel} onChange={(e) => { setSel(e.target.value); setCat(''); setModel(''); setSym(''); reset(); }} aria-label="Equipment">
              {!anySys ? <option value="">General (whole system)</option> : <option value="" disabled>— Choose one —</option>}
              {types.length > 0 && <optgroup label="Equipment type">{types.map((t) => <option key={t.id} value={`type-${t.id}`}>{t.label}</option>)}</optgroup>}
              {libHere.length > 0 && <option value="lib">📚 A specific model from the library…</option>}
            </select></label>}
          {sel === 'lib' && <label className="field"><span>Library category</span>
            <select value={cat} onChange={(e) => { setCat(e.target.value); setModel(''); setSym(''); reset(); }} aria-label="Library category">
              {cats.map((c) => <option key={c} value={c}>{c} ({libHere.filter((i) => i.category === c).length})</option>)}
            </select></label>}
          {sel === 'lib' && cat && <label className="field"><span>Model</span>
            <select value={model} onChange={(e) => { setModel(e.target.value); setSym(''); reset(); }} aria-label="Model">
              {libCat.some((i) => inProject.includes(i)) && <optgroup label="In this project">{libCat.filter((i) => inProject.includes(i)).map((i) => <option key={i.id} value={i.id}>{i.brand} {i.model}</option>)}</optgroup>}
              {libCat.some((i) => otherMine.includes(i)) && <optgroup label="My library">{libCat.filter((i) => otherMine.includes(i)).map((i) => <option key={i.id} value={i.id}>{i.brand} {i.model}</option>)}</optgroup>}
              {libCat.some((i) => !mine.includes(i)) && <optgroup label="Built-in library">{libCat.filter((i) => !mine.includes(i)).map((i) => <option key={i.id} value={i.id}>{i.brand} {i.model}</option>)}</optgroup>}
            </select></label>}
          {guide && <label className="field wide"><span>3. Problem</span>
            <select data-no-choose value={symptom?.id ?? ''} onChange={(e) => { setSym(e.target.value); reset(); }} aria-label="Problem">
              {eqType && <optgroup label={`${eqType.label} problems`}>{eqType.symptoms.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>}
              <optgroup label={eqType ? 'General system problems' : 'Problems'}>{baseGuide!.symptoms.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
            </select></label>}
        </div>
        {!item && <p className="muted">Pick the system, then the equipment: choose General for whole-system checks, an equipment type (smoke detector, maglock, camera…) for device checks, or a specific model. Equipment you add to the project shows first; anything you add to the <a href="#library" onClick={(e) => { e.preventDefault(); go('library'); }}>Specifications Library</a> shows here too.</p>}
        {guide && <div className="warnbox"><b>⚠ Safety:</b> {guide.safety}</div>}
      </Card>

      {ctx && symptom && <Card title={`4. ${eqType && eqType.symptoms.includes(symptom) ? eqType.label : guide!.title}: ${symptom.label}`} actions={<span className="small muted">{done} of {steps.length} checked</span>}>
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
