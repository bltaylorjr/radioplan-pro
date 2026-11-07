import React, { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';
import { useStore, deviceInfo, setDeviceName, downloadText, safeName } from '../store';
import { Card, Stat } from '../components/ui';
import { mergeProjects, fromPackage, stampSync, toPackage, MergeReport } from '../engine/sync';
import { hostLink, joinLink, exchange, DirectLink, canShareFiles, shareProject, folderSyncSupported, pickSyncFolder, savedSyncFolder, forgetSyncFolder, folderPermission, folderRound } from '../engine/syncTransport';
import type { Project } from '../types';

function QR({ text }: { text: string }) {
  const q = qrcode(0, 'L'); q.addData(text); q.make();
  return <div className="qr" dangerouslySetInnerHTML={{ __html: q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }} aria-label="QR code" role="img" />;
}

/** Camera QR scanner: BarcodeDetector where available, otherwise jsQR. */
function Scanner({ onCode, onClose }: { onCode: (s: string) => void; onClose: () => void }) {
  const v = useRef<HTMLVideoElement>(null); const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, stop = false;
    const BD = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    const det = BD ? new BD({ formats: ['qr_code'] }) : null;
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true })!;
    (async () => {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); v.current!.srcObject = stream; await v.current!.play(); }
      catch (e) { setErr(`Camera not available (${(e as Error).message}). Paste the code instead.`); return; }
      const tick = async () => {
        if (stop || !v.current) return;
        const vw = v.current.videoWidth, vh = v.current.videoHeight;
        if (vw) {
          try {
            if (det) { const r = await det.detect(v.current); if (r[0]?.rawValue) { onCode(r[0].rawValue); return; } }
            else { cv.width = vw; cv.height = vh; ctx.drawImage(v.current, 0, 0); const d = ctx.getImageData(0, 0, vw, vh); const r = jsQR(d.data, vw, vh); if (r?.data) { onCode(r.data); return; } }
          } catch { /* keep scanning */ }
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="scanner">{err ? <p className="bad-text">{err}</p> : <video ref={v} playsInline muted />}<button onClick={onClose}>Close camera</button></div>;
}

type Phase = 'idle' | 'host-wait' | 'join-show' | 'connected' | 'done';

export function SyncPage() {
  const { project: p, replace } = useStore();
  const dev = deviceInfo();
  const [name, setName] = useState(dev.name);
  const [msg, setMsg] = useState('');
  const [report, setReport] = useState<MergeReport | null>(null);
  // direct link
  const [phase, setPhase] = useState<Phase>('idle');
  const [link, setLink] = useState<DirectLink | null>(null);
  const [codeIn, setCodeIn] = useState('');
  const [scan, setScan] = useState(false);
  // folder
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderOk, setFolderOk] = useState(false);
  const [lastRound, setLastRound] = useState('');
  const latest = useRef(p); latest.current = p;

  const stamped = (x: Project): Project => { const s = stampSync(x, deviceInfo()); return s ? { ...x, sync: s } : x; };
  const applyRemote = (remote: Project, how: string) => {
    const local = stamped(latest.current);
    if (remote.sync && local.sync && remote.sync.projectId !== local.sync.projectId && !confirm(`The other copy is a different project ("${remote.meta.name}"). Merge it into "${local.meta.name}" anyway?\n\nCancel = keep this project unchanged.`)) { setMsg('Not merged: different project.'); return; }
    const { project: merged, report: r } = mergeProjects(local, stamped(remote));
    replace(merged); setReport(r); setMsg(`Synced with ${r.remoteDevice} via ${how}.`);
  };

  // ----- direct Wi-Fi link -----
  const reset = () => { link?.pc.close(); setLink(null); setPhase('idle'); setCodeIn(''); setScan(false); };
  const runExchange = async (l: DirectLink) => {
    const dc = await l.channel; setPhase('connected'); setMsg('Connected. Exchanging projects…');
    try { const remote = await exchange(dc, stamped(latest.current), (m) => setMsg(m)); applyRemote(remote, 'direct Wi-Fi link'); setPhase('done'); }
    catch (e) { setMsg(`Transfer failed: ${(e as Error).message}`); }
    setTimeout(() => l.pc.close(), 3000);
  };
  const host = async () => { reset(); setMsg('Preparing…'); try { const l = await hostLink(); setLink(l); setPhase('host-wait'); setMsg(''); runExchange(l); } catch (e) { setMsg(`Could not start: ${(e as Error).message}`); } };
  const submitCode = async (code: string) => {
    setScan(false); setCodeIn(code);
    try {
      if (phase === 'host-wait' && link?.accept) { await link.accept(code); setMsg('Reply accepted. Connecting…'); return; }
      reset(); const l = await joinLink(code); setLink(l); setPhase('join-show'); setMsg('Show this reply code to the first device.'); runExchange(l);
    } catch (e) { setMsg(`That code didn't work: ${(e as Error).message}`); }
  };
  useEffect(() => () => link?.pc.close(), [link]);

  // ----- cloud-drive folder -----
  useEffect(() => { (async () => { const h = await savedSyncFolder(); if (h) { setFolder(h); setFolderOk(await folderPermission(h, false)); } })(); }, []);
  const round = async () => {
    if (!folder) return;
    try {
      const { others, wrote } = await folderRound(folder as never, stamped(latest.current), safeName(latest.current.meta.name));
      let cur = stamped(latest.current); let r: MergeReport | null = null;
      for (const o of others) { const m = mergeProjects(cur, o.project); cur = m.project; r = m.report; }
      if (others.length) { replace(cur); setReport(r); await folderRound(folder as never, cur, safeName(cur.meta.name)); }
      setLastRound(`${new Date().toLocaleTimeString()}: wrote ${wrote}${others.length ? `, merged ${others.length} other device file${others.length > 1 ? 's' : ''}` : ', no other devices yet'}`);
    } catch (e) { setLastRound(`Folder sync failed: ${(e as Error).message}`); }
  };
  useEffect(() => { if (!folder || !folderOk) return; round(); const iv = setInterval(round, 60000); return () => clearInterval(iv); }, [folder, folderOk]); // eslint-disable-line react-hooks/exhaustive-deps

  const importFile = async (f?: File) => { if (!f) return; try { applyRemote(fromPackage(await f.text()), `file ${f.name}`); } catch (e) { setMsg(`Could not read ${f.name}: ${(e as Error).message}`); } };
  const fileName = `${safeName(p.meta.name)}.${dev.id}.rpsync.json`;
  const peers = Object.entries(p.sync?.peers ?? {});

  return (
    <div className="stack">
      <div className="grid2">
        <Card title="This device" tour="sync-device" tip="Every device keeps a full copy and works offline. Syncing merges the copies: the most recent change to each part wins, and sites, scenarios, survey points and Wi-Fi readings from both devices are combined.">
          <div className="form"><label className="field"><span className="field-label">Device name</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setDeviceName(name)} /></label></div>
          <div className="stats"><Stat label="Project" value={p.meta.name} /><Stat label="Devices synced with" value={peers.length} /></div>
          {peers.length > 0 && <ul className="small">{peers.map(([id, x]) => <li key={id}>{x.name}: last sync {new Date(x.at).toLocaleString()}</li>)}</ul>}
          {msg && <p className="note" aria-live="polite">{msg}</p>}
          {report && <p className="small">Took from {report.remoteDevice}: {report.fromRemote.length ? report.fromRemote.join(', ') : 'nothing newer'}. Items added {report.added}, removed {report.removed}.</p>}
        </Card>
        <Card title="Direct sync over Wi-Fi (no internet needed)" tour="sync-direct" tip="Both devices on the same Wi-Fi network (or one device's hotspot). When online, it can also connect over cellular through NAT discovery, but some carrier networks block direct links; use the cloud folder or share option then.">
          {phase === 'idle' || phase === 'done' ? <>
            <p className="small">On the first device press <b>Start</b>. On the other device, scan its code (or paste it), then scan the reply back on the first device.</p>
            <div className="row wrap"><button className="primary" onClick={host}>📶 Start (show code)</button><button onClick={() => setScan(true)}>📷 Scan a code</button></div>
          </> : null}
          {(phase === 'host-wait' || phase === 'join-show') && link && <>
            <p className="small"><b>{phase === 'host-wait' ? 'Step 1: scan this on the other device.' : 'Step 2: scan this reply on the first device.'}</b></p>
            <QR text={link.code} />
            <details><summary className="small">Copy as text instead</summary><textarea readOnly rows={3} value={link.code} onFocus={(e) => e.target.select()} style={{ width: '100%' }} /></details>
            {phase === 'host-wait' && <div className="row wrap"><button className="primary" onClick={() => setScan(true)}>📷 Scan the reply</button><button onClick={reset}>Cancel</button></div>}
            {phase === 'join-show' && <button onClick={reset}>Cancel</button>}
          </>}
          {phase === 'connected' && <p>Connected… <button onClick={reset}>Cancel</button></p>}
          {scan && <Scanner onCode={submitCode} onClose={() => setScan(false)} />}
          {(phase === 'idle' || phase === 'host-wait' || phase === 'done') && <div className="row"><input type="text" value={codeIn} onChange={(e) => setCodeIn(e.target.value)} placeholder="…or paste a code" aria-label="Paste sync code" /><button disabled={!codeIn.trim()} onClick={() => submitCode(codeIn)}>Use code</button></div>}
        </Card>
      </div>
      <div className="grid2">
        <Card title="Share by Bluetooth, Nearby Share or email" tour="sync-share" tip="Sends a sync file through the device's share sheet. On Android that includes Bluetooth and Quick Share; on Windows, Nearby sharing. Open the file on the other device with Merge a sync file.">
          <div className="row wrap">
            {canShareFiles() ? <button className="primary" onClick={async () => { try { await shareProject(stamped(p), fileName); setMsg('Shared. On the other device, use "Merge a sync file".'); } catch (e) { if ((e as Error).name !== 'AbortError') setMsg(`Share failed: ${(e as Error).message}`); } }}>📤 Share sync file</button>
              : <span className="small muted">This browser can't open the share sheet; save the file instead.</span>}
            <button onClick={() => downloadText(fileName, JSON.stringify(toPackage(stamped(p))), 'application/json')}>⬇ Save sync file</button>
            <label className="btn">📥 Merge a sync file<input hidden type="file" accept=".json,application/json" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          </div>
          <p className="small muted">Merging never throws away newer work: each part keeps whichever device changed it last. A plain project file (.radioplan.json) can also be merged.</p>
        </Card>
        <Card title="Automatic sync through a cloud-drive folder (works over cellular)" tour="sync-folder" tip="Pick a folder that OneDrive, Google Drive or Dropbox keeps in sync. Each device writes its own file there every minute and merges the others' files, so changes travel over any connection the cloud app uses.">
          {folderSyncSupported() ? <>
            {folder ? <p className="small">Folder: <b>{folder.name}</b> {folderOk ? '✓ syncing every minute' : '(permission needed after restart)'}</p> : <p className="small">No folder chosen.</p>}
            <div className="row wrap">
              <button className="primary" onClick={async () => { try { const h = await pickSyncFolder(); setFolder(h); setFolderOk(true); } catch (e) { if ((e as Error).name !== 'AbortError') setMsg((e as Error).message); } }}>{folder ? 'Change folder' : '📁 Choose sync folder'}</button>
              {folder && !folderOk && <button onClick={async () => setFolderOk(await folderPermission(folder as never, true))}>Reconnect folder</button>}
              {folder && folderOk && <button onClick={round}>Sync now</button>}
              {folder && <button onClick={async () => { await forgetSyncFolder(); setFolder(null); setFolderOk(false); }}>Stop</button>}
            </div>
            {lastRound && <p className="small muted">{lastRound}</p>}
          </> : <p className="small">This browser can't watch a folder (Chrome and Edge on Windows and Mac can). On Android, save or share the sync file into your Drive/OneDrive app, and use <b>Merge a sync file</b> to pull in the other device's copy.</p>}
        </Card>
      </div>
    </div>
  );
}
