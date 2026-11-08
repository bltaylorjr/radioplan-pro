import React, { useState } from 'react';
import { useStore } from '../store';
import { AddressInput } from './AddressInput';
import { applyAddress } from '../compliance/place';
import { geocodeAddress, withCounty, GeoResult } from '../engine/geocode';
import { SYSTEMS } from '../data/systems';
import { applySystems } from './SystemsUI';

/** The page that opens after the address, by main system type. Others open the system toolkit. */
const START_PAGE: Record<string, string> = { firealarm: 'alarm', erces: 'erces', solar: 'solar', radio: 'locate', wifi: 'wifi', das: 'indoor' };

/** First start: one question (where is the site?) and the app does the rest. */
export function Welcome({ onClose, onHelp }: { onClose: () => void; onHelp: () => void }) {
  const { setRt, go, update, project } = useStore();
  const [q, setQ] = useState('');
  const [company, setCompany] = useState(project.company.name);
  const [job, setJob] = useState(project.meta.projectType ?? 'firealarm');
  const [subs, setSubs] = useState<string[]>(project.meta.subSystems ?? []);
  const [busy, setBusy] = useState(false);
  const start = async (label: string, g?: GeoResult) => {
    const page = START_PAGE[job] ?? 'systems';
    if (page === 'locate') {
      update((d) => { if (company.trim()) d.company.name = company.trim(); applySystems(d, job, subs); });
      setRt((r) => ({ ...r, query: label, locate: g ?? null })); go('locate'); onClose(); return;
    }
    setBusy(true);
    let loc = g; if (!loc) { try { loc = (await geocodeAddress(label))[0]; } catch { /* offline and unknown: keep the text */ } }
    if (loc) withCounty(loc);
    update((d) => {
      if (company.trim()) d.company.name = company.trim();
      if (loc) applyAddress(d, loc); else d.meta.siteAddress = label;
      if (loc && d.sites[0]) { d.sites[0].lat = loc.lat; d.sites[0].lon = loc.lon; d.sites[0].address = loc.label; d.sites[0].groundElevM = null; }
      applySystems(d, job, subs);
    });
    setBusy(false); go(page); onClose();
  };
  return (
    <div className="welcome-back" role="dialog" aria-modal="true" aria-labelledby="welcome-h">
      <div className="welcome">
        <h2 id="welcome-h">Welcome to LvPlan Pro</h2>
        <p>Everything is installed and works without internet. Your work saves by itself.</p>
        <label className="big-label">Your company name (optional)
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Taylor Communications" />
        </label>
        <label className="big-label">What type of project is it?
          <select value={job} onChange={(e) => { setJob(e.target.value); setSubs(subs.filter((x) => x !== e.target.value)); }} aria-label="Project type">{SYSTEMS.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.label}</option>)}</select>
        </label>
        <details className="big-label"><summary>Other systems on the same job (optional){subs.length ? `: ${subs.length} picked` : ''}</summary>
          <div className="subsys">{SYSTEMS.filter((x) => x.id !== job).map((x) => <label key={x.id} className="check"><input type="checkbox" checked={subs.includes(x.id)} onChange={(e) => setSubs(e.target.checked ? [...subs, x.id] : subs.filter((y) => y !== x.id))} /> {x.icon} {x.label}</label>)}</div>
        </details>
        <label className="big-label">Where is the job site? Type an address, town or ZIP code
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) start(q.trim()); }}>
            <AddressInput value={q} onChange={setQ} onPick={(g) => start(g.label, g)} placeholder="e.g. 60 Court Plaza, Asheville NC" ariaLabel="Site address" />
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
