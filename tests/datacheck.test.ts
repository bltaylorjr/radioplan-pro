// 1.5.49: input checks, blank-value handling, project data check, tool on/off settings, and calculator outputs
// verified against hand-worked reference values.
import { describe, it, expect } from 'vitest';
import { checkValue, suggestFix } from '../src/engine/validate';
import { LV_CALCS, lvCalc, checkCalc, runCalc, OHM_KFT } from '../src/data/lvcalcs';
import { checkProject } from '../src/engine/datacheck';
import { defaultProject } from '../src/defaults';
import { setHiddenTools, hiddenTools, turnOnNeeded, applyTypeTools, setAutoHideTools, toolNotice, clearToolNotice, neededTools } from '../src/engine/toolPrefs';
import { PAGE_GROUPS, ALWAYS_PAGES } from '../src/data/customPages';
import { SYSTEMS, usesRadioFields } from '../src/data/systems';
import { WORKFLOW_LABELS } from '../src/data/pageLabels';
import { LV_RESISTANCE_OHM_PER_KFT } from '../src/engine/electrical';
import * as K from '../src/engine/calcs';
import { fsplDb } from '../src/engine/rf';
import { alarmBatteryAh } from '../src/engine/alarm';

const val = (out: { label: string; value: string }[] | null, label: string) => out!.find((o) => o.label.startsWith(label))!.value;

describe('entry checks', () => {
  it('flags out-of-range entries with the reason and a fix', () => {
    const e = checkValue(-150, { min: 0, max: 2000, label: 'Height', unit: 'ft' })!;
    expect(e.msg).toBe('Height must be between 0 and 2,000 ft. You typed -150 ft.');
    expect(e.fix).toMatch(/Remove the minus sign \(150\)/);
    expect(suggestFix(-150, { min: 0, max: 2000 })).toBe(150);
    // A slipped decimal point: 1500 when the limit is 0–200 → 150.
    expect(suggestFix(1500, { min: 0, max: 200 })).toBe(150);
    expect(checkValue(1500, { min: 0, max: 200, unit: '%' })!.fix).toMatch(/Did you mean 150 %/);
    expect(checkValue(2.5, { min: 0, max: 10, integer: true, label: 'Rods' })!.msg).toMatch(/whole number/);
    expect(checkValue(50, { min: 0, max: 100 })).toBeNull();
  });
  it('treats blank as empty, never as zero', () => {
    expect(checkValue(null, { required: true, label: 'Load' })!.msg).toBe('Load is empty.');
    expect(checkValue(null, { label: 'Load' })).toBeNull();
    expect(checkValue(NaN, { required: true })!.level).toBe('bad');
  });
});

describe('calculator checks', () => {
  it('every calculator passes its own checks with its default values', () => {
    for (const c of LV_CALCS) {
      const r = checkCalc(c);
      expect(r.issues.filter((i) => i.level === 'bad'), c.id).toEqual([]);
      expect(r.out, c.id).not.toBeNull();
    }
  });
  it('asks for blank required boxes instead of using zero', () => {
    const r = checkCalc(lvCalc('lv-drop')!, { ft: null });
    expect(r.out).toBeNull();
    expect(r.missing).toEqual(['One-way length']);
  });
  it('skips blank optional boxes', () => {
    const r = checkCalc(lvCalc('fiber-budget')!, { meas: null });
    expect(r.out!.some((o) => o.label === 'Result')).toBe(false);
    expect(val(r.out, 'Allowed loss')).toBe('2.55');
    const d = checkCalc(lvCalc('db-sum')!, { a: 85, b: 85, c: null });
    expect(parseFloat(val(d.out, 'Combined'))).toBeCloseTo(88, 0);
  });
  it('blocks results for wrong entries and explains them', () => {
    const r = checkCalc(lvCalc('cable-boxes')!, { waste: 1000 });
    expect(r.out).toBeNull();
    expect(r.issues[0].msg).toMatch(/Waste must be between 0 and 50 %/);
  });
  it('cross-checks related entries', () => {
    expect(checkCalc(lvCalc('conduit-fill')!, { id: 0.5, od: 0.6 }).issues.some((i) => /wider than the inside/.test(i.msg))).toBe(true);
    expect(checkCalc(lvCalc('lv-drop')!, { v: 12, min: 16 }).out).toBeNull();
    expect(checkCalc(lvCalc('fa-battery')!, { sb: 3, al: 1 }).issues.some((i) => /swapped/.test(i.fix ?? ''))).toBe(true);
    expect(checkCalc(lvCalc('spk-spacing')!, { ceil: 8, ear: 9 }).out).toBeNull();
    expect(checkCalc(lvCalc('callbox')!, { calls: 100, min: 30 }).out).toBeNull();
  });
});

