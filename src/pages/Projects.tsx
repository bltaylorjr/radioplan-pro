import { ImportFiles } from '../components/ImportFiles';
import { KEEP_GROUPS, defaultKeep, projectFromTemplate } from '../engine/template';
import { defaultProject } from '../defaults';
import { askConfirm } from '../components/askConfirm';
import React, { useEffect, useState } from 'react';
import { useStore, downloadText, safeName } from '../store';
import { Card, Stat } from '../components/ui';
import {
  listProjects, listVersions, importEntries, getRecord, backupAll, readBackup, kvRestore, storageInfo, requestPersist, fmtBytes,
  folderCopySupported, pickDataFolder, savedDataFolder, forgetDataFolder, folderAllowed, writeToFolder, readFolder,
  ProjectSummary, VersionRecord, StorageInfo, BackupEntry,
} from '../engine/projectdb';
import { refCounts, REF_SOURCE } from '../engine/refdata';
import { APP_VERSION, autoUpdateOn, setAutoUpdate, checkForUpdate, markChecked } from '../engine/update';

/** Where the built-in storage physically lives on this kind of install. */
export function storagePlace(): { kind: string; where: string } {
  const w = window as unknown as Record<string, unknown>;
  if ('__TAURI_INTERNALS__' in w || '__TAURI__' in w) return { kind: 'Windows desktop app', where: 'inside the app’s own data folder on this PC (%LOCALAPPDATA%\\com.radioplan.pro). It stays when the app is updated.' };
  if ('RadioPlanAndroid' in w || 'Capacitor' in w) return { kind: 'Android app', where: 'in the app’s private storage on this phone or tablet. It stays when the app is updated; uninstalling the app removes it, so keep a backup.' };
  if (location.protocol === 'file:') return { kind: 'Flash drive / file version', where: 'in this computer’s browser profile, tied to this file’s location. Choose a data folder on the flash drive below so your projects travel with the drive.' };
  return { kind: 'Browser', where: 'in this browser’s storage for this site.' };
}
const when = (t: number) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
type Dir = Awaited<ReturnType<typeof savedDataFolder>>;

