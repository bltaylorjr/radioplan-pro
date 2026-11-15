import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Project } from '../types';
import { askConfirm, askDelete } from './askConfirm';
import { addVersion, getRecord, loadTerrain, encodeDem, type BackupEntry } from '../engine/projectdb';
import { resetProject } from '../engine/clearPage';
import { loadCompanyDefault } from '../engine/companyDefault';

type Undo = { kind: 'reset'; name: string; before: Project } | { kind: 'delete'; name: string; entry: BackupEntry };

/** Reset (clear every page) or delete the whole open project, on the main page. Both ask first and can be undone for a minute. */
export function ProjectActions() {
  const { project, replace, setRt, lib } = useStore();
  const [undo, setUndoState] = useState<Undo | null>(null);
  const setUndo = (u: Undo | null) => { setLeft(60); setUndoState(u); };
  const [left, setLeft] = useState(0);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!undo) return; const t = window.setInterval(() => setLeft((s) => s - 1), 1000); return () => window.clearInterval(t); }, [undo]);
  useEffect(() => { if (undo && left <= 0) setUndo(null); }, [left, undo]);
  const name = project.meta.name || 'this project';

  const reset = async () => {
    const ok = await askConfirm({
      danger: true, title: 'Are you sure?', ok: 'Reset', cancel: 'Cancel',
      message: <>
        <p>Reset <b>“{name}”</b>? Every entry on every page of this project is cleared: project and client information, sites, designs, field notes and photos, tests, materials, checklists, drawings and pricing.</p>
        <p className="small">The project stays in Projects as a blank project. Other projects, your saved company default, the RadioReference login and downloads, the specifications library and contacts are not touched.</p>
        <p className="small">You can press <b>Undo</b> right after, and a copy from before is kept in Projects → History of this project.</p>
      </>,
    });
    if (!ok) return;
    const before = project;
    try { await addVersion(lib.projectId, before, 'Before resetting the project'); } catch { /* storage unavailable: Undo still works */ }
    replace(resetProject(before, await loadCompanyDefault().catch(() => undefined)));
    setRt((r) => ({ ...r, profile: null, coverage: null, locate: null, query: '', showRequired: false }));
    lib.bump(); setMsg(''); setUndo({ kind: 'reset', name, before });
  };

  const remove = async () => {
    const ok = await askDelete(<>Delete the project <b>“{name}”</b>?</>,
      <>It is removed from this device with its history, terrain and its copy in the data folder (flash drive). The most recent other project opens instead, or a new blank one. You can press Undo right after; for a lasting copy press Export at the top first.</>);
    if (!ok) return;
    const id = lib.projectId;
    let entry: BackupEntry | null = null;
    try {
      const r = await getRecord(id); const dem = await loadTerrain(id);
      if (r) { const { project: _p, ...record } = r; entry = { record, project: project, terrain: dem ? encodeDem(dem) : null }; }
    } catch { /* no backup: delete still goes ahead */ }
    try { await lib.removeProject(id); } catch (e) { setMsg(`Delete failed: ${(e as Error)?.message ?? e}`); return; }
    setMsg(''); setUndo(entry ? { kind: 'delete', name, entry } : null);
    if (!entry) setMsg(`Deleted “${name}”.`);
  };

  const doUndo = async () => {
    if (!undo) return; const u = undo; setUndo(null);
    try {
      if (u.kind === 'reset') { replace(u.before); setMsg(`“${u.name}” is back the way it was.`); }
      else { const [id] = await lib.importProjects([u.entry]); if (id) await lib.openProject(id); setMsg(`“${u.name}” is back and open.`); }
    } catch (e) { setMsg(`Undo failed: ${(e as Error)?.message ?? e}. Check Projects → History.`); }
  };

  return (
    <section className="card project-actions no-print" data-tour="project-actions">
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <span className="muted small" style={{ flex: 1, minWidth: 200 }}>Whole project: <b>{name}</b></span>
        <button onClick={reset} data-reset-project title="Clear every entry on every page of this project (asks first, and you can undo)">↺ Reset project</button>
        <button className="danger" onClick={remove} data-delete-project title="Delete this whole project from this device (asks first, and you can undo)">🗑 Delete project</button>
      </div>
      {undo && <p className="note clear-bar" role="status">✓ {undo.kind === 'reset' ? `Reset “${undo.name}”.` : `Deleted “${undo.name}”.`}{' '}
        <button className="primary" onClick={doUndo}>↶ Undo</button>{' '}
        <button className="ghost" onClick={() => setUndo(null)} aria-label="Close">✕</button>
        <span className="small muted"> Undo is here for {left} s{undo.kind === 'reset' ? '; after that, use Projects → History' : ''}.</span></p>}
      {msg && !undo && <p className="small muted" role="status">{msg}</p>}
    </section>
  );
}
