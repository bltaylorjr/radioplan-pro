import { describe, it, expect } from 'vitest';
import { analyzeBalance, changeText, dirWord, assignSources, sampleLatLonGrid, toLocalM, normFor, pinColor, PIN_NORMS, type BPoint, type BSource } from '../src/engine/balance';
import { repairProject } from '../src/engine/repair';
import { defaultProject } from '../src/defaults';
import { buildModel } from '../src/engine/models';
import { SYSTEMS } from '../src/data/systems';

const grid = (src: string, x0: number, vals: number[], pred?: number): BPoint[] => vals.map((v, i) => ({ id: `${src}${i}`, v, x: x0 + i, y: 0, src, pred }));
const kinds = (r: ReturnType<typeof analyzeBalance>) => r.advice.map((a) => a.kind);

describe('signal balance from reading pins', () => {
  it('asks for pins when there are none', () => {
    const r = analyzeBalance([], [], { system: 'wifi' });
    expect(r.n).toBe(0); expect(r.advice[0].text).toMatch(/Drop reading pins/);
  });

  it('says all good when every pin is in range and even', () => {
    const r = analyzeBalance(grid('A', 0, [-60, -61, -59, -62, -60]), [{ id: 'A', label: 'AP-1', x: 2, y: 0 }], { system: 'wifi' });
    expect(r.pctOk).toBe(100); expect(r.verdict.tone).toBe('ok'); expect(kinds(r)).toContain('ok'); expect(r.uniform).toBe('good');
  });

  it('finds the imbalance between two access points and says which way to turn each', () => {
    const pts = [...grid('A', 0, [-45, -47, -46, -48]), ...grid('B', 20, [-64, -66, -65, -63])];
    const src: BSource[] = [{ id: 'A', label: 'AP-1', x: 1, y: 0 }, { id: 'B', label: 'AP-2', x: 21, y: 0 }];
    const r = analyzeBalance(pts, src, { system: 'wifi' });
    expect(r.imbalanceDb).toBeGreaterThan(15);
    const b = r.advice.find((a) => a.kind === 'balance')!;
    expect(b.text).toMatch(/AP-1 down/); expect(b.text).toMatch(/AP-2 up/);
  });

  it('turns a nearby antenna up a little, or adds one when the weak spot is far', () => {
    const near = analyzeBalance([...grid('A', 0, [-80, -82, -81]), { id: 'w', v: -88, x: 5, y: 0, src: 'A' }], [{ id: 'A', label: 'ANT-1', x: 2, y: 0 }], { system: 'das' });
    const raise = near.advice.find((a) => a.kind === 'raise')!; expect(raise.text).toMatch(/Turn ANT-1 up about \+5 dB/);
    const far = analyzeBalance([...grid('A', 0, [-70, -72]), { id: 'w', v: -100, x: 60, y: 0 }], [{ id: 'A', label: 'ANT-1', x: 0, y: 0 }], { system: 'das', fmtLen: (m) => `${Math.round(m)} m` });
    const add = far.advice.find((a) => a.kind === 'add')!; expect(add.text).toMatch(/another DAS antenna/); expect(add.text).toMatch(/60 m right of ANT-1/);
  });

  it('flags spots that are too strong and keeps critical areas first for ERCES', () => {
    const r = analyzeBalance([{ id: 'h', v: -35, x: 0, y: 0, src: 'A' }, { id: 'c', v: -99, x: 4, y: 0, src: 'A', critical: true }, { id: 'g', v: -80, x: 2, y: 0, src: 'A' }],
      [{ id: 'A', label: 'ANT-1', x: 0, y: 0 }], { system: 'erces' });
    expect(kinds(r)).toContain('lower'); expect(kinds(r)).toContain('code');
    expect(r.advice.find((a) => a.kind === 'code')!.tone).toBe('bad');
  });

  it('spots a fault common to the whole system when every pin is far below the design', () => {
    const pts = [...grid('A', 0, [-90, -92, -91], -78), ...grid('B', 10, [-93, -91, -92], -79)];
    const r = analyzeBalance(pts, [{ id: 'A', label: 'ANT-1', x: 1, y: 0 }, { id: 'B', label: 'ANT-2', x: 11, y: 0 }], { system: 'das' });
    const m = r.advice.find((a) => a.kind === 'model')!; expect(m.tone).toBe('bad'); expect(m.text).toMatch(/connector/);
    expect(kinds(r)).not.toContain('raise'); // the common fault comes first
  });

  it('finds one device weaker than designed while the others match', () => {
    const pts = [...grid('A', 0, [-70, -71, -69], -70), ...grid('B', 10, [-71, -70, -70], -70), ...grid('C', 20, [-82, -83, -81], -70)];
    const src = ['A', 'B', 'C'].map((id, i) => ({ id, label: `ANT-${i + 1}`, x: i * 10 + 1, y: 0 }));
    const r = analyzeBalance(pts, src, { system: 'das' });
    expect(r.advice.find((a) => a.kind === 'device')?.text).toMatch(/ANT-3 is about 12 dB weaker/);
  });

  it('gives tilt advice outdoors when far readings are weak and near ones fine', () => {
    const pts: BPoint[] = [];
    for (let i = 0; i < 6; i++) pts.push({ id: `n${i}`, v: -70, x: 200 + i * 50, y: 0 });
    for (let i = 0; i < 6; i++) pts.push({ id: `f${i}`, v: -104, x: 6000 + i * 200, y: 0 });
    const r = analyzeBalance(pts, [{ id: 'S', label: 'Site A', x: 0, y: 0 }], { system: 'rf', outdoor: true });
    expect(r.advice.find((a) => a.kind === 'tilt')?.text).toMatch(/Reduce the antenna's downtilt/);
  });

  it('speaks speaker taps for sound systems and light ratios for cameras', () => {
    expect(changeText(3, 'dba', 'paging')).toMatch(/1 tap step up/);
    expect(changeText(-6, 'dba', 'firealarm')).toMatch(/2 tap steps down.*high \/ low/);
    expect(changeText(3, 'lux', 'cctv')).toMatch(/2× more light/);
    const r = analyzeBalance([...grid('A', 0, [80, 78, 79]), ...grid('B', 10, [66, 67, 65])], [{ id: 'A', label: 'SPK-1', x: 1, y: 0 }, { id: 'B', label: 'SPK-2', x: 11, y: 0 }], { system: 'sound' });
    expect(r.advice.find((a) => a.kind === 'balance')!.text).toMatch(/tap step/);
    const l = analyzeBalance(grid('L', 0, [10, 12, 80]), [{ id: 'L', label: 'Light 1', x: 0, y: 0 }], { system: 'cctv' });
    expect(l.cold.length).toBe(2); expect(l.min).toBeCloseTo(10, 5);
  });

  it('warns about NFPA 72 110 dBA maximum', () => {
    const r = analyzeBalance(grid('A', 0, [112, 90, 85]), [{ id: 'A', label: 'H-1', x: 0, y: 0 }], { system: 'firealarm' });
    expect(r.advice.some((a) => a.kind === 'code' && /110 dBA/.test(a.text))).toBe(true);
  });

  it('helpers: directions, nearest source, grid sampling, local metres, colours', () => {
    expect(dirWord(10, 0, false)).toBe('right'); expect(dirWord(0, -10, true)).toBe('north'); expect(dirWord(-5, 5, true)).toBe('south-west');
    const a = assignSources([{ id: 'p', v: -70, x: 9, y: 0, floor: 1 }], [{ id: 'A', label: 'A', x: 8, y: 0, floor: 0 }, { id: 'B', label: 'B', x: 0, y: 0, floor: 1 }]);
    expect(a[0].src).toBe('B');
    const g = { n: 2, north: 1, south: 0, east: 1, west: 0, rssi: new Float32Array([1, 2, 3, 4]) };
    expect(sampleLatLonGrid(g, 0.9, 0.1)).toBe(1); expect(sampleLatLonGrid(g, 0.1, 0.9)).toBe(4); expect(sampleLatLonGrid(g, 2, 0)).toBeNaN();
    const m = toLocalM({ lat: 35.6, lon: -82.55 }, { lat: 35.601, lon: -82.55 }); expect(m.y).toBeCloseTo(-110.57, 1); expect(m.x).toBeCloseTo(0, 5);
    expect(pinColor(-100, -95, -40, 'dbm')).toBe('#d32f2f'); expect(pinColor(-30, -95, -40, 'dbm')).toBe('#7b1fa2');
  });

  it('has a norm for every system in the app', () => {
    for (const s of SYSTEMS) if (!['design', 'service', 'pm', 'solar'].includes(s.id)) expect(PIN_NORMS[s.id] ?? null, s.id).not.toBeNull();
    expect(normFor('nope').qty).toBe('dbm');
  });
});

describe('reading pins in the project', () => {
  it('self-repair keeps good pins and drops damaged ones', () => {
    const p = { ...defaultProject(), readingPins: [{ id: 'a', at: 'x', map: 'indoor', system: 'das', qty: 'dbm', v: -80, x: 1, y: 2 }, { id: 'b', v: 'bad', x: 1, y: 1 }, null], pinTargets: 'oops' };
    const r = repairProject(p);
    expect(r.project.readingPins!.length).toBe(1); expect(r.project.readingPins![0].v).toBe(-80); expect(r.project.pinTargets).toBeUndefined();
  });

  it('building models now have sound-level heat maps for speakers and horns', () => {
    const p = defaultProject();
    p.meta.projectType = 'custom'; p.meta.subSystems = ['paging', 'firealarm', 'wifi', 'massnotif'];
    const s = buildModel(p);
    const spl = s.heat.filter((h) => h.qty === 'dba');
    expect(spl.length).toBeGreaterThan(0);
    expect(new Set(spl.map((h) => h.layer))).toEqual(new Set(['paging:heat', 'massnotif:heat']));
    p.meta.subSystems = ['firealarm']; expect(buildModel(p).heat.some((h) => h.layer === 'firealarm:heat' && h.qty === 'dba')).toBe(true);
    for (const h of spl) { const v = [...h.v].filter(Number.isFinite); expect(Math.max(...v)).toBeGreaterThan(70); expect(Math.max(...v)).toBeLessThan(120); }
  });
});
