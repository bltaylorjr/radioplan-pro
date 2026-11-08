import { describe, it, expect } from 'vitest';
import { defaultProject } from '../src/defaults';
import { autoDesign, defaultInputs } from '../src/engine/autodesign';
import { buildBom } from '../src/engine/materials';
import { repairProject } from '../src/engine/repair';
import { LOCAL_CODES, localCodes } from '../src/compliance/citycodes';
import { codesFor } from '../src/compliance/codesets';
import { CONTACTS, RESOURCES, atPlace, mergeMine } from '../src/data/contacts';

describe('auto-design', () => {
  it('lays out devices and recommends equipment for the project systems', () => {
    const p = defaultProject(); p.meta.projectType = 'firealarm'; p.meta.subSystems = ['cctv', 'access', 'cabling'];
    const r = autoDesign(p, defaultInputs());
    expect(r.devices.some((d) => d.kind === 'smoke')).toBe(true);
    expect(r.devices.some((d) => d.kind === 'camera')).toBe(true);
    expect(r.equipment.find((e) => /control unit/i.test(e.item))).toBeTruthy();
    expect(r.materials.every((m) => m.qty > 0)).toBe(true);
    expect(r.trs.length).toBeGreaterThan(0);
  });
  it('adds applied auto-design lines to the materials list', () => {
    const p = defaultProject(); p.meta.projectType = 'cctv';
    expect(buildBom(defaultProject()).some((l) => l.category.startsWith('Auto-design'))).toBe(false);
    expect(buildBom(p).some((l) => l.category.startsWith('Auto-design'))).toBe(true);
    p.autoDesign = { ...defaultInputs(), applied: false };
    expect(buildBom(p).some((l) => l.category.startsWith('Auto-design'))).toBe(false);
    p.autoDesign = { ...defaultInputs(), applied: true };
    expect(buildBom(p).some((l) => l.category.startsWith('Auto-design'))).toBe(true);
  });
  it('recommends nothing when no low-voltage system is picked', () => {
    expect(autoDesign(defaultProject(), defaultInputs()).equipment.length).toBe(0);
  });
});

describe('self-repair', () => {
  it('opens damaged project data', () => {
    const bad = { meta: { name: 'X', state: 'TN' }, radio: { fMHz: 'abc' }, sites: [{ id: 'A', lat: 36, lon: -86 }, { id: 'A', lat: 36.1, lon: -86.1 }, { id: 'C', lat: 'x', lon: null }], tests: 'oops', alarm: null };
    const { project, fixes } = repairProject(bad);
    expect(project.radio.fMHz).toBe(defaultProject().radio.fMHz);
    expect(project.meta.name).toBe('X');
    expect(project.sites.length).toBe(2);
    expect(new Set(project.sites.map((s) => s.id)).size).toBe(2);
    expect(Array.isArray(project.tests)).toBe(true);
    expect(project.alarm.devices.length).toBeGreaterThan(0);
    expect(fixes.length).toBeGreaterThan(2);
  });
  it('leaves a healthy project alone', () => {
    expect(repairProject(defaultProject()).fixes).toEqual([]);
  });
  it('turns junk into a new project', () => {
    expect(repairProject('garbage').project.sites.length).toBe(2);
  });
});

describe('city and county codes', () => {
  it('every local list has a source, codes and a known state', () => {
    for (const l of LOCAL_CODES) { expect(l.src).toMatch(/^https:\/\//); expect(l.codes.length).toBeGreaterThan(0); expect(['NC', 'SC', 'GA', 'TN']).toContain(l.state); }
  });
  it('picks the city list before the county list', () => {
    expect(localCodes('TN', 'Knox County', 'Knoxville')?.id).toBe('tn-knoxville');
    expect(localCodes('TN', 'Knox County', 'Powell')?.id).toBe('tn-knox');
    expect(localCodes('TN', 'Knox County')?.id).toBe('tn-knox');
    expect(localCodes('NC', 'Wake County', 'Raleigh')).toBeUndefined();
    expect(codesFor('GA', 'Fulton County', 'Atlanta').localSet?.codes.some((c) => c.code.includes('2023 NEC'))).toBe(true);
  });
});

describe('contacts and web resources', () => {
  it('built-in contacts come from official pages with a phone or web address', () => {
    for (const c of CONTACTS) { expect(c.checked).toBeTruthy(); expect(c.phone || c.url).toBeTruthy(); if (c.url) expect(c.url).toMatch(/^https:\/\//); }
    expect(new Set(CONTACTS.map((c) => c.id)).size).toBe(CONTACTS.length);
    expect(new Set(RESOURCES.map((r) => r.id)).size).toBe(RESOURCES.length);
  });
  it('shows state, county and city entries for a place', () => {
    const l = atPlace(CONTACTS, 'TN', 'Knox County', 'Knoxville').map((c) => c.id);
    expect(l).toContain('tn-sfmo'); expect(l).toContain('tn-knox-codes'); expect(l).toContain('tn-knoxville-pri');
    expect(l).not.toContain('tn-nashville-codes'); expect(l).not.toContain('sc-bcc');
  });
  it('edited copies replace built-in entries and removed ones hide', () => {
    const m = mergeMine(CONTACTS, [{ ...CONTACTS[0], id: 'x', phone: '1', replaces: CONTACTS[0].id }], [CONTACTS[1].id]);
    expect(m.find((c) => c.id === CONTACTS[0].id)).toBeUndefined();
    expect(m.find((c) => c.id === CONTACTS[1].id)).toBeUndefined();
    expect(m.find((c) => c.id === 'x')?.mine).toBe(true);
  });
});

import { HELP } from '../src/help/content';
import { WORKFLOW_LABELS } from '../src/data/pageLabels';
describe('help', () => {
  it('every page in the menu has its own help topic', () => {
    const missing = Object.keys(WORKFLOW_LABELS).filter((id) => !HELP.some((h) => h.page === id));
    expect(missing).toEqual([]);
  });
  it('topic ids are unique', () => { expect(new Set(HELP.map((h) => h.id)).size).toBe(HELP.length); });
});
