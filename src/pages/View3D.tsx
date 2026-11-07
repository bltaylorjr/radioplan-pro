import React, { useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Check } from '../components/ui';
import { Terrain3D } from '../components/Terrain3D';
import { fetchDemArea } from '../engine/terrain';
import { downloadTerrain, boundsAround } from '../engine/autoterrain';
import { haversineKm } from '../engine/geo';

export default function View3DPage() {
  const { project: p, rt, setRt } = useStore();
  const [exag, setExag] = useState(3);
  const [showF, setShowF] = useState(true);
  const [msg, setMsg] = useState('');
  const tx = p.sites.find((s) => s.id === p.radio.txSiteId) ?? p.sites[0];
  const rx = p.sites.find((s) => s.id === p.radio.rxSiteId) ?? p.sites[1];
  const fetchArea = async () => {
    setMsg('Downloading terrain…');
    try {
      const pts = rx ? [tx, rx] : [tx];
      const margin = rx ? Math.max(2, haversineKm(tx, rx) * 0.3) : 6;
      const r = await downloadTerrain(boundsAround(pts, margin));
      setRt((x) => ({ ...x, dem: r.dem, demAuto: true })); setMsg(`Loaded ${r.dem.source}.`);
    } catch (e) {
      try { const g = await fetchDemArea(tx, 8, 60); setRt((x) => ({ ...x, dem: g, demAuto: true })); setMsg(`Loaded ${g.source}.`); }
      catch { setMsg(`Terrain download failed (${(e as Error).message}). Offline? Use a cached area or import a DEM file.`); }
    }
  };
  return (
    <Card title="3D terrain model" tip="Drag to orbit · right-drag to pan · scroll to zoom">
      <div className="form">
        <Field label="Vertical exaggeration"><Num value={exag} onChange={(v) => setExag(Math.max(1, Math.min(20, v!)))} unit="×" /></Field>
        <Field label="Overlays"><Check value={showF} onChange={setShowF} label="First Fresnel zone" /></Field>
        <Field label="Terrain"><span className="row"><span className="muted small">{rt.dem ? rt.dem.source : 'none loaded'}</span><button onClick={fetchArea}>🌐 Download terrain</button></span></Field>
      </div>
      {msg && <p className="note">{msg}</p>}
      {rt.dem ? <Terrain3D dem={rt.dem} sites={p.sites} txId={p.radio.txSiteId} rxId={p.radio.rxSiteId} fMHz={p.radio.fMHz} kFactor={p.radio.kFactor} clutterM={p.radio.clutterM} exag={exag} showFresnel={showF} profile={rt.profile} />
        : <div className="three empty">Terrain downloads automatically when you are online, or load it on <a href="#terrain">Map &amp; Terrain</a>.</div>}
      <p className="small muted">Towers: red = TX, blue = RX. Path line turns red when the path fails 60% Fresnel clearance.</p>
    </Card>
  );
}
