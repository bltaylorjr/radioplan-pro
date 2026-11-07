import React, { useState } from 'react';
import L from 'leaflet';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Stat, fmt } from '../components/ui';
import { MapView, gridCanvas } from '../components/MapView';
import { GisExport } from '../components/GisExport';
import { computeNetwork, defaultSiteTx, siteEirpDbm, NetworkResult } from '../engine/network';
import { ANTENNAS } from '../data/catalog';
import { rssiColor } from '../engine/coverage';
import { CAT_COLORS } from '../engine/wifi';
import type { SiteTx } from '../types';

type View = 'best' | 'server' | 'ci' | 'overlap';
const CI_SCALE: [number, [number, number, number], string][] = [[30, [0, 150, 60], '≥ 30 dB'], [20, [120, 200, 40], '20–30 dB'], [17, [250, 210, 30], 'required to 20 dB'], [10, [245, 130, 30], '10 dB to required'], [-999, [210, 40, 40], '< 10 dB (interference)']];
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function NetworkPage() {
  const { project: p, update, rt } = useStore();
  const [res, setRes] = useState<NetworkResult | null>(null);
  const [view, setView] = useState<View>('server');
  const [busy, setBusy] = useState(false);
  const [gridN, setGridN] = useState(60);
  const nw = p.network;
  const setTx = (id: string, fn: (t: SiteTx) => void) => update((d) => { const s = d.sites.find((x) => x.id === id)!; if (!s.tx) s.tx = { ...defaultSiteTx(d), enabled: false }; fn(s.tx); });
  const run = () => { setBusy(true); setTimeout(() => { setRes(computeNetwork(p, rt.dem, gridN)); setBusy(false); }, 30); };
  const txSites = p.sites.filter((s) => s.tx?.enabled);
  const ciScale = CI_SCALE.map(([m, c, l]) => [m === 17 ? nw.requiredCiDb : m, c, l.replace('required', `${nw.requiredCiDb} dB`)] as [number, [number, number, number], string]);
  const color = (r: NetworkResult, i: number): [number, number, number] | null => {
    if (Number.isNaN(r.best[i])) return null;
    if (view === 'best') { const c = rssiColor(r.best[i], nw.serviceDbm - 15); return c[3] ? [c[0], c[1], c[2]] : null; }
    if (r.best[i] < nw.serviceDbm) return null;
    if (view === 'server') return hex(CAT_COLORS[r.server[i] % CAT_COLORS.length]);
    if (view === 'ci') { const v = r.ci[i]; for (const [m, c] of ciScale) if (v >= m) return c; return null; }
    const o = r.overlap[i]; return o >= 3 ? [200, 40, 40] : o === 2 ? [245, 160, 30] : [120, 190, 120];
  };
  const draw = (g: L.LayerGroup) => { if (res) L.imageOverlay(gridCanvas(res, (i) => color(res, i), 165), [[res.south, res.west], [res.north, res.east]], { interactive: false }).addTo(g); };
  const bestAsCoverage = res ? { n: res.n, north: res.north, south: res.south, east: res.east, west: res.west, rssi: res.best } : null;
  return (
    <div className="stack">
      <Card title="Transmitting sites" tour="network-sites" tip="Turn on every site that transmits. Import many sites at once on the Site Data page (CSV).">
        <div className="tbl-wrap"><table className="tbl edit"><thead><tr><th>On</th><th>Site</th><th>Freq MHz</th><th>Power dBm</th><th>Antenna</th><th>Az °T</th><th>Tilt °</th><th>Line loss dB</th><th>Channel</th><th>EIRP dBm</th></tr></thead>
          <tbody>{p.sites.map((s) => { const t = s.tx; return <tr key={s.id}>
            <td><input type="checkbox" checked={!!t?.enabled} onChange={(e) => setTx(s.id, (x) => { x.enabled = e.target.checked; })} aria-label={`Transmit from ${s.name}`} /></td>
            <td>{s.name}</td>
            {t ? <>
              <td><Num value={t.fMHz} onChange={(v) => setTx(s.id, (x) => { x.fMHz = v ?? x.fMHz; })} /></td>
              <td><Num value={t.txPowerDbm} onChange={(v) => setTx(s.id, (x) => { x.txPowerDbm = v ?? x.txPowerDbm; })} /></td>
              <td><select value={t.antennaId} onChange={(e) => setTx(s.id, (x) => { x.antennaId = e.target.value; })}>{ANTENNAS.map((a) => <option key={a.id} value={a.id}>{a.brand} {a.model}</option>)}</select></td>
              <td><Num value={t.azimuthDeg} onChange={(v) => setTx(s.id, (x) => { x.azimuthDeg = v ?? 0; })} /></td>
              <td><Num value={t.tiltDeg} onChange={(v) => setTx(s.id, (x) => { x.tiltDeg = v ?? 0; })} /></td>
              <td><Num value={t.lossDb} onChange={(v) => setTx(s.id, (x) => { x.lossDb = v ?? 0; })} /></td>
              <td><input type="text" value={t.channel} onChange={(e) => setTx(s.id, (x) => { x.channel = e.target.value; })} /></td>
              <td>{fmt(siteEirpDbm(t), 1)}</td></> : <td colSpan={8} className="muted small">Tick to add a transmitter here (settings copied from the Equipment page).</td>}
          </tr>; })}</tbody></table></div>
      </Card>
      <div className="grid2">
        <Card title="Interference criteria" tour="network-criteria">
          <div className="form">
            <Field label="Service threshold" tip="Best-server signal needed to count a location as served (street level)."><Num value={nw.serviceDbm} onChange={(v) => update((d) => { d.network.serviceDbm = v ?? -100; })} unit="dBm" /></Field>
            <Field label="Required C/I" tip="Carrier-to-interference ratio needed. Typical starting values: analog FM ≈ 17 dB, P25 Phase 1 C4FM ≈ 13 to 17 dB. Use the value for your modulation and delivered audio quality from TSB-88.1."><Num value={nw.requiredCiDb} onChange={(v) => update((d) => { d.network.requiredCiDb = v ?? 17; })} unit="dB" /></Field>
            <Field label="Channel bandwidth" tip="Transmitters within ±½ bandwidth are co-channel; within 1½ bandwidths are adjacent channel."><Num value={nw.channelBwKHz} onChange={(v) => update((d) => { d.network.channelBwKHz = v ?? 12.5; })} unit="kHz" /></Field>
            <Field label="Adjacent-channel rejection" tip="How far below a co-channel signal an adjacent-channel signal counts (receiver ACR / transmitter ACP), typically 50 to 70 dB."><Num value={nw.acrDb} onChange={(v) => update((d) => { d.network.acrDb = v ?? 60; })} unit="dB" /></Field>
            <Field label="Resolution"><Num value={gridN} step={10} onChange={(v) => setGridN(Math.max(20, Math.min(150, Math.round(v ?? 60))))} unit="cells/side" /></Field>
          </div>
          <button className="primary" disabled={busy || !txSites.length} onClick={run}>{busy ? 'Computing…' : `📡 Analyse ${txSites.length} transmitter${txSites.length === 1 ? '' : 's'}`}</button>
          <p className="small muted">Each site uses the same propagation model and tuning as the Coverage page, with terrain when loaded. Interference is the power sum of all other co-channel and adjacent-channel signals at each location.</p>
        </Card>
        <Card title="Results">
          {res ? <>
            <div className="stats">
              <Stat label="Served (best server ≥ threshold)" value={fmt(res.stats.servedPct, 1)} unit=" %" />
              <Stat label={`Served with C/I ≥ ${nw.requiredCiDb} dB`} value={fmt(res.stats.servedCleanPct, 1)} unit=" %" tone={res.stats.servedCleanPct >= 90 ? 'ok' : 'warn'} />
              <Stat label="Interference-limited" value={fmt(res.stats.interferenceLimitedPct, 1)} unit=" %" tone={res.stats.interferenceLimitedPct > 5 ? 'bad' : 'ok'} />
              <Stat label="Overlap (2+ sites serve)" value={fmt(res.stats.overlapPct, 1)} unit=" %" />
            </div>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Site</th><th>Freq</th><th>Channel</th><th>Best server for</th></tr></thead>
              <tbody>{res.siteIds.map((id, k) => { const s = p.sites.find((x) => x.id === id)!; return <tr key={id}><td><span className="lg" style={{ background: CAT_COLORS[k % CAT_COLORS.length] }} />{s.name}</td><td>{s.tx!.fMHz} MHz</td><td>{s.tx!.channel}</td><td>{fmt(res.stats.perSiteBestPct[k], 1)} %</td></tr>; })}</tbody></table></div>
          </> : <p className="muted">Turn on two or more transmitting sites and run the analysis.</p>}
        </Card>
      </div>
      <Card title="Network map" tour="network-map" actions={<Sel value={view} onChange={setView} options={[['server', 'Best server'], ['ci', 'C/I (interference)'], ['overlap', 'Overlap count'], ['best', 'Best signal']]} />}>
        <MapView sites={p.sites} height={540} extra={draw} extraKey={[res, view, nw.requiredCiDb, nw.serviceDbm]} />
        <div className="legend">
          {view === 'ci' && ciScale.map(([m, c, l]) => <span key={m}><span className="lg" style={{ background: `rgb(${c.join(',')})` }} />{l}</span>)}
          {view === 'overlap' && [['#78be78', '1 site'], ['#f5a01e', '2 sites'], ['#c82828', '3 or more']].map(([c, l]) => <span key={l}><span className="lg" style={{ background: c }} />{l}</span>)}
          {view === 'server' && res?.siteIds.map((id, k) => <span key={id}><span className="lg" style={{ background: CAT_COLORS[k % CAT_COLORS.length] }} />{p.sites.find((s) => s.id === id)?.name}</span>)}
          {view !== 'best' && <span className="muted small">Unserved areas (below {nw.serviceDbm} dBm) are left clear.</span>}
        </div>
        {res && <><h4>Export best-signal layer for GIS</h4><GisExport title={`${p.meta.name} network`} sites={txSites} coverage={bestAsCoverage} tiers={[{ id: 'svc', label: 'Network service', dbm: nw.serviceDbm, extraLossDb: 0, requiredPct: 90, color: '#1565c0' }]} floor={nw.serviceDbm - 15} /></>}
      </Card>
    </div>
  );
}
