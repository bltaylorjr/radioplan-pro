// Azimuth calculator math and the project fields its result can fill in (pure; used by components/AzimuthCalc.tsx).
import { azimuthPair, elevationAngleDeg, fmtDeg, type AzimuthPair } from './azimuth';
import type { ApplyTarget } from './calcApply';
import type { LatLon } from './geo';
import type { Project } from '../types';

export interface AzPoint extends LatLon { label: string; siteId?: string }
export interface AzInputs { a: AzPoint | null; b: AzPoint | null; aGroundM: number | null; bGroundM: number | null; aAntM: number | null; bAntM: number | null; k: number }
export interface AzResult { z: AzimuthPair; aAmsl: number | null; bAmsl: number | null; tiltA: number | null; tiltB: number | null }

/** Results for the inputs, or null when a point is missing. Tilt: + = up, − = down (needs both ground heights). */
export function azimuthCalc(x: AzInputs): AzResult | null {
  if (!x.a || !x.b || (x.a.lat === x.b.lat && x.a.lon === x.b.lon)) return null;
  const z = azimuthPair(x.a, x.b);
  const aAmsl = x.aGroundM == null ? null : x.aGroundM + (x.aAntM ?? 0), bAmsl = x.bGroundM == null ? null : x.bGroundM + (x.bAntM ?? 0);
  const both = aAmsl != null && bAmsl != null;
  return { z, aAmsl, bAmsl, tiltA: both ? elevationAngleDeg(z.km, aAmsl!, bAmsl!, x.k) : null, tiltB: both ? elevationAngleDeg(z.km, bAmsl!, aAmsl!, x.k) : null };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
export const tiltText = (t: number) => `${Math.abs(t) < 0.05 ? 'level' : t > 0 ? `up ${Math.abs(t).toFixed(1)}°` : `down ${Math.abs(t).toFixed(1)}°`}`;
export const pos = (q: { lat: number; lon: number } | null | undefined) => (q ? `${q.lat.toFixed(5)}, ${q.lon.toFixed(5)}` : '');

/** The fields an azimuth result can fill in. A = the antenna being aimed, B = what it aims at. */
export function azimuthTargets(p: Project, x: AzInputs, res: AzResult): ApplyTarget[] {
  const { z } = res, fwd = r1(z.fwd), down = res.tiltA == null ? null : r1(-res.tiltA);
  const aSite = x.a?.siteId ? p.sites.findIndex((s) => s.id === x.a!.siteId) : -1;
  const aIsTx = aSite >= 0 && p.sites[aSite].id === p.radio.txSiteId;
  const t: ApplyTarget[] = [
    { id: 'radio-az', label: 'Main antenna azimuth', page: 'Tilt, Azimuth & Power', sets: [[['radio', 'azimuthDeg'], fwd]], to: `${fmtDeg(fwd)}°T`, now: (q) => `${fmtDeg(q.radio.azimuthDeg)}°T`, on: aSite < 0 || aIsTx },
  ];
  if (down != null) t.push({ id: 'radio-tilt', label: 'Main antenna mechanical downtilt', page: 'Tilt, Azimuth & Power', sets: [[['radio', 'mechTiltDeg'], down]], to: `${down}°${down < 0 ? ' (uptilt)' : ''}`, now: (q) => `${q.radio.mechTiltDeg}°`, on: aSite < 0 || aIsTx });
  if (x.b) t.push({ id: 'donor', label: 'Donor tower position (point B)', page: 'Emergency Radio (ERCES / BDA) and Indoor Coverage & DAS donor aiming',
    sets: [[['erces', 'donorLat'], x.b.lat], [['erces', 'donorLon'], x.b.lon], [['erces', 'donorName'], x.b.label.slice(0, 60)]],
    to: `${x.b.label.slice(0, 40)} (${pos(x.b)})`, now: (q) => (q.erces.donorLat != null && q.erces.donorLon != null ? `${q.erces.donorName || 'Donor'} (${pos({ lat: q.erces.donorLat, lon: q.erces.donorLon! })})` : ''), on: aSite === 0 });
  p.sites.forEach((s, i) => {
    if (!s.tx) return;
    const sets: [(string | number)[], unknown][] = [[['sites', i, 'tx', 'azimuthDeg'], fwd]];
    if (down != null) sets.push([['sites', i, 'tx', 'tiltDeg'], down]);
    t.push({ id: `tx-${s.id}`, label: `Transmitter at ${s.name}: azimuth${down != null ? ' and tilt' : ''}`, page: 'Multi-site & Interference', sets,
      to: `${fmtDeg(fwd)}°T${down != null ? `, tilt ${down}°` : ''}`, now: (q) => (q.sites[i]?.tx ? `${fmtDeg(q.sites[i].tx!.azimuthDeg)}°T, tilt ${q.sites[i].tx!.tiltDeg}°` : ''), on: i === aSite });
  });
  if (aSite >= 0 && x.aAntM != null) t.push({ id: 'a-height', label: `Antenna height at ${p.sites[aSite].name}`, page: 'Site Data & GPS', sets: [[['sites', aSite, 'antennaAglM'], r1(x.aAntM)]], to: `${r1(x.aAntM)} m (${r1(x.aAntM / 0.3048)} ft)`, now: (q) => `${q.sites[aSite]?.antennaAglM ?? ''} m`, on: false });
  if (x.a && aSite < 0 && p.sites[0]) t.push({ id: 'a-pos', label: `Position of ${p.sites[0].name} (point A)`, page: 'Site Data & GPS', sets: [[['sites', 0, 'lat'], x.a.lat], [['sites', 0, 'lon'], x.a.lon]], to: pos(x.a), now: (q) => pos(q.sites[0]), on: false });
  return t;
}

