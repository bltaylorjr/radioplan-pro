import React from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';
import { StoreProvider } from './store';
import { SignInGate } from './components/SignIn';
import { installChunkRecovery } from './components/SelfRepair';
import { bootStart, platform, rollBackTo } from './engine/update';
import { logRepair, notify } from './engine/carelog';
import { applyStoredPacks } from './engine/contentupdate';
import { installOfflineWeb } from './engine/offlineweb';

// Update safety: if a newly installed version keeps failing to start, put the last good one back (Windows app).
const boot = bootStart();
if (boot.justUpdated) logRepair(`Updated from ${boot.justUpdated.from} to ${boot.justUpdated.to}`);
if (boot.rollbackTo && platform() === 'windows' && navigator.onLine) {
  logRepair(`This version kept failing to start, so the app is going back to ${boot.rollbackTo}`);
  rollBackTo(boot.rollbackTo).catch(() => undefined);
  setTimeout(() => notify(`🔧 This version of LvPlan Pro was not starting properly, so it is going back to version ${boot.rollbackTo}. Your projects are safe.`), 1500);
}

/** Last line of defence: a plain message instead of a blank window. Restarting counts toward going back a version. */
class RootBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { logRepair(`The app stopped: ${err.message}`); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div style={{ padding: 32, fontFamily: 'system-ui', maxWidth: 560 }}><h2>LvPlan Pro needs to restart</h2>
      <p>Something went wrong. Your projects are saved. Press the button and the app will check and repair itself.</p>
      <button style={{ fontSize: 18, padding: '10px 20px' }} onClick={() => location.reload()}>Restart LvPlan Pro</button></div>;
  }
}

installChunkRecovery();
installOfflineWeb();
import('./components/chooseOne').then((m) => m.installChooseOne());

const render = () => createRoot(document.getElementById('root')!).render(<React.StrictMode><RootBoundary><SignInGate><StoreProvider><App /></StoreProvider></SignInGate></RootBoundary></React.StrictMode>);
// Newer codes, contacts, catalog, help and magnetic model downloaded from the website go in before any page opens.
// After a start that went wrong, start once with only the built-in data (safe mode).
if (boot.fails >= 2) { logRepair('Started with the built-in data only, after a start that did not finish'); render(); }
else Promise.race([applyStoredPacks().catch(() => []), new Promise((r) => setTimeout(r, 1500))]).finally(render);
