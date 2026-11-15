import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Project } from '../types';
import { askConfirm } from './askConfirm';
import { addVersion } from '../engine/projectdb';
import { PAGE_CLEAR, canClearPage, clearPage, pageHasEntries, undoClear } from '../engine/clearPage';

/** "Clear all fields" button for the page header. Asks first, saves a history copy, and offers Undo. */
export function ClearPageButton({ page, label, onCleared }: { page: string; label: string; onCleared: (before: Project) => void }) {
  const { project, replace, setRt, lib } = useStore();
  if (!canClearPage(page)) return null;
  const c = PAGE_CLEAR[page];
  const run = async () => {
    if (!pageHasEntries(page, project)) {
      await askConfirm({ title: 'Nothing to clear', message: <p>This page is already empty.</p>, ok: 'OK', cancel: 'Close' });
      return;
    }
    const ok = await askConfirm({
      danger: true, title: `Clear all fields on "${label}"?`, ok: 'Yes, clear this page', cancel: 'No, keep them',
      message: <>
        <p>This clears <b>{c.what}</b> in this project.</p>
        <p className="small">Lists are emptied and numbers go back to their starting values. Nothing on the other pages changes. {c.keeps ?? ''} Saved projects, your RadioReference login and downloads, the specifications library and contacts are not touched.</p>
        <p className="small">You can press <b>Undo</b> right after, and a copy from before is kept in Projects → History.</p>
      </>,
    });
    if (!ok) return;
    const before = project;
    try { await addVersion(lib.projectId, before, `Before clearing ${label}`); lib.bump(); } catch { /* storage unavailable: Undo still works */ }
    replace(clearPage(page, before));
    if (page === 'locate') setRt((r) => ({ ...r, locate: null, query: '' }));
    onCleared(before);
  };
  return <button className="danger" onClick={run} data-clear-page title="Clear every entry on this page only (asks first, and you can undo)">⌫ Clear all fields</button>;
}

/** The bar shown after a page was cleared, with Undo. */
export function UndoClearBar({ page, label, before, onDone }: { page: string; label: string; before: Project; onDone: (undone: boolean) => void }) {
  const { project, replace } = useStore();
  const [left, setLeft] = useState(60);
  useEffect(() => { const t = window.setInterval(() => setLeft((s) => s - 1), 1000); return () => window.clearInterval(t); }, []);
  useEffect(() => { if (left <= 0) onDone(false); }, [left, onDone]);
  return (
    <p className="note no-print clear-bar" role="status">
      ✓ Cleared the fields on {label}.{' '}
      <button className="primary" onClick={() => { replace(undoClear(page, project, before)); onDone(true); }}>↶ Undo</button>{' '}
      <button className="ghost" onClick={() => onDone(false)} aria-label="Close">✕</button>
      <span className="small muted"> Undo is here for {left} s; after that, use Projects → History.</span>
    </p>
  );
}
