// Background manager: whenever the project's sites change, make sure terrain covering them is loaded.
// Downloads from AWS Terrain Tiles (USGS 3DEP in the US) and caches it, so it also loads offline afterwards.
// Failed tiles are retried right away (3 tries with backoff); a failed or partial download is retried
// automatically at 15 s, 30 s, 1 min, 2 min, 4 min, then every 5 min, and immediately when the device comes back online.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { downloadTerrain, boundsAround, demCovers, retryDelayMs, Bounds } from '../engine/autoterrain';
import { countTiles, prefetchTiles } from '../engine/offline';
import { BASEMAPS } from './MapView';
import { sampleDem } from '../engine/terrain';

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
  };
  useEffect(() => () => cancelRetry(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
