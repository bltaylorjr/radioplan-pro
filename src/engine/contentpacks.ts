// Online content updates for the data built into the app (codes, contacts, equipment catalog, manufacturer
// recommendations, help, magnetic model), without waiting for a new app version.
//
// Every time main is published, the website build writes each dataset below as a "pack" (content/<name>.json)
// plus content/manifest.json with its SHA-256, the app version it came from and its "shape" (the field layout).
// Installed apps, when online, download packs that are newer than their own built-in copy, check the SHA-256 and
// that the shape matches what this version of the app understands, and keep them (with a spare copy).
// Packs are put in place at the next start, before any page opens. A pack with a different shape is never used:
// that data needs the matching app update, which arrives by itself.
import { CODE_SETS, TN_EXEMPT_CITIES, TN_EXEMPT_COUNTIES } from '../compliance/codesets';
import { LOCAL_CODES } from '../compliance/citycodes';
import { JURISDICTIONS } from '../compliance/jurisdictions';
import { CONTACTS, RESOURCES } from '../data/contacts';
import { ANTENNAS, FEEDERS, RADIOS, PV_MODULES, BAND_PRESETS } from '../data/catalog';
import { MFR_RECS } from '../data/mfrrecs';
import { LV_CATALOG, LEGACY } from '../data/lvequipment';
import { BUILTIN_NOTICES } from '../data/recalls';
import { SIREN_MODELS, SIREN_SOURCES, SIREN_CODES, SIREN_TEST_KINDS, SIREN_PROGRAMS, SIREN_SIGNALS, NUCLEAR_PLANTS } from '../data/sirens';
import { HELP } from '../help/content';
import { getMagModel, setMagModel } from './azimuth';

export const CONTENT_FORMAT = 'lvplan-content/1';
type Obj = Record<string, unknown>;

/** Put new contents into an exported array or object in place, so every module that imported it sees them. */
function replaceIn(target: unknown, data: unknown) {
  if (Array.isArray(target) && Array.isArray(data)) { target.splice(0, target.length, ...data); return; }
  if (target && typeof target === 'object' && data && typeof data === 'object' && !Array.isArray(data)) {
    for (const k of Object.keys(target as Obj)) delete (target as Obj)[k];
    Object.assign(target as Obj, data); return;
  }
  throw new Error('pack does not fit');
}
const bundle = (o: Record<string, unknown>) => ({ get: () => o, apply: (d: unknown) => { for (const k of Object.keys(o)) if (!(k in (d as Obj))) throw new Error(`missing ${k}`); for (const k of Object.keys(o)) replaceIn(o[k], (d as Obj)[k]); } });

export interface PackDef { name: string; label: string; get: () => unknown; apply: (data: unknown) => void; /** Plain-language notice when this one changes. */ notice?: boolean; /** Used from the next start only (others are used as soon as they arrive). */ restartOnly?: boolean }
export const PACKS: PackDef[] = [
  { name: 'codes', label: 'Code editions and state rules', notice: true, ...bundle({ CODE_SETS, TN_EXEMPT_CITIES, TN_EXEMPT_COUNTIES, JURISDICTIONS }) },
  { name: 'localcodes', label: 'City and county code lists', notice: true, ...bundle({ LOCAL_CODES }) },
  { name: 'contacts', label: 'Contacts and web resources', ...bundle({ CONTACTS, RESOURCES }) },
  { name: 'catalog', label: 'Equipment catalog', restartOnly: true, ...bundle({ ANTENNAS, FEEDERS, RADIOS, PV_MODULES, BAND_PRESETS }) },
  { name: 'lvequipment', label: 'Low-voltage and legacy equipment', restartOnly: true, ...bundle({ LV_CATALOG, LEGACY }) },
  { name: 'recalls', label: 'Recall and service bulletin notices', notice: true, ...bundle({ BUILTIN_NOTICES }) },
  { name: 'sirens', label: 'Outdoor siren database, codes and test programs', notice: true, ...bundle({ SIREN_MODELS, SIREN_SOURCES, SIREN_CODES, SIREN_TEST_KINDS, SIREN_PROGRAMS, SIREN_SIGNALS, NUCLEAR_PLANTS }) },
  { name: 'mfrrecs', label: 'Manufacturer recommendations', ...bundle({ MFR_RECS }) },
  { name: 'help', label: 'Help and manual', ...bundle({ HELP }) },
  { name: 'magnetic', label: 'Magnetic model (compass bearings)', get: getMagModel, apply: (d) => setMagModel(d as ReturnType<typeof getMagModel>) },
];

/** The field layout of a dataset: every key path with its type (array items merged). Values do not matter. */
export function shapeOf(v: unknown): string {
  const out = new Set<string>();
  const walk = (x: unknown, p: string, depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(x)) { out.add(`${p}:array`); for (const it of x) walk(it, `${p}[]`, depth + 1); return; }
    if (x === null || x === undefined) return;
    if (typeof x === 'object') {
      out.add(`${p}:object`);
      // Records keyed by data (state codes, categories...) are treated like lists, so adding a key is not a new shape.
      const keys = Object.keys(x as Obj); const dataKeyed = keys.length > 12 || keys.every((k) => /^[A-Z]{2}$|\s|^\d/.test(k));
      for (const k of keys) walk((x as Obj)[k], dataKeyed ? `${p}{}` : `${p}.${k}`, depth + 1);
      return;
    }
    out.add(`${p}:${typeof x}`);
  };
  walk(v, '', 0);
  return [...out].sort().join('\n');
}

/** Data that does not survive JSON (functions, Infinity...) cannot be sent as a pack. */
export function jsonSafe(v: unknown): boolean {
  let ok = true;
  JSON.stringify(v, (_k, x) => { if (typeof x === 'function' || typeof x === 'symbol' || (typeof x === 'number' && !Number.isFinite(x))) ok = false; return x; });
  return ok;
}

/** Shape as it travels: computed on the JSON form, the same way on the website build and in the app. */
export const packShape = (v: unknown) => shapeOf(JSON.parse(JSON.stringify(v)));

export interface ManifestEntry { name: string; file: string; sum: string; shape: string; builtFrom: string; bytes: number }
export interface Manifest { format: string; builtFrom: string; builtAt: string; packs: ManifestEntry[] }
export interface StoredPack { name: string; builtFrom: string; sum: string; shape: string; data: unknown }

/** Should this app version use a stored or offered pack? */
export function packUsable(p: { builtFrom: string; shape: string }, appVersion: string, myShape: string, cmp: (a: string, b: string) => number): boolean {
  return cmp(p.builtFrom, appVersion) > 0 && p.shape === myShape;
}
