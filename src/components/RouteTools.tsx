// Draw lines on the map by hand (finger / mouse) or tap points for straight lines, edit them, and see the
// predicted signal, terrain, what the transmitter can see, obstacles and azimuth along each one, plus a heat map.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { useUnits } from '../units';
import { Num, Tip } from './ui';
import { AZ_TIP } from './Azimuth';
import { uid } from '../defaults';
import { analyzeLine, simplifyLine, moveVertex, insertVertex, removeVertex, type DrawnLine, type RouteResult } from '../engine/routes';
import { loadAreaDem, boundsOf } from '../engine/areaTerrain';
import { primaryCoverageInputs } from '../engine/network';
import { rssiColor } from '../engine/coverage';
import { computeCoverageAsync } from '../engine/coverageAsync';
import { designLink } from '../engine/design';
import { fmtAz } from '../engine/azimuth';
import { coverageCanvas } from './MapView';
import { useScaleChoice, ScaleSelect, ScaleBars, frameFor } from './scale';
import type { DemGrid } from '../engine/terrain';
import type { LatLon } from '../engine/geo';

const COLORS = ['#7b1fa2', '#00838f', '#c2185b', '#2e7d32', '#ef6c00', '#283593'];
type Tool = 'free' | 'straight' | null;

export const signalColor = (v: number | null, floor = -120): string => {
  if (v == null) return '#1565c0';
  const c = rssiColor(v, floor); return c[3] ? `rgb(${c[0]},${c[1]},${c[2]})` : '#555';
};

/** Lines drawn by the person, kept with the project. */
export function useDrawnLines() {
  const { project: p, update } = useStore();
  const lines = p.drawnLines ?? [];
  const setLines = (f: (x: DrawnLine[]) => DrawnLine[]) => update((d) => { d.drawnLines = f(d.drawnLines ?? []); });
  return { lines, setLines };
}

