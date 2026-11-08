import React from 'react';
import type { AutoResult, Kind } from '../engine/autodesign';
import { KIND_LABEL } from '../engine/autodesign';
import { KIND_COLOR } from './Building3D';

/** Flat floor plan, one drawing per floor, with every device the auto-design placed. Prints well. */
export function FloorPlan2D({ r, lengthFt, widthFt, floor, hidden }: { r: AutoResult; lengthFt: number; widthFt: number; floor: number | 'all'; hidden: Set<Kind> }) {
  const floors = Math.max(1, ...r.trs.map((t) => t.floor + 1), ...r.devices.map((d) => d.floor + 1));
  const list = floor === 'all' ? Array.from({ length: floors }, (_, i) => i) : [floor];
  const all = [...r.trs, ...r.devices].filter((d) => !hidden.has(d.kind));
  const xs = [0, lengthFt, ...all.map((d) => d.x)], ys = [0, widthFt, ...all.map((d) => d.y)];
  const pad = 12, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) + pad - x0, h = Math.max(...ys) + pad - y0;
  const dot = Math.max(2.5, Math.max(w, h) / 90), bar = Math.max(10, Math.round(lengthFt / 4 / 10) * 10);
  return (
    <div className="plan2d">{list.map((f) => {
      const here = all.filter((d) => d.floor === f || (d.outdoor && f === 0));
      return (
        <figure key={f}>
          <figcaption className="small"><b>Floor {f + 1}</b> · {here.length} items · {lengthFt} × {widthFt} ft</figcaption>
          <svg viewBox={`${x0} ${y0} ${w} ${h}`} role="img" aria-label={`Floor ${f + 1} plan`} style={{ width: '100%', height: 'auto', maxHeight: 520, background: 'var(--panel)' }}>
            <defs><pattern id={`g${f}`} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="var(--line)" strokeWidth={0.3} /></pattern></defs>
            <rect x={0} y={0} width={lengthFt} height={widthFt} fill={`url(#g${f})`} stroke="var(--text)" strokeWidth={Math.max(0.8, w / 300)} />
            {here.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.kind === 'tr' || d.kind === 'facp' ? dot * 1.6 : dot} fill={KIND_COLOR[d.kind]} stroke="#000" strokeWidth={dot / 5}><title>{KIND_LABEL[d.kind]} ({d.system})</title></circle>)}
            {here.filter((d) => d.kind === 'tr').map((d, i) => <text key={'t' + i} x={d.x + dot * 2} y={d.y + dot} fontSize={dot * 2.6} fill="var(--text)">TR</text>)}
            <g transform={`translate(${x0 + pad / 2} ${y0 + h - pad / 3})`}><line x1={0} y1={0} x2={bar} y2={0} stroke="var(--text)" strokeWidth={dot / 2.5} /><text x={0} y={-dot} fontSize={dot * 2.4} fill="var(--text)">{bar} ft</text></g>
          </svg>
        </figure>);
    })}</div>
  );
}
