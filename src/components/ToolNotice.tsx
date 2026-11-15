import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { applyTypeTools, clearToolNotice, neededTools, showToolNotice, toolLabel, useToolNotice } from '../engine/toolPrefs';
import { projectSystems } from '../data/systems';

/**
 * When the project type or sub-projects change (or another project is opened), turn on any tool the job needs
 * that was turned off in User Settings, and, on a custom project, add it to the custom page pick. The user is told.
 */
export function useAutoTools() {
  const { project: p, update, lib } = useStore();
  const key = `${p.meta.projectType ?? ''}|${(p.meta.subSystems ?? []).join(',')}`;
  const last = useRef<{ id: string; key: string } | null>(null);
  useEffect(() => {
    const prev = last.current; last.current = { id: lib.projectId, key };
    if (!prev || prev.key === key) return; // first start, or nothing changed: leave the user's choice alone
    const meta = { projectType: p.meta.projectType, subSystems: p.meta.subSystems };
    const { on } = applyTypeTools(meta);
    let added: string[] = [];
    if (prev.id === lib.projectId && p.meta.projectType === 'custom' && p.meta.customPages?.length) {
      const have = new Set(p.meta.customPages);
      added = neededTools(meta).filter((x) => !have.has(x));
      if (added.length) update((d) => { d.meta.customPages = [...(d.meta.customPages ?? []), ...added]; });
    }
    if (added.length) showToolNotice([...on, ...added], projectSystems(meta).map((s) => s.label).join(', '));
  }, [key, lib.projectId]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** "These tools were turned on for this project type" notice. */
export function ToolNotice() {
  const n = useToolNotice();
  const { go } = useStore();
  if (!n) return null;
  return (
    <div className="tool-notice no-print" role="status">
      <div className="small muted">Menu set up for: {n.why}</div>
      {n.pages.length > 0 && <><b>✓ Turned on {n.pages.length} tool{n.pages.length > 1 ? 's' : ''} this job needs</b>
        <ul>{n.pages.map((id) => <li key={id}><a href={`#${id}`} onClick={(e) => { e.preventDefault(); go(id); clearToolNotice(); }}>{toolLabel(id)}</a></li>)}</ul></>}
      {(n.hid?.length ?? 0) > 0 && <><b>Hid {n.hid!.length} tool{n.hid!.length > 1 ? 's' : ''} this job does not use</b>
        <div className="small">{n.hid!.map(toolLabel).join(', ')}. Nothing was deleted.</div></>}
      <div className="small" style={{ marginTop: 4 }}>You can turn any tool on or off in User Settings.</div>
      <div className="row wrap" style={{ marginTop: 6 }}><button className="primary" onClick={clearToolNotice}>OK</button><button onClick={() => { go('settings'); clearToolNotice(); }}>User Settings</button></div>
    </div>
  );
}
