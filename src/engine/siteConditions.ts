// Site conditions that change calculations and readings at the project location: the checked magnetic
// field and space weather (NOAA WMM / SWPC), the weather (NOAA NWS), the ground (USGS soil iron, elevation)
// and radio variables (soil conductivity used for ground wave). Each calculation shows the ones that
// matter to it as a note; where a published correction exists it is applied, and each one can be
// removed from the calculation (and added back) on the project.
import type { Project } from '../types';

export type SiteKind = 'magnetic' | 'weather' | 'ground' | 'rf';
export interface SiteVar { id: string; kind: SiteKind; label: string; value: number; unit: string; text: string; source: string; url?: string; at?: string; estimate?: boolean }

/** USGS national median soil iron (C horizon), SIR 2017-5118 (Smith and others): used until a local value is entered. */
export const USGS_FE_MEDIAN = 2.34;
export const USGS_SOIL_URL = 'https://mrdata.usgs.gov/soilgeochemistry/';

const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString();

/** Variables known for the project site. */
export function siteVars(p: Project): SiteVar[] {
  const out: SiteVar[] = [], m = p.magnetic, w = p.weather, s = p.sites[0];
  if (m) {
    out.push({ id: 'decl', kind: 'magnetic', label: 'Magnetic declination', value: m.decDeg, unit: '°', text: `${f1(Math.abs(m.decDeg))}° ${m.decDeg < 0 ? 'W' : 'E'} (${m.decPerYearDeg >= 0 ? '+' : ''}${m.decPerYearDeg.toFixed(2)}°/yr)`, source: `NOAA ${m.model}`, at: m.date });
    out.push({ id: 'field', kind: 'magnetic', label: 'Total magnetic field', value: m.totalNt, unit: 'nT', text: `${Math.round(m.totalNt).toLocaleString()} nT, dip ${f1(m.dipDeg)}°`, source: `NOAA ${m.model}`, at: m.date });
    if (m.space) out.push({ id: 'storm', kind: 'magnetic', label: 'Geomagnetic storm level', value: m.space.gNow, unit: 'G', text: m.space.gNow ? `G${m.space.gNow}${m.space.kpNow != null ? ` (Kp ${m.space.kpNow})` : ''}` : `none${m.space.kpNow != null ? ` (Kp ${m.space.kpNow})` : ''}`, source: 'NOAA SWPC', at: m.space.fetchedAt });
  }
  if (w) {
    const at = new Date(w.at).toISOString();
    if (w.lowF != null) out.push({ id: 'lowF', kind: 'weather', label: 'Forecast low', value: w.lowF, unit: '°F', text: `${Math.round(w.lowF)} °F`, source: `NOAA NWS, ${w.place}`, at });
    if (w.highF != null) out.push({ id: 'highF', kind: 'weather', label: 'Forecast high', value: w.highF, unit: '°F', text: `${Math.round(w.highF)} °F`, source: `NOAA NWS, ${w.place}`, at });
    if (w.humidity != null) out.push({ id: 'rh', kind: 'weather', label: 'Relative humidity now', value: w.humidity, unit: '%', text: `${Math.round(w.humidity)} %`, source: `NOAA NWS ${w.station}`, at });
    const wind = Math.max(w.gustMph ?? 0, w.maxWindMph ?? 0); if (wind) out.push({ id: 'wind', kind: 'weather', label: 'Highest wind (now and forecast)', value: wind, unit: 'mph', text: `${Math.round(wind)} mph`, source: `NOAA NWS, ${w.place}`, at });
  }
  if (s?.groundElevM != null) out.push({ id: 'elev', kind: 'ground', label: 'Ground elevation', value: s.groundElevM, unit: 'm', text: `${Math.round(s.groundElevM * 3.28084).toLocaleString()} ft`, source: s.positionSource?.includes('USGS') ? s.positionSource : 'USGS 3DEP / terrain at Site A' });
  const fe = p.siteSoil?.fePct;
  out.push(fe != null ? { id: 'fe', kind: 'ground', label: 'Soil iron (Fe)', value: fe, unit: 'wt %', text: `${f1(fe)} %`, source: p.siteSoil?.source || 'USGS soil geochemistry (entered)', url: USGS_SOIL_URL }
    : { id: 'fe', kind: 'ground', label: 'Soil iron (Fe)', value: USGS_FE_MEDIAN, unit: 'wt %', text: `${USGS_FE_MEDIAN} % (US median)`, source: 'USGS SIR 2017-5118 national median; enter the local value from the USGS soil data portal', url: USGS_SOIL_URL, estimate: true });
  if (p.lfhf?.soilSigma) out.push({ id: 'sigma', kind: 'rf', label: 'Ground conductivity', value: p.lfhf.soilSigma, unit: 'S/m', text: `${(p.lfhf.soilSigma * 1000).toFixed(1)} mS/m`, source: 'LF / HF Systems page' });
  return out;
}

