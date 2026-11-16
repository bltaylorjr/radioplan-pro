import React, { useEffect, useState } from 'react';
import { Card, Tip } from '../components/ui';
import { askDelete } from '../components/askConfirm';
import { useStore } from '../store';
import { Vendor, blankVendor, checkStock, customLabels, isWebUrl, loadVendors, saveVendors } from '../engine/vendors';

type Basic = 'name' | 'contact' | 'phone' | 'email' | 'website' | 'address' | 'city' | 'state' | 'zip' | 'account' | 'terms';
const BASIC: [Basic, string, string?][] = [
  ['name', 'Vendor name'], ['contact', 'Sales rep / contact'], ['phone', 'Phone'], ['email', 'Email'], ['website', 'Website', 'https://'],
  ['address', 'Street address'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP'], ['account', 'Your account number'], ['terms', 'Payment terms', 'e.g. Net 30'],
];

/** Vendors database: saved on this device and shared by every project. */
export function VendorsPage() {
  const { go } = useStore();
  const [list, setList] = useState<Vendor[]>([]);
  const [edit, setEdit] = useState<Vendor | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [testPart, setTestPart] = useState('');
  useEffect(() => { loadVendors().then(setList); }, []);
  const labels = customLabels(list);
  const set = <K extends keyof Vendor>(k: K, v: Vendor[K]) => edit && setEdit({ ...edit, [k]: v });
  const save = async () => {
    if (!edit || !edit.name.trim()) return;
    const v = { ...edit, name: edit.name.trim(), custom: edit.custom.filter((f) => f.label.trim() || f.value.trim()), updated: Date.now() };
    const next = list.some((x) => x.id === v.id) ? list.map((x) => (x.id === v.id ? v : x)) : [...list, v];
    next.sort((a, b) => a.name.localeCompare(b.name));
    await saveVendors(next); setList(next); setEdit(null); setMsg(`✓ Saved ${v.name}`);
  };
  const remove = async (v: Vendor) => {
    if (!(await askDelete(`the vendor “${v.name}”`, 'Materials lines that use this vendor keep their prices but lose the vendor name.'))) return;
    const next = list.filter((x) => x.id !== v.id); await saveVendors(next); setList(next); if (edit?.id === v.id) setEdit(null);
  };
  const addField = (label = '') => edit && setEdit({ ...edit, custom: [...edit.custom, { id: Math.random().toString(36).slice(2, 8), label, value: '' }] });
  const test = async () => {
    if (!edit) return; setMsg('Checking…');
    const r = await checkStock(edit, testPart || 'test', 1); setMsg(`Stock check: ${r.text}`);
  };
  const shown = list.filter((v) => !q.trim() || JSON.stringify(v).toLowerCase().includes(q.trim().toLowerCase()));

  return (<>
    <Card title="Vendors" tip="Your suppliers and distributors. Saved on this device and used by every project. Pick a vendor for each line on the Materials list."
      actions={<span className="row wrap"><button className="primary" onClick={() => setEdit(blankVendor())}>+ Add vendor</button><button onClick={() => go('materials')}>← Materials list</button></span>}>
      {msg && <p className="note small" role="status">{msg}</p>}
      {edit && <div className="add-mat" data-tour="vendor-form">
        <h4 style={{ margin: '0 0 6px' }}>{list.some((x) => x.id === edit.id) ? `Change ${edit.name || 'vendor'}` : 'New vendor'}</h4>
        <div className="form">
          {BASIC.map(([k, label, ph]) => <label key={k} className={'field' + (k === 'name' ? ' req' : '')}><span>{label}{k === 'name' && <span className="req-star"> *</span>}</span>
            <input value={edit[k]} placeholder={ph} autoFocus={k === 'name'} inputMode={k === 'phone' ? 'tel' : k === 'email' ? 'email' : k === 'zip' ? 'numeric' : undefined} onChange={(e) => set(k, e.target.value)} /></label>)}
          <label className="field wide"><span>Notes</span><textarea rows={2} value={edit.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        </div>
        <h4 style={{ margin: '10px 0 4px' }}>More fields <Tip text="Add any detail you need for this vendor, such as a branch, will-call hours, tax-exempt number or a second contact. Fields you use on one vendor are offered on the others." /></h4>
        {edit.custom.map((f) => <div key={f.id} className="row wrap" style={{ marginBottom: 4 }}>
          <input aria-label="Field name" placeholder="Field name" list="vendor-labels" value={f.label} onChange={(e) => set('custom', edit.custom.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))} />
          <input aria-label={f.label || 'Field value'} placeholder="Value" value={f.value} style={{ flex: 1, minWidth: 160 }} onChange={(e) => set('custom', edit.custom.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))} />
          <button className="ghost" aria-label="Remove field" onClick={() => set('custom', edit.custom.filter((x) => x.id !== f.id))}>✕</button></div>)}
        <datalist id="vendor-labels">{labels.map((l) => <option key={l} value={l} />)}</datalist>
        <p className="row wrap"><button onClick={() => addField()} data-tour="vendor-add-field">+ Add field</button>
          {labels.filter((l) => !edit.custom.some((f) => f.label === l)).slice(0, 6).map((l) => <button key={l} className="ghost small-btn" onClick={() => addField(l)}>+ {l}</button>)}</p>

        <details className="small" open={!!(edit.searchUrl || edit.stockUrl)}><summary><b>Online search and stock checks (optional, needs the internet)</b></summary>
          <div className="form">
            <label className="field wide"><span>Search page address <Tip text="Open the vendor's website, search for any part, then copy the address from the browser and paste it here. Replace the part you searched for with {part}. Example: https://www.example.com/search?q={part}" /></span>
              <input value={edit.searchUrl} placeholder="https://www.vendor.com/search?q={part}" onChange={(e) => set('searchUrl', e.target.value)} /></label>
            <label className="field wide"><span>Stock and price address <Tip text="Only if the vendor gives you one (an API or lookup link). Use {part} for the part number, {qty} for the quantity and {key} for your key. Leave blank if you do not have one; you can still search their site." /></span>
              <input value={edit.stockUrl} placeholder="https://api.vendor.com/stock?part={part}&qty={qty}" onChange={(e) => set('stockUrl', e.target.value)} /></label>
            <label className="field"><span>Key from the vendor <Tip text="Some vendors give an API key with the stock address. It stays on this device." /></span><input type="password" autoComplete="off" value={edit.apiKey} onChange={(e) => set('apiKey', e.target.value)} /></label>
            <label className="field"><span>&nbsp;</span><label className="check"><input type="checkbox" checked={edit.autoCheck} disabled={!edit.stockUrl.trim()} onChange={(e) => set('autoCheck', e.target.checked)} /> Check stock by itself when the Materials list opens</label></label>
          </div>
          {edit.searchUrl && !isWebUrl(edit.searchUrl.replace(/\{\w+\}/g, 'x')) && <p className="bad-text small">The search page address should start with https://</p>}
          {edit.stockUrl.trim() && <p className="row wrap"><input aria-label="Test part number" placeholder="Part number to test" value={testPart} onChange={(e) => setTestPart(e.target.value)} /><button onClick={test} disabled={typeof navigator !== 'undefined' && navigator.onLine === false}>Test stock check</button></p>}
        </details>
        <div className="row wrap" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button onClick={() => setEdit(null)}>Cancel</button><button className="primary" disabled={!edit.name.trim()} onClick={save}>Save vendor</button></div>
      </div>}
      {list.length > 3 && <p><input aria-label="Find a vendor" placeholder="🔎 Find a vendor" value={q} onChange={(e) => setQ(e.target.value)} /></p>}
      {!list.length && !edit && <p className="muted">No vendors yet. Tap <b>+ Add vendor</b> and type the name, phone and email of a supplier you buy from. Add more details with <b>+ Add field</b>.</p>}
      {shown.map((v) => <div key={v.id} className="vendor-card">
        <h4>{v.name} {v.autoCheck && <span className="badge badge-real">stock checks on</span>}</h4>
        <div className="small">
          {[v.contact, v.phone && <a key="p" href={`tel:${v.phone}`}>{v.phone}</a>, v.email && <a key="e" href={`mailto:${v.email}`}>{v.email}</a>, v.website && isWebUrl(v.website) && <a key="w" href={v.website} target="_blank" rel="noreferrer">Website ↗</a>].filter(Boolean).map((x, i) => <span key={i}>{i ? ' · ' : ''}{x}</span>)}
          {[v.address, v.city, v.state, v.zip].some(Boolean) && <div>{[v.address, v.city, [v.state, v.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div>}
          {(v.account || v.terms) && <div>{v.account && <>Account {v.account}</>}{v.account && v.terms && ' · '}{v.terms}</div>}
          {v.custom.filter((f) => f.label || f.value).map((f) => <div key={f.id}><b>{f.label}:</b> {f.value}</div>)}
          {v.notes && <div className="muted">{v.notes}</div>}
        </div>
        <p className="row wrap" style={{ margin: '6px 0 0' }}><button className="small-btn" onClick={() => setEdit({ ...v, custom: v.custom.map((f) => ({ ...f })) })}>✎ Change</button><button className="small-btn ghost" onClick={() => remove(v)}>✕ Delete</button></p>
      </div>)}
      <p className="small muted">Vendors are saved on this device only and are not part of a project file. They are included in backups made on Projects & Storage.</p>
    </Card>
  </>);
}
