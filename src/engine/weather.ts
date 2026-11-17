// Live weather from NOAA's National Weather Service (api.weather.gov, public domain, no key needed):
//   points/{lat},{lon}                       which forecast office and grid square covers the place
//   gridpoints/{office}/{x},{y}/forecast     7-day forecast, day and night (12-hour periods)
//   gridpoints/{office}/{x},{y}/forecast/hourly   hour-by-hour forecast
//   gridpoints/{office}/{x},{y}/stations     nearby weather stations (closest first)
//   stations/{id}/observations/latest        latest checked observation from a station
//   alerts/active?point={lat},{lon}           watches, warnings and advisories in force at the place
// The radar map uses NOAA's MRMS base reflectivity (opengeo.ncep.noaa.gov), shown live and never stored.
//
// Downloaded when online (when the Weather page opens, every 10 minutes while it is open, and hourly by
// automatic care for the last place looked at) and kept on this device so the page shows the last
// conditions, with the time they were downloaded, when offline. Everything is shown in °F, mph and inches
// (or °C, km/h and mm when the project is set to km).
import { kvGet, kvSet } from './projectdb';
import { registerDataset } from './maintain';

export const NWS = 'https://api.weather.gov/';
export const RADAR_WMS = 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows';
export const RADAR_LAYER = 'conus_bref_qcd';
const KEY = 'weather.last';
const PLACE_KEY = 'weather.place';
const POINT_KEY = 'weather.points';

export interface WxPlace { lat: number; lon: number; name: string; /** Project id when this is the project site. */ projectId?: string }
export interface WxPoint {
  office: string; gridX: number; gridY: number; forecast: string; forecastHourly: string; stations: string;
  city: string; state: string; timeZone: string; radar: string; zone?: string; county?: string;
}
/** One checked observation. Values NOAA rejected or questioned in its quality checks are left out (null). */
export interface WxNow {
  station: string; stationName: string; at: string; text: string;
  tempF: number | null; dewF: number | null; humidity: number | null; windMph: number | null; gustMph: number | null; windDeg: number | null;
  feelsF: number | null; pressureInHg: number | null; visibilityMi: number | null; distMi?: number | null;
}
export interface WxPeriod { name: string; start: string; end: string; isDay: boolean; tempF: number | null; windMph: number | null; windText: string; windDir: string; pop: number | null; short: string; detail: string }
export interface WxHour { t: string; tempF: number | null; pop: number | null; windMph: number | null; windDir: string; short: string }
export interface WxAlert {
  id: string; event: string; severity: string; urgency: string; certainty: string; headline: string; description: string; instruction: string;
  onset: string | null; ends: string | null; expires: string | null; area: string; sender: string; zones: string[];
  /** GeoJSON geometry of the alert area (polygon), when NOAA gives one. */
  geometry?: GeoJSON.Geometry | null;
}
export interface Weather {
  fetchedAt: number; place: WxPlace; point: WxPoint; now: WxNow | null; periods: WxPeriod[]; hours: WxHour[]; alerts: WxAlert[];
  /** Parts that could not be downloaded this time (the rest is still fresh). */
  problems: string[];
}

