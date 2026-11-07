// Indoor propagation: ITU-R P.1238 site-general model and COST-231 multi-wall model.
import { fsplDb } from './rf';

export const WALL_MATERIALS: Record<string, { label: string; lossDb900: number; lossDb2400: number; color: string }> = {
  drywall: { label: 'Drywall / stud', lossDb900: 2, lossDb2400: 3, color: '#9aa5b1' },
  wood: { label: 'Wood / door', lossDb900: 3, lossDb2400: 4, color: '#b07a3b' },
  glass: { label: 'Glass (clear)', lossDb900: 2, lossDb2400: 3, color: '#62b6e8' },
  lowe: { label: 'Low-E / tinted glass', lossDb900: 20, lossDb2400: 30, color: '#1f6fa8' },
  brick: { label: 'Brick', lossDb900: 6, lossDb2400: 9, color: '#b5462d' },
  block: { label: 'Concrete block (CMU)', lossDb900: 10, lossDb2400: 13, color: '#7b7b7b' },
  concrete: { label: 'Poured concrete', lossDb900: 14, lossDb2400: 20, color: '#4a4a4a' },
  metal: { label: 'Metal / elevator shaft', lossDb900: 25, lossDb2400: 30, color: '#222' },
};
/** Typical wall loss (dB) interpolated in log-frequency between the 900 MHz and 2.4 GHz values. */
export function wallLossDb(material: string, fMHz: number): number {
  const m = WALL_MATERIALS[material] ?? WALL_MATERIALS.drywall;
  const t = Math.max(0, Math.min(1.5, Math.log10(fMHz / 900) / Math.log10(2400 / 900)));
  return m.lossDb900 + (m.lossDb2400 - m.lossDb900) * t;
}

export type IndoorEnv = 'residential' | 'office' | 'commercial';
/** ITU-R P.1238 distance power-loss coefficient N (approx. table values). */
export function p1238N(fMHz: number, env: IndoorEnv): number {
  if (env === 'residential') return 28;
  if (env === 'commercial') return fMHz < 1500 ? 20 : 22;
  return fMHz < 1500 ? 33 : fMHz < 3000 ? 30 : 31;
}
/** Floor penetration factor Lf(n) for office (P.1238). */
export function p1238FloorLoss(fMHz: number, floors: number): number {
  if (floors <= 0) return 0;
  if (fMHz < 1500) return [9, 19, 24][Math.min(floors, 3) - 1];
  return 15 + 4 * (floors - 1);
}
export function p1238LossDb(fMHz: number, dM: number, env: IndoorEnv, floors = 0): number {
  return 20 * Math.log10(fMHz) + p1238N(fMHz, env) * Math.log10(Math.max(dM, 1)) + p1238FloorLoss(fMHz, floors) - 28;
}

export interface Wall { x1: number; y1: number; x2: number; y2: number; material: string }
function segIntersect(ax: number, ay: number, bx: number, by: number, w: Wall): boolean {
  const d = (bx - ax) * (w.y2 - w.y1) - (by - ay) * (w.x2 - w.x1);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((w.x1 - ax) * (w.y2 - w.y1) - (w.y1 - ay) * (w.x2 - w.x1)) / d;
  const u = ((w.x1 - ax) * (by - ay) - (w.y1 - ay) * (bx - ax)) / d;
  return t > 0 && t < 1 && u >= 0 && u <= 1;
}
/** COST-231 multi-wall model: FSPL + Σ wall losses (coordinates in metres). */
export function multiWallLossDb(fMHz: number, ax: number, ay: number, bx: number, by: number, walls: Wall[]): number {
  const d = Math.max(Math.hypot(bx - ax, by - ay), 0.5) / 1000;
  let l = fsplDb(fMHz, d);
  for (const w of walls) if (segIntersect(ax, ay, bx, by, w)) l += wallLossDb(w.material, fMHz);
  return l;
}
