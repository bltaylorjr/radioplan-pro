import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { autoDesign, defaultInputs, AutoInputs, BLDG, BldgType, KIND_LABEL, Kind, TerrainInfo } from '../engine/autodesign';
import { ProjectTypePicker } from '../components/SystemsUI';
import { Building3D, KIND_COLOR } from '../components/Building3D';
import { FloorPlan2D } from '../components/FloorPlan2D';
import { sampleDem } from '../engine/terrain';
import { projectSystems } from '../data/systems';

/** Elevation at the site and how the ground around it compares, from the downloaded terrain. */
export function terrainAround(dem: Parameters<typeof sampleDem>[0] | null, lat: number, lon: number): TerrainInfo | undefined {
  if (!dem) return undefined; const z = sampleDem(dem, { lat, lon }); if (z == null) return undefined;
  const ring: number[] = []; for (let a = 0; a < 360; a += 30) for (const km of [0.5, 1, 2]) { const dLat = (km / 111.2) * Math.cos((a * Math.PI) / 180), dLon = (km / (111.2 * Math.cos((lat * Math.PI) / 180))) * Math.sin((a * Math.PI) / 180); const v = sampleDem(dem, { lat: lat + dLat, lon: lon + dLon }); if (v != null) ring.push(v); }
  if (!ring.length) return { elevM: z, reliefM: 0, lowerByM: 0 };
  const hi = Math.max(...ring), lo = Math.min(...ring);
  return { elevM: z, reliefM: Math.max(hi, z) - Math.min(lo, z), lowerByM: Math.max(0, hi - z) };
}

