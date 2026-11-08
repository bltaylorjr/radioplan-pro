import React, { useState } from 'react';
import { useStore, downloadBytes } from '../store';
import { Card } from './ui';
import { kindOf, tablesFromFile, pointsFromFile, tableKind, extOf } from '../engine/fileformats';
import { importSitesCsv } from '../engine/siteimport';
import { toCsv, findCol, num } from '../engine/csv';
import { defaultSiteTx } from '../engine/network';
import { readBackup, kvGet, kvSet, fmtBytes } from '../engine/projectdb';
import { shrinkPhoto } from '../pages/FieldNotes';
import { uid } from '../defaults';
import type { BomExtra, ProjectDoc } from '../types';
import type { Contact } from '../data/contacts';

const MAX = 15 * 1048576;
const readDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

/** Import any file: projects, spreadsheets (sites, materials, contacts), map points, photos, and documents to keep with the project. */
export function ImportFiles({ compact }: { compact?: boolean }) {
  const { project: p, update, lib } = useStore();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const say = (s: string) => setLog((l) => [s, ...l].slice(0, 12));

  const attach = async (f: File, note = '') => {
    if (f.size > MAX) { say(`✗ ${f.name}: too large to keep in the project (${fmtBytes(f.size)}; limit ${fmtBytes(MAX)}). Keep it in a folder instead.`); return; }
    const doc: ProjectDoc = { id: uid(), name: f.name, type: f.type || 'application/octet-stream', size: f.size, dataUrl: await readDataUrl(f), addedAt: new Date().toISOString(), note };
    update((d) => { d.documents = [...(d.documents ?? []), doc]; }); say(`✓ ${f.name}: kept with the project (Documents)`);
  };
  const one = async (f: File) => {
    const kind = kindOf(f.name, f.type), buf = new Uint8Array(await f.arrayBuffer());
    if (kind === 'project' || (extOf(f.name) === 'json' && /"meta"\s*:|radioplan-backup/.test(new TextDecoder().decode(buf.subarray(0, 4000))))) {
      const ids = await lib.importProjects(readBackup(new TextDecoder().decode(buf))); say(`✓ ${f.name}: ${ids.length} project(s) added to Projects`); return;
    }
    if (kind === 'table') {
      for (const t of await tablesFromFile(f.name, buf)) {
        const [head, ...rows] = t.rows; if (!head || !rows.length) continue; const k = tableKind(head), label = t.name !== f.name ? `${f.name} / ${t.name}` : f.name;
        if (k === 'sites') { const r = importSitesCsv(toCsv(t.rows), { tx: defaultSiteTx(p) }); update((d) => { d.sites = [...d.sites, ...r.sites]; }); say(`✓ ${label}: ${r.sites.length} sites added${r.skipped.length ? `, ${r.skipped.length} rows skipped` : ''}`); }
        else if (k === 'materials') {
          const c = (a: string[]) => findCol(head, a), iItem = c(['item', 'description', 'material', 'part']), iQty = c(['qty', 'quantity']), iUnit = c(['unit', 'uom']), iCat = c(['category', 'system', 'type']), iBrand = c(['brand', 'manufacturer', 'model', 'part number', 'part #']);
          const add: BomExtra[] = rows.filter((r) => r[iItem]?.trim()).map((r) => ({ id: uid(), category: (iCat >= 0 && r[iCat]) || 'Imported', item: r[iItem].trim(), brandModel: iBrand >= 0 ? r[iBrand] ?? '' : '', qty: num(r[iQty]) ?? 1, unit: (iUnit >= 0 && r[iUnit]) || 'ea', notes: `From ${f.name}` }));
          update((d) => { d.bomExtra = [...(d.bomExtra ?? []), ...add]; }); say(`✓ ${label}: ${add.length} items added to the Materials list`);
        } else if (k === 'contacts') {
          const c = (a: string[]) => findCol(head, a), iN = c(['office', 'company', 'name', 'contact']), iP = c(['phone', 'tel']), iE = c(['email', 'e-mail']), iA = c(['address']), iU = c(['web', 'url', 'site']);
          const add: Contact[] = rows.filter((r) => r[iN]?.trim()).map((r) => ({ id: uid(), level: 'state', state: p.meta.state, office: r[iN].trim(), kind: 'Other', phone: iP >= 0 ? r[iP] : '', email: iE >= 0 ? r[iE] : '', address: iA >= 0 ? r[iA] : '', url: iU >= 0 ? r[iU] : '', mine: true }));
          const cur = (await kvGet<{ mine: Contact[]; hidden: string[] }>('contacts.v1')) ?? { mine: [], hidden: [] };
          await kvSet('contacts.v1', { ...cur, mine: [...cur.mine, ...add] }); say(`✓ ${label}: ${add.length} contacts added (Contacts → My contacts)`);
        } else say(`• ${label}: columns not recognised (need latitude/longitude, item/qty, or name/phone). File kept in Documents.`);
        if (k === 'unknown') await attach(f, 'Imported spreadsheet');
      }
      return;
    }
    if (kind === 'points') {
      const pts = await pointsFromFile(f.name, buf); if (!pts.length) { say(`• ${f.name}: no points found`); return; }
      const r = importSitesCsv(toCsv([['name', 'latitude', 'longitude', 'ground_m'], ...pts.map((x) => [x.name, x.lat, x.lon, x.elevM ?? ''])]), { tx: defaultSiteTx(p) });
      update((d) => { d.sites = [...d.sites, ...r.sites]; }); say(`✓ ${f.name}: ${r.sites.length} points added as sites`); return;
    }
    if (kind === 'image' && !/svg|heic/i.test(extOf(f.name))) {
      const url = await shrinkPhoto(f);
      update((d) => { d.fieldNotes = [{ id: uid(), at: new Date().toISOString(), title: f.name, text: '', category: 'Photo', photos: [{ id: uid(), dataUrl: url, caption: f.name }], tags: ['imported'], author: '', followUp: false, done: false }, ...(d.fieldNotes ?? [])]; });
      say(`✓ ${f.name}: added to Field Notes & Photos`); return;
    }
    await attach(f);
  };
  const pick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true;
    i.onchange = async () => { setBusy(true); for (const f of Array.from(i.files ?? [])) { try { await one(f); } catch (e) { say(`✗ ${f.name}: ${(e as Error).message}`); } } setBusy(false); };
    i.click();
  };
  const docs = p.documents ?? [];
  return (
    <Card title="Import files" tip="Pick one or more files of any type. Spreadsheets become sites, materials or contacts; map files become sites; photos go to Field Notes; project files open in Projects; anything else is kept with the project under Documents.">
      <div className="row wrap"><button className="primary" disabled={busy} onClick={pick}>{busy ? 'Importing…' : '📂 Import files'}</button>
        <span className="small muted">Excel (.xlsx), CSV, KML/KMZ, GPX, GeoJSON, photos, PDF, Word, CAD (DWG/DXF), project files and more.</span></div>
      {log.length > 0 && <ul className="small">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {!compact && <>
        <h4>Documents kept with this project ({docs.length})</h4>
        {!docs.length ? <p className="small muted">None yet. Drawings, PDFs, data sheets and permits you import are kept here, sync with the project and go in the closeout package.</p> :
          <table className="tbl"><thead><tr><th>File</th><th>Size</th><th>Added</th><th>Note</th><th></th></tr></thead><tbody>{docs.map((d) => <tr key={d.id}>
            <td><a href={d.dataUrl} target="_blank" rel="noreferrer" download={d.name}>{d.name}</a></td><td className="nowrap">{fmtBytes(d.size)}</td><td className="nowrap small">{d.addedAt.slice(0, 10)}</td>
            <td><input value={d.note} placeholder="Note" aria-label={`Note for ${d.name}`} onChange={(e) => update((x) => { const t = x.documents?.find((y) => y.id === d.id); if (t) t.note = e.target.value; })} /></td>
            <td className="nowrap"><button className="ghost" onClick={async () => downloadBytes(d.name, await (await fetch(d.dataUrl)).blob())}>⬇</button><button className="ghost" onClick={() => confirm(`Remove ${d.name} from the project?`) && update((x) => { x.documents = (x.documents ?? []).filter((y) => y.id !== d.id); })}>Remove</button></td></tr>)}</tbody></table>}
      </>}
    </Card>
  );
}
