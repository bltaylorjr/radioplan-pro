// The app's main menu, in one place. App.tsx, the custom-project page picker, page labels,
// help and the "Find a tool" search all read this list.
//
// To add a page: add one line to MENU_PAGES (id, label, group, words people might search for),
// then add the page component under the same id in PAGE_ELEMENTS in App.tsx, and give it a
// help topic in src/help/content.ts (page: '<id>'). A test checks all three stay in step.

export interface MenuGroup {
  id: string;
  /** Heading shown in the menu. */
  title: string;
  /** One plain sentence: what this part of the menu is for. */
  hint: string;
  /** Workflow groups get step numbers and Next / Skip; reference groups do not. */
  steps: boolean;
}

export interface MenuPage {
  id: string;
  label: string;
  group: string;
  /** Extra words for "Find a tool" (the label and help topic are searched too). */
  keywords?: string;
}

/** Menu order follows the project lifecycle: set up, survey, design, codes, equipment and materials,
 *  install, test, service and repair, then reports. Reference tools and projects/settings sit below. */
export const MENU_GROUPS: MenuGroup[] = [
  { id: 'start', title: 'Project setup', hint: 'Who the job is for, what systems it has, and where it is.', steps: true },
  { id: 'survey', title: 'Site survey', hint: 'Notes, photos, maps, terrain and signal readings from the site.', steps: true },
  { id: 'lv', title: 'Design: low-voltage systems', hint: 'Floor plans, auto-design and models, fire alarm, emergency radio, indoor coverage and DAS, power and grounding.', steps: true },
  { id: 'rf', title: 'Design: radio & antennas', hint: 'Frequencies, radios and antennas, path, coverage, aiming and interference.', steps: true },
  { id: 'codes', title: 'Codes, permits & drawings', hint: 'Code checks for the address and the drawing set for the permit.', steps: true },
  { id: 'equip', title: 'Equipment & materials', hint: 'Pick the equipment from the specifications library and build the materials list.', steps: true },
  { id: 'install', title: 'Installation', hint: 'Step-by-step install guides with wiring diagrams and checklists.', steps: true },
  { id: 'test', title: 'Testing & commissioning', hint: 'Acceptance tests, readings and the testing checklist.', steps: true },
  { id: 'repair', title: 'Service, troubleshooting & repair', hint: 'Service and PM visits, finding faults and fixing them.', steps: true },
  { id: 'closeout', title: 'Reports & closeout', hint: 'The finished build, proposals, reports and the closeout package. Mark the project complete when it is done.', steps: true },
  { id: 'tools', title: 'Tools & reference', hint: 'Calculators, meters and analyzers, directions, contacts, weather and training. Open any time.', steps: false },
  { id: 'files', title: 'Projects & settings', hint: 'Saved projects, backups, updates, users and sign-in, syncing devices and your settings.', steps: false },
];

