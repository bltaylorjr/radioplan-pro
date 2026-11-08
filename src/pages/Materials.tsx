import React, { useEffect, useMemo, useState } from 'react';
import { defaultInputs } from '../engine/autodesign';
import { useStore, downloadText, downloadBytes, safeName } from '../store';
import { tablePdf } from '../engine/pdf';
import { Card } from '../components/ui';
import { buildBom, bomToCsv } from '../engine/materials';
import { builtInSpecs, SpecItem } from '../data/speclib';
import { loadMyItems } from '../data/projectEquipment';
import { uid } from '../defaults';
import type { BomExtra } from '../types';

const blank = (): BomExtra => ({ id: uid(), category: 'Added items', item: '', brandModel: '', qty: 1, unit: 'ea', notes: '' });

export function MaterialsPage() {
  const { project: p, update, go } = useStore();
  const lines = buildBom(p);
  const cats = [...new Set(lines.map((l) => l.category))];
  const [add, setAdd] = useState<BomExtra | null>(null);
  const [mine, setMine] = useState<SpecItem[]>([]);
  useEffect(() => { loadMyItems().then(setMine).catch(() => setMine([])); }, []);
  const lib = useMemo(() => [...mine, ...builtInSpecs().filter((i) => i.kind !== 'Standard')], [mine]);
  const setX = (id: string, k: keyof BomExtra, v: string | number) => update((d) => { d.bomExtra = (d.bomExtra ?? []).map((x) => (x.id === id ? { ...x, [k]: v } : x)); });
  const fromLib = (id: string) => { const it = lib.find((i) => i.id === id); if (it) setAdd({ ...blank(), category: it.category, item: it.sub || it.category, brandModel: `${it.brand} ${it.model}`.trim() }); };
  const save = () => { if (!add || !add.item.trim()) return; update((d) => { d.bomExtra = [...(d.bomExtra ?? []), { ...add, item: add.item.trim() }]; }); setAdd(null); };
  const materialsPdf = () => {
    const site = [p.meta.siteAddress, p.meta.city, p.meta.state, p.meta.siteZip].filter(Boolean).join(', ');
    const co = [p.company.name, p.company.phone, p.company.email].filter(Boolean).join('  ·  ');
    return tablePdf({
      title: 'Materials list',
      subtitle: [
        `Project: ${p.meta.name || '—'}${p.meta.number ? `  (No. ${p.meta.number})` : ''}${p.meta.client ? `  ·  Client: ${p.meta.client}` : ''}`,
        ...(site ? [`Site: ${site}`] : []), ...(co ? [`Prepared by: ${co}`] : []),
        `Date: ${new Date().toLocaleDateString()}  ·  ${lines.length} line items`,
      ],
      columns: [{ title: 'Item', width: 190 }, { title: 'Brand / model', width: 170 }, { title: 'Qty', width: 50, align: 'right' }, { title: 'Unit', width: 45 }, { title: 'Basis', width: 265 }],
      rows: cats.flatMap((c) => [{ group: c }, ...lines.filter((l) => l.category === c).map((l) => ({ cells: [l.item, l.brandModel, String(l.qty), l.unit, l.basis] }))]),
      footer: 'Quantities are estimates; verify against the drawings before ordering.',
    });
  };
  return (
    <Card title="Materials list (bill of materials)" tip="Quantities follow the design; edit a quantity to override it. Add your own lines with + Add item."
      actions={<span className="row wrap"><button className="primary" onClick={() => setAdd(blank())}>+ Add item</button><button onClick={() => update((d) => { d.bomOverrides = {}; })}>Reset overrides</button><button onClick={() => downloadText(`${p.meta.name || 'project'}-materials.csv`, bomToCsv(lines), 'text/csv')}>⬇ Export CSV</button><button onClick={() => downloadBytes(`${safeName(p.meta.name || 'project')}-materials.pdf`, materialsPdf(), 'application/pdf')}>⬇ Export PDF</button></span>}>
      {add && <div className="add-mat">
        <div className="form">
          <label className="field wide"><span>Pick from the specifications library (optional)</span><select value="" onChange={(e) => fromLib(e.target.value)} aria-label="Pick from library"><option value="">— or type below —</option>{lib.map((i) => <option key={i.id} value={i.id}>{i.category}: {i.brand} {i.model}</option>)}</select></label>
          <label className="field"><span>Category</span><input value={add.category} onChange={(e) => setAdd({ ...add, category: e.target.value })} /></label>
          <label className="field"><span>Item</span><input value={add.item} autoFocus placeholder="e.g. Cat 6 plenum cable" onChange={(e) => setAdd({ ...add, item: e.target.value })} /></label>
          <label className="field"><span>Brand / model</span><input value={add.brandModel} onChange={(e) => setAdd({ ...add, brandModel: e.target.value })} /></label>
          <label className="field"><span>Quantity</span><input type="number" value={add.qty} onChange={(e) => setAdd({ ...add, qty: parseFloat(e.target.value) || 0 })} /></label>
          <label className="field"><span>Unit</span><select value={add.unit} onChange={(e) => setAdd({ ...add, unit: e.target.value })}>{['ea', 'ft', 'box', 'roll', 'set', 'kit', 'lot', 'hr'].map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="field wide"><span>Notes</span><input value={add.notes} onChange={(e) => setAdd({ ...add, notes: e.target.value })} /></label>
        </div>
        <div className="row wrap" style={{ justifyContent: 'flex-end' }}><button onClick={() => setAdd(null)}>Cancel</button><button className="primary" disabled={!add.item.trim()} onClick={save}>Add to materials list</button></div>
      </div>}
      <p className="small"><label className="check"><input type="checkbox" checked={p.autoDesign?.applied !== false} onChange={(e) => update((d) => { d.autoDesign = { ...defaultInputs(), ...(d.autoDesign ?? {}), applied: e.target.checked }; })} /> Calculate equipment and materials from the project</label>
        {' '}<span className="muted">Lines marked “Auto-design” come from the project type and the building size and devices on <a href="#autodesign" onClick={(e) => { e.preventDefault(); go('autodesign'); }}>Auto-Design</a>; change those and this list updates.</span></p>
      <div className="tbl-wrap"><table className="tbl bom"><thead><tr><th>Item</th><th>Brand / model</th><th>Qty</th><th>Unit</th><th>Basis</th><th /></tr></thead>
        {cats.map((c) => (
          <tbody key={c}><tr className="cat"><td colSpan={6}>{c}</td></tr>
            {lines.filter((l) => l.category === c).map((l) => l.extraId ? (
              <tr key={l.key}><td><input value={l.item} aria-label="Item" onChange={(e) => setX(l.extraId!, 'item', e.target.value)} /></td><td><input value={l.brandModel} aria-label="Brand / model" onChange={(e) => setX(l.extraId!, 'brandModel', e.target.value)} /></td>
                <td><input className="qty" type="number" value={l.qty} onChange={(e) => setX(l.extraId!, 'qty', parseFloat(e.target.value) || 0)} /></td><td>{l.unit}</td><td className="muted small">{l.basis}</td>
                <td><button className="ghost" aria-label="Remove item" onClick={() => update((d) => { d.bomExtra = (d.bomExtra ?? []).filter((x) => x.id !== l.extraId); })}>✕</button></td></tr>
            ) : (
              <tr key={l.key}><td>{l.item}</td><td>{l.brandModel}</td>
                <td><input className="qty" type="number" value={l.qty} onChange={(e) => update((d) => { d.bomOverrides[l.key] = parseFloat(e.target.value) || 0; })} /></td>
                <td>{l.unit}</td><td className="muted small">{l.basis}</td><td /></tr>))}
          </tbody>))}
      </table></div>
      <p className="small muted">Brand/model entries are typical specifications for planning — confirm part numbers, compatibility and current datasheets with your distributor. "or equal" substitutions per project specification.</p>
    </Card>
  );
}
