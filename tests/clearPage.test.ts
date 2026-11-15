import { describe, it, expect } from 'vitest';
import { defaultProject } from '../src/defaults';
import { clearPage, undoClear, pageHasEntries, PAGE_CLEAR } from '../src/engine/clearPage';
import { WORKFLOW_IDS } from './workflowIds';

const filled = () => {
  const p = structuredClone(defaultProject());
  p.meta.name = 'Mission Hospital'; p.meta.siteAddress = '509 Biltmore Ave'; p.company.name = 'Taylor LV';
  p.meta.projectType = 'fire'; p.alarm.enabled = true; p.alarm.devices = [{ name: 'Horn', qty: 3, standbyMa: 0, alarmMa: 100 }];
  p.radio.fMHz = 800; p.radio.kFactor = 1; p.radio.mechTiltDeg = 4; p.fieldNotes = [{ id: 'n', at: '', title: 'Roof', text: '', category: '', photos: [], tags: [], author: '', followUp: false, done: false }];
  p.sites[0].tx = { enabled: true, fMHz: 460, txPowerDbm: 40, antennaId: 'x', azimuthDeg: 0, tiltDeg: 0, lossDb: 2, channel: '1' };
  p.checklists = { 'survey:a': true, 'testing:b': true }; p.checklistExtra = [{ id: '1', list: 'survey', text: 'Mine' }, { id: '2', list: 'testing', text: 'Other' }];
  return p;
};

describe('clear all fields on one page', () => {
  it('clears only the fire alarm page', () => {
    const p = filled(); const c = clearPage('alarm', p);
    expect(c.alarm).toEqual({ ...defaultProject().alarm, devices: [] });
    expect(c.meta.name).toBe('Mission Hospital'); expect(c.radio.fMHz).toBe(800); expect(c.fieldNotes).toHaveLength(1);
  });
  it('clears the company page but keeps project type and other pages', () => {
    const c = clearPage('company', filled());
    expect(c.meta.name).toBe('New project'); expect(c.meta.siteAddress).toBeUndefined(); expect(c.company.name).toBe('');
    expect(c.meta.city).toBe('Asheville'); expect(c.meta.projectType).toBe('fire'); expect(c.alarm.enabled).toBe(true);
  });
  it('splits the radio settings between pages', () => {
    const p = filled();
    expect(clearPage('equipment', p).radio).toMatchObject({ fMHz: 460, kFactor: 1, mechTiltDeg: 4 });
    expect(clearPage('path', p).radio).toMatchObject({ fMHz: 800, kFactor: 4 / 3, mechTiltDeg: 4 });
    expect(clearPage('optimize', p).radio).toMatchObject({ fMHz: 800, kFactor: 1, mechTiltDeg: 0 });
  });
  it('clears that page\'s checklist only', () => {
    const c = clearPage('fieldnotes', filled());
    expect(c.fieldNotes).toBeUndefined();
    expect(c.checklists).toEqual({ 'testing:b': true });
    expect(c.checklistExtra?.map((x) => x.list)).toEqual(['testing']);
  });
  it('removes site transmitters on Multi-site but keeps the sites', () => {
    const c = clearPage('network', filled());
    expect(c.sites).toHaveLength(2); expect(c.sites[0].tx).toBeUndefined();
  });
  it('undo puts the page back and keeps later edits on other pages', () => {
    for (const page of Object.keys(PAGE_CLEAR)) {
      const p = filled(); const c = clearPage(page, p);
      c.meta.jurisdictionNotes = page === 'company' ? c.meta.jurisdictionNotes : 'edited later';
      const u = undoClear(page, c, p); u.checklistExtra?.sort((a, b) => a.id.localeCompare(b.id));
      const expected = structuredClone(p); if (page !== 'company') expected.meta.jurisdictionNotes = 'edited later';
      expect(JSON.parse(JSON.stringify(u)), page).toEqual(JSON.parse(JSON.stringify(expected)));
    }
  });
  it('never touches the projects library data kept outside the page', () => {
    for (const page of Object.keys(PAGE_CLEAR)) {
      const c = clearPage(page, filled());
      expect(c.version).toBe(1); expect(c.settings).toEqual(defaultProject().settings);
    }
  });
  it('knows when a page has nothing to clear', () => {
    expect(pageHasEntries('grounding', defaultProject())).toBe(false);
    expect(pageHasEntries('alarm', filled())).toBe(true); expect(pageHasEntries('alarm', clearPage('alarm', filled()))).toBe(false);
    expect(pageHasEntries('radioref', filled())).toBe(false);
  });
  it('only names pages that exist', () => {
    for (const page of Object.keys(PAGE_CLEAR)) expect(WORKFLOW_IDS).toContain(page);
  });
});

describe('reset the whole project', () => {
  it('clears every page but keeps settings, sync and the saved company', async () => {
    const { resetProject } = await import('../src/engine/clearPage');
    const p = filled(); p.settings.units = 'km'; p.sync = { projectId: 'x', deviceId: 'd', deviceName: 'PC', sections: {}, items: {}, tombstones: {}, peers: {} };
    const r = resetProject(p, { company: { ...p.company, name: 'Saved Co' }, savedAt: '' });
    expect(r.meta.name).toBe('New project'); expect(r.fieldNotes).toBeUndefined(); expect(r.alarm.devices).toEqual([]);
    expect(r.sites[0].tx).toBeUndefined(); expect(r.checklists).toBeUndefined(); expect(r.radio.fMHz).toBe(460);
    expect(r.settings.units).toBe('km'); expect(r.sync?.projectId).toBe('x'); expect(r.company.name).toBe('Saved Co');
  });
});
