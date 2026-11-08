// Minimal PDF writer for text tables (Helvetica, WinAnsi), so lists can be saved as a real PDF file
// on every platform (Windows app, Android, browser, flash drive) without a print dialog.

const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
/** Text width in points for Helvetica at `size` (bold is about 5 % wider). */
export function textWidth(s: string, size: number, bold = false): number {
  let w = 0; for (const ch of s) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? W[c - 32] : 556; }
  return (w * size) / 1000 * (bold ? 1.05 : 1);
}
const WINANSI: Record<string, number> = { '€': 128, '‚': 130, '„': 132, '…': 133, '•': 149, '–': 150, '—': 151, '‘': 145, '’': 146, '“': 147, '”': 148, '™': 153, '·': 183, '×': 215, '°': 176, 'µ': 181, '±': 177, '²': 178, '³': 179, '½': 189, '¼': 188, '¾': 190 };
function toBytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) { const c = ch.charCodeAt(0); out.push(c < 128 || (c >= 160 && c <= 255) ? c : WINANSI[ch] ?? 63); }
  return out;
}
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]+/g, ' ');

/** Cut `s` to fit `max` points, adding an ellipsis. */
export function fit(s: string, max: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= max) return s;
  let t = s; while (t.length > 1 && textWidth(t + '…', size, bold) > max) t = t.slice(0, -1);
  return t + '…';
}
/** Wrap `s` into lines that fit `max` points. */
export function wrap(s: string, max: number, size: number, bold = false): string[] {
  const words = s.split(/\s+/).filter(Boolean), lines: string[] = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (textWidth(t, size, bold) <= max || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  return lines.map((l) => fit(l, max, size, bold));
}

export interface PdfCol { title: string; width: number; align?: 'left' | 'right' }
export interface PdfTable {
  title: string; subtitle?: string[]; columns: PdfCol[];
  /** Rows; a row with `group` set prints as a full-width group heading. */
  rows: ({ cells: string[] } | { group: string })[];
  footer?: string;
}

/** Build a Letter-size PDF (landscape when the columns are wide) holding one table. */
export function tablePdf(t: PdfTable): Uint8Array {
  const tableW = t.columns.reduce((a, c) => a + c.width, 0);
  const land = tableW > 540;
  const PW = land ? 792 : 612, PH = land ? 612 : 792, M = 36, scale = Math.min(1, (PW - 2 * M) / tableW);
  const cols = t.columns.map((c) => ({ ...c, width: c.width * scale }));
  const pages: string[] = []; let ops: string[] = []; let y = 0;
  const text = (x: number, yy: number, s: string, size: number, bold = false) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${esc(s)}) Tj ET`);
  const line = (x1: number, y1: number, x2: number, y2: number, g = 0.75) => ops.push(`${g} G 0.5 w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
  const rect = (x: number, yy: number, w: number, h: number, g: number) => ops.push(`${g} g ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f 0 g`);
  const header = () => {
    y = PH - M; text(M, y - 14, t.title, 16, true); y -= 22;
    for (const s of t.subtitle ?? []) { text(M, y - 10, fit(s, PW - 2 * M, 9.5), 9.5); y -= 13; }
    y -= 6; rect(M, y - 16, PW - 2 * M, 16, 0.9);
    let x = M; for (const c of cols) { const s = fit(c.title, c.width - 6, 9, true); text(c.align === 'right' ? x + c.width - 3 - textWidth(s, 9, true) : x + 3, y - 11.5, s, 9, true); x += c.width; }
    y -= 16;
  };
  const newPage = () => { if (ops.length) pages.push(ops.join('\n')); ops = []; header(); };
  newPage();
  for (const r of t.rows) {
    if ('group' in r) {
      if (y - 34 < M + 20) newPage();
      y -= 4; text(M + 2, y - 12, fit(r.group, PW - 2 * M, 10.5, true), 10.5, true); y -= 16; line(M, y, PW - M, y, 0.5);
      continue;
    }
    const wrapped = r.cells.map((c, i) => wrap(c ?? '', cols[i].width - 6, 9).slice(0, 4));
    const h = Math.max(1, ...wrapped.map((w) => w.length)) * 11 + 4;
    if (y - h < M + 20) newPage();
    let x = M;
    wrapped.forEach((ls, i) => { const c = cols[i]; ls.forEach((s, k) => text(c.align === 'right' ? x + c.width - 3 - textWidth(s, 9) : x + 3, y - 11 - k * 11, s, 9)); x += c.width; });
    y -= h; line(M, y, PW - M, y);
  }
  pages.push(ops.join('\n'));
  const n = pages.length;
  const withFoot = pages.map((p, i) => {
    const f = `${t.footer ? t.footer + '   ·   ' : ''}Page ${i + 1} of ${n}`;
    return `${p}\nBT /F1 8 Tf ${M} ${M - 14} Td (${esc(fit(f, PW - 2 * M, 8))}) Tj ET`;
  });
  // Assemble objects: 1 catalog, 2 pages, 3 F1, 4 F2, then page + content pairs.
  const objs: string[] = [];
  const kids = withFoot.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const streams: number[][] = [];
  withFoot.forEach((c, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    const b = toBytes(c); streams[objs.length] = b; objs.push(`<< /Length ${b.length} >>`);
  });
  const out: number[] = []; const push = (s: string) => { for (const b of toBytes(s)) out.push(b); };
  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length); push(`${i + 1} 0 obj\n${o}\n`);
    const s = streams[i]; if (s) { push('stream\n'); for (const b of s) out.push(b); push('\nendstream\n'); }
    push('endobj\n');
  });
  const xref = out.length;
  push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`);
  push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Uint8Array(out);
}