describe('reference values (worked by hand)', () => {
  it('low-voltage calculators', () => {
    // 2 × 200 ft × 1.5 A × 7.77 Ω/kft (NEC Ch. 9 Table 8, #18 solid) = 4.66 V
    expect(val(runCalc(lvCalc('lv-drop')!), 'Voltage drop')).toBe('4.66');
    // (0.45 A × 24 h + 2.2 A × 5/60 h) × 1.2 = 13.18 Ah → 18 Ah battery
    const b = runCalc(lvCalc('fa-battery')!);
    expect(val(b, 'Required')).toBe('13.2'); expect(val(b, 'Next standard')).toBe('18');
    // 48 × (150 + 15) × 1.1 = 8,712 ft; floor(1000 / 181.5) = 5 per box; ceil(48 / 5) = 10 boxes
    const c = runCalc(lvCalc('cable-boxes')!);
    expect(val(c, 'Total cable')).toBe('8,712'); expect(val(c, 'Drops per box')).toBe('5'); expect(val(c, 'Boxes')).toBe('10');
    // π(1.049/2)² = 0.864 sq in; 40% / π(0.125)² → 7 cables
    expect(val(runCalc(lvCalc('conduit-fill')!), 'Cables that fit')).toBe('7');
    // 16 × 15.4 W = 246.4 W = 67% of 370 W
    const poe = runCalc(lvCalc('poe-budget')!);
    expect(val(poe, 'Total')).toBe('246.4'); expect(val(poe, 'Budget used')).toBe('67');
    // 300 ft / 5 ft + 1 = 61 supports
    expect(val(runCalc(lvCalc('jhook')!), 'Supports')).toBe('61');
    // 16 cams × 4 Mb/s × 86,400 s × 30 d / 8 / 10⁶ = 20.74 TB
    expect(val(runCalc(lvCalc('cctv-storage')!), 'Storage needed')).toBe('20.74');
    // 8 devices × 450 mA = 3.6 A; × 1.25 = 4.5 A
    expect(val(runCalc(lvCalc('psu')!), 'Supply rating')).toBe('4.5');
  });
  it('wire resistance agrees everywhere (NEC Chapter 9 Table 8)', () => {
    for (const a of [18, 16, 14, 12, 10]) expect(OHM_KFT[a], `#${a}`).toBeCloseTo(LV_RESISTANCE_OHM_PER_KFT[String(a)], 2);
  });
  it('RF and electrical formulas', () => {
    expect(fsplDb(100, 1)).toBeCloseTo(72.45, 2); // 32.45 + 20 log 100 + 20 log 1
    expect(K.thermalNoiseDbm(1)).toBeCloseTo(-173.98, 1); // kTB at 290 K, 1 Hz
    expect(K.vswrCalc(1.5).returnLossDb).toBeCloseTo(13.98, 2);
    expect(K.vswrCalc(2).mismatchLossDb).toBeCloseTo(0.512, 2);
    expect(K.dbmToMw(30)).toBeCloseTo(1000, 6);
    expect(K.erlangB(5, 2)).toBeCloseTo(0.0367, 3); // Erlang B table
    expect(K.groundRodOhms(100, 2.4384, 0.015875)).toBeCloseTo(39.9, 0); // 8 ft × 5/8 in rod, 100 Ω·m (Dwight)
    expect(K.voltageDrop(10, 100, '12', 120, '1ph').vd).toBeCloseTo(3.86, 2); // 2 × 100 × 10 × 1.93 / 1000
    const o = K.ohmsLaw(12, 2, null, null)!; expect(o.r).toBe(6); expect(o.p).toBe(24);
  });
  it('blank alarm device entries are skipped, not NaN', () => {
    const r = alarmBatteryAh({ devices: [{ name: 'a', qty: 10, standbyMa: 1, alarmMa: 100 }, { name: 'blank', qty: NaN, standbyMa: NaN, alarmMa: NaN }], standbyHours: 24, alarmMinutes: 5, safetyFactor: 1 });
    expect(r.standbyA).toBeCloseTo(0.01, 6); expect(r.alarmA).toBeCloseTo(1, 6);
  });
});

