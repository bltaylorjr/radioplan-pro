// Background manager: whenever the project's sites change, make sure terrain covering them is loaded.
// Downloads from AWS Terrain Tiles (USGS 3DEP in the US) and caches it, so it also loads offline afterwards.
// Failed tiles are retried right away (3 tries with backoff); a failed or partial download is retried
// automatically at 15 s, 30 s, 1 min, 2 min, 4 min, then every 5 min, and immediately when the device comes back online.
// Once the area terrain is in, two more downloads run by themselves (same retry rules), so nothing has to be
// downloaded by hand: detailed terrain (up to zoom 14, ~8 m) along the TX–RX link for the 3D model and path
// profile, and the existing towers / comm sites (OpenStreetMap) for the area, saved for offline use.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { downloadTerrain, boundsAround, demCovers, retryDelayMs, linkBounds, Bounds } from '../engine/autoterrain';
import { countTiles, prefetchTiles } from '../engine/offline';
import { BASEMAPS } from './basemaps';
import { sampleDem, demBounds, demCellM } from '../engine/terrain';
import { loadCommSites } from '../engine/towers';

export function AutoTerrain() {
  const { project: p, rt, setRt, update } = useStore();
  const busy = useRef(false);
  const attempt = useRef(0);
  const [tick, setTick] = useState(0); // bump to force a retry
  const retryTimer = useRef<number>();
  const countdown = useRef<number>();
  const waiting = useRef(false); // a retry is scheduled; don't start another download meanwhile
  const cancelRetry = () => { clearTimeout(retryTimer.current); clearInterval(countdown.current); waiting.current = false; };
  const key = p.sites.map((s) => `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`).join('|') + `|${p.radio.coverageRadiusKm}|${p.settings?.autoTerrain}`;
  useEffect(() => { attempt.current = 0; cancelRetry(); }, [key]);
  useEffect(() => {
    const on = () => { if (waiting.current) { cancelRetry(); setTick((t) => t + 1); } };
    window.addEventListener('online', on); return () => window.removeEventListener('online', on);
  }, []);
  useEffect(() => {
    if (!p.settings?.autoTerrain || busy.current || waiting.current || !p.sites.length) return;
    if (rt.dem && !rt.demAuto) return; // never replace a terrain file the user imported
    const margin = Math.min(Math.max(p.settings.terrainMarginKm ?? 5, p.radio.coverageRadiusKm), 30);
    const b = boundsAround(p.sites, margin);
    if (demCovers(rt.dem, b) && !(rt.demAuto && rt.terrainStatus?.includes('incomplete'))) return;
    const scheduleRetry = (why: string) => {
      const ms = retryDelayMs(attempt.current++);
      const at = Date.now() + ms;
      const show = () => setRt((r) => ({ ...r, terrainStatus: `${why}: retrying in ${Math.max(0, Math.round((at - Date.now()) / 1000))} s (try ${attempt.current + 1})` }));
      show();
      cancelRetry(); waiting.current = true;
      countdown.current = window.setInterval(show, 5000);
      retryTimer.current = window.setTimeout(() => { cancelRetry(); setTick((t) => t + 1); }, ms);
    };
    const t = setTimeout(async () => {
      busy.current = true;
      setRt((r) => ({ ...r, terrainStatus: attempt.current ? `Retrying terrain (try ${attempt.current + 1})…` : 'Downloading terrain…' }));
      try {
        const res = await downloadTerrain(b, { maxTiles: 96, onProgress: (d, n) => setRt((r) => ({ ...r, terrainStatus: `Terrain ${d}/${n} tiles` })) });
        const partial = res.missingTiles > 0;
        setRt((r) => ({ ...r, dem: res.dem, demAuto: true, profile: null, coverage: null,
          terrainStatus: partial ? `Terrain incomplete (${res.missingTiles} of ${res.tiles + res.missingTiles} tiles missing)` : `Terrain ✓ ~${res.resolutionM.toFixed(0)} m${res.fromCache === res.tiles ? ' (offline cache)' : ''}` }));
        update((d) => d.sites.forEach((s) => { if (s.groundElevM == null) { const z = sampleDem(res.dem, s); if (z != null) s.groundElevM = Math.round(z * 10) / 10; } }));
        busy.current = false;
        if (partial) scheduleRetry(`Terrain incomplete (${res.missingTiles} tiles missing)`); else { attempt.current = 0; autoMaps(b); }
      } catch {
        busy.current = false;
        scheduleRetry(navigator.onLine === false ? 'Offline, no cached terrain' : 'Terrain download failed');
      }
    }, attempt.current ? 0 : 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rt.dem, tick]);
  // Automatically keep the project-area maps for offline use (USGS public-domain topo map).
  const mapsDone = useRef('');
  const autoMaps = async (b: Bounds) => {
    if (p.settings?.autoMaps === false || !navigator.onLine || mapsDone.current === key) return;
    mapsDone.current = key;
    const url = BASEMAPS['USGS Topo']?.url; if (!url) return;
    let zMax = 14; while (zMax > 10 && countTiles(b, 8, zMax) > 2500) zMax--;
    const res = await prefetchTiles([url], b, 8, zMax, (d, n) => { if (d % 50 === 0 || d === n) setRt((r) => ({ ...r, mapStatus: `Saving maps for offline ${d}/${n}` })); }).catch(() => null);
    setRt((r) => ({ ...r, mapStatus: res ? `Maps saved for offline (${res.total - res.failed} tiles)` : undefined }));
    // Keep this area complete and fresh from now on (Projects → Automatic care).
    if (res) import('../engine/datasets').then((m) => m.rememberTileArea({ templates: [url], b, zMin: 8, zMax })).catch(() => undefined);
  };
  useEffect(() => () => cancelRetry(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return <><AutoPathTerrain /><AutoTowers /></>;
}

/** Runs `job` in the background whenever `key` changes, retrying failures on the same schedule as the
 *  area terrain and right away when the device comes back online. `job` returns true when finished. */
function useBackgroundJob(key: string | null, job: () => Promise<boolean>, startDelayMs = 2500) {
  const [tick, setTick] = useState(0);
  const attempt = useRef(0);
  const done = useRef<string | null>(null);
  useEffect(() => { attempt.current = 0; }, [key]);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('online', on); return () => window.removeEventListener('online', on);
  }, []);
  useEffect(() => {
    if (!key || done.current === key) return;
    let stop = false, retry: number | undefined;
    const t = window.setTimeout(async () => {
      let ok = false;
      try { ok = await job(); } catch { ok = false; }
      if (stop) return;
      if (ok) { done.current = key; attempt.current = 0; }
      else retry = window.setTimeout(() => setTick((x) => x + 1), retryDelayMs(attempt.current++));
    }, attempt.current ? 0 : startDelayMs);
    return () => { stop = true; clearTimeout(t); clearTimeout(retry); };
  }, [key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Detailed terrain along the radio link (what the old "Download terrain" button on 3D Model did). */
function AutoPathTerrain() {
  const { project: p, rt, setRt } = useStore();
  const tx = p.sites.find((s) => s.id === p.radio.txSiteId) ?? p.sites[0];
  const rx0 = p.sites.find((s) => s.id === p.radio.rxSiteId) ?? p.sites[1];
  const rx = rx0 && rx0 !== tx ? rx0 : undefined;
  const on = (p.settings?.autoTerrain ?? true) && !!tx && !(rt.dem && !rt.demAuto); // never second-guess an imported terrain file
  const key = on && tx ? `${tx.lat.toFixed(5)},${tx.lon.toFixed(5)}|${rx ? `${rx.lat.toFixed(5)},${rx.lon.toFixed(5)}` : ''}` : null;
  useEffect(() => { if (!key) setRt((r) => (r.demPath ? { ...r, demPath: null } : r)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useBackgroundJob(key, async () => {
    const b = linkBounds(tx!, rx);
    const res = await downloadTerrain(b, { maxTiles: 64 });
    // Keep it only if it is sharper than the area terrain already loaded.
    const sharper = !rt.dem || !demCovers(rt.dem, b) || res.resolutionM < demCellM(rt.dem) * 0.8;
    setRt((r) => ({ ...r, demPath: sharper ? res.dem : null }));
    return res.missingTiles === 0;
  });
  return null;
}

/** Existing towers and comm sites for the terrain area, saved on the device so they show offline. */
function AutoTowers() {
  const { project: p, rt, setRt } = useStore();
  const b = rt.dem ? demBounds(rt.dem) : null;
  const key = (p.settings?.autoTerrain ?? true) && b ? [b.south, b.west, b.north, b.east].map((v) => v.toFixed(2)).join(',') : null;
  useBackgroundJob(key, async () => {
    if (!b || navigator.onLine === false) return false;
    const r = await loadCommSites(b.south, b.west, b.north, b.east, { online: true });
    setRt((x) => ({ ...x, towerStatus: r.failed ? `Existing towers: ${r.failed} area${r.failed === 1 ? '' : 's'} still to download` : `Existing towers ✓ ${r.sites.length} saved for offline` }));
    return r.failed === 0;
  }, 4000);
  return null;
}