/** IEEE 485 temperature correction for lead-acid capacity (electrolyte °F → factor). Below 77 °F a bigger battery is needed. */
const IEEE485: [number, number][] = [[25, 1.52], [30, 1.43], [35, 1.35], [40, 1.30], [45, 1.25], [50, 1.19], [55, 1.15], [60, 1.11], [65, 1.08], [70, 1.04], [77, 1.0]];
export function batteryTempFactor(tF: number): number {
  if (tF >= 77) return 1; if (tF <= IEEE485[0][0]) return IEEE485[0][1];
  for (let i = 1; i < IEEE485.length; i++) { const [a, fa] = IEEE485[i - 1], [b, fb] = IEEE485[i]; if (tF <= b) return fa + ((tF - a) / (b - a)) * (fb - fa); }
  return 1;
}

export interface SiteEffect { varId: string; label: string; value: string; note: string; source: string; url?: string; estimate?: boolean;
  /** Changed inputs when this variable is included. */
  adjust?: Record<string, number> }

/** What each site variable does to a calculation (by calculator id), with any correction to its inputs. */
export function siteEffects(calcId: string, vars: SiteVar[], x: Record<string, number>): SiteEffect[] {
  const v = (id: string) => vars.find((a) => a.id === id), out: SiteEffect[] = [];
  const add = (sv: SiteVar | undefined, note: string, adjust?: Record<string, number>) => { if (sv) out.push({ varId: sv.id, label: sv.label, value: sv.text, note, source: sv.source + (sv.at ? `, ${sv.at.slice(0, 10)}` : ''), url: sv.url, estimate: sv.estimate, adjust }); };
  const low = v('lowF');
  if (['fa-battery', 'callbox'].includes(calcId) && low) {
    const k = batteryTempFactor(low.value);
    if (calcId === 'fa-battery' && 'sf' in x) add(low, k > 1 ? `Cold lowers battery capacity. At ${Math.round(low.value)} °F, IEEE 485 asks for ×${k.toFixed(2)} capacity: the safety factor becomes ${Math.round(((1 + x.sf / 100) * k - 1) * 100)} %. Remove this if the batteries are in a heated space.` : 'Site temperatures do not reduce battery capacity (77 °F or warmer).', k > 1 ? { sf: Math.round(((1 + x.sf / 100) * k - 1) * 100) } : undefined);
    if (calcId === 'callbox' && 'days' in x) add(low, k > 1 ? `Outdoor batteries lose capacity in the cold: at ${Math.round(low.value)} °F, IEEE 485 ×${k.toFixed(2)}; days of autonomy are raised to cover it.` : 'Forecast temperatures do not reduce battery capacity.', k > 1 ? { days: Math.round(x.days * k * 10) / 10 } : undefined);
  }
  if (['lv-drop', 'nac-a', 'nac-ft', 'nac-awg', 'nac-min', 'access-lock'].includes(calcId)) {
    const hi = v('highF'); add(hi, hi && hi.value > 167 ? 'Wire temperature above 75 °C raises resistance; increase the wire size.' : 'Wire resistance uses the NEC 75 °C values, so the drop is on the safe side at this site\'s temperatures.');
  }
  if (['spl', 'horn-range'].includes(calcId)) {
    add(v('rh'), 'Dry air absorbs more high-frequency sound over long outdoor distances (ISO 9613-1); for indoor rooms the effect is negligible.');
    add(v('wind'), 'Wind carries sound downwind and shortens the range upwind; test outdoor notification on a typical windy day.');
  }
  if (['decl', 'azimuth', 'compass'].includes(calcId)) {
    add(v('decl'), 'Compass readings differ from true north by the declination; true bearings are converted with it.');
    add(v('storm'), 'During a geomagnetic storm (G2 or higher) compass readings can swing by a degree or more and GPS accuracy drops: aim with GPS or a known landmark instead.');
    const fe = v('fe'); add(fe, `Iron-rich soil and rock (magnetite, hematite) and nearby steel bend the local field, so a compass can read several degrees off even with the right declination.${fe && fe.value > 4 ? ' This site\'s iron content is high.' : ''} Take bearings away from steel and vehicles and check against a known line.`);
  }
  if (calcId === 'rod') {
    const fe = v('fe'); add(fe, 'Iron-rich clay soils usually conduct better (lower resistivity) than sandy or rocky soil; use a Wenner four-pin test (IEEE 81) for the real value.');
    add(low, low && low.value <= 32 ? 'Frozen ground raises soil resistivity many times: design with the winter value and drive rods below the frost line.' : 'Soil resistivity rises in dry and frozen seasons; design with the worst seasonal value.');
    add(v('rh'), 'Wet soil lowers resistance; test after a dry spell for a conservative result.');
  }
  if (['battery', 'solar'].includes(calcId) && low) { const k = batteryTempFactor(low.value); add(low, k > 1 ? `Batteries outdoors or unheated: at ${Math.round(low.value)} °F, IEEE 485 asks for ×${k.toFixed(2)} capacity. Add it to the result if the batteries see these temperatures.` : 'Forecast temperatures do not reduce battery capacity.'); }
  if (calcId === 'noise') { const t = v('highF') ?? v('lowF'); if (t) { const K = (t.value - 32) / 1.8 + 273.15; add(t, `−174 dBm/Hz is the thermal noise at 290 K (62 °F). At ${Math.round(t.value)} °F it is ${(10 * Math.log10(K / 290)).toFixed(2)} dB ${K >= 290 ? 'higher' : 'lower'}: small next to the receiver noise figure.`); } }
  if (['coax', 'vdrop'].includes(calcId)) add(v('highF'), calcId === 'coax' ? 'Coax loss rises slightly with temperature (about 0.2 % per °C); sun-heated outdoor runs lose a little more than the 20 °C datasheet value.' : 'Conductor resistance rises about 0.39 % per °C; tables at 75 °C already cover normal site temperatures.');
  if (['guy', 'tilt'].includes(calcId)) add(v('wind'), 'Wind loads towers, guys and antennas (TIA-222 sets the design wind speed by county); stop climbing and lifting in high wind.');
  if (['eirp', 'fspl', 'link', 'linkbudget', 'hata', 'knife', 'horizon', 'fresnel'].includes(calcId)) {
    add(v('rh'), 'Humidity and temperature change the air\'s refractivity (k-factor). Designs use k = 4/3; humid nights can bend signals farther (ducting) and cause interference.');
    add(v('wind'), 'High wind sways towers and antennas; keep dish and Yagi aiming within the antenna\'s beamwidth (TIA-222 twist and sway limits).');
  }
  if (['groundwave', 'lfhf'].includes(calcId)) add(v('sigma'), 'Ground-wave range depends on ground conductivity and permittivity (ITU-R P.368).');
  return out;
}

/** Key for a removed variable on the project: calculator id and variable id. */
export const siteKey = (calcId: string, varId: string) => `${calcId}:${varId}`;
