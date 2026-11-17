// "✓ Verified <time>: …" or "⚠ Checked <time>: …" under live NOAA data (see engine/verify.ts).
import React from 'react';
import { checkLine, type DataCheck } from '../engine/verify';

export function CheckNote({ check, stale }: { check?: DataCheck | null; stale?: boolean }) {
  const l = checkLine(check);
  if (!l) return null;
  return <p className={`small check-note ${l.tone === 'ok' && !stale ? 'ok' : 'warn'}`} data-tour="data-check">{l.text}{stale ? ' This is the last good copy; it is not current.' : ''}</p>;
}
