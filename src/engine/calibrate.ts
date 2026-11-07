// Field survey / drive-test integration: import measured points and calibrate the prediction model.
import type { SurveyPoint, PropagationTuning } from '../types';
import { parseCsv, findCol, num } from './csv';
import { haversineKm } from './geo';
import { CoverageInputs, predictPoint } from './coverage';

export function parseSurvey(text: string, fileName = ''): { points: SurveyPoint[]; skipped: number; rssiColumn: string } {
  const t = text.trim();
  if (t.startsWith('{') || /\.geojson$|\.json$/i.test(fileName)) {
    const j = JSON.parse(t); const feats = j.type === 'FeatureCollection' ? j.features : [j];
    const pts: SurveyPoint[] = []; let skipped = 0; let col = '';
    for (const f of feats) {
      const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : null; const pr = f.properties ?? {};
      const key = Object.keys(pr).find((k) => /^(rssi|rssidbm|signal|dbm|level|rsrp|rxlev|power)/i.test(k.replace(/[^a-z]/gi, '')));
      const v = key ? Number(pr[key]) : NaN;
      if (!c || !Number.isFinite(v)) { skipped++; continue; } col = key!;
      pts.push({ lon: c[0], lat: c[1], rssiDbm: v, t: pr.time ?? pr.timestamp });
    }
    return { points: pts, skipped, rssiColumn: col };
  }
  const rows = parseCsv(t); const h = rows[0] ?? [];
  const la = findCol(h, ['latitude', 'lat']), lo = findCol(h, ['longitude', 'lon', 'long', 'lng']);
  const rv = findCol(h, ['rssi_dbm', 'rssi', 'signal_dbm', 'signal', 'dbm', 'level', 'rxlev', 'rsrp', 'power', 'measured']);
  const tm = findCol(h, ['time', 'timestamp', 'datetime', 'date']);
  if (la < 0 || lo < 0 || rv < 0) throw new Error('Need latitude, longitude and RSSI (dBm) columns. Found: ' + h.join(', '));
  const points: SurveyPoint[] = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    const lat = num(r[la]), lon = num(r[lo]), v = num(r[rv]);
    if (lat == null || lon == null || v == null || Math.abs(lat) > 90 || Math.abs(lon) > 180 || v > 0) { skipped++; continue; }
    points.push({ lat, lon, rssiDbm: v, t: tm >= 0 ? r[tm] : undefined });
  }
  return { points, skipped, rssiColumn: h[rv] };
}

export interface CalStats { n: number; meanErr: number; rmsErr: number; sdErr: number }
const stats = (e: number[]): CalStats => {
  const n = e.length; if (!n) return { n: 0, meanErr: NaN, rmsErr: NaN, sdErr: NaN };
  const m = e.reduce((a, b) => a + b, 0) / n, rms = Math.sqrt(e.reduce((a, b) => a + b * b, 0) / n);
  const sd = Math.sqrt(e.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
  return { n, meanErr: m, rmsErr: rms, sdErr: sd };
};

export interface Calibration {
  before: CalStats; after: CalStats; fitSlope: boolean; tuning: PropagationTuning; used: number; excluded: number;
  residuals: { dKm: number; measured: number; predicted: number; err: number }[];
  bins: { fromKm: number; toKm: number; n: number; meanErr: number }[];
}

/** Least-squares fit of (measured − predicted) = a + b·log10(d km). Points below `floorDbm` (receiver noise) are excluded. */
export function calibrate(inp: CoverageInputs, pts: SurveyPoint[], current: PropagationTuning, opts: { fitSlope: boolean; floorDbm: number }): Calibration {
  const res: Calibration['residuals'] = []; let excluded = 0;
  for (const p of pts) {
    const pred = predictPoint({ ...inp, tune: current }, p);
    if (Number.isNaN(pred) || p.rssiDbm <= opts.floorDbm) { excluded++; continue; }
    res.push({ dKm: Math.max(haversineKm(inp.site, p), 0.05), measured: p.rssiDbm, predicted: pred, err: p.rssiDbm - pred });
  }
  const before = stats(res.map((r) => r.err));
  let a = before.meanErr || 0, b = 0;
  if (opts.fitSlope && res.length >= 10) {
    const x = res.map((r) => Math.log10(r.dKm)), y = res.map((r) => r.err), n = x.length;
    const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0);
    if (sxx > 0.01) { b = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / sxx; a = my - b * mx; }
  }
  const after = stats(res.map((r) => r.err - a - b * Math.log10(r.dKm)));
  const maxD = Math.max(1, ...res.map((r) => r.dKm)), edges = [0, 1, 2, 5, 10, 20, 50].filter((e) => e < maxD).concat([maxD + 0.001]);
  const bins = edges.slice(0, -1).map((f, i) => { const sel = res.filter((r) => r.dKm >= f && r.dKm < edges[i + 1]); return { fromKm: f, toKm: edges[i + 1], n: sel.length, meanErr: sel.length ? sel.reduce((s, r) => s + r.err, 0) / sel.length : NaN }; }).filter((b) => b.n);
  const tuning: PropagationTuning = { ...current, offsetDb: Math.round((current.offsetDb + a) * 10) / 10, slopeDbPerDecade: Math.round((current.slopeDbPerDecade + b) * 10) / 10,
    source: `Calibrated to ${res.length} field points (${new Date().toISOString().slice(0, 10)}): RMS ${before.rmsErr.toFixed(1)} → ${after.rmsErr.toFixed(1)} dB, σ ${after.sdErr.toFixed(1)} dB` };
  return { before, after, fitSlope: opts.fitSlope && b !== 0, tuning, used: res.length, excluded, residuals: res, bins };
}
