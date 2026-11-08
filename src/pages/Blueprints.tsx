import React, { useEffect, useMemo, useState } from 'react';
import { useStore, downloadText, downloadBytes, safeName } from '../store';
import { Card } from '../components/ui';
import { autoDesign, defaultInputs, AutoResult, BLDG, Kind, KIND_LABEL, Device } from '../engine/autodesign';
import { SHEETS, SheetSize, SCALES, drawArea, pickScale, sheetList, SheetDef, devicesFor, tagsFor, SYMBOL, NFPA72_SHOP, GENERAL_NOTES, plansDxf, DISCIPLINE } from '../engine/blueprint';
import { codesFor, CODE_SETS } from '../compliance/codesets';
import { projectPlace } from '../compliance/place';
import { alarmBatteryAh } from '../engine/alarm';
import { zip } from '../engine/gisexport';
import { projectSystems } from '../data/systems';
import type { Project, Blueprint } from '../types';

export const defaultBlueprint = (): Blueprint => ({ size: 'ARCH D', scale: 'auto', drawnBy: '', checkedBy: '', revisions: [{ rev: '0', date: new Date().toISOString().slice(0, 10), desc: 'Issued for permit' }], off: [] });
const T = (s: unknown) => String(s ?? '');
const wrap = (s: string, chars: number) => { const out: string[] = []; let line = ''; for (const w of s.split(/\s+/)) { if ((line + ' ' + w).trim().length > chars && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; };

function Sym({ k, x, y, s }: { k: Kind; x: number; y: number; s: number }) {
  const sy = SYMBOL[k], fs = sy.tag.length > 2 ? s * 0.42 : s * 0.6, sw = s * 0.08;
  const shape = sy.shape === 'circle' ? <circle cx={x} cy={y} r={s / 2} fill="#fff" stroke="#000" strokeWidth={sw} />
    : sy.shape === 'square' ? <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill="#fff" stroke="#000" strokeWidth={sw} />
    : sy.shape === 'triangle' ? <polygon points={`${x},${y - s / 2} ${x + s / 2},${y + s / 2} ${x - s / 2},${y + s / 2}`} fill="#fff" stroke="#000" strokeWidth={sw} />
    : <polygon points={Array.from({ length: 6 }, (_, i) => `${x + (s / 2) * Math.cos((Math.PI / 3) * i)},${y + (s / 2) * Math.sin((Math.PI / 3) * i)}`).join(' ')} fill="#fff" stroke="#000" strokeWidth={sw} />;
  return <g>{shape}<text x={x} y={y + fs * 0.35 + (sy.shape === 'triangle' ? s * 0.12 : 0)} fontSize={fs} textAnchor="middle" fontWeight={700}>{sy.tag}</text></g>;
}

/** Rows of text as a ruled table, positioned in inches. */
function Table({ x, y, cols, rows, fs = 0.1, head = true }: { x: number; y: number; cols: number[]; rows: string[][]; fs?: number; head?: boolean }) {
  const rh = fs * 1.7, w = cols.reduce((a, b) => a + b, 0); let cx = x;
  const xs = cols.map((c) => { const v = cx; cx += c; return v; });
  return <g fontSize={fs}>
    <rect x={x} y={y} width={w} height={rh * rows.length} fill="none" stroke="#000" strokeWidth={0.012} />
    {rows.map((r, i) => <g key={i}>{i > 0 && <line x1={x} y1={y + rh * i} x2={x + w} y2={y + rh * i} stroke="#000" strokeWidth={i === 1 && head ? 0.02 : 0.006} />}
      {r.map((c, j) => <text key={j} x={xs[j] + fs * 0.4} y={y + rh * i + rh * 0.68} fontWeight={i === 0 && head ? 700 : 400}>{T(c).slice(0, Math.floor(cols[j] / (fs * 0.55)))}</text>)}</g>)}
    {xs.slice(1).map((v, j) => <line key={j} x1={v} y1={y} x2={v} y2={y + rh * rows.length} stroke="#000" strokeWidth={0.006} />)}
  </g>;
}

interface Ctx { p: Project; r: AutoResult; bp: Blueprint; L: number; W: number; floors: number; sheets: SheetDef[] }

function TitleBlock({ c, sh, idx }: { c: Ctx; sh: SheetDef; idx: number }) {
  const { w, h } = SHEETS[c.bp.size as SheetSize], a = drawArea(c.bp.size as SheetSize), x = w - a.m - a.tb, y = a.m, tw = a.tb, fs = Math.min(0.11, tw / 26);
  const co = c.p.company, m = c.p.meta; let cy = y + 0.25;
  const line = (s: string, bold = false, size = fs) => { const el = <text key={cy} x={x + 0.12} y={cy} fontSize={size} fontWeight={bold ? 700 : 400}>{s}</text>; cy += size * 1.45; return el; };
  const sep = () => { const el = <line key={'s' + cy} x1={x} y1={cy - fs * 0.6} x2={x + tw} y2={cy - fs * 0.6} stroke="#000" strokeWidth={0.015} />; cy += fs * 0.6; return el; };
  const part1 = [line(co.name || 'COMPANY NAME', true, fs * 1.25), ...wrap([co.address, co.city, co.state, co.zip].filter(Boolean).join(', '), tw / (fs * 0.5)).map((l) => line(l)), line([co.phone, co.email].filter(Boolean).join('  ')), co.license ? line(`License ${co.license}`) : null, sep(),
    line('PROJECT', true), ...wrap(m.name || 'Project', tw / (fs * 0.6)).map((l) => line(l, true, fs * 1.15)), ...wrap(m.siteAddress || '', tw / (fs * 0.5)).map((l) => line(l)), line([m.city, m.county, m.state].filter(Boolean).join(', ')), line(`Owner: ${m.client || '—'}`), m.number ? line(`Project no. ${m.number}`) : null, sep()];
  const sealY = cy, seal = Math.min(tw - 0.24, 2.4); cy += seal + 0.2;
  const revRows = [['REV', 'DATE', 'DESCRIPTION'], ...c.bp.revisions.slice(-4).map((r) => [r.rev, r.date, r.desc])];
  const revY = cy; cy += fs * 1.7 * revRows.length + 0.15;
  const infoY = cy;
  return <g>
    <rect x={x} y={y} width={tw} height={h - 2 * a.m} fill="none" stroke="#000" strokeWidth={0.03} />
    {part1}
    <rect x={x + 0.12} y={sealY} width={seal} height={seal} fill="none" stroke="#000" strokeWidth={0.01} strokeDasharray="0.05 0.05" />
    <text x={x + 0.12 + seal / 2} y={sealY + seal / 2} fontSize={fs * 0.9} textAnchor="middle">ENGINEER / DESIGNER SEAL</text>
    <text x={x + 0.12 + seal / 2} y={sealY + seal / 2 + fs * 1.3} fontSize={fs * 0.75} textAnchor="middle">NOT FOR CONSTRUCTION UNTIL SEALED</text>
    <Table x={x + 0.08} y={revY} cols={[tw * 0.15, tw * 0.3, tw * 0.5]} rows={revRows} fs={fs * 0.85} />
    <Table x={x + 0.08} y={infoY} cols={[tw * 0.38, tw * 0.57]} head={false} fs={fs * 0.85} rows={[['DRAWN BY', c.bp.drawnBy || '—'], ['CHECKED BY', c.bp.checkedBy || '—'], ['DATE', c.bp.revisions[c.bp.revisions.length - 1]?.date ?? ''], ['SCALE', sh.kind === 'plan' ? scaleOf(c).label : 'NONE'], ['SHEET', `${idx + 1} OF ${c.sheets.length}`]]} />
    {wrap(sh.title.toUpperCase(), tw / (fs * 0.75)).map((l, i, arr) => <text key={i} x={x + 0.12} y={h - a.m - 0.95 - (arr.length - 1 - i) * fs * 1.4} fontSize={fs * 1.05} fontWeight={700}>{l}</text>)}
    <line x1={x} y1={h - a.m - 0.8} x2={x + tw} y2={h - a.m - 0.8} stroke="#000" strokeWidth={0.02} />
    <text x={x + tw / 2} y={h - a.m - 0.22} fontSize={Math.min(0.55, tw / 5)} textAnchor="middle" fontWeight={700}>{sh.no}</text>
  </g>;
}
const scaleOf = (c: Ctx) => { const a = drawArea(c.bp.size as SheetSize); return c.bp.scale === 'auto' ? pickScale(c.L, c.W, a.w - 1, a.h - 1.6) : SCALES.find((s) => s.id === c.bp.scale) ?? SCALES[2]; };

function PlanSheet({ c, sh }: { c: Ctx; sh: SheetDef }) {
  const a = drawArea(c.bp.size as SheetSize), sc = scaleOf(c), s = sc.inPerFt, bw = c.L * s, bh = c.W * s;
  const ox = a.x + Math.max(0.3, (a.w - bw) / 2), oy = a.y + Math.max(0.6, (a.h - 1.2 - bh) / 2);
  const list = devicesFor(c.r, sh.disc, sh.floor), tags = tagsFor(list), sym = Math.max(0.16, Math.min(0.3, a.w / 120)), fit = bw <= a.w && bh <= a.h - 1.2;
  const kinds = [...new Set(list.map((d) => d.kind))], dim = 0.25, fs = 0.1;
  const bar = [0, 10, 20, 40].filter((v) => v * s <= a.w / 3);
  return <g>
    {!fit && <text x={a.x} y={a.y + 0.2} fontSize={0.14} fill="#c00">Building does not fit at this scale: pick a smaller scale or a larger sheet.</text>}
    <rect x={ox} y={oy} width={bw} height={bh} fill="none" stroke="#000" strokeWidth={0.04} />
    {/* overall dimensions */}
    <line x1={ox} y1={oy - dim} x2={ox + bw} y2={oy - dim} stroke="#000" strokeWidth={0.01} /><line x1={ox} y1={oy - dim - 0.08} x2={ox} y2={oy - 0.05} stroke="#000" strokeWidth={0.01} /><line x1={ox + bw} y1={oy - dim - 0.08} x2={ox + bw} y2={oy - 0.05} stroke="#000" strokeWidth={0.01} />
    <text x={ox + bw / 2} y={oy - dim - 0.06} fontSize={fs} textAnchor="middle">{ftIn(c.L)}</text>
    <line x1={ox - dim} y1={oy} x2={ox - dim} y2={oy + bh} stroke="#000" strokeWidth={0.01} />
    <text x={ox - dim - 0.06} y={oy + bh / 2} fontSize={fs} textAnchor="middle" transform={`rotate(-90 ${ox - dim - 0.06} ${oy + bh / 2})`}>{ftIn(c.W)}</text>
    {list.map((d, i) => { const x = ox + d.x * s, y = oy + d.y * s; return <g key={i}><Sym k={d.kind} x={x} y={y} s={d.kind === 'tr' || d.kind === 'facp' ? sym * 1.5 : sym} /><text x={x + sym * 0.65} y={y - sym * 0.45} fontSize={sym * 0.38}>{tags[i]}</text></g>; })}
    {/* north arrow, scale bar, drawing title */}
    <g transform={`translate(${a.x + a.w - 0.5} ${a.y + 0.6})`}><circle r={0.3} fill="none" stroke="#000" strokeWidth={0.015} /><polygon points="0,-0.28 0.1,0.1 0,0.02 -0.1,0.1" fill="#000" /><text y={-0.36} fontSize={0.14} textAnchor="middle" fontWeight={700}>N</text></g>
    <g transform={`translate(${a.x + 0.2} ${a.y + a.h - 0.25})`}>
      <circle cx={0.25} cy={-0.35} r={0.22} fill="none" stroke="#000" strokeWidth={0.02} /><text x={0.25} y={-0.31} fontSize={0.13} textAnchor="middle" fontWeight={700}>{(sh.floor ?? 0) + 1}</text>
      <text x={0.6} y={-0.38} fontSize={0.17} fontWeight={700}>FLOOR {(sh.floor ?? 0) + 1} PLAN: {sh.title.split(':')[0].toUpperCase()}</text>
      <text x={0.6} y={-0.18} fontSize={0.11}>SCALE: {sc.label}</text>
      {bar.length > 1 && <g transform="translate(3.2 -0.3)">{bar.slice(0, -1).map((v, i) => <rect key={v} x={v * s} y={0} width={(bar[i + 1] - v) * s} height={0.06} fill={i % 2 ? '#fff' : '#000'} stroke="#000" strokeWidth={0.01} />)}{bar.map((v) => <text key={v} x={v * s} y={-0.04} fontSize={0.08} textAnchor="middle">{v}'</text>)}</g>}
    </g>
    {/* legend */}
    <g transform={`translate(${a.x + a.w - 2.6} ${a.y + a.h - 0.25 - kinds.length * 0.26})`}><text y={-0.1} fontSize={0.11} fontWeight={700}>LEGEND</text>{kinds.map((k, i) => <g key={k} transform={`translate(0 ${i * 0.26})`}><Sym k={k} x={0.12} y={0.1} s={0.18} /><text x={0.32} y={0.14} fontSize={0.09}>{KIND_LABEL[k]} ({list.filter((d) => d.kind === k).length})</text></g>)}</g>
  </g>;
}
const ftIn = (ft: number) => { const f = Math.floor(ft), i = Math.round((ft - f) * 12); return `${f}'-${i}"`; };

function CoverSheet({ c }: { c: Ctx }) {
  const a = drawArea(c.bp.size as SheetSize), m = c.p.meta, pl = projectPlace(c.p), h = codesFor(pl.state, pl.county, pl.city), colW = a.w / 2 - 0.3, fs = Math.min(0.11, a.w / 300);
  const codes = [...(h.localSet ? h.localSet.codes.map((e) => [e.cat, `${e.code} (${h.localSet!.name})`]) : []), ...h.set.current.filter((e) => ['Building', 'Fire', 'Fire alarm', 'Electrical', 'Life safety', 'Emergency responder radio', 'Accessibility'].includes(e.cat)).map((e) => [e.cat, e.code])].slice(0, 14);
  const kinds = [...new Set([...c.r.trs, ...c.r.devices].map((d) => d.kind))], ad = { ...defaultInputs(), ...(c.p.autoDesign ?? {}) };
  const right = a.x + a.w / 2 + 0.2;
  return <g>
    <text x={a.x} y={a.y + 0.5} fontSize={Math.min(0.45, a.w / 50)} fontWeight={700}>{(m.name || 'PROJECT').toUpperCase()}</text>
    <text x={a.x} y={a.y + 0.85} fontSize={0.16}>{[m.siteAddress, m.city, CODE_SETS[pl.state].name].filter(Boolean).join(', ')}</text>
    <text x={a.x} y={a.y + 1.1} fontSize={0.14}>{projectSystems(m).map((s) => s.label).join(' · ').toUpperCase()}</text>
    <text x={a.x} y={a.y + 1.55} fontSize={fs * 1.2} fontWeight={700}>PROJECT DATA</text>
    <Table x={a.x} y={a.y + 1.65} cols={[colW * 0.35, colW * 0.65]} head={false} fs={fs} rows={[['Owner', m.client || '—'], ['Building use', BLDG[ad.bldg].label], ['Floors', String(ad.floors)], ['Floor area', `${(ad.lengthFt * ad.widthFt).toLocaleString()} sq ft per floor`], ['Jurisdiction', [pl.city, pl.county, pl.state].filter(Boolean).join(', ')], ['Designer', m.engineer || '—'], ['Contractor', c.p.company.name || '—']]} />
    <text x={a.x} y={a.y + 3.3} fontSize={fs * 1.2} fontWeight={700}>CODES AND STANDARDS (CONFIRM WITH THE AHJ)</text>
    <Table x={a.x} y={a.y + 3.4} cols={[colW * 0.3, colW * 0.7]} fs={fs} rows={[['Type', 'Code / edition'], ...codes.map(([k, v]) => [k, v])]} />
    <text x={a.x} y={a.y + 3.6 + fs * 1.7 * (codes.length + 1) + 0.2} fontSize={fs * 1.2} fontWeight={700}>GENERAL NOTES</text>
    {GENERAL_NOTES.flatMap((n, i) => wrap(`${i + 1}. ${n}`, colW / (fs * 0.5)).map((l) => ({ l, i }))).map((x, j) => <text key={j} x={a.x} y={a.y + 3.6 + fs * 1.7 * (codes.length + 1) + 0.4 + j * fs * 1.45} fontSize={fs}>{x.l}</text>)}
    <text x={right} y={a.y + 1.55} fontSize={fs * 1.2} fontWeight={700}>SHEET INDEX</text>
    <Table x={right} y={a.y + 1.65} cols={[colW * 0.2, colW * 0.8]} fs={fs} rows={[['Sheet', 'Title'], ...c.sheets.map((s) => [s.no, s.title])]} />
    <text x={right} y={a.y + 1.95 + fs * 1.7 * (c.sheets.length + 1)} fontSize={fs * 1.2} fontWeight={700}>SYMBOLS LEGEND</text>
    {kinds.map((k, i) => { const col = i % 2, row = Math.floor(i / 2), y = a.y + 2.15 + fs * 1.7 * (c.sheets.length + 1) + row * 0.32; return <g key={k}><Sym k={k} x={right + 0.15 + col * colW / 2} y={y} s={0.22} /><text x={right + 0.4 + col * colW / 2} y={y + 0.04} fontSize={fs}>{KIND_LABEL[k]}</text></g>; })}
  </g>;
}

function RiserSheet({ c, sh }: { c: Ctx; sh: SheetDef }) {
  const a = drawArea(c.bp.size as SheetSize), band = Math.min(1.6, (a.h - 1.4) / c.floors), x0 = a.x + 1.2, bw = Math.min(a.w - 2, 9);
  const head = c.r.trs.find((t) => t.floor === 0);
  return <g>
    <text x={a.x} y={a.y + 0.35} fontSize={0.2} fontWeight={700}>{sh.title.toUpperCase()}</text><text x={a.x} y={a.y + 0.6} fontSize={0.11}>SCALE: NONE</text>
    {Array.from({ length: c.floors }, (_, f) => {
      const y = a.y + a.h - 0.6 - (f + 1) * band, list = devicesFor(c.r, sh.disc, f).filter((d) => d.kind !== 'tr'), counts = [...new Set(list.map((d) => d.kind))].map((k) => [k, list.filter((d) => d.kind === k).length] as [Kind, number]);
      return <g key={f}>
        <line x1={a.x} y1={y + band} x2={a.x + a.w} y2={y + band} stroke="#000" strokeWidth={0.012} strokeDasharray="0.15 0.08" />
        <text x={a.x} y={y + band - 0.1} fontSize={0.13} fontWeight={700}>FLOOR {f + 1}</text>
        <rect x={x0 + 0.6} y={y + 0.2} width={bw} height={band - 0.45} fill="none" stroke="#000" strokeWidth={0.015} />
        {counts.map(([k, n], i) => <g key={k}><Sym k={k} x={x0 + 0.95 + i * 1.15} y={y + 0.2 + (band - 0.45) / 2} s={0.3} /><text x={x0 + 1.15 + i * 1.15} y={y + 0.24 + (band - 0.45) / 2} fontSize={0.11}>×{n}</text></g>)}
        <line x1={x0} y1={y + 0.2 + (band - 0.45) / 2} x2={x0 + 0.6} y2={y + 0.2 + (band - 0.45) / 2} stroke="#000" strokeWidth={0.02} />
      </g>;
    })}
    <line x1={x0} y1={a.y + a.h - 0.6 - c.floors * band + 0.2 + (band - 0.45) / 2} x2={x0} y2={a.y + a.h - 0.6 - band + 0.2 + (band - 0.45) / 2} stroke="#000" strokeWidth={0.03} />
    {head && <g><Sym k={sh.disc === 'FA' ? 'facp' : 'tr'} x={x0 - 0.45} y={a.y + a.h - 0.6 - band + 0.2 + (band - 0.45) / 2} s={0.5} /><line x1={x0 - 0.2} y1={a.y + a.h - 0.6 - band + 0.2 + (band - 0.45) / 2} x2={x0} y2={a.y + a.h - 0.6 - band + 0.2 + (band - 0.45) / 2} stroke="#000" strokeWidth={0.03} /></g>}
    <text x={a.x} y={a.y + a.h - 0.15} fontSize={0.1}>Riser shows device counts per floor and the backbone to the {sh.disc === 'FA' ? 'fire alarm control unit' : 'head-end / telecom room'}. Circuit numbering and wiring classes per the panel manufacturer.</text>
  </g>;
}

function ScheduleSheet({ c, sh }: { c: Ctx; sh: SheetDef }) {
  const a = drawArea(c.bp.size as SheetSize), list = devicesFor(c.r, sh.disc).filter((d) => d.kind !== 'tr'), kinds = [...new Set(list.map((d) => d.kind))], fs = 0.1, cw = a.w / 2 - 0.3;
  const sched = [['Tag', 'Device', ...Array.from({ length: c.floors }, (_, f) => `Fl ${f + 1}`), 'Total'], ...kinds.map((k) => [SYMBOL[k].tag, KIND_LABEL[k], ...Array.from({ length: c.floors }, (_, f) => String(list.filter((d) => d.kind === k && d.floor === f).length)), String(list.filter((d) => d.kind === k).length)])];
  const equip = [['Equipment', 'Recommended spec', 'Qty'], ...c.r.equipment.filter((e) => (DISCIPLINE[systemIdOf(e.system)]?.prefix ?? '') === sh.disc || sh.disc === 'T' && /cabl|network|fiber/i.test(e.system)).map((e) => [e.item, e.spec, `${e.qty} ${e.unit}`])];
  const b = alarmBatteryAh(c.p.alarm);
  const fa = sh.disc === 'FA';
  const seq = [['Input \\ Output', 'General alarm (NAC)', 'Notify central station', 'Annunciate at FACP', 'HVAC shutdown', 'Elevator recall', 'Door release'],
    ['Smoke detector', '●', '●', '●', '● (duct)', '● (lobby / shaft)', '●'], ['Manual pull station', '●', '●', '●', '', '', '●'], ['Sprinkler waterflow', '●', '●', '●', '', '', '●'], ['Supervisory (tamper)', '', '● (sup.)', '●', '', '', ''], ['Trouble', '', '● (trbl.)', '●', '', '', '']];
  const sCols = [0.5, 1.9, ...Array.from({ length: c.floors }, () => 0.5), 0.6];
  return <g>
    <text x={a.x} y={a.y + 0.35} fontSize={0.2} fontWeight={700}>DEVICE SCHEDULE</text>
    <Table x={a.x} y={a.y + 0.5} cols={sCols} fs={fs} rows={sched} />
    <text x={a.x} y={a.y + 0.9 + sched.length * fs * 1.7} fontSize={0.2} fontWeight={700}>EQUIPMENT</text>
    <Table x={a.x} y={a.y + 1.05 + sched.length * fs * 1.7} cols={[cw * 0.42, cw * 0.43, cw * 0.15]} fs={fs} rows={equip} />
    {fa && <>
      <text x={a.x + a.w / 2} y={a.y + 0.35} fontSize={0.2} fontWeight={700}>SECONDARY POWER (BATTERY) CALCULATION</text>
      <Table x={a.x + a.w / 2} y={a.y + 0.5} cols={[cw * 0.5, cw * 0.15, cw * 0.17, cw * 0.18]} fs={fs} rows={[['Device', 'Qty', 'Standby mA', 'Alarm mA'], ...c.p.alarm.devices.map((d) => [d.name, String(d.qty), String(d.standbyMa), String(d.alarmMa)]),
        ['Standby', '', `${b.standbyA.toFixed(3)} A`, `× ${c.p.alarm.standbyHours} h`], ['Alarm', '', `${b.alarmA.toFixed(3)} A`, `× ${c.p.alarm.alarmMinutes} min`], ['Required with safety factor', '', '', `${b.requiredAh.toFixed(1)} Ah`], ['Installed', '', '', `${c.p.alarm.installedBatteryAh} Ah`]]} />
      <text x={a.x + a.w / 2} y={a.y + 1.2 + (c.p.alarm.devices.length + 5) * fs * 1.7} fontSize={0.2} fontWeight={700}>SEQUENCE OF OPERATIONS</text>
      <Table x={a.x + a.w / 2} y={a.y + 1.35 + (c.p.alarm.devices.length + 5) * fs * 1.7} cols={[cw * 0.22, ...Array.from({ length: 6 }, () => cw * 0.13)]} fs={fs * 0.8} rows={seq} />
      <text x={a.x + a.w / 2} y={a.y + 1.6 + (c.p.alarm.devices.length + 5) * fs * 1.7 + seq.length * fs * 0.8 * 1.7} fontSize={fs}>Confirm every output with the owner, the mechanical engineer and the AHJ.</text>
    </>}
  </g>;
}
const systemIdOf = (label: string) => (Object.entries(DISCIPLINE).find(([, v]) => label.toLowerCase().startsWith(v.title.toLowerCase().split(' ')[0]))?.[0] ?? label);

function Sheet({ c, sh, idx }: { c: Ctx; sh: SheetDef; idx: number }) {
  const { w, h } = SHEETS[c.bp.size as SheetSize], m = drawArea(c.bp.size as SheetSize).m;
  return <svg className="bp-svg" viewBox={`0 0 ${w} ${h}`} width={`${w}in`} height={`${h}in`} xmlns="http://www.w3.org/2000/svg" fontFamily="Arial, Helvetica, sans-serif" role="img" aria-label={`Sheet ${sh.no}`}>
    <rect width={w} height={h} fill="#fff" />
    <rect x={m / 2} y={m / 2} width={w - m} height={h - m} fill="none" stroke="#000" strokeWidth={0.04} />
    {sh.kind === 'cover' ? <CoverSheet c={c} /> : sh.kind === 'plan' ? <PlanSheet c={c} sh={sh} /> : sh.kind === 'riser' ? <RiserSheet c={c} sh={sh} /> : <ScheduleSheet c={c} sh={sh} />}
    <TitleBlock c={c} sh={sh} idx={idx} />
  </svg>;
}

export function BlueprintsPage() {
  const { project: p, update, go } = useStore();
  const bp: Blueprint = { ...defaultBlueprint(), ...(p.blueprint ?? {}) };
  const set = <K extends keyof Blueprint>(k: K, v: Blueprint[K]) => update((d) => { d.blueprint = { ...defaultBlueprint(), ...(d.blueprint ?? {}), [k]: v }; });
  const x = { ...defaultInputs(), ...(p.autoDesign ?? {}) };
  const r = useMemo(() => autoDesign(p, x), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = sheetList(r, Math.max(1, x.floors));
  const sheets = all.filter((s) => !bp.off.includes(s.no));
  const c: Ctx = { p, r, bp, L: x.lengthFt, W: x.widthFt, floors: Math.max(1, x.floors), sheets };
  const [view, setView] = useState(0);
  const [msg, setMsg] = useState('');
  const sz = SHEETS[bp.size as SheetSize];
  useEffect(() => { const st = document.createElement('style'); st.textContent = `@media print { @page { size: ${sz.w}in ${sz.h}in; margin: 0; } }`; document.head.appendChild(st); return () => st.remove(); }, [sz.w, sz.h]);
  const svgOf = (i: number) => { const el = document.querySelectorAll('.bp-sheet svg')[i]; return el ? '<?xml version="1.0" encoding="UTF-8"?>\n' + el.outerHTML : ''; };
  const base = safeName(p.meta.name || 'project');
  const fa = projectSystems(p.meta).some((s) => s.id === 'firealarm' || s.id === 'massnotif');
  if (!r.devices.length) return <Card title="Blueprints"><p>No devices to draw yet. Pick the project type and describe the building on <a href="#autodesign" onClick={(e) => { e.preventDefault(); go('autodesign'); }}>Auto-Design & 3D Model</a>; the drawing set is made from that layout.</p></Card>;
  return (
    <div className="stack">
      <Card title="Drawing set" className="no-print" tip="A permit and shop-drawing set made from the Auto-Design layout: cover sheet with codes, sheet index, symbols and notes; a plan per floor at an architectural scale; riser diagram; schedules and calculations. Title block on every sheet.">
        <div className="form">
          <label className="field"><span>Sheet size</span><select value={bp.size} onChange={(e) => set('size', e.target.value)} aria-label="Sheet size">{Object.entries(SHEETS).map(([k, v]) => <option key={k} value={k}>{k}: {v.note}</option>)}</select></label>
          <label className="field"><span>Plan scale</span><select value={bp.scale} onChange={(e) => set('scale', e.target.value)} aria-label="Plan scale"><option value="auto">Largest that fits ({scaleOf(c).label})</option>{SCALES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label className="field"><span>Drawn by</span><input value={bp.drawnBy} onChange={(e) => set('drawnBy', e.target.value)} /></label>
          <label className="field"><span>Checked by</span><input value={bp.checkedBy} onChange={(e) => set('checkedBy', e.target.value)} /></label>
        </div>
        <h4>Revisions</h4>
        <table className="tbl"><thead><tr><th>Rev</th><th>Date</th><th>Description</th><th /></tr></thead><tbody>{bp.revisions.map((rv, i) => <tr key={i}>
          <td><input value={rv.rev} style={{ width: 50 }} onChange={(e) => set('revisions', bp.revisions.map((y, j) => j === i ? { ...y, rev: e.target.value } : y))} aria-label="Revision" /></td>
          <td><input type="date" value={rv.date} onChange={(e) => set('revisions', bp.revisions.map((y, j) => j === i ? { ...y, date: e.target.value } : y))} aria-label="Revision date" /></td>
          <td><input value={rv.desc} onChange={(e) => set('revisions', bp.revisions.map((y, j) => j === i ? { ...y, desc: e.target.value } : y))} aria-label="Revision description" /></td>
          <td>{bp.revisions.length > 1 && <button className="ghost" onClick={() => set('revisions', bp.revisions.filter((_, j) => j !== i))}>✕</button>}</td></tr>)}</tbody></table>
        <button onClick={() => set('revisions', [...bp.revisions, { rev: String(bp.revisions.length), date: new Date().toISOString().slice(0, 10), desc: 'Revised per AHJ comments' }])}>+ Add revision</button>
        <h4>Sheets ({sheets.length} of {all.length})</h4>
        <div className="row wrap">{all.map((s) => <label key={s.no} className="check"><input type="checkbox" checked={!bp.off.includes(s.no)} onChange={(e) => set('off', e.target.checked ? bp.off.filter((n) => n !== s.no) : [...bp.off, s.no])} /> {s.no}</label>)}</div>
        <h4>Print and export</h4>
        <div className="row wrap">
          <button className="primary" onClick={() => window.print()}>🖨 Print / Save as PDF ({bp.size})</button>
          <button onClick={() => { downloadText(`${base}-plans.dxf`, plansDxf(r, x.lengthFt, x.widthFt, Math.max(1, x.floors)), 'application/dxf'); setMsg('DXF saved: opens in AutoCAD and other CAD programs, in feet, one layer per system ✓'); }}>⬇ CAD drawing (.dxf)</button>
          <button onClick={() => { downloadText(`${base}-${sheets[view]?.no}.svg`, svgOf(view), 'image/svg+xml'); }}>⬇ This sheet (.svg)</button>
          <button onClick={() => { downloadBytes(`${base}-sheets.zip`, zip(sheets.map((s, i) => ({ name: `${s.no}.svg`, data: svgOf(i) }))), 'application/zip'); setMsg(`${sheets.length} sheets saved in a .zip ✓`); }}>⬇ All sheets (.zip)</button>
        </div>
        <p className="small muted">For a PDF, press Print, choose “Save as PDF”, and set the paper to {bp.size} ({sz.w} × {sz.h} in) if it is not picked automatically. Print at 100% (no “fit to page”) so the scale stays true.</p>
        {msg && <p className="note" role="status">{msg}</p>}
      </Card>
      {fa && <Card title="NFPA 72 shop drawing checklist" className="no-print" tip="What NFPA 72 asks fire alarm shop drawings to show, and where this set covers it. Some items need the panel manufacturer's software or your design decisions.">
        <table className="tbl"><thead><tr><th>Required</th><th>In this set</th></tr></thead><tbody>{NFPA72_SHOP.map((x) => <tr key={x.item}><td>{x.item}</td><td className="small">{x.in}</td></tr>)}</tbody></table>
      </Card>}
      <Card title="Sheets" className="no-print" actions={<select value={view} onChange={(e) => setView(+e.target.value)} aria-label="Sheet to view">{sheets.map((s, i) => <option key={s.no} value={i}>{s.no}: {s.title}</option>)}</select>}>
        <p className="small muted">Shown scaled to fit the screen. Every sheet below prints at full size.</p>
      </Card>
      <div className="bp-set">{sheets.map((s, i) => <div key={s.no} className={'bp-sheet' + (i === view ? ' on' : '')}><Sheet c={c} sh={s} idx={i} /></div>)}</div>
      <p className="small muted no-print">Device locations come from a rules-of-thumb layout and must be adjusted to the real floor plan. A licensed engineer or a NICET-certified designer (as the AHJ requires) must review, complete and seal the drawings before submittal. Check the AHJ’s own submittal requirements for sheet size, number of copies and electronic format.</p>
    </div>
  );
}
