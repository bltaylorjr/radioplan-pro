import { RrFreqPicker } from './RadioReference';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FullView } from '../components/FullView';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Stat, fmt, Txt } from '../components/ui';
import { WALL_MATERIALS, multiWallLossDb, p1238LossDb, wallLossDb } from '../engine/indoor';
import { rssiColor, RSSI_SCALE } from '../engine/coverage';
import { uid } from '../defaults';
import type { IndoorDesign } from '../types';
import { DonorAimCard } from '../components/DonorAim';
import { Indoor3D, WALL_HEIGHT_M as WALL_H } from '../components/Indoor3D';
import { askDelete } from '../components/askConfirm';
import { PinsPanel, drawCanvasPin, type PinRow } from '../components/ReadingPins';
import { normFor, pinColor, fmtQ, type BPoint, type BSource, type ReadingPin } from '../engine/balance';
import { useUnits } from '../units';
import { IndoorSoundPlanner } from '../components/IndoorSoundPlanner';
import { currentUser } from '../engine/accounts';

type Tool = 'wall' | 'antenna' | 'erase' | 'pin';
const INDOOR_PIN_SYSTEMS = ['erces', 'das', 'wifi', 'callbox', 'security', 'access'];

export function IndoorPage() {
  const { project: p, update } = useStore();
  const d = p.indoor;
  const cv = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('wall');
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [eirp, setEirp] = useState(15);
  const [model, setModel] = useState('CommScope CELLMAX-O ceiling omni');
  const set = <K extends keyof IndoorDesign>(k: K, v: IndoorDesign[K]) => update((q) => { q.indoor[k] = v; });
  const u = useUnits();
  const [pinAt, setPinAt] = useState<{ x: number; y: number } | null>(null);
  const [pinSysPick, setPinSys] = useState<string | null>(null);
  const pinSys = pinSysPick ?? (d.targetDbm <= -90 ? 'erces' : d.targetDbm >= -72 ? 'wifi' : 'das'); // guess the system from the plan's target
  const pinNorm = normFor(pinSys), pinTg = p.pinTargets?.[`indoor|${pinSys}`];
  const pinTarget = pinTg?.target ?? pinNorm.target, pinHot = pinTg?.hot ?? pinNorm.hot;
  const pins = (p.readingPins ?? []).filter((r) => r.map === 'indoor' && r.system === pinSys);
  /** Predicted signal from each antenna at a spot (dBm), same model as the heat map. */
  const perAnt = (x: number, y: number) => d.antennas.map((a) => a.eirpDbm + d.rxGainDbi - multiWallLossDb(d.fMHz, a.x, a.y, x, y, d.walls));
  const predAt = (x: number, y: number) => { const v = perAnt(x, y); return v.length ? Math.max(...v) : null; };
  const pinPoints: BPoint[] = useMemo(() => pins.map((r) => { const v = perAnt(r.x, r.y); const bi = v.length ? v.indexOf(Math.max(...v)) : -1; return { id: r.id, v: r.v, pred: bi >= 0 ? v[bi] : null, x: r.x, y: r.y, critical: r.critical, src: bi >= 0 ? d.antennas[bi].id : undefined }; }), [p.readingPins, d.antennas, d.walls, d.fMHz, d.rxGainDbi, pinSys]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinSources: BSource[] = d.antennas.map((a) => ({ id: a.id, label: a.label, x: a.x, y: a.y }));
  const pinWhere = (x: number, y: number) => `${u.len(x, 0)} from the left and ${u.len(y, 0)} from the top`;
  const pinRows: PinRow[] = pins.map((r) => ({ id: r.id, v: r.v, pred: predAt(r.x, r.y), where: pinWhere(r.x, r.y), at: r.at, note: [r.by ? `by ${r.by}` : '', r.note ?? ''].filter(Boolean).join(' · ') || undefined, photo: r.photo, critical: r.critical }));
  const savePin = (dr: { v: number; note?: string; photo?: string; critical?: boolean }) => {
    if (!pinAt) return; const pin: ReadingPin = { id: uid(), at: new Date().toISOString(), map: 'indoor', system: pinSys, qty: 'dbm', v: dr.v, x: pinAt.x, y: pinAt.y, ...(dr.note ? { note: dr.note } : {}), ...(dr.photo ? { photo: dr.photo } : {}), ...(dr.critical ? { critical: true } : {}), ...(currentUser()?.name ? { by: currentUser()!.name } : {}) };
    update((q) => { q.readingPins = [...(q.readingPins ?? []), pin]; }); setPinAt(null);
  };
  const PX = 900, scale = PX / d.widthM, PY = d.heightM * scale;
  useEffect(() => { if (!d.floorPlanDataUrl) { setImg(null); return; } const i = new Image(); i.onload = () => setImg(i); i.src = d.floorPlanDataUrl; }, [d.floorPlanDataUrl]);

  const grid = useMemo(() => {
    const nx = 90, ny = Math.max(10, Math.round((90 * d.heightM) / d.widthM));
    const v = new Float32Array(nx * ny).fill(NaN);
    if (!d.antennas.length) return { nx, ny, v, pct: 0 };
    let ok = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = ((i + 0.5) / nx) * d.widthM, y = ((j + 0.5) / ny) * d.heightM;
      let best = -Infinity;
      for (const a of d.antennas) best = Math.max(best, a.eirpDbm + d.rxGainDbi - multiWallLossDb(d.fMHz, a.x, a.y, x, y, d.walls));
      v[j * nx + i] = best; if (best >= d.targetDbm) ok++;
    }
    return { nx, ny, v, pct: (ok / (nx * ny)) * 100 };
  }, [d.antennas, d.walls, d.fMHz, d.widthM, d.heightM, d.rxGainDbi, d.targetDbm]);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    c.width = PX; c.height = PY;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, PX, PY);
    if (img) { g.globalAlpha = 0.85; g.drawImage(img, 0, 0, PX, PY); g.globalAlpha = 1; }
    const cw = PX / grid.nx, ch = PY / grid.ny;
    for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
      const [r, gg, b, a] = rssiColor(grid.v[j * grid.nx + i], -130);
      if (a) { g.fillStyle = `rgba(${r},${gg},${b},${(a / 255) * 0.55})`; g.fillRect(i * cw, j * ch, cw + 0.5, ch + 0.5); }
    }
    g.strokeStyle = '#ddd'; g.lineWidth = 0.5;
    for (let m = 0; m <= d.widthM; m += 5) { g.beginPath(); g.moveTo(m * scale, 0); g.lineTo(m * scale, PY); g.stroke(); }
    for (let m = 0; m <= d.heightM; m += 5) { g.beginPath(); g.moveTo(0, m * scale); g.lineTo(PX, m * scale); g.stroke(); }
    const walls = drag ? [...d.walls, { x1: drag.x, y1: drag.y, x2: drag.x2, y2: drag.y2, material: d.currentMaterial }] : d.walls;
    for (const w of walls) { g.strokeStyle = WALL_MATERIALS[w.material]?.color ?? '#333'; g.lineWidth = 4; g.beginPath(); g.moveTo(w.x1 * scale, w.y1 * scale); g.lineTo(w.x2 * scale, w.y2 * scale); g.stroke(); }
    for (const r of pins) drawCanvasPin(g, r.x * scale, r.y * scale, pinColor(r.v, pinTarget, pinHot, 'dbm'), String(r.v));
    if (pinAt) drawCanvasPin(g, pinAt.x * scale, pinAt.y * scale, '#1e88e5', 'new');
    for (const a of d.antennas) { g.fillStyle = '#c62828'; g.beginPath(); g.arc(a.x * scale, a.y * scale, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#000'; g.font = '12px sans-serif'; g.fillText(a.label, a.x * scale + 9, a.y * scale - 6); }
  }, [grid, img, d.walls, d.antennas, drag, PX, PY, scale, d.widthM, d.heightM, d.currentMaterial, view, p.readingPins, pinAt, pinSys, pinTarget, pinHot]); // eslint-disable-line react-hooks/exhaustive-deps

  const toM = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * d.widthM, y: ((e.clientY - r.top) / r.height) * d.heightM }; };
  const snap = (v: number) => Math.round(v * 4) / 4;
  const down = (e: React.PointerEvent) => {
    const m = toM(e);
    if (tool === 'pin') { setPinAt({ x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 }); return; }
    if (tool === 'wall') setDrag({ x: snap(m.x), y: snap(m.y), x2: snap(m.x), y2: snap(m.y) });
    if (tool === 'antenna') update((q) => { q.indoor.antennas.push({ id: uid(), x: m.x, y: m.y, eirpDbm: eirp, label: `ANT-${q.indoor.antennas.length + 1}`, model }); });
    if (tool === 'erase') update((q) => {
      const ai = q.indoor.antennas.findIndex((a) => Math.hypot(a.x - m.x, a.y - m.y) < 1.5);
      if (ai >= 0) { q.indoor.antennas.splice(ai, 1); return; }
      let bi = -1, bd = 1;
      q.indoor.walls.forEach((w, i) => { const L2 = (w.x2 - w.x1) ** 2 + (w.y2 - w.y1) ** 2 || 1; const t = Math.max(0, Math.min(1, ((m.x - w.x1) * (w.x2 - w.x1) + (m.y - w.y1) * (w.y2 - w.y1)) / L2)); const dd = Math.hypot(m.x - (w.x1 + t * (w.x2 - w.x1)), m.y - (w.y1 + t * (w.y2 - w.y1))); if (dd < bd) { bd = dd; bi = i; } });
      if (bi >= 0) q.indoor.walls.splice(bi, 1);
    });
  };
  const move = (e: React.PointerEvent) => { if (!drag) return; const m = toM(e); let x2 = snap(m.x), y2 = snap(m.y); if (e.shiftKey) { if (Math.abs(x2 - drag.x) > Math.abs(y2 - drag.y)) y2 = drag.y; else x2 = drag.x; } setDrag({ ...drag, x2, y2 }); };
  const up = () => { if (drag && Math.hypot(drag.x2 - drag.x, drag.y2 - drag.y) > 0.3) update((q) => { q.indoor.walls.push({ x1: drag.x, y1: drag.y, x2: drag.x2, y2: drag.y2, material: q.indoor.currentMaterial }); }); setDrag(null); };
  const onPlan = (f?: File) => { if (!f) return; const r = new FileReader(); r.onload = () => set('floorPlanDataUrl', r.result as string); r.readAsDataURL(f); };
  const p1238 = p1238LossDb(d.fMHz, 20, d.env, d.floors);
  const mode = d.mode ?? 'rf';
  const modeBar = (
    <div className="row wrap toolbar" role="tablist" aria-label="What are you planning" data-tour="in-mode">
      <b>Plan:</b>
      <button className={mode === 'rf' ? 'primary' : ''} aria-pressed={mode === 'rf'} onClick={() => set('mode', 'rf')}>📡 Radio signal (DAS, ERCES, Wi-Fi, wireless)</button>
      <button className={mode === 'sound' ? 'primary' : ''} aria-pressed={mode === 'sound'} onClick={() => set('mode', 'sound')}>🔊 Sound (paging, voice evacuation, fire alarm horns)</button>
    </div>
  );
  const team = p.team && p.team.members.length > 1 ? p.team : null;
  const shared = team && <p className="note small" data-tour="in-shared">👥 Shared project with {team.members.filter((m) => m.id !== currentUser()?.id).map((m) => m.name).join(', ')}. Walls, antennas, speakers, reading pins and STIPA readings each of you adds on this floor plan merge in by themselves; each pin shows who dropped it.</p>;
  if (mode === 'sound') return (
    <div className="stack">
      <Card title="Indoor planner" tour="in-tools">
        {modeBar}
        <div className="form">
          <Field label="Building width × depth"><span className="row"><Num value={d.widthM} onChange={(v) => set('widthM', Math.max(5, v!))} unit="m" />×<Num value={d.heightM} onChange={(v) => set('heightM', Math.max(5, v!))} unit="m" /></span></Field>
          <Field label="Floor plan image"><span className="row"><input type="file" accept="image/*" onChange={(e) => onPlan(e.target.files?.[0])} />{d.floorPlanDataUrl && <button onClick={() => set('floorPlanDataUrl', undefined)}>Remove</button>}</span></Field>
        </div>
        <p className="small muted">The same floor plan and walls are used for radio and sound. Switch back to 📡 Radio signal for DAS and ERCES antennas.</p>
        {shared}
      </Card>
      <IndoorSoundPlanner d={d} PX={PX} />
    </div>
  );
  return (
    <div className="stack">
      <Card title="Indoor planner" tour="in-tools">
        {modeBar}
        {shared}
        <div className="form">
          <Field label="Frequency"><Num value={d.fMHz} onChange={(v) => set('fMHz', v!)} unit="MHz" /><RrFreqPicker onPick={(f) => set('fMHz', f)} /></Field>
          <Field label="Building width × depth"><span className="row"><Num value={d.widthM} onChange={(v) => set('widthM', Math.max(5, v!))} unit="m" />×<Num value={d.heightM} onChange={(v) => set('heightM', Math.max(5, v!))} unit="m" /></span></Field>
          <Field label="Floor plan image"><span className="row"><input type="file" accept="image/*" onChange={(e) => onPlan(e.target.files?.[0])} />{d.floorPlanDataUrl && <button onClick={() => set('floorPlanDataUrl', undefined)}>Remove</button>}</span></Field>
          <Field label="Target signal" tip="−95 dBm for ERCES (IFC 510); −67 dBm for Wi-Fi voice; −85 dBm cellular in-building."><Num value={d.targetDbm} onChange={(v) => set('targetDbm', v!)} unit="dBm" /></Field>
          <Field label="Environment (P.1238)"><Sel value={d.env} onChange={(v) => set('env', v)} options={['office', 'commercial', 'residential']} /></Field>
        </div>
        <div className="row wrap toolbar">
          <span>Tool:</span>
          {(['wall', 'antenna', 'pin', 'erase'] as Tool[]).map((t) => <button key={t} className={tool === t ? 'primary' : ''} data-tour={t === 'pin' ? 'pins-open' : undefined} onClick={() => { setTool(t); if (t !== 'pin') setPinAt(null); }}>{t === 'wall' ? '✏ Draw wall' : t === 'antenna' ? '📡 Place antenna' : t === 'pin' ? '📌 Drop reading pin' : '⌫ Erase'}</button>)}
          {tool === 'wall' && <Sel value={d.currentMaterial} onChange={(v) => set('currentMaterial', v)} options={Object.entries(WALL_MATERIALS).map(([k, m]) => [k, `${m.label} (${wallLossDb(k, d.fMHz).toFixed(0)} dB)`] as [string, string])} />}
          {tool === 'antenna' && <><Num value={eirp} onChange={(v) => setEirp(v!)} unit="dBm EIRP" /><Txt value={model} onChange={setModel} /></>}
          <button onClick={async () => { if (await askDelete('Delete all walls and antennas?')) update((q) => { q.indoor.walls = []; q.indoor.antennas = []; }); }}>Clear</button>
        </div>
        <p className="small muted">Drag to draw walls (hold Shift for straight lines); click to place antennas; erase removes the nearest item. Grid = 5 m.</p>
      </Card>
      <Card title="Floor plan & coverage" tour="in-canvas">
        <div className="row wrap toolbar" role="tablist" aria-label="View">
          <button className={view === '2d' ? 'primary' : ''} onClick={() => setView('2d')}>🗺 2D plan</button>
          <button className={view === '3d' ? 'primary' : ''} onClick={() => setView('3d')}>🧊 3D walls</button>
          {view === '3d' && <span className="small muted">Walls stand about 10 ft ({WALL_H} m) tall in their material colour; the heat map is on the floor. Drag to turn, scroll to zoom. Switch to 2D to draw.</span>}
        </div>
        {view === '2d' ? <FullView title="Floor plan & coverage"><div className="canvas-wrap"><canvas ref={cv} className="plan" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} style={{ aspectRatio: `${d.widthM} / ${d.heightM}` }} /></div> </FullView> : <Indoor3D d={d} grid={grid} />}
        <div className="legend">{RSSI_SCALE.map((s) => <span key={s.min}><span className="lg" style={{ background: `rgb(${s.color.join(',')})` }} />{s.label}</span>)}</div>
        <div className="stats">
          <Stat label={`Floor area ≥ ${d.targetDbm} dBm`} value={fmt(grid.pct, 1)} unit=" %" tone={grid.pct >= 99 ? 'ok' : grid.pct >= 90 ? 'warn' : 'bad'} tip="ERCES: 90% general, 99% critical areas" />
          <Stat label="Antennas" value={d.antennas.length} /><Stat label="Walls" value={d.walls.length} />
          <Stat label="P.1238 loss @ 20 m (reference)" value={fmt(p1238)} unit=" dB" />
        </div>
        {d.antennas.length > 0 && <table className="tbl"><thead><tr><th>Label</th><th>Model</th><th>X (m)</th><th>Y (m)</th><th>EIRP (dBm)</th></tr></thead>
          <tbody>{d.antennas.map((a, i) => <tr key={a.id}><td><input value={a.label} onChange={(e) => update((q) => { q.indoor.antennas[i].label = e.target.value; })} /></td><td>{a.model}</td><td>{a.x.toFixed(1)}</td><td>{a.y.toFixed(1)}</td><td><Num value={a.eirpDbm} onChange={(v) => update((q) => { q.indoor.antennas[i].eirpDbm = v!; })} /></td></tr>)}</tbody></table>}
      </Card>
      <Card title="Reading pins and signal balance" tour="in-pins" tip="Pick 📌 Drop reading pin above, tap the plan where you measured, and type what your meter shows. Each pin is compared with this plan's heat map and the target; the advice says which antenna to turn up or down, move or add.">
        <PinsPanel title="Measured readings on this plan" system={pinSys} systems={INDOOR_PIN_SYSTEMS} onSystem={(s) => { setPinSys(s); setPinAt(null); }} armed={tool === 'pin'} setArmed={(v) => { setTool(v ? 'pin' : 'wall'); if (!v) setPinAt(null); }}
          pending={pinAt ? { where: `${pinWhere(pinAt.x, pinAt.y)}${predAt(pinAt.x, pinAt.y) != null ? `, predicted ${fmtQ(predAt(pinAt.x, pinAt.y)!, 'dbm')}` : ''}` } : null} onCancel={() => setPinAt(null)} onSave={savePin}
          rows={pinRows} points={pinPoints} sources={pinSources} targetKey="indoor" onDelete={(id) => update((q) => { q.readingPins = (q.readingPins ?? []).filter((x) => x.id !== id); })} dropHint="Tap the floor plan above where you took the reading." />
      </Card>
      <DonorAimCard title="DAS / BDA donor antenna aiming (azimuth)" />
    </div>
  );
}
