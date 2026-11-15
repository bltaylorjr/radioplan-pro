import React from 'react';
import { useRrJob } from '../engine/rrjob';

/** Header chip for a RadioReference download in progress (kept small so the app starts without the whole page). */
export function RrJobBadge({ onOpen }: { onOpen: () => void }) {
  const job = useRrJob();
  if (!job) return null;
  const pct = Math.round(job.frac * 100);
  const label = job.running ? `⬇ RadioRef ${pct}%` : job.result ? '✓ RadioRef saved' : '⚠ RadioRef stopped';
  return <button className={'chip rr-chip' + (job.running ? ' running' : job.result ? ' on' : ' off')} onClick={onOpen} title={job.running ? `${job.text} (tap to see the download)` : 'Open RadioReference Frequencies'}
    style={job.running ? { background: `linear-gradient(90deg, rgba(80,160,255,.35) ${pct}%, transparent ${pct}%)` } : undefined}>{label}</button>;
}
