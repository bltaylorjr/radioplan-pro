import React, { useState } from 'react';
import { useStore, downloadText, deviceInfo, safeName } from '../store';
import { Card } from '../components/ui';
import { toCsv } from '../engine/csv';
import { uid } from '../defaults';
import type { FieldNote } from '../types';

export const NOTE_CATEGORIES = ['Site visit', 'Measurement', 'Punch list', 'Safety', 'Customer / AHJ', 'Installation', 'Other'];

/** Shrink a photo to at most 1280 px on the long side (JPEG) so projects stay small enough to sync. */
export async function shrinkPhoto(file: File, max = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally { URL.revokeObjectURL(url); }
}
export function notesCsv(notes: FieldNote[], siteName: (id?: string) => string): string {
  return toCsv([['Date', 'Title', 'Category', 'Site', 'Latitude', 'Longitude', 'Follow-up', 'Done', 'Author', 'Photos', 'Note'],
    ...notes.map((n) => [n.at, n.title, n.category, siteName(n.siteId), n.lat ?? '', n.lon ?? '', n.followUp ? 'yes' : '', n.done ? 'yes' : '', n.author, n.photos.length, n.text])]);
}
const blank = (): FieldNote => ({ id: uid(), at: new Date().toISOString(), title: '', text: '', category: 'Site visit', photos: [], tags: [], author: deviceInfo().name, followUp: false, done: false });
const when = (s: string) => new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function NoteEditor({ note, onSave, onCancel }: { note: FieldNote; onSave: (n: FieldNote) => void; onCancel: () => void }) {
  const { project: p } = useStore();
  const [n, setN] = useState(note);
  const [gpsMsg, setGpsMsg] = useState('');
  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const ph = [...n.photos];
    for (const f of Array.from(files)) { try { ph.push({ id: uid(), dataUrl: await shrinkPhoto(f), caption: '' }); } catch { /* not an image */ } }
    setN({ ...n, photos: ph });
  };
  const gps = () => {
    if (!navigator.geolocation) { setGpsMsg('GPS is not available on this device.'); return; }
    setGpsMsg('Getting position…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setN((x) => ({ ...x, lat: +pos.coords.latitude.toFixed(6), lon: +pos.coords.longitude.toFixed(6), accM: Math.round(pos.coords.accuracy) })); setGpsMsg(`Position saved (±${Math.round(pos.coords.accuracy)} m).`); },
      (e) => setGpsMsg(`Could not get position: ${e.message}`), { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  };
  return (
    <Card title={note.title ? 'Edit note' : 'New field note'}>
      <div className="form">
        <label className="field wide"><span>Title</span><input value={n.title} autoFocus placeholder="e.g. Roof access and mast location" onChange={(e) => setN({ ...n, title: e.target.value })} /></label>
        <label className="field"><span>Category</span><select value={n.category} onChange={(e) => setN({ ...n, category: e.target.value })}>{NOTE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field"><span>Site</span><select value={n.siteId ?? ''} onChange={(e) => setN({ ...n, siteId: e.target.value || undefined })}><option value="">Whole project</option>{p.sites.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}</select></label>
        <label className="field wide"><span>Note</span><textarea rows={7} value={n.text} placeholder="Type, or use the microphone on your phone keyboard to dictate." onChange={(e) => setN({ ...n, text: e.target.value })} /></label>
      </div>
      <div className="row wrap">
        <label className="button">📷 Add photos<input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => addPhotos(e.target.files)} /></label>
        <button onClick={gps}>📍 Save my GPS position</button>
        <label className="check"><input type="checkbox" checked={n.followUp} onChange={(e) => setN({ ...n, followUp: e.target.checked })} /> Needs follow-up</label>
        {n.lat != null && <span className="small muted">{n.lat}, {n.lon}{n.accM ? ` (±${n.accM} m)` : ''}</span>}
        {gpsMsg && <span className="small">{gpsMsg}</span>}
      </div>
      {n.photos.length > 0 && <div className="photo-grid">{n.photos.map((ph) => (
        <figure key={ph.id}><img src={ph.dataUrl} alt={ph.caption || 'Field photo'} />
          <input value={ph.caption} placeholder="Caption" aria-label="Photo caption" onChange={(e) => setN({ ...n, photos: n.photos.map((x) => x.id === ph.id ? { ...x, caption: e.target.value } : x) })} />
          <button className="ghost" onClick={() => setN({ ...n, photos: n.photos.filter((x) => x.id !== ph.id) })}>Remove</button></figure>))}</div>}
      <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onSave({ ...n, title: n.title.trim() || n.text.trim().split('\n')[0].slice(0, 60) || 'Field note' })}>Save note</button>
      </div>
    </Card>
  );
}

