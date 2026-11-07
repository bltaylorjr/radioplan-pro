// Adopted code editions by state, checked against official sources on 2026-11-07 (see `sources`).
// `verified` = confirmed on an official state page; `unconfirmed` = only third-party or outdated sources found.
// Local governments (and in TN, "exempt" jurisdictions) may enforce different editions. State amendment TEXT is not bundled.
import type { StateCode } from '../types';

export type NecEdition = '2017' | '2020' | '2023';
export interface Jurisdiction {
  state: StateCode; name: string;
  necEdition: NecEdition; necEffective: string; necStatus: 'verified' | 'unconfirmed'; necNote: string;
  electrical: string; building: string; fire: string;
  electricalAuthority: string; fireAuthority: string; licensing: string[];
  amendmentNotes: string[]; verifyUrl: string; sources: string[]; checked: string;
}

export const CHECKED_ON = '2026-11-07';

export const JURISDICTIONS: Record<StateCode, Jurisdiction> = {
  NC: {
    state: 'NC', name: 'North Carolina', necEdition: '2020', necEffective: '2021-11-01', necStatus: 'verified',
    necNote: 'NC OSFM lists the 2020 NC Electrical Code (2020 NEC with NC amendments) as current for buildings outside the 2018 NC Residential Code, effective Nov 1, 2021. One- and two-family dwellings within the Residential Code use the 2017 NEC. The 2023 NC Electrical Code is part of the 2024 code suite, which has no effective date yet (earliest May 1, 2027, per the NC Licensing Board, Jun 1, 2026).',
    electrical: '2020 NC Electrical Code (NEC 2020 with NC amendments), effective 2021-11-01; 2017 NEC for one- and two-family dwellings; 2023 NEC not yet effective',
    building: '2018 NC State Building Code remains in force; the 2024 NC code has no effective date yet (earliest May 1, 2027)',
    fire: '2018 NC Fire Code (ERCES per its Section 510; NFPA 72 per its referenced standards)',
    electricalAuthority: 'NC Department of Insurance, Office of State Fire Marshal (OSFM) — State Electrical Division; NC Building Code Council',
    fireAuthority: 'NC OSFM and the local fire marshal (AHJ)',
    licensing: ['Electrical: NC State Board of Examiners of Electrical Contractors (G.S. Chapter 87, Article 4)', 'Fire alarm / low voltage: SP-FA/LV special restricted license (same Board)'],
    amendmentNotes: ['NC amendments to the 2020 NEC are published by OSFM; check them for the specific article you are designing to.'],
    verifyUrl: 'https://www.ncosfm.gov/codes/state-electrical-division/state-electrical-code-and-interpretations',
    sources: ['https://www.ncosfm.gov/codes/state-electrical-division/state-electrical-code-and-interpretations', 'https://www.ncosfm.gov/letter-re-2024-state-building-code-effective-date/open', 'https://nclicensing.org/wp-content/uploads/2026/05/2026-06-01-Code-Update.pdf'],
    checked: CHECKED_ON,
  },
  SC: {
    state: 'SC', name: 'South Carolina', necEdition: '2020', necEffective: '2023-01-01', necStatus: 'verified',
    necNote: 'SC Building Codes Council adopted the 2020 NEC with SC modifications (adopted 2021-10-06, effective for local jurisdictions 2023-01-01). The Council adopted the 2024 I-codes and the 2023 NEC on 2025-08-26, with implementation for local jurisdictions on 2027-01-01.',
    electrical: 'NEC 2020 (NFPA 70) with SC modifications, effective 2023-01-01',
    building: '2021 SC Building Code (2021 IBC with SC modifications), effective 2023-01-01; 2024 codes take effect 2027-01-01',
    fire: '2021 SC Fire Code (2021 IFC with SC modifications), effective 2023-01-01',
    electricalAuthority: 'SC Dept. of Labor, Licensing & Regulation (LLR) — Building Codes Council',
    fireAuthority: 'Office of State Fire Marshal (LLR) and local fire marshal',
    licensing: ['Electrical contractors: SC Contractor\'s Licensing Board (LLR)', 'Fire alarm: SC LLR fire-protection licensing (confirm class)'],
    amendmentNotes: ['SC modifications are published by the Building Codes Council (Code Modification page).'],
    verifyUrl: 'https://llr.sc.gov/bcc/BCAdoption.aspx',
    sources: ['https://www.llr.sc.gov/bcc/pdffiles/SC-Code-Adoption-Notice.pdf', 'https://llr.sc.gov/bcc/BCAdoption.aspx', 'https://www.icc-nta.org/code-update/south-carolina-adopts-new-building-codes/'],
    checked: CHECKED_ON,
  },
  GA: {
    state: 'GA', name: 'Georgia', necEdition: '2023', necEffective: '2025-01-01', necStatus: 'verified',
    necNote: 'Georgia State Minimum Standard Electrical Code = 2023 NEC (Ga. Comp. R. & Regs. 110-11-1-.31, effective 2025-01-01) with the 2026 Georgia Amendments effective 2026-01-01; two amendments (517.40(A) exception deletion, new 517.45(F)) take effect 2027-01-01.',
    electrical: 'NEC 2023 (NFPA 70) with 2026 Georgia Amendments; NEC effective 2025-01-01, amendments effective 2026-01-01',
    building: '2024 IBC / IRC with Georgia Amendments (DCA lists them as current; a DCA announcement gives 2027-01-01, so confirm with the AHJ)',
    fire: '2024 IFC as adopted by the Safety Fire Commissioner (confirm effective date); fire alarm systems governed by the Life Safety Code (NFPA 101) as adopted (Rules ch. 120-3-3)',
    electricalAuthority: 'Georgia Department of Community Affairs (DCA) — Construction Codes',
    fireAuthority: 'Georgia Office of Insurance and Safety Fire Commissioner and local AHJ',
    licensing: ['Electrical: State Construction Industry Licensing Board, Division of Electrical Contractors (O.C.G.A. 43-14)', 'Low voltage: Division of Low Voltage Contractors (LV-A alarm, LV-T telecom, LV-U unrestricted, LV-G general)'],
    amendmentNotes: ['2026 Georgia NEC amendments include GFCI/AFCI revisions and SPD exemptions for one- and two-family dwellings — review the DCA amendment packet.'],
    verifyUrl: 'https://dca.georgia.gov/document/document/nec-2026-amendment-packet/download',
    sources: ['https://dca.georgia.gov/document/document/new-codes-and-amendments-effective-january-1-2026-memo/download', 'https://dca.georgia.gov/document/document/nec-2026-amendment-packet/download', 'https://www.law.cornell.edu/regulations/georgia/Ga-Comp-R-Regs-R-110-11-1-.31'],
    checked: CHECKED_ON,
  },
  TN: {
    state: 'TN', name: 'Tennessee', necEdition: '2017', necEffective: '2018-03-19', necStatus: 'verified',
    necNote: 'The SFMO adopted-codes page lists the 2017 NEC with TN amendments (110.24 optional; AFCI optional in some locations), effective 2018-03-19. No newer NEC adoption is listed. Exempt cities and counties may enforce other editions.',
    electrical: 'NEC 2017 (NFPA 70) with TN amendments, effective 2018-03-19',
    building: '2021 IBC with TN amendments, effective 2025-04-17 (homes: 2018 IRC, effective 2020-07-16)',
    fire: '2021 IFC with TN amendments, effective 2025-04-17',
    electricalAuthority: 'TN Dept. of Commerce & Insurance — State Fire Marshal\'s Office (SFMO), Electrical Inspection',
    fireAuthority: 'TN SFMO and local fire marshal',
    licensing: ['Electrical: TN Board for Licensing Contractors / local licensing', 'Alarm: TN Alarm Systems Contractors Board'],
    amendmentNotes: ['Exempt jurisdictions enforce their own adopted editions; confirm with the city or county.'],
    verifyUrl: 'https://www.tn.gov/commerce/fire/codes-enforcement/history.html',
    sources: ['https://www.tn.gov/commerce/fire/codes-enforcement/history.html', 'https://www.tn.gov/commerce/fire/codes-enforcement/exempt-jurisdictions.html'],
    checked: CHECKED_ON,
  },
};

/** NEC section numbers that changed between editions (planning subset). */
export function necSection(sec: string, ed: NecEdition): string {
  if (ed === '2017') {
    const map: Record<string, string> = { '706.15': '706.7', '706.15 / 480.7': '706.7 / 480.6', '800.100(A)(4)': '800.100(A)(4)', '480.7': '480.6' };
    if (map[sec]) return map[sec];
  }
  return sec;
}
