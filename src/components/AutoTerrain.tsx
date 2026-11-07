// Background manager: whenever the project's sites change, make sure terrain covering them is loaded.
// Downloads from AWS Terrain Tiles (USGS 3DEP in the US) and caches it, so it also loads offline afterwards.
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { downloadTerrain, boundsAround, demCovers } from '../engine/autoterrain';
import { sampleDem } from '../engine/terrain';

export function AutoTerrain() {
  const { project: p, rt, setRt, update } = useStore();
  const busy = useRef(false);
  const key = p.sites.map((s) => `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`).join('|') + `|${p.radio.coverageRadiusKm}|${p.settings?.autoTerrain}`;
  useEffect(() => {
    if (!p.settings?.autoTerrain || busy.current || !p.sites.length) return;
    if (rt.dem && !rt.demAuto) return; // never replace a terrain file the user imported
    const margin = Math.min(Math.max(p.settings.terrainMarginKm ?? 5, p.radio.coverageRadiusKm), 30);
    const b = boundsAround(p.sites, margin);
    if (demCovers(rt.dem, b)) return;
    const t = setTimeout(async () => {
      busy.current = true;
      setRt((r) => ({ ...r, terrainStatus: 'Downloading terrain…' }));
      try {
        const res = await downloadTerrain(b, { maxTiles: 96, onProgress: (d, n) => setRt((r) => ({ ...r, terrainStatus: `Terrain ${d}/${n} tiles` })) });
        setRt((r) => ({ ...r, dem: res.dem, demAuto: true, profile: null, coverage: null, terrainStatus: `Terrain ✓ ~${res.resolutionM.toFixed(0)} m${res.fromCache === res.tiles ? ' (offline cache)' : ''}` }));
        update((d) => d.sites.forEach((s) => { if (s.groundElevM == null || s.positionSource !== 'Manual elevation') { const z = sampleDem(res.dem, s); if (z != null && s.groundElevM == null) s.groundElevM = Math.round(z * 10) / 10; } }));
      } catch {
        setRt((r) => ({ ...r, terrainStatus: navigator.onLine === false ? 'Offline: no cached terrain here' : 'Terrain download failed' }));
      }
      busy.current = false;
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rt.dem]);
  return null;
}
