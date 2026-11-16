import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultInputs } from '../engine/autodesign';
import { useStore, downloadText, downloadBytes, safeName } from '../store';
import { tablePdf } from '../engine/pdf';
import { Card, Tip } from '../components/ui';
import { askDelete } from '../components/askConfirm';
import { buildBom, bomToCsv, BomLine } from '../engine/materials';
import { builtInSpecs, SpecItem } from '../data/speclib';
import { legacyTag } from '../data/lvequipment';
import { loadMyItems } from '../data/projectEquipment';
import { uid } from '../defaults';
import type { BomExtra, Project } from '../types';
import { BomCost, CostedLine, Estimate, LaborLine, PriceBook, defaultEstimate, estimateOf, laborCost, loadPriceBook, money, savePrice, suggestLabor, totals } from '../engine/estimate';
import { SEARCH_SITES, STOCK_STALE_MS, StockResult, VENDORS_EVENT, Vendor, checkStock, loadStock, loadVendors, saveStock, searchUrlFor, searchWords, stockFor } from '../engine/vendors';

const UNITS = ['ea', 'ft', 'box', 'roll', 'set', 'kit', 'lot', 'hr', 'shot', 'pair', 'pkg'];
const blank = (): BomExtra => ({ id: uid(), category: 'Added items', item: '', brandModel: '', qty: 1, unit: 'ea', notes: '' });
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** What the edit / add panel holds. */
interface Draft { mode: 'add' | 'edit'; key?: string; extraId?: string; category: string; item: string; brandModel: string; partNo: string; vendorId: string; qty: number; unit: string; unitCost: number | null; notes: string; original?: BomLine }

function MoneyIn({ value, onChange, placeholder, label }: { value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; label: string }) {
  const [txt, setTxt] = useState(value != null && value > 0 ? String(value) : '');
  useEffect(() => { setTxt(value != null && value > 0 ? String(value) : ''); }, [value]);
  return <span className="money-in">$<input type="number" min={0} step={0.01} inputMode="decimal" aria-label={label} value={txt} placeholder={placeholder}
    onChange={(e) => setTxt(e.target.value)} onBlur={() => { const n = parseFloat(txt); onChange(Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null); }}
    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></span>;
}

