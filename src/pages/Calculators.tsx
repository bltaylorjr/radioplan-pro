import React, { useState } from 'react';
import type { Project } from '../types';
import type { ApplyTarget } from '../engine/calcApply';
import { useCalcRegistry, useCalcValue, CalcResetCtx, ResetBtn, CalcActions } from '../components/CalcKit';
import { AzimuthCalc } from '../components/AzimuthCalc';
import { Num, Sel, fmt, useMeasure } from '../components/ui';
import { useUnits, DistNum } from '../units';
import * as K from '../engine/calcs';
import { fsplDb, fresnelRadiusM, radioHorizonKm, losDistanceKm, earthBulgeM, diffractionV, knifeEdgeLossDb, dbmToWatts, wattsToDbm, mpeComplianceDistanceM, mpeLimitMwCm2, cableLossPer100ft, empiricalPathLoss, mToFt, ftToM, Environment, CitySize } from '../engine/rf';
import { fmtDecl, declinationDeg, trueToMag, magToTrue, fmtDeg, compassPoint } from '../engine/azimuth';
import { parseLatLon } from '../engine/locparse';
import { AWG_SIZES, Awg, AMPACITY_75C_CU, sizeConductor } from '../engine/electrical';
import { FEEDERS } from '../data/catalog';
import { LV_CALCS } from '../data/lvcalcs';
import { LvCalcCard } from '../components/SystemsUI';
import { SoundTools, soundToolsMatch } from '../components/SoundTools';

/** One calculator card with its own ↺ Reset. `k` = extra search keywords. Calculators keep their own numbers: they
 * read the project only on "Use project values" and write it only on "Apply to fields", both by the user's choice. */
function Calc({ id, title, k, q, children, note, group, apply, applyWhat, fromProject, onReset }: {
  id: string; title: string; k: string; q: string; children: React.ReactNode; note?: string; group?: string;
  apply?: () => ApplyTarget[]; applyWhat?: string; fromProject?: (p: Project) => void; onReset?: () => void;
}) {
  const reset = React.useContext(CalcResetCtx);
  const hay = (title + ' ' + k + ' ' + (group ?? '')).toLowerCase();
  if (q && !q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return null;
  return <section className="card calc" data-calc={id}><header><h3>{title}</h3><ResetBtn onReset={onReset ?? (() => reset(id))} /></header>{children}{note && <p className="small muted">{note}</p>}
    <CalcActions apply={apply} applyWhat={applyWhat ?? `“${title}”`} fromProject={fromProject} /></section>;
}
const In = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span className="field-label">{label}</span>{children}</label>;
const Out = ({ label, v, u = '' }: { label: string; v: string | number; u?: string }) => { const m = useMeasure(u); if (typeof v === 'number' && m.k !== 1) { v = v * m.k; u = m.unit ?? u; } return <div className="calc-out"><span>{label}</span><b>{typeof v === 'number' ? (Number.isFinite(v) ? fmt(v, 2) : '—') : v}{u && <small> {u}</small>}</b></div>; };

function Group({ title, q, children }: { title: string; q: string; children: React.ReactNode }) {
  const kids = React.Children.toArray(children) as React.ReactElement<{ title: string; k: string }>[];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length && !kids.some((c) => words.every((w) => `${c.props.title} ${c.props.k} ${title}`.toLowerCase().includes(w)))) return null;
  return <><h2 className="calc-group">{title}</h2><div className="calc-grid">{kids.map((c) => React.cloneElement(c as React.ReactElement<{ group?: string }>, { group: title }))}</div></>;
}

/** Starting example frequency (MHz). Fixed, so the calculators do not change when the project does. */
const F0 = 460;
const K43 = 4 / 3;
const r1 = (v: number) => Math.round(v * 10) / 10;
const txSite = (p: Project) => p.sites.find((s) => s.id === p.radio.txSiteId) ?? p.sites[0];
/** A single-field apply target. */
const tgt = (id: string, label: string, page: string, path: (string | number)[], value: unknown, to: string, now: (p: Project) => string, on = true): ApplyTarget => ({ id, label, page, sets: [[path, value]], to, now, on });
const EQ = 'Equipment & Link Budget', OPT = 'Tilt, Azimuth & Power', COV = 'Coverage Prediction';

