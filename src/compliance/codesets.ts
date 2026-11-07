// Adopted construction codes by state, and the local rules that decide which of them apply at a
// given county or city. Checked against official state sources on CHECKED_ON (see each entry's `src`).
// status: 'verified' = read on an official state page; 'secondary' = a third-party page or the code
// book's own referenced-standards list (not re-checked); 'confirm' = sources disagree. A licensed PE and
// the AHJ must confirm every edition before design or permitting.
import type { StateCode } from '../types';
import { CHECKED_ON } from './jurisdictions';

export type CodeCat = 'Administration' | 'Building' | 'Residential' | 'Fire' | 'Life safety' | 'Fire alarm' | 'Fire sprinkler' | 'Emergency responder radio'
  | 'Electrical' | 'Plumbing' | 'Mechanical' | 'Fuel gas' | 'Energy' | 'Existing building' | 'Accessibility' | 'Property maintenance' | 'Pools & spas' | 'Other';
export type CodeStatus = 'verified' | 'secondary' | 'confirm';
export interface CodeEntry { cat: CodeCat; code: string; effective?: string; status: CodeStatus; note?: string; src?: string; permissive?: boolean }
export interface Upcoming { title: string; effective: string; codes: string[]; note: string; src: string }
export interface StateCodeSet {
  state: StateCode; name: string; summary: string; current: CodeEntry[]; upcoming: Upcoming[];
  enforcement: string[]; localAmendments: string; ahj: string; sources: string[];
}

const NC_SRC = { licensing: 'https://nclicensing.org/wp-content/uploads/2026/05/2026-06-01-Code-Update.pdf', osfm: 'https://www.ncosfm.gov/letter-re-2024-state-building-code-effective-date/open', elec: 'https://www.ncosfm.gov/codes/state-electrical-division/state-electrical-code-and-interpretations', rimkus: 'https://rimkus.com/article/north-carolina-building-code/', current: 'https://www.ncosfm.gov/codes/codes-current-and-past' };
const SC_SRC = { llr: 'https://llr.sc.gov/bcc/PDFfiles/Building%20Codes%20in%20Effect%20for%20South%20Carolina%20Final.pdf', icc: 'https://www.icc-nta.org/code-update/south-carolina-adopts-new-building-codes/', gvl: 'https://www.greenvillecounty.org/buildingsafety/forms/CurrentCodeListICC.pdf', bcc: 'https://llr.sc.gov/bcc/BCAdoption.aspx' };
const GA_SRC = { cur: 'https://dca.georgia.gov/community-assistance/construction-codes/current-state-minimum-codes-construction', ann: 'https://dca.georgia.gov/announcement/2025-12-09/new-codes-jan-2026', mp: 'https://dca.georgia.gov/community-assistance/construction-codes/mandatory-and-permissive-state-codes', enf: 'https://dca.georgia.gov/community-assistance/construction-codes/enforcement-state-minimum-codes', grey: 'https://dca.georgia.gov/document/document/grey-sheet-ib-codes-info-sheetpdf/download' };
const TN_SRC = { hist: 'https://www.tn.gov/commerce/fire/codes-enforcement/history.html', ex: 'https://www.tn.gov/commerce/fire/codes-enforcement/exempt-jurisdictions.html', enf: 'https://www.tn.gov/commerce/fire/codes-enforcement.html', mtas: 'https://www.mtas.tennessee.edu/reference/statewide-building-standards' };
const REF_NOTE = 'Edition comes from the referenced-standards chapter of the adopted fire code, not from a state page. Confirm with the fire marshal.';

