// Sound side of the Indoor planner: paging, pro sound, mass notification / voice evacuation speakers and fire
// alarm horns placed on the same floor plan and walls as the radio planner. Shows a sound-level (dBA) or
// speech-clarity (STI) heat map, plain-language advice, reading pins with balance advice, STIPA readings,
// the indoor voice and alarm codes for the project's state, test records, and how loud the project's
// outdoor warning sirens are inside the building. Fully offline.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FullView } from './FullView';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Stat, fmt } from './ui';
import { WALL_MATERIALS } from '../engine/indoor';
import { uid } from '../defaults';
import type { IndoorDesign } from '../types';
import { Indoor3D } from './Indoor3D';
import { askDelete } from './askConfirm';
import { PinsPanel, drawCanvasPin, type PinRow } from './ReadingPins';
import { SPL_SCALE, splColor, pinColor, fmtQ, type BPoint, type BSource, type ReadingPin } from '../engine/balance';
import { useUnits } from '../units';
import {
  INDOOR_VOICE_CODES, OUTSIDE_IN_DBA, ROOM_FINISH, SOUND_SYSTEM_LABEL, SPEAKER_KINDS, STI_SCALE, TAPS, isVoice, levelAt1m, normalizeIndoorSound,
  soundAdvice, soundAt, soundGrid, soundRule, soundWallTl, stiColor, stiWord, type IndoorSound, type Occupancy, type SoundSystem, type SpeakerKind,
} from '../engine/indoorSound';
import { codesFor } from '../compliance/codesets';
import { projectPlace } from '../compliance/place';
import { currentUser } from '../engine/accounts';
import { checkPoint, sirenPlan } from '../engine/sirens';

type Tool = 'wall' | 'speaker' | 'pin' | 'sti' | 'erase';
const SOUND_PIN_SYSTEMS: SoundSystem[] = ['massnotif', 'firealarm', 'paging', 'sound'];
const HORN_SETTINGS: [number, string][] = [[92, 'High (about 92 dBA at 10 ft)'], [88, 'Medium (about 88 dBA at 10 ft)'], [84, 'Low (about 84 dBA at 10 ft)']];

