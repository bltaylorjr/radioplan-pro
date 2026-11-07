// Scenario runs: a flat, human-readable snapshot of every input that drives a coverage run,
// compact grid storage, and run-to-run / scenario-to-scenario comparison.
import type { Project, RunRecord, Scenario } from '../types';
import type { DemGrid } from './terrain';
import type { CoverageResult } from './coverage';
import { designLink } from './design';
import { resolveTiers, mapLevel, evaluateAcceptance, toRunResults } from './acceptance';
import { uid } from '../defaults';

export function snapshotInputs(p: Project, dem: DemGrid | null | undefined): Record<string, string | number> {
  const r = p.radio, L = designLink(p), t = p.propagation, tx = L.tx;
  const o: Record<string, string | number> = {
    'TX site': tx ? `${tx.name} (${tx.lat.toFixed(5)}, ${tx.lon.toFixed(5)})` : '—',
    'Antenna height (m AGL)': tx?.antennaAglM ?? 0, 'Ground elevation (m)': tx?.groundElevM ?? 'unknown',
    'Frequency (MHz)': r.fMHz, 'TX power (dBm)': r.txPowerDbm, 'Antenna': L.ant ? `${L.ant.brand} ${L.ant.model}` : r.txAntennaId,
    'Feeder': L.fd ? `${L.fd.brand} ${L.fd.model} ${r.feederLenM} m` : r.feederId, 'EIRP (dBm)': Math.round(L.eirpDbm * 10) / 10,
    'Azimuth (°T)': r.azimuthDeg, 'Downtilt (°)': r.mechTiltDeg + r.elecTiltDeg, 'Mobile height (m)': r.mobileHeightM,
    'RX antenna gain (dBi)': r.rxAntGainDbi, 'Environment': `${r.env} / ${r.city}`, 'k-factor': Math.round(r.kFactor * 1000) / 1000,
    'Analysis radius': `${r.coverageRadiusKm.toFixed(2)} km (${(r.coverageRadiusKm / 1.609344).toFixed(2)} mi)`, 'Grid (cells/side)': r.coverageGridN, 'Terrain': dem ? dem.source : 'smooth earth',
    'Model offset (dB)': t.offsetDb, 'Model slope (dB/decade)': t.slopeDbPerDecade, 'Diffraction factor': t.diffractionFactor, 'Clutter loss (dB)': t.clutterDb, 'Calibration': t.source,
  };
  for (const tier of resolveTiers(p)) o[`Criterion: ${tier.label}`] = `${tier.dbm} dBm + ${tier.extraLossDb} dB loss ≥ ${tier.requiredPct}%`;
  return o;
}

export function makeRunRecord(p: Project, dem: DemGrid | null | undefined, res: CoverageResult, label?: string): RunRecord {
  const ev = evaluateAcceptance(res, resolveTiers(p));
  return { id: uid(), at: new Date().toISOString(), label: label ?? `Run ${new Date().toLocaleTimeString()}`, inputs: snapshotInputs(p, dem), results: toRunResults(ev), meanDbm: Math.round(ev.meanDbm * 10) / 10, cells: ev.cells };
}

// Grid stored as Int16 half-dB steps, NaN = -32768, base64.
export function encodeGrid(res: CoverageResult): Scenario['grid'] {
  const a = new Int16Array(res.rssi.length);
  res.rssi.forEach((v, i) => { a[i] = Number.isNaN(v) ? -32768 : Math.max(-32767, Math.min(32767, Math.round(v * 2))); });
  const u = new Uint8Array(a.buffer); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return { n: res.n, north: res.north, south: res.south, east: res.east, west: res.west, b64: btoa(s) };
}
export function decodeGrid(g: Scenario['grid']): CoverageResult {
  const bin = atob(g.b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const a = new Int16Array(u.buffer), rssi = new Float32Array(a.length);
  a.forEach((v, i) => { rssi[i] = v === -32768 ? NaN : v / 2; });
  return { n: g.n, north: g.north, south: g.south, east: g.east, west: g.west, rssi };
}

export function makeScenario(p: Project, dem: DemGrid | null | undefined, res: CoverageResult, name: string, notes = ''): Scenario {
  const rec = makeRunRecord(p, dem, res, name), L = designLink(p);
  return { ...rec, notes, grid: encodeGrid(res), project: { radio: structuredClone(p.radio), propagation: structuredClone(p.propagation), tx: L.tx ? structuredClone(L.tx) : null } };
}

export interface InputDiff { key: string; a: string | number | undefined; b: string | number | undefined }
export function diffInputs(a: Record<string, string | number>, b: Record<string, string | number>): InputDiff[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.filter((k) => String(a[k]) !== String(b[k])).map((k) => ({ key: k, a: a[k], b: b[k] }));
}
export function diffResults(a: RunRecord, b: RunRecord) {
  return b.results.map((rb) => { const ra = a.results.find((x) => x.label === rb.label); return { label: rb.label, a: ra?.pct, b: rb.pct, delta: ra ? rb.pct - ra.pct : undefined, passA: ra?.pass, passB: rb.pass }; });
}

/** Cell-by-cell difference B − A (dB). Grids must match; otherwise B is resampled onto A by nearest cell. */
export function diffGrid(A: CoverageResult, B: CoverageResult): CoverageResult & { gained: number; lost: number } {
  const n = A.n, d = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const lat = A.north - ((r + 0.5) / n) * (A.north - A.south), lon = A.west + ((c + 0.5) / n) * (A.east - A.west);
    const rb = Math.floor(((B.north - lat) / (B.north - B.south)) * B.n), cb = Math.floor(((lon - B.west) / (B.east - B.west)) * B.n);
    const vb = rb >= 0 && rb < B.n && cb >= 0 && cb < B.n ? B.rssi[rb * B.n + cb] : NaN;
    d[r * n + c] = vb - A.rssi[r * n + c];
  }
  return { ...A, rssi: d, gained: 0, lost: 0 };
}
export function tierChange(A: CoverageResult, B: CoverageResult, level: number) {
  const D = diffGrid(A, B); let gained = 0, lost = 0, cells = 0;
  for (let i = 0; i < A.rssi.length; i++) { const a = A.rssi[i], b = a + D.rssi[i]; if (Number.isNaN(a) || Number.isNaN(b)) continue; cells++; if (a < level && b >= level) gained++; if (a >= level && b < level) lost++; }
  return { gainedPct: cells ? (gained / cells) * 100 : 0, lostPct: cells ? (lost / cells) * 100 : 0 };
}
export { mapLevel };
