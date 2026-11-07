import React from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { DEFAULT_TESTS, uid } from '../defaults';

export function TestingPage() {
  const { project: p, update } = useStore();
  const t = p.tests;
  const set = (i: number, k: string, v: unknown) => update((d) => { (d.tests[i] as unknown as Record<string, unknown>)[k] = v; });
  const passed = t.filter((x) => x.pass === true).length, failed = t.filter((x) => x.pass === false).length;
  return (
    <Card title="Acceptance testing & commissioning" tip="Enter measured values and mark pass/fail. Prints in the Commissioning report."
      actions={<span className="row">{!t.length && <button className="primary" onClick={() => update((d) => { d.tests = DEFAULT_TESTS.map((x) => ({ ...x, id: uid() })); })}>Load standard test plan</button>}
        <button onClick={() => update((d) => { d.tests.push({ id: uid(), item: 'Custom test', standard: '', expected: '', measured: '', pass: null, date: '', tech: '', notes: '' }); })}>+ Add test</button></span>}>
      {t.length ? <>
        <p><b>{passed}</b> passed · <b className="bad-text">{failed}</b> failed · {t.length - passed - failed} pending</p>
        <div className="scroll-x"><table className="tbl edit tests"><thead><tr><th>Test</th><th>Standard</th><th>Acceptance</th><th>Measured</th><th>Result</th><th>Date</th><th>Tech</th><th>Notes</th><th /></tr></thead>
          <tbody>{t.map((x, i) => (
            <tr key={x.id} className={x.pass === false ? 'fail' : x.pass ? 'pass' : ''}>
              <td><input value={x.item} onChange={(e) => set(i, 'item', e.target.value)} /></td>
              <td><input value={x.standard} onChange={(e) => set(i, 'standard', e.target.value)} /></td>
              <td><input value={x.expected} onChange={(e) => set(i, 'expected', e.target.value)} /></td>
              <td><input value={x.measured} onChange={(e) => set(i, 'measured', e.target.value)} /></td>
              <td><select value={x.pass == null ? '' : x.pass ? 'p' : 'f'} onChange={(e) => set(i, 'pass', e.target.value === '' ? null : e.target.value === 'p')}><option value="">Pending</option><option value="p">Pass</option><option value="f">Fail</option></select></td>
              <td><input type="date" value={x.date} onChange={(e) => set(i, 'date', e.target.value)} /></td>
              <td><input value={x.tech} onChange={(e) => set(i, 'tech', e.target.value)} /></td>
              <td><input value={x.notes} onChange={(e) => set(i, 'notes', e.target.value)} /></td>
              <td><button className="ghost" onClick={() => update((d) => { d.tests.splice(i, 1); })}>✕</button></td>
            </tr>))}</tbody></table></div>
      </> : <p className="muted">No tests yet. Load the standard test plan (sweeps, PIM, grounding, drive test, ERCES grid test, battery run, RF exposure).</p>}
    </Card>
  );
}