// ---------- unit conversion (NOAA observations are metric with WMO unit codes) ----------
type Q = { value?: number | null; unitCode?: string; qualityControl?: string } | null | undefined;
const BAD_QC = new Set(['X', 'Q', 'B']); // rejected, questioned, failed by NOAA's checks
/** A checked value from an observation, converted to the unit wanted. */
export function qv(q: Q, want: 'F' | 'mph' | 'inHg' | 'mi' | 'pct' | 'deg'): number | null {
  if (!q || q.value == null || !Number.isFinite(q.value) || (q.qualityControl && BAD_QC.has(q.qualityControl))) return null;
  const v = q.value, u = (q.unitCode ?? '').replace(/^(wmoUnit|unit):/, '');
  switch (want) {
    case 'F': return u === 'degF' ? v : v * 9 / 5 + 32;
    case 'mph': return u === 'm_s-1' ? v * 2.236936 : u === 'mi_h-1' || u === 'mph' ? v : v / 1.609344; // km_h-1 by default
    case 'inHg': return u === 'hPa' ? v / 33.8639 : v / 3386.39; // Pa by default
    case 'mi': return u === 'km' ? v / 1.609344 : v / 1609.344; // m by default
    default: return v;
  }
}
const toNum = (v: unknown): number | null => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
/** "5 to 10 mph" / "15 mph" / { value, maxValue } → the highest speed in mph. */
export function windMph(w: unknown): number | null {
  if (w == null) return null;
  if (typeof w === 'object') { const o = w as { value?: number; maxValue?: number; unitCode?: string }; const v = toNum(o.maxValue ?? o.value); return v == null ? null : qv({ value: v, unitCode: o.unitCode ?? 'wmoUnit:km_h-1' }, 'mph'); }
  const nums = String(w).match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (!nums.length) return /calm/i.test(String(w)) ? 0 : null;
  const top = Math.max(...nums);
  return /km\/h/i.test(String(w)) ? top / 1.609344 : top;
}
const tempF = (t: unknown, unit: unknown): number | null => {
  if (t && typeof t === 'object') return qv(t as Q, 'F');
  const n = toNum(t); if (n == null) return null; return unit === 'C' ? n * 9 / 5 + 32 : n;
};
const popOf = (p: unknown): number | null => (p && typeof p === 'object' ? toNum((p as { value?: unknown }).value) : toNum(p));
export const fToC = (f: number) => (f - 32) * 5 / 9;
export const compass16 = (d: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((((d % 360) + 360) % 360) / 22.5) % 16];

// ---------- parsing the NWS responses ----------
const props = (raw: unknown): Record<string, unknown> => {
  const p = (raw as { properties?: unknown })?.properties;
  if (!p || typeof p !== 'object') throw new Error('the weather service answered in an unexpected layout');
  return p as Record<string, unknown>;
};
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function parsePoint(raw: unknown): WxPoint {
  const p = props(raw);
  const rl = props(p.relativeLocation ?? { properties: {} });
  const office = str(p.gridId) || str(p.cwa);
  if (!office || !str(p.forecast)) throw new Error('NOAA has no forecast for this place (the National Weather Service covers the US only)');
  return {
    office, gridX: Number(p.gridX), gridY: Number(p.gridY), forecast: str(p.forecast), forecastHourly: str(p.forecastHourly), stations: str(p.observationStations),
    city: str(rl.city), state: str(rl.state), timeZone: str(p.timeZone), radar: str(p.radarStation), zone: str(p.forecastZone) || undefined, county: str(p.county) || undefined,
  };
}

export function parsePeriods(raw: unknown): WxPeriod[] {
  const list = props(raw).periods;
  if (!Array.isArray(list)) throw new Error('the forecast has no periods');
  return list.map((x: Record<string, unknown>) => ({
    name: str(x.name), start: str(x.startTime), end: str(x.endTime), isDay: x.isDaytime !== false,
    tempF: tempF(x.temperature, x.temperatureUnit), windMph: windMph(x.windSpeed), windText: typeof x.windSpeed === 'string' ? x.windSpeed : (() => { const w = windMph(x.windSpeed); return w == null ? '' : `${Math.round(w)} mph`; })(),
    windDir: str(x.windDirection), pop: popOf(x.probabilityOfPrecipitation), short: str(x.shortForecast), detail: str(x.detailedForecast),
  }));
}

export const parseHours = (raw: unknown): WxHour[] => parsePeriods(raw).map((p) => ({ t: p.start, tempF: p.tempF, pop: p.pop, windMph: p.windMph, windDir: p.windDir, short: p.short }));

export function parseObservation(raw: unknown, station: { id: string; name: string; distMi?: number | null }): WxNow {
  const p = props(raw);
  const t = qv(p.temperature as Q, 'F');
  const feels = qv(p.heatIndex as Q, 'F') ?? qv(p.windChill as Q, 'F');
  return {
    station: station.id, stationName: station.name, at: str(p.timestamp), text: str(p.textDescription),
    tempF: t, dewF: qv(p.dewpoint as Q, 'F'), humidity: qv(p.relativeHumidity as Q, 'pct'), windMph: qv(p.windSpeed as Q, 'mph'), gustMph: qv(p.windGust as Q, 'mph'),
    windDeg: qv(p.windDirection as Q, 'deg'), feelsF: feels, pressureInHg: qv((p.barometricPressure ?? p.seaLevelPressure) as Q, 'inHg'), visibilityMi: qv(p.visibility as Q, 'mi'), distMi: station.distMi ?? null,
  };
}

