import React, { useState } from 'react';
import { useStore, downloadText, safeName } from '../store';
import { Card, Check } from './ui';
import { importSitesCsv, exportSitesCsv, SITE_COLUMNS, SiteImport } from '../engine/siteimport';
import { defaultSiteTx } from '../engine/network';
import { usgsPointElevation } from '../engine/autoterrain';

/** Import / export a multi-site database (CSV) so many sites need not be typed by hand. */
export function SiteDatabase() {
  const { project: p, update, go } = useStore();
  const [res, setRes] = useState<SiteImport | null>(null);
  const [replace, setReplace] = useState(false);
  const [feet, setFeet] = useState(false);
  const [msg, setMsg] = useState('');
  const read = async (f?: File) => { if (!f) return; try { const r = importSitesCsv(await f.text(), { tx: defaultSiteTx(p), feetUnits: feet }); setRes(r); setMsg(''); } catch (e) { setMsg((e as Error).message); } };
  const apply = async () => {
    if (!res) return;
    update((d) => { d.sites = replace ? res.sites : [...d.sites, ...res.sites]; if (replace) { d.radio.txSiteId = res.sites[0].id; d.radio.rxSiteId = (res.sites[1] ?? res.sites[0]).id; } });
    const missing = res.sites.filter((s) => s.groundElevM == null);
    setMsg(`Added ${res.sites.length} sites.${missing.length ? ` Looking up ground elevation for ${missing.length}…` : ''}`); setRes(null);
    let ok = 0;
    for (const s of missing.slice(0, 200)) {
      try { const z = await usgsPointElevation(s); if (z != null) { ok++; update((d) => { const t = d.sites.find((x) => x.id === s.id); if (t) t.groundElevM = Math.round(z * 10) / 10; }); } } catch { /* offline */ }
    }
    if (missing.length) setMsg(`Added ${res.sites.length} sites. Ground elevation found for ${ok} of ${missing.length} (USGS 3DEP); the rest can be filled when online or from loaded terrain.`);
  };
  const template = () => downloadText('site_database_template.csv', SITE_COLUMNS.join(',') + '\r\nTower 1,35.2271,-80.8431,,45,47,monopole,,460.0125,47,sinclair-sc229,0,0,3.2,CH1,yes\r\n', 'text/csv');
  return (
    <Card title="Site database (CSV import / export)" tour="site-import" tip="Load many sites at once from a spreadsheet. Columns are matched by name: name, latitude, longitude (decimal or DMS), ground elevation, antenna height (AGL / rad center), structure height, frequency, power, antenna, azimuth, tilt, line loss, channel, transmit.">
      <div className="row wrap">
        <label className="btn primary">📂 Import sites CSV<input hidden type="file" accept=".csv,.txt,.tsv" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <button onClick={() => downloadText(`${safeName(p.meta.name)}_sites.csv`, exportSitesCsv(p.sites), 'text/csv')}>⬇ Export sites CSV</button>
        <button onClick={template}>⬇ Blank template</button>
        <Check value={feet} onChange={setFeet} label="Heights in feet" />
      </div>
      {res && <div className="note">
        <p><b>{res.sites.length} sites ready</b>{res.skipped.length ? `, ${res.skipped.length} rows skipped (${res.skipped.slice(0, 5).map((s) => `row ${s.row}: ${s.reason}`).join('; ')})` : ''}.</p>
        <p className="small">Columns matched: {Object.entries(res.columns).map(([k, v]) => `${k} ← "${v}"`).join(', ')}</p>
        <p className="small">{res.sites.filter((s) => s.tx).length} sites carry transmitter settings and will appear on the Network & Interference page.</p>
        <div className="row"><Check value={replace} onChange={setReplace} label="Replace existing sites" /><button className="primary" onClick={apply}>Add {res.sites.length} sites</button><button onClick={() => setRes(null)}>Cancel</button></div>
      </div>}
      {msg && <p className="note">{msg} {p.sites.some((s) => s.tx?.enabled) && <button className="small" onClick={() => go('network')}>Network analysis →</button>}</p>}
    </Card>
  );
}
