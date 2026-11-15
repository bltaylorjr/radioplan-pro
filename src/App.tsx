import React, { Suspense, lazy, useEffect, useState } from 'react';
import { loadChunk } from './engine/chunkload';
import { useStore, downloadText } from './store';
import { HELP } from './help/content';
import { HelpManual, HelpPanel, Tour } from './help/HelpUI';
import { IntroVideo, firstVisitVideo } from './components/IntroVideo';
import { ALWAYS_PAGES } from './data/customPages';
import { evaluateCompliance } from './compliance/rules';
import { CompanyPage } from './pages/Company';
import { APP_VERSION } from './engine/update';
import { MeasureCtx } from './components/ui';
import { missingRequired } from './engine/required';
import { AutoTerrain } from './components/AutoTerrain';
import { ProjectNoticeBanner } from './components/Notices';
import { RrJobBadge } from './components/RrJobBadge';
const RadioReferencePage = page(() => import('./pages/RadioReference'), 'RadioReferencePage');
import { SelfRepair } from './components/SelfRepair';
import { Checklist } from './components/Checklist';
import { CHECKLISTS, checklistFor, progressOf } from './data/checklists';
import { readBackup } from './engine/projectdb';
import { Updater } from './components/Updater';
import { Maintainer } from './components/Maintainer';
import { Welcome } from './components/Welcome';
import { ClearPageButton, UndoClearBar } from './components/ClearPage';
import type { Project } from './types';
import { ToolNotice, useAutoTools } from './components/ToolNotice';
import { useHiddenTools, setToolOn } from './engine/toolPrefs';
import { MENU_GROUPS, MENU_ORDER, groupHeading } from './data/menu';
import { FEATURES } from './help/features';
import type { TourStep } from './help/content';
import { NavFind } from './components/NavFind';
import { DevicesPage, useDevices } from './pages/Devices';
import { setDistanceUnit, ROLE_LABEL } from './engine/devices';
/** Each page loads the first time it is opened, so the app starts quickly. */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  return lazy(() => loadChunk(load).then((m) => ({ default: m[name] as React.ComponentType })));
}
const DirectionsPage = page(() => import('./pages/Directions'), 'DirectionsPage');
const SitesPage = page(() => import('./pages/Sites'), 'SitesPage');
const EquipmentPage = page(() => import('./pages/Equipment'), 'EquipmentPage');
const PathPage = page(() => import('./pages/Path'), 'PathPage');
const OptimizePage = page(() => import('./pages/Optimize'), 'OptimizePage');
const GroundingPage = page(() => import('./pages/Grounding'), 'GroundingPage');
const LfHfPage = page(() => import('./pages/Specialty'), 'LfHfPage');
const SolarPage = page(() => import('./pages/Specialty'), 'SolarPage');
const AlarmPage = page(() => import('./pages/Specialty'), 'AlarmPage');
const ErcesPage = page(() => import('./pages/Specialty'), 'ErcesPage');
const CompliancePage = page(() => import('./pages/Compliance'), 'CompliancePage');
const MaterialsPage = page(() => import('./pages/Materials'), 'MaterialsPage');
const ReportsPage = page(() => import('./pages/Reports'), 'ReportsPage');
const TestingPage = page(() => import('./pages/Testing'), 'TestingPage');
const IndoorPage = page(() => import('./pages/Indoor'), 'IndoorPage');
const LocatePage = page(() => import('./pages/Locate'), 'LocatePage');
const ScenariosPage = page(() => import('./pages/Scenarios'), 'ScenariosPage');
const NetworkPage = page(() => import('./pages/Network'), 'NetworkPage');
const SurveyPage = page(() => import('./pages/Survey'), 'SurveyPage');
const WifiSurveyPage = page(() => import('./pages/WifiSurvey'), 'WifiSurveyPage');
const CalculatorsPage = page(() => import('./pages/Calculators'), 'CalculatorsPage');
const TheoryPage = page(() => import('./pages/Theory'), 'TheoryPage');
const SyncPage = page(() => import('./pages/Sync'), 'SyncPage');
const ProjectsPage = page(() => import('./pages/Projects'), 'ProjectsPage');
const SpecLibraryPage = page(() => import('./pages/SpecLibrary'), 'SpecLibraryPage');
const InstallPage = page(() => import('./pages/Install'), 'InstallPage');
const FieldNotesPage = page(() => import('./pages/FieldNotes'), 'FieldNotesPage');
const PhotoSurveyPage = page(() => import('./pages/PhotoSurvey'), 'PhotoSurveyPage');
const ContactsPage = page(() => import('./pages/Contacts'), 'ContactsPage');
const BlueprintsPage = page(() => import('./pages/Blueprints'), 'BlueprintsPage');
const TroubleshootPage = page(() => import('./pages/Troubleshoot'), 'TroubleshootPage');
const SystemsPage = page(() => import('./pages/Systems'), 'SystemsPage');
const ServicePage = page(() => import('./pages/Service'), 'ServicePage');
const AutoDesignPage = page(() => import('./pages/AutoDesign'), 'AutoDesignPage');
const ModelsPage = page(() => import('./pages/Models'), 'ModelsPage');
const CampusPage = page(() => import('./pages/Campus'), 'CampusPage');
const SettingsPage = page(() => import('./pages/Settings'), 'SettingsPage');
const SignalReadingsPage = page(() => import('./pages/SignalReadings'), 'SignalReadingsPage');
const AssetsPage = page(() => import('./pages/Assets'), 'AssetsPage');
const TerrainPage = lazy(() => loadChunk(() => import('./pages/Terrain')));
const CoveragePage = lazy(() => loadChunk(() => import('./pages/Coverage')));
const View3DPage = lazy(() => loadChunk(() => import('./pages/View3D')));
const FccPage = lazy(() => loadChunk(() => import('./pages/Fcc')));
const FaaPage = lazy(() => loadChunk(() => import('./pages/Faa')));
const OfflineArea = page(() => import('./components/OfflineArea'), 'OfflineArea');
import { MapPackBadge } from './components/MapPacks';

