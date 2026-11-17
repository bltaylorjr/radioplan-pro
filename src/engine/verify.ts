// Checks run on every NOAA download before it is used: each value must be in a physically sensible range, the data
// must be recent, and the parts that must be there must be there. Values that fail are dropped (shown as —) rather
// than shown wrong; if a whole download fails, the last good copy stays in use and the page says how old it is.
import type { Weather, WxNow, WxPeriod } from './weather';
import type { SpaceWeather } from './spaceweather';
import { swpcTime } from './spaceweather';

export interface DataCheck {
  /** When the check ran (the download time). */
  at: number;
  /** True when nothing important failed. */
  ok: boolean;
  /** Plain-language results, good and bad. */
  passed: string[];
  issues: string[];
}

const LIMITS: Partial<Record<keyof WxNow, [number, number]>> = {
  tempF: [-60, 130], dewF: [-80, 95], feelsF: [-90, 160], humidity: [0, 100], windMph: [0, 200], gustMph: [0, 250],
  windDeg: [0, 360], pressureInHg: [25, 32.5], visibilityMi: [0, 100],
};
const H = 3600e3;

/** Checks a station report: drops out-of-range values (returns the cleaned report). */
export function checkObservation(n: WxNow, now: number, c: DataCheck): WxNow {
  const out = { ...n };
  let dropped = 0;
  for (const [k, [lo, hi]] of Object.entries(LIMITS) as [keyof WxNow, [number, number]][]) {
    const v = out[k];
    if (typeof v === 'number' && (!Number.isFinite(v) || v < lo || v > hi)) { (out as Record<string, unknown>)[k] = null; dropped++; }
  }
  if (out.gustMph != null && out.windMph != null && out.gustMph < out.windMph) { out.gustMph = null; dropped++; }
  if (out.dewF != null && out.tempF != null && out.dewF > out.tempF + 1) { out.dewF = null; dropped++; }
  if (dropped) c.issues.push(`${dropped} station value${dropped > 1 ? 's were' : ' was'} out of range and left out`);
  const age = now - Date.parse(n.at);
  if (!Number.isFinite(age)) c.issues.push('the station report has no time');
  else if (age > 2 * H) c.issues.push(`the nearest station report is ${Math.round(age / H)} hours old`);
  else if (age < -15 * 60e3) c.issues.push('the station report time is in the future');
  else c.passed.push(`station ${n.station} reported ${Math.max(0, Math.round(age / 60e3))} minutes before download`);
  if (out.tempF == null) c.issues.push('no temperature in the station report');
  return out;
}

/** Checks the forecast periods: times in order and current, temperatures in range. Returns the usable periods. */
export function checkPeriods(ps: WxPeriod[], now: number, c: DataCheck, what: string): WxPeriod[] {
  const good = ps.filter((p) => Number.isFinite(Date.parse(p.start)) && Number.isFinite(Date.parse(p.end)) && Date.parse(p.end) > Date.parse(p.start)
    && (p.tempF == null || (p.tempF >= -60 && p.tempF <= 130)) && (p.pop == null || (p.pop >= 0 && p.pop <= 100)) && (p.windMph == null || (p.windMph >= 0 && p.windMph <= 200)));
  if (good.length < ps.length) c.issues.push(`${ps.length - good.length} ${what} entries failed the checks and were left out`);
  if (!good.length) { c.issues.push(`no usable ${what}`); return good; }
  const lastEnd = Math.max(...good.map((p) => Date.parse(p.end)));
  if (lastEnd < now) c.issues.push(`the ${what} has run out (made more than a few days ago)`);
  else c.passed.push(`${what}: ${good.length} entries, through ${new Date(lastEnd).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`);
  return good;
}