export function parseStations(raw: unknown, at?: { lat: number; lon: number }): { id: string; name: string; distMi: number | null }[] {
  const f = (raw as { features?: unknown })?.features;
  if (!Array.isArray(f)) throw new Error('no weather stations listed');
  return f.map((x: { properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }) => {
    const c = x.geometry?.coordinates;
    const distMi = at && c && c.length >= 2 ? milesBetween(at.lat, at.lon, c[1], c[0]) : null;
    return { id: str(x.properties?.stationIdentifier), name: str(x.properties?.name), distMi };
  }).filter((s) => s.id);
}

export function parseAlerts(raw: unknown): WxAlert[] {
  const f = (raw as { features?: unknown })?.features;
  if (!Array.isArray(f)) throw new Error('the alert list is not laid out as expected');
  return f.map((x: { id?: string; properties?: Record<string, unknown>; geometry?: GeoJSON.Geometry | null }) => {
    const p = x.properties ?? {};
    return {
      id: str(p.id) || str(x.id), event: str(p.event), severity: str(p.severity), urgency: str(p.urgency), certainty: str(p.certainty),
      headline: str(p.headline), description: str(p.description), instruction: str(p.instruction),
      onset: str(p.onset) || str(p.effective) || null, ends: str(p.ends) || null, expires: str(p.expires) || null,
      area: str(p.areaDesc), sender: str(p.senderName), zones: Array.isArray(p.affectedZones) ? (p.affectedZones as string[]).filter((z) => typeof z === 'string') : [],
      geometry: x.geometry ?? null, test: str(p.status) === 'Test' || str(p.messageType) === 'Cancel',
    };
  }).filter((a) => a.event && !a.test).map(({ test: _t, ...a }) => a)
    .sort((a, b) => alertRank(b) - alertRank(a));
}

const SEV: Record<string, number> = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };
/** Warnings first, then watches, then advisories and statements; worse severity first. */
export const alertRank = (a: Pick<WxAlert, 'event' | 'severity'>) => (/warning/i.test(a.event) ? 30 : /watch/i.test(a.event) ? 20 : 10) + (SEV[a.severity] ?? 0);
export const alertTone = (a: Pick<WxAlert, 'event' | 'severity'>): 'bad' | 'warn' | 'ok' => (/warning/i.test(a.event) || (SEV[a.severity] ?? 0) >= 3 ? 'bad' : 'warn');
/** Still in force at `now` (not ended or expired). */
export const alertActive = (a: { ends?: string | null; expires?: string | null }, now = Date.now()) => { const e = Date.parse(a.ends || a.expires || ''); return !Number.isFinite(e) || e > now; };

export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180, dLa = (lat2 - lat1) * r, dLo = (lon2 - lon1) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

// ---------- downloading ----------
async function getJson(url: string, ms = 20000) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctl?.signal, headers: { Accept: 'application/geo+json' } });
    if (r.status === 404) throw new Error('NOAA has no weather data for this place (the National Weather Service covers the US only)');
    if (!r.ok) throw new Error(`the weather service answered ${r.status}${r.status >= 500 ? ' (busy; try again in a minute)' : ''}`);
    return await r.json();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('the weather service took too long to answer');
    if (e instanceof TypeError) throw new Error('no internet connection');
    throw e;
  } finally { if (timer) clearTimeout(timer); }
}
const ll = (n: number) => (Math.round(n * 1e4) / 1e4).toString();