export function ProjectsPage() {
  const { project, lib, replace } = useStore();
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [msg, setMsg] = useState('');
  const [folder, setFolder] = useState<Dir>(null);
  const [folderOk, setFolderOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const place = storagePlace();
  const ref = refCounts();
  const [autoUp, setAutoUp] = useState(autoUpdateOn());
  const [tplFrom, setTplFrom] = useState('');
  const [tplName, setTplName] = useState('');
  const [tplNo, setTplNo] = useState('');
  const [keep, setKeep] = useState(defaultKeep);
  const startFrom = (id: string) => { setTplFrom(id); const n = list.find((x) => x.id === id)?.name ?? ''; setTplName(n ? `${n} (new)` : ''); document.getElementById('from-previous')?.scrollIntoView({ behavior: 'smooth' }); };
  const createFromTemplate = () => act('New project from previous', async () => {
    const src = tplFrom === lib.projectId ? project : (await getRecord(tplFrom))?.project; if (!src) throw new Error('Pick a previous project first');
    const np = projectFromTemplate(src, defaultProject(), { name: tplName, number: tplNo, keep });
    await lib.newProject(np, np.meta.name, keep.sites ? tplFrom : undefined);
    setTplFrom(''); setTplName(''); setTplNo('');
    return `"${np.meta.name}" is open and ready to edit. The previous project is unchanged.${keep.sites ? '' : ' Enter the new site address on Company & Project.'}`;
  });

  useEffect(() => {
    if (lib.saveState === 'unavailable') return;
    listProjects().then(setList).catch((e) => setMsg(String(e)));
    listVersions(lib.projectId).then(setVersions).catch(() => setVersions([]));
    storageInfo().then(setInfo);
  }, [lib.libVersion, lib.projectId, lib.saveState]);
  useEffect(() => { if (folderCopySupported()) savedDataFolder().then(async (h) => { setFolder(h); setFolderOk(!!h && (await folderAllowed(h, false))); }); }, []);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true); setMsg('');
    try { const r = await fn(); setMsg(typeof r === 'string' ? r : `${label} ✓`); } catch (e) { setMsg(`${label} failed: ${(e as Error)?.message ?? e}`); }
    setBusy(false); lib.bump();
  };
  const pickFiles = (multiple: boolean, then: (entries: BackupEntry[]) => Promise<unknown>) => {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = multiple; i.accept = '.json,application/json';
    i.onchange = () => act('Import', async () => {
      const entries: BackupEntry[] = [];
      for (const f of Array.from(i.files ?? [])) entries.push(...readBackup(await f.text()));
      if (!entries.length) throw new Error('No projects found in the file');
      return then(entries);
    });
    i.click();
  };
  const exportOne = async (id: string) => {
    const p = id === lib.projectId ? project : (await getRecord(id))?.project;
    if (p) downloadText(`${safeName(p.meta.name)}.radioplan.json`, JSON.stringify(p, null, 2), 'application/json');
  };
  const syncFolder = async (h: NonNullable<Dir>) => {
    // Load projects from the folder that are new or newer, then write every project to the folder.
    const inFolder = await readFolder(h); const mine = await listProjects(); const byId = new Map(mine.map((m) => [m.id, m]));
    const newer = inFolder.filter((e) => !byId.has(e.record.id) || e.record.updated > (byId.get(e.record.id)!.updated + 2000));
    if (newer.length) {
      const cur = newer.find((e) => e.record.id === lib.projectId);
      await importEntries(newer, true);
      if (cur) replace(cur.project);
    }
    for (const m of await listProjects()) { const r = await getRecord(m.id); if (r) await writeToFolder(h, m.id, r.project); }
    return `Data folder up to date: ${newer.length} project(s) loaded from the folder, ${mine.length + newer.filter((e) => !byId.has(e.record.id)).length} saved to it.`;
  };

  if (lib.saveState === 'unavailable') return <Card title="Built-in storage">This device does not provide app storage. Use <b>Save project</b> to keep your work in a file.</Card>;
  const used = info?.quota ? Math.min(100, (info.usage / info.quota) * 100) : 0;
  return (
    <div className="grid">
      <Card title="Built-in storage" tip="Projects save automatically inside the app as you work. No internet, account or server is needed.">
        <div className="stats">
          <Stat label="Status" value={{ loading: 'Opening…', saving: 'Saving…', saved: 'All changes saved', error: 'Not saved', unavailable: '—' }[lib.saveState]} tone={lib.saveState === 'error' ? 'bad' : lib.saveState === 'saved' ? 'ok' : undefined} />
          <Stat label="Projects" value={list.length} />
          <Stat label="Space used" value={info ? fmtBytes(info.usage) : '…'} tip={info?.quota ? `${used.toFixed(1)} % of ${fmtBytes(info.quota)} available to the app` : undefined} />
          <Stat label="Protected from clean-up" value={info?.persisted == null ? 'n/a' : info.persisted ? 'Yes' : 'No'} tone={info?.persisted ? 'ok' : 'warn'} tip="When Yes, the system will not clear the app's storage to free space." />
        </div>
        {lib.saveError && <p className="bad-text">Last save error: {lib.saveError}</p>}
        <p className="muted"><b>{place.kind}:</b> your projects, history and downloaded terrain are kept {place.where}</p>
        <div className="row wrap">
          <button className="primary" disabled={busy} onClick={() => act('Save version', () => lib.saveNow())}>Save a version now</button>
          {info?.persisted === false && <button disabled={busy} onClick={() => act('Protect storage', async () => (await requestPersist()) ? 'Storage protected ✓' : 'The system did not allow it here. Keep a backup file as well.')}>Protect storage</button>}
        </div>
      </Card>

      <Card title="Projects" className="wide" actions={<div className="row wrap">
        <button className="primary" disabled={busy} onClick={() => act('New project', () => lib.newProject(undefined, 'New project'))}>+ New project</button>
        <button disabled={busy} onClick={() => pickFiles(true, async (e) => { const ids = await lib.importProjects(e); if (ids.length === 1) await lib.openProject(ids[0]); return `Imported ${ids.length} project(s) ✓`; })}>Import file(s)</button>
      </div>}>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Project</th><th>No.</th><th>Client</th><th>State</th><th>Sites</th><th>Terrain</th><th>Last saved</th><th>Size</th><th></th></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id} className={p.id === lib.projectId ? 'sel' : ''}>
              <td><b>{p.id === lib.projectId ? project.meta.name || p.name : p.name}</b>{p.id === lib.projectId && <span className="pill ok" style={{ marginLeft: 6 }}>open</span>}</td>
              <td>{p.number}</td><td>{p.client}</td><td>{p.state}</td><td>{p.sites}</td><td>{p.hasTerrain ? '✓' : ''}</td>
              <td>{when(p.updated)}</td><td>{fmtBytes(p.bytes)}</td>
              <td className="row" style={{ flexWrap: 'nowrap' }}>
                {p.id !== lib.projectId && <button disabled={busy} onClick={() => act('Open', () => lib.openProject(p.id))}>Open</button>}
                <button disabled={busy} title="Start a new project based on this one" onClick={() => startFrom(p.id)}>Reuse</button>
                <button disabled={busy} title="Make a copy" onClick={() => act('Duplicate', async () => { const r = await getRecord(p.id); await lib.newProject(p.id === lib.projectId ? project : r!.project, `${p.name} (copy)`, p.id); })}>Copy</button>
                <button disabled={busy} title="Save as a file" onClick={() => exportOne(p.id)}>Export</button>
                <button disabled={busy} className="danger" title="Delete this project from this device" onClick={async () => {
                  const open_ = p.id === lib.projectId, nm = (open_ ? project.meta.name : p.name) || 'this project';
                  const yes = await askConfirm({ title: 'Delete project?', danger: true, ok: 'Yes, delete it', cancel: 'No, keep it',
                    message: <>Delete <b>“{nm}”</b> and its saved history from this device? This cannot be undone.{open_ && <><br /><br />It is the project that is open now, so the most recent other project opens instead (or a new blank one).</>}<br /><br /><span className="small muted">Tip: press Export first if you want a backup file.</span></> });
                  if (yes) act('Delete', () => lib.removeProject(p.id));
                }}>Delete</button>
              </td>
            </tr>))}
          </tbody>
        </table></div>
        {msg && <p className="muted" role="status">{msg}</p>}
      </Card>


      <Card title="Start a new project from a previous one" className="wide" tip="For a similar design and build: keeps the design, equipment and pricing, and starts a clean record for the new job (no field notes, photos, test results, service calls or checklist ticks).">
        <div id="from-previous" className="row wrap">
          <label className="field">Previous project
            <select value={tplFrom} onChange={(e) => startFrom(e.target.value)}>
              <option value="">Choose a project…</option>
              {list.map((p) => <option key={p.id} value={p.id}>{p.id === lib.projectId ? project.meta.name || p.name : p.name}{p.number ? ` (${p.number})` : ''}{p.client ? ` · ${p.client}` : ''}</option>)}
            </select></label>
          <label className="field">New project name<input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Mission Hospital, building B" /></label>
          <label className="field">Project number<input value={tplNo} onChange={(e) => setTplNo(e.target.value)} placeholder="optional" /></label>
        </div>
        <p className="muted">Carry over:</p>
        <div className="keep-list">{KEEP_GROUPS.map((g) => (
          <label key={g.id} className="check"><input type="checkbox" checked={!!keep[g.id]} onChange={(e) => setKeep({ ...keep, [g.id]: e.target.checked })} /> <b>{g.label}</b> <span className="muted">{g.detail}</span></label>))}
        </div>
        <p className="muted">Always starts empty: field notes and photos, test results, service calls, maintenance dates, checklist ticks and drawing revisions. Everything in the new project can be edited.</p>
        <button className="primary" disabled={busy || !tplFrom} onClick={createFromTemplate}>Create the new project</button>
      </Card>
      <Card title="History of this project" tip="A version is kept every 10 minutes while you work, before each restore, and when you press Save a version now. The newest 25 are kept.">
        {versions.length === 0 ? <p className="muted">No earlier versions yet.</p> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Saved</th><th>Why</th><th>Name</th><th></th></tr></thead>
            <tbody>{versions.map((v) => <tr key={v.vid}><td>{when(v.at)}</td><td>{v.reason}</td><td>{v.name}</td>
              <td><button disabled={busy} onClick={() => { if (confirm('Go back to this version? The current state is kept in history first.')) act('Restore', () => lib.restoreVersion(v.vid!)); }}>Restore</button></td></tr>)}</tbody></table></div>)}
      </Card>

      <Card title="Version & updates" tip="New versions are published on the LvPlan Pro GitHub page. The Windows app installs them by itself; Android and the flash drive offer a one-tap download.">
        <p>LvPlan Pro version <b>{APP_VERSION}</b> · {place.kind}</p>
        <label className="check"><input type="checkbox" checked={autoUp} onChange={(e) => { setAutoUpdate(e.target.checked); setAutoUp(e.target.checked); }} /> Keep LvPlan Pro up to date automatically</label>
        <div className="row wrap">
          <button disabled={busy || !navigator.onLine} onClick={() => act('Check for updates', async () => { const u = await checkForUpdate(); markChecked(); return u ? `Version ${u.version} is available. ${u.url ? 'It will be offered at the bottom of the screen; restart the app to install it now.' : ''}` : 'You have the latest version ✓'; })}>Check for updates now</button>
        </div>
      </Card>

      <Card title="Built-in reference data" tip="Installed with the app and used automatically when there is no internet.">
        <ul className="small">
          <li><b>Codes and rules:</b> adopted NEC editions and code sets for NC, SC, GA, TN and VA, compliance rules with code sections, FCC / FAA limits.</li>
          <li><b>Places:</b> {ref.counties} county boundaries, {ref.towns.toLocaleString()} towns and {ref.zips.toLocaleString()} ZIP codes for {ref.states.join(', ')}. County and jurisdiction are found offline, and searches for a town, ZIP or county work offline.</li>
          <li><b>Engineering data:</b> equipment and antenna catalog, cable loss tables, conductor ampacity, 30 calculators, help manual and guided tours.</li>
          <li><b>Downloaded automatically for each project when online:</b> USGS terrain (kept with the project) and the USGS topo map around the sites (kept for offline use).</li>
        </ul>
        <p className="small muted">Sources: {REF_SOURCE}.</p>
      </Card>

      <ImportFiles />

      <Card title="Backup" tip="One file holds every project with its terrain, plus your specifications library, contacts, web links and saved datasheets. Use it to move to a new PC or phone.">
        <div className="row wrap">
          <button disabled={busy} onClick={() => act('Backup', async () => { const t = await backupAll(); downloadText(`radioplan-backup-${new Date().toISOString().slice(0, 10)}.json`, t, 'application/json'); return `Backup saved (${fmtBytes(t.length)}) ✓`; })}>Back up all projects</button>
          <button disabled={busy} onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = () => act('Restore', async () => { const f = i.files?.[0]; if (!f) return ''; const t = await f.text(); const n = (await lib.importProjects(readBackup(t))).length; const k = await kvRestore((JSON.parse(t) as { kv?: Record<string, unknown> }).kv); window.dispatchEvent(new Event('radioplan-speclib')); return `Restored ${n} project(s)${k ? ` and ${k} library, contact and datasheet record(s)` : ''} from backup ✓`; }); i.click(); }}>Restore from backup</button>
        </div>
        <p className="muted">Restoring adds the projects in the backup. Projects already on this device are kept.</p>
      </Card>

      {folderCopySupported() && <Card title="Data folder (flash drive or shared folder)" tip="Chrome and Edge on a computer can also keep every project as a file in a folder you choose, for example on the flash drive, so the projects go wherever the drive goes.">
        {folder ? <p>Saving a copy of each project to <b>{folder.name}</b> {folderOk ? '✓' : '(needs permission again)'}</p> : <p className="muted">No folder chosen. Projects are kept in the app only.</p>}
        <div className="row wrap">
          <button disabled={busy} onClick={() => act('Choose folder', async () => { const h = await pickDataFolder(); setFolder(h); setFolderOk(true); return syncFolder(h); })}>{folder ? 'Change folder' : 'Choose data folder'}</button>
          {folder && !folderOk && <button className="primary" disabled={busy} onClick={() => act('Reconnect', async () => { if (await folderAllowed(folder, true)) { setFolderOk(true); return syncFolder(folder); } throw new Error('permission not given'); })}>Reconnect folder</button>}
          {folder && folderOk && <button disabled={busy} onClick={() => act('Update folder', () => syncFolder(folder))}>Update folder now</button>}
          {folder && <button disabled={busy} onClick={() => act('Stop', async () => { await forgetDataFolder(); setFolder(null); setFolderOk(false); return 'Folder copy turned off (files already there are kept).'; })}>Stop using folder</button>}
        </div>
      </Card>}
    </div>
  );
}