export function MaterialsPage() {
  const { project: p, update, go } = useStore();
  const all = buildBom(p, { withRemoved: true });
  const lines = all.filter((l) => !l.removed), removed = all.filter((l) => l.removed);
  const cats = [...new Set(lines.map((l) => l.category))];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mine, setMine] = useState<SpecItem[]>([]);
  const [book, setBook] = useState<PriceBook>({});
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [stock, setStock] = useState<Record<string, StockResult>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [site, setSite] = useState('shopping');
  const [showRemoved, setShowRemoved] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { loadMyItems().then(setMine).catch(() => setMine([])); loadPriceBook().then(setBook); loadStock().then(setStock); }, []);
  useEffect(() => { const f = () => loadVendors().then(setVendors); f(); window.addEventListener(VENDORS_EVENT, f); return () => window.removeEventListener(VENDORS_EVENT, f); }, []);
  const lib = useMemo(() => [...mine, ...builtInSpecs().filter((i) => i.kind !== 'Standard')], [mine]);
  const t = totals(p, lines, book);
  const costed = new Map(t.lines.map((l) => [l.key, l]));
  const est = estimateOf(p);
  const vendorOf = (id?: string) => vendors.find((v) => v.id === id);
  const hasCost = t.materials > 0 || t.labor > 0;

  const setCost = (key: string, patch: Partial<BomCost>) => update((d) => {
    const cur = { ...(d.bomCost?.[key] ?? {}), ...patch };
    for (const k of Object.keys(cur) as (keyof BomCost)[]) if (cur[k] === undefined || cur[k] === null || cur[k] === '') delete cur[k];
    d.bomCost = { ...(d.bomCost ?? {}) };
    if (Object.keys(cur).length) d.bomCost[key] = cur; else delete d.bomCost[key];
  });
  const setEst = (patch: Partial<Estimate>) => update((d) => { d.estimate = { ...defaultEstimate(), ...(d.estimate ?? {}), ...patch }; });
  const setUnitCost = async (l: CostedLine, v: number | null) => {
    setCost(l.key, { unitCost: v ?? undefined });
    if (v) setBook(await savePrice(l.item, l.brandModel, { unitCost: v, vendorId: l.vendorId, partNo: l.partNo }));
  };
  const setX = (id: string, k: keyof BomExtra, v: string | number) => update((d) => { d.bomExtra = (d.bomExtra ?? []).map((x) => (x.id === id ? { ...x, [k]: v } : x)); });

  // ---------------------------------------------------------------- add / edit panel
  const fromLib = (id: string) => { const it = lib.find((i) => i.id === id); if (it && draft) setDraft({ ...draft, category: it.category, item: it.sub || it.category, brandModel: `${it.brand} ${it.model}`.trim() }); };
  const startAdd = () => { const b = blank(); setDraft({ mode: 'add', category: b.category, item: '', brandModel: '', partNo: '', vendorId: '', qty: 1, unit: 'ea', unitCost: null, notes: '' }); };
  const startEdit = (l: BomLine) => {
    const c = costed.get(l.key), x = l.extraId ? (p.bomExtra ?? []).find((e) => e.id === l.extraId) : undefined;
    setDraft({ mode: 'edit', key: l.key, extraId: l.extraId, category: l.category, item: l.item, brandModel: l.brandModel, partNo: c?.partNo ?? '', vendorId: c?.vendorId ?? '', qty: l.qty, unit: l.unit, unitCost: p.bomCost?.[l.key]?.unitCost ?? (c?.unitCost || null), notes: x?.notes ?? '', original: l });
  };
  const saveDraft = async () => {
    if (!draft || !draft.item.trim()) return;
    const dr = { ...draft, item: draft.item.trim() };
    const cost: Partial<BomCost> = { unitCost: dr.unitCost ?? undefined, vendorId: dr.vendorId || undefined, partNo: dr.partNo.trim() || undefined };
    if (dr.mode === 'add') {
      const x: BomExtra = { id: uid(), category: dr.category.trim() || 'Added items', item: dr.item, brandModel: dr.brandModel, qty: dr.qty, unit: dr.unit, notes: dr.notes };
      update((d) => { d.bomExtra = [...(d.bomExtra ?? []), x]; });
      setCost(`x-${x.id}`, cost);
    } else if (dr.extraId) {
      update((d) => { d.bomExtra = (d.bomExtra ?? []).map((x) => (x.id === dr.extraId ? { ...x, category: dr.category.trim() || 'Added items', item: dr.item, brandModel: dr.brandModel, qty: dr.qty, unit: dr.unit, notes: dr.notes } : x)); });
      setCost(dr.key!, cost);
    } else if (dr.key && dr.original) {
      const o = dr.original, base = p.bomCost?.[dr.key] ?? {};
      // Keep only real changes, so the line still follows the design for anything not changed.
      const itemCh = dr.item !== o.item || base.item != null, bmCh = dr.brandModel !== o.brandModel || base.brandModel != null, unitCh = dr.unit !== o.unit || base.unit != null;
      setCost(dr.key, { ...cost, item: itemCh ? dr.item : undefined, brandModel: bmCh ? dr.brandModel : undefined, unit: unitCh ? dr.unit : undefined });
      if (dr.qty !== o.qty) update((d) => { d.bomOverrides[dr.key!] = dr.qty; });
    }
    if (dr.unitCost) setBook(await savePrice(dr.item, dr.brandModel, { unitCost: dr.unitCost, vendorId: dr.vendorId || undefined, partNo: dr.partNo.trim() || undefined }));
    setDraft(null);
  };
  const putBackOriginal = (key: string) => { setCost(key, { item: undefined, brandModel: undefined, unit: undefined }); update((d) => { delete d.bomOverrides[key]; }); setDraft(null); };

  // ---------------------------------------------------------------- remove
  const removeLines = async (ls: BomLine[]) => {
    const extras = ls.filter((l) => l.extraId), calc = ls.filter((l) => !l.extraId);
    if (extras.length && !(await askDelete(extras.length === 1 ? `“${extras[0].item}”` : `${extras.length} items you added`, calc.length ? `${calc.length} calculated line(s) will also be taken off the list; you can put those back under “Removed lines”.` : undefined))) return;
    update((d) => {
      const ids = new Set(extras.map((l) => l.extraId));
      d.bomExtra = (d.bomExtra ?? []).filter((x) => !ids.has(x.id));
      d.bomCost = { ...(d.bomCost ?? {}) };
      for (const l of extras) delete d.bomCost[l.key];
      for (const l of calc) d.bomCost[l.key] = { ...(d.bomCost[l.key] ?? {}), removed: true };
    });
    setSel(new Set());
  };
  const putBack = (key: string) => setCost(key, { removed: undefined });

  // ---------------------------------------------------------------- selection and search
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allSel = lines.length > 0 && lines.every((l) => sel.has(l.key));
  const chosen = t.lines.filter((l) => sel.has(l.key));
  const siteObj = SEARCH_SITES.find((s) => s.id === site);
  const vendorSite = vendorOf(site);
  const linkFor = (l: CostedLine) => (vendorSite ? searchUrlFor(vendorSite, l) : siteObj ? searchUrlFor(siteObj, l) : null);
  const openAll = () => {
    const urls = chosen.map(linkFor).filter((u): u is string => !!u).slice(0, 10);
    urls.forEach((u, i) => setTimeout(() => window.open(u, '_blank', 'noopener'), i * 250));
    setMsg(chosen.length > 10 ? 'Opened the first 10. Tap the links below for the rest.' : `Opened ${urls.length} search page(s) in your browser.`);
  };

  // ---------------------------------------------------------------- stock checks
  const runCheck = useCallback(async (l: CostedLine, v: Vendor) => {
    const part = searchWords(l);
    setChecking((c) => ({ ...c, [l.key]: true }));
    const res = await checkStock(v, part, l.qty);
    setStock(await saveStock(v.id, part, res));
    setChecking((c) => ({ ...c, [l.key]: false }));
    return res;
  }, []);
  const checkable = (l: CostedLine) => { const v = vendorOf(l.vendorId); return v && v.stockUrl.trim() ? v : undefined; };
  // Automatic checks: vendors with "check by itself" on, once every 12 hours per part, when online.
  const autoKeys = t.lines.filter((l) => checkable(l)?.autoCheck).map((l) => `${l.vendorId}|${searchWords(l)}`).join(',');
  useEffect(() => {
    if (!autoKeys || !online()) return;
    let stop = false;
    (async () => {
      for (const l of t.lines) {
        if (stop) return;
        const v = checkable(l); if (!v?.autoCheck) continue;
        const prev = stockFor(stock, v.id, searchWords(l));
        if (prev && Date.now() - prev.at < STOCK_STALE_MS) continue;
        await runCheck(l, v);
      }
    })();
    return () => { stop = true; };
  }, [autoKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const checkSelected = async () => {
    const todo = chosen.filter((l) => checkable(l));
    if (!todo.length) { setMsg('None of the selected lines has a vendor with a stock address. Add one on the Vendors page.'); return; }
    for (const l of todo) await runCheck(l, checkable(l)!);
    setMsg(`Checked ${todo.length} line(s).`);
  };

  // ---------------------------------------------------------------- labor
  const setLabor = (labor: LaborLine[]) => setEst({ labor });
  const rate = est.labor[0]?.rate || p.proposal?.laborRate || 85;
  const addLabor = () => setLabor([...est.labor, { id: uid(), task: '', people: 1, hours: 8, rate }]);
  const editLabor = (id: string, patch: Partial<LaborLine>) => setLabor(est.labor.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const suggest = () => setLabor([...est.labor, ...suggestLabor(lines, rate)]);

  // ---------------------------------------------------------------- exports
  const vName = (id?: string) => vendorOf(id)?.name ?? '';
  const csvLines = t.lines.map((l) => ({ ...l, vendor: vName(l.vendorId) }));
  const materialsPdf = () => {
    const sitea = [p.meta.siteAddress, p.meta.city, p.meta.state, p.meta.siteZip].filter(Boolean).join(', ');
    const co = [p.company.name, p.company.phone, p.company.email].filter(Boolean).join('  ·  ');
    const priced = t.materials > 0;
    const columns = priced
      ? [{ title: 'Item', width: 170 }, { title: 'Brand / model', width: 150 }, { title: 'Part no. / vendor', width: 110 }, { title: 'Qty', width: 45, align: 'right' as const }, { title: 'Unit', width: 35 }, { title: 'Unit cost', width: 60, align: 'right' as const }, { title: 'Total', width: 70, align: 'right' as const }]
      : [{ title: 'Item', width: 190 }, { title: 'Brand / model', width: 170 }, { title: 'Qty', width: 50, align: 'right' as const }, { title: 'Unit', width: 45 }, { title: 'Basis', width: 265 }];
    const row = (l: CostedLine) => (priced ? [l.item, l.brandModel, [l.partNo, vName(l.vendorId)].filter(Boolean).join(' · '), String(l.qty), l.unit, l.unitCost ? money(l.unitCost) : '', l.ext ? money(l.ext) : ''] : [l.item, l.brandModel, String(l.qty), l.unit, l.basis]);
    const sum = (label: string, v: string) => ({ cells: priced ? [label, '', '', '', '', '', v] : [label, '', '', '', v] });
    const summary = hasCost ? [{ group: 'Estimate' }, sum('Materials', money(t.materials)), ...(t.tax ? [sum(`Sales tax ${est.taxPct}%`, money(t.tax))] : []), ...(t.shipping ? [sum('Shipping / freight', money(t.shipping))] : []),
      ...est.labor.map((l) => sum(`Labor: ${l.task || 'Labor'} (${l.people} × ${l.hours} h × ${money(l.rate)})`, money(laborCost(l)))),
      ...(t.contingency ? [sum(`Contingency ${est.contingencyPct}%`, money(t.contingency))] : []), ...(t.markup ? [sum(`Overhead and profit ${est.markupPct}%`, money(t.markup))] : []),
      sum('Estimated total', money(t.total)), ...(est.budgetTotal ? [sum('Project budget', money(est.budgetTotal)), sum(t.over.total ? 'OVER BUDGET BY' : 'Under budget by', money(t.over.total || est.budgetTotal - t.total))] : [])] : [];
    return tablePdf({
      title: hasCost ? 'Materials list and estimate' : 'Materials list',
      subtitle: [
        `Project: ${p.meta.name || '—'}${p.meta.number ? `  (No. ${p.meta.number})` : ''}${p.meta.client ? `  ·  Client: ${p.meta.client}` : ''}`,
        ...(sitea ? [`Site: ${sitea}`] : []), ...(co ? [`Prepared by: ${co}`] : []),
        `Date: ${new Date().toLocaleDateString()}  ·  ${lines.length} line items`,
      ],
      columns,
      rows: [...cats.flatMap((c) => [{ group: c }, ...t.lines.filter((l) => l.category === c).map((l) => ({ cells: row(l) }))]), ...summary],
      footer: 'Quantities and prices are estimates; verify against the drawings and current vendor quotes before ordering.',
    });
  };

  const stockCell = (l: CostedLine) => {
    const v = checkable(l);
    if (!v) return <span className="muted small">—</span>;
    const r = stockFor(stock, v.id, searchWords(l));
    return <span className="small">
      {checking[l.key] ? 'Checking…' : r ? <span className={r.ok ? (r.qty === 0 ? 'bad-text' : 'ok-text') : 'muted'} title={`Checked ${new Date(r.at).toLocaleString()}`}>{r.text}</span> : <span className="muted">Not checked</span>}
      {' '}<button className="ghost small-btn" disabled={!!checking[l.key] || !online()} onClick={() => runCheck(l, v)} title="Ask the vendor for stock and price">↻</button>
      {r?.price && Math.abs(r.price - l.unitCost) > 0.004 && <button className="ghost small-btn" onClick={() => setUnitCost(l, r.price!)}>Use ${r.price.toFixed(2)}</button>}
    </span>;
  };
  const anyStock = vendors.some((v) => v.stockUrl.trim());
  const cols = anyStock ? 10 : 9;

  return (<>
    <Card title="Materials list (bill of materials)" tip="Quantities follow the design. Tap ✎ to change an item, its brand, part number, unit, vendor or price. Tick lines to search for them online or take them off the list."
      actions={<span className="row wrap"><button className="primary" onClick={startAdd}>+ Add item</button><button onClick={() => update((d) => { d.bomOverrides = {}; })}>Reset quantities</button><button onClick={() => downloadText(`${p.meta.name || 'project'}-materials.csv`, bomToCsv(csvLines), 'text/csv')}>⬇ Export CSV</button><button onClick={() => downloadBytes(`${safeName(p.meta.name || 'project')}-materials.pdf`, materialsPdf(), 'application/pdf')}>⬇ Export PDF</button></span>}>
      {draft && <div className="add-mat" data-tour="mat-edit">
        <h4 style={{ margin: '0 0 6px' }}>{draft.mode === 'add' ? 'Add an item' : `Change “${draft.original?.item ?? draft.item}”`}</h4>
        <div className="form">
          {draft.mode === 'add' && <label className="field wide"><span>Pick from the specifications library (optional)</span><select value="" onChange={(e) => fromLib(e.target.value)} aria-label="Pick from library"><option value="">— or type below —</option>{lib.map((i) => <option key={i.id} value={i.id}>{i.category}: {i.brand} {i.model}{legacyTag(i)}</option>)}</select></label>}
          {(draft.mode === 'add' || draft.extraId) && <label className="field"><span>Category</span><input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label>}
          <label className="field"><span>Item</span><input value={draft.item} autoFocus placeholder="e.g. Cat 6 plenum cable" onChange={(e) => setDraft({ ...draft, item: e.target.value })} /></label>
          <label className="field"><span>Brand / model</span><input value={draft.brandModel} onChange={(e) => setDraft({ ...draft, brandModel: e.target.value })} /></label>
          <label className="field"><span>Part number <Tip text="The vendor's or maker's part number. Online searches and stock checks use it when it is filled in." /></span><input value={draft.partNo} onChange={(e) => setDraft({ ...draft, partNo: e.target.value })} /></label>
          <label className="field"><span>Quantity</span><input type="number" min={0} value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: parseFloat(e.target.value) || 0 })} /></label>
          <label className="field"><span>Unit</span><select aria-label="Unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>{[...new Set([...UNITS, draft.unit])].map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="field"><span>Unit cost ($) <Tip text="What you pay for one unit (one each, one foot, one box). It is also saved to your price list on this device, so the same item is priced on your next project." /></span><input type="number" min={0} step={0.01} value={draft.unitCost ?? ''} onChange={(e) => setDraft({ ...draft, unitCost: parseFloat(e.target.value) || null })} /></label>
          <label className="field"><span>Vendor</span><select value={draft.vendorId} onChange={(e) => setDraft({ ...draft, vendorId: e.target.value })}><option value="">— none —</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name || '(no name)'}</option>)}</select></label>
          {(draft.mode === 'add' || draft.extraId) && <label className="field wide"><span>Notes</span><input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>}
        </div>
        {draft.unitCost ? <p className="small">Line total: <b>{money(draft.unitCost * draft.qty)}</b></p> : null}
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
          {draft.mode === 'edit' && !draft.extraId && (draft.original?.edited || draft.original?.basis.endsWith('(overridden)')) && <button onClick={() => putBackOriginal(draft.key!)}>Put back the design values</button>}
          <button onClick={() => setDraft(null)}>Cancel</button><button className="primary" disabled={!draft.item.trim()} onClick={saveDraft}>{draft.mode === 'add' ? 'Add to materials list' : 'Save changes'}</button></div>
      </div>}
      <p className="small"><label className="check"><input type="checkbox" checked={p.autoDesign?.applied !== false} onChange={(e) => update((d) => { d.autoDesign = { ...defaultInputs(), ...(d.autoDesign ?? {}), applied: e.target.checked }; })} /> Calculate equipment and materials from the project</label>
        {' '}<span className="muted">Lines marked “Auto-design” come from the project type and the building size and devices on <a href="#autodesign" onClick={(e) => { e.preventDefault(); go('autodesign'); }}>Auto-Design</a>; change those and this list updates.</span></p>

      <div className="row wrap mat-tools" data-tour="mat-select">
        <label className="check"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(lines.map((l) => l.key)))} /> Select all</label>
        <span className="small muted">{sel.size ? `${sel.size} selected` : 'Tick lines to work on them'}</span>
        <button disabled={!sel.size} onClick={() => setShowSearch(true)} data-tour="mat-search">🔎 Search online</button>
        {anyStock && <button disabled={!sel.size || !online()} onClick={checkSelected}>📦 Check stock</button>}
        <button disabled={!sel.size} onClick={() => removeLines(lines.filter((l) => sel.has(l.key)))}>✕ Remove selected</button>
        <button onClick={() => go('vendors')}>🏪 Vendors ({vendors.length})</button>
        <Tip topic="materials" />
      </div>
      {msg && <p className="note small" role="status">{msg} <button className="ghost small-btn" onClick={() => setMsg('')}>✕</button></p>}

      {showSearch && <div className="add-mat" data-tour="mat-search-panel">
        <div className="row wrap"><b>Search online</b>
          <label className="small">Search at <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Search site">
            {SEARCH_SITES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {vendors.filter((v) => v.searchUrl.trim()).map((v) => <option key={v.id} value={v.id}>{v.name} (your vendor)</option>)}
          </select></label>
          <button className="primary" disabled={!chosen.length || !online()} onClick={openAll}>Open all ({Math.min(10, chosen.length)})</button>
          <button className="ghost" onClick={() => setShowSearch(false)}>Close</button>
        </div>
        {!online() && <p className="small bad-text">No internet connection. Searching needs the internet; everything else on this page works offline.</p>}
        {!chosen.length ? <p className="small muted">Tick the lines to search for, or tick Select all.</p>
          : <ul className="small search-list">{chosen.map((l) => { const u = linkFor(l); return <li key={l.key}>{u ? <a href={u} target="_blank" rel="noreferrer">{searchWords(l)} ↗</a> : <span className="muted">{searchWords(l)} (this vendor has no search address)</span>}</li>; })}</ul>}
        <p className="small muted">Searches use the part number when there is one, otherwise the brand, model and item. Check prices and stock on the vendor's page, then type the price into the line.</p>
      </div>}

      <div className="tbl-wrap"><table className="tbl bom"><thead><tr><th aria-label="Select" /><th>Item</th><th>Brand / model</th><th>Vendor</th><th>Qty</th><th>Unit</th><th>Unit cost</th><th>Total</th>{anyStock && <th>Stock</th>}<th /></tr></thead>
        {cats.map((c) => {
          const ct = t.byCategory.find((b) => b.category === c);
          return <tbody key={c}><tr className="cat"><td colSpan={cols - 3}>{c}</td><td colSpan={3} className="amt">{ct && ct.total > 0 ? money(ct.total) : ''}</td></tr>
            {lines.filter((l) => l.category === c).map((l) => { const cl = costed.get(l.key)!; return (
              <tr key={l.key} className={sel.has(l.key) ? 'sel' : ''}>
                <td><input type="checkbox" aria-label={`Select ${l.item}`} checked={sel.has(l.key)} onChange={() => toggle(l.key)} /></td>
                <td>{l.item}<div className="muted small">{l.basis}{cl.partNo ? ` · Part ${cl.partNo}` : ''}</div></td>
                <td>{l.brandModel}</td>
                <td><select className="vendor-sel" aria-label="Vendor" value={cl.vendorId ?? ''} onChange={(e) => setCost(l.key, { vendorId: e.target.value || undefined })}><option value="">—</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name || '(no name)'}</option>)}</select></td>
                <td><input className="qty" type="number" min={0} aria-label="Quantity" value={l.qty} onChange={(e) => { const v = parseFloat(e.target.value) || 0; if (l.extraId) setX(l.extraId, 'qty', v); else update((d) => { d.bomOverrides[l.key] = v; }); }} /></td>
                <td>{l.unit}</td>
                <td><MoneyIn label={`Unit cost of ${l.item}`} value={p.bomCost?.[l.key]?.unitCost} placeholder={cl.source === 'pricelist' ? cl.unitCost.toFixed(2) : ''} onChange={(v) => setUnitCost(cl, v)} />
                  {cl.source === 'pricelist' && <div className="muted small" title="From your price list on this device">price list</div>}</td>
                <td className="amt">{cl.ext ? money(cl.ext) : <span className="muted">—</span>}</td>
                {anyStock && <td>{stockCell(cl)}</td>}
                <td className="nowrap"><button className="ghost" aria-label="Change item" title="Change" onClick={() => startEdit(l)}>✎</button><button className="ghost" aria-label="Remove item" title="Remove" onClick={() => removeLines([l])}>✕</button></td>
              </tr>); })}
          </tbody>;
        })}
        <tfoot><tr className="cat"><td colSpan={cols - 3}>Materials subtotal{t.unpriced ? <span className="muted small"> ({t.unpriced} line{t.unpriced === 1 ? '' : 's'} without a price)</span> : null}</td><td colSpan={3} className="amt"><b>{money(t.materials)}</b></td></tr></tfoot>
      </table></div>
      {removed.length > 0 && <p className="small"><button className="ghost small-btn" onClick={() => setShowRemoved(!showRemoved)}>{showRemoved ? '▾' : '▸'} Removed lines ({removed.length})</button></p>}
      {showRemoved && removed.length > 0 && <ul className="small">{removed.map((l) => <li key={l.key}>{l.item} — {l.brandModel} ({l.qty} {l.unit}) <button className="small-btn" onClick={() => putBack(l.key)}>Put back</button></li>)}</ul>}
      <p className="small muted">Brand/model entries are typical specifications for planning — confirm part numbers, compatibility and current datasheets with your distributor. "or equal" substitutions per project specification.</p>
    </Card>

    <LaborCard p={p} est={est} rate={rate} onAdd={addLabor} onSuggest={suggest} onEdit={editLabor} onRemove={(id) => setLabor(est.labor.filter((l) => l.id !== id))} />
    <EstimateCard est={est} t={t} setEst={setEst} />
  </>);
}

