import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onDeviceValue, deviceState } from '../engine/devices';
import qrcode from 'qrcode-generator';
import { useStore, downloadText, downloadBytes, deviceInfo, safeName } from '../store';
import { Card, Stat } from '../components/ui';
import { CodeScanner, decodeImageFile, beep } from '../components/CodeScanner';
import { askConfirm } from '../components/askConfirm';
import { shrinkPhoto } from './FieldNotes';
import { projectSystems, SYSTEMS } from '../data/systems';
import { writeXlsx } from '../engine/fileformats';
import { parseCsv } from '../engine/csv';
import { Asset, AssetEvent, ASSET_STATUS, PM_EVERY, EVENT_KINDS, blankAsset, findByTag, nextTag, tagFromScan, fieldsFromScan, pmState, nextPm, warrantyActive, assetsCsv, parseAssetsCsv, LABEL_PREFIX } from '../engine/assets';
import { uid } from '../defaults';

const today = () => new Date().toISOString().slice(0, 10);
const sysLabel = (id: string) => SYSTEMS.find((s) => s.id === id)?.label ?? id;
const sysIcon = (id: string) => SYSTEMS.find((s) => s.id === id)?.icon ?? '🔧';
/** A system id from free text in an imported list ("Fire alarm" → firealarm). */
const systemFromText = (t: string) => { const k = t.toLowerCase().replace(/[^a-z]/g, ''); if (!k) return ''; return SYSTEMS.find((s) => s.id === k || s.label.toLowerCase().replace(/[^a-z]/g, '').startsWith(k) || k.startsWith(s.id))?.id ?? ''; };
export function qrSvg(text: string, cell = 3) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 1, scalable: true }); }
const PM_TONE = { overdue: 'bad', soon: 'warn', ok: 'ok', none: '' } as const;

function PmPill({ a }: { a: Asset }) {
  const s = pmState(a);
  if (s.state === 'none') return <span className="small muted">—</span>;
  return <span className={'pill ' + PM_TONE[s.state]} title={`Next PM ${s.next}`}>{s.state === 'overdue' ? `PM ${-s.days} d overdue` : s.state === 'soon' ? `PM in ${s.days} d` : `PM ${s.next}`}</span>;
}

/** Scan, photo or type a code. */
function ScanButtons({ onCode, label = '📷 Scan tag' }: { onCode: (text: string, format: string) => void; label?: string }) {
  const [cam, setCam] = useState(false); const [msg, setMsg] = useState('');
  return <>
    <div className="row wrap">
      <button className="primary big" onClick={() => { setMsg(''); setCam(true); }}>{label}</button>
      <label className="button">🖼 Photo of the tag<input hidden type="file" accept="image/*" capture="environment" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setMsg('Reading the photo…'); const r = await decodeImageFile(f); if (r) { beep(); setMsg(''); onCode(r.text, r.format); } else setMsg('No barcode or QR code found in that photo. Get closer, hold steady, and try again, or type the code.'); }} /></label>
    </div>
    {msg && <p className="note">{msg}</p>}
    {cam && <CodeScanner onCode={(t, f) => { setCam(false); onCode(t, f); }} onClose={() => setCam(false)} />}
  </>;
}

