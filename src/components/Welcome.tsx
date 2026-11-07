import React, { useState } from 'react';
import { useStore } from '../store';
import { AddressInput } from './AddressInput';

/** First start: one question (where is the site?) and the app does the rest. */
export function Welcome({ onClose, onHelp }: { onClose: () => void; onHelp: () => void }) {
  const { setRt, go, update, project } = useStore();
  const [q, setQ] = useState('');
  const [company, setCompany] = useState(project.company.name);
  const start = (label: string, g?: { lat: number; lon: number; label: string; state?: string; county?: string }) => {
    if (company.trim()) update((d) => { d.company.name = company.trim(); });
    setRt((r) => ({ ...r, query: label, locate: g ?? null })); go('locate'); onClose();
  };
  return (
    <div className="welcome-back" role="dialog" aria-modal="true" aria-labelledby="welcome-h">
      <div className="welcome">
        <h2 id="welcome-h">Welcome to RadioPlan Pro</h2>
        <p>Everything is installed and works without internet. Your work saves by itself.</p>
        <label className="big-label">Your company name (optional)
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Taylor Communications" />
        </label>
        <label className="big-label">Where is the radio site? Type an address, town or ZIP code
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) start(q.trim()); }}>
            <AddressInput value={q} onChange={setQ} onPick={(g) => start(g.label, g)} placeholder="e.g. 600 E 4th St, Charlotte NC" ariaLabel="Site address" />
          </form>
        </label>
        <div className="row wrap">
          <button className="primary big" disabled={!q.trim()} onClick={() => start(q.trim())}>Plan this site →</button>
          <button className="big" onClick={() => { onClose(); onHelp(); }}>Show me how it works</button>
          <button className="big ghost" onClick={onClose}>Skip</button>
        </div>
      </div>
    </div>
  );
}
