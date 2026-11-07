// Display units for distance. Everything is stored and computed in km; only the UI converts.
import React from 'react';
import { useStore } from './store';
import { Num, fmt } from './components/ui';

export const KM_PER_MI = 1.609344;
export type DistUnit = 'mi' | 'km';

export function distUnits(u: DistUnit = 'mi') {
  const k = u === 'mi' ? 1 / KM_PER_MI : 1;
  return {
    unit: u,
    /** km → display value */
    d: (km: number) => km * k,
    /** display value → km */
    toKm: (v: number) => v / k,
    /** formatted with unit, e.g. "3.42 mi" */
    f: (km: number, digits = 2) => (Number.isFinite(km) ? `${fmt(km * k, digits)} ${u}` : '∞'),
    label: u === 'mi' ? 'miles' : 'km',
  };
}
export function useUnits() {
  const { project } = useStore();
  return distUnits(project.settings.units ?? 'mi');
}

/** Number input for a distance stored in km, shown in the selected unit. */
export function DistNum({ km, onChange, nullable, suffix = '' }: { km: number | null; onChange: (km: number | null) => void; nullable?: boolean; suffix?: string }) {
  const u = useUnits();
  const v = km == null ? null : Math.round(u.d(km) * 1000) / 1000;
  return <Num value={v} nullable={nullable} onChange={(x) => onChange(x == null ? null : u.toKm(x))} unit={`${u.unit}${suffix}`} />;
}
