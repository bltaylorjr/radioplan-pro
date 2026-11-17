// Project variables for the magnetic field and space weather: the checked values for Site A are kept on the project
// (project.magnetic), so drawings, reports and other devices use the same declination with its date and model,
// and storm level travels with the job. Kept up to date by itself (App.tsx) when the site moves, the day changes,
// or a newer space weather forecast arrives.
import type { Project, ProjectMagnetic } from '../types';
import { geomag, decimalYear, getMagModel } from './azimuth';
import { kpSummary, gOfKp, type SpaceWeather } from './spaceweather';

/** Site A, or null when the project has no position yet. */
export function projectPoint(p: Project): { lat: number; lon: number } | null {
  const s = p.sites[0];
  return s && Number.isFinite(s.lat) && Number.isFinite(s.lon) && (s.lat !== 0 || s.lon !== 0) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180 ? { lat: s.lat, lon: s.lon } : null;
}

/** Magnetic values for a point and date, or null when they do not pass the checks (model out of date, numbers out of range). */
export function magneticValues(pt: { lat: number; lon: number }, when = new Date(), altKm = 0): Omit<ProjectMagnetic, 'space'> | null {
  const m = getMagModel(), yr = decimalYear(when);
  const a = geomag(pt.lat, pt.lon, when, altKm);
  if (a.outOfRange) return null; // the model does not cover today: do not store guesses
  const b = geomag(pt.lat, pt.lon, Math.min(yr + 1, m.epoch + 5), altKm), span = Math.min(yr + 1, m.epoch + 5) - yr;
  const per = span > 0.01 ? (b.decDeg - a.decDeg) / span : 0;
  const ok = [a.decDeg, a.dipDeg, a.totalNt, per].every(Number.isFinite) && Math.abs(a.decDeg) <= 180 && Math.abs(a.dipDeg) <= 90 && a.totalNt > 20000 && a.totalNt < 70000 && Math.abs(per) < 2;
  if (!ok) return null;
  const r = (v: number, d: number) => +v.toFixed(d);
  return { lat: r(pt.lat, 5), lon: r(pt.lon, 5), date: when.toISOString().slice(0, 10), model: m.name, decDeg: r(a.decDeg, 2), decPerYearDeg: r(per, 3), dipDeg: r(a.dipDeg, 2), totalNt: Math.round(a.totalNt) };
}

/** Space weather values worth keeping with the project: only a forecast that parsed and is under 12 hours old. */
export function spaceValues(sw: SpaceWeather | null, now = Date.now()): ProjectMagnetic['space'] | undefined {
  if (!sw || !Array.isArray(sw.kp) || !sw.kp.length || now - sw.fetchedAt > 12 * 3600e3 || sw.fetchedAt > now + 600e3) return undefined;
  const k = kpSummary(sw, now);
  const gNow = sw.scales.now?.g ?? (k.current ? gOfKp(k.current.kp) : 0);
  const gPeak3d = Math.max(k.peak ? gOfKp(k.peak.kp) : 0, ...sw.scales.days.map((d) => d.g ?? 0));
  return { fetchedAt: new Date(sw.fetchedAt).toISOString(), kpNow: k.current ? +k.current.kp.toFixed(2) : null, gNow, gPeak3d, radioBlackoutPct: sw.scales.days[0]?.rMinorProb ?? null };
}

/** The project's magnetic variables as they should be now, or null when nothing needs to change. */
export function nextProjectMagnetic(p: Project, sw: SpaceWeather | null, when = new Date()): ProjectMagnetic | null {
  const pt = projectPoint(p); if (!pt) return null;
  const mag = magneticValues(pt, when); if (!mag) return null;
  const space = spaceValues(sw, when.getTime()) ?? p.magnetic?.space;
  const cur = p.magnetic;
  const sameSpace = (a?: ProjectMagnetic['space'], b?: ProjectMagnetic['space']) => !a && !b || !!a && !!b && a.kpNow === b.kpNow && a.gNow === b.gNow && a.gPeak3d === b.gPeak3d && a.radioBlackoutPct === b.radioBlackoutPct && Math.abs(Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt)) < 6 * 3600e3;
  // Unchanged: same day, model and place, and the same storm picture (a new download alone does not rewrite the project).
  const same = cur && cur.date === mag.date && cur.model === mag.model && Math.abs(cur.lat - mag.lat) < 1e-4 && Math.abs(cur.lon - mag.lon) < 1e-4 && sameSpace(cur.space, space);
  return same ? null : { ...mag, ...(space ? { space } : {}) };
}

/** Declination to use for the project at Site A: the stored, checked value when it is for Site A, otherwise null. */
export function projectDeclination(p: Project): { decDeg: number; date: string; model: string } | null {
  const m = p.magnetic, pt = projectPoint(p);
  if (!m || !pt || Math.abs(m.lat - pt.lat) > 1e-4 || Math.abs(m.lon - pt.lon) > 1e-4 || !Number.isFinite(m.decDeg)) return null;
  return { decDeg: m.decDeg, date: m.date, model: m.model };
}
