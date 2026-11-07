import { describe, it, expect } from 'vitest';
import { defaultProject } from '../src/defaults';
import { evaluateCompliance } from '../src/compliance/rules';
import { buildBom } from '../src/engine/materials';
import { designLink } from '../src/engine/design';

const ids = (p: ReturnType<typeof defaultProject>) => evaluateCompliance({ project: p }).filter((f) => f.severity === 'violation').map((f) => f.id);

describe('compliance rules', () => {
  it('default project has no violations', () => expect(ids(defaultProject())).toEqual([]));
  it('missing surge protector cites NEC 810.20', () => { const p = defaultProject(); p.grounding.surgeProtector = false; expect(ids(p)).toContain('nec-810-20'); });
  it('#12 bonding conductor cites 810.21(H)', () => { const p = defaultProject(); p.grounding.bondingConductorAwg = '12'; expect(ids(p)).toContain('nec-810-21-h'); });
  it('rods 4 ft apart cites 250.53(A)(3)', () => { const p = defaultProject(); p.grounding.rodSpacingFt = 4; expect(ids(p)).toContain('nec-250-53-a3'); });
  it('FAA notice for 250 ft tower', () => { const p = defaultProject(); p.sites[0].structureHeightM = 76; expect(evaluateCompliance({ project: p }).map((f) => f.id)).toContain('faa-77-9a'); });
  it('NFPA 72 undersized battery', () => { const p = defaultProject(); p.alarm.enabled = true; p.alarm.installedBatteryAh = 2; expect(ids(p)).toContain('nfpa72-battery'); });
  it('ERCES 8 h standby fails IFC 510', () => { const p = defaultProject(); p.erces.enabled = true; p.erces.standbyHours = 8; expect(ids(p)).toContain('ifc-510-standby'); });
  it('solar on building without rapid shutdown', () => { const p = defaultProject(); p.solar.enabled = true; p.solar.dwelling = true; expect(ids(p)).toContain('nec-690-12'); });
  it('every finding carries a code and section', () => {
    const p = defaultProject(); p.solar.enabled = p.alarm.enabled = p.erces.enabled = true; p.grounding.surgeProtector = false;
    for (const f of evaluateCompliance({ project: p })) { expect(f.code).toBeTruthy(); expect(f.section).toBeTruthy(); }
  });
});

describe('materials & link', () => {
  it('BOM feeder length = design + 10%', () => {
    const p = defaultProject(); const f = buildBom(p).find((l) => l.key === 'feeder')!;
    expect(f.qty).toBe(Math.ceil(60 * 3.28084 * 1.1));
  });
  it('override is respected', () => { const p = defaultProject(); p.bomOverrides.rods = 9; expect(buildBom(p).find((l) => l.key === 'rods')!.qty).toBe(9); });
  it('link budget EIRP is consistent', () => { const L = designLink(defaultProject()); expect(L.eirpDbm).toBeCloseTo(47 - L.feederLoss - 0.8 + 8.15, 3); });
});

describe('verified citations', () => {
  it('stamps the adopted NEC edition and provenance', async () => {
    const { defaultProject } = await import('../src/defaults');
    const { evaluateCompliance } = await import('../src/compliance/rules');
    const { necSection, JURISDICTIONS } = await import('../src/compliance/jurisdictions');
    const p = structuredClone(defaultProject());
    p.meta.state = 'NC';
    const nc = evaluateCompliance({ project: p });
    for (const f of nc.filter((x) => x.code.startsWith('NEC'))) expect(f.code).toMatch(/^NEC 2020/);
    p.meta.state = 'TN';
    const tn = evaluateCompliance({ project: p });
    expect(tn.some((f) => f.id === 'jur-unconfirmed')).toBe(false);
    for (const f of tn.filter((x) => x.code.startsWith('NEC'))) expect(f.code).toMatch(/^NEC 2017/);
    p.meta.county = 'Knox County';
    expect(evaluateCompliance({ project: p }).find((f) => f.id === 'jur-local')?.title).toMatch(/exempt/);
    expect(necSection('706.15', '2017')).toBe('706.7');
    expect(necSection('706.15', '2020')).toBe('706.15');
    expect(JURISDICTIONS.GA.necEdition).toBe('2023');
    for (const f of nc) expect(f.section).not.toContain('810.58(C)');
  });
});
