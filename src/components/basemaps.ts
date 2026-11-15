// Kept apart from MapView so screens that only need the list do not load the whole map library.
/** Base maps. `bulk: true` = public-domain (USGS) sources that may be pre-downloaded for offline use.
 *  OSM-community and Esri tiles are cached only as you view them, per their usage policies. */
export const BASEMAPS: Record<string, { url: string; attr: string; max: number; bulk: boolean }> = {
  'USGS Topo': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map', max: 16, bulk: true },
  'Topographic (OpenTopoMap)': { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', max: 17, bulk: false },
  'Satellite (USGS Imagery)': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map: Orthoimagery', max: 16, bulk: true },
  'Satellite + Topo (USGS)': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map', max: 16, bulk: true },
  'Satellite (Esri, high-res)': { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Esri, Maxar, Earthstar Geographics', max: 19, bulk: false },
  'Shaded relief (USGS)': { url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}', attr: 'USGS The National Map', max: 16, bulk: true },
  'Streets (OSM)': { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', max: 19, bulk: false },
};
export const DEFAULT_BASE = 'USGS Topo';
