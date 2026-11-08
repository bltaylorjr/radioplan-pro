import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { writeXlsx, readXlsx, unzip, pointsFromKml, pointsFromGpx, tableKind, writeDxf, tablesFromHtml, kindOf } from '../src/engine/fileformats';
import { sheetList, pickScale, plansDxf, tagsFor, SCALES } from '../src/engine/blueprint';
import { autoDesign, defaultInputs } from '../src/engine/autodesign';
import { defaultProject } from '../src/defaults';
import { repairProject } from '../src/engine/repair';

describe('file formats', () => {
  it('writes an Excel workbook it can read back', async () => {
    const x = writeXlsx([{ name: 'Materials', rows: [['Item', 'Qty'], ['Cat 6 <plenum> & co', 12], ['Box', 3.5]] }, { name: 'Sites/1', rows: [['a']] }]);
    const s = await readXlsx(x);
    expect(s.map((t) => t.name)).toEqual(['Materials', 'Sites 1']);
    expect(s[0].rows).toEqual([['Item', 'Qty'], ['Cat 6 <plenum> & co', '12'], ['Box', '3.5']]);
  });
  it('reads compressed zip entries', async () => {
    const data = new TextEncoder().encode('hello hello hello'); const comp = deflateRawSync(data);
    const name = new TextEncoder().encode('a.txt');
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 42);
    const cdOff = 30 + name.length + comp.length, e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(46 + name.length, 12); e.writeUInt32LE(cdOff, 16);
    const f = await unzip(new Uint8Array(Buffer.concat([lh, name, comp, ch, name, e])));
    expect(new TextDecoder().decode(f.get('a.txt'))).toBe('hello hello hello');
  });
  it('reads points from KML and GPX', () => {
    expect(pointsFromKml('<kml><Placemark><name>Tower &amp; 1</name><Point><coordinates>-80.8,35.2,12</coordinates></Point></Placemark></kml>')).toEqual([{ name: 'Tower & 1', lat: 35.2, lon: -80.8, elevM: 12, note: undefined }]);
    expect(pointsFromGpx('<gpx><wpt lat="36.1" lon="-86.7"><name>A</name></wpt></gpx>')[0]).toMatchObject({ name: 'A', lat: 36.1, lon: -86.7 });
  });
  it('recognises what a spreadsheet holds', () => {
    expect(tableKind(['Name', 'Latitude', 'Longitude'])).toBe('sites');
    expect(tableKind(['Description', 'Qty', 'Unit'])).toBe('materials');
    expect(tableKind(['Office', 'Phone'])).toBe('contacts');
    expect(tableKind(['foo'])).toBe('unknown');
    expect(kindOf('job.radioplan.json')).toBe('project'); expect(kindOf('plan.pdf')).toBe('document'); expect(kindOf('x.kmz')).toBe('points'); expect(kindOf('a.xlsx')).toBe('table');
  });
  it('pulls tables out of report HTML', () => {
    const t = tablesFromHtml('<h3>1. Price</h3><table><tr><th>A</th><th>B</th></tr><tr><td>x &amp; y</td><td>2</td></tr></table>');
    expect(t).toEqual([{ caption: '1. Price', rows: [['A', 'B'], ['x & y', '2']] }]);
  });
  it('writes a DXF with layers and entities', () => {
    const d = writeDxf([{ name: 'FA-SMOKE', color: 1 }], [{ t: 'circle', layer: 'FA-SMOKE', x: 1, y: 2, r: 1 }, { t: 'text', layer: 'FA-SMOKE', x: 0, y: 0, h: 1, s: 'S-101' }]);
    expect(d).toContain('AC1009'); expect(d).toContain('CIRCLE'); expect(d).toContain('S-101'); expect(d.trim().endsWith('EOF')).toBe(true);
  });
});

describe('blueprints', () => {
  const p = defaultProject(); p.meta.projectType = 'firealarm'; p.meta.subSystems = ['cabling', 'cctv'];
  const r = autoDesign(p, defaultInputs());
  it('makes cover, plans per floor, riser and schedules per discipline', () => {
    const s = sheetList(r, 2).map((x) => x.no);
    expect(s[0]).toBe('G-001');
    for (const n of ['FA-101', 'FA-102', 'FA-501', 'FA-601', 'T-101', 'SS-101']) expect(s).toContain(n);
    expect(new Set(s).size).toBe(s.length);
  });
  it('picks the largest architectural scale that fits', () => {
    expect(pickScale(200, 100, 30, 20).id).toBe('1/8');
    expect(pickScale(1000, 500, 30, 20).id).toBe('1/32');
    expect(SCALES.every((x, i) => i === 0 || x.inPerFt < SCALES[i - 1].inPerFt)).toBe(true);
  });
  it('numbers device tags per floor and exports DXF', () => {
    expect(tagsFor(r.devices.filter((d) => d.kind === 'smoke' && d.floor === 0)).slice(0, 2)).toEqual(['S-101', 'S-102']);
    expect(plansDxf(r, 200, 100, 2)).toContain('FA-SMOKE');
  });
  it('repair keeps new project sections', () => {
    const q = { ...defaultProject(), blueprint: { size: 'ARCH D', scale: 'auto', drawnBy: 'BT', checkedBy: '', revisions: [], off: [] }, documents: [{ id: 'a', name: 'x.pdf' }] };
    const out = repairProject(q).project; expect(out.blueprint?.drawnBy).toBe('BT'); expect(out.documents?.length).toBe(1);
  });
});
