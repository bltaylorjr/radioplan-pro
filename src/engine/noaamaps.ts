// NOAA map pictures for the Weather & Radar and Magnetic Field & Space Weather pages.
// All from NOAA (public domain). Each is downloaded when its page is open and online (when older than its refresh
// time), and the last copy is kept on this device with the time it was downloaded, so it still shows offline.
// tests/weather.live.test.ts checks every address against the live NOAA servers.
import { kvGet, kvSet } from './projectdb';

export type MapRegion = 'se' | 'us';
export interface NoaaMap {
  id: string;
  title: string;
  /** Which tab it is in on the page. */
  group: 'satellite' | 'storms' | 'forecast' | 'space';
  /** Address for each region (the Southeast view or the whole US). Space maps have one picture for both. */
  url: Record<MapRegion, string>;
  /** How often a new picture is published (minutes); it is downloaded again after this. */
  everyMin: number;
  source: string;
  /** One plain sentence: what it shows and what to look for. */
  note: string;
  /** A moving loop of the same picture, opened in the browser (online only). */
  loop?: Record<MapRegion, string>;
}

const GOES = 'https://cdn.star.nesdis.noaa.gov/GOES19/';
const goes = (sector: string, prod: string, size: string) => `${GOES}ABI/SECTOR/${sector}/${prod}/${size}.jpg`;
const goesUs = (prod: string) => `${GOES}ABI/CONUS/${prod}/625x375.jpg`;
const ndfd = (el: string) => ({ se: `https://graphical.weather.gov/images/southeast/${el}_southeast.png`, us: `https://graphical.weather.gov/images/conus/${el}_conus.png` });
const both = (u: string) => ({ se: u, us: u });

export const NOAA_MAPS: NoaaMap[] = [
  { id: 'sat-color', title: 'Satellite: clouds (true color)', group: 'satellite', everyMin: 10, source: 'NOAA GOES-East satellite (GeoColor)',
    url: { se: goes('se', 'GEOCOLOR', '600x600'), us: goesUs('GEOCOLOR') }, loop: { se: 'https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G19&sector=se&band=GEOCOLOR&length=24', us: 'https://www.star.nesdis.noaa.gov/GOES/conus_band.php?sat=G19&band=GEOCOLOR&length=24' },
    note: 'Clouds as they look from space (city lights at night). Bright, lumpy clouds are storms.' },
  { id: 'sat-ir', title: 'Satellite: infrared (day and night)', group: 'satellite', everyMin: 10, source: 'NOAA GOES-East satellite (band 13)',
    url: { se: goes('se', '13', '600x600'), us: goesUs('13') }, loop: { se: 'https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G19&sector=se&band=13&length=24', us: 'https://www.star.nesdis.noaa.gov/GOES/conus_band.php?sat=G19&band=13&length=24' },
    note: 'Cloud-top temperature. The colder (brighter colored) the top, the taller the storm.' },
  { id: 'lightning', title: 'Lightning (last 5 minutes)', group: 'satellite', everyMin: 5, source: 'NOAA GOES-East Geostationary Lightning Mapper',
    url: { se: `${GOES}GLM/SECTOR/se/EXTENT3/600x600.jpg`, us: `${GOES}GLM/CONUS/EXTENT3/625x375.jpg` },
    note: 'Where lightning flashed in the last few minutes. Lightning within about 10 miles: stop tower, roof and lift work.' },
  { id: 'alerts-map', title: 'Watches, warnings & advisories', group: 'storms', everyMin: 10, source: 'National Weather Service',
    url: both('https://forecast.weather.gov/wwamap/png/US.png'), note: 'Every alert in force in the US, colored by type. The alert list above has the ones at this place.' },
  { id: 'spc-day1', title: 'Severe storm outlook: today', group: 'storms', everyMin: 60, source: 'NOAA Storm Prediction Center',
    url: both('https://www.spc.noaa.gov/products/outlook/day1otlk.gif'), note: 'Risk of severe thunderstorms (damaging wind, hail, tornadoes): marginal, slight, enhanced, moderate, high.' },
  { id: 'spc-day2', title: 'Severe storm outlook: tomorrow', group: 'storms', everyMin: 120, source: 'NOAA Storm Prediction Center',
    url: both('https://www.spc.noaa.gov/products/outlook/day2otlk.gif'), note: 'The same risk levels for tomorrow. Plan tower and roof days around it.' },
  { id: 'spc-day3', title: 'Severe storm outlook: day 3', group: 'storms', everyMin: 180, source: 'NOAA Storm Prediction Center',
    url: both('https://www.spc.noaa.gov/products/outlook/day3otlk.gif'), note: 'The risk for the day after tomorrow.' },
  { id: 'fronts', title: 'Weather fronts & pressure (now)', group: 'forecast', everyMin: 180, source: 'NOAA Weather Prediction Center',
    url: both('https://www.wpc.ncep.noaa.gov/sfc/usfntsfcwbg.gif'), note: 'Cold fronts (blue), warm fronts (red), highs and lows. Fronts bring wind shifts and storms.' },
  { id: 'temp-high', title: 'High temperatures (forecast)', group: 'forecast', everyMin: 180, source: 'National Weather Service forecast (NDFD)',
    url: ndfd('MaxT1'), note: 'Forecast highs. Watch for heat over about 90 °F for attic and roof work.' },
  { id: 'temp-low', title: 'Low temperatures (forecast)', group: 'forecast', everyMin: 180, source: 'National Weather Service forecast (NDFD)',
    url: ndfd('MinT1'), note: 'Forecast lows. Below freezing: check cable jacket temperature limits and battery capacity.' },
  { id: 'wind', title: 'Wind speed (forecast)', group: 'forecast', everyMin: 180, source: 'National Weather Service forecast (NDFD)',
    url: ndfd('WindSpd1'), note: 'Sustained wind. Above 20 mph: check lift ratings and the safety plan before going up.' },
  { id: 'gust', title: 'Wind gusts (forecast)', group: 'forecast', everyMin: 180, source: 'National Weather Service forecast (NDFD)',
    url: ndfd('WindGust1'), note: 'Gusts. Above 28 mph most aerial lifts must come down.' },
  { id: 'rain-1', title: 'Rain expected: next 24 hours', group: 'forecast', everyMin: 360, source: 'NOAA Weather Prediction Center',
    url: both('https://www.wpc.ncep.noaa.gov/qpf/fill_94qwbg.gif'), note: 'Inches of rain (or melted snow) expected in the next day.' },
  { id: 'rain-7', title: 'Rain expected: next 7 days', group: 'forecast', everyMin: 360, source: 'NOAA Weather Prediction Center',
    url: both('https://www.wpc.ncep.noaa.gov/qpf/p168i.gif'), note: 'Total rain for the week: plan trenching, conduit and outdoor work.' },
  { id: 'aurora', title: 'Aurora forecast (northern lights)', group: 'space', everyMin: 30, source: 'NOAA Space Weather Prediction Center (OVATION)',
    url: both('https://services.swpc.noaa.gov/images/aurora-forecast-northern-hemisphere.jpg'), note: 'Where the aurora is likely in the next half hour. When it reaches the northern US, compasses and GPS are being disturbed.' },
  { id: 'drap', title: 'HF radio blackout (D-RAP)', group: 'space', everyMin: 15, source: 'NOAA Space Weather Prediction Center',
    url: both('https://services.swpc.noaa.gov/images/animations/d-rap/global/d-rap/latest.png'), note: 'Where HF (shortwave) radio is being absorbed by solar activity, and the highest frequency affected. VHF/UHF two-way radio is not affected.' },
];

