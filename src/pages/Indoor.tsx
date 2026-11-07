import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Stat, fmt, Txt } from '../components/ui';
import { WALL_MATERIALS, multiWallLossDb, p1238LossDb, wallLossDb } from '../engine/indoor';
import { rssiColor, RSSI_SCALE } from '../engine/coverage';
import { uid } from '../defaults';
import type { IndoorDesign } from '../types';

type Tool = 'wall' | 'antenna' | 'erase';

export function IndoorPage() {
  const { project: p, update } = useStore();
  const d = p.indoor;
  const cv = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('wall');
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [eirp, setEirp] = useState(15);
  const [model, setModel] = useState('CommScope CELLMAX-O ceiling omni');
  const set = <K extends keyof IndoorDesign>(k: K, v: IndoorDesign[K]) => update((q) => { q.indoor[k] = v; });
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
    for (const a of d.antennas) { g.fillStyle = '#c62828'; g.beginPath(); g.arc(a.x * scale, a.y * scale, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#000'; g.font = '12px sans-serif'; g.fillText(a.label, a.x * scale + 9, a.y * scale - 6); }
  }, [grid, img, d.walls, d.antennas, drag, PX, PY, scale, d.widthM, d.heightM, d.currentMaterial]);

  const toM = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * d.widthM, y: ((e.clientY - r.top) / r.height) * d.heightM }; };
  const snap = (v: number) => Math.round(v * 4) / 4;
  const down = (e: React.PointerEvent) => {
    const m = toM(e);
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
  return (
    <div className="stack">
      <Card title="Indoor planner" tour="in-tools">
        <div className="form">
          <Field label="Frequency"><Num value={d.fMHz} onChange={(v) => set('fMHz', v!)} unit="MHz" /></Field>
          <Field label="Building width × depth"><span className="row"><Num value={d.widthM} onChange={(v) => set('widthM', Math.max(5, v!))} unit="m" />×<Num value={d.heightM} onChange={(v) => set('heightM', Math.max(5, v!))} unit="m" /></span></Field>
          <Field label="Floor plan image"><span className="row"><input type="file" accept="image/*" onChange={(e) => onPlan(e.target.files?.[0])} />{d.floorPlanDataUrl && <button onClick={() => set('floorPlanDataUrl', undefined)}>Remove</button>}</span></Field>
          <Field label="Target signal" tip="−95 dBm for ERCES (IFC 510); −67 dBm for Wi-Fi voice; −85 dBm cellular in-building."><Num value={d.targetDbm} onChange={(v) => set('targetDbm', v!)} unit="dBm" /></Field>
          <Field label="Environment (P.1238)"><Sel value={d.env} onChange={(v) => set('env', v)} options={['office', 'commercial', 'residential']} /></Field>
        </div>
        <div className="row wrap toolbar">
          <span>Tool:</span>
          {(['wall', 'antenna', 'erase'] as Tool[]).map((t) => <button key={t} className={tool === t ? 'primary' : ''} onClick={() => setTool(t)}>{t === 'wall' ? '✏ Draw wall' : t === 'antenna' ? '📡 Place antenna' : '⌫ Erase'}</button>)}
          {tool === 'wall' && <Sel value={d.currentMaterial} onChange={(v) => set('currentMaterial', v)} options={Object.entries(WALL_MATERIALS).map(([k, m]) => [k, `${m.label} (${wallLossDb(k, d.fMHz).toFixed(0)} dB)`] as [string, string])} />}
          {tool === 'antenna' && <><Num value={eirp} onChange={(v) => setEirp(v!)} unit="dBm EIRP" /><Txt value={model} onChange={setModel} /></>}
          <button onClick={() => { if (confirm('Clear all walls and antennas?')) update((q) => { q.indoor.walls = []; q.indoor.antennas = []; }); }}>Clear</button>
        </div>
        <p className="small muted">Drag to draw walls (hold Shift for straight lines); click to place antennas; erase removes the nearest item. Grid = 5 m.</p>
      </Card>
      <Card title="Floor plan & coverage" tour="in-canvas">
        <div className="canvas-wrap"><canvas ref={cv} className="plan" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} style={{ aspectRatio: `${d.widthM} / ${d.heightM}` }} /></div>
        <div className="legend">{RSSI_SCALE.map((s) => <span key={s.min}><span className="lg" style={{ background: `rgb(${s.color.join(',')})` }} />{s.label}</span>)}</div>
        <div className="stats">
          <Stat label={`Floor area ≥ ${d.targetDbm} dBm`} value={fmt(grid.pct, 1)} unit=" %" tone={grid.pct >= 99 ? 'ok' : grid.pct >= 90 ? 'warn' : 'bad'} tip="ERCES: 90% general, 99% critical areas" />
          <Stat label="Antennas" value={d.antennas.length} /><Stat label="Walls" value={d.walls.length} />
          <Stat label="P.1238 loss @ 20 m (reference)" value={fmt(p1238)} unit=" dB" />
        </div>
        {d.antennas.length > 0 && <table className="tbl"><thead><tr><th>Label</th><th>Model</th><th>X (m)</th><th>Y (m)</th><th>EIRP (dBm)</th></tr></thead>
          <tbody>{d.antennas.map((a, i) => <tr key={a.id}><td><input value={a.label} onChange={(e) => update((q) => { q.indoor.antennas[i].label = e.target.value; })} /></td><td>{a.model}</td><td>{a.x.toFixed(1)}</td><td>{a.y.toFixed(1)}</td><td><Num value={a.eirpDbm} onChange={(v) => update((q) => { q.indoor.antennas[i].eirpDbm = v!; })} /></td></tr>)}</tbody></table>}
      </Card>
    </div>
  );
}
