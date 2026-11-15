// Input checks for every number box and calculator: say what is wrong in plain words and suggest a fix.
// A blank box is "not filled in", never zero: calculations skip it or ask for it instead of using 0.

export type Level = 'bad' | 'warn';
export interface Issue { level: Level; msg: string; fix?: string; key?: string }
export interface Range { min?: number; max?: number; integer?: boolean; required?: boolean; label?: string; unit?: string }

const num = (x: number) => (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : String(+x.toPrecision(4)));
const u = (unit?: string) => (unit && unit.trim() ? ' ' + unit.trim() : '');

/** Usual limits by unit, used when a box gives none. Only units that can never go below zero. */
export function defaultRange(unit?: string): Range {
  switch ((unit ?? '').trim()) {
    case 'MHz': return { min: 0.001, max: 100000 };
    case 'kHz': return { min: 0 };
    case 'A': case 'mA': case 'W': case 'kW': case 'Ah': case 'Ah/day': case 'h': case 'h/day': case 'min': case 'days': case 's': case 'ms': case 'Mb/s': case 'TB': case 'px': case 'ea': case '$/h': return { min: 0 };
    case 'Ω': case 'Ω·m': return { min: 0 };
    case '%': return { min: 0, max: 100 };
    case 'dBm': return { min: -200, max: 100 };
    default: return {};
  }
}

/** A value that fixes the entry if it was typed in the wrong unit or with a slipped decimal point. */
function guess(v: number, r: Range): number | null {
  const inRange = (x: number) => (r.min == null || x >= r.min) && (r.max == null || x <= r.max);
  if (v < 0 && inRange(-v)) return -v;
  for (const f of [1 / 10, 10, 1 / 100, 100, 1 / 1000, 1000, 1 / 12, 12, 1 / 3.28084, 3.28084]) {
    const x = +(v * f).toPrecision(4);
    if (x !== 0 && inRange(x)) return x;
  }
  return null;
}

/** Check one entry. null = OK. */
export function checkValue(v: number | null | undefined, r: Range): Issue | null {
  const name = r.label ? r.label.replace(/\s*\(optional\)$/i, '') : 'This value';
  if (v == null || (typeof v === 'number' && Number.isNaN(v))) {
    return r.required ? { level: 'bad', msg: `${name} is empty.`, fix: 'Type a number here. A blank box is not counted as zero.' } : null;
  }
  if (!Number.isFinite(v)) return { level: 'bad', msg: `${name} is not a number.`, fix: 'Type a plain number, for example 150.' };
  const lo = r.min, hi = r.max;
  if ((lo != null && v < lo) || (hi != null && v > hi)) {
    const span = lo != null && hi != null ? `between ${num(lo)} and ${num(hi)}${u(r.unit)}` : lo != null ? (lo === 0 ? 'zero or more' : `at least ${num(lo)}${u(r.unit)}`) : `no more than ${num(hi!)}${u(r.unit)}`;
    const g = guess(v, r);
    const fix = v < 0 && (lo ?? 0) >= 0 ? `Remove the minus sign${g != null ? ` (${num(g)})` : ''}.`
      : g != null ? `Did you mean ${num(g)}${u(r.unit)}? Check the unit and the decimal point.` : `Use a value ${span}.`;
    return { level: 'bad', msg: `${name} must be ${span}. You typed ${num(v)}${u(r.unit)}.`, fix };
  }
  if (r.integer && !Number.isInteger(v)) return { level: 'bad', msg: `${name} must be a whole number. You typed ${num(v)}.`, fix: `Use ${Math.round(v) || 1}.` };
  return null;
}

/** The value to offer on a "Use …" button for a bad entry: the likely intended value, else the nearest allowed one. */
export function suggestFix(v: number, r: Range): number | null {
  if (!Number.isFinite(v)) return null;
  if (r.integer && Number.isInteger(v) === false && (r.min == null || Math.round(v) >= r.min) && (r.max == null || Math.round(v) <= r.max)) return Math.round(v);
  const g = guess(v, r); if (g != null) return r.integer ? Math.round(g) : g;
  if (r.min != null && v < r.min) return r.min;
  if (r.max != null && v > r.max) return r.max;
  return null;
}

export const issueText = (i: Issue) => i.msg + (i.fix ? ' ' + i.fix : '');
