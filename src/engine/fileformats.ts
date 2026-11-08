// Reading and writing common office and CAD file formats, with no extra libraries:
// Excel (.xlsx), Word (.doc), CSV, KML/KMZ, GPX, GeoJSON and DXF (CAD).
import { zip } from './gisexport';
import { parseCsv } from './csv';

const enc = new TextEncoder(), dec = new TextDecoder();
export const xmlEsc = (s: unknown) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
export const xmlUnesc = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-f]+));/gi, (m, n, d, h) => d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[n.toLowerCase() as 'lt'] ?? m));

// ---------- ZIP reading (for .xlsx, .kmz, .docx) ----------
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
export async function unzip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), files = new Map<string, Uint8Array>();
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a ZIP-based file');
  const n = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true);
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), raw = buf.subarray(start, start + csize);
    if (!name.endsWith('/')) files.set(name, method === 0 ? raw : method === 8 ? await inflateRaw(raw) : new Uint8Array());
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

// ---------- Excel ----------
export interface Sheet { name: string; rows: unknown[][] }
const col = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const sheetName = (s: string, used: Set<string>) => { let n = (s.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet').slice(0, 31); let k = 2; while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${k++}`; used.add(n.toLowerCase()); return n; };

/** A real .xlsx workbook, first row bold, with one sheet per table. */
export function writeXlsx(sheets: Sheet[]): Uint8Array {
  const used = new Set<string>(), list = sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }];
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files: { name: string; data: string }[] = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${R}"><sheets>${list.map((s, i) => `<sheet name="${xmlEsc(sheetName(s.name, used))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${list.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
  ];
  list.forEach((s, i) => {
    const widths = (s.rows[0] ?? []).map((_, c) => Math.min(60, Math.max(8, ...s.rows.map((r) => String(r[c] ?? '').length + 2))));
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = `${col(ci)}${ri + 1}`, st = ri === 0 ? ' s="1"' : '';
      if (v == null || v === '') return '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}">${widths.length ? `<cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>` });
  });
  return zip(files);
}

const colIndex = (ref: string) => { const m = /^([A-Z]+)/.exec(ref); if (!m) return 0; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
/** Read every sheet of an .xlsx file as rows of text. */
export async function readXlsx(buf: Uint8Array): Promise<{ name: string; rows: string[][] }[]> {
  const f = await unzip(buf), txt = (n: string) => { const d = f.get(n); return d ? dec.decode(d) : ''; };
  const shared = [...txt('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlUnesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const rels = new Map([...txt('xl/_rels/workbook.xml.rels').matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2].replace(/^\/?xl\//, '')]));
  const sheets = [...txt('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ name: xmlUnesc(m[1]), path: 'xl/' + (rels.get(m[2]) ?? '') }));
  return sheets.map((s) => {
    const rows: string[][] = [];
    for (const r of txt(s.path).matchAll(/<row[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const row: string[] = [];
      for (const c of (r[1] ?? '').matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = c[1], body = c[2] ?? '', ref = /r="([A-Z]+\d+)"/.exec(at)?.[1] ?? col(row.length) + '1', t = /t="(\w+)"/.exec(at)?.[1];
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('');
        const val = t === 's' ? shared[+raw] ?? '' : t === 'b' ? (raw === '1' ? 'TRUE' : 'FALSE') : xmlUnesc(raw);
        const i = colIndex(ref); while (row.length < i) row.push(''); row[i] = val;
      }
      rows.push(row);
    }
    return { name: s.name, rows: rows.filter((r) => r.some((x) => x.trim())) };
  });
}

// ---------- Word ----------
/** A Word document (.doc) from HTML: opens in Word, LibreOffice and Google Docs with tables and headings kept. */
export function wordDoc(title: string, bodyHtml: string, landscape = false): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${xmlEsc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page { size: ${landscape ? '11in 8.5in; mso-page-orientation: landscape' : '8.5in 11in'}; margin: 0.75in; } body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; } h1 { font-size: 18pt; } h2 { font-size: 14pt; margin-top: 18pt; } h3 { font-size: 12pt; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; } th, td { border: 1px solid #999; padding: 3pt 5pt; vertical-align: top; font-size: 10pt; } th { background: #e8e8e8; text-align: left; } img { max-width: 6.5in; } .pb { page-break-before: always; }</style></head><body>${bodyHtml}</body></html>`;
}
/** Strip interactive bits (buttons, inputs) from page HTML before saving it as a document. */
export function cleanHtml(html: string): string {
  return html.replace(/<(button|input|select|textarea|canvas)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<(input|canvas)[^>]*\/?>/gi, '').replace(/\s(class|style|data-[\w-]+|aria-[\w-]+|role)="[^"]*"/g, '');
}
/** Tables found in page HTML, as rows of text: for Excel and CSV. */
export function tablesFromHtml(html: string): { caption: string; rows: string[][] }[] {
  const strip = (s: string) => xmlUnesc(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  const out: { caption: string; rows: string[][] }[] = []; let last = 'Table';
  const re = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>|<table[^>]*>([\s\S]*?)<\/table>/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] != null) { last = strip(m[1]) || last; continue; }
    const rows = [...m[2].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => strip(c[1])));
    if (rows.length) out.push({ caption: last, rows });
  }
  return out;
}

// ---------- Points from map files ----------
export interface ImportedPoint { name: string; lat: number; lon: number; elevM?: number; note?: string }
export function pointsFromKml(text: string): ImportedPoint[] {
  return [...text.matchAll(/<Placemark[\s\S]*?<\/Placemark>/gi)].flatMap((pm) => {
    const b = pm[0], pt = /<Point[\s\S]*?<coordinates>\s*([^<]+?)\s*<\/coordinates>/i.exec(b); if (!pt) return [];
    const [lon, lat, alt] = pt[1].split(/[\s,]+/).map(Number); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const name = xmlUnesc(/<name>([\s\S]*?)<\/name>/i.exec(b)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? '');
    const note = xmlUnesc(/<description>([\s\S]*?)<\/description>/i.exec(b)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').trim() ?? '');
    return [{ name: name || 'Imported point', lat, lon, elevM: Number.isFinite(alt) ? alt : undefined, note: note || undefined }];
  });
}
export function pointsFromGpx(text: string): ImportedPoint[] {
  return [...text.matchAll(/<(wpt|trkpt|rtept)\s+([^>]*)>([\s\S]*?)<\/\1>/gi)].flatMap((m, i) => {
    const lat = Number(/lat="([^"]+)"/.exec(m[2])?.[1]), lon = Number(/lon="([^"]+)"/.exec(m[2])?.[1]); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const ele = Number(/<ele>([^<]+)<\/ele>/.exec(m[3])?.[1]);
    return [{ name: xmlUnesc(/<name>([\s\S]*?)<\/name>/.exec(m[3])?.[1]?.trim() ?? `Point ${i + 1}`), lat, lon, elevM: Number.isFinite(ele) ? ele : undefined }];
  });
}
export function pointsFromGeoJson(text: string): ImportedPoint[] {
  const j = JSON.parse(text) as { type?: string; features?: { geometry?: { type: string; coordinates: number[] }; properties?: Record<string, unknown> }[] };
  return (j.features ?? []).filter((f) => f.geometry?.type === 'Point').map((f, i) => ({ name: String(f.properties?.name ?? f.properties?.Name ?? `Point ${i + 1}`), lon: f.geometry!.coordinates[0], lat: f.geometry!.coordinates[1], elevM: f.geometry!.coordinates[2] }));
}

// ---------- Tables from any file ----------
export type FileKind = 'project' | 'table' | 'points' | 'document' | 'image' | 'text' | 'other';
export const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
export function kindOf(name: string, type = ''): FileKind {
  const e = extOf(name);
  if (/\.radioplan(\.json)?$|radioplan-backup.*\.json$/i.test(name)) return 'project';
  if (['csv', 'tsv', 'xlsx', 'xlsm'].includes(e)) return 'table';
  if (['kml', 'kmz', 'gpx', 'geojson'].includes(e)) return 'points';
  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'].includes(e)) return 'image';
  if (['pdf', 'doc', 'docx', 'xls', 'ppt', 'pptx', 'dwg', 'dxf', 'rtf', 'odt', 'ods', 'zip', 'vsd', 'vsdx'].includes(e)) return 'document';
  if (['txt', 'md', 'log', 'json', 'xml', 'html', 'htm'].includes(e) || type.startsWith('text/')) return 'text';
  return 'other';
}
export async function tablesFromFile(name: string, buf: Uint8Array): Promise<{ name: string; rows: string[][] }[]> {
  const e = extOf(name);
  if (e === 'xlsx' || e === 'xlsm') return readXlsx(buf);
  const t = dec.decode(buf).replace(/^﻿/, '');
  if (e === 'tsv' || (!t.split('\n')[0].includes(',') && t.split('\n')[0].includes('\t'))) return [{ name, rows: t.split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')) }];
  return [{ name, rows: parseCsv(t) }];
}
export async function pointsFromFile(name: string, buf: Uint8Array): Promise<ImportedPoint[]> {
  const e = extOf(name);
  if (e === 'kmz') { const f = await unzip(buf); const k = [...f.keys()].find((n) => n.toLowerCase().endsWith('.kml')); return k ? pointsFromKml(dec.decode(f.get(k)!)) : []; }
  const t = dec.decode(buf);
  return e === 'gpx' ? pointsFromGpx(t) : e === 'geojson' ? pointsFromGeoJson(t) : pointsFromKml(t);
}
/** What a table holds, from its header row. */
export function tableKind(headers: string[]): 'sites' | 'materials' | 'contacts' | 'unknown' {
  const h = headers.map((x) => x.toLowerCase());
  const has = (...k: string[]) => k.some((x) => h.some((y) => y.includes(x)));
  if (has('lat') && has('lon', 'lng')) return 'sites';
  if (has('qty', 'quantity') && has('item', 'description', 'material', 'part')) return 'materials';
  if (has('phone', 'email') && has('name', 'office', 'contact', 'company')) return 'contacts';
  return 'unknown';
}

// ---------- DXF (AutoCAD R12 text) ----------
export interface DxfLayer { name: string; color: number }
export type DxfEnt = { t: 'line'; layer: string; x1: number; y1: number; x2: number; y2: number } | { t: 'circle'; layer: string; x: number; y: number; r: number } | { t: 'text'; layer: string; x: number; y: number; h: number; s: string };
/** A DXF drawing in feet that opens in AutoCAD, BricsCAD, DraftSight, LibreCAD and most CAD viewers. */
export function writeDxf(layers: DxfLayer[], ents: DxfEnt[]): string {
  const o: (string | number)[] = [];
  const p = (...a: (string | number)[]) => o.push(...a);
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 2, 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.length + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
  for (const l of layers) p(0, 'LAYER', 2, l.name.replace(/[^A-Za-z0-9_-]/g, '_'), 70, 0, 62, l.color, 6, 'CONTINUOUS');
  p(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const L = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_'), f = (n: number) => +n.toFixed(4);
  for (const e of ents) {
    if (e.t === 'line') p(0, 'LINE', 8, L(e.layer), 10, f(e.x1), 20, f(e.y1), 30, 0, 11, f(e.x2), 21, f(e.y2), 31, 0);
    else if (e.t === 'circle') p(0, 'CIRCLE', 8, L(e.layer), 10, f(e.x), 20, f(e.y), 30, 0, 40, f(e.r));
    else p(0, 'TEXT', 8, L(e.layer), 10, f(e.x), 20, f(e.y), 30, 0, 40, f(e.h), 1, e.s.replace(/[\r\n]+/g, ' '));
  }
  p(0, 'ENDSEC', 0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
export const toBytes = (s: string) => enc.encode(s);
