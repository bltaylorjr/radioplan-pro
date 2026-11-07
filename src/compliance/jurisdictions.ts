// Adopted code editions by state. These are best-known adoptions as of late 2026 and MUST be verified with
// the Authority Having Jurisdiction (AHJ) before use: local governments (and in GA/TN, many cities/counties)
// may enforce a different edition or local amendments. State amendment text is NOT bundled in this MVP.
import type { StateCode } from '../types';

export interface Jurisdiction {
  state: StateCode; name: string;
  electrical: string; building: string; fire: string;
  electricalAuthority: string; fireAuthority: string; licensing: string[];
  amendmentNotes: string[]; verifyUrl: string;
}

export const JURISDICTIONS: Record<StateCode, Jurisdiction> = {
  NC: {
    state: 'NC', name: 'North Carolina',
    electrical: 'NC Electrical Code (NFPA 70 / NEC 2023 with NC amendments)',
    building: 'NC State Building Code (2024 edition, based on 2021 I-Codes)',
    fire: 'NC Fire Code (2024 edition, based on 2021 IFC; references NFPA 72, NFPA 1225 via IFC 510)',
    electricalAuthority: 'NC Department of Insurance, Office of State Fire Marshal (Engineering & Codes) / NC Building Code Council',
    fireAuthority: 'NC OSFM and the local fire marshal (AHJ)',
    licensing: [
      'Electrical work: NC State Board of Examiners of Electrical Contractors (G.S. Chapter 87, Article 4)',
      'Fire alarm / low voltage: Special Restricted license SP-FA/LV (same Board)',
    ],
    amendmentNotes: ['NC publishes amendments to the NEC with each adoption; confirm the effective date and amendments on the OSFM codes page.'],
    verifyUrl: 'https://www.ncosfm.gov/codes',
  },
  SC: {
    state: 'SC', name: 'South Carolina',
    electrical: 'NEC (NFPA 70) as adopted by the SC Building Codes Council (2020 or 2023 edition; verify)',
    building: 'International Building Code as adopted by SC Building Codes Council (2021 edition)',
    fire: 'International Fire Code 2021 with SC modifications (SC State Fire Marshal)',
    electricalAuthority: 'SC Dept. of Labor, Licensing & Regulation (LLR) — Building Codes Council',
    fireAuthority: 'Office of State Fire Marshal (LLR) and local fire marshal',
    licensing: ['Electrical contractors: SC Contractor\'s Licensing Board (LLR)', 'Fire alarm: SC LLR Fire Sprinkler / Fire Alarm licensing (verify class)'],
    amendmentNotes: ['SC modifications are published by the Building Codes Council; local jurisdictions may adopt optional appendices.'],
    verifyUrl: 'https://llr.sc.gov/bcc/',
  },
  GA: {
    state: 'GA', name: 'Georgia',
    electrical: 'Georgia State Minimum Standard Electrical Code (NEC 2023 with Georgia amendments; verify)',
    building: 'Georgia State Minimum Standard Building Code (IBC with Georgia amendments)',
    fire: 'Rules & Regulations of the Safety Fire Commissioner, Ch. 120-3-3 (IFC, NFPA 101, NFPA 72 as adopted)',
    electricalAuthority: 'Georgia Department of Community Affairs (DCA) — Construction Codes',
    fireAuthority: 'Georgia Office of Insurance and Safety Fire Commissioner and local AHJ',
    licensing: ['Electrical: State Construction Industry Licensing Board, Division of Electrical Contractors (O.C.G.A. 43-14)', 'Low voltage: Division of Low Voltage Contractors (LV-A alarm, LV-T telecom, LV-U unrestricted, LV-G general)'],
    amendmentNotes: ['DCA publishes Georgia amendments for each code edition; local governments must enforce state minimum codes.'],
    verifyUrl: 'https://www.dca.ga.gov/local-government-assistance/construction-codes-industrialized-buildings/construction-codes',
  },
  TN: {
    state: 'TN', name: 'Tennessee',
    electrical: 'NEC (NFPA 70) as adopted by the TN State Fire Marshal\'s Office (verify edition; exempt local jurisdictions may differ)',
    building: 'International Building Code as adopted by SFMO / local jurisdictions',
    fire: 'International Fire Code and NFPA codes as adopted by SFMO rule 0780-02-02 (verify)',
    electricalAuthority: 'TN Dept. of Commerce & Insurance — State Fire Marshal\'s Office, Electrical Inspection',
    fireAuthority: 'TN SFMO and local fire marshal',
    licensing: ['Electrical: TN Board for Licensing Contractors / local electrical licensing', 'Alarm: TN Alarm Systems Contractors Board'],
    amendmentNotes: ['Many TN cities/counties are "exempt" jurisdictions with their own adopted editions; confirm the local edition.'],
    verifyUrl: 'https://www.tn.gov/commerce/fire.html',
  },
};
