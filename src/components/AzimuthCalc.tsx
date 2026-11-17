// Full azimuth calculator: two points (GPS or address) → true + magnetic azimuth both ways, distance, and
// up/down tilt from the antenna heights. Works offline (built-in WMM2025 + built-in / project terrain).
import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useUnits } from '../units';
import { Num, Tip } from './ui';
import { AddressInput } from './AddressInput';
import { AZ_TIP } from './Azimuth';
import { CalcActions } from './CalcKit';
import { parseLatLon } from '../engine/locparse';
import { geocodeAddress } from '../engine/geocode';
import { sampleDem } from '../engine/terrain';
import { bundledDem } from '../engine/bundledTerrain';
import { usgsPointElevation } from '../engine/autoterrain';
import { fmtDeg, fmtDecl, compassPoint } from '../engine/azimuth';
import { azimuthCalc, azimuthTargets, tiltText, pos, type AzPoint, type AzInputs } from '../engine/azcalc';
import { ddToDms } from '../engine/calcs';
import type { LatLon } from '../engine/geo';
import type { Project } from '../types';

/** Ground height (m) at a point: project terrain, then built-in Asheville terrain, then (online only) USGS. */
async function groundAt(q: LatLon, projectDem: Parameters<typeof sampleDem>[0] | null, online: boolean): Promise<{ m: number; src: string } | null> {
  if (projectDem) { const v = sampleDem(projectDem, q); if (v != null) return { m: v, src: 'project terrain' }; }
  const b = await bundledDem(); if (b) { const v = sampleDem(b, q); if (v != null) return { m: v, src: 'built-in terrain' }; }
  if (online) { try { return { m: await usgsPointElevation(q), src: 'USGS (online)' }; } catch { /* offline or no data */ } }
  return null;
}

