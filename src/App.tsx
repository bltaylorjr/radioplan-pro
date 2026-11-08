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
import { LocatePage } from './pages/Locate';
import { APP_VERSION } from './engine/update';
import { MeasureCtx } from './components/ui';
import { missingRequired } from './engine/required';
import { AutoTerrain } from './components/AutoTerrain';
import { ScenariosPage } from './pages/Scenarios';
import { NetworkPage } from './pages/Network';
import { SurveyPage } from './pages/Survey';
import { WifiSurveyPage } from './pages/WifiSurvey';
import { CalculatorsPage } from './pages/Calculators';
import { SyncPage } from './pages/Sync';
import { ProjectsPage } from './pages/Projects';
import { SpecLibraryPage } from './pages/SpecLibrary';
import { InstallPage } from './pages/Install';
import { FieldNotesPage } from './pages/FieldNotes';
import { ContactsPage } from './pages/Contacts';
import { BlueprintsPage } from './pages/Blueprints';
import { SelfRepair } from './components/SelfRepair';
import { Checklist } from './components/Checklist';
import { CHECKLISTS, checklistFor, progressOf } from './data/checklists';
import { TroubleshootPage } from './pages/Troubleshoot';
import { SystemsPage } from './pages/Systems';
import { ServicePage } from './pages/Service';
import { AutoDesignPage } from './pages/AutoDesign';
import { readBackup } from './engine/projectdb';
import { Updater } from './components/Updater';
import { Welcome } from './components/Welcome';
const TerrainPage = lazy(() => import('./pages/Terrain'));
const CoveragePage = lazy(() => import('./pages/Coverage'));
const View3DPage = lazy(() => import('./pages/View3D'));

export const WORKFLOW: { id: string; label: string; group: string; el: React.ReactNode }[] = [
  { id: 'company', label: 'Company & Project', group: '1 · Project setup', el: <CompanyPage /> },
  { id: 'systems', label: 'Project Systems & Toolkits', group: '1 · Project setup', el: <SystemsPage /> },
  { id: 'locate', label: 'Find Location & Auto-Plan', group: '1 · Project setup', el: <LocatePage /> },
  { id: 'sites', label: 'Site Data & GPS', group: '1 · Project setup', el: <SitesPage /> },
  { id: 'fieldnotes', label: 'Field Notes & Photos', group: '2 · Planning: site survey', el: <FieldNotesPage /> },
  { id: 'terrain', label: 'Map & Terrain', group: '2 · Planning: site survey', el: <TerrainPage /> },
  { id: 'wifi', label: 'Wi-Fi & Network Survey', group: '2 · Planning: site survey', el: <WifiSurveyPage /> },
  { id: 'survey', label: 'Drive Test & Calibration', group: '2 · Planning: site survey', el: <SurveyPage /> },
  { id: 'autodesign', label: 'Auto-Design & 3D Model', group: '3 · Planning: low-voltage design', el: <AutoDesignPage /> },
  { id: 'alarm', label: 'Fire Alarm & Batteries', group: '3 · Planning: low-voltage design', el: <AlarmPage /> },
  { id: 'erces', label: 'Emergency Radio (ERCES / BDA)', group: '3 · Planning: low-voltage design', el: <ErcesPage /> },
  { id: 'indoor', label: 'Indoor Coverage & DAS', group: '3 · Planning: low-voltage design', el: <IndoorPage /> },
  { id: 'solar', label: 'Solar & DC Power', group: '3 · Planning: low-voltage design', el: <SolarPage /> },
  { id: 'grounding', label: 'Grounding & Structure', group: '3 · Planning: low-voltage design', el: <GroundingPage /> },
  { id: 'equipment', label: 'Equipment & Link Budget', group: '4 · Planning: radio & RF', el: <EquipmentPage /> },
  { id: 'path', label: 'Path Profile / LOS / Fresnel', group: '4 · Planning: radio & RF', el: <PathPage /> },
  { id: 'coverage', label: 'Coverage Prediction', group: '4 · Planning: radio & RF', el: <CoveragePage /> },
  { id: 'optimize', label: 'Tilt, Azimuth & Power', group: '4 · Planning: radio & RF', el: <OptimizePage /> },
  { id: 'network', label: 'Multi-site & Interference', group: '4 · Planning: radio & RF', el: <NetworkPage /> },
  { id: 'scenarios', label: 'Scenarios & Compare', group: '4 · Planning: radio & RF', el: <ScenariosPage /> },
  { id: 'view3d', label: '3D Model', group: '4 · Planning: radio & RF', el: <View3DPage /> },
  { id: 'lfhf', label: 'LF / HF Systems', group: '4 · Planning: radio & RF', el: <LfHfPage /> },
  { id: 'compliance', label: 'Code Compliance', group: '5 · Planning: codes & materials', el: <CompliancePage /> },
  { id: 'materials', label: 'Materials List', group: '5 · Planning: codes & materials', el: <MaterialsPage /> },
  { id: 'blueprints', label: 'Blueprints & Drawing Sets', group: '5 · Planning: codes & materials', el: <BlueprintsPage /> },
  { id: 'testing', label: 'Final Testing', group: '6 · Testing & closeout', el: <TestingPage /> },
  { id: 'reports', label: 'Reports, Proposals & Closeout', group: '6 · Testing & closeout', el: <ReportsPage /> },
  { id: 'troubleshoot', label: 'Troubleshooting Wizard', group: '7 · Troubleshooting & repair', el: <TroubleshootPage /> },
  { id: 'service', label: 'Service & Maintenance', group: '7 · Troubleshooting & repair', el: <ServicePage /> },
  { id: 'install', label: 'Installation Guides', group: 'Tools', el: <InstallPage /> },
  { id: 'library', label: 'Specifications Library', group: 'Tools', el: <SpecLibraryPage /> },
  { id: 'contacts', label: 'Contacts & Web Resources', group: 'Tools', el: <ContactsPage /> },
  { id: 'calculators', label: 'Calculators', group: 'Tools', el: <CalculatorsPage /> },
  { id: 'projects', label: 'Projects & Storage', group: 'Tools', el: <ProjectsPage /> },
  { id: 'sync', label: 'Sync Devices', group: 'Tools', el: <SyncPage /> },
];

