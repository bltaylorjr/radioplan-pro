import React, { useState } from 'react';
import { useStore, downloadText } from '../store';
import { ImportFiles } from '../components/ImportFiles';
import { GUIDES, GUIDES_FOR, guideCtx } from './Install';
import { Card, Check, fmt } from '../components/ui';
import { designLink } from '../engine/design';
import { evaluateCompliance, severityOrder } from '../compliance/rules';
import { buildBom } from '../engine/materials';
import { ProfileChart } from '../components/ProfileChart';
import { sizeSolar } from '../engine/solar';
import { alarmBatteryAh, ercesDownlink } from '../engine/alarm';
import { PV_MODULES, byId } from '../data/catalog';
import { JURISDICTIONS } from '../compliance/jurisdictions';
import { CodesHere } from '../components/CodesHere';
import { JurisdictionInfo } from '../components/JurisdictionInfo';
import { fsplDb, mpeComplianceDistanceM } from '../engine/rf';
import { bearingDeg } from '../engine/geo';
import { coverageStats } from '../engine/coverage';
import type { Project, Proposal } from '../types';
import { autoDesign, defaultInputs, KIND_LABEL, Kind } from '../engine/autodesign';
import { FloorPlan2D } from '../components/FloorPlan2D';
import { projectSystems } from '../data/systems';
import { CHECKLISTS, itemsOf, doneKey } from '../data/checklists';
import { CONTACTS, atPlace } from '../data/contacts';
import { projectPlace } from '../compliance/place';
import { bomToCsv } from '../engine/materials';
import { writeXlsx, cleanHtml, tablesFromHtml } from '../engine/fileformats';
import { htmlToDocx } from '../engine/docx';
import { downloadBytes, safeName } from '../store';
import { fmtBytes } from '../engine/projectdb';
import { useUnits, DistNum } from '../units';
import { missingRequired } from '../engine/required';

const REPORTS = [
  ['cover', 'Cover letter & summary'], ['scope', 'Scope of work'], ['autoequip', 'Recommended equipment'], ['bom', 'Materials list'], ['price', 'Price'],
  ['schedule', 'Schedule'], ['terms', 'Terms, exclusions & acceptance'], ['plans', 'Floor plans'], ['devices', 'Device schedule'], ['codes', 'Codes in effect'],
  ['contacts', 'Inspection contacts'], ['ck-survey', 'Site survey checklist'], ['ck-permit', 'Permit & submittal checklist'], ['ck-install', 'Installation checklist'], ['ck-testing', 'Testing checklist'],
  ['tests', 'Commissioning / Test Report'], ['ck-closeout', 'Closeout checklist'], ['pm', 'Maintenance schedule'], ['documents', 'Documents index'], ['photos', 'Photos'], ['diagrams', 'Wiring diagrams (color)'], ['warranty', 'Warranty & owner sign-off'],
  ['site', 'Site Data Sheet'], ['link', 'Link Budget & Path Analysis'], ['coverage', 'Coverage Summary'], ['grounding', 'Grounding & Structure'],
  ['solar', 'Solar / DC Power Sizing'], ['alarm', 'Fire Alarm Battery Calculation'], ['erces', 'ERCES Design Summary'],
  ['compliance', 'Code Compliance Report'], ['notes', 'Field Notes & Photos'],
] as const;
type RK = (typeof REPORTS)[number][0];
/** Report packages and the sections each starts with. Every section can be ticked on or off. */
export const PACKAGES: { id: string; label: string; title: string; sections: RK[] }[] = [
  { id: 'proposal', label: 'Project proposal', title: 'Project Proposal', sections: ['cover', 'scope', 'autoequip', 'bom', 'price', 'schedule', 'codes', 'photos', 'terms'] },
  { id: 'build', label: 'Build plan', title: 'Build Plan', sections: ['scope', 'schedule', 'plans', 'devices', 'autoequip', 'bom', 'codes', 'contacts', 'ck-permit', 'ck-install', 'ck-testing', 'diagrams', 'photos'] },
  { id: 'closeout', label: 'Closeout package', title: 'Closeout Package', sections: ['cover', 'plans', 'devices', 'tests', 'photos', 'diagrams', 'ck-closeout', 'pm', 'documents', 'warranty'] },
  { id: 'survey', label: 'Site survey report', title: 'Site Survey Report', sections: ['site', 'ck-survey', 'photos', 'notes', 'codes', 'contacts'] },
  { id: 'engineering', label: 'Engineering reports (radio, power, codes)', title: 'Engineering Report', sections: ['site', 'link', 'coverage', 'grounding', 'solar', 'alarm', 'erces', 'compliance', 'bom', 'tests', 'notes'] },
];
export const defaultProposal = (): Proposal => ({ laborRate: 85, laborHours: 0, materialsCost: 0, markupPct: 20, taxPct: 0, startDate: '', weeks: 4, validDays: 30, paymentTerms: '30% on signing, progress billing monthly, balance on acceptance. Net 30.', exclusions: 'Patching and painting; line voltage power to panels and power supplies; conduit unless listed; permit fees unless listed; work outside normal hours; owner-furnished equipment.', notes: '' });
const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
/** Labor hours from the device count when none is typed: about 1.25 h per device plus 16 h for setup, programming and testing. */
export function laborEstimate(devices: number, systems: number) { return Math.round(devices * 1.25 + 16 * Math.max(1, systems)); }
export function priceOf(q: Proposal, autoHours: number) {
  const hours = q.laborHours || autoHours, labor = hours * q.laborRate, mat = q.materialsCost, markup = mat * q.markupPct / 100, tax = (mat + markup) * q.taxPct / 100;
  return { hours, labor, mat, markup, tax, total: labor + mat + markup + tax };
}
const PHASES: [string, number][] = [['Submittals, drawings and permit', 0.2], ['Rough-in: pathways and cable', 0.3], ['Trim-out: devices and head-end', 0.2], ['Programming and owner input', 0.1], ['Testing and AHJ inspection', 0.12], ['Training and closeout', 0.08]];
export function scheduleOf(start: string, weeks: number) {
  let d = start ? new Date(start + 'T12:00:00') : new Date(); const out: { phase: string; from: string; to: string; days: number }[] = [];
  for (const [phase, f] of PHASES) { const days = Math.max(1, Math.round(weeks * 7 * f)); const a = new Date(d); d = new Date(d.getTime() + days * 864e5); out.push({ phase, from: a.toISOString().slice(0, 10), to: new Date(d.getTime() - 864e5).toISOString().slice(0, 10), days }); }
  return out;
}