/** Page components by menu id. The menu order, labels and sections live in src/data/menu.ts. */
export const PAGE_ELEMENTS: Record<string, React.ReactNode> = {
  company: <CompanyPage />,
  systems: <SystemsPage />,
  locate: <LocatePage />,
  sites: <SitesPage />,
  fieldnotes: <FieldNotesPage />,
  photosurvey: <PhotoSurveyPage />,
  terrain: <TerrainPage />,
  wifi: <WifiSurveyPage />,
  survey: <SurveyPage />,
  signal: <SignalReadingsPage />,
  autodesign: <AutoDesignPage />,
  models: <ModelsPage />,
  campus: <CampusPage />,
  alarm: <AlarmPage />,
  erces: <ErcesPage />,
  indoor: <IndoorPage />,
  solar: <SolarPage />,
  grounding: <GroundingPage />,
  equipment: <EquipmentPage />,
  path: <PathPage />,
  coverage: <CoveragePage />,
  optimize: <OptimizePage />,
  network: <NetworkPage />,
  scenarios: <ScenariosPage />,
  view3d: <View3DPage />,
  radioref: <RadioReferencePage />,
  fcc: <FccPage />,
  lfhf: <LfHfPage />,
  compliance: <CompliancePage />,
  faa: <FaaPage />,
  materials: <MaterialsPage />,
  blueprints: <BlueprintsPage />,
  testing: <TestingPage />,
  reports: <ReportsPage />,
  troubleshoot: <TroubleshootPage />,
  directions: <DirectionsPage />,
  service: <ServicePage />,
  assets: <AssetsPage />,
  devices: <DevicesPage />,
  install: <InstallPage />,
  theory: <TheoryPage />,
  library: <SpecLibraryPage />,
  contacts: <ContactsPage />,
  calculators: <CalculatorsPage />,
  mappacks: <OfflineArea />,
  projects: <ProjectsPage />,
  sync: <SyncPage />,
  settings: <SettingsPage />,
};

