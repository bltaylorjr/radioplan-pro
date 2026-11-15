import React, { useEffect, useState } from 'react';
import { Card } from './ui';
import { useStore } from '../store';
import { datasets, runMaintenance, maintenanceRunning, MaintState, DatasetState, Dataset } from '../engine/maintain';
import { repairLog, logRepair } from '../engine/carelog';
import { autoCareOn, setAutoCare } from './Maintainer';
import { lastGoodVersion, skippedVersion } from '../engine/update';

const when = (t?: number) => t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
function status(d: Dataset, s: DatasetState | undefined): { text: string; tone: '' | 'warn' | 'bad' } {
  if (s?.problem) return { text: `Needs attention: ${s.problem}`, tone: 'bad' };
  if (s?.failures) return { text: `Last download did not work; the saved copy is kept and it will try again by itself (${s.lastError ?? ''})`, tone: 'warn' };
  if (!s?.lastVerify && !s?.lastRefresh) return { text: 'Not checked yet', tone: '' };
  return { text: `OK${s.detail ? ` · ${s.detail}` : ''}`, tone: '' };
}

/** Automatic care: what the app keeps checked, repaired and up to date by itself. */
export function AutoCare() {
  const { lib } = useStore();
  const [on, setOn] = useState(autoCareOn());
  const [st, setSt] = useState<MaintState>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [list, setList] = useState<Dataset[]>([]);
  const load = async () => { const m = await import('../engine/datasets'); setList(datasets()); setSt(await m.loadMaintState()); };
  useEffect(() => { load(); }, [lib.libVersion]);
  const checkNow = async () => {
    setBusy(true); setMsg('Checking…');
    try {
      const { maintStore } = await import('../engine/datasets');
      const rep = await runMaintenance({ online: navigator.onLine, now: Date.now(), openProjectId: lib.projectId, force: true, log: logRepair }, maintStore);
      setMsg([rep.repaired.length ? `Fixed: ${rep.repaired.join('; ')}.` : 'Everything checked: no damage found.', rep.refreshed.length ? `Updated: ${rep.refreshed.join(', ')}.` : '', rep.failed.length ? `Could not update now (kept the saved copy): ${rep.failed.join(', ')}.` : '', !navigator.onLine ? 'Offline: downloads wait until you are online.' : ''].filter(Boolean).join(' '));
      lib.bump();
    } catch (e) { setMsg(String((e as Error).message ?? e)); }
    setBusy(false); load();
  };
  const log = repairLog().slice(0, 8);
  const good = lastGoodVersion(), skip = skippedVersion();
  return (
    <Card title="Automatic care" tip="The app checks its saved data for damage and repairs it, keeps downloaded data up to date when online, keeps a backup before every change, and undoes an app update that will not start.">
      <label className="check"><input type="checkbox" checked={on} onChange={(e) => { setAutoCare(e.target.checked); setOn(e.target.checked); }} /> Look after the app and downloaded data automatically (recommended)</label>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>What</th><th>Status</th><th>Checked</th><th>Updated</th></tr></thead>
        <tbody>{list.map((d) => { const s = st[d.id]; const x = status(d, s); return (
          <tr key={d.id}><td>{d.label}</td><td className={x.tone === 'bad' ? 'bad-text' : x.tone === 'warn' ? 'warn-text' : ''}>{x.text}</td>
            <td>{when(s?.lastVerify)}</td><td>{d.everyHours > 0 ? when(s?.lastRefresh) : <span className="muted small">{d.updatedBy ?? '—'}</span>}</td></tr>); })}</tbody></table></div>
      <div className="row wrap">
        <button className="primary" disabled={busy || maintenanceRunning()} onClick={checkNow}>Check everything now</button>
        {msg && <span className="small">{msg}</span>}
      </div>
      <ul className="small muted">
        <li>Before every app update, and before going back to an earlier version, a copy of the open project goes into its History. A backup of each changed project is made every day; the last 7 days are kept.</li>
        <li>App updates are checked against the file's SHA-256 before they install. If a new version does not start properly 3 times, the Windows app goes back to the last version that worked{good ? ` (${good})` : ''}{skip ? `, and skips ${skip} until a newer one comes out` : ''}.</li>
        <li>When online, newer code editions, city and county code lists, contacts, the equipment catalog, manufacturer recommendations, help and the magnetic model download by themselves from the LvPlan Pro website, are checked, and are used right away (the catalog from the next start). Maps around your sites and datasheets saved from a link are kept fresh too.</li>
        <li>RadioReference lists stay encrypted on this device; their spare copy too.</li>
      </ul>
      {log.length > 0 && <details><summary className="small">What the app did recently</summary><ul className="small">{log.map((l, i) => <li key={i}>{new Date(l.at).toLocaleString()}: {l.what}</li>)}</ul></details>}
    </Card>
  );
}
