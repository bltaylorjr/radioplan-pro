// Codes adopted by individual cities and counties, read on each jurisdiction's own web page.
// Only places whose page we could read are listed. Everywhere else, the state list applies
// (or, for Tennessee exempt jurisdictions, the local office must be asked for its list).
import type { StateCode } from '../types';
import type { CodeCat, CodeEntry } from './codesets';

export const LOCAL_CHECKED = '2026-11-08';

export interface LocalCodeSet {
  id: string; state: StateCode; level: 'city' | 'county';
  /** City name, or county name with "County". */
  name: string;
  /** County a city sits in, for matching. */
  county?: string;
  codes: CodeEntry[];
  /** What the page said about dates, amendments, or doubts. */
  note: string;
  src: string;
  /** The page looked out of date, or left editions out. */
  stale?: boolean;
}

const v = (cat: CodeCat, code: string, effective?: string, note?: string): CodeEntry => ({ cat, code, effective, note, status: 'verified' });

export const LOCAL_CODES: LocalCodeSet[] = [
  { id: 'tn-nashville', state: 'TN', level: 'city', name: 'Nashville', county: 'Davidson County',
    codes: [v('Building', '2024 International Building Code', 'Plans submitted after 2025-07-16'), v('Residential', '2024 International Residential Code', 'Plans submitted after 2025-07-16'), v('Fire', '2024 ICC fire and trades codes (see the Metro adopted codes list)', 'Plans submitted after 2025-07-16')],
    note: 'Metro Nashville adopted the 2024 ICC codes by ordinance BL2025-898 (signed July 16, 2025). Projects with 2018 IBC preliminary designs had a 180-day grace period. The electrical edition is on Metro\'s adopted codes list, which we have not read; ask Metro Codes.',
    src: 'https://www.nashville.gov/departments/codes' },
  { id: 'tn-memphis', state: 'TN', level: 'city', name: 'Memphis', county: 'Shelby County',
    codes: [v('Building', '2021 Memphis and Shelby County Building Code (2021 IBC with local amendments)', '2021-12-31'), v('Electrical', '2020 NEC with local amendments', '2021-12-31'), v('Fire', '2021 IFC with local amendments', '2021-12-31'), v('Residential', '2021 IRC with local amendments', '2021-12-31')],
    note: 'Joint City of Memphis and Shelby County ordinance. Fire alarm work needs a permit (Sec. 105.1.2). The published copy is unsigned, so confirm the adoption date with Shelby County Code Enforcement.',
    src: 'https://www.shelbycountytn.gov/DocumentCenter/View/39392/2021-International-Building-Code-with-Local-Amendments' },
  { id: 'tn-shelby', state: 'TN', level: 'county', name: 'Shelby County',
    codes: [v('Building', '2021 Memphis and Shelby County Building Code (2021 IBC with local amendments)', '2021-12-31'), v('Electrical', '2020 NEC with local amendments', '2021-12-31'), v('Fire', '2021 IFC with local amendments', '2021-12-31'), v('Residential', '2021 IRC with local amendments', '2021-12-31')],
    note: 'Applies in unincorporated Shelby County with Memphis. Towns such as Collierville, Germantown and Bartlett adopt their own codes. Fire alarm work needs a permit.',
    src: 'https://www.shelbycountytn.gov/DocumentCenter/View/39392/2021-International-Building-Code-with-Local-Amendments' },
  { id: 'tn-knoxville', state: 'TN', level: 'city', name: 'Knoxville', county: 'Knox County',
    codes: [v('Building', '2024 International Building Code'), v('Residential', '2024 International Residential Code'), v('Existing building', '2024 International Existing Building Code'), v('Fire', '2024 International Fire Code with local amendments'), v('Electrical', '2023 NEC with local amendments'), v('Energy', '2018 International Energy Conservation Code'), v('Mechanical', '2024 International Mechanical Code'), v('Plumbing', '2024 International Plumbing Code'), v('Accessibility', 'ICC A117.1-2017')],
    note: 'From the city\'s Current Codes page. The page gives no effective dates and does not print the amendment text.',
    src: 'https://knoxvilletn.gov/government/city_departments_offices/plans_review_inspections/current_codes' },
  { id: 'tn-knox', state: 'TN', level: 'county', name: 'Knox County',
    codes: [v('Building', '2018 International Building Code', 'Ord. O-18-10-101 (2018-11-19)'), v('Residential', '2018 International Residential Code', 'Ord. O-18-10-101 (2018-11-19)'), v('Fire', '2018 International Fire Code', 'Ord. O-18-10-101 (2018-11-19)'), v('Life safety', 'NFPA 101 Life Safety Code, 2018', 'Ord. O-18-10-101 (2018-11-19)'), v('Existing building', '2018 International Existing Building Code'), v('Energy', '2018 International Energy Conservation Code')],
    note: 'Unincorporated Knox County (Knoxville and Farragut adopt their own). The county\'s adoption history lists no electrical code after the 1999 NEC, so ask Knox County Codes Administration which NEC it enforces. The county also publishes Fire Alarm System Requirements.',
    src: 'https://knoxcounty.org/codes/', stale: true },
  { id: 'tn-clarksville', state: 'TN', level: 'city', name: 'Clarksville', county: 'Montgomery County',
    codes: [v('Building', '2018 International Building Code', '2021-01-01'), v('Residential', '2018 International Residential Code', '2021-01-01'), v('Fire', '2018 International Fire Code', '2021-01-01'), v('Energy', '2018 IECC with amendments', '2024-01-08'), v('Accessibility', 'ICC A117.1-2009', '2021-01-01')],
    note: 'Clarksville-Montgomery County Building and Codes (Resolutions 20-10-6 and 24-1-2). The page lists no electrical code; ask the department.',
    src: 'https://montgomerytn.gov/building-codes' },
  { id: 'tn-montgomery', state: 'TN', level: 'county', name: 'Montgomery County',
    codes: [v('Building', '2018 International Building Code', '2021-01-01'), v('Residential', '2018 International Residential Code', '2021-01-01'), v('Fire', '2018 International Fire Code', '2021-01-01'), v('Energy', '2018 IECC with amendments', '2024-01-08')],
    note: 'Same joint Clarksville-Montgomery County department. No electrical code listed on the page.',
    src: 'https://montgomerytn.gov/building-codes' },
  { id: 'tn-murfreesboro', state: 'TN', level: 'city', name: 'Murfreesboro', county: 'Rutherford County',
    codes: [v('Building', '2024 International Building Code'), v('Residential', '2024 International Residential Code'), v('Fire', '2024 International Fire Code'), v('Existing building', '2024 International Existing Building Code'), v('Electrical', '2023 NEC'), v('Energy', '2018 International Energy Conservation Code'), v('Accessibility', 'ICC A117.1-2017')],
    note: 'From the city\'s Construction Codes page. No effective dates given.',
    src: 'https://www.murfreesborotn.gov/2865' },
  { id: 'tn-franklin', state: 'TN', level: 'city', name: 'Franklin', county: 'Williamson County',
    codes: [v('Building', '2018 International Building Code', '2019-01-01'), v('Residential', '2018 International Residential Code', '2019-01-01'), v('Fire', '2018 International Fire Code', '2019-01-01'), v('Life safety', 'NFPA 101 Life Safety Code, 2018', '2019-01-01'), v('Electrical', '2017 NEC', '2019-01-01'), v('Accessibility', 'ICC A117.1-2017', '2019-01-01')],
    note: 'The page dates from the 2019 adoption and may be out of date. Amendments are in the Franklin Municipal Code.',
    src: 'https://franklintn.gov/government/departments-a-j/building-and-neighborhood-services/permit-applications-information/adopted-codes', stale: true },
  { id: 'tn-collierville', state: 'TN', level: 'city', name: 'Collierville', county: 'Shelby County',
    codes: [v('Building', '2018 International Building Code with local amendments'), v('Residential', '2018 International Residential Code with local amendments'), v('Fire', '2018 International Fire Code with local amendments'), v('Electrical', '2017 NEC with local amendments')],
    note: 'No effective dates given; amendment text not on the page.',
    src: 'https://colliervilletn.gov/government/town-departments/development/building-and-codes/adopted-codes-and-local-amendments' },
  { id: 'tn-maryville', state: 'TN', level: 'city', name: 'Maryville', county: 'Blount County',
    codes: [v('Building', '2024 International Building Code (Appendices A and B)', '2026-01-01'), v('Residential', '2024 International Residential Code', '2026-01-01'), v('Fire', '2024 International Fire Code', '2026-01-01'), v('Energy', '2024 International Energy Conservation Code', '2026-01-01'), v('Electrical', '2017 NEC with local modifications', 'continues')],
    note: 'Adopted by council on Dec 2, 2025. The 2017 NEC stays in force. Local modification documents are linked on the city page.',
    src: 'https://www.maryvillegov.com/codes.html' },
  { id: 'tn-williamson', state: 'TN', level: 'county', name: 'Williamson County',
    codes: [v('Building', '2021 International Building Code', '2024-09-30'), v('Residential', '2021 IRC (excluding the electrical chapters)', '2024-09-30'), v('Energy', '2018 energy code with 2009 tables (SFMO rule)', '2024-09-30')],
    note: 'Unincorporated Williamson County. Schools, day cares and large assembly plans go to the State Fire Marshal\'s Office. No fire or electrical code listed on the page.',
    src: 'https://www.williamsoncounty-tn.gov/104' },
  { id: 'tn-chattanooga', state: 'TN', level: 'city', name: 'Chattanooga', county: 'Hamilton County',
    codes: [v('Building', '2018 International Building Code', '2023-05-26'), v('Residential', '2018 International Residential Code', '2023-05-26'), v('Fire', '2018 International Fire Code', '2023-05-26'), v('Electrical', '2023 NEC', '2023-05-26'), v('Energy', '2018 IECC with state amendments', '2023-05-26'), v('Accessibility', 'ICC A117.1-2009', '2023-05-26')],
    note: 'Ordinances of Feb 28, 2023; plans to older codes not accepted after May 26, 2023. Enforced by the Land Development Office.',
    src: 'https://chattanooga.gov/stay-informed/building-codes' },
  { id: 'ga-atlanta', state: 'GA', level: 'city', name: 'Atlanta', county: 'Fulton County',
    codes: [v('Building', '2024 IBC with Georgia amendments', '2026-01-01'), v('Residential', '2024 IRC with Georgia amendments', '2026-01-01'), v('Electrical', '2023 NEC with Georgia amendments', '2026-01-01'), v('Mechanical', '2024 IMC with Georgia amendments', '2026-01-01')],
    note: 'For permits from Jan 1, 2026; applications filed before Feb 1, 2026 may use the prior codes. Fire codes (IFC, Life Safety Code 2024) are set by the State Fire Marshal.',
    src: 'https://www.atlantaga.gov/government/departments/city-planning/ordinances-regulations/construction-codes' },
  { id: 'sc-greenville', state: 'SC', level: 'county', name: 'Greenville County',
    codes: [v('Residential', '2021 IRC Appendix AF (radon control), local modification')],
    note: 'The only local modification on the SC Building Codes Council list. A request to add 2024 IBC Appendix BE was scheduled for August 2026; its outcome is not known. The 2024 SC codes take effect Jan 1, 2027.',
    src: 'https://llr.sc.gov/bcc/BCAdoption.aspx' },
];

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/\bcounty\b/g, '').replace(/[^a-z]/g, '');

/** Local codes for a place: the city's own list first, then the county's. */
export function localCodes(state: StateCode, county?: string, city?: string): LocalCodeSet | undefined {
  const list = LOCAL_CODES.filter((l) => l.state === state);
  if (city) { const c = list.find((l) => l.level === 'city' && norm(l.name) === norm(city) && (!county || !l.county || norm(l.county) === norm(county))); if (c) return c; }
  if (county) return list.find((l) => l.level === 'county' && norm(l.name) === norm(county));
  return undefined;
}
