import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Check, Badge } from './ui';
import type { Bounds } from '../engine/autoterrain';
import { cacheStats, cacheClear } from '../engine/tilecache';
import { kvSet } from '../engine/projectdb';
import { askConfirm } from './askConfirm';
import { MapPacks } from './MapPacks';

/** Automatic offline settings, the map cache, and offline map packs for whole job areas. */
export function OfflineArea({ viewBounds }: { viewBounds?: Bounds | null }) {
  const { project: p, update } = useStore();
  const [stats, setStats] = useState<{ count: number; bytes: number } | null>(null);
  const refresh = () => cacheStats().then(setStats).catch(() => setStats(null));
  useEffect(() => { refresh(); }, []);
  const clear = async () => {
    if (!(await askConfirm({ title: 'Clear the map cache?', message: 'Delete every saved map, satellite and terrain tile on this device, including all offline map packs? Maps download again when you are online.', ok: 'Delete all', danger: true }))) return;
    await cacheClear(); await kvSet('mappacks', []); refresh();
  };
  return (
    <div className="stack">
      <MapPacks viewBounds={viewBounds} />
      <Card title="Automatic offline maps & terrain" tip="While online, the app saves terrain and the topo map around your sites by itself, and keeps every map tile you look at.">
        <div className="form">
          <Field label="Automatic terrain"><Check value={p.settings?.autoTerrain ?? true} onChange={(v) => update((d) => { d.settings = { ...(d.settings ?? { terrainMarginKm: 5 }), autoTerrain: v }; })} label="Download terrain for my sites automatically" /></Field>
          <Field label="Automatic maps"><Check value={p.settings?.autoMaps ?? true} onChange={(v) => update((d) => { d.settings = { ...d.settings, autoMaps: v }; })} label="Save the topo map around my sites for offline use" /></Field>
        </div>
        <div className="row wrap">
          {stats && <span className="muted small">Saved on this device: {stats.count.toLocaleString()} tiles, {(stats.bytes / 1e6).toFixed(1)} MB</span>}
          <button onClick={clear}>Clear map cache</button>
        </div>
        <p className="small muted"><Badge kind="real">Terrain: USGS 3DEP via AWS Open Data</Badge></p>
      </Card>
    </div>
  );
}
