// Reads the location and direction a phone (or drone) photo was taken from, straight from the JPEG file:
// EXIF GPS (latitude, longitude, altitude, compass direction), the lens (35 mm equivalent focal length),
// the time, and XMP panorama / gimbal tags (Google Photo Sphere GPano, DJI drone, Pix4D camera pose).
// No libraries and no network: works offline on any device.

export interface PhotoMeta {
  lat?: number; lon?: number; altM?: number;
  /** Compass direction the camera faced (degrees). headingRef 'M' = magnetic, 'T' = true. */
  headingDeg?: number; headingRef?: 'T' | 'M';
  /** Up / down tilt of the camera (degrees, + = up) and roll, from XMP when the phone or drone wrote it. */
  pitchDeg?: number; rollDeg?: number;
  focal35?: number; focalMm?: number;
  /** EXIF orientation 1..8 (6 / 8 = turned on its side). */
  orientation?: number;
  width?: number; height?: number;
  takenAt?: string; make?: string; model?: string;
  gpsAccuracyM?: number;
  /** Google Photo Sphere / phone panorama tags. */
  pano?: { fullW: number; fullH: number; cropW: number; cropH: number; cropLeft: number; cropTop: number; headingDeg?: number; pitchDeg?: number; rollDeg?: number; type?: string };
  /** Where the direction came from (for the person to see). */
  dirSource?: string;
}

const TAG = {
  Make: 0x010f, Model: 0x0110, Orientation: 0x0112, ExifIFD: 0x8769, GpsIFD: 0x8825,
  DateTimeOriginal: 0x9003, FocalLength: 0x920a, FocalLength35: 0xa405, PixelX: 0xa002, PixelY: 0xa003,
};

function ascii(v: DataView, off: number, n: number) { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(off + i); if (!c) break; s += String.fromCharCode(c); } return s.trim(); }

/** Parse one TIFF block (the body of the EXIF APP1 segment). */
function parseTiff(v: DataView, base: number, len: number, out: PhotoMeta) {
  const le = v.getUint16(base) === 0x4949; const u16 = (o: number) => v.getUint16(base + o, le), u32 = (o: number) => v.getUint32(base + o, le);
  if (u16(2) !== 42) return;
  const SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };
  type Entry = { tag: number; type: number; count: number; at: number };
  const readIfd = (o: number): Entry[] => {
    if (o <= 0 || o + 2 > len) return [];
    const n = u16(o), e: Entry[] = [];
    for (let i = 0; i < n; i++) {
      const p = o + 2 + i * 12; if (p + 12 > len) break;
      const type = u16(p + 2), count = u32(p + 4), size = (SIZES[type] ?? 1) * count;
      e.push({ tag: u16(p), type, count, at: size <= 4 ? p + 8 : u32(p + 8) });
    }
    return e;
  };
  const num = (e: Entry, i = 0): number => {
    const a = e.at + i * (SIZES[e.type] ?? 1); if (a + (SIZES[e.type] ?? 1) > len) return NaN;
    switch (e.type) {
      case 1: case 7: return v.getUint8(base + a);
      case 3: return u16(a);
      case 4: return u32(a);
      case 9: return v.getInt32(base + a, le);
      case 5: { const d = u32(a + 4); return d ? u32(a) / d : NaN; }
      case 10: { const d = v.getInt32(base + a + 4, le); return d ? v.getInt32(base + a, le) / d : NaN; }
      case 11: return v.getFloat32(base + a, le);
      case 12: return v.getFloat64(base + a, le);
      default: return NaN;
    }
  };
  const str = (e: Entry) => (e.at + e.count <= len ? ascii(v, base + e.at, e.count) : '');
  const ifd0 = readIfd(u32(4));
  let exifOff = 0, gpsOff = 0;
  for (const e of ifd0) {
    if (e.tag === TAG.Make) out.make = str(e);
    else if (e.tag === TAG.Model) out.model = str(e);
    else if (e.tag === TAG.Orientation) out.orientation = num(e);
    else if (e.tag === TAG.ExifIFD) exifOff = num(e);
    else if (e.tag === TAG.GpsIFD) gpsOff = num(e);
  }
  for (const e of readIfd(exifOff)) {
    if (e.tag === TAG.DateTimeOriginal) { const s = str(e); const m = s.match(/^(\d{4}):(\d\d):(\d\d)[ T](\d\d):(\d\d):(\d\d)/); if (m) out.takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`; }
    else if (e.tag === TAG.FocalLength) out.focalMm = num(e);
    else if (e.tag === TAG.FocalLength35) { const f = num(e); if (f > 0) out.focal35 = f; }
    else if (e.tag === TAG.PixelX) out.width = num(e);
    else if (e.tag === TAG.PixelY) out.height = num(e);
  }
  if (gpsOff) {
    const g: Record<number, Entry> = {}; for (const e of readIfd(gpsOff)) g[e.tag] = e;
    const ref = (t: number) => (g[t] ? String.fromCharCode(v.getUint8(base + g[t].at)) : '');
    const dms = (t: number) => (g[t] && g[t].count >= 3 ? num(g[t], 0) + num(g[t], 1) / 60 + num(g[t], 2) / 3600 : NaN);
    const la = dms(2), lo = dms(4);
    if (Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0)) { out.lat = ref(1) === 'S' ? -la : la; out.lon = ref(3) === 'W' ? -lo : lo; }
    if (g[6]) { const a = num(g[6]); if (Number.isFinite(a)) out.altM = g[5] && v.getUint8(base + g[5].at) === 1 ? -a : a; }
    if (g[17]) { const d = num(g[17]); if (Number.isFinite(d)) { out.headingDeg = ((d % 360) + 360) % 360; out.headingRef = ref(16) === 'M' ? 'M' : 'T'; out.dirSource = 'photo compass (GPS direction tag)'; } }
    if (g[31]) { const h = num(g[31]); if (Number.isFinite(h) && h > 0) out.gpsAccuracyM = h; } // GPSHPositioningError
  }
}

const xnum = (xmp: string, ...names: string[]): number | undefined => {
  for (const n of names) {
    const m = xmp.match(new RegExp(`${n}\\s*=\\s*"([-+0-9.eE]+)"`)) ?? xmp.match(new RegExp(`<${n}>([-+0-9.eE]+)</${n}>`));
    if (m) { const v = parseFloat(m[1]); if (Number.isFinite(v)) return v; }
  }
  return undefined;
};
const xstr = (xmp: string, n: string) => (xmp.match(new RegExp(`${n}\\s*=\\s*"([^"]*)"`)) ?? xmp.match(new RegExp(`<${n}>([^<]*)</${n}>`)))?.[1];

