// Photo site survey: phone photos, several views or a panorama, placed where and in the direction they were
// taken (from the photo's GPS and compass, the phone's sensors, or by hand), lined up into one panorama and
// matched to the terrain. Overlays: terrain horizon, azimuth and compass, project sites, existing towers,
// RadioReference sites, what blocks the view, drawn lines and the predicted-signal heat map. Works offline.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { Card, Num, Tip, fmt } from '../components/ui';
import { MapView } from '../components/MapView';
import { askConfirm } from '../components/askConfirm';
import { IntroVideo } from '../components/IntroVideo';
import { uid } from '../defaults';
import { useUnits } from '../units';
import { readPhotoMeta } from '../engine/exif';
import {
  cameraFromMeta, projector, horizonProfile, horizonAt, viewTargets, groupByPlace, stripFor, stripX, stripY, stripAz, stripEl, angDiff,
  detectSkyline, matchHorizon, arrangeInOrder, visibleGround, POINTS8,
  type PhotoSpot, type SurveyPhoto, type Horizon, type Strip, type Target, type TargetView,
} from '../engine/photosurvey';
import { loadAreaDem } from '../engine/areaTerrain';
import { boundsAround } from '../engine/autoterrain';
import { sampleDem, type DemGrid } from '../engine/terrain';
import { loadCommSites, siteLabel, type CommSite } from '../engine/towers';
import { declinationDeg, fmtAz, fmtDeg, norm360, trueToMag, magToTrue } from '../engine/azimuth';
import { haversineKm, destination, type LatLon } from '../engine/geo';
import { parseLatLon } from '../engine/locparse';
import { primaryCoverageInputs } from '../engine/network';
import { predictPoint, rssiColor } from '../engine/coverage';
import { useRrLoggedIn } from './RadioReference';
import { listDownloads, loadDownload } from '../engine/radioref';
import { analyzeLine } from '../engine/routes';

export const SPOT_KEY = 'radioplan.photospot';
const LAYER_KEY = 'radioplan.photolayers';
type LayerId = 'photos' | 'horizon' | 'azimuth' | 'sites' | 'towers' | 'rr' | 'blocks' | 'lines' | 'heat' | 'outlines';
const LAYERS: [LayerId, string, string][] = [
  ['photos', 'Photos', 'Your photos. Turn off to see only the terrain drawing.'],
  ['horizon', 'Terrain horizon', 'The skyline worked out from the terrain heights. When the photos are lined up right, it sits on the real ridges.'],
  ['azimuth', 'Azimuth & compass', 'Direction marks across the top: degrees true (°T) and the compass reading (°M).'],
  ['sites', 'Project sites', 'The sites on Site Data & GPS, with distance and whether the terrain hides them from here.'],
  ['towers', 'Existing towers', 'Towers and comm sites from OpenStreetMap (saved for offline once viewed). Verify in the FCC ASR database.'],
  ['rr', 'RadioReference sites', 'Trunked radio sites from your RadioReference downloads. Shown only while logged in, never in reports.'],
  ['blocks', 'What blocks the view', 'A red mark on the ridge that hides a site or tower from this spot.'],
  ['lines', 'Drawn lines', 'Lines drawn on the map, laid on the ground in the picture.'],
  ['heat', 'Signal heat map', 'Predicted signal from the transmit site painted over the ground you can see.'],
  ['outlines', 'Photo edges', 'Outline and number of each photo in the panorama.'],
];
const DEFAULT_LAYERS: Record<LayerId, boolean> = { photos: true, horizon: true, azimuth: true, sites: true, towers: true, rr: true, blocks: true, lines: true, heat: false, outlines: false };
const loadLayers = (): Record<LayerId, boolean> => { try { return { ...DEFAULT_LAYERS, ...JSON.parse(localStorage.getItem(LAYER_KEY) ?? '{}') }; } catch { return DEFAULT_LAYERS; } };
const SRC: Record<SurveyPhoto['headingSrc'], string> = { photo: 'from the photo', compass: "from the phone's compass", drone: 'from the drone', terrain: 'matched to the terrain', manual: 'typed in', arranged: 'lined up in order (check it)', none: 'not known' };
const compassName = (az: number) => POINTS8[Math.round(norm360(az) / 45) % 8];

/** Read the phone's compass and tilt while the camera is used (Android: absolute orientation; iPhone: webkitCompassHeading). */
function useCompass() {
  const last = useRef<{ magDeg: number; pitchDeg: number; at: number } | null>(null);
  const on = useRef(false);
  const start = async () => {
    if (on.current || typeof window === 'undefined') return; on.current = true;
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try { if (D?.requestPermission) await D.requestPermission(); } catch { /* not allowed: no compass */ }
    const h = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const mag = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? norm360(360 - e.alpha) : null);
      if (mag == null || e.beta == null) return;
      last.current = { magDeg: mag, pitchDeg: Math.max(-60, Math.min(60, e.beta - 90)), at: Date.now() };
    };
    window.addEventListener('deviceorientationabsolute' as 'deviceorientation', h as EventListener);
    window.addEventListener('deviceorientation', h as EventListener);
  };
  return { start, read: () => (last.current && Date.now() - last.current.at < 120000 ? last.current : null) };
}

async function fileToImage(f: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(f);
  try { return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
/** Shrink to keep the project small: photos to 2400 px, panoramas to 6000 px on the long side. */
function shrink(img: HTMLImageElement, max: number) {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height };
}
const imgCache = new Map<string, Promise<HTMLImageElement>>();
const loadImg = (src: string) => { let p = imgCache.get(src); if (!p) { p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); imgCache.set(src, p); if (imgCache.size > 40) imgCache.delete(imgCache.keys().next().value!); } return p; };

