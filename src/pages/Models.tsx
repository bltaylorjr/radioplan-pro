import React, { useMemo, useState } from 'react';
import { useStore, downloadText } from '../store';
import { Card, Num, Stat } from '../components/ui';
import { ProjectTypePicker } from '../components/SystemsUI';
import { LayeredModel } from '../components/LayeredModel';
import { defaultInputs, AutoInputs, BLDG, BldgType } from '../engine/autodesign';
import { buildModel, modelDxf, ModelScene, hasPlanWalls } from '../engine/models';
import { BuildingSpec, MAT, MatUse, materialsFor, matLossDb, PRESETS, RF_BANDS, RF_BAND_LABEL, SCENARIOS, specFor, outsideInLossDb } from '../engine/bldgmaterials';
import { projectSystems } from '../data/systems';

const PARTS: { k: keyof BuildingSpec; label: string; use: MatUse; tip: string }[] = [
  { k: 'exterior', label: 'Outside walls', use: 'wall', tip: 'The main outside wall. Sets how much outside radio signal gets in.' },
  { k: 'window', label: 'Windows', use: 'window', tip: 'Low-E or tinted glass blocks radio almost like metal.' },
  { k: 'corridor', label: 'Corridor walls', use: 'wall', tip: 'Walls along the main hallway.' },
  { k: 'partition', label: 'Room walls', use: 'wall', tip: 'Walls between rooms.' },
  { k: 'door', label: 'Doors', use: 'door', tip: 'Room and corridor doors.' },
  { k: 'floor', label: 'Floors', use: 'floor', tip: 'Floor construction between stories. Each floor a signal passes through costs this loss.' },
  { k: 'roof', label: 'Roof', use: 'roof', tip: 'Roof deck. The donor antenna cable comes through it.' },
  { k: 'ceiling', label: 'Ceiling', use: 'ceiling', tip: 'Sets echo (sound) and whether the space above is a plenum.' },
  { k: 'finish', label: 'Floor finish', use: 'finish', tip: 'Carpet absorbs sound; tile and concrete reflect it.' },
  { k: 'stair', label: 'Stairwells', use: 'shaft', tip: 'Enclosed stairs: ERCES critical areas, rated shafts.' },
  { k: 'elevator', label: 'Elevator shaft', use: 'shaft', tip: 'Elevator hoistway: rated shaft that blocks signal.' },
];

function Compare({ a, b, name }: { a: ModelScene; b: ModelScene; name: string }) {
  return (
    <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Result</th><th>Your choices</th><th>{name}</th></tr></thead>
      <tbody>{a.stats.map((s, i) => <tr key={s.label}><td title={s.tip}>{s.label}</td><td className={s.tone ? 'tone-' + s.tone : ''}>{s.value}</td><td className={b.stats[i]?.tone ? 'tone-' + b.stats[i].tone : ''}>{b.stats[i]?.value ?? '—'}</td></tr>)}
        {RF_BANDS.map((f) => <tr key={f}><td>Outside → mid-floor loss, {RF_BAND_LABEL[f]}</td><td>{outsideInLossDb(a.spec, f, a.W).toFixed(0)} dB</td><td>{outsideInLossDb(b.spec, f, b.W).toFixed(0)} dB</td></tr>)}
      </tbody></table></div>
  );
}

