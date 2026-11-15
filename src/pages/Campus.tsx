import React, { useMemo, useState } from 'react';
import { useStore, downloadText } from '../store';
import { Card, Num, Stat } from '../components/ui';
import { LayeredModel } from '../components/LayeredModel';
import { askDelete } from '../components/askConfirm';
import { uid } from '../defaults';
import { BLDG, BldgType, defaultInputs, AutoInputs } from '../engine/autodesign';
import { buildCampus, campusBom, campusOf, Campus, CampusBuilding, LINK_KIND, LinkKind, toCsv, BUILDING_TYPES } from '../engine/campus';
import { materialsFor, MAT, PRESETS } from '../engine/bldgmaterials';
import { modelDxf } from '../engine/models';

export function CampusPage() {
  const { project: p, update, go } = useStore();
  const c = campusOf(p);
  const setC = (fn: (c: Campus) => void) => update((d) => { const n = campusOf(d); fn(n); d.campus = n; });
  const { scene, buildings, links } = useMemo(() => buildCampus(p), [p]);
  const bom = useMemo(() => campusBom(p, buildings, links), [p, buildings, links]);
  const [msg, setMsg] = useState('');
  const main = { ...defaultInputs(), ...(p.autoDesign ?? {}) };

  const addBuilding = () => setC((n) => {
    const right = Math.max(main.lengthFt, ...n.buildings.map((b) => b.x + (b.inputs.lengthFt ?? 200))) + 120;
    n.buildings.push({ id: uid(), name: `Building ${String.fromCharCode(66 + n.buildings.length)}`, x: right, y: 0, rot: 0, inputs: { bldg: main.bldg, floors: 1, lengthFt: 120, widthFt: 80, floorHeightFt: 14, ceilingFt: 10, exteriorDoors: 2, accessDoors: 2, rooms: 0, parkingSpaces: 0, callBoxes: 0 } });
    if (!n.links.some((l) => l.to === n.buildings[n.buildings.length - 1].id)) n.links.push({ id: uid(), from: 'main', to: n.buildings[n.buildings.length - 1].id, kind: 'fiber-ug', strands: 12 });
  });
  const setB = (i: number, fn: (b: CampusBuilding) => void) => setC((n) => fn(n.buildings[i]));
  const setIn = (i: number, k: keyof AutoInputs, v: number | string) => setB(i, (b) => { b.inputs = { ...b.inputs, [k]: v }; });
  const move = (id: string, dx: number, dy: number) => setC((n) => { const b = id === 'main' ? n.main : n.buildings.find((x) => x.id === id); if (b) { b.x = Math.round(b.x + dx); b.y = Math.round(b.y + dy); } });
  const names = buildings.map((b) => [b.id, `${b.code}. ${b.name}`] as [string, string]);
  const schedule = links.map((r, i) => ({ id: `L-${String(i + 1).padStart(2, '0')}`, r }));
  const csvSchedule = () => downloadText('cable-schedule.csv', toCsv([['Link', 'From', 'To', 'Type', 'Strands / pairs', 'Route ft', 'Cable ft', 'Conduit ft', 'Handholes', 'Poles', 'Notes'],
    ...schedule.map(({ id, r }) => [id, r.from.name, r.to.name, LINK_KIND[r.link.kind].label, r.link.kind === 'wireless' ? '' : r.link.strands, Math.round(r.routeFt), Math.round(r.cableFt), Math.round(r.conduitFt), r.handholes, r.poles, r.wireless ? `${r.wireless.ok ? 'Clear' : 'Check'}: RSL ${r.wireless.rslDbm.toFixed(0)} dBm, margin ${r.wireless.marginDb.toFixed(0)} dB` : r.link.notes ?? ''])]), 'text/csv');
  const csvBom = () => downloadText('site-materials.csv', toCsv([['System', 'Item', 'Spec', 'Qty', 'Unit', 'Buildings / links', 'Basis'], ...bom.map((m) => [m.system, m.item, m.spec, m.qty, m.unit, m.where, m.basis])]), 'text/csv');
  const addToMaterials = () => {
    const extra = campusBom(p, buildings, links, true);
    update((d) => { d.bomExtra = [...(d.bomExtra ?? []).filter((x) => !x.id.startsWith('campus-')), ...extra.map((m, i) => ({ id: `campus-${i}-${m.key}`, category: m.system === 'Between buildings' ? 'Between buildings' : `Other buildings: ${m.system}`, item: m.item, brandModel: m.spec, qty: m.qty, unit: m.unit, notes: `Site package (${m.where})` }))]; });
    setMsg('Added to the Materials list ✓ (the main building is already there from Auto-Design; this adds the other buildings and the links between them). Press again after changes to refresh.');
  };

  return (
    <div className="grid">
      <Card title="1. Buildings on the site" className="wide" tip="Add every building on the job. Each one has its own type, size, floors and materials. Drag a building on the site plan below to move it." actions={<button className="primary" onClick={addBuilding}>+ Add a building</button>}>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Building</th><th>Type</th><th>Floors</th><th>Length × width (ft)</th><th>East / south of A (ft)</th><th>Turn (°)</th><th>Outside walls</th><th>Floors (construction)</th><th /></tr></thead>
          <tbody>
            <tr><td><input aria-label="Main building name" value={c.main.name} onChange={(e) => setC((n) => { n.main.name = e.target.value; })} /> <span className="small muted">A (main)</span></td><td>{BLDG[main.bldg]?.label}</td><td>{main.floors}</td><td>{main.lengthFt} × {main.widthFt}</td>
              <td><span className="row"><Num value={c.main.x} onChange={(v) => setC((n) => { n.main.x = v ?? 0; })} /><Num value={c.main.y} onChange={(v) => setC((n) => { n.main.y = v ?? 0; })} /></span></td>
              <td><Num value={c.main.rot} onChange={(v) => setC((n) => { n.main.rot = v ?? 0; })} /></td><td colSpan={2} className="small"><a href="#models" onClick={(e) => { e.preventDefault(); go('models'); }}>Size and materials on 2D & 3D Models →</a></td><td /></tr>
            {c.buildings.map((b, i) => { const x = { ...defaultInputs(), ...b.inputs }; const sp = { ...PRESETS[x.bldg], ...(b.materials ?? {}) }; return (
              <tr key={b.id}>
                <td><input aria-label={`Building ${i + 2} name`} value={b.name} onChange={(e) => setB(i, (q) => { q.name = e.target.value; })} /> <span className="small muted">{String.fromCharCode(66 + i)}</span></td>
                <td><select value={x.bldg} onChange={(e) => setB(i, (q) => { q.inputs = { ...q.inputs, bldg: e.target.value as BldgType }; q.materials = undefined; })} data-no-choose>{BUILDING_TYPES.map((t) => <option key={t} value={t}>{BLDG[t].label}</option>)}</select></td>
                <td><Num min={1} max={60} value={x.floors} onChange={(v) => setIn(i, 'floors', Math.max(1, Math.round(v ?? 1)))} /></td>
                <td><span className="row"><Num min={20} value={x.lengthFt} onChange={(v) => setIn(i, 'lengthFt', Math.max(20, v ?? 20))} />×<Num min={20} value={x.widthFt} onChange={(v) => setIn(i, 'widthFt', Math.max(20, v ?? 20))} /></span></td>
                <td><span className="row"><Num value={b.x} onChange={(v) => setB(i, (q) => { q.x = v ?? 0; })} /><Num value={b.y} onChange={(v) => setB(i, (q) => { q.y = v ?? 0; })} /></span></td>
                <td><Num value={b.rot} onChange={(v) => setB(i, (q) => { q.rot = v ?? 0; })} /></td>
                <td><select value={sp.exterior} onChange={(e) => setB(i, (q) => { q.materials = { ...(q.materials ?? {}), exterior: e.target.value }; })} data-no-choose>{materialsFor('wall').map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></td>
                <td><select value={sp.floor} onChange={(e) => setB(i, (q) => { q.materials = { ...(q.materials ?? {}), floor: e.target.value }; })} data-no-choose>{materialsFor('floor').map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></td>
                <td><button className="ghost" aria-label={`Remove ${b.name}`} onClick={async () => { if (await askDelete(`Remove ${b.name} and its links from the site?`)) setC((n) => { n.links = n.links.filter((l) => l.from !== b.id && l.to !== b.id); n.buildings.splice(i, 1); }); }}>✕</button></td>
              </tr>); })}
          </tbody></table></div>
        <p className="small muted">The systems on the job (project type) apply to every building. Each new building starts with the typical materials for its type; change its outside walls and floors here.</p>
      </Card>

      <Card title="2. Links between buildings" className="wide" tip="How the buildings connect: fiber or copper in underground conduit, aerial fiber on poles, empty conduit for later, or a wireless bridge between roofs." actions={<button disabled={buildings.length < 2} onClick={() => setC((n) => { n.links.push({ id: uid(), from: 'main', to: buildings[1]?.id ?? 'main', kind: 'fiber-ug', strands: 12 }); })}>+ Add a link</button>}>
        {!c.links.length ? <p className="muted">{buildings.length < 2 ? 'Add a second building first.' : 'No links yet.'}</p> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Link</th><th>From</th><th>To</th><th>Type</th><th>Strands / pairs</th><th>Length</th><th>Check</th><th /></tr></thead>
            <tbody>{c.links.map((l, i) => { const r = links.find((x) => x.link.id === l.id); return (
              <tr key={l.id}><td>L-{String(i + 1).padStart(2, '0')}</td>
                <td><select value={l.from} onChange={(e) => setC((n) => { n.links[i].from = e.target.value; })} data-no-choose>{names.map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}</select></td>
                <td><select value={l.to} onChange={(e) => setC((n) => { n.links[i].to = e.target.value; })} data-no-choose>{names.map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}</select></td>
                <td><select value={l.kind} onChange={(e) => setC((n) => { n.links[i].kind = e.target.value as LinkKind; })} data-no-choose>{Object.entries(LINK_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></td>
                <td>{l.kind === 'wireless' ? <span className="row"><Num value={l.fMHz ?? 5800} onChange={(v) => setC((n) => { n.links[i].fMHz = v ?? 5800; })} unit="MHz" /></span> : <Num min={0} value={l.strands} onChange={(v) => setC((n) => { n.links[i].strands = Math.max(0, Math.round(v ?? 0)); })} />}</td>
                <td>{r ? `${Math.round(r.routeFt)} ft route${r.cableFt ? `, ${Math.round(r.cableFt)} ft cable` : ''}` : '—'}</td>
                <td className="small">{!r ? 'Pick two different buildings' : r.wireless ? <span className={r.wireless.ok ? 'tone-ok' : 'tone-bad'}>{r.wireless.blockedBy.length ? `Blocked by ${r.wireless.blockedBy.join(', ')}` : `${r.wireless.rslDbm.toFixed(0)} dBm, ${r.wireless.marginDb.toFixed(0)} dB margin`}</span> : `${r.handholes ? r.handholes + ' handholes' : ''}${r.poles ? r.poles + ' poles' : ''}${!r.handholes && !r.poles ? 'Short run' : ''}`}</td>
                <td><button className="ghost" aria-label="Remove link" onClick={() => setC((n) => { n.links.splice(i, 1); })}>✕</button></td></tr>); })}</tbody></table></div>)}
        <p className="small muted">Wireless check: 23 dBm radios with 23 dBi dishes at each roof, free-space loss, 20 dB fade margin needed over −70 dBm, and the 60% Fresnel zone clear of the other buildings. For long paths over hills use <a href="#path" onClick={(e) => { e.preventDefault(); go('path'); }}>Path Profile / LOS</a>.</p>
      </Card>

      <Card title="3. Site plan and 3D site model with layers" className="wide" actions={<button className="small-btn" onClick={() => downloadText('site-layers.dxf', modelDxf(scene), 'application/dxf')}>⬇ CAD drawing (DXF)</button>}>
        <LayeredModel scene={scene} northDeg={p.blueprint?.planNorthDeg ?? 0} title="Site model with layers" onMoveBuilding={(id, dx, dy) => move(id, dx, dy)} />
        <div className="stats">{scene.stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} tone={s.tone} tip={s.tip} />)}</div>
        <ul className="small">{scene.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <p className="small muted">In the 2D site plan, drag a building to move it. The <b>Buildings</b> layers show or hide a whole building; each system&apos;s layers cover every building at once. <b>Outdoor signal</b> (under Wi-Fi or ERCES) shows indoor antennas reaching outside.</p>
      </Card>

      <Card title="4. Cable schedule between buildings" className="wide" actions={<button className="small-btn" disabled={!schedule.length} onClick={csvSchedule}>⬇ Spreadsheet (CSV)</button>}>
        {!schedule.length ? <p className="muted">No links yet.</p> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Link</th><th>From → to</th><th>Cable / path</th><th>Route</th><th>Cable</th><th>Conduit</th><th>Handholes / poles</th></tr></thead>
          <tbody>{schedule.map(({ id, r }) => <tr key={id}><td>{id}</td><td>{r.from.code} → {r.to.code}</td><td className="small">{LINK_KIND[r.link.kind].what}{r.link.kind !== 'wireless' && r.link.kind !== 'conduit' ? `, ${r.link.strands} ${r.link.kind === 'copper-ug' ? 'pairs' : 'strands'}` : ''}</td><td>{Math.round(r.routeFt)} ft</td><td>{r.cableFt ? `${Math.round(r.cableFt)} ft` : '—'}</td><td>{r.conduitFt ? `${Math.round(r.conduitFt)} ft` : '—'}</td><td>{r.handholes || r.poles || '—'}</td></tr>)}</tbody></table></div>}
      </Card>

      <Card title="5. Materials for the whole site" className="wide" actions={<span className="row"><button className="small-btn" disabled={!bom.length} onClick={csvBom}>⬇ Spreadsheet (CSV)</button><button className="primary" disabled={buildings.length < 2} onClick={addToMaterials}>Add to Materials list</button></span>}>
        {!bom.length ? <p className="muted">Pick the project type so each building gets its devices.</p> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>System</th><th>Item</th><th>Spec</th><th>Qty</th><th>Where</th></tr></thead>
          <tbody>{bom.map((m) => <tr key={m.system + m.item + m.spec}><td>{m.system}</td><td>{m.item}</td><td className="small">{m.spec}</td><td>{m.qty.toLocaleString()} {m.unit}</td><td className="small">{m.where}</td></tr>)}</tbody></table></div>}
        {msg && <p className="note" role="status">{msg}</p>}
        <p className="small muted">Every building&apos;s equipment and materials (from the same rules as Auto-Design) plus the links between them. Starting quantities: a designer must check them against the site survey, the adopted codes and the AHJ.</p>
      </Card>
    </div>
  );
}
