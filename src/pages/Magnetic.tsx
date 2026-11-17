// Magnetic Field & Space Weather (Tools & reference).
// The earth's magnetic field at the project from NOAA's World Magnetic Model (bundled, works offline; a newer model
// downloads by itself), how it changes over the model's five years, a true ↔ compass converter, and NOAA SWPC's
// live geomagnetic storm forecast (kept on the device for offline use).
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Num, Stat } from '../components/ui';
import { useUnits } from '../units';
import { geomag, decimalYear, getMagModel, fmtDecl, fmtDeg, trueToMag, magToTrue, compassPoint } from '../engine/azimuth';
import { downloadSpaceWeather, savedSpaceWeather, onSpaceWeather, kpSummary, kpWord, kpTone, gOfKp, G_WORDS, stormEffects, swpcTime, type SpaceWeather } from '../engine/spaceweather';

const ASHEVILLE = { lat: 35.5951, lon: -82.5515, name: 'Asheville, NC (default)' };
const nt = (v: number) => `${Math.round(v).toLocaleString()} nT`;
/** Declination change per year, in plain words: "0.05° west a year (about 3 minutes)". */
const perYear = (d: number) => `${Math.abs(d).toFixed(2)}° ${d < 0 ? 'west' : 'east'} a year (about ${Math.round(Math.abs(d) * 60)} minute${Math.round(Math.abs(d) * 60) === 1 ? '' : 's'})`;
const ago = (ms: number) => { const m = Math.round(ms / 60000); return m < 2 ? 'just now' : m < 120 ? `${m} minutes ago` : m < 48 * 60 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };

