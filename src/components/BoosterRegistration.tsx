// FCC Class B signal booster registration helper (47 CFR 90.219) for ERCES / BDA jobs:
// fills in what the registration needs from the project, checks the 5 W ERP limit, finds the public-safety
// licensees whose channels the booster carries (from the built-in FCC data) and writes their consent request letters.
import React, { useState } from 'react';
import { useStore, downloadText } from '../store';
import { Card, Field, Num, Txt, Stat, Tip } from './ui';
import { ercesDownlink } from '../engine/alarm';
import { publicSafetyNear, serviceName, uniqueFreqs, type License, type Freq } from '../engine/fccdata';
import { useUnits } from '../units';
import type { BoosterReg, BoosterConsent } from '../types';

export const BOOSTER_REG_URL = 'https://www.fcc.gov/signal-boosters/registration';
const PRESETS: [string, string][] = [['VHF', '150-174'], ['UHF', '450-470'], ['700 MHz', '758-775, 788-805'], ['800 MHz', '806-824, 851-869']];
export const parsePassbands = (s: string): [number, number][] => [...s.matchAll(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/g)].map((m) => [Math.min(+m[1], +m[2]), Math.max(+m[1], +m[2])] as [number, number]).filter(([a, b]) => b > a);
const dbmToW = (d: number) => Math.pow(10, (d - 30) / 10);
const wTxt = (d: number) => { const w = dbmToW(d); return w >= 0.1 ? `${w.toFixed(2)} W` : `${(w * 1000).toPrecision(2)} mW`; };
const today = () => new Date().toISOString().slice(0, 10);

