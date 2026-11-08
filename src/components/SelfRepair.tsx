import React from 'react';
import { useStore } from '../store';
import { repairProject } from '../engine/repair';
import { listVersions } from '../engine/projectdb';

const LOG = 'radioplan.repairLog', RELOADED = 'radioplan.chunkReload';
export function logRepair(what: string) {
  try { const l = JSON.parse(localStorage.getItem(LOG) || '[]') as { at: string; what: string }[]; l.unshift({ at: new Date().toISOString(), what }); localStorage.setItem(LOG, JSON.stringify(l.slice(0, 50))); } catch { /* ignore */ }
}
export function repairLog(): { at: string; what: string }[] { try { return JSON.parse(localStorage.getItem(LOG) || '[]'); } catch { return []; } }

/** After an update, an old page can ask for program files that no longer exist. Reload once to pick up the new ones. */
export function installChunkRecovery() {
  const fix = (msg: string) => {
    if (!/Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(msg)) return;
    try { if (sessionStorage.getItem(RELOADED)) return; sessionStorage.setItem(RELOADED, '1'); } catch { return; }
    logRepair('Reloaded to pick up updated program files'); location.reload();
  };
  window.addEventListener('error', (e) => fix(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => fix(String((e.reason as Error)?.message ?? e.reason)));
  setTimeout(() => { try { sessionStorage.removeItem(RELOADED); } catch { /* ignore */ } }, 30000);
}

type Props = { page: string; children: React.ReactNode; onRepair: () => string[]; onRestore: () => Promise<boolean>; onHome: () => void };
type State = { err: Error | null; tries: number; note: string };

class Boundary extends React.Component<Props, State> {
  state: State = { err: null, tries: 0, note: '' };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidUpdate(prev: Props) { if (prev.page !== this.props.page && this.state.err) this.setState({ err: null, tries: 0, note: '' }); }
  async componentDidCatch(err: Error) {
    logRepair(`Page "${this.props.page}" stopped: ${err.message}`);
    if (this.state.tries === 0) {
      // First try: repair the project data and show the page again.
      const fixes = this.props.onRepair(); logRepair(fixes.length ? `Repaired: ${fixes.join('; ')}` : 'Checked project data: nothing damaged');
      this.setState({ err: null, tries: 1, note: fixes.length ? `The app repaired your project data (${fixes.length} fix${fixes.length > 1 ? 'es' : ''}).` : '' });
    } else if (this.state.tries === 1) {
      // Second try: go back to the last saved version of the project (the current one is kept in history).
      const ok = await this.props.onRestore().catch(() => false);
      logRepair(ok ? 'Restored the last saved version' : 'No saved version to restore');
      if (ok) this.setState({ err: null, tries: 2, note: 'This page had a problem, so the app went back to your last saved version. Your newer work is kept in Projects → History.' });
      else this.setState({ tries: 2 });
    }
  }
  render() {
    if (this.state.err && this.state.tries >= 2) return (
      <div className="card"><h3>This page could not open</h3>
        <p>The app tried to repair it automatically. Your work is saved. Pick another page, or go back to the start.</p>
        <p className="small muted">{this.state.err.message}</p>
        <div className="row"><button className="primary" onClick={this.props.onHome}>Go to the first page</button><button onClick={() => location.reload()}>Restart the app</button></div></div>);
    if (this.state.err) return <div className="card">Repairing…</div>;
    return <>{this.state.note && <p className="note" role="status">🔧 {this.state.note}</p>}{this.props.children}</>;
  }
}

/** Wraps each page: if it crashes, the app repairs the data, then restores the last good version. */
export function SelfRepair({ page, children }: { page: string; children: React.ReactNode }) {
  const { project, replace, go, lib } = useStore();
  const onRepair = () => { const r = repairProject(structuredClone(project)); replace(r.project); return r.fixes; };
  const onRestore = async () => { const v = (await listVersions(lib.projectId)).sort((a, b) => b.at - a.at)[0]; if (!v?.vid) return false; await lib.restoreVersion(v.vid); return true; };
  return <Boundary page={page} onRepair={onRepair} onRestore={onRestore} onHome={() => go('company')}>{children}</Boundary>;
}