/** Paint the photos into one panorama strip: every strip pixel looks up the photo(s) that see that direction, blended at the seams. */
async function paintStrip(photos: SurveyPhoto[], s: Strip): Promise<HTMLCanvasElement> {
  const out = document.createElement('canvas'); out.width = s.w; out.height = s.h;
  const g = out.getContext('2d')!, dst = g.createImageData(s.w, s.h), acc = new Float32Array(s.w * s.h * 4);
  for (const ph of photos) {
    if (ph.hidden || ph.headingDeg == null) continue;
    let img: HTMLImageElement; try { img = await loadImg(ph.dataUrl); } catch { continue; }
    const k = Math.min(1, (s.ppd * ph.hfovDeg * 1.25) / ph.w), w = Math.max(2, Math.round(ph.w * k)), h = Math.max(2, Math.round(ph.h * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const cg = c.getContext('2d')!; cg.drawImage(img, 0, 0, w, h);
    const src = cg.getImageData(0, 0, w, h).data, P = projector({ ...ph, w, h }), feather = Math.max(2, w * 0.08);
    const half = ph.hfovDeg / 2 + 1;
    for (let x = 0; x < s.w; x++) {
      const az = stripAz(s, x + 0.5); if (Math.abs(angDiff(az, ph.headingDeg)) > half) continue;
      for (let y = 0; y < s.h; y++) {
        const q = P(az, stripEl(s, y + 0.5)); if (!q) continue;
        const ix = Math.min(w - 1, q.x | 0), iy = Math.min(h - 1, q.y | 0), si = (iy * w + ix) * 4, di = (y * s.w + x) * 4;
        const wt = Math.max(0.02, Math.min(1, Math.min(q.x, w - q.x, q.y, h - q.y) / feather));
        acc[di] += src[si] * wt; acc[di + 1] += src[si + 1] * wt; acc[di + 2] += src[si + 2] * wt; acc[di + 3] += wt;
      }
    }
  }
  for (let i = 0; i < s.w * s.h; i++) { const wt = acc[i * 4 + 3]; if (wt > 0) { dst.data[i * 4] = acc[i * 4] / wt; dst.data[i * 4 + 1] = acc[i * 4 + 1] / wt; dst.data[i * 4 + 2] = acc[i * 4 + 2] / wt; dst.data[i * 4 + 3] = 255; } }
  g.putImageData(dst, 0, 0); return out;
}

interface Scene {
  strip: Strip; hz: Horizon | null; dem: DemGrid | null; spot: PhotoSpot; targets: TargetView[];
  lines: { name: string; color: string; pts: { az: number; el: number; vis: boolean }[] }[];
  heat: ((q: LatLon) => number | null) | null; fmtDist: (km: number) => string; dec: number; layers: Record<LayerId, boolean>;
}

/** Draw the terrain drawing (sky and ground), the photos and every overlay onto one canvas. */
/** k = canvas pixels per strip pixel; fsPx = label text size in canvas pixels. */
function drawScene(cv: HTMLCanvasElement, sc: Scene, photoStrip: HTMLCanvasElement | null, k = 1, fsPx = 13) {
  const { strip: s, hz, layers: L } = sc, g = cv.getContext('2d')!;
  cv.width = Math.max(1, Math.round(s.w * k)); cv.height = Math.max(1, Math.round(s.h * k)); g.setTransform(k, 0, 0, k, 0, 0);
  // terrain drawing underneath: sky gradient above the horizon, shaded ground below
  const sky = g.createLinearGradient(0, 0, 0, s.h); sky.addColorStop(0, '#9cc8ef'); sky.addColorStop(1, '#e3f0fb'); g.fillStyle = sky; g.fillRect(0, 0, s.w, s.h);
  if (hz) { g.fillStyle = '#7d8f69'; g.beginPath(); g.moveTo(0, s.h); for (let x = 0; x <= s.w; x += 2) g.lineTo(x, stripY(s, horizonAt(hz, stripAz(s, x)))); g.lineTo(s.w, s.h); g.closePath(); g.fill(); }
  if (L.photos && photoStrip) g.drawImage(photoStrip, 0, 0);
  const fs = fsPx / k, label = (t: string, x: number, y: number, fg: string, bg: string, align: CanvasTextAlign = 'left') => {
    g.font = `bold ${fs}px sans-serif`; const w = g.measureText(t).width + 8, x0 = align === 'center' ? x - w / 2 : x;
    g.fillStyle = bg; g.fillRect(x0, y - fs, w, fs + 6); g.fillStyle = fg; g.textAlign = 'left'; g.fillText(t, x0 + 4, y + 1);
  };
  // predicted-signal heat map on the ground the camera can see
  if (L.heat && sc.heat && sc.dem && hz) {
    g.globalAlpha = 0.45; const reach = Math.min(12, hz.maxKm);
    for (let x = 0; x < s.w; x += 3) {
      const pts = visibleGround(sc.dem, sc.spot, hz.eyeAmslM, stripAz(s, x + 1.5), reach);
      let prevY = s.h;
      for (const q of pts) { const y = stripY(s, q.el); if (y >= prevY) continue; const v = sc.heat(q); if (v != null) { const c = rssiColor(v, -125); if (c[3]) { g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x, y, 3.6, prevY - y); } } prevY = y; }
    }
    g.globalAlpha = 1;
  }
  if (L.horizon && hz) {
    g.lineJoin = 'round'; for (const [w, col] of [[5, 'rgba(0,0,0,.55)'], [2.2, '#ffd600']] as [number, string][]) { g.strokeStyle = col; g.lineWidth = (w) / k; g.beginPath(); for (let x = 0; x <= s.w; x += 2) { const y = stripY(s, horizonAt(hz, stripAz(s, x))); if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
  }
  if (L.lines) for (const ln of sc.lines) {
    g.strokeStyle = ln.color; g.lineWidth = (3) / k; g.setLineDash([]); let open = false, last = 0;
    g.beginPath(); for (const q of ln.pts) { const x = stripX(s, q.az), y = stripY(s, q.el); if (!q.vis || (open && Math.abs(x - last) > s.w / 2)) { open = false; continue; } if (open) g.lineTo(x, y); else g.moveTo(x, y); open = true; last = x; } g.stroke();
  }
  if (L.outlines) {
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = (1.5) / k; g.setLineDash([6 / k, 4 / k]);
    sc.spot.photos.forEach((ph, i) => { if (ph.hidden || ph.headingDeg == null) return; const x0 = stripX(s, ph.headingDeg - ph.hfovDeg / 2), w = ph.hfovDeg * s.ppd, vf = (ph.hfovDeg * ph.h) / ph.w, y0 = stripY(s, ph.pitchDeg + vf / 2);
      g.strokeRect(x0, y0, w, vf * s.ppd); if (x0 + w > s.w) g.strokeRect(x0 - 360 * s.ppd, y0, w, vf * s.ppd); label(`Photo ${i + 1}`, x0 + 4, y0 + fs + 4, '#fff', 'rgba(0,0,0,.55)'); });
    g.setLineDash([]);
  }
  // sites, towers and what hides them
  const rows: number[][] = [];
  // keep the picture readable: every project site, then up to 10 towers and 8 RadioReference sites (the ones in view first, then the nearest)
  const pick = (kind: string, n: number) => sc.targets.filter((t) => t.kindKey === kind).sort((a, b) => Number(b.visible !== false) - Number(a.visible !== false) || a.km - b.km).slice(0, n);
  const shown = [...(L.sites ? sc.targets.filter((t) => t.kindKey === 'site' || t.kindKey === 'tx' || t.kindKey === 'rx') : []), ...(L.towers ? pick('tower', 10) : []), ...(L.rr ? pick('rr', 8) : [])];
  const COLORS: Record<string, [string, string]> = { site: ['#0d47a1', 'rgba(227,242,253,.95)'], tx: ['#b71c1c', 'rgba(255,235,238,.95)'], rx: ['#0d47a1', 'rgba(227,242,253,.95)'], tower: ['#4a148c', 'rgba(243,229,245,.93)'], rr: ['#e65100', 'rgba(255,243,224,.95)'] };
  for (const t of shown) {
    const x = stripX(s, t.az); if (x < 0 || x > s.w) continue;
    const y = Math.max(fs * 3, Math.min(s.h - 4, stripY(s, t.el))), [fg, bg] = COLORS[t.kindKey] ?? COLORS.site;
    g.strokeStyle = fg; g.lineWidth = (1.5) / k; g.setLineDash(t.visible === false ? [4 / k, 3 / k] : []);
    let row = 0; while ((rows[row] ?? []).some((r) => Math.abs(r - x) < fs * 14) && row < 6) row++; (rows[row] ??= []).push(x);
    const ly = fs * 3.2 + row * (fs + 9);
    g.beginPath(); g.moveTo(x, ly + 4); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = fg; g.beginPath(); g.arc(x, y, Math.max(3, fs / 3), 0, Math.PI * 2); g.fill();
    const icon = t.kindKey === 'tower' ? '📡 ' : t.kindKey === 'rr' ? '📻 ' : t.kindKey === 'tx' ? '🔴 ' : '📍 ';
    label(`${icon}${t.name.slice(0, 26)} · ${sc.fmtDist(t.km)}${t.visible == null ? '' : t.visible ? ' · ✓ in view' : ' · ✗ hidden'}`, x + 3, ly, fg, bg);
    if (L.blocks && t.visible === false && t.blockKm != null && sc.dem && hz && t.kindKey !== 'tower' && t.kindKey !== 'rr') {
      const q = destination(sc.spot, t.az, t.blockKm), z = sampleDem(sc.dem, q);
      if (z != null) { const by = stripY(s, Math.atan((z - hz.eyeAmslM) / (t.blockKm * 1000) - (t.blockKm * 1000) / (2 * (4 / 3) * 6371000)) * 180 / Math.PI);
        g.strokeStyle = '#d50000'; g.lineWidth = (3) / k; const r = fs * 0.5; g.beginPath(); g.moveTo(x - r, by - r); g.lineTo(x + r, by + r); g.moveTo(x + r, by - r); g.lineTo(x - r, by + r); g.stroke();
        label(`Ridge ${sc.fmtDist(t.blockKm)} away blocks it`, x + r + 2, by + fs / 2, '#b71c1c', 'rgba(255,235,238,.92)'); }
    }
  }
  if (L.azimuth) {
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, s.w, fs * 2.3);
    for (let a = Math.ceil(s.az0 / 5) * 5; a <= s.az0 + s.spanDeg; a += 5) {
      const x = stripX(s, a) || (a > s.az0 ? s.w : 0), big = a % 30 === 0, mid = a % 10 === 0;
      g.strokeStyle = '#fff'; g.lineWidth = (big ? 2 : 1) / k; g.beginPath(); g.moveTo(x, fs * 2.3); g.lineTo(x, fs * 2.3 + (big ? fs * 0.9 : mid ? fs * 0.5 : fs * 0.25)); g.stroke();
      if (big) { g.font = `bold ${fs}px sans-serif`; g.fillStyle = '#fff'; g.textAlign = 'center'; const t = norm360(a); g.fillText(`${t % 45 === 0 ? compassName(t) + ' ' : ''}${fmtDeg(t, 0)}°T`, x, fs * 1.05); g.font = `${Math.round(fs * 0.85)}px sans-serif`; g.fillText(`${fmtDeg(trueToMag(t, sc.dec), 0)}°M`, x, fs * 2.05); g.textAlign = 'left'; }
    }
  }
}

function useRrSites(on: boolean): Target[] {
  const [out, setOut] = useState<Target[]>([]);
  useEffect(() => {
    if (!on) { setOut([]); return; } let live = true;
    (async () => {
      const ts: Target[] = [];
      for (const d of await listDownloads().catch(() => [])) { const dl = await loadDownload(d.state, d.county); for (const sy of dl?.systems ?? []) for (const s of sy.sites) if (s.lat != null && s.lon != null) ts.push({ name: `${sy.name} ${s.number || s.name}`.trim(), kind: 'rr', lat: s.lat, lon: s.lon, aglM: 60, note: 'RadioReference' }); }
      if (live) setOut(ts);
    })();
    return () => { live = false; };
  }, [on]);
  return out;
}

function PhotoRow({ ph, i, onChange, onMatch, onDelete, dec }: { ph: SurveyPhoto; i: number; onChange: (f: Partial<SurveyPhoto>) => void; onMatch: () => void; onDelete: () => void; dec: number }) {
  return <div className="ps-photo">
    <img src={ph.dataUrl} alt={`Photo ${i + 1}`} style={{ opacity: ph.hidden ? 0.4 : 1 }} />
    <div className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}>
      <b>Photo {i + 1}{ph.caption ? `: ${ph.caption}` : ''} <span className="small muted">{ph.proj === 'rect' ? '' : ph.proj === 'equi' ? '· panorama sphere' : '· panorama'}{ph.takenAt ? ` · ${ph.takenAt.replace('T', ' ').slice(0, 16)}` : ''}</span></b>
      <span className="row wrap small" style={{ gap: 6 }}>Faces
        <button onClick={() => onChange({ headingDeg: norm360((ph.headingDeg ?? 0) - 1), headingSrc: 'manual' })} aria-label="Turn left 1°">◀</button>
        <Num value={ph.headingDeg == null ? null : Math.round(ph.headingDeg * 10) / 10} nullable unit="°T" onChange={(v) => onChange({ headingDeg: v == null ? null : norm360(v), headingSrc: v == null ? 'none' : 'manual' })} />
        <button onClick={() => onChange({ headingDeg: norm360((ph.headingDeg ?? 0) + 1), headingSrc: 'manual' })} aria-label="Turn right 1°">▶</button>
        {ph.headingDeg != null && <span>{compassName(ph.headingDeg)} · compass {fmtDeg(trueToMag(ph.headingDeg, dec), 0)}°M</span>}
        <span className="muted">({SRC[ph.headingSrc]})</span>
      </span>
      <span className="row wrap small" style={{ gap: 6 }}>
        Tilt <Num value={Math.round(ph.pitchDeg * 10) / 10} unit="° up" onChange={(v) => onChange({ pitchDeg: Math.max(-80, Math.min(80, v ?? 0)) })} />
        Width of view <Num value={Math.round(ph.hfovDeg * 10) / 10} unit="°" onChange={(v) => onChange({ hfovDeg: Math.max(5, Math.min(360, v ?? 60)) })} />
        <label title="If you read the direction off a hand compass, type it here">Compass reading <input type="number" style={{ width: 70 }} placeholder="°M" onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { onChange({ headingDeg: magToTrue(v, dec), headingSrc: 'manual' }); e.target.value = ''; } }} /></label>
      </span>
      <span className="row wrap" style={{ gap: 6 }}>
        <button onClick={onMatch} title="Find the skyline in the photo and turn the photo until it matches the terrain horizon">⛰ Match to terrain</button>
        <button onClick={() => onChange({ hidden: !ph.hidden })}>{ph.hidden ? '👁 Show' : '🙈 Hide'}</button>
        <input placeholder="Caption" value={ph.caption} onChange={(e) => onChange({ caption: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
        <button onClick={onDelete} aria-label={`Delete photo ${i + 1}`}>🗑</button>
      </span>
    </div>
  </div>;
}

export function PhotoSurveyPage() {
  const { project: p, update, rt } = useStore();
  const u = useUnits();
  const spots = p.photoSpots ?? [];
  const [sel, setSelS] = useState<string>(() => { try { return localStorage.getItem(SPOT_KEY) ?? ''; } catch { return ''; } });
  const setSel = (id: string) => { setSelS(id); try { localStorage.setItem(SPOT_KEY, id); } catch { /* ignore */ } };
  useEffect(() => { const f = (e: Event) => setSelS(String((e as CustomEvent).detail)); window.addEventListener('lv-photospot', f); return () => window.removeEventListener('lv-photospot', f); }, []);
  const spot = spots.find((s) => s.id === sel) ?? spots[0] ?? null;
  const setSpots = (f: (x: PhotoSpot[]) => PhotoSpot[]) => update((d) => { d.photoSpots = f(d.photoSpots ?? []); });
  const setSpot = (f: Partial<PhotoSpot> | ((s: PhotoSpot) => PhotoSpot)) => spot && setSpots((x) => x.map((s) => (s.id === spot.id ? (typeof f === 'function' ? f(s) : { ...s, ...f }) : s)));
  const setPhoto = (id: string, f: Partial<SurveyPhoto>) => setSpot((s) => ({ ...s, photos: s.photos.map((q) => (q.id === id ? { ...q, ...f } : q)) }));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [howto, setHowto] = useState(false);
  const compass = useCompass();
  const [layers, setLayersS] = useState(loadLayers);
  const setLayer = (k: LayerId, v: boolean) => setLayersS((x) => { const n = { ...x, [k]: v }; try { localStorage.setItem(LAYER_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [placing, setPlacing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const rrOn = useRrLoggedIn();

  // ----- import photos
  const addFiles = async (files: FileList | null, live: boolean) => {
    if (!files?.length) return;
    setBusy(`Reading ${files.length} photo${files.length > 1 ? 's' : ''}…`);
    const here = live ? await new Promise<GeolocationPosition | null>((res) => { if (!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }); }) : null;
    const sens = live ? compass.read() : null;
    const made: (SurveyPhoto & { lat?: number; lon?: number })[] = []; let noGps = 0, noDir = 0, bad = 0;
    for (const f of Array.from(files)) {
      try {
        const meta = readPhotoMeta(await f.arrayBuffer()), img = await fileToImage(f);
        const pano = img.naturalWidth / Math.max(1, img.naturalHeight) >= 2.2 || !!meta.pano;
        const sh = shrink(img, pano ? 6000 : 2400), cam = cameraFromMeta(meta, sh.w, sh.h);
        const lat = meta.lat ?? here?.coords.latitude, lon = meta.lon ?? here?.coords.longitude;
        if (meta.lat == null && lat == null) noGps++;
        let headingDeg = cam.headingDeg, headingSrc = cam.headingSrc, pitchDeg = cam.pitchDeg;
        if (headingDeg == null && sens && lat != null && lon != null) { headingDeg = magToTrue(sens.magDeg, declinationDeg({ lat, lon })); headingSrc = 'compass'; if (!meta.pitchDeg && cam.proj === 'rect') pitchDeg = Math.round(sens.pitchDeg); }
        if (headingDeg == null) noDir++;
        made.push({ id: uid(), name: f.name, dataUrl: sh.dataUrl, w: sh.w, h: sh.h, takenAt: meta.takenAt, lat, lon, altM: meta.altM, ...cam, headingDeg, headingSrc, pitchDeg, caption: '', camera: [meta.make, meta.model].filter(Boolean).join(' ') || undefined });
      } catch { bad++; }
    }
    // photos taken at the same spot (within 30 m) go together; ones with no position join the open spot
    const groups = groupByPlace(made, 30); let first = '';
    setSpots((all) => {
      const next = [...all];
      for (const g of groups) {
        const near = g.lat != null ? next.find((s) => haversineKm(s, { lat: g.lat!, lon: g.lon! }) * 1000 <= 30) : spot ? next.find((s) => s.id === spot.id) : undefined;
        const items: SurveyPhoto[] = g.items; // each photo keeps its own GPS too
        if (near) { near.photos = arrangeInOrder([...near.photos, ...items]); first ||= near.id; Object.assign(near, { snapshot: undefined }); continue; }
        const c = g.lat != null ? { lat: g.lat, lon: g.lon! } : p.sites[0] ? { lat: p.sites[0].lat, lon: p.sites[0].lon } : { lat: 35.5951, lon: -82.5515 };
        const s: PhotoSpot = { id: uid(), name: `Survey spot ${next.length + 1}`, at: items[0]?.takenAt ?? new Date().toISOString(), lat: c.lat, lon: c.lon, posSrc: g.lat != null ? (live && !made.some((m) => m.lat != null && m.lat !== here?.coords.latitude) ? 'gps' : 'photo') : 'site', eyeM: 1.7, photos: arrangeInOrder(items), notes: '' };
        next.push(s); first ||= s.id;
      }
      return next;
    });
    if (first) setSel(first);
    setBusy('');
    setMsg([`Added ${made.length} photo${made.length === 1 ? '' : 's'}.`, noGps ? `${noGps} had no GPS position: the spot was put at Site A. Set the spot's position below (My GPS, type it, or tap the map).` : '',
      noDir ? `${noDir} had no compass direction: they are lined up side by side. Press ⛰ Line up with the terrain, or type the direction.` : '', bad ? `${bad} file(s) could not be read as pictures.` : ''].filter(Boolean).join(' '));
  };

  // ----- terrain and horizon around the spot
  const [dem, setDem] = useState<DemGrid | null>(null);
  const [demNote, setDemNote] = useState('');
  const sKey = spot ? `${spot.lat.toFixed(4)},${spot.lon.toFixed(4)}` : '';
  useEffect(() => {
    if (!spot) { setDem(null); return; } let live = true; setDemNote('Loading terrain around the spot…');
    loadAreaDem(boundsAround([spot], 18), rt.dem).then((r) => { if (!live) return; setDem(r.dem); setDemNote(r.note); }).catch(() => live && setDemNote('Terrain is not available here yet.'));
    return () => { live = false; };
  }, [sKey, rt.dem]); // eslint-disable-line react-hooks/exhaustive-deps
  const hz = useMemo(() => (dem && spot ? horizonProfile(dem, spot, spot.eyeM, { stepDeg: 0.25, maxKm: 30, k: p.radio.kFactor }) : null), [dem, sKey, spot?.eyeM, p.radio.kFactor]); // eslint-disable-line react-hooks/exhaustive-deps
  const dec = spot ? declinationDeg(spot) : 0;

  // ----- things to show in the picture
  const [comm, setComm] = useState<CommSite[]>([]);
  useEffect(() => {
    if (!spot || !layers.towers) { setComm([]); return; } const b = boundsAround([spot], 25), ac = new AbortController();
    loadCommSites(b.south, b.west, b.north, b.east, { online: navigator.onLine, signal: ac.signal }).then((r) => setComm(r.sites)).catch(() => undefined);
    return () => ac.abort();
  }, [sKey, layers.towers]); // eslint-disable-line react-hooks/exhaustive-deps
  const rrSites = useRrSites(rrOn && layers.rr);
  const targets = useMemo(() => {
    if (!spot) return [] as TargetView[];
    const ts: Target[] = p.sites.map((s) => ({ name: s.name, kind: s.id === p.radio.txSiteId ? 'tx' : 'site', lat: s.lat, lon: s.lon, aglM: s.antennaAglM }));
    const towers = comm.filter((c) => haversineKm(spot, c) < 20).sort((a, b) => haversineKm(spot, a) - haversineKm(spot, b)).slice(0, 25).map((c): Target => ({ name: siteLabel(c), kind: 'tower', lat: c.lat, lon: c.lon, aglM: c.heightFt ? c.heightFt * 0.3048 : 30 }));
    const rr = rrSites.filter((c) => haversineKm(spot, c) < 40).sort((a, b) => haversineKm(spot, a) - haversineKm(spot, b)).slice(0, 15);
    return viewTargets(dem, spot, hz?.eyeAmslM ?? (spot.eyeM + (dem ? sampleDem(dem, spot) ?? 0 : 0)), [...ts, ...towers, ...rr], { k: p.radio.kFactor }).filter((t) => t.km > 0.015);
  }, [sKey, p.sites, p.radio.txSiteId, comm, rrSites, dem, hz]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo(() => {
    if (!spot || !dem || !hz) return [];
    return (p.drawnLines ?? []).map((l) => {
      const r = analyzeLine(l, dem, null, { thresholdDbm: -100, k: p.radio.kFactor, clutterM: 0, fMHz: p.radio.fMHz });
      const all = (r.samples.length ? r.samples : l.pts).filter((q) => haversineKm(spot, q) < 20), every = Math.max(1, Math.ceil(all.length / 150)), samples = all.filter((_, i) => i % every === 0);
      const tv = viewTargets(dem, spot, hz.eyeAmslM, samples.map((q) => ({ name: '', kind: 'site', lat: q.lat, lon: q.lon, aglM: 0.5 })), { k: p.radio.kFactor });
      const byPos = new Map(tv.map((t) => [`${t.lat},${t.lon}`, t]));
      return { name: l.name, color: l.color ?? '#7b1fa2', pts: samples.map((q) => { const t = byPos.get(`${q.lat},${q.lon}`)!; return { az: t.az, el: t.el, vis: t.visible !== false }; }) };
    });
  }, [sKey, dem, hz, JSON.stringify(p.drawnLines ?? [])]); // eslint-disable-line react-hooks/exhaustive-deps
  const heat = useMemo(() => {
    if (!layers.heat || !dem || !spot) return null;
    const cov = primaryCoverageInputs(p, dem); if (!cov) return null;
    const N = 40, b = boundsAround([spot], 12), grid = new Float32Array((N + 1) * (N + 1)), c2 = { ...cov, dem, radiusKm: 1e6 };
    for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) grid[r * (N + 1) + c] = predictPoint(c2, { lat: b.north - ((b.north - b.south) * r) / N, lon: b.west + ((b.east - b.west) * c) / N });
    return (q: LatLon) => { const y = ((b.north - q.lat) / (b.north - b.south)) * N, x = ((q.lon - b.west) / (b.east - b.west)) * N; if (x < 0 || y < 0 || x > N || y > N) return null; const v = grid[Math.round(y) * (N + 1) + Math.round(x)]; return Number.isFinite(v) ? v : null; };
  }, [layers.heat, dem, sKey, p.radio, p.sites, p.propagation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- the panorama strip
  const strip = useMemo(() => (spot ? stripFor(spot.photos) : null), [spot?.photos]); // eslint-disable-line react-hooks/exhaustive-deps
  const [photoStrip, setPhotoStrip] = useState<HTMLCanvasElement | null>(null);
  const photoKey = spot ? JSON.stringify(spot.photos.map((q) => [q.id, q.headingDeg, q.pitchDeg, q.rollDeg, q.hfovDeg, q.hidden])) : '';
  useEffect(() => {
    if (!spot || !strip || !spot.photos.length) { setPhotoStrip(null); return; } let live = true; setBusy('Putting the panorama together…');
    const t = window.setTimeout(() => paintStrip(spot.photos, strip).then((c) => { if (live) { setPhotoStrip(c); setBusy(''); } }), 30);
    return () => { live = false; window.clearTimeout(t); };
  }, [photoKey, strip]); // eslint-disable-line react-hooks/exhaustive-deps
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = (lay: Record<LayerId, boolean>): Scene | null => (spot && strip ? { strip, hz, dem, spot, targets, lines, heat, fmtDist: (km) => u.f(km, km < 10 ? 2 : 1), dec, layers: lay } : null);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(800);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setBoxW(el.clientWidth || 800)); ro.observe(el); setBoxW(el.clientWidth || 800); return () => ro.disconnect(); }, [!!strip]); // eslint-disable-line react-hooks/exhaustive-deps
  const dispW = strip ? Math.round(zoom === 0.5 ? boxW : Math.max(boxW, strip.spanDeg * (zoom === 1 ? 7 : 14))) : 0;
  const dpr = typeof devicePixelRatio === 'number' ? Math.min(2, devicePixelRatio) : 1;
  useEffect(() => { const sc = scene(layers); if (cv.current && sc && strip) drawScene(cv.current, sc, photoStrip, (dispW * dpr) / strip.w, 12.5 * dpr); }); // redraw every render: cheap next to the strip
  const [hover, setHover] = useState<{ az: number; el: number } | null>(null);
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!strip) return; const r = e.currentTarget.getBoundingClientRect(); setHover({ az: stripAz(strip, ((e.clientX - r.left) / r.width) * strip.w), el: stripEl(strip, ((e.clientY - r.top) / r.height) * strip.h) }); };

  // ----- line the photos up with the terrain
  const matchOne = async (ph: SurveyPhoto, wide = false): Promise<Partial<SurveyPhoto> | null> => {
    if (!hz) return null;
    const img = await loadImg(ph.dataUrl), k = Math.min(1, 480 / ph.w), w = Math.round(ph.w * k), h = Math.round(ph.h * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = 0.25 * d[i * 4] + 0.45 * d[i * 4 + 1] + 0.3 * d[i * 4 + 2] + Math.max(0, d[i * 4 + 2] - d[i * 4]) * 0.35; // sky is bright and bluish
    const m = matchHorizon(ph, detectSkyline(lum, w, h), k, hz, wide || ph.headingSrc === 'none' || ph.headingSrc === 'arranged' ? { searchDeg: 180 } : {});
    if (!m || m.errDeg > 1.5) return null;
    return { headingDeg: Math.round(m.headingDeg * 10) / 10, pitchDeg: Math.round(m.pitchDeg * 10) / 10, headingSrc: 'terrain' };
  };
  const matchAll = async (ids?: string[]) => {
    if (!spot || !hz) { setMsg('Terrain is needed to match the photos. It loads by itself when the spot is set.'); return; }
    setBusy('Matching the photos to the terrain horizon…'); let ok = 0, miss = 0;
    for (const ph of spot.photos.filter((q) => !ids || ids.includes(q.id))) { const r = await matchOne(ph); if (r) { setPhoto(ph.id, r); ok++; } else miss++; }
    setBusy('');
    setMsg(ok ? `Matched ${ok} photo${ok > 1 ? 's' : ''} to the terrain horizon.${miss ? ` ${miss} could not be matched (no clear skyline, or trees and buildings in the way): set those by hand with ◀ ▶.` : ''} Check that the yellow line sits on the real ridges.`
      : 'No clear skyline to match. This works best with open sky above the hills. Set the direction by hand with ◀ ▶, or type a compass reading.');
  };

  // ----- position of the spot
  const gps = () => {
    if (!navigator.geolocation || !spot) { setMsg('No GPS on this device.'); return; }
    setMsg('Getting your GPS position…');
    navigator.geolocation.getCurrentPosition((g) => { setSpot({ lat: g.coords.latitude, lon: g.coords.longitude, posSrc: 'gps' }); setMsg(`Spot moved to your GPS position (±${Math.round(g.coords.accuracy)} m).`); }, (e) => setMsg('GPS: ' + e.message), { enableHighAccuracy: true, timeout: 20000 });
  };
  const [posText, setPosText] = useState('');
  const savePicture = () => {
    const sc = scene({ ...layers, rr: false }); if (!sc || !spot) return; // RadioReference data never goes in a report
    const c = document.createElement('canvas'); drawScene(c, sc, photoStrip, 2400 / sc.strip.w, 20);
        setSpot({ snapshot: c.toDataURL('image/jpeg', 0.85), snapshotAt: new Date().toISOString(), inView: targets.filter((t) => t.kindKey !== 'rr').map(({ name, kind, km, az, el, visible, blockKm }) => ({ name, kind, km, az, el, visible, blockKm })) });
    setMsg('Saved for reports ✓ It prints in Reports → Photo site survey.');
  };
  const delSpot = async () => { if (!spot) return; if (await askConfirm({ title: 'Delete survey spot?', message: `Delete “${spot.name}” and its ${spot.photos.length} photo(s)?`, ok: 'Delete', danger: true })) { setSpots((x) => x.filter((s) => s.id !== spot.id)); setSel(''); } };

  const hzAt = hover && hz ? { el: horizonAt(hz, hover.az), km: hz.km[Math.round(norm360(hover.az) / hz.stepDeg) % hz.km.length] } : null;
  return (
    <div className="stack">
      <Card title="Photo site survey" tip="Take photos (one, several views around you, or a panorama) where you plan to put an antenna or a tower. The app places them in the direction they face, matches them to the terrain, and shows the horizon, towers, sites, what blocks the view and the signal right on the pictures.">
        <details className="ps-howto">
          <summary><b>📱 How to take a panorama correctly</b> <button className="primary" onClick={(e) => { e.preventDefault(); setHowto(true); }}>▶ Play (1 min)</button></summary>
          <ol className="small">
            <li><b>Turn on location and the compass</b> on the phone (and “Save location” in the camera), so each photo saves where you stood and which way it faced.</li>
            <li><b>Stand still in one spot.</b> Turn your body on the spot; do not walk around.</li>
            <li><b>Hold the phone level, at eye height.</b> Keep the horizon (where the sky meets the ground) in every picture.</li>
            <li><b>Overlap each photo with the last one by about a third.</b> That is about 8 to 12 photos all the way around, or one sweep in the phone's Panorama mode.</li>
            <li><b>Do not zoom.</b> Use the normal 1× camera, so the app knows how wide each photo is.</li>
            <li><b>No location in your photos?</b> Some apps and messages remove it. Press <b>📷 Take photos here</b> and the app saves your position for you.</li>
          </ol>
        </details>
        {howto && <IntroVideo file="panorama-howto.mp4" title="How to take a panorama" about="Six quick steps for photos the app can place and line up, with captions. " onClose={() => setHowto(false)} />}
        <p className="small">Stand at the spot, then take photos all the way around, or one panorama. The photo's GPS and compass tell the app where you stood and which way each photo faces. <b>Tip:</b> keep some sky above the hills in each photo, so the app can line them up with the terrain.</p>
        <div className="row wrap">
          <label className="btn primary" onClick={() => compass.start()}>📷 Take photos here<input hidden type="file" accept="image/*" capture="environment" multiple onChange={(e) => { addFiles(e.target.files, true); e.target.value = ''; }} /></label>
          <label className="btn">🖼 Add photos or a panorama<input hidden type="file" accept="image/jpeg,image/*" multiple onChange={(e) => { addFiles(e.target.files, false); e.target.value = ''; }} /></label>
          {spots.length > 0 && <select value={spot?.id ?? ''} onChange={(e) => setSel(e.target.value)} aria-label="Survey spot">{spots.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.photos.length} photo{s.photos.length === 1 ? '' : 's'})</option>)}</select>}
          <button onClick={() => { const c = p.sites[0] ?? { lat: 35.5951, lon: -82.5515 }; const s: PhotoSpot = { id: uid(), name: `Survey spot ${spots.length + 1}`, at: new Date().toISOString(), lat: c.lat, lon: c.lon, posSrc: 'site', eyeM: 1.7, photos: [], notes: '' }; setSpots((x) => [...x, s]); setSel(s.id); }}>＋ New spot</button>
        </div>
        {busy && <p className="note">⏳ {busy}</p>}
        {msg && <p className="note">{msg}</p>}
      </Card>
      {!spot ? <Card title="No survey spots yet"><p>Add photos above. A spot with no photos also works: it shows the terrain drawing with the horizon, towers and sites all the way around.</p></Card> : <>
        <Card title={`${spot.name}: panorama with overlays`} tip="Drag sideways to scroll around. Hover or tap to read the direction and height angle. The yellow line is the terrain horizon worked out from the terrain heights.">
          <div className="row wrap small ps-layers">
            {LAYERS.filter(([k]) => k !== 'rr' || rrOn).map(([k, label, tip]) => <label key={k} title={tip}><input type="checkbox" checked={layers[k]} onChange={(e) => setLayer(k, e.target.checked)} /> {label}</label>)}
          </div>
          <div className="row wrap small" style={{ gap: 6, margin: '4px 0' }}>
            <span>Zoom</span>{[0.5, 1, 2].map((z) => <button key={z} className={zoom === z ? 'primary' : ''} onClick={() => setZoom(z)}>{z === 0.5 ? 'Fit more' : z === 1 ? 'Normal' : 'Close up'}</button>)}
            {spot.photos.length > 0 && <button onClick={() => matchAll()} disabled={!hz} title="Turn each photo until its skyline sits on the terrain horizon">⛰ Line up with the terrain</button>}
            <button className="primary" onClick={savePicture}>📄 Save picture for reports</button>
          </div>
          {strip && <div className="ps-view" ref={box} style={{ maxWidth: '100%', overflowX: 'auto' }}>
            <canvas ref={cv} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ width: dispW, maxWidth: 'none', display: 'block' }} aria-label="Panorama with terrain horizon, sites and towers" />
          </div>}
          <p className="small">{hover ? <>Pointing at <b>{fmtAz(hover.az, dec, 0)}</b>, {fmt(hover.el, 1)}° {hover.el >= 0 ? 'up' : 'down'}{hzAt ? <> · terrain horizon {fmt(hzAt.el, 1)}° ({u.f(hzAt.km)} away)</> : null}</>
            : <>Spot {spot.lat.toFixed(5)}, {spot.lon.toFixed(5)}{hz ? <> · ground {u.len(hz.groundM, 0)} · camera {u.len(spot.eyeM, 0)} up · horizon checked out to {u.f(hz.maxKm, 0)}</> : null} · declination {Math.abs(dec).toFixed(1)}° {dec < 0 ? 'W' : 'E'}</>}</p>
          {demNote && <p className="note">{demNote}</p>}
          {!hz && !demNote && <p className="note">Loading terrain…</p>}
        </Card>
        <div className="grid2">
          <Card title="Where the photos were taken" tip="The position comes from the photo's GPS. If the photos had none, use your GPS standing at the spot, type coordinates or an address, or tap the map.">
            <div className="form">
              <label className="field"><span>Name</span><input value={spot.name} onChange={(e) => setSpot({ name: e.target.value })} /></label>
              <label className="field"><span>Camera height <Tip text="How high the camera was above the ground. 1.7 m (5.5 ft) when hand held; more on a roof, a lift or a tower." /></span><Num value={u.unit === 'mi' ? Math.round(spot.eyeM / 0.3048 * 10) / 10 : spot.eyeM} unit={u.unit === 'mi' ? 'ft' : 'm'} onChange={(v) => setSpot({ eyeM: Math.max(0.3, u.unit === 'mi' ? (v ?? 5.5) * 0.3048 : v ?? 1.7) })} /></label>
              <label className="field wide"><span>Position</span><span className="row wrap" style={{ gap: 6 }}>
                <input placeholder="GPS coordinates, e.g. 35.5951, -82.5515" value={posText} onChange={(e) => setPosText(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
                <button onClick={() => { const ll = parseLatLon(posText); if (ll) { setSpot({ lat: ll.lat, lon: ll.lon, posSrc: 'typed' }); setPosText(''); setMsg('Spot moved.'); } else setMsg('Type coordinates like 35.5951, -82.5515.'); }}>Set</button>
                <button onClick={gps}>◎ My GPS</button>
                <button className={placing ? 'primary' : ''} onClick={() => setPlacing(!placing)}>📍 {placing ? 'Tap the map…' : 'Tap the map'}</button>
              </span></label>
              <label className="field wide"><span>Notes</span><textarea rows={2} value={spot.notes} onChange={(e) => setSpot({ notes: e.target.value })} placeholder="Roof access, power, trees that will grow, other antennas…" /></label>
            </div>
            <p className="small muted">Position {spot.posSrc === 'photo' ? "from the photos' GPS" : spot.posSrc === 'gps' ? 'from your GPS' : spot.posSrc === 'map' ? 'picked on the map' : spot.posSrc === 'typed' ? 'typed in' : 'at Site A (not set yet)'}. <button className="ghost" onClick={delSpot}>🗑 Delete this spot</button></p>
            <MapView sites={p.sites} txId={p.radio.txSiteId} height={300} center={{ lat: spot.lat, lon: spot.lon, zoom: 14 }}
              onClick={(lat, lon) => { if (!placing) return; setSpot({ lat, lon, posSrc: 'map' }); setPlacing(false); setMsg('Spot moved to where you tapped.'); }} />
          </Card>
          <Card title="What is in view from here" tip="Distance and direction to each project site and nearby tower, how far up or down it is, and whether the terrain hides it. Hidden means a ridge between here and there is higher than the line of sight (trees and buildings are not included).">
            {targets.length === 0 ? <p className="small muted">No sites or towers nearby yet. Add sites on Site Data & GPS, or turn on Existing towers.</p> :
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Distance</th><th>Azimuth</th><th>Up / down</th><th>From here</th></tr></thead>
                <tbody>{targets.filter((t) => (t.kindKey === 'tower' ? layers.towers : t.kindKey === 'rr' ? layers.rr : true)).slice(0, 40).map((t, i) => <tr key={i} className={t.visible === false ? 'bad-row' : ''}>
                  <td>{t.kindKey === 'tower' ? '📡' : t.kindKey === 'rr' ? '📻' : t.kindKey === 'tx' ? '🔴' : '📍'} {t.name}</td><td>{u.f(t.km)}</td><td>{fmtAz(t.az, dec, 0)}</td><td>{fmt(t.el, 1)}°</td>
                  <td>{t.visible == null ? '—' : t.visible ? '✓ in view' : <>✗ hidden{t.blockKm != null ? ` (ridge ${u.f(t.blockKm)} away)` : ''}</>}</td></tr>)}</tbody></table></div>}
          </Card>
        </div>
        {spot.photos.length > 0 && <Card title={`Photos at this spot (${spot.photos.length})`} tip="Each photo's direction (degrees true), tilt and width of view. If the panorama does not line up, nudge the direction with ◀ ▶ until the yellow horizon sits on the ridges, or press Match to terrain.">
          {spot.photos.map((ph, i) => <PhotoRow key={ph.id} ph={ph} i={i} dec={dec} onChange={(f) => setPhoto(ph.id, f)}
            onMatch={async () => { setBusy('Matching to the terrain…'); const r = await matchOne(ph, true); setBusy(''); if (r) { setPhoto(ph.id, r); setMsg(`Photo ${i + 1} now faces ${fmtAz(r.headingDeg!, dec, 0)}.`); } else setMsg('No clear skyline in this photo to match. Nudge it by hand with ◀ ▶.'); }}
            onDelete={async () => { if (await askConfirm({ title: 'Delete photo?', message: `Delete photo ${i + 1} from ${spot.name}?`, ok: 'Delete', danger: true })) setSpot((s) => ({ ...s, photos: s.photos.filter((q) => q.id !== ph.id) })); }} />)}
          <p className="small muted">Phones save GPS and usually the compass direction in each photo. Some phones and apps remove the location when sharing; then use “Take photos here” in the app, or set the spot by hand. The tilt is usually not saved: 0° means the camera was level.</p>
        </Card>}
        {spot.snapshot && <Card title="Saved for reports"><img src={spot.snapshot} alt="Saved panorama" style={{ width: '100%', borderRadius: 6 }} /><p className="small muted">Saved {new Date(spot.snapshotAt!).toLocaleString()}. Press “Save picture for reports” again after changes.</p></Card>}
      </>}
      <p className="small muted">The horizon and “hidden” use terrain heights and the earth's curve (k = {p.radio.kFactor.toFixed(2)}); trees and buildings are not in the terrain, so the real skyline can be higher. Satellite pictures are only as new as the last download. Always confirm on site.</p>
    </div>
  );
}

/** For the report: each spot's saved picture and what is in view. */
export function PhotoSurveyReport({ spots, fmtDist }: { spots: PhotoSpot[]; fmtDist: (km: number) => string }) {
  if (!spots.length) return <p>No photo survey spots. Add them on Photo Site Survey.</p>;
  return <>{spots.map((s) => {
    const dec = declinationDeg(s);
    return <div key={s.id} className="rpt-note">
      <h4>{s.name} <small>· {s.lat.toFixed(6)}, {s.lon.toFixed(6)} · camera {fmt(s.eyeM, 1)} m above ground · {s.photos.length} photo(s)</small></h4>
      {s.snapshot ? <img src={s.snapshot} alt={`Panorama at ${s.name}`} style={{ width: '100%' }} /> : <div className="rpt-photos">{s.photos.slice(0, 6).map((ph) => <figure key={ph.id}><img src={ph.dataUrl} alt={ph.caption || ph.name} /><figcaption>{ph.caption || ph.name}{ph.headingDeg != null ? ` · faces ${fmtAz(ph.headingDeg, dec, 0)}` : ''}</figcaption></figure>)}</div>}
      {s.notes && <p style={{ whiteSpace: 'pre-wrap' }}>{s.notes}</p>}
      {(s.inView?.length ?? 0) > 0 && <table className="rpt-tbl"><thead><tr><th>Site / tower</th><th>Distance</th><th>Azimuth</th><th>Up / down</th><th>From this spot</th></tr></thead>
        <tbody>{s.inView!.slice(0, 30).map((t, i) => <tr key={i}><td>{t.name}</td><td>{fmtDist(t.km)}</td><td>{fmtAz(t.az, dec, 0)}</td><td>{fmt(t.el, 1)}°</td><td>{t.visible == null ? '—' : t.visible ? 'In view' : `Hidden by terrain${t.blockKm != null ? ` (ridge ${fmtDist(t.blockKm)} away)` : ''}`}</td></tr>)}</tbody></table>}
    </div>;
  })}<p className="small">Horizon and visibility from terrain heights with earth curvature; trees and buildings are not included. Confirm on site.</p></>;
}
