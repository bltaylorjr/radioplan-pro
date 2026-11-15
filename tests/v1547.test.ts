import { describe, it, expect } from 'vitest';
import { parseMeterText, parseMeterBytes, LineReader, parseReadingsFile, compareReadings, compareVerdict, gridTest, idwGrid, dbuvToDbm, SignalReading } from '../src/engine/signal';
import { findByTag, nextTag, tagFromScan, fieldsFromScan, nextPm, pmState, parseAssetsCsv, assetsCsv, blankAsset, LABEL_PREFIX } from '../src/engine/assets';
import { NmeaReader, nmeaChecksumOk, parseDistanceText } from '../src/engine/devices';
import { lanAddressOk } from '../src/engine/meter';
import { repairProject } from '../src/engine/repair';
import { defaultProject } from '../src/defaults';

const dv = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);
const R = (o: Partial<SignalReading> & { dbm: number }): SignalReading => ({ id: Math.random().toString(36).slice(2), at: '2026-11-15T12:00:00Z', source: 'typed', session: 'T', ...o });

describe('signal meter values', () => {
  it('reads text from meters', () => {
    expect(parseMeterText('-87.5 dBm')).toBe(-87.5);
    expect(parseMeterText('RSSI:-92')).toBe(-92);
    expect(parseMeterText('CH 12 LVL −101.2dBm')).toBe(-101.2);
    expect(parseMeterText('40 dBuV')).toBe(dbuvToDbm(40));
    expect(parseMeterText('battery 87%')).toBeNull();
  });
  it('reads binary notifications', () => {
    expect(parseMeterBytes(dv([0xa9]))).toBe(-87); // int8
    const b = new DataView(new ArrayBuffer(2)); b.setInt16(0, -875, true); expect(parseMeterBytes(b)).toBe(-87.5);
    const f = new DataView(new ArrayBuffer(4)); f.setFloat32(0, -93.25, true); expect(parseMeterBytes(f)).toBe(-93.2);
    expect(parseMeterBytes(dv([...new TextEncoder().encode('-77 dBm')]))).toBe(-77);
    expect(parseMeterBytes(dv([0x10]))).toBeNull();
  });
  it('joins text that arrives in pieces', () => {
    const l = new LineReader(); expect(l.push('-8')).toEqual([]); expect(l.push('5.0 dBm\r\n-9')).toEqual([-85]); expect(l.push('0\n')).toEqual([-90]);
  });
});

describe('importing readings', () => {
  it('reads a G-NetTrack style tab file', () => {
    const t = 'Timestamp\tLongitude\tLatitude\tSpeed\tOperatorname\tNetworkTech\tLevel\tQual\n2026.11.15_10.00.01\t-82.55\t35.59\t0\tAT&T\t4G\t-95\t-11\n2026.11.15_10.00.02\t-82.551\t35.591\t0\tAT&T\t4G\t-97\t-12';
    const r = parseReadingsFile(t, 'walk.txt');
    expect(r.app).toBe('G-NetTrack'); expect(r.readings).toHaveLength(2); expect(r.readings[0]).toMatchObject({ lat: 35.59, lon: -82.55, dbm: -95, tech: '4G' });
  });
  it('skips the WiGLE title line', () => {
    const t = 'WigleWifi-1.4,appRelease=2.70\nMAC,SSID,AuthMode,FirstSeen,Channel,RSSI,CurrentLatitude,CurrentLongitude,AltitudeMeters,AccuracyMeters,Type\naa:bb,Office,[WPA2],2026-11-15 10:00:00,6,-61,35.6,-82.5,640,4,WIFI';
    const r = parseReadingsFile(t, 'wigle.csv');
    expect(r.app).toBe('WiGLE'); expect(r.readings[0]).toMatchObject({ dbm: -61, lat: 35.6, lon: -82.5, accM: 4 });
  });
  it('keeps indoor grid rows without GPS', () => {
    const r = parseReadingsFile('Floor,Room,dBm,Critical\n1,Lobby,-88,\n1,Stair A,-99,yes\n2,201,-90,', 'grid.csv');
    expect(r.readings).toHaveLength(3); expect(r.readings[1]).toMatchObject({ floor: '1', spot: 'Stair A', critical: true });
  });
  it('reads KML placemarks with the level in the name', () => {
    const r = parseReadingsFile('<kml><Placemark><name>-83 dBm</name><Point><coordinates>-82.5,35.6,0</coordinates></Point></Placemark></kml>', 'x.kml');
    expect(r.readings[0]).toMatchObject({ dbm: -83, lat: 35.6, lon: -82.5 });
  });
  it('explains a file it cannot use', () => { expect(() => parseReadingsFile('a,b\n1,2', 'x.csv')).toThrow(/signal column/); });
});

describe('comparing and grid tests', () => {
  it('compares with the prediction', () => {
    const rs = [R({ dbm: -80, lat: 35, lon: -82 }), R({ dbm: -90, lat: 35.01, lon: -82 }), R({ dbm: -85 })];
    const c = compareReadings(rs, () => -86);
    expect(c.stats.n).toBe(2); expect(c.stats.meanDelta).toBeCloseTo(1); expect(compareVerdict(c.stats).tone).toBe('ok');
    expect(compareVerdict(compareReadings(rs, () => -70).stats).tone).toBe('bad');
  });
  it('passes and fails the ERCES grid test per floor', () => {
    const rs = [...Array(9)].map(() => R({ dbm: -90, floor: '1' })).concat([R({ dbm: -100, floor: '1' }), R({ dbm: -92, floor: '1', critical: true })]);
    const g = gridTest(rs); expect(g.pct).toBe(90); expect(g.generalOk).toBe(true); expect(g.critPct).toBe(100); expect(g.criticalOk).toBe(true);
    const bad = gridTest([...rs, R({ dbm: -101, floor: '2' })]); expect(bad.generalOk).toBe(false);
  });
  it('fills a heat map between readings only', () => {
    const h = idwGrid([{ lat: 35, lon: -82, v: -80 }, { lat: 35.001, lon: -82.001, v: -100 }], 20, 0.2)!;
    const vals = [...h.v].filter(Number.isFinite); expect(vals.length).toBeGreaterThan(0); expect(Math.min(...vals)).toBeGreaterThanOrEqual(-100); expect(Math.max(...vals)).toBeLessThanOrEqual(-80);
  });
});