export const CODE_SETS: Record<StateCode, StateCodeSet> = {
  NC: {
    state: 'NC', name: 'North Carolina',
    summary: 'The 2018 NC State Building Code is in force statewide. The 2024 NC code has no effective date yet (earliest May 1, 2027).',
    current: [
      { cat: 'Administration', code: '2018 NC Administrative Code and Policies', status: 'verified', src: NC_SRC.licensing },
      { cat: 'Building', code: '2018 NC Building Code', effective: '2019-01-01', status: 'verified', note: 'In force per OSFM (Mar 31, 2025) and the NC Licensing Board (Jun 1, 2026). Effective date from a secondary source.', src: NC_SRC.osfm },
      { cat: 'Residential', code: '2018 NC Residential Code (one- and two-family dwellings, townhouses)', effective: '2019-01-01', status: 'verified', src: NC_SRC.licensing },
      { cat: 'Fire', code: '2018 NC Fire Code', effective: '2019-01-01', status: 'verified', note: 'ERCES requirements are in its Section 510.', src: NC_SRC.osfm },
      { cat: 'Fire alarm', code: 'NFPA 72, 2013 edition (referenced by the 2018 NC Fire Code / 2015 IFC)', status: 'secondary', note: REF_NOTE },
      { cat: 'Fire sprinkler', code: 'NFPA 13 and 13D, 2013 editions; NFPA 25, 2011 edition', status: 'verified', note: 'Editions the NC Licensing Board uses for fire sprinkler exams.', src: NC_SRC.licensing },
      { cat: 'Emergency responder radio', code: '2018 NC Fire Code Section 510 with NFPA 1221', status: 'secondary', note: REF_NOTE },
      { cat: 'Electrical', code: '2020 NC Electrical Code (NEC 2020 with NC amendments)', effective: '2021-11-01', status: 'verified', note: 'Applies to all buildings outside the scope of the 2018 NC Residential Code.', src: NC_SRC.elec },
      { cat: 'Electrical', code: '2017 NC Electrical Code (NEC 2017) for buildings within the 2018 NC Residential Code', status: 'secondary', note: 'One- and two-family dwellings and townhouses.', src: NC_SRC.rimkus },
      { cat: 'Plumbing', code: '2018 NC Plumbing Code', status: 'verified', src: NC_SRC.licensing },
      { cat: 'Mechanical', code: '2018 NC Mechanical Code', status: 'verified', src: NC_SRC.licensing },
      { cat: 'Fuel gas', code: '2018 NC Fuel Gas Code', status: 'verified', src: NC_SRC.licensing },
      { cat: 'Energy', code: '2018 NC Energy Conservation Code', status: 'verified', note: 'The 2024 NC Energy Conservation Code became a permanent rule on Mar 24, 2025, but is not yet the enforced edition.', src: NC_SRC.osfm },
      { cat: 'Existing building', code: '2018 NC Existing Building Code', status: 'verified', src: NC_SRC.rimkus },
      { cat: 'Accessibility', code: '2018 NC Building Code, Chapter 11 (and the ICC A117.1 edition it references)', status: 'secondary', note: 'Confirm the referenced A117.1 edition.' },
    ],
    upcoming: [{ title: '2024 NC State Building Code suite', effective: 'Not set; earliest May 1, 2027', codes: ['2024 NC Administrative, Building, Residential, Existing Building, Energy Conservation, Fire, Fuel Gas, Mechanical and Plumbing Codes', '2023 NC Electrical Code (NEC 2023)'],
      note: 'Takes effect 12 months after the State Fire Marshal certifies it (S.L. 2025-2 §5.12(b)). Until then the owner may ask to use it as an alternate method under Section 102.5 of the 2018 Administrative Code.', src: NC_SRC.licensing }],
    enforcement: [
      'The State Building Code applies statewide. City and county inspection departments do plan review, permits and inspections (G.S. 160D Article 11).',
      'Where a county has no inspection department, check with the county manager; the state does not inspect private buildings.',
      'Appeals of local code decisions go in writing to the State Fire Marshal and the local inspection department within 10 days (G.S. 160D-1127).',
    ],
    localAmendments: 'The sources checked do not say whether local governments may amend the State Building Code. Ask the local inspection department before assuming any local rule.',
    ahj: 'City or county inspections department; the local fire marshal for fire code, fire alarm and ERCES.',
    sources: [NC_SRC.licensing, NC_SRC.osfm, NC_SRC.elec, NC_SRC.rimkus],
  },
  SC: {
    state: 'SC', name: 'South Carolina',
    summary: 'The 2021 SC codes and the 2020 NEC are in force. The 2024 codes and the 2023 NEC take effect January 1, 2027.',
    current: [
      { cat: 'Building', code: '2021 SC Building Code (2021 IBC with SC modifications)', effective: '2023-01-01', status: 'verified', src: SC_SRC.llr },
      { cat: 'Residential', code: '2021 SC Residential Code (2021 IRC with SC modifications, incl. Appendix F and Q)', effective: '2023-01-01', status: 'verified', src: SC_SRC.gvl },
      { cat: 'Fire', code: '2021 SC Fire Code (2021 IFC with SC modifications)', effective: '2023-01-01', status: 'verified', note: 'ERCES requirements are in its Section 510.', src: SC_SRC.llr },
      { cat: 'Fire alarm', code: 'NFPA 72, 2019 edition (referenced by the 2021 IFC)', status: 'secondary', note: REF_NOTE },
      { cat: 'Emergency responder radio', code: '2021 IFC Section 510 with NFPA 1221 (2019)', status: 'secondary', note: REF_NOTE },
      { cat: 'Electrical', code: 'NEC 2020 (NFPA 70) with SC modifications', effective: '2023-01-01', status: 'verified', src: SC_SRC.llr },
      { cat: 'Plumbing', code: '2021 SC Plumbing Code', effective: '2023-01-01', status: 'verified', src: SC_SRC.llr },
      { cat: 'Mechanical', code: '2021 SC Mechanical Code', effective: '2023-01-01', status: 'verified', src: SC_SRC.llr },
      { cat: 'Fuel gas', code: '2021 SC Fuel Gas Code', effective: '2023-01-01', status: 'verified', src: SC_SRC.llr },
      { cat: 'Energy', code: '2009 IECC (by state law, Act 143 of 2012)', effective: '2013-01-01', status: 'verified', note: 'Changes need an act of the legislature.', src: SC_SRC.llr },
      { cat: 'Accessibility', code: 'ICC A117.1, 2026 edition', status: 'secondary', note: 'Per Greenville County and ICC NTA (adopted Sep 18, 2026). Mandatory under S.C. Code §10-5-210.', src: SC_SRC.gvl },
      { cat: 'Existing building', code: '2021 IEBC', status: 'verified', permissive: true, note: 'Only where the city or county adopted it by ordinance.', src: SC_SRC.gvl },
      { cat: 'Property maintenance', code: '2021 IPMC', status: 'verified', permissive: true, note: 'Only where adopted by local ordinance.', src: SC_SRC.gvl },
      { cat: 'Pools & spas', code: '2021 ISPSC', status: 'verified', permissive: true, note: 'Only where adopted by local ordinance.', src: SC_SRC.gvl },
    ],
    upcoming: [{ title: '2024 SC codes', effective: '2027-01-01', codes: ['2024 IBC, IRC, IFC, IPC, IMC and IFGC with SC modifications', '2023 NEC with SC modifications'],
      note: 'Adopted by the SC Building Codes Council on Aug 26, 2025, for enforcement by every municipality and county from Jan 1, 2027. Energy stays at the 2009 IECC.', src: SC_SRC.icc }],
    enforcement: [
      'Mandatory codes must be enforced by every SC municipality and county (S.C. Code §6-9-50).',
      'Permissive codes (IEBC, IPMC, ISPSC) apply only where the local government adopted them by ordinance (§6-9-60).',
      'Code appendices apply only where the Building Codes Council approved them as a local modification.',
    ],
    localAmendments: 'Only modifications approved and listed by the SC Building Codes Council are valid; unapproved local modifications cannot be enforced.',
    ahj: 'City or county building codes department; the local fire marshal and the Office of State Fire Marshal for fire code.',
    sources: [SC_SRC.llr, SC_SRC.icc, SC_SRC.gvl, SC_SRC.bcc],
  },
  GA: {
    state: 'GA', name: 'Georgia',
    summary: 'DCA lists the 2024 I-codes and the 2023 NEC with Georgia amendments as current. A DCA announcement gives Jan 1, 2027 for the 2024 set, so confirm the edition with the AHJ.',
    current: [
      { cat: 'Building', code: '2024 IBC with Georgia Amendments', status: 'confirm', note: 'DCA lists it as current; a DCA announcement says it takes effect Jan 1, 2027.', src: GA_SRC.cur },
      { cat: 'Residential', code: '2024 IRC with Georgia Amendments', status: 'confirm', note: 'Its plumbing, electrical and energy chapters are omitted; the IPC, NEC and IECC apply.', src: GA_SRC.grey },
      { cat: 'Fire', code: '2024 IFC as adopted by the Safety Fire Commissioner', status: 'confirm', note: 'Fire code amendments come from the State Fire Marshal.', src: GA_SRC.cur },
      { cat: 'Life safety', code: 'GA Minimum Fire Safety Standards (Rule 120-3-3) with NFPA 101, 2024 edition', status: 'verified', src: GA_SRC.grey },
      { cat: 'Fire alarm', code: 'NFPA 72 as referenced by NFPA 101 / IFC 2024 (2022 edition)', status: 'secondary', note: REF_NOTE },
      { cat: 'Emergency responder radio', code: '2024 IFC Section 510 with NFPA 1225 (2022)', status: 'secondary', note: REF_NOTE },
      { cat: 'Electrical', code: 'NEC 2023 with 2026 Georgia Amendments', effective: '2025-01-01', status: 'verified', note: 'Some 2026 amendments take effect Jan 1, 2027.', src: GA_SRC.cur },
      { cat: 'Plumbing', code: '2024 IPC with Georgia Amendments', status: 'confirm', src: GA_SRC.cur },
      { cat: 'Mechanical', code: '2024 IMC with Georgia Amendments', status: 'confirm', src: GA_SRC.cur },
      { cat: 'Fuel gas', code: '2024 IFGC with Georgia Amendments', status: 'confirm', src: GA_SRC.cur },
      { cat: 'Energy', code: '2015 IECC with Georgia Supplements and Amendments (2020, 2022, 2023)', status: 'verified', src: GA_SRC.cur },
      { cat: 'Pools & spas', code: '2024 ISPSC with Georgia Amendments', status: 'confirm', src: GA_SRC.cur },
      { cat: 'Accessibility', code: 'Georgia Accessibility Code (Rule 120-3-20) with the 2010 ADA Standards', status: 'verified', src: GA_SRC.grey },
      { cat: 'Existing building', code: '2018 IEBC with 2021 Georgia Amendments', status: 'verified', permissive: true, note: 'Only where the local government adopted it.', src: GA_SRC.mp },
      { cat: 'Property maintenance', code: '2018 IPMC with 2021 Georgia Amendments', status: 'verified', permissive: true, note: 'Only where adopted locally.', src: GA_SRC.mp },
      { cat: 'Other', code: 'National Green Building Standard 2008; Disaster Resilient Building Code appendices', status: 'verified', permissive: true, note: 'Only where adopted locally.', src: GA_SRC.mp },
    ],
    upcoming: [{ title: '2024 Georgia codes (DCA announcement)', effective: '2027-01-01', codes: ['2024 IBC, IRC, IFGC, IMC, IPC and ISPSC with Georgia Amendments', '2024 IFC as adopted by the Safety Fire Commissioner', '2026 Georgia Amendments to the 2023 NEC'],
      note: 'DCA recommends local governments review their local amendments against the 2024 codes.', src: GA_SRC.ann }],
    enforcement: [
      'Mandatory codes apply to all construction in Georgia whether or not the city or county enforces them (O.C.G.A. 8-2-25(a)).',
      'A city or county may choose which mandatory codes it enforces, and must adopt administrative procedures to do so; it must enforce the latest editions and DCA amendments.',
      'Permissive codes apply only where adopted by local ordinance or resolution, with a copy sent to DCA (8-2-25(b)).',
    ],
    localAmendments: 'Local amendments must be more stringent, based on local climatic, geologic, topographic or safety conditions, and sent to DCA 60 days before adoption. DCA only recommends; the local government decides (8-2-25(c)).',
    ahj: 'City or county building department; the State Fire Marshal or local fire marshal for the fire code, NFPA 101 and fire alarm.',
    sources: [GA_SRC.cur, GA_SRC.ann, GA_SRC.mp, GA_SRC.enf, GA_SRC.grey],
  },
  TN: {
    state: 'TN', name: 'Tennessee',
    summary: 'The State Fire Marshal adopted the 2021 I-codes on Apr 17, 2025. Homes use the 2018 IRC. Electrical is the 2017 NEC. Exempt cities and counties enforce their own adopted editions.',
    current: [
      { cat: 'Building', code: '2021 IBC with TN amendments (Chapter 11 removed)', effective: '2025-04-17', status: 'verified', src: TN_SRC.hist },
      { cat: 'Residential', code: '2018 IRC with TN amendments', effective: '2020-07-16', status: 'verified', note: 'Statewide minimum for one- and two-family dwellings unless the local government opted out (two-thirds vote).', src: TN_SRC.hist },
      { cat: 'Fire', code: '2021 IFC with TN amendments', effective: '2025-04-17', status: 'verified', note: 'ERCES requirements are in its Section 510.', src: TN_SRC.hist },
      { cat: 'Life safety', code: 'NFPA 101, 2021 edition, only for new small residential board and care facilities', status: 'verified', note: 'The Life Safety Code is otherwise discontinued for buildings needing SFMO inspection.', src: TN_SRC.hist },
      { cat: 'Fire alarm', code: 'NFPA 72, 2019 edition (referenced by the 2021 IFC)', status: 'secondary', note: REF_NOTE },
      { cat: 'Emergency responder radio', code: '2021 IFC Section 510 with NFPA 1221 (2019)', status: 'secondary', note: REF_NOTE },
      { cat: 'Electrical', code: 'NEC 2017 with TN amendments', effective: '2018-03-19', status: 'verified', note: '110.24 (available fault current) optional; AFCI optional in bathrooms, laundry, garages, unfinished basements and refrigeration circuits.', src: TN_SRC.hist },
      { cat: 'Plumbing', code: '2021 IPC', effective: '2025-04-17', status: 'verified', src: TN_SRC.hist },
      { cat: 'Mechanical', code: '2021 IMC', effective: '2025-04-17', status: 'verified', src: TN_SRC.hist },
      { cat: 'Fuel gas', code: '2021 IFGC with TN amendments', effective: '2025-04-17', status: 'verified', src: TN_SRC.hist },
      { cat: 'Energy', code: '2021 IECC (commercial); 2018 IECC (one- and two-family and townhomes)', effective: '2025-04-17', status: 'verified', note: 'Residential energy edition effective 2020-07-16.', src: TN_SRC.hist },
      { cat: 'Existing building', code: '2021 IEBC with TN amendments', effective: '2025-04-17', status: 'verified', src: TN_SRC.hist },
      { cat: 'Property maintenance', code: '2021 IPMC with TN amendments', effective: '2025-04-17', status: 'verified', src: TN_SRC.hist },
      { cat: 'Accessibility', code: 'Not named by SFMO (IBC Chapter 11 removed); follow the ADA Standards and ask the AHJ', status: 'confirm', src: TN_SRC.hist },
    ],
    upcoming: [],
    enforcement: [
      'The State Fire Marshal (SFMO) reviews plans and inspects buildings statewide, except in exempt jurisdictions.',
      'Exempt jurisdictions do their own plan review and inspections for commercial buildings, but not for state-owned buildings, schools, or facilities needing an SFMO licensing inspection (daycares and some DCS, DIDD and MHSAS facilities).',
      'Exempt jurisdictions must adopt codes within 7 years of the latest edition (TCA 68-120-101(b)(5)(A)) and are audited by SFMO.',
    ],
    localAmendments: 'Exempt jurisdictions adopt their own editions and amendments; SFMO rules limit amendments that reduce requirements. Elsewhere the SFMO-adopted codes apply.',
    ahj: 'SFMO (Codes Enforcement) outside exempt jurisdictions; the city or county codes department inside one; the local fire marshal for fire code.',
    sources: [TN_SRC.hist, TN_SRC.ex, TN_SRC.enf, TN_SRC.mtas],
  },
};

