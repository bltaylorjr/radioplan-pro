import React from 'react';
import { useStore, downloadText } from '../store';
import { Card } from '../components/ui';
import { buildBom, bomToCsv } from '../engine/materials';

export function MaterialsPage() {
  const { project: p, update } = useStore();
  const lines = buildBom(p);
  const cats = [...new Set(lines.map((l) => l.category))];
  return (
    <Card title="Materials list (bill of materials)" tip="Quantities follow the design; edit a quantity to override it."
      actions={<span className="row"><button onClick={() => update((d) => { d.bomOverrides = {}; })}>Reset overrides</button><button className="primary" onClick={() => downloadText(`${p.meta.name || 'project'}-materials.csv`, bomToCsv(lines), 'text/csv')}>⬇ Export CSV</button></span>}>
      <table className="tbl bom"><thead><tr><th>Item</th><th>Brand / model</th><th>Qty</th><th>Unit</th><th>Basis</th></tr></thead>
        {cats.map((c) => (
          <tbody key={c}><tr className="cat"><td colSpan={5}>{c}</td></tr>
            {lines.filter((l) => l.category === c).map((l) => (
              <tr key={l.key}><td>{l.item}</td><td>{l.brandModel}</td>
                <td><input className="qty" type="number" value={l.qty} onChange={(e) => update((d) => { d.bomOverrides[l.key] = parseFloat(e.target.value) || 0; })} /></td>
                <td>{l.unit}</td><td className="muted small">{l.basis}</td></tr>))}
          </tbody>))}
      </table>
      <p className="small muted">Brand/model entries are typical specifications for planning — confirm part numbers, compatibility and current datasheets with your distributor. "or equal" substitutions per project specification.</p>
    </Card>
  );
}
