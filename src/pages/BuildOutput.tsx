import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Stat } from '../components/ui';
import { PlanSheet2D, Plan3D, LayerBoxes, useSystemOverlay, feetOf, PlanSchedules } from '../components/PlanViews';
import { PipButton } from '../components/PlanPip';
import { buildModel } from '../engine/models';
import { buildBom } from '../engine/materials';
import { KIND_LABEL, BLDG, type Kind } from '../engine/autodesign';
import { projectSystems } from '../data/systems';
import { fmtFtIn } from '../engine/floorplan';
import { MENU_PAGES } from '../data/menu';
import type { Project } from '../types';

interface El { key: string; group: string; label: string; value: string; page: string; sheet: string }

/** Every element of the build, with its value now ('' = not added yet), the sheet it lands on and the page to add it. */
export function buildElements(p: Project): El[] {
  const m = p.meta, c = p.company, ad = p.autoDesign, plans = [...(p.floorPlans ?? [])].sort((a, b) => a.floor - b.floor);
  const sys = projectSystems(m);
  const out: El[] = [];
  const add = (group: string, key: string, label: string, value: unknown, page: string, sheet: string) => out.push({ group, key, label, value: value == null || value === '' || value === 0 ? '' : String(value), page, sheet });
  add('Project', 'name', 'Project name', m.name && m.name !== 'New project' ? m.name : '', 'company', 'G-001');
  add('Project', 'number', 'Project number', m.number, 'company', 'G-001');
  add('Project', 'client', 'Owner / client', m.client, 'company', 'G-001');
  add('Project', 'site', 'Project address', [m.siteAddress, m.city, m.state].filter(Boolean).join(', '), 'company', 'G-001');
  add('Project', 'company', 'Contractor', c.name, 'company', 'G-001');
  add('Project', 'license', 'Contractor license', c.license, 'company', 'G-001');
  add('Project', 'systems', 'Systems in scope', sys.map((s) => s.label).join(', '), 'systems', 'G-001');
  add('Building', 'type', 'Building type (occupancy use)', ad ? BLDG[ad.bldg]?.label : '', 'autodesign', 'G-001');
  add('Building', 'floors', 'Stories', ad?.floors, 'autodesign', 'G-001');
  add('Building', 'size', 'Building size', ad ? `${fmtFtIn(ad.lengthFt)} × ${fmtFtIn(ad.widthFt)}` : '', 'autodesign', 'G-001');
  add('Building', 'area', 'Gross floor area', ad ? `${Math.round(ad.lengthFt * ad.widthFt * ad.floors).toLocaleString()} SF` : '', 'autodesign', 'G-001');
  add('Building', 'ceiling', 'Ceiling height (A.F.F.)', ad ? fmtFtIn(ad.ceilingFt) : '', 'autodesign', 'A-101');
  for (const pl of plans) {
    const f = feetOf(pl);
    add('Floor plans', 'plan:' + pl.floor, `A-${101 + pl.floor} ${pl.level}`, pl.integrated ? `${fmtFtIn(f.L)} × ${fmtFtIn(f.W)}, ${f.rooms.length} rooms, ${f.openings.filter((o) => o.kind === 'door').length} doors, ${f.openings.filter((o) => o.kind === 'window').length} windows (grade ${pl.quality.grade})` : '', 'floorplan', `A-${101 + pl.floor}`);
    if (pl.integrated) for (const r of f.rooms) add('Rooms', `room:${pl.floor}:${r.number}`, `Room ${r.number}`, `${r.name}, ${Math.round(r.areaSf)} SF`, 'floorplan', `A-${101 + pl.floor}`);
  }
  if (!plans.length) add('Floor plans', 'plan:0', 'A-101 FIRST FLOOR PLAN', '', 'floorplan', 'A-101');
  try {
    const s = buildModel(p);
    const by = new Map<string, number>(); for (const d of s.devices) by.set(d.system, (by.get(d.system) ?? 0) + 1);
    for (const x of sys) { const n = by.get(x.id) ?? 0; add('Systems', 'sys:' + x.id, x.label, n ? `${n} devices` : '', 'autodesign', sysSheet(x.id)); }
  } catch { /* the model needs more project data */ }
  const bom = buildBom(p);
  add('Materials', 'bom', 'Materials list', bom.length ? `${bom.length} lines` : '', 'materials', 'Materials');
  add('Codes', 'codes', 'Codes and jurisdiction', m.state ? `${m.state}${m.county ? ', ' + m.county : ''}${m.city ? ', ' + m.city : ''}` : '', 'compliance', 'G-001');
  add('Drawings', 'drawnby', 'Drawn by / checked by', [p.blueprint?.drawnBy, p.blueprint?.checkedBy].filter(Boolean).join(' / '), 'blueprints', 'All sheets');
  add('Testing', 'tests', 'Acceptance tests', p.tests.length ? `${p.tests.filter((t) => t.pass === true).length} of ${p.tests.length} passed` : '', 'testing', 'Closeout');
  return out;
}
/** US National CAD Standard discipline letters for each system's sheets. */
export function sysSheet(id: string): string {
  return ({ firealarm: 'FA-101', massnotif: 'FA-101', erces: 'T-501', das: 'T-501', cabling: 'T-101', fiber: 'T-101', wifi: 'T-101', paging: 'T-301', sound: 'T-301', intercom: 'T-301', security: 'TY-101', access: 'TY-101', cctv: 'TY-101', nursecall: 'T-401', callbox: 'T-601' } as Record<string, string>)[id] ?? 'T-101';
}

