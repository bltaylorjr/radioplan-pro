// Offline map packs: pick a job area, see the size, download satellite + topo + terrain before going where there's no signal.
// The download keeps going if you open another page (badge at the top shows progress).
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useStore } from '../store';
import { Card, Field, Txt, Check, Stat } from './ui';
import { DistNum, useUnits } from '../units';
import { PointPicker, type PickedPoint } from './PointPicker';
import { askConfirm } from './askConfirm';
import { boundsAround, type Bounds } from '../engine/autoterrain';
import { PACK_LAYERS, PACK_TILE_LIMIT, estimatePack, downloadPack, listPacks, deletePack, checkPack, boundsAroundPoint, boundsSizeKm, bestZoomFor, etaText, upsertPack, type MapPack, type PackProgress } from '../engine/mappacks';
import { requestPersist, storageInfo, fmtBytes } from '../engine/projectdb';

// ---- one download at a time, shared across pages ----
type Job = { pack: MapPack; pr: PackProgress | null; state: 'running' | 'done' | 'stopped' | 'failed'; ctrl: AbortController; msg: string } | null;
let job: Job = null; const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useMapPackJob = () => useSyncExternalStore(subscribe, () => job, () => job);
async function startJob(pack: MapPack, refresh = false) {
  if (job?.state === 'running') return;
  const ctrl = new AbortController();
  job = { pack, pr: null, state: 'running', ctrl, msg: '' }; emit();
  await requestPersist().catch(() => null);
  await upsertPack(pack);
  try {
    const out = await downloadPack(pack, (pr) => { if (job) { job = { ...job, pr }; emit(); } }, ctrl.signal, { refresh });
    job = { ...job!, pack: out, state: ctrl.signal.aborted ? 'stopped' : 'done', msg: ctrl.signal.aborted ? 'Stopped. What was downloaded is kept; tap Finish to carry on.' : out.complete ? `✓ “${out.name}” is ready offline.` : `Saved, but ${out.failed.toLocaleString()} tiles could not be downloaded. Tap Finish later to try them again.` };
  } catch (e) { job = { ...job!, state: 'failed', msg: `Download failed: ${(e as Error).message}` }; }
  emit();
}

/** Small top-bar badge while a pack downloads. */
export function MapPackBadge({ onOpen }: { onOpen: () => void }) {
  const j = useMapPackJob();
  if (!j || j.state !== 'running') return null;
  const pct = j.pr ? Math.floor((j.pr.done / Math.max(1, j.pr.total)) * 100) : 0;
  return <button className="chip terr" onClick={onOpen} title={`Downloading map pack “${j.pack.name}”`}>⬇ Map pack {pct}%</button>;
}

