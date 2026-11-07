import { describe, it, expect } from 'vitest';
import { defaultProject } from '../src/defaults';
import { evaluateAcceptance, contourSegments, joinSegments, areaRectangles, resolveTiers } from '../src/engine/acceptance';
import { encodeGrid, decodeGrid, diffInputs, snapshotInputs, makeScenario, diffGrid } from '../src/engine/scenario';
import { importSitesCsv, exportSitesCsv } from '../src/engine/siteimport';
import { parseSurvey, calibrate } from '../src/engine/calibrate';
import { primaryCoverageInputs, computeNetwork, defaultSiteTx, interferenceRejectionDb } from '../src/engine/network';
import { predictPoint, computeCoverage, CoverageResult } from '../src/engine/coverage';
import { crc32, zip, toShapefileZip, toKml, toGeoJson, worldFile } from '../src/engine/gisexport';
import { parseScan, importSurveyFile, wifiGrid, freqToChannel, readingMetrics } from '../src/engine/wifi';
import { destination } from '../src/engine/geo';

const grid = (n: number, f: (r: number, c: number) => number): CoverageResult => {
  const rssi = new Float32Array(n * n); for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) rssi[r * n + c] = f(r, c);
  return { n, north: 35.1, south: 35, east: -80, west: -80.1, rssi };
};

describe('acceptance & contours', () => {
  it('computes per-tier pass/fail', () => {
    const g = grid(10, (_r, c) => -120 + c * 5); // columns -120..-75
    const ev = evaluateAcceptance(g, [{ id: 'a', label: 'A', dbm: -100, extraLossDb: 0, requiredPct: 50, color: '#f00' }, { id: 'b', label: 'B', dbm: -100, extraLossDb: 10, requiredPct: 50, color: '#0f0' }]);
    expect(ev.results[0].pct).toBeCloseTo(60); expect(ev.results[0].pass).toBe(true);
    expect(ev.results[1].pct).toBeCloseTo(40); expect(ev.results[1].pass).toBe(false);
  });
  it('resolves live design values for null tiers', () => {
    const p = defaultProject(); const t = resolveTiers(p)[0];
    expect(t.dbm).toBe(p.radio.coverageThresholdDbm); expect(t.extraLossDb).toBe(p.radio.bodyLossDb + p.radio.penetrationLossDb);
  });
  it('traces a contour and area rectangles', () => {
    const g = grid(20, (r, c) => -60 - 4 * Math.hypot(r - 9.5, c - 9.5)); // circular hill
    const segs = contourSegments(g, g.rssi, -90);
    expect(segs.length).toBeGreaterThan(10);
    const lines = joinSegments(segs); expect(lines.length).toBe(1); // one closed ring
    const rects = areaRectangles(g, g.rssi, -90);
    const cells = [...g.rssi].filter((v) => v >= -90).length;
    const dx = 0.1 / 20, dy = 0.1 / 20;
    const area = rects.reduce((s, r) => s + (r[1][0] - r[0][0]) * (r[2][1] - r[1][1]), 0);
    expect(area / (dx * dy)).toBeCloseTo(cells, 5);
  });
});

describe('scenarios', () => {
  it('round-trips the grid at 0.5 dB', () => {
    const g = grid(8, (r, c) => (r === 0 && c === 0 ? NaN : -100.3 + r - c));
    const d = decodeGrid(encodeGrid(g));
    expect(Number.isNaN(d.rssi[0])).toBe(true);
    for (let i = 1; i < 64; i++) expect(Math.abs(d.rssi[i] - g.rssi[i])).toBeLessThanOrEqual(0.25);
  });
  it('diffs inputs and grids', () => {
    const p = defaultProject(), a = snapshotInputs(p, null);
    p.radio.txPowerDbm = 50; p.radio.azimuthDeg = 90;
    const d = diffInputs(a, snapshotInputs(p, null)).map((x) => x.key);
    expect(d).toContain('TX power (dBm)'); expect(d).toContain('Azimuth (°T)'); expect(d).toContain('EIRP (dBm)');
    const A = grid(5, () => -100), B = grid(5, () => -97);
    expect(diffGrid(A, B).rssi[7]).toBeCloseTo(3);
    const sc = makeScenario(p, null, A, 'Base'); expect(sc.results.length).toBe(3); expect(sc.project.radio.txPowerDbm).toBe(50);
  });
});

