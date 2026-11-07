// Builds coverage inputs from the project, and runs multi-site best-server, overlap and
// co-/adjacent-channel interference (C/I) analysis on one common grid.
import type { Project, Site, SiteTx } from '../types';
import type { DemGrid } from './terrain';
import { ANTENNAS, byId } from '../data/catalog';
import { designLink } from './design';
import { computeCoverage, boundsFor, CoverageInputs, CoverageResult, Bounds4 } from './coverage';

/** Coverage inputs for the project's primary transmitter. The map is the street-level reference:
 * body and building losses are applied per acceptance tier, not in the map. */
export function primaryCoverageInputs(p: Project, dem: DemGrid | null | undefined, gridN?: number): CoverageInputs | null {
  const r = p.radio, L = designLink(p);
  if (!L.tx) return null;
  return {
    site: L.tx, siteGroundM: L.tx.groundElevM ?? undefined, antennaAglM: L.tx.antennaAglM, fMHz: r.fMHz, eirpDbm: L.eirpDbm,
    rxGainDbi: r.rxAntGainDbi, rxLossDb: r.rxFeederLossDb, mobileHeightM: r.mobileHeightM, env: r.env, city: r.city,
    azimuthDeg: r.azimuthDeg, tiltDeg: r.mechTiltDeg + r.elecTiltDeg, hBwDeg: L.ant?.hBwDeg ?? 360, vBwDeg: L.ant?.vBwDeg ?? 10,
    radiusKm: r.coverageRadiusKm, gridN: gridN ?? r.coverageGridN, dem, k: r.kFactor, tune: p.propagation,
  };
}

/** Default transmitter settings for a site (copied from the primary radio design). */
export function defaultSiteTx(p: Project): SiteTx {
  const r = p.radio, L = designLink(p);
  return { enabled: true, fMHz: r.fMHz, txPowerDbm: r.txPowerDbm, antennaId: r.txAntennaId, azimuthDeg: r.azimuthDeg, tiltDeg: r.mechTiltDeg + r.elecTiltDeg,
    lossDb: Math.round((L.feederLoss + r.jumperLossDb + r.connectorLossDb) * 10) / 10, channel: 'CH1' };
}

export function siteEirpDbm(t: SiteTx): number {
  return t.txPowerDbm + (byId(ANTENNAS, t.antennaId)?.gainDbi ?? 0) - t.lossDb;
}

export function siteInputs(p: Project, s: Site, dem: DemGrid | null | undefined, bounds: Bounds4, gridN: number): CoverageInputs {
  const t = s.tx ?? defaultSiteTx(p), a = byId(ANTENNAS, t.antennaId), r = p.radio;
  return {
    site: s, siteGroundM: s.groundElevM ?? undefined, antennaAglM: s.antennaAglM, fMHz: t.fMHz, eirpDbm: siteEirpDbm(t),
    rxGainDbi: r.rxAntGainDbi, rxLossDb: r.rxFeederLossDb, mobileHeightM: r.mobileHeightM, env: r.env, city: r.city,
    azimuthDeg: t.azimuthDeg, tiltDeg: t.tiltDeg, hBwDeg: a?.hBwDeg ?? 360, vBwDeg: a?.vBwDeg ?? 10,
    radiusKm: r.coverageRadiusKm, gridN, dem, k: r.kFactor, tune: p.propagation, bounds,
  };
}

export function unionBounds(sites: Site[], radiusKm: number): Bounds4 {
  const bs = sites.map((s) => boundsFor(s, radiusKm));
  return { north: Math.max(...bs.map((b) => b.north)), south: Math.min(...bs.map((b) => b.south)), east: Math.max(...bs.map((b) => b.east)), west: Math.min(...bs.map((b) => b.west)) };
}

export interface NetworkResult {
  n: number; north: number; south: number; east: number; west: number; siteIds: string[];
  best: Float32Array; server: Int16Array; ci: Float32Array; overlap: Uint8Array;
  perSite: CoverageResult[];
  stats: { cells: number; servedPct: number; servedCleanPct: number; interferenceLimitedPct: number; overlapPct: number; perSiteBestPct: number[] };
}

const mw = (dbm: number) => Math.pow(10, dbm / 10);

/** Interference weight (dB below a co-channel signal) of a transmitter at fI against a server at fS. */
export function interferenceRejectionDb(fS: number, fI: number, bwKHz: number, acrDb: number): number | null {
  const dk = Math.abs(fS - fI) * 1000;
  if (dk < bwKHz / 2) return 0; // co-channel
  if (dk < bwKHz * 1.5) return acrDb; // adjacent channel
  return null; // not an interferer
}

export function computeNetwork(p: Project, dem: DemGrid | null | undefined, gridN = 60): NetworkResult | null {
  const sites = p.sites.filter((s) => s.tx?.enabled);
  if (!sites.length) return null;
  const b = unionBounds(sites, p.radio.coverageRadiusKm), n = gridN, N = n * n;
  const perSite = sites.map((s) => computeCoverage(siteInputs(p, s, dem, b, n)));
  const f = sites.map((s) => s.tx!.fMHz);
  const best = new Float32Array(N).fill(NaN), server = new Int16Array(N).fill(-1), ci = new Float32Array(N).fill(NaN), overlap = new Uint8Array(N);
  const thr = p.network.serviceDbm;
  let cells = 0, served = 0, clean = 0, limited = 0, ov = 0; const perBest = sites.map(() => 0);
  for (let i = 0; i < N; i++) {
    let bi = -1, bv = -Infinity, any = false;
    for (let k = 0; k < sites.length; k++) { const v = perSite[k].rssi[i]; if (Number.isNaN(v)) continue; any = true; if (v > bv) { bv = v; bi = k; } if (v >= thr) overlap[i]++; }
    if (!any) continue;
    cells++; best[i] = bv; server[i] = bi;
    let interf = 0;
    for (let k = 0; k < sites.length; k++) {
      if (k === bi) continue; const v = perSite[k].rssi[i]; if (Number.isNaN(v)) continue;
      const rej = interferenceRejectionDb(f[bi], f[k], p.network.channelBwKHz, p.network.acrDb);
      if (rej != null) interf += mw(v - rej);
    }
    ci[i] = interf > 0 ? bv - 10 * Math.log10(interf) : 99;
    if (bv >= thr) { served++; perBest[bi]++; if (ci[i] >= p.network.requiredCiDb) clean++; else limited++; }
    if (overlap[i] >= 2) ov++;
  }
  const pc = (x: number) => (cells ? (x / cells) * 100 : 0);
  return { n, ...b, siteIds: sites.map((s) => s.id), best, server, ci, overlap, perSite,
    stats: { cells, servedPct: pc(served), servedCleanPct: pc(clean), interferenceLimitedPct: pc(limited), overlapPct: pc(ov), perSiteBestPct: perBest.map(pc) } };
}