function PointIn({ name, text, setText, pt, setPt, msg, setMsg }: { name: string; text: string; setText: (s: string) => void; pt: AzPoint | null; setPt: (p: AzPoint | null) => void; msg: string; setMsg: (s: string) => void }) {
  const { project: p } = useStore();
  const find = async () => {
    const ll = parseLatLon(text); if (ll) { setPt({ ...ll, label: `Point ${name}` }); setMsg(''); return; }
    if (!text.trim()) { setPt(null); return; }
    try { const [g] = await geocodeAddress(text); if (g) { setPt({ lat: g.lat, lon: g.lon, label: g.label }); setMsg(''); } else setMsg('Not found. Type GPS coordinates like 35.6012, -82.5540.'); }
    catch { setMsg('Offline: type GPS coordinates like 35.6012, -82.5540, or pick a project site.'); }
  };
  return (
    <div className="az-point">
      <span className="field-label">Point {name} {name === 'A' ? '(the antenna you are aiming)' : '(what it aims at)'}</span>
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <span style={{ flex: '1 1 200px', minWidth: 170 }}><AddressInput value={text} onChange={(s) => { setText(s); const ll = parseLatLon(s); if (ll) { setPt({ ...ll, label: `Point ${name}` }); setMsg(''); } }} ariaLabel={`Point ${name} GPS or address`} placeholder="GPS (35.5951, -82.5515) or address" onPick={(g) => { setPt({ lat: g.lat, lon: g.lon, label: g.label }); setMsg(''); }} /></span>
        <button className="small" onClick={find}>Find</button>
        {p.sites.length > 0 && <select aria-label={`Use a project site as point ${name}`} value="" onChange={(e) => { const s = p.sites.find((x) => x.id === e.target.value); if (s) { setPt({ lat: s.lat, lon: s.lon, label: s.name, siteId: s.id }); setText(`${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`); setMsg(''); } }}>
          <option value="">Use a project site…</option>{p.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      </div>
      {pt ? <span className="small muted">{pt.siteId ? `Site “${pt.label}”` : pt.label}: {ddToDms(pt.lat, 'N', 'S')}, {ddToDms(pt.lon, 'E', 'W')}</span> : !msg && <span className="small bad-text">Type a position or address.</span>}
      {msg && <span className="small bad-text">{msg}</span>}
    </div>
  );
}

function Heights({ n, g, setG, src, setSrc, ant, setAnt, q, online, onLook }: { n: string; g: number | null; setG: (v: number | null) => void; src: string; setSrc: (s: string) => void; ant: number | null; setAnt: (v: number | null) => void; q: AzPoint | null; online: boolean; onLook: () => void }) {
  return (
    <div className="form">
      <label className="field"><span className="field-label">Ground at {n} (above sea level)</span><Num value={g} nullable onChange={(v) => { setG(v); setSrc('typed'); }} unit="m" />
        <span className="small muted">{src}{q && online && <> · <button className="ghost small" onClick={onLook}>Look up</button></>}</span></label>
      <label className="field"><span className="field-label">Antenna height at {n} (above ground)</span><Num value={ant} nullable onChange={setAnt} unit="m" /></label>
    </div>
  );
}

const START_A = '35.5951, -82.5515', START_B = '35.6400, -82.4800';
const startPt = (s: string, n: string): AzPoint | null => { const ll = parseLatLon(s); return ll ? { ...ll, label: `Point ${n}` } : null; };

/** The calculator body. Remount it (change its key) to reset it. */
export function AzimuthCalc() {
  const { project: p, rt } = useStore();
  const u = useUnits();
  const [aText, setAText] = useState(START_A), [bText, setBText] = useState(START_B);
  const [a, setA] = useState<AzPoint | null>(() => startPt(START_A, 'A')), [b, setB] = useState<AzPoint | null>(() => startPt(START_B, 'B'));
  const [aMsg, setAMsg] = useState(''), [bMsg, setBMsg] = useState('');
  const [aAnt, setAAnt] = useState<number | null>(30.48), [bAnt, setBAnt] = useState<number | null>(9.144);
  const [aG, setAG] = useState<number | null>(null), [bG, setBG] = useState<number | null>(null);
  const [aSrc, setASrc] = useState(''), [bSrc, setBSrc] = useState('');
  const [k, setK] = useState<number | null>(4 / 3);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  // Ground heights fill in by themselves (offline from terrain first); typing your own replaces them.
  const look = (q: AzPoint | null, set: (v: number | null) => void, setSrc: (s: string) => void, net: boolean) => {
    if (!q) return; let live = true;
    groundAt(q, rt.dem, net).then((g) => { if (!live) return; if (g) { set(Math.round(g.m * 10) / 10); setSrc(g.src); } else setSrc(net ? 'not found: type it' : 'no terrain here offline: type it or press Look up'); });
    return () => { live = false; };
  };
  useEffect(() => look(a, setAG, setASrc, false), [a?.lat, a?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => look(b, setBG, setBSrc, false), [b?.lat, b?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const x: AzInputs = { a, b, aGroundM: aG, bGroundM: bG, aAntM: aAnt, bAntM: bAnt, k: k && k > 0 ? k : 4 / 3 };
  const res = azimuthCalc(x);
  const useProject = (q: Project) => {
    const tx = q.sites.find((s) => s.id === q.radio.txSiteId) ?? q.sites[0], rx = q.sites.find((s) => s.id === q.radio.rxSiteId && s !== tx) ?? q.sites.find((s) => s !== tx);
    if (tx) { setA({ lat: tx.lat, lon: tx.lon, label: tx.name, siteId: tx.id }); setAText(pos(tx)); setAAnt(tx.antennaAglM); if (tx.groundElevM != null) { setAG(tx.groundElevM); setASrc('site data'); } }
    if (rx) { setB({ lat: rx.lat, lon: rx.lon, label: rx.name, siteId: rx.id }); setBText(pos(rx)); setBAnt(rx.antennaAglM); if (rx.groundElevM != null) { setBG(rx.groundElevM); setBSrc('site data'); } }
    else if (q.erces.donorLat != null && q.erces.donorLon != null) { const d = { lat: q.erces.donorLat, lon: q.erces.donorLon }; setB({ ...d, label: q.erces.donorName || 'Donor tower' }); setBText(pos(d)); }
    setK(q.radio.kFactor);
  };
  return (
    <div className="az-calc">
      <PointIn name="A" text={aText} setText={setAText} pt={a} setPt={setA} msg={aMsg} setMsg={setAMsg} />
      <Heights n="A" g={aG} setG={setAG} src={aSrc} setSrc={setASrc} ant={aAnt} setAnt={setAAnt} q={a} online={online} onLook={() => look(a, setAG, setASrc, true)} />
      <PointIn name="B" text={bText} setText={setBText} pt={b} setPt={setB} msg={bMsg} setMsg={setBMsg} />
      <Heights n="B" g={bG} setG={setBG} src={bSrc} setSrc={setBSrc} ant={bAnt} setAnt={setBAnt} q={b} online={online} onLook={() => look(b, setBG, setBSrc, true)} />
      <div className="form"><label className="field"><span className="field-label">k-factor (earth curve) <Tip text="4/3 is the standard atmosphere for radio paths. Leave it unless your engineer says otherwise." /></span><Num value={k} step={0.01} onChange={setK} /></label></div>
      {res ? <div className="az-results" data-az-results>
        <div className="calc-out"><span>Distance</span><b>{u.f(res.z.km, 3)}</b></div>
        <div className="calc-out big"><span>Azimuth A → B <Tip text={AZ_TIP} /></span><b>{fmtDeg(res.z.fwd)}°T · {fmtDeg(res.z.fwdMag)}°M {compassPoint(res.z.fwd)}</b></div>
        <div className="calc-out"><span>Back azimuth B → A</span><b>{fmtDeg(res.z.back)}°T · {fmtDeg(res.z.backMag)}°M {compassPoint(res.z.back)}</b></div>
        <div className="calc-out"><span>Declination at A / B (NOAA WMM)</span><b>{fmtDecl(res.z.decA)} / {fmtDecl(res.z.decB)}</b></div>
        {res.tiltA != null && res.tiltB != null ? <>
          <div className="calc-out"><span>Tilt at A toward B</span><b>{tiltText(res.tiltA)}</b></div>
          <div className="calc-out"><span>Tilt at B toward A</span><b>{tiltText(res.tiltB)}</b></div>
          <div className="calc-out"><span>Antenna A / B above sea level</span><b>{u.len(res.aAmsl)} / {u.len(res.bAmsl)}</b></div>
        </> : <p className="small muted">Enter both ground heights to get the up / down tilt.</p>}
        <p className="small">🧭 Aim A at <b>{fmtDeg(res.z.fwd)}°T</b> with a GPS alignment tool, or <b>{fmtDeg(res.z.fwdMag)}°M</b> on a compass{res.tiltA != null ? <>, tilted <b>{tiltText(res.tiltA)}</b></> : ''}. Aim B back at <b>{fmtDeg(res.z.back)}°T</b> ({fmtDeg(res.z.backMag)}°M){res.tiltB != null ? <>, tilted <b>{tiltText(res.tiltB)}</b></> : ''}.</p>
        <p className="small muted">Tilt is the straight line between the antennas with the earth's curve; hills between them are not checked here (use Path Profile for that). Hold a compass away from steel, vehicles and power lines.</p>
      </div> : <p className="small bad-text">Enter two different points.</p>}
      <CalcActions fromProject={useProject} apply={() => (res ? azimuthTargets(p, x, res) : [])} applyWhat="the azimuth and tilt" />
    </div>
  );
}