export function ModelsPage() {
  const { project: p, update, go } = useStore();
  const x: AutoInputs = { ...defaultInputs(), ...(p.autoDesign ?? {}) };
  const spec = specFor(p.buildingMaterials, x.bldg);
  const setIn = <K extends keyof AutoInputs>(k: K, v: AutoInputs[K]) => update((d) => { d.autoDesign = { ...defaultInputs(), ...(d.autoDesign ?? {}), [k]: v }; });
  const setSpec = <K extends keyof BuildingSpec>(k: K, v: BuildingSpec[K]) => update((d) => { d.buildingMaterials = { ...(d.buildingMaterials ?? {}), [k]: v }; });
  const hasIndoor = (p.indoor?.walls?.length ?? 0) > 0;
  const hasPlan = hasPlanWalls(p);
  const [wallsFrom, setWallsFrom] = useState<'typical' | 'indoor' | 'plan'>(hasPlan ? 'plan' : 'typical');
  const scene = useMemo(() => buildModel(p, { wallsFrom }), [p, wallsFrom]);
  const [scn, setScn] = useState('');
  const alt = useMemo(() => { const s = SCENARIOS.find((v) => v.id === scn); return s ? buildModel(p, { wallsFrom, spec: s.spec }) : null; }, [p, wallsFrom, scn]);
  const systems = projectSystems(p.meta);
  const num = (k: keyof AutoInputs, label: string, unit?: string) => <label className="field"><span>{label}</span><Num min={0} value={x[k] as number} onChange={(v) => setIn(k, (v || 0) as never)} unit={unit} /></label>;
  const usePreset = () => update((d) => { d.buildingMaterials = undefined; });
  const changed = Object.keys(p.buildingMaterials ?? {}).length > 0;
  return (
    <div className="grid">
      <Card title="1. Building and systems" className="wide" tip="The model is built from these few facts and the systems on the project. More details (doors, rooms, parking, call boxes) are on Auto-Design.">
        <ProjectTypePicker compact />
        <div className="form">
          <label className="field"><span>Building type</span><select value={x.bldg} onChange={(e) => { const b = e.target.value as BldgType; update((d) => { d.autoDesign = { ...x, bldg: b, smokeCoverage: BLDG[b].smoke }; }); }}>{Object.entries(BLDG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          {num('floors', 'Floors')}{num('lengthFt', 'Building length', 'ft')}{num('widthFt', 'Building width', 'ft')}{num('floorHeightFt', 'Floor-to-floor height', 'ft')}{num('ceilingFt', 'Ceiling height', 'ft')}
          {(hasIndoor || hasPlan) && <label className="field"><span>Walls from</span><select value={wallsFrom} onChange={(e) => setWallsFrom(e.target.value as 'typical' | 'indoor' | 'plan')} data-no-choose><option value="typical">Typical layout for the building type</option>{hasPlan && <option value="plan">Imported floor plan (Floor Plan to 2D / 3D)</option>}{hasIndoor && <option value="indoor">My drawing on Indoor Coverage (stretched to fit)</option>}</select></label>}
        </div>
        {!systems.length && <p className="warn-text">Pick the project type above so the model knows which systems to show.</p>}
        <p className="small muted">Doors, rooms, parking and call boxes: <a href="#autodesign" onClick={(e) => { e.preventDefault(); go('autodesign'); }}>Auto-Design</a>.</p>
      </Card>

      <Card title="2. Building materials" className="wide" tip="Pick what the building is made of. Every result on this page uses these: radio and Wi-Fi signal, echo for speakers, fire ratings and firestops, and what cameras and motion sensors can see." actions={<button onClick={usePreset} disabled={!changed} title={PRESETS[x.bldg]?.why}>Use typical for {BLDG[x.bldg]?.label ?? 'this building'}</button>}>
        <p className="small">{changed ? 'Your choices (changed from the typical building). ' : 'Typical for this building type: '}<span className="muted">{PRESETS[x.bldg]?.why}</span></p>
        <div className="form">
          <p className="small muted wide" style={{ gridColumn: '1 / -1', margin: 0 }}>The number after each material is the radio signal it costs at 800 MHz (public safety). Open the table below for every band.</p>
          {PARTS.map((pt) => <label key={pt.k} className="field" title={pt.tip}><span>{pt.label}</span><select value={spec[pt.k] as string} onChange={(e) => setSpec(pt.k, e.target.value as never)} data-no-choose>{materialsFor(pt.use).map((m) => <option key={m.id} value={m.id}>{m.label}{m.rf[2] ? ` · ${matLossDb(m.id, 800).toFixed(0)} dB` : ''}</option>)}</select></label>)}
          <label className="field" title="Share of the outside wall that is glass."><span>Windows, % of outside wall</span><Num min={0} max={100} value={spec.windowPct} onChange={(v) => setSpec('windowPct', Math.max(0, Math.min(100, v ?? 0)))} unit="%" /></label>
          <label className="field" title="Basements and below-ground parking get almost no outside signal."><span>Floors below ground</span><Num min={0} max={6} value={spec.belowGrade} onChange={(v) => setSpec('belowGrade', Math.max(0, Math.round(v ?? 0)))} /></label>
          <label className="field check"><input type="checkbox" checked={spec.plenum} onChange={(e) => setSpec('plenum', e.target.checked)} /><span>Ceiling space is used for return air (plenum)</span></label>
          <label className="field check"><input type="checkbox" checked={spec.ratedCorridor} onChange={(e) => setSpec('ratedCorridor', e.target.checked)} /><span>Corridor walls are fire-rated</span></label>
          <label className="field check"><input type="checkbox" checked={spec.shafts} onChange={(e) => setSpec('shafts', e.target.checked)} /><span>Show stairs and elevator</span></label>
        </div>
        <details><summary>What each material does (radio loss by band, sound, fire rating, cameras)</summary>
          <div className="tbl-wrap"><table className="tbl small"><thead><tr><th>Part</th><th>Material</th>{RF_BANDS.map((f) => <th key={f}>{f >= 1000 ? `${f / 1000} GHz` : `${f} MHz`}</th>)}<th>Sound absorption</th><th>Fire rating (typical)</th><th>Cameras see through</th><th>Notes</th></tr></thead>
            <tbody>{PARTS.map((pt) => { const m = MAT[spec[pt.k] as string]; if (!m) return null; return <tr key={pt.k}><td>{pt.label}</td><td>{m.label}</td>{m.rf.map((v, i) => <td key={i}>{v} dB</td>)}<td>{m.alpha.toFixed(2)}</td><td>{m.fireHr ? `${m.fireHr >= 1 ? m.fireHr : Math.round(m.fireHr * 60) + ' min'}${m.fireHr >= 1 ? ' h' : ''}` : '—'}</td><td>{m.seeThrough ? 'Yes (motion sensors no)' : 'No'}</td><td className="muted">{m.note}</td></tr>; })}</tbody></table></div>
          <p className="small muted">Typical published values (ITU-R P.2040 / P.1238, NIST building-loss studies, standard absorption tables, IBC practice). Real buildings vary: confirm with a site survey, the architect&apos;s code plan and the AHJ.</p>
        </details>
      </Card>

      <Card title="3. 2D plan and 3D model with layers" className="wide" actions={<button className="small-btn" onClick={() => downloadText(`${(p.meta.name || 'building').replace(/[^\w-]+/g, '_')}-layers.dxf`, modelDxf(scene), 'application/dxf')}>⬇ CAD drawing (DXF, with layers)</button>}>
        <LayeredModel scene={scene} northDeg={p.blueprint?.planNorthDeg ?? 0} planImage={wallsFrom === 'indoor' ? p.indoor?.floorPlanDataUrl : undefined} parking={x.parkingSpaces} title="Building model with layers" />
        <div className="stats">{scene.stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} tone={s.tone} tip={s.tip} />)}</div>
        <ul className="small">{scene.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <p className="small muted">Drawn to true scale. Device places, coverage and cable routes are a starting layout from rules of thumb (each layer says its rule when you point at it). A designer must check spacing, candela, audibility, coverage and cable lengths against the adopted codes, the manufacturer and the AHJ.</p>
      </Card>

      <Card title="4. Compare a scenario" className="wide" tip="See what happens with different materials, without changing your choices.">
        <div className="row wrap"><span>What if the building were:</span><select value={scn} onChange={(e) => setScn(e.target.value)} data-no-choose><option value="">Pick a scenario…</option>{SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          {alt && <button className="primary" onClick={() => { const s = SCENARIOS.find((v) => v.id === scn)!; update((d) => { d.buildingMaterials = { ...(d.buildingMaterials ?? {}), ...s.spec }; }); setScn(''); }}>Use this scenario</button>}</div>
        {alt ? <Compare a={scene} b={alt} name={SCENARIOS.find((v) => v.id === scn)!.label} /> : <p className="muted small">Pick one to compare signal coverage, outside signal loss by band, echo and firestops with your current choices.</p>}
      </Card>
    </div>
  );
}
