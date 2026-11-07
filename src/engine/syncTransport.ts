import { androidBridge, blobToB64 } from '../store';
// Browser transports for sync: direct device-to-device WebRTC (QR / code handshake, no server),
// the system share sheet (Bluetooth, Nearby/Quick Share, email, cloud apps) and a synced cloud-drive folder.
import type { Project } from '../types';
import { packCode, unpackCode, toPackage } from './sync';

// ---------- Direct link (WebRTC data channel) ----------
export interface DirectLink { pc: RTCPeerConnection; code: string; accept?: (answerCode: string) => Promise<void>; channel: Promise<RTCDataChannel> }
const iceServers = (): RTCIceServer[] => (navigator.onLine ? [{ urls: 'stun:stun.l.google.com:19302' }] : []);
function gathered(pc: RTCPeerConnection, ms = 4000) {
  return new Promise<void>((res) => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
}
/** Device A: create an offer code to show as a QR code. */
export async function hostLink(): Promise<DirectLink> {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const dc = pc.createDataChannel('radioplan-sync', { ordered: true });
  const channel = new Promise<RTCDataChannel>((res) => { dc.onopen = () => res(dc); });
  await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
  const code = await packCode({ k: 'o', s: pc.localDescription!.sdp });
  return { pc, code, channel, accept: async (answer) => { const a = await unpackCode<{ k: string; s: string }>(answer); if (a.k !== 'a') throw new Error('That is not a reply code. Scan the code shown on the other device after it scanned yours.'); await pc.setRemoteDescription({ type: 'answer', sdp: a.s }); } };
}
/** Device B: answer an offer code; show the returned code back to device A. */
export async function joinLink(offerCode: string): Promise<DirectLink> {
  const o = await unpackCode<{ k: string; s: string }>(offerCode); if (o.k !== 'o') throw new Error('That is not a start code.');
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const channel = new Promise<RTCDataChannel>((res) => { pc.ondatachannel = (e) => { const dc = e.channel; if (dc.readyState === 'open') res(dc); else dc.onopen = () => res(dc); }; });
  await pc.setRemoteDescription({ type: 'offer', sdp: o.s });
  await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
  return { pc, code: await packCode({ k: 'a', s: pc.localDescription!.sdp }), channel };
}
const CHUNK = 60000;
/** Exchange projects over an open channel; resolves with the other side's project. */
export function exchange(dc: RTCDataChannel, mine: Project, onProgress?: (msg: string) => void): Promise<Project> {
  return new Promise((resolve, reject) => {
    let buf = '', expected = -1;
    dc.onmessage = (e) => {
      const m = String(e.data);
      if (m.startsWith('B:')) { expected = Number(m.slice(2)); buf = ''; return; }
      if (m === 'E') { try { resolve(JSON.parse(buf).project as Project); } catch (err) { reject(err); } return; }
      buf += m; if (expected > 0) onProgress?.(`Receiving ${Math.round((buf.length / expected) * 100)} %`);
    };
    dc.onerror = () => reject(new Error('Connection error'));
    const text = JSON.stringify(toPackage(mine));
    dc.send(`B:${text.length}`);
    for (let i = 0; i < text.length; i += CHUNK) dc.send(text.slice(i, i + CHUNK));
    dc.send('E');
  });
}

// ---------- Share sheet ----------
export function canShareFiles(): boolean {
  if (androidBridge()?.shareFile) return true;
  try { const f = new File(['x'], 'x.json', { type: 'application/json' }); return !!navigator.canShare && navigator.canShare({ files: [f] }); } catch { return false; }
}
export async function shareProject(p: Project, fileName: string) {
  const file = new File([JSON.stringify(toPackage(p))], fileName, { type: 'application/json' });
  const a = androidBridge(); if (a?.shareFile) { a.shareFile(fileName, 'application/json', await blobToB64(file), `RadioPlan sync file: ${p.meta.name}`); return; }
  await navigator.share({ files: [file], title: 'RadioPlan project', text: `RadioPlan sync file: ${p.meta.name}` });
}

// ---------- Cloud-drive folder (File System Access API: Chrome / Edge desktop) ----------
type DirHandle = FileSystemDirectoryHandle & { requestPermission?: (o: { mode: string }) => Promise<string>; queryPermission?: (o: { mode: string }) => Promise<string>; values?: () => AsyncIterable<FileSystemHandle> };
export const folderSyncSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;
const DB = 'radioplan-sync', STORE = 'kv';
function idb<T>(fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((res, rej) => { const o = indexedDB.open(DB, 1); o.onupgradeneeded = () => o.result.createObjectStore(STORE); o.onerror = () => rej(o.error);
    o.onsuccess = () => { const tx = o.result.transaction(STORE, 'readwrite'); const r = fn(tx.objectStore(STORE)); r.onsuccess = () => res(r.result as T); r.onerror = () => rej(r.error); }; });
}
export async function pickSyncFolder(): Promise<DirHandle> {
  const h = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ id: 'radioplan-sync', mode: 'readwrite' });
  await idb((s) => s.put(h, 'folder')); return h;
}
export async function savedSyncFolder(): Promise<DirHandle | null> { try { return (await idb<DirHandle | undefined>((s) => s.get('folder'))) ?? null; } catch { return null; } }
export async function forgetSyncFolder() { try { await idb((s) => s.delete('folder')); } catch { /* ignore */ } }
export async function folderPermission(h: DirHandle, ask: boolean): Promise<boolean> {
  if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
  return ask ? (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted' : false;
}
/** Write this device's copy and read every other device's copy of the same project from the folder. */
export async function folderRound(h: DirHandle, p: Project, slug: string): Promise<{ others: { name: string; project: Project; modified: number }[]; wrote: string }> {
  const mine = `${slug}.${p.sync!.deviceId}.rpsync.json`;
  const fh = await h.getFileHandle(mine, { create: true }); const w = await fh.createWritable(); await w.write(JSON.stringify(toPackage(p))); await w.close();
  const others: { name: string; project: Project; modified: number }[] = [];
  for await (const e of (h.values?.() ?? [])) {
    if (e.kind !== 'file' || e.name === mine || !e.name.endsWith('.rpsync.json')) continue;
    try { const f = await (e as FileSystemFileHandle).getFile(); const j = JSON.parse(await f.text()); if (j?.project?.sync?.projectId === p.sync!.projectId) others.push({ name: e.name, project: j.project, modified: f.lastModified }); } catch { /* skip unreadable / partial files */ }
  }
  return { others, wrote: mine };
}