export function MagneticPage() {
  const { project: p } = useStore();
  const u = useUnits();
  const s = p.sites[0];
  const hasSite = !!s && Number.isFinite(s.lat) && (s.lat !== 0 || s.lon !== 0);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [typed, setTyped] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null });
  const [msg, setMsg] = useState('');
  const pt = here ? { ...here, name: 'Where you are now (GPS)' }
    : typed.lat != null && typed.lon != null ? { lat: typed.lat, lon: typed.lon, name: 'GPS point you typed' }
    : hasSite ? { lat: s.lat, lon: s.lon, name: `${s.name || 'Site A'}${p.meta.city ? ` · ${[p.meta.city, p.meta.state].filter(Boolean).join(', ')}` : ''}` } : ASHEVILLE;
  const altKm = !here && typed.lat == null && hasSite && s.groundElevM != null && Number.isFinite(s.groundElevM) ? s.groundElevM / 1000 : 0;

  const model = getMagModel();
  const now = new Date();
  const yr = decimalYear(now);
  const g = useMemo(() => geomag(pt.lat, pt.lon, now, altKm), [pt.lat, pt.lon, altKm, Math.floor(yr * 365)]); // eslint-disable-line react-hooks/exhaustive-deps
  const g1 = useMemo(() => geomag(pt.lat, pt.lon, Math.min(yr + 1, model.epoch + 5), altKm), [pt.lat, pt.lon, altKm, Math.floor(yr * 365)]); // eslint-disable-line react-hooks/exhaustive-deps
  const span = Math.min(yr + 1, model.epoch + 5) - yr || 1;
  const decRate = (g1.decDeg - g.decDeg) / span, dipRate = (g1.dipDeg - g.dipDeg) / span, fRate = (g1.totalNt - g.totalNt) / span;
  const rad = Math.PI / 180, X = g.horizNt * Math.cos(g.decDeg * rad), Y = g.horizNt * Math.sin(g.decDeg * rad), Z = g.horizNt * Math.tan(g.dipDeg * rad);
  const years = useMemo(() => Array.from({ length: 11 }, (_, i) => model.epoch + i / 2).map((y) => ({ y, ...geomag(pt.lat, pt.lon, y, altKm) })), [pt.lat, pt.lon, altKm, model.epoch]);
  const weak = g.horizNt < 6000;

  const locate = () => {
    if (!navigator.geolocation) { setMsg('This device does not share its location.'); return; }
    setMsg('Finding where you are…');
    navigator.geolocation.getCurrentPosition((x) => { setHere({ lat: x.coords.latitude, lon: x.coords.longitude }); setMsg(''); }, (e) => setMsg(`Location not available: ${e.message}`), { enableHighAccuracy: true, timeout: 15000 });
  };

  // True ↔ compass converter.
  const [tDeg, setTDeg] = useState<number | null>(null);
  const [mDeg, setMDeg] = useState<number | null>(null);

  // Space weather.
  const [sw, setSw] = useState<SpaceWeather | null>(null);
  const [swState, setSwState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [swErr, setSwErr] = useState('');
  const refresh = async () => {
    setSwState('loading'); setSwErr('');
    try { setSw(await downloadSpaceWeather()); setSwState('idle'); }
    catch (e) { setSwState('error'); setSwErr((e as Error).message || 'no connection'); }
  };
  useEffect(() => {
    let live = true;
    savedSpaceWeather().then((v) => { if (!live) return; if (v) setSw(v); if (navigator.onLine !== false && (!v || Date.now() - v.fetchedAt > 30 * 60e3)) refresh(); });
    const off = onSpaceWeather((v) => live && setSw(v));
    return () => { live = false; off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid">
      <Card title="Magnetic field here today" className="wide" tour="mag-today" tip={`From NOAA's World Magnetic Model (${model.name}, made by NOAA NCEI and the British Geological Survey). It is built into the app, so it works with no internet. A newer model downloads by itself when NOAA publishes one.`}>
        <p className="small"><b>Place:</b> {pt.name} · GPS {pt.lat.toFixed(4)}, {pt.lon.toFixed(4)}{altKm ? ` · elevation ${u.len(altKm * 1000, 0)}` : ''} · {now.toLocaleDateString()}</p>
        <div className="row wrap">
          <button onClick={locate}>📡 Use where I am now</button>
          {(here || typed.lat != null) && <button onClick={() => { setHere(null); setTyped({ lat: null, lon: null }); }}>↩ Back to {hasSite ? 'the project site' : 'Asheville'}</button>}
          <span className="small muted">or type a GPS point:</span>
          <span className="small">Lat</span><span style={{ width: 120 }}><Num label="Latitude" value={typed.lat} nullable min={-90} max={90} onChange={(v) => { setHere(null); setTyped((t) => ({ ...t, lat: v })); }} /></span>
          <span className="small">Lon</span><span style={{ width: 120 }}><Num label="Longitude" value={typed.lon} nullable min={-180} max={180} onChange={(v) => { setHere(null); setTyped((t) => ({ ...t, lon: v })); }} /></span>
        </div>
        {msg && <p className="small note" role="status">{msg}</p>}
        {!hasSite && !here && typed.lat == null && <p className="small muted">No site position on this project yet, so Asheville is shown. Place Site A on Site Data & GPS to see the job site.</p>}
        <p className="big-answer" style={{ fontSize: '1.15rem', margin: '10px 0' }}>🧭 A compass here points <b>{fmtDecl(g.decDeg)}</b> of true north{Math.abs(g.decDeg) < 0.05 ? ' (almost exactly true north)' : ''}.</p>
        <p className="small">To turn a map (true) bearing into a compass reading, {g.decDeg < 0 ? 'add' : 'subtract'} {Math.abs(g.decDeg).toFixed(1)}°. The difference changes about {perYear(decRate)}.</p>
        <div className="stats">
          <Stat label="Declination (compass vs true north)" value={fmtDecl(g.decDeg)} tip="Also called magnetic variation. West means the compass needle points west of true north. Compass reading = true bearing − declination (east positive)." />
          <Stat label="Change per year" value={`${Math.abs(decRate * 60).toFixed(1)}′ ${decRate < 0 ? 'W' : 'E'}`} unit=" /yr" tip="Minutes of arc per year (60 minutes = 1°)." />
          <Stat label="Dip (inclination)" value={`${g.dipDeg.toFixed(2)}°`} unit={` · ${dipRate >= 0 ? '+' : ''}${(dipRate * 60).toFixed(1)}′/yr`} tip="How steeply the field points down into the ground. Compasses are balanced for this; a compass from another part of the world can drag." />
          <Stat label="Total field strength" value={nt(g.totalNt)} unit={` · ${fRate >= 0 ? '+' : ''}${fRate.toFixed(0)} nT/yr`} tip="nT = nanotesla. Magnetometers and magnetic locators compare against this." />
          <Stat label="Horizontal strength" value={nt(g.horizNt)} tip="The part of the field that turns a compass needle. Below about 6,000 nT (near the magnetic poles) compasses are unreliable." tone={weak ? 'bad' : undefined} />
          <Stat label="North / East / Down" value={`${Math.round(X).toLocaleString()} / ${Math.round(Y).toLocaleString()} / ${Math.round(Z).toLocaleString()}`} unit=" nT" tip="The field split into north (X), east (Y) and straight down (Z) parts." />
        </div>
        {weak && <p className="note req-note">The horizontal field is weak here, so a compass is not reliable. Use GPS for directions.</p>}
        {g.outOfRange && <p className="note req-note">{model.name} covers {model.epoch.toFixed(0)}–{(model.epoch + 5).toFixed(0)}. Connect to the internet once so the newer model downloads; until then the numbers above are estimates.</p>}
        <p className="small muted">Accuracy: about ±0.5° in the continental US. Local iron, rebar, vehicles, steel buildings and power lines can throw a hand compass off much more, so stand clear or use a GPS alignment tool. Compass bearings everywhere in the app (azimuths, aiming, photo survey) use this same model.</p>
      </Card>

      <Card title="How it changes over time" className="wide" tour="mag-predict" tip={`Predicted by ${model.name} for every half year it covers. The magnetic field drifts slowly, so old maps and drawings show an older declination.`}>
        <DeclChart years={years} nowYr={yr} />
        <table className="tbl">
          <thead><tr><th>Date</th><th>Declination</th><th>Dip</th><th>Total field</th><th>Compass reading for true north (000°)</th></tr></thead>
          <tbody>{[...years.map((r) => ({ ...r, today: false })), { ...g, y: yr, today: true }].sort((a, b) => a.y - b.y).map((r) => <tr key={r.today ? 'today' : r.y} className={r.today ? 'sel' : ''}>
            <td>{r.today ? <b>Today</b> : Number.isInteger(r.y) ? `Jan ${r.y}` : `Jul ${Math.floor(r.y)}`}</td><td>{fmtDecl(r.decDeg)}</td><td>{r.dipDeg.toFixed(2)}°</td><td>{nt(r.totalNt)}</td><td>{fmtDeg(trueToMag(0, r.decDeg))}°M</td>
          </tr>)}</tbody>
        </table>
        <p className="small muted">{model.name} is good until {(model.epoch + 5).toFixed(0)}. NOAA publishes the next model (WMM{(model.epoch + 5).toFixed(0)}) near the end of {(model.epoch + 4).toFixed(0)}; the app picks it up by itself when online. For a drawing, note the declination and the date, for example “Declination {fmtDecl(g.decDeg)} ({now.getFullYear()}), changing {Math.abs(decRate * 60).toFixed(0)}′ {decRate < 0 ? 'W' : 'E'} per year”.</p>
      </Card>

      <Card title="Map bearing ↔ compass reading" tour="mag-convert" tip="Uses the declination above for this place and today's date.">
        <div className="row wrap">
          <label>Map (true) bearing <span style={{ width: 110, display: 'inline-block' }}><Num value={tDeg} nullable min={0} max={360} unit="°T" onChange={(v) => { setTDeg(v); setMDeg(v == null ? null : +trueToMag(v, g.decDeg).toFixed(1)); }} /></span></label>
          <label>Compass reading <span style={{ width: 110, display: 'inline-block' }}><Num value={mDeg} nullable min={0} max={360} unit="°M" onChange={(v) => { setMDeg(v); setTDeg(v == null ? null : +magToTrue(v, g.decDeg).toFixed(1)); }} /></span></label>
        </div>
        {tDeg != null && <p>{fmtDeg(tDeg)}°T on a map = <b>{fmtDeg(trueToMag(tDeg, g.decDeg))}°M</b> on a compass ({compassPoint(tDeg)}).</p>}
        <p className="small muted">Why it matters: 1° of aiming error puts you {u.len(1609.344 * Math.tan(rad), 0)} off at 1 mile and {u.len(16093.44 * Math.tan(rad), 0)} off at 10 miles. Forgetting the {Math.abs(g.decDeg).toFixed(1)}° declination here is {u.len(1609.344 * Math.tan(Math.abs(g.decDeg) * rad), 0)} off at 1 mile.</p>
      </Card>

      <Card title="Space weather (NOAA live forecast)" className="wide" tour="mag-space" tip="Geomagnetic storms from NOAA's Space Weather Prediction Center. Downloaded when online and kept on this device, so the last forecast shows offline too." actions={<button onClick={refresh} disabled={swState === 'loading'}>{swState === 'loading' ? 'Downloading…' : '🔄 Get the latest'}</button>}>
        <SpaceWeatherView sw={sw} state={swState} err={swErr} />
      </Card>

      <Card title="Learn more (online)" tip="These open NOAA's own pages in the browser.">
        <ul className="small">
          <li><a href={`https://www.ngdc.noaa.gov/geomag/calculators/magcalc.shtml?lat1=${pt.lat.toFixed(4)}&lon1=${pt.lon.toFixed(4)}`} target="_blank" rel="noreferrer">NOAA magnetic field calculator ↗</a> (check the numbers above)</li>
          <li><a href="https://www.ncei.noaa.gov/products/world-magnetic-model" target="_blank" rel="noreferrer">World Magnetic Model ↗</a></li>
          <li><a href="https://www.swpc.noaa.gov/" target="_blank" rel="noreferrer">NOAA Space Weather Prediction Center ↗</a> · <a href="https://www.swpc.noaa.gov/noaa-scales-explanation" target="_blank" rel="noreferrer">what G, S and R mean ↗</a></li>
        </ul>
      </Card>
    </div>
  );
}

function DeclChart({ years, nowYr }: { years: { y: number; decDeg: number }[]; nowYr: number }) {
  const W = 640, H = 170, L = 56, R = 12, T = 12, B = 28;
  const ds = years.map((r) => r.decDeg), lo = Math.min(...ds), hi = Math.max(...ds), pad = Math.max(0.05, (hi - lo) * 0.15);
  const y0 = lo - pad, y1 = hi + pad, x0 = years[0].y, x1 = years[years.length - 1].y;
  const X = (y: number) => L + ((y - x0) / (x1 - x0)) * (W - L - R), Y = (d: number) => T + (1 - (d - y0) / (y1 - y0)) * (H - T - B);
  const ticks = Array.from({ length: 4 }, (_, i) => y0 + ((i + 0.5) * (y1 - y0)) / 4);
  const nowIn = nowYr >= x0 && nowYr <= x1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }} role="img" aria-label="Declination over the years the model covers">
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="var(--line)" /><text x={L - 6} y={Y(t) + 4} fontSize="11" textAnchor="end" fill="var(--muted)">{fmtDecl(t)}</text></g>)}
      {years.filter((r) => Number.isInteger(r.y)).map((r) => <text key={r.y} x={X(r.y)} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--muted)">{r.y}</text>)}
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={years.map((r) => `${X(r.y)},${Y(r.decDeg)}`).join(' ')} />
      {nowIn && <><line x1={X(nowYr)} x2={X(nowYr)} y1={T} y2={H - B} stroke="var(--warn)" strokeDasharray="4 3" /><text x={X(nowYr) + 4} y={T + 10} fontSize="11" fill="var(--warn)">today</text></>}
    </svg>
  );
}

