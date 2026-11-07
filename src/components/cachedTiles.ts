// Leaflet tile layer that serves tiles from the offline cache (IndexedDB) and stores new tiles as they load.
import L from 'leaflet';
import { cachedFetchBlob } from '../engine/tilecache';

export const CachedTileLayer = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const img = document.createElement('img');
    img.alt = ''; img.setAttribute('role', 'presentation');
    const url = this.getTileUrl(coords);
    cachedFetchBlob(url, true)
      .then(({ blob }) => { const u = URL.createObjectURL(blob); img.onload = () => { URL.revokeObjectURL(u); done(undefined, img); }; img.onerror = () => done(new Error('tile'), img); img.src = u; })
      .catch(() => { img.onload = () => done(undefined, img); img.onerror = () => done(new Error('tile'), img); img.src = url; }); // e.g. CORS-restricted server
    return img;
  },
}) as unknown as new (url: string, opts?: L.TileLayerOptions) => L.TileLayer;
