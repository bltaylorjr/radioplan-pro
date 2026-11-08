import React, { useState } from 'react';
import { useStore } from '../store';
import { Num, Sel, fmt } from '../components/ui';
import { useUnits, DistNum } from '../units';
import * as K from '../engine/calcs';
import { fsplDb, fresnelRadiusM, radioHorizonKm, losDistanceKm, earthBulgeM, diffractionV, knifeEdgeLossDb, dbmToWatts, wattsToDbm, mpeComplianceDistanceM, mpeLimitMwCm2, cableLossPer100ft, empiricalPathLoss, mToFt, ftToM, Environment, CitySize } from '../engine/rf';
import { haversineKm, bearingDeg } from '../engine/geo';
import { parseLatLon } from '../engine/locparse';
import { AWG_SIZES, Awg, AMPACITY_75C_CU, sizeConductor } from '../engine/electrical';
import { FEEDERS } from '../data/catalog';
import { LV_CALCS } from '../data/lvcalcs';
import { LvCalcCard } from '../components/SystemsUI';

/** One calculator card. `k` = extra search keywords. */
function Calc({ title, k, q, children, note, group }: { title: string; k: string; q: string; children: React.ReactNode; note?: string; group?: string }) {
  const hay = (title + ' ' + k + ' ' + (group ?? '')).toLowerCase();
  if (q && !q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return null;
  return <section className="card calc"><header><h3>{title}</h3></header>{children}{note && <p className="small muted">{note}</p>}</section>;
}
const In = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="field"><span className="field-label">{label}</span>{children}</label>;
const Out = ({ label, v, u = '' }: { label: string; v: string | number; u?: string }) => <div className="calc-out"><span>{label}</span><b>{typeof v === 'number' ? (Number.isFinite(v) ? fmt(v, 2) : '—') : v}{u && <small> {u}</small>}</b></div>;
const useN = (v: number) => useState<number | null>(v);

function Group({ title, q, children }: { title: string; q: string; children: React.ReactNode }) {
  const kids = React.Children.toArray(children) as React.ReactElement<{ title: string; k: string }>[];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length && !kids.some((c) => words.every((w) => `${c.props.title} ${c.props.k} ${title}`.toLowerCase().includes(w)))) return null;
  return <><h2 className="calc-group">{title}</h2><div className="calc-grid">{kids.map((c) => React.cloneElement(c as React.ReactElement<{ group?: string }>, { group: title }))}</div></>;
}

