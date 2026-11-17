// Weather & Radar (Tools & reference).
// NOAA / National Weather Service weather for the project site (or where you are now): live radar map with the
// alert areas, the latest checked observation from the nearest station, watches / warnings / advisories, the
// hour-by-hour and 7-day forecast, and plain-language work-day checks. Kept on the device for offline use and
// saved on the project so other pages can warn about alerts, wind, lightning and cold.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { useStore, deviceInfo } from '../store';
import { uid } from '../defaults';
import { Card, Num, Stat } from '../components/ui';
import { MapView } from '../components/MapView';
import {
  downloadWeather, savedWeather, onWeather, zoneShape, workNotes, projectWeather, weatherLine, alertActive, alertTone, compass16, fmtTime, ago, fToC,
  RADAR_WMS, RADAR_LAYER, type Weather, type WxPlace, type WxAlert, type WxHour, type WxPeriod,
} from '../engine/weather';

const ASHEVILLE = { lat: 35.5951, lon: -82.5515, name: 'Asheville, NC (default)' };
const REFRESH_MIN = 10;

/** °F / mph by default; °C / km/h when the project is set to km. */
function useWxUnits() {
  const { project } = useStore();
  const metric = project.settings.units === 'km';
  return {
    t: (f: number | null | undefined) => (f == null ? '—' : metric ? `${Math.round(fToC(f))} °C` : `${Math.round(f)} °F`),
    s: (mph: number | null | undefined) => (mph == null ? '—' : metric ? `${Math.round(mph * 1.609344)} km/h` : `${Math.round(mph)} mph`),
    d: (mi: number | null | undefined) => (mi == null ? '—' : metric ? `${(mi * 1.609344).toFixed(1)} km` : `${mi.toFixed(1)} mi`),
    p: (inHg: number | null | undefined) => (inHg == null ? '—' : metric ? `${Math.round(inHg * 33.8639)} hPa` : `${inHg.toFixed(2)} inHg`),
    metric,
  };
}