export const mapsIn = (group: NoaaMap['group']) => NOAA_MAPS.filter((m) => m.group === group);

export interface SavedMap { blob: Blob; at: number; url: string; modified?: string }
const key = (id: string, region: MapRegion) => `noaamap.${id}.${region}`;

/** The last copy kept on this device. */
export const savedMap = (id: string, region: MapRegion) => kvGet<SavedMap>(key(id, region)).catch(() => undefined);

/**
 * Download a map picture and keep it. Returns null when the server does not let the app keep a copy (it then shows
 * live from the address, online only). Throws when offline or the server fails.
 */
export async function downloadMap(m: NoaaMap, region: MapRegion): Promise<SavedMap | null> {
  const url = m.url[region];
  let r: Response;
  try { r = await fetch(url, { mode: 'cors', cache: 'no-store' }); }
  catch (e) {
    // A CORS refusal and no internet look the same here: tell them apart by trying without reading the answer.
    try { await fetch(url, { mode: 'no-cors', cache: 'no-store' }); return null; } catch { throw new Error('no internet connection'); }
    void e;
  }
  if (!r.ok) throw new Error(`NOAA answered ${r.status}`);
  const blob = await r.blob();
  if (!/^image\//.test(blob.type) && blob.size < 2000) throw new Error('NOAA sent something that is not a picture');
  const s: SavedMap = { blob, at: Date.now(), url, modified: r.headers.get('last-modified') ?? undefined };
  await kvSet(key(m.id, region), s);
  return s;
}

/** Saved copy is older than the map's refresh time. */
export const stale = (m: NoaaMap, s: SavedMap | undefined, now = Date.now()) => !s || now - s.at > m.everyMin * 60e3;