function LaborCard({ est, rate, onAdd, onSuggest, onEdit, onRemove }: { p: Project; est: Estimate; rate: number; onAdd: () => void; onSuggest: () => void; onEdit: (id: string, patch: Partial<LaborLine>) => void; onRemove: (id: string) => void }) {
  const hours = est.labor.reduce((a, l) => a + l.people * l.hours, 0), total = est.labor.reduce((a, l) => a + laborCost(l), 0);
  return <Card title="Labor costs" tip="One line per kind of work: how many people, hours each, and the hourly rate. Suggest labor fills in a starting estimate from the materials; change any number."
    actions={<span className="row wrap"><button className="primary" onClick={onAdd}>+ Add labor</button><button onClick={onSuggest} data-tour="mat-suggest">Suggest labor from the materials</button></span>}>
    {!est.labor.length ? <p className="muted small">No labor yet. Tap <b>Suggest labor from the materials</b> for a starting estimate at {money(rate)} an hour, or <b>+ Add labor</b> to type your own.</p>
      : <div className="tbl-wrap"><table className="tbl labor"><thead><tr><th>Work</th><th>People <Tip text="How many technicians do this work." /></th><th>Hours each</th><th>Rate ($/h) <Tip text="What one person's hour costs you (wage plus burden), or your billing rate if you are pricing a bid." /></th><th>Total</th><th>Notes</th><th /></tr></thead>
        <tbody>{est.labor.map((l) => <tr key={l.id}>
          <td><input aria-label="Work" value={l.task} placeholder="e.g. Rough-in" onChange={(e) => onEdit(l.id, { task: e.target.value })} /></td>
          <td><input className="qty" type="number" min={0} aria-label="People" value={l.people} onChange={(e) => onEdit(l.id, { people: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
          <td><input className="qty" type="number" min={0} aria-label="Hours each" value={l.hours} onChange={(e) => onEdit(l.id, { hours: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
          <td><input className="qty" type="number" min={0} step={0.5} aria-label="Rate" value={l.rate} onChange={(e) => onEdit(l.id, { rate: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
          <td className="amt">{money(laborCost(l))}</td>
          <td><input aria-label="Notes" value={l.notes ?? ''} onChange={(e) => onEdit(l.id, { notes: e.target.value })} /></td>
          <td><button className="ghost" aria-label="Remove labor line" onClick={() => onRemove(l.id)}>✕</button></td></tr>)}</tbody>
        <tfoot><tr className="cat"><td colSpan={4}>Labor subtotal ({Math.round(hours * 10) / 10} hours)</td><td className="amt"><b>{money(total)}</b></td><td colSpan={2} /></tr></tfoot></table></div>}
  </Card>;
}

function EstimateCard({ est, t, setEst }: { est: Estimate; t: ReturnType<typeof totals>; setEst: (p: Partial<Estimate>) => void }) {
  const num = (k: keyof Estimate, label: string, tip: string, unit: '%' | '$') => <label className="field"><span>{label} <Tip text={tip} /></span>
    <input type="number" min={0} step={unit === '%' ? 0.25 : 1} value={(est[k] as number) || ''} placeholder="0" onChange={(e) => setEst({ [k]: Math.max(0, parseFloat(e.target.value) || 0) } as Partial<Estimate>)} /></label>;
  const row = (label: string, v: number, budget?: number, over?: number, strong?: boolean) => <tr className={over ? 'over' : ''}>
    <th>{label}</th><td className={'amt' + (over ? ' bad-text' : '')}>{strong ? <b>{money(v)}</b> : money(v)}</td>
    <td className="amt">{budget ? money(budget) : <span className="muted">—</span>}</td>
    <td className={'amt' + (over ? ' bad-text' : budget ? ' ok-text' : '')}>{!budget ? '' : over ? <b>{money(over)} over</b> : `${money(budget - v)} left`}</td></tr>;
  const anyOver = t.over.materials || t.over.labor || t.over.total;
  return <Card title="Estimate and budget" tip="Totals for materials and labor, with tax, shipping, contingency and markup. Type a budget to compare; anything over budget shows in red.">
    <div className="form">
      {num('taxPct', 'Sales tax on materials (%)', 'Your local sales tax rate on materials you buy. Asheville (Buncombe County) is 7%. Leave 0 if you are tax exempt.', '%')}
      {num('shipping', 'Shipping / freight ($)', 'Delivery charges from your vendors.', '$')}
      {num('contingencyPct', 'Contingency (%)', 'Extra set aside for surprises, such as hidden conditions or price changes. 5 to 10% is common.', '%')}
      {num('markupPct', 'Overhead and profit (%)', 'Added to cost to get your selling price. Leave 0 to see cost only.', '%')}
      {num('budgetMaterials', 'Materials budget ($)', 'The most the materials may cost (with tax and shipping). Leave 0 for none.', '$')}
      {num('budgetLabor', 'Labor budget ($)', 'The most the labor may cost. Leave 0 for none.', '$')}
      {num('budgetTotal', 'Project budget ($)', 'The total budget for the job. The estimated total is compared with it.', '$')}
    </div>
    <div className="tbl-wrap"><table className="tbl estimate" data-tour="mat-estimate"><thead><tr><th /><th className="amt">Estimate</th><th className="amt">Budget</th><th className="amt">Difference</th></tr></thead><tbody>
      {row('Materials', t.materials)}
      {t.tax > 0 && row(`Sales tax ${est.taxPct}%`, t.tax)}
      {t.shipping > 0 && row('Shipping / freight', t.shipping)}
      {row('Materials total', t.materialsTotal, est.budgetMaterials, t.over.materials, true)}
      {row(`Labor (${t.laborHours} h)`, t.labor, est.budgetLabor, t.over.labor, true)}
      {t.contingency > 0 && row(`Contingency ${est.contingencyPct}%`, t.contingency)}
      {t.markup > 0 && row(`Overhead and profit ${est.markupPct}%`, t.markup)}
      {row('Estimated total', t.total, est.budgetTotal, t.over.total, true)}
    </tbody></table></div>
    {anyOver ? <p className="bad-text"><b>Over budget.</b> Lower quantities or prices, change vendors, or raise the budget.</p> : est.budgetTotal ? <p className="ok-text small">Within budget.</p> : null}
    {t.unpriced > 0 && <p className="small muted">{t.unpriced} materials line{t.unpriced === 1 ? ' has' : 's have'} no price yet, so the materials total is low. Type a unit cost, or use 🔎 Search online to look prices up.</p>}
  </Card>;
}
