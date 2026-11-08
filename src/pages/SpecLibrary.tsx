import { Datasheet } from '../components/Datasheet';
import { recsFor } from '../data/mfrrecs';

/** Manufacturer recommendations: the model's own list, then the category's general points. */
function MfrRecs({ item }: { item: SpecItem }) {
  const { own, general } = recsFor(item);
  if (!own.length && !general.length) return null;
  return <div className="mfr-recs"><h4>Manufacturer recommendations</h4>
    {own.length > 0 && <><p className="small muted">For this model{item.kind === 'My item' ? ' (you entered these)' : ''}:</p><ul>{own.map((r) => <li key={r}>{r}</li>)}</ul></>}
    {general.map((g) => <details key={g.title} open={!own.length}><summary>{g.title} <span className="small muted">({g.items.length})</span></summary><ul>{g.items.map((r) => <li key={r}>{r}</li>)}</ul></details>)}
    {general.length > 0 && <p className="small muted">General points that {item.category.toLowerCase()} manufacturers commonly state. The installation manual and datasheet for this exact model govern{item.kind === 'My item' ? '' : '; use Copy to my library to add the model’s own points'}.</p>}
  </div>;
}
import React, { useEffect, useMemo, useState } from 'react';
import { useStore, downloadText } from '../store';
import { Card } from '../components/ui';
import { builtInSpecs, CATEGORIES, TEMPLATES, SpecItem, SpecValue } from '../data/speclib';
import { newId } from '../engine/projectdb';
import { loadMyItems, saveMyItems, SPECLIB_EVENT, autoLoadEquipment } from '../data/projectEquipment';
import { parseCsv, toCsv } from '../engine/csv';
import type { Antenna, Feeder, Radio } from '../data/catalog';

export { loadMyItems };

const num = (v: SpecValue | undefined) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const BASE_COLS = ['category', 'subcategory', 'brand', 'model', 'datasheet', 'notes'];

