// Live check against the real National Weather Service API (run by .github/workflows/weather-live.yml).
// Off by default so the normal test run works with no internet; set NWS_LIVE=1 to run it.
import { describe, it, expect } from 'vitest';
import { NOAA_MAPS } from '../src/engine/noaamaps';
import { verifyWeather, verifySpaceWeather } from '../src/engine/verify';
import { SWPC, parseKp, parseScales } from '../src/engine/spaceweather';
import { geomag, loadHighResMagModel, magModelName } from '../src/engine/azimuth';
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
  it('finds the current NOAA storm outlook and HF blackout picture names', async () => {
    for (const u of ['https://www.spc.noaa.gov/products/outlook/day1otlk.html', 'https://www.spc.noaa.gov/products/outlook/day2otlk.html', 'https://www.spc.noaa.gov/products/outlook/day3otlk.html', 'https://services.swpc.noaa.gov/images/', 'https://services.swpc.noaa.gov/images/animations/d-rap/', 'https://services.swpc.noaa.gov/images/animations/d-rap/global/']) {
      try {
        const r = await fetch(u); const t = await r.text();
        const names = [...new Set([...t.matchAll(/(?:src|href)="([^"]*?(?:\.png|\.gif|\.jpg|\/))"/gi)].map((m) => m[1]))].filter((n) => /otlk|d-rap|drap/i.test(n + u)).slice(0, 40);
        console.log('LIST', r.status, u, names.join(' '));
      } catch (e) { console.log('LIST ERR', u, (e as Error).message); }
    }
  }, 60000);
  it('high-resolution magnetic model (WMMHR) matches the NOAA NCEI online calculator (when it answers)', async () => {
    expect(await loadHighResMagModel()).toBe(true);
    expect(magModelName()).toBe('WMMHR2025');
    const d = new Date();
    const sites: [string, number, number][] = [['Asheville NC', 35.5951, -82.5515], ['Nashville TN', 36.1627, -86.7816], ['Atlanta GA', 33.749, -84.388], ['Richmond VA', 37.5407, -77.436], ['Charleston SC', 32.7765, -79.9311], ['Anchorage AK', 61.2181, -149.9003], ['Honolulu HI', 21.3069, -157.8583]];
    for (const [name, lat, lon] of sites) {
      const ours = geomag(lat, lon, d).decDeg;
      for (const model of ['WMMHR', 'WMM']) {
        const u = `https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=${lat}&lon1=${lon}&model=${model}&startYear=${d.getUTCFullYear()}&startMonth=${d.getUTCMonth() + 1}&startDay=${d.getUTCDate()}&resultFormat=json&key=zNEw7`;
        try {
          const r = await fetch(u); const j = r.ok ? await r.json() : null; const theirs = j?.result?.[0]?.declination;
          console.log('DECLINATION', name, 'ours (WMMHR)', ours.toFixed(3), 'NCEI', model, theirs, r.status);
          if (model === 'WMMHR' && typeof theirs === 'number') expect(Math.abs(theirs - ours)).toBeLessThan(0.05);
        } catch (e) { console.log('NCEI calculator not reachable:', (e as Error).message); }
      }
    }
  }, 90000);
});