export function WeatherPage() {
  const { project: p, update, go } = useStore();
  const wu = useWxUnits();
  const s = p.sites[0];
  const hasSite = !!s && Number.isFinite(s.lat) && (s.lat !== 0 || s.lon !== 0);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [typed, setTyped] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null });
  const [msg, setMsg] = useState('');
  const isSite = !here && typed.lat == null && hasSite;
  const place: WxPlace = here ? { ...here, name: 'Where you are now (GPS)' }
    : typed.lat != null && typed.lon != null ? { lat: typed.lat, lon: typed.lon, name: 'GPS point you typed' }
    : hasSite ? { lat: s.lat, lon: s.lon, name: [s.name || 'Site A', [p.meta.city, p.meta.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '), projectId: p.sync?.projectId } : ASHEVILLE;

  const [w, setW] = useState<Weather | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine !== false);
  const [tick, setTick] = useState(0);
  const samePlace = (x: Weather | null) => !!x && Math.abs(x.place.lat - place.lat) < 1e-3 && Math.abs(x.place.lon - place.lon) < 1e-3;
  const placeRef = useRef(place); placeRef.current = place;
  const siteRef = useRef(isSite); siteRef.current = isSite;

  const refresh = async () => {
    const at = placeRef.current;
    setState('loading'); setErr('');
    try {
      const v = await downloadWeather(at);
      if (Math.abs(placeRef.current.lat - at.lat) > 1e-3 || Math.abs(placeRef.current.lon - at.lon) > 1e-3) return; // moved on meanwhile
      setW(v); setState('idle');
    } catch (e) { setState('error'); setErr((e as Error).message || 'no connection'); }
  };

  // Show what is saved for this place at once, then download if online and older than a few minutes.
  useEffect(() => {
    let live = true;
    savedWeather().then((v) => {
      if (!live) return;
      setW(samePlace(v) ? v : null);
      if (navigator.onLine !== false && (!samePlace(v) || Date.now() - v!.fetchedAt > 5 * 60e3)) refresh();
    });
    return () => { live = false; };
  }, [place.lat.toFixed(4), place.lon.toFixed(4)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live: refresh every 10 minutes while the page is open and online, and as soon as the connection comes back.
  useEffect(() => {
    const off = onWeather((v) => samePlace(v) && setW(v));
    const on = () => { setOnline(true); refresh(); }, gone = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', gone);
    const timer = window.setInterval(() => { setTick((t) => t + 1); if (navigator.onLine !== false && document.visibilityState !== 'hidden') refresh(); }, REFRESH_MIN * 60e3);
    const clock = window.setInterval(() => setTick((t) => t + 1), 60e3);
    return () => { off(); window.removeEventListener('online', on); window.removeEventListener('offline', gone); clearInterval(timer); clearInterval(clock); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    if (!navigator.geolocation) { setMsg('This device does not share its location.'); return; }
    setMsg('Finding where you are…');
    navigator.geolocation.getCurrentPosition((x) => { setTyped({ lat: null, lon: null }); setHere({ lat: x.coords.latitude, lon: x.coords.longitude }); setMsg(''); }, (e) => setMsg(`Location not available: ${e.message}`), { enableHighAccuracy: true, timeout: 15000 });
  };

  const now = Date.now(); void tick;
  const old = w ? now - w.fetchedAt > 60 * 60e3 : false;
  const alerts = (w?.alerts ?? []).filter((a) => alertActive(a, now));
  const notes = w ? workNotes(w, now) : [];
  const addNote = () => {
    if (!w) return;
    update((d) => { d.fieldNotes = [{ id: uid(), at: new Date().toISOString(), title: `Weather at ${w.place.name}`, text: weatherLine(w), category: 'Site visit', siteId: isSite ? s.id : undefined, lat: w.place.lat, lon: w.place.lon, photos: [], tags: ['weather'], author: deviceInfo().name, followUp: false, done: false }, ...(d.fieldNotes ?? [])]; });
    setMsg('Added to Field Notes ✓');
  };

  return (
    <div className="grid">
      <Card title="Weather here" className="wide" tour="wx-now" tip="From NOAA's National Weather Service (weather.gov). It updates by itself every 10 minutes while this page is open and online, and the last download stays on this device for use with no internet."
        actions={<button onClick={refresh} disabled={state === 'loading'}>{state === 'loading' ? 'Downloading…' : '🔄 Get the latest'}</button>}>
        <p className="small"><b>Place:</b> {place.name} · GPS {place.lat.toFixed(4)}, {place.lon.toFixed(4)}{w?.point.city ? ` · NWS forecast for near ${w.point.city}, ${w.point.state} (office ${w.point.office})` : ''}</p>
        <div className="row wrap">
          <button onClick={locate}>📡 Use where I am now</button>
          {(here || typed.lat != null) && <button onClick={() => { setHere(null); setTyped({ lat: null, lon: null }); }}>↩ Back to {hasSite ? 'the project site' : 'Asheville'}</button>}
          <span className="small muted">or type a GPS point:</span>
          <span className="small">Lat</span><span style={{ width: 120 }}><Num label="Latitude" value={typed.lat} nullable min={-90} max={90} onChange={(v) => { setHere(null); setTyped((t) => ({ ...t, lat: v })); }} /></span>
          <span className="small">Lon</span><span style={{ width: 120 }}><Num label="Longitude" value={typed.lon} nullable min={-180} max={180} onChange={(v) => { setHere(null); setTyped((t) => ({ ...t, lon: v })); }} /></span>
        </div>
        {msg && <p className="small note" role="status">{msg}</p>}
        {!hasSite && !here && typed.lat == null && <p className="small muted">No site position on this project yet, so Asheville is shown. Place Site A on <a href="#sites" onClick={(e) => { e.preventDefault(); go('sites'); }}>Site Data & GPS</a> to see the job site.</p>}
        <Freshness w={w} state={state} err={err} online={online} old={old} />
        {w && <CurrentView w={w} />}
      </Card>

      {alerts.length > 0 && <Card title={`Weather alerts (${alerts.length})`} className="wide" tour="wx-alerts" tip="Watches, warnings and advisories from the National Weather Service in force at this place. Tap one for the full text and what to do.">
        <AlertList alerts={alerts} />
      </Card>}

      <Card title="Radar map" className="wide" tour="wx-radar" tip="NOAA's live radar (MRMS base reflectivity, all US radars combined), refreshed every 5 minutes. Alert areas are outlined in red (warnings) and orange (watches and advisories). The radar needs internet; the map pictures you have saved still show offline.">
        <RadarMap place={place} alerts={alerts} online={online} />
      </Card>

      <Card title="Work-day check" className="wide" tour="wx-work" tip="Plain checks for outdoor low-voltage, tower, roof and aerial-lift work from the alerts and the next 24 hours of the forecast. Your company safety plan, the equipment's ratings and the AHJ always come first.">
        {!w ? <p className="small muted">Shows once the weather has been downloaded.</p> : <ul className="wx-notes">{notes.map((n, i) => <li key={i} className={`wx-note ${n.tone}`}><span aria-hidden>{n.icon}</span> {n.text}</li>)}</ul>}
      </Card>

      <Card title="Next 24 hours" className="wide" tour="wx-hourly" tip="NOAA's hour-by-hour forecast: temperature (line) and chance of rain (bars).">
        {w && w.hours.length ? <HourChart hours={w.hours.filter((h) => Date.parse(h.t) > now - 3600e3).slice(0, 24)} /> : <p className="small muted">No hourly forecast saved yet.</p>}
      </Card>

      <Card title="7-day forecast" className="wide" tour="wx-week" tip="NOAA's forecast for this place, day and night. Tap a day for the full forecast text.">
        {w && w.periods.length ? <WeekView periods={w.periods.filter((x) => Date.parse(x.end) > now)} /> : <p className="small muted">No forecast saved yet.</p>}
      </Card>

      <Card title="Weather on this project" tour="wx-project" tip="When the weather is for the project site, its values are saved on the project. Other pages use them: alerts and work-day warnings on Site Data, Installation guides and Service; the cold check on Solar & DC Power; and a weather line you can add to Field Notes.">
        {p.weather ? <>
          <p className="small">Saved {ago(now - p.weather.at)} for {p.weather.place}.</p>
          <div className="stats">
            <Stat label="Temperature at the site" value={wu.t(p.weather.tempF)} />
            <Stat label="Wind / gusts" value={`${wu.s(p.weather.windMph)}`} unit={p.weather.gustMph ? ` · gusts ${wu.s(p.weather.gustMph)}` : ''} />
            <Stat label="7-day low / high" value={`${wu.t(p.weather.lowF)} / ${wu.t(p.weather.highF)}`} tone={p.weather.lowF != null && p.weather.lowF <= 32 ? 'warn' : undefined} />
            <Stat label="Strongest forecast wind" value={wu.s(p.weather.maxWindMph)} tone={(p.weather.maxWindMph ?? 0) >= 20 ? 'warn' : undefined} />
            <Stat label="Alerts in force" value={p.weather.alerts.length ? p.weather.alerts.map((a) => a.event).join(', ') : 'None'} tone={p.weather.alerts.length ? 'bad' : 'ok'} />
          </div>
        </> : <p className="small muted">{hasSite ? 'Saved on the project after the first download for the site.' : 'Place Site A on Site Data & GPS so the site weather can be saved on the project.'}</p>}
        <div className="row wrap">
          <button onClick={addNote} disabled={!w}>📝 Add today's weather to Field Notes</button>
          {p.solar.enabled && <button onClick={() => go('solar')}>☀ Solar & DC Power</button>}
        </div>
        <p className="small muted">Weather values are from the National Weather Service: the latest observation from the nearest station (values NOAA's quality checks rejected are left out) and NOAA's official forecast. They are not design values: code and structural wind, ice and record temperatures still come from the adopted codes, TIA-222 and ASHRAE.</p>
      </Card>

      <Card title="More from NOAA (online)" tip="These open the National Weather Service pages in the browser.">
        <ul className="small">
          <li><a href={`https://forecast.weather.gov/MapClick.php?lat=${place.lat.toFixed(4)}&lon=${place.lon.toFixed(4)}`} target="_blank" rel="noreferrer">Full forecast on weather.gov ↗</a></li>
          <li><a href={w?.point.radar ? `https://radar.weather.gov/station/${w.point.radar}/standard` : 'https://radar.weather.gov/'} target="_blank" rel="noreferrer">Moving radar loop on radar.weather.gov{w?.point.radar ? ` (${w.point.radar})` : ''} ↗</a></li>
          {w?.point.office && <li><a href={`https://www.weather.gov/${w.point.office.toLowerCase()}/`} target="_blank" rel="noreferrer">Local NWS office ({w.point.office}) ↗</a></li>}
          <li><a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noreferrer">Severe storm outlook (Storm Prediction Center) ↗</a></li>
        </ul>
      </Card>
    </div>
  );
}

function Freshness({ w, state, err, online, old }: { w: Weather | null; state: string; err: string; online: boolean; old: boolean }) {
  if (!w) return <p className="note">{state === 'loading' ? 'Downloading the weather from NOAA…' : state === 'error' ? `Could not reach the weather service (${err}). Connect to the internet and tap Get the latest; the weather is then kept for offline use.` : 'No weather saved on this device for this place yet. Connect to the internet and tap Get the latest.'}</p>;
  const cls = 'small ' + (old || !online || state === 'error' ? 'note' : 'muted');
  return <p className={cls} role="status">
    {!online ? '📴 No internet: showing the last weather downloaded ' : 'Downloaded '}{ago(Date.now() - w.fetchedAt)} ({new Date(w.fetchedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}).
    {online && state !== 'error' && ` Updates by itself every ${REFRESH_MIN} minutes.`}
    {old && online && ' This may be out of date; tap Get the latest.'}
    {state === 'error' && ` Could not refresh (${err}).`}
    {w.problems.length > 0 && <><br />Not refreshed this time: {w.problems.join('; ')}.</>}
  </p>;
}

function CurrentView({ w }: { w: Weather }) {
  const wu = useWxUnits();
  const n = w.now;
  const f = w.periods[0];
  const obsAge = n ? Date.now() - Date.parse(n.at) : 0;
  return <>
    {n ? <p className="big-answer" style={{ fontSize: '1.15rem', margin: '10px 0' }}>{n.text || 'Now'}: <b>{wu.t(n.tempF)}</b>{n.feelsF != null && n.tempF != null && Math.abs(n.feelsF - n.tempF) >= 3 ? <> (feels like {wu.t(n.feelsF)})</> : null}{n.windMph != null ? <>, wind {n.windDeg != null ? compass16(n.windDeg) + ' ' : ''}{wu.s(n.windMph)}{n.gustMph ? <> gusting {wu.s(n.gustMph)}</> : null}</> : null}</p>
      : <p className="note">No recent station report nearby; the forecast below is still current.</p>}
    {n && <div className="stats">
      <Stat label="Temperature" value={wu.t(n.tempF)} unit={n.feelsF != null ? ` · feels ${wu.t(n.feelsF)}` : ''} tone={n.tempF != null && (n.tempF <= 32 || (n.feelsF ?? n.tempF) >= 91) ? 'warn' : undefined} />
      <Stat label="Wind" value={n.windMph == null ? '—' : `${n.windDeg != null ? compass16(n.windDeg) + ' ' : ''}${wu.s(n.windMph)}`} unit={n.gustMph ? ` · gusts ${wu.s(n.gustMph)}` : ''} tone={Math.max(n.windMph ?? 0, n.gustMph ?? 0) >= 20 ? 'warn' : undefined} />
      <Stat label="Humidity" value={n.humidity == null ? '—' : `${Math.round(n.humidity)}%`} unit={n.dewF != null ? ` · dew point ${wu.t(n.dewF)}` : ''} />
      <Stat label="Pressure" value={wu.p(n.pressureInHg)} />
      <Stat label="Visibility" value={wu.d(n.visibilityMi)} />
      {f && <Stat label={f.name || 'Forecast'} value={`${f.isDay ? 'High' : 'Low'} ${wu.t(f.tempF)}`} unit={f.pop ? ` · ${f.pop}% rain` : ''} tip={f.detail} />}
    </div>}
    {n && <p className="small muted">Observed {fmtTime(n.at)} at {n.stationName} ({n.station}){n.distMi != null ? `, ${wu.d(n.distMi)} away` : ''}.{obsAge > 2 * 3600e3 ? ' This report is more than 2 hours old.' : ''}</p>}
  </>;
}

function AlertList({ alerts }: { alerts: WxAlert[] }) {
  return <div className="wx-alerts">{alerts.map((a) => (
    <details key={a.id} className={`wx-alert ${alertTone(a)}`}>
      <summary><b>⚠ {a.event}</b>{a.ends || a.expires ? <> · until {fmtTime(a.ends || a.expires!)}</> : null} <span className="small muted">· {a.severity}{a.sender ? ` · ${a.sender}` : ''}</span></summary>
      {a.headline && <p className="small"><b>{a.headline}</b></p>}
      {a.instruction && <p className="small"><b>What to do:</b> {a.instruction}</p>}
      <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{a.description}</p>
      <p className="small muted">Area: {a.area}</p>
    </details>))}</div>;
}

const radarParams = () => ({ layers: RADAR_LAYER, format: 'image/png', transparent: true, version: '1.3.0', _t: String(Math.floor(Date.now() / 300e3)) });

function RadarMap({ place, alerts, online }: { place: WxPlace; alerts: WxAlert[]; online: boolean }) {
  const { project: p } = useStore();
  const [map, setMap] = useState<L.Map | null>(null);
  const [show, setShow] = useState(true);
  const [opacity, setOpacity] = useState(0.65);
  const [shapes, setShapes] = useState<Record<string, GeoJSON.Geometry | null>>({});
  const radar = useRef<L.TileLayer.WMS>();
  useEffect(() => {
    if (!map) return;
    const pane = map.getPane('wxRadar') ?? map.createPane('wxRadar'); pane.style.zIndex = '350'; pane.style.pointerEvents = 'none';
    const r = L.tileLayer.wms(RADAR_WMS, { ...radarParams(), opacity, pane: 'wxRadar', attribution: 'Radar: NOAA NWS / NCEP MRMS' } as L.WMSOptions);
    radar.current = r; if (show) r.addTo(map);
    const t = window.setInterval(() => r.setParams(radarParams() as unknown as L.WMSParams), 300e3);
    return () => { clearInterval(t); r.remove(); };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const r = radar.current; if (!r || !map) return; if (show) r.addTo(map); else r.remove(); }, [show, map]);
  useEffect(() => { radar.current?.setOpacity(opacity); }, [opacity]);
  // Alerts NOAA lists by zone (no drawn area): fetch the zone outlines (kept on the device).
  useEffect(() => {
    let live = true;
    const want = alerts.filter((a) => !a.geometry).flatMap((a) => a.zones).filter((z, i, l) => l.indexOf(z) === i && !(z in shapes)).slice(0, 8);
    Promise.all(want.map(async (z) => [z, await zoneShape(z).catch(() => null)] as const)).then((r) => { if (live && r.length) setShapes((s) => ({ ...s, ...Object.fromEntries(r) })); });
    return () => { live = false; };
  }, [alerts.map((a) => a.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const center = useMemo(() => ({ lat: place.lat, lon: place.lon, zoom: 9 }), [place.lat, place.lon]);
  const draw = (g: L.LayerGroup) => {
    for (const a of [...alerts].reverse()) {
      const color = alertTone(a) === 'bad' ? '#d32f2f' : '#ef6c00';
      const geoms = a.geometry ? [a.geometry] : a.zones.map((z) => shapes[z]).filter((x): x is GeoJSON.Geometry => !!x);
      for (const geom of geoms) L.geoJSON(geom as GeoJSON.GeoJsonObject, { style: { color, weight: 2, fillOpacity: 0.08 } }).bindTooltip(`${a.event}${a.ends || a.expires ? ` · until ${fmtTime(a.ends || a.expires!)}` : ''}`, { sticky: true }).addTo(g);
    }
    L.circleMarker([place.lat, place.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#1565c0', fillOpacity: 1 }).bindTooltip(place.name).addTo(g);
  };
  return <>
    <div className="row wrap">
      <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show radar</label>
      <label className="small">See-through <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} aria-label="Radar opacity" /></label>
      <RadarLegend />
    </div>
    {!online && <p className="small note">📴 No internet: the live radar cannot be shown. Alert areas and saved map pictures still show.</p>}
    <MapView sites={p.sites} height={460} center={center} onMap={setMap} extra={draw} extraKey={`${place.lat},${place.lon},${alerts.map((a) => a.id).join()},${Object.keys(shapes).length}`} />
    <p className="small muted">Radar refreshes every 5 minutes. Colors: light green is light rain, yellow and orange heavy rain, red and purple very heavy rain or hail. For a moving loop, open the radar.weather.gov link below.</p>
  </>;
}

function RadarLegend() {
  const stops: [string, string][] = [['#04e9e7', '5'], ['#02fd02', '20'], ['#fdf802', '35'], ['#fd9500', '45'], ['#fd0000', '55'], ['#bc0000', '60'], ['#f800fd', '65'], ['#9854c6', '70+']];
  return <span className="small wx-legend" aria-label="Radar colors, dBZ">{stops.map(([c, v]) => <span key={v}><i style={{ background: c }} />{v}</span>)} <span className="muted">dBZ</span></span>;
}

function HourChart({ hours }: { hours: WxHour[] }) {
  const wu = useWxUnits();
  if (!hours.length) return null;
  const W = 720, H = 190, L0 = 40, R = 10, T = 16, B = 34, n = hours.length, bw = (W - L0 - R) / n;
  const ts = hours.map((h) => h.tempF ?? NaN).filter(Number.isFinite);
  const lo = Math.floor(Math.min(...ts) - 3), hi = Math.ceil(Math.max(...ts) + 3);
  const Y = (t: number) => T + (1 - (t - lo) / (hi - lo || 1)) * (H - T - B);
  const P = (pop: number) => (pop / 100) * (H - T - B);
  const pts = hours.map((h, i) => (h.tempF == null ? null : `${L0 + i * bw + bw / 2},${Y(h.tempF)}`)).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }} role="img" aria-label="Temperature and chance of rain, next 24 hours">
      {[lo, (lo + hi) / 2, hi].map((t) => <g key={t}><line x1={L0} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="var(--line)" /><text x={L0 - 4} y={Y(t) + 4} fontSize="10" textAnchor="end" fill="var(--muted)">{wu.t(t).replace(' ', '')}</text></g>)}
      {hours.map((h, i) => <rect key={'p' + h.t} x={L0 + i * bw + 2} width={Math.max(1, bw - 4)} y={H - B - P(h.pop ?? 0)} height={P(h.pop ?? 0)} fill="#4a90d9" opacity={0.35}><title>{`${fmtTime(h.t)}: ${h.pop ?? 0}% rain, ${h.short}`}</title></rect>)}
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={pts} />
      {hours.map((h, i) => (i % 3 === 0 ? <g key={'l' + h.t}>
        <text x={L0 + i * bw + bw / 2} y={H - B + 14} fontSize="10" textAnchor="middle" fill="var(--muted)">{new Date(h.t).toLocaleTimeString([], { hour: 'numeric' })}</text>
        {h.tempF != null && <text x={L0 + i * bw + bw / 2} y={Y(h.tempF) - 6} fontSize="10" textAnchor="middle" fill="var(--ink)">{Math.round(h.tempF)}°</text>}
        {h.windMph != null && <text x={L0 + i * bw + bw / 2} y={H - 6} fontSize="9" textAnchor="middle" fill="var(--muted)">{h.windDir} {wu.s(h.windMph).replace(' ', '')}</text>}
      </g> : null))}
    </svg>
  );
}

function WeekView({ periods }: { periods: WxPeriod[] }) {
  const wu = useWxUnits();
  return <div className="wx-week">{periods.map((x) => (
    <details key={x.start} className={`wx-day${x.isDay ? '' : ' night'}`}>
      <summary>
        <b>{x.name}</b>
        <span className="wx-temp">{x.isDay ? 'High' : 'Low'} {wu.t(x.tempF)}</span>
        <span className="small">{x.short}</span>
        <span className="small muted">{x.pop ? `${x.pop}% rain · ` : ''}{x.windDir} {wu.metric ? `up to ${wu.s(x.windMph)}` : x.windText}</span>
      </summary>
      <p className="small">{x.detail}</p>
    </details>))}</div>;
}