/** Read the XMP packet: phone panoramas (GPano), drones (DJI gimbal), mapping cameras (Pix4D). */
export function parseXmp(xmp: string, out: PhotoMeta) {
  const fullW = xnum(xmp, 'GPano:FullPanoWidthPixels'), cropW = xnum(xmp, 'GPano:CroppedAreaImageWidthPixels');
  if (fullW && cropW) {
    out.pano = {
      fullW, fullH: xnum(xmp, 'GPano:FullPanoHeightPixels') ?? fullW / 2, cropW, cropH: xnum(xmp, 'GPano:CroppedAreaImageHeightPixels') ?? fullW / 2,
      cropLeft: xnum(xmp, 'GPano:CroppedAreaLeftPixels') ?? 0, cropTop: xnum(xmp, 'GPano:CroppedAreaTopPixels') ?? 0,
      headingDeg: xnum(xmp, 'GPano:PoseHeadingDegrees'), pitchDeg: xnum(xmp, 'GPano:PosePitchDegrees'), rollDeg: xnum(xmp, 'GPano:PoseRollDegrees'),
      type: xstr(xmp, 'GPano:ProjectionType'),
    };
  } else {
    const h = xnum(xmp, 'GPano:PoseHeadingDegrees'); if (h != null && out.headingDeg == null) { out.headingDeg = h; out.headingRef = 'T'; out.dirSource = 'photo compass (panorama tag)'; }
  }
  // DJI drones: gimbal direction and tilt (pitch -90 = straight down)
  const gy = xnum(xmp, 'drone-dji:GimbalYawDegree', 'drone-dji:FlightYawDegree'), gp = xnum(xmp, 'drone-dji:GimbalPitchDegree'), gr = xnum(xmp, 'drone-dji:GimbalRollDegree');
  if (gy != null) { out.headingDeg = ((gy % 360) + 360) % 360; out.headingRef = 'T'; out.dirSource = 'drone gimbal'; }
  if (gp != null) out.pitchDeg = gp; if (gr != null) out.rollDeg = gr;
  const ra = xnum(xmp, 'drone-dji:RelativeAltitude'); if (ra != null) (out as PhotoMeta & { relAltM?: number }).relAltM = ra;
  // Pix4D / Parrot camera pose
  const cy = xnum(xmp, 'Camera:Yaw'), cp = xnum(xmp, 'Camera:Pitch'), cr = xnum(xmp, 'Camera:Roll');
  if (cy != null && out.headingDeg == null) { out.headingDeg = ((cy % 360) + 360) % 360; out.headingRef = 'T'; out.dirSource = 'camera pose'; }
  if (cp != null && out.pitchDeg == null) out.pitchDeg = cp; // Pix4D: pitch relative to the horizon
  if (cr != null && out.rollDeg == null) out.rollDeg = cr;
}

/** Read GPS, direction, lens and panorama information from a JPEG file. Returns {} for files without it. */
export function readPhotoMeta(buf: ArrayBuffer): PhotoMeta {
  const v = new DataView(buf), out: PhotoMeta = {};
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return out;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    if (v.getUint8(o) !== 0xff) { o++; continue; }
    const mk = v.getUint8(o + 1);
    if (mk === 0xd9 || mk === 0xda) break; // end / start of image data: no more metadata
    if (mk === 0xd8 || (mk >= 0xd0 && mk <= 0xd7) || mk === 0x01 || mk === 0xff) { o += mk === 0xff ? 1 : 2; continue; }
    const len = v.getUint16(o + 2), body = o + 4, n = len - 2;
    if (body + n > v.byteLength) break;
    if (mk === 0xe1) {
      if (n > 6 && ascii(v, body, 4) === 'Exif') { try { parseTiff(v, body + 6, n - 6, out); } catch { /* damaged EXIF: keep what was read */ } }
      else {
        const head = ascii(v, body, Math.min(40, n));
        if (head.startsWith('http://ns.adobe.com/xap/1.0/') || head.startsWith('http://ns.adobe.com/xmp/extension/')) {
          let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(body + i));
          try { parseXmp(s, out); } catch { /* ignore */ }
        }
      }
    } else if ((mk >= 0xc0 && mk <= 0xc3) && n >= 5) { out.height = v.getUint16(body + 1); out.width = v.getUint16(body + 3); } // the real picture size
    o = body + n;
  }
  return out;
}
