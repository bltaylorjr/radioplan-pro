// Geodesy helpers: distances, bearings, interpolation, UTM conversion, NMEA parsing.
const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;

export interface LatLon { lat: number; lon: number }

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
export function destination(a: LatLon, bearing: number, distKm: number): LatLon {
  const d = distKm / R, b = rad(bearing), la = rad(a.lat), lo = rad(a.lon);
  const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lon2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
  return { lat: deg(lat2), lon: ((deg(lon2) + 540) % 360) - 180 };
}
/** Great-circle intermediate point, fraction t in [0,1]. */
export function interpolate(a: LatLon, b: LatLon, t: number): LatLon {
  return destination(a, bearingDeg(a, b), haversineKm(a, b) * t);
}

/** UTM (WGS84) to lat/lon. Used for LiDAR/DEM files delivered in UTM. */
export function utmToLatLon(easting: number, northing: number, zone: number, northern = true): LatLon {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const x = easting - 500000, y = northern ? northing : northing - 10000000;
  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), t1 = Math.tan(p1) ** 2, c1 = ep2 * Math.cos(p1) ** 2;
  const r1 = (a * (1 - e2)) / Math.pow(1 - e2 * Math.sin(p1) ** 2, 1.5), d = x / (n1 * k0);
  const lat = p1 - ((n1 * Math.tan(p1)) / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6 / 720);
  const lon = (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5 / 120) / Math.cos(p1);
  return { lat: deg(lat), lon: (zone - 1) * 6 - 180 + 3 + deg(lon) };
}

export interface NmeaFix { lat: number; lon: number; altM: number; fixQuality: number; sats: number; hdop: number; time: string }
const FIX_NAMES: Record<number, string> = { 0: 'No fix', 1: 'GPS (autonomous)', 2: 'DGPS/SBAS', 4: 'RTK fixed', 5: 'RTK float', 6: 'Dead reckoning' };
export const fixQualityName = (q: number) => FIX_NAMES[q] ?? `Type ${q}`;

/** Parse GGA sentences ($GPGGA, $GNGGA, ...) from NMEA 0183 text. Checksums are verified when present. */
export function parseNmeaGga(text: string): NmeaFix[] {
  const out: NmeaFix[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^\$..GGA,/.test(line)) continue;
    const star = line.indexOf('*');
    if (star > 0) {
      let cs = 0; for (let i = 1; i < star; i++) cs ^= line.charCodeAt(i);
      if (cs !== parseInt(line.slice(star + 1, star + 3), 16)) continue;
    }
    const p = (star > 0 ? line.slice(0, star) : line).split(',');
    const q = parseInt(p[6] || '0', 10);
    if (!p[2] || !p[4] || q === 0) continue;
    const dm = (v: string, degLen: number) => parseInt(v.slice(0, degLen), 10) + parseFloat(v.slice(degLen)) / 60;
    let lat = dm(p[2], 2), lon = dm(p[4], 3);
    if (p[3] === 'S') lat = -lat; if (p[5] === 'W') lon = -lon;
    out.push({ lat, lon, altM: parseFloat(p[9] || '0'), fixQuality: q, sats: parseInt(p[7] || '0', 10), hdop: parseFloat(p[8] || '99'), time: p[1] });
  }
  return out;
}

/** Average a set of fixes, keeping only the best fix-quality class present. Returns 2D std dev (m). */
export function averageFixes(fixes: NmeaFix[]) {
  if (!fixes.length) return null;
  const rank = (q: number) => ({ 4: 5, 5: 4, 2: 3, 1: 2 } as Record<number, number>)[q] ?? 1;
  const best = Math.max(...fixes.map((f) => rank(f.fixQuality)));
  const use = fixes.filter((f) => rank(f.fixQuality) === best);
  const n = use.length;
  const lat = use.reduce((s, f) => s + f.lat, 0) / n, lon = use.reduce((s, f) => s + f.lon, 0) / n, alt = use.reduce((s, f) => s + f.altM, 0) / n;
  const sd = Math.sqrt(use.reduce((s, f) => s + (haversineKm({ lat, lon }, f) * 1000) ** 2, 0) / n);
  return { lat, lon, altM: alt, count: n, quality: fixQualityName(use[0].fixQuality), stdDev2dM: sd };
}