function SpaceWeatherView({ sw, state, err }: { sw: SpaceWeather | null; state: string; err: string }) {
  const now = Date.now();
  if (!sw) return <p className="note">{state === 'loading' ? 'Downloading the forecast from NOAA…' : state === 'error' ? `Could not reach NOAA (${err}). Connect to the internet and tap Get the latest; the forecast is then kept for offline use.` : 'No forecast on this device yet. Connect to the internet and tap Get the latest.'}</p>;
  const { current, peak, next } = kpSummary(sw, now);
  const gNow = sw.scales.now?.g ?? (current ? gOfKp(current.kp) : 0);
  const gPeak = Math.max(peak ? gOfKp(peak.kp) : 0, ...sw.scales.days.map((d) => d.g ?? 0));
  const old = now - sw.fetchedAt > 6 * 3600e3;
  const recent = sw.kp.filter((x) => swpcTime(x.t).getTime() >= now - 48 * 3600e3);
  return <>
    <p className={'small' + (old ? ' note' : ' muted')}>Downloaded {ago(now - sw.fetchedAt)}{old ? ' — this may be out of date. Tap Get the latest when you have internet.' : ''}{state === 'error' && <> · Could not refresh ({err}).</>}</p>
    <div className="stats">
      <Stat label="Right now" value={gNow ? `G${gNow} ${G_WORDS[gNow]}` : current ? kpWord(current.kp) : '—'} unit={current ? ` · Kp ${current.kp.toFixed(1)}` : ''} tone={current ? kpTone(current.kp) : undefined} tip="Kp is NOAA's 0–9 measure of how disturbed the magnetic field is. Kp 5 or more is a storm (G1 to G5)." />
      <Stat label="Next 3 days, worst" value={gPeak ? `G${gPeak} ${G_WORDS[gPeak]}` : peak ? kpWord(peak.kp) : '—'} unit={peak ? ` · Kp ${peak.kp.toFixed(1)}` : ''} tone={peak ? kpTone(peak.kp) : undefined} tip={peak ? `Highest predicted at ${swpcTime(peak.t).toLocaleString([], { weekday: 'short', hour: 'numeric' })}.` : undefined} />
      <Stat label="Radio blackout chance (R1+)" value={sw.scales.days[0]?.rMinorProb != null ? `${sw.scales.days[0].rMinorProb}%` : '—'} unit=" today" tip="Solar flares that fade HF (shortwave) radio on the daylight side for minutes to hours. VHF/UHF two-way radio and cell are rarely affected." />
      <Stat label="Solar radiation storm chance (S1+)" value={sw.scales.days[0]?.sProb != null ? `${sw.scales.days[0].sProb}%` : '—'} unit=" today" tip="Affects satellites and polar HF radio; little effect on the ground in the Southeast." />
    </div>
    <KpChart pts={[...recent, ...next.filter((x) => !recent.includes(x))].sort((a, b) => swpcTime(a.t).getTime() - swpcTime(b.t).getTime())} now={now} />
    <h4>What this means for the work</h4>
    <ul className="small">{stormEffects(Math.max(gNow, gPeak)).map((e) => <li key={e}>{e}</li>)}</ul>
    {sw.scales.days.length > 0 && <table className="tbl">
      <thead><tr><th>Day</th><th>Magnetic storm (G)</th><th>Radio blackout R1–R2 / R3+</th><th>Solar radiation S1+</th></tr></thead>
      <tbody>{sw.scales.days.map((d, i) => <tr key={i}><td>{d.date ? new Date(d.date + 'T12:00:00Z').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : `Day ${i + 1}`}</td><td>{d.g ? `G${d.g} ${G_WORDS[d.g]}` : 'None expected'}</td><td>{d.rMinorProb ?? '—'}% / {d.rMajorProb ?? '—'}%</td><td>{d.sProb ?? '—'}%</td></tr>)}</tbody>
    </table>}
    <p className="small muted">Forecast from NOAA SWPC. Space weather changes fast; for critical antenna aiming during a storm, use GPS or a satellite alignment tool instead of a compass.</p>
  </>;
}