describe('asset tags', () => {
  const list = [blankAsset({ tag: 'LV-0007', serial: 'SN123', name: 'Smoke', installDate: '2026-01-31', pmEvery: 'Monthly' }), blankAsset({ tag: 'ABC 1' })];
  it('finds by tag, our label or serial', () => {
    expect(findByTag(list, 'lv-0007')?.name).toBe('Smoke');
    expect(findByTag(list, LABEL_PREFIX + 'LV-0007')?.name).toBe('Smoke');
    expect(findByTag(list, ' sn123\n')?.name).toBe('Smoke');
    expect(findByTag(list, 'abc1')?.tag).toBe('ABC 1');
    expect(findByTag(list, 'nope')).toBeUndefined();
    expect(tagFromScan('LVA:X-1\u0004')).toBe('X-1');
  });
  it('numbers new tags', () => { expect(nextTag(list)).toBe('LV-0008'); expect(nextTag([])).toBe('LV-0001'); });
  it('reads a serial and model from a device label', () => { expect(fieldsFromScan('MODEL: XLS-3000 S/N: 9F8E7D')).toMatchObject({ serial: '9F8E7D', model: 'XLS-3000' }); expect(fieldsFromScan('(01)00012345(21)AB12345').serial).toBe('AB12345'); });
  it('works out PM due dates', () => {
    expect(nextPm(list[0])).toBe('2026-02-28');
    expect(pmState(list[0], '2026-03-05').state).toBe('overdue');
    expect(pmState({ ...list[0], lastPm: '2026-03-01' }, '2026-03-05')).toMatchObject({ state: 'soon', next: '2026-04-01' });
    expect(pmState(list[1]).state).toBe('none');
  });
  it('imports an owner spreadsheet and exports CSV', () => {
    const r = parseAssetsCsv('Asset Tag,Description,System,Manufacturer,Model,Serial Number,Room,Installed,PM\nT1,Pull station,Fire alarm,Notifier,NBG-12LX,1234,Lobby,3/1/2026,Annual\n,,,,,,,,', (s) => (/fire/i.test(s) ? 'firealarm' : ''));
    expect(r.assets).toHaveLength(1); expect(r.skipped).toBe(0);
    expect(r.assets[0]).toMatchObject({ tag: 'T1', name: 'Pull station', system: 'firealarm', make: 'Notifier', serial: '1234', location: 'Lobby', installDate: '2026-03-01', pmEvery: 'Annually' });
    expect(assetsCsv(r.assets, (s) => s, () => '')).toContain('T1,Pull station,firealarm');
  });
  it('self-repair keeps readings and assets safe', () => {
    const p = defaultProject() as unknown as Record<string, unknown>;
    p.signalReadings = [{ id: 'a', dbm: '-80' }, { id: 'a', dbm: 'x' }, null]; p.assets = [{ id: 'z', tag: 5 }];
    const out = repairProject(p).project;
    expect(out.signalReadings).toHaveLength(1); expect(out.signalReadings![0].dbm).toBe(-80);
    expect(out.assets![0]).toMatchObject({ tag: '5', photos: [], history: [] });
  });
});

describe('Bluetooth and Wi-Fi devices', () => {
  it('reads NMEA positions from a GPS receiver', () => {
    const n = new NmeaReader();
    expect(nmeaChecksumOk('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47')).toBe(true);
    expect(nmeaChecksumOk('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*48')).toBe(false);
    const f = n.line('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47')!;
    expect(f.lat).toBeCloseTo(48.1173, 4); expect(f.lon).toBeCloseTo(11.516667, 5); expect(f.sats).toBe(8); expect(f.accM).toBeCloseTo(4.5);
    expect(n.line('$GPRMC,123519,V,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A')).toBeNull(); // no fix
    const w = n.line('$GNGGA,1,3535.706,N,08233.090,W,4,12,0.6,650,M,0,M,,'); expect(w).toMatchObject({ accM: 0.03 }); expect(w!.lon).toBeCloseTo(-82.5515, 4);
  });
  it('reads laser distances in any unit', () => {
    expect(parseDistanceText('12.345 m')).toBeCloseTo(12.345); expect(parseDistanceText('40.5 ft')).toBeCloseTo(12.344, 3);
    expect(parseDistanceText(`10' 6"`)).toBeCloseTo(3.2004, 4); expect(parseDistanceText('1234 mm')).toBeCloseTo(1.234); expect(parseDistanceText('3.250')).toBe(3.25);
  });
  it('only talks to devices on the local network', () => {
    for (const u of ['http://192.168.4.1/reading', 'tcp://10.0.0.5:10110', 'ws://172.20.1.1:81/', 'http://meter.local/']) expect(lanAddressOk(u)).toBe(true);
    for (const u of ['http://8.8.8.8/', 'https://example.com/', 'http://user@192.168.1.1/', 'ftp://192.168.1.1/', 'http://172.32.0.1/']) expect(lanAddressOk(u)).toBe(false);
  });
});