function AssetEditor({ asset, isNew, onSave, onCancel, onDelete }: { asset: Asset; isNew: boolean; onSave: (a: Asset) => void; onCancel: () => void; onDelete: () => void }) {
  const { project: p } = useStore();
  const [a, setA] = useState(asset);
  const [gpsMsg, setGpsMsg] = useState('');
  const [ev, setEv] = useState<{ kind: AssetEvent['kind']; text: string }>({ kind: 'Inspected', text: '' });
  const set = <K extends keyof Asset>(k: K, v: Asset[K]) => setA((x) => ({ ...x, [k]: v }));
  const mine = projectSystems(p.meta);
  const others = SYSTEMS.filter((s) => !mine.some((m) => m.id === s.id));
  const gps = () => {
    if (!navigator.geolocation) { setGpsMsg('GPS is not available on this device.'); return; }
    setGpsMsg('Getting position…');
    navigator.geolocation.getCurrentPosition((pos) => { setA((x) => ({ ...x, lat: +pos.coords.latitude.toFixed(6), lon: +pos.coords.longitude.toFixed(6) })); setGpsMsg(`Position saved (±${Math.round(pos.coords.accuracy)} m).`); },
      (e) => setGpsMsg(`Could not get position: ${e.message}`), { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  };
  const addPhotos = async (files: FileList | null) => { if (!files) return; const ph = [...a.photos]; for (const f of Array.from(files)) { try { ph.push({ id: uid(), dataUrl: await shrinkPhoto(f), caption: '' }); } catch { /* not an image */ } } set('photos', ph); };
  const addEvent = () => { const e: AssetEvent = { id: uid(), date: today(), kind: ev.kind, text: ev.text.trim(), tech: deviceInfo().name }; setA((x) => ({ ...x, history: [e, ...x.history], ...(e.kind === 'PM done' ? { lastPm: e.date } : {}), ...(e.kind === 'Repaired' && x.status === 'Needs service' ? { status: 'In service' } : {}) })); setEv({ kind: 'Inspected', text: '' }); };
  const fill = (t: string) => { const f = fieldsFromScan(t); setA((x) => ({ ...x, serial: x.serial || f.serial || tagFromScan(t), model: x.model || f.model || '', make: x.make || f.make || '' })); };
  const F = ({ label, k, type = 'text', ph }: { label: string; k: 'name' | 'make' | 'model' | 'serial' | 'location' | 'floor'; type?: string; ph?: string }) =>
    <label className="field"><span>{label}</span><input type={type} value={(a[k] as string) ?? ''} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></label>;
  return (
    <Card title={isNew ? 'Add a device' : `Device ${a.tag}`} className="wide" tip="Everything about one installed device. It saves in the project, syncs to your other devices and prints in the closeout package.">
      <div className="form">
        <label className="field"><span>Tag (barcode or QR)</span><input value={a.tag} onChange={(e) => set('tag', e.target.value)} placeholder="Scan or type" /></label>
        {F({ label: 'What it is', k: 'name', ph: 'e.g. Smoke detector, Camera 12, BDA' })}
        <label className="field"><span>System</span><select value={a.system} onChange={(e) => set('system', e.target.value)} data-no-choose>
          <option value="">— Choose a system —</option>
          {mine.length > 0 && <optgroup label="On this project">{mine.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}</optgroup>}
          <optgroup label={mine.length ? 'Other systems' : 'All systems'}>{others.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}</optgroup></select></label>
        {F({ label: 'Make', k: 'make', ph: 'Manufacturer' })}{F({ label: 'Model', k: 'model' })}
        <label className="field"><span>Serial number</span><span className="row"><input value={a.serial} onChange={(e) => set('serial', e.target.value)} style={{ flex: 1 }} /></span></label>
        {F({ label: 'Location / room', k: 'location', ph: 'e.g. 2nd floor east stair' })}{F({ label: 'Floor', k: 'floor' })}
        <label className="field"><span>Site</span><select value={a.siteId ?? ''} onChange={(e) => set('siteId', e.target.value || undefined)} data-no-choose><option value="">Whole project</option>{p.sites.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}</select></label>
        <label className="field"><span>Installed</span><input type="date" value={a.installDate} onChange={(e) => set('installDate', e.target.value)} /></label>
        <label className="field"><span>Warranty ends</span><input type="date" value={a.warrantyEnd ?? ''} onChange={(e) => set('warrantyEnd', e.target.value || undefined)} /></label>
        <label className="field"><span>Maintenance (PM) every</span><select value={a.pmEvery ?? ''} onChange={(e) => set('pmEvery', e.target.value || undefined)} data-no-choose>{PM_EVERY.map((x) => <option key={x} value={x}>{x || 'No PM'}</option>)}</select></label>
        <label className="field"><span>Last PM</span><input type="date" value={a.lastPm ?? ''} onChange={(e) => set('lastPm', e.target.value || undefined)} /></label>
        <label className="field"><span>Status</span><select value={a.status} onChange={(e) => set('status', e.target.value as Asset['status'])} data-no-choose>{ASSET_STATUS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field wide"><span>Notes</span><textarea rows={3} value={a.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Programming, address, zone, password location…" /></label>
      </div>
      {nextPm(a) && <p className="small">Next PM: <b>{nextPm(a)}</b></p>}
      <details><summary>Scan the serial number or model from the device label</summary><ScanButtons label="📷 Scan the device label" onCode={(t) => fill(t)} /></details>
      <div className="row wrap">
        <label className="button">📷 Add photos<input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} /></label>
        <button onClick={gps}>📍 Save my GPS position</button>
        {a.lat != null && <span className="small muted">{a.lat}, {a.lon}</span>}{gpsMsg && <span className="small">{gpsMsg}</span>}
      </div>
      {a.photos.length > 0 && <div className="photo-grid">{a.photos.map((ph) => <figure key={ph.id}><img src={ph.dataUrl} alt={ph.caption || 'Device photo'} />
        <input value={ph.caption} placeholder="Caption" aria-label="Photo caption" onChange={(e) => set('photos', a.photos.map((x) => (x.id === ph.id ? { ...x, caption: e.target.value } : x)))} />
        <button className="ghost" onClick={() => set('photos', a.photos.filter((x) => x.id !== ph.id))}>Remove</button></figure>)}</div>}
      <h4>Service and maintenance history</h4>
      <div className="row wrap">
        <select value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value as AssetEvent['kind'] })} aria-label="What was done" data-no-choose>{EVENT_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <input style={{ flex: 1, minWidth: 180 }} value={ev.text} placeholder="What was done or found" onChange={(e) => setEv({ ...ev, text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') addEvent(); }} />
        <button onClick={addEvent}>+ Add to history</button>
      </div>
      {a.history.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Date</th><th>What</th><th>Details</th><th>Tech</th><th></th></tr></thead>
        <tbody>{a.history.map((h) => <tr key={h.id}><td>{h.date}</td><td>{h.kind}</td><td>{h.text}</td><td>{h.tech}</td><td><button className="ghost" aria-label="Remove" onClick={() => set('history', a.history.filter((x) => x.id !== h.id))}>✕</button></td></tr>)}</tbody></table></div>
        : <p className="small muted">Nothing yet. Each PM, test, repair or replacement you add shows here and in the reports.</p>}
      <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
        {!isNew && <button className="danger" onClick={onDelete}>Delete device</button>}
        <span style={{ flex: 1 }} />
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onSave({ ...a, tag: a.tag.trim(), name: a.name.trim() || a.model.trim() || 'Device' })}>Save device</button>
      </div>
    </Card>
  );
}

/** Equipment & asset tags: scan a barcode or QR tag to find a device or add it; PM due dates, service history, reports and labels. */
export function AssetsPage() {
  const { project: p, update, go } = useStore();
  const list = p.assets ?? [];
  const [edit, setEdit] = useState<{ a: Asset; isNew: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState(''); const [sys, setSys] = useState(''); const [show, setShow] = useState<'all' | 'due' | 'service'>('all');
  const [printing, setPrinting] = useState<'' | 'labels' | 'register'>('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);
  const siteName = (id?: string) => (id ? `${id} ${p.sites.find((s) => s.id === id)?.name ?? ''}`.trim() : '');

  const lookup = (raw: string, format = '') => {
    const t = tagFromScan(raw); if (!t) return;
    const hit = findByTag(list, t);
    if (hit) { setMsg(`Found ${hit.tag}: ${hit.name}.`); setEdit({ a: hit, isNew: false }); }
    else { const f = fieldsFromScan(raw); setMsg(`New tag ${t}. Fill in what it is and press Save.`); setEdit({ a: blankAsset({ tag: t, tagFormat: format || undefined, serial: f.serial ?? '', model: f.model ?? '', make: f.make ?? '', system: projectSystems(p.meta)[0]?.id ?? '', history: [{ id: uid(), date: today(), kind: 'Installed', text: '', tech: deviceInfo().name }] }), isNew: true }); }
    setCode('');
  };
  const lookupRef = useRef(lookup); lookupRef.current = lookup;
  const editing = useRef(false); editing.current = !!edit;
  // A connected Bluetooth / Wi-Fi scanner: each scan finds or adds a device (while a device is open, it types into the box you tapped).
  useEffect(() => onDeviceValue('scanner', (t) => { if (!editing.current) lookupRef.current(t); else { const el = document.activeElement as HTMLInputElement | null; if (el?.tagName === 'INPUT') { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; set?.call(el, t); el.dispatchEvent(new Event('input', { bubbles: true })); } } }), []);
  const save = (a: Asset) => {
    const dup = list.find((x) => x.id !== a.id && a.tag && x.tag.trim().toUpperCase() === a.tag.toUpperCase());
    if (dup) { setMsg(`Tag ${a.tag} is already on ${dup.name}. Use a different tag.`); return; }
    update((d) => { const l = d.assets ?? []; d.assets = l.some((x) => x.id === a.id) ? l.map((x) => (x.id === a.id ? a : x)) : [a, ...l]; });
    setEdit(null); setMsg(`Saved ${a.tag || a.name}.`); setTimeout(() => input.current?.focus(), 50);
  };
  const del = async (a: Asset) => { if (await askConfirm({ title: 'Delete this device?', message: `${a.tag} ${a.name} and its history will be removed.`, ok: 'Delete', danger: true })) { update((d) => { d.assets = (d.assets ?? []).filter((x) => x.id !== a.id); }); setEdit(null); } };
  const quick = (a: Asset, kind: AssetEvent['kind'], patch: Partial<Asset>) => update((d) => { d.assets = (d.assets ?? []).map((x) => (x.id === a.id ? { ...x, ...patch, history: [{ id: uid(), date: today(), kind, text: '', tech: deviceInfo().name }, ...x.history] } : x)); });

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = list.filter((a) => (!sys || a.system === sys) && (show !== 'due' || ['overdue', 'soon'].includes(pmState(a).state)) && (show !== 'service' || a.status === 'Needs service' || a.status === 'Out of service')
    && words.every((w) => `${a.tag} ${a.name} ${a.make} ${a.model} ${a.serial} ${a.location} ${a.floor ?? ''} ${sysLabel(a.system)}`.toLowerCase().includes(w)))
    .sort((x, y) => (sysLabel(x.system) + x.location + x.tag).localeCompare(sysLabel(y.system) + y.location + y.tag, undefined, { numeric: true }));
  const nOver = list.filter((a) => pmState(a).state === 'overdue').length, nSoon = list.filter((a) => pmState(a).state === 'soon').length;
  const nServ = list.filter((a) => a.status === 'Needs service' || a.status === 'Out of service').length, nWar = list.filter((a) => warrantyActive(a)).length;
  const bySystem = useMemo(() => [...new Set(list.map((a) => a.system))].map((s) => { const l = list.filter((a) => a.system === s); return { s, n: l.length, over: l.filter((a) => pmState(a).state === 'overdue').length, soon: l.filter((a) => pmState(a).state === 'soon').length, serv: l.filter((a) => a.status === 'Needs service' || a.status === 'Out of service').length }; }), [list]);
  const doPrint = (m: 'labels' | 'register') => { setPrinting(m); setTimeout(() => { window.print(); setPrinting(''); }, 80); };
  const toLabel = sel.size ? list.filter((a) => sel.has(a.id)) : shown;
  const importList = async (f?: File) => {
    if (!f) return;
    try {
      const r = parseAssetsCsv(await f.text(), systemFromText);
      let added = 0, same = 0;
      update((d) => { const l = [...(d.assets ?? [])]; for (const a of r.assets) { if (a.tag && findByTag(l, a.tag)) { same++; continue; } if (!a.tag) a.tag = nextTag(l); l.push(a); added++; } d.assets = l; });
      setMsg(`Imported ${added} device(s) from ${f.name}${same ? `; ${same} already listed` : ''}${r.skipped ? `; ${r.skipped} empty row(s) skipped` : ''}.`);
    } catch (e) { setMsg(`Import failed: ${(e as Error).message}`); }
  };
  const xlsx = () => { const rows = parseCsv(assetsCsv(list, sysLabel, siteName)); downloadBytes(`${safeName(p.meta.name)}-equipment.xlsx`, writeXlsx([{ name: 'Equipment', rows }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); };

  if (edit) return <div className="stack">{msg && <p className="note">{msg}</p>}<AssetEditor asset={edit.a} isNew={edit.isNew} onSave={save} onCancel={() => { setEdit(null); setMsg(''); }} onDelete={() => del(edit.a)} /></div>;
  return (
    <div className="stack">
      <div className="grid2 no-print">
        <Card title="Scan a tag" tour="asset-scan" tip="Scan a device's barcode or QR code. If the device is already listed it opens; if not, a new device starts with that tag. A handheld USB or Bluetooth barcode scanner also works: click in the box and scan.">
          <ScanButtons onCode={lookup} />
          <div className="row wrap" style={{ marginTop: 8 }}>
            <input ref={input} autoFocus style={{ flex: 1, minWidth: 180 }} value={code} placeholder="Or type a tag, or use a handheld scanner" aria-label="Tag code" onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') lookup(code); }} />
            <button disabled={!code.trim()} onClick={() => lookup(code)}>Find / add</button>
          </div>
          <p className="small muted">{deviceState('scanner')?.connected ? `🏷 ${deviceState('scanner')!.name} connected: just scan.` : <>Bluetooth or Wi-Fi scanner? <a href="#devices" onClick={(e) => { e.preventDefault(); go('devices'); }}>Connect it here</a>.</>}</p>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button onClick={() => setEdit({ a: blankAsset({ tag: nextTag(list), system: projectSystems(p.meta)[0]?.id ?? '', history: [{ id: uid(), date: today(), kind: 'Installed', text: '', tech: deviceInfo().name }] }), isNew: true })} title="For a device with no tag: the app gives it the next LV- number. Print its label below.">+ Add a device with no tag</button>
          </div>
          {msg && <p className="note">{msg}</p>}
        </Card>
        <Card title="At a glance" tip="PM due dates come from each device's interval and last PM date. Service & PM contracts list each system's devices and what is due.">
          <div className="stats">
            <Stat label="Devices" value={list.length} />
            <Stat label="PM overdue" value={nOver} tone={nOver ? 'bad' : 'ok'} />
            <Stat label="PM due in 30 days" value={nSoon} tone={nSoon ? 'warn' : 'ok'} />
            <Stat label="Needs service" value={nServ} tone={nServ ? 'bad' : 'ok'} />
            <Stat label="Under warranty" value={nWar} />
          </div>
          {bySystem.length > 0 && <div className="tbl-wrap"><table className="tbl"><thead><tr><th>System (service / PM contract)</th><th>Devices</th><th>PM overdue</th><th>PM due soon</th><th>Needs service</th></tr></thead>
            <tbody>{bySystem.map((b) => <tr key={b.s}><td><a href="#" onClick={(e) => { e.preventDefault(); setSys(b.s); }}>{sysIcon(b.s)} {sysLabel(b.s) || 'No system'}</a></td><td>{b.n}</td><td className={b.over ? 'bad-text' : ''}>{b.over}</td><td>{b.soon}</td><td className={b.serv ? 'bad-text' : ''}>{b.serv}</td></tr>)}</tbody></table></div>}
          <div className="row wrap"><button onClick={() => go('service')}>🧾 Service & maintenance resources</button><button onClick={() => go('reports')}>📄 Reports</button></div>
        </Card>
      </div>
      <Card title="Devices" className="no-print" tour="asset-list" actions={<div className="row wrap">
        <button disabled={!list.length} onClick={() => doPrint('register')}>🖨 Print list</button>
        <button disabled={!toLabel.length} onClick={() => doPrint('labels')} title="QR labels for the ticked devices, or all shown">🏷 Print labels ({toLabel.length})</button>
        <button disabled={!list.length} onClick={() => downloadText(`${safeName(p.meta.name)}-equipment.csv`, assetsCsv(list, sysLabel, siteName), 'text/csv')}>Export CSV</button>
        <button disabled={!list.length} onClick={xlsx}>Export Excel</button>
        <label className="button">📂 Import list<input hidden type="file" accept=".csv,.txt,.tsv" onChange={(e) => { importList(e.target.files?.[0]); e.target.value = ''; }} /></label>
      </div>}>
        <div className="row wrap">
          <input className="lib-search" style={{ flex: 1, minWidth: 180, marginBottom: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Search tag, name, model, serial, room" aria-label="Search devices" />
          <select value={sys} onChange={(e) => setSys(e.target.value)} aria-label="System" data-no-choose><option value="">All systems</option>{[...new Set(list.map((a) => a.system))].map((s) => <option key={s} value={s}>{sysIcon(s)} {sysLabel(s) || 'No system'}</option>)}</select>
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show" data-no-choose><option value="all">All devices</option><option value="due">PM overdue or due soon</option><option value="service">Needs service</option></select>
        </div>
        {!list.length ? <p className="muted">No devices yet. Press <b>📷 Scan tag</b> and point the camera at a device's barcode or QR code, or add a device with no tag.</p> :
          <div className="tbl-wrap"><table className="tbl asset-tbl"><thead><tr><th><input type="checkbox" aria-label="Tick all" checked={sel.size > 0 && shown.every((a) => sel.has(a.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((a) => a.id)) : new Set())} /></th><th>Tag</th><th>Device</th><th>Location</th><th>Make / model / serial</th><th>Installed</th><th>PM</th><th>Status</th><th>Quick</th></tr></thead>
            <tbody>{shown.map((a) => <tr key={a.id}>
              <td><input type="checkbox" aria-label={`Tick ${a.tag}`} checked={sel.has(a.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(a.id); else s.delete(a.id); setSel(s); }} /></td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setEdit({ a, isNew: false }); }}><b>{a.tag || '(no tag)'}</b></a></td>
              <td>{sysIcon(a.system)} {a.name}{a.photos.length > 0 && <span className="small muted"> · 📷{a.photos.length}</span>}</td>
              <td>{[a.location, a.floor && `floor ${a.floor}`].filter(Boolean).join(', ')}</td>
              <td className="small">{[a.make, a.model].filter(Boolean).join(' ')}{a.serial && <><br />S/N {a.serial}</>}</td>
              <td className="small">{a.installDate}{warrantyActive(a) && <><br /><span className="muted">warranty to {a.warrantyEnd}</span></>}</td>
              <td><PmPill a={a} /></td>
              <td className={a.status === 'In service' ? '' : 'bad-text'}>{a.status}</td>
              <td className="nowrap">{a.pmEvery && <button title="Mark PM done today" onClick={() => quick(a, 'PM done', { lastPm: today() })}>✔ PM</button>}
                {a.status === 'In service' ? <button title="Mark as needing service" onClick={() => quick(a, 'Note', { status: 'Needs service' })}>⚠</button> : <button title="Mark repaired and back in service" onClick={() => quick(a, 'Repaired', { status: 'In service' })}>🛠 Fixed</button>}</td>
            </tr>)}</tbody></table></div>}
      </Card>
      {printing === 'labels' && <div className="print-only label-sheet">{toLabel.map((a) => <div key={a.id} className="asset-label">
        <div dangerouslySetInnerHTML={{ __html: qrSvg(LABEL_PREFIX + a.tag) }} />
        <div><b>{a.tag}</b><br />{a.name}<br /><small>{p.company.name || p.meta.name}{p.company.phone ? ` · ${p.company.phone}` : ''}</small></div></div>)}</div>}
      {printing === 'register' && <div className="print-only"><h2>Equipment list: {p.meta.name}</h2><p>{p.company.name} · printed {new Date().toLocaleDateString()}</p>
        <table className="rpt-tbl"><thead><tr><th>Tag</th><th>Device</th><th>System</th><th>Location</th><th>Make / model</th><th>Serial</th><th>Installed</th><th>Next PM</th><th>Status</th></tr></thead>
          <tbody>{shown.map((a) => <tr key={a.id}><td>{a.tag}</td><td>{a.name}</td><td>{sysLabel(a.system)}</td><td>{[a.location, a.floor].filter(Boolean).join(', ')}</td><td>{a.make} {a.model}</td><td>{a.serial}</td><td>{a.installDate}</td><td>{nextPm(a) ?? ''}</td><td>{a.status}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