/** CSV with fixed columns plus one column per spec name. */
export function specsToCsv(items: SpecItem[]): string {
  const keys = [...new Set(items.flatMap((i) => Object.keys(i.specs)))];
  return toCsv([[...BASE_COLS, ...keys], ...items.map((i) => [i.category, i.sub, i.brand, i.model, i.datasheet ?? '', i.notes ?? '', ...keys.map((k) => String(i.specs[k] ?? ''))])]);
}
export function specsFromCsv(text: string): SpecItem[] {
  const rows = parseCsv(text); if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim()); const lc = head.map((h) => h.toLowerCase());
  const col = (n: string) => lc.indexOf(n);
  return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => {
    const specs: Record<string, SpecValue> = {};
    head.forEach((h, i) => { if (!BASE_COLS.includes(lc[i]) && r[i]?.trim()) { const v = r[i].trim(); specs[h] = /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : v; } });
    const g = (n: string) => (col(n) >= 0 ? r[col(n)]?.trim() ?? '' : '');
    const cat = CATEGORIES.find((c) => c.toLowerCase() === g('category').toLowerCase()) ?? (g('category') || 'Other');
    return { id: newId(), category: cat, sub: g('subcategory'), brand: g('brand'), model: g('model') || '(unnamed)', datasheet: g('datasheet') || undefined, notes: g('notes') || undefined, specs, kind: 'My item' as const, added: Date.now() };
  });
}
/** Turn a library item into equipment the calculations can use. */
export function toEquipment(it: SpecItem): { antenna?: Antenna; feeder?: Feeder; radio?: Radio } | null {
  const s = it.specs, id = `lib-${it.id}`;
  if (it.category === 'Antennas') {
    const lo = num(s['Band low (MHz)']), hi = num(s['Band high (MHz)']), g = num(s['Gain (dBi)']);
    if (lo == null || hi == null || g == null) return null;
    return { antenna: { id, brand: it.brand, model: it.model, type: String(s['Type'] ?? it.sub ?? 'Antenna'), bandMHz: [lo, hi], gainDbi: g, hBwDeg: num(s['H beamwidth (°)']) ?? 360, vBwDeg: num(s['V beamwidth (°)']) ?? 20, connector: String(s['Connector'] ?? ''), weightLb: num(s['Weight (lb)']) ?? 0, windAreaSqft: num(s['Wind area (sq ft)']) ?? 0, mount: String(s['Mount'] ?? '') } };
  }
  if (it.category === 'Coax & feeders') {
    const pts = Object.entries(s).map(([k, v]) => { const m = k.match(/Loss @\s*([\d.]+)\s*MHz/i); const l = num(v); return m && l != null ? [parseFloat(m[1]), l] as [number, number] : null; }).filter(Boolean) as [number, number][];
    if (pts.length < 2) return null;
    return { feeder: { id, brand: it.brand, model: it.model, size: String(s['Size'] ?? it.sub ?? ''), points: pts.sort((a, b) => a[0] - b[0]), minBendIn: num(s['Min bend radius (in)']) ?? 0, connector: String(s['Connector'] ?? ''), hangerSpacingFt: num(s['Hanger spacing (ft)']) ?? 3, groundKit: String(s['Ground kit'] ?? ''), hanger: String(s['Hanger'] ?? '') } };
  }
  if (it.category === 'Radios & repeaters' || it.category === 'ERCES / BDA & DAS') {
    const lo = num(s['Band low (MHz)']), hi = num(s['Band high (MHz)']), w = num(s['Max power (W)']);
    if (lo == null || hi == null || w == null) return null;
    return { radio: { id, brand: it.brand, model: it.model, type: String(s['Type'] ?? it.sub ?? 'Radio'), bandMHz: [lo, hi], maxPowerW: w, sensitivityDbm: num(s['Sensitivity (dBm)']) ?? -110, dcInputV: num(s['DC input (V)']) ?? 12, drawTxA: num(s['TX current (A)']) ?? 0, drawRxA: num(s['RX current (A)']) ?? 0 } };
  }
  return null;
}

function Editor({ item, onSave, onCancel }: { item: SpecItem; onSave: (i: SpecItem) => void; onCancel: () => void }) {
  const [d, setD] = useState<SpecItem>(item);
  const [rows, setRows] = useState<[string, string][]>(() => {
    const t = TEMPLATES[item.category] ?? [];
    const keys = [...new Set([...t, ...Object.keys(item.specs)])];
    return keys.map((k) => [k, item.specs[k] != null ? String(item.specs[k]) : '']);
  });
  const setCat = (c: string) => { setD({ ...d, category: c }); const have = new Set(rows.map((r) => r[0])); setRows([...rows.filter((r) => r[1]), ...(TEMPLATES[c] ?? []).filter((k) => !have.has(k) || !rows.find((r) => r[0] === k)?.[1]).map((k) => [k, ''] as [string, string])]); };
  const save = () => {
    const specs: Record<string, SpecValue> = {};
    for (const [k, v] of rows) if (k.trim() && v.trim()) specs[k.trim()] = /^-?\d+(\.\d+)?$/.test(v.trim()) ? parseFloat(v) : v.trim();
    onSave({ ...d, specs, model: d.model.trim() || '(unnamed)' });
  };
  return (
    <Card title={item.added ? 'Edit item' : 'Add equipment'}>
      <div className="form">
        <label className="field"><span>Category</span><select value={d.category} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field"><span>Type / subcategory</span><input value={d.sub} onChange={(e) => setD({ ...d, sub: e.target.value })} /></label>
        <label className="field"><span>Manufacturer</span><input value={d.brand} onChange={(e) => setD({ ...d, brand: e.target.value })} /></label>
        <label className="field"><span>Model</span><input value={d.model} onChange={(e) => setD({ ...d, model: e.target.value })} /></label>
        <label className="field wide"><span>Datasheet link</span><input value={d.datasheet ?? ''} placeholder="https://…" onChange={(e) => setD({ ...d, datasheet: e.target.value })} /></label>
        <label className="field wide"><span>Notes</span><input value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} /></label>
        <label className="field wide"><span>Manufacturer recommendations (one per line, from the installation manual or datasheet)</span><textarea rows={4} value={(d.recommendations ?? []).join('\n')} onChange={(e) => setD({ ...d, recommendations: e.target.value.split('\n') })} onBlur={() => setD({ ...d, recommendations: (d.recommendations ?? []).map((x) => x.trim()).filter(Boolean) })} /></label>
      </div>
      <h4>Specifications</h4>
      <div className="tbl-wrap"><table className="tbl"><tbody>
        {rows.map(([k, v], i) => <tr key={i}>
          <td><input value={k} aria-label="Specification name" onChange={(e) => setRows(rows.map((r, j) => j === i ? [e.target.value, r[1]] : r))} /></td>
          <td><input value={v} aria-label={`${k} value`} onChange={(e) => setRows(rows.map((r, j) => j === i ? [r[0], e.target.value] : r))} /></td>
          <td><button className="ghost" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td></tr>)}
      </tbody></table></div>
      <div className="row wrap">
        <button onClick={() => setRows([...rows, ['', '']])}>+ Add a specification</button>
        <span style={{ flex: 1 }} />
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={save}>Save to library</button>
      </div>
    </Card>
  );
}

