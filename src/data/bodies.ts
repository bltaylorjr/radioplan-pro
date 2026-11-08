// Standards bodies, training and licensing for low-voltage work, readable offline in the Library.
// Every web address here was opened on its own official site on the date below; summaries are general
// guidance. The adopted code edition and the local AHJ decide what applies on a job.
import type { SpecItem } from './speclib';
import type { StateCode } from '../types';

export const BODIES_CHECKED = '2026-11-08';
export const BODY_CATEGORY = 'Codes, training & licensing';

export interface Body {
  id: string; short: string; name: string; sub: 'Codes & standards' | 'Training & certification' | 'Equipment listing' | 'Licensing' | 'Authority'; state?: StateCode;
  what: string; documents?: string[]; training?: string[]; credentials?: string[]; systems: string; tips?: string;
  /** Official pages: [title, url]. The first one is the main link. */
  links: [string, string][];
}

export const BODIES: Body[] = [
  { id: 'nfpa', short: 'NFPA', name: 'National Fire Protection Association', sub: 'Codes & standards',
    what: 'Writes the National Electrical Code (NFPA 70) and the fire alarm, signaling and emergency communications codes that most low-voltage work is inspected against.',
    documents: ['NFPA 70, National Electrical Code: Art. 725 (Class 1, 2, 3 circuits; much of it moves to Art. 722/724 in the 2023 edition), Art. 760 (fire alarm), Art. 770 (optical fiber), Art. 800–840 (communications, CATV, network-powered broadband), Art. 640 (audio), Art. 250 (grounding and bonding)', 'NFPA 72, National Fire Alarm and Signaling Code (fire alarm, mass notification Ch. 24, emergency communications, inspection and testing Ch. 14, audibility and intelligibility Ch. 18)', 'NFPA 1225 (emergency responder radio coverage, formerly in NFPA 1221)', 'NFPA 101, Life Safety Code (where adopted)', 'NFPA 99 (health care facilities, nurse call and alarms)'],
    training: ['NFPA online and instructor-led courses on NFPA 70 and NFPA 72', 'Free read-only access to current editions of NFPA codes (account required)'],
    systems: 'All systems; especially fire alarm, mass notification, ERCES/DAS, cabling and power-limited wiring.',
    tips: 'Use the edition your state adopted, not the newest one. The adopted-code list for the project address is on the Codes page.',
    links: [['NFPA home', 'https://www.nfpa.org/en'], ['Free access to NFPA codes (read-only)', 'https://www.nfpa.org/for-professionals/codes-and-standards/list-of-codes-and-standards/free-access'], ['NFPA 70 (NEC) document page', 'https://www.nfpa.org/codes-and-standards/nfpa-70-standard-development/70'], ['NFPA 72 document page', 'https://www.nfpa.org/codes-and-standards/nfpa-72-standard-development/72'], ['NFPA 1225 document page', 'https://www.nfpa.org/codes-and-standards/nfpa-1225-standard-development/1225'], ['NFPA training', 'https://www.nfpa.org/for-professionals/training-for-me']] },
  { id: 'bicsi', short: 'BICSI', name: 'BICSI (Building Industry Consulting Service International)', sub: 'Training & certification',
    what: 'The main training and certification body for structured cabling and ICT design and installation. Publishes design and installation manuals used across the industry.',
    documents: ['Telecommunications Distribution Methods Manual (TDMM), the RCDD reference', 'Information Technology Systems Installation Methods Manual (ITSIMM)', 'Outside Plant Design Reference Manual', 'ANSI/BICSI standards such as BICSI 002 (data centers)'],
    training: ['Installer and technician courses (copper, fiber, pathways, testing)', 'RCDD and design courses', 'In-person, virtual and blended classes'],
    credentials: ['Installer 1 (INST1), Installer 2 Copper / Fiber, Technician (TECH)', 'RCDD (Registered Communications Distribution Designer)', 'OSP (Outside Plant Designer)', 'DCDC (Data Center Design Consultant)', 'RTPM (Registered Telecommunications Project Manager)'],
    systems: 'Structured cabling, fiber, network/PoE, DAS pathways; any system that rides on the cabling plant.',
    links: [['BICSI home', 'https://www.bicsi.org/'], ['TDMM, 15th edition', 'https://www.bicsi.org/trainings-career-advancement/technical-manuals-and-publications/telecommunications-distribution-methods-manual-tdmm-15th-edition/'], ['BICSI certification types', 'https://www.bicsi.org/certifications/certification-types/'], ['BICSI training catalog', 'https://www.bicsi.org/trainings-career-advancement/training-catalog/']] },
  { id: 'tia', short: 'TIA', name: 'Telecommunications Industry Association', sub: 'Codes & standards',
    what: 'Writes the ANSI/TIA cabling standards that set cable categories, distances, pathways, labeling, grounding and testing.',
    documents: ['ANSI/TIA-568 series: cabling (568.0 generic, 568.1 commercial, 568.2 balanced twisted-pair, 568.3 optical fiber)', 'ANSI/TIA-569: pathways and spaces (telecom rooms, conduit, fill, bends)', 'ANSI/TIA-606: administration and labeling', 'ANSI/TIA-607: bonding and grounding (TMGB, TBB, TGB)', 'ANSI/TIA-942: data centers', 'ANSI/TIA-222: antenna supporting structures (towers)', 'TSB-184: PoE and cable bundles'],
    training: ['TIA does not certify installers; BICSI, ETA and the FOA train to these standards'],
    systems: 'Structured cabling, fiber, network/PoE, towers (TIA-222), grounding.',
    tips: 'TIA standards are sold through authorized distributors; check the TIA standards page for the current editions.',
    links: [['TIA home', 'https://tiaonline.org/'], ['TIA standards', 'https://tiaonline.org/our-work/standards/']] },
  { id: 'ul', short: 'UL', name: 'UL Solutions and UL Standards & Engagement', sub: 'Equipment listing',
    what: 'Tests and lists equipment, and writes the UL standards that equipment is listed to. Codes require "listed" equipment; Product iQ shows what a product is listed for.',
    documents: ['UL 864 (fire alarm control units)', 'UL 268 / 268A (smoke detectors)', 'UL 1971 (visible signals)', 'UL 2572 (mass notification)', 'UL 2524 (in-building two-way emergency radio, BDAs)', 'UL 294 (access control)', 'UL 1076 / 2050 (burglar alarm, alarm monitoring)', 'UL 444 / 1666 / 910 (communications cable, riser, plenum fire tests)', 'UL 497 (protectors)', 'UL 1069 (nurse call)'],
    training: ['UL Solutions learning and development courses'],
    systems: 'All systems: check every panel, device, cable and power supply is listed for the use.',
    tips: 'Free Product iQ account: search the model, check the listing category and any conditions of use.',
    links: [['UL Solutions home', 'https://www.ul.com/'], ['UL Product iQ (certification directory)', 'https://productiq.ulprospector.com/'], ['Buy UL standards', 'https://www.shopulstandards.com/'], ['UL Solutions training', 'https://www.ul.com/services/learning-and-development']] },
  { id: 'nicet', short: 'NICET', name: 'National Institute for Certification in Engineering Technologies', sub: 'Training & certification',
    what: 'Certifies fire alarm technicians and designers by level (I to IV). Many AHJs and specifications require NICET levels for fire alarm design, installation supervision and testing.',
    credentials: ['Fire Alarm Systems, Levels I–IV (based on NFPA 72; candidate handbook and content outlines on the NICET page)'],
    training: ['NICET tests; training comes from distributors, manufacturers, NFPA and private schools'],
    systems: 'Fire alarm, mass notification, voice evacuation.',
    tips: 'NICET\'s Video Security Systems program was discontinued at the end of 2023; do not list it as a current credential.',
    links: [['NICET home', 'https://www.nicet.org/'], ['NICET Fire Alarm Systems', 'https://www.nicet.org/certification-programs/electrical-and-mechanical-systems/fire-alarm-systems/']] },
  { id: 'esa', short: 'ESA', name: 'Electronic Security Association', sub: 'Training & certification',
    what: 'Trade association for security and life-safety integrators. Its National Training School (NTS) trains alarm, access control, video and fire alarm technicians and sales staff; some states accept NTS courses for licensing and continuing education.',
    training: ['NTS courses: Certified Alarm Technician levels, fire alarm, access control, video, sales and management'],
    credentials: ['NTS certifications (see the course catalog)'],
    systems: 'Security/intrusion, access control, CCTV, fire alarm, monitoring.',
    links: [['ESA home', 'https://esaweb.org/'], ['ESA National Training School', 'https://esaweb.org/training/'], ['NTS course catalog', 'https://courses.esaweb.org/'], ['NTS certifications', 'https://courses.esaweb.org/certifications/']] },
  { id: 'icc', short: 'ICC', name: 'International Code Council', sub: 'Codes & standards',
    what: 'Writes the building and fire codes (IBC, IFC, IRC) that states adopt with amendments. The IFC holds the emergency responder radio coverage (ERRC) rules and fire alarm "where required" rules.',
    documents: ['International Building Code (IBC) Ch. 9', 'International Fire Code (IFC) Section 510 (ERRC) and Ch. 9 (fire alarm where required)', 'State codes based on them (NC State Building Code, SC, GA, TN adoptions)'],
    training: ['ICC certification exams for inspectors and plans examiners'],
    systems: 'Fire alarm (where required), ERCES/DAS, access control egress rules (IBC 1010).',
    links: [['ICC home', 'https://www.iccsafe.org/'], ['ICC Digital Codes (read-only code text)', 'https://codes.iccsafe.org/']] },
  { id: 'ahj', short: 'AHJ', name: 'Authority Having Jurisdiction (inspector, fire marshal, building official)', sub: 'Authority',
    what: 'The office that has the final say on a job: it decides which code edition applies, approves plans and permits, inspects, and accepts the system. Usually the city or county building inspections office and the fire marshal; the state for state-owned buildings.',
    training: ['Ask the AHJ for local amendments, submittal checklists and inspection request steps before bidding'],
    systems: 'All systems.',
    tips: 'Find the AHJ offices for the project address on Contacts & Web Resources. Get answers in writing.',
    links: [['NC Office of State Fire Marshal', 'https://www.ncosfm.gov/'], ['SC State Fire', 'https://statefire.llr.sc.gov/']] },
  { id: 'nc-beec', short: 'NC BEEC', name: 'NC State Board of Examiners of Electrical Contractors', sub: 'Licensing', state: 'NC',
    what: 'Licenses electrical contractors in North Carolina, including the special restricted low-voltage classifications (SP-LV low voltage, SP-FA/LV fire alarm and low voltage). Licensees must complete yearly continuing education.',
    credentials: ['Limited, Intermediate and Unlimited electrical contractor licenses', 'Special restricted licenses including SP-LV and SP-FA/LV (check the board for the full list and exam requirements)'],
    training: ['Board-approved continuing education courses (CE credit search on the board site)'],
    systems: 'All low-voltage systems installed in North Carolina.',
    tips: 'NC also licenses alarm businesses separately through the NC Alarm Systems Licensing Board (NC Department of Justice).',
    links: [['NC BEEC home', 'https://www.ncbeec.org/'], ['NC BEEC continuing education credit search', 'https://arls-public.ncbeec.org/Public/CECreditsSearch'], ['NC Office of State Fire Marshal', 'https://www.ncosfm.gov/']] },
  { id: 'sc-clb', short: 'SC CLB', name: 'SC Contractor\'s Licensing Board (LLR)', sub: 'Licensing', state: 'SC',
    what: 'Licenses general and mechanical contractors in South Carolina, and burglar alarm and fire alarm contractors under the Alarm System Business Act. Electrical work is a mechanical-contractor classification.',
    credentials: ['Mechanical contractor classifications (including electrical)', 'Burglar alarm and fire alarm contractor licenses'],
    systems: 'Fire alarm, burglar alarm/security, electrical and low-voltage work in South Carolina.',
    links: [['SC Contractor\'s Licensing Board', 'https://llr.sc.gov/clb/'], ['SC State Fire', 'https://statefire.llr.sc.gov/']] },
  { id: 'ga-cilb', short: 'GA CILB', name: 'GA Construction Industry Licensing Board, Division of Low Voltage Contractors', sub: 'Licensing', state: 'GA',
    what: 'Part of the Georgia Secretary of State\'s professional licensing boards. Licenses low-voltage contractors by class (alarm, telecommunications, general, unrestricted) and electrical contractors in a separate division.',
    credentials: ['Low voltage contractor classes (check the board for current class names and scope)', 'Electrical contractor Class I / Class II'],
    systems: 'All low-voltage systems installed in Georgia.',
    tips: 'Start at the Secretary of State site and open Professional Licensing Boards, Construction Industry.',
    links: [['Georgia Secretary of State', 'https://sos.ga.gov/']] },
  { id: 'tn-blc', short: 'TN BLC', name: 'TN Board for Licensing Contractors', sub: 'Licensing', state: 'TN',
    what: 'Licenses contractors in Tennessee, including limited licensed electricians (LLE). Alarm contractors register with the separate Alarm Systems Contractors Board.',
    credentials: ['Contractor classifications (electrical and low-voltage classes are listed on the board site)', 'Limited Licensed Electrician (LLE)', 'Alarm systems contractor, qualifying agent and employee registration (Alarm Systems Contractors Board)'],
    training: ['Alarm Systems Contractors Board training and continuing education requirements'],
    systems: 'All low-voltage and alarm systems installed in Tennessee.',
    links: [['TN Board for Licensing Contractors', 'https://www.tn.gov/commerce/regboards/contractors.html'], ['TN Alarm Systems Contractors', 'https://www.tn.gov/commerce/regboards/alarm.html'], ['TN license verification', 'https://search.cloud.commerce.tn.gov/']] },
  { id: 'va-boc', short: 'VA DPOR', name: 'Virginia Board for Contractors (DPOR)', sub: 'Licensing', state: 'VA',
    what: 'Licenses contractors in Virginia. A license has a class (A, B or C, by contract size) and a classification or specialty (the type of work). The electrical classification (ELE) covers all work under the electrical provisions of the USBC, including the electronic/communication service (ESC) and fire alarm systems (FAS) specialties.',
    credentials: ['Class A, B and C contractor licenses (firms and sole proprietors)', 'ELE electrical, with ESC electronic/communication service and FAS fire alarm systems specialties (18VAC50-22-20)', 'Tradesman certifications, including electricians'],
    training: ['Board-approved pre-license and continuing education (Education Section, 804-367-2224)'],
    systems: 'All low-voltage, communications and fire alarm systems installed in Virginia.',
    tips: 'Alarm and electronic security businesses and technicians may also need private security registration with the Virginia Department of Criminal Justice Services (DCJS); confirm with DCJS before starting security work.',
    links: [['VA Board for Contractors', 'https://www.dpor.virginia.gov/Boards/Contractors'], ['DPOR license lookup', 'https://www.dpor.virginia.gov/LicenseLookup'], ['Contractor classifications (18VAC50-22-20)', 'https://law.lis.virginia.gov/admincode/title18/agency50/chapter22/section20/'], ['Virginia State Fire Marshal\'s Office', 'https://www.vdfp.virginia.gov/about-us/virginia-state-fire-marshals-office/']] },
  { id: 'foa', short: 'FOA', name: 'The Fiber Optic Association', sub: 'Training & certification',
    what: 'Non-profit that certifies fiber optic technicians and approves fiber training schools. Large free online fiber reference.',
    credentials: ['CFOT (Certified Fiber Optic Technician) and specialist certifications'],
    systems: 'Fiber optics, OSP, DAS fiber.',
    links: [['FOA home', 'https://www.thefoa.org/'], ['FOA certifications', 'https://www.thefoa.org/Certs.htm'], ['FOA-approved schools', 'https://www.thefoa.org/foa_aprv.htm']] },
  { id: 'eta', short: 'ETA', name: 'ETA International', sub: 'Training & certification',
    what: 'Vendor-neutral technician certifications, including fiber, data cabling and FCC commercial radio license (GROL) testing.',
    credentials: ['Fiber optics and data cabling certifications', 'FCC GROL exam administration'],
    systems: 'Cabling, fiber, two-way radio, DAS.',
    links: [['ETA home', 'https://www.etai.org/index.html'], ['ETA fiber and cabling certifications', 'https://www.etai.org/fiber_cabling.html'], ['ETA FCC licenses', 'https://www.etai.org/fcc_licenses.html']] },
  { id: 'avixa', short: 'AVIXA', name: 'AVIXA (Audiovisual and Integrated Experience Association)', sub: 'Training & certification',
    what: 'Audio-visual industry association and the CTS certification body. Publishes AV standards such as audio coverage uniformity.',
    credentials: ['CTS, CTS-I (installation), CTS-D (design)'],
    systems: 'Pro sound, paging, AV.',
    links: [['AVIXA home', 'https://www.avixa.org/']] },
  { id: 'asis', short: 'ASIS', name: 'ASIS International', sub: 'Training & certification',
    what: 'Security management association; certifications for security professionals and physical security design.',
    credentials: ['CPP, PSP (physical security), PCI, APP'],
    systems: 'Security, access control, CCTV (design and consulting).',
    links: [['ASIS home', 'https://www.asisonline.org/']] },
  { id: 'sia', short: 'SIA', name: 'Security Industry Association', sub: 'Training & certification',
    what: 'Security manufacturers and integrators association; standards such as OSDP for access control.',
    credentials: ['SICC (Security Industry Cybersecurity Certification)', 'CSPM (Certified Security Project Manager)'],
    systems: 'Access control, CCTV, security.',
    links: [['SIA home', 'https://www.securityindustry.org/']] },
  { id: 'ieee', short: 'IEEE', name: 'IEEE Standards Association', sub: 'Codes & standards',
    what: 'Writes the Ethernet standards (IEEE 802.3, including Power over Ethernet) and Wi-Fi (802.11).',
    documents: ['IEEE 802.3af / at / bt (PoE)', 'IEEE 802.11 (Wi-Fi)'],
    systems: 'Network/PoE, Wi-Fi, IP cameras, IP intercom and paging.',
    links: [['IEEE Standards Association', 'https://standards.ieee.org/'], ['Buy or access IEEE standards', 'https://standards.ieee.org/access-standards/']] },
  { id: 'ansi', short: 'ANSI', name: 'American National Standards Institute', sub: 'Codes & standards',
    what: 'Accredits US standards developers (NFPA, TIA, UL, BICSI) and sells many of their standards through its webstore.',
    systems: 'All systems.',
    links: [['ANSI Webstore', 'https://webstore.ansi.org/']] },
];

const join = (a?: string[]) => (a?.length ? a.map((x) => `• ${x}`).join('\n') : undefined);
export const bodyById = (specId: string) => BODIES.find((b) => `body-${b.id}` === specId);
/** Library entries (readable offline). */
export function bodySpecs(): SpecItem[] {
  return BODIES.map((b) => {
    const specs: Record<string, string> = { 'What it is': b.what };
    const d = join(b.documents), t = join(b.training), c = join(b.credentials);
    if (d) specs['Key documents'] = d; if (t) specs['Training'] = t; if (c) specs['Credentials'] = c;
    specs['Systems'] = b.systems;
    if (b.state) specs['State'] = b.state;
    return { id: `body-${b.id}`, category: BODY_CATEGORY, sub: b.sub, brand: b.short, model: b.name, specs, kind: 'Standard', reference: `Official site, checked ${BODIES_CHECKED}`, notes: b.tips } as SpecItem;
  });
}
