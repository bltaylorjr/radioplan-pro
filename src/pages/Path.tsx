import React, { useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Stat, fmt, Tip } from '../components/ui';
import { ProfileChart } from '../components/ProfileChart';
import { buildProfile, analyzeProfile, sampleDem, fetchElevations, ProfilePoint } from '../engine/terrain';
import { designLink } from '../engine/design';
import { fsplDb, receivedPowerDbm, radioHorizonKm, losDistanceKm, fresnelRadiusM } from '../engine/rf';
import { interpolate, haversineKm } from '../engine/geo';

export function PathPage() {
  const { project: p, update, rt, setRt } = useStore();
  const r = p.radio, L = designLink(p);
  const [prof, setProf] = useState<ProfilePoint[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const tx = L.tx, rx = L.rx;
  const run = async () => {
    if (!tx || !rx || tx === rx) { setMsg('Choose two different sites.'); return; }
    setBusy(true); setMsg('');
    try {
      const n = 120;
      let pts: ProfilePoint[];
      if (rt.dem && sampleDem(rt.dem, tx) != null && sampleDem(rt.dem, rx) != null) { pts = buildProfile(tx, rx, n, (q) => sampleDem(rt.dem!, q)); setMsg(`Profile from ${rt.dem.source}.`); }
      else {
        const ll = Array.from({ length: n + 1 }, (_, i) => interpolate(tx, rx, i / n));
        const z = await fetchElevations(ll);
        const D = haversineKm(tx, rx);
        pts = ll.map((q, i) => ({ ...q, dKm: (D * i) / n, groundM: z[i] }));
        setMsg('Profile from online Copernicus GLO-90 DEM (bare earth: set clutter height for trees/buildings).');
      }
      setProf(pts);
      setRt((x) => ({ ...x, profile: analyzeProfile(pts, tx.antennaAglM, rx.antennaAglM, r.fMHz, r.kFactor, r.clutterM) }));
    } catch (e) { setMsg(`Could not build profile: ${(e as Error).message}. Load a DEM on Map & Terrain to work offline.`); }
    setBusy(false);
  };
  const a = prof && tx && rx ? analyzeProfile(prof, tx.antennaAglM, rx.antennaAglM, r.fMHz, r.kFactor, r.clutterM) : rt.profile;
  const D = L.pathKm;
  const fs = fsplDb(r.fMHz, Math.max(D, 0.01));
  const total = fs + (a && !a.meets60 ? a.diffractionLossDb : 0);
  const rxLvl = receivedPowerDbm(L.eirpDbm, total, L.rxAnt?.gainDbi ?? 0, r.rxFeederLossDb);
  return (
    <div className="stack">
      <Card title="Path settings" tour="path-controls">
        <div className="form">
          <Field label="From (TX)"><Sel value={r.txSiteId} onChange={(v) => update((d) => { d.radio.txSiteId = v; })} options={p.sites.map((s) => [s.id, s.name] as [string, string])} /></Field>
          <Field label="To (RX)"><Sel value={r.rxSiteId} onChange={(v) => update((d) => { d.radio.rxSiteId = v; })} options={p.sites.map((s) => [s.id, s.name] as [string, string])} /></Field>
          <Field label="k-factor" tip="4/3 = standard atmosphere. Check 2/3 for worst-case sub-refraction on microwave links."><Sel value={String(+r.kFactor.toFixed(3))} onChange={(v) => update((d) => { d.radio.kFactor = parseFloat(v); })} options={[['1.333', '4/3 (standard)'], ['0.667', '2/3 (sub-refraction)'], ['1', '1 (true earth)'], ['100', '∞ (flat)']]} /></Field>
          <Field label="Clutter height" tip="Trees/buildings added to bare-earth terrain. Use 0 with a LiDAR DSM."><Num value={r.clutterM} onChange={(v) => update((d) => { d.radio.clutterM = v!; })} unit="m" /></Field>
          <Field label="RX antenna"><span className="muted">{L.rxAnt ? `${L.rxAnt.brand} ${L.rxAnt.model} (${L.rxAnt.gainDbi} dBi)` : '—'}</span></Field>
        </div>
        <div className="row"><button className="primary" disabled={busy} onClick={run}>{busy ? 'Computing…' : '⛰ Compute path profile'}</button>{msg && <span className="muted small">{msg}</span>}</div>
      </Card>
      <Card title="Path profile" tour="path-chart" tip="Terrain includes earth bulge for the selected k-factor.">
        {a ? <ProfileChart a={a} /> : <p className="muted">Click <b>Compute path profile</b>. Smooth-earth values are shown below meanwhile.</p>}
        <div className="legend"><span className="lg ground" />Terrain + bulge + clutter <span className="lg bare" />Bare earth <span className="lg los" />Line of sight <span className="lg fresnel" />1st Fresnel zone <span className="lg f60" />60% F1</div>
      </Card>
      <Card title="Results" tour="path-results">
        <div className="stats">
          <Stat label="Path length" value={fmt(D, 2)} unit=" km" />
          <Stat label="Radio horizon TX / RX" value={`${fmt(radioHorizonKm(tx?.antennaAglM ?? 0, r.kFactor), 1)} / ${fmt(radioHorizonKm(rx?.antennaAglM ?? 0, r.kFactor), 1)}`} unit=" km" />
          <Stat label="Smooth-earth LOS limit" value={fmt(losDistanceKm(tx?.antennaAglM ?? 0, rx?.antennaAglM ?? 0, r.kFactor), 1)} unit=" km" tone={D <= losDistanceKm(tx?.antennaAglM ?? 0, rx?.antennaAglM ?? 0, r.kFactor) ? 'ok' : 'bad'} />
          <Stat label="F1 radius at midpoint" value={fmt(fresnelRadiusM(D / 2, D / 2, r.fMHz), 1)} unit=" m" tip="r = √(λ d1 d2 / d)" />
          {a && <Stat label="Minimum F1 clearance" value={fmt(a.minClearancePct, 0)} unit=" %" tone={a.meets60 ? 'ok' : a.los ? 'warn' : 'bad'} tip="≥ 60% required by engineering practice" />}
          {a && <Stat label="Line of sight" value={a.los ? 'Clear' : 'Obstructed'} tone={a.los ? 'ok' : 'bad'} />}
          {a && <Stat label="Diffraction loss (knife-edge)" value={fmt(a.meets60 ? 0 : a.diffractionLossDb)} unit=" dB" tip="ITU-R P.526 single knife-edge at the worst obstacle" />}
          <Stat label="Free-space loss" value={fmt(fs)} unit=" dB" />
          <Stat label="Predicted RX level" value={fmt(rxLvl)} unit=" dBm" tone={rxLvl - r.rxSensitivityDbm > 20 ? 'ok' : rxLvl > r.rxSensitivityDbm ? 'warn' : 'bad'} />
          <Stat label="Fade margin vs sensitivity" value={fmt(rxLvl - r.rxSensitivityDbm)} unit=" dB" tip="Point-to-point margin above receiver sensitivity" />
        </div>
        {a && !a.meets60 && <div className="warnbox">Fresnel clearance below 60%. Raise the antenna at the end nearest the obstruction (worst point at {fmt(a.points[a.worstIndex].dKm, 2)} km) or relocate the site. <Tip topic="path" /></div>}
      </Card>
    </div>
  );
}