export function BuildOutputPage() {
  const { project: p, update, go } = useStore();
  const els = useMemo(() => buildElements(p), [p]);
  // when each element first appeared or last changed (kept on the project, so it syncs)
  useEffect(() => {
    const seen = p.buildSeen ?? {}, now = new Date().toISOString(), add: Record<string, string> = {};
    for (const e of els) if (e.value) { const old = seen[e.key]; if (!old || old.slice(old.indexOf('|') + 1) !== e.value) add[e.key] = `${now}|${e.value}`; }
    if (Object.keys(add).length) update((d) => { d.buildSeen = { ...(d.buildSeen ?? {}), ...add }; });
  }, [els]); // eslint-disable-line react-hooks/exhaustive-deps
  const plans = [...(p.floorPlans ?? [])].sort((a, b) => a.floor - b.floor);
  const shown = plans.filter((x) => x.integrated);
  const [pid, setPid] = useState(shown[0]?.id ?? plans[0]?.id ?? '');
  const plan = plans.find((x) => x.id === pid) ?? shown[0] ?? plans[0] ?? null;
  const scene = useSystemOverlay(p, plan);
  const done = els.filter((e) => e.value).length;
  const seenAt = (k: string) => (p.buildSeen?.[k] ?? '').split('|')[0];
  const recent = els.filter((e) => e.value && seenAt(e.key)).sort((a, b) => seenAt(b.key).localeCompare(seenAt(a.key))).slice(0, 12);
  const groups = [...new Set(els.map((e) => e.group))];
  const sheets = useMemo(() => {
    const list: { no: string; title: string; ready: boolean }[] = [{ no: 'G-001', title: 'COVER SHEET, SHEET INDEX, PROJECT DATA', ready: !!p.meta.name && !!p.meta.client }];
    for (const x of plans) list.push({ no: `A-${101 + x.floor}`, title: x.level, ready: !!x.integrated });
    if (plans.some((x) => x.integrated)) list.push({ no: 'A-301', title: '3D BUILDING MODEL', ready: true }, { no: 'A-601', title: 'ROOM, DOOR AND WINDOW SCHEDULES', ready: true });
    const seenSheets = new Set<string>(); for (const s of projectSystems(p.meta)) { const n = sysSheet(s.id); if (seenSheets.has(n)) continue; seenSheets.add(n); list.push({ no: n, title: `${s.label.toUpperCase()} PLAN`, ready: els.some((e) => e.key === 'sys:' + s.id && e.value) }); }
    return list;
  }, [p, plans, els]);
  const kinds = useMemo(() => { try { const s = buildModel(p); const m = new Map<Kind, number[]>(); for (const d of s.devices) { const a = m.get(d.kind) ?? []; a[d.floor] = (a[d.floor] ?? 0) + 1; m.set(d.kind, a); } return { m, floors: s.floors }; } catch { return null; } }, [p]);
  const label = (id: string) => MENU_PAGES.find((x) => x.id === id)?.label ?? id;
  const setOff = (off: string[]) => plan && update((d) => { const x = d.floorPlans?.find((y) => y.id === plan.id); if (x) x.off = off; });

  return (
    <div className="grid build-out">
      <Card title="Project Build Output" className="wide" actions={<div className="row wrap"><span className="live-dot on" title="This page updates by itself as information is added anywhere in the app">● LIVE</span><PipButton planId={plan?.id} disabled={!plans.length} /><button onClick={() => window.print()}>🖨 Print</button></div>}
        tip="The final output of the project, filled in as each value and element is added on the other pages. Open the floor plan in Picture in picture to watch it change while you work.">
        <div className="title-block">
          <div><small>PROJECT</small><b>{p.meta.name || '—'}</b>{p.meta.number && <span>No. {p.meta.number}</span>}</div>
          <div><small>OWNER</small><b>{p.meta.client || '—'}</b><span>{[p.meta.siteAddress, p.meta.city, p.meta.state].filter(Boolean).join(', ')}</span></div>
          <div><small>CONTRACTOR</small><b>{p.company.name || '—'}</b><span>{p.company.license && `Lic. ${p.company.license}`}</span></div>
          <div><small>DATE · REV</small><b>{new Date().toLocaleDateString()}</b><span>Rev {p.meta.revision || '0'}</span></div>
        </div>
        <div className="stats">
          <Stat label="Build elements" value={`${done} of ${els.length}`} tone={done === els.length ? 'ok' : 'warn'} />
          <Stat label="Sheets ready" value={`${sheets.filter((s) => s.ready).length} of ${sheets.length}`} />
          <Stat label="Floor plans in project" value={`${shown.length} of ${plans.length || 0}`} tone={shown.length ? 'ok' : 'warn'} />
          <Stat label="Last addition" value={recent[0] ? new Date(seenAt(recent[0].key)).toLocaleTimeString() : '—'} />
        </div>
        <div className="progress-bar" aria-label={`${Math.round((100 * done) / Math.max(1, els.length))} % complete`}><span style={{ width: `${(100 * done) / Math.max(1, els.length)}%` }} /></div>
      </Card>

      <Card title="Sheet index" tip="Sheet numbers follow the US National CAD Standard (G general, A architectural, FA fire alarm, T telecommunications, TY security).">
        <table className="tbl"><thead><tr><th>Sheet</th><th>Title</th><th>Status</th></tr></thead>
          <tbody>{sheets.map((s) => <tr key={s.no}><td><b>{s.no}</b></td><td>{s.title}</td><td className={s.ready ? 'ok-text' : 'muted'}>{s.ready ? '✓ Ready' : 'Pending'}</td></tr>)}</tbody></table>
      </Card>

      <Card title="Recently added">
        {recent.length ? <ul className="results">{recent.map((e) => <li key={e.key}><span><b>{e.label}</b> <span className="muted">· {e.sheet}</span><br /><span className="small">{e.value}</span></span><span className="small muted">{new Date(seenAt(e.key)).toLocaleString()}</span></li>)}</ul> : <p className="muted">Nothing yet. Values show up here as you add them.</p>}
      </Card>

      {plan ? <Card title={`Floor plan: ${plan.level}`} className="wide" actions={plans.length > 1 ? <select value={plan.id} onChange={(e) => setPid(e.target.value)} data-no-choose style={{ width: 'auto' }}>{plans.map((x) => <option key={x.id} value={x.id}>A-{101 + x.floor} {x.level}</option>)}</select> : undefined}>
        {!plan.integrated && <p className="note">This plan is not in the project plan and build yet. <a href="#floorplan" onClick={(e) => { e.preventDefault(); go('floorplan'); }}>Add it on Floor Plan to 2D / 3D</a>.</p>}
        <div className="fp-preview">
          <aside><h4>Layers</h4><LayerBoxes plan={plan} scene={scene} off={plan.off ?? []} setOff={setOff} /></aside>
          <div className="fp-views both"><div className="fp-2d"><PlanSheet2D plan={plan} scene={scene} off={plan.off ?? []} title={plan.level} northDeg={p.blueprint?.planNorthDeg ?? 0} /></div><Plan3D plan={plan} scene={scene} off={plan.off ?? []} height={380} /></div>
        </div>
        {plan.scale.ftPerPx && <PlanSchedules plan={plan} />}
      </Card> : <Card title="Floor plan" className="wide"><p>No floor plan yet. <button className="primary" onClick={() => go('floorplan')}>Upload or create one</button></p></Card>}

      {kinds && kinds.m.size > 0 && <Card title="Device schedule" className="wide">
        <table className="tbl"><thead><tr><th>Device</th><th>Total</th>{Array.from({ length: kinds.floors }, (_, i) => <th key={i}>Level {i + 1}</th>)}</tr></thead>
          <tbody>{[...kinds.m].map(([k, a]) => <tr key={k}><td>{KIND_LABEL[k]}</td><td><b>{a.reduce((x, y) => x + (y ?? 0), 0)}</b></td>{Array.from({ length: kinds.floors }, (_, i) => <td key={i}>{a[i] ?? 0}</td>)}</tr>)}</tbody></table>
      </Card>}

      <Card title="Build elements" className="wide" tip="Each value the final output needs, where it shows up, and the page where it is added.">
        {groups.map((g) => <React.Fragment key={g}><h4>{g}</h4>
          <table className="tbl"><tbody>{els.filter((e) => e.group === g).map((e) => <tr key={e.key} className={e.value ? '' : 'pending'}>
            <td style={{ width: 28 }}>{e.value ? '✓' : '○'}</td><td>{e.label}</td><td>{e.value || <span className="muted">Not added yet</span>}</td><td className="small muted">{e.sheet}</td>
            <td className="nowrap"><a href={'#' + e.page} onClick={(ev) => { ev.preventDefault(); go(e.page); }}>{e.value ? 'Edit' : 'Add'} on {label(e.page)}</a></td></tr>)}</tbody></table></React.Fragment>)}
      </Card>
    </div>
  );
}