export function defaultBooster(p: ReturnType<typeof useStore>['project']): BoosterReg {
  const m = p.meta;
  return { make: '', model: '', fccId: '', units: 1, serial: '', passbands: '806-824, 851-869', locationDetail: '',
    operatorName: m.client || '', operatorContact: m.clientContact || '', operatorPhone: m.clientPhone || '', operatorEmail: m.clientEmail || '',
    operatorAddress: [m.clientAddress, m.clientCity, [m.clientState, m.clientZip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    donorErpDbm: null, maxChannelErpDbm: null, registeredOn: '', confirmation: '', consents: [] };
}

export function BoosterRegistrationCard() {
  const { project: p, update } = useStore();
  const u = useUnits();
  const e = p.erces, b = e.booster ?? defaultBooster(p), s0 = p.sites[0];
  const set = <K extends keyof BoosterReg>(k: K, v: BoosterReg[K]) => update((d) => { d.erces.booster = { ...(d.erces.booster ?? defaultBooster(d)), [k]: v }; });
  const pass = parsePassbands(b.passbands);
  const classB = pass.some(([a, z]) => (z - a) * 1000 > 75);
  const dl = ercesDownlink(e);
  const indoorErp = dl.perAntennaDbm + e.indoorAntGainDbi - 2.15;
  const worstErp = Math.max(indoorErp, b.donorErpDbm ?? -99, b.maxChannelErpDbm ?? -99);
  const erpOk = worstErp <= 37;
  const [found, setFound] = useState<{ lic: License; km: number | null; freqs: Freq[] }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const addr = [p.meta.siteAddress || s0?.address, p.meta.city, [p.meta.state, p.meta.siteZip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const find = async () => {
    if (!s0) return; setBusy(true); setMsg('');
    try { const r = await publicSafetyNear(s0, 32, pass, p.meta.county); setFound(r); if (!r.length) setMsg('No public-safety licensees with channels in these passbands were found within 20 miles or county-wide. Check the passbands.'); }
    catch (x) { setMsg((x as Error).message); } finally { setBusy(false); }
  };
  const addConsent = (l: License, fr: Freq[]) => update((d) => { const bb = d.erces.booster ?? defaultBooster(d); if (bb.consents.some((c) => c.call === l.call)) return; d.erces.booster = { ...bb, consents: [...bb.consents, { call: l.call, licensee: l.licensee, phone: l.phone, freqs: uniqueFreqs(fr).map((f) => f.mhz).join(', '), requested: '', received: '', note: '' }] }; });
  const setConsent = (i: number, k: keyof BoosterConsent, v: string) => update((d) => { const bb = d.erces.booster!; const cs = bb.consents.slice(); cs[i] = { ...cs[i], [k]: v }; d.erces.booster = { ...bb, consents: cs }; });
  const delConsent = (i: number) => update((d) => { const bb = d.erces.booster!; d.erces.booster = { ...bb, consents: bb.consents.filter((_, j) => j !== i) }; });
  const allConsent = b.consents.length > 0 && b.consents.every((c) => c.received);
  const summary = [
    'FCC Part 90 Class B signal booster registration (47 CFR 90.219(d)(5))',
    '',
    'OPERATOR (has operational control)',
    `  Name: ${b.operatorName}`, `  Contact: ${b.operatorContact}`, `  Phone: ${b.operatorPhone}`, `  Email: ${b.operatorEmail}`, `  Address: ${b.operatorAddress}`,
    '',
    'BOOSTER LOCATION',
    `  Building: ${p.meta.name}`, `  Address: ${addr}`, s0 ? `  Coordinates: ${s0.lat.toFixed(6)}, ${s0.lon.toFixed(6)} (NAD83/WGS84)` : '', `  In the building: ${b.locationDetail}`,
    '',
    'BOOSTER',
    `  Manufacturer: ${b.make}`, `  Model: ${b.model}`, `  FCC ID: ${b.fccId}`, `  Number of units: ${b.units}`, b.serial ? `  Serial number(s): ${b.serial}` : '',
    `  Passbands (MHz): ${b.passbands}`, `  Highest ERP per channel: ${worstErp.toFixed(1)} dBm (${wTxt(worstErp)})`,
    '',
    'INSTALLER',
    `  ${p.company.name}`, `  ${[p.company.address, p.company.city, [p.company.state, p.company.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}`, `  ${p.company.phone}  ${p.company.email}`,
    '',
    'LICENSEE CONSENT (47 CFR 90.219(b)(1)(i))',
    ...b.consents.map((c) => `  ${c.call} ${c.licensee}: ${c.received ? `consent received ${c.received}` : c.requested ? `requested ${c.requested}` : 'not yet requested'}`),
  ].filter((x) => x !== '').join('\n');
  const letter = (c: BoosterConsent) => [
    today(), '', c.licensee, `FCC call sign ${c.call}`, '',
    `Re: Request for consent to operate a signal booster, ${p.meta.name}, ${addr}`, '',
    'To the radio system manager:', '',
    `${p.company.name || 'Our company'} is installing an in-building emergency responder radio coverage system (ERCES) at the building above for ${b.operatorName || 'the building owner'}. The system uses a ${classB ? 'Class B (wideband)' : 'Class A (channelized)'} signal booster that will retransmit your channels inside the building to improve coverage where it is weak, as allowed by 47 CFR 90.219.`, '',
    `Booster: ${[b.make, b.model].filter(Boolean).join(' ') || '(make / model)'}${b.fccId ? `, FCC ID ${b.fccId}` : ''}. Passbands: ${b.passbands} MHz. Highest ERP per retransmitted channel: ${wTxt(worstErp)} (limit 5 W, 90.219(d)(3)).`,
    `Your frequencies in the passband: ${c.freqs} MHz.`,
    s0 ? `Location: ${s0.lat.toFixed(6)}, ${s0.lon.toFixed(6)}.` : '', '',
    `Under 47 CFR 90.219(b)(1)(i) a non-licensee must have the express consent of the licensee to operate a signal booster on its frequencies. We ask for your written consent (letter or email) and any conditions you require, such as donor site, gain or uplink limits, or a contact for interference. We will keep your consent on file and register the booster in the FCC signal booster database before it is turned on.`, '',
    `The operator responsible for the booster will be ${b.operatorName || 'the building owner'}${b.operatorContact ? ` (${b.operatorContact}${b.operatorPhone ? `, ${b.operatorPhone}` : ''})` : ''}.`, '',
    'Sincerely,', '', p.company.name, [p.company.phone, p.company.email].filter(Boolean).join(' · '),
    '', '— Licensee consent —', `${c.licensee} (${c.call}) consents to the operation of the signal booster described above.`, '', 'Name / title: ____________________   Signature: ____________________   Date: __________',
  ].filter((x) => x !== undefined).join('\n');
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setMsg('✓ Copied. Paste it into the FCC form or an email.'); } catch { downloadText('booster-registration.txt', t); } };
  return (
    <Card title="FCC Class B booster registration" tip="47 CFR 90.219: a Class B (wideband, passband over 75 kHz) signal booster must be registered with the FCC before it is used, and a non-licensee needs each licensee's written consent.">
      {!e.enabled && <p className="small muted">Tick “Include in project” above to use this on the job.</p>}
      <div className="stats">
        <Stat label="Booster class" value={pass.length ? (classB ? 'Class B' : 'Class A') : '—'} tip="Class B if any passband is wider than 75 kHz. Class B must be registered." />
        <Stat label="Highest ERP per channel" value={wTxt(worstErp)} tone={erpOk ? 'ok' : 'bad'} tip="Limit 5 W ERP per retransmitted channel, forward and reverse (90.219(d)(3)). Indoor: BDA output per antenna + antenna gain − 2.15 dB." />
        <Stat label="Licensee consent" value={`${b.consents.filter((c) => c.received).length} of ${b.consents.length}`} tone={allConsent ? 'ok' : 'warn'} />
        <Stat label="Registered" value={b.registeredOn ? `✓ ${b.registeredOn}` : 'Not yet'} tone={b.registeredOn ? 'ok' : 'warn'} />
      </div>
      <h4>Booster</h4>
      <div className="form">
        <Field label="Manufacturer"><Txt value={b.make} onChange={(v) => set('make', v)} placeholder="e.g. Honeywell, Comba, ADRF" /></Field>
        <Field label="Model"><Txt value={b.model} onChange={(v) => set('model', v)} /></Field>
        <Field label="FCC ID" tip="On the label and the data sheet. Look it up at fcc.gov/oet/ea/fccid."><Txt value={b.fccId} onChange={(v) => set('fccId', v.toUpperCase())} /></Field>
        <Field label="Units"><Num value={b.units} step={1} onChange={(v) => set('units', Math.max(1, Math.round(v ?? 1)))} /></Field>
        <Field label="Serial number(s)"><Txt value={b.serial} onChange={(v) => set('serial', v)} /></Field>
        <Field label="Passbands (MHz)" wide tip="The frequency ranges the booster is set to pass. Keep them as narrow as the licensees' channels allow (90.219(d)(7))."><span className="stack-tight"><Txt value={b.passbands} onChange={(v) => set('passbands', v)} placeholder="806-824, 851-869" />
          <span className="row wrap">{PRESETS.map(([l, v]) => <button key={l} className="small" onClick={() => set('passbands', b.passbands.includes(v) ? b.passbands : [b.passbands, v].filter((x) => x.trim()).join(', '))}>+ {l}</button>)}<button className="small ghost" onClick={() => set('passbands', '')}>Clear</button></span></span></Field>
        <Field label="Where in the building"><Txt value={b.locationDetail} onChange={(v) => set('locationDetail', v)} placeholder="e.g. 2nd floor IDF room 214" /></Field>
        <Field label="Donor (uplink) ERP" tip="Booster uplink output + donor antenna gain − cable loss − 2.15 dB. From the commissioning settings."><Num value={b.donorErpDbm} nullable onChange={(v) => set('donorErpDbm', v)} unit="dBm" /></Field>
      </div>
      <h4>Operator <Tip text="The person or company with operational control of the booster, usually the building owner (90.219(a) 'operate'). Filled in from the client on Company & Project." /></h4>
      <div className="form">
        <Field label="Name"><Txt value={b.operatorName} onChange={(v) => set('operatorName', v)} /></Field>
        <Field label="Contact person"><Txt value={b.operatorContact} onChange={(v) => set('operatorContact', v)} /></Field>
        <Field label="Phone"><Txt value={b.operatorPhone} onChange={(v) => set('operatorPhone', v)} /></Field>
        <Field label="Email"><Txt value={b.operatorEmail} onChange={(v) => set('operatorEmail', v)} /></Field>
        <Field label="Address" wide><Txt value={b.operatorAddress} onChange={(v) => set('operatorAddress', v)} /></Field>
      </div>
      <p className="small">Booster location: <b>{addr || 'set the site address on Company & Project'}</b>{s0 && <> · {s0.lat.toFixed(6)}, {s0.lon.toFixed(6)}</>}</p>
      {!erpOk && <p className="note bad-text">⚠ {dbmToW(worstErp).toFixed(1)} W ERP is over the 5 W per-channel limit (90.219(d)(3)). Lower the BDA output or gain.</p>}

      <h4>Licensee consent</h4>
      <p className="small">Find the public-safety licensees whose channels fall in the passbands, near the building or county-wide (FCC data built in, works offline). Add each one, send the letter, and record when consent comes back.</p>
      <button onClick={find} disabled={busy || !s0 || !pass.length}>{busy ? 'Looking…' : '🔎 Find licensees in these passbands'}</button>
      {found && found.length > 0 && <div className="scroll-x"><table className="tbl small"><thead><tr><th>Call sign</th><th>Licensee</th><th>Service</th><th>Channels in passband (MHz)</th><th>Distance</th><th></th></tr></thead><tbody>
        {found.slice(0, 60).map((x) => <tr key={x.lic.call}><td><b>{x.lic.call}</b></td><td>{x.lic.licensee}</td><td>{serviceName(x.lic.service)}</td><td>{uniqueFreqs(x.freqs).slice(0, 8).map((f) => f.mhz).join(', ')}{uniqueFreqs(x.freqs).length > 8 ? ' …' : ''}</td><td className="nowrap">{x.km != null ? u.f(x.km, 1) : 'county-wide'}</td>
          <td>{b.consents.some((c) => c.call === x.lic.call) ? '✓ added' : <button className="small" onClick={() => addConsent(x.lic, x.freqs)}>+ Add</button>}</td></tr>)}
      </tbody></table></div>}
      {b.consents.length > 0 && <div className="scroll-x"><table className="tbl small"><thead><tr><th>Licensee</th><th>Requested</th><th>Consent received</th><th>Notes / conditions</th><th></th></tr></thead><tbody>
        {b.consents.map((c, i) => <tr key={c.call}><td><b>{c.call}</b> {c.licensee}<div className="muted">{c.freqs}</div></td>
          <td><input type="date" value={c.requested} onChange={(ev) => setConsent(i, 'requested', ev.target.value)} aria-label="Date requested" /></td>
          <td><input type="date" value={c.received} onChange={(ev) => setConsent(i, 'received', ev.target.value)} aria-label="Date consent received" /></td>
          <td><input value={c.note} onChange={(ev) => setConsent(i, 'note', ev.target.value)} aria-label="Notes" placeholder="e.g. donor must aim at Mt Pisgah" /></td>
          <td className="nowrap"><button className="small" onClick={() => downloadText(`consent-request-${c.call}.txt`, letter(c))}>📝 Letter</button> <button className="small" onClick={() => copy(letter(c))}>Copy</button> <button className="small ghost" onClick={() => delConsent(i)} aria-label="Remove">✕</button></td></tr>)}
      </tbody></table></div>}

      <h4>Register</h4>
      <p className="small">Register on the FCC signal booster site before the booster is turned on. Have the information below ready; the FCC site may ask it in a different order or ask for more.</p>
      <div className="row wrap">
        <button className="primary" onClick={() => copy(summary)}>📋 Copy registration details</button>
        <button onClick={() => downloadText('booster-registration.txt', summary)}>⬇ Save as text</button>
        <a className="btn" href={BOOSTER_REG_URL} target="_blank" rel="noreferrer">FCC booster registration ↗</a>
      </div>
      <pre className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'var(--bg)', padding: 8, borderRadius: 6 }}>{summary}</pre>
      <div className="form">
        <Field label="Registered on"><input type="date" value={b.registeredOn} onChange={(ev) => update((d) => { d.erces.booster = { ...(d.erces.booster ?? defaultBooster(d)), registeredOn: ev.target.value }; if (ev.target.value) d.erces.fccClassB = true; })} aria-label="Date registered" /></Field>
        <Field label="Confirmation / registration no."><Txt value={b.confirmation} onChange={(v) => set('confirmation', v)} /></Field>
      </div>
      {b.registeredOn && allConsent && !e.ahjFreqApproval && <button onClick={() => update((d) => { d.erces.ahjFreqApproval = true; })}>✓ Tick “FCC licensee consent obtained / Class B registered”</button>}
      {msg && <p className="note">{msg}</p>}
      <p className="small muted">Rules: 47 CFR 90.219 (read in the eCFR, up to date as of 2026-10-16): Class B boosters only at fixed locations (d)(4), registered before operation (d)(5), 5 W ERP per channel (d)(3), noise and intermod limits (d)(6), passbands limited to the licensees' bands (d)(7), licensee consent kept in a recordable form (b)(1)(i). Also check the AHJ's ERCES permit and the fire code.</p>
    </Card>
  );
}
