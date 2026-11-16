import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Check } from '../components/ui';
import { Terrain3D } from '../components/Terrain3D';
import { demBounds, finestDem } from '../engine/terrain';
import { loadCommSites, type CommSite } from '../engine/towers';

export default function View3DPage() {
  const { project: p, rt } = useStore();
  const [exag, setExag] = useState(3);
  const [showF, setShowF] = useState(true);
  const [whole, setWhole] = useState(false);
  const [showT, setShowTState] = useState(() => { try { return localStorage.getItem('radioplan.towers3d') !== '0'; } catch { return true; } });
  const setShowT = (v: boolean) => { setShowTState(v); try { localStorage.setItem('radioplan.towers3d', v ? '1' : '0'); } catch {} };
  const tx = p.sites.find((s) => s.id === p.radio.txSiteId) ?? p.sites[0];
  const rx = p.sites.find((s) => s.id === p.radio.rxSiteId) ?? p.sites[1];
  // Sharpest terrain that holds both ends of the link (downloaded in the background), or the whole area.
  const linkDem = tx ? finestDem([rt.demPath, rt.dem], rx ? [tx, rx] : [tx]) : null;
  const dem = whole ? rt.dem ?? linkDem : linkDem ?? rt.dem;
  const canChoose = !!rt.dem && !!linkDem && linkDem !== rt.dem;
  const [comm, setComm] = useState<CommSite[]>([]);
  const [tmsg, setTmsg] = useState('');
  useEffect(() => {
    if (!showT || !dem) { setComm([]); setTmsg(''); return; }
    const b = demBounds(dem); const ac = new AbortController(); setTmsg('Loading existing towers…');
    loadCommSites(b.south, b.west, b.north, b.east, { online: navigator.onLine, signal: ac.signal })
      .then((r) => { setComm(r.sites); setTmsg(`${r.sites.length} existing tower${r.sites.length === 1 ? '' : 's'} / comm sites from OpenStreetMap.${r.missing ? ' Part of this area is not saved for offline use, so some may be missing.' : ''}`); })
      .catch((e) => { if ((e as Error).name !== 'AbortError') setTmsg(`Tower lookup failed: ${(e as Error).message}`); });
    return () => ac.abort();
  }, [showT, dem]);
  return (
    <Card title="3D terrain model" tip="Drag to orbit · right-drag to pan · scroll to zoom">
      <div className="form">
        <Field label="Vertical exaggeration" tip="1× = true scale: heights and distances to the same scale. Higher numbers stretch heights so hills are easier to see."><span className="row" style={{ gap: 6 }}><Num value={exag} onChange={(v) => setExag(Math.max(1, Math.min(20, v!)))} unit="×" /><button className={exag === 1 ? 'primary' : ''} aria-pressed={exag === 1} onClick={() => setExag(exag === 1 ? 3 : 1)}>True scale</button></span></Field>
        <Field label="Overlays"><span className="row wrap"><Check value={showF} onChange={setShowF} label="First Fresnel zone" /><Check value={showT} onChange={setShowT} label="Existing towers (labeled)" /></span></Field>
        <Field label="Terrain" tip="Downloads by itself in the background whenever you are online, and is saved for offline use: the whole area around your sites, then extra detail along the radio link."><span className="row wrap" style={{ gap: 6 }}>
          <span className="muted small">{dem ? dem.source : 'not loaded yet'}</span>
          {canChoose && <><button className={!whole ? 'primary' : ''} aria-pressed={!whole} onClick={() => setWhole(false)}>Link detail</button><button className={whole ? 'primary' : ''} aria-pressed={whole} onClick={() => setWhole(true)}>Whole area</button></>}
        </span></Field>
      </div>
      {rt.terrainStatus && !/✓/.test(rt.terrainStatus) && dem && <p className="small muted">{rt.terrainStatus}</p>}
      {dem ? <Terrain3D dem={dem} sites={p.sites} txId={p.radio.txSiteId} rxId={p.radio.rxSiteId} fMHz={p.radio.fMHz} kFactor={p.radio.kFactor} clutterM={p.radio.clutterM} exag={exag} showFresnel={showF} profile={rt.profile} comm={showT ? comm : undefined} />
        : <div className="three empty">{rt.terrainStatus ?? 'Add a site and the terrain downloads by itself when you are online.'}</div>}
      {showT && tmsg && <p className="small">{tmsg}</p>}
      <p className="small muted">Towers: red = TX, blue = RX, purple = existing towers and comm sites (OpenStreetMap contributors; heights and owners may be missing or out of date, so check the FCC ASR database and the owner before relying on one). Path line turns red when the path fails 60% Fresnel clearance.</p>
    </Card>
  );
}