/** Which NOAA forecast office / grid square covers the place (kept on the device; it rarely changes). */
async function pointFor(lat: number, lon: number): Promise<WxPoint> {
  const k = `${ll(lat)},${ll(lon)}`;
  const saved = (await kvGet<Record<string, WxPoint & { at: number }>>(POINT_KEY).catch(() => undefined)) ?? {};
  const hit = saved[k];
  if (hit && Date.now() - hit.at < 30 * 24 * 3600e3) return hit;
  const pt = parsePoint(await getJson(`${NWS}points/${k}`));
  const keep = Object.fromEntries(Object.entries(saved).sort((a, b) => b[1].at - a[1].at).slice(0, 19));
  await kvSet(POINT_KEY, { ...keep, [k]: { ...pt, at: Date.now() } }).catch(() => undefined);
  return pt;
}

/** Latest checked observation from the closest station that reported in the last 2 hours. */
async function latestObservation(pt: WxPoint, at: { lat: number; lon: number }): Promise<WxNow | null> {
  const stations = parseStations(await getJson(pt.stations), at).slice(0, 4);
  let fallback: WxNow | null = null;
  for (const s of stations) {
    try {
      const o = parseObservation(await getJson(`${NWS}stations/${encodeURIComponent(s.id)}/observations/latest`), s);
      const age = Date.now() - Date.parse(o.at);
      if (o.tempF != null && Number.isFinite(age) && age < 2 * 3600e3) return o;
      fallback ??= o.tempF != null ? o : null;
    } catch { /* try the next station */ }
  }
  return fallback;
}

/** Download current conditions, forecast and alerts for a place and keep them on this device. */
export async function downloadWeather(place: WxPlace, now = Date.now()): Promise<Weather> {
  const point = await pointFor(place.lat, place.lon);
  const problems: string[] = [];
  const prev = await savedWeather();
  const same = prev && Math.abs(prev.place.lat - place.lat) < 1e-3 && Math.abs(prev.place.lon - place.lon) < 1e-3 ? prev : null;
  const part = async <T,>(what: string, f: () => Promise<T>, old: T): Promise<T> => { try { return await f(); } catch (e) { problems.push(`${what}: ${(e as Error).message}`); return old; } };
  const [periods, hours, now_, alerts] = await Promise.all([
    part('forecast', async () => parsePeriods(await getJson(point.forecast)), same?.periods ?? []),
    part('hourly forecast', async () => parseHours(await getJson(point.forecastHourly)), same?.hours ?? []),
    part('current conditions', () => latestObservation(point, place), same?.now ?? null),
    part('alerts', async () => parseAlerts(await getJson(`${NWS}alerts/active?point=${ll(place.lat)},${ll(place.lon)}`)), same?.alerts ?? []),
  ]);
  if (!periods.length && !now_) throw new Error(problems[0] ?? 'nothing came back from the weather service');
  const w: Weather = { fetchedAt: now, place, point, now: now_, periods, hours, alerts, problems };
  await kvSet(KEY, w);
  await kvSet(PLACE_KEY, place);
  lastSeen = w; listeners.forEach((f) => f(w));
  return w;
}

