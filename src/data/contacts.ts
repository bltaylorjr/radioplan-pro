// Inspection and code offices, and web resources, by state, county and city.
// Built-in phone numbers and addresses were copied from each office's own web page on the date shown.
// Nothing here is guessed: where we could not read an official page, the app offers a lookup instead.
import type { StateCode } from '../types';
import { LOCAL_CODES } from '../compliance/citycodes';
import { CODE_SETS } from '../compliance/codesets';
import { BODIES } from './bodies';

export type Level = 'state' | 'county' | 'city';
export interface Contact {
  id: string; level: Level; state: StateCode; county?: string; city?: string;
  office: string; kind: string; address?: string; phone?: string; email?: string; url?: string; note?: string;
  /** Date read on the official page; empty for ones you added. */
  checked?: string; mine?: boolean;
}
export interface Resource {
  id: string; level: Level | 'national'; state?: StateCode; county?: string; city?: string;
  title: string; kind: string; url: string; note?: string; mine?: boolean;
}

export const CONTACT_KINDS = ['Building inspections', 'Fire marshal', 'Electrical inspections', 'Code council', 'Contractor licensing', 'Permits', 'Utility', 'Other'];
export const RESOURCE_KINDS = ['Adopted codes', 'Code text', 'Permits', 'Licensing', 'Fire marshal', 'Forms', 'Maps & GIS', 'Federal', 'Standards & training', 'Other'];
const D = '2026-11-08';

