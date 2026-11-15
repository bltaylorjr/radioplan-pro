// The antenna beam seen from the side: the ground along the antenna's azimuth, and where the main beam and its
// -3 dB edges come down on that ground (real terrain and earth curve), for the Tilt, Azimuth & Power side view.
import { destination, type LatLon } from './geo';
import { sampleDem, type DemGrid } from './terrain';
import { EARTH_RADIUS_KM } from './rf';

export interface BeamSample extends LatLon { dKm: number; groundM: number; /** ground height minus the earth-curve drop seen from the antenna */ plotM: number }
export interface BeamRay { angleDeg: number; hitKm: number | null; hitM: number | null }
export interface BeamProfile {
  samples: BeamSample[]; antennaM: number; groundAtTowerM: number;
  main: BeamRay; upper: BeamRay; lower: BeamRay;
}

/** Earth-curve drop (m) at `dKm` for an effective earth radius factor k. */
export const curveDropM = (dKm: number, k = 4 / 3) => ((dKm * 1000) ** 2) / (2 * k * EARTH_RADIUS_KM * 1000);

/** Ground along `azimuthDeg` from the antenna out to `maxKm` (n samples). Flat ground at `fallbackGroundM` without terrain. */
export function beamGround(dem: DemGrid | null, at: LatLon, azimuthDeg: number, maxKm: number, n = 300, k = 4 / 3, fallbackGroundM = 0): BeamSample[] {
  const out: BeamSample[] = [];
  let last = (dem && sampleDem(dem, at)) ?? fallbackGroundM;
  for (let i = 0; i <= n; i++) {
    const dKm = (maxKm * i) / n, q = i ? destination(at, azimuthDeg, dKm) : at;
    const g = dem ? sampleDem(dem, q) : null; if (g != null) last = g;
    out.push({ lat: q.lat, lon: q.lon, dKm, groundM: last, plotM: last - curveDropM(dKm, k) });
  }
  return out;
}

/** First spot where a ray leaving the antenna `downDeg` below level meets the ground (null if it never does). */
export function rayHit(samples: BeamSample[], antennaM: number, downDeg: number): BeamRay {
  const t = Math.tan((downDeg * Math.PI) / 180);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const ra = antennaM - a.dKm * 1000 * t, rb = antennaM - b.dKm * 1000 * t;
    if (rb <= b.plotM) { // crossed between a and b
      const fa = ra - a.plotM, fb = rb - b.plotM, f = fa === fb ? 1 : Math.max(0, Math.min(1, fa / (fa - fb)));
      const dKm = a.dKm + (b.dKm - a.dKm) * f;
      return { angleDeg: downDeg, hitKm: dKm, hitM: antennaM - dKm * 1000 * t };
    }
  }
  return { angleDeg: downDeg, hitKm: null, hitM: null };
}

/** Side view of the beam: total downtilt `tiltDeg` (positive = down) and vertical beamwidth `vBwDeg`. */
export function beamProfile(dem: DemGrid | null, at: LatLon, o: { azimuthDeg: number; tiltDeg: number; vBwDeg: number; aglM: number; maxKm: number; k?: number; groundM?: number; n?: number }): BeamProfile {
  const samples = beamGround(dem, at, o.azimuthDeg, o.maxKm, o.n ?? 300, o.k, o.groundM ?? 0);
  const g0 = samples[0].groundM, antennaM = g0 + o.aglM;
  return {
    samples, antennaM, groundAtTowerM: g0,
    main: rayHit(samples, antennaM, o.tiltDeg),
    upper: rayHit(samples, antennaM, o.tiltDeg - o.vBwDeg / 2),
    lower: rayHit(samples, antennaM, o.tiltDeg + o.vBwDeg / 2),
  };
}

/** A round number near `x` (1, 2 or 5 times a power of ten) for scale bars. */
export function niceLen(x: number): number {
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x)), m = x / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}