export function CalculatorsPage() {
  const u = useUnits();
  const [q, setQ] = useState('');
  const { reg, reset } = useCalcRegistry();
  const [azKey, setAzKey] = useState(0);
  const useN = <T,>(g: string, v: T) => useCalcValue<T>(reg, g, v);
  // levels
  const [dbm, setDbm] = useN<number | null>('dbmw', 30); const [watts, setWatts] = useN<number | null>('dbmw', 1);
  const [dbmU, setDbmU] = useN<number | null>('uv', -90); const [uv, setUv] = useN<number | null>('uv', K.dbmToUv(-90));
  const [eRx, setERx] = useN<number | null>('field', -90); const [eF, setEF] = useN<number | null>('field', F0); const [eG, setEG] = useN<number | null>('field', 0);
  const [eirpP, setEirpP] = useN<number | null>('eirp', 47); const [eirpG, setEirpG] = useN<number | null>('eirp', 6); const [eirpL, setEirpL] = useN<number | null>('eirp', 3);
  // antennas
  const [aF, setAF] = useN<number | null>('lambda', F0); const [aVf, setAVf] = useN<number | null>('lambda', 0.95);
  const [gd, setGd] = useN<number | null>('gain', 3); const [bwH, setBwH] = useN<number | null>('gain', 65); const [bwV, setBwV] = useN<number | null>('gain', 15); const [bwE, setBwE] = useN<number | null>('gain', 0.7);
  const [isoD, setIsoD] = useN<number | null>('iso', 10); const [isoF, setIsoF] = useN<number | null>('iso', F0); const [isoG1, setIsoG1] = useN<number | null>('iso', 0); const [isoG2, setIsoG2] = useN<number | null>('iso', 0);
  const [tH, setTH] = useN<number | null>('tilt', 45); const [tD, setTD] = useN<number | null>('tilt', 3); const [tK, setTK] = useN<number | null>('tilt', K43);
  // propagation
  const [pF, setPF] = useN<number | null>('fspl', F0); const [pD, setPD] = useN<number | null>('fspl', 10);
  const [frD1, setFrD1] = useN<number | null>('fresnel', 5); const [frD2, setFrD2] = useN<number | null>('fresnel', 5); const [frF, setFrF] = useN<number | null>('fresnel', F0); const [frK, setFrK] = useN<number | null>('fresnel', K43);
  const [hzH1, setHzH1] = useN<number | null>('horizon', 45); const [hzH2, setHzH2] = useN<number | null>('horizon', 1.5); const [hzK, setHzK] = useN<number | null>('horizon', K43);
  const [keH, setKeH] = useN<number | null>('knife', 10); const [keD1, setKeD1] = useN<number | null>('knife', 4); const [keD2, setKeD2] = useN<number | null>('knife', 6); const [keF, setKeF] = useN<number | null>('knife', F0);
  const [hF, setHF] = useN<number | null>('hata', F0); const [hHb, setHHb] = useN<number | null>('hata', 45); const [hHm, setHHm] = useN<number | null>('hata', 1.5); const [hD, setHD] = useN<number | null>('hata', 8); const [hEnv, setHEnv] = useN<Environment>('hata', 'suburban'); const [hCity, setHCity] = useN<CitySize>('hata', 'small-medium');
  const [lbP, setLbP] = useN<number | null>('linkbudget', 40); const [lbGt, setLbGt] = useN<number | null>('linkbudget', 6); const [lbLt, setLbLt] = useN<number | null>('linkbudget', 2); const [lbGr, setLbGr] = useN<number | null>('linkbudget', 6); const [lbLr, setLbLr] = useN<number | null>('linkbudget', 2); const [lbF, setLbF] = useN<number | null>('linkbudget', F0); const [lbD, setLbD] = useN<number | null>('linkbudget', 20); const [lbS, setLbS] = useN<number | null>('linkbudget', -110);
  // line
  const [vswr, setVswr] = useN<number | null>('vswr', 1.5); const [rl, setRl] = useN<number | null>('vswr', K.vswrCalc(1.5).returnLossDb);
  const [cbId, setCbId] = useN('coax', FEEDERS[0].id); const [cbF, setCbF] = useN<number | null>('coax', F0); const [cbL, setCbL] = useN<number | null>('coax', 150);
  // receivers
  const [nBw, setNBw] = useN<number | null>('noise', 12500); const [nNf, setNNf] = useN<number | null>('noise', 5); const [nSnr, setNSnr] = useN<number | null>('noise', 12);
  const [imTx, setImTx] = useN('intermod', '460.1000, 460.3000, 461.0250'); const [imRx, setImRx] = useN('intermod', '459.9000, 465.1000'); const [imTol, setImTol] = useN<number | null>('intermod', 6.25);
  const [mpeW, setMpeW] = useN<number | null>('mpe', 500); const [mpeF, setMpeF] = useN<number | null>('mpe', F0);
  // traffic
  const [erlA, setErlA] = useN<number | null>('erlang', 5); const [erlG, setErlG] = useN<number | null>('erlang', 2); const [erlN, setErlN] = useN<number | null>('erlang', 8);
  const [usr, setUsr] = useN<number | null>('erlang', 200); const [cph, setCph] = useN<number | null>('erlang', 1); const [hold, setHold] = useN<number | null>('erlang', 20);
  // electrical
  const [ov, setOv] = useN<number | null>('ohm', 12); const [oi, setOi] = useN<number | null>('ohm', 2); const [or_, setOr] = useN<number | null>('ohm', null); const [op, setOp] = useN<number | null>('ohm', null);
  const [vdA, setVdA] = useN<number | null>('vdrop', 10); const [vdL, setVdL] = useN<number | null>('vdrop', 100); const [vdAwg, setVdAwg] = useN<Awg>('vdrop', '12'); const [vdV, setVdV] = useN<number | null>('vdrop', 120); const [vdPh, setVdPh] = useN<'dc' | '1ph' | '3ph'>('vdrop', '1ph');
  const [szA, setSzA] = useN<number | null>('size', 30); const [szL, setSzL] = useN<number | null>('size', 150); const [szV, setSzV] = useN<number | null>('size', 48); const [szMax, setSzMax] = useN<number | null>('size', 3);
  const [bW, setBW] = useN<number | null>('battery', 100); const [bH, setBH] = useN<number | null>('battery', 24); const [bV, setBV] = useN<number | null>('battery', 24); const [bDod, setBDod] = useN<number | null>('battery', 0.5); const [bT, setBT] = useN<number | null>('battery', 0.9);
  const [pvWh, setPvWh] = useN<number | null>('solar', 2400); const [pvPsh, setPvPsh] = useN<number | null>('solar', 4.5); const [pvDer, setPvDer] = useN<number | null>('solar', 0.77); const [pvMod, setPvMod] = useN<number | null>('solar', 400);
  // grounding / structure
  const [grRho, setGrRho] = useN<number | null>('rod', 100); const [grL, setGrL] = useN<number | null>('rod', 8); const [grDia, setGrDia] = useN<number | null>('rod', 0.625);
  const [gyH, setGyH] = useN<number | null>('guy', 30); const [gyR, setGyR] = useN<number | null>('guy', 24);
  // location / units
  const [dLoc, setDLoc] = useN('decl', '35.5951, -82.5515');
  const [azIn, setAzIn] = useN<number | null>('decl', 90); const [azMag, setAzMag] = useN('decl', false);
  const [cv, setCv] = useN<number | null>('units', 100); const [cvT, setCvT] = useN<number | null>('units', 25); const [awg, setAwg] = useN('awg', '10');

  const r = (n: number | null) => n ?? NaN;
  const ohm = K.ohmsLaw(ov, oi, or_, op);
  const lam = K.antennaLengths(r(aF), r(aVf));
  const vs = K.vswrCalc(r(vswr));
  const cb = FEEDERS.find((x) => x.id === cbId) ?? FEEDERS[0];
  const cbLoss = (cableLossPer100ft(cb.points, r(cbF)) * r(cbL)) / 100;
  const im = (() => { const parse = (s: string) => s.split(/[\s,;]+/).map(Number).filter((x) => Number.isFinite(x) && x > 0); try { return K.intermodHits(parse(imTx), parse(imRx), r(imTol)); } catch { return null; } })();
  const vd = K.voltageDrop(r(vdA), r(vdL), vdAwg, r(vdV), vdPh);
  const sz = sizeConductor(r(szA), r(szL), r(szV), r(szMax));
  const ah = K.batteryAh(r(bW), r(bH), r(bV), r(bDod), r(bT));
  const pvW = r(pvWh) / (r(pvPsh) * r(pvDer));
  const dLl = parseLatLon(dLoc);
  const lb = r(lbP) + r(lbGt) - r(lbLt) - fsplDb(r(lbF), r(lbD)) + r(lbGr) - r(lbLr);
  const hata = (() => { try { return empiricalPathLoss({ fMHz: r(hF), hbM: r(hHb), hmM: r(hHm), dKm: r(hD), env: hEnv, city: hCity }); } catch { return null; } })();
  const traffic = (r(usr) * r(cph) * r(hold)) / 3600;
  const v = diffractionV(r(keH), r(keD1), r(keD2), r(keF));
  const am = K.awgToMm2(awg);
  const downtilt = K.tiltToDistanceDeg(r(tH), r(tD), r(tK) || K43);
  const sens = K.sensitivityDbm(r(nBw), r(nNf), r(nSnr));
  const ok = (...n: (number | null)[]) => n.every((x) => x != null && Number.isFinite(x));
  const fFrom = (set: (v: number | null) => void) => (p: Project) => set(p.radio.fMHz);

  return (
    <CalcResetCtx.Provider value={reset}>
    <div className="stack calcs">
      <div className="card"><input className="search" type="search" placeholder="Search calculators (e.g. battery, poe, cctv storage, 70v, fiber loss, vswr)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search calculators" />
        <p className="small muted">Each calculator keeps its own numbers: it starts from an example (460 MHz for radio), is not changed by the project, and does not change the project. Press ⇣ Use project values to copy numbers in, ➜ Apply to fields to put a result into the project (it asks first), or ↺ Reset to start a calculator over. Distances use {u.label} (change on Company & Project). Results are planning aids; verify critical values against manufacturer data and the adopted codes.</p></div>

      {[...new Set(LV_CALCS.map((c) => c.group))].map((g) => {
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = LV_CALCS.filter((c) => c.group === g && words.every((w) => `${c.title} ${c.keywords} ${g}`.toLowerCase().includes(w)));
        const tools = g.startsWith('Paging') && soundToolsMatch(q) ? <SoundTools q={q} /> : null;
        return list.length || tools ? <React.Fragment key={g}><h2 className="calc-group">{g}</h2>{tools}{list.length > 0 && <div className="calc-grid">{list.map((c) => <LvCalcCard key={c.id} c={c} />)}</div>}</React.Fragment> : null;
      })}
      <Group title="RF levels" q={q}>
        <Calc id="dbmw" q={q} title="dBm ↔ watts ↔ dBW" apply={() => ok(dbm) ? [tgt('txp', 'Transmitter power', EQ, ['radio', 'txPowerDbm'], r1(r(dbm)), `${r1(r(dbm))} dBm (${fmt(dbmToWatts(r(dbm)), 1)} W)`, (p) => `${p.radio.txPowerDbm} dBm`)] : []} applyWhat="the power" fromProject={(p) => { setDbm(p.radio.txPowerDbm); setWatts(dbmToWatts(p.radio.txPowerDbm)); }} k="power convert milliwatt dbw">
          <div className="form"><In label="dBm"><Num value={dbm} onChange={(x) => { setDbm(x); if (x != null) setWatts(dbmToWatts(x)); }} /></In><In label="Watts"><Num value={watts} onChange={(x) => { setWatts(x); if (x && x > 0) setDbm(wattsToDbm(x)); }} /></In></div>
          <Out label="dBW" v={r(dbm) - 30} /><Out label="Milliwatts" v={K.dbmToMw(r(dbm))} u="mW" />
        </Calc>
        <Calc id="uv" q={q} title="dBm ↔ µV ↔ dBµV (50 Ω)" fromProject={(p) => { setDbmU(p.radio.rxSensitivityDbm); setUv(K.dbmToUv(p.radio.rxSensitivityDbm)); }} k="microvolt receiver sensitivity voltage">
          <div className="form"><In label="dBm"><Num value={dbmU} onChange={(x) => { setDbmU(x); if (x != null) setUv(K.dbmToUv(x)); }} /></In><In label="µV"><Num value={uv} onChange={(x) => { setUv(x); if (x && x > 0) setDbmU(K.uvToDbm(x)); }} /></In></div>
          <Out label="µV across 50 Ω" v={fmt(K.dbmToUv(r(dbmU)), 3)} u="µV" /><Out label="dBµV" v={K.dbmToDbuv(r(dbmU))} />
        </Calc>
        <Calc id="field" q={q} title="Field strength ↔ received power" fromProject={(p) => { setEF(p.radio.fMHz); setEG(p.radio.rxAntGainDbi); }} k="dbuv/m field intensity antenna factor">
          <div className="form"><In label="Received power"><Num value={eRx} onChange={setERx} unit="dBm" /></In><In label="Frequency"><Num value={eF} onChange={setEF} unit="MHz" /></In><In label="RX antenna gain"><Num value={eG} onChange={setEG} unit="dBi" /></In></div>
          <Out label="Field strength" v={K.fieldStrengthDbuvM(r(eRx), r(eF), r(eG))} u="dBµV/m" />
        </Calc>
        <Calc id="eirp" q={q} title="EIRP / ERP" apply={() => ok(eirpP) ? [tgt('txp', 'Transmitter power', EQ, ['radio', 'txPowerDbm'], r(eirpP), `${r(eirpP)} dBm`, (p) => `${p.radio.txPowerDbm} dBm`)] : []} applyWhat="the transmitter power" fromProject={(p) => setEirpP(p.radio.txPowerDbm)} k="effective radiated power transmitter">
          <div className="form"><In label="TX power"><Num value={eirpP} onChange={setEirpP} unit="dBm" /></In><In label="Antenna gain"><Num value={eirpG} onChange={setEirpG} unit="dBi" /></In><In label="Line + connector loss"><Num value={eirpL} onChange={setEirpL} unit="dB" /></In></div>
          <Out label="EIRP" v={`${fmt(r(eirpP) + r(eirpG) - r(eirpL), 1)} dBm (${fmt(dbmToWatts(r(eirpP) + r(eirpG) - r(eirpL)), 1)} W)`} />
          <Out label="ERP" v={`${fmt(r(eirpP) + r(eirpG) - r(eirpL) - 2.15, 1)} dBm (${fmt(dbmToWatts(r(eirpP) + r(eirpG) - r(eirpL) - 2.15), 1)} W)`} />
        </Calc>
      </Group>

      <Group title="Antennas" q={q}>
        <Calc id="lambda" q={q} title="Wavelength & element lengths" fromProject={fFrom(setAF)} k="dipole quarter wave 5/8 antenna length cut" note="Velocity factor 0.95 is typical for wire elements; trim to the manufacturer's chart.">
          <div className="form"><In label="Frequency"><Num value={aF} onChange={setAF} unit="MHz" /></In><In label="Velocity factor"><Num value={aVf} step={0.01} onChange={setAVf} /></In></div>
          <Out label="Wavelength" v={`${fmt(lam.lambdaM, 3)} m (${fmt(mToFt(lam.lambdaM), 2)} ft)`} />
          <Out label="½-wave dipole" v={`${fmt(lam.halfWaveM, 3)} m (${fmt(mToFt(lam.halfWaveM), 2)} ft; 468/f = ${fmt(lam.halfWaveFt468, 2)} ft)`} />
          <Out label="¼-wave vertical" v={`${fmt(lam.quarterWaveM, 3)} m (${fmt(mToFt(lam.quarterWaveM), 2)} ft)`} />
          <Out label="⅝-wave" v={`${fmt(lam.fiveEighthM, 3)} m (${fmt(mToFt(lam.fiveEighthM), 2)} ft)`} />
        </Calc>
        <Calc id="gain" q={q} title="dBd ↔ dBi, gain from beamwidth" k="antenna gain directivity">
          <div className="form"><In label="Gain"><Num value={gd} onChange={setGd} unit="dBd" /></In></div>
          <Out label="Gain" v={K.dbdToDbi(r(gd))} u="dBi" />
          <div className="form"><In label="Horizontal beamwidth"><Num value={bwH} onChange={setBwH} unit="°" /></In><In label="Vertical beamwidth"><Num value={bwV} onChange={setBwV} unit="°" /></In><In label="Efficiency"><Num value={bwE} step={0.05} onChange={setBwE} /></In></div>
          <Out label="Approx. gain" v={K.gainFromBeamwidth(r(bwH), r(bwV), r(bwE))} u="dBi" />
        </Calc>
        <Calc id="iso" q={q} title="Antenna isolation (BDA / repeater / co-location)" fromProject={fFrom(setIsoF)} k="separation donor server spacing vertical horizontal" note="Typical engineering approximations. Vertical: 28 + 40·log(d/λ). Horizontal: 22 + 20·log(d/λ) − (G1+G2). BDA isolation should exceed system gain by ≥ 15 dB.">
          <div className="form"><In label="Separation"><Num value={isoD} onChange={setIsoD} unit="m" /></In><In label="Frequency"><Num value={isoF} onChange={setIsoF} unit="MHz" /></In><In label="Gain toward other, ant 1"><Num value={isoG1} onChange={setIsoG1} unit="dBi" /></In><In label="Gain toward other, ant 2"><Num value={isoG2} onChange={setIsoG2} unit="dBi" /></In></div>
          <Out label="Vertical separation" v={K.isolationVerticalDb(r(isoD), r(isoF))} u="dB" /><Out label="Horizontal separation" v={K.isolationHorizontalDb(r(isoD), r(isoF), r(isoG1), r(isoG2))} u="dB" />
        </Calc>
        <Calc id="tilt" q={q} title="Downtilt to aim at a distance" apply={() => Number.isFinite(downtilt) ? [tgt('tilt', 'Main antenna mechanical downtilt', OPT, ['radio', 'mechTiltDeg'], r1(downtilt), `${r1(downtilt)}°`, (p) => `${p.radio.mechTiltDeg}°`)] : []} applyWhat="the downtilt" fromProject={(p) => { const s = txSite(p); if (s) setTH(s.antennaAglM); setTK(p.radio.kFactor); }} k="tilt angle main beam coverage">
          <div className="form"><In label="Antenna height above ground"><Num value={tH} onChange={setTH} unit="m" /></In><In label="Aim point distance"><DistNum km={tD} onChange={setTD} /></In><In label="k-factor"><Num value={tK} step={0.01} onChange={setTK} /></In></div>
          <Out label="Downtilt" v={downtilt} u="°" />
        </Calc>
      </Group>

      <Group title="Propagation & path" q={q}>
        <Calc id="fspl" q={q} title="Free-space path loss" fromProject={fFrom(setPF)} k="fspl friis">
          <div className="form"><In label="Frequency"><Num value={pF} onChange={setPF} unit="MHz" /></In><In label="Distance"><DistNum km={pD} onChange={setPD} /></In></div>
          <Out label="FSPL" v={fsplDb(r(pF), r(pD))} u="dB" />
        </Calc>
        <Calc id="fresnel" q={q} title="Fresnel zone" fromProject={(p) => { setFrF(p.radio.fMHz); setFrK(p.radio.kFactor); }} k="clearance 60% first fresnel radius">
          <div className="form"><In label="Distance from TX"><DistNum km={frD1} onChange={setFrD1} /></In><In label="Distance to RX"><DistNum km={frD2} onChange={setFrD2} /></In><In label="Frequency"><Num value={frF} onChange={setFrF} unit="MHz" /></In><In label="k-factor"><Num value={frK} step={0.01} onChange={setFrK} /></In></div>
          <Out label="1st Fresnel radius" v={`${fmt(fresnelRadiusM(r(frD1), r(frD2), r(frF)), 2)} m (${fmt(mToFt(fresnelRadiusM(r(frD1), r(frD2), r(frF))), 1)} ft)`} />
          <Out label="60 % clearance" v={0.6 * fresnelRadiusM(r(frD1), r(frD2), r(frF))} u="m" />
          <Out label={`Earth bulge (k = ${fmt(r(frK) || K43, 2)})`} v={earthBulgeM(r(frD1), r(frD2), r(frK) || K43)} u="m" />
        </Calc>
        <Calc id="horizon" q={q} title="Radio horizon & line of sight" apply={() => ok(hzK) ? [tgt('k', 'k-factor', 'Path Profile / LOS / Fresnel and Coverage Prediction', ['radio', 'kFactor'], r(hzK), String(fmt(r(hzK), 3)), (p) => String(fmt(p.radio.kFactor, 3)))] : []} applyWhat="the k-factor" fromProject={(p) => { const s = txSite(p); if (s) setHzH1(s.antennaAglM); setHzH2(p.radio.mobileHeightM); setHzK(p.radio.kFactor); }} k="k-factor 4/3 earth curvature distance">
          <div className="form"><In label="Antenna 1 height"><Num value={hzH1} onChange={setHzH1} unit="m" /></In><In label="Antenna 2 height"><Num value={hzH2} onChange={setHzH2} unit="m" /></In><In label="k-factor"><Num value={hzK} step={0.01} onChange={setHzK} /></In></div>
          <Out label="Horizon, antenna 1" v={u.f(radioHorizonKm(r(hzH1), r(hzK)))} /><Out label="Max LOS path" v={u.f(losDistanceKm(r(hzH1), r(hzH2), r(hzK)))} />
        </Calc>
        <Calc id="knife" q={q} title="Knife-edge diffraction (ITU-R P.526)" fromProject={fFrom(setKeF)} k="obstruction ridge diffraction loss">
          <div className="form"><In label="Obstacle above LOS (+) / below (−)"><Num value={keH} onChange={setKeH} unit="m" /></In><In label="Distance TX to obstacle"><DistNum km={keD1} onChange={setKeD1} /></In><In label="Obstacle to RX"><DistNum km={keD2} onChange={setKeD2} /></In><In label="Frequency"><Num value={keF} onChange={setKeF} unit="MHz" /></In></div>
          <Out label="v" v={fmt(v, 3)} /><Out label="Diffraction loss" v={knifeEdgeLossDb(v)} u="dB" />
        </Calc>
        <Calc id="hata" q={q} title="Okumura-Hata / COST-231 path loss" apply={() => [tgt('env', 'Environment', COV, ['radio', 'env'], hEnv, hEnv, (p) => p.radio.env), tgt('city', 'City size', COV, ['radio', 'city'], hCity, hCity, (p) => p.radio.city), ...(ok(hHm) ? [tgt('mob', 'Mobile / portable height', COV, ['radio', 'mobileHeightM'], r(hHm), `${r(hHm)} m`, (p) => `${p.radio.mobileHeightM} m`)] : []), ...(ok(hF) ? [tgt('f', 'Design frequency', EQ, ['radio', 'fMHz'], r(hF), `${r(hF)} MHz`, (p) => `${p.radio.fMHz} MHz`, false)] : [])]} applyWhat="the path-loss settings" fromProject={(p) => { setHF(p.radio.fMHz); const s = txSite(p); if (s) setHHb(s.antennaAglM); setHHm(p.radio.mobileHeightM); setHEnv(p.radio.env); setHCity(p.radio.city); }} k="mobile land path loss urban suburban">
          <div className="form"><In label="Frequency"><Num value={hF} onChange={setHF} unit="MHz" /></In><In label="Base height"><Num value={hHb} onChange={setHHb} unit="m" /></In><In label="Mobile height"><Num value={hHm} onChange={setHHm} unit="m" /></In><In label="Distance"><DistNum km={hD} onChange={setHD} /></In>
            <In label="Environment"><Sel<Environment> value={hEnv} onChange={setHEnv} options={[['urban', 'Urban'], ['suburban', 'Suburban'], ['rural', 'Rural / open']]} /></In><In label="City size"><Sel<CitySize> value={hCity} onChange={setHCity} options={[['small-medium', 'Small/medium'], ['large', 'Large']]} /></In></div>
          <Out label={hata?.model ?? 'Model'} v={hata ? hata.lossDb : NaN} u="dB" />{hata?.warnings.map((w) => <p key={w} className="small bad-text">{w}</p>)}
        </Calc>
        <Calc id="linkbudget" q={q} title="Point-to-point link budget (free space)" apply={() => [...(ok(lbP) ? [tgt('txp', 'Transmitter power', EQ, ['radio', 'txPowerDbm'], r(lbP), `${r(lbP)} dBm`, (p) => `${p.radio.txPowerDbm} dBm`)] : []), ...(ok(lbS) ? [tgt('sens', 'RX sensitivity', EQ, ['radio', 'rxSensitivityDbm'], r(lbS), `${r(lbS)} dBm`, (p) => `${p.radio.rxSensitivityDbm} dBm`)] : []), ...(ok(lbGr) ? [tgt('rxg', 'RX antenna gain', EQ, ['radio', 'rxAntGainDbi'], r(lbGr), `${r(lbGr)} dBi`, (p) => `${p.radio.rxAntGainDbi} dBi`)] : []), ...(ok(lbLr) ? [tgt('rxl', 'RX feeder loss', EQ, ['radio', 'rxFeederLossDb'], r(lbLr), `${r(lbLr)} dB`, (p) => `${p.radio.rxFeederLossDb} dB`)] : []), ...(ok(lbF) ? [tgt('f', 'Design frequency', EQ, ['radio', 'fMHz'], r(lbF), `${r(lbF)} MHz`, (p) => `${p.radio.fMHz} MHz`, false)] : [])]} applyWhat="the link budget values" fromProject={(p) => { setLbP(p.radio.txPowerDbm); setLbF(p.radio.fMHz); setLbS(p.radio.rxSensitivityDbm); setLbGr(p.radio.rxAntGainDbi); setLbLr(p.radio.rxFeederLossDb); }} k="received level fade margin microwave">
          <div className="form"><In label="TX power"><Num value={lbP} onChange={setLbP} unit="dBm" /></In><In label="TX gain"><Num value={lbGt} onChange={setLbGt} unit="dBi" /></In><In label="TX losses"><Num value={lbLt} onChange={setLbLt} unit="dB" /></In><In label="RX gain"><Num value={lbGr} onChange={setLbGr} unit="dBi" /></In><In label="RX losses"><Num value={lbLr} onChange={setLbLr} unit="dB" /></In><In label="Frequency"><Num value={lbF} onChange={setLbF} unit="MHz" /></In><In label="Distance"><DistNum km={lbD} onChange={setLbD} /></In><In label="RX sensitivity"><Num value={lbS} onChange={setLbS} unit="dBm" /></In></div>
          <Out label="Received level" v={lb} u="dBm" /><Out label="Fade margin" v={lb - r(lbS)} u="dB" />
        </Calc>
      </Group>

      <Group title="Transmission line" q={q}>
        <Calc id="vswr" q={q} title="VSWR ↔ return loss ↔ mismatch" k="reflection coefficient sweep">
          <div className="form"><In label="VSWR"><Num value={vswr} step={0.01} onChange={(x) => { setVswr(x); if (x && x > 1) setRl(K.vswrCalc(x).returnLossDb); }} unit=": 1" /></In><In label="Return loss"><Num value={rl} onChange={(x) => { setRl(x); if (x && x > 0) setVswr(K.returnLossToVswr(x)); }} unit="dB" /></In></div>
          <Out label="Reflection coefficient Γ" v={fmt(vs.gamma, 3)} /><Out label="Mismatch loss" v={fmt(vs.mismatchLossDb, 3)} u="dB" /><Out label="Reflected power" v={vs.reflectedPct} u="%" />
        </Calc>
        <Calc id="coax" q={q} title="Coax / feeder loss" apply={() => [tgt('feeder', 'Feeder cable', EQ, ['radio', 'feederId'], cbId, `${cb.brand} ${cb.model}`, (p) => { const x = FEEDERS.find((y) => y.id === p.radio.feederId); return x ? `${x.brand} ${x.model}` : p.radio.feederId; }), ...(ok(cbL) ? [tgt('len', 'Feeder length', EQ, ['radio', 'feederLenM'], r1(r(cbL) * 0.3048), `${r(cbL)} ft (${r1(r(cbL) * 0.3048)} m)`, (p) => `${r1(p.radio.feederLenM / 0.3048)} ft (${p.radio.feederLenM} m)`)] : [])]} applyWhat="the feeder" fromProject={(p) => { if (FEEDERS.some((x) => x.id === p.radio.feederId)) setCbId(p.radio.feederId); setCbF(p.radio.fMHz); setCbL(r1(p.radio.feederLenM / 0.3048)); }} k="cable attenuation heliax ldf lmr">
          <div className="form"><In label="Cable"><select value={cbId} onChange={(e) => setCbId(e.target.value)}>{FEEDERS.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model}</option>)}</select></In><In label="Frequency"><Num value={cbF} onChange={setCbF} unit="MHz" /></In><In label="Length"><Num value={cbL} onChange={setCbL} unit="ft" /></In></div>
          <Out label="Loss per 100 ft" v={cableLossPer100ft(cb.points, r(cbF))} u="dB" /><Out label="Total loss" v={`${fmt(cbLoss, 2)} dB (${fmt(r(cbL) * 0.3048, 1)} m run)`} /><Out label="Power delivered" v={Math.pow(10, -cbLoss / 10) * 100} u="%" />
        </Calc>
      </Group>

      <Group title="Receivers & interference" q={q}>
        <Calc id="noise" q={q} title="Noise floor & sensitivity" apply={() => Number.isFinite(sens) ? [tgt('sens', 'RX sensitivity', EQ, ['radio', 'rxSensitivityDbm'], r1(sens), `${r1(sens)} dBm`, (p) => `${p.radio.rxSensitivityDbm} dBm`)] : []} applyWhat="the sensitivity" k="ktb thermal noise figure snr bandwidth">
          <div className="form"><In label="Bandwidth"><Num value={nBw} onChange={setNBw} unit="Hz" /></In><In label="Noise figure"><Num value={nNf} onChange={setNNf} unit="dB" /></In><In label="Required SNR"><Num value={nSnr} onChange={setNSnr} unit="dB" /></In></div>
          <Out label="Noise floor" v={K.thermalNoiseDbm(r(nBw), r(nNf))} u="dBm" /><Out label="Sensitivity" v={K.sensitivityDbm(r(nBw), r(nNf), r(nSnr))} u="dBm" />
        </Calc>
        <Calc id="intermod" q={q} title="Intermodulation check" k="im imd 3rd order 5th order co-location frequency plan" note="Checks two-signal 3rd (2A−B) and 5th (3A−2B) order and three-signal 3rd (A+B−C) products against each receive frequency.">
          <In label="Transmit frequencies (MHz)"><input type="text" value={imTx} onChange={(e) => setImTx(e.target.value)} /></In>
          <In label="Receive frequencies (MHz)"><input type="text" value={imRx} onChange={(e) => setImRx(e.target.value)} /></In>
          <In label="Tolerance"><Num value={imTol} onChange={setImTol} unit="± kHz" /></In>
          {im && <><Out label="Products checked" v={String(im.products.length)} />{im.hits.length ? <ul className="small bad-text">{im.hits.map((h, i) => <li key={i}>{h.order}rd/th order: {h.formula} = {h.fMHz.toFixed(4)} MHz hits RX {h.victim} ({h.offsetKHz >= 0 ? '+' : ''}{h.offsetKHz.toFixed(2)} kHz)</li>)}</ul> : <p className="ok-text small">No products within tolerance of a receive frequency.</p>}</>}
        </Calc>
        <Calc id="mpe" q={q} title="RF exposure (MPE) distance" fromProject={fFrom(setMpeF)} k="fcc 1.1310 oet 65 safety controlled uncontrolled" note="47 CFR 1.1310 Table 1 limits; OET-65 far-field estimate with ground reflection (factor 2.56).">
          <div className="form"><In label="EIRP"><Num value={mpeW} onChange={setMpeW} unit="W" /></In><In label="Frequency"><Num value={mpeF} onChange={setMpeF} unit="MHz" /></In></div>
          <Out label="General public limit" v={mpeLimitMwCm2(r(mpeF), 'general')} u="mW/cm²" /><Out label="General public distance" v={`${fmt(mpeComplianceDistanceM(r(mpeW), r(mpeF), 'general'), 1)} m (${fmt(mToFt(mpeComplianceDistanceM(r(mpeW), r(mpeF), 'general')), 0)} ft)`} />
          <Out label="Occupational distance" v={`${fmt(mpeComplianceDistanceM(r(mpeW), r(mpeF), 'occupational'), 1)} m (${fmt(mToFt(mpeComplianceDistanceM(r(mpeW), r(mpeF), 'occupational')), 0)} ft)`} />
        </Calc>
      </Group>

      <Group title="Traffic (trunking)" q={q}>
        <Calc id="erlang" q={q} title="Erlang B channels" k="grade of service blocking trunked talkpaths">
          <div className="form"><In label="Users"><Num value={usr} onChange={setUsr} /></In><In label="Calls per user, busy hour"><Num value={cph} onChange={setCph} /></In><In label="Average call length"><Num value={hold} onChange={setHold} unit="s" /></In></div>
          <Out label="Offered traffic" v={fmt(traffic, 3)} u="Erlangs" />
          <div className="form"><In label="Traffic"><Num value={erlA} onChange={setErlA} unit="Erl" /></In><In label="Target blocking"><Num value={erlG} onChange={setErlG} unit="%" /></In><In label="Channels (check)"><Num value={erlN} onChange={setErlN} /></In></div>
          <Out label="Channels needed" v={String(K.channelsForGos(r(erlA), r(erlG) / 100))} /><Out label={`Blocking with ${r(erlN)} channels`} v={K.erlangB(Math.round(r(erlN)), r(erlA)) * 100} u="%" />
          <button className="small" onClick={() => setErlA(Math.round(traffic * 1000) / 1000)}>Use offered traffic</button>
        </Calc>
      </Group>

      <Group title="Electrical & power" q={q}>
        <Calc id="ohm" q={q} title="Ohm's law & power" k="volts amps ohms watts" note="Enter any two values; clear the others.">
          <div className="form"><In label="Volts"><Num value={ov} nullable onChange={setOv} unit="V" /></In><In label="Amps"><Num value={oi} nullable onChange={setOi} unit="A" /></In><In label="Ohms"><Num value={or_} nullable onChange={setOr} unit="Ω" /></In><In label="Watts"><Num value={op} nullable onChange={setOp} unit="W" /></In></div>
          {ohm ? <><Out label="V" v={ohm.v} u="V" /><Out label="I" v={ohm.i} u="A" /><Out label="R" v={ohm.r} u="Ω" /><Out label="P" v={ohm.p} u="W" /></> : <p className="muted small">Enter two values.</p>}
        </Calc>
        <Calc id="vdrop" q={q} title="Voltage drop" apply={() => [...(ok(vdA) ? [tgt('nac-a', 'NAC load current', 'Fire Alarm & Batteries', ['alarm', 'nacLoadA'], r(vdA), `${r(vdA)} A`, (p) => `${p.alarm.nacLoadA} A`, false)] : []), ...(ok(vdL) ? [tgt('nac-ft', 'NAC one-way length', 'Fire Alarm & Batteries', ['alarm', 'nacOneWayFt'], r(vdL), `${r(vdL)} ft`, (p) => `${p.alarm.nacOneWayFt} ft`, false)] : []), tgt('nac-awg', 'NAC wire size', 'Fire Alarm & Batteries', ['alarm', 'nacAwg'], vdAwg, `${vdAwg} AWG`, (p) => `${p.alarm.nacAwg} AWG`, false)]} applyWhat="the circuit" k="conductor wire awg dc single phase three phase" note="NEC Chapter 9 Table 8 DC resistance (uncoated copper); AC reactance ignored. NEC informational notes suggest ≤ 3 % branch, ≤ 5 % total.">
          <div className="form"><In label="Load"><Num value={vdA} onChange={setVdA} unit="A" /></In><In label="One-way length"><Num value={vdL} onChange={setVdL} unit="ft" /></In><In label="Conductor"><Sel<Awg> value={vdAwg} onChange={setVdAwg} options={AWG_SIZES.map((a) => [a, `${a} AWG Cu`] as [Awg, string])} /></In><In label="Source voltage"><Num value={vdV} onChange={setVdV} unit="V" /></In><In label="System"><Sel value={vdPh} onChange={setVdPh} options={[['dc', 'DC'], ['1ph', 'AC single-phase'], ['3ph', 'AC three-phase']]} /></In></div>
          <Out label="Voltage drop" v={`${fmt(vd.vd, 2)} V (${fmt(vd.pct, 2)} %)`} /><Out label="Voltage at load" v={vd.endV} u="V" /><Out label="Ampacity (75 °C)" v={AMPACITY_75C_CU[vdAwg]} u="A" />
        </Calc>
        <Calc id="size" q={q} title="Conductor sizing (ampacity + drop)" k="wire size awg select" note="NEC 310.16 75 °C copper ampacity, then upsized for voltage drop. Apply 125 % for continuous loads and any derating before entering amps.">
          <div className="form"><In label="Load"><Num value={szA} onChange={setSzA} unit="A" /></In><In label="One-way length"><Num value={szL} onChange={setSzL} unit="ft" /></In><In label="Voltage"><Num value={szV} onChange={setSzV} unit="V" /></In><In label="Max drop"><Num value={szMax} onChange={setSzMax} unit="%" /></In></div>
          <Out label="Minimum size" v={sz ? `${sz.awg} AWG Cu` : 'larger than 4/0'} /><Out label="Drop at that size" v={sz ? sz.vdPct : NaN} u="%" />{sz && <Out label="Governed by" v={sz.limitedBy} />}
        </Calc>
        <Calc id="battery" q={q} title="Battery bank size & runtime" apply={() => Number.isFinite(ah) ? [tgt('fa-ah', 'Installed battery (fire alarm)', 'Fire Alarm & Batteries', ['alarm', 'installedBatteryAh'], Math.ceil(ah), `${Math.ceil(ah)} Ah`, (p) => `${p.alarm.installedBatteryAh} Ah`, false), ...(ok(bDod) ? [tgt('dod', 'Depth of discharge (solar)', 'Solar & DC Power', ['solar', 'depthOfDischarge'], r(bDod), String(r(bDod)), (p) => String(p.solar.depthOfDischarge), false)] : []), ...(ok(bT) ? [tgt('tf', 'Battery temperature factor (solar)', 'Solar & DC Power', ['solar', 'batteryTempFactor'], r(bT), String(r(bT)), (p) => String(p.solar.batteryTempFactor), false)] : [])] : []} applyWhat="the battery" k="ah amp hour backup standby ups">
          <div className="form"><In label="Load"><Num value={bW} onChange={setBW} unit="W" /></In><In label="Hours of backup"><Num value={bH} onChange={setBH} unit="h" /></In><In label="Bank voltage"><Num value={bV} onChange={setBV} unit="V" /></In><In label="Depth of discharge"><Num value={bDod} step={0.05} onChange={setBDod} /></In><In label="Temperature factor"><Num value={bT} step={0.05} onChange={setBT} /></In></div>
          <Out label="Required capacity" v={ah} u="Ah" /><Out label="Energy" v={(ah * r(bV)) / 1000} u="kWh nameplate" />
        </Calc>
        <Calc id="solar" q={q} title="Solar array size" apply={() => [...(ok(pvPsh) ? [tgt('psh', 'Peak sun hours', 'Solar & DC Power', ['solar', 'peakSunHours'], r(pvPsh), `${r(pvPsh)} h`, (p) => `${p.solar.peakSunHours} h`)] : []), ...(ok(pvDer) ? [tgt('der', 'System derate', 'Solar & DC Power', ['solar', 'systemDerate'], r(pvDer), String(r(pvDer)), (p) => String(p.solar.systemDerate))] : [])]} applyWhat="the solar settings" fromProject={(p) => { setPvPsh(p.solar.peakSunHours); setPvDer(p.solar.systemDerate); }} k="pv panels peak sun hours off grid">
          <div className="form"><In label="Daily energy"><Num value={pvWh} onChange={setPvWh} unit="Wh/day" /></In><In label="Peak sun hours"><Num value={pvPsh} onChange={setPvPsh} unit="h" /></In><In label="System derate"><Num value={pvDer} step={0.01} onChange={setPvDer} /></In><In label="Module rating"><Num value={pvMod} onChange={setPvMod} unit="W" /></In></div>
          <Out label="Array size" v={pvW} u="W" /><Out label="Modules" v={String(Math.ceil(pvW / r(pvMod)))} />
        </Calc>
      </Group>

      <Group title="Grounding & structure" q={q}>
        <Calc id="rod" q={q} title="Ground rod resistance (Dwight)" apply={() => ok(grL) ? [tgt('rod', 'Ground rod length', 'Grounding & Structure', ['grounding', 'rodLengthFt'], r(grL), `${r(grL)} ft`, (p) => `${p.grounding.rodLengthFt} ft`)] : []} applyWhat="the rod length" fromProject={(p) => setGrL(p.grounding.rodLengthFt)} k="earth electrode soil resistivity" note="Single driven rod, R = ρ/(2πL)·(ln(4L/a) − 1). Verify by fall-of-potential test (IEEE 81).">
          <div className="form"><In label="Soil resistivity"><Num value={grRho} onChange={setGrRho} unit="Ω·m" /></In><In label="Rod length"><Num value={grL} onChange={setGrL} unit="ft" /></In><In label="Rod diameter"><Num value={grDia} onChange={setGrDia} unit="in" /></In></div>
          <Out label="Resistance" v={K.groundRodOhms(r(grRho), ftToM(r(grL)), r(grDia) * 0.0254)} u="Ω" /><Out label="NEC 250.53(A)(2) 25 Ω test" v={K.groundRodOhms(r(grRho), ftToM(r(grL)), r(grDia) * 0.0254) <= 25 ? 'Single rod may suffice' : 'Supplemental electrode required'} />
        </Calc>
        <Calc id="guy" q={q} title="Guy wire length & angle" k="tower guy anchor radius">
          <div className="form"><In label="Attachment height"><Num value={gyH} onChange={setGyH} unit="m" /></In><In label="Anchor radius"><Num value={gyR} onChange={setGyR} unit="m" /></In></div>
          <Out label="Guy length" v={`${fmt(K.guyLength(r(gyH), r(gyR)).lengthM, 2)} m (${fmt(mToFt(K.guyLength(r(gyH), r(gyR)).lengthM), 1)} ft) + terminations`} /><Out label="Angle from ground" v={K.guyLength(r(gyH), r(gyR)).angleDeg} u="°" />
        </Calc>
      </Group>

      <Group title="Location & units" q={q}>
        <Calc id="azimuth" q={q} title="Azimuth calculator: aim between two points" k="azimuth bearing back azimuth true magnetic compass declination distance miles gps address coordinates dms tilt uptilt downtilt elevation angle antenna aiming donor yagi point to point haversine" onReset={() => setAzKey((n) => n + 1)}
          note="True azimuth (°T) is from true north (maps, GPS, FCC filings); magnetic (°M) is what a hand compass reads, from the built-in World Magnetic Model WMM2025. Works offline.">
          <AzimuthCalc key={azKey} />
        </Calc>
        <Calc id="decl" q={q} title="Magnetic declination: true ↔ compass azimuth" fromProject={(p) => { const s = p.sites[0]; if (s) setDLoc(`${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`); }} k="magnetic declination variation compass true north azimuth bearing wmm">
          <In label="Location (decimal or DMS)"><input type="text" value={dLoc} onChange={(e) => setDLoc(e.target.value)} /></In>
          <div className="form"><In label={azMag ? 'Compass (magnetic) azimuth' : 'True azimuth'}><Num value={azIn} onChange={setAzIn} unit={azMag ? '°M' : '°T'} /></In>
            <In label="I have"><Sel value={azMag ? 'm' : 't'} onChange={(v) => setAzMag(v === 'm')} options={[['t', 'True azimuth (map / GPS)'], ['m', 'Compass reading']]} /></In></div>
          {dLl ? (() => { const d = declinationDeg(dLl), a = r(azIn); return <><Out label="Declination here (WMM2025)" v={fmtDecl(d)} />
            {Number.isFinite(a) && (azMag ? <Out label="True azimuth" v={`${fmtDeg(magToTrue(a, d))}°T ${compassPoint(magToTrue(a, d))}`} /> : <Out label="Compass reading" v={`${fmtDeg(trueToMag(a, d))}°M ${compassPoint(a)}`} />)}
            <p className="small muted">Magnetic = true − declination (east positive, west negative). Declination changes about 0.1° a year; this uses today's date.</p></>; })() : <p className="bad-text small">Could not read the location.</p>}
        </Calc>
        <Calc id="units" q={q} title="Unit conversions" k="feet meters miles km temperature fahrenheit celsius">
          <div className="form"><In label="Value"><Num value={cv} onChange={setCv} /></In></div>
          <Out label="m → ft" v={mToFt(r(cv))} /><Out label="ft → m" v={ftToM(r(cv))} /><Out label="km → mi" v={r(cv) / 1.609344} /><Out label="mi → km" v={r(cv) * 1.609344} />
          <div className="form"><In label="Temperature"><Num value={cvT} onChange={setCvT} /></In></div>
          <Out label="°C → °F" v={K.cToF(r(cvT))} /><Out label="°F → °C" v={K.fToC(r(cvT))} />
        </Calc>
        <Calc id="awg" q={q} title="AWG → mm² / kcmil" k="wire gauge metric cross section">
          <In label="AWG"><Sel value={awg} onChange={setAwg} options={['18', '16', ...AWG_SIZES]} /></In>
          <Out label="Diameter" v={am.diaMm} u="mm" /><Out label="Area" v={am.areaMm2} u="mm²" /><Out label="Area" v={am.kcmil} u="kcmil" />
        </Calc>
      </Group>
    </div>
    </CalcResetCtx.Provider>
  );
}
