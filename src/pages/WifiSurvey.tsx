import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { useStore, downloadText, safeName } from '../store';
import { Card, Field, Num, Sel, Stat, fmt } from '../components/ui';
import { MapView } from '../components/MapView';
import { parseScan, importSurveyFile, wifiGrid, WIFI_VIEWS, WifiView, signalColor, WIFI_LEGENDS, CAT_COLORS, readingMetrics, bandOf } from '../engine/wifi';
import { toCsv } from '../engine/csv';
import { uid } from '../defaults';
import type { WifiAp, WifiReading } from '../types';

const PX = 900;
const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function WifiSurveyPage() {
  const { project: p, update } = useStore();
  const w = p.wifi, plan = p.indoor;
  const cv = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState<WifiView>('signal');
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [paste, setPaste] = useState('');
  const [manual, setManual] = useState<{ ssid: string; bssid: string; channel: number | null; rssi: number | null; noise: number | null }>({ ssid: '', bssid: '', channel: null, rssi: null, noise: null });
  const [msg, setMsg] = useState('');
  const scale = PX / plan.widthM, PY = Math.round(plan.heightM * scale);
  useEffect(() => { if (!plan.floorPlanDataUrl) { setImg(null); return; } const i = new Image(); i.onload = () => setImg(i); i.src = plan.floorPlanDataUrl; }, [plan.floorPlanDataUrl]);
  const indoor = w.readings.filter((r) => r.lat == null);
  const outdoor = w.readings.filter((r) => r.lat != null && r.lon != null);
  const ssids = useMemo(() => [...new Set(w.readings.flatMap((r) => r.aps.map((a) => a.ssid)).filter(Boolean))].sort(), [w.readings]);
  const grid = useMemo(() => wifiGrid(indoor, view, { widthM: plan.widthM, heightM: plan.heightM, nx: 90, ssid: w.ssidFilter, targetDbm: w.targetDbm, radiusM: w.radiusM }), [indoor, view, plan.widthM, plan.heightM, w.ssidFilter, w.targetDbm, w.radiusM]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => [...new Set(grid.cats.filter((c): c is string => !!c))].sort(), [grid]);
  const catColor = (c: string) => CAT_COLORS[cats.indexOf(c) % CAT_COLORS.length];

  useEffect(() => {
    const c = cv.current; if (!c) return; c.width = PX; c.height = PY;
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, PX, PY);
    if (img) g.drawImage(img, 0, 0, PX, PY);
    // Paint the grid at native resolution, then scale up smoothly (no seams between cells).
    const off = document.createElement('canvas'); off.width = grid.nx; off.height = grid.ny;
    const og = off.getContext('2d')!, im = og.createImageData(grid.nx, grid.ny);
    for (let k = 0; k < grid.nx * grid.ny; k++) {
      let rgb: [number, number, number] | null = null;
      if (view === 'channel' || view === 'ap') { const cat = grid.cats[k]; if (cat) rgb = hexRgb(catColor(cat)); } else rgb = signalColor(grid.vals[k], view);
      if (rgb) im.data.set([rgb[0], rgb[1], rgb[2], 120], k * 4);
    }
    og.putImageData(im, 0, 0);
    g.imageSmoothingEnabled = view !== 'channel' && view !== 'ap'; g.drawImage(off, 0, 0, PX, PY); g.imageSmoothingEnabled = true;
    for (const r of indoor) {
      const m = readingMetrics(r, w.ssidFilter, w.targetDbm);
      g.beginPath(); g.arc(r.x * scale, r.y * scale, 6, 0, Math.PI * 2); g.fillStyle = '#1e3a5f'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#1e3a5f'; g.font = '11px system-ui'; g.fillText(m.best ? `${m.best.rssiDbm}` : '—', r.x * scale + 8, r.y * scale + 4);
    }
    if (pending) { g.strokeStyle = '#ef6c00'; g.lineWidth = 3; g.beginPath(); g.arc(pending.x * scale, pending.y * scale, 10, 0, Math.PI * 2); g.stroke(); }
  }, [img, grid, indoor, pending, PY, scale, view, w.ssidFilter, w.targetDbm]); // eslint-disable-line react-hooks/exhaustive-deps

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    setPending({ x: Math.round((((e.clientX - b.left) / b.width) * plan.widthM) * 10) / 10, y: Math.round((((e.clientY - b.top) / b.height) * plan.heightM) * 10) / 10 });
  };
  const apsFromInputs = (): WifiAp[] => {
    if (paste.trim()) { const r = parseScan(paste); if (!r.aps.length) throw new Error(`Could not read that scan (format: ${r.format}). Supported: Windows "netsh wlan show networks mode=bssid", Linux "nmcli dev wifi" or "iw dev wlan0 scan", macOS "airport -s" / "airport -I", or CSV.`); return r.aps; }
    if (manual.rssi == null) throw new Error('Paste a scan, or enter at least the signal (dBm) for one access point.');
    const ch = manual.channel ?? 0; return [{ ssid: manual.ssid, bssid: manual.bssid.toLowerCase(), channel: ch, band: bandOf(ch), rssiDbm: manual.rssi, noiseDbm: manual.noise ?? undefined }];
  };
  const addAt = (pos: Partial<WifiReading>) => {
    try { const aps = apsFromInputs(); const rd: WifiReading = { id: uid(), x: 0, y: 0, t: new Date().toISOString(), aps, ...pos };
      update((d) => { d.wifi.readings.push(rd); }); setPaste(''); setPending(null); setMsg(`Added a reading with ${aps.length} access point${aps.length === 1 ? '' : 's'}.`); }
    catch (e) { setMsg((e as Error).message); }
  };
  const addGps = () => {
    if (!navigator.geolocation) { setMsg('No location service on this device.'); return; }
    navigator.geolocation.getCurrentPosition((g) => addAt({ lat: g.coords.latitude, lon: g.coords.longitude }), (e) => setMsg(`GPS error: ${e.message}`), { enableHighAccuracy: true, timeout: 20000 });
  };
  const importFile = async (f?: File) => {
    if (!f) return;
    try { const r = importSurveyFile(await f.text()); update((d) => { d.wifi.readings.push(...r.readings); }); setMsg(`Imported ${r.readings.length} readings (${r.rows} rows, positioned by ${r.positioned === 'xy' ? 'floor-plan x/y metres' : 'GPS latitude/longitude'}).`); }
    catch (e) { setMsg(`Import failed: ${(e as Error).message}`); }
  };
  const onPlan = (f?: File) => { if (!f) return; const r = new FileReader(); r.onload = () => update((d) => { d.indoor.floorPlanDataUrl = r.result as string; }); r.readAsDataURL(f); };
  const exportCsv = () => {
    const rows: (string | number | undefined)[][] = [['point', 'x', 'y', 'latitude', 'longitude', 'time', 'ssid', 'bssid', 'channel', 'band', 'rssi', 'noise']];
    w.readings.forEach((r, i) => r.aps.forEach((a) => rows.push([i + 1, r.x, r.y, r.lat, r.lon, r.t, a.ssid, a.bssid, a.channel, a.band, a.rssiDbm, a.noiseDbm])));
    downloadText(`${safeName(p.meta.name)}_wifi_survey.csv`, toCsv(rows), 'text/csv');
  };
  const apTable = useMemo(() => {
    const m = new Map<string, { ssid: string; bssid: string; channel: number; band?: string; max: number; n: number }>();
    for (const r of w.readings) for (const a of r.aps) { const k = a.bssid || `${a.ssid}/${a.channel}`; const e = m.get(k); if (e) { e.max = Math.max(e.max, a.rssiDbm); e.n++; } else m.set(k, { ssid: a.ssid, bssid: a.bssid, channel: a.channel, band: a.band, max: a.rssiDbm, n: 1 }); }
    return [...m.values()].sort((a, b) => b.max - a.max);
  }, [w.readings]);
  const covered = (() => { let tot = 0, ok = 0; const g = wifiGrid(indoor, 'signal', { widthM: plan.widthM, heightM: plan.heightM, nx: 90, ssid: w.ssidFilter, targetDbm: w.targetDbm, radiusM: w.radiusM }); for (const v of g.vals) { if (Number.isNaN(v)) continue; tot++; if (v >= w.targetDbm) ok++; } return { tot, pct: tot ? (ok / tot) * 100 : 0 }; })();
  const drawOutdoor = (g: L.LayerGroup) => { for (const r of outdoor) { const m = readingMetrics(r, w.ssidFilter, w.targetDbm); const c = m.best ? signalColor(m.best.rssiDbm, 'signal') : null;
    L.circleMarker([r.lat!, r.lon!], { radius: 6, weight: 1, color: '#333', fillColor: c ? `rgb(${c.join(',')})` : '#999', fillOpacity: 0.9 }).bindTooltip(m.best ? `${m.best.ssid} ${m.best.rssiDbm} dBm ch ${m.best.channel}` : 'no APs').addTo(g); } };
  const legend = view === 'channel' || view === 'ap' ? cats.map((c) => [catColor(c), c] as [string, string]) : WIFI_LEGENDS[view] ?? [];
  return (
    <div className="stack">
      <div className="grid2">
        <Card title="Wi-Fi survey setup" tour="wifi-setup" tip="The floor plan and its size are shared with the Indoor Planning page.">
          <div className="form">
            <Field label="Floor plan image" tip="PNG, JPG, GIF, WebP or SVG. For a PDF plan, export the page to PNG first."><span className="row"><input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp" onChange={(e) => onPlan(e.target.files?.[0])} /></span></Field>
            <Field label="Plan width" tip="Real width of the image, for scale."><Num value={plan.widthM} onChange={(v) => update((d) => { d.indoor.widthM = Math.max(2, v ?? 60); })} unit="m" /></Field>
            <Field label="Plan depth"><Num value={plan.heightM} onChange={(v) => update((d) => { d.indoor.heightM = Math.max(2, v ?? 40); })} unit="m" /></Field>
            <Field label="Target signal" tip="−67 dBm is the common design target for voice and video; −72 dBm for data only."><Num value={w.targetDbm} onChange={(v) => update((d) => { d.wifi.targetDbm = v ?? -67; })} unit="dBm" /></Field>
            <Field label="Interpolation radius" tip="How far from a reading the map is filled in. Keep it near your walking-path spacing."><Num value={w.radiusM} onChange={(v) => update((d) => { d.wifi.radiusM = Math.max(1, v ?? 8); })} unit="m" /></Field>
            <Field label="Network (SSID)"><Sel value={w.ssidFilter} onChange={(v) => update((d) => { d.wifi.ssidFilter = v; })} options={[['', 'All networks'], ...ssids.map((s) => [s, s] as [string, string])]} /></Field>
          </div>
          <div className="row wrap"><label className="btn">📂 Import survey file (CSV)<input hidden type="file" accept=".csv,.txt,.tsv" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <button disabled={!w.readings.length} onClick={exportCsv}>⬇ Export readings CSV</button>
            <button disabled={!w.readings.length} onClick={() => { if (confirm('Delete all Wi-Fi readings?')) update((d) => { d.wifi.readings = []; }); }}>Clear readings</button></div>
          <p className="small muted">Web browsers and Android web apps are not allowed to scan Wi-Fi, so each reading comes from a scan you paste or import. On a Windows laptop run <code>netsh wlan show networks mode=bssid</code>; on Linux <code>nmcli dev wifi</code> or <code>sudo iw dev wlan0 scan</code>; on a Mac hold Option and click the Wi-Fi icon, or use <code>airport -I</code> for signal and noise. Survey apps that export CSV (with x/y or latitude/longitude per row) import in one step.</p>
        </Card>
        <Card title="Add a reading" tour="wifi-add">
          <p className="small">{pending ? <>Position: <b>{pending.x} m, {pending.y} m</b> on the plan.</> : 'Click the floor plan where you are standing, then paste the scan taken there.'}</p>
          <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste scan output here (netsh / nmcli / iw / airport / CSV)…" style={{ width: '100%' }} />
          <details><summary className="small">…or enter one access point by hand</summary>
            <div className="form">
              <Field label="SSID"><input type="text" value={manual.ssid} onChange={(e) => setManual({ ...manual, ssid: e.target.value })} /></Field>
              <Field label="BSSID / AP"><input type="text" value={manual.bssid} onChange={(e) => setManual({ ...manual, bssid: e.target.value })} /></Field>
              <Field label="Channel"><Num value={manual.channel} nullable onChange={(v) => setManual({ ...manual, channel: v })} /></Field>
              <Field label="Signal"><Num value={manual.rssi} nullable onChange={(v) => setManual({ ...manual, rssi: v })} unit="dBm" /></Field>
              <Field label="Noise"><Num value={manual.noise} nullable onChange={(v) => setManual({ ...manual, noise: v })} unit="dBm" /></Field>
            </div></details>
          <div className="row wrap"><button className="primary" disabled={!pending} onClick={() => addAt({ x: pending!.x, y: pending!.y })}>Add reading at marked spot</button>
            <button onClick={addGps} title="Outdoor survey: records the device's GPS position with the reading">📍 Add outdoor reading at my GPS position</button></div>
          {msg && <p className="note">{msg}</p>}
        </Card>
      </div>
      <Card title="Survey map" tour="wifi-map" actions={<Sel value={view} onChange={setView} options={WIFI_VIEWS} />}>
        <canvas ref={cv} className="wifi-canvas" onClick={onClick} aria-label="Floor plan survey map. Click to mark a reading position." />
        <div className="legend">{legend.map(([c, l]) => <span key={l}><span className="lg" style={{ background: c }} />{l}</span>)}{(view === 'noise' || view === 'snr') && !indoor.some((r) => r.aps.some((a) => a.noiseDbm != null)) && <span className="muted small">No noise values in these readings (macOS "airport -I" and most survey tools report noise; Windows and nmcli do not).</span>}</div>
        <div className="stats">
          <Stat label="Indoor readings" value={indoor.length} />
          <Stat label={`Surveyed area ≥ ${w.targetDbm} dBm`} value={covered.tot ? fmt(covered.pct, 1) : '—'} unit={covered.tot ? ' %' : ''} tone={covered.pct >= 95 ? 'ok' : covered.pct >= 80 ? 'warn' : covered.tot ? 'bad' : undefined} />
          <Stat label="Access points heard" value={apTable.length} />
          <Stat label="Outdoor (GPS) readings" value={outdoor.length} />
        </div>
      </Card>
      {apTable.length > 0 && <Card title="Access points">
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>SSID</th><th>BSSID</th><th>Channel</th><th>Band</th><th>Strongest</th><th>Readings</th></tr></thead>
          <tbody>{apTable.slice(0, 60).map((a) => <tr key={a.bssid + a.ssid + a.channel}><td>{a.ssid || '(hidden)'}</td><td><code>{a.bssid}</code></td><td>{a.channel}</td><td>{a.band}</td><td>{a.max} dBm</td><td>{a.n}</td></tr>)}</tbody></table></div>
        <h4>Readings</h4>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>Position</th><th>Best AP</th><th>Signal</th><th>SNR</th><th>Co-channel</th><th></th></tr></thead>
          <tbody>{w.readings.map((r, i) => { const m = readingMetrics(r, w.ssidFilter, w.targetDbm); return <tr key={r.id}><td>{i + 1}</td><td>{r.lat != null ? `${r.lat.toFixed(6)}, ${r.lon!.toFixed(6)}` : `${r.x} m, ${r.y} m`}</td><td>{m.best ? `${m.best.ssid} ch ${m.best.channel}` : '—'}</td><td>{m.best?.rssiDbm ?? '—'} dBm</td><td>{m.snr != null ? `${fmt(m.snr, 0)} dB` : '—'}</td><td>{m.cochannel}</td>
            <td><button className="small" onClick={() => update((d) => { d.wifi.readings = d.wifi.readings.filter((x) => x.id !== r.id); })} aria-label="Delete reading">✕</button></td></tr>; })}</tbody></table></div>
      </Card>}
      {outdoor.length > 0 && <Card title="Outdoor readings (GPS)"><MapView sites={p.sites} height={420} center={{ lat: outdoor[0].lat!, lon: outdoor[0].lon!, zoom: 17 }} extra={drawOutdoor} extraKey={[outdoor, w.ssidFilter]} /></Card>}
    </div>
  );
}
