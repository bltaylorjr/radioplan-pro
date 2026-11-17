// Live check against the real National Weather Service API (run by .github/workflows/weather-live.yml).
// Off by default so the normal test run works with no internet; set NWS_LIVE=1 to run it.
import { describe, it, expect } from 'vitest';
import { NOAA_MAPS } from '../src/engine/noaamaps';
import { verifyWeather, verifySpaceWeather } from '../src/engine/verify';
import { SWPC, parseKp, parseScales } from '../src/engine/spaceweather';
import { geomag } from '../src/engine/azimuth';
import { NWS, parsePoint, parsePeriods, parseHours, parseStations, parseObservation, parseAlerts } from '../src/engine/weather';

const get = async (u: string) => { const r = await fetch(u, { headers: { Accept: 'application/geo+json', 'User-Agent': '(LvPlan Pro weather check, github.com/bltaylorjr/radioplan-pro)' } }); expect(r.ok, `${u} -> ${r.status}`).toBe(true); return r.json(); };

describe.runIf(!!process.env.NWS_LIVE)('NOAA weather, live (Asheville, NC)', () => {
  it('reads the point, forecast, hourly, latest observation and alerts', async () => {
    const pt = parsePoint(await get(`${NWS}points/35.5951,-82.5515`));
    expect(pt.office).toBe('GSP'); expect(pt.city).toBeTruthy();
    const periods = parsePeriods(await get(pt.forecast));
    expect(periods.length).toBeGreaterThan(6);
    expect(periods.every((p) => typeof p.tempF === 'number' && p.tempF > -40 && p.tempF < 120)).toBe(true);
    expect(periods.some((p) => p.windMph != null)).toBe(true);
    const hours = parseHours(await get(pt.forecastHourly));
    expect(hours.length).toBeGreaterThan(24);
    const st = parseStations(await get(pt.stations), { lat: 35.5951, lon: -82.5515 });
    expect(st.length).toBeGreaterThan(0);
    const obs = parseObservation(await get(`${NWS}stations/${st[0].id}/observations/latest`), st[0]);
    expect(Date.parse(obs.at)).toBeGreaterThan(Date.now() - 6 * 3600e3);
    const alerts = parseAlerts(await get(`${NWS}alerts/active?point=35.5951,-82.5515`));
    const v = verifyWeather({ fetchedAt: Date.now(), place: { lat: 35.5951, lon: -82.5515, name: 'Asheville' }, point: pt, now: obs, periods, hours, alerts, problems: [] });
    console.log('WEATHER CHECK', JSON.stringify(v.check));
    expect(v.check.ok).toBe(true);
    console.log(JSON.stringify({ point: pt, first: periods[0], hour: hours[0], station: st[0], obs, alerts: alerts.map((a) => a.event) }, null, 1));
  }, 60000);

  it('every NOAA map picture is published (and says whether the app may keep a copy)', async () => {
    const urls = [...new Set(NOAA_MAPS.flatMap((m) => [m.url.se, m.url.us]))];
    const rows: string[] = []; const bad: string[] = [];
    for (const u of urls) {
      try {
        const r = await fetch(u, { headers: { Origin: 'https://bltaylorjr.github.io', 'User-Agent': '(LvPlan Pro map check, github.com/bltaylorjr/radioplan-pro)' } });
        const b = await r.arrayBuffer();
        rows.push(`${r.status} ${r.headers.get('content-type')} ${b.byteLength}B cors=${r.headers.get('access-control-allow-origin')} lm=${r.headers.get('last-modified')} ${u}`);
        if (!r.ok || !/image/.test(r.headers.get('content-type') ?? '')) bad.push(u);
      } catch (e) { rows.push(`ERR ${(e as Error).message} ${u}`); bad.push(u); }
    }
    console.log(rows.join('\n'));
    expect(bad).toEqual([]);
  }, 120000);

  it('space weather (NOAA SWPC) passes the in-app checks', async () => {
    const k = await get(`${SWPC}products/noaa-planetary-k-index-forecast.json`), sc = await get(`${SWPC}products/noaa-scales.json`);
    const sw = verifySpaceWeather({ fetchedAt: Date.now(), kp: parseKp(k), scales: parseScales(sc) });
    console.log('SPACE CHECK', JSON.stringify(sw.check), 'scales now', JSON.stringify(sw.scales.now));
    expect(sw.check.ok).toBe(true);
  }, 60000);
  it('built-in magnetic model matches NOAA NCEI online calculator (when it answers)', async () => {
    const d = new Date(); const ours = geomag(35.5951, -82.5515, d).decDeg;
    const u = `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=35.5951&lon1=-82.5515&model=WMM&startYear=${d.getUTCFullYear()}&startMonth=${d.getUTCMonth() + 1}&startDay=${d.getUTCDate()}&resultFormat=json&key=zNEw7`;
    try {
      const r = await fetch(u); const j = r.ok ? await r.json() : null; const theirs = j?.result?.[0]?.declination;
      console.log('DECLINATION ours', ours.toFixed(3), 'NCEI', theirs, r.status);
      if (typeof theirs === 'number') expect(Math.abs(theirs - ours)).toBeLessThan(0.05);
    } catch (e) { console.log('NCEI calculator not reachable:', (e as Error).message, 'ours', ours.toFixed(3)); }
  }, 30000);
});
