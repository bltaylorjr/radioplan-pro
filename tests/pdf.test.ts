import { describe, it, expect } from 'vitest';
import { tablePdf, wrap, textWidth } from '../src/engine/pdf';
import { writeFileSync } from 'fs';

describe('pdf writer', () => {
  it('builds a valid multi-page table PDF', () => {
    const rows = [{ group: 'Fire alarm' }, ...Array.from({ length: 120 }, (_, i) => ({ cells: [`Smoke detector ${i}`, 'Brand – Model “X” × 2', String(i), 'ea', 'One per 900 ft² (NFPA 72) and a long basis text that wraps onto a second line'] }))];
    const b = tablePdf({ title: 'Materials list', subtitle: ['Project: Test'], columns: [{ title: 'Item', width: 190 }, { title: 'Brand / model', width: 170 }, { title: 'Qty', width: 50, align: 'right' }, { title: 'Unit', width: 45 }, { title: 'Basis', width: 265 }], rows, footer: 'Footer' });
    const s = new TextDecoder('latin1').decode(b);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(Number(s.match(/\/Count (\d+)/)![1])).toBeGreaterThan(1);
    const xref = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(xref, xref + 4)).toBe('xref');
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, b);
  });
  it('wraps text to the width', () => {
    for (const l of wrap('one two three four five six seven eight nine ten', 60, 9)) expect(textWidth(l, 9)).toBeLessThanOrEqual(60);
  });
});
