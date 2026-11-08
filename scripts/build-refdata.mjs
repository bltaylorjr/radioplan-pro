// Generates src/data/refdata.json: county boundaries, ZIP codes and towns for NC, SC, GA, TN and VA,
// so county / jurisdiction lookup and place search work with no internet.
// Sources: us-atlas (US Census Bureau cartographic boundaries, 1:10m), zipcodes (US ZIP centroids).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
const require = createRequire(import.meta.url);
const STATES = { '37': 'NC', '45': 'SC', '13': 'GA', '47': 'TN', '51': 'VA' };
const topo = JSON.parse(fs.readFileSync('node_modules/us-atlas/counties-10m.json', 'utf8'));
const r4 = (v) => Math.round(v * 1e4);
const counties = [];
for (const f of feature(topo, topo.objects.counties).features) {
  const st = STATES[String(f.id).slice(0, 2)]; if (!st) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let w = 180, e = -180, s = 90, n = -90;
  // Each ring: delta-encoded integer lon/lat (1e-4 deg ≈ 10 m)
  const rings = [];
  for (const poly of polys) for (const ring of poly) {
    const out = []; let px = 0, py = 0;
    for (const [x, y] of ring) { const X = r4(x), Y = r4(y); out.push(X - px, Y - py); px = X; py = Y; w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    rings.push(out);
  }
  // Virginia's independent cities (FIPS 51510 and up) share names with counties (Richmond, Fairfax, Roanoke…): label them "… city".
  const nm = st === 'VA' && +String(f.id).slice(2) >= 510 && !/ city$/i.test(f.properties.name) ? `${f.properties.name} city` : f.properties.name;
  counties.push({ f: String(f.id), n: nm, s: st, b: [w, s, e, n].map((v) => +v.toFixed(4)), r: rings });
}
const { codes } = require('zipcodes/lib/codes.js');
const zips = Object.values(codes).filter((z) => Object.values(STATES).includes(z.state) && Number.isFinite(z.latitude))
  .map((z) => [z.zip, +z.latitude.toFixed(4), +z.longitude.toFixed(4), z.city, z.state]).sort((a, b) => a[0].localeCompare(b[0]));
const out = { source: 'US Census Bureau cartographic boundaries via us-atlas 3.0.1; ZIP centroids via zipcodes 8.0.0', states: Object.values(STATES), counties, zips };
fs.writeFileSync('src/data/refdata.json', JSON.stringify(out));
console.log(`counties ${counties.length}, zips ${zips.length}, ${(fs.statSync('src/data/refdata.json').size / 1024).toFixed(0)} KB`);
