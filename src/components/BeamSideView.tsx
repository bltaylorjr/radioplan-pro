// Tilt, Azimuth & Power: the beam seen from the side over the real ground along the antenna's azimuth, drawn
// true to scale (1 ft across = 1 ft up) or with heights stretched, with scale bars, plus a 3D view of the beam.
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useUnits } from '../units';
import { designLink } from '../engine/design';
import { primaryCoverageInputs } from '../engine/network';
import { predictPoint } from '../engine/coverage';
import { beamProfile, niceLen, curveDropM, type BeamProfile } from '../engine/beam';
import { ScaleSelect, ScaleBars, frameFor } from './scale';
import { loadAreaDem, boundsOf } from '../engine/areaTerrain';
import { haversineKm, bearingDeg } from '../engine/geo';
import { signalColor } from './RouteTools';
import type { DemGrid } from '../engine/terrain';
import { loadChunk } from '../engine/chunkload';

const BeamView3D = lazy(() => loadChunk(() => import('./BeamView3D')));
const LS = 'radioplan.beamview';
const load = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') as { mode?: '2d' | '3d'; ex?: number; km?: number }; } catch { return {}; } };

export function BeamSideView() {
  const { project: p, rt } = useStore();
  const u = useUnits();
  const r = p.radio, L = designLink(p), tx = L.tx;
  const h = tx?.antennaAglM ?? 30, vbw = L.ant?.vBwDeg ?? 10, hbw = L.ant?.hBwDeg ?? 360, tilt = r.mechTiltDeg + r.elecTiltDeg;
  const saved = useMemo(load, []);
  const [mode, setModeS] = useState<'2d' | '3d'>(saved.mode ?? '2d');
  const [ex, setExS] = useState<number>(saved.ex ?? 0); // 0 = automatic stretch, 1 = true scale
  const [kmSel, setKmS] = useState<number>(saved.km ?? 0); // 0 = automatic distance
  const keep = (o: object) => { try { localStorage.setItem(LS, JSON.stringify({ mode, ex, km: kmSel, ...o })); } catch { /* private mode */ } };
  const setMode = (m: '2d' | '3d') => { setModeS(m); keep({ mode: m }); };
  const setEx = (v: number) => { setExS(v); keep({ ex: v }); };
  const setKm = (v: number) => { setKmS(v); keep({ km: v }); };

  // terrain around the tower (out to 40 km at most)
  const reach = Math.min(40, Math.max(3, L.rangeKm * 1.6));
  const [dem, setDem] = useState<DemGrid | null>(null); const [note, setNote] = useState('');
  useEffect(() => {
    if (!tx) return; let live = true; const b = boundsOf([tx], reach)!;
    loadAreaDem(b, rt.dem).then((x) => { if (live) { setDem(x.dem); setNote(x.note); } });
    return () => { live = false; };
  }, [tx?.lat, tx?.lon, reach, rt.dem]); // eslint-disable-line react-hooks/exhaustive-deps

  const full = useMemo<BeamProfile | null>(() => tx ? beamProfile(dem, tx, { azimuthDeg: r.azimuthDeg, tiltDeg: tilt, vBwDeg: vbw, aglM: h, maxKm: reach, k: r.kFactor, groundM: tx.groundElevM ?? 0, n: 400 }) : null,
    [dem, tx?.lat, tx?.lon, r.azimuthDeg, tilt, vbw, h, reach, r.kFactor]); // eslint-disable-line react-hooks/exhaustive-deps
  const autoKm = useMemo(() => {
    if (!full) return 2; const far = full.upper.hitKm ?? full.main.hitKm ?? L.rangeKm;
    return Math.min(reach, Math.max(0.3, far * 1.25, (full.lower.hitKm ?? 0) * 2));
  }, [full, L.rangeKm, reach]);
  const D = kmSel > 0 ? Math.min(kmSel, reach) : autoKm;
  const cov = useMemo(() => primaryCoverageInputs(p, dem), [p, dem]);
  if (!tx || !full) return <p className="muted">Add a transmit site first (Site Data &amp; GPS).</p>;

  const view = beamProfile(dem, tx, { azimuthDeg: r.azimuthDeg, tiltDeg: tilt, vBwDeg: vbw, aglM: h, maxKm: D, k: r.kFactor, groundM: tx.groundElevM ?? 0, n: 300 });
  const s = view.samples;
  const rssi = cov ? s.map((q) => { const v = predictPoint({ ...cov, radiusKm: 1e6 }, q); return Number.isFinite(v) ? v : null; }) : null;

  // ---- 2D drawing: metres per pixel across, and up (stretched by `E`)
  const W = 760, padL = 56, padR = 18, padT = 14, padB = 46, pw = W - padL - padR;
  const lo = Math.min(...s.map((q) => q.plotM)), hi = Math.max(full.antennaM, ...s.map((q) => q.plotM));
  const f = frameFor({ km: D, plotW: pw, lo, hi, ex, autoH: 240, minH: 120, maxH: 420, focusM: full.antennaM });
  const { E, ph, yHi, mPerPx, mPerPxV } = f;
  const H = padT + ph + padB;
  const autoE = frameFor({ km: D, plotW: pw, lo, hi, ex: 0, autoH: 240 }).E;
  const X = (dKm: number) => padL + (dKm * 1000) / mPerPx, Y = (m: number) => padT + (yHi - m) / mPerPxV;
  const groundPath = `M${X(0)},${H - padB} ` + s.map((q) => `L${X(q.dKm).toFixed(1)},${Math.min(H - padB, Y(q.plotM)).toFixed(1)}`).join(' ') + ` L${X(s[s.length - 1].dKm)},${H - padB} Z`;
  const ant = { x: X(0), y: Y(full.antennaM) };
  const end = (deg: number, hit: number | null) => { const d = hit != null && hit <= D ? hit : D; return { x: X(d), y: Y(full.antennaM - d * 1000 * Math.tan((deg * Math.PI) / 180)), d, hit: hit != null && hit <= D }; };
  // lit wedge: many rays across the vertical beamwidth, each stopped where it meets the ground
  const fan: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) { const deg = tilt - vbw / 2 + (vbw * i) / 40; const t = Math.tan((deg * Math.PI) / 180); let hit: number | null = null;
    for (let j = 1; j < s.length; j++) if (full.antennaM - s[j].dKm * 1000 * t <= s[j].plotM) { hit = s[j].dKm; break; }
    fan.push(end(deg, hit)); }
  const mainE = end(tilt, full.main.hitKm), upE = end(tilt - vbw / 2, full.upper.hitKm), loE = end(tilt + vbw / 2, full.lower.hitKm);
  const rx = L.rx && L.rx !== tx ? L.rx : null;
  const rxOn = rx && (() => { const d = haversineKm(tx, rx); const off = Math.abs((((bearingDeg(tx, rx) - r.azimuthDeg) % 360) + 540) % 360 - 180); return d <= D && off <= Math.max(15, hbw / 2) ? d : null; })();
  const rxG = rxOn != null ? (s.reduce((b, q) => (Math.abs(q.dKm - rxOn) < Math.abs(b.dKm - rxOn) ? q : b), s[0]).plotM) : 0;
  const tickU = niceLen(u.d(D) / 5);

  return (
    <div className="beam-view">
      <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
        <span className="seg"><button className={mode === '2d' ? 'primary' : ''} aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>📐 2D side view</button>
          <button className={mode === '3d' ? 'primary' : ''} aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>⛰ 3D view</button></span>
<ScaleSelect value={ex} onChange={setEx} autoEx={mode === '2d' ? autoE : undefined} />
        <label className="small row" style={{ gap: 4 }}>Distance shown
          <select aria-label="Distance shown" value={kmSel} onChange={(e) => setKm(+e.target.value)}>
            <option value={0}>Automatic ({u.f(autoKm, 1)})</option>
            {[0.25, 0.5, 1, 2, 3, 5, 10, 15, 25].map((v) => u.toKm(v)).filter((k) => k <= reach + 1e-9).map((k) => <option key={k} value={k}>{u.f(k, k < 1 ? 2 : 0)}</option>)}
          </select></label>
      </div>
      {mode === '2d' ? <>
        <svg viewBox={`0 0 ${W} ${H}`} className="chart beam-svg" role="img" aria-label="Side view of the antenna beam over the ground">
          <defs><clipPath id="bv-clip"><rect x={padL} y={padT} width={pw} height={ph} /></clipPath>
            <linearGradient id="bv-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e3f2fd" /><stop offset="1" stopColor="#f5fbff" /></linearGradient></defs>
          <rect x={padL} y={padT} width={pw} height={ph} fill="url(#bv-sky)" />
          <g clipPath="url(#bv-clip)">
            <polygon points={[ant, ...fan].map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')} fill="#43a047" opacity={0.22} />
            <path d={groundPath} fill="#a1887f" stroke="#5d4037" strokeWidth={1} />
            {rssi && s.slice(1).map((q, i) => rssi[i + 1] != null && <line key={i} x1={X(s[i].dKm)} y1={Y(s[i].plotM)} x2={X(q.dKm)} y2={Y(q.plotM)} stroke={signalColor(rssi[i + 1])} strokeWidth={4} />)}
            <line x1={ant.x} y1={Y(full.groundAtTowerM)} x2={ant.x} y2={ant.y} stroke="#c62828" strokeWidth={3} />
            <circle cx={ant.x} cy={ant.y} r={4} fill="#c62828" />
            <line x1={ant.x} y1={ant.y} x2={upE.x} y2={upE.y} stroke="#2e7d32" strokeDasharray="6 4" strokeWidth={1.5} />
            <line x1={ant.x} y1={ant.y} x2={loE.x} y2={loE.y} stroke="#2e7d32" strokeDasharray="6 4" strokeWidth={1.5} />
            <line x1={ant.x} y1={ant.y} x2={mainE.x} y2={mainE.y} stroke="#1b5e20" strokeWidth={2.5} />
            {rxOn != null && <><line x1={X(rxOn)} x2={X(rxOn)} y1={Y(rxG)} y2={Y(rxG + (rx!.antennaAglM ?? 0))} stroke="#1565c0" strokeWidth={3} /><circle cx={X(rxOn)} cy={Y(rxG + (rx!.antennaAglM ?? 0))} r={4} fill="#1565c0" /></>}
            {[mainE, upE, loE].map((q, i) => q.hit && <circle key={i} cx={q.x} cy={q.y} r={i ? 3.5 : 5} fill={i ? '#fff' : '#ffeb3b'} stroke="#1b5e20" strokeWidth={1.5} />)}
          </g>
          <rect x={padL} y={padT} width={pw} height={ph} fill="none" stroke="#90a4ae" />
          {mainE.hit && <text x={Math.min(mainE.x, W - padR - 4)} y={Math.max(padT + 12, mainE.y - 10)} textAnchor={mainE.x > W - 160 ? 'end' : 'middle'} className="beam-lbl">main beam {u.f(mainE.d, 2)}</text>}
          {rxOn != null && <text x={X(rxOn)} y={Math.max(padT + 24, Y(rxG + (rx!.antennaAglM ?? 0)) - 8)} textAnchor="middle" className="beam-lbl" fill="#1565c0">{rx!.name}</text>}
          <text x={ant.x + 6} y={Math.max(padT + 12, ant.y - 6)} className="beam-lbl" fill="#c62828">{tx.name} · {u.len(h, 0)}</text>
          {Array.from({ length: Math.floor(u.d(D) / tickU + 1e-6) + 1 }, (_, i) => i * tickU).map((v) => <text key={v} x={X(u.toKm(v))} y={padT + ph + 14} textAnchor="middle" className="beam-tick">{+v.toFixed(3)}{v === 0 ? ` ${u.unit}` : ''}</text>)}
          <ScaleBars f={f} x={padL + 8} y={H - 14} xNote={W - padR} vx={padL - 40} vy={padT + ph} maxW={pw / 2} />
        </svg>
        <p className="small muted" style={{ margin: '4px 0' }}>Looking along azimuth {Math.round(r.azimuthDeg)}°T from {tx.name}, with the real ground and earth curve. Dark green = main beam, dashed = −3 dB edges, light green = ground the beam reaches. {rssi ? 'Ground colored by predicted signal (same colors as Coverage).' : ''} {note}</p>
        <ul className="small" style={{ margin: 0 }}>
          <li>Main beam meets the ground: <b>{full.main.hitKm != null ? u.f(full.main.hitKm) : 'never (pointed at or above the horizon)'}</b></li>
          <li>−3 dB edges meet the ground: inner <b>{full.lower.hitKm != null ? u.f(full.lower.hitKm) : '—'}</b>, outer <b>{full.upper.hitKm != null ? u.f(full.upper.hitKm) : 'never (above the horizon)'}</b>{tilt > 0 && h / Math.tan((tilt * Math.PI) / 180) / 1000 < L.rangeKm * 0.5 ? <span style={{ color: '#e65100' }}> · the beam lands well inside the cell edge ({u.f(L.rangeKm)}): consider less tilt</span> : null}</li>
          <li>Earth curve drop at {u.f(D, 1)}: {u.len(curveDropM(D, r.kFactor), 0)} (k = {r.kFactor.toFixed(2)})</li>
        </ul>
      </> : <Suspense fallback={<div className="three empty" style={{ height: 420 }}>Loading 3D view…</div>}>
        <BeamView3D dem={dem} sites={p.sites} txId={tx.id} rxId={rx?.id} fMHz={r.fMHz} kFactor={r.kFactor} clutterM={r.clutterM} exag={ex > 0 ? ex : 2}
          beam={{ lat: tx.lat, lon: tx.lon, aglM: h, azimuthDeg: r.azimuthDeg, tiltDeg: tilt, hBwDeg: hbw, vBwDeg: vbw, maxKm: D }} km={D} cov={cov} fmtLen={(m) => u.len(m, 0)} fmtDist={(km) => u.f(km)} note={note} />
      </Suspense>}
    </div>
  );
}