/** Outline of a forecast zone or county (for alerts NOAA lists by zone without drawing an area). Kept on the device. */
export async function zoneShape(url: string): Promise<GeoJSON.Geometry | null> {
  const k = 'weather.zone.' + url.replace(/^.*\/zones\//, '');
  const hit = await kvGet<GeoJSON.Geometry | null>(k).catch(() => undefined);
  if (hit !== undefined) return hit;
  const g = ((await getJson(url)) as { geometry?: GeoJSON.Geometry | null }).geometry ?? null;
  await kvSet(k, g).catch(() => undefined);
  return g;
}

let lastSeen: Weather | null = null;
const listeners = new Set<(w: Weather) => void>();
export function onWeather(f: (w: Weather) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** The last weather kept on this device (null if never downloaded). */
export async function savedWeather(): Promise<Weather | null> {
  if (lastSeen) return lastSeen;
  const v = await kvGet<Weather>(KEY).catch(() => undefined);
  if (v && v.place && Array.isArray(v.periods) && Number.isFinite(v.fetchedAt)) lastSeen = v;
  return lastSeen;
}

// ---------- what it means for the work ----------
export interface WorkNote { tone: 'ok' | 'warn' | 'bad'; icon: string; text: string }
const has = (p: { short: string; detail?: string }, re: RegExp) => re.test(p.short) || re.test(p.detail ?? '');
const THUNDER = /thunder|t-storm|tstorm/i;

/** The forecast periods for the rest of today and tonight (the next ~24 hours). */
export const nextDay = (w: Pick<Weather, 'periods'>, now = Date.now()) => w.periods.filter((p) => Date.parse(p.end) > now).slice(0, 2);

/** Plain-language work-day checks for low-voltage, tower and roof work from the alerts and the next 24 hours. */
export function workNotes(w: Pick<Weather, 'periods' | 'hours' | 'alerts' | 'now'>, now = Date.now()): WorkNote[] {
  const out: WorkNote[] = [];
  const day = nextDay(w, now);
  const hrs = w.hours.filter((h) => { const t = Date.parse(h.t); return t >= now - 3600e3 && t < now + 24 * 3600e3; });
  const alerts = w.alerts.filter((a) => alertActive(a, now));
  for (const a of alerts.slice(0, 3)) out.push({ tone: alertTone(a), icon: '⚠', text: `${a.event} in force${a.ends || a.expires ? ` until ${fmtTime(a.ends || a.expires!)}` : ''}. Follow the National Weather Service instructions.` });
  const wind = Math.max(0, ...day.map((p) => p.windMph ?? 0), ...hrs.map((h) => h.windMph ?? 0), w.now?.windMph ?? 0);
  const gust = Math.max(w.now?.gustMph ?? 0, ...day.map((p) => { const g = p.detail.match(/gusts? as high as (\d+)/i); return g ? +g[1] : 0; }));
  const top = Math.max(wind, gust);
  if (day.some((p) => has(p, THUNDER)) || hrs.some((h) => THUNDER.test(h.short))) out.push({ tone: 'bad', icon: '⚡', text: 'Thunderstorms possible: no tower, roof, pole or aerial-lift work while storms are near. When thunder roars, go indoors, and wait 30 minutes after the last thunder (NWS).' });
  if (top >= 30) out.push({ tone: 'bad', icon: '💨', text: `Wind or gusts to about ${Math.round(top)} mph: too windy for most tower climbing and lifts. Most aerial lifts are rated for 28 mph at most (see the lift's plate).` });
  else if (top >= 20) out.push({ tone: 'warn', icon: '💨', text: `Wind or gusts to about ${Math.round(top)} mph: OSHA stops crane-hoisted personnel platforms above 20 mph; check the lift's wind rating and your safety plan before going up.` });
  const temps = [...day.map((p) => p.tempF), ...hrs.map((h) => h.tempF), w.now?.tempF].filter((t): t is number => t != null);
  const lo = temps.length ? Math.min(...temps) : null, hi = temps.length ? Math.max(...temps) : null;
  if (lo != null && lo <= 32) out.push({ tone: lo <= 14 ? 'bad' : 'warn', icon: '🥶', text: `Down to ${Math.round(lo)} °F: check each cable's lowest installation temperature on its data sheet (many PVC jackets crack below about 32 °F); keep reels warm before pulling. Batteries give less capacity in the cold.` });
  const feels = Math.max(w.now?.feelsF ?? -99, hi ?? -99);
  if (feels >= 91) out.push({ tone: feels >= 103 ? 'bad' : 'warn', icon: '🥵', text: `Heat up to about ${Math.round(feels)} °F: attic and roof work is a heat-illness risk. Water, rest and shade (OSHA heat safety).` });
  const pop = Math.max(0, ...day.map((p) => p.pop ?? 0));
  if (pop >= 50) out.push({ tone: 'warn', icon: '🌧', text: `${pop}% chance of rain: plan cover for outdoor terminations, fiber splicing and roof penetrations.` });
  if (!out.length) out.push({ tone: 'ok', icon: '✅', text: 'No weather concerns for outdoor work in the next 24 hours.' });
  return out;
}

export const fmtTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); };
export const ago = (ms: number) => { const m = Math.round(ms / 60000); return m < 2 ? 'just now' : m < 120 ? `${m} minutes ago` : m < 48 * 60 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };

