import React, { useState } from 'react';
import { HELP } from '../help/content';

/** Small "?" bubble with an on-hover/on-tap explanation. Pass text or a help topic id. */
export function Tip({ text, topic }: { text?: string; topic?: string }) {
  const [open, setOpen] = useState(false);
  const t = text ?? (topic ? HELP.find((h) => h.id === topic)?.summary : '');
  return (
    <span className="tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={(e) => { e.preventDefault(); setOpen(!open); }} tabIndex={0} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} aria-label="Help">
      ?{open && <span className="tip-pop" role="tooltip">{t}{topic && <><br /><a href={`#help/${topic}`} onClick={(e) => e.stopPropagation()}>Open in manual →</a></>}</span>}
    </span>
  );
}

export function Field({ label, tip, topic, children, tour, wide, required, missing }: { label: string; tip?: string; topic?: string; children: React.ReactNode; tour?: string; wide?: boolean; required?: boolean; missing?: boolean }) {
  return (
    <label className={'field' + (wide ? ' wide' : '') + (required ? ' req' : '') + (missing ? ' missing' : '')} data-tour={tour}>
      <span className="field-label">{label}{required && <span className="req-star" title="Required"> *</span>} {(tip || topic) && <Tip text={tip} topic={topic} />}{missing && <span className="req-msg"> Required</span>}</span>
      {children}
    </label>
  );
}

/** Imperial (ft, in, mi) or metric (m, mm, km). Values are stored in the unit the code uses; only the screen converts. */
export type MeasureSys = 'imperial' | 'metric';
export const MeasureCtx = React.createContext<MeasureSys>('imperial');
const CONVERT: Record<string, Partial<Record<MeasureSys, [string, number]>>> = {
  m: { imperial: ['ft', 1 / 0.3048] }, ft: { metric: ['m', 0.3048] },
  'm²': { imperial: ['ft²', 1 / 0.09290304] }, 'ft²': { metric: ['m²', 0.09290304] },
  mm: { imperial: ['in', 1 / 25.4] }, in: { metric: ['mm', 25.4] },
};
/** Display unit and factor (stored × k = shown) for a unit label such as "m" or " ft". */
export function measureFor(unit: string | undefined, sys: MeasureSys): { unit: string | undefined; k: number } {
  if (!unit) return { unit, k: 1 };
  const lead = unit.match(/^\s*/)![0], c = CONVERT[unit.trim()]?.[sys];
  return c ? { unit: lead + c[0], k: c[1] } : { unit, k: 1 };
}
export const useMeasure = (unit?: string) => measureFor(unit, React.useContext(MeasureCtx));
/** A computed value and its unit as shown in the chosen measurement system (numbers and plain numeric text only). */
export function shownIn(value: string | number, unit: string | undefined, sys: MeasureSys): [string | number, string | undefined] {
  const m = measureFor(unit, sys); if (m.k === 1) return [value, unit];
  const n = typeof value === 'number' ? value : /^-?[\d,]*\.?\d+$/.test(value.trim()) ? +value.replace(/,/g, '') : NaN;
  if (!Number.isFinite(n)) return [value, unit];
  const dp = typeof value === 'string' && value.includes('.') ? value.split('.')[1].length : 1;
  return [(n * m.k).toFixed(dp), m.unit];
}
export const useShown = (value: string | number, unit?: string) => shownIn(value, unit, React.useContext(MeasureCtx));

export function Num({ value, onChange, step = 'any', min, max, unit, nullable }: { value: number | null; onChange: (v: number | null) => void; step?: number | 'any'; min?: number; max?: number; unit?: string; nullable?: boolean }) {
  const [txt, setTxt] = useState<string | null>(null);
  const m = useMeasure(unit), k = m.k;
  return (
    <span className="num">
      <input type="number" inputMode="decimal" step={k === 1 ? step : 'any'} min={min == null ? min : min * k} max={max == null ? max : max * k} value={txt ?? (value == null ? '' : String(+(value * k).toFixed(unit && CONVERT[unit.trim()] ? 2 : 6)))}
        onChange={(e) => { setTxt(e.target.value); const v = e.target.value === '' ? null : parseFloat(e.target.value); if (v == null ? nullable : !Number.isNaN(v)) onChange(v == null ? null : k === 1 ? v : v / k); }}
        onBlur={() => setTxt(null)} />
      {m.unit && <span className="unit">{m.unit}</span>}
    </span>
  );
}
export function Txt({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}
export function Sel<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: (T | [T, string])[] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}</select>;
}
export function Check({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <label className="check"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}
export function Card({ title, children, tour, actions, tip, className }: { title: string; children: React.ReactNode; tour?: string; actions?: React.ReactNode; tip?: string; className?: string }) {
  return <section className={'card ' + (className ?? '')} data-tour={tour}><header><h3>{title} {tip && <Tip text={tip} />}</h3>{actions}</header>{children}</section>;
}
export function Stat({ label, value, unit, tone, tip }: { label: string; value: string | number; unit?: string; tone?: 'ok' | 'warn' | 'bad'; tip?: string }) {
  [value, unit] = useShown(value, unit);
  return <div className={`stat ${tone ?? ''}`}><div className="stat-label">{label} {tip && <Tip text={tip} />}</div><div className="stat-value">{value}<small>{unit}</small></div></div>;
}
export function Badge({ kind, children }: { kind: 'real' | 'beta' | 'placeholder'; children?: React.ReactNode }) {
  const t = { real: 'Implemented', beta: 'Simplified model', placeholder: 'Placeholder' }[kind];
  return <span className={`badge badge-${kind}`} title={kind === 'placeholder' ? 'Not yet fully implemented' : kind === 'beta' ? 'Working, simplified engineering model' : 'Fully implemented'}>{children ?? t}</span>;
}
export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
