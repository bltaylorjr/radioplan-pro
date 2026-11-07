import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useStore, downloadText } from './store';
import { HELP } from './help/content';
import { HelpManual, HelpPanel, Tour } from './help/HelpUI';
import { evaluateCompliance } from './compliance/rules';
import { CompanyPage } from './pages/Company';
import { SitesPage } from './pages/Sites';
import { EquipmentPage } from './pages/Equipment';
import { PathPage } from './pages/Path';
import { OptimizePage } from './pages/Optimize';
import { GroundingPage } from './pages/Grounding';
import { LfHfPage, SolarPage, AlarmPage, ErcesPage } from './pages/Specialty';
import { CompliancePage } from './pages/Compliance';
import { MaterialsPage } from './pages/Materials';
import { ReportsPage } from './pages/Reports';
import { TestingPage } from './pages/Testing';
import { IndoorPage } from './pages/Indoor';
const TerrainPage = lazy(() => import('./pages/Terrain'));
const CoveragePage = lazy(() => import('./pages/Coverage'));
const View3DPage = lazy(() => import('./pages/View3D'));

export const WORKFLOW: { id: string; label: string; group: string; el: React.ReactNode }[] = [
  { id: 'company', label: 'Company & Project', group: '1 · Start', el: <CompanyPage /> },
  { id: 'sites', label: 'Site Data & GPS', group: '1 · Start', el: <SitesPage /> },
  { id: 'terrain', label: 'Map & Terrain', group: '1 · Start', el: <TerrainPage /> },
  { id: 'equipment', label: 'Equipment & Link Budget', group: '2 · Outdoor design', el: <EquipmentPage /> },
  { id: 'path', label: 'Path Profile / LOS / Fresnel', group: '2 · Outdoor design', el: <PathPage /> },
  { id: 'coverage', label: 'Coverage Prediction', group: '2 · Outdoor design', el: <CoveragePage /> },
  { id: 'optimize', label: 'Tilt, Azimuth & Power', group: '2 · Outdoor design', el: <OptimizePage /> },
  { id: 'view3d', label: '3D Model', group: '2 · Outdoor design', el: <View3DPage /> },
  { id: 'grounding', label: 'Grounding & Structure', group: '2 · Outdoor design', el: <GroundingPage /> },
  { id: 'indoor', label: 'Indoor Planning', group: '3 · Indoor design', el: <IndoorPage /> },
  { id: 'erces', label: 'Emergency Radio (ERCES)', group: '3 · Indoor design', el: <ErcesPage /> },
  { id: 'lfhf', label: 'LF / HF Systems', group: '4 · Specialty systems', el: <LfHfPage /> },
  { id: 'alarm', label: 'Alarm Systems', group: '4 · Specialty systems', el: <AlarmPage /> },
  { id: 'solar', label: 'Solar & DC Power', group: '4 · Specialty systems', el: <SolarPage /> },
  { id: 'compliance', label: 'Code Compliance', group: '5 · Verify & deliver', el: <CompliancePage /> },
  { id: 'materials', label: 'Materials List', group: '5 · Verify & deliver', el: <MaterialsPage /> },
  { id: 'reports', label: 'Reports', group: '5 · Verify & deliver', el: <ReportsPage /> },
  { id: 'testing', label: 'Final Testing', group: '5 · Verify & deliver', el: <TestingPage /> },
];