function KpChart({ pts, now }: { pts: { t: string; kp: number; kind: string }[]; now: number }) {
  if (!pts.length) return null;
  const W = 640, H = 150, L = 26, R = 8, T = 10, B = 24, n = pts.length, bw = (W - L - R) / n;
  const Y = (k: number) => T + (1 - k / 9) * (H - T - B);
  const col = (k: number) => (k >= 6 ? 'var(--bad)' : k >= 5 ? 'var(--warn)' : k >= 4 ? '#c9a227' : 'var(--ok)');
  const nowI = pts.findIndex((x) => swpcTime(x.t).getTime() > now);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }} role="img" aria-label="Kp index every 3 hours, past two days and forecast">
      {[0, 3, 5, 7, 9].map((k) => <g key={k}><line x1={L} x2={W - R} y1={Y(k)} y2={Y(k)} stroke="var(--line)" strokeDasharray={k === 5 ? '4 3' : undefined} /><text x={L - 4} y={Y(k) + 4} fontSize="10" textAnchor="end" fill="var(--muted)">{k}</text></g>)}
      <text x={W - R} y={Y(5) - 3} fontSize="10" textAnchor="end" fill="var(--warn)">storm (G1)</text>
      {pts.map((x, i) => <rect key={x.t} x={L + i * bw + 1} width={Math.max(1, bw - 2)} y={Y(x.kp)} height={Math.max(1, Y(0) - Y(x.kp))} fill={col(x.kp)} opacity={x.kind === 'predicted' ? 0.5 : 1}><title>{`${swpcTime(x.t).toLocaleString([], { weekday: 'short', hour: 'numeric' })}: Kp ${x.kp.toFixed(1)} (${x.kind})`}</title></rect>)}
      {pts.map((x, i) => swpcTime(x.t).getUTCHours() === 0 ? <text key={'d' + x.t} x={L + i * bw} y={H - 8} fontSize="10" fill="var(--muted)">{swpcTime(x.t).toLocaleDateString([], { weekday: 'short' })}</text> : null)}
      {nowI > 0 && <><line x1={L + nowI * bw} x2={L + nowI * bw} y1={T} y2={Y(0)} stroke="var(--ink)" strokeDasharray="3 3" /><text x={L + nowI * bw + 3} y={T + 9} fontSize="10" fill="var(--ink)">now · faded bars are the forecast</text></>}
    </svg>
  );
}
