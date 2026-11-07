// Slippy-map (Web Mercator, EPSG:3857) tile math.
export function lonToTileX(lon: number, z: number) { return ((lon + 180) / 360) * 2 ** z; }
export function latToTileY(lat: number, z: number) { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; }
export function tileXToLon(x: number, z: number) { return (x / 2 ** z) * 360 - 180; }
export function tileYToLat(y: number, z: number) { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
/** Ground resolution (m/pixel) of a 256-px tile at latitude and zoom. */
export const metersPerPixel = (lat: number, z: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
/** Tiles covering a lat/lon box at zoom z. */
export function tileRange(b: { north: number; south: number; east: number; west: number }, z: number) {
  const x0 = Math.floor(lonToTileX(b.west, z)), x1 = Math.floor(lonToTileX(b.east, z));
  const y0 = Math.floor(latToTileY(b.north, z)), y1 = Math.floor(latToTileY(b.south, z));
  return { x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
}
/** Terrarium-encoded elevation (metres) from RGB: (R*256 + G + B/256) - 32768. */
export const terrariumElevation = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;
