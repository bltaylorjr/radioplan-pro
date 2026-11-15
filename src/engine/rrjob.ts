// One RadioReference download at a time, kept outside the page so it keeps going (and stays visible in the
// top bar) when you open another page. The page and the top-bar badge both follow it.
import { useEffect, useState } from 'react';
import { downloadCounty, countFreqs, RrDownload, RrLogin, DlProgress, DlOptions } from './radioref';

export interface RrJob {
  state: string; county: string; startedAt: number;
  running: boolean; text: string; frac: number; p: DlProgress | null;
  result?: RrDownload; error?: unknown; finishedAt?: number;
}
let job: RrJob | null = null;
const signal = { cancelled: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const currentJob = () => job;
export function useRrJob(): RrJob | null {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return job;
}
export function stopJob() { signal.cancelled = true; }
export function clearJob() { if (job && !job.running) { job = null; emit(); } }

export async function startJob(state: string, county: string, login: RrLogin, o: Pick<DlOptions, 'trunked' | 'statewide'>): Promise<RrJob> {
  if (job?.running) return job;
  signal.cancelled = false;
  job = { state, county, startedAt: Date.now(), running: true, text: 'Connecting to RadioReference…', frac: 0, p: null };
  emit();
  try {
    const got = await downloadCounty(state, county, login, { ...o, signal, progress: (text, frac, p) => { job = { ...job!, text, frac, p }; emit(); } });
    job = { ...job!, running: false, frac: 1, text: 'Done', result: got, finishedAt: Date.now() };
  } catch (e) {
    job = { ...job!, running: false, error: e, finishedAt: Date.now() };
  }
  emit();
  return job!;
}

/** "about 2 min left" from the fraction done and the time so far (null until there is enough to go on). */
export function timeLeft(j: RrJob, now = Date.now()): string | null {
  const t = (now - j.startedAt) / 1000;
  if (!j.running || j.frac < 0.08 || t < 4) return null;
  const left = t * (1 - j.frac) / j.frac;
  if (left < 10) return 'a few seconds left';
  if (left < 90) return `about ${Math.round(left / 10) * 10} s left`;
  return `about ${Math.round(left / 60)} min left`;
}
export const elapsed = (j: RrJob, now = Date.now()) => { const s = Math.round(((j.finishedAt ?? now) - j.startedAt) / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };
export const STAGES: [DlProgress['stage'], string][] = [['start', 'Find county'], ['agencies', 'Agencies'], ['frequencies', 'Frequencies'], ['trunked', 'Trunked systems'], ['saving', 'Save']];
export const summary = (d: RrDownload) => `${countFreqs(d)} frequencies, ${d.systems.length} trunked systems, ${d.systems.reduce((a, s) => a + s.sites.length, 0)} sites and ${d.systems.reduce((a, s) => a + s.talkgroups.length, 0)} talkgroups`;
