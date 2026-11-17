// Results cached for the current version of the open project. The store tells this module each time the
// project changes (noteProject); everything cached is dropped at that moment. Only the store's current
// project object is ever cached: drafts inside an edit, other projects and test fixtures are always worked
// out fresh. So a cached result is always the one a fresh calculation would give.

let current: object | null = null;
const caches = new Set<Map<string, unknown>>();

/** Called by the store whenever the open project changes (a new version, or another project opened). */
export function noteProject(p: object) { if (p === current) return; current = p; for (const c of caches) c.clear(); }

/** Caches fn(project, …rest) for the current project version and each set of other arguments. */
export function perProject<P extends object, A extends unknown[], R>(fn: (p: P, ...a: A) => R, key: (...a: A) => string = (...a) => JSON.stringify(a)): (p: P, ...a: A) => R {
  const m = new Map<string, R>(); caches.add(m as Map<string, unknown>);
  return (p: P, ...a: A) => {
    if (p !== current) return fn(p, ...a);
    const k = key(...a);
    if (m.has(k)) return m.get(k)!;
    const r = fn(p, ...a); m.set(k, r); if (m.size > 24) m.delete(m.keys().next().value as string);
    return r;
  };
}