export function AutoDesignPage() {
  const { project: p, update, rt, go } = useStore();
  const x: AutoInputs = { ...defaultInputs(), ...(p.autoDesign ?? {}) };
  const set = <K extends keyof AutoInputs>(k: K, v: AutoInputs[K]) => update((d) => { d.autoDesign = { ...defaultInputs(), ...(d.autoDesign ?? {}), [k]: v }; });
  const site = p.sites[0];
  const terrain = useMemo(() => (site ? terrainAround(rt.dem, site.lat, site.lon) : undefined), [rt.dem, site?.lat, site?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useMemo(() => autoDesign(p, x, terrain), [p, terrain]); // eslint-disable-line react-hooks/exhaustive-deps
  const [floor, setFloor] = useState<number | 'all'>('all');
  const [view, setView] = useState<'3d' | '2d'>(() => { try { return localStorage.getItem('radioplan.designView') === '2d' ? '2d' : '3d'; } catch { return '3d'; } });
  const pickView = (v: '3d' | '2d') => { setView(v); try { localStorage.setItem('radioplan.designView', v); } catch { /* ignore */ } };
  const [hidden, setHidden] = useState<Set<Kind>>(new Set());
  const [msg, setMsg] = useState('');
  const kinds = [...new Set([...r.trs, ...r.devices].map((d) => d.kind))];
  const systems = projectSystems(p.meta);
  const num = (k: keyof AutoInputs, label: string, unit?: string, tip?: string) => (
    <label className="field" title={tip}><span>{label}</span><span className="num"><input type="number" min={0} value={x[k] as number} onChange={(e) => set(k, (parseFloat(e.target.value) || 0) as never)} />{unit && <span className="unit">{unit}</span>}</span></label>);
  const applyDesigns = () => {
    const c = (k: Kind) => r.devices.filter((d) => d.kind === k).length;
    update((d) => {
      d.autoDesign = { ...x, applied: true };
      if (c('smoke') + c('hornstrobe') + c('pull')) { d.alarm.enabled = true; d.alarm.devices = [{ name: 'Smoke detector (addressable)', qty: c('smoke'), standbyMa: 0.3, alarmMa: 0.3 }, { name: 'Manual pull station', qty: c('pull'), standbyMa: 0.3, alarmMa: 0.3 }, { name: 'Horn/strobe 75 cd', qty: c('hornstrobe'), standbyMa: 0, alarmMa: 140 }].filter((v) => v.qty > 0); d.alarm.standbyHours = 24; d.alarm.alarmMinutes = projectSystems(d.meta).some((s) => s.id === 'massnotif') ? 15 : 5; }
      if (c('das')) { d.erces.floors = x.floors; d.erces.areaPerFloorSqft = x.lengthFt * x.widthFt; d.erces.antennasPerFloor = Math.max(1, Math.round(c('das') / Math.max(1, x.floors))); if (projectSystems(d.meta).some((s) => s.id === 'erces')) d.erces.enabled = true; }
    });
    setMsg('Added to the Materials list, and the Fire Alarm and ERCES pages were updated with these quantities ✓');
  };
  return (
    <div className="grid">
      <Card title="1. Project needs" className="wide" tip="Describe the building. The app lays out devices for every system on the project, recommends head-end equipment, and measures cable from the layout.">
        <ProjectTypePicker compact />
        <div className="form">
          <label className="field"><span>Building type</span><select value={x.bldg} onChange={(e) => { const b = e.target.value as BldgType; update((d) => { d.autoDesign = { ...x, bldg: b, smokeCoverage: BLDG[b].smoke }; }); }}>{Object.entries(BLDG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          {num('floors', 'Floors')}
          {num('lengthFt', 'Building length', 'ft')}
          {num('widthFt', 'Building width', 'ft')}
          {num('floorHeightFt', 'Floor-to-floor height', 'ft')}
          {num('ceilingFt', 'Ceiling height', 'ft')}
          {num('exteriorDoors', 'Exterior doors')}
          {num('accessDoors', 'Card-access doors')}
          {num('rooms', 'Patient / guest / apartment rooms')}
          {num('parkingSpaces', 'Parking spaces')}
          {num('callBoxes', 'Outdoor call boxes')}
          {num('retentionDays', 'Video retention', 'days')}
          <label className="field"><span>Smoke detection</span><select value={x.smokeCoverage} onChange={(e) => set('smokeCoverage', e.target.value as AutoInputs['smokeCoverage'])}><option value="full">Full coverage</option><option value="corridors">Corridors and required areas</option></select></label>
        </div>
        {!systems.length && <p className="warn-text">Pick the project type above so the design knows which systems to include.</p>}
      </Card>

      <Card title="2. Site and placement" className="wide">
        <ul className="small">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        {!terrain && <p className="small muted">No terrain loaded for the site yet. <a href="#terrain" onClick={(e) => { e.preventDefault(); go('terrain'); }}>Map & Terrain</a> downloads it automatically when online.</p>}
      </Card>

      <Card title={`3. ${view === '3d' ? '3D model' : '2D floor plan'}`} className="wide" actions={<span className="row"><span className="seg" role="group" aria-label="View"><button className={view === '2d' ? 'primary' : ''} aria-pressed={view === '2d'} onClick={() => pickView('2d')}>2D plan</button><button className={view === '3d' ? 'primary' : ''} aria-pressed={view === '3d'} onClick={() => pickView('3d')}>3D model</button></span><select value={String(floor)} onChange={(e) => setFloor(e.target.value === 'all' ? 'all' : +e.target.value)} aria-label="Floor to show"><option value="all">All floors</option>{Array.from({ length: Math.max(1, x.floors) }, (_, i) => <option key={i} value={i}>Floor {i + 1}</option>)}</select></span>}>
        {view === '2d' ? <FloorPlan2D r={r} lengthFt={x.lengthFt} widthFt={x.widthFt} floor={floor} hidden={hidden} /> : <Building3D r={r} lengthFt={x.lengthFt} widthFt={x.widthFt} floorHeightFt={x.floorHeightFt} floor={floor} hidden={hidden} />}
        <div className="row wrap" style={{ marginTop: 8 }}>{kinds.map((k) => <button key={k} className={'legend-chip' + (hidden.has(k) ? ' off' : '')} onClick={() => { const n = new Set(hidden); if (n.has(k)) n.delete(k); else n.add(k); setHidden(n); }}><i style={{ background: KIND_COLOR[k] }} />{KIND_LABEL[k]} ({k === 'tr' ? r.trs.length : r.devices.filter((d) => d.kind === k).length})</button>)}</div>
        <p className="small muted">{view === '3d' ? 'Drag to turn, scroll or pinch to zoom. ' : 'Point at a dot to see what it is. '}Tap a legend item to hide it. Devices are placed on a grid as a starting layout; move them to suit the real floor plan.</p>
      </Card>

      <Card title="4. Recommended equipment" className="wide">
        {!r.equipment.length ? <p className="muted">Nothing to recommend yet.</p> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>System</th><th>Equipment</th><th>Recommended spec</th><th>Qty</th><th>Basis</th></tr></thead>
          <tbody>{r.equipment.map((e) => <tr key={e.system + e.key}><td>{e.system}</td><td>{e.item}</td><td>{e.spec}</td><td>{e.qty} {e.unit}</td><td className="small muted">{e.basis}</td></tr>)}</tbody></table></div>}
      </Card>

      <Card title="5. Material estimate" className="wide" actions={<button className="primary" disabled={!r.equipment.length && !r.materials.length} onClick={applyDesigns}>{p.autoDesign?.applied ? 'Update Materials list' : 'Add to Materials list'}</button>}>
        {!r.materials.length ? <p className="muted">No materials yet.</p> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>System</th><th>Material</th><th>Spec</th><th>Qty</th><th>Basis</th></tr></thead>
          <tbody>{r.materials.map((m) => <tr key={m.system + m.key}><td>{m.system}</td><td>{m.item}</td><td>{m.spec}</td><td>{m.qty.toLocaleString()} {m.unit}</td><td className="small muted">{m.basis}</td></tr>)}</tbody></table></div>}
        {msg && <p className="note" role="status">{msg}</p>}
        {p.autoDesign?.applied && <p className="small">These lines are in the <a href="#materials" onClick={(e) => { e.preventDefault(); go('materials'); }}>Materials list</a> and update when you change the inputs. <button className="ghost" onClick={() => update((d) => { if (d.autoDesign) d.autoDesign.applied = false; })}>Remove from Materials list</button></p>}
        <p className="small muted">Starting-point quantities from rules of thumb (stated in each basis). A designer must check device spacing, candela, audibility, coverage and cable lengths against the adopted codes, the manufacturer and the AHJ.</p>
      </Card>
    </div>
  );
}
