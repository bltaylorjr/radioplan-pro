import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { useStore, downloadText, safeName } from '../store';
import { Card, Stat, Num, Tip, fmt } from '../components/ui';
import { MapView, gridCanvas } from '../components/MapView';
import { askConfirm } from '../components/askConfirm';
import { primaryCoverageInputs } from '../engine/network';
import { predictPoint, rssiColor, RSSI_SCALE } from '../engine/coverage';
import { toCsv } from '../engine/csv';
import { SignalReading, ReadingSource, SOURCE_LABEL, parseReadingsFile, compareReadings, compareVerdict, gridTest, idwGrid, readingsCsvRows, deltaColor, BYTE_FORMATS, ByteFormat } from '../engine/signal';
import { bluetoothSupported, serialSupported, phoneSignalSupported, TRANSPORT_LABEL } from '../engine/meter';
import { connectDevice, disconnectDevice, onDeviceValue } from '../engine/devices';
import { useDevices } from './Devices';
import { uid } from '../defaults';
import { useUnits } from '../units';

type Fix = { lat: number; lon: number; accM: number; at: number };
const sessionName = () => `Readings ${new Date().toLocaleDateString()}`;
const color = (v: number) => { const c = rssiColor(v, -200); return c[3] ? `rgb(${c[0]},${c[1]},${c[2]})` : '#888'; };

