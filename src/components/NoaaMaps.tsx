// NOAA map pictures with tabs, a Southeast / whole US choice, the time each was downloaded, and offline copies.
// Used by the Weather & Radar page (satellite, lightning, storms, forecast maps) and the Magnetic page (space maps).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NOAA_MAPS, downloadMap, savedMap, stale, type MapRegion, type NoaaMap, type SavedMap } from '../engine/noaamaps';
import { ago } from '../engine/weather';

const GROUP_LABEL: Record<NoaaMap['group'], string> = { satellite: '🛰 Satellite & lightning', storms: '⛈ Storms & alerts', forecast: '🌡 Forecast maps', space: '🌌 Space weather' };
type Shown = { src: string; at: number | null; live: boolean; modified?: string } | null;

export function NoaaMaps({ groups, regionChoice = true }: { groups: NoaaMap['group'][]; regionChoice?: boolean }) {
  const [group, setGroup] = useState(groups[0]);
  const list = useMemo(() => NOAA_MAPS.filter((m) => m.group === group), [group]);
  const [sel, setSel] = useState(list[0].id);
  const [region, setRegion] = useState<MapRegion>(() => { try { return (localStorage.getItem('lv.noaamap.region') as MapRegion) || 'se'; } catch { return 'se'; } });
  const [shown, setShown] = useState<Record<string, Shown>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => { if (!list.some((m) => m.id === sel)) setSel(list[0].id); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = list.find((x) => x.id === sel) ?? list[0];
  const rg: MapRegion = regionChoice ? region : 'se';

  const show = (id: string, s: SavedMap | undefined | null, live?: string) => {
    if (s) { const u = URL.createObjectURL(s.blob); urls.current.push(u); setShown((x) => ({ ...x, [id]: { src: u, at: s.at, live: false, modified: s.modified } })); }
    else if (live) setShown((x) => ({ ...x, [id]: { src: `${live}${live.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 300e3)}`, at: Date.now(), live: true } }));
  };

  // Show saved copies at once; download the ones that are out of date (this tab only) when online.
  const load = async (force = false) => {
    setErr('');
    const saved = await Promise.all(list.map((x) => savedMap(x.id, rg)));
    list.forEach((x, i) => saved[i] && show(x.id, saved[i]));
    if (navigator.onLine === false) return;
    const due = list.filter((x, i) => force || stale(x, saved[i]));
    if (!due.length) return;
    setBusy(true);
    const errs: string[] = [];
    for (const x of [m, ...due.filter((d) => d !== m)].filter((d) => due.includes(d))) {
      try { const s = await downloadMap(x, rg); show(x.id, s, s ? undefined : x.url[rg]); }
      catch (e) { errs.push(`${x.title}: ${(e as Error).message}`); }
    }
    setBusy(false);
    if (errs.length) setErr(errs.length === due.length ? `Could not download new maps (${errs[0].split(': ').pop()}). Showing the last copies.` : `Not updated: ${errs.join('; ')}`);
  };
  useEffect(() => { setShown({}); load(); }, [group, rg]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = window.setInterval(() => { setTick((n) => n + 1); if (document.visibilityState !== 'hidden') load(); }, 5 * 60e3);
    const on = () => load();
    window.addEventListener('online', on);
    return () => { clearInterval(t); window.removeEventListener('online', on); };
  }, [group, rg]); // eslint-disable-line react-hooks/exhaustive-deps
  void tick;

  const cur = shown[m.id];
  const age = cur?.at ? Date.now() - cur.at : null;
  return (
    <div className="noaa-maps" data-tour="noaa-maps">
      <div className="row wrap">
        {groups.length > 1 && groups.map((g) => <button key={g} className={g === group ? 'primary' : ''} onClick={() => setGroup(g)}>{GROUP_LABEL[g]}</button>)}
        {regionChoice && group !== 'space' && <span className="row" style={{ gap: 4 }}>
          {(['se', 'us'] as MapRegion[]).map((r) => <button key={r} className={r === region ? 'primary' : ''} onClick={() => { setRegion(r); try { localStorage.setItem('lv.noaamap.region', r); } catch { /* ignore */ } }}>{r === 'se' ? 'Southeast' : 'Whole US'}</button>)}
        </span>}
        <button onClick={() => load(true)} disabled={busy}>{busy ? 'Downloading…' : '🔄 Get the latest maps'}</button>
      </div>
      <div className="noaa-thumbs" role="tablist" aria-label="Maps">
        {list.map((x) => <button key={x.id} role="tab" aria-selected={x.id === m.id} className={x.id === m.id ? 'sel' : ''} onClick={() => setSel(x.id)}>
          {shown[x.id] ? <img src={shown[x.id]!.src} alt="" loading="lazy" /> : <span className="noaa-empty" aria-hidden>🗺</span>}
          <span>{x.title}</span>
        </button>)}
      </div>
      <figure className="noaa-main">
        {cur ? <img src={cur.src} alt={m.title} onError={() => setShown((x) => ({ ...x, [m.id]: null }))} />
          : <p className="note">{navigator.onLine === false ? 'No internet and no saved copy of this map yet. It is saved the first time it is shown online.' : busy ? 'Downloading from NOAA…' : 'Not available right now.'}</p>}
        <figcaption>
          <b>{m.title}</b> · {m.note}
          <div className={'small ' + (age != null && age > m.everyMin * 60e3 * 2 ? 'note' : 'muted')}>
            {cur ? (cur.live ? 'Shown live from NOAA (this map cannot be kept for offline use). ' : `Downloaded ${ago(age!)} (${new Date(cur.at!).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })})${cur.modified ? `, made by NOAA ${new Date(cur.modified).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}. `) : ''}
            New every {m.everyMin < 60 ? `${m.everyMin} minutes` : `${m.everyMin / 60} hour${m.everyMin > 60 ? 's' : ''}`}; updates by itself while this page is open. Source: {m.source}.
            {m.loop && <> <a href={m.loop[rg]} target="_blank" rel="noreferrer">Moving loop ↗</a></>}
          </div>
          {err && <div className="small note">{err}</div>}
        </figcaption>
      </figure>
    </div>
  );
}