export function CalculatorsPage() {
  const { project: p } = useStore();
  const u = useUnits();
  const [q, setQ] = useState('');
  const f0 = p.radio.fMHz;
  // levels
  const [dbm, setDbm] = useN(30); const [watts, setWatts] = useN(1); const [uv, setUv] = useN(1);
  const [eRx, setERx] = useN(-90); const [eF, setEF] = useN(f0); const [eG, setEG] = useN(0);
  const [eirpP, setEirpP] = useN(p.radio.txPowerDbm); const [eirpG, setEirpG] = useN(6); const [eirpL, setEirpL] = useN(3);
  // antennas
  const [aF, setAF] = useN(f0); const [aVf, setAVf] = useN(0.95);
  const [gd, setGd] = useN(3); const [bwH, setBwH] = useN(65); const [bwV, setBwV] = useN(15); const [bwE, setBwE] = useN(0.7);
  const [isoD, setIsoD] = useN(10); const [isoF, setIsoF] = useN(f0); const [isoG1, setIsoG1] = useN(0); const [isoG2, setIsoG2] = useN(0);
  const [tH, setTH] = useN(45); const [tD, setTD] = useState<number | null>(3);
  // propagation
  const [pF, setPF] = useN(f0); const [pD, setPD] = useState<number | null>(10);
  const [frD1, setFrD1] = useState<number | null>(5); const [frD2, setFrD2] = useState<number | null>(5); const [frF, setFrF] = useN(f0);
  const [hzH1, setHzH1] = useN(45); const [hzH2, setHzH2] = useN(1.5); const [hzK, setHzK] = useN(4 / 3);
  const [keH, setKeH] = useN(10); const [keD1, setKeD1] = useState<number | null>(4); const [keD2, setKeD2] = useState<number | null>(6); const [keF, setKeF] = useN(f0);
  const [hF, setHF] = useN(f0); const [hHb, setHHb] = useN(45); const [hHm, setHHm] = useN(1.5); const [hD, setHD] = useState<number | null>(8); const [hEnv, setHEnv] = useState<Environment>('suburban'); const [hCity, setHCity] = useState<CitySize>('small-medium');
  const [lbP, setLbP] = useN(40); const [lbGt, setLbGt] = useN(6); const [lbLt, setLbLt] = useN(2); const [lbGr, setLbGr] = useN(6); const [lbLr, setLbLr] = useN(2); const [lbF, setLbF] = useN(f0); const [lbD, setLbD] = useState<number | null>(20); const [lbS, setLbS] = useN(-110);
  // line
  const [vswr, setVswr] = useN(1.5); const [rl, setRl] = useN(14);
  const [cbId, setCbId] = useState(FEEDERS[0].id); const [cbF, setCbF] = useN(f0); const [cbL, setCbL] = useN(150);
  // receivers
  const [nBw, setNBw] = useN(12500); const [nNf, setNNf] = useN(5); const [nSnr, setNSnr] = useN(12);
  const [imTx, setImTx] = useState('460.1000, 460.3000, 461.0250'); const [imRx, setImRx] = useState('459.9000, 465.1000'); const [imTol, setImTol] = useN(6.25);
  const [mpeW, setMpeW] = useN(500); const [mpeF, setMpeF] = useN(f0);
  // traffic
  const [erlA, setErlA] = useN(5); const [erlG, setErlG] = useN(2); const [erlN, setErlN] = useN(8);
  const [usr, setUsr] = useN(200); const [cph, setCph] = useN(1); const [hold, setHold] = useN(20);
  // electrical
  const [ov, setOv] = useState<number | null>(12); const [oi, setOi] = useState<number | null>(2); const [or_, setOr] = useState<number | null>(null); const [op, setOp] = useState<number | null>(null);
  const [vdA, setVdA] = useN(10); const [vdL, setVdL] = useN(100); const [vdAwg, setVdAwg] = useState<Awg>('12'); const [vdV, setVdV] = useN(120); const [vdPh, setVdPh] = useState<'dc' | '1ph' | '3ph'>('1ph');
  const [szA, setSzA] = useN(30); const [szL, setSzL] = useN(150); const [szV, setSzV] = useN(48); const [szMax, setSzMax] = useN(3);
  const [bW, setBW] = useN(100); const [bH, setBH] = useN(24); const [bV, setBV] = useN(24); const [bDod, setBDod] = useN(0.5); const [bT, setBT] = useN(0.9);
  const [pvWh, setPvWh] = useN(2400); const [pvPsh, setPvPsh] = useN(4.5); const [pvDer, setPvDer] = useN(0.77); const [pvMod, setPvMod] = useN(400);
  // grounding / structure
  const [grRho, setGrRho] = useN(100); const [grL, setGrL] = useN(8); const [grDia, setGrDia] = useN(0.625);
  const [gyH, setGyH] = useN(30); const [gyR, setGyR] = useN(24);
  // location / units
  const [c1, setC1] = useState('35.5951, -82.5515'); const [c2, setC2] = useState('35.6400, -82.4800');
  const [cv, setCv] = useN(100); const [cvT, setCvT] = useN(25); const [awg, setAwg] = useState('10');

  const r = (n: number | null) => n ?? NaN;
  const ohm = K.ohmsLaw(ov, oi, or_, op);
  const lam = K.antennaLengths(r(aF), r(aVf));
  const vs = K.vswrCalc(r(vswr));
  const cb = FEEDERS.find((x) => x.id === cbId)!;
  const cbLoss = (cableLossPer100ft(cb.points, r(cbF)) * r(cbL)) / 100;
  const im = (() => { const parse = (s: string) => s.split(/[\s,;]+/).map(Number).filter((x) => Number.isFinite(x) && x > 0); try { return K.intermodHits(parse(imTx), parse(imRx), r(imTol)); } catch { return null; } })();
  const vd = K.voltageDrop(r(vdA), r(vdL), vdAwg, r(vdV), vdPh);
  const sz = sizeConductor(r(szA), r(szL), r(szV), r(szMax));
  const ah = K.batteryAh(r(bW), r(bH), r(bV), r(bDod), r(bT));
  const pvW = r(pvWh) / (r(pvPsh) * r(pvDer));
  const ll1 = parseLatLon(c1), ll2 = parseLatLon(c2);
  const lb = r(lbP) + r(lbGt) - r(lbLt) - fsplDb(r(lbF), r(lbD)) + r(lbGr) - r(lbLr);
  const hata = (() => { try { return empiricalPathLoss({ fMHz: r(hF), hbM: r(hHb), hmM: r(hHm), dKm: r(hD), env: hEnv, city: hCity }); } catch { return null; } })();
  const traffic = (r(usr) * r(cph) * r(hold)) / 3600;
  const v = diffractionV(r(keH), r(keD1), r(keD2), r(keF));
  const am = K.awgToMm2(awg);

  return (
    <div className="stack calcs">
      <div className="card"><input className="search" type="search" placeholder="Search calculators (e.g. battery, poe, cctv storage, 70v, fiber loss, vswr)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search calculators" />
        <p className="small muted">Frequencies default to the project design frequency ({f0} MHz). Distances use {u.label} (change on Company & Project). Results are planning aids; verify critical values against manufacturer data and the adopted codes.</p></div>

      {[...new Set(LV_CALCS.map((c) => c.group))].map((g) => {
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const list = LV_CALCS.filter((c) => c.group === g && words.every((w) => `${c.title} ${c.keywords} ${g}`.toLowerCase().includes(w)));
        return list.length ? <React.Fragment key={g}><h2 className="calc-group">{g}</h2><div className="calc-grid">{list.map((c) => <LvCalcCard key={c.id} c={c} />)}</div></React.Fragment> : null;
      })}
      <Group title="RF levels" q={q}>
        <Calc q={q} title="dBm ↔ watts ↔ dBW" k="power convert milliwatt dbw">
          <div className="form"><In label="dBm"><Num value={dbm} onChange={(x) => { setDbm(x); if (x != null) setWatts(dbmToWatts(x)); }} /></In><In label="Watts"><Num value={watts} onChange={(x) => { setWatts(x); if (x && x > 0) setDbm(wattsToDbm(x)); }} /></In></div>
          <Out label="dBW" v={r(dbm) - 30} /><Out label="Milliwatts" v={K.dbmToMw(r(dbm))} u="mW" />
        </Calc>
        <Calc q={q} title="dBm ↔ µV ↔ dBµV (50 Ω)" k="microvolt receiver sensitivity voltage">
          <div className="form"><In label="dBm"><Num value={dbm} onChange={(x) => { setDbm(x); if (x != null) setUv(K.dbmToUv(x)); }} /></In><In label="µV"><Num value={uv} onChange={(x) => { setUv(x); if (x && x > 0) setDbm(K.uvToDbm(x)); }} /></In></div>
          <Out label="µV across 50 Ω" v={fmt(K.dbmToUv(r(dbm)), 3)} u="µV" /><Out label="dBµV" v={K.dbmToDbuv(r(dbm))} />
        </Calc>
        <Calc q={q} title="Field strength ↔ received power" k="dbuv/m field intensity antenna factor">
          <div className="form"><In label="Received power"><Num value={eRx} onChange={setERx} unit="dBm" /></In><In label="Frequency"><Num value={eF} onChange={setEF} unit="MHz" /></In><In label="RX antenna gain"><Num value={eG} onChange={setEG} unit="dBi" /></In></div>
          <Out label="Field strength" v={K.fieldStrengthDbuvM(r(eRx), r(eF), r(eG))} u="dBµV/m" />
        </Calc>
        <Calc q={q} title="EIRP / ERP" k="effective radiated power transmitter">
          <div className="form"><In label="TX power"><Num value={eirpP} onChange={setEirpP} unit="dBm" /></In><In label="Antenna gain"><Num value={eirpG} onChange={setEirpG} unit="dBi" /></In><In label="Line + connector loss"><Num value={eirpL} onChange={setEirpL} unit="dB" /></In></div>
          <Out label="EIRP" v={`${fmt(r(eirpP) + r(eirpG) - r(eirpL), 1)} dBm (${fmt(dbmToWatts(r(eirpP) + r(eirpG) - r(eirpL)), 1)} W)`} />
          <Out label="ERP" v={`${fmt(r(eirpP) + r(eirpG) - r(eirpL) - 2.15, 1)} dBm (${fmt(dbmToWatts(r(eirpP) + r(eirpG) - r(eirpL) - 2.15), 1)} W)`} />
        </Calc>
      </Group>

      <Group title="Antennas" q={q}>
        <Calc q={q} title="Wavelength & element lengths" k="dipole quarter wave 5/8 antenna length cut" note="Velocity factor 0.95 is typical for wire elements; trim to the manufacturer's chart.">
          <div className="form"><In label="Frequency"><Num value={aF} onChange={setAF} unit="MHz" /></In><In label="Velocity factor"><Num value={aVf} step={0.01} onChange={setAVf} /></In></div>
          <Out label="Wavelength" v={`${fmt(lam.lambdaM, 3)} m (${fmt(mToFt(lam.lambdaM), 2)} ft)`} />
          <Out label="½-wave dipole" v={`${fmt(lam.halfWaveM, 3)} m (${fmt(mToFt(lam.halfWaveM), 2)} ft; 468/f = ${fmt(lam.halfWaveFt468, 2)} ft)`} />
          <Out label="¼-wave vertical" v={`${fmt(lam.quarterWaveM, 3)} m (${fmt(mToFt(lam.quarterWaveM), 2)} ft)`} />
          <Out label="⅝-wave" v={`${fmt(lam.fiveEighthM, 3)} m (${fmt(mToFt(lam.fiveEighthM), 2)} ft)`} />
        </Calc>
        <Calc q={q} title="dBd ↔ dBi, gain from beamwidth" k="antenna gain directivity">
          <div className="form"><In label="Gain"><Num value={gd} onChange={setGd} unit="dBd" /></In></div>
          <Out label="Gain" v={K.dbdToDbi(r(gd))} u="dBi" />
          <div className="form"><In label="Horizontal beamwidth"><Num value={bwH} onChange={setBwH} unit="°" /></In><In label="Vertical beamwidth"><Num value={bwV} onChange={setBwV} unit="°" /></In><In label="Efficiency"><Num value={bwE} step={0.05} onChange={setBwE} /></In></div>
          <Out label="Approx. gain" v={K.gainFromBeamwidth(r(bwH), r(bwV), r(bwE))} u="dBi" />
        </Calc>
        <Calc q={q} title="Antenna isolation (BDA / repeater / co-location)" k="separation donor server spacing vertical horizontal" note="Typical engineering approximations. Vertical: 28 + 40·log(d/λ). Horizontal: 22 + 20·log(d/λ) − (G1+G2). BDA isolation should exceed system gain by ≥ 15 dB.">
          <div className="form"><In label="Separation"><Num value={isoD} onChange={setIsoD} unit="m" /></In><In label="Frequency"><Num value={isoF} onChange={setIsoF} unit="MHz" /></In><In label="Gain toward other, ant 1"><Num value={isoG1} onChange={setIsoG1} unit="dBi" /></In><In label="Gain toward other, ant 2"><Num value={isoG2} onChange={setIsoG2} unit="dBi" /></In></div>
          <Out label="Vertical separation" v={K.isolationVerticalDb(r(isoD), r(isoF))} u="dB" /><Out label="Horizontal separation" v={K.isolationHorizontalDb(r(isoD), r(isoF), r(isoG1), r(isoG2))} u="dB" />
        </Calc>
        <Calc q={q} title="Downtilt to aim at a distance" k="tilt angle main beam coverage">
          <div className="form"><In label="Antenna height above ground"><Num value={tH} onChange={setTH} unit="m" /></In><In label="Aim point distance"><DistNum km={tD} onChange={setTD} /></In></div>
          <Out label="Downtilt" v={K.tiltToDistanceDeg(r(tH), r(tD), p.radio.kFactor)} u="°" />
        </Calc>
      </Group>

      <Group title="Propagation & path" q={q}>
        <Calc q={q} title="Free-space path loss" k="fspl friis">
          <div className="form"><In label="Frequency"><Num value={pF} onChange={setPF} unit="MHz" /></In><In label="Distance"><DistNum km={pD} onChange={setPD} /></In></div>
          <Out label="FSPL" v={fsplDb(r(pF), r(pD))} u="dB" />
        </Calc>
        <Calc q={q} title="Fresnel zone" k="clearance 60% first fresnel radius">
          <div className="form"><In label="Distance from TX"><DistNum km={frD1} onChange={setFrD1} /></In><In label="Distance to RX"><DistNum km={frD2} onChange={setFrD2} /></In><In label="Frequency"><Num value={frF} onChange={setFrF} unit="MHz" /></In></div>
          <Out label="1st Fresnel radius" v={`${fmt(fresnelRadiusM(r(frD1), r(frD2), r(frF)), 2)} m (${fmt(mToFt(fresnelRadiusM(r(frD1), r(frD2), r(frF))), 1)} ft)`} />
          <Out label="60 % clearance" v={`${fmt(0.6 * fresnelRadiusM(r(frD1), r(frD2), r(frF)), 2)} m`} />
          <Out label="Earth bulge (k)" v={`${fmt(earthBulgeM(r(frD1), r(frD2), p.radio.kFactor), 2)} m`} />
        </Calc>
        <Calc q={q} title="Radio horizon & line of sight" k="k-factor 4/3 earth curvature distance">
          <div className="form"><In label="Antenna 1 height"><Num value={hzH1} onChange={setHzH1} unit="m" /></In><In label="Antenna 2 height"><Num value={hzH2} onChange={setHzH2} unit="m" /></In><In label="k-factor"><Num value={hzK} step={0.01} onChange={setHzK} /></In></div>
          <Out label="Horizon, antenna 1" v={u.f(radioHorizonKm(r(hzH1), r(hzK)))} /><Out label="Max LOS path" v={u.f(losDistanceKm(r(hzH1), r(hzH2), r(hzK)))} />
        </Calc>
        <Calc q={q} title="Knife-edge diffraction (ITU-R P.526)" k="obstruction ridge diffraction loss">
          <div className="form"><In label="Obstacle above LOS (+) / below (−)"><Num value={keH} onChange={setKeH} unit="m" /></In><In label="Distance TX to obstacle"><DistNum km={keD1} onChange={setKeD1} /></In><In label="Obstacle to RX"><DistNum km={keD2} onChange={setKeD2} /></In><In label="Frequency"><Num value={keF} onChange={setKeF} unit="MHz" /></In></div>
          <Out label="v" v={fmt(v, 3)} /><Out label="Diffraction loss" v={knifeEdgeLossDb(v)} u="dB" />
        </Calc>
        <Calc q={q} title="Okumura-Hata / COST-231 path loss" k="mobile land path loss urban suburban">
          <div className="form"><In label="Frequency"><Num value={hF} onChange={setHF} unit="MHz" /></In><In label="Base height"><Num value={hHb} onChange={setHHb} unit="m" /></In><In label="Mobile height"><Num value={hHm} onChange={setHHm} unit="m" /></In><In label="Distance"><DistNum km={hD} onChange={setHD} /></In>
            <In label="Environment"><Sel<Environment> value={hEnv} onChange={setHEnv} options={[['urban', 'Urban'], ['suburban', 'Suburban'], ['rural', 'Rural / open']]} /></In><In label="City size"><Sel<CitySize> value={hCity} onChange={setHCity} options={[['small-medium', 'Small/medium'], ['large', 'Large']]} /></In></div>
          <Out label={hata?.model ?? 'Model'} v={hata ? hata.lossDb : NaN} u="dB" />{hata?.warnings.map((w) => <p key={w} className="small bad-text">{w}</p>)}
        </Calc>
        <Calc q={q} title="Point-to-point link budget (free space)" k="received level fade margin microwave">
          <div className="form"><In label="TX power"><Num value={lbP} onChange={setLbP} unit="dBm" /></In><In label="TX gain"><Num value={lbGt} onChange={setLbGt} unit="dBi" /></In><In label="TX losses"><Num value={lbLt} onChange={setLbLt} unit="dB" /></In><In label="RX gain"><Num value={lbGr} onChange={setLbGr} unit="dBi" /></In><In label="RX losses"><Num value={lbLr} onChange={setLbLr} unit="dB" /></In><In label="Frequency"><Num value={lbF} onChange={setLbF} unit="MHz" /></In><In label="Distance"><DistNum km={lbD} onChange={setLbD} /></In><In label="RX sensitivity"><Num value={lbS} onChange={setLbS} unit="dBm" /></In></div>
          <Out label="Received level" v={lb} u="dBm" /><Out label="Fade margin" v={lb - r(lbS)} u="dB" />
        </Calc>
      </Group>

      <Group title="Transmission line" q={q}>
        <Calc q={q} title="VSWR ↔ return loss ↔ mismatch" k="reflection coefficient sweep">
          <div className="form"><In label="VSWR"><Num value={vswr} step={0.01} onChange={(x) => { setVswr(x); if (x && x > 1) setRl(K.vswrCalc(x).returnLossDb); }} unit=": 1" /></In><In label="Return loss"><Num value={rl} onChange={(x) => { setRl(x); if (x && x > 0) setVswr(K.returnLossToVswr(x)); }} unit="dB" /></In></div>
          <Out label="Reflection coefficient Γ" v={fmt(vs.gamma, 3)} /><Out label="Mismatch loss" v={fmt(vs.mismatchLossDb, 3)} u="dB" /><Out label="Reflected power" v={vs.reflectedPct} u="%" />
        </Calc>
        <Calc q={q} title="Coax / feeder loss" k="cable attenuation heliax ldf lmr">
          <div className="form"><In label="Cable"><select value={cbId} onChange={(e) => setCbId(e.target.value)}>{FEEDERS.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model}</option>)}</select></In><In label="Frequency"><Num value={cbF} onChange={setCbF} unit="MHz" /></In><In label="Length"><Num value={cbL} onChange={setCbL} unit="ft" /></In></div>
          <Out label="Loss per 100 ft" v={cableLossPer100ft(cb.points, r(cbF))} u="dB" /><Out label="Total loss" v={`${fmt(cbLoss, 2)} dB (${fmt(r(cbL) * 0.3048, 1)} m run)`} /><Out label="Power delivered" v={Math.pow(10, -cbLoss / 10) * 100} u="%" />
        </Calc>
      </Group>

      <Group title="Receivers & interference" q={q}>
        <Calc q={q} title="Noise floor & sensitivity" k="ktb thermal noise figure snr bandwidth">
          <div className="form"><In label="Bandwidth"><Num value={nBw} onChange={setNBw} unit="Hz" /></In><In label="Noise figure"><Num value={nNf} onChange={setNNf} unit="dB" /></In><In label="Required SNR"><Num value={nSnr} onChange={setNSnr} unit="dB" /></In></div>
          <Out label="Noise floor" v={K.thermalNoiseDbm(r(nBw), r(nNf))} u="dBm" /><Out label="Sensitivity" v={K.sensitivityDbm(r(nBw), r(nNf), r(nSnr))} u="dBm" />
        </Calc>
        <Calc q={q} title="Intermodulation check" k="im imd 3rd order 5th order co-location frequency plan" note="Checks two-signal 3rd (2A−B) and 5th (3A−2B) order and three-signal 3rd (A+B−C) products against each receive frequency.">
          <In label="Transmit frequencies (MHz)"><input type="text" value={imTx} onChange={(e) => setImTx(e.target.value)} /></In>
          <In label="Receive frequencies (MHz)"><input type="text" value={imRx} onChange={(e) => setImRx(e.target.value)} /></In>
          <In label="Tolerance"><Num value={imTol} onChange={setImTol} unit="± kHz" /></In>
          {im && <><Out label="Products checked" v={String(im.products.length)} />{im.hits.length ? <ul className="small bad-text">{im.hits.map((h, i) => <li key={i}>{h.order}rd/th order: {h.formula} = {h.fMHz.toFixed(4)} MHz hits RX {h.victim} ({h.offsetKHz >= 0 ? '+' : ''}{h.offsetKHz.toFixed(2)} kHz)</li>)}</ul> : <p className="ok-text small">No products within tolerance of a receive frequency.</p>}</>}
        </Calc>
        <Calc q={q} title="RF exposure (MPE) distance" k="fcc 1.1310 oet 65 safety controlled uncontrolled" note="47 CFR 1.1310 Table 1 limits; OET-65 far-field estimate with ground reflection (factor 2.56).">
          <div className="form"><In label="EIRP"><Num value={mpeW} onChange={setMpeW} unit="W" /></In><In label="Frequency"><Num value={mpeF} onChange={setMpeF} unit="MHz" /></In></div>
          <Out label="General public limit" v={mpeLimitMwCm2(r(mpeF), 'general')} u="mW/cm²" /><Out label="General public distance" v={`${fmt(mpeComplianceDistanceM(r(mpeW), r(mpeF), 'general'), 1)} m (${fmt(mToFt(mpeComplianceDistanceM(r(mpeW), r(mpeF), 'general')), 0)} ft)`} />
          <Out label="Occupational distance" v={`${fmt(mpeComplianceDistanceM(r(mpeW), r(mpeF), 'occupational'), 1)} m (${fmt(mToFt(mpeComplianceDistanceM(r(mpeW), r(mpeF), 'occupational')), 0)} ft)`} />
        </Calc>
      </Group>

      <Group title="Traffic (trunking)" q={q}>
        <Calc q={q} title="Erlang B channels" k="grade of service blocking trunked talkpaths">
          <div className="form"><In label="Users"><Num value={usr} onChange={setUsr} /></In><In label="Calls per user, busy hour"><Num value={cph} onChange={setCph} /></In><In label="Average call length"><Num value={hold} onChange={setHold} unit="s" /></In></div>
          <Out label="Offered traffic" v={fmt(traffic, 3)} u="Erlangs" />
          <div className="form"><In label="Traffic"><Num value={erlA} onChange={setErlA} unit="Erl" /></In><In label="Target blocking"><Num value={erlG} onChange={setErlG} unit="%" /></In><In label="Channels (check)"><Num value={erlN} onChange={setErlN} /></In></div>
          <Out label="Channels needed" v={String(K.channelsForGos(r(erlA), r(erlG) / 100))} /><Out label={`Blocking with ${r(erlN)} channels`} v={K.erlangB(Math.round(r(erlN)), r(erlA)) * 100} u="%" />
          <button className="small" onClick={() => setErlA(Math.round(traffic * 1000) / 1000)}>Use offered traffic</button>
        </Calc>
      </Group>

      <Group title="Electrical & power" q={q}>
        <Calc q={q} title="Ohm's law & power" k="volts amps ohms watts" note="Enter any two values; clear the others.">
          <div className="form"><In label="Volts"><Num value={ov} nullable onChange={setOv} unit="V" /></In><In label="Amps"><Num value={oi} nullable onChange={setOi} unit="A" /></In><In label="Ohms"><Num value={or_} nullable onChange={setOr} unit="Ω" /></In><In label="Watts"><Num value={op} nullable onChange={setOp} unit="W" /></In></div>
          {ohm ? <><Out label="V" v={ohm.v} u="V" /><Out label="I" v={ohm.i} u="A" /><Out label="R" v={ohm.r} u="Ω" /><Out label="P" v={ohm.p} u="W" /></> : <p className="muted small">Enter two values.</p>}
        </Calc>
        <Calc q={q} title="Voltage drop" k="conductor wire awg dc single phase three phase" note="NEC Chapter 9 Table 8 DC resistance (uncoated copper); AC reactance ignored. NEC informational notes suggest ≤ 3 % branch, ≤ 5 % total.">
          <div className="form"><In label="Load"><Num value={vdA} onChange={setVdA} unit="A" /></In><In label="One-way length"><Num value={vdL} onChange={setVdL} unit="ft" /></In><In label="Conductor"><Sel<Awg> value={vdAwg} onChange={setVdAwg} options={AWG_SIZES.map((a) => [a, `${a} AWG Cu`] as [Awg, string])} /></In><In label="Source voltage"><Num value={vdV} onChange={setVdV} unit="V" /></In><In label="System"><Sel value={vdPh} onChange={setVdPh} options={[['dc', 'DC'], ['1ph', 'AC single-phase'], ['3ph', 'AC three-phase']]} /></In></div>
          <Out label="Voltage drop" v={`${fmt(vd.vd, 2)} V (${fmt(vd.pct, 2)} %)`} /><Out label="Voltage at load" v={vd.endV} u="V" /><Out label="Ampacity (75 °C)" v={AMPACITY_75C_CU[vdAwg]} u="A" />
        </Calc>
        <Calc q={q} title="Conductor sizing (ampacity + drop)" k="wire size awg select" note="NEC 310.16 75 °C copper ampacity, then upsized for voltage drop. Apply 125 % for continuous loads and any derating before entering amps.">
          <div className="form"><In label="Load"><Num value={szA} onChange={setSzA} unit="A" /></In><In label="One-way length"><Num value={szL} onChange={setSzL} unit="ft" /></In><In label="Voltage"><Num value={szV} onChange={setSzV} unit="V" /></In><In label="Max drop"><Num value={szMax} onChange={setSzMax} unit="%" /></In></div>
          <Out label="Minimum size" v={sz ? `${sz.awg} AWG Cu` : 'larger than 4/0'} /><Out label="Drop at that size" v={sz ? sz.vdPct : NaN} u="%" />{sz && <Out label="Governed by" v={sz.limitedBy} />}
        </Calc>
        <Calc q={q} title="Battery bank size & runtime" k="ah amp hour backup standby ups">
          <div className="form"><In label="Load"><Num value={bW} onChange={setBW} unit="W" /></In><In label="Hours of backup"><Num value={bH} onChange={setBH} unit="h" /></In><In label="Bank voltage"><Num value={bV} onChange={setBV} unit="V" /></In><In label="Depth of discharge"><Num value={bDod} step={0.05} onChange={setBDod} /></In><In label="Temperature factor"><Num value={bT} step={0.05} onChange={setBT} /></In></div>
          <Out label="Required capacity" v={ah} u="Ah" /><Out label="Energy" v={(ah * r(bV)) / 1000} u="kWh nameplate" />
        </Calc>
        <Calc q={q} title="Solar array size" k="pv panels peak sun hours off grid">
          <div className="form"><In label="Daily energy"><Num value={pvWh} onChange={setPvWh} unit="Wh/day" /></In><In label="Peak sun hours"><Num value={pvPsh} onChange={setPvPsh} unit="h" /></In><In label="System derate"><Num value={pvDer} step={0.01} onChange={setPvDer} /></In><In label="Module rating"><Num value={pvMod} onChange={setPvMod} unit="W" /></In></div>
          <Out label="Array size" v={pvW} u="W" /><Out label="Modules" v={String(Math.ceil(pvW / r(pvMod)))} />
        </Calc>
      </Group>

      <Group title="Grounding & structure" q={q}>
        <Calc q={q} title="Ground rod resistance (Dwight)" k="earth electrode soil resistivity" note="Single driven rod, R = ρ/(2πL)·(ln(4L/a) − 1). Verify by fall-of-potential test (IEEE 81).">
          <div className="form"><In label="Soil resistivity"><Num value={grRho} onChange={setGrRho} unit="Ω·m" /></In><In label="Rod length"><Num value={grL} onChange={setGrL} unit="ft" /></In><In label="Rod diameter"><Num value={grDia} onChange={setGrDia} unit="in" /></In></div>
          <Out label="Resistance" v={K.groundRodOhms(r(grRho), ftToM(r(grL)), r(grDia) * 0.0254)} u="Ω" /><Out label="NEC 250.53(A)(2) 25 Ω test" v={K.groundRodOhms(r(grRho), ftToM(r(grL)), r(grDia) * 0.0254) <= 25 ? 'Single rod may suffice' : 'Supplemental electrode required'} />
        </Calc>
        <Calc q={q} title="Guy wire length & angle" k="tower guy anchor radius">
          <div className="form"><In label="Attachment height"><Num value={gyH} onChange={setGyH} unit="m" /></In><In label="Anchor radius"><Num value={gyR} onChange={setGyR} unit="m" /></In></div>
          <Out label="Guy length" v={`${fmt(K.guyLength(r(gyH), r(gyR)).lengthM, 2)} m (${fmt(mToFt(K.guyLength(r(gyH), r(gyR)).lengthM), 1)} ft) + terminations`} /><Out label="Angle from ground" v={K.guyLength(r(gyH), r(gyR)).angleDeg} u="°" />
        </Calc>
      </Group>

      <Group title="Location & units" q={q}>
        <Calc q={q} title="Distance & bearing between points" k="coordinates gps haversine azimuth dms">
          <In label="Point A (decimal or DMS)"><input type="text" value={c1} onChange={(e) => setC1(e.target.value)} /></In>
          <In label="Point B"><input type="text" value={c2} onChange={(e) => setC2(e.target.value)} /></In>
          {ll1 && ll2 ? <><Out label="Distance" v={u.f(haversineKm(ll1, ll2), 3)} /><Out label="Bearing A → B" v={bearingDeg(ll1, ll2)} u="°T" /><Out label="A in DMS" v={`${K.ddToDms(ll1.lat, 'N', 'S')}, ${K.ddToDms(ll1.lon, 'E', 'W')}`} /></> : <p className="bad-text small">Could not read a coordinate.</p>}
        </Calc>
        <Calc q={q} title="Unit conversions" k="feet meters miles km temperature fahrenheit celsius">
          <div className="form"><In label="Value"><Num value={cv} onChange={setCv} /></In></div>
          <Out label="m → ft" v={mToFt(r(cv))} /><Out label="ft → m" v={ftToM(r(cv))} /><Out label="km → mi" v={r(cv) / 1.609344} /><Out label="mi → km" v={r(cv) * 1.609344} />
          <div className="form"><In label="Temperature"><Num value={cvT} onChange={setCvT} /></In></div>
          <Out label="°C → °F" v={K.cToF(r(cvT))} /><Out label="°F → °C" v={K.fToC(r(cvT))} />
        </Calc>
        <Calc q={q} title="AWG → mm² / kcmil" k="wire gauge metric cross section">
          <In label="AWG"><Sel value={awg} onChange={setAwg} options={['18', '16', ...AWG_SIZES]} /></In>
          <Out label="Diameter" v={am.diaMm} u="mm" /><Out label="Area" v={am.areaMm2} u="mm²" /><Out label="Area" v={am.kcmil} u="kcmil" />
        </Calc>
      </Group>
    </div>
  );
}