export const MENU_PAGES: MenuPage[] = [
  { id: 'company', label: 'Company & Project', group: 'start', keywords: 'client customer name address units miles feet logo' },
  { id: 'systems', label: 'Project Systems & Toolkits', group: 'start', keywords: 'project type fire alarm cctv access control cabling fiber custom pick pages' },
  { id: 'locate', label: 'Find Location & Auto-Plan', group: 'start', keywords: 'address search coordinates gps best tower spot' },
  { id: 'sites', label: 'Site Data & GPS', group: 'start', keywords: 'site a site b tower height gps nmea csv import' },

  { id: 'fieldnotes', label: 'Field Notes & Photos', group: 'survey', keywords: 'photo camera note punch list site survey walk' },
  { id: 'photosurvey', label: 'Photo Site Survey', group: 'survey', keywords: 'photo survey horizon towers obstructions heat map pictures exif compass' },
  { id: 'terrain', label: 'Map & Terrain', group: 'survey', keywords: '3d tilt view relay draw lines measure azimuth satellite topo towers offline area' },
  { id: 'wifi', label: 'Wi-Fi & Network Survey', group: 'survey', keywords: 'wifi wireless access point heat map scan' },
  { id: 'signal', label: 'Live Signal Readings', group: 'survey', keywords: 'live signal meter reading bluetooth dbm grid test erces walk test import g-nettrack' },
  { id: 'survey', label: 'Drive Test & Calibration', group: 'survey', keywords: 'drive test readings signal measured calibrate' },

  { id: 'floorplan', label: 'Floor Plan to 2D / 3D', group: 'lv', keywords: 'floor plan blueprint upload pdf jpg png dxf scan photo drawing 2d 3d model trace walls doors windows rooms area scale calibrate to scale custom scale sheet size print draw create plan drag drop picture in picture layers' },
  { id: 'autodesign', label: 'Auto-Design & 3D Model', group: 'lv', keywords: 'recommend equipment layout floor plan 3d' },
  { id: 'models', label: '2D & 3D Models with Layers', group: 'lv', keywords: 'layers 2d 3d plan model building materials walls floors glass concrete block brick rf loss echo fire rating firestop camera view heat map scenario dxf' },
  { id: 'campus', label: 'Multi-Building Site & Campus', group: 'lv', keywords: 'campus site multi building outbuilding fiber underground aerial conduit handhole pole wireless bridge point to point fresnel cable schedule site plan bom' },
  { id: 'alarm', label: 'Fire Alarm & Batteries', group: 'lv', keywords: 'nfpa 72 battery standby nac voltage drop mass notification' },
  { id: 'erces', label: 'Emergency Radio (ERCES / BDA)', group: 'lv', keywords: 'bda das public safety donor antenna aim' },
  { id: 'indoor', label: 'Indoor Coverage & DAS', group: 'lv', keywords: 'indoor walls floor plan das antennas' },
  { id: 'solar', label: 'Solar & DC Power', group: 'lv', keywords: 'solar panel battery charge controller call box' },
  { id: 'grounding', label: 'Grounding & Structure', group: 'lv', keywords: 'ground rod bonding lightning surge' },

  { id: 'radioref', label: 'RadioReference Frequencies', group: 'rf', keywords: 'radioreference login log in download frequencies talkgroups county progress' },
  { id: 'fcc', label: 'FCC Towers & Licenses', group: 'rf', keywords: 'fcc asr uls license tower registration booster registration' },
  { id: 'equipment', label: 'Equipment & Link Budget', group: 'rf', keywords: 'radio antenna coax power eirp aim at' },
  { id: 'path', label: 'Path Profile / LOS / Fresnel', group: 'rf', keywords: 'line of sight fresnel profile hill true scale azimuth' },
  { id: 'coverage', label: 'Coverage Prediction', group: 'rf', keywords: 'coverage map heat map signal strength' },
  { id: 'optimize', label: 'Tilt, Azimuth & Power', group: 'rf', keywords: 'downtilt beam side view true scale 3d beam aim' },
  { id: 'network', label: 'Multi-site & Interference', group: 'rf', keywords: 'interference multiple sites best server' },
  { id: 'scenarios', label: 'Scenarios & Compare', group: 'rf', keywords: 'compare runs what if' },
  { id: 'view3d', label: '3D Model', group: 'rf', keywords: '3d terrain tower fresnel model' },
  { id: 'lfhf', label: 'LF / HF Systems', group: 'rf', keywords: 'hf lf skywave nvis' },

  { id: 'compliance', label: 'Code Compliance', group: 'codes', keywords: 'code nec nfpa violations warnings ahj permit' },
  { id: 'faa', label: 'FAA Height Check', group: 'codes', keywords: 'faa part 77 airport height notice 7460 obstruction' },
  { id: 'blueprints', label: 'Blueprints & Drawing Sets', group: 'codes', keywords: 'drawings sheets permit submittal north arrow' },

  { id: 'library', label: 'Specifications Library', group: 'equip', keywords: 'specs standards datasheets manuals equipment selection models' },
  { id: 'materials', label: 'Materials List & Estimate', group: 'equip', keywords: 'bill of materials bom parts quantity order cost costing estimate estimating price pricing unit cost labor budget over budget total search online parts stock inventory availability' },
  { id: 'vendors', label: 'Vendors', group: 'equip', keywords: 'vendor vendors supplier distributor dealer supply house contact account terms sales rep phone email add field stock inventory availability search' },

  { id: 'install', label: 'Installation Guides', group: 'install', keywords: 'install wiring diagram how to step by step' },

  { id: 'testing', label: 'Final Testing', group: 'test', keywords: 'test commissioning sweep acceptance' },

  { id: 'service', label: 'Service & Maintenance Resources', group: 'repair', keywords: 'service call pm preventive maintenance inspection log' },
  { id: 'troubleshoot', label: 'Troubleshooting Wizard', group: 'repair', keywords: 'troubleshoot fault not working repair fix' },
  { id: 'assets', label: 'Equipment & Asset Tags', group: 'repair', keywords: 'asset tag barcode qr scan serial warranty pm due equipment list' },

  { id: 'buildout', label: 'Project Build Output', group: 'closeout', keywords: 'final output build sheet index cover sheet live progress schedules room door window device schedule picture in picture' },
  { id: 'reports', label: 'Reports, Proposals & Closeout', group: 'closeout', keywords: 'report proposal quote pdf word closeout package' },

  { id: 'calculators', label: 'Calculators', group: 'tools', keywords: 'calculator azimuth calculator voltage drop battery reset apply to fields' },
  { id: 'devices', label: 'Bluetooth & Wi-Fi Devices', group: 'tools', keywords: 'bluetooth wifi device meter gps receiver laser distance scanner connect' },
  { id: 'spectrum', label: 'RF Spectrum Analyzer', group: 'tools', keywords: 'spectrum analyzer rf sdr tinysa rtl-sdr hackrf usb receiver sweep trace waterfall markers peak channel power occupied bandwidth acpr noise floor interference hunt intermod bda oscillation uplink noise donor downlink limit mask calibrate dbm dbuv field strength' },
  { id: 'audio', label: 'Audio & Acoustic Analyzer', group: 'tools', keywords: 'audio acoustic analyzer sound level meter spl dba leq lmax l90 rta octave third octave fft rt60 reverberation edt t20 t30 sti intelligibility speech transmission index nfpa 72 audibility thd distortion noise criteria nc background noise microphone calibration umik calibrator 94 db calibration library cal file frd mic curve dayton imm-6 emm-6 iphone phone mic generator pink noise sine sweep impulse response benchmark certification' },
  { id: 'directions', label: 'Map & Directions', group: 'tools', keywords: 'directions drive route navigate' },
  { id: 'contacts', label: 'Contacts & Web Resources', group: 'tools', keywords: 'phone fire marshal inspector ahj' },
  { id: 'weather', label: 'Weather & Radar (NOAA)', group: 'tools', keywords: 'weather radar forecast noaa national weather service nws rain storm thunder lightning wind gust temperature cold heat alerts warning watch advisory tornado hurricane snow ice current conditions hourly 7 day work day tower climb' },
  { id: 'magnetic', label: 'Magnetic Field & Space Weather', group: 'tools', keywords: 'magnetic declination variation compass true north magnetic north wmm world magnetic model noaa ncei dip inclination field strength nanotesla prediction forecast space weather geomagnetic storm kp solar flare radio blackout gps aurora swpc' },
  { id: 'mappacks', label: 'Offline Map Packs', group: 'tools', keywords: 'offline maps download area map pack no internet' },
  { id: 'theory', label: 'Low-Voltage & RF Design Principles', group: 'tools', keywords: 'training basics theory learn low voltage principles rf radio frequency propagation antennas link budget decibels modulation transmission lines vswr fresnel interference noise shielding emi power design concepts' },

  { id: 'projects', label: 'Projects & Storage', group: 'files', keywords: 'save open backup history delete check for updates automatic care' },
  { id: 'users', label: 'Users & Sign-in', group: 'files', keywords: 'login log in sign in sign out user users account accounts password pin fingerprint face windows hello biometric touch id recovery code forgot reset password private lock encrypt share collaborate work together team coworker' },
  { id: 'sync', label: 'Sync Devices', group: 'files', keywords: 'sync phone tablet share qr bluetooth' },
  { id: 'settings', label: 'User Settings', group: 'files', keywords: 'settings turn tools on off hide show data check preferences radioreference app key' },
];

export const groupOf = (id: string): MenuGroup | undefined => MENU_GROUPS.find((g) => g.id === MENU_PAGES.find((p) => p.id === id)?.group);

/** Menu heading for a group, numbered when it is part of the job workflow ("3 · Design: low-voltage systems"). */
export function groupHeading(g: MenuGroup, numbered = true): string {
  if (!g.steps || !numbered) return g.title;
  return `${MENU_GROUPS.filter((x) => x.steps).indexOf(g) + 1} · ${g.title}`;
}

/** Pages in menu order (group order, then page order inside each group). */
export const MENU_ORDER: MenuPage[] = MENU_GROUPS.flatMap((g) => MENU_PAGES.filter((p) => p.group === g.id));

/** Whether a page is a numbered step (pages under Tools & reference / Projects & settings are not). */
export const isStepPage = (id: string) => !!groupOf(id)?.steps;