// ---------- the project's weather (saved on the project, used by other pages) ----------
/** Weather values saved on the project for its site, used by other pages (alerts on job pages, solar cold check, field notes). */
export interface ProjectWeather {
  at: number; lat: number; lon: number; place: string; station: string; obsAt: string;
  tempF: number | null; windMph: number | null; gustMph: number | null; humidity: number | null;
  /** Coldest and hottest in the 7-day forecast, highest wind in it. */
  lowF: number | null; highF: number | null; maxWindMph: number | null;
  alerts: { event: string; severity: string; ends: string | null }[];
  notes: WorkNote[];
}
export function projectWeather(w: Weather, now = Date.now()): ProjectWeather {
  const t = w.periods.map((p) => p.tempF).filter((x): x is number => x != null);
  const wn = w.periods.map((p) => p.windMph).filter((x): x is number => x != null);
  return {
    at: w.fetchedAt, lat: w.place.lat, lon: w.place.lon, place: w.place.name, station: w.now ? `${w.now.stationName} (${w.now.station})` : '', obsAt: w.now?.at ?? '',
    tempF: w.now?.tempF ?? null, windMph: w.now?.windMph ?? null, gustMph: w.now?.gustMph ?? null, humidity: w.now?.humidity ?? null,
    lowF: t.length ? Math.min(...t) : null, highF: t.length ? Math.max(...t) : null, maxWindMph: wn.length ? Math.max(...wn) : null,
    alerts: w.alerts.filter((a) => alertActive(a, now)).map((a) => ({ event: a.event, severity: a.severity, ends: a.ends || a.expires })),
    notes: workNotes(w, now),
  };
}
/** One line for a field note or service record: "Mostly Cloudy, 48 °F, wind NW 9 mph gusting 18 (KAVL, 2:51 PM)". */
export function weatherLine(w: Weather): string {
  const n = w.now; const parts: string[] = [];
  if (n) {
    const c = [n.text, n.tempF != null ? `${Math.round(n.tempF)} °F` : ''];
    if (n.windMph != null) c.push(`wind ${n.windDeg != null ? compass16(n.windDeg) + ' ' : ''}${Math.round(n.windMph)} mph${n.gustMph ? ` gusting ${Math.round(n.gustMph)}` : ''}`);
    if (n.humidity != null) c.push(`humidity ${Math.round(n.humidity)}%`);
    parts.push(`${c.filter(Boolean).join(', ')} (NWS station ${n.station}, ${fmtTime(n.at)}).`);
  }
  const f = w.periods[0]; if (f) parts.push(`Forecast ${f.name}: ${f.short}${f.tempF != null ? `, ${f.isDay ? 'high' : 'low'} ${Math.round(f.tempF)} °F` : ''}${f.pop ? `, ${f.pop}% rain` : ''}.`);
  const a = w.alerts.filter((x) => alertActive(x)); if (a.length) parts.push(`Alerts: ${a.map((x) => x.event).join(', ')}.`);
  return parts.join(' ');
}

registerDataset({
  id: 'weather', label: 'Weather for the last place looked at (NOAA)', everyHours: 1, needsOnline: true,
  async available() { return (await kvGet<WxPlace>(PLACE_KEY).catch(() => undefined)) ? true : 'opens the first time you look at the Weather page'; },
  async verify() {
    const v = await kvGet<Weather>(KEY).catch(() => undefined);
    if (v !== undefined && (!v || !v.place || !Array.isArray(v.periods))) return { ok: false, problem: 'the saved weather is damaged' };
    return { ok: true };
  },
  async repair() { await kvSet(KEY, undefined); lastSeen = null; return 'removed the damaged weather; a fresh copy downloads when online'; },
  async refresh(ctx) {
    const place = await kvGet<WxPlace>(PLACE_KEY); if (!place) return { changed: false, detail: 'no place yet' };
    const w = await downloadWeather(place, ctx.now);
    return { changed: false, detail: `${w.now?.tempF != null ? Math.round(w.now.tempF) + ' °F' : '—'} at ${place.name}${w.alerts.length ? `, ${w.alerts.length} alert${w.alerts.length > 1 ? 's' : ''}` : ''}` };
  },
});