export interface WorkflowPage { id: string; label: string; group: string; groupId: string; steps: boolean; el: React.ReactNode }
/** The menu, in order, with each page's component. */
export const WORKFLOW: WorkflowPage[] = MENU_ORDER.filter((p) => PAGE_ELEMENTS[p.id]).map((p) => {
  const g = MENU_GROUPS.find((x) => x.id === p.group)!;
  return { id: p.id, label: p.label, group: groupHeading(g), groupId: g.id, steps: g.steps, el: PAGE_ELEMENTS[p.id] };
});


export default function App() {
  const { page, go, project, update, rt, setRt, lib } = useStore();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tour, setTour] = useState<TourStep[] | null>(null);
  const [video, setVideo] = useState<false | 'first' | true>(false);
  const [navOpen, setNavOpen] = useState(false);
  const isHelp = page.startsWith('help');
  const current = WORKFLOW.find((w) => w.id === page) ?? (isHelp ? null : WORKFLOW[0]);
  const topic = HELP.find((h) => h.page === current?.id) ?? HELP.find((h) => h.id === 'getting-started') ?? HELP[0];
  const [lastTopic, setLastTopic] = useState('');
  useEffect(() => { if (!isHelp && current) setLastTopic(topic.id); }, [isHelp, current, topic.id]);
  const [showAll, setShowAll] = useState(false);
  const custom = project.meta.projectType === 'custom' && (project.meta.customPages?.length ?? 0) > 0;
  /** The pages in the menu: all of them, or only the custom pick. */
  const hiddenTools = useHiddenTools();
  useAutoTools();
  const off = new Set(hiddenTools.filter((x) => !ALWAYS_PAGES.includes(x)));
  /** The pages in the menu: all of them, or only the custom pick, less the tools turned off in User Settings. */
  const VIS = (custom && !showAll ? WORKFLOW.filter((w) => ALWAYS_PAGES.includes(w.id) || project.meta.customPages!.includes(w.id)) : WORKFLOW).filter((w) => !off.has(w.id));
  /** Step number in the workflow; the Tools pages are not steps and have none. */
  const STEPS = VIS.filter((w) => w.steps);
  const stepNo = (w: { id: string }) => { const i = STEPS.findIndex((x) => x.id === w.id); return i < 0 ? null : i + 1; };
  const idx = current ? VIS.indexOf(current) : -1;
  const skipped = new Set(project.meta.skipped ?? []);
  const canSkip = (id: string) => id !== 'company' && !!WORKFLOW.find((w) => w.id === id)?.steps;
  /** Previous / next page, passing over skipped steps. */
  const near = (dir: 1 | -1) => { for (let i = idx + dir; i >= 0 && i < VIS.length; i += dir) if (!skipped.has(VIS[i].id)) return VIS[i]; return undefined; };
  const prevW = near(-1), nextW = near(1);
  const setSkip = (id: string, on: boolean) => update((d) => { const s = new Set(d.meta.skipped ?? []); if (on) s.add(id); else s.delete(id); d.meta.skipped = [...s]; });
  const findings = evaluateCompliance({ project, profile: rt.profile });
  const nViol = findings.filter((f) => f.severity === 'violation').length;
  const nReq = missingRequired(project).length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'F1') { e.preventDefault(); setHelpOpen((x) => !x); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  /** "▶ Show me" on a feature: open its page, then run its walkthrough once the page is there. */
  const pendingTour = React.useRef(false);
  useEffect(() => { setHelpOpen(false); setNavOpen(false); if (!pendingTour.current) setTour(null); }, [page]);
  /** Keep the open page in view in the menu. */
  useEffect(() => { const t = setTimeout(() => document.querySelector('.sidebar a.active')?.scrollIntoView({ block: 'nearest' }), 50); return () => clearTimeout(t); }, [page, navOpen]);
  useEffect(() => {
    const on = (e: Event) => {
      const f = FEATURES.find((x) => x.id === (e as CustomEvent<string>).detail); if (!f) return;
      const steps = f.tour?.length ? f.tour : [{ target: 'text:' + f.title, title: f.title, text: f.summary }];
      pendingTour.current = true; setHelpOpen(false); setNavOpen(false); setTour(null);
      go(f.page);
      setTimeout(() => { pendingTour.current = false; setTour(steps); }, 400);
    };
    window.addEventListener('lvplan:feature', on); return () => window.removeEventListener('lvplan:feature', on);
  }, [go]);
  /** Folded menu sections (remembered on this device). */
  const [folded, setFolded] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('lvplan.menuFolded') || '[]'); } catch { return []; } });
  const toggleFold = (id: string) => setFolded((f) => { const n = f.includes(id) ? f.filter((x) => x !== id) : [...f, id]; try { localStorage.setItem('lvplan.menuFolded', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [welcome, setWelcome] = useState(false);
  /** After "Clear all fields": the page's entries before clearing (for Undo) and a counter that resets typed-in boxes. */
  const [cleared, setCleared] = useState<{ page: string; before: Project } | null>(null);
  const [resetN, setResetN] = useState(0);
  useEffect(() => { setCleared((c) => (c && c.page !== page ? null : c)); }, [page]);
  const endClear = React.useCallback((undone: boolean) => { setCleared(null); if (undone) setResetN((n) => n + 1); }, []);
  const devs = useDevices();
  useEffect(() => setDistanceUnit(project.settings.units === 'km' ? 'm' : 'ft'), [project.settings.units]);
  useEffect(() => { if (firstVisitVideo()) setVideo('first'); }, []);
  useEffect(() => { try { if (!localStorage.getItem('radioplan.seenIntro')) { localStorage.setItem('radioplan.seenIntro', '1'); setWelcome(true); } } catch { /* ignore */ } }, []);

  const save = () => downloadText(`${(project.meta.name || 'project').replace(/[^\w-]+/g, '_')}.radioplan.json`, JSON.stringify(project, null, 2), 'application/json');
  const open = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => { const f = i.files?.[0]; if (!f) return; try { const ids = await lib.importProjects(readBackup(await f.text())); if (ids[0]) await lib.openProject(ids[0]); } catch (e) { alert('Not a valid project file: ' + e); } };
    i.click();
  };
  const groups = [...new Set(VIS.map((w) => w.group))];
  const numbered = !(custom && !showAll);
  return (
    <MeasureCtx.Provider value={project.settings.units === 'km' ? 'metric' : 'imperial'}>
    <div className={'app' + (navOpen ? ' nav-open' : '')}>
      <AutoTerrain />
      <Updater />
      <Maintainer />
      {welcome && !video && <Welcome onClose={() => setWelcome(false)} onHelp={() => setHelpOpen(true)} />}
      <header className="topbar">
        <button className="ghost menu" onClick={() => setNavOpen(!navOpen)} aria-label="Menu">☰</button>
        <div className="brand" title="Low-voltage system planning"><span className="logo">◉</span> LvPlan <b>Pro</b></div>
        <span className={'chip ' + (online ? 'on' : 'off')} title={online ? 'Online: maps and terrain download automatically and are cached' : 'Offline: using cached maps and terrain'}>{online ? '● Online' : '○ Offline'}</span>
        <RrJobBadge onOpen={() => go('radioref')} />
        <MapPackBadge onOpen={() => go('mappacks')} />
        {rt.terrainStatus && <span className="chip terr" title="Automatic terrain">{rt.terrainStatus}</span>}
        {rt.mapStatus && <span className="chip terr" title="Automatic offline maps">{rt.mapStatus}</span>}
        {devs.roles.length > 0 && <a href="#devices" className="chip on" title={devs.roles.map((r) => `${ROLE_LABEL[r]}: ${devs.state(r)?.name}`).join('\n')} onClick={(e) => { e.preventDefault(); go('devices'); }}>🔵 {devs.roles.length} device{devs.roles.length > 1 ? 's' : ''}</a>}
        <div className="proj">{project.company.name && <span className="muted">{project.company.name} · </span>}{project.meta.name} <span className="muted">({project.meta.state})</span></div>
        <div className="top-actions">
          <span className={'chip save ' + lib.saveState} title={lib.saveError || 'Projects save automatically in the app'}>{{ loading: '… Opening', saving: '● Saving', saved: '✓ Saved', error: '⚠ Not saved', unavailable: 'File only' }[lib.saveState]}</span>
          <button onClick={() => go('projects')} title="All projects stored in the app">Projects</button>
          <button onClick={open} title="Import a .radioplan.json project file into the app">Open file</button>
          <button onClick={save} title="Export this project as a file">Export</button>
          <button onClick={() => lib.newProject(undefined, 'New project')} title="Start a new project (the current one stays in Projects)">New</button>
          <button onClick={() => setVideo(true)} title="Watch the introduction video: a tour of every tool">▶ Video</button>
          <button className="primary" onClick={() => setHelpOpen(!helpOpen)} title="Help for this page (F1)">? Help</button>
        </div>
      </header>
      <nav className="sidebar">
        <NavFind pages={VIS} onGo={(id) => go(id)} />
        <div data-tour="nav-groups">
        {MENU_GROUPS.filter((g) => VIS.some((w) => w.groupId === g.id)).map((g) => {
          const open = !folded.includes(g.id) || current?.groupId === g.id;
          return (
          <div key={g.id} className={'nav-group' + (open ? '' : ' folded')}>
            <button type="button" className="nav-group-title" aria-expanded={open} title={g.hint + (open ? ' (tap to fold up)' : ' (tap to open)')} onClick={() => toggleFold(g.id)}>
              <span className="fold">{open ? '▾' : '▸'}</span>{groupHeading(g, numbered)}
            </button>
            {open && VIS.filter((w) => w.groupId === g.id).map((w) => (
              <a key={w.id} href={`#${w.id}`} className={(w.id === current?.id ? 'active' : '') + (skipped.has(w.id) ? ' skipped' : '')} title={skipped.has(w.id) ? 'Skipped on this project' : undefined} onClick={(e) => { e.preventDefault(); go(w.id); }}>
                {(() => { const cl = checklistFor(w.id), pr = cl && progressOf(cl, project), full = !!pr && pr.total > 0 && pr.done === pr.total; return <span className={'step-dot' + (full ? ' done' : '') + (stepNo(w) ? '' : ' tool')} title={pr ? `${pr.done} of ${pr.total} checklist items done` : undefined}>{skipped.has(w.id) ? '–' : full ? '✓' : stepNo(w) ?? '•'}</span>; })()}
                {w.label}
                {w.id === 'compliance' && nViol > 0 && <span className="pill bad">{nViol}</span>}
                {w.id === 'company' && rt.showRequired && nReq > 0 && <span className="pill bad" title={`${nReq} required field(s) empty`}>{nReq}</span>}
              </a>
            ))}
          </div>
          );
        })}
        </div>
        {project.meta.projectType === 'custom' && custom && <div className="nav-custom small">{showAll ? 'Showing every page.' : `Custom project: ${VIS.length} of ${WORKFLOW.length} pages.`} <a href="#" onClick={(e) => { e.preventDefault(); setShowAll(!showAll); }}>{showAll ? 'Show my pick' : 'Show all'}</a> · <a href="#systems" onClick={(e) => { e.preventDefault(); go('systems'); }}>Change</a></div>}
        {off.size > 0 && <div className="nav-custom small">{off.size} tool{off.size > 1 ? 's' : ''} turned off. <a href="#settings" onClick={(e) => { e.preventDefault(); go('settings'); }}>User Settings</a></div>}
        <div className="nav-group nav-help"><a href={lastTopic ? `#help/${lastTopic}` : '#help'} className={isHelp && !/^help\/(whats-new|menu-guide)$/.test(page) ? 'active' : ''}><span className="step-dot">?</span>Help manual</a>
          <a href="#help/whats-new" data-tour="nav-whatsnew" className={page === 'help/whats-new' ? 'active' : ''}><span className="step-dot">★</span>What's new</a>
          <a href="#help/menu-guide" className={page === 'help/menu-guide' ? 'active' : ''}><span className="step-dot">☰</span>Using the menu</a></div>
        <div className="nav-group mobile-only"><div className="nav-group-title">Project file</div>
          <div className="row wrap" style={{ padding: '0 8px' }}><button onClick={() => go('projects')}>Projects</button><button onClick={open}>Open file</button><button onClick={save}>Export</button></div></div>
        <div className="progress">{(() => { const t = CHECKLISTS.filter((c) => VIS.some((w) => w.id === c.page) && !skipped.has(c.page)).map((c) => progressOf(c, project)).reduce((a, b) => ({ done: a.done + b.done, total: a.total + b.total }), { done: 0, total: 0 }); return `Checklists: ${t.done} of ${t.total} items done`; })()}</div>
      </nav>
      <main className="content">
        {isHelp ? <HelpManual initial={page.split('/')[1]} /> : current && (
          <>
            <div className="page-head">
              <div><div className="crumb">{stepNo(current) ? `Step ${stepNo(current)} of ${STEPS.length} · ${current.group}` : current.group}</div><h1>{current.label}</h1></div>
              <div className="row wrap page-nav">
                <button disabled={!prevW} onClick={() => prevW && go(prevW.id)} aria-label="Previous page" title={prevW?.label}>←</button>
                <select value={current.id} onChange={(e) => go(e.target.value)} aria-label="Go to page" data-no-choose>
                  {!VIS.includes(current) && <option value={current.id}>{current.label}</option>}
                  {groups.map((g) => <optgroup key={g} label={g}>{VIS.filter((w) => w.group === g).map((w) => <option key={w.id} value={w.id}>{stepNo(w) ? `${stepNo(w)}. ` : ''}{w.label}</option>)}</optgroup>)}
                </select>
                <button disabled={!nextW} onClick={() => nextW && go(nextW.id)} aria-label="Next page" title={nextW?.label}>→</button>
                {topic.tour && <button onClick={() => setTour(topic.tour!)} data-tour-btn>▶ Guide me</button>}
                <button onClick={() => setHelpOpen(true)}>? Page help</button>
                <ClearPageButton page={current.id} label={current.label} onCleared={(before) => { setCleared({ page: current.id, before }); setResetN((n) => n + 1); }} />
              </div>
            </div>
            <ProjectNoticeBanner />
            {cleared && cleared.page === current.id && <UndoClearBar key={resetN} page={current.id} label={current.label} before={cleared.before} onDone={endClear} />}
            {off.has(current.id) && <p className="note no-print">This tool is turned off in User Settings, so it is not in the menu. <button onClick={() => setToolOn(current.id, true)}>Turn it back on</button></p>}
            {skipped.has(current.id) && <p className="note no-print">This step is skipped on this project. <button onClick={() => setSkip(current.id, false)}>Don't skip it</button></p>}
            <SelfRepair page={current.id}><Suspense fallback={<div className="card">Loading…</div>}><React.Fragment key={resetN}>{current.el}</React.Fragment></Suspense>{checklistFor(current.id) && <div data-tour="checklist" className="no-print" style={{ marginTop: 16 }}><Checklist def={checklistFor(current.id)!} /></div>}</SelfRepair>
            <footer className="page-foot">
              <button disabled={!prevW} onClick={() => prevW && go(prevW.id)}>← {prevW?.label ?? 'Back'}</button>
              {canSkip(current.id) && !skipped.has(current.id) ? <button className="ghost" onClick={() => { setSkip(current.id, true); if (nextW) go(nextW.id); }} title="Mark this step as not needed on this project and go to the next one. You can still open it from the menu.">Skip this step ⤼</button> : <span />}
              <button className="primary" disabled={!nextW} onClick={() => nextW && go(nextW.id)}>{nextW?.label ?? 'Next'} →</button>
            </footer>
            <p className="disclaimer">Planning aid only. Calculations and code citations must be verified by a licensed professional and the Authority Having Jurisdiction.</p>
          </>
        )}
        <p className="copyright no-print">© {new Date().getFullYear()} Bobby Taylor. All rights reserved. · LvPlan Pro {APP_VERSION}</p>
      </main>
      <ToolNotice />
      {video && <IntroVideo first={video === 'first'} onClose={() => setVideo(false)} />}
      {helpOpen && !isHelp && <HelpPanel topic={topic} onClose={() => setHelpOpen(false)} onTour={topic.tour ? () => { setHelpOpen(false); setTour(topic.tour!); } : undefined} />}
      {tour && <Tour key={tour.map((t) => t.target).join('|')} steps={tour} onClose={() => setTour(null)} />}
    </div>
    </MeasureCtx.Provider>
  );
}