/** Step number in the workflow; the Tools pages are not steps and have none. */
const STEPS = WORKFLOW.filter((w) => w.group !== 'Tools');
const stepNo = (w: { id: string }) => { const i = STEPS.findIndex((x) => x.id === w.id); return i < 0 ? null : i + 1; };

export default function App() {
  const { page, go, project, update, rt, setRt, lib } = useStore();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tour, setTour] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const isHelp = page.startsWith('help');
  const current = WORKFLOW.find((w) => w.id === page) ?? (isHelp ? null : WORKFLOW[0]);
  const topic = HELP.find((h) => h.page === current?.id) ?? HELP[0];
  const idx = current ? WORKFLOW.indexOf(current) : -1;
  const findings = evaluateCompliance({ project, profile: rt.profile });
  const nViol = findings.filter((f) => f.severity === 'violation').length;
  const nReq = missingRequired(project).length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'F1') { e.preventDefault(); setHelpOpen((x) => !x); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => { setHelpOpen(false); setTour(false); setNavOpen(false); }, [page]);
  const [welcome, setWelcome] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem('radioplan.seenIntro')) { localStorage.setItem('radioplan.seenIntro', '1'); setWelcome(true); } } catch { /* ignore */ } }, []);

  const save = () => downloadText(`${(project.meta.name || 'project').replace(/[^\w-]+/g, '_')}.radioplan.json`, JSON.stringify(project, null, 2), 'application/json');
  const open = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => { const f = i.files?.[0]; if (!f) return; try { const ids = await lib.importProjects(readBackup(await f.text())); if (ids[0]) await lib.openProject(ids[0]); } catch (e) { alert('Not a valid project file: ' + e); } };
    i.click();
  };
  const groups = [...new Set(WORKFLOW.map((w) => w.group))];
  return (
    <MeasureCtx.Provider value={project.settings.units === 'km' ? 'metric' : 'imperial'}>
    <div className={'app' + (navOpen ? ' nav-open' : '')}>
      <AutoTerrain />
      <Updater />
      {welcome && <Welcome onClose={() => setWelcome(false)} onHelp={() => setHelpOpen(true)} />}
      <header className="topbar">
        <button className="ghost menu" onClick={() => setNavOpen(!navOpen)} aria-label="Menu">☰</button>
        <div className="brand" title="Low-voltage and radio system planning"><span className="logo">◉</span> RadioPlan <b>Pro</b></div>
        <span className={'chip ' + (online ? 'on' : 'off')} title={online ? 'Online: maps and terrain download automatically and are cached' : 'Offline: using cached maps and terrain'}>{online ? '● Online' : '○ Offline'}</span>
        {rt.terrainStatus && <span className="chip terr" title="Automatic terrain">{rt.terrainStatus}</span>}
        {rt.mapStatus && <span className="chip terr" title="Automatic offline maps">{rt.mapStatus}</span>}
        <div className="proj">{project.company.name && <span className="muted">{project.company.name} · </span>}{project.meta.name} <span className="muted">({project.meta.state})</span></div>
        <div className="top-actions">
          <span className={'chip save ' + lib.saveState} title={lib.saveError || 'Projects save automatically in the app'}>{{ loading: '… Opening', saving: '● Saving', saved: '✓ Saved', error: '⚠ Not saved', unavailable: 'File only' }[lib.saveState]}</span>
          <button onClick={() => go('projects')} title="All projects stored in the app">Projects</button>
          <button onClick={open} title="Import a .radioplan.json project file into the app">Open file</button>
          <button onClick={save} title="Export this project as a file">Export</button>
          <button onClick={() => lib.newProject(undefined, 'New project')} title="Start a new project (the current one stays in Projects)">New</button>
          <button className="primary" onClick={() => setHelpOpen(!helpOpen)} title="Help for this page (F1)">? Help</button>
        </div>
      </header>
      <nav className="sidebar">
        {groups.map((g) => (
          <div key={g} className="nav-group">
            <div className="nav-group-title">{g}</div>
            {WORKFLOW.filter((w) => w.group === g).map((w) => (
              <a key={w.id} href={`#${w.id}`} className={w.id === current?.id ? 'active' : ''} onClick={(e) => { e.preventDefault(); go(w.id); }}>
                {(() => { const cl = checklistFor(w.id), pr = cl && progressOf(cl, project), full = !!pr && pr.total > 0 && pr.done === pr.total; return <span className={'step-dot' + (full ? ' done' : '') + (stepNo(w) ? '' : ' tool')} title={pr ? `${pr.done} of ${pr.total} checklist items done` : undefined}>{full ? '✓' : stepNo(w) ?? '•'}</span>; })()}
                {w.label}
                {w.id === 'compliance' && nViol > 0 && <span className="pill bad">{nViol}</span>}
                {w.id === 'company' && rt.showRequired && nReq > 0 && <span className="pill bad" title={`${nReq} required field(s) empty`}>{nReq}</span>}
              </a>
            ))}
          </div>
        ))}
        <div className="nav-group"><a href="#help" className={isHelp ? 'active' : ''}><span className="step-dot">?</span>Help manual</a></div>
        <div className="nav-group mobile-only"><div className="nav-group-title">Project file</div>
          <div className="row wrap" style={{ padding: '0 8px' }}><button onClick={() => go('projects')}>Projects</button><button onClick={open}>Open file</button><button onClick={save}>Export</button></div></div>
        <div className="progress">{(() => { const t = CHECKLISTS.map((c) => progressOf(c, project)).reduce((a, b) => ({ done: a.done + b.done, total: a.total + b.total }), { done: 0, total: 0 }); return `Checklists: ${t.done} of ${t.total} items done`; })()}</div>
      </nav>
      <main className="content">
        {isHelp ? <HelpManual initial={page.split('/')[1]} /> : current && (
          <>
            <div className="page-head">
              <div><div className="crumb">{stepNo(current) ? `Step ${stepNo(current)} of ${STEPS.length} · ${current.group}` : current.group}</div><h1>{current.label}</h1></div>
              <div className="row wrap page-nav">
                <button disabled={idx <= 0} onClick={() => go(WORKFLOW[idx - 1].id)} aria-label="Previous page" title={WORKFLOW[idx - 1]?.label}>←</button>
                <select value={current.id} onChange={(e) => go(e.target.value)} aria-label="Go to page" data-no-choose>
                  {groups.map((g) => <optgroup key={g} label={g}>{WORKFLOW.filter((w) => w.group === g).map((w) => <option key={w.id} value={w.id}>{stepNo(w) ? `${stepNo(w)}. ` : ''}{w.label}</option>)}</optgroup>)}
                </select>
                <button disabled={idx >= WORKFLOW.length - 1} onClick={() => go(WORKFLOW[idx + 1].id)} aria-label="Next page" title={WORKFLOW[idx + 1]?.label}>→</button>
                {topic.tour && <button onClick={() => setTour(true)} data-tour-btn>▶ Guide me</button>}
                <button onClick={() => setHelpOpen(true)}>? Page help</button>
              </div>
            </div>
            <SelfRepair page={current.id}><Suspense fallback={<div className="card">Loading…</div>}>{current.el}</Suspense>{checklistFor(current.id) && <div data-tour="checklist" className="no-print" style={{ marginTop: 16 }}><Checklist def={checklistFor(current.id)!} /></div>}</SelfRepair>
            <footer className="page-foot">
              <button disabled={idx <= 0} onClick={() => go(WORKFLOW[idx - 1].id)}>← {WORKFLOW[idx - 1]?.label ?? 'Back'}</button>
              <span />
              <button className="primary" disabled={idx >= WORKFLOW.length - 1} onClick={() => go(WORKFLOW[idx + 1].id)}>{WORKFLOW[idx + 1]?.label ?? 'Next'} →</button>
            </footer>
            <p className="disclaimer">Planning aid only. Calculations and code citations must be verified by a licensed professional and the Authority Having Jurisdiction.</p>
          </>
        )}
        <p className="copyright no-print">© {new Date().getFullYear()} Bobby Taylor. All rights reserved. · RadioPlan Pro {APP_VERSION}</p>
      </main>
      {helpOpen && !isHelp && <HelpPanel topic={topic} onClose={() => setHelpOpen(false)} onTour={topic.tour ? () => { setHelpOpen(false); setTour(true); } : undefined} />}
      {tour && topic.tour && <Tour steps={topic.tour} onClose={() => setTour(false)} />}
    </div>
    </MeasureCtx.Provider>
  );
}