describe('project data check', () => {
  it('a new project has no errors', () => {
    expect(checkProject(defaultProject()).filter((i) => i.level === 'bad')).toEqual([]);
  });
  it('finds a missing minus sign on longitude, with the fix', () => {
    const p = defaultProject(); p.sites[0].lat = 35.6; p.sites[0].lon = 82.55;
    const i = checkProject(p).find((x) => /east of Greenwich/.test(x.msg))!;
    expect(i.level).toBe('bad'); expect(i.fix).toMatch(/-82.55/); expect(i.page).toBe('sites');
  });
  it('cross-checks antenna height, sensitivity and fire alarm times', () => {
    const p = defaultProject(); p.sites[0].structureHeightM = 30; p.sites[0].antennaAglM = 60; p.sites[0].onBuilding = false;
    p.radio.txPowerDbm = -25; p.radio.rxSensitivityDbm = -21; p.alarm.enabled = true; p.alarm.standbyHours = 4;
    p.alarm.devices = [{ name: 'Horn strobe', qty: NaN, standbyMa: 0, alarmMa: 120 }];
    const msgs = checkProject(p).map((x) => x.msg).join('\n');
    expect(msgs).toMatch(/higher than the top of the structure/);
    expect(msgs).toMatch(/not lower than the transmit power/);
    expect(msgs).toMatch(/Standby time is 4 h/);
    expect(msgs).toMatch(/Quantity is not a number|Quantity is empty/);
  });
  it('reports lengths in feet for imperial users', () => {
    const p = defaultProject(); p.sites[0].antennaAglM = -10;
    expect(checkProject(p, { imperial: true }).find((x) => /Antenna height/.test(x.msg))!.msg).toMatch(/ft/);
  });
});

describe('tool on/off settings', () => {
  it('every menu page can be listed, and always-shown pages cannot be hidden', () => {
    expect(PAGE_GROUPS.flatMap(([, x]) => x)).toContain('settings');
    expect(WORKFLOW_LABELS.settings).toBe('User Settings');
    setHiddenTools(['company', 'settings', 'theory']);
    expect(hiddenTools()).toEqual(['theory']);
    for (const a of ALWAYS_PAGES) expect(hiddenTools()).not.toContain(a);
  });
  it('picking a project type turns on the hidden tools it needs and says which', () => {
    setHiddenTools(['alarm', 'calculators', 'theory', 'wifi']);
    clearToolNotice();
    const on = turnOnNeeded({ projectType: 'firealarm', subSystems: ['wifi'] });
    expect(on.sort()).toEqual(['alarm', 'calculators', 'wifi']);
    expect(hiddenTools()).toEqual(['theory']);
    expect(toolNotice()!.pages.sort()).toEqual(['alarm', 'calculators', 'wifi']);
    expect(toolNotice()!.why).toMatch(/Fire Alarm/);
    // Nothing hidden that the job needs: no notice.
    clearToolNotice(); expect(turnOnNeeded({ projectType: 'firealarm' })).toEqual([]); expect(toolNotice()).toBeNull();
    setHiddenTools([]);
  });
  it('every system needs only real pages', () => {
    for (const s of SYSTEMS) for (const pg of neededTools({ projectType: s.id })) expect(WORKFLOW_LABELS[pg], `${s.id} → ${pg}`).toBeTruthy();
  });
  it('a new project type hides the tools it does not use and keeps the common ones', () => {
    setHiddenTools(['alarm']); setAutoHideTools(true); clearToolNotice();
    const r = applyTypeTools({ projectType: 'firealarm' });
    expect(r.on).toEqual(['alarm']);
    expect(r.hid).toContain('coverage'); expect(r.hid).toContain('radioref');
    for (const keep of ['company', 'settings', 'alarm', 'materials', 'compliance', 'calculators']) expect(hiddenTools()).not.toContain(keep);
    expect(toolNotice()!.hid).toEqual(r.hid);
    setAutoHideTools(false); setHiddenTools([]);
    expect(applyTypeTools({ projectType: 'firealarm' }).hid).toEqual([]);
    setAutoHideTools(true); setHiddenTools([]);
  });
  it('tower and antenna fields show only for jobs that use them', () => {
    expect(usesRadioFields({})).toBe(true);
    expect(usesRadioFields({ projectType: 'firealarm' })).toBe(false);
    expect(usesRadioFields({ projectType: 'firealarm', subSystems: ['erces'] })).toBe(true);
  });
});