export const CONTACTS: Contact[] = [
  // ---- State offices ----
  { id: 'nc-beec', level: 'state', state: 'NC', office: 'NC State Board of Examiners of Electrical Contractors', kind: 'Contractor licensing', address: '505 N. Greenfield Parkway, Suite 100, Garner, NC 27529', phone: '(919) 733-9042', url: 'https://www.ncbeec.org/', note: 'Mon-Fri 7:30am-4:00pm. Contact form on the website.', checked: D },
  { id: 'sc-bcc', level: 'state', state: 'SC', office: 'SC Building Codes Council (LLR)', kind: 'Code council', address: '110 Centerview Dr., Columbia, SC 29210', phone: '(803) 896-4688', email: 'Contact.BCC@llr.sc.gov', url: 'https://llr.sc.gov/bcc/', note: 'Office hours 8:30am-5:00pm.', checked: D },
  { id: 'sc-fire', level: 'state', state: 'SC', office: 'SC State Fire (LLR, Office of State Fire Marshal)', kind: 'Fire marshal', address: '110 Centerview Dr., Columbia, SC 29210', phone: '(803) 896-4300', url: 'https://statefire.llr.sc.gov/', note: 'LLR main line; the page lists no separate fire marshal number.', checked: D },
  { id: 'sc-clb', level: 'state', state: 'SC', office: 'SC Contractor\'s Licensing Board (LLR)', kind: 'Contractor licensing', address: '110 Centerview Dr., Columbia, SC 29210', phone: '(803) 896-4686', email: 'Contact.CLB@llr.sc.gov', url: 'https://llr.sc.gov/clb/', checked: D },
  { id: 'ga-dca', level: 'state', state: 'GA', office: 'GA Dept. of Community Affairs, Construction Codes', kind: 'Code council', address: '60 Executive Park South, NE, Atlanta, GA 30329', phone: '(404) 679-4840', url: 'https://dca.georgia.gov/community-assistance/construction-codes', note: 'DCA main line.', checked: D },
  { id: 'ga-sfd', level: 'state', state: 'GA', office: 'GA Insurance and Safety Fire Commissioner, Safety Fire Division', kind: 'Fire marshal', address: '2 Martin Luther King, Jr. Drive, West Tower, Suite 702, Atlanta, GA 30334', phone: '(470) 222-9377', url: 'https://oci.georgia.gov/about-us/contact-us', note: 'Plan submission questions. Engineering and inspections: (404) 656-2070. Toll-free (800) 656-2298.', checked: D },
  { id: 'tn-sfmo', level: 'state', state: 'TN', office: 'TN State Fire Marshal\'s Office, Codes Enforcement', kind: 'Fire marshal', address: '500 James Robertson Parkway, Tenth Floor, Davy Crockett Tower, Nashville, TN 37243-1162', phone: '(615) 741-7190', url: 'https://www.tn.gov/commerce/fire/codes-enforcement/fire-codes-contact.html', note: 'Plan review and state codes for commercial work outside exempt cities and counties.', checked: D },
  { id: 'tn-elec', level: 'state', state: 'TN', office: 'TN State Fire Marshal\'s Office, Electrical inspections and permits', kind: 'Electrical inspections', address: '500 James Robertson Parkway, Nashville, TN 37243', phone: '(615) 741-7170', url: 'https://www.tn.gov/commerce/fire/codes-enforcement/fire-codes-contact.html', note: 'Electrical and one- and two-family dwelling inspection or permit questions.', checked: D },
  { id: 'tn-blc', level: 'state', state: 'TN', office: 'TN Board for Licensing Contractors', kind: 'Contractor licensing', address: '500 James Robertson Pkwy, Nashville, TN 37243-0565', phone: '(615) 741-2241', url: 'https://www.tn.gov/commerce/regboards/contractors.html', note: 'Department of Commerce and Insurance line.', checked: D },
  { id: 'va-dhcd', level: 'state', state: 'VA', office: 'VA Dept. of Housing and Community Development, State Building Codes Office', kind: 'Code council', address: '600 East Main Street, Suite 300, Richmond, VA 23219', phone: '804-371-7000', url: 'https://www.dhcd.virginia.gov/codes', note: 'DHCD main line. Code Officials Directory (find the local building official): https://dmz1.dhcd.virginia.gov/BFR/Main/OfficialDirectory.aspx', checked: D },
  { id: 'va-sfmo', level: 'state', state: 'VA', office: 'Virginia State Fire Marshal\'s Office (Dept. of Fire Programs)', kind: 'Fire marshal', address: '1005 Technology Park Drive, Glen Allen, VA 23059', phone: '(804) 371-0220', email: 'statefiremarshal@vdfp.virginia.gov', url: 'https://www.vdfp.virginia.gov/about-us/virginia-state-fire-marshals-office/', note: 'Department of Fire Programs main line. Regional chief deputies: Central (540) 270-2219, Eastern (757) 406-0512, Western (276) 791-9899. Fire protection system permits come from the local building official, not the SFMO.', checked: D },
  { id: 'va-dpor-boc', level: 'state', state: 'VA', office: 'VA Board for Contractors (DPOR)', kind: 'Contractor licensing', address: '9960 Mayland Drive, Suite 400, Richmond, VA 23233', phone: '(804) 367-8511', email: 'contractors@dpor.virginia.gov', url: 'https://www.dpor.virginia.gov/Boards/Contractors', note: 'Licensing Section. Board office (804) 367-2785; Education Section (804) 367-2224. Mon-Fri 8:30am-5:00pm. License lookup: https://www.dpor.virginia.gov/LicenseLookup', checked: D },
  // ---- Counties and cities ----
  { id: 'nc-asheville-dsd', level: 'city', state: 'NC', county: 'Buncombe County', city: 'Asheville', office: 'City of Asheville Development Services, Permit Application Center', kind: 'Building inspections', address: '161 S. Charlotte Street, Asheville, NC 28801', phone: '828-259-5846', email: 'PAC@AshevilleNC.gov', url: 'https://www.ashevillenc.gov/department/development-services/contact-staff/', note: 'Mon-Fri 8:30am-5:00pm; inspections Mon-Fri 7:30am-3:30pm. Building Code Hotline 828-259-5967 (BuildingSafety@AshevilleNC.gov).', checked: D },
  { id: 'nc-asheville-fire', level: 'city', state: 'NC', county: 'Buncombe County', city: 'Asheville', office: 'Asheville Fire Department, Fire Marshals Division', kind: 'Fire marshal', address: '100 Court Plaza, Asheville, NC 28801', phone: '828-259-5636', email: 'afdmailbox@ashevillenc.gov', url: 'https://www.ashevillenc.gov/department/fire/fire-marshals-division/', note: 'Department main line, Mon-Thu 8:30am-5:00pm. The division page lists 828-259-5641 for periodic inspection questions. New-construction fire plan review goes through Development Services.', checked: D },
  { id: 'tn-nashville-codes', level: 'city', state: 'TN', county: 'Davidson County', city: 'Nashville', office: 'Metro Nashville Codes Department', kind: 'Building inspections', address: 'Metro Office Building, 800 President Ronald Reagan Way, 1st Floor, Nashville, TN 37210', phone: '615-862-6500', url: 'https://www.nashville.gov/departments/codes', note: 'Electrical inspections: 615-862-6560.', checked: D },
  { id: 'tn-knoxville-pri', level: 'city', state: 'TN', county: 'Knox County', city: 'Knoxville', office: 'City of Knoxville Plans Review and Inspections', kind: 'Building inspections', address: '400 Main St., Suite 475, Knoxville, TN 37902', phone: '(865) 215-4311', url: 'https://knoxvilletn.gov/government/city_departments_offices/plans_review_inspections/current_codes', note: 'Number listed for the director. An older city page lists 865-215-2999 and bldginspections@knoxvilletn.gov.', checked: D },
  { id: 'tn-knox-codes', level: 'county', state: 'TN', county: 'Knox County', office: 'Knox County Codes Administration', kind: 'Building inspections', address: 'City County Building, Suite 547, 400 Main Street, Knoxville, TN 37902', phone: '865-215-2325', url: 'https://knoxcounty.org/codes/', note: 'Mon-Fri 8:00am-4:30pm.', checked: D },
  { id: 'tn-montgomery-codes', level: 'county', state: 'TN', county: 'Montgomery County', office: 'Clarksville-Montgomery County Building and Codes', kind: 'Building inspections', address: '350 Pageant Lane, Suite 309, Clarksville, TN 37040', phone: '931-648-5718', url: 'https://montgomerytn.gov/building-codes', note: 'Serves Clarksville and the county. Mon-Fri 7:30am-4:30pm.', checked: D },
  { id: 'tn-franklin-bns', level: 'city', state: 'TN', county: 'Williamson County', city: 'Franklin', office: 'Franklin Building and Neighborhood Services', kind: 'Building inspections', phone: '615-794-7012', url: 'https://franklintn.gov/government/departments-a-j/building-and-neighborhood-services/permit-applications-information/adopted-codes', checked: D },
  { id: 'tn-maryville-codes', level: 'city', state: 'TN', county: 'Blount County', city: 'Maryville', office: 'City of Maryville Codes', kind: 'Building inspections', address: '416 W. Broadway Avenue, Maryville, TN 37801', phone: '(865) 273-3500', url: 'https://www.maryvillegov.com/codes.html', checked: D },
  { id: 'ga-atlanta-ob', level: 'city', state: 'GA', county: 'Fulton County', city: 'Atlanta', office: 'City of Atlanta Office of Buildings', kind: 'Building inspections', phone: '404-330-6150', url: 'https://www.atlantaga.gov/government/departments/city-planning/ordinances-regulations/construction-codes', checked: D },
];

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export const RESOURCES: Resource[] = ([
  ...BODIES.flatMap((b) => b.links.map(([t, u], i): Resource => ({ id: `body-${b.id}-${i}`, level: b.state ? 'state' : 'national', state: b.state, title: `${b.short}: ${t}`, kind: b.sub === 'Licensing' ? 'Licensing' : 'Standards & training', url: u }))),
  { id: 'icc-codes', level: 'national', title: 'ICC Digital Codes (free read-only code text)', kind: 'Code text', url: 'https://codes.iccsafe.org/' },
  { id: 'fcc-uls', level: 'national', title: 'FCC Universal Licensing System (license search)', kind: 'Federal', url: 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp' },
  { id: 'faa-oeaaa', level: 'national', title: 'FAA Obstruction Evaluation (OE/AAA), Notice Criteria Tool', kind: 'Federal', url: 'https://oeaaa.faa.gov/' },
  { id: 'ecfr-90', level: 'national', title: '47 CFR Part 90 (land mobile radio, incl. 90.219 signal boosters)', kind: 'Federal', url: 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-D/part-90' },
  ...(['NC', 'SC', 'GA', 'TN', 'VA'] as StateCode[]).flatMap((st) => CODE_SETS[st].sources.map((u, i): Resource => ({ id: `src-${st}-${i}`, level: 'state', state: st, title: `${CODE_SETS[st].name}: ${host(u)}`, kind: 'Adopted codes', url: u }))),
  ...LOCAL_CODES.map((l): Resource => ({ id: `loc-${l.id}`, level: l.level, state: l.state, county: l.level === 'county' ? l.name : l.county, city: l.level === 'city' ? l.name : undefined, title: `${l.name}: adopted codes`, kind: 'Adopted codes', url: l.src })),
  ...CONTACTS.filter((c) => c.url).map((c): Resource => ({ id: `web-${c.id}`, level: c.level, state: c.state, county: c.county, city: c.city, title: c.office, kind: c.kind === 'Contractor licensing' ? 'Licensing' : c.kind === 'Fire marshal' ? 'Fire marshal' : 'Permits', url: c.url! })),
] as Resource[]).filter((r, i, a) => a.findIndex((x) => x.url === r.url && x.level === r.level && x.city === r.city && x.county === r.county) === i);

const n = (s?: string) => (s ?? '').toLowerCase().replace(/\bcounty\b/g, '').replace(/[^a-z]/g, '');
/** Entries that apply at a place: the state's, the county's and the city's. */
export function atPlace<T extends { level: string; state?: StateCode; county?: string; city?: string }>(list: T[], st: StateCode, county?: string, city?: string): T[] {
  return list.filter((x) => x.level === 'national' ||
    (x.state === st && (x.level === 'state' || (x.level === 'county' && !!county && n(x.county) === n(county)) || (x.level === 'city' && !!city && n(x.city) === n(city) && (!county || !x.county || n(x.county) === n(county))))));
}

/** A web search for the office when the app has no verified listing. */
export const lookupUrl = (what: string, st: StateCode, county?: string, city?: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${city ?? county ?? ''} ${CODE_SETS[st].name} ${what}`.trim())}`;

/** Merge built-in entries with the user's own: edited copies replace the original, removed ones are hidden. */
export function mergeMine<T extends { id: string; mine?: boolean }>(builtIn: T[], mine: (T & { replaces?: string })[], hidden: string[]): T[] {
  const replaced = new Set(mine.map((m) => m.replaces).filter(Boolean) as string[]);
  return [...builtIn.filter((b) => !hidden.includes(b.id) && !replaced.has(b.id)), ...mine.map((m) => ({ ...m, mine: true }))];
}