export function MapPacks({ viewBounds }: { viewBounds?: Bounds | null }) {
  const { project: p } = useStore();
  const u = useUnits();
  const j = useMapPackJob();
  const [packs, setPacks] = useState<MapPack[]>([]);
  const [have, setHave] = useState<Record<string, { have: number; total: number; bytes: number }>>({});
  const [mode, setMode] = useState<'sites' | 'point' | 'view'>('sites');
  const [pt, setPt] = useState<PickedPoint | null>(null);
  const [radiusKm, setRadiusKm] = useState(16.09344);
  const [detail, setDetail] = useState<number>(15);
  const [layers, setLayers] = useState<Record<string, boolean>>({ satellite: true, topo: true });
  const [terrain, setTerrain] = useState(true);
  const [name, setName] = useState('');
  const [free, setFree] = useState<number | null>(null);
  const refresh = () => listPacks().then(setPacks).catch(() => setPacks([]));
  useEffect(() => { refresh(); storageInfo().then((s) => setFree(s.quota ? s.quota - s.usage : null)).catch(() => null); }, [j?.state]);
  const bounds: Bounds | null = mode === 'view' ? viewBounds ?? null : mode === 'point' ? (pt ? boundsAroundPoint(pt.lat, pt.lon, radiusKm) : null) : p.sites.length ? boundsAround(p.sites, radiusKm) : null;
  const L = Object.keys(PACK_LAYERS).filter((k) => layers[k]);
  const spec = bounds ? { bounds, zMin: 6, zMax: detail, layers: L, terrain } : null;
  const est = spec ? estimatePack(spec) : null;
  const size = bounds ? boundsSizeKm(bounds) : null;
  const tooBig = !!est && est.tiles > PACK_TILE_LIMIT;
  const running = j?.state === 'running';
  const defName = mode === 'point' ? pt?.label ?? 'Job area' : mode === 'view' ? 'Map view area' : `${p.meta.name || 'Project'} area`;
  const start = () => {
    if (!spec || !est) return;
    const pack: MapPack = { id: Date.now().toString(36), name: (name || defName).slice(0, 60), ...spec, createdAt: new Date().toISOString(), tiles: 0, failed: 0, bytes: 0, complete: false,
      areaNote: `${u.f(size!.wKm, 1)} × ${u.f(size!.hKm, 1)}` };
    setName(''); startJob(pack);
  };
  const check = async (pk: MapPack) => setHave({ ...have, [pk.id]: await checkPack(pk) });
  const del = async (pk: MapPack) => { if (await askConfirm({ title: 'Delete map pack?', message: <>Delete “{pk.name}” ({fmtBytes(pk.bytes)}) from this device? Map tiles that another pack also uses are kept.</>, ok: 'Delete', danger: true })) { await deletePack(pk.id); refresh(); } };
  const pr = j?.pr;
  return (
    <Card title="Offline map packs" tip="Download satellite pictures, topo maps and terrain for a whole job area while you have internet. Maps, 3D, line of sight and coverage then work there with no signal.">
      <div className="form">
        <Field label="Area" wide><span className="row wrap">
          <button className={mode === 'sites' ? 'primary' : ''} onClick={() => setMode('sites')}>Around my project sites</button>
          <button className={mode === 'point' ? 'primary' : ''} onClick={() => setMode('point')}>Around an address or GPS</button>
          {viewBounds !== undefined && <button className={mode === 'view' ? 'primary' : ''} onClick={() => setMode('view')} disabled={!viewBounds}>What the map shows</button>}
        </span></Field>
        {mode === 'point' && <Field label="Spot" wide><PointPicker value={pt} onChange={setPt} label="Center" /></Field>}
        {mode !== 'view' && <Field label="Distance around"><DistNum km={radiusKm} onChange={(v) => setRadiusKm(Math.max(0.5, Math.min(80, v ?? 8)))} /></Field>}
        <Field label="Detail" wide tip="Street level (15) is good for most jobs. Each step up has 4 times the tiles."><span className="row wrap">
          {([[13, 'Area overview'], [15, 'Street level'], [16, 'Most detail']] as [number, string][]).map(([z, l]) => <button key={z} className={detail === z ? 'primary' : ''} onClick={() => setDetail(z)}>{l}</button>)}
          {spec && <button className="ghost small" onClick={() => setDetail(bestZoomFor(spec))} title="The most detail that fits the size limit">Best that fits</button>}
        </span></Field>
        <Field label="What to save" wide><span className="stack-tight">
          {Object.entries(PACK_LAYERS).map(([k, v]) => <Check key={k} value={!!layers[k]} onChange={(x) => setLayers({ ...layers, [k]: x })} label={`${v.label}: ${v.note}`} />)}
          <Check value={terrain} onChange={setTerrain} label="Terrain (ground height): needed for path profiles, line of sight, coverage and 3D" />
        </span></Field>
        <Field label="Name"><Txt value={name} onChange={setName} placeholder={defName} /></Field>
      </div>
      {est && size && <div className="stats">
        <Stat label="Area" value={`${u.f(size.wKm, 1)} × ${u.f(size.hKm, 1)}`} />
        <Stat label="Tiles" value={est.tiles.toLocaleString()} tone={tooBig ? 'bad' : 'ok'} />
        <Stat label="About" value={est.mb < 1 ? '< 1 MB' : `${Math.round(est.mb)} MB`} tone={free != null && est.mb * 1048576 > free ? 'bad' : undefined} tip={est.perLayer.map((x) => `${x.label}: ${x.tiles.toLocaleString()} tiles ≈ ${Math.round(x.mb)} MB`).join('\n')} />
        {free != null && <Stat label="Free space for the app" value={fmtBytes(free)} />}
      </div>}
      {!bounds && <p className="small muted">{mode === 'sites' ? 'Add a site on Site Data & GPS first.' : mode === 'point' ? 'Pick a spot.' : 'Open this on Map & Terrain to use the map view.'}</p>}
      {tooBig && <p className="note bad-text">Too big ({est!.tiles.toLocaleString()} tiles; limit {PACK_TILE_LIMIT.toLocaleString()}). Make the area smaller, pick less detail, or tap “Best that fits”.</p>}
      <div className="row wrap">
        {running ? <button onClick={() => j!.ctrl.abort()}>■ Stop</button>
          : <button className="primary" disabled={!est || tooBig || !L.length && !terrain || !navigator.onLine} onClick={start}>⬇ Download map pack</button>}
        {!navigator.onLine && !running && <span className="small muted">Connect to the internet to download.</span>}
      </div>
      {running && pr && <div className="stack-tight" style={{ marginTop: 8 }}>
        <div className="progressbar"><div style={{ width: `${(pr.done / Math.max(1, pr.total)) * 100}%` }} /></div>
        <span className="small">“{j!.pack.name}”: {Math.floor((pr.done / Math.max(1, pr.total)) * 100)}% · {pr.done.toLocaleString()} of {pr.total.toLocaleString()} tiles · {fmtBytes(pr.bytes)}{pr.failed ? ` · ${pr.failed} failed` : ''} · {etaText(pr)}. You can open other pages; it keeps going.</span>
      </div>}
      {j?.msg && !running && <p className="note">{j.msg}</p>}

      {packs.length > 0 && <>
        <h4>Saved on this device</h4>
        <div className="scroll-x"><table className="tbl"><thead><tr><th>Pack</th><th>Area</th><th>Saved</th><th>Size</th><th>Status</th><th></th></tr></thead><tbody>
          {packs.map((pk) => { const h = have[pk.id]; return <tr key={pk.id}>
            <td><b>{pk.name}</b><div className="small muted">{pk.layers.map((k) => PACK_LAYERS[k]?.label.replace(/ \(USGS\)/, '')).join(', ')}{pk.terrain ? ', terrain' : ''} · detail {pk.zMax}</div></td>
            <td className="nowrap small">{pk.areaNote ?? ''}</td><td className="small nowrap">{pk.createdAt.slice(0, 10)}</td><td className="nowrap">{fmtBytes(pk.bytes)}</td>
            <td className="small">{h ? `${Math.floor((h.have / Math.max(1, h.total)) * 100)}% on device` : pk.complete ? '✓ Ready offline' : `${pk.failed.toLocaleString()} tiles missing`}</td>
            <td className="nowrap"><button className="small" disabled={running || !navigator.onLine} onClick={() => startJob(pk)} title="Download any missing tiles">{pk.complete ? 'Check' : 'Finish'}</button>{' '}
              <button className="small" disabled={running || !navigator.onLine} onClick={() => startJob(pk, true)} title="Download every tile again for the newest pictures">Update</button>{' '}
              <button className="small" onClick={() => check(pk)}>Verify</button>{' '}
              <button className="small ghost" onClick={() => del(pk)} disabled={running}>Delete</button></td>
          </tr>; })}
        </tbody></table></div>
      </>}
      <p className="small muted">Map packs use public-domain USGS maps and pictures and the AWS open terrain data (USGS 3DEP). OpenStreetMap, OpenTopoMap and Esri maps are saved only as you look at them, per their terms. Pictures and maps of saved areas also show on the 3D tilt view.</p>
    </Card>
  );
}