/** Prediction inputs and threshold from the radio design (null when no transmitter is set). */
export function useLineAnalysis(lines: DrawnLine[], dem: DemGrid | null) {
  const { project: p } = useStore();
  const L0 = designLink(p);
  const thr = p.radio.rxSensitivityDbm + L0.fadeMarginDb + p.radio.interferenceMarginDb;
  return useMemo(() => {
    const cov = primaryCoverageInputs(p, dem);
    return { cov, thr, res: Object.fromEntries(lines.map((l) => [l.id, analyzeLine(l, dem, cov, { thresholdDbm: thr, k: p.radio.kFactor, clutterM: p.radio.clutterM, fMHz: p.radio.fMHz })])) as Record<string, RouteResult> };
  }, [JSON.stringify(lines), dem, p.radio, p.sites, p.propagation]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Terrain and imagery chart: ground along the line, signal from the transmitter, and stretches it cannot see. */
function LineChart({ r, thr, onHover }: { r: RouteResult; thr: number; onHover: (q: LatLon | null) => void }) {
  const u = useUnits();
  const [ex, setEx] = useScaleChoice('lines');
  const W = 640, pl = 46, pr = 46, pt = 10, pb = 44;
  const s = r.samples; if (s.length < 2) return null;
  const gs = s.map((q) => q.groundM ?? NaN).filter(Number.isFinite);
  const fr = frameFor({ km: r.lengthKm, plotW: W - pl - pr, lo: gs.length ? Math.min(...gs) : 0, hi: gs.length ? Math.max(...gs) : 1, ex, autoH: 136, minH: 120, maxH: 360 });
  const autoE = frameFor({ km: r.lengthKm, plotW: W - pl - pr, lo: gs.length ? Math.min(...gs) : 0, hi: gs.length ? Math.max(...gs) : 1, ex: 0, autoH: 136 }).E;
  const H = pt + fr.ph + pb, g0 = fr.yLo, g1 = fr.yHi;
  const rs = s.map((q) => q.rssi).filter((v): v is number => v != null);
  const r0 = Math.min(-120, ...(rs.length ? [Math.min(...rs)] : [])), r1 = Math.max(-50, ...(rs.length ? [Math.max(...rs)] : []));
  const X = (d: number) => pl + ((W - pl - pr) * d) / Math.max(1e-6, r.lengthKm);
  const Yg = (z: number) => pt + (H - pt - pb) * (1 - (z - g0) / Math.max(1, g1 - g0));
  const Yr = (v: number) => pt + (H - pt - pb) * (1 - (v - r0) / Math.max(1, r1 - r0));
  const ground = s.filter((q) => q.groundM != null).map((q) => `${X(q.dKm).toFixed(1)},${Yg(q.groundM!).toFixed(1)}`);
  const hidden: [number, number][] = []; let st: number | null = null;
  s.forEach((q, i) => { if (q.seen === false && st == null) st = q.dKm; if ((q.seen !== false || i === s.length - 1) && st != null) { hidden.push([st, q.dKm]); st = null; } });
  const segs = s.slice(1).map((q, i) => (q.rssi != null && s[i].rssi != null ? <line key={i} x1={X(s[i].dKm)} y1={Yr(s[i].rssi!)} x2={X(q.dKm)} y2={Yr(q.rssi)} stroke={signalColor(q.rssi)} strokeWidth={2.5} /> : null));
  const ft = u.unit === 'mi';
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const b = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const d = ((e.clientX - b.left) / b.width * W - pl) / (W - pl - pr) * r.lengthKm;
    let best = s[0]; for (const q of s) if (Math.abs(q.dKm - d) < Math.abs(best.dKm - d)) best = q; onHover(best);
  };
  return (<>
    <div className="row" style={{ justifyContent: 'flex-end', margin: '4px 0' }}><ScaleSelect value={ex} onChange={setEx} autoEx={autoE} /></div>
    <svg viewBox={`0 0 ${W} ${H}`} className="line-chart" role="img" aria-label="Ground height and predicted signal along the line" onPointerMove={move} onPointerLeave={() => onHover(null)} style={{ width: '100%', touchAction: 'pan-y' }}>
      {hidden.map(([a, b], i) => <rect key={i} x={X(a)} y={pt} width={Math.max(1, X(b) - X(a))} height={H - pt - pb} fill="rgba(229,57,53,.13)" />)}
      <defs><clipPath id="lc-clip"><rect x={pl} y={pt} width={W - pl - pr} height={H - pt - pb} /></clipPath></defs>
      {ground.length > 1 && <polygon clipPath="url(#lc-clip)" points={`${X(0)},${H - pb} ${ground.join(' ')} ${X(r.lengthKm)},${H - pb}`} fill="#c8b48a" stroke="#8a6d3b" strokeWidth={1} />}
      {rs.length > 0 && <line x1={pl} x2={W - pr} y1={Yr(thr)} y2={Yr(thr)} stroke="#555" strokeDasharray="4 3" strokeWidth={1} />}
      {segs}
      <text x={4} y={pt + 8} fontSize={10} fill="#8a6d3b">{Math.round(ft ? g1 / 0.3048 : g1)} {ft ? 'ft' : 'm'}</text>
      <text x={4} y={H - pb} fontSize={10} fill="#8a6d3b">{Math.round(ft ? g0 / 0.3048 : g0)} {ft ? 'ft' : 'm'}</text>
      {rs.length > 0 && <><text x={W - pr + 4} y={pt + 8} fontSize={10}>{Math.round(r1)} dBm</text><text x={W - pr + 4} y={H - pb} fontSize={10}>{Math.round(r0)} dBm</text>
        <text x={W - pr + 4} y={Yr(thr) + 3} fontSize={9} fill="#555">need {Math.round(thr)}</text></>}
      <text x={pl} y={H - pb + 14} fontSize={10}>0</text><text x={W - pr} y={H - pb + 14} fontSize={10} textAnchor="end">{u.f(r.lengthKm)}</text>
      <ScaleBars f={fr} x={pl + 40} y={H - 4} xNote={W - pr} vx={pl + 4} vy={H - pb} maxW={(W - pl - pr) / 2} />
    </svg>
  </>);
}

/** The drawing / editing tools and results panel for a Leaflet map. */
export function RouteTools({ map, projectDem, active, onClose, resultsEl }: { map: L.Map | null; projectDem?: DemGrid | null; active: boolean; onClose: () => void; resultsEl?: HTMLElement | null }) {
  const { project: p } = useStore();
  const u = useUnits();
  const { lines, setLines } = useDrawnLines();
  const [tool, setTool] = useState<Tool>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [selPt, setSelPt] = useState<number | null>(null);
  const [draft, setDraft] = useState<LatLon[]>([]);
  const [heat, setHeat] = useState(false);
  const [hover, setHover] = useState<LatLon | null>(null);
  const [dem, setDem] = useState<DemGrid | null>(null);
  const [note, setNote] = useState('');
  const layer = useRef<L.LayerGroup>(); const heatLayer = useRef<L.ImageOverlay | null>(null); const hoverM = useRef<L.CircleMarker | null>(null);

  // terrain covering every line
  const area = useMemo(() => boundsOf(lines.flatMap((l) => l.pts), 1.5), [JSON.stringify(lines.map((l) => l.pts))]); // eslint-disable-line react-hooks/exhaustive-deps
  const areaKey = area ? [area.north, area.south, area.east, area.west].map((v) => v.toFixed(3)).join() : '';
  useEffect(() => { if (!area) { setDem(null); return; } let live = true; loadAreaDem(area, projectDem).then((r) => { if (live) { setDem(r.dem); setNote(r.note); } }); return () => { live = false; }; }, [areaKey, projectDem]); // eslint-disable-line react-hooks/exhaustive-deps
  const { cov, thr, res } = useLineAnalysis(lines, dem);
  const cur = lines.find((l) => l.id === sel) ?? null;
  const r = cur ? res[cur.id] : null;

  // draw the lines (colored by predicted signal) and the edit handles
  useEffect(() => {
    if (!map) return; if (!layer.current) layer.current = L.layerGroup().addTo(map);
    const g = layer.current; g.clearLayers();
    for (const l of lines) {
      const a = res[l.id], on = l.id === sel;
      if (a && a.samples.some((s) => s.rssi != null)) {
        const s = a.samples; for (let i = 1; i < s.length; i++) L.polyline([[s[i - 1].lat, s[i - 1].lon], [s[i].lat, s[i].lon]], { color: signalColor(s[i].rssi), weight: on ? 7 : 5, opacity: 0.95, dashArray: s[i].seen === false ? '2 6' : undefined, interactive: false }).addTo(g);
      }
      L.polyline(l.pts.map((q) => [q.lat, q.lon] as [number, number]), { color: l.color ?? '#7b1fa2', weight: on ? 3 : 2, opacity: 0.9, dashArray: a?.samples.some((s) => s.rssi != null) ? '1 8' : undefined })
        .on('click', (e) => { L.DomEvent.stopPropagation(e); setSel(l.id); }).bindTooltip(l.name, { sticky: true }).addTo(g);
      a?.ends?.obs.forEach((o) => L.circleMarker([o.lat, o.lon], { radius: 7, color: '#fff', weight: 2, fillColor: o.kind === 'blocks' ? '#d50000' : '#ff8f00', fillOpacity: 1 })
        .bindTooltip(o.kind === 'blocks' ? `Blocks the line: ground ${u.len(o.byM, 0)} above the beam` : `Inside the Fresnel zone (${Math.round(o.clearancePct)}% clear)`).addTo(g));
    }
    if (cur && edit && active) {
      cur.pts.forEach((q, i) => {
        const m = L.marker([q.lat, q.lon], { draggable: true, icon: L.divIcon({ className: 'line-handle' + (selPt === i ? ' on' : ''), html: '', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(g);
        m.on('dragend', () => { const ll = m.getLatLng(); setLines((x) => x.map((l) => (l.id === cur.id ? moveVertex(l, i, { lat: ll.lat, lon: ll.lng }) : l))); });
        m.on('click', () => setSelPt(i));
      });
      cur.pts.slice(1).forEach((b, i) => {
        const a = cur.pts[i];
        const m = L.marker([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2], { draggable: true, icon: L.divIcon({ className: 'line-handle mid', html: '', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(g);
        m.on('dragend', () => { const ll = m.getLatLng(); setLines((x) => x.map((l) => (l.id === cur.id ? insertVertex(l, i, { lat: ll.lat, lon: ll.lng }) : l))); });
      });
    }
    if (draft.length) L.polyline(draft.map((q) => [q.lat, q.lon] as [number, number]), { color: '#ef6c00', weight: 4, dashArray: tool === 'straight' ? '6 4' : undefined, interactive: false }).addTo(g);
    if (tool === 'straight') draft.forEach((q) => L.circleMarker([q.lat, q.lon], { radius: 5, color: '#fff', weight: 2, fillColor: '#ef6c00', fillOpacity: 1, interactive: false }).addTo(g));
  }, [map, lines, res, sel, edit, selPt, draft, tool, active, u.unit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { try { layer.current?.remove(); heatLayer.current?.remove(); hoverM.current?.remove(); } catch { /* map already closed */ } }, []);

  // hover on the chart shows the spot on the map
  useEffect(() => {
    if (!map) return; hoverM.current?.remove(); hoverM.current = null;
    if (hover) hoverM.current = L.circleMarker([hover.lat, hover.lon], { radius: 8, color: '#000', weight: 2, fillColor: '#ffeb3b', fillOpacity: 1, interactive: false }).addTo(map);
  }, [hover, map]);

  // heat map: predicted signal over the area around the lines
  useEffect(() => {
    heatLayer.current?.remove(); heatLayer.current = null;
    if (!map || !heat || !cov || !area || !dem) return;
    let alive = true;
    computeCoverageAsync({ ...cov, dem, radiusKm: 1e6, gridN: 70, bounds: area }).then((c) => {
      if (!alive) return;
      heatLayer.current?.remove();
      heatLayer.current = L.imageOverlay(coverageCanvas(c, -125), [[c.south, c.west], [c.north, c.east]], { opacity: 0.6, interactive: false }).addTo(map);
    });
    return () => { alive = false; };
  }, [heat, map, areaKey, dem, cov]); // eslint-disable-line react-hooks/exhaustive-deps

  // drawing: freehand (press and drag) or straight (tap points)
  useEffect(() => {
    if (!map || !active || !tool) return;
    const el = map.getContainer(); const pts: LatLon[] = []; let down = false;
    const ll = (e: PointerEvent) => { const q = map.mouseEventToLatLng(e as unknown as MouseEvent); return { lat: q.lat, lon: q.lng }; };
    if (tool === 'free') {
      map.dragging.disable(); el.style.touchAction = 'none'; el.classList.add('drawing');
      const pd = (e: PointerEvent) => { if ((e.target as HTMLElement).closest('.leaflet-control')) return; down = true; pts.length = 0; pts.push(ll(e)); el.setPointerCapture?.(e.pointerId); setDraft([...pts]); e.preventDefault(); };
      const pm = (e: PointerEvent) => { if (!down) return; const q = ll(e), last = pts[pts.length - 1]; const px = map.latLngToContainerPoint([q.lat, q.lon]).distanceTo(map.latLngToContainerPoint([last.lat, last.lon])); if (px > 4) { pts.push(q); setDraft([...pts]); } };
      const pu = () => {
        if (!down) return; down = false;
        const simple = simplifyLine(pts, Math.max(5, 2 * 156543 * Math.cos((map.getCenter().lat * Math.PI) / 180) / 2 ** map.getZoom()));
        if (simple.length >= 2) { const id = uid(); setLines((x) => [...x, { id, name: `Line ${x.length + 1}`, mode: 'free', pts: simple, color: COLORS[x.length % COLORS.length] }]); setSel(id); }
        setDraft([]);
      };
      el.addEventListener('pointerdown', pd); el.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
      return () => { el.removeEventListener('pointerdown', pd); el.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); map.dragging.enable(); el.style.touchAction = ''; el.classList.remove('drawing'); };
    }
    const click = (e: L.LeafletMouseEvent) => setDraft((x) => [...x, { lat: e.latlng.lat, lon: e.latlng.lng }]);
    map.on('click', click); el.classList.add('drawing');
    return () => { map.off('click', click); el.classList.remove('drawing'); };
  }, [map, active, tool]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishStraight = () => {
    if (draft.length >= 2) { const id = uid(); setLines((x) => [...x, { id, name: `Line ${x.length + 1}`, mode: 'straight', pts: draft, endAglM: 10, color: COLORS[x.length % COLORS.length] }]); setSel(id); }
    setDraft([]); setTool(null);
  };
  const tx = p.sites.find((s) => s.id === p.radio.txSiteId) ?? p.sites[0], rx = p.sites.find((s) => s.id === p.radio.rxSiteId && s.id !== tx?.id);
  const addSiteLine = () => {
    if (!tx || !rx) return; const id = uid();
    setLines((x) => [...x, { id, name: `${tx.name} → ${rx.name}`, mode: 'straight', pts: [{ lat: tx.lat, lon: tx.lon }, { lat: rx.lat, lon: rx.lon }], endAglM: Math.min(tx.antennaAglM, rx.antennaAglM), color: COLORS[x.length % COLORS.length] }]); setSel(id);
  };
  const upd = (f: (l: DrawnLine) => DrawnLine) => cur && setLines((x) => x.map((l) => (l.id === cur.id ? f(l) : l)));

  if (!active) return null;
  const result = cur && r ? <div className="route-result">
        <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
          <input aria-label="Line name" value={cur.name} onChange={(e) => upd((l) => ({ ...l, name: e.target.value }))} style={{ maxWidth: 220 }} />
          <button className={edit ? 'primary' : ''} aria-pressed={edit} onClick={() => { setEdit(!edit); setTool(null); setSelPt(null); }}>✏️ {edit ? 'Stop editing' : 'Edit points'}</button>
          {edit && selPt != null && cur.pts.length > 2 && <button onClick={() => { upd((l) => removeVertex(l, selPt)); setSelPt(null); }}>Delete point {selPt + 1}</button>}
          {cur.mode === 'free' && <button onClick={() => upd((l) => ({ ...l, pts: simplifyLine(l.pts, 40) }))} title="Fewer points, easier to edit">Smooth</button>}
          {cur.mode === 'straight' && cur.pts.length === 2 && <span className="row small" style={{ gap: 4 }}>Antenna at ends <Num value={cur.endAglM ?? 10} unit="m" onChange={(v) => upd((l) => ({ ...l, endAglM: Math.max(0, v ?? 0) }))} /></span>}
          <button onClick={() => { setLines((x) => x.filter((l) => l.id !== cur.id)); setSel(null); setEdit(false); }}>🗑 Delete line</button>
        </div>
        {edit && <p className="small muted" style={{ margin: '4px 0' }}>Drag the round handles to move points. Drag a small middle handle to add a point. Tap a handle, then Delete point to remove it.</p>}
        <ul className="small route-stats">
          <li>Length <b>{u.f(r.lengthKm)}</b>{r.legs.length === 1 ? <> · azimuth <b>{fmtAz(r.legs[0].fwd, r.legs[0].decA)}</b>, back {fmtAz(r.legs[0].back, r.legs[0].decB)}</> : r.legs.length > 1 ? <> · {r.legs.length} pieces</> : null} <Tip text={AZ_TIP} /></li>
          {r.avgRssi != null && <li>Predicted signal from {cov?.site && 'name' in cov.site ? (cov.site as { name: string }).name : 'the transmitter'}: lowest <b style={{ color: signalColor(r.minRssi) }}>{Math.round(r.minRssi!)} dBm</b>, average {Math.round(r.avgRssi)} dBm, <b>{Math.round(r.pctAbove ?? 0)}%</b> of the line at or above the {Math.round(thr)} dBm needed</li>}
          {r.hiddenKm != null && <li>{r.hiddenKm > 0.005 ? <span style={{ color: '#c62828' }}>{u.f(r.hiddenKm)} of the line is hidden from the transmitter by terrain (shaded red below, dotted on the map)</span> : <span style={{ color: '#2e7d32' }}>The transmitter can see the whole line</span>}</li>}
          {r.ends && <li>End to end: {r.ends.an.meets60 ? <span style={{ color: '#2e7d32' }}>✓ clear line of sight ({Math.round(r.ends.an.minClearancePct)}% of the Fresnel zone clear)</span>
            : r.ends.an.los ? <span style={{ color: '#e65100' }}>⚠ line of sight, but only {Math.round(r.ends.an.minClearancePct)}% of the Fresnel zone is clear</span>
            : <span style={{ color: '#c62828' }}>✗ blocked: ground {u.len(r.ends.obs[0]?.byM ?? 0, 0)} above the beam {u.f(r.ends.obs[0]?.dKm ?? 0)} from the start (red dot on the map)</span>}</li>}
          {r.legs.length > 1 && r.legs.length <= 8 && <li>Pieces: {r.legs.map((z, i) => <span key={i}>{i ? '; ' : ''}{i + 1}: {u.f(z.km)} at {fmtAz(z.fwd, z.decA, 0)}</span>)}</li>}
        </ul>
        <LineChart r={r} thr={thr} onHover={setHover} />
        <p className="small muted" style={{ margin: 0 }}>Brown = ground. Colored line = predicted signal (same colors as Coverage). Red shading = the transmitter can't see that stretch. Dashed line = signal needed. Predictions are estimates; confirm with a drive test.</p>
      </div> : null;
  return (<>
    <div className="route-panel note">
      <div className="row wrap" style={{ gap: 6 }}>
        <b>Draw lines</b>
        <button className={tool === 'free' ? 'primary' : ''} aria-pressed={tool === 'free'} onClick={() => { setTool(tool === 'free' ? null : 'free'); setDraft([]); setEdit(false); }}>✍️ Draw by hand</button>
        <button className={tool === 'straight' ? 'primary' : ''} aria-pressed={tool === 'straight'} onClick={() => { setTool(tool === 'straight' ? null : 'straight'); setDraft([]); setEdit(false); }}>📍 Tap points (straight)</button>
        {tx && rx && <button onClick={addSiteLine} title="Add the straight line between the transmit and receive sites">🔗 Line between {tx.name} and {rx.name}</button>}
        <label className="small"><input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} disabled={!cov || !lines.length} /> Signal heat map around the lines</label>
        <button onClick={() => { setTool(null); setDraft([]); setEdit(false); onClose(); }}>Done</button>
      </div>
      {tool === 'free' && <p className="small" style={{ margin: '4px 0' }}>Press and drag on the map with your finger or mouse to draw a line. Lift to finish. The map stays still while this is on.</p>}
      {tool === 'straight' && <p className="small row wrap" style={{ margin: '4px 0', gap: 6 }}>Tap the map to add points ({draft.length} so far).
        <button className="primary" disabled={draft.length < 2} onClick={finishStraight}>✓ Finish line</button>{draft.length > 0 && <button onClick={() => setDraft((x) => x.slice(0, -1))}>↶ Undo point</button>}</p>}
      {!cov && <p className="small muted" style={{ margin: '4px 0' }}>Set a transmit site and radio on Equipment &amp; Link Budget to see predicted signal along the lines. Terrain and line of sight work without it.</p>}
      {note && <p className="small muted" style={{ margin: '4px 0' }}>{note}</p>}
      {lines.length > 0 && <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
        {lines.map((l) => <button key={l.id} className={l.id === sel ? 'primary' : ''} onClick={() => { setSel(l.id); setSelPt(null); }}><span style={{ color: l.id === sel ? undefined : l.color }}>━</span> {l.name}</button>)}
      </div>}
    </div>
    {result && (resultsEl ? createPortal(<div className="route-panel note">{result}</div>, resultsEl) : result)}
  </>);
}
