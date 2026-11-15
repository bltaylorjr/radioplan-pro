// "True scale or stretched heights" for every side view (path profile, drawn-line chart, runs over the ground,
// antenna beam): one picker, the vertical frame for a chart, and scale bars. Stored per chart on this device.
import React, { useState } from 'react';
import { niceLen } from '../engine/beam';
import { useUnits } from '../units';

export const STRETCH_STEPS = [2, 5, 10, 25, 50];
const KEY = 'radioplan.scale.';

/** 0 = stretched automatically to fill the chart, 1 = true scale, N = heights stretched N times. */
export function useScaleChoice(id: string, initial = 0): [number, (v: number) => void] {
  const [v, setV] = useState<number>(() => { try { const s = localStorage.getItem(KEY + id); return s == null ? initial : +s; } catch { return initial; } });
  return [v, (n: number) => { setV(n); try { localStorage.setItem(KEY + id, String(n)); } catch { /* private mode */ } }];
}

export const fmtEx = (e: number) => (e < 10 ? e.toFixed(1).replace(/\.0$/, '') : String(Math.round(e)));

export function ScaleSelect({ value, onChange, autoEx }: { value: number; onChange: (v: number) => void; autoEx?: number }) {
  return (
    <label className="small row scale-select" style={{ gap: 4 }}>Height scale
      <select aria-label="Height scale" value={value} onChange={(e) => onChange(+e.target.value)}>
        <option value={1}>True scale (1 : 1)</option>
        <option value={0}>Stretched, automatic{value === 0 && autoEx ? ` (×${fmtEx(autoEx)})` : ''}</option>
        {STRETCH_STEPS.map((n) => <option key={n} value={n}>Stretched ×{n}</option>)}
      </select></label>
  );
}

export interface Frame { E: number; ph: number; yLo: number; yHi: number; mPerPx: number; mPerPxV: number }
/**
 * Vertical frame for a side view `km` long drawn `plotW` px wide, with heights `lo`..`hi` (m).
 * Automatic: the chart is `autoH` px tall. True scale / ×N: a metre up is 1 / N of a metre across; the chart is between
 * `minH` and `maxH` px tall, and when it would be taller it is cropped around `focusM` (e.g. the antenna).
 */
export function frameFor(o: { km: number; plotW: number; lo: number; hi: number; ex: number; autoH: number; minH?: number; maxH?: number; focusM?: number }): Frame {
  const mPerPx = Math.max(1e-6, (o.km * 1000) / o.plotW), span = Math.max(1, o.hi - o.lo), pad = span * 0.08;
  const lo = o.lo - pad, hi = o.hi + pad, range = hi - lo;
  if (o.ex <= 0) { const ph = o.autoH; const mPerPxV = range / ph; return { E: mPerPx / mPerPxV, ph, yLo: lo, yHi: hi, mPerPx, mPerPxV }; }
  const mPerPxV = mPerPx / o.ex, need = range / mPerPxV, minH = o.minH ?? 120, maxH = o.maxH ?? 460;
  if (need < minH) { const extra = (minH * mPerPxV - range) / 2; return { E: o.ex, ph: minH, yLo: lo - extra * 0.4, yHi: hi + extra * 1.6, mPerPx, mPerPxV }; }
  if (need <= maxH) return { E: o.ex, ph: need, yLo: lo, yHi: hi, mPerPx, mPerPxV };
  const f = o.focusM ?? hi, yHi = Math.min(hi, f + maxH * mPerPxV * 0.25);
  return { E: o.ex, ph: maxH, yLo: yHi - maxH * mPerPxV, yHi, mPerPx, mPerPxV };
}

/** Scale bars (across and up) and a note saying whether heights are stretched. Place inside an <svg>. */
export function ScaleBars({ f, x, y, xNote, maxW, vx, vy }: { f: Frame; x: number; y: number; xNote: number; maxW?: number; vx: number; vy: number }) {
  const u = useUnits();
  const across = niceLen(u.d((f.mPerPx * (maxW ?? 200)) / 1000 / 2)), acrossPx = (u.toKm(across) * 1000) / f.mPerPx;
  const ftOrM = u.unit === 'mi' ? 0.3048 : 1, up = niceLen((f.ph * 0.4 * f.mPerPxV) / ftOrM), upPx = (up * ftOrM) / f.mPerPxV;
  return (
    <g className="scale-bars" fontSize={11}>
      <g transform={`translate(${x},${y})`}>
        <rect x={0} y={-5} width={acrossPx / 2} height={5} fill="#263238" /><rect x={acrossPx / 2} y={-5} width={acrossPx / 2} height={5} fill="#fff" stroke="#263238" />
        <text x={acrossPx + 6} y={0} fill="#37474f">{across} {u.unit} across</text>
      </g>
      <g transform={`translate(${vx},${vy})`}>
        <rect x={0} y={-upPx} width={6} height={upPx / 2} fill="#263238" /><rect x={0} y={-upPx / 2} width={6} height={upPx / 2} fill="#fff" stroke="#263238" />
        <text x={3} y={-upPx - 5} textAnchor="middle" fill="#37474f">{up} {u.unit === 'mi' ? 'ft' : 'm'}</text>
      </g>
      <text x={xNote} y={y} textAnchor="end" fill="#37474f" fontWeight={700}>{Math.abs(f.E - 1) < 0.01 ? 'True scale' : f.E > 1 ? `Heights stretched ×${fmtEx(f.E)}` : `Heights shrunk ×${fmtEx(f.E)}`}</text>
    </g>
  );
}
