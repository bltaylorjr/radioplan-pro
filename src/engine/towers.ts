// Existing towers, masts, antennas and other communications sites from OpenStreetMap (Overpass API),
// kept per 0.25° cell in the app's storage so the layer still works offline once an area was viewed.
import { kvGet, kvSet } from './projectdb';

export interface CommSite {
  id: string; lat: number; lon: number;
  kind: string; name: string; operator?: string; heightFt?: number; asr?: string; services: string[];
}

const CELL = 0.25;
export const OVERPASS = 'https://overpass-api.de/api/interpreter';
const cellKey = (la: number, lo: number) => `towers:${la.toFixed(2)},${lo.toFixed(2)}`;

/** Cells (south-west corners) covering a bounding box. */
export function cellsFor(s: number, w: number, n: number, e: number): [number, number][] {
  const out: [number, number][] = [];
  for (let la = Math.floor(s / CELL) * CELL; la < n; la += CELL)
    for (let lo = Math.floor(w / CELL) * CELL; lo < e; lo += CELL) out.push([+la.toFixed(2), +lo.toFixed(2)]);
  return out;
}

export function overpassQuery(s: number, w: number, n: number, e: number): string {
  const bb = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:30];(` +
    `nwr["man_made"~"^(mast|tower|communications_tower|antenna|telecommunication|monitoring_station)$"]["tower:type"!~"^(cooling|lighting|observation|bell_tower|watchtower|minaret|defensive|clock)$"]${bb};` +
    `nwr["tower:type"~"communication|radar|transmission"]${bb};` +
    `nwr["communication:mobile_phone"]${bb};nwr["communication:radio"]${bb};nwr["communication:television"]${bb};` +
    `nwr["telecom"~"exchange|service_device|data_center"]${bb};` +
    `);out center tags 1500;`;
}

const SERVICES: [string, string][] = [['communication:mobile_phone', 'Cellular'], ['communication:radio', 'Radio'], ['communication:television', 'TV'], ['communication:microwave', 'Microwave'],
  ['communication:amateur_radio', 'Amateur'], ['communication:gsm-r', 'Rail radio'], ['communication:two_way_radio', 'Two-way radio'], ['communication:transponder', 'Transponder']];

const num = (v?: string) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : undefined; };

/** Turn an Overpass JSON reply into labelled sites. */
export function parseOverpass(j: { elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] }): CommSite[] {
  const out: CommSite[] = [];
  for (const el of j.elements ?? []) {
    const t = el.tags ?? {}; const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const mm = t.man_made ?? '', tt = t['tower:type'] ?? '';
    const kind = tt === 'radar' ? 'Radar' : t.telecom ? 'Telecom site' : mm === 'mast' ? 'Mast' : mm === 'antenna' ? 'Antenna' : mm === 'monitoring_station' ? 'Monitoring station' : mm === 'communications_tower' || tt === 'communication' ? 'Communications tower' : mm === 'tower' ? 'Tower' : 'Comm site';
    const services = SERVICES.filter(([k]) => t[k] && t[k] !== 'no').map(([, l]) => l);
    const h = num(t.height); const asrKey = Object.keys(t).find((k) => /asr/i.test(k));
    out.push({
      id: `${el.type}/${el.id}`, lat, lon, kind, services,
      name: t.name ?? t['name:en'] ?? t.ref ?? '', operator: t.operator ?? t['communication:operator'] ?? t.owner,
      heightFt: h != null ? Math.round(h * 3.28084) : undefined, asr: asrKey ? t[asrKey] : undefined,
    });
  }
  return out;
}

/** The label shown next to a site on the map. */
export function siteLabel(c: CommSite): string {
  const head = c.name || c.operator || c.kind;
  return `${head}${c.heightFt ? ` · ${c.heightFt} ft` : ''}`;
}

/** Sites in a box: cached cells are used as they are; missing cells are fetched when online. */
export async function loadCommSites(s: number, w: number, n: number, e: number, opts: { online: boolean; signal?: AbortSignal } = { online: true }): Promise<{ sites: CommSite[]; missing: number; failed: number }> {
  const cells = cellsFor(s, w, n, e).slice(0, 16);
  const all = new Map<string, CommSite>(); let missing = 0, failed = 0;
  for (const [la, lo] of cells) {
    let got = await kvGet<CommSite[]>(cellKey(la, lo)).catch(() => undefined);
    if (!got && opts.online) {
      try {
        const r = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: overpassQuery(la, lo, la + CELL, lo + CELL) }), signal: opts.signal });
        if (!r.ok) throw new Error(String(r.status));
        got = parseOverpass(await r.json()); await kvSet(cellKey(la, lo), got).catch(() => undefined);
      } catch (err) { if ((err as Error).name === 'AbortError') throw err; failed++; }
    }
    if (!got) { missing++; continue; }
    for (const c of got) all.set(c.id, c);
  }
  return { sites: [...all.values()], missing, failed };
}
