import React from 'react';
import { useStore } from '../store';
import { siteEffects, siteKey, siteVars, USGS_FE_MEDIAN, USGS_SOIL_URL, type SiteEffect } from '../engine/siteConditions';

/** The site variables for a calculation: inputs with the included corrections, and the notes to show. */
export function useSiteEffects(calcId: string, x: Record<string, number>) {
  const { project: p } = useStore();
  const all = siteEffects(calcId, siteVars(p), x), off = new Set(p.siteVarsOff ?? []);
  const on = all.filter((e) => !off.has(siteKey(calcId, e.varId)));
  const adjusted = on.reduce((a, e) => (e.adjust ? { ...a, ...e.adjust } : a), x);
  return { all, on, off, adjusted };
}

/** Note under a calculation: each site variable, what it does here and its source, with Remove / Add back. */
export function SiteNotes({ calcId, effects }: { calcId: string; effects?: SiteEffect[] }) {
  const { project: p, update } = useStore();
  const list = effects ?? siteEffects(calcId, siteVars(p), {});
  if (!list.length) return null;
  const off = new Set(p.siteVarsOff ?? []);
  const toggle = (id: string, include: boolean) => update((d) => { const k = siteKey(calcId, id), s = new Set(d.siteVarsOff ?? []); if (include) s.delete(k); else s.add(k); d.siteVarsOff = [...s]; });
  return (
    <div className="site-notes" aria-label="Site conditions in this calculation">
      <b>📍 Site conditions</b>
      <ul>{list.map((e) => { const inc = !off.has(siteKey(calcId, e.varId));
        return <li key={e.varId} className={inc ? '' : 'removed'}>
          <span><b>{e.label}: {e.value}</b>{e.adjust && inc ? <span className="pill-mini">applied</span> : null}{!inc ? <span className="pill-mini off">removed</span> : null} {e.note} <span className="muted">({e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.source}</a> : e.source}{e.estimate ? '; estimate' : ''})</span></span>
          <button type="button" className="ghost small" onClick={() => toggle(e.varId, !inc)} title={inc ? 'Leave this variable out of the calculation' : 'Put this variable back into the calculation'}>{inc ? 'Remove' : 'Add back'}</button>
        </li>; })}</ul>
    </div>
  );
}

/** Calculators page: every site variable, where it came from, and the USGS soil iron value. */
export function SiteConditionsCard() {
  const { project: p, update } = useStore();
  const vars = siteVars(p);
  return (
    <section className="card calc site-card"><header><h3>📍 Site conditions at the project</h3></header>
      <p className="small muted">Known values for {p.sites[0]?.name || 'Site A'}. Calculations below show the ones that change their result or their readings, with Remove / Add back on each.</p>
      <table className="tbl"><tbody>{vars.map((v) => <tr key={v.id}><td>{v.label}</td><td><b>{v.text}</b></td><td className="small muted">{v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.source}</a> : v.source}{v.at ? `, ${v.at.slice(0, 10)}` : ''}</td></tr>)}</tbody></table>
      {!p.magnetic && <p className="small">Magnetic field values appear once Site A has a location.</p>}
      {!p.weather && <p className="small">Weather appears after the Weather & Radar page has downloaded the site forecast.</p>}
      <label className="field"><span className="field-label">Soil iron at the site, from the <a href={USGS_SOIL_URL} target="_blank" rel="noreferrer">USGS soil geochemistry portal</a> (wt %, C horizon)</span>
        <div className="row"><input type="number" step={0.01} min={0} max={60} placeholder={`${USGS_FE_MEDIAN} (US median)`} value={p.siteSoil?.fePct ?? ''} onChange={(e) => { const n = parseFloat(e.target.value); update((d) => { d.siteSoil = Number.isFinite(n) ? { fePct: n, source: 'USGS soil geochemistry (entered)' } : undefined; }); }} />
          {p.siteSoil && <button className="ghost" onClick={() => update((d) => { d.siteSoil = undefined; })}>Use US median</button>}</div></label>
      {(p.siteVarsOff?.length ?? 0) > 0 && <p className="small">{p.siteVarsOff!.length} variable{p.siteVarsOff!.length > 1 ? 's' : ''} removed from calculations. <button className="ghost" onClick={() => update((d) => { d.siteVarsOff = []; })}>Add all back</button></p>}
    </section>
  );
}
