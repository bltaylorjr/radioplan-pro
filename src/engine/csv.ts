// Small RFC 4180 CSV reader/writer plus header matching for imported site and survey files.
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, ''); const first = t.split('\n')[0]; const cnt = (c: string) => first.split(c).length - 1;
  const delim = [',', '\t', ';', '|'].reduce((a, b) => (cnt(b) > cnt(a) ? b : a), ',');
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else f += ch;
  }
  row.push(f); if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}
export const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Index of the first header that matches one of the aliases (normalised, exact then prefix). */
export function findCol(headers: string[], aliases: string[]): number {
  const H = headers.map(norm), A = aliases.map(norm);
  for (const a of A) { const i = H.indexOf(a); if (i >= 0) return i; }
  for (const a of A) { const i = H.findIndex((h) => h.startsWith(a)); if (i >= 0) return i; }
  return -1;
}
export const num = (s: string | undefined): number | null => { if (s == null || s.trim() === '') return null; const v = Number(s.replace(/[^0-9eE+\-.]/g, '')); return Number.isFinite(v) ? v : null; };