describe('site database import', () => {
  it('maps common headers, DMS and skips bad rows', () => {
    const p = defaultProject();
    const csv = 'Site Name,Lat,Long,Elevation,Rad Center,Freq,Power dBm,Azimuth,Channel\nAlpha,35.2,-80.8,220,40,460.1,46,120,CH2\nBeta,"35 13 30 N","80 50 00 W",,30,,,,\nBad,,,1,1,,,,\n';
    const r = importSitesCsv(csv, { tx: defaultSiteTx(p) });
    expect(r.sites.length).toBe(2); expect(r.skipped[0].row).toBe(4);
    expect(r.sites[0]).toMatchObject({ name: 'Alpha', lat: 35.2, groundElevM: 220, antennaAglM: 40 });
    expect(r.sites[0].tx).toMatchObject({ fMHz: 460.1, txPowerDbm: 46, azimuthDeg: 120, channel: 'CH2' });
    expect(r.sites[1].lat).toBeCloseTo(35.225, 3); expect(r.sites[1].lon).toBeCloseTo(-80.8333, 3);
    const back = importSitesCsv(exportSitesCsv(r.sites), { tx: defaultSiteTx(p) });
    expect(back.sites.map((s) => s.name)).toEqual(['Alpha', 'Beta']);
  });
});

describe('field survey calibration', () => {
  it('recovers a known offset and slope', () => {
    const p = defaultProject(); const inp = primaryCoverageInputs(p, null, 40)!;
    const pts = [];
    for (let k = 0; k < 60; k++) {
      const d = 1 + (k % 12), q = destination(inp.site, (k * 37) % 360, d);
      const truth = predictPoint(inp, q) + 6 - 4 * Math.log10(d);
      pts.push({ ...q, rssiDbm: truth + ((k % 5) - 2) * 0.5 });
    }
    const csv = 'lat,lon,rssi_dbm\n' + pts.map((x) => `${x.lat},${x.lon},${x.rssiDbm}`).join('\n');
    const s = parseSurvey(csv); expect(s.points.length).toBe(60);
    const cal = calibrate(inp, s.points, p.propagation, { fitSlope: true, floorDbm: -140 });
    expect(cal.tuning.offsetDb).toBeCloseTo(6, 0); expect(cal.tuning.slopeDbPerDecade).toBeCloseTo(-4, 0);
    expect(cal.after.rmsErr).toBeLessThan(cal.before.rmsErr);
    const tuned = { ...inp, tune: cal.tuning };
    expect(Math.abs(predictPoint(tuned, pts[3]) - pts[3].rssiDbm)).toBeLessThan(1.5);
  });
});

describe('network interference', () => {
  it('classifies co-, adjacent and off-channel', () => {
    expect(interferenceRejectionDb(460, 460.003, 12.5, 60)).toBe(0);
    expect(interferenceRejectionDb(460, 460.0125, 12.5, 60)).toBe(60);
    expect(interferenceRejectionDb(460, 460.1, 12.5, 60)).toBeNull();
  });
  it('finds C/I ≈ 0 dB midway between equal co-channel sites', () => {
    const p = defaultProject(); p.radio.coverageRadiusKm = 12;
    p.sites.forEach((s) => { s.tx = { ...defaultSiteTx(p), azimuthDeg: 0 }; s.groundElevM = 200; s.antennaAglM = 40; });
    p.sites[1].lat = p.sites[0].lat; p.sites[1].lon = p.sites[0].lon + 0.1;
    p.sites[0].tx!.antennaId = p.sites[1].tx!.antennaId = 'sinclair-sc229';
    const net = computeNetwork(p, null, 41)!;
    const mid = 20 * 41 + 20; expect(Math.abs(net.ci[mid])).toBeLessThan(3);
    expect(net.stats.overlapPct).toBeGreaterThan(0);
    p.sites[1].tx!.fMHz = 461; const net2 = computeNetwork(p, null, 41)!;
    expect(net2.ci[mid]).toBe(99); expect(net2.stats.interferenceLimitedPct).toBe(0);
  });
});

describe('GIS export', () => {
  it('zip + crc are standard', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const z = zip([{ name: 'a.txt', data: 'hi' }]); expect(new DataView(z.buffer).getUint32(0, true)).toBe(0x04034b50);
  });
  it('writes shapefile, KML and GeoJSON layers', () => {
    const p = defaultProject(); const g = grid(20, (r, c) => -60 - 4 * Math.hypot(r - 9.5, c - 9.5));
    const layers = { sites: p.sites, coverage: g, tiers: resolveTiers(p), survey: [{ lat: 35.05, lon: -80.05, rssiDbm: -80 }], title: 'T' };
    const z = toShapefileZip(layers); const txt = new TextDecoder('latin1').decode(z);
    for (const f of ['sites.shp', 'sites.dbf', 'service_areas.shp', 'contours.shp', 'survey.prj']) expect(txt).toContain(f);
    const shpAt = txt.indexOf('sites.shp') + 'sites.shp'.length; const v = new DataView(z.buffer, shpAt);
    expect(v.getInt32(0, false)).toBe(9994); expect(v.getInt32(32, true)).toBe(1);
    const kml = toKml(layers); expect(kml).toContain('<kml'); expect(kml).toContain('Service contours'); expect((kml.match(/<Placemark>/g) ?? []).length).toBeGreaterThan(3);
    const gj = JSON.parse(toGeoJson(layers)); expect(gj.features.some((f: { geometry: { type: string } }) => f.geometry.type === 'MultiPolygon')).toBe(true);
    expect(worldFile(g).split('\n')[3].startsWith('-')).toBe(true);
  });
});

