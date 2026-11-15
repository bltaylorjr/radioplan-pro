// Writes the online content packs next to the website build: dist/content/<name>.json + manifest.json.
// Installed apps download these when online (src/engine/contentpacks.ts). Run after `vite build`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PACKS, CONTENT_FORMAT, jsonSafe, packShape, Manifest } from '../src/engine/contentpacks';
import pkg from '../package.json';

const out = process.argv[2] || 'dist/content';
mkdirSync(out, { recursive: true });
const version = (pkg as { version: string }).version;
const manifest: Manifest = { format: CONTENT_FORMAT, builtFrom: version, builtAt: new Date().toISOString(), packs: [] };
for (const p of PACKS) {
  const data = p.get();
  if (!jsonSafe(data)) { console.error(`content pack ${p.name}: data does not survive JSON, not published`); process.exitCode = 1; continue; }
  const text = JSON.stringify(data);
  const sum = createHash('sha256').update(text).digest('hex');
  writeFileSync(`${out}/${p.name}.json`, text);
  manifest.packs.push({ name: p.name, file: `${p.name}.json`, sum, shape: packShape(data), builtFrom: version, bytes: Buffer.byteLength(text) });
  console.log(`content pack ${p.name}: ${(text.length / 1024).toFixed(0)} KB`);
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 1));
