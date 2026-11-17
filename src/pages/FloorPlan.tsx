import React, { useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useStore, downloadText, safeName } from '../store';
import { Card, Stat } from '../components/ui';
import { DropZone } from '../components/DropZone';
import { PlanSheet2D, Plan3D, LayerBoxes, useSystemOverlay, feetOf, PlanSchedules, type PlanPick } from '../components/PlanViews';
import { PipButton } from '../components/PlanPip';
import { askDelete } from '../components/askConfirm';
import { ACCEPT, addOpening, addWall, blankPlan, calibrate, fitScale, fmtFtIn, paperSize, parseFtIn, parseScale, planDxf, regrade, schedules, SHEETS, STD_SCALES, drawArea, type FloorPlanImport, type QualityIssue } from '../engine/floorplan';
import { levelName, setInDocs, setIntegrated } from '../engine/floorplanProject';

const SRC_LABEL: Record<FloorPlanImport['source'], string> = { image: 'Image (scan or photo)', 'pdf-vector': 'PDF, vector (from CAD)', 'pdf-scan': 'PDF, scanned', dxf: 'DXF (CAD)', svg: 'SVG drawing', drawn: 'Drawn here to scale' };
const SCALE_LABEL: Record<FloorPlanImport['scale']['from'], string> = { notation: 'Read from the sheet', calibrated: 'Calibrated by you', dimension: 'From a known dimension', 'cad-units': 'CAD drawing units', estimated: 'Estimated (doors)', none: 'Not set' };
const SEV: Record<QualityIssue['severity'], string> = { bad: 'Must fix', warn: 'Should fix', info: 'Note' };

/** The plan as a stand-alone SVG drawing sheet (for Documents and downloads). */
export function sheetSvg(plan: FloorPlanImport): string {
  const xml = renderToStaticMarkup(<PlanSheet2D plan={plan} off={[...(plan.off ?? []), 'underlay']} title={plan.level} toScale />);
  return xml.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${plan.drawScale && plan.scale.ftPerPx ? '' : ' width="1700" height="1100"'} font-family="Arial, Helvetica, sans-serif"`);
}

/** Text placed into the print window's HTML: escaped so a plan or level name can never add markup or script. */
const escHtml = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

/** Prints the plan at its drawing scale on the chosen sheet (print at 100 %, "Actual size"). */
export function printToScale(plan: FloorPlanImport) {
  const sh = SHEETS.find((x) => x.id === plan.sheet) ?? SHEETS[1];
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write(`<!doctype html><title>${escHtml(plan.level)}</title><style>@page{size:${sh.w}in ${sh.h}in;margin:0.5in}body{margin:0;font-family:Arial,Helvetica,sans-serif}svg{display:block}</style>${sheetSvg(plan)}<p style="font-size:9pt">Print at 100 % ("Actual size", not "Fit"). ${plan.drawScale ? 'Scale ' + escHtml(plan.drawScale.label) : 'Fit to page: use the graphic scale.'}</p>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}

const readUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

