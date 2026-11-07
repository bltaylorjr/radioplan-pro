import React, { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '../store';
import type { GeoResult } from '../engine/geocode';
import { localSuggestions, onlineSuggestions, rememberPlace } from '../engine/suggest';
import { parseLatLon } from '../engine/locparse';

/** Text input that suggests addresses as you type (recent / saved / project places offline, map search online).
 * Keyboard: ↑ ↓ to move, Enter to pick, Esc to close. */
export function AddressInput({ value, onChange, onPick, placeholder, className, ariaLabel, autoFocus }: {
  value: string; onChange: (v: string) => void; onPick?: (g: GeoResult) => void; placeholder?: string; className?: string; ariaLabel?: string; autoFocus?: boolean;
}) {
  const { project: p } = useStore();
  const [items, setItems] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const typed = useRef(false);
  const id = useId();
  const near = p.sites[0] ?? null;
  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 3 || parseLatLon(q)) { setItems([]); setOpen(false); return; }
    const projectPlaces: GeoResult[] = p.sites.filter((s) => s.address).map((s) => ({ lat: s.lat, lon: s.lon, label: s.address }));
    const local = localSuggestions(q, projectPlaces, 4);
    setItems(local); setOpen(true); setActive(-1);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try { const online = await onlineSuggestions(q, near, ac.signal); const seen = new Set(local.map((x) => x.label)); setItems([...local, ...online.filter((x) => !seen.has(x.label))].slice(0, 8)); }
      catch { /* offline or blocked: keep local suggestions */ }
      setLoading(false);
    }, 300);
    return () => { clearTimeout(t); ac.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const pick = (g: GeoResult) => { typed.current = false; onChange(g.label); setOpen(false); setItems([]); rememberPlace(g); onPick?.(g); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div className={'addr ' + (className ?? '')}>
      <input type="text" value={value} placeholder={placeholder} autoFocus={autoFocus} aria-label={ariaLabel} role="combobox" aria-expanded={open && items.length > 0} aria-controls={id} aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} autoComplete="off"
        onChange={(e) => { typed.current = true; onChange(e.target.value); }} onKeyDown={onKey} onBlur={() => setTimeout(() => setOpen(false), 150)} onFocus={() => items.length && setOpen(true)} />
      {open && (items.length > 0 || loading) && <ul className="addr-list" id={id} role="listbox">
        {items.map((g, i) => <li key={g.label + i} id={`${id}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); pick(g); }}>
          <span>{g.label}</span>{g.source && <small>{g.source}</small>}</li>)}
        {loading && <li className="muted small" aria-live="polite">Searching…</li>}
      </ul>}
    </div>
  );
}