export function IndoorSoundPlanner({ d, PX }: { d: IndoorDesign; PX: number }) {
  const { project: p, update, go } = useStore();
  const u = useUnits();
  const s = useMemo(() => normalizeIndoorSound(d.sound), [d.sound]);
  const setS = (fn: (x: IndoorSound) => void) => update((q) => { const n = normalizeIndoorSound(q.indoor.sound); fn(n); q.indoor.sound = n; });
  const cv = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('speaker');
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [layer, setLayer] = useState<'dba' | 'sti'>('dba');
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [pinAt, setPinAt] = useState<{ x: number; y: number } | null>(null);
  const [stiAt, setStiAt] = useState<{ x: number; y: number } | null>(null);
  const [stiVal, setStiVal] = useState<number | null>(null);
  const [stiNote, setStiNote] = useState('');
  const [saved, setSaved] = useState('');
  const me = currentUser()?.name;
  const opts = useMemo(() => ({ walls: d.walls, ceilingM: s.ceilingM, rt60: s.rt60, widthM: d.widthM, heightM: d.heightM }), [d.walls, s.ceilingM, s.rt60, d.widthM, d.heightM]);
  const rule = soundRule(s);
  const grid = useMemo(() => soundGrid(s, opts), [s, opts]);
  const advice = soundAdvice(s, grid, rule, (m) => u.len(m, 1));
  const voice = isVoice(s.system);
  const showSti = voice && layer === 'sti';
  const scale = PX / d.widthM, PY = d.heightM * scale;
  useEffect(() => { if (!d.floorPlanDataUrl) { setImg(null); return; } const i = new Image(); i.onload = () => setImg(i); i.src = d.floorPlanDataUrl; }, [d.floorPlanDataUrl]);

  // reading pins (dBA) on this plan
  const pinSys = s.system;
  const pins = (p.readingPins ?? []).filter((r) => r.map === 'indoor' && r.system === pinSys);
  const pinSaved = p.pinTargets?.[`indoor|${pinSys}`];
  const pinTarget = pinSaved?.target ?? rule.target, pinHot = pinSaved?.hot ?? rule.max;
  const predAt = (x: number, y: number) => soundAt(x, y, s, opts);
  const pinPoints: BPoint[] = useMemo(() => pins.map((r) => { const a = soundAt(r.x, r.y, s, opts); return { id: r.id, v: r.v, pred: a.dba, x: r.x, y: r.y, critical: r.critical, src: a.src >= 0 ? s.speakers[a.src].id : undefined }; }), [p.readingPins, s, opts, pinSys]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinSources: BSource[] = s.speakers.map((a) => ({ id: a.id, label: a.label, x: a.x, y: a.y }));
  const where = (x: number, y: number) => `${u.len(x, 0)} from the left and ${u.len(y, 0)} from the top`;
  const pinRows: PinRow[] = pins.map((r) => ({ id: r.id, v: r.v, pred: predAt(r.x, r.y).dba, where: where(r.x, r.y), at: r.at, note: [r.by ? `by ${r.by}` : '', r.note ?? ''].filter(Boolean).join(' · ') || undefined, photo: r.photo, critical: r.critical }));
  const savePin = (dr: { v: number; note?: string; photo?: string; critical?: boolean }) => {
    if (!pinAt) return;
    const pin: ReadingPin = { id: uid(), at: new Date().toISOString(), map: 'indoor', system: pinSys, qty: 'dba', v: dr.v, x: pinAt.x, y: pinAt.y, ...(dr.note ? { note: dr.note } : {}), ...(dr.photo ? { photo: dr.photo } : {}), ...(dr.critical ? { critical: true } : {}), ...(me ? { by: me } : {}) };
    update((q) => { q.readingPins = [...(q.readingPins ?? []), pin]; }); setPinAt(null);
  };

  useEffect(() => {
    const c = cv.current; if (!c) return;
    c.width = PX; c.height = PY;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, PX, PY);
    if (img) { g.globalAlpha = 0.85; g.drawImage(img, 0, 0, PX, PY); g.globalAlpha = 1; }
    const cw = PX / grid.nx, ch = PY / grid.ny, src = showSti ? grid.sti : grid.v;
    for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
      const [r, gg, b, a] = showSti ? stiColor(src[j * grid.nx + i]) : splColor(src[j * grid.nx + i]);
      if (a) { g.fillStyle = `rgba(${r},${gg},${b},0.5)`; g.fillRect(i * cw, j * ch, cw + 0.5, ch + 0.5); }
    }
    g.strokeStyle = '#ddd'; g.lineWidth = 0.5;
    for (let m = 0; m <= d.widthM; m += 5) { g.beginPath(); g.moveTo(m * scale, 0); g.lineTo(m * scale, PY); g.stroke(); }
    for (let m = 0; m <= d.heightM; m += 5) { g.beginPath(); g.moveTo(0, m * scale); g.lineTo(PX, m * scale); g.stroke(); }
    const walls = drag ? [...d.walls, { x1: drag.x, y1: drag.y, x2: drag.x2, y2: drag.y2, material: d.currentMaterial }] : d.walls;
    for (const w of walls) { g.strokeStyle = WALL_MATERIALS[w.material]?.color ?? '#333'; g.lineWidth = 4; g.beginPath(); g.moveTo(w.x1 * scale, w.y1 * scale); g.lineTo(w.x2 * scale, w.y2 * scale); g.stroke(); }
    for (const r of pins) drawCanvasPin(g, r.x * scale, r.y * scale, pinColor(r.v, pinTarget, pinHot, 'dba'), String(r.v));
    if (pinAt) drawCanvasPin(g, pinAt.x * scale, pinAt.y * scale, '#1e88e5', 'new');
    for (const t of [...s.sti, ...(stiAt ? [{ ...stiAt, sti: NaN, id: 'new' }] : [])]) {
      const x = t.x * scale, y = t.y * scale, [r, gg, b] = Number.isFinite(t.sti) ? stiColor(t.sti) : [30, 136, 229];
      g.save(); g.fillStyle = `rgb(${r},${gg},${b})`; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 8, y); g.lineTo(x, y + 8); g.lineTo(x - 8, y); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#000'; g.font = 'bold 11px system-ui'; g.lineWidth = 3; const lb = Number.isFinite(t.sti) ? `STI ${t.sti.toFixed(2)}` : 'new'; g.strokeText(lb, x + 10, y + 4); g.fillText(lb, x + 10, y + 4); g.restore();
    }
    for (const a of s.speakers) {
      const x = a.x * scale, y = a.y * scale, horn = a.kind === 'fahorn';
      g.fillStyle = horn ? '#d32f2f' : '#6a1b9a'; g.beginPath(); if (horn) g.rect(x - 6, y - 6, 12, 12); else g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 9px system-ui'; g.textAlign = 'center'; g.fillText(horn ? 'H' : 'S', x, y + 3); g.textAlign = 'start';
      g.fillStyle = '#000'; g.font = '12px sans-serif'; g.fillText(`${a.label}${horn ? '' : ` ${a.watts} W`}`, x + 9, y - 6);
    }
  }, [grid, img, d.walls, s.speakers, s.sti, drag, PX, PY, scale, d.widthM, d.heightM, d.currentMaterial, view, p.readingPins, pinAt, stiAt, pinSys, pinTarget, pinHot, showSti]); // eslint-disable-line react-hooks/exhaustive-deps

  const toM = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * d.widthM, y: ((e.clientY - r.top) / r.height) * d.heightM }; };
  const snap = (v: number) => Math.round(v * 4) / 4;
  const round = (m: { x: number; y: number }) => ({ x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 });
  const down = (e: React.PointerEvent) => {
    const m = toM(e);
    if (tool === 'pin') { setPinAt(round(m)); return; }
    if (tool === 'sti') { setStiAt(round(m)); return; }
    if (tool === 'wall') setDrag({ x: snap(m.x), y: snap(m.y), x2: snap(m.x), y2: snap(m.y) });
    if (tool === 'speaker') setS((n) => { const k = SPEAKER_KINDS[n.currentKind]; n.speakers.push({ id: uid(), label: `${k.horn ? 'H' : 'SPK'}-${n.speakers.length + 1}`, x: m.x, y: m.y, kind: n.currentKind, watts: k.horn ? 1 : n.currentWatts, ref: k.horn ? (n.currentWatts >= 8 ? 92 : n.currentWatts >= 1 ? 88 : 84) : k.ref, hM: Math.min(k.hM, n.ceilingM), ...(me ? { by: me } : {}) }); });
    if (tool === 'erase') {
      const near = (x: number, y: number) => Math.hypot(x - m.x, y - m.y) < 1.5;
      const si = s.speakers.findIndex((a) => near(a.x, a.y)); if (si >= 0) { setS((n) => { n.speakers.splice(si, 1); }); return; }
      const ti = s.sti.findIndex((a) => near(a.x, a.y)); if (ti >= 0) { setS((n) => { n.sti.splice(ti, 1); }); return; }
      update((q) => {
        let bi = -1, bd = 1;
        q.indoor.walls.forEach((w, i) => { const L2 = (w.x2 - w.x1) ** 2 + (w.y2 - w.y1) ** 2 || 1; const t = Math.max(0, Math.min(1, ((m.x - w.x1) * (w.x2 - w.x1) + (m.y - w.y1) * (w.y2 - w.y1)) / L2)); const dd = Math.hypot(m.x - (w.x1 + t * (w.x2 - w.x1)), m.y - (w.y1 + t * (w.y2 - w.y1))); if (dd < bd) { bd = dd; bi = i; } });
        if (bi >= 0) q.indoor.walls.splice(bi, 1);
      });
    }
  };
  const move = (e: React.PointerEvent) => { if (!drag) return; const m = toM(e); let x2 = snap(m.x), y2 = snap(m.y); if (e.shiftKey) { if (Math.abs(x2 - drag.x) > Math.abs(y2 - drag.y)) y2 = drag.y; else x2 = drag.x; } setDrag({ ...drag, x2, y2 }); };
  const up = () => { if (drag && Math.hypot(drag.x2 - drag.x, drag.y2 - drag.y) > 0.3) update((q) => { q.indoor.walls.push({ x1: drag.x, y1: drag.y, x2: drag.x2, y2: drag.y2, material: q.indoor.currentMaterial }); }); setDrag(null); };

  const saveSti = () => {
    if (!stiAt || stiVal == null || !(stiVal >= 0 && stiVal <= 1)) return;
    setS((n) => { n.sti.push({ id: uid(), x: stiAt.x, y: stiAt.y, sti: Math.round(stiVal * 100) / 100, at: new Date().toISOString(), ...(stiNote.trim() ? { note: stiNote.trim() } : {}), ...(me ? { by: me } : {}) }); });
    setStiAt(null); setStiVal(null); setStiNote('');
  };
  const stiN = s.sti.length, stiMeas = stiN ? s.sti.reduce((a, b) => a + b.sti, 0) / stiN : NaN, stiPassPct = stiN ? (s.sti.filter((x) => x.sti >= 0.45).length / stiN) * 100 : 0;
  const stiPass = stiN > 0 && stiMeas >= (rule.stiGoal ?? 0.5) && stiPassPct >= 90;

  // codes for the project's state
  const place = projectPlace(p);
  const here = codesFor(place.state, place.county, place.city);
  const nfpa72 = here.set.current.find((c) => c.cat === 'Fire alarm');
  const building = here.set.current.find((c) => c.cat === 'Fire') ?? here.set.current.find((c) => c.cat === 'Building');
  const codes = INDOOR_VOICE_CODES.filter((c) => c.applies.includes(s.system));

  // outdoor warning sirens heard inside this building
  const site = p.sites[0];
  const sp = sirenPlan(p);
  const sirenInside = useMemo(() => {
    if (!sp.units.length || !site || !Number.isFinite(site.lat) || !Number.isFinite(site.lon) || (site.lat === 0 && site.lon === 0)) return null;
    const c = checkPoint(sp, site.lat, site.lon); if (!c.levels.length) return null;
    return { outside: c.total, inside: c.total - OUTSIDE_IN_DBA, nearest: c.levels[0] };
  }, [sp, site]); // eslint-disable-line react-hooks/exhaustive-deps

  // test records (Testing page)
  const today = new Date().toISOString().slice(0, 10);
  const addTests = () => {
    const rows: { item: string; standard: string; expected: string; measured: string; pass: boolean | null; notes: string }[] = [];
    const sysName = SOUND_SYSTEM_LABEL[s.system];
    if (pins.length) {
      const ok = pins.filter((x) => x.v >= rule.target && x.v <= 110).length, mn = Math.min(...pins.map((x) => x.v)), mx = Math.max(...pins.map((x) => x.v));
      rows.push({ item: `Indoor sound level, ${sysName} (${pins.length} spots on the floor plan)`, standard: rule.cite + (s.system === 'firealarm' || s.system === 'massnotif' ? ', NFPA 72 Chapter 14' : ''), expected: `≥ ${rule.target} dBA at 5 ft, never over 110 dBA`, measured: `${ok} of ${pins.length} spots pass (lowest ${mn} dBA, highest ${mx} dBA)`, pass: ok === pins.length, notes: rule.text });
    }
    if (stiN) rows.push({ item: `Voice intelligibility (STIPA), ${sysName} (${stiN} spots)`, standard: 'NFPA 72 Annex D', expected: `average ≥ ${(rule.stiGoal ?? 0.5).toFixed(2)} STI, ≥ 0.45 at 90% of spots`, measured: `average ${stiMeas.toFixed(2)} STI, ${stiPassPct.toFixed(0)}% of spots ≥ 0.45`, pass: stiPass, notes: `Predicted average ${grid.stiAvg.toFixed(2)} STI. RT60 ${s.rt60.toFixed(1)} s, background ${s.ambientDba} dBA.` });
    if (sirenInside) rows.push({ item: 'Outdoor warning siren heard inside (estimate)', standard: 'FEMA CPG 1-17', expected: `${s.ambientDba + 10} dBA inside to notice (background + 10)`, measured: `about ${Math.round(sirenInside.inside)} dBA inside (${Math.round(sirenInside.outside)} dBC outside)`, pass: null, notes: 'Estimate only: sirens are for people outdoors. Use the indoor voice system, weather radio or phone alerts inside.' });
    if (!rows.length) { setSaved('Drop reading pins or add STIPA readings first.'); return; }
    update((q) => { q.tests = [...q.tests, ...rows.map((r) => ({ id: uid(), date: today, tech: me ?? '', ...r }))]; });
    setSaved(`Saved ${rows.length} test record${rows.length > 1 ? 's' : ''} to Testing.`);
  };

  const marks3d = useMemo(() => s.speakers.map((a) => ({ x: a.x, y: a.y, color: a.kind === 'fahorn' ? 0xd32f2f : 0x6a1b9a })), [s.speakers]);
  const grid3d = useMemo(() => ({ nx: grid.nx, ny: grid.ny, v: showSti ? grid.sti : grid.v }), [grid, showSti]);
  const kindOpts = Object.entries(SPEAKER_KINDS).map(([k, v]) => [k, v.label] as [SpeakerKind, string]);
  const curKind = SPEAKER_KINDS[s.currentKind];
  const legend = showSti ? STI_SCALE : SPL_SCALE;
  return (
    <>
      <Card title="Sound planner" tour="in-sound" tip="Plan speakers and horns on this floor plan. The walls you drew for radio also block sound (each wall type has its own sound loss). Pick the system and the kind of space; the target comes from NFPA 72 for fire alarm and voice evacuation, and from industry practice for paging and pro sound.">
        <div className="form">
          <Field label="System"><Sel value={s.system} onChange={(v) => { setS((n) => { n.system = v; if (v === 'firealarm') { n.currentKind = 'fahorn'; n.currentWatts = 8; } else if (n.currentKind === 'fahorn') { n.currentKind = v === 'massnotif' ? 'spkstrobe' : 'ceiling'; n.currentWatts = 1; } }); setPinAt(null); }} options={Object.entries(SOUND_SYSTEM_LABEL) as [SoundSystem, string][]} /></Field>
          {(s.system === 'firealarm' || s.system === 'massnotif') && <Field label="Kind of space" tip="Public: everyone must hear it. Private: only staff (nurse stations, control rooms). Sleeping: hotel rooms, dorms, apartments, patient rooms."><Sel value={s.occupancy} onChange={(v) => setS((n) => { n.occupancy = v as Occupancy; })} options={[['public', 'Public (everyone)'], ['private', 'Private (staff only)'], ['sleeping', 'Sleeping rooms']]} /></Field>}
          <Field label="Background noise" tip="The normal noise level where people are, in dBA at 5 ft. Measure it with the phone or meter on the Sound & Audio Tools page. Quiet office 45, store 55, cafeteria 65, shop 75 to 85."><Num value={s.ambientDba} onChange={(v) => setS((n) => { n.ambientDba = v ?? 55; })} unit="dBA" /></Field>
          <Field label="Room finish (echo)"><Sel value={(Object.entries(ROOM_FINISH).find(([, f]) => Math.abs(f.rt60 - s.rt60) < 0.05)?.[0] ?? 'custom') as string} onChange={(v) => { const f = ROOM_FINISH[v]; if (f) setS((n) => { n.rt60 = f.rt60; }); }} options={[...Object.entries(ROOM_FINISH).map(([k, f]) => [k, f.label] as [string, string]), ['custom', 'Custom (type the RT60)']]} /></Field>
          <Field label="Echo time RT60" tip="How long a loud sound takes to die away (60 dB). Under 0.8 s is good for speech; over 1.5 s blurs words."><Num value={s.rt60} onChange={(v) => setS((n) => { n.rt60 = Math.max(0.2, Math.min(8, v ?? 1)); })} unit="s" /></Field>
          <Field label="Ceiling height"><Num value={s.ceilingM} onChange={(v) => setS((n) => { n.ceilingM = Math.max(2, Math.min(30, v ?? 2.7)); })} unit="m" /></Field>
          <Field label="Sound target" tip="Leave blank to use the code rule shown below."><Num value={s.targetDba ?? null} nullable onChange={(v) => setS((n) => { n.targetDba = v ?? undefined; })} unit="dBA" /></Field>
        </div>
        <p className="small"><b>Target {rule.target} dBA</b>, never over 110 dBA. {rule.text} <span className="muted">({rule.cite})</span>{rule.stiGoal != null && <> Speech clarity goal: STI {rule.stiGoal.toFixed(2)} average, 0.45 or better at 90% of spots.</>}</p>
        <div className="row wrap toolbar">
          <span>Tool:</span>
          {(['wall', 'speaker', 'pin', 'sti', 'erase'] as Tool[]).filter((t) => t !== 'sti' || voice).map((t) => <button key={t} className={tool === t ? 'primary' : ''} data-tour={t === 'pin' ? 'pins-open' : undefined} onClick={() => { setTool(t); if (t !== 'pin') setPinAt(null); if (t !== 'sti') setStiAt(null); }}>{t === 'wall' ? '✏ Draw wall' : t === 'speaker' ? (s.system === 'firealarm' ? '📢 Place horn' : '🔊 Place speaker') : t === 'pin' ? '📌 Drop reading pin' : t === 'sti' ? '🗣 Add STIPA reading' : '⌫ Erase'}</button>)}
          {tool === 'wall' && <Sel value={d.currentMaterial} onChange={(v) => update((q) => { q.indoor.currentMaterial = v; })} options={Object.entries(WALL_MATERIALS).map(([k, m]) => [k, `${m.label} (sound −${soundWallTl(k)} dB)`] as [string, string])} />}
          {tool === 'speaker' && <>
            <Sel value={s.currentKind} onChange={(v) => setS((n) => { n.currentKind = v; if (SPEAKER_KINDS[v].horn) n.currentWatts = 8; else n.currentWatts = SPEAKER_KINDS[v].watts; })} options={kindOpts} />
            {curKind.horn ? <Sel value={String(s.currentWatts >= 8 ? 92 : s.currentWatts >= 1 ? 88 : 84)} onChange={(v) => setS((n) => { n.currentWatts = v === '92' ? 8 : v === '88' ? 1 : 0.5; })} options={HORN_SETTINGS.map(([k, l]) => [String(k), l] as [string, string])} />
              : <Sel value={String(s.currentWatts)} onChange={(v) => setS((n) => { n.currentWatts = Number(v); })} options={TAPS.map((t) => [String(t), `${t} W tap`] as [string, string])} />}
          </>}
          <button onClick={async () => { if (await askDelete('Delete all speakers, horns and STIPA readings on this plan?')) setS((n) => { n.speakers = []; n.sti = []; }); }}>Clear speakers</button>
        </div>
        <p className="small muted">{tool === 'speaker' ? curKind.note + ' ' : ''}Tap the plan to place; erase removes the nearest speaker, reading or wall. Grid = {u.unit === 'mi' ? '16 ft' : '5 m'}.</p>
      </Card>
      <Card title="Floor plan & sound" tour="in-sound-canvas">
        <div className="row wrap toolbar" role="tablist" aria-label="View">
          <button className={view === '2d' ? 'primary' : ''} onClick={() => setView('2d')}>🗺 2D plan</button>
          <button className={view === '3d' ? 'primary' : ''} onClick={() => setView('3d')}>🧊 3D walls</button>
          {voice && <><span className="muted">Show:</span>
            <button className={layer === 'dba' ? 'primary' : ''} onClick={() => setLayer('dba')}>🔊 Sound level</button>
            <button className={layer === 'sti' ? 'primary' : ''} onClick={() => setLayer('sti')}>🗣 Speech clarity (STI)</button></>}
        </div>
        {view === '2d' ? <FullView title="Floor plan & sound"><div className="canvas-wrap"><canvas ref={cv} className="plan" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} style={{ aspectRatio: `${d.widthM} / ${d.heightM}` }} aria-label="Floor plan with the sound heat map" /></div></FullView>
          : <Indoor3D d={d} grid={grid3d} color={showSti ? stiColor : splColor} marks={marks3d} />}
        <div className="legend">{legend.map((x) => <span key={x.min}><span className="lg" style={{ background: `rgb(${x.color.join(',')})` }} />{x.label}</span>)}</div>
        <div className="stats">
          <Stat label={`Floor area ≥ ${rule.target} dBA`} value={fmt(grid.pct, 0)} unit=" %" tone={grid.pct >= 95 ? 'ok' : grid.pct >= 85 ? 'warn' : 'bad'} />
          <Stat label="Loudest spot" value={fmt(grid.maxDba, 0)} unit=" dBA" tone={grid.maxDba > 110 ? 'bad' : grid.maxDba > rule.target + 20 ? 'warn' : 'ok'} tip="Never over 110 dBA (NFPA 72)." />
          <Stat label="Quietest spot" value={fmt(grid.minDba, 0)} unit=" dBA" />
          {voice && <Stat label="Speech clarity (estimate)" value={s.speakers.length ? grid.stiAvg.toFixed(2) : '—'} unit=" STI" tone={s.speakers.length ? stiWord(grid.stiAvg).tone : undefined} tip="Predicted from the echo time and background noise. Confirm with STIPA readings." />}
          <Stat label={s.system === 'firealarm' ? 'Horns' : 'Speakers'} value={s.speakers.length} />
        </div>
        {s.speakers.length > 0 && <table className="tbl"><thead><tr><th>Label</th><th>Type</th><th>{s.system === 'firealarm' ? 'Setting' : 'Tap'}</th><th>Level at 1 m</th><th>Where</th><th /></tr></thead>
          <tbody>{s.speakers.map((a, i) => { const k = SPEAKER_KINDS[a.kind]; return <tr key={a.id}>
            <td><input value={a.label} onChange={(e) => setS((n) => { n.speakers[i].label = e.target.value; })} aria-label="Label" /></td>
            <td>{k.label}{a.by ? <span className="muted small"> · by {a.by}</span> : null}</td>
            <td>{k.horn ? <Sel value={String(a.ref)} onChange={(v) => setS((n) => { n.speakers[i].ref = Number(v); })} options={HORN_SETTINGS.map(([r, l]) => [String(r), l.split(' (')[0]] as [string, string])} />
              : <Sel value={String(a.watts)} onChange={(v) => setS((n) => { n.speakers[i].watts = Number(v); })} options={TAPS.map((t) => [String(t), `${t} W`] as [string, string])} />}</td>
            <td>{levelAt1m(a).toFixed(0)} dB</td><td className="small">{where(a.x, a.y)}</td>
            <td><button onClick={() => setS((n) => { n.speakers.splice(i, 1); })} aria-label="Remove">✕</button></td></tr>; })}</tbody></table>}
      </Card>
      <Card title="What to change" tour="in-sound-advice">
        <ul className="advice">{advice.map((a, i) => <li key={i} className={`tone-${a.tone}`}>{a.tone === 'ok' ? '✅' : a.tone === 'bad' ? '⛔' : a.tone === 'warn' ? '⚠️' : 'ℹ️'} {a.text}</li>)}</ul>
        <p className="small muted">Rules of thumb: the designer, and the fire marshal (AHJ) for fire alarm and voice evacuation, must confirm the layout. Measure sound levels and STIPA at acceptance.</p>
      </Card>
      <Card title="Reading pins and sound balance" tour="in-pins" tip="Pick 📌 Drop reading pin, tap the plan where you measured, and type the dBA your meter shows (5 ft above the floor, with the system playing its test tone or message). The advice says which speaker to tap up or down, move or add.">
        <PinsPanel title="Measured sound levels on this plan" system={pinSys} systems={SOUND_PIN_SYSTEMS} onSystem={(v) => { setS((n) => { n.system = v as SoundSystem; }); setPinAt(null); }} armed={tool === 'pin'} setArmed={(v) => { setTool(v ? 'pin' : 'speaker'); if (!v) setPinAt(null); }}
          pending={pinAt ? { where: `${where(pinAt.x, pinAt.y)}${predAt(pinAt.x, pinAt.y).dba != null ? `, predicted ${fmtQ(predAt(pinAt.x, pinAt.y).dba!, 'dba')}` : ''}` } : null} onCancel={() => setPinAt(null)} onSave={savePin}
          rows={pinRows} points={pinPoints} sources={pinSources} targetKey="indoor" defaults={{ target: rule.target, hot: rule.max }} onDelete={(id) => update((q) => { q.readingPins = (q.readingPins ?? []).filter((x) => x.id !== id); })} dropHint="Tap the floor plan above where you took the reading." />
      </Card>
      {voice && <Card title="Speech clarity readings (STIPA)" tour="in-sti" tip="Play the STIPA test signal through the system and read the STI on your meter (or phone app) at ear height in each room or area that sounds different. Pick 🗣 Add STIPA reading and tap the plan where you stood.">
        {stiAt && <div className="row wrap pin-form">
          <span className="small">New reading at {where(stiAt.x, stiAt.y)}{(() => { const a = predAt(stiAt.x, stiAt.y); return a.sti != null ? `, predicted ${a.sti.toFixed(2)}` : ''; })()}:</span>
          <Num value={stiVal} nullable onChange={setStiVal} unit="STI" label="STI reading" />
          <input placeholder="Note (room name)" value={stiNote} onChange={(e) => setStiNote(e.target.value)} aria-label="Note" />
          <button className="primary" disabled={stiVal == null || !(stiVal >= 0 && stiVal <= 1)} onClick={saveSti}>Save</button><button onClick={() => setStiAt(null)}>Cancel</button>
          {stiVal != null && !(stiVal >= 0 && stiVal <= 1) && <span className="bad small">STI is between 0 and 1, for example 0.52.</span>}
        </div>}
        {!stiAt && tool === 'sti' && <p className="note small">Tap the floor plan above where you took the STIPA reading.</p>}
        {stiN > 0 ? <>
          <div className="stats">
            <Stat label="Average measured" value={stiMeas.toFixed(2)} unit=" STI" tone={stiWord(stiMeas).tone} />
            <Stat label="Spots at 0.45 or better" value={fmt(stiPassPct, 0)} unit=" %" tone={stiPassPct >= 90 ? 'ok' : 'bad'} />
            <Stat label="Result" value={stiPass ? 'Pass' : 'Not yet'} tone={stiPass ? 'ok' : 'bad'} tip="Commonly used goal (NFPA 72 Annex D): average 0.50, with 0.45 or better at 90% of spots. Your AHJ decides." />
          </div>
          <table className="tbl"><thead><tr><th>STI</th><th>Predicted</th><th>Where</th><th>Note</th><th /></tr></thead>
            <tbody>{s.sti.map((t) => { const a = predAt(t.x, t.y); return <tr key={t.id}><td className={t.sti >= 0.45 ? 'ok' : 'bad'}>{t.sti.toFixed(2)}</td><td>{a.sti != null ? a.sti.toFixed(2) : '—'}</td><td className="small">{where(t.x, t.y)}</td><td className="small">{[t.by ? `by ${t.by}` : '', t.note ?? ''].filter(Boolean).join(' · ')}</td>
              <td><button aria-label="Remove" onClick={() => setS((n) => { n.sti = n.sti.filter((x) => x.id !== t.id); })}>✕</button></td></tr>; })}</tbody></table>
          {!stiPass && <p className="small">To raise STI: lower the taps on speakers that are much louder than needed, add speakers closer to listeners, aim away from hard walls and glass, and add absorption. Turning everything up rarely helps when the echo is long.</p>}
        </> : <p className="small muted">No STIPA readings yet. They are needed at acceptance for voice evacuation and mass notification.</p>}
      </Card>}
      <Card title="Codes for indoor voice and alarm sound" tour="in-sound-codes">
        <p className="small"><b>{here.set.name}:</b> {nfpa72 ? <>{nfpa72.code}{nfpa72.status !== 'verified' ? ' (confirm the edition with the fire marshal)' : ''}</> : 'NFPA 72 edition: check with the fire marshal'}{building ? <> · {building.code}</> : null}. AHJ: {here.set.ahj}</p>
        <ul className="small">{codes.map((c) => <li key={c.cite}><b>{c.cite}</b> <span className="muted">({c.cat}{c.confirm ? ', confirm with the AHJ' : ''})</span>: {c.text}</li>)}</ul>
        <p className="small muted">Section numbers move between NFPA 72 editions. State amendment text is not bundled. A licensed engineer and the AHJ must confirm every requirement before design or permitting.</p>
      </Card>
      <Card title="Tests and outdoor sirens" tour="in-sound-tests">
        <p className="small">Save this plan's measured sound levels and STIPA readings as test records on the Testing page (pass or fail against the target). Repeat after any change and at the yearly test.</p>
        <div className="row wrap"><button className="primary" onClick={addTests}>🧾 Save test records</button><button onClick={() => go('testing')}>Open Testing</button>{saved && <span className="small">{saved}</span>}</div>
        <h4>Outdoor warning sirens heard inside</h4>
        {sirenInside ? <p className="small">The nearest siren ({sirenInside.nearest.name}, {u.len(sirenInside.nearest.ft * 0.3048, 1)} away) and the others give about <b>{Math.round(sirenInside.outside)} dBC outside</b> this building, so about <b>{Math.round(sirenInside.inside)} dBA inside</b> with doors and windows closed (about {OUTSIDE_IN_DBA} dB lost through the walls).{' '}
          {sirenInside.inside >= s.ambientDba + 10 ? 'People inside may notice it, but it will not carry clear voice messages.' : `That is not enough to alert people over the ${s.ambientDba} dBA background inside.`} Use the indoor voice system, a NOAA weather radio or phone alerts for people indoors.</p>
          : <p className="small muted">No outdoor sirens near the project site yet. Add planned or existing sirens on the Outdoor Warning Sirens page to see how loud they are inside this building.</p>}
        <button onClick={() => go('sirens')}>Open Outdoor Warning Sirens</button>
      </Card>
    </>
  );
}
