// Uses a saved RadioReference list in design and calculations: which bands a BDA / DAS must pass, the worst-case
// (highest) frequency for indoor loss, nearby trunked donor sites with an estimated donor signal, and a frequency picker.
import type { RrDownload, RrFreq } from './radioref';
import { publicSafetyFreqs } from './radioref';
import { haversineKm, bearingDeg, LatLon } from './geo';
import { empiricalPathLoss, fsplDb } from './rf';

export interface PsBand { id: string; label: string; dl: [number, number]; ul?: [number, number] }
/** Public-safety land-mobile bands (downlink = what the building receives from the tower). */
export const PS_BANDS: PsBand[] = [
  { id: 'vhf-lo', label: 'VHF low band (30–50 MHz)', dl: [30, 50] },
  { id: 'vhf', label: 'VHF high band (136–174 MHz)', dl: [136, 174] },
  { id: 'uhf-fed', label: 'UHF federal (380–406 MHz)', dl: [380, 406] },
  { id: 'uhf', label: 'UHF (406–512 MHz incl. T-band)', dl: [406, 512] },
  { id: '700', label: '700 MHz public safety', dl: [758, 775], ul: [788, 805] },
  { id: '800', label: '800 MHz public safety / NPSPAC', dl: [851, 869], ul: [806, 824] },
  { id: '900', label: '900 MHz', dl: [935, 941], ul: [896, 902] },
];
export const bandOf = (fMHz: number) => PS_BANDS.find((b) => (fMHz >= b.dl[0] && fMHz <= b.dl[1]) || (b.ul && fMHz >= b.ul[0] && fMHz <= b.ul[1]));

export interface BandUse { band: PsBand; channels: number; lowMHz: number; highMHz: number; trunked: number; encrypted: number }
/** Bands the public-safety channels and trunked control/voice channels in a county use. */
export function bandsInUse(d: RrDownload, onlyPublicSafety = true): BandUse[] {
  const fs: { f: number; trunk: boolean; enc: boolean }[] = [];
  for (const x of onlyPublicSafety ? publicSafetyFreqs(d) : d.groups.flatMap((g) => g.subcats.flatMap((s) => s.freqs))) if (x.out) fs.push({ f: x.out, trunk: false, enc: x.enc > 0 });
  for (const s of d.systems) for (const site of s.sites) for (const f of site.freqs) fs.push({ f: f.freq, trunk: true, enc: false });
  const out = new Map<string, BandUse>();
  for (const x of fs) {
    const b = bandOf(x.f); if (!b) continue;
    const u = out.get(b.id) ?? { band: b, channels: 0, lowMHz: x.f, highMHz: x.f, trunked: 0, encrypted: 0 };
    u.channels++; u.lowMHz = Math.min(u.lowMHz, x.f); u.highMHz = Math.max(u.highMHz, x.f); if (x.trunk) u.trunked++; if (x.enc) u.encrypted++;
    out.set(b.id, u);
  }
  return PS_BANDS.map((b) => out.get(b.id)).filter((x): x is BandUse => !!x);
}
/** Highest downlink frequency to pass: the worst case for building and cable loss. */
export const worstCaseMHz = (u: BandUse[]) => (u.length ? Math.max(...u.map((x) => x.highMHz)) : null);
/** FCC 90.219 classes: Class A (channelized, narrow passbands) vs Class B (wideband). */
export function bdaAdvice(u: BandUse[]): string[] {
  const out: string[] = [];
  if (!u.length) return out;
  out.push(`The BDA must pass ${u.length} band${u.length > 1 ? 's' : ''}: ${u.map((x) => x.band.label).join('; ')}.`);
  for (const x of u) {
    if (x.band.id === 'vhf' || x.band.id === 'uhf' || x.band.id === 'uhf-fed' || x.band.id === 'vhf-lo') out.push(`${x.band.label}: ${x.channels} channel(s), ${x.lowMHz.toFixed(4)}–${x.highMHz.toFixed(4)} MHz. Usually a Class A (channelized) BDA so only these channels are boosted.`);
    else out.push(`${x.band.label}: ${x.channels} channel(s)${x.trunked ? `, ${x.trunked} on trunked sites` : ''}. A Class B (band-selective) BDA is common; register it with the FCC and get licensee consent.`);
  }
  if (u.some((x) => x.encrypted)) out.push('Some channels are encrypted: the BDA still passes them, but you can only verify them with a radio that has the key (ask the agency).');
  return out;
}

export interface DonorSite { system: string; site: string; county: string; lat: number; lon: number; km: number; bearing: number; fMHz: number; estDbm: number }
/**
 * Nearby trunked sites as donor candidates, with an estimated signal at the donor antenna on the roof.
 * Assumes a typical public-safety site: 100 W ERP from a 60 m antenna (an estimate; always measure on site).
 */
export function donorSites(d: RrDownload, here: LatLon, donorAglM = 15, opts = { erpDbm: 50, hbM: 60, donorGainDbi: 10 }): DonorSite[] {
  const out: DonorSite[] = [];
  for (const s of d.systems) for (const site of s.sites) {
    if (site.lat == null || site.lon == null) continue;
    const km = haversineKm(here, { lat: site.lat, lon: site.lon });
    const f = site.freqs.length ? Math.max(...site.freqs.map((x) => x.freq)) : 851;
    const loss = Math.max(fsplDb(f, Math.max(km, 0.05)), empiricalPathLoss({ fMHz: f, hbM: opts.hbM, hmM: Math.min(10, Math.max(1, donorAglM)), dKm: Math.max(km, 1), env: 'suburban' }).lossDb);
    out.push({ system: s.name, site: [site.number, site.name].filter(Boolean).join(' '), county: site.county, lat: site.lat, lon: site.lon, km, bearing: bearingDeg(here, { lat: site.lat, lon: site.lon }), fMHz: f, estDbm: Math.round((opts.erpDbm + 2.15 - loss + opts.donorGainDbi) * 10) / 10 });
  }
  return out.sort((a, b) => a.km - b.km);
}

export interface FreqChoice { label: string; fMHz: number; group: string }
/** Every downloaded frequency, for the frequency pickers on the design pages. */
export function freqChoices(d: RrDownload): FreqChoice[] {
  const out: FreqChoice[] = [];
  const add = (f: RrFreq, group: string) => { if (f.out) out.push({ fMHz: f.out, group, label: `${f.out.toFixed(4)} MHz · ${f.alpha || f.descr || ''}`.trim() }); };
  for (const g of d.groups) for (const s of g.subcats) for (const f of s.freqs) add(f, `${g.kind === 'agency' ? g.name + ' · ' : ''}${s.name}`);
  for (const s of d.systems) for (const site of s.sites) {
    const seen = new Set<number>();
    for (const f of site.freqs) if (!seen.has(f.freq)) { seen.add(f.freq); out.push({ fMHz: f.freq, group: `${s.name} · site ${site.number} ${site.name}`.trim(), label: `${f.freq.toFixed(4)} MHz${/c|a/i.test(f.use) ? ' (control)' : ''}` }); }
  }
  return out;
}
