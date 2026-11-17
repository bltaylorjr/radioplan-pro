import { describe, it, expect } from 'vitest';
import { qv, windMph, parsePoint, parsePeriods, parseObservation, parseStations, parseAlerts, alertActive, workNotes, projectWeather, weatherLine, compass16, type Weather } from '../src/engine/weather';
import { MENU_PAGES } from '../src/data/menu';
import { FEATURES } from '../src/help/features';

// Shapes copied from api.weather.gov responses (trimmed).
const point = { properties: { gridId: 'GSP', cwa: 'GSP', gridX: 47, gridY: 61, forecast: 'https://api.weather.gov/gridpoints/GSP/47,61/forecast', forecastHourly: 'https://api.weather.gov/gridpoints/GSP/47,61/forecast/hourly', observationStations: 'https://api.weather.gov/gridpoints/GSP/47,61/stations', timeZone: 'America/New_York', radarStation: 'KGSP', forecastZone: 'https://api.weather.gov/zones/forecast/NCZ053', relativeLocation: { properties: { city: 'Asheville', state: 'NC' } } } };
const t0 = Date.parse('2026-11-17T15:00:00Z');
const per = (name: string, startH: number, isDay: boolean, temp: number, wind: string, pop: number | null, short: string, detail = short) => ({ name, startTime: new Date(t0 + startH * 3600e3).toISOString(), endTime: new Date(t0 + (startH + 12) * 3600e3).toISOString(), isDaytime: isDay, temperature: temp, temperatureUnit: 'F', windSpeed: wind, windDirection: 'NW', probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: pop }, shortForecast: short, detailedForecast: detail });
const forecast = { properties: { periods: [per('This Afternoon', -3, true, 52, '10 to 20 mph', 20, 'Chance Showers And Thunderstorms', 'Gusts as high as 35 mph.'), per('Tonight', 9, false, 28, '5 mph', null, 'Clear'), per('Wednesday', 21, true, 45, '5 to 10 mph', 0, 'Sunny')] } };
const obs = { properties: { timestamp: '2026-11-17T14:51:00+00:00', textDescription: 'Mostly Cloudy', temperature: { unitCode: 'wmoUnit:degC', value: 10, qualityControl: 'V' }, dewpoint: { unitCode: 'wmoUnit:degC', value: 2, qualityControl: 'V' }, windSpeed: { unitCode: 'wmoUnit:km_h-1', value: 16.09, qualityControl: 'V' }, windGust: { unitCode: 'wmoUnit:km_h-1', value: 40.2, qualityControl: 'V' }, windDirection: { unitCode: 'wmoUnit:degree_(angle)', value: 315, qualityControl: 'V' }, barometricPressure: { unitCode: 'wmoUnit:Pa', value: 101592, qualityControl: 'V' }, visibility: { unitCode: 'wmoUnit:m', value: 16090, qualityControl: 'C' }, relativeHumidity: { unitCode: 'wmoUnit:percent', value: 57.4, qualityControl: 'V' }, heatIndex: { unitCode: 'wmoUnit:degC', value: null, qualityControl: 'V' }, windChill: { unitCode: 'wmoUnit:degC', value: 8, qualityControl: 'V' } } };
const alerts = { features: [
  { id: 'a1', geometry: null, properties: { id: 'a1', status: 'Actual', messageType: 'Alert', event: 'Wind Advisory', severity: 'Moderate', urgency: 'Expected', certainty: 'Likely', headline: 'Wind Advisory until 7 PM', description: 'West winds 20 to 30 mph.', instruction: 'Secure outdoor objects.', onset: '2026-11-17T12:00:00Z', ends: '2026-11-17T23:00:00Z', expires: '2026-11-17T20:00:00Z', areaDesc: 'Buncombe', senderName: 'NWS Greenville-Spartanburg SC', affectedZones: ['https://api.weather.gov/zones/forecast/NCZ053'] } },
  { id: 'a2', geometry: { type: 'Polygon', coordinates: [[[-82.6, 35.5], [-82.5, 35.5], [-82.5, 35.6], [-82.6, 35.5]]] }, properties: { id: 'a2', status: 'Actual', messageType: 'Alert', event: 'Severe Thunderstorm Warning', severity: 'Severe', ends: null, expires: '2026-11-17T16:00:00Z', areaDesc: 'Buncombe', affectedZones: [] } },
  { id: 'a3', properties: { id: 'a3', status: 'Test', event: 'Test Message', severity: 'Unknown' } },
] };

