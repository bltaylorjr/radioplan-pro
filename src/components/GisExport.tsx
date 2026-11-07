import React from 'react';
import type { CoverageResult } from '../engine/coverage';
import type { ResolvedTier } from '../engine/acceptance';
import type { Site, SurveyPoint } from '../types';
import { toKml, toGeoJson, toShapefileZip, zip, worldFile, gridCsv, WGS84_PRJ } from '../engine/gisexport';
import { downloadText, downloadBytes, safeName } from '../store';
import { coverageCanvas } from './MapView';

const dataUrlBytes = (u: string) => { const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

/** Export buttons for GIS hand-off: KML/KMZ, GeoJSON, Shapefile, georeferenced PNG, CSV grid. */
export function GisExport({ title, sites, coverage, tiers, survey, floor = -120 }: { title: string; sites: Site[]; coverage?: CoverageResult | null; tiers?: ResolvedTier[]; survey?: SurveyPoint[]; floor?: number }) {
  const base = safeName(title), layers = { title, sites, coverage, tiers, survey };
  const png = () => (coverage ? dataUrlBytes(coverageCanvas(coverage, floor)) : null);
  return (
    <div className="row wrap" data-tour="gis-export">
      <button onClick={() => downloadText(`${base}.kml`, toKml(layers), 'application/vnd.google-earth.kml+xml')}>⬇ KML</button>
      <button disabled={!coverage} title="KML with the heat map image included (Google Earth)" onClick={() => { const img = png()!; downloadBytes(`${base}.kmz`, zip([{ name: 'doc.kml', data: toKml(layers, { href: 'coverage.png' }) }, { name: 'coverage.png', data: img }]), 'application/vnd.google-earth.kmz'); }}>⬇ KMZ + heat map</button>
      <button onClick={() => downloadText(`${base}.geojson`, toGeoJson(layers), 'application/geo+json')}>⬇ GeoJSON</button>
      <button onClick={() => downloadBytes(`${base}_shapefiles.zip`, toShapefileZip(layers), 'application/zip')}>⬇ Shapefile (.zip)</button>
      <button disabled={!coverage} title="PNG + world file (.pgw) + .prj for GIS raster overlay" onClick={() => downloadBytes(`${base}_heatmap.zip`, zip([{ name: `${base}.png`, data: png()! }, { name: `${base}.pgw`, data: worldFile(coverage!) }, { name: `${base}.prj`, data: WGS84_PRJ }]), 'application/zip')}>⬇ Heat map PNG + world file</button>
      <button disabled={!coverage} onClick={() => downloadText(`${base}_grid.csv`, gridCsv(coverage!), 'text/csv')}>⬇ Grid CSV</button>
    </div>
  );
}
