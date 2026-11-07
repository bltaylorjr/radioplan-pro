import React from 'react';
import type { ProfileAnalysis } from '../engine/terrain';

export function ProfileChart({ a, height = 320 }: { a: ProfileAnalysis; height?: number }) {
  const W = 900, H = height, pl = 56, pr = 30, pt = 20, pb = 36;
  const pts = a.points;
  const ys = pts.flatMap((p) => [p.effGroundM, p.losM + p.f1M, p.losM - p.f1M]);
  const ymin = Math.floor(Math.min(...ys) / 10) * 10 - 10, ymax = Math.ceil(Math.max(...ys) / 10) * 10 + 10;
  const x = (d: number) => pl + (d / a.distanceKm) * (W - pl - pr);
  const y = (z: number) => H - pb - ((z - ymin) / (ymax - ymin)) * (H - pt - pb);
  const ground = `M${x(0)},${y(ymin)} ` + pts.map((p) => `L${x(p.dKm)},${y(p.effGroundM)}`).join(' ') + ` L${x(a.distanceKm)},${y(ymin)} Z`;
  const fzTop = pts.map((p) => `${x(p.dKm)},${y(p.losM + p.f1M)}`), fzBot = pts.map((p) => `${x(p.dKm)},${y(p.losM - p.f1M)}`).reverse();
  const f60 = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.dKm)},${y(p.losM - 0.6 * p.f1M)}`).join(' ');
  const bare = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.dKm)},${y(p.groundM + p.bulgeM)}`).join(' ');
  const w = pts[a.worstIndex];
  const ticksY = Array.from({ length: 6 }, (_, i) => ymin + ((ymax - ymin) * i) / 5);
  const ticksX = Array.from({ length: 6 }, (_, i) => (a.distanceKm * i) / 5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Path profile">
      {ticksY.map((t) => <g key={t}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} className="grid" /><text x={pl - 6} y={y(t) + 4} textAnchor="end">{t.toFixed(0)}</text></g>)}
      {ticksX.map((t) => <text key={t} x={x(t)} y={H - pb + 18} textAnchor="middle">{t.toFixed(1)} km</text>)}
      <text x={pl + 6} y={pt + 4} className="axis">Elevation, m AMSL</text>
      <polygon points={[...fzTop, ...fzBot].join(' ')} className="fresnel" />
      <path d={ground} className="ground" />
      <path d={bare} className="bare" />
      <path d={f60} className="f60" />
      <line x1={x(0)} y1={y(pts[0].losM)} x2={x(a.distanceKm)} y2={y(pts[pts.length - 1].losM)} className={a.meets60 ? 'los ok' : 'los bad'} />
      <line x1={x(0)} y1={y(pts[0].groundM)} x2={x(0)} y2={y(pts[0].losM)} className="tower" />
      <line x1={x(a.distanceKm)} y1={y(pts[pts.length - 1].groundM)} x2={x(a.distanceKm)} y2={y(pts[pts.length - 1].losM)} className="tower" />
      {w && <g><circle cx={x(w.dKm)} cy={y(w.effGroundM)} r={5} className="worst" /><text x={x(w.dKm) + 8} y={y(w.effGroundM) - 8} className="worst-t">{w.clearancePct.toFixed(0)}% F1</text></g>}
    </svg>
  );
}
