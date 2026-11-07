import React from 'react';
import { Badge } from './ui';
import type { Jurisdiction } from '../compliance/jurisdictions';

/** Adopted editions, effective dates, verification status and sources for one state. */
export function JurisdictionInfo({ j, compact }: { j: Jurisdiction; compact?: boolean }) {
  const ok = j.necStatus === 'verified';
  return (
    <div className="jur">
      <h4>{j.name}: NEC {j.necEdition}, effective {j.necEffective}{' '}
        <Badge kind={ok ? 'real' : 'placeholder'}>{ok ? `Verified on official state source ${j.checked}` : `UNCONFIRMED (checked ${j.checked})`}</Badge></h4>
      {!compact && <p className="small">{j.necNote}</p>}
      <ul><li><b>Electrical:</b> {j.electrical}</li><li><b>Building:</b> {j.building}</li><li><b>Fire:</b> {j.fire}</li>
        {!compact && <li><b>Authority:</b> {j.electricalAuthority}</li>}</ul>
      <p className="small">Sources: {j.sources.map((s, i) => <span key={s}>{i ? ' · ' : ''}<a href={s} target="_blank" rel="noreferrer">{new URL(s).hostname}</a></span>)}{' '}· <a href={j.verifyUrl} target="_blank" rel="noreferrer">Confirm current adoption ↗</a></p>
      <p className="small muted">Local jurisdictions may enforce other editions or amendments. State amendment text is not included. A licensed PE and the AHJ must confirm before permitting.</p>
    </div>
  );
}
