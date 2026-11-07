import { DistNum } from '../units';
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Check, Badge } from './ui';
import { BASEMAPS } from './MapView';
import { boundsAround, downloadTerrain, Bounds } from '../engine/autoterrain';
import { countTiles, prefetchTiles } from '../engine/offline';
import { cacheStats, cacheClear } from '../engine/tilecache';

/** Pre-download maps + terrain for the project area so everything works with no connection. */
export function OfflineArea({ viewBounds }: { viewBounds?: Bounds | null }) {
  const { project: p, update, setRt } = useStore();
  const bulk = Object.entries(BASEMAPS).filter(([, v]) => v.bulk);
  const [layers, setLayers] = useState<Record<string, boolean>>({ 'USGS Topo': true, 'Satellite + Topo (USGS)': true });
  const [margin, setMargin] = useState(Math.max(5, p.radio.coverageRadiusKm));
  const [zMax, setZMax] = useState(15);
  const [useView, setUseView] = useState(false);
  const [prog, setProg] = useState<{ d: number; n: number; f: number } | null>(null);
  const [stats, setStats] = useState<{ count: number; bytes: number } | null>(null);
  const [msg, setMsg] = useState('');
  const abort = useRef<AbortController>();
  const refresh = () => cacheStats().then(setStats).catch(() => setStats(null));
  useEffect(() => { refresh(); }, []);
  const b = useView && viewBounds ? viewBounds : boundsAround(p.sites, margin);
  const zMin = 8;
  const tpls = bulk.filter(([k]) => layers[k]).map(([, v]) => v.url);
  const n = tpls.length * countTiles(b, zMin, zMax);
  const limit = 20000;
  const run = async () => {
    abort.current = new AbortController(); setMsg('');
    try {
      setMsg('Downloading terrain…');
      const t = await downloadTerrain(b, { maxTiles: 120 });
      setRt((r) => ({ ...r, dem: t.dem, demAuto: true, terrainStatus: `Terrain ✓ ~${t.resolutionM.toFixed(0)} m` }));
      const res = await prefetchTiles(tpls, b, zMin, zMax, (d, total, f) => setProg({ d, n: total, f }), abort.current.signal);
      setMsg(abort.current.signal.aborted ? 'Stopped. Tiles downloaded so far are kept.' : `Done: ${res.total - res.failed} map tiles and terrain saved for offline use${res.failed ? ` (${res.failed} unavailable)` : ''}.`);
    } catch (e) { setMsg(`Download failed: ${(e as Error).message}`); }
    setProg(null); refresh();
  };
  return (
    <Card title="Offline maps & terrain" tip="Download an area while online; maps, terrain, 3D, coverage and every calculation then work with no connection (USB, PC and Android).">
      <div className="form">
        <Field label="Automatic terrain"><Check value={p.settings?.autoTerrain ?? true} onChange={(v) => update((d) => { d.settings = { ...(d.settings ?? { terrainMarginKm: 5 }), autoTerrain: v }; })} label="Download terrain for my sites automatically" /></Field>
        <Field label="Automatic maps"><Check value={p.settings?.autoMaps ?? true} onChange={(v) => update((d) => { d.settings = { ...d.settings, autoMaps: v }; })} label="Save the topo map around my sites for offline use" /></Field>
        <Field label="Area"><span className="stack-tight"><Check value={useView} onChange={setUseView} label="Current map view" />{!useView && <DistNum km={margin} onChange={(v) => setMargin(Math.max(1, Math.min(50, v ?? 5)))} suffix=" around sites" />}</span></Field>
        <Field label="Detail (max zoom)" tip="15 ≈ street level; each extra level ×4 tiles."><Num value={zMax} step={1} onChange={(v) => setZMax(Math.max(10, Math.min(16, Math.round(v!))))} /></Field>
        <Field label="Map layers" wide><span className="row wrap">{bulk.map(([k]) => <Check key={k} value={!!layers[k]} onChange={(v) => setLayers({ ...layers, [k]: v })} label={k} />)}</span></Field>
      </div>
      <p className="small">{n.toLocaleString()} map tiles (≈ {(n * 0.025).toFixed(0)} MB) + terrain. {n > limit && <b className="bad-text">Too large: reduce the area or zoom (limit {limit.toLocaleString()}).</b>}</p>
      <div className="row wrap">
        {prog ? <button onClick={() => abort.current?.abort()}>■ Stop</button> : <button className="primary" disabled={n > limit || !navigator.onLine} onClick={run}>⬇ Save area for offline</button>}
        <button onClick={async () => { if (confirm('Delete all cached map and terrain tiles?')) { await cacheClear(); refresh(); } }}>Clear cache</button>
        {stats && <span className="muted small">Cache: {stats.count.toLocaleString()} tiles, {(stats.bytes / 1e6).toFixed(1)} MB</span>}
      </div>
      {prog && <div className="progressbar"><div style={{ width: `${(prog.d / prog.n) * 100}%` }} /></div>}
      {msg && <p className="note">{msg}</p>}
      <p className="small muted">Bulk download is offered only for public-domain USGS maps. OpenStreetMap, OpenTopoMap and Esri satellite tiles are cached as you view them, per their usage terms. <Badge kind="real">Terrain: USGS 3DEP via AWS Open Data</Badge></p>
    </Card>
  );
}
