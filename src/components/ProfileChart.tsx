import React from 'react';
import { FullView } from './FullView';
import type { ProfileAnalysis } from '../engine/terrain';
import { useUnits } from '../units';
import { niceLen } from '../engine/beam';
import { useScaleChoice, ScaleSelect, ScaleBars, frameFor } from './scale';

export function ProfileChart({ a, height = 320, fixed }: { a: ProfileAnalysis; height?: number; /** no scale picker (reports) */ fixed?: boolean }) {
  const u = useUnits();
  const [exSel, setEx] = useScaleChoice('path');
  const ex = fixed ? 0 : exSel;
  const W = 900, pl = 56, pr = 30, pt = 20, pb = fixed ? 36 : 56;
  const pts = a.points;
  const ys = pts.flatMap((p) => [p.effGroundM, p.losM + p.f1M, p.losM - p.f1M]);
  const fr = frameFor({ km: a.distanceKm, plotW: W - pl - pr, lo: Math.min(...ys), hi: Math.max(...ys), ex, autoH: height - pt - 36, minH: 140, maxH: 520, focusM: (pts[0].losM + pts[pts.length - 1].losM) / 2 });
  const auto = frameFor({ km: a.distanceKm, plotW: W - pl - pr, lo: Math.min(...ys), hi: Math.max(...ys), ex: 0, autoH: height - pt - 36 });
  const H = pt + fr.ph + pb, ymin = fr.yLo, ymax = fr.yHi;
  const x = (d: number) => pl + (d / a.distanceKm) * (W - pl - pr);
  const y = (z: number) => pt + ((ymax - z) / (ymax - ymin)) * fr.ph;
  const ground = `M${x(0)},${y(ymin)} ` + pts.map((p) => `L${x(p.dKm)},${y(p.effGroundM)}`).join(' ') + ` L${x(a.distanceKm)},${y(ymin)} Z`;
  const fzTop = pts.map((p) => `${x(p.dKm)},${y(p.losM + p.f1M)}`), fzBot = pts.map((p) => `${x(p.dKm)},${y(p.losM - p.f1M)}`).reverse();
  const f60 = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.dKm)},${y(p.losM - 0.6 * p.f1M)}`).join(' ');
  const bare = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.dKm)},${y(p.groundM + p.bulgeM)}`).join(' ');
  const w = pts[a.worstIndex];
  const ftM = u.unit === 'mi' ? 0.3048 : 1, stepY = niceLen((ymax - ymin) / ftM / 5) * ftM;
  const ticksY = Array.from({ length: 12 }, (_, i) => Math.ceil(ymin / stepY) * stepY + i * stepY).filter((t) => t <= ymax);
  const ticksX = Array.from({ length: 6 }, (_, i) => (a.distanceKm * i) / 5);
  return (<>
    {!fixed && <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 4 }}><ScaleSelect value={ex} onChange={setEx} autoEx={auto.E} /></div>}
    <FullView title="Path profile"><svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Path profile">
      <defs><clipPath id="pc-clip"><rect x={pl} y={pt} width={W - pl - pr} height={fr.ph} /></clipPath></defs>
      {ticksY.map((t) => <g key={t}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} className="grid" /><text x={pl - 6} y={y(t) + 4} textAnchor="end">{Math.round(t / ftM)}</text></g>)}
      {ticksX.map((t) => <text key={t} x={x(t)} y={pt + fr.ph + 18} textAnchor="middle">{u.d(t).toFixed(1)} {u.unit}</text>)}
      <text x={pl + 6} y={pt + 4} className="axis">Elevation, {u.unit === 'mi' ? 'ft' : 'm'} above sea level</text>
      <g clipPath="url(#pc-clip)">
      <polygon points={[...fzTop, ...fzBot].join(' ')} className="fresnel" />
      <path d={ground} className="ground" />
      <path d={bare} className="bare" />
      <path d={f60} className="f60" />
      <line x1={x(0)} y1={y(pts[0].losM)} x2={x(a.distanceKm)} y2={y(pts[pts.length - 1].losM)} className={a.meets60 ? 'los ok' : 'los bad'} />
      <line x1={x(0)} y1={y(pts[0].groundM)} x2={x(0)} y2={y(pts[0].losM)} className="tower" />
      <line x1={x(a.distanceKm)} y1={y(pts[pts.length - 1].groundM)} x2={x(a.distanceKm)} y2={y(pts[pts.length - 1].losM)} className="tower" />
      {w && <g><circle cx={x(w.dKm)} cy={y(w.effGroundM)} r={5} className="worst" /><text x={x(w.dKm) + 8} y={y(w.effGroundM) - 8} className="worst-t">{w.clearancePct.toFixed(0)}% F1</text></g>}
      </g>
      {!fixed && <ScaleBars f={fr} x={pl} y={H - 6} xNote={W - pr} vx={W - pr + 10} vy={pt + fr.ph} maxW={(W - pl - pr) / 2} />}
    </svg></FullView>
  </>);
}
