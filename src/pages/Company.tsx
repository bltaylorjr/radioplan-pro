import React, { useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Txt, Sel, Badge } from '../components/ui';
import { geocodeAddress, GeoResult } from '../engine/geocode';
import { fetchElevations } from '../engine/terrain';
import { JURISDICTIONS } from '../compliance/jurisdictions';
import { JurisdictionInfo } from '../components/JurisdictionInfo';
import type { StateCode } from '../types';
import { uid } from '../defaults';

export function CompanyPage() {
  const { project: p, update, go } = useStore();
  const c = p.company, m = p.meta;
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [err, setErr] = useState('');
  const setC = (k: keyof typeof c) => (v: string) => update((d) => { (d.company as unknown as Record<string, string>)[k] = v; });
  const setM = (k: keyof typeof m) => (v: string) => update((d) => { (d.meta as unknown as Record<string, string>)[k] = v; });
  const fullAddr = [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ');
  const find = async () => {
    setBusy(true); setErr(''); setResults([]);
    try { const r = await geocodeAddress(fullAddr); setResults(r); if (!r.length) setErr('No match found. Check the address.'); }
    catch (e) { setErr(`Geocoding needs internet: ${(e as Error).message}`); }
    setBusy(false);
  };
  const useResult = async (r: GeoResult, asNew: boolean) => {
    let z: number | null = null;
    try { z = (await fetchElevations([r]))[0]; } catch { /* offline */ }
    update((d) => {
      if (asNew || !d.sites.length) {
        const id = uid();
        d.sites.push({ ...d.sites[0], id, name: `${c.name || 'Company'} address`, address: r.label, lat: r.lat, lon: r.lon, groundElevM: z, positionSource: 'Geocoded address', positionAccuracyM: 50 });
      } else {
        Object.assign(d.sites[0], { address: r.label, lat: r.lat, lon: r.lon, groundElevM: z, positionSource: 'Geocoded address', positionAccuracyM: 50 });
      }
    });
    go('terrain');
  };
  const onLogo = (f?: File) => { if (!f) return; const rd = new FileReader(); rd.onload = () => update((d) => { d.company.logoDataUrl = rd.result as string; }); rd.readAsDataURL(f); };
  const j = JURISDICTIONS[m.state];
  return (
    <div className="grid2">
      <Card title="Company" tour="company-form" tip="Printed on every report header.">
        <div className="form">
          <Field label="Company name"><Txt value={c.name} onChange={setC('name')} placeholder="e.g. Carolina Comm Engineering LLC" /></Field>
          <Field label="Title / department" tip="Your title or division, e.g. RF Engineering Manager."><Txt value={c.title} onChange={setC('title')} /></Field>
          <Field label="Street address" wide><Txt value={c.address} onChange={setC('address')} /></Field>
          <Field label="City"><Txt value={c.city} onChange={setC('city')} /></Field>
          <Field label="State"><Txt value={c.state} onChange={setC('state')} /></Field>
          <Field label="ZIP"><Txt value={c.zip} onChange={setC('zip')} /></Field>
          <Field label="Phone"><Txt value={c.phone} onChange={setC('phone')} /></Field>
          <Field label="Email"><Txt value={c.email} onChange={setC('email')} /></Field>
          <Field label="License # (contractor / PE firm)"><Txt value={c.license} onChange={setC('license')} /></Field>
          <Field label="Logo (report header)">
            <input type="file" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} />
            {c.logoDataUrl && <img src={c.logoDataUrl} alt="logo" className="logo-prev" />}
          </Field>
        </div>
        <div className="row" data-tour="company-geocode">
          <button className="primary" disabled={busy || !fullAddr} onClick={find}>{busy ? 'Searching…' : '📍 Find address → GPS'}</button>
          <span className="muted small">Links this address to GPS coordinates, the topographic map and terrain elevation.</span>
        </div>
        {err && <p className="bad-text">{err}</p>}
        {results.length > 0 && <ul className="results">{results.map((r, i) => (
          <li key={i}><div><b>{r.lat.toFixed(6)}, {r.lon.toFixed(6)}</b><br /><small>{r.label}</small></div>
            <span className="row"><button onClick={() => useResult(r, false)}>Use for Site A</button><button onClick={() => useResult(r, true)}>Add as new site</button></span></li>))}
        </ul>}
      </Card>
      <Card title="Project" tour="project-form">
        <div className="form">
          <Field label="Project name" wide><Txt value={m.name} onChange={setM('name')} /></Field>
          <Field label="Project number"><Txt value={m.number} onChange={setM('number')} /></Field>
          <Field label="Revision"><Txt value={m.revision} onChange={setM('revision')} /></Field>
          <Field label="Client"><Txt value={m.client} onChange={setM('client')} /></Field>
          <Field label="Engineer of record"><Txt value={m.engineer} onChange={setM('engineer')} /></Field>
          <Field label="PE license #"><Txt value={m.peLicense} onChange={setM('peLicense')} /></Field>
          <Field label="Project state (code set)" topic="compliance"><Sel<StateCode> value={m.state} onChange={(v) => update((d) => { d.meta.state = v; })} options={[['NC', 'North Carolina'], ['SC', 'South Carolina'], ['GA', 'Georgia'], ['TN', 'Tennessee']]} /></Field>
          <Field label="County / city"><Txt value={m.county} onChange={setM('county')} /></Field>
          <Field label="Date"><input type="date" value={m.created} onChange={(e) => setM('created')(e.target.value)} /></Field>
          <Field label="AHJ notes" wide tip="Local amendments, permit numbers, inspector contacts."><textarea value={m.jurisdictionNotes} onChange={(e) => setM('jurisdictionNotes')(e.target.value)} rows={3} /></Field>
        </div>
        <JurisdictionInfo j={j} />
      </Card>
    </div>
  );
}
