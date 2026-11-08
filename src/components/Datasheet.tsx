import React, { useEffect, useState } from 'react';
import { kvGet, kvSet, fmtBytes } from '../engine/projectdb';
import type { SpecItem } from '../data/speclib';

/** A datasheet saved on the device, so it opens with no internet. */
export interface SavedSheet { name: string; type: string; size: number; blob: Blob; savedAt: string; from?: string }
export const sheetKey = (it: SpecItem) => `datasheet:${it.origin ?? it.id}`;
export const loadSheet = (it: SpecItem) => kvGet<SavedSheet>(sheetKey(it));

/** Try to download a datasheet link. Many manufacturer sites refuse; then the user saves the file and attaches it. */
export async function fetchSheet(url: string): Promise<SavedSheet | null> {
  try {
    const r = await fetch(url, { mode: 'cors' }); if (!r.ok) return null;
    const blob = await r.blob(); if (!blob.size || /text\/html/.test(blob.type)) return null;
    return { name: decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'datasheet.pdf'), type: blob.type || 'application/pdf', size: blob.size, blob, savedAt: new Date().toISOString(), from: url };
  } catch { return null; }
}

export function Datasheet({ item, searchUrl }: { item: SpecItem; searchUrl: string }) {
  const [s, setS] = useState<SavedSheet | null>(null);
  const [msg, setMsg] = useState('');
  const key = sheetKey(item);
  useEffect(() => {
    let alive = true; setMsg('');
    loadSheet(item).then(async (v) => {
      if (!alive) return; setS(v ?? null);
      // A datasheet link with no saved copy: try to save it for offline use straight away.
      if (!v && item.datasheet && /^https?:\/\//.test(item.datasheet) && navigator.onLine) { const got = await fetchSheet(item.datasheet); if (got && alive) { await kvSet(key, got); setS(got); setMsg('Datasheet saved for offline use ✓'); } }
    });
    return () => { alive = false; };
  }, [key, item.datasheet]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = () => { if (!s) return; const u = URL.createObjectURL(s.blob); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); };
  const attach = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,application/pdf,image/*,.doc,.docx';
    i.onchange = async () => { const f = i.files?.[0]; if (!f) return; const v: SavedSheet = { name: f.name, type: f.type || 'application/pdf', size: f.size, blob: f, savedAt: new Date().toISOString() }; await kvSet(key, v); setS(v); setMsg('Datasheet saved on this device ✓'); };
    i.click();
  };
  const tryLink = async () => { if (!item.datasheet) return; setMsg('Downloading…'); const got = await fetchSheet(item.datasheet); if (got) { await kvSet(key, got); setS(got); setMsg('Datasheet saved for offline use ✓'); } else { window.open(item.datasheet, '_blank'); setMsg('That site does not let apps download its files. It opened in your browser: save the PDF, then tap “Attach saved PDF”.'); } };
  return (
    <div className="datasheet">
      <div className="row wrap">
        {s ? <><button className="primary" onClick={open}>📄 Open saved datasheet</button><span className="small muted">{s.name} · {fmtBytes(s.size)} · works offline</span>
          <button className="ghost" onClick={async () => { if (confirm('Remove the saved datasheet from this device?')) { await kvSet(key, undefined); setS(null); } }}>Remove</button></>
          : <>{item.datasheet && /^https?:\/\//.test(item.datasheet) && <button onClick={tryLink}>⬇ Save datasheet for offline</button>}
            {item.brand !== 'Standard' && <a className="button" href={searchUrl} target="_blank" rel="noreferrer">🔎 Find datasheet online</a>}
            <button onClick={attach}>📎 Attach saved PDF</button></>}
        {item.datasheet && /^https?:\/\//.test(item.datasheet) && <a className="small" href={item.datasheet} target="_blank" rel="noreferrer">Datasheet link ↗</a>}
      </div>
      {msg && <p className="small note" role="status">{msg}</p>}
    </div>
  );
}
