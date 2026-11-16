import React from 'react';
import { useStore } from '../store';
import { repairProject } from '../engine/repair';
import { listVersions } from '../engine/projectdb';
import { logRepair } from '../engine/carelog';
import { isChunkError, reloadForUpdate } from '../engine/chunkload';

export { logRepair, repairLog } from '../engine/carelog';

/** After an update, an old page can ask for program files that no longer exist. Reload once to pick up the new ones. */
export function installChunkRecovery() {
  const fix = (e: unknown) => { if (isChunkError(e)) reloadForUpdate(); };
  window.addEventListener('error', (e) => fix(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => fix(e.reason));
}

type Props = { page: string; children: React.ReactNode; onRepair: () => string[]; onRestore: () => Promise<boolean>; onHome: () => void };
type State = { err: Error | null; tries: number; note: string };

class Boundary extends React.Component<Props, State> {
  state: State = { err: null, tries: 0, note: '' };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidUpdate(prev: Props) { if (prev.page !== this.props.page && this.state.err) this.setState({ err: null, tries: 0, note: '' }); }
  async componentDidCatch(err: Error) {
    logRepair(`Page "${this.props.page}" stopped: ${err.message}`);
    if (isChunkError(err)) {
      // The page's program file did not load: nothing is wrong with the project, so never touch the data.
      if (!reloadForUpdate()) this.setState({ tries: 2 });
      return;
    }
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
    if (this.state.err && this.state.tries >= 2 && isChunkError(this.state.err)) return (
      <div className="card"><h3>This page could not load</h3>
        <p>{navigator.onLine === false
          ? 'This page has not been saved on this device yet, and there is no internet right now. Connect once and open it again; after that it works offline.'
          : 'The app could not download this page. Your work is saved. Press Try again.'}</p>
        <p className="small muted">{this.state.err.message}</p>
        <div className="row"><button className="primary" onClick={() => location.reload()}>Try again</button><button onClick={this.props.onHome}>Go to the first page</button></div></div>);
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