function kml(p: Project) {
  const esc = (s: string) => s.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
  const tx = p.sites.find((s) => s.id === p.radio.txSiteId), rx = p.sites.find((s) => s.id === p.radio.rxSiteId);
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(p.meta.name)}</name>
${p.sites.map((s) => `<Placemark><name>${esc(s.name)}</name><description>Antenna ${s.antennaAglM} m AGL, ${s.structure} ${s.structureHeightM} m</description><Point><altitudeMode>relativeToGround</altitudeMode><coordinates>${s.lon},${s.lat},${s.antennaAglM}</coordinates></Point></Placemark>`).join('\n')}
${tx && rx ? `<Placemark><name>Path ${esc(tx.name)} - ${esc(rx.name)}</name><LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>${tx.lon},${tx.lat},${tx.antennaAglM} ${rx.lon},${rx.lat},${rx.antennaAglM}</coordinates></LineString></Placemark>` : ''}
</Document></kml>`;
}

const m0 = (p: Project) => p.meta;
/** Report HTML with every drawing turned into a picture, so Word shows it. */
async function withImages(root: Element | null): Promise<string> {
  if (!root) return '';
  const clone = root.cloneNode(true) as Element, live = [...root.querySelectorAll('svg')], copies = [...clone.querySelectorAll('svg')];
  for (let i = 0; i < live.length; i++) {
    const sv = live[i], box = sv.getBoundingClientRect(), w = Math.max(50, Math.round(box.width)), h = Math.max(30, Math.round(box.height));
    try {
      const xml = new XMLSerializer().serializeToString(sv).replace(/var\(--[a-z-]+\)/g, '#333');
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml.includes('xmlns=') ? xml : xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
      await img.decode();
      const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
      const el = document.createElement('img'); el.src = cv.toDataURL('image/png'); const k = Math.min(1, 640 / w); el.width = Math.round(w * k); el.height = Math.round(h * k); copies[i].replaceWith(el);
    } catch { copies[i].remove(); }
  }
  return clone.innerHTML;
}

export function ReportsPage() {
  const { project: p, rt } = useStore();
  const u = useUnits();
  const { update, setRt } = useStore();
  /** Before printing or exporting: if required project information is empty, highlight it and ask. */
  const ready = () => { const miss = missingRequired(p); if (!miss.length) return true; setRt((r) => ({ ...r, showRequired: true })); return confirm(`Required project information is missing: ${miss.map((x) => x.label).join(', ')}.\n\nPress Cancel to fill it in on Company & Project, or OK to continue anyway.`); };
  const [pkg, setPkg] = useState(() => { try { return localStorage.getItem('radioplan.reportPkg') || 'proposal'; } catch { return 'proposal'; } });
  const P = PACKAGES.find((x) => x.id === pkg) ?? PACKAGES[0];
  const [sel, setSel] = useState<Partial<Record<RK, boolean>>>({});
  const on = (k: RK) => sel[k] ?? P.sections.includes(k);
  const choosePkg = (id: string) => { setPkg(id); setSel({}); try { localStorage.setItem('radioplan.reportPkg', id); } catch { /* ignore */ } };
  const q: Proposal = { ...defaultProposal(), ...(p.proposal ?? {}) };
  const setQ = <K extends keyof Proposal>(k: K, v: Proposal[K]) => update((d) => { d.proposal = { ...defaultProposal(), ...(d.proposal ?? {}), [k]: v }; });
  const ad = autoDesign(p, { ...defaultInputs(), ...(p.autoDesign ?? {}) });
  const systems = projectSystems(m0(p));
  const devCount = ad.devices.length;
  const pr = priceOf(q, laborEstimate(devCount, systems.length));
  const bom = buildBom(p);
  const place = projectPlace(p);
  const [msg, setMsg] = useState('');
  const L = designLink(p), c = p.company, m = p.meta;
  const findings = evaluateCompliance({ project: p, profile: rt.profile }).sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const Head = ({ title }: { title: string }) => (
    <div className="rpt-head">
      <div className="rpt-co">{c.logoDataUrl && <img src={c.logoDataUrl} alt="" />}<div><b>{c.name || 'Company name'}</b><br />{c.title && <>{c.title}<br /></>}{[c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')}<br />{[c.phone, c.email].filter(Boolean).join(' · ')}{c.license && <><br />License {c.license}</>}</div></div>
      <div className="rpt-meta"><h2>{title}</h2><div>{m.name}{m.number && ` · #${m.number}`} · Rev {m.revision}</div><div>Client: {m.client || '—'}{m.clientContact && ` · Attn: ${m.clientContact}`}{m.poNumber && ` · PO ${m.poNumber}`}</div>
        {(m.clientAddress || m.clientCity) && <div className="small">{[m.clientAddress, m.clientCity, m.clientState, m.clientZip].filter(Boolean).join(', ')}{(m.clientPhone || m.clientEmail) && ` · ${[m.clientPhone, m.clientEmail].filter(Boolean).join(' · ')}`}</div>}
        <div>Site: {m.siteAddress ? `${m.siteAddress} · ` : ''}{m.city ? `${m.city}, ` : ''}{m.county ? `${m.county}, ` : ''}{JURISDICTIONS[m.state].name}</div><div>Engineer: {m.engineer || '—'}{m.peLicense && ` (PE ${m.peLicense})`} · {m.created}</div></div>
    </div>
  );
  const Foot = () => <div className="rpt-foot">Prepared with RadioPlan Pro. Planning document — calculations and code citations must be verified by a licensed professional engineer and the Authority Having Jurisdiction.</div>;
  const KV = ({ rows }: { rows: [string, React.ReactNode][] }) => <table className="rpt-kv"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>;
  const mod = byId(PV_MODULES, p.solar.moduleId) ?? PV_MODULES[0];
  const ck = (id: string) => () => { const def = CHECKLISTS.find((c) => c.id === id)!; const items = itemsOf(def, p); const groups = [...new Set(items.map((i) => i.group ?? ''))];
    return <>{groups.map((g) => <div key={g}>{groups.length > 1 && <h4>{g}</h4>}<table className="rpt-tbl"><thead><tr><th style={{ width: 50 }}>Done</th><th>Item</th><th style={{ width: 160 }}>Initials / date</th></tr></thead>
      <tbody>{items.filter((i) => (i.group ?? '') === g).map((i) => <tr key={i.id}><td>{p.checklists?.[doneKey(def.id, i.id)] ? '☑' : '☐'}</td><td>{i.text}</td><td></td></tr>)}</tbody></table></div>)}</>; };
  const kindsCount = (ad.devices.reduce((a, d) => { a[d.kind] = (a[d.kind] ?? 0) + 1; return a; }, {} as Partial<Record<Kind, number>>));
  const sysNames = systems.map((x) => x.label).join(', ') || 'the systems listed below';
  const sections: Record<RK, () => React.ReactNode> = {
    cover: () => pkg === 'closeout' ? <><p>To: {m.client || 'Owner'}{m.clientContact && `, Attn: ${m.clientContact}`}</p>
      <p>We have completed the installation of {sysNames} at {m.siteAddress || m.name}. This package holds the record drawings, device schedule, test results, maintenance schedule and documents for your records.</p>
      <p>Please keep it with the building's fire and life-safety records. Call us for service at {c.phone || 'the number above'}.</p><p>Sincerely,<br /><br />{c.title || '______________________'}<br />{c.name}</p></>
      : <><p>{new Date().toLocaleDateString()}</p><p>To: {m.client || 'Client'}{m.clientContact && `, Attn: ${m.clientContact}`}</p>
      <p>Thank you for the opportunity to propose on <b>{m.name}</b>{m.siteAddress ? ` at ${m.siteAddress}` : ''}. We propose to furnish and install {sysNames}, as described in the scope of work below{p.proposal ? `, for ${money(pr.total)}` : ''}.</p>
      <p>This proposal is based on the information available at the time of writing{p.autoDesign ? ` (${(ad.areaSqft).toLocaleString()} sq ft, ${(p.autoDesign.floors)} floor(s))` : ''}. Final quantities will follow the approved drawings and the Authority Having Jurisdiction.</p>
      <p>Sincerely,<br /><br />{c.title || '______________________'}<br />{c.name}{c.license && <><br />License {c.license}</>}</p></>,
    scope: () => !systems.length ? <p>Pick the project type on Company & Project to fill in the scope.</p> : <>{systems.map((x) => <div key={x.id}><h4>{x.icon} {x.label}</h4><p>{x.summary}</p><ul>{x.install.slice(0, 4).map((t) => <li key={t}>{t}</li>)}</ul><p className="small">Standards: {x.standards.join('; ')}</p></div>)}</>,
    autoequip: () => !ad.equipment.length ? <p>Pick the project type to fill this in; adjust the building on Auto-Design & 3D Model.</p> : <table className="rpt-tbl"><thead><tr><th>System</th><th>Equipment</th><th>Recommended spec</th><th>Qty</th></tr></thead><tbody>{ad.equipment.map((e) => <tr key={e.system + e.key}><td>{e.system}</td><td>{e.item}</td><td>{e.spec}</td><td>{e.qty} {e.unit}</td></tr>)}</tbody></table>,
    price: () => <table className="rpt-tbl"><tbody>
      <tr><th>Labor</th><td>{pr.hours.toLocaleString()} h × {money(q.laborRate)}/h{!q.laborHours && <span className="small"> (estimated from {devCount} devices)</span>}</td><td style={{ textAlign: 'right' }}>{money(pr.labor)}</td></tr>
      <tr><th>Materials and equipment</th><td>{q.materialsCost ? 'per the materials list' : 'enter the materials cost in the price options'}</td><td style={{ textAlign: 'right' }}>{money(pr.mat)}</td></tr>
      {q.markupPct > 0 && <tr><th>Overhead and profit</th><td>{q.markupPct}% of materials</td><td style={{ textAlign: 'right' }}>{money(pr.markup)}</td></tr>}
      {q.taxPct > 0 && <tr><th>Sales tax</th><td>{q.taxPct}%</td><td style={{ textAlign: 'right' }}>{money(pr.tax)}</td></tr>}
      <tr><th>Total</th><td></td><td style={{ textAlign: 'right' }}><b>{money(pr.total)}</b></td></tr></tbody></table>,
    schedule: () => <table className="rpt-tbl"><thead><tr><th>Phase</th><th>Start</th><th>Finish</th><th>Work days</th></tr></thead><tbody>{scheduleOf(q.startDate, q.weeks).map((x) => <tr key={x.phase}><td>{x.phase}</td><td>{x.from}</td><td>{x.to}</td><td>{x.days}</td></tr>)}</tbody></table>,
    terms: () => <><h4>Exclusions</h4><p style={{ whiteSpace: 'pre-wrap' }}>{q.exclusions}</p><h4>Payment terms</h4><p style={{ whiteSpace: 'pre-wrap' }}>{q.paymentTerms}</p>{q.notes && <><h4>Notes</h4><p style={{ whiteSpace: 'pre-wrap' }}>{q.notes}</p></>}
      <p>This proposal is valid for {q.validDays} days. Design quantities are a planning estimate and must be confirmed by a licensed professional and the AHJ.</p>
      <div className="sign"><div>Accepted by (client) ____________________ Title __________ Date ________</div><div>For {c.name || 'the contractor'} ____________________ Date ________</div></div></>,
    plans: () => !ad.devices.length ? <p>No layout yet. Pick the project type, then describe the building on Auto-Design & 3D Model.</p> : <FloorPlan2D r={ad} lengthFt={p.autoDesign?.lengthFt ?? 200} widthFt={p.autoDesign?.widthFt ?? 100} floor="all" hidden={new Set()} />,
    devices: () => <table className="rpt-tbl"><thead><tr><th>Device</th><th>Quantity</th>{Array.from({ length: Math.max(1, p.autoDesign?.floors ?? 1) }, (_, i) => <th key={i}>Floor {i + 1}</th>)}</tr></thead>
      <tbody>{(Object.keys(kindsCount) as Kind[]).map((k) => <tr key={k}><td>{KIND_LABEL[k]}</td><td>{kindsCount[k]}</td>{Array.from({ length: Math.max(1, p.autoDesign?.floors ?? 1) }, (_, i) => <td key={i}>{ad.devices.filter((d) => d.kind === k && d.floor === i).length}</td>)}</tr>)}</tbody></table>,
    codes: () => <CodesHere />,
    contacts: () => <table className="rpt-tbl"><thead><tr><th>Office</th><th>Phone</th><th>Address</th></tr></thead><tbody>{atPlace(CONTACTS, place.state, place.county, place.city).map((x) => <tr key={x.id}><td>{x.office}<br /><small>{x.kind}</small></td><td>{x.phone}</td><td>{x.address}</td></tr>)}</tbody></table>,
    'ck-survey': ck('survey'), 'ck-permit': ck('permit'), 'ck-install': ck('install'), 'ck-testing': ck('testing'), 'ck-closeout': ck('closeout'),
    pm: () => <table className="rpt-tbl"><thead><tr><th>System</th><th>Task</th><th>How often</th><th>Reference</th><th>Last done</th></tr></thead><tbody>{systems.flatMap((x) => x.pm.map((t) => <tr key={x.id + t.task}><td>{x.label}</td><td>{t.task}</td><td>{t.every}</td><td>{t.ref}</td><td>{p.pmDone?.[`${x.id}|${t.task}`] ?? ''}</td></tr>))}</tbody></table>,
    documents: () => !(p.documents ?? []).length ? <p>No documents attached. Import them on Projects & Storage or on this page.</p> : <table className="rpt-tbl"><thead><tr><th>Document</th><th>Size</th><th>Added</th><th>Note</th></tr></thead><tbody>{(p.documents ?? []).map((d) => <tr key={d.id}><td>{d.name}</td><td>{fmtBytes(d.size)}</td><td>{d.addedAt.slice(0, 10)}</td><td>{d.note}</td></tr>)}</tbody></table>,
    photos: () => { const ph = [...(p.fieldNotes ?? []).flatMap((n) => n.photos.map((x) => ({ id: x.id, src: x.dataUrl, cap: x.caption || n.title, at: n.at }))), ...(p.documents ?? []).filter((d) => d.type.startsWith('image/')).map((d) => ({ id: d.id, src: d.dataUrl, cap: d.note || d.name, at: d.addedAt }))];
      return !ph.length ? <p>No photos yet. Take them on Field Notes & Photos, or import them.</p> : <div className="rpt-photos">{ph.map((x) => <figure key={x.id}><img src={x.src} alt={x.cap} /><figcaption>{x.cap} · {x.at.slice(0, 10)}</figcaption></figure>)}</div>; },
    diagrams: () => { const ids = [...new Set(systems.flatMap((x) => GUIDES_FOR[x.id] ?? []))], gs = GUIDES.filter((g) => ids.includes(g.id)), cx = guideCtx(p);
      return !gs.length ? <p>No wiring diagrams for this project's systems yet.</p> : <>{gs.map((g) => <div key={g.id} className="rpt-diagram"><h4>{g.title}</h4>{g.diagram(cx)}</div>)}</>; },
    warranty: () => <><p>{c.name || 'The contractor'} warrants the materials and workmanship of this installation for one (1) year from the date of acceptance below, unless a longer manufacturer warranty applies. The warranty does not cover damage from misuse, power surges, lightning, water, or work by others.</p>
      <p>The owner received training on the operation of the systems and the documents listed in this package.</p>
      <div className="sign"><div>Owner's representative ____________________ Date ________</div><div>Contractor ____________________ Date ________</div></div></>,
    notes: () => <>{(p.fieldNotes ?? []).length === 0 ? <p>No field notes.</p> : [...(p.fieldNotes ?? [])].sort((a, b) => a.at.localeCompare(b.at)).map((n) => (
      <div key={n.id} className="rpt-note"><h4>{n.title} <small>· {new Date(n.at).toLocaleString()} · {n.category}{n.siteId ? ` · Site ${n.siteId}` : ''}{n.lat != null ? ` · ${n.lat}, ${n.lon}` : ''}{n.followUp ? (n.done ? ' · follow-up done' : ' · FOLLOW-UP OPEN') : ''}</small></h4>
        {n.text && <p style={{ whiteSpace: 'pre-wrap' }}>{n.text}</p>}
        {n.photos.length > 0 && <div className="rpt-photos">{n.photos.map((ph) => <figure key={ph.id}><img src={ph.dataUrl} alt={ph.caption || 'Field photo'} />{ph.caption && <figcaption>{ph.caption}</figcaption>}</figure>)}</div>}
      </div>))}</>,
    site: () => <><table className="rpt-tbl"><thead><tr><th>Site</th><th>Lat / Lon (WGS84)</th><th>Ground AMSL</th><th>Structure</th><th>Antenna AGL</th><th>Position source</th></tr></thead>
      <tbody>{p.sites.map((s) => <tr key={s.id}><td>{s.name}<br /><small>{s.address}</small></td><td>{s.lat.toFixed(6)}, {s.lon.toFixed(6)}</td><td>{u.len(s.groundElevM, 0)}</td><td>{s.structure}, {u.len(s.structureHeightM)}</td><td>{u.len(s.antennaAglM)}</td><td>{s.positionSource}{s.positionAccuracyM != null && ` ±${u.len(s.positionAccuracyM)}`}</td></tr>)}</tbody></table>
      {rt.dem && <p>Terrain source: {rt.dem.source} ({rt.dem.name}).</p>}</>,
    link: () => <><KV rows={[
      ['Path', `${L.tx?.name} → ${L.rx?.name}: ${u.f(L.pathKm)}, bearing ${L.tx && L.rx ? fmt(bearingDeg(L.tx, L.rx), 1) : '—'}°T`],
      ['Frequency', `${p.radio.fMHz} MHz`], ['TX power', `${p.radio.txPowerDbm} dBm`],
      ['Antenna', `${L.ant?.brand} ${L.ant?.model} (${L.ant?.gainDbi} dBi)`], ['Feeder', `${L.fd?.model}, ${p.radio.feederLenM} m, ${fmt(L.feederLoss, 2)} dB`],
      ['EIRP / ERP', `${fmt(L.eirpDbm)} dBm (${fmt(L.eirpW, 0)} W) / ${fmt(L.erpDbm)} dBm`],
      ['Margins', `shadow ${fmt(L.fadeMarginDb)} dB (σ ${p.radio.shadowSigmaDb} dB, ${(p.radio.edgeReliability * 100).toFixed(0)}% edge), penetration ${p.radio.penetrationLossDb}, body ${p.radio.bodyLossDb}, interference ${p.radio.interferenceMarginDb} dB`],
      ['MAPL', `${fmt(L.maplDb)} dB`], [`Cell-edge range (${L.modelName}, ${p.radio.env})`, u.f(L.rangeKm)],
      ['Radio horizon (k=' + p.radio.kFactor.toFixed(2) + ')', `TX ${u.f(L.horizonTxKm, 1)}; LOS to RX ${u.f(L.losKm, 1)}`],
      ['Free-space loss over path', `${fmt(fsplDb(p.radio.fMHz, Math.max(L.pathKm, 0.01)))} dB`],
      ...(rt.profile ? [['Min. Fresnel clearance', `${fmt(rt.profile.minClearancePct, 0)}% of F1 (${rt.profile.meets60 ? 'meets' : 'FAILS'} 60%), LOS ${rt.profile.los ? 'clear' : 'obstructed'}, diffraction ${fmt(rt.profile.diffractionLossDb)} dB`] as [string, string]] : []),
      ['RF exposure', `General-public MPE distance ${fmt(mpeComplianceDistanceM(L.eirpW, p.radio.fMHz, 'general'), 1)} m (OET-65)`],
    ]} />{rt.profile ? <ProfileChart a={rt.profile} height={260} /> : <p className="muted">Path profile not computed this session.</p>}</>,
    coverage: () => <KV rows={[['Model', `${L.modelName}, ${p.radio.env}, ${p.radio.city}`], ['Analysis radius', u.f(p.radio.coverageRadiusKm, 1)], ['Threshold', `${p.radio.coverageThresholdDbm} dBm`],
      ['Area above threshold', rt.coverage ? `${fmt(coverageStats(rt.coverage, p.radio.coverageThresholdDbm).pct, 1)} %` : 'not computed this session'], ['Azimuth / tilt', `${p.radio.azimuthDeg}°T / ${p.radio.mechTiltDeg + p.radio.elecTiltDeg}°`], ['Terrain', rt.dem ? rt.dem.source : 'smooth earth']]} />,
    grounding: () => { const g = p.grounding; return <KV rows={[['Bonding conductor', `#${g.bondingConductorAwg} AWG Cu, ${u.len(g.bondingConductorLengthM)}`], ['Ground ring', `#${g.groundRingAwg} AWG tinned`], ['Rods', `${g.groundRods} × ${g.rodLengthFt} ft at ${g.rodSpacingFt} ft spacing`], ['Feeder ground kits', g.towerGroundKits], ['Surge protector / IBT', `${g.surgeProtector ? 'Yes' : 'No'} / ${g.intersystemBond ? 'Yes' : 'No'}`], ['Measured resistance', g.measuredResistanceOhm != null ? `${g.measuredResistanceOhm} Ω` : 'not measured'], ['TIA-222-H', `Risk Category ${g.structureClass}${g.ice ? ', ice' : ''}`]]} />; },
    solar: () => { const r = sizeSolar({ ...p.solar, module: mod, onBuilding: L.tx?.onBuilding ?? false }); return <KV rows={[['Daily load', `${fmt(r.dailyWh, 0)} Wh/day`], ['Battery', `${fmt(r.batteryAh, 0)} Ah @ ${p.solar.systemVdc} V, ${p.solar.autonomyDays} days, ${p.solar.depthOfDischarge * 100}% DoD`], ['Array', `${r.modulesTotal} × ${mod.brand} ${mod.model} (${r.strings} strings × ${r.modulesPerString})`], ['Peak sun hours', `${p.solar.peakSunHours} (${p.solar.pshLocation})`], ['Cold Voc (690.7)', `${fmt(r.maxStringVoc, 1)} V`], ['690.8 currents', `${fmt(r.circuitCurrentA, 1)} A max circuit; ${fmt(r.conductorAmpsRequired, 1)} A conductor`], ['PV conductor / OCPD', `#${r.pvConductor?.awg} AWG / ${r.pvOcpdA} A`]]} />; },
    alarm: () => { const b = alarmBatteryAh(p.alarm); return <><table className="rpt-tbl"><thead><tr><th>Device</th><th>Qty</th><th>Standby mA</th><th>Alarm mA</th></tr></thead><tbody>{p.alarm.devices.map((d, i) => <tr key={i}><td>{d.name}</td><td>{d.qty}</td><td>{d.standbyMa}</td><td>{d.alarmMa}</td></tr>)}</tbody></table>
      <KV rows={[['Standby', `${fmt(b.standbyA, 3)} A × ${p.alarm.standbyHours} h`], ['Alarm', `${fmt(b.alarmA, 3)} A × ${p.alarm.alarmMinutes} min`], ['Required', `${fmt(b.rawAh, 2)} Ah × ${p.alarm.safetyFactor} = ${fmt(b.requiredAh, 2)} Ah`], ['Installed', `${p.alarm.installedBatteryAh} Ah`]]} /></>; },
    erces: () => { const d = ercesDownlink(p.erces); return <KV rows={[['Building', `${p.erces.floors} floors × ${p.erces.areaPerFloorSqft} ft²`], ['Donor', `${p.erces.donorRssiDbm} dBm`], ['BDA output', `${fmt(d.bdaOutputDbm)} dBm`], ['Per antenna', `${fmt(d.perAntennaDbm)} dBm (${p.erces.floors * p.erces.antennasPerFloor} antennas)`], ['Worst-point signal', `${fmt(d.edgeRssiDbm)} dBm (≥ −95 required)`], ['Secondary power', `${p.erces.standbyHours} h`]]} />; },
    compliance: () => <><CodesHere /><JurisdictionInfo j={JURISDICTIONS[m.state]} compact /><table className="rpt-tbl"><thead><tr><th>Status</th><th>Code / section</th><th>Finding</th><th>Recommended fix</th></tr></thead>
      <tbody>{findings.map((f) => <tr key={f.id} className={f.severity}><td>{f.severity === 'violation' ? 'NOT IN COMPLIANCE' : f.severity.toUpperCase()}</td><td>{f.code} §{f.section}{f.verified === 'primary' ? ' ✓' : ''}</td><td><b>{f.title}</b><br />{f.detail}</td><td>{f.fix ?? ''}</td></tr>)}</tbody></table>
      <p className="small">✓ = section text checked in the official source on {JURISDICTIONS[m.state].checked}. Other sections are from the published code books and must be confirmed in the adopted edition.</p></>,
    bom: () => <table className="rpt-tbl"><thead><tr><th>Category</th><th>Item</th><th>Brand / model</th><th>Qty</th><th>Unit</th></tr></thead><tbody>{buildBom(p).map((l) => <tr key={l.key}><td>{l.category}</td><td>{l.item}</td><td>{l.brandModel}</td><td>{l.qty}</td><td>{l.unit}</td></tr>)}</tbody></table>,
    tests: () => <><table className="rpt-tbl"><thead><tr><th>Test</th><th>Standard</th><th>Acceptance</th><th>Measured</th><th>Result</th><th>Date / tech</th></tr></thead><tbody>{p.tests.map((t) => <tr key={t.id}><td>{t.item}</td><td>{t.standard}</td><td>{t.expected}</td><td>{t.measured}</td><td>{t.pass == null ? 'Pending' : t.pass ? 'PASS' : 'FAIL'}</td><td>{t.date} {t.tech}</td></tr>)}</tbody></table>
      <div className="sign"><div>Technician signature ____________________ Date ________</div><div>Engineer signature ____________________ Date ________</div></div></>,
  };
  const chosen = REPORTS.filter(([k]) => on(k));
  const pkgSections = P.sections, others = REPORTS.filter(([k]) => !pkgSections.includes(k));
  const base = `${safeName(m.name || 'project')}-${P.id}`;
  const reportHtml = () => document.querySelector('.report')?.innerHTML ?? '';
  const exportWord = async () => { setMsg('Preparing the Word file…'); const html = await withImages(document.querySelector('.report')); downloadBytes(`${base}.docx`, htmlToDocx(`${P.title}: ${m.name}`, cleanHtml(html)), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); setMsg('Word file saved, with photos and diagrams ✓'); };
  const exportExcel = () => {
    const tabs = tablesFromHtml(reportHtml()).map((t) => ({ name: t.caption, rows: t.rows }));
    const sheets = [{ name: 'Materials', rows: [['Category', 'Item', 'Brand / model', 'Qty', 'Unit', 'Basis'], ...bom.map((l) => [l.category, l.item, l.brandModel, l.qty, l.unit, l.basis])] }, ...tabs.filter((t) => !/materials list/i.test(t.name))];
    downloadBytes(`${base}.xlsx`, writeXlsx(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); setMsg(`Excel workbook saved with ${sheets.length} sheet(s) ✓`);
  };
  const exportHtml = () => { const css = [...document.styleSheets].map((ss) => { try { return [...ss.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n'); downloadText(`${base}.html`, `<!doctype html><html><head><meta charset="utf-8"><title>${P.title}: ${m.name}</title><style>${css}</style></head><body><div class="report">${reportHtml()}</div></body></html>`, 'text/html'); setMsg('Web page saved ✓'); };
  return (
    <div className="stack">
      <Card title="Report builder" className="no-print" tip="Pick a report, tick the sections to include, then print, save as PDF, or export to Word, Excel and other formats.">
        {rt.showRequired && missingRequired(p).length > 0 && <p className="note req-note" role="alert">⚠ Required project information is missing: <b>{missingRequired(p).map((x) => x.label).join(', ')}</b>. <a href="#company">Fill it in on Company & Project</a> so the report is complete.</p>}
        <div className="form">
          <label className="field wide"><span>Report</span><select value={P.id} onChange={(e) => choosePkg(e.target.value)} aria-label="Report">{PACKAGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        </div>
        <h4>Sections in this report</h4>
        <div className="row wrap">{pkgSections.map((k) => <Check key={k} value={on(k)} onChange={(v) => setSel({ ...sel, [k]: v })} label={REPORTS.find((r) => r[0] === k)![1]} />)}</div>
        <details><summary className="small">Add more sections ({others.filter(([k]) => on(k)).length} added)</summary><div className="row wrap">{others.map(([k, label]) => <Check key={k} value={on(k)} onChange={(v) => setSel({ ...sel, [k]: v })} label={label} />)}</div></details>
        <div className="row wrap"><button className="ghost" onClick={() => setSel(Object.fromEntries(REPORTS.map(([k]) => [k, true])))}>Select all</button><button className="ghost" onClick={() => setSel(Object.fromEntries(REPORTS.map(([k]) => [k, false])))}>Select none</button><button className="ghost" onClick={() => setSel({})}>Reset to {P.label.toLowerCase()}</button></div>
        <h4>Print and export</h4>
        <div className="row wrap">
          <button className="primary" onClick={() => ready() && window.print()}>🖨 Print / Save as PDF</button>
          <button onClick={() => ready() && exportWord()}>⬇ Word (.docx)</button>
          <button onClick={() => ready() && exportExcel()}>⬇ Excel (.xlsx)</button>
          <button onClick={() => downloadText(`${safeName(m.name)}-materials.csv`, bomToCsv(bom), 'text/csv')}>⬇ Materials CSV</button>
          <button onClick={() => ready() && exportHtml()}>⬇ Web page (.html)</button>
          <button onClick={() => downloadText(`${m.name || 'project'}.kml`, kml(p), 'application/vnd.google-earth.kml+xml')}>⬇ KML (Google Earth)</button>
        </div>
        <p className="small muted">To make a PDF, press Print and choose “Save as PDF” as the printer. Drawings for CAD are on the Blueprints page.</p>
        {msg && <p className="note" role="status">{msg}</p>}
      </Card>
      {(on('price') || on('schedule') || on('terms') || on('cover')) && <Card title="Proposal options" className="no-print" tip="Used by the Price, Schedule and Terms sections. Saved with the project.">
        <div className="form">
          <label className="field"><span>Labor rate ($/h)</span><input type="number" min={0} value={q.laborRate} onChange={(e) => setQ('laborRate', +e.target.value || 0)} /></label>
          <label className="field"><span>Labor hours</span><input type="number" min={0} value={q.laborHours || ''} placeholder={`auto: ${laborEstimate(devCount, systems.length)}`} onChange={(e) => setQ('laborHours', +e.target.value || 0)} /></label>
          <label className="field"><span>Materials cost ($)</span><input type="number" min={0} value={q.materialsCost || ''} onChange={(e) => setQ('materialsCost', +e.target.value || 0)} /></label>
          <label className="field"><span>Markup on materials (%)</span><input type="number" min={0} value={q.markupPct} onChange={(e) => setQ('markupPct', +e.target.value || 0)} /></label>
          <label className="field"><span>Sales tax (%)</span><input type="number" min={0} step={0.25} value={q.taxPct} onChange={(e) => setQ('taxPct', +e.target.value || 0)} /></label>
          <label className="field"><span>Start date</span><input type="date" value={q.startDate} onChange={(e) => setQ('startDate', e.target.value)} /></label>
          <label className="field"><span>Duration (weeks)</span><input type="number" min={1} value={q.weeks} onChange={(e) => setQ('weeks', Math.max(1, +e.target.value || 1))} /></label>
          <label className="field"><span>Valid for (days)</span><input type="number" min={1} value={q.validDays} onChange={(e) => setQ('validDays', +e.target.value || 30)} /></label>
          <label className="field wide"><span>Exclusions</span><textarea rows={3} value={q.exclusions} onChange={(e) => setQ('exclusions', e.target.value)} /></label>
          <label className="field wide"><span>Payment terms</span><textarea rows={2} value={q.paymentTerms} onChange={(e) => setQ('paymentTerms', e.target.value)} /></label>
          <label className="field wide"><span>Notes</span><textarea rows={2} value={q.notes} onChange={(e) => setQ('notes', e.target.value)} /></label>
        </div>
        <p className="small">Total: <b>{money(pr.total)}</b> ({pr.hours} h labor{q.laborHours ? '' : ', estimated'})</p>
      </Card>}
      <div className="no-print"><ImportFiles compact /></div>
      <div className="report">
        {chosen.map(([k, label], i) => <section key={k} className="rpt-page">{(i === 0 || P.id === 'engineering') && <Head title={P.id === 'engineering' ? label : P.title} />}<h3 className="rpt-sec">{i + 1}. {label}</h3>{sections[k]()}<Foot /></section>)}
        {!chosen.length && <p className="muted">Tick at least one section.</p>}
      </div>
    </div>
  );
}
