// Leaflet tile layer that serves tiles from the offline cache (IndexedDB) and stores new tiles as they load.
// On sharp (retina) screens such as an iPhone it draws each tile from the four more-detailed tiles under it,
// so roads, labels and satellite pictures are crisp instead of blurry. If those are not available (offline and
// not saved, or past the source's most detailed level) it uses the normal tile, as before.
import L from 'leaflet';
import { cachedFetchBlob } from '../engine/tilecache';

const blobImage = (blob: Blob) => createImageBitmap(blob);

export const CachedTileLayer = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const self = this as L.TileLayer & { _url: string; options: L.TileLayerOptions & { maxNativeZoom?: number } };
    const url = this.getTileUrl(coords);
    const nativeMax = self.options.maxNativeZoom ?? self.options.maxZoom ?? 18;
    const sharp = (window.devicePixelRatio || 1) >= 1.5 && coords.z + 1 <= nativeMax && typeof createImageBitmap === 'function';
    const plain = () => {
      const img = document.createElement('img');
      img.alt = ''; img.setAttribute('role', 'presentation');
      cachedFetchBlob(url, true)
        .then(({ blob }) => { const u = URL.createObjectURL(blob); img.onload = () => { URL.revokeObjectURL(u); done(undefined, img); }; img.onerror = () => done(new Error('tile'), img); img.src = u; })
        .catch(() => { img.onload = () => done(undefined, img); img.onerror = () => done(new Error('tile'), img); img.src = url; }); // e.g. CORS-restricted server
      return img;
    };
    if (!sharp) return plain();
    // 512 x 512 picture from the four tiles one level more detailed, shown in the normal 256 x 256 tile spot
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
    cv.setAttribute('role', 'presentation');
    const kids = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => {
      const c = { x: coords.x * 2 + dx, y: coords.y * 2 + dy, z: coords.z + 1 } as L.Coords;
      return cachedFetchBlob(this.getTileUrl(c), true).then(({ blob }) => blobImage(blob)).then((bmp) => ({ bmp, dx, dy }));
    });
    Promise.all(kids).then((parts) => {
      const ctx = cv.getContext('2d')!;
      for (const p of parts) { ctx.drawImage(p.bmp, p.dx * 256, p.dy * 256, 256, 256); p.bmp.close?.(); }
      done(undefined, cv);
    }).catch(() => {
      // fall back to the normal tile, drawn into the same canvas
      cachedFetchBlob(url, true).then(({ blob }) => blobImage(blob)).then((bmp) => { cv.getContext('2d')!.drawImage(bmp, 0, 0, 512, 512); bmp.close?.(); done(undefined, cv); })
        .catch(() => { // e.g. a server that does not allow reading its tiles: show the picture directly (still displays)
          const img = new Image(); img.onload = () => { cv.getContext('2d')!.drawImage(img, 0, 0, 512, 512); done(undefined, cv); }; img.onerror = () => done(new Error('tile'), cv); img.src = url;
        });
    });
    return cv;
  },
}) as unknown as new (url: string, opts?: L.TileLayerOptions) => L.TileLayer;
