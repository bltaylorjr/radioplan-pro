// 3D view of the antenna beam over the terrain (Tilt, Azimuth & Power): a see-through wedge that stops where it
// meets the ground, optional predicted-signal heat map, a tilt slider and true-scale / stretched heights.
import React, { useEffect, useMemo, useState } from 'react';
import { Terrain3D, meshN, type Terrain3DProps } from './Terrain3D';
import { cropDem } from '../engine/bundledTerrain';
import { boundsOf } from '../engine/areaTerrain';
import { demBounds, type DemGrid } from '../engine/terrain';
import { predictPoint, type CoverageInputs } from '../engine/coverage';
import type { Site } from '../types';

export default function BeamView3D(props: {
  dem: DemGrid | null; sites: Site[]; txId: string; rxId?: string; fMHz: number; kFactor: number; clutterM: number; exag: number;
  beam: NonNullable<Terrain3DProps['beam']>; km: number; cov: CoverageInputs | null; fmtLen: (m: number) => string; fmtDist: (km: number) => string; note?: string;
}) {
  const { beam, km, cov } = props;
  const [tilt, setTilt] = useState(55);
  const [showHeat, setShowHeat] = useState(false);
  const dem = useMemo(() => (props.dem ? cropDem(props.dem, boundsOf([beam], Math.max(0.4, km * 1.08))!) ?? props.dem : null), [props.dem, beam.lat, beam.lon, km]); // eslint-disable-line react-hooks/exhaustive-deps
  const [heat, setHeat] = useState<Float32Array | null>(null);
  useEffect(() => {
    if (!showHeat || !dem || !cov) { setHeat(null); return; }
    const t = window.setTimeout(() => {
      const N = meshN(dem), b = demBounds(dem), out = new Float32Array((N + 1) * (N + 1)), c = { ...cov, dem, radiusKm: 1e6 };
      for (let r = 0; r <= N; r++) for (let k = 0; k <= N; k++) out[r * (N + 1) + k] = predictPoint(c, { lat: b.north - ((b.north - b.south) * r) / N, lon: b.west + ((b.east - b.west) * k) / N });
      setHeat(out);
    }, 30);
    return () => window.clearTimeout(t);
  }, [showHeat, dem, cov]);
  if (!dem) return <div className="three empty" style={{ height: 420 }}>{props.note || 'Loading terrain…'}</div>;
  return (
    <div className="beam3d">
      <div className="row wrap small" style={{ gap: 8, marginBottom: 4 }}>
        <label className="row" style={{ gap: 4 }}>Tilt the view <input type="range" min={0} max={85} value={tilt} aria-label="Tilt the 3D beam view" onChange={(e) => setTilt(+e.target.value)} /> {tilt}°</label>
        <button onClick={() => setTilt(80)} title="Look across the ground, close to the 2D side view">Low angle</button>
        <button onClick={() => setTilt(55)}>Tilted</button>
        <button onClick={() => setTilt(0)}>Straight down</button>
        <label title={cov ? '' : 'Set a transmit site and radio first'}><input type="checkbox" checked={showHeat} disabled={!cov} onChange={(e) => setShowHeat(e.target.checked)} /> Signal heat map</label>
      </div>
      <Terrain3D dem={dem} sites={props.sites} txId={props.txId} rxId={props.rxId} fMHz={props.fMHz} kFactor={props.kFactor} clutterM={props.clutterM}
        exag={props.exag} showFresnel={false} tilt={tilt} onTilt={setTilt} beam={beam} heat={heat} height={420} fmtLen={props.fmtLen} fmtDist={props.fmtDist} />
      <p className="small muted" style={{ margin: '4px 0' }}>Green wedge = the beam between its −3 dB edges, stopped where it meets the ground; yellow dot = where the main beam lands. Drag to turn, scroll or pinch to zoom. {props.exag <= 1 ? 'True scale: heights are not stretched.' : `Heights stretched ×${props.exag}.`} {props.note}</p>
    </div>
  );
}
