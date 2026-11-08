// Service, technician and installation manuals kept on the device for each library item (and a
// general shelf), so they open in the field with no internet. Backups include them (kv store).
import React, { useEffect, useState } from 'react';
import { kvGet, kvSet, kvKeys, fmtBytes } from '../engine/projectdb';
import type { SpecItem } from '../data/speclib';

export const MANUAL_KINDS = ['Installation manual', 'Service / repair manual', 'Technician / programming manual', 'Operation / user manual', 'Wiring diagram', 'Parts list', 'Firmware / software notes', 'Training / video', 'Other'] as const;
export interface Manual { id: string; kind: string; name: string; url?: string; type?: string; size?: number; blob?: Blob; savedAt: string; note?: string }
export const manualsKey = (owner: string) => `manuals:${owner}`;
const ownerOf = (it: SpecItem) => it.origin ?? it.id;
const rid = () => Math.random().toString(36).slice(2, 10);
const search = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

function openManual(m: Manual) {
  if (m.blob) { const u = URL.createObjectURL(m.blob); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); }
  else if (m.url) window.open(m.url, '_blank', 'noreferrer');
}

/** Manuals for one owner key: an item id or 'general'. */
export function ManualShelf({ owner, title, searchFor }: { owner: string; title: string; searchFor?: string }) {
  const [list, setList] = useState<Manual[]>([]);
  const [kind, setKind] = useState<string>(MANUAL_KINDS[1]);
  const [msg, setMsg] = useState('');
  const key = manualsKey(owner);
  useEffect(() => { let alive = true; kvGet<Manual[]>(key).then((v) => alive && setList(v ?? [])); return () => { alive = false; }; }, [key]);
  const save = async (n: Manual[]) => { setList(n); await kvSet(key, n.length ? n : undefined); };
  const attach = () => {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.pdf,application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.zip,video/*';
    i.onchange = async () => {
      const fs = Array.from(i.files ?? []); if (!fs.length) return;
      const big = fs.filter((f) => f.size > 60e6); if (big.length) { setMsg(`${big.map((f) => f.name).join(', ')} is over 60 MB; keep a link instead.`); }
      const add = fs.filter((f) => f.size <= 60e6).map((f): Manual => ({ id: rid(), kind, name: f.name, type: f.type || 'application/pdf', size: f.size, blob: f, savedAt: new Date().toISOString() }));
      await save([...list, ...add]); if (add.length) setMsg(`${add.length} file(s) saved on this device ✓ They open with no internet.`);
    };
    i.click();
  };
  const addLink = async () => {
    const url = prompt(`Web address of the ${kind.toLowerCase()}:`, 'https://'); if (!url || !/^https?:\/\/\S+/.test(url)) return;
    const name = prompt('Name to show:', `${searchFor ?? ''} ${kind}`.trim()) || url;
    let m: Manual = { id: rid(), kind, name, url, savedAt: new Date().toISOString() };
    // Save the file itself when the site allows it, so it also works offline.
    try { const r = await fetch(url, { mode: 'cors' }); if (r.ok) { const b = await r.blob(); if (b.size && !/text\/html/.test(b.type)) m = { ...m, blob: b, type: b.type, size: b.size }; } } catch { /* link only */ }
    await save([...list, m]); setMsg(m.blob ? 'Saved for offline use ✓' : 'Link saved. The site did not allow download; open it and use Attach file to keep a copy offline.');
  };
  const byKind = MANUAL_KINDS.map((k) => [k, list.filter((m) => m.kind === k)] as const).filter(([, l]) => l.length);
  return (
    <div className="manuals">
      <h4>{title} <span className="small muted">({list.length} saved)</span></h4>
      {byKind.map(([k, l]) => <div key={k}><div className="small muted">{k}</div><ul className="manual-list">{l.map((m) => (
        <li key={m.id}><button className="ghost" onClick={() => openManual(m)}>{m.blob ? '📄' : '🔗'} {m.name}</button>
          <span className="small muted">{m.blob ? `${fmtBytes(m.size ?? 0)} · offline` : 'link (needs internet)'}</span>
          <button className="ghost small" onClick={async () => { if (confirm(`Remove "${m.name}"?`)) await save(list.filter((x) => x.id !== m.id)); }}>Remove</button></li>))}</ul></div>)}
      <div className="row wrap">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Manual type" style={{ width: 'auto' }}>{MANUAL_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <button onClick={attach}>📎 Attach file</button>
        <button onClick={addLink}>🔗 Add link</button>
        {searchFor && <a className="button" href={search(`${searchFor} ${kind} pdf`)} target="_blank" rel="noreferrer">🔎 Find {kind.toLowerCase()} online</a>}
      </div>
      {msg && <p className="small note" role="status">{msg}</p>}
    </div>
  );
}

export function ItemManuals({ item }: { item: SpecItem }) {
  if (item.brand === 'Standard') return null;
  const who = item.brand === 'Typical' ? item.model : `${item.brand} ${item.model}`;
  return <ManualShelf owner={ownerOf(item)} title="Service, technician and installation manuals" searchFor={who} />;
}

/** Every saved manual on the device, for the library's resource shelf. */
export function useAllManuals() {
  const [n, setN] = useState<{ owner: string; list: Manual[] }[]>([]);
  useEffect(() => { kvKeys('manuals:').then(async (ks) => setN(await Promise.all(ks.map(async (k) => ({ owner: k.slice(8), list: (await kvGet<Manual[]>(k)) ?? [] }))))).catch(() => setN([])); }, []);
  return n;
}