// Tennessee exempt jurisdictions for commercial buildings (SFMO list, checked CHECKED_ON).
export const TN_EXEMPT_CITIES = ['Alcoa', 'Athens', 'Bartlett', 'Brentwood', 'Bristol', 'Chattanooga', 'Clarksville', 'Cleveland', 'Collierville', 'Columbia', 'Cookeville', 'Dyersburg', 'East Ridge', 'Farragut', 'Franklin', 'Gallatin', 'Gatlinburg', 'Germantown', 'Goodlettsville', 'Hendersonville', 'Jackson', 'Johnson City', 'Kingsport', 'Knoxville', 'La Vergne', 'Lebanon', 'Lenoir City', 'Maryville', 'Memphis', 'Millington', 'Mount Juliet', 'Murfreesboro', 'Nashville', 'Oak Ridge', 'Paris', 'Pigeon Forge', 'Sevierville', 'Spring Hill', 'White House'];
export const TN_EXEMPT_COUNTIES: Record<string, string[]> = { Knox: [], Madison: [], Davidson: ['Belle Meade', 'Berry Hill', 'Forest Hills', 'Oak Hill', 'Ridgetop'], Sevier: ['Pittman Center'], Shelby: ['Arlington', 'Lakeland'], Warren: ['McMinnville', 'Morrison'] };

