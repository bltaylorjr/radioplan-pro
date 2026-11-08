import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Check } from '../components/ui';
import { Terrain3D } from '../components/Terrain3D';
import { fetchDemArea } from '../engine/terrain';
import { downloadTerrain, boundsAround } from '../engine/autoterrain';
import { haversineKm } from '../engine/geo';
import { demBounds } from '../engine/terrain';
import { loadCommSites, type CommSite } from '../engine/towers';

export default function View3DPage() {
  const { project: p, rt, setRt } = useStore();
  const [exag, setExag] = useState(3);
  const [showF, setShowF] = useState(true);
  const [msg, setMsg] = useState('');
  const [showT, setShowTState] = useState(() => { try { return localStorage.getItem('radioplan.towers3d') !== '0'; } catch { return true; } });
  const setShowT = (v: boolean) => { setShowTState(v); try { localStorage.setItem('radioplan.towers3d', v ? '1' : '0'); } catch {} };
  const [comm, setComm] = useState<CommSite[]>([]);
  const [tmsg, setTmsg] = useState('');
  useEffect(() => {
    if (!showT || !rt.dem) { setComm([]); setTmsg(''); return; }
    const b = demBounds(rt.dem); const ac = new AbortController(); setTmsg('Loading existing towers…');
    loadCommSites(b.south, b.west, b.north, b.east, { online: navigator.onLine, signal: ac.signal })
      .then((r) => { setComm(r.sites); setTmsg(`${r.sites.length} existing tower${r.sites.length === 1 ? '' : 's'} / comm sites from OpenStreetMap.${r.missing ? ' Part of this area is not saved for offline use, so some may be missing.' : ''}`); })
      .catch((e) => { if ((e as Error).name !== 'AbortError') setTmsg(`Tower lookup failed: ${(e as Error).message}`); });
    return () => ac.abort();
  }, [showT, rt.dem]);
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
        <Field label="Overlays"><span className="row wrap"><Check value={showF} onChange={setShowF} label="First Fresnel zone" /><Check value={showT} onChange={setShowT} label="Existing towers (labeled)" /></span></Field>
        <Field label="Terrain"><span className="row"><span className="muted small">{rt.dem ? rt.dem.source : 'none loaded'}</span><button onClick={fetchArea}>🌐 Download terrain</button></span></Field>
      </div>
      {msg && <p className="note">{msg}</p>}
      {rt.dem ? <Terrain3D dem={rt.dem} sites={p.sites} txId={p.radio.txSiteId} rxId={p.radio.rxSiteId} fMHz={p.radio.fMHz} kFactor={p.radio.kFactor} clutterM={p.radio.clutterM} exag={exag} showFresnel={showF} profile={rt.profile} comm={showT ? comm : undefined} />
        : <div className="three empty">Terrain downloads automatically when you are online, or load it on <a href="#terrain">Map &amp; Terrain</a>.</div>}
      {showT && tmsg && <p className="small">{tmsg}</p>}
      <p className="small muted">Towers: red = TX, blue = RX, purple = existing towers and comm sites (OpenStreetMap contributors; heights and owners may be missing or out of date, so check the FCC ASR database and the owner before relying on one). Path line turns red when the path fails 60% Fresnel clearance.</p>
    </Card>
  );
}