/** Runs every check on a weather download and returns it cleaned, with the result attached. */
export function verifyWeather(w: Weather, now = Date.now()): Weather & { check: DataCheck } {
  const c: DataCheck = { at: now, ok: true, passed: [], issues: [] };
  const nowObs = w.now ? checkObservation(w.now, now, c) : null;
  if (!w.now) c.issues.push('no station report nearby');
  const periods = checkPeriods(w.periods, now, c, 'forecast');
  const hours = w.hours.length ? checkPeriods(w.hours.map((h) => ({ name: '', start: h.t, end: new Date(Date.parse(h.t) + H).toISOString(), isDay: true, tempF: h.tempF, windMph: h.windMph, windText: '', windDir: h.windDir, pop: h.pop, short: h.short, detail: '' })), now, c, 'hourly forecast').map((p) => w.hours.find((h) => h.t === p.start)!) : [];
  const alerts = w.alerts.filter((a) => a.event && (a.ends || a.expires || a.onset));
  c.passed.push(`${alerts.length} alert${alerts.length === 1 ? '' : 's'} in force`);
  for (const p of w.problems) c.issues.push(p);
  c.ok = !!(periods.length && (nowObs?.tempF != null)) && !c.issues.some((i) => /no usable|run out|future|no time/.test(i));
  return { ...w, now: nowObs, periods, hours, alerts, check: c };
}

/** Checks a space weather download (NOAA SWPC). Throws when it is not usable, so the last good forecast stays. */
export function verifySpaceWeather(sw: SpaceWeather, now = Date.now()): SpaceWeather & { check: DataCheck } {
  const c: DataCheck = { at: now, ok: true, passed: [], issues: [] };
  const kp = sw.kp.filter((p) => Number.isFinite(p.kp) && p.kp >= 0 && p.kp <= 9 && Number.isFinite(swpcTime(p.t).getTime()));
  if (kp.length < sw.kp.length) c.issues.push(`${sw.kp.length - kp.length} Kp values failed the checks and were left out`);
  const obs = kp.filter((p) => p.kind !== 'predicted' && swpcTime(p.t).getTime() <= now + 3 * H);
  const last = obs.length ? swpcTime(obs[obs.length - 1].t).getTime() : NaN;
  const ahead = kp.filter((p) => swpcTime(p.t).getTime() > now);
  if (!kp.length) throw new Error('the Kp forecast had no usable values');
  if (!Number.isFinite(last)) c.issues.push('no measured Kp values');
  else if (now - last > 9 * H) c.issues.push(`the latest measured Kp is ${Math.round((now - last) / H)} hours old`);
  else c.passed.push(`latest measured Kp ${obs[obs.length - 1].kp.toFixed(2)} at ${swpcTime(obs[obs.length - 1].t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  if (!ahead.length) c.issues.push('the Kp forecast has no future values');
  else c.passed.push(`forecast runs ${Math.round((swpcTime(ahead[ahead.length - 1].t).getTime() - now) / H)} hours ahead`);
  const sc = [sw.scales.now, ...sw.scales.days].filter(Boolean);
  const scOk = sc.every((d) => [d!.g, d!.s, d!.r].every((x) => x == null || (x >= 0 && x <= 5)) && [d!.rMinorProb, d!.rMajorProb, d!.sProb].every((x) => x == null || (x >= 0 && x <= 100)));
  if (!scOk) c.issues.push('storm scale values out of range');
  else c.passed.push(`storm scales for ${sw.scales.days.length} days`);
  c.ok = !c.issues.length;
  return { ...sw, kp, check: c };
}

/** "✓ Checked 2:41 PM" / "⚠ Checked 2:41 PM: …" for the pages. */
export function checkLine(c: DataCheck | undefined | null): { tone: 'ok' | 'warn'; text: string } | null {
  if (!c) return null;
  const t = new Date(c.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return c.ok && !c.issues.length ? { tone: 'ok', text: `✓ Verified ${t}: ${c.passed.join('; ')}.` } : { tone: 'warn', text: `⚠ Checked ${t}: ${c.issues.join('; ')}.${c.passed.length ? ` OK: ${c.passed.join('; ')}.` : ''}` };
}
