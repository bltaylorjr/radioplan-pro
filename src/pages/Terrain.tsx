import React, { useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Check, Stat, Badge } from '../components/ui';
import { MapView } from '../components/MapView';
import { OfflineArea } from '../components/OfflineArea';
import type { Bounds } from '../engine/autoterrain';
import type L from 'leaflet';
import { downloadTerrain, boundsAround } from '../engine/autoterrain';
import { parseEsriAscii, parseHgt, parseGeoTiff, parseLas, fetchDemArea, sampleDem, DemGrid } from '../engine/terrain';

export default function TerrainPage() {
  const { project: p, update, rt, setRt } = useStore();
  const [selId, setSel] = useState(p.sites[0]?.id);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [las, setLas] = useState({ utmZone: 17 as number | null, feet: false, cellM: 2, mode: 'dsm' as 'dsm' | 'dtm' });
  const [radius, setRadius] = useState(10);
  const sel = p.sites.find((s) => s.id === selId) ?? p.sites[0];
  const [vb, setVb] = useState<Bounds | null>(null);
  const onMap = (m: L.Map) => { const u = () => { const b = m.getBounds(); setVb({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }); }; m.on('moveend', u); u(); };
  const setDem = (g: DemGrid) => {
    setRt((r) => ({ ...r, dem: g, demAuto: false, profile: null, coverage: null, terrainStatus: `Terrain: ${g.source}` }));
    let min = Infinity, max = -Infinity; for (const z of g.data) if (!Number.isNaN(z) && z !== g.nodata) { if (z < min) min = z; if (z > max) max = z; }
    setMsg(`Loaded ${g.source}: ${g.ncols}×${g.nrows} cells, elevation ${min.toFixed(0)}-${max.toFixed(0)} m.`);
    update((d) => d.sites.forEach((s) => { const z = sampleDem(g, s); if (z != null) s.groundElevM = Math.round(z * 10) / 10; }));
  };
  const load = async (f?: File) => {
    if (!f) return; setBusy(true); setMsg(`Reading ${f.name}…`);
    try {
      const n = f.name.toLowerCase();
      if (n.endsWith('.asc') || n.endsWith('.txt')) setDem(parseEsriAscii(await f.text(), f.name));
      else if (n.endsWith('.hgt')) setDem(parseHgt(await f.arrayBuffer(), f.name));
      else if (n.endsWith('.tif') || n.endsWith('.tiff')) setDem(await parseGeoTiff(await f.arrayBuffer(), f.name));
      else if (n.endsWith('.las')) setDem(parseLas(await f.arrayBuffer(), f.name, { utmZone: las.utmZone ?? undefined, zUnitsFeet: las.feet, cellM: las.cellM, mode: las.mode }));
      else if (n.endsWith('.laz')) throw new Error('LAZ is compressed; convert to LAS with laszip / PDAL first.');
      else throw new Error('Unsupported file type.');
    } catch (e) { setMsg(`Import failed: ${(e as Error).message}`); }
    setBusy(false);
  };
  const online = async () => {
    setBusy(true); setMsg('Downloading terrain (USGS 3DEP via AWS Terrain Tiles)…');
    try { const r = await downloadTerrain(boundsAround([sel], radius), { maxTiles: 80 }); setDem(r.dem); setRt((x) => ({ ...x, demAuto: true })); }
    catch {
      try { setDem(await fetchDemArea(sel, radius, 48)); setRt((x) => ({ ...x, demAuto: true })); }
      catch (e) { setMsg(`Terrain download failed (offline and not cached?): ${(e as Error).message}`); }
    }
    setBusy(false);
  };
  return (
    <div className="stack">
      <Card title="Topographic map" tip="Click on the map to move the selected site. Use the layer control (top-right) for satellite, USGS topo or shaded relief."
        actions={<span className="row">Move site: <select value={sel?.id} onChange={(e) => setSel(e.target.value)}>{p.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></span>}>
        <MapView sites={p.sites} txId={p.radio.txSiteId} rxId={p.radio.rxSiteId} dem={rt.dem} selectedId={sel?.id} onMap={onMap}
          onClick={(lat, lon) => update((d) => { const s = d.sites.find((x) => x.id === sel.id)!; s.lat = lat; s.lon = lon; s.positionSource = 'Map click'; s.positionAccuracyM = null; if (rt.dem) { const z = sampleDem(rt.dem, { lat, lon }); if (z != null) s.groundElevM = Math.round(z * 10) / 10; } })} />
      </Card>
      <OfflineArea viewBounds={vb} />
      <div className="grid2">
        <Card title="Terrain data (DEM / LiDAR)" tour="dem-import">
          <div className="row wrap">
            <label className="btn primary">📂 Import DEM / LiDAR file<input hidden type="file" accept=".tif,.tiff,.hgt,.asc,.las,.laz,.txt" onChange={(e) => load(e.target.files?.[0])} /></label>
            <span className="muted small">GeoTIFF (WGS84), SRTM .hgt, ESRI .asc, LiDAR .las</span>
          </div>
          <h4>LiDAR options</h4>
          <div className="form">
            <Field label="UTM zone (projected LAS)" tip="NC/SC/GA east: 17; west TN & west GA: 16. Leave blank for geographic LAS."><Num value={las.utmZone} nullable onChange={(v) => setLas({ ...las, utmZone: v })} /></Field>
            <Field label="Grid cell size"><Num value={las.cellM} onChange={(v) => setLas({ ...las, cellM: v! })} unit="m" /></Field>
            <Field label="Surface"><Sel value={las.mode} onChange={(v) => setLas({ ...las, mode: v })} options={[['dsm', 'DSM (trees & buildings)'], ['dtm', 'DTM (bare earth, class 2)']]} /></Field>
            <Field label="Z units"><Check value={las.feet} onChange={(v) => setLas({ ...las, feet: v })} label="Elevations in US feet" /></Field>
          </div>
          <h4>Download terrain (USGS 3DEP)</h4>
          <div className="row"><Num value={radius} onChange={(v) => setRadius(v!)} unit="km radius" /><button disabled={busy} onClick={online}>🌐 Fetch around {sel?.name}</button></div>
          {msg && <p className="note">{msg}</p>}
        </Card>
        <Card title="Loaded terrain">
          {rt.dem ? <div className="stats">
            <Stat label="Source" value={rt.dem.source} />
            <Stat label="Grid" value={`${rt.dem.ncols}×${rt.dem.nrows}`} />
            <Stat label="Cell size" value={(rt.dem.cellDeg * 111320 * Math.cos((sel.lat * Math.PI) / 180)).toFixed(1)} unit=" m" />
          </div> : <p className="muted">No terrain loaded. Calculations fall back to smooth earth until you import a file or fetch online terrain.</p>}
          <p className="small muted">Terrain is kept in memory for this session (re-import after reopening). <Badge kind="beta">LiDAR: uncompressed LAS, UTM or geographic only</Badge></p>
          <p className="small">Free US data: USGS 3DEP via <a href="https://apps.nationalmap.gov/downloader/" target="_blank" rel="noreferrer">The National Map Downloader ↗</a>, NC Spatial Data Downloads (statewide QL2 LiDAR), NOAA Digital Coast.</p>
        </Card>
      </div>
    </div>
  );
}
