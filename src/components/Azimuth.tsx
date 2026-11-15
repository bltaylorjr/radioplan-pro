// Azimuth display pieces shared by maps, path, link budget, aiming, ERCES/BDA, DAS, drive test and reports.
import React, { useMemo } from 'react';
import { azimuthPair, declinationDeg, fmtAz, fmtDecl, fmtDeg, trueToMag, compassPoint, elevationAngleDeg, type AzimuthPair } from '../engine/azimuth';
import type { LatLon } from '../engine/geo';
import { Stat, Tip } from './ui';

export const AZ_TIP = 'Azimuth is the compass direction to aim, in degrees clockwise from north. °T = true north (maps, GPS, FCC filings). °M = magnetic north (what a hand compass reads), from the World Magnetic Model WMM2025. Stand clear of vehicles, steel and power lines when using a compass, or use a GPS alignment tool.';

export const useDecl = (q: LatLon | null | undefined) => useMemo(() => (q && Number.isFinite(q.lat) && Number.isFinite(q.lon) ? declinationDeg(q) : null), [q?.lat, q?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
export const useAzimuth = (a: LatLon | null | undefined, b: LatLon | null | undefined): AzimuthPair | null =>
  useMemo(() => (a && b && (a.lat !== b.lat || a.lon !== b.lon) ? azimuthPair(a, b) : null), [a?.lat, a?.lon, b?.lat, b?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

/** Plain text for reports and tooltips: "A → B 045.2°T (052.1°M) NE; back B → A 225.3°T (232.2°M) SW". */
export function azPairText(z: AzimuthPair, aName = 'A', bName = 'B'): string {
  return `${aName} → ${bName} ${fmtAz(z.fwd, z.decA)}; back ${bName} → ${aName} ${fmtAz(z.back, z.decB)}`;
}

/** One line, used under path lists: forward and back azimuth, true and magnetic. */
export function AzLine({ a, b, aName = 'A', bName = 'B', elev }: { a: LatLon; b: LatLon; aName?: string; bName?: string; elev?: { aAmslM: number; bAmslM: number; k?: number } }) {
  const z = useAzimuth(a, b); if (!z) return null;
  const up = elev ? elevationAngleDeg(z.km, elev.aAmslM, elev.bAmslM, elev.k) : null, dn = elev ? elevationAngleDeg(z.km, elev.bAmslM, elev.aAmslM, elev.k) : null;
  const tilt = (t: number | null) => (t == null ? '' : `, tilt ${t >= 0 ? 'up' : 'down'} ${Math.abs(t).toFixed(1)}°`);
  return <span className="az-line small">🧭 Aim <b>{aName}</b> at <b>{fmtAz(z.fwd, z.decA)}</b>{tilt(up)}; aim <b>{bName}</b> back at <b>{fmtAz(z.back, z.decB)}</b>{tilt(dn)} <Tip text={AZ_TIP} /></span>;
}

/** Stat tiles: azimuth both ways (true + magnetic) and the declination. */
export function AzStats({ a, b, aName = 'A', bName = 'B' }: { a: LatLon | null | undefined; b: LatLon | null | undefined; aName?: string; bName?: string }) {
  const z = useAzimuth(a, b); if (!z) return null;
  return <>
    <Stat label={`Azimuth ${aName} → ${bName}`} value={`${fmtDeg(z.fwd)}°T`} unit={` · ${fmtDeg(z.fwdMag)}°M ${compassPoint(z.fwd)}`} tip={AZ_TIP} />
    <Stat label={`Back azimuth ${bName} → ${aName}`} value={`${fmtDeg(z.back)}°T`} unit={` · ${fmtDeg(z.backMag)}°M ${compassPoint(z.back)}`} tip="The direction to aim the far-end antenna back at this one. Follows the great circle, so on long paths it is not exactly 180° from the forward azimuth." />
    <Stat label="Magnetic declination" value={fmtDecl(z.decA)} tip={`Compass reading = true azimuth − declination (east positive). WMM2025, ${new Date().getFullYear()}. Declination drifts about 0.1° a year.`} />
  </>;
}

/** A set antenna azimuth (degrees true) shown with its magnetic equivalent. */
export function MagNote({ trueDeg, at }: { trueDeg: number; at: LatLon | null | undefined }) {
  const d = useDecl(at); if (d == null || !Number.isFinite(trueDeg)) return null;
  return <span className="small muted">= {fmtDeg(trueToMag(trueDeg, d))}°M on a compass ({compassPoint(trueDeg)}, declination {fmtDecl(d)})</span>;
}