export default function App() {
  const { page, go, project, update, replace, rt } = useStore();
  const [helpOpen, setHelpOpen] = useState(false);
  const [tour, setTour] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const isHelp = page.startsWith('help');
  const current = WORKFLOW.find((w) => w.id === page) ?? (isHelp ? null : WORKFLOW[0]);
  const topic = HELP.find((h) => h.page === current?.id) ?? HELP[0];
  const idx = current ? WORKFLOW.indexOf(current) : -1;
  const findings = evaluateCompliance({ project, profile: rt.profile });
  const nViol = findings.filter((f) => f.severity === 'violation').length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'F1') { e.preventDefault(); setHelpOpen((x) => !x); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => { setHelpOpen(false); setTour(false); setNavOpen(false); }, [page]);
  useEffect(() => { try { if (!localStorage.getItem('radioplan.seenIntro')) { localStorage.setItem('radioplan.seenIntro', '1'); setHelpOpen(true); } } catch { /* ignore */ } }, []);

  const save = () => downloadText(`${(project.meta.name || 'project').replace(/[^\w-]+/g, '_')}.radioplan.json`, JSON.stringify(project, null, 2), 'application/json');
  const open = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => { const f = i.files?.[0]; if (!f) return; try { replace(JSON.parse(await f.text())); } catch (e) { alert('Not a valid project file: ' + e); } };
    i.click();
  };
  const groups = [...new Set(WORKFLOW.map((w) => w.group))];
  return (
    <div className={'app' + (navOpen ? ' nav-open' : '')}>
      <header className="topbar">
        <button className="ghost menu" onClick={() => setNavOpen(!navOpen)} aria-label="Menu">☰</button>
        <div className="brand"><span className="logo">◉</span> RadioPlan <b>Pro</b></div>
        <div className="proj">{project.company.name && <span className="muted">{project.company.name} · </span>}{project.meta.name} <span className="muted">({project.meta.state})</span></div>
        <div className="top-actions">
          <button onClick={open} title="Open a .radioplan.json project file">Open</button>
          <button onClick={save} title="Save project file">Save project</button>
          <button onClick={() => { if (confirm('Start a new project? Unsaved work in this browser will be replaced.')) replace({} as never); }}>New</button>
          <button className="primary" onClick={() => setHelpOpen(!helpOpen)} title="Help for this page (F1)">? Help</button>
        </div>
      </header>
      <nav className="sidebar">
        {groups.map((g) => (
          <div key={g} className="nav-group">
            <div className="nav-group-title">{g}</div>
            {WORKFLOW.filter((w) => w.group === g).map((w) => (
              <a key={w.id} href={`#${w.id}`} className={w.id === current?.id ? 'active' : ''} onClick={(e) => { e.preventDefault(); go(w.id); }}>
                <span className={'step-dot' + (project.taskDone[w.id] ? ' done' : '')}>{project.taskDone[w.id] ? '✓' : WORKFLOW.indexOf(w) + 1}</span>
                {w.label}
                {w.id === 'compliance' && nViol > 0 && <span className="pill bad">{nViol}</span>}
              </a>
            ))}
          </div>
        ))}
        <div className="nav-group"><a href="#help" className={isHelp ? 'active' : ''}><span className="step-dot">?</span>Help manual</a></div>
        <div className="nav-group mobile-only"><div className="nav-group-title">Project file</div>
          <div className="row wrap" style={{ padding: '0 8px' }}><button onClick={open}>Open</button><button onClick={save}>Save</button></div></div>
        <div className="progress">{Object.values(project.taskDone).filter(Boolean).length} / {WORKFLOW.length} tasks complete</div>
      </nav>
      <main className="content">
        {isHelp ? <HelpManual initial={page.split('/')[1]} /> : current && (
          <>
            <div className="page-head">
              <div><div className="crumb">Step {idx + 1} of {WORKFLOW.length} · {current.group}</div><h1>{current.label}</h1></div>
              <div className="row">
                {topic.tour && <button onClick={() => setTour(true)} data-tour-btn>▶ Guide me</button>}
                <button onClick={() => setHelpOpen(true)}>? Page help</button>
              </div>
            </div>
            <Suspense fallback={<div className="card">Loading…</div>}>{current.el}</Suspense>
            <footer className="page-foot">
              <button disabled={idx <= 0} onClick={() => go(WORKFLOW[idx - 1].id)}>← {WORKFLOW[idx - 1]?.label ?? 'Back'}</button>
              <label className="check" data-tour="task-done"><input type="checkbox" checked={!!project.taskDone[current.id]} onChange={(e) => update((d) => { d.taskDone[current.id] = e.target.checked; })} /> Mark task complete</label>
              <button className="primary" disabled={idx >= WORKFLOW.length - 1} onClick={() => go(WORKFLOW[idx + 1].id)}>{WORKFLOW[idx + 1]?.label ?? 'Next'} →</button>
            </footer>
            <p className="disclaimer">Planning aid only. Calculations and code citations must be verified by a licensed professional and the Authority Having Jurisdiction.</p>
          </>
        )}
      </main>
      {helpOpen && !isHelp && <HelpPanel topic={topic} onClose={() => setHelpOpen(false)} onTour={topic.tour ? () => { setHelpOpen(false); setTour(true); } : undefined} />}
      {tour && topic.tour && <Tour steps={topic.tour} onClose={() => setTour(false)} />}
    </div>
  );
}
