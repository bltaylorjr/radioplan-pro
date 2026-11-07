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
    necNote: 'NC OSFM lists the 2020 NEC with NC amendments as the current code (excluding one- and two-family dwellings), effective Nov 1, 2021. The 2023 NEC adoption (originally Jan 1, 2025) is on "Indefinite Delay" under Session Law 2025-2 (HB 47) §5.12. One- and two-family dwellings follow the NC Residential Code electrical provisions — confirm with the AHJ.',
    electrical: 'NC Electrical Code = NEC 2020 (NFPA 70) with NC amendments, effective 2021-11-01; 2023 NEC indefinitely delayed',
    building: '2024 NC State Building Code (based on 2021 I-Codes), effective 2025-07-01 (2018 code applied through 2025-06-30)',
    fire: '2024 NC Fire Code, effective 2025-07-01 (ERCES per its Section 510; NFPA 72 per its referenced standards)',
    electricalAuthority: 'NC Department of Insurance, Office of State Fire Marshal (OSFM) — State Electrical Division; NC Building Code Council',
    fireAuthority: 'NC OSFM and the local fire marshal (AHJ)',
    licensing: ['Electrical: NC State Board of Examiners of Electrical Contractors (G.S. Chapter 87, Article 4)', 'Fire alarm / low voltage: SP-FA/LV special restricted license (same Board)'],
    amendmentNotes: ['NC amendments to the 2020 NEC are published by OSFM; check them for the specific article you are designing to.'],
    verifyUrl: 'https://www.ncosfm.gov/codes/state-electrical-division/state-electrical-code-and-interpretations',
    sources: ['https://www.ncosfm.gov/codes/state-electrical-division/state-electrical-code-and-interpretations', 'https://ncosfm.gov/2024-1212-effective-date-2024-north-carolina-state-building-code/open'],
    checked: CHECKED_ON,
  },
  SC: {
    state: 'SC', name: 'South Carolina', necEdition: '2020', necEffective: '2023-01-01', necStatus: 'verified',
    necNote: 'SC Building Codes Council adopted the 2020 NEC with SC modifications (adopted 2021-10-06, effective for local jurisdictions 2023-01-01). A 2024 code-cycle update is in progress (Notice of Intent published 2025-01-24; modifications published May 2026) but no effective date was found — check for a newer adoption.',
    electrical: 'NEC 2020 (NFPA 70) with SC modifications, effective 2023-01-01',
    building: '2021 SC Building Code (2021 IBC with SC modifications), effective 2023-01-01; 2024 update in progress',
    fire: '2021 SC Fire Code (2021 IFC with SC modifications), effective 2023-01-01',
    electricalAuthority: 'SC Dept. of Labor, Licensing & Regulation (LLR) — Building Codes Council',
    fireAuthority: 'Office of State Fire Marshal (LLR) and local fire marshal',
    licensing: ['Electrical contractors: SC Contractor\'s Licensing Board (LLR)', 'Fire alarm: SC LLR fire-protection licensing (confirm class)'],
    amendmentNotes: ['SC modifications are published by the Building Codes Council (Code Modification page).'],
    verifyUrl: 'https://llr.sc.gov/bcc/BCAdoption.aspx',
    sources: ['https://www.llr.sc.gov/bcc/pdffiles/SC-Code-Adoption-Notice.pdf', 'https://llr.sc.gov/bcc/BCAdoption.aspx'],
    checked: CHECKED_ON,
  },
  GA: {
    state: 'GA', name: 'Georgia', necEdition: '2023', necEffective: '2025-01-01', necStatus: 'verified',
    necNote: 'Georgia State Minimum Standard Electrical Code = 2023 NEC (Ga. Comp. R. & Regs. 110-11-1-.31, effective 2025-01-01) with the 2026 Georgia Amendments effective 2026-01-01; two amendments (517.40(A) exception deletion, new 517.45(F)) take effect 2027-01-01.',
    electrical: 'NEC 2023 (NFPA 70) with 2026 Georgia Amendments; NEC effective 2025-01-01, amendments effective 2026-01-01',
    building: '2024 IBC / IRC with Georgia Amendments, effective 2026-01-01',
    fire: '2024 IFC as adopted by the Safety Fire Commissioner, effective 2026-01-01; fire alarm systems governed by the Life Safety Code (NFPA 101) as adopted (Rules ch. 120-3-3)',
    electricalAuthority: 'Georgia Department of Community Affairs (DCA) — Construction Codes',
    fireAuthority: 'Georgia Office of Insurance and Safety Fire Commissioner and local AHJ',
    licensing: ['Electrical: State Construction Industry Licensing Board, Division of Electrical Contractors (O.C.G.A. 43-14)', 'Low voltage: Division of Low Voltage Contractors (LV-A alarm, LV-T telecom, LV-U unrestricted, LV-G general)'],
    amendmentNotes: ['2026 Georgia NEC amendments include GFCI/AFCI revisions and SPD exemptions for one- and two-family dwellings — review the DCA amendment packet.'],
    verifyUrl: 'https://dca.georgia.gov/document/document/nec-2026-amendment-packet/download',
    sources: ['https://dca.georgia.gov/document/document/new-codes-and-amendments-effective-january-1-2026-memo/download', 'https://dca.georgia.gov/document/document/nec-2026-amendment-packet/download', 'https://www.law.cornell.edu/regulations/georgia/Ga-Comp-R-Regs-R-110-11-1-.31'],
    checked: CHECKED_ON,
  },
  TN: {
    state: 'TN', name: 'Tennessee', necEdition: '2017', necEffective: '2018-10-01', necStatus: 'unconfirmed',
    necNote: 'The most recent adoption we could confirm is the 2017 NEC with TN amendments (110.24 optional; AFCI optional in some areas), effective 2018-10-01 (SFMO code history, last updated 2021; IAEI). We could NOT find a current SFMO adopted-codes list — a newer edition may be in effect. Many TN cities/counties are exempt jurisdictions with their own editions. Confirm before relying on it.',
    electrical: 'NEC 2017 (NFPA 70) with TN amendments, effective 2018-10-01 — newer adoption NOT confirmed',
    building: 'IBC as adopted by SFMO (2012 edition per the 2021 SFMO list) — current edition NOT confirmed',
    fire: 'IFC as adopted by SFMO (2012 edition per the 2021 SFMO list) — current edition NOT confirmed',
    electricalAuthority: 'TN Dept. of Commerce & Insurance — State Fire Marshal\'s Office (SFMO), Electrical Inspection',
    fireAuthority: 'TN SFMO and local fire marshal',
    licensing: ['Electrical: TN Board for Licensing Contractors / local licensing', 'Alarm: TN Alarm Systems Contractors Board'],
    amendmentNotes: ['Confirm the edition with the SFMO or the local exempt jurisdiction.'],
    verifyUrl: 'https://www.tn.gov/commerce/fire.html',
    sources: ['https://www.tennessee.gov/content/dam/tn/commerce/documents/fire_prevention/posts/2020-4-12_sfmo-code-adoption-and-history.pdf', 'https://www.iaei.org/page/tennessee-electrical-ceus'],
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
