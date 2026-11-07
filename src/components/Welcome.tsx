import React, { useState } from 'react';
import { useStore } from '../store';
import { AddressInput } from './AddressInput';
import { applyAddress } from '../compliance/place';
import { geocodeAddress, withCounty, GeoResult } from '../engine/geocode';
import type { StateCode } from '../types';

/** What the person is designing decides where the app opens after the address. */
export const JOB_TYPES: { id: string; label: string; page: string }[] = [
  { id: 'alarm', label: '🔔 Fire alarm', page: 'alarm' },
  { id: 'erces', label: '📡 In-building radio (ERCES / BDA)', page: 'erces' },
  { id: 'wifi', label: '📶 Wi-Fi & network', page: 'wifi' },
  { id: 'solar', label: '☀️ Solar / DC power', page: 'solar' },
  { id: 'radio', label: '🗼 Radio tower / repeater', page: 'locate' },
];

/** First start: one question (where is the site?) and the app does the rest. */
export function Welcome({ onClose, onHelp }: { onClose: () => void; onHelp: () => void }) {
  const { setRt, go, update, project } = useStore();
  const [q, setQ] = useState('');
  const [company, setCompany] = useState(project.company.name);
  const [job, setJob] = useState('alarm');
  const [busy, setBusy] = useState(false);
  const start = async (label: string, g?: GeoResult) => {
    const jt = JOB_TYPES.find((j) => j.id === job)!;
    if (jt.page === 'locate') {
      if (company.trim()) update((d) => { d.company.name = company.trim(); });
      setRt((r) => ({ ...r, query: label, locate: g ?? null })); go('locate'); onClose(); return;
    }
    setBusy(true);
    let loc = g; if (!loc) { try { loc = (await geocodeAddress(label))[0]; } catch { /* offline and unknown: keep the text */ } }
    if (loc) withCounty(loc);
    update((d) => {
      if (company.trim()) d.company.name = company.trim();
      if (loc) applyAddress(d, loc); else d.meta.siteAddress = label;
      if (loc && d.sites[0]) { d.sites[0].lat = loc.lat; d.sites[0].lon = loc.lon; d.sites[0].address = loc.label; d.sites[0].groundElevM = null; }
      if (job === 'alarm') d.alarm.enabled = true;
      if (job === 'erces') d.erces.enabled = true;
      if (job === 'solar') d.solar.enabled = true;
    });
    setBusy(false); go(jt.page); onClose();
  };
  return (
    <div className="welcome-back" role="dialog" aria-modal="true" aria-labelledby="welcome-h">
      <div className="welcome">
        <h2 id="welcome-h">Welcome to RadioPlan Pro</h2>
        <p>Everything is installed and works without internet. Your work saves by itself.</p>
        <label className="big-label">Your company name (optional)
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Taylor Communications" />
        </label>
        <div className="big-label">What are you designing?
          <div className="chips" style={{ marginTop: 6 }}>{JOB_TYPES.map((j) => <button key={j.id} className={'chip-btn big-chip' + (job === j.id ? ' on' : '')} aria-pressed={job === j.id} onClick={() => setJob(j.id)}>{j.label}</button>)}</div>
        </div>
        <label className="big-label">Where is the job site? Type an address, town or ZIP code
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) start(q.trim()); }}>
            <AddressInput value={q} onChange={setQ} onPick={(g) => start(g.label, g)} placeholder="e.g. 600 E 4th St, Charlotte NC" ariaLabel="Site address" />
          </form>
        </label>
        <div className="row wrap">
          <button className="primary big" disabled={!q.trim() || busy} onClick={() => start(q.trim())}>{busy ? 'Finding the site…' : 'Start designing →'}</button>
          <button className="big" onClick={() => { onClose(); onHelp(); }}>Show me how it works</button>
          <button className="big ghost" onClick={onClose}>Skip</button>
        </div>
      </div>
    </div>
  );
}