export function FieldNotesPage() {
  const { project: p, update } = useStore();
  const notes = p.fieldNotes ?? [];
  const [edit, setEdit] = useState<FieldNote | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [openOnly, setOpenOnly] = useState(false);
  const siteName = (id?: string) => (id ? `${id} ${p.sites.find((s) => s.id === id)?.name ?? ''}`.trim() : '');
  const save = (n: FieldNote) => { update((d) => { const l = d.fieldNotes ?? []; d.fieldNotes = l.some((x) => x.id === n.id) ? l.map((x) => (x.id === n.id ? n : x)) : [n, ...l]; }); setEdit(null); };
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = notes.filter((n) => (cat === 'All' || n.category === cat) && (!openOnly || (n.followUp && !n.done)) && words.every((w) => `${n.title} ${n.text} ${n.category} ${siteName(n.siteId)}`.toLowerCase().includes(w)))
    .sort((a, b) => b.at.localeCompare(a.at));
  const open = notes.filter((n) => n.followUp && !n.done).length;
  if (edit) return <NoteEditor note={edit} onSave={save} onCancel={() => setEdit(null)} />;
  return (
    <div className="grid">
      <Card title="Field notes" className="wide" tip="Notes, photos and GPS positions taken on site. They save in the project, sync with your other devices and print in the report." actions={<div className="row wrap">
        <button className="primary" onClick={() => setEdit(blank())}>+ New note</button>
        <button disabled={!notes.length} onClick={() => downloadText(`${safeName(p.meta.name)}-field-notes.csv`, notesCsv(notes, siteName), 'text/csv')}>Export CSV</button>
      </div>}>
        <div className="row wrap">
          <input className="lib-search" style={{ flex: 1, minWidth: 180, marginBottom: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Search notes" aria-label="Search notes" />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option>All</option>{NOTE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <label className="check"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open follow-ups ({open})</label>
        </div>
        {!notes.length && <p className="muted">No notes yet. Press <b>+ New note</b> to write one, add photos from the camera and save your GPS position.</p>}
        <div className="notes">{list.map((n) => (
          <article key={n.id} className={'note-card' + (n.followUp && !n.done ? ' open' : '')}>
            <header><b>{n.title}</b><span className="small muted">{when(n.at)} · {n.category}{n.siteId ? ` · Site ${siteName(n.siteId)}` : ''} · {n.author}</span></header>
            {n.text && <p className="note-text">{n.text}</p>}
            {n.photos.length > 0 && <div className="photo-strip">{n.photos.map((ph) => <img key={ph.id} src={ph.dataUrl} alt={ph.caption || 'Field photo'} title={ph.caption} />)}</div>}
            <footer className="row wrap">
              {n.lat != null && <a className="small" href={`https://www.google.com/maps?q=${n.lat},${n.lon}`} target="_blank" rel="noreferrer">📍 {n.lat}, {n.lon}</a>}
              {n.followUp && <label className="check small"><input type="checkbox" checked={n.done} onChange={(e) => update((d) => { d.fieldNotes = (d.fieldNotes ?? []).map((x) => x.id === n.id ? { ...x, done: e.target.checked } : x); })} /> Follow-up done</label>}
              <span style={{ flex: 1 }} />
              <button onClick={() => setEdit(n)}>Edit</button>
              <button className="danger" onClick={() => { if (confirm('Delete this note?')) update((d) => { d.fieldNotes = (d.fieldNotes ?? []).filter((x) => x.id !== n.id); }); }}>Delete</button>
            </footer>
          </article>))}
        </div>
      </Card>
    </div>
  );
}
