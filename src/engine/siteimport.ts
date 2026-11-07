// Multi-site database import / export (CSV), so many sites need not be typed by hand.
import type { Site, StructureType, SiteTx } from '../types';
import { parseCsv, findCol, num, toCsv } from './csv';
import { parseLatLon } from './locparse';
import { uid } from '../defaults';
import { ANTENNAS } from '../data/catalog';

export const SITE_COLUMNS = ['name', 'latitude', 'longitude', 'ground_m', 'antenna_agl_m', 'structure_height_m', 'structure', 'address', 'freq_mhz', 'tx_power_dbm', 'antenna', 'azimuth_deg', 'tilt_deg', 'tx_loss_db', 'channel', 'transmit'];
const STRUCTS: StructureType[] = ['monopole', 'self-support lattice', 'guyed lattice', 'rooftop', 'water tank', 'wood pole'];

export interface SiteImport { sites: Site[]; skipped: { row: number; reason: string }[]; columns: Record<string, string> }

export function importSitesCsv(text: string, defaults: { tx: SiteTx; feetUnits?: boolean }): SiteImport {
  const rows = parseCsv(text); if (rows.length < 2) return { sites: [], skipped: [{ row: 1, reason: 'No data rows' }], columns: {} };
  const h = rows[0];
  const col = {
    name: findCol(h, ['name', 'site', 'sitename', 'site_name', 'id']), lat: findCol(h, ['latitude', 'lat', 'y']), lon: findCol(h, ['longitude', 'lon', 'long', 'lng', 'x']),
    coords: findCol(h, ['coordinates', 'coords', 'location', 'position']), ground: findCol(h, ['ground_m', 'groundelevation', 'elevation', 'elev', 'amsl', 'ground']),
    agl: findCol(h, ['antenna_agl_m', 'antennaagl', 'antennaheight', 'agl', 'radcenter', 'rad_center', 'height']), str: findCol(h, ['structure_height_m', 'structureheight', 'towerheight']),
    type: findCol(h, ['structure', 'structuretype', 'type']), addr: findCol(h, ['address', 'street']), f: findCol(h, ['freq_mhz', 'frequency', 'freq', 'mhz']),
    pwr: findCol(h, ['tx_power_dbm', 'power_dbm', 'txpower', 'powerdbm', 'power']), ant: findCol(h, ['antenna', 'antennamodel', 'model']),
    az: findCol(h, ['azimuth_deg', 'azimuth', 'az', 'bearing']), tilt: findCol(h, ['tilt_deg', 'downtilt', 'tilt']), loss: findCol(h, ['tx_loss_db', 'lineloss', 'loss']),
    ch: findCol(h, ['channel', 'chan', 'ch']), txon: findCol(h, ['transmit', 'tx', 'enabled']),
  };
  const ft = defaults.feetUnits ? 0.3048 : 1;
  const sites: Site[] = [], skipped: SiteImport['skipped'] = [];
  rows.slice(1).forEach((r, k) => {
    const plain = (v: string | undefined) => (v != null && /^\s*[-+]?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null);
    let lat = col.lat >= 0 ? plain(r[col.lat]) : null, lon = col.lon >= 0 ? plain(r[col.lon]) : null;
    if ((lat == null || lon == null) && col.coords >= 0) { const ll = parseLatLon(r[col.coords]); if (ll) { lat = ll.lat; lon = ll.lon; } }
    if ((lat == null || lon == null) && col.lat >= 0 && col.lon >= 0) { const ll = parseLatLon(`${r[col.lat]} ${r[col.lon]}`); if (ll) { lat = ll.lat; lon = ll.lon; } }
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) { skipped.push({ row: k + 2, reason: 'Missing or invalid coordinates' }); return; }
    const g = (i: number) => (i >= 0 ? r[i] : undefined);
    const antTxt = (g(col.ant) ?? '').toLowerCase();
    const ant = antTxt ? ANTENNAS.find((a) => a.id === antTxt || `${a.brand} ${a.model}`.toLowerCase().includes(antTxt) || a.model.toLowerCase() === antTxt) : undefined;
    const agl = num(g(col.agl)), sh = num(g(col.str));
    const typeTxt = (g(col.type) ?? '').toLowerCase();
    const hasTx = col.f >= 0 || col.pwr >= 0 || col.txon >= 0;
    const txFlag = g(col.txon); const on = txFlag == null ? hasTx : /^(1|y|yes|true|on|tx)$/i.test(txFlag);
    sites.push({
      id: uid(), name: g(col.name) || `Site ${k + 1}`, address: g(col.addr) ?? '', lat, lon,
      groundElevM: num(g(col.ground)) != null ? num(g(col.ground))! * ft : null, positionSource: 'CSV import', positionAccuracyM: null,
      structure: STRUCTS.find((s) => typeTxt.includes(s.split(' ')[0])) ?? 'monopole',
      structureHeightM: (sh ?? (agl != null ? agl + 2 : 30) / ft) * ft, antennaAglM: (agl ?? (sh != null ? sh - 2 : 28) / ft) * ft,
      onBuilding: /roof|build/.test(typeTxt), nearestAirportKm: null, nearestRunwayFt: null,
      tx: hasTx ? { ...defaults.tx, enabled: on, fMHz: num(g(col.f)) ?? defaults.tx.fMHz, txPowerDbm: num(g(col.pwr)) ?? defaults.tx.txPowerDbm, antennaId: ant?.id ?? defaults.tx.antennaId,
        azimuthDeg: num(g(col.az)) ?? defaults.tx.azimuthDeg, tiltDeg: num(g(col.tilt)) ?? defaults.tx.tiltDeg, lossDb: num(g(col.loss)) ?? defaults.tx.lossDb, channel: g(col.ch) || defaults.tx.channel } : undefined,
    });
  });
  const columns: Record<string, string> = {};
  for (const [k, i] of Object.entries(col)) if (i >= 0) columns[k] = h[i];
  return { sites, skipped, columns };
}

export function exportSitesCsv(sites: Site[]): string {
  return toCsv([SITE_COLUMNS, ...sites.map((s) => [s.name, s.lat.toFixed(7), s.lon.toFixed(7), s.groundElevM ?? '', s.antennaAglM, s.structureHeightM, s.structure, s.address,
    s.tx?.fMHz ?? '', s.tx?.txPowerDbm ?? '', s.tx?.antennaId ?? '', s.tx?.azimuthDeg ?? '', s.tx?.tiltDeg ?? '', s.tx?.lossDb ?? '', s.tx?.channel ?? '', s.tx?.enabled ? 'yes' : 'no'])]);
}