describe('NOAA weather (api.weather.gov)', () => {
  it('converts observation units and drops values NOAA rejected', () => {
    expect(qv({ value: 10, unitCode: 'wmoUnit:degC' }, 'F')).toBeCloseTo(50);
    expect(qv({ value: 16.09344, unitCode: 'wmoUnit:km_h-1' }, 'mph')).toBeCloseTo(10);
    expect(qv({ value: 101592, unitCode: 'wmoUnit:Pa' }, 'inHg')).toBeCloseTo(30.0, 1);
    expect(qv({ value: 1609.344, unitCode: 'wmoUnit:m' }, 'mi')).toBeCloseTo(1);
    expect(qv({ value: 40, unitCode: 'wmoUnit:degC', qualityControl: 'X' }, 'F')).toBeNull();
    expect(qv({ value: null, unitCode: 'wmoUnit:degC' }, 'F')).toBeNull();
  });
  it('reads forecast wind text and objects', () => {
    expect(windMph('5 to 10 mph')).toBe(10); expect(windMph('15 mph')).toBe(15); expect(windMph('Calm')).toBe(0);
    expect(windMph({ value: 16.09344, unitCode: 'wmoUnit:km_h-1' })).toBeCloseTo(10);
  });
  it('reads the point, forecast, observation, stations and alerts', () => {
    const pt = parsePoint(point); expect(pt).toMatchObject({ office: 'GSP', gridX: 47, city: 'Asheville', radar: 'KGSP' });
    expect(() => parsePoint({ properties: {} })).toThrow(/US only/);
    const ps = parsePeriods(forecast); expect(ps).toHaveLength(3); expect(ps[0]).toMatchObject({ tempF: 52, windMph: 20, pop: 20, isDay: true });
    const st = parseStations({ features: [{ properties: { stationIdentifier: 'KAVL', name: 'Asheville Regional Airport' }, geometry: { type: 'Point', coordinates: [-82.5418, 35.4319] } }] }, { lat: 35.5951, lon: -82.5515 });
    expect(st[0].id).toBe('KAVL'); expect(st[0].distMi!).toBeGreaterThan(10); expect(st[0].distMi!).toBeLessThan(13);
    const n = parseObservation(obs, st[0]);
    expect(n.tempF).toBeCloseTo(50); expect(n.windMph).toBeCloseTo(10, 0); expect(n.gustMph).toBeCloseTo(25, 0); expect(compass16(n.windDeg!)).toBe('NW'); expect(n.feelsF).toBeCloseTo(46.4);
    const a = parseAlerts(alerts);
    expect(a.map((x) => x.event)).toEqual(['Severe Thunderstorm Warning', 'Wind Advisory']); // warnings first, test messages left out
    expect(alertActive(a[1], t0)).toBe(true); expect(alertActive(a[1], Date.parse('2026-11-18T00:00:00Z'))).toBe(false);
  });
  const wx = (): Weather => ({ fetchedAt: t0, place: { lat: 35.5951, lon: -82.5515, name: 'Site A' }, point: parsePoint(point), now: parseObservation(obs, { id: 'KAVL', name: 'Asheville Regional Airport' }), periods: parsePeriods(forecast), hours: [], alerts: parseAlerts(alerts), problems: [] });
  it('gives work-day checks for lightning, wind and cold', () => {
    const notes = workNotes(wx(), t0).map((x) => x.text).join(' | ');
    expect(notes).toMatch(/Severe Thunderstorm Warning in force/);
    expect(notes).toMatch(/Thunderstorms possible/);
    expect(notes).toMatch(/gusts to about 35 mph/);
    expect(notes).toMatch(/Down to 28 °F/);
    const calm = workNotes({ periods: parsePeriods({ properties: { periods: [per('Today', 0, true, 65, '5 mph', 0, 'Sunny')] } }), hours: [], alerts: [], now: null }, t0);
    expect(calm).toHaveLength(1); expect(calm[0].tone).toBe('ok');
  });
  it('saves project values and writes a field-note line', () => {
    const pw = projectWeather(wx(), t0);
    expect(pw).toMatchObject({ lowF: 28, highF: 52, maxWindMph: 20 }); expect(pw.tempF).toBeCloseTo(50); expect(pw.alerts).toHaveLength(2);
    expect(weatherLine(wx())).toMatch(/Mostly Cloudy, 50 °F, wind NW 10 mph gusting 25/);
  });
  it('is under Tools & reference with a feature entry', () => {
    expect(MENU_PAGES.find((p) => p.id === 'weather')?.group).toBe('tools');
    expect(FEATURES.some((f) => f.page === 'weather')).toBe(true);
  });
});
