// Address -> coordinates via OpenStreetMap Nominatim (requires internet; fair-use: 1 request/second).
export interface GeoResult { lat: number; lon: number; label: string }
export async function geocodeAddress(q: string): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Geocoder HTTP ${r.status}`);
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  return j.map((x) => ({ lat: parseFloat(x.lat), lon: parseFloat(x.lon), label: x.display_name }));
}
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
  if (!r.ok) throw new Error(`Geocoder HTTP ${r.status}`);
  return ((await r.json()) as { display_name?: string }).display_name ?? '';
}