describe('Wi-Fi survey parsing', () => {
  it('parses Windows netsh', () => {
    const t = `SSID 1 : Office\n    Network type            : Infrastructure\n    BSSID 1                 : aa:bb:cc:00:00:01\n         Signal             : 80%\n         Radio type         : 802.11ax\n         Band               : 5 GHz\n         Channel            : 36\n    BSSID 2                 : aa:bb:cc:00:00:02\n         Signal             : 40%\n         Channel            : 6\n`;
    const r = parseScan(t); expect(r.format).toBe('netsh');
    expect(r.aps).toEqual([{ ssid: 'Office', bssid: 'aa:bb:cc:00:00:01', channel: 36, band: '5 GHz', rssiDbm: -60 }, { ssid: 'Office', bssid: 'aa:bb:cc:00:00:02', channel: 6, band: '2.4 GHz', rssiDbm: -80 }]);
  });
  it('parses iw, airport and nmcli', () => {
    const iw = parseScan('BSS 11:22:33:44:55:66(on wlan0)\n\tfreq: 5180\n\tsignal: -47.00 dBm\n\tSSID: Lab\nBSS 11:22:33:44:55:77(on wlan0)\n\tfreq: 2437\n\tsignal: -71.00 dBm\n\tSSID: Lab\n\tDS Parameter set: channel 6\n');
    expect(iw.aps.map((a) => [a.channel, a.rssiDbm])).toEqual([[36, -47], [6, -71]]);
    const ap = parseScan('                            SSID BSSID             RSSI CHANNEL HT CC SECURITY\n                      Guest Net 00:11:22:33:44:55 -58  149,+1  Y  US WPA2(PSK/AES/AES)\n');
    expect(ap.aps[0]).toMatchObject({ ssid: 'Guest Net', rssiDbm: -58, channel: 149 });
    const nm = parseScan('IN-USE  BSSID              SSID     MODE   CHAN  RATE        SIGNAL  BARS  SECURITY\n*       AA:BB:CC:DD:EE:FF  Home     Infra  11    130 Mbit/s  70      ▂▄▆_  WPA2\n');
    expect(nm.aps[0]).toMatchObject({ bssid: 'aa:bb:cc:dd:ee:ff', ssid: 'Home', channel: 11, rssiDbm: -65 });
    const ip = parseScan('     agrCtlRSSI: -52\n     agrCtlNoise: -92\n          BSSID: 0:11:22:33:44:55\n           SSID: Corp\n        channel: 44,80\n');
    expect(ip.aps[0]).toMatchObject({ rssiDbm: -52, noiseDbm: -92, channel: 44 });
    expect(freqToChannel(5955)).toBe(1); expect(freqToChannel(2412)).toBe(1);
  });
  it('imports a multi-point CSV and interpolates', () => {
    const csv = 'x,y,bssid,ssid,channel,rssi,noise\n2,2,a1,Corp,1,-50,-95\n2,2,a2,Corp,1,-70,-95\n18,2,a2,Corp,1,-55,-90\n';
    const s = importSurveyFile(csv); expect(s.readings.length).toBe(2); expect(s.readings[0].aps.length).toBe(2);
    expect(readingMetrics(s.readings[0], '', -67)).toMatchObject({ cochannel: 1, snr: 45, count: 1 });
    const g = wifiGrid(s.readings, 'signal', { widthM: 20, heightM: 4, nx: 20, ssid: '', targetDbm: -67, radiusM: 6 });
    expect(g.vals[1 * 20 + 2]).toBeGreaterThan(-52); expect(Number.isNaN(g.vals[1 * 20 + 10])).toBe(true);
    const ap = wifiGrid(s.readings, 'ap', { widthM: 20, heightM: 4, nx: 20, ssid: '', targetDbm: -67, radiusM: 6 });
    expect(ap.cats[1 * 20 + 2]).toContain('a1'); expect(ap.cats[1 * 20 + 17]).toContain('a2');
  });
});

describe('address suggestions', () => {
  it('matches word prefixes and converts Photon features', async () => {
    const { matches, photonToGeo } = await import('../src/engine/suggest');
    expect(matches('600 East 4th Street, Charlotte, NC', '600 e 4th')).toBe(true);
    expect(matches('600 East 4th Street, Charlotte, NC', 'raleigh')).toBe(false);
    const g = photonToGeo({ geometry: { coordinates: [-80.84, 35.22] }, properties: { housenumber: '600', street: 'East 4th Street', city: 'Charlotte', county: 'Mecklenburg County', state: 'North Carolina', postcode: '28202', countrycode: 'US' } });
    expect(g).toMatchObject({ lat: 35.22, lon: -80.84, street: '600 East 4th Street', city: 'Charlotte', state: 'NC', postcode: '28202' });
    expect(g.label).toBe('600 East 4th Street, Charlotte, Mecklenburg County, NC 28202');
  });
});