const norm = (s = '') => s.toLowerCase().replace(/\bcounty\b/g, '').replace(/^(city|town) of\s+/, '').replace(/\bmt\.?\s/g, 'mount ').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

export interface LocalRule { exempt: boolean; by?: 'city' | 'county'; text: string }
/** Which local rule applies at a county and (optional) city. */
export function localRule(state: StateCode, county?: string, city?: string): LocalRule {
  const s = CODE_SETS[state];
  if (state !== 'TN') return { exempt: false, text: `${county ? county + ': ' : ''}state codes apply. ${s.localAmendments}` };
  const c = norm(city), k = norm(county);
  if (c && TN_EXEMPT_CITIES.some((x) => norm(x) === c)) return { exempt: true, by: 'city', text: `${city} is an SFMO exempt jurisdiction: the city does commercial plan review and inspections under its own adopted codes.` };
  const key = Object.keys(TN_EXEMPT_COUNTIES).find((x) => norm(x) === k);
  if (key) {
    const ex = TN_EXEMPT_COUNTIES[key];
    if (c && ex.some((x) => norm(x) === c)) return { exempt: false, text: `${city} is excluded from ${key} County's exempt status, so SFMO reviews commercial work there.` };
    return { exempt: true, by: 'county', text: `${key} County is an SFMO exempt jurisdiction${ex.length ? ` (except ${ex.join(', ')})` : ''}: the county does commercial plan review and inspections under its own adopted codes.` };
  }
  return { exempt: false, text: `${county || 'This county'} is not on the SFMO exempt list${city ? ` and neither is ${city}` : ''}, so SFMO-adopted codes apply to commercial work. Check whether the city enforces codes for homes.` };
}

export interface CodesHere { set: StateCodeSet; county?: string; city?: string; local: LocalRule; checked: string }
export function codesFor(state: StateCode, county?: string, city?: string): CodesHere {
  return { set: CODE_SETS[state], county, city, local: localRule(state, county, city), checked: CHECKED_ON };
}
/** Short line for lists: building / fire / electrical editions. */
export function keyCodes(state: StateCode): string {
  const cur = CODE_SETS[state].current; const pick = (c: CodeCat) => cur.find((e) => e.cat === c)?.code.replace(/ with .*| \(.*\)/, '') ?? '—';
  return `Building: ${pick('Building')} · Fire: ${pick('Fire')} · Electrical: ${pick('Electrical')}`;
}