export function FloorPlanPage() {
  const { project: p, update, go } = useStore();
  const plans = p.floorPlans ?? [];
  const [curId, setCurId] = useState<string>(() => plans[plans.length - 1]?.id ?? '');
  const plan = plans.find((x) => x.id === curId) ?? null;
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [floor, setFloor] = useState(() => (plans.length ? Math.max(...plans.map((x) => x.floor)) + 1 : 0));
  const [ceil, setCeil] = useState(p.autoDesign?.ceilingFt ?? 9), [wallH, setWallH] = useState(10);
  const [pdfPage, setPdfPage] = useState(1), [pages, setPages] = useState(0);
  const [view, setView] = useState<'2d' | '3d' | 'both'>('both');
  const [pick, setPick] = useState<PlanPick | null>(null);
  const [cal, setCal] = useState<[number, number][] | null>(null), [calFt, setCalFt] = useState('');
  const [known, setKnown] = useState('');
  const [mode, setMode] = useState<'select' | 'ext' | 'int' | 'door' | 'window'>('select'), [pts, setPts] = useState<[number, number][]>([]);
  const [extIn, setExtIn] = useState(8), [intIn, setIntIn] = useState(4.5);
  const [newL, setNewL] = useState(''), [newW, setNewW] = useState('');
  const [customScale, setCustomScale] = useState('');
  const [asked, setAsked] = useState<Record<string, 'later' | 'anyway'>>({});
  const [afterPrompt, setAfterPrompt] = useState(false);
  const lastFile = useRef<{ file: File; floor: number } | null>(null);
  const originals = useRef(new Map<string, { name: string; type: string; size: number; dataUrl: string }>());
  const hist = useRef<{ past: FloorPlanImport[]; future: FloorPlanImport[] }>({ past: [], future: [] });
  const [, bump] = useState(0);
  const scene = useSystemOverlay(p, plan);

  const savePlan = (next: FloorPlanImport, record = true) => {
    if (record && plan) { hist.current.past.push(plan); hist.current.future = []; if (hist.current.past.length > 50) hist.current.past.shift(); }
    update((d) => {
      d.floorPlans = (d.floorPlans ?? []).map((x) => (x.id === next.id ? next : x));
      if (next.integrated) setIntegrated(d, next.id, true);
      if (next.inDocs) setInDocs(d, next, true, sheetSvg(next), originals.current.get(next.id));
    });
    bump((n) => n + 1);
  };
  const undo = () => { const h = hist.current; const prev = h.past.pop(); if (!prev || !plan) return; h.future.push(plan); savePlan(prev, false); };
  const redo = () => { const h = hist.current; const nx = h.future.pop(); if (!nx || !plan) return; h.past.push(plan); savePlan(nx, false); };

  const upload = async (files: File[], fl = floor, pg = 1) => {
    const f = files[0]; if (!f) return;
    setErr(''); setNote(''); setAfterPrompt(false); setBusy(`Reading ${f.name}…`);
    try {
      const { importPlanFile } = await import('../engine/floorplanLoad');
      setBusy(`Tracing walls, doors, windows and rooms in ${f.name}…`);
      const r = await importPlanFile(f, { page: pg, floor: fl, level: levelName(fl), ceilingFt: ceil, wallHeightFt: wallH });
      lastFile.current = { file: f, floor: fl };
      if (f.size <= 15 * 1048576) originals.current.set(r.plan.id, { name: f.name, type: f.type || 'application/octet-stream', size: f.size, dataUrl: await readUrl(f) });
      setPages(r.pages ?? 0); setPdfPage(pg); if (r.note) setNote(r.note);
      update((d) => { d.floorPlans = [...(d.floorPlans ?? []).filter((x) => !(x.floor === fl && !x.integrated && x.name === f.name)), r.plan]; });
      setCurId(r.plan.id); hist.current = { past: [], future: [] }; setPick(null); setCal(null);
      setFloor(fl + 1);
    } catch (e) { setErr(String((e as Error)?.message ?? e)); }
    finally { setBusy(''); }
  };
  const replaceUpload = (files: File[]) => { if (plan) { const keep = plan.floor; update((d) => { d.floorPlans = (d.floorPlans ?? []).filter((x) => x.id !== plan.id); }); upload(files, keep); } else upload(files); };

  const setScale = (s: FloorPlanImport['scale']) => { if (!plan) return; const n = { ...plan, scale: s }; n.quality = regrade(n); savePlan(n); };
  const applyKnown = () => { if (!plan) return; const ft = parseFtIn(known); if (!ft || ft <= 0) { setErr('Type the overall length like 64\'-8" or 64.67.'); return; } const xs = plan.walls.flatMap((w) => [w.x1, w.x2]); const pad = Math.max(0, ...plan.walls.map((w) => w.thick / 2)); const px = Math.max(...xs) - Math.min(...xs) + 2 * pad; setErr(''); setScale({ ...calibrate(px, ft), from: 'dimension', note: `Overall length entered: ${fmtFtIn(ft)}.` }); setKnown(''); };
  const applyCal = () => { if (!plan || cal?.length !== 2) return; const ft = parseFtIn(calFt); if (!ft || ft <= 0) { setErr('Type the distance between the two points, like 12\'-0".'); return; } setErr(''); setScale(calibrate(Math.hypot(cal[1][0] - cal[0][0], cal[1][1] - cal[0][1]), ft)); setCal(null); setCalFt(''); };

  const createNew = () => {
    const L = parseFtIn(newL), W = parseFtIn(newW);
    if (!L || !W || L < 8 || W < 8) { setErr('Type the outside length and width, like 64\'-8" and 40\'-0".'); return; }
    setErr(''); const n = blankPlan(L, W, { floor, level: levelName(floor), ceilingFt: ceil, wallHeightFt: wallH, extThickIn: extIn });
    n.sheet = 'arch-d'; n.drawScale = fitScale(L, W, SHEETS.find((x) => x.id === 'arch-d')!) ?? null;
    update((d) => { d.floorPlans = [...(d.floorPlans ?? []), n]; }); setCurId(n.id); setFloor(floor + 1); setMode('int'); setNewL(''); setNewW(''); hist.current = { past: [], future: [] };
  };
  const drawClick = (x: number, y: number) => {
    if (!plan) return; const next = [...pts, [x, y] as [number, number]];
    if (next.length < 2) { setPts(next); return; }
    setPts([]);
    const n = mode === 'ext' || mode === 'int' ? addWall(plan, next[0], next[1], mode === 'ext', mode === 'ext' ? extIn : intIn) : addOpening(plan, next[0], next[1], mode === 'door' ? 'door' : 'window');
    n.quality = regrade(n); savePlan(n);
  };
  const integrate = (on: boolean) => { if (!plan) return; update((d) => setIntegrated(d, plan.id, on)); if (on) setAfterPrompt(true); };
  const docs = (on: boolean) => { if (!plan) return; update((d) => setInDocs(d, plan, on, on ? sheetSvg(plan) : undefined, originals.current.get(plan.id))); };
  const setOff = (off: string[]) => plan && update((d) => { const x = d.floorPlans?.find((y) => y.id === plan.id); if (x) x.off = off; });
  const removeSel = () => { if (!plan || !pick) return; const n = { ...plan, walls: plan.walls.filter((w) => w.id !== pick.id), openings: plan.openings.filter((o) => o.id !== pick.id), rooms: plan.rooms.filter((r) => r.id !== pick.id) }; n.quality = regrade(n); setPick(null); savePlan(n); };
  const flipSel = () => { if (!plan || pick?.type !== 'opening') return; savePlan({ ...plan, openings: plan.openings.map((o) => (o.id === pick.id ? { ...o, kind: o.kind === 'door' ? 'window' : 'door' } : o)) }); };
  const editRoom = (id: string, k: 'name' | 'number', v: string) => plan && savePlan({ ...plan, rooms: plan.rooms.map((r) => (r.id === id ? { ...r, [k]: k === 'name' ? v.toUpperCase() : v } : r)) });
  const setPlanField = <K extends keyof FloorPlanImport>(k: K, v: FloorPlanImport[K]) => plan && savePlan({ ...plan, [k]: v });

  const q = plan?.quality, f = plan ? feetOf(plan) : null, sch = f && plan?.scale.ftPerPx ? schedules(f, plan.level) : null;
  const decided = plan ? asked[plan.id] : undefined;
  const selRoom = pick?.type === 'room' ? plan?.rooms.find((r) => r.id === pick.id) : undefined;
  const selOp = pick?.type === 'opening' ? plan?.openings.find((o) => o.id === pick.id) : undefined;
  const selWall = pick?.type === 'wall' ? plan?.walls.find((w) => w.id === pick.id) : undefined;
  const sel = selRoom ?? selOp ?? selWall;
  const floorOpts = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="grid fp-page">
      <Card title="1. Upload a floor plan or blueprint" className="wide" tip="PDF (from CAD or scanned), DXF (CAD), JPG, PNG, WebP, GIF, BMP or SVG. One floor per file or PDF page. Drag and drop works here and on every upload field in the app.">
        <div className="form">
          <label className="field"><span>Floor (level)</span><select value={floor} onChange={(e) => setFloor(+e.target.value)} data-no-choose>{floorOpts.map((i) => <option key={i} value={i}>{levelName(i)}{plans.some((x) => x.floor === i) ? ' (has a plan)' : ''}</option>)}</select></label>
          <label className="field"><span>Ceiling height (A.F.F.)</span><div className="num"><input type="number" min={7} max={40} step={0.5} value={ceil} onChange={(e) => setCeil(+e.target.value || 9)} /><span className="unit">ft</span></div></label>
          <label className="field"><span>Wall height (floor to structure)</span><div className="num"><input type="number" min={7} max={60} step={0.5} value={wallH} onChange={(e) => setWallH(+e.target.value || 10)} /><span className="unit">ft</span></div></label>
        </div>
        <DropZone accept={ACCEPT} onFiles={(fs) => upload(fs)} disabled={!!busy} label={busy || `Upload the ${levelName(floor).toLowerCase()}`} hint="PDF · DXF · JPG · PNG · SVG" />
        {busy && <p className="small" role="status"><span className="spin" /> {busy}</p>}
        {err && <p className="bad-text" role="alert">{err}</p>}
        {note && <p className="note">{note}</p>}
        <details className="fp-new"><summary><b>No drawing? Create a floor plan to scale</b></summary>
          <p className="small">Type the building's outside size. The plan starts as the exterior walls, true to size; then add interior walls, doors and windows with the drawing tools on the preview.</p>
          <div className="row wrap"><label className="field"><span>Outside length</span><input value={newL} onChange={(e) => setNewL(e.target.value)} placeholder={'64\'-8"'} /></label>
            <label className="field"><span>Outside width</span><input value={newW} onChange={(e) => setNewW(e.target.value)} placeholder={'40\'-0"'} /></label>
            <label className="field"><span>Exterior wall</span><div className="num"><input type="number" min={3} max={24} step={0.5} value={extIn} onChange={(e) => setExtIn(+e.target.value || 8)} /><span className="unit">in</span></div></label>
            <button className="primary" onClick={createNew}>Create plan</button></div>
        </details>
        {pages > 1 && lastFile.current && <p className="small">This PDF has {pages} sheets. Sheet used: <select value={pdfPage} onChange={(e) => upload([lastFile.current!.file], lastFile.current!.floor, +e.target.value)} data-no-choose style={{ width: 'auto' }}>{Array.from({ length: pages }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select> (pick the floor plan sheet, e.g. A-101).</p>}
      </Card>

      <Card title="How to get an accurate model" className="wide" tip="What makes the 2D plan and 3D model come out true to size.">
        <details open={!plans.length}><summary><b>Best to worst: what to upload</b></summary>
          <ol className="howto">
            <li><b>DXF from CAD</b> (AutoCAD, Revit, BricsCAD, Chief Architect): <i>Save As → DXF</i>, with walls on the <code>A-WALL</code> layers and drawing units set (Format → Units). Turn off furniture (<code>A-FURN</code>), hatch and annotation layers you don't need.</li>
            <li><b>Vector PDF</b> plotted from CAD (<i>Plot → DWG To PDF</i> or <i>Export → PDF</i>), one floor plan per sheet, printed at 100 % with the scale in the title block (e.g. <code>SCALE: 1/4" = 1'-0"</code>). Not a scan, not "fit to page".</li>
            <li><b>Scan</b> at <b>300 DPI</b> or more, black & white or grayscale, the sheet flat and straight on the glass. PDF, PNG or high-quality JPG.</li>
            <li><b>Photo</b> only if nothing else exists: straight down from above, even light with no shadows or glare, all four sheet edges in the frame, plan filling the picture.</li>
          </ol></details>
        <details><summary><b>Checklist before uploading</b></summary>
          <ul className="howto">
            <li>The whole floor is on one sheet (not split by match lines) and exterior walls are shown.</li>
            <li>A scale note, a graphic scale bar or at least one overall dimension string is on the sheet.</li>
            <li>Walls are drawn as solid (poché) or double lines; doors show their swings; windows show glazing lines.</li>
            <li>No redline markups, sticky notes, coffee stains or folds across the plan.</li>
            <li>Floor plans only: elevations, sections, reflected ceiling plans and site plans do not trace as floors.</li>
            <li>DWG, RVT and SKP files: export to DXF or PDF first. TIFF/HEIC: save as PDF, PNG or JPG.</li>
          </ul></details>
        <details><summary><b>After uploading</b></summary>
          <ul className="howto">
            <li>Check the <b>upload check</b> grade: only A or B with a known scale is marked accurate.</li>
            <li>Confirm the scale with one known dimension (or click <b>Calibrate</b> and pick both ends of a dimension line).</li>
            <li>Click any wall, door, window or room on the 2D plan to fix it; <b>Undo</b> / <b>Redo</b> step back and forward.</li>
            <li>Rename rooms to their real names and numbers (OFFICE 101, CORRIDOR 100, MECH 105).</li>
          </ul></details>
      </Card>

      {plan && q && f && <>
        <Card title="2. Upload check" className="wide" tip="How well this file can be turned into a true-scale model, what is wrong with it and how to fix it.">
          <div className="fp-check">
            <div className={'grade g-' + q.grade} title={`Score ${q.score} of 100`}>{q.grade}<small>{q.score}/100</small></div>
            <div className="stats">
              <Stat label="File" value={plan.name} tip={SRC_LABEL[plan.source]} />
              <Stat label="Type" value={SRC_LABEL[plan.source]} />
              <Stat label="Scale" value={SCALE_LABEL[plan.scale.from]} tone={plan.scale.from === 'none' || plan.scale.from === 'estimated' ? 'bad' : 'ok'} tip={plan.scale.note} />
              <Stat label="Building size" value={plan.scale.ftPerPx ? `${fmtFtIn(f.L)} × ${fmtFtIn(f.W)}` : '—'} />
              <Stat label="Walls" value={`${plan.walls.filter((w) => w.exterior).length} ext · ${plan.walls.filter((w) => !w.exterior).length} int`} />
              <Stat label="Doors / windows" value={`${plan.openings.filter((o) => o.kind === 'door').length} / ${plan.openings.filter((o) => o.kind === 'window').length}`} />
              <Stat label="Rooms" value={plan.rooms.length} />
              <Stat label="Net area" value={plan.scale.ftPerPx ? `${Math.round(f.netSf).toLocaleString()} SF` : '—'} tip="Sum of the room areas inside the walls." />
            </div>
          </div>
          {q.issues.length > 0 && <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Priority</th><th>Issue in this upload</th><th>How to fix</th></tr></thead>
            <tbody>{q.issues.map((i) => <tr key={i.id} className={'iss-' + i.severity}><td><b>{SEV[i.severity]}</b></td><td><b>{i.title}.</b> {i.detail}</td><td>{i.fix}</td></tr>)}</tbody></table></div>}

          {!q.accurate && decided !== 'anyway' && <div className="ask bad" role="alertdialog" aria-label="New upload needed">
            <h3>This upload won't produce an accurate model.</h3>
            <p>Fix {q.issues.filter((i) => i.severity === 'bad').length > 1 ? 'these issues' : 'this issue'}, then upload a new file:</p>
            <ul>{q.issues.filter((i) => i.severity === 'bad').map((i) => <li key={i.id}><b>{i.title}:</b> {i.fix}</li>)}</ul>
            {q.issues.filter((i) => i.severity === 'bad').every((i) => i.id === 'scale') && <p className="small">Only the scale is missing: enter a known dimension or calibrate below and the grade updates right away, no new upload needed.</p>}
            <DropZone accept={ACCEPT} onFiles={replaceUpload} label="Upload a new file" hint="replaces this one" compact disabled={!!busy} />
            <div className="row wrap" style={{ marginTop: 8 }}><button className="ghost" onClick={() => setAsked({ ...asked, [plan.id]: 'anyway' })}>Keep this one anyway (approximate)</button></div>
          </div>}

          {(q.accurate || decided === 'anyway') && !plan.integrated && decided !== 'later' && <div className="ask ok" role="alertdialog" aria-label="Add to project">
            <h3>{q.accurate ? '✓ The model is accurate.' : 'Approximate model.'} Add it to the project plan and build?</h3>
            <p className="small">The 2D & 3D Models, Auto-Design (building size, {f.rooms.length} rooms, {f.openings.filter((o) => o.kind === 'door' && o.exterior).length} exterior doors, ceiling height), device layouts, cable lengths, materials and Indoor Coverage will use this plan.</p>
            <div className="row wrap"><button className="primary" onClick={() => integrate(true)}>Yes, add to the project</button><button onClick={() => setAsked({ ...asked, [plan.id]: 'later' })}>Not now</button></div>
          </div>}
          {plan.integrated && <p className="ok-text">✓ In the project plan and build{plan.integratedAt ? ` since ${new Date(plan.integratedAt).toLocaleString()}` : ''}. <a href="#buildout" onClick={(e) => { e.preventDefault(); go('buildout'); }}>See the Project Build Output</a> · <button className="ghost" onClick={() => integrate(false)}>Take it out</button></p>}
          {decided === 'later' && !plan.integrated && <p className="small">Not in the project yet. <button onClick={() => integrate(true)}>Add to the project plan and build</button></p>}
          <label className="check" title="Puts this floor plan, its room, door and window schedules into Reports (Build plan, Closeout package), and keeps the drawing sheet and the original file in Documents."><input type="checkbox" checked={!!plan.inDocs} onChange={(e) => docs(e.target.checked)} /> Include in project documentation (Reports and Documents)</label>
        </Card>

        <Card title="3. Preview: 2D plan and 3D model" className="wide" actions={<div className="row wrap">
          <span className="seg"><button className={view === '2d' ? 'primary' : ''} onClick={() => setView('2d')}>2D</button><button className={view === '3d' ? 'primary' : ''} onClick={() => setView('3d')}>3D</button><button className={view === 'both' ? 'primary' : ''} onClick={() => setView('both')}>Both</button></span>
          <button onClick={undo} disabled={!hist.current.past.length} title="Undo (step back)">↶ Undo</button><button onClick={redo} disabled={!hist.current.future.length} title="Redo">↷ Redo</button>
          <PipButton planId={plan.id} />
        </div>}>
          <div className="fp-preview">
            <aside>
              <h4>Layers</h4>
              <LayerBoxes plan={plan} scene={scene} off={plan.off ?? []} setOff={setOff} />
              <h4>Draw</h4>
              <div className="seg wrap" role="group" aria-label="Drawing tool">{([['select', 'Select'], ['ext', 'Ext. wall'], ['int', 'Int. wall'], ['door', 'Door'], ['window', 'Window']] as const).map(([m, l]) => <button key={m} className={mode === m ? 'primary' : ''} disabled={m !== 'select' && !plan.scale.ftPerPx} onClick={() => { setMode(m); setPts([]); setCal(null); }}>{l}</button>)}</div>
              {mode !== 'select' && <p className="small note">{mode === 'ext' || mode === 'int' ? `Click the start, then the end of the wall (drawn square to the plan, ${mode === 'ext' ? extIn : intIn}" thick).` : `Click both jambs on a wall to cut the ${mode} into it.`} {pts.length ? 'Now the second point.' : ''}</p>}
              {(mode === 'ext' || mode === 'int') && <div className="row"><label className="field"><span>Ext. wall (in)</span><input type="number" step={0.5} value={extIn} onChange={(e) => setExtIn(+e.target.value || 8)} /></label><label className="field"><span>Int. wall (in)</span><input type="number" step={0.5} value={intIn} onChange={(e) => setIntIn(+e.target.value || 4.5)} /></label></div>}
              <h4>Drawing scale &amp; sheet</h4>
              {(() => { const sh = SHEETS.find((x) => x.id === plan.sheet) ?? SHEETS[4], fit = plan.scale.ftPerPx ? fitScale(f.L, f.W, sh) : null, ps = plan.drawScale && plan.scale.ftPerPx ? paperSize(f.L, f.W, plan.drawScale) : null, area = drawArea(sh), fits = !ps || (ps.w <= area.w && ps.h <= area.h);
                return <>
                  <label className="field"><span>Sheet size</span><select value={sh.id} onChange={(e) => setPlanField('sheet', e.target.value)} data-no-choose>{SHEETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
                  <label className="field"><span>Scale</span><select value={plan.drawScale ? (STD_SCALES.some((x) => x.label === plan.drawScale!.label) ? plan.drawScale.label : 'custom') : 'fit'} disabled={!plan.scale.ftPerPx} onChange={(e) => { const v = e.target.value; if (v === 'fit') setPlanField('drawScale', null); else if (v !== 'custom') setPlanField('drawScale', STD_SCALES.find((x) => x.label === v) ?? null); else setCustomScale(plan.drawScale?.label ?? ''); }} data-no-choose>
                    <option value="fit">Fit to page (graphic scale)</option>
                    <optgroup label="Architectural">{STD_SCALES.filter((x) => x.label.includes("1'-0")).map((x) => <option key={x.label}>{x.label}</option>)}</optgroup>
                    <optgroup label="Engineering">{STD_SCALES.filter((x) => /^1" = \d/.test(x.label)).map((x) => <option key={x.label}>{x.label}</option>)}</optgroup>
                    <optgroup label="Metric">{STD_SCALES.filter((x) => x.label.startsWith('1:')).map((x) => <option key={x.label}>{x.label}</option>)}</optgroup>
                    <option value="custom">Custom scale…</option></select></label>
                  <div className="row"><input value={customScale} onChange={(e) => setCustomScale(e.target.value)} placeholder={'custom: 5/32" = 1\'-0", 1" = 15\', 1:75'} disabled={!plan.scale.ftPerPx} /><button disabled={!plan.scale.ftPerPx} onClick={() => { const c = parseScale(customScale); if (!c) setErr('Type a scale like 5/32" = 1\'-0", 1" = 15\' or 1:75.'); else { setErr(''); setPlanField('drawScale', c); } }}>Use</button></div>
                  {ps && <p className={'small ' + (fits ? 'ok-text' : 'bad-text')}>At {plan.drawScale!.label} the plan is {ps.w.toFixed(1)} × {ps.h.toFixed(1)} in: {fits ? `fits ${sh.label.split(' (')[0].split(' ').slice(0, 2).join(' ')}.` : `too big for this sheet (drawing area ${area.w} × ${area.h} in).`}</p>}
                  {fit && <p className="small">Largest standard scale that fits: <button className="ghost" onClick={() => setPlanField('drawScale', fit)}>{fit.label}</button></p>}
                  <button disabled={!plan.scale.ftPerPx} onClick={() => printToScale(plan)} title="Prints the plan at the drawing scale. In the print box choose Actual size / 100 %.">🖨 Print to scale</button>
                </>; })()}
              <h4>Scale</h4>
              <p className="small">{plan.scale.note || SCALE_LABEL[plan.scale.from]}</p>
              <label className="field"><span>Known overall length (outside face to outside face)</span><div className="row"><input value={known} onChange={(e) => setKnown(e.target.value)} placeholder={'e.g. 64\'-8"'} onKeyDown={(e) => e.key === 'Enter' && applyKnown()} /><button onClick={applyKnown}>Set</button></div></label>
              {!cal ? <button onClick={() => setCal([])} title="Click both ends of a dimension line on the 2D plan, then type its length.">📏 Calibrate two points</button>
                : <div className="note">{cal.length < 2 ? `Click point ${cal.length + 1} of 2 on the 2D plan.` : <div className="row"><input autoFocus value={calFt} onChange={(e) => setCalFt(e.target.value)} placeholder={'distance, e.g. 24\'-0"'} onKeyDown={(e) => e.key === 'Enter' && applyCal()} /><button className="primary" onClick={applyCal}>Apply</button></div>} <button className="ghost" onClick={() => setCal(null)}>Cancel</button></div>}
              <h4>Level</h4>
              <label className="field"><span>Drawing title</span><input value={plan.level} onChange={(e) => setPlanField('level', e.target.value.toUpperCase())} /></label>
              <label className="field"><span>Floor</span><select value={plan.floor} onChange={(e) => setPlanField('floor', +e.target.value)} data-no-choose>{floorOpts.map((i) => <option key={i} value={i}>{levelName(i)}</option>)}</select></label>
              <div className="row"><label className="field"><span>Ceiling (ft)</span><input type="number" step={0.5} value={plan.ceilingFt} onChange={(e) => setPlanField('ceilingFt', +e.target.value || 9)} /></label><label className="field"><span>Wall height (ft)</span><input type="number" step={0.5} value={plan.wallHeightFt} onChange={(e) => setPlanField('wallHeightFt', +e.target.value || 10)} /></label></div>
              {sel && <><h4>Selected</h4><div className="note">
                {selRoom ? <><label className="field"><span>Room name</span><input value={selRoom.name} onChange={(e) => editRoom(selRoom.id, 'name', e.target.value)} /></label><label className="field"><span>Room number</span><input value={selRoom.number} onChange={(e) => editRoom(selRoom.id, 'number', e.target.value)} /></label></>
                  : selOp ? <p>{selOp.kind === 'door' ? 'Door' : 'Window'}, {plan.scale.ftPerPx ? fmtFtIn(Math.hypot(selOp.x2 - selOp.x1, selOp.y2 - selOp.y1) * plan.scale.ftPerPx) : ''} {selOp.exterior ? 'exterior' : 'interior'} <button onClick={flipSel}>Make it a {selOp.kind === 'door' ? 'window' : 'door'}</button></p>
                  : selWall ? <p>{selWall.exterior ? 'Exterior' : 'Interior'} wall {plan.scale.ftPerPx ? fmtFtIn(Math.hypot(selWall.x2 - selWall.x1, selWall.y2 - selWall.y1) * plan.scale.ftPerPx) : ''} <button onClick={() => savePlan({ ...plan, walls: plan.walls.map((w) => (w.id === selWall.id ? { ...w, exterior: !w.exterior } : w)) })}>Mark {selWall.exterior ? 'interior' : 'exterior'}</button></p> : null}
                <button onClick={removeSel}>🗑 Remove</button> <button className="ghost" onClick={() => setPick(null)}>Done</button>
              </div></>}
            </aside>
            <div className={'fp-views ' + view}>
              {view !== '3d' && <div className="fp-2d">
                <PlanSheet2D plan={plan} scene={scene} off={plan.off ?? []} pick={pick} onPick={cal || mode !== 'select' ? undefined : setPick} title={plan.level} northDeg={p.blueprint?.planNorthDeg ?? 0}
                  onPoint={cal && cal.length < 2 ? (x, y) => setCal([...cal, [x, y]]) : mode !== 'select' ? drawClick : undefined} marks={cal ?? (pts.length ? pts : undefined)} />
                <p className="small muted">Click a wall, door, window or room to change or remove it. True scale; dimensions in feet-inches.</p>
              </div>}
              {view !== '2d' && <Plan3D plan={plan} scene={scene} off={plan.off ?? []} height={view === 'both' ? 380 : 520} />}
            </div>
          </div>
          {sch && <details><summary><b>Schedules</b> (rooms {sch.rooms.length}, doors {sch.doors.length}, windows {sch.windows.length})</summary><PlanSchedules plan={plan} /></details>}
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button disabled={!plan.scale.ftPerPx} onClick={() => downloadText(`${safeName(p.meta.name)}_${safeName(plan.level)}.dxf`, planDxf(plan), 'application/dxf')} title="AIA layers: A-WALL-EXTR, A-WALL-INTR, A-DOOR, A-GLAZ, A-AREA-IDEN. Feet.">⬇ DXF (CAD)</button>
            <button onClick={() => downloadText(`${safeName(p.meta.name)}_${safeName(plan.level)}.svg`, sheetSvg(plan), 'image/svg+xml')}>⬇ Drawing sheet (SVG)</button>
          </div>
          <div className="ask" role="group" aria-label="Another upload">
            <b>{afterPrompt ? 'Added to the project. ' : ''}Upload another file?</b>
            <div className="row wrap" style={{ marginTop: 6 }}>
              <DropZone accept={ACCEPT} onFiles={(fs) => upload(fs, Math.max(...plans.map((x) => x.floor)) + 1)} label={`Add the ${levelName(Math.max(...plans.map((x) => x.floor)) + 1).toLowerCase()}`} compact disabled={!!busy} />
              <DropZone accept={ACCEPT} onFiles={replaceUpload} label="Replace this upload with a better file" compact disabled={!!busy} />
              <button onClick={() => go('buildout')}>No, show the Project Build Output →</button>
            </div>
          </div>
        </Card>
      </>}

      {plans.length > 0 && <Card title="Floor plans in this project" className="wide">
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Sheet</th><th>Level</th><th>File</th><th>Grade</th><th>Scale</th><th>In project</th><th>In docs</th><th /></tr></thead>
          <tbody>{[...plans].sort((a, b) => a.floor - b.floor).map((x) => <tr key={x.id} className={x.id === plan?.id ? 'sel' : ''}>
            <td>A-{101 + x.floor}</td><td>{x.level}</td><td>{x.name}</td><td>{x.quality.grade} ({x.quality.score}){x.quality.accurate ? ' ✓' : ''}</td><td>{SCALE_LABEL[x.scale.from]}</td>
            <td>{x.integrated ? '✓' : '—'}</td><td>{x.inDocs ? '✓' : '—'}</td>
            <td className="nowrap"><button onClick={() => { setCurId(x.id); setPick(null); setCal(null); hist.current = { past: [], future: [] }; }}>Open</button><button className="ghost" onClick={async () => { if (await askDelete(<>Delete <b>{x.level}</b> ({x.name}) from this project?</>)) update((d) => { setInDocs(d, x, false); d.floorPlans = (d.floorPlans ?? []).filter((y) => y.id !== x.id); if (x.integrated) setIntegrated(d, x.id, false); }); }}>Delete</button></td></tr>)}</tbody></table></div>
      </Card>}
    </div>
  );
}