export function SpecLibraryPage() {
  const { update, project } = useStore();
  const [mine, setMine] = useState<SpecItem[]>([]);
  const builtIn = useMemo(builtInSpecs, []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [sel, setSel] = useState<string | null>(null);
  const [cmp, setCmp] = useState<string[]>([]);
  const [edit, setEdit] = useState<SpecItem | null>(null);
  const [msg, setMsg] = useState('');
  const [inProj, setInProj] = useState(false);
  useEffect(() => {
    const load = () => loadMyItems().then(setMine).catch(() => setMine([]));
    autoLoadEquipment(project).then(load); window.addEventListener(SPECLIB_EVENT, load);
    return () => window.removeEventListener(SPECLIB_EVENT, load);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => [...mine, ...builtIn], [mine, builtIn]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const i of all) c[i.category] = (c[i.category] ?? 0) + 1; return c; }, [all]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const pname = project.meta.name || 'Project';
  const list = all.filter((i) => (cat === 'All' || i.category === cat) && (!inProj || (i.projects ?? []).includes(pname)) && words.every((w) => `${i.brand} ${i.model} ${i.sub} ${i.category} ${Object.entries(i.specs).join(' ')} ${i.notes ?? ''}`.toLowerCase().includes(w)));
  const item = all.find((i) => i.id === sel) ?? null;
  const used = new Set([...(project.customCatalog?.antennas ?? []), ...(project.customCatalog?.feeders ?? []), ...(project.customCatalog?.radios ?? [])].map((x) => x.id));

  const persist = async (next: SpecItem[]) => { setMine(next); await saveMyItems(next); };
  const saveItem = async (it: SpecItem) => {
    const next = mine.some((m) => m.id === it.id) ? mine.map((m) => (m.id === it.id ? it : m)) : [{ ...it, added: Date.now() }, ...mine];
    await persist(next); setEdit(null); setSel(it.id); setMsg('Saved to your library ✓');
  };
  const useInProject = (it: SpecItem) => {
    const eq = toEquipment(it);
    if (!eq) { setMsg('To use this in calculations, fill in the band (low and high MHz) and gain or loss values.'); return; }
    update((d) => {
      const c = d.customCatalog ?? { antennas: [], feeders: [], radios: [] };
      const put = <T extends { id: string }>(l: T[], x?: T) => (x ? [...l.filter((y) => y.id !== x.id), x] : l);
      d.customCatalog = { antennas: put(c.antennas, eq.antenna), feeders: put(c.feeders, eq.feeder), radios: put(c.radios, eq.radio) };
    });
    setMsg(`${it.brand} ${it.model} is now in the Equipment lists for this project ✓`);
  };
  const importCsv = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,text/csv';
    i.onchange = async () => { const f = i.files?.[0]; if (!f) return; const items = specsFromCsv(await f.text()); await persist([...items, ...mine]); setMsg(`Imported ${items.length} item(s) ✓`); };
    i.click();
  };
  const compared = cmp.map((id) => all.find((i) => i.id === id)).filter(Boolean) as SpecItem[];
  const cmpKeys = [...new Set(compared.flatMap((i) => Object.keys(i.specs)))];
  const searchUrl = (it: SpecItem) => `https://www.google.com/search?q=${encodeURIComponent(`${it.brand} ${it.model} datasheet pdf`)}`;

  if (edit) return <Editor item={edit} onSave={saveItem} onCancel={() => setEdit(null)} />;
  return (
    <div className="grid">
      <Card title="Specifications library" className="wide" tip="Search equipment specifications. Built-in entries are typical datasheet values or values set by a standard. Add any product on the market to your own library; it stays on this device and can be imported, exported and used in project calculations." actions={<div className="row wrap">
        <button className="primary" onClick={() => setEdit({ id: newId(), category: cat === 'All' ? 'Antennas' : cat, sub: '', brand: '', model: '', specs: {}, kind: 'My item' })}>+ Add equipment</button>
        <button onClick={importCsv}>Import CSV</button>
        <button onClick={() => downloadText('radioplan-specs.csv', specsToCsv(list), 'text/csv')}>Export CSV</button>
        <button onClick={() => downloadText('radioplan-specs-template.csv', specsToCsv([{ id: 'x', category: 'Antennas', sub: 'Omni', brand: 'Brand', model: 'Model', specs: Object.fromEntries((TEMPLATES['Antennas']).map((k) => [k, ''])), kind: 'My item' }]), 'text/csv')}>CSV template</button>
      </div>}>
        <input className="lib-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Search brand, model, band, connector, any spec…" aria-label="Search specifications" />
        <div className="chips" role="tablist">
          {['All', ...CATEGORIES.filter((c) => counts[c])].map((c) => <button key={c} role="tab" aria-selected={cat === c} className={'chip-btn' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c} <span className="muted">{c === 'All' ? all.length : counts[c]}</span></button>)}
        </div>
        <label className="check small"><input type="checkbox" checked={inProj} onChange={(e) => setInProj(e.target.checked)} /> Only equipment in this project ({mine.filter((m) => (m.projects ?? []).includes(pname)).length})</label>
        <p className="small muted">Equipment you add to a project (antennas, cable, radios, PV modules, fire alarm devices, BDA and materials) is loaded here automatically as <b>From project</b>. Open one and press <b>Edit</b> to correct its specifications.</p>
        {msg && <p className="note" role="status">{msg}</p>}
        <div className="tbl-wrap"><table className="tbl lib">
          <thead><tr><th></th><th>Category</th><th>Manufacturer</th><th>Model</th><th>Key specs</th><th>Source</th></tr></thead>
          <tbody>{list.slice(0, 300).map((i) => (
            <tr key={i.id} className={sel === i.id ? 'sel' : ''} onClick={() => setSel(i.id)} style={{ cursor: 'pointer' }}>
              <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Compare" checked={cmp.includes(i.id)} disabled={!cmp.includes(i.id) && cmp.length >= 4} onChange={(e) => setCmp(e.target.checked ? [...cmp, i.id] : cmp.filter((x) => x !== i.id))} /></td>
              <td>{i.category}</td><td>{i.brand}</td><td><b>{i.model}</b></td>
              <td className="small">{Object.entries(i.specs).slice(0, 3).map(([k, v]) => `${k.replace(/ \(.*\)/, '')}: ${v}`).join(' · ')}</td>
              <td><span className={'pill ' + (i.kind === 'My item' ? 'ok' : '')} style={{ marginLeft: 0 }}>{i.origin ? 'From project' : i.kind === 'My item' ? 'Mine' : i.kind === 'Standard' ? 'Standard' : 'Typical'}</span></td>
            </tr>))}
          </tbody>
        </table></div>
        <p className="small muted">{list.length} of {all.length} items{list.length > 300 ? ' (first 300 shown; refine the search)' : ''}. Tick up to 4 boxes to compare.</p>
      </Card>

      {item && <Card title={`${item.brand} ${item.model}`} actions={<div className="row wrap">
        {item.kind === 'My item' && <button onClick={() => setEdit(item)}>Edit</button>}
        {item.kind !== 'My item' && <button onClick={() => setEdit({ ...item, id: newId(), kind: 'My item', brand: item.brand, model: `${item.model} (my copy)` })}>Copy to my library</button>}
        {['Antennas', 'Coax & feeders', 'Radios & repeaters', 'ERCES / BDA & DAS'].includes(item.category) && item.kind === 'My item' && <button className="primary" onClick={() => useInProject(item)}>{used.has(`lib-${item.id}`) ? 'Update in project' : 'Use in this project'}</button>}
        {item.kind === 'My item' && item.category === 'Fire alarm' && project.alarm.devices.some((d) => d.name.trim() === item.model) && <button className="primary" onClick={() => {
          const sb = num(item.specs['Standby current (mA)']), al = num(item.specs['Alarm current (mA)']);
          update((d) => { d.alarm.devices = d.alarm.devices.map((x) => x.name.trim() === item.model ? { ...x, standbyMa: sb ?? x.standbyMa, alarmMa: al ?? x.alarmMa } : x); });
          setMsg(`Battery calculation now uses ${item.model}: ${sb ?? '—'} mA standby, ${al ?? '—'} mA alarm ✓`);
        }}>Update project devices</button>}
        {item.kind === 'My item' && <button className="danger" onClick={async () => { if (confirm(`Remove ${item.model} from your library?`)) { await persist(mine.filter((m) => m.id !== item.id)); setSel(null); } }}>Delete</button>}
      </div>}>
        <p className="muted small">{item.category}{item.sub ? ` · ${item.sub}` : ''} · {item.origin ? 'Loaded from project' : item.kind}{item.reference ? ` · ${item.reference}` : ''}{item.projects?.length ? ` · Used in: ${item.projects.join(', ')}` : ''}</p>
        <table className="tbl"><tbody>{Object.entries(item.specs).map(([k, v]) => <tr key={k}><th style={{ width: '45%' }}>{k}</th><td>{String(v)}</td></tr>)}</tbody></table>
        {item.notes && <p className="note">{item.notes}</p>}
        <MfrRecs item={item} />
        <Datasheet item={item} searchUrl={searchUrl(item)} />
        {item.kind !== 'Standard' && <p className="small muted">{item.kind === 'Product (typical)' ? 'Typical values for planning. Confirm the current manufacturer datasheet before ordering.' : 'Entered by you.'}</p>}
      </Card>}

      {compared.length >= 2 && <Card title="Compare" className="wide" actions={<button onClick={() => setCmp([])}>Clear</button>}>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Specification</th>{compared.map((c) => <th key={c.id}>{c.brand}<br />{c.model}</th>)}</tr></thead>
          <tbody>{cmpKeys.map((k) => <tr key={k}><th>{k}</th>{compared.map((c) => <td key={c.id}>{c.specs[k] != null ? String(c.specs[k]) : '—'}</td>)}</tr>)}</tbody></table></div>
      </Card>}
    </div>
  );
}
