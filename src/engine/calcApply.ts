// "Apply to fields": push a calculator's result into the matching project fields, only when the user chooses.
// Calculators never read or write project data on their own; this is the one bridge, and it always asks first.
import type { Project } from '../types';

export type Path = (string | number)[];

/** One project field (or a small set that belongs together) a calculator result can be written into. */
export interface ApplyTarget {
  id: string;
  /** What changes, in plain words ("Main antenna azimuth"). */
  label: string;
  /** The page where the field lives. */
  page: string;
  /** Paths and the values written there. */
  sets: [Path, unknown][];
  /** The new value as shown to the user. */
  to: string;
  /** The current value as shown to the user. */
  now: (p: Project) => string;
  /** Ticked when the box opens (default true). */
  on?: boolean;
}

export function getPath(o: unknown, path: Path): unknown {
  let x = o as Record<string | number, unknown> | undefined;
  for (const k of path) { if (x == null || typeof x !== 'object') return undefined; x = x[k] as Record<string | number, unknown> | undefined; }
  return x;
}

export function setPath(o: unknown, path: Path, v: unknown): void {
  let x = o as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (x[k] == null || typeof x[k] !== 'object') x[k] = typeof path[i + 1] === 'number' ? [] : {};
    x = x[k] as Record<string | number, unknown>;
  }
  const last = path[path.length - 1];
  if (v === undefined) delete x[last]; else x[last] = v;
}

/** A copy of the project with the chosen targets written. */
export function applyTargets(p: Project, targets: ApplyTarget[]): Project {
  const d = structuredClone(p);
  for (const t of targets) for (const [path, v] of t.sets) setPath(d, path, structuredClone(v));
  return d;
}

/** Undo: put back the values those targets had in `before`, leaving every other change made since alone. */
export function undoTargets(p: Project, before: Project, targets: ApplyTarget[]): Project {
  const d = structuredClone(p);
  for (const t of targets) for (const [path] of t.sets) { const v = getPath(before, path); setPath(d, path, v === undefined ? undefined : structuredClone(v)); }
  return d;
}

/** True when writing the target would not change anything. */
export const targetIsSame = (p: Project, t: ApplyTarget) => t.sets.every(([path, v]) => JSON.stringify(getPath(p, path)) === JSON.stringify(v));