/** Live signal readings: from a Bluetooth / USB meter, the phone, typed, or imported; compared with the prediction. */
export function SignalReadingsPage() {
  const { project: p, update, rt, go } = useStore();
  const u = useUnits();
  const all = p.signalReadings ?? [];
  const [session, setSession] = useState(() => all[0]?.session && all[0].at.slice(0, 10) === new Date().toISOString().slice(0, 10) ? all[0].session : sessionName());
  const dev = useDevices().state('meter');
  const link = dev ? { name: dev.name, kind: dev.transport } : null;
  const [live, setLive] = useState<{ v: number; at: number; info?: string } | null>(null);
  const [err, setErr] = useState('');
  const status = err || dev?.status || '';
  useEffect(() => onDeviceValue('meter', (v, info) => setLive({ v, at: Date.now(), info })), []);
  const [, tick] = useState(0); useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const [typed, setTyped] = useState<number | null>(null);
  const [indoor, setIndoor] = useState(false);
  const [floor, setFloor] = useState(''); const [spot, setSpot] = useState(''); const [critical, setCritical] = useState(false);
  const [auto, setAuto] = useState(false); const [every, setEvery] = useState(2);
  const [fmtB, setFmtB] = useState<ByteFormat>('auto'); const [baud, setBaud] = useState(9600);
  const [fix, setFix] = useState<Fix | null>(null); const [gpsErr, setGpsErr] = useState('');
  const watch = useRef<number | null>(null);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<'measured' | 'delta' | 'heat'>('measured');
  const [show, setShow] = useState<string>('');
  const [minDbm, setMinDbm] = useState(-95);
  const mapRef = useRef<L.Map | null>(null);

  // GPS runs while this page is open and a reading source is in use.
  const startGps = () => {
    if (watch.current != null || !navigator.geolocation) { if (!navigator.geolocation) setGpsErr('No GPS on this device: readings save without a position (fine for indoor grid tests).'); return; }
    watch.current = navigator.geolocation.watchPosition((g) => { setFix({ lat: +g.coords.latitude.toFixed(6), lon: +g.coords.longitude.toFixed(6), accM: Math.round(g.coords.accuracy * 100) / 100, at: Date.now() }); setGpsErr(''); },
      (e) => setGpsErr(`GPS: ${e.message}`), { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  };
  useEffect(() => { if (dev) startGps(); return () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const liveRef = useRef(live); liveRef.current = live;

  const fixRef = useRef(fix); fixRef.current = fix;
  /** Save a reading. Without a fresh GPS fix, waits up to 8 s for one (the first fix after GPS starts). */
  const add = (dbm: number, source: ReadingSource, extra: Partial<SignalReading> = {}) => {
    const fr = fixRef.current, fresh = fr && Date.now() - fr.at < 30000 ? fr : null;
    if (!fresh && !indoor && navigator.geolocation) {
      setMsg('Getting a GPS fix…');
      navigator.geolocation.getCurrentPosition((g) => save(dbm, source, extra, { lat: +g.coords.latitude.toFixed(6), lon: +g.coords.longitude.toFixed(6), accM: Math.round(g.coords.accuracy * 100) / 100, at: Date.now() }),
        () => save(dbm, source, extra, null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 });
      return;
    }
    save(dbm, source, extra, indoor ? null : fresh);
  };
  const save = (dbm: number, source: ReadingSource, extra: Partial<SignalReading>, f: Fix | null) => {
    const r: SignalReading = { id: uid(), at: new Date().toISOString(), dbm: Math.round(dbm * 10) / 10, source, session: session.trim() || sessionName(),
      ...(f ? { lat: f.lat, lon: f.lon, accM: f.accM } : {}), ...(floor ? { floor } : {}), ...(spot ? { spot } : {}), ...(critical ? { critical: true } : {}),
      ...(link ? { device: link.name } : {}), ...(live?.info && source === 'phone' ? { tech: live.info } : {}), ...extra };
    update((d) => { d.signalReadings = [...(d.signalReadings ?? []), r]; });
    setMsg(`Saved ${r.dbm} dBm${r.lat != null ? ` at ±${r.accM} m` : indoor ? ` (${[floor && `floor ${floor}`, spot].filter(Boolean).join(', ') || 'indoors'})` : ' (no GPS fix yet)'}.`);
  };
  const recordLive = () => { const l = liveRef.current; if (!l || Date.now() - l.at > 10000) { setMsg('No fresh reading from the meter yet.'); return; } add(l.v, link?.kind === 'phone' ? 'phone' : link?.kind === 'serial' ? 'serial' : link?.kind === 'wifi' ? 'wifi' : 'bluetooth'); };
  const recordRef = useRef(recordLive); recordRef.current = recordLive;
  useEffect(() => { if (!auto || !dev) return; const t = window.setInterval(() => recordRef.current(), Math.max(1, every) * 1000); return () => clearInterval(t); }, [auto, !!dev, every]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async (kind: 'bluetooth' | 'serial' | 'phone', phone?: 'cell' | 'wifi') => {
    setLive(null); setErr(''); startGps();
    try { await connectDevice('meter', kind, { format: fmtB, baud, phone }); } catch (e) { setErr((e as Error).message); }
  };
  const disconnect = () => { disconnectDevice('meter'); setAuto(false); setErr(''); };

  const importFile = async (f?: File) => {
    if (!f) return;
    try { const r = parseReadingsFile(await f.text(), f.name, f.name.replace(/\.[^.]+$/, ''));
      update((d) => { d.signalReadings = [...(d.signalReadings ?? []), ...r.readings]; });
      setShow(f.name.replace(/\.[^.]+$/, ''));
      setMsg(`Imported ${r.readings.length} readings from ${f.name} (${r.app}, signal column "${r.signalColumn}")${r.skipped ? `; ${r.skipped} rows skipped` : ''}.`);
      zoomNext.current = true;
    } catch (e) { setMsg(`Import failed: ${(e as Error).message}`); }
  };

  const sessions = [...new Set(all.map((r) => r.session))];
  const rs = show ? all.filter((r) => r.session === show) : all;
  const inp = primaryCoverageInputs(p, rt.dem, 40);
  const txSite = p.sites.find((s) => s.id === p.radio.txSiteId) ?? p.sites[0];
  const cmp = useMemo(() => (inp ? compareReadings(rs, (pt) => predictPoint(inp, pt), txSite) : null), [rs, p.radio, p.propagation, p.sites, rt.dem]); // eslint-disable-line react-hooks/exhaustive-deps
  const predOf = useMemo(() => new Map(cmp?.rows.map((x) => [x.r.id, x.predicted]) ?? []), [cmp]);
  const verdict = cmp ? compareVerdict(cmp.stats) : null;
  const grid = useMemo(() => gridTest(rs, minDbm), [rs, minDbm]);
  const gps = rs.filter((r) => r.lat != null && r.lon != null);
  const heat = useMemo(() => (view === 'heat' ? idwGrid(gps.map((r) => ({ lat: r.lat!, lon: r.lon!, v: r.dbm })), 90, Math.max(0.05, Math.min(1.5, spread(gps) / 6))) : null), [view, gps]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomNext = useRef(false);
  useEffect(() => { if (zoomNext.current) { zoomNext.current = false; zoomTo(); } }, [all.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomTo = () => { const m = mapRef.current, g = (p.signalReadings ?? []).filter((r) => r.lat != null); if (m && g.length) m.fitBounds(L.latLngBounds(g.map((r) => [r.lat!, r.lon!] as [number, number])), { padding: [30, 30], maxZoom: 18 }); };

  const draw = (g: L.LayerGroup) => {
    if (heat) {
      const url = gridCanvas(heat, (i) => { const v = heat.v[i]; if (!Number.isFinite(v)) return null; const c = rssiColor(v, -200); return [c[0], c[1], c[2]]; }, 170);
      L.imageOverlay(url, [[heat.south, heat.west], [heat.north, heat.east]], { opacity: 0.75 }).addTo(g);
    }
    for (const r of gps) {
      const pr = predOf.get(r.id), d = pr != null ? r.dbm - pr : NaN;
      const col = view === 'delta' ? (Number.isFinite(d) ? `rgb(${deltaColor(d).join(',')})` : '#888') : color(r.dbm);
      L.circleMarker([r.lat!, r.lon!], { radius: view === 'heat' ? 3 : 6, weight: 1, color: '#222', fillColor: col, fillOpacity: 0.95 })
        .bindTooltip(`<b>${r.dbm} dBm</b> measured${pr != null ? `<br>${pr} dBm predicted (${d >= 0 ? '+' : ''}${d.toFixed(1)} dB)` : ''}<br>${new Date(r.at).toLocaleString()}${r.accM != null ? ` · GPS ±${r.accM} m` : ''}${r.tech ? `<br>${r.tech}` : ''}${r.critical ? '<br>Critical area' : ''}${r.note ? `<br>${r.note.replace(/[<>&]/g, '')}` : ''}`).addTo(g);
    }
    if (fix && link) L.circleMarker([fix.lat, fix.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#1e88e5', fillOpacity: 1 }).bindTooltip('You are here').addTo(g);
  };
  const toCalibration = async () => {
    if (!gps.length) return;
    if (p.survey.points.length && !(await askConfirm({ title: 'Replace the drive-test points?', message: `The Drive Test page has ${p.survey.points.length} points. Replace them with these ${gps.length} readings?`, ok: 'Replace' }))) return;
    update((d) => { d.survey = { name: show || 'Live signal readings', importedAt: new Date().toISOString(), points: gps.map((r) => ({ lat: r.lat!, lon: r.lon!, rssiDbm: r.dbm, t: r.at })) }; });
    go('survey');
  };
  const toErces = () => { update((d) => { d.erces.measuredGeneralPct = Number.isFinite(grid.pct) ? grid.pct : d.erces.measuredGeneralPct; d.erces.measuredCriticalPct = Number.isFinite(grid.critPct) ? grid.critPct : d.erces.measuredCriticalPct; }); go('erces'); };
  const delSession = async () => {
    const what = show ? `the ${rs.length} readings in "${show}"` : `all ${all.length} readings`;
    if (!(await askConfirm({ title: 'Delete readings?', message: `Delete ${what}?`, ok: 'Delete', danger: true }))) return;
    update((d) => { d.signalReadings = show ? (d.signalReadings ?? []).filter((r) => r.session !== show) : []; }); setShow('');
  };
  const liveFresh = live && Date.now() - live.at < 10000;
  const fixOk = fix && Date.now() - fix.at < 30000;

  return (
    <div className="stack">
      <div className="grid2">
        <Card title="Take a reading" tour="signal-read" tip="Connect a signal meter by Bluetooth or USB, use this phone's own signal (Android app), or type what your meter shows. Each reading saves with your GPS position and time.">
          <label className="field"><span>Name for this walk or test</span><input value={session} onChange={(e) => setSession(e.target.value)} placeholder="e.g. Lobby to roof, 1st floor grid test" /></label>
          <div className="row wrap" style={{ marginTop: 6 }}>
            <button className={link?.kind === 'bluetooth' ? 'primary' : ''} disabled={!bluetoothSupported()} onClick={() => connect('bluetooth')} title={bluetoothSupported() ? 'Pair with a Bluetooth signal meter' : 'Bluetooth meters work in Chrome or Edge (computer, Android). Here, import the meter’s file instead.'}>🔵 Bluetooth meter</button>
            <button className={link?.kind === 'serial' ? 'primary' : ''} disabled={!serialSupported()} onClick={() => connect('serial')} title={serialSupported() ? 'A meter on a USB cable, or a Bluetooth meter paired in Windows (COM port)' : 'USB / COM meters work in Chrome or Edge on a computer.'}>🔌 USB / COM meter</button>
            <button className={link?.kind === 'phone' ? 'primary' : ''} disabled={!phoneSignalSupported()} onClick={() => connect('phone', 'cell')} title={phoneSignalSupported() ? 'Read this phone’s cellular signal' : 'Works in the LvPlan Pro Android app.'}>📱 Phone cell signal</button>
            {phoneSignalSupported() && <button onClick={() => connect('phone', 'wifi')} title="Read the signal of the Wi-Fi network this phone is on">📱 Phone Wi-Fi signal</button>}
            <button onClick={() => go('devices')} title="Wi-Fi meters, GPS receivers and other devices">📶 Wi-Fi & more…</button>
            {link && <button className="ghost" onClick={disconnect}>Disconnect</button>}
            <Tip text="Greyed-out buttons are not available on this device. Bluetooth and USB meters need Chrome or Edge; the phone's own signal needs the Android app. Typing a reading and importing a file work everywhere." />
          </div>
          {status && <p className="small">{status}</p>}
          {link && <div className="live-reading" style={{ borderColor: liveFresh ? color(live!.v) : undefined }}>
            <div className="live-val" style={{ color: liveFresh ? color(live!.v) : undefined }}>{liveFresh ? `${live!.v.toFixed(1)}` : '—'}<small> dBm</small></div>
            <div className="small muted">{link.name} ({TRANSPORT_LABEL[link.kind]}){live?.info ? ` · ${live.info}` : ''}{liveFresh ? '' : ' · waiting for a reading'}</div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <button className="primary big" disabled={!liveFresh} onClick={recordLive}>📍 Save this reading</button>
              <label className="check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Save automatically every</label>
              <span style={{ width: 70 }}><Num value={every} min={1} onChange={(v) => setEvery(v ?? 2)} unit="s" /></span>
            </div>
          </div>}
          <h4>Or type what your meter shows</h4>
          <div className="row wrap"><span style={{ width: 150 }}><Num value={typed} nullable onChange={setTyped} unit="dBm" /></span>
            <button className="primary" disabled={typed == null} onClick={() => { startGps(); if (typed != null && typed < 0) { add(typed, 'typed'); setTyped(null); } else setMsg('Signal levels in dBm are negative, for example -87.'); }}>📍 Save reading</button></div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <label className="check"><input type="checkbox" checked={indoor} onChange={(e) => setIndoor(e.target.checked)} /> Indoors (grid test): no GPS</label>
            <input style={{ width: 90 }} value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Floor" aria-label="Floor" />
            <input style={{ width: 140 }} value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="Room or grid cell" aria-label="Room or grid cell" />
            <label className="check"><input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} /> Critical area</label>
          </div>
          <p className="small muted">{indoor ? 'Readings save with the floor and room only.' : fixOk ? `GPS ±${fix!.accM} m ✓` : gpsErr || 'GPS starts when you connect or save a reading.'}</p>
          <details><summary className="small">Meter settings</summary>
            <div className="form">
              <label className="field"><span>Bluetooth data format</span><select value={fmtB} onChange={(e) => setFmtB(e.target.value as ByteFormat)} data-no-choose>{BYTE_FORMATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="field"><span>COM port speed</span><select value={baud} onChange={(e) => setBaud(+e.target.value)} data-no-choose>{[4800, 9600, 19200, 38400, 57600, 115200].map((b) => <option key={b} value={b}>{b} baud</option>)}</select></label>
            </div>
            <p className="small muted">Leave these as they are unless the reading looks wrong. Most meters send text like “-87.5 dBm”; dBµV readings are changed to dBm (50 Ω). Change a setting, then connect again.</p>
          </details>
        </Card>
        <Card title="Import readings from an app or meter" tour="signal-import" tip="Phone apps and meters save readings as a file. Import it here: CSV or TSV with latitude, longitude and a signal column (dBm, RSSI, RSRP, Level), GeoJSON, KML or GPX.">
          <label className="btn primary">📂 Import readings file<input hidden type="file" accept=".csv,.txt,.tsv,.log,.geojson,.json,.kml,.gpx" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <p className="small">Works with files from <b>G-NetTrack</b>, <b>Network Cell Info</b>, <b>WiGLE</b>, cell signal logger apps, Wi-Fi survey apps, and meter software that saves CSV. Indoor grid tests can use <b>Floor</b>, <b>Room</b> and <b>Critical</b> columns instead of GPS.</p>
          {msg && <p className="note">{msg}</p>}
          <div className="stats">
            <Stat label="Readings" value={all.length} />
            <Stat label="With GPS" value={all.filter((r) => r.lat != null).length} />
            <Stat label="Walks / tests" value={sessions.length} />
          </div>
          {sessions.length > 0 && <div className="row wrap">
            <select value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show readings from" data-no-choose><option value="">All readings</option>{sessions.map((s) => <option key={s}>{s}</option>)}</select>
            <button onClick={() => downloadText(`${safeName(p.meta.name)}-signal-readings.csv`, toCsv(readingsCsvRows(rs, predOf)), 'text/csv')}>Export CSV</button>
            <button className="danger" onClick={delSession}>Delete {show ? 'this walk' : 'all'}</button>
          </div>}
        </Card>
      </div>
      <Card title="Real readings compared with the prediction" tour="signal-compare" tip="Each reading with GPS is compared with the coverage prediction at the same spot (measured minus predicted). Close to 0 means the design matches the real world.">
        {!inp ? <p className="muted">Set up the transmitter on Site Data and Equipment to compare with a prediction.</p> : <>
          {verdict && <p className={verdict.tone === 'ok' ? 'okbox' : verdict.tone === 'bad' ? 'warnbox bad' : 'warnbox'}>{verdict.text}</p>}
          <div className="stats">
            <Stat label="Compared" value={cmp!.stats.n} />
            <Stat label="Average measured" value={fmt(cmp!.stats.measuredMean, 1)} unit=" dBm" />
            <Stat label="Average predicted" value={fmt(cmp!.stats.predictedMean, 1)} unit=" dBm" />
            <Stat label="Measured − predicted" value={fmt(cmp!.stats.meanDelta, 1)} unit=" dB" tip="Positive: real signal is stronger than predicted." />
            <Stat label="Spread (σ)" value={fmt(cmp!.stats.sdDelta, 1)} unit=" dB" />
            <Stat label="Within ±6 dB" value={fmt(cmp!.stats.within6Pct, 0)} unit=" %" tone={cmp!.stats.within6Pct >= 70 ? 'ok' : 'warn'} />
          </div>
          <div className="row wrap"><button className="primary" disabled={!gps.length} onClick={toCalibration}>🎯 Calibrate the model with these readings</button><button onClick={() => go('coverage')}>Coverage prediction →</button><button onClick={() => go('optimize')}>Tilt, azimuth & power →</button></div>
        </>}
      </Card>
      <Card title="Map of readings" tour="signal-map" actions={<div className="row wrap">
        <select value={view} onChange={(e) => setView(e.target.value as typeof view)} aria-label="Colour by" data-no-choose><option value="measured">Colour: measured signal</option><option value="delta">Colour: difference from prediction</option><option value="heat">Heat map of readings</option></select>
        <button disabled={!gps.length} onClick={zoomTo}>Zoom to readings</button></div>}>
        <MapView sites={p.sites} txId={p.radio.txSiteId} coverage={view === 'heat' ? null : rt.coverage} floor={-125} height={480} pins pinsDrawAll={false} extra={draw} extraKey={[rs, predOf, view, heat, link ? fix : null]} onMap={(m) => { mapRef.current = m; }} />
        {view === 'delta' ? <p className="small"><span className="pill" style={{ background: 'rgb(37,99,235)', color: '#fff' }}>6+ dB stronger</span> <span className="pill" style={{ background: 'rgb(96,165,250)' }}>3–6 stronger</span> <span className="pill" style={{ background: 'rgb(22,163,74)', color: '#fff' }}>within 3 dB</span> <span className="pill" style={{ background: 'rgb(245,158,11)' }}>3–6 weaker</span> <span className="pill" style={{ background: 'rgb(220,38,38)', color: '#fff' }}>6+ dB weaker</span></p>
          : <p className="small">{RSSI_SCALE.map((s) => <span key={s.min} className="pill" style={{ background: `rgb(${s.color.join(',')})`, marginRight: 4 }}>{s.label}</span>)}</p>}
        <p className="small muted">{view === 'heat' ? 'The heat map fills in between readings. Areas far from any reading stay empty.' : 'Under the dots is the coverage prediction, if it has been run this session. Hover a dot to see measured and predicted.'} Distances in {u.unit}.</p>
      </Card>
      <Card title="ERCES / BDA grid test" tour="signal-grid" tip="Share of readings at or above the minimum signal, per floor. NFPA 1225 and the IFC ask for 90% of general areas and 99% of critical areas (stairs, fire command, pump rooms…) at −95 dBm or better. The AHJ may set other values.">
        <div className="row wrap"><span>Minimum signal</span><span style={{ width: 130 }}><Num value={minDbm} onChange={(v) => setMinDbm(v ?? -95)} unit="dBm" /></span></div>
        {!rs.length ? <p className="muted">Take readings on each floor (tick Critical area in stairs, fire command and pump rooms) to see the result.</p> : <>
          <div className="stats">
            <Stat label="General areas" value={Number.isFinite(grid.pct) ? `${grid.pct}%` : '—'} unit={` of ${grid.n}`} tone={grid.generalOk ? 'ok' : 'bad'} />
            <Stat label="Critical areas" value={Number.isFinite(grid.critPct) ? `${grid.critPct}%` : '—'} unit={` of ${grid.critN}`} tone={grid.criticalOk ? 'ok' : 'bad'} />
            <Stat label="Result" value={grid.generalOk && grid.criticalOk ? 'Pass' : 'Fail'} tone={grid.generalOk && grid.criticalOk ? 'ok' : 'bad'} />
          </div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Floor</th><th>Readings</th><th>General ≥ {minDbm} dBm</th><th>Critical ≥ {minDbm} dBm</th></tr></thead>
            <tbody>{grid.floors.map((f) => <tr key={f.floor}><td>{f.floor}</td><td>{f.n}</td><td className={f.pct < 90 ? 'bad-text' : ''}>{Number.isFinite(f.pct) ? `${f.pct}%` : '—'}</td><td className={f.critPct < 99 ? 'bad-text' : ''}>{Number.isFinite(f.critPct) ? `${f.critPct}%` : '—'}</td></tr>)}</tbody></table></div>
          <button onClick={toErces}>Use these results on the ERCES / BDA page →</button>
          <p className="small muted">Signal strength only. The grid test also needs delivered audio quality (DAQ 3.0 or better) checked by ear on a portable radio.</p>
        </>}
      </Card>
      {rs.length > 0 && <Card title={`Readings (${rs.length})`}>
        <div className="tbl-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}><table className="tbl"><thead><tr><th>Time</th><th>Signal</th><th>Predicted</th><th>Where</th><th>Source</th><th></th></tr></thead>
          <tbody>{[...rs].reverse().slice(0, 500).map((r) => { const pr = predOf.get(r.id); return <tr key={r.id}>
            <td className="small">{new Date(r.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}</td>
            <td><b style={{ color: color(r.dbm) }}>●</b> {r.dbm} dBm{r.critical && <span className="pill warn" style={{ marginLeft: 4 }}>critical</span>}</td>
            <td>{pr != null ? `${pr} (${r.dbm - pr >= 0 ? '+' : ''}${(r.dbm - pr).toFixed(1)})` : '—'}</td>
            <td className="small">{[r.floor && `Floor ${r.floor}`, r.spot, r.lat != null && `${r.lat.toFixed(5)}, ${r.lon!.toFixed(5)}`].filter(Boolean).join(' · ') || '—'}</td>
            <td className="small">{SOURCE_LABEL[r.source]}{r.tech ? ` · ${r.tech}` : ''}</td>
            <td><button className="ghost" aria-label="Delete reading" onClick={() => update((d) => { d.signalReadings = (d.signalReadings ?? []).filter((x) => x.id !== r.id); })}>✕</button></td></tr>; })}</tbody></table></div>
        {rs.length > 500 && <p className="small muted">Showing the newest 500. Export CSV for all of them.</p>}
      </Card>}
    </div>
  );
}

/** Rough size of the area covered by readings (km). */
function spread(rs: { lat?: number; lon?: number }[]): number {
  if (rs.length < 2) return 0.3; const la = rs.map((r) => r.lat!), lo = rs.map((r) => r.lon!);
  return Math.max((Math.max(...la) - Math.min(...la)) * 111, (Math.max(...lo) - Math.min(...lo)) * 111 * Math.cos((la[0] * Math.PI) / 180));
}
