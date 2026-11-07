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

export function Field({ label, tip, topic, children, tour, wide }: { label: string; tip?: string; topic?: string; children: React.ReactNode; tour?: string; wide?: boolean }) {
  return (
    <label className={'field' + (wide ? ' wide' : '')} data-tour={tour}>
      <span className="field-label">{label} {(tip || topic) && <Tip text={tip} topic={topic} />}</span>
      {children}
    </label>
  );
}

export function Num({ value, onChange, step = 'any', min, max, unit, nullable }: { value: number | null; onChange: (v: number | null) => void; step?: number | 'any'; min?: number; max?: number; unit?: string; nullable?: boolean }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <span className="num">
      <input type="number" inputMode="decimal" step={step} min={min} max={max} value={txt ?? (value == null ? '' : String(+value.toFixed(6)))}
        onChange={(e) => { setTxt(e.target.value); const v = e.target.value === '' ? null : parseFloat(e.target.value); if (v == null ? nullable : !Number.isNaN(v)) onChange(v as number); }}
        onBlur={() => setTxt(null)} />
      {unit && <span className="unit">{unit}</span>}
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
  return <div className={`stat ${tone ?? ''}`}><div className="stat-label">{label} {tip && <Tip text={tip} />}</div><div className="stat-value">{value}<small>{unit}</small></div></div>;
}
export function Badge({ kind, children }: { kind: 'real' | 'beta' | 'placeholder'; children?: React.ReactNode }) {
  const t = { real: 'Implemented', beta: 'Simplified model', placeholder: 'Placeholder' }[kind];
  return <span className={`badge badge-${kind}`} title={kind === 'placeholder' ? 'Not yet fully implemented' : kind === 'beta' ? 'Working, simplified engineering model' : 'Fully implemented'}>{children ?? t}</span>;
}
export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
