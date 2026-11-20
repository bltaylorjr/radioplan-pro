// Outdoor warning sirens (wide-area mass notification): siren models (current and legacy), the federal,
// state and local codes, laws and ordinances that apply, test procedures and test programs.
//
// Everything here is plain data (no functions), so it ships inside the app for offline use and can be
// refreshed online as the "sirens" content pack (src/engine/contentpacks.ts). The math lives in
// src/engine/sirens.ts.
//
// Sources: every figure below is from the page named in `src` (opened on SIRENS_CHECKED). Rated output is the
// maker's published value in dBC at 100 ft on the siren's axis; ratings were measured by each maker in its own way.
// Confirm the exact model, tone and rating on the current manufacturer datasheet before you design or buy.
// Code citations: a licensed PE and the authority having jurisdiction (AHJ) must verify them; amendment text is
// not bundled. Entries marked checked: false could not be read in full here and say "confirm in code book".

export const SIRENS_CHECKED = '2026-11-20';

export type SirenKind = 'Rotating mechanical' | 'Omni mechanical' | 'Rotating electronic' | 'Omni electronic' | 'Directional electronic' | 'Speaker array (voice)';
export type SirenStatus = 'Current' | 'Legacy' | 'Special order';

export interface SirenModel {
  id: string; maker: string; model: string; kind: SirenKind;
  /** Rated output, dBC at 100 ft. null = not published on the pages read; use the datasheet. */
  dbc100: number | null;
  signals: string; voice: boolean; power: string; years: string; status: SirenStatus;
  /** For legacy units: what replaced it or a migration path. */
  replacedBy?: string; notes?: string;
  /** Key into SIREN_SOURCES. */
  src: string;
}

/** Pages the model data came from (opened 2026-11-20). */
export const SIREN_SOURCES: Record<string, [string, string]> = {
  fs508: ['Air Raid Sirens wiki: Federal Signal 508-128', 'https://wiki.airraidsirens.net/508-128'],
  fs508m: ['Federal Signal: 508-128 product page', 'https://www.fedsig.com/?p=15097'],
  fs2001: ['Federal Signal 2001-130 release (Thomasnet, 2007)', 'https://news.thomasnet.com/fullstory/outdoor-warning-siren-produces-130-db-at-100-ft-503825'],
  fsecl: ['Air Raid Sirens wiki: Federal Signal Eclipse', 'https://wiki.airraidsirens.net/ECLIPSE'],
  fsmod: ['Air Raid Sirens wiki: Federal Signal Modulator', 'https://wiki.airraidsirens.net/Federal_Signal_Modulator'],
  whelen: ['Air Raid Sirens wiki: Whelen WPS-2900', 'https://wiki.airraidsirens.net/WPS-2900'],
  tempest: ['Air Raid Sirens wiki: American Signal Tempest', 'https://wiki.airraidsirens.net/Tempest'],
  asc: ['Air Raid Sirens wiki: American Signal Corporation', 'https://wiki.airraidsirens.net/ASC'],
  aca: ['Wikipedia: sirens built by Alerting Communicators of America', 'https://en.wikipedia.org/wiki/ACA_P-50'],
  ati: ['Wikipedia: ATI HPSS', 'https://en.wikipedia.org/wiki/ATI_HPSS'],
  sentry: ['Air Raid Sirens wiki: Sentry Siren', 'https://wiki.airraidsirens.net/Sentry_Siren'],
  s10v2t: ['Air Raid Sirens wiki: Sentry 10V2T', 'https://wiki.airraidsirens.net/10V2T'],
};

const FS = 'Federal Signal', WH = 'Whelen', AS = 'American Signal (ASC)', SE = 'Sentry Siren', ACA = 'Alerting Communicators of America (ACA)';
const tones3 = 'Steady (alert), wail (attack), fast wail';
export const SIREN_MODELS: SirenModel[] = [
  // Federal Signal
  { id: 'fs-2001-130', maker: FS, model: '2001-130', kind: 'Rotating mechanical', dbc100: 130, signals: tones3, voice: false, power: '120 V AC with battery backup cabinet, or 240 V AC/DC cabinet', years: '2007–', status: 'Current', src: 'fs2001' },
  { id: 'fs-508-128', maker: FS, model: '508-128', kind: 'Rotating mechanical', dbc100: 128, signals: tones3, voice: false, power: '48 V DC motor; AC or solar charged, battery backup', years: '2011–', status: 'Current', notes: 'Replaced the Equinox.', src: 'fs508m' },
  { id: 'fs-eclipse8', maker: FS, model: 'Eclipse8', kind: 'Omni mechanical', dbc100: 115, signals: 'Single tone (about 500 Hz): steady and wail', voice: false, power: '48 V DC motor; solar or AC rectifier, battery backup', years: '2005–', status: 'Current', notes: 'Line range 107–115 dBC.', src: 'fsecl' },
  { id: 'fs-eclipsenh', maker: FS, model: 'EclipseNH (no horns)', kind: 'Omni mechanical', dbc100: 107, signals: 'Single tone', voice: false, power: 'As Eclipse8', years: '2005–2013 (catalog)', status: 'Special order', src: 'fsecl' },
  { id: 'fs-mod2-mod4032b', maker: FS, model: 'Modulator II MOD4032B', kind: 'Omni electronic', dbc100: 124, signals: 'Tones, prerecorded and live voice (UltraVoice controller)', voice: true, power: '24/48 V DC, battery; AC or solar charged', years: '2013–', status: 'Current', src: 'fsmod' },
  { id: 'fs-mod2-mod8032b', maker: FS, model: 'Modulator II MOD8032B', kind: 'Omni electronic', dbc100: 124, signals: 'Tones, prerecorded and live voice', voice: true, power: '24/48 V DC, battery', years: '2013–', status: 'Current', src: 'fsmod' },
  { id: 'fs-mod2-mod6032b', maker: FS, model: 'Modulator II MOD6032B', kind: 'Omni electronic', dbc100: 123, signals: 'Tones, prerecorded and live voice', voice: true, power: '24/48 V DC, battery', years: '2013–', status: 'Current', src: 'fsmod' },
  { id: 'fs-mod2-mod3012b', maker: FS, model: 'Modulator II MOD3012B', kind: 'Omni electronic', dbc100: 115, signals: 'Tones, prerecorded and live voice', voice: true, power: '24/48 V DC, battery', years: '2013–', status: 'Current', src: 'fsmod' },
  { id: 'fs-mod2-mod1004b', maker: FS, model: 'Modulator II MOD1004B', kind: 'Omni electronic', dbc100: 106, signals: 'Tones, prerecorded and live voice', voice: true, power: '24/48 V DC, battery', years: '2013–', status: 'Current', notes: 'Small campus / plant unit.', src: 'fsmod' },
  { id: 'fs-mod-mod6048', maker: FS, model: 'Modulator MOD6048 (first series)', kind: 'Omni electronic', dbc100: 125, signals: 'Tones and voice', voice: true, power: '24/48 V DC, battery', years: '1990–2013', status: 'Legacy', replacedBy: 'Modulator II (MOD…B) series', src: 'fsmod' },
  { id: 'fs-mod-mod3024', maker: FS, model: 'Modulator MOD3024 (first series)', kind: 'Omni electronic', dbc100: 121, signals: 'Tones and voice', voice: true, power: '24/48 V DC, battery', years: '1990–2013', status: 'Legacy', replacedBy: 'Modulator II (MOD…B) series', src: 'fsmod' },
  { id: 'fs-equinox', maker: FS, model: 'Equinox', kind: 'Rotating mechanical', dbc100: null, signals: tones3, voice: false, power: 'See datasheet', years: 'Before 2011', status: 'Legacy', replacedBy: 'Federal Signal 508-128', src: 'fs508' },
  { id: 'fs-thunderbolt', maker: FS, model: 'Thunderbolt series', kind: 'Rotating mechanical', dbc100: null, signals: 'Steady, wail (blower-supercharged)', voice: false, power: 'AC (blower and rotor motors)', years: 'Cold War era to 1990s', status: 'Legacy', replacedBy: 'Federal Signal 2001-130 or 508-128', notes: 'Many still in service; parts are scarce.', src: 'fs508' },
  { id: 'fs-sth10', maker: FS, model: 'STH-10', kind: 'Omni mechanical', dbc100: null, signals: 'Single tone', voice: false, power: 'AC', years: 'to Dec 2005', status: 'Legacy', replacedBy: 'Federal Signal Eclipse8', src: 'fsecl' },
  // Whelen
  ...([[1, 109], [2, 115], [3, 119], [4, 121], [5, 123], [6, 125], [7, 126], [8, 127], [9, 128], [10, 129]] as const).map(([n, db]): SirenModel => (
    { id: `wh-wps29${String(n).padStart(2, '0')}`, maker: WH, model: `WPS-29${String(n).padStart(2, '0')} (${n} cell${n > 1 ? 's' : ''})`, kind: 'Omni electronic', dbc100: db, signals: 'Tones from the controller, prerecorded and live voice', voice: true, power: '28 V DC battery; AC or solar charged', years: '2006–', status: 'Current', src: 'whelen' })),
  { id: 'wh-omnialert-oa4', maker: WH, model: 'OMNI-ALERT OA4', kind: 'Omni electronic', dbc100: 121, signals: 'Tones (no voice)', voice: false, power: 'DC battery', years: 'from WPS-2800 era', status: 'Current', src: 'whelen' },
  { id: 'wh-wps4000', maker: WH, model: 'WPS-4000 series', kind: 'Omni electronic', dbc100: null, signals: 'Tones and voice', voice: true, power: 'DC battery', years: 'Before WPS-2900', status: 'Legacy', replacedBy: 'Whelen WPS-2900 series', src: 'whelen' },
  // American Signal (ASC)
  { id: 'asc-t112', maker: AS, model: 'Tempest T-112', kind: 'Omni mechanical', dbc100: 113, signals: 'Single tone, 8-port: steady and wail', voice: false, power: '48 V DC; battery (about 30 min), AC rectifier or solar', years: '1998–', status: 'Current', src: 'tempest' },
  { id: 'asc-t121', maker: AS, model: 'Tempest T-121', kind: 'Omni mechanical', dbc100: 121, signals: 'Single tone, 8-port: steady and wail', voice: false, power: '48 V DC; battery (about 30 min), AC rectifier or solar', years: '1998–', status: 'Current', src: 'tempest' },
  { id: 'asc-t128', maker: AS, model: 'Tempest T-128', kind: 'Rotating mechanical', dbc100: 129.9, signals: 'Single tone, 8-port: steady and wail', voice: false, power: '48 V DC; battery (about 30 min), AC rectifier or solar', years: '1998–', status: 'Current', src: 'tempest' },
  { id: 'asc-t135', maker: AS, model: 'Tempest T-135 AC/DC', kind: 'Rotating mechanical', dbc100: 133.5, signals: 'Single tone, 8-port: steady and wail', voice: false, power: '72 V DC (20 hp) with battery backup', years: '2006–', status: 'Current', src: 'tempest' },
  { id: 'asc-iforce', maker: AS, model: 'i-FORCE (STi-800 to STi-3200)', kind: 'Omni electronic', dbc100: null, signals: 'Tones and voice', voice: true, power: '24 V DC battery', years: '2002–', status: 'Current', notes: 'Output depends on the number of drivers; see datasheet.', src: 'asc' },
  { id: 'asc-eclass', maker: AS, model: 'E-Class', kind: 'Directional electronic', dbc100: null, signals: 'Tones and voice', voice: true, power: 'DC battery', years: '2002–', status: 'Current', src: 'asc' },
  { id: 'asc-t135ac', maker: AS, model: 'T-135 AC (ex ACA P-50)', kind: 'Rotating mechanical', dbc100: null, signals: 'Dual tone', voice: false, power: '480 V AC, no battery backup', years: '1981–2007', status: 'Legacy', replacedBy: 'Tempest T-135 AC/DC', notes: 'AC-only: no warning in a power outage.', src: 'tempest' },
  { id: 'asc-al6000', maker: AS, model: 'AL-6000', kind: 'Directional electronic', dbc100: 121, signals: 'Tones and voice', voice: true, power: 'DC battery', years: '1995–2011', status: 'Legacy', replacedBy: 'ASC E-Class or i-FORCE', src: 'asc' },
  { id: 'asc-al8000', maker: AS, model: 'AL-8000', kind: 'Directional electronic', dbc100: 126, signals: 'Tones and voice', voice: true, power: 'DC battery', years: '1995–2011', status: 'Legacy', replacedBy: 'ASC E-Class or i-FORCE', src: 'asc' },
  { id: 'asc-re1600', maker: AS, model: 'RE-1600', kind: 'Rotating electronic', dbc100: 125, signals: 'Tones', voice: false, power: 'DC battery', years: '1995–2007', status: 'Legacy', replacedBy: 'ASC i-FORCE', notes: 'Sources differ: 125 or 126 dB.', src: 'asc' },
  { id: 'asc-om120', maker: AS, model: 'OM-120', kind: 'Omni mechanical', dbc100: 120, signals: 'Steady, wail', voice: false, power: 'DC', years: '1998–2004', status: 'Legacy', replacedBy: 'Tempest T-121', src: 'aca' },
  { id: 'asc-rm130', maker: AS, model: 'RM-130', kind: 'Rotating mechanical', dbc100: 127, signals: 'Steady, wail', voice: false, power: 'DC', years: '1995–2002', status: 'Legacy', replacedBy: 'Tempest T-128', src: 'aca' },
  { id: 'asc-c125', maker: AS, model: 'C-125 / OM-125', kind: 'Omni mechanical', dbc100: 125, signals: 'Steady, wail', voice: false, power: 'AC (50 hp)', years: '1995–2007', status: 'Legacy', replacedBy: 'Tempest T-128 or T-135', src: 'aca' },
  // ATI Systems
  { id: 'ati-hpss16', maker: 'ATI Systems', model: 'HPSS16', kind: 'Speaker array (voice)', dbc100: null, signals: 'Programmed tones, live PA, prerecorded voice', voice: true, power: 'DC battery; AC or solar charged', years: 'Current', status: 'Current', notes: '4 speaker drivers; output per datasheet.', src: 'ati' },
  { id: 'ati-hpss32', maker: 'ATI Systems', model: 'HPSS32', kind: 'Speaker array (voice)', dbc100: null, signals: 'Programmed tones, live PA, prerecorded voice', voice: true, power: 'DC battery; AC or solar charged', years: 'Current', status: 'Current', notes: '8 speaker drivers; output per datasheet.', src: 'ati' },
  { id: 'ati-hpss32r', maker: 'ATI Systems', model: 'HPSS16R / HPSS32R (rotating)', kind: 'Rotating electronic', dbc100: null, signals: 'Tones and voice', voice: true, power: 'DC battery', years: 'Discontinued', status: 'Legacy', replacedBy: 'ATI HPSS16 / HPSS32', src: 'ati' },
  // Sentry Siren
  { id: 'se-3v8', maker: SE, model: '3V8 / 3V8-H-B', kind: 'Omni mechanical', dbc100: 109, signals: 'Single tone', voice: false, power: '5 hp AC; 3V8-H-B 42 V DC (about 30 min)', years: '1980–', status: 'Current', src: 'sentry' },
  { id: 'se-7v8', maker: SE, model: '7V8 / 7V8-B', kind: 'Omni mechanical', dbc100: 112, signals: 'Single tone', voice: false, power: '7.5 hp AC; 7V8-B 72 V DC (about 30 min)', years: '2000–', status: 'Current', src: 'sentry' },
  { id: 'se-10v1t', maker: SE, model: '10V1T', kind: 'Omni mechanical', dbc100: 120, signals: 'Single tone', voice: false, power: 'AC', years: '2022–', status: 'Current', notes: 'Replaced the 10V2T.', src: 'sentry' },
  { id: 'se-14v', maker: SE, model: '14V / 14V-B', kind: 'Omni mechanical', dbc100: 127, signals: 'Single tone', voice: false, power: '15 hp AC; 14V-B 72 V DC (about 30 min)', years: '2015–', status: 'Current', src: 'sentry' },
  { id: 'se-16v1t-b', maker: SE, model: '16V1T-B', kind: 'Omni mechanical', dbc100: 129, signals: 'Warble from two rotors', voice: false, power: 'Two 8 hp 72 V DC motors (about 30 min)', years: '2004–', status: 'Current', src: 'sentry' },
  { id: 'se-40v2t', maker: SE, model: '40V2T', kind: 'Omni mechanical', dbc100: 127, signals: 'Dual tone', voice: false, power: 'AC', years: '1998–', status: 'Current', src: 'sentry' },
  { id: 'se-sv8', maker: SE, model: 'SV-8 Giant Voice', kind: 'Speaker array (voice)', dbc100: 116, signals: 'Tones and voice (STI 0.85–0.95 stated)', voice: true, power: 'DC battery (4000 W)', years: '2023–', status: 'Current', notes: '110–116 dB at 100 ft.', src: 'sentry' },
  { id: 'se-10v2t', maker: SE, model: '10V2T', kind: 'Omni mechanical', dbc100: 120, signals: 'Dual tone', voice: false, power: '208–230/460 V AC, 1 or 3 phase (AC only)', years: '1970s–2022', status: 'Legacy', replacedBy: 'Sentry 10V1T', notes: 'Sources give 120 or 121 dBC. AC only: no warning in a power outage.', src: 's10v2t' },
  { id: 'se-20v2t', maker: SE, model: '20V2T', kind: 'Omni mechanical', dbc100: 125, signals: 'Dual tone', voice: false, power: 'AC', years: '1980–', status: 'Legacy', replacedBy: 'Sentry 14V-B or 16V1T-B', src: 'sentry' },
  { id: 'se-ss3', maker: SE, model: 'SS3 Defender', kind: 'Rotating mechanical', dbc100: 127, signals: 'Single tone', voice: false, power: '8 hp DC or 7.5 hp AC', years: '2001–2011', status: 'Legacy', replacedBy: 'Sentry 14V-B or 16V1T-B', src: 'sentry' },
  { id: 'se-5v', maker: SE, model: '5V', kind: 'Omni mechanical', dbc100: 112, signals: 'Single tone', voice: false, power: 'AC', years: '1980–2000', status: 'Legacy', replacedBy: 'Sentry 7V8', src: 'sentry' },
  { id: 'se-m10', maker: SE, model: 'Model M-10', kind: 'Omni mechanical', dbc100: 115, signals: 'Single or dual tone', voice: false, power: 'AC', years: '1973–1980s', status: 'Legacy', replacedBy: 'Sentry 10V1T', src: 'sentry' },
  // ACA (legacy, still found on poles)
  { id: 'aca-allertor125', maker: ACA, model: 'Allertor 125', kind: 'Rotating mechanical', dbc100: 125, signals: 'Alert (steady), attack (wail)', voice: false, power: 'AC (10/15 hp)', years: '1968–1980', status: 'Legacy', replacedBy: 'ASC Tempest T-128 or equivalent rotating siren', src: 'aca' },
  { id: 'aca-hurricane130', maker: ACA, model: 'Hurricane 130', kind: 'Rotating mechanical', dbc100: 130, signals: 'Alert, attack, hi-lo, pulse (coded)', voice: false, power: 'AC (25/30 hp blower)', years: '1967–1981', status: 'Legacy', replacedBy: 'ASC Tempest T-135 AC/DC', src: 'aca' },
  { id: 'aca-p50', maker: ACA, model: 'P-50 Penetrator', kind: 'Rotating mechanical', dbc100: 135, signals: 'Dual tone', voice: false, power: 'AC (50 hp)', years: '1982–1994', status: 'Legacy', replacedBy: 'ASC Tempest T-135 AC/DC', notes: 'Penetrator family rated 124–135 dB.', src: 'aca' },
  { id: 'aca-cyclone125', maker: ACA, model: 'Cyclone 125', kind: 'Omni mechanical', dbc100: 125, signals: 'Alert, attack, pulse (coded)', voice: false, power: 'AC (50 hp)', years: '1980–1994', status: 'Legacy', replacedBy: 'ASC Tempest T-121 / T-128', src: 'aca' },
  { id: 'aca-banshee', maker: ACA, model: 'Banshee 115 / SuperBanshee', kind: 'Omni mechanical', dbc100: 116, signals: 'Dual tone (112 dB) or single tone (116 dB); SuperBanshee 119 dB', voice: false, power: 'AC', years: '1973–1994', status: 'Legacy', replacedBy: 'ASC Tempest T-112 / T-121', src: 'aca' },
  { id: 'aca-howler', maker: ACA, model: 'Howler', kind: 'Rotating mechanical', dbc100: 123, signals: 'Steady, wail', voice: false, power: 'AC (10 hp)', years: '1972–1989', status: 'Legacy', replacedBy: 'ASC Tempest T-128', src: 'aca' },
];

// ───────────────────────── Planning numbers (with where each comes from) ─────────────────────────
export const CPG = ['FEMA CPG 1-17, Outdoor Warning Systems Guide (March 1, 1980)', 'https://www.doa.nc.gov/documents/files/outdoor-warning-systems-guide-cpg1-17/open'] as [string, string];
export const FEMA2006 = ['FEMA Outdoor Warning Systems Technical Bulletin, Version 2.0 (January 12, 2006)', 'https://doa.nc.gov/documents/files/fema-guide-2006/open'] as [string, string];
export const IEMA = ['Iowa EMA, Outdoor Warning Siren Best Practices (Dec 2015)', 'https://www.johnsoncountyiowa.gov/sites/default/files/2020-01/Outdoor%20Warning%20Siren%20Best%20Practices.pdf'] as [string, string];
export const TWDB = ['Texas Water Development Board, Flash Flood Warning Siren Guide (Jan 2026)', 'https://www.twdb.texas.gov/about/sb3/doc/TWDB-Flash-Flood-Warning-Siren-Guide.pdf'] as [string, string];

export const SIREN_PLANNING = {
  /** Warning must be this much above background noise (FEMA 2006 bulletin; CPG 1-17 says about 9 dB(C)). */
  overAmbientDb: 10,
  /** Signal level CPG 1-17 Figure 1 uses for range (dBC). */
  cpgEdgeDb: 70,
  /** No one should be exposed above this (CPG 1-17 §V-B-5). */
  maxExposureDb: 123,
  /** A 120 dBC device should be mounted at least this high (CPG 1-17 §VI). */
  mount120Ft: 32,
  /** Public alert equipment should project at least 120 dB at 100 ft (FEMA 2006 bulletin). */
  minRatedDb: 120,
  /** Backup power: at least 15 minutes of alerting, recharge to 80% within 24 h (FEMA 2006 bulletin). */
  backupAlertMin: 15, rechargeHours: 24,
  /** Loss per doubling of distance beyond 100 ft, by surroundings. CPG 1-17 Fig. 1: suburban/rural about 10 dB; urban high-rise
   *  about 14 dB (120 dBC reaches 3,700 ft vs 1,200 ft). FEMA 2006: 6 dB spreading + about 3 dB (hard ground) or 6 dB (soft ground). */
  lossPerDoubling: { hard: 9, suburban: 10, soft: 12, urban: 14 } as Record<'hard' | 'suburban' | 'soft' | 'urban', number>,
};
export const GROUND_LABEL: Record<keyof typeof SIREN_PLANNING.lossPerDoubling, string> = {
  // 10 dB per doubling gives slightly shorter reach than the CPG chart at long range (125 dBC: about 4,500 ft vs 5,900 ft), so plans err on the safe side.
  hard: 'Water, pavement, open hard ground (9 dB per doubling)',
  suburban: 'Suburban or rural (CPG 1-17: 10 dB per doubling)',
  soft: 'Soft ground, woods, rolling hills (12 dB per doubling)',
  urban: 'Dense downtown / tall buildings (CPG 1-17: about 14 dB per doubling)',
};

/** Signals as defined by FEMA CPG 1-17 §IV-E, plus common local practice. */
export const SIREN_SIGNALS = [
  { name: 'Alert (Attention)', sound: 'Steady tone, 3 to 5 minutes', use: 'Peacetime emergencies (tornado, flood, hazardous material): turn on radio or TV, check phone alerts. Source: CPG 1-17 §IV-E.' },
  { name: 'Attack', sound: 'Wavering (wail) tone, 3 to 5 minutes', use: 'National attack warning only; take shelter. Source: CPG 1-17 §IV-E; Iowa EMA best practices reserve it for national defense.' },
  { name: 'Voice message', sound: 'Live or recorded words (speaker arrays)', use: 'Says what is happening and what to do; follow with the tone. Needs an intelligible system (NFPA 72 Ch. 24).' },
  { name: 'All clear', sound: 'None', use: 'Most programs have no all-clear siren (Iowa EMA best practices): get the all-clear from radio, TV or phone alerts.' },
];

// ───────────────────────── Codes, laws and ordinances ─────────────────────────
export type CodeLevel = 'Federal' | 'State' | 'County' | 'City' | 'Tribal' | 'Guidance';
export interface SirenCode {
  id: string; level: CodeLevel;
  /** State the entry applies in (none = everywhere). */
  state?: 'NC' | 'SC' | 'GA' | 'TN' | 'VA';
  /** County or city names it applies to (matched to the project's county / city). */
  county?: string; city?: string;
  title: string; cite: string;
  /** What it says, in plain language. */
  summary: string;
  /** When it applies to a siren job. */
  applies: string;
  url: string;
  /** true = read on the source page on SIRENS_CHECKED; false = confirm in the code book or with the AHJ. */
  checked: boolean;
  /** Effective / publication date as stated. */
  date?: string;
}

export const SIREN_CODES: SirenCode[] = [
  // ── Federal guidance and law
  { id: 'cpg-1-17', level: 'Guidance', title: 'Outdoor Warning Systems Guide (CPG 1-17)', cite: 'FEMA Civil Preparedness Guide 1-17', date: '1980-03-01', checked: true, url: CPG[1],
    summary: 'The base federal guide for siren systems. Warning must be about 9 dB(C) above what a listener can just hear; sound drops 6 dB per doubling of distance in free air and about 10 dB per doubling in suburban/rural areas (Fig. 1: a 120 dBC siren reaches about 3,700 ft; only about 1,200 ft among high-rises; 125 dBC suburban about 5,900 ft). Lay sirens out as interlocking circles that do not overlap much. Mount a 120 dBC siren at least 32 ft up and above rooftops; no one should hear more than 123 dBC. Alert = 3–5 min steady; Attack = 3–5 min wavering. Test about once a month in daytime (≤1 min steady, 1 min silence, ≤1 min attack); growl tests are acceptable when testing more often.',
    applies: 'Every outdoor warning siren design, layout and test program.' },
  { id: 'fema-owstb-2006', level: 'Guidance', title: 'Outdoor Warning Systems Technical Bulletin v2.0', cite: 'FEMA (Nuclear and Chemical Hazards Branch), EME-2001-BP-0016', date: '2006-01-12', checked: true, url: FEMA2006[1],
    summary: 'Updates CPG 1-17. The sound must be 10 dB above background noise; public alerting equipment must project 120 dB at least 100 ft; backup power must give at least 15 minutes of alerting and recharge to 80% within 24 hours (maintenance-free batteries about 3 years). Excess ground attenuation about 6 dB per doubling on soft ground, about 3 dB on hard surfaces. Testing (Sec. 5): silent tests at least every 24 h with automatic monitoring; growl tests at least quarterly and after maintenance for electromechanical sirens; full-cycle rotation quarterly (monthly without automatic testing); full activation at least annually (about 1 minute). Test the system once a month.',
    applies: 'Design and test programs, and the basis for FEMA Radiological Emergency Preparedness (nuclear plant) siren reviews.' },
  { id: 'nfpa72-ch24', level: 'Federal', title: 'Emergency Communications Systems: wide-area mass notification', cite: 'NFPA 72 (2022), Chapter 24 (wide-area MNS / high-power speaker arrays); Chapter 14 (inspection, testing, maintenance)', checked: false, url: 'https://www.nfpa.org/codes-and-standards/nfpa-72-standard-development/72',
    summary: 'Covers wide-area mass notification systems, including high-power speaker arrays: a risk analysis, intelligible voice, survivable control and pathways, secondary power, and testing per Chapter 14. Adopted through the state fire code (IFC) in NC, SC, GA, TN and VA, usually by reference.',
    applies: 'Voice-capable outdoor speaker arrays on campuses, plants and military-style "giant voice" systems; where the AHJ treats the outdoor system as part of a mass notification system. Confirm the section numbers in your edition.' },
  { id: 'ul2572', level: 'Federal', title: 'Listing for mass notification control units', cite: 'UL 2572, Control and Communication Units for Mass Notification Systems', checked: false, url: 'https://www.ul.com',
    summary: 'Listing standard for MNS control equipment. Many AHJs ask for UL 2572 listed controllers when a wide-area system is part of a building or campus MNS.',
    applies: 'Campus and plant systems tied to an in-building MNS or fire alarm.' },
  { id: 'nfpa1225', level: 'Federal', title: 'Emergency services communications (formerly NFPA 1221)', cite: 'NFPA 1225 (2022 edition consolidated NFPA 1221 and others)', checked: false, url: 'https://www.nfpa.org/codes-and-standards/nfpa-1225-standard-development/1225',
    summary: 'Requirements for public emergency communications centers and the radio and alerting systems they operate, including reliability, power and monitoring of the circuits that activate sirens from dispatch.',
    applies: 'County 911 / dispatch centers that activate sirens; siren radio control paths. Confirm the edition your state adopted.' },
  { id: 'ipaws', level: 'Federal', title: 'Integrated Public Alert and Warning System (IPAWS)', cite: 'Executive Order 13407 (2006); IPAWS Modernization Act of 2015 (Pub. L. 114-143); 47 CFR Part 10 (WEA) and Part 11 (EAS)', checked: false, url: 'https://www.fema.gov/emergency-managers/practitioners/integrated-public-alert-warning-system',
    summary: 'FEMA’s national alerting system: one CAP message reaches phones (Wireless Emergency Alerts), radio and TV (EAS), NOAA Weather Radio and IPAWS-connected siren controllers. Alerting authorities need FEMA approval (MOA) and training; FEMA holds national periodic tests.',
    applies: 'Siren controllers that take CAP/IPAWS messages, and every warning plan: sirens are an outdoor layer, not the whole plan.' },
  { id: 'fcc-part90', level: 'Federal', title: 'Radio activation of sirens', cite: '47 CFR Part 90 (Private Land Mobile Radio): licensing, 12.5 kHz narrowband VHF/UHF', checked: false, url: 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-D/part-90',
    summary: 'Sirens activated by VHF/UHF radio (two-tone, DTMF or digital) need a licensed channel, usually the county’s public safety license; equipment must meet narrowband rules.',
    applies: 'Every radio-controlled siren. Check the license, frequency and control format (see RadioReference and FCC pages).' },
  { id: 'nrc-ans', level: 'Federal', title: 'Nuclear plant alert and notification (sirens in the 10-mile zone)', cite: '10 CFR 50.47(b)(5); 10 CFR Part 50, Appendix E, §IV.D.3; NUREG-0654/FEMA-REP-1 Rev. 2 (2019); FEMA REP Program Manual', checked: false, url: 'https://www.nrc.gov/about-nrc/emerg-preparedness.html',
    summary: 'Plants must be able to alert the public in the plume exposure pathway emergency planning zone (about 10 miles) within about 15 minutes. The utility owns and maintains the sirens to a FEMA-approved design report; counties activate them; FEMA evaluates them. Testing follows that design report (silent, growl and full tests).',
    applies: 'Any siren work inside a nuclear plant EPZ: McGuire, Harris, Brunswick (NC); Catawba, Oconee, Robinson, Summer (SC); Vogtle, Hatch (GA); Sequoyah, Watts Bar (TN); North Anna, Surry (VA). Coordinate with the utility and county.' },
  { id: 'osha-1910-165', level: 'Federal', title: 'Employee alarm systems', cite: '29 CFR 1910.165', checked: false, url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.165',
    summary: 'Workplace alarms must be heard (or seen) above ambient noise by all employees and be distinctive; they must be maintained and tested (non-supervised systems at least every two months).',
    applies: 'Plant, quarry and industrial outdoor sirens used to warn workers.' },
  { id: 'osha-noise', level: 'Federal', title: 'Hearing safety for technicians', cite: '29 CFR 1910.95 (occupational noise); CPG 1-17 §V-B-5 (123 dBC limit)', checked: false, url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.95',
    summary: 'Do not be near a sounding siren without hearing protection; lock out the siren before climbing. CPG 1-17: no one should be exposed above 123 dBC.',
    applies: 'Installation, maintenance and testing at the pole.' },
  { id: 'ufc-4-021-01', level: 'Guidance', title: 'DoD mass notification systems', cite: 'UFC 4-021-01, Design and O&M: Mass Notification Systems', checked: false, url: 'https://www.wbdg.org/ffc/dod/unified-facilities-criteria-ufc/ufc-4-021-01',
    summary: 'Military criteria for wide-area "giant voice" systems: voice intelligibility, coverage maps, control and testing. Often used as a model specification for campuses.',
    applies: 'Military sites and campuses that adopt it as a specification.' },
  { id: 'fema-p64', level: 'Guidance', title: 'Dam emergency action plans', cite: 'FEMA P-64, Federal Guidelines for Dam Safety: Emergency Action Planning', checked: false, url: 'https://www.fema.gov/emergency-managers/risk-management/dam-safety',
    summary: 'High-hazard dams need an emergency action plan with downstream warning; sirens are a common part of it.',
    applies: 'Sirens below dams and along flood-prone streams.' },
  { id: 'iema-best', level: 'Guidance', title: 'Outdoor siren best practices (model policy)', cite: 'Iowa Emergency Management Association recommendation (Dec 2015)', checked: true, url: IEMA[1],
    summary: 'A widely used model policy (not law): one monthly audible test with a single one-minute tone; cancel if severe weather is forecast within 6 hours before or after; alert tone at least 3 minutes for a real warning; triggers are tornado warnings, winds of 70 mph or more, hail 1.75 in or larger; no all-clear siren; sirens are not for evacuation, time of day or fire calls; they are meant for people outdoors.',
    applies: 'Writing or reviewing a county activation and test policy.' },
  { id: 'twdb-flood', level: 'Guidance', title: 'Flood warning siren guide', cite: 'Texas Water Code §16.502 (SB 3, 2025); TWDB Flash Flood Warning Siren Guide', date: '2026-01', checked: true, url: TWDB[1],
    summary: 'A current, detailed guide for flood sirens (Texas law, useful model elsewhere): documented site selection; output no more than 130 dBC at 100 ft; backup power for 24 h standby plus 30 min alerting; local and remote manual override; at least one stream gauge as a trigger, gauges reporting every 15 min; electronics above the 500-year flood level; daily silent tests and monthly audible tests; fix failures within 72 hours; annual review of acoustic output and range; alerts at least 3 minutes, repeated every 10–15 minutes. Typical reach 1–2 miles up and down stream; $24,000–$70,000 per siren.',
    applies: 'Flood siren projects (for example the western NC programs after Helene). Not law outside Texas.' },

  // ── State law
  { id: 'nc-166a', level: 'State', state: 'NC', title: 'North Carolina Emergency Management Act', cite: 'N.C.G.S. Chapter 166A', checked: false, url: 'https://www.ncleg.gov/Laws/GeneralStatuteSections/Chapter166A',
    summary: 'Counties and cities run emergency management programs and plans; public warning (including sirens) is part of the county plan under NC Emergency Management. There is no statewide siren design or test law.',
    applies: 'Every NC siren system: work through the county emergency management office.' },
  { id: 'nc-firecode', level: 'State', state: 'NC', title: 'NC Fire Code / Building Code (mass notification)', cite: '2018 NC Fire Code and Building Code §907 (NFPA 72 by reference)', checked: false, url: 'https://www.ncosfm.gov/codes',
    summary: 'In-building fire alarm and emergency voice/alarm systems follow NFPA 72 through §907. Outdoor community sirens are not building code items, but campus systems tied to a building MNS are reviewed by the local fire marshal.',
    applies: 'Campus and plant systems connected to a building fire alarm or MNS.' },
  { id: 'nc-dam', level: 'State', state: 'NC', title: 'NC Dam Safety Law', cite: 'N.C.G.S. §143-215.23 et seq.; 15A NCAC 02K (emergency action plans)', checked: false, url: 'https://www.deq.nc.gov/about/divisions/energy-mineral-and-land-resources/dam-safety',
    summary: 'High-hazard dams need emergency action plans with downstream notification, which may include sirens.',
    applies: 'Sirens below dams in NC.' },
  { id: 'nc-noise', level: 'State', state: 'NC', title: 'Noise: local rules', cite: 'No statewide community noise statute; cities and counties adopt noise ordinances', checked: false, url: 'https://www.ncleg.gov',
    summary: 'Siren noise is handled by city and county ordinances, which usually exempt warning devices; tests should still be in daytime.',
    applies: 'Check the city and county ordinance for the project address (listed below when known).' },
  { id: 'sc-25-1', level: 'State', state: 'SC', title: 'South Carolina emergency preparedness law', cite: 'S.C. Code Title 25, Chapter 1 (SC Emergency Management Division)', checked: false, url: 'https://www.scstatehouse.gov/code/title25.php',
    summary: 'SCEMD coordinates state and county emergency plans, including public warning. Sirens are run by counties, cities, campuses and (near nuclear plants) the utilities.',
    applies: 'Every SC siren system: coordinate with the county emergency management office.' },
  { id: 'sc-dam', level: 'State', state: 'SC', title: 'SC Dams and Reservoirs Safety Act', cite: 'S.C. Code §49-11-110 et seq.; S.C. Regs. 72-1 to 72-9', checked: false, url: 'https://des.sc.gov/programs/bureau-water/dams-reservoirs',
    summary: 'High-hazard dams need emergency action plans with downstream warning.',
    applies: 'Sirens below dams in SC.' },
  { id: 'ga-38-3', level: 'State', state: 'GA', title: 'Georgia Emergency Management Act', cite: 'O.C.G.A. §38-3-1 et seq. (GEMA/HS)', checked: false, url: 'https://gema.georgia.gov',
    summary: 'GEMA/HS and county EMAs run emergency plans and public warning; many Georgia counties own siren systems and set their own test day.',
    applies: 'Every GA siren system: coordinate with the county EMA.' },
  { id: 'ga-dam', level: 'State', state: 'GA', title: 'Georgia Safe Dams Act', cite: 'O.C.G.A. §12-5-370 et seq.', checked: false, url: 'https://epd.georgia.gov/safe-dams-program',
    summary: 'Category I (high-hazard) dams need emergency action plans with downstream warning.',
    applies: 'Sirens below dams in GA.' },
  { id: 'tn-58-2', level: 'State', state: 'TN', title: 'Tennessee Emergency Management', cite: 'T.C.A. §58-2-101 et seq. (TEMA)', checked: false, url: 'https://www.tn.gov/tema.html',
    summary: 'TEMA and county EMAs run emergency plans and public warning. Many TN counties and cities have siren systems with a monthly test (often the first Wednesday at noon).',
    applies: 'Every TN siren system: coordinate with the county EMA.' },
  { id: 'tn-dam', level: 'State', state: 'TN', title: 'Tennessee Safe Dams Act', cite: 'T.C.A. §69-12-101 et seq.', checked: false, url: 'https://www.tn.gov/environment/program-areas/wr-water-resources/dam-safety.html',
    summary: 'High-hazard dams need emergency action plans with downstream warning.',
    applies: 'Sirens below dams in TN.' },
  { id: 'va-44-146', level: 'State', state: 'VA', title: 'Commonwealth of Virginia Emergency Services and Disaster Law', cite: 'Code of Virginia §44-146.13 et seq.', checked: false, url: 'https://law.lis.virginia.gov/vacode/title44/chapter3.2/',
    summary: 'VDEM and each locality keep emergency operations plans, including public warning; localities own siren systems.',
    applies: 'Every VA siren system: coordinate with the locality’s emergency manager.' },
  { id: 'va-dam', level: 'State', state: 'VA', title: 'Virginia Dam Safety Act', cite: 'Code of Virginia §10.1-604 et seq.; 4VAC50-20 (Impounding Structure Regulations)', checked: false, url: 'https://www.dcr.virginia.gov/dam-safety-and-floodplains/',
    summary: 'High-hazard impounding structures need emergency action plans with downstream warning.',
    applies: 'Sirens below dams in VA.' },

  // ── Local (counties, cities, tribes) — read on the source page
  { id: 'asheville-noise', level: 'City', state: 'NC', city: 'Asheville', county: 'Buncombe', title: 'Asheville noise ordinance: warning devices exemption', cite: 'Asheville City Code, Chapter 10, Article IV (Noise Regulation), §§10-81 to 10-85', checked: true, url: 'https://nonoise.org/lawlib/cities/ordinances/Asheville,%20North%20Carolina.pdf',
    summary: '§10-85 exempts "sound or noise of safety signals, warning devices, emergency pressure relief valves, church bells, and the bells or chimes of the Asheville City Building and Municipal Building between the hours of 7:00 a.m. and midnight." A separate item exempts governmental emergency vehicles on duty. (Text from a 2016 copy of the code; confirm the current text on the city code site.)',
    applies: 'Schedule siren tests between 7:00 a.m. and midnight (daytime is best). Ask the city about real warnings at night.' },
  { id: 'buncombe-flood', level: 'County', state: 'NC', county: 'Buncombe', title: 'Buncombe County flood siren program (planned)', cite: 'BPR/WUNC news report, Aug 28, 2025', checked: true, url: 'https://www.wunc.org/2025-08-28/flood-sirens-in-wnc-could-be-crucial-for-safety-not-everyone-is-convinced',
    summary: 'Buncombe County has no county siren system; it is pursuing one for the first time. A July 2025 letter of intent sought a $12 million flood siren and stream gauge project: 71 sirens and 33 stream gauges along 10 waterways. Funding was not yet approved. No public test schedule.',
    applies: 'Buncombe County jobs: check with Buncombe County Emergency Services for the current status, siren standard and test day.' },
  { id: 'haywood-flood', level: 'County', state: 'NC', county: 'Haywood', title: 'Haywood County flood sirens', cite: 'BPR/WUNC news report, Aug 28, 2025', checked: true, url: 'https://www.wunc.org/2025-08-28/flood-sirens-in-wnc-could-be-crucial-for-safety-not-everyone-is-convinced',
    summary: 'Haywood is installing 18 flood sirens in Cruso, Canton and Clyde (first two in Aug 2025, completion expected early 2026), funded after Tropical Storm Fred; applying to extend to Waynesville and Maggie Valley.',
    applies: 'Haywood County jobs: match the county’s siren and control standard.' },
  { id: 'caldwell-flood', level: 'County', state: 'NC', county: 'Caldwell', title: 'Caldwell County: Wilson Creek sirens', cite: 'BPR/WUNC news report, Aug 28, 2025', checked: true, url: 'https://www.wunc.org/2025-08-28/flood-sirens-in-wnc-could-be-crucial-for-safety-not-everyone-is-convinced',
    summary: 'Sirens did not sound during Helene (per WSOC); FEMA gave $181,000 for new sirens in the Wilson Creek area.',
    applies: 'Caldwell County jobs.' },
  { id: 'rutherford-flood', level: 'County', state: 'NC', county: 'Rutherford', title: 'Rutherford County flood sirens', cite: 'BPR/WUNC news report, Aug 28, 2025', checked: true, url: 'https://www.wunc.org/2025-08-28/flood-sirens-in-wnc-could-be-crucial-for-safety-not-everyone-is-convinced',
    summary: 'Sirens were installed in sections before Helene, with mitigation funds after Tropical Storm Fred.',
    applies: 'Rutherford County jobs.' },
  { id: 'ebci-sirens', level: 'Tribal', state: 'NC', county: 'Swain, Jackson', title: 'Eastern Band of Cherokee Indians sirens', cite: 'BPR/WUNC news report, Aug 28, 2025', checked: true, url: 'https://www.wunc.org/2025-08-28/flood-sirens-in-wnc-could-be-crucial-for-safety-not-everyone-is-convinced',
    summary: 'Sirens were in place before Helene and worked; a 2024 grant of $300,000 pays for seven more. Tribal land: the tribe is the authority, not the county.',
    applies: 'Work on the Qualla Boundary.' },
  { id: 'hamilton-tn', level: 'County', state: 'TN', county: 'Hamilton', city: 'Chattanooga', title: 'Hamilton County siren test schedule', cite: 'Hamilton County EMA, Outdoor Warning Sirens page', checked: true, url: 'https://hamilton-co.org/emergency_management_agency/outdoor_warning_sirens',
    summary: 'About 190 sirens. Monthly test on the first Wednesday at 12:00 p.m. (single tone, about 1 minute) unless the weather is bad; if postponed, a 6-second growl test the second Wednesday at noon. Testing may be suspended December–February. Each siren is inspected at least every three years.',
    applies: 'Hamilton County jobs (also inside the Sequoyah nuclear plant zone).' },
  { id: 'sevier-tn', level: 'County', state: 'TN', county: 'Sevier', city: 'Gatlinburg', title: 'Sevier County / Gatlinburg siren test', cite: 'City of Gatlinburg news, Sep 29, 2023', checked: true, url: 'https://www.gatlinburgtn.gov/article/1264687',
    summary: 'Monthly test at noon on the first Wednesday. (2023 article: confirm the current schedule with Sevier County EMA.)',
    applies: 'Sevier County and Gatlinburg jobs.' },
];

/** Nuclear plants in the five states (approximate location, for the 10-mile zone check only; use the utility's EPZ map). */
export const NUCLEAR_PLANTS: { name: string; state: string; county: string; owner: string; lat: number; lon: number }[] = [
  { name: 'McGuire', state: 'NC', county: 'Mecklenburg', owner: 'Duke Energy', lat: 35.432, lon: -80.948 },
  { name: 'Shearon Harris', state: 'NC', county: 'Wake', owner: 'Duke Energy', lat: 35.633, lon: -78.956 },
  { name: 'Brunswick', state: 'NC', county: 'Brunswick', owner: 'Duke Energy', lat: 33.958, lon: -78.010 },
  { name: 'Catawba', state: 'SC', county: 'York', owner: 'Duke Energy', lat: 35.052, lon: -81.069 },
  { name: 'Oconee', state: 'SC', county: 'Oconee', owner: 'Duke Energy', lat: 34.794, lon: -82.899 },
  { name: 'H. B. Robinson', state: 'SC', county: 'Darlington', owner: 'Duke Energy', lat: 34.402, lon: -80.158 },
  { name: 'V. C. Summer', state: 'SC', county: 'Fairfield', owner: 'Dominion Energy SC', lat: 34.298, lon: -81.315 },
  { name: 'Vogtle', state: 'GA', county: 'Burke', owner: 'Southern Nuclear', lat: 33.142, lon: -81.762 },
  { name: 'Edwin I. Hatch', state: 'GA', county: 'Appling', owner: 'Southern Nuclear', lat: 31.934, lon: -82.344 },
  { name: 'Sequoyah', state: 'TN', county: 'Hamilton', owner: 'TVA', lat: 35.226, lon: -85.092 },
  { name: 'Watts Bar', state: 'TN', county: 'Rhea', owner: 'TVA', lat: 35.603, lon: -84.789 },
  { name: 'North Anna', state: 'VA', county: 'Louisa', owner: 'Dominion Energy', lat: 38.061, lon: -77.790 },
  { name: 'Surry', state: 'VA', county: 'Surry', owner: 'Dominion Energy', lat: 37.166, lon: -76.698 },
];

// ───────────────────────── Tests and test programs ─────────────────────────
export interface SirenTestKind {
  id: string; name: string; how: string;
  /** What passes. */
  pass: string;
  ref: string;
  /** Audible to the public. */
  audible: boolean;
}
export const SIREN_TEST_KINDS: SirenTestKind[] = [
  { id: 'silent', name: 'Silent test (status poll)', audible: false, ref: 'FEMA 2006 bulletin §5.2; TWDB Req. 4.2',
    how: 'From the control point, poll each siren (or let the controller run its automatic test). No sound. Read back AC power, battery voltage, charger, rotation, door/intrusion and radio/IP link status.',
    pass: 'Every siren answers; AC and battery OK; no faults.' },
  { id: 'growl', name: 'Growl test', audible: true, ref: 'FEMA 2006 bulletin §5.2–5.3; CPG 1-17 §VII-B',
    how: 'Run the motor a few seconds (about 6 s) at low output, so the rotor turns without a full sound. Watch the telemetry or listen at the pole.',
    pass: 'Motor starts and the rotor/rotator turns; current draw normal.' },
  { id: 'fullcycle', name: 'Full-cycle rotation test', audible: true, ref: 'FEMA 2006 bulletin §5.2–5.3',
    how: 'Run a full rotation of a rotating siren (or the full tone sequence of an electronic siren) at full output, timed.',
    pass: 'Full 360° rotation; tone steady; no stalls, noise or drop-out.' },
  { id: 'monthly', name: 'Monthly audible test', audible: true, ref: 'CPG 1-17 §VII-B; Iowa EMA best practices; county schedule',
    how: 'Tell dispatch, NWS and the public first. Daytime only, at the county’s set day and time. Sound the alert tone (about 1 minute; CPG: ≤1 min steady, 1 min silence, ≤1 min attack). Cancel if severe weather is forecast within 6 hours. Have spotters at a few sites report.',
    pass: 'Each siren heard by its spotter or confirmed by telemetry for the full time.' },
  { id: 'annual', name: 'Full activation / coverage check', audible: true, ref: 'FEMA 2006 bulletin §5.2; TWDB Req. 4.2 (annual review)',
    how: 'Once a year, sound each siren at full output (about 1 minute) and measure with a Type 2 (or Type 1) sound level meter, C-weighted, slow, at the planned edge points; note wind and background noise. Compare with the design.',
    pass: 'At each edge point the siren is at least 10 dB above background (and at the design level).' },
  { id: 'battery', name: 'Backup power test', audible: false, ref: 'FEMA 2006 bulletin (15 min alerting, 80% recharge in 24 h); TWDB Req. 3.3',
    how: 'Turn off AC; check battery voltage under load (or run a short activation on battery); turn AC back on and confirm the charger. Record battery date.',
    pass: 'Battery holds the design alerting time (15 min minimum; 30 min for flood sirens per TWDB); recharges to 80% within 24 h; batteries within the maker’s life (often 3–5 years).' },
  { id: 'inspect', name: 'Physical inspection and maintenance', audible: false, ref: 'Maker’s manual; TWDB Req. 5.1 (annual); Hamilton County (every 3 years)',
    how: 'Lock out. Climb and check pole, mounting, rotator, horns/drivers, motor brushes and bearings, cabinet seals, controller, antenna and coax, grounding and surge protection, solar panel. Finish with a growl test.',
    pass: 'No damage, corrosion or water; ground connections tight; growl test OK.' },
  { id: 'activation', name: 'Activation path test', audible: false, ref: '47 CFR Part 90 license; IPAWS (CAP) controller; NFPA 1225 (dispatch)',
    how: 'From each activation point (dispatch console, backup encoder, IPAWS/CAP feed, local push-button), send a test command in silent or growl mode.',
    pass: 'Every siren responds to every activation point; radio level and code format correct.' },
];

export interface SirenProgram { id: string; label: string; source: string; url: string; every: Record<string, number>; note: string }
/** Test programs: days between each test kind. */
export const SIREN_PROGRAMS: SirenProgram[] = [
  { id: 'community', label: 'Community sirens, monthly test (CPG 1-17)', source: CPG[0], url: CPG[1],
    every: { monthly: 30, growl: 91, annual: 365, battery: 365, inspect: 365, activation: 91 },
    note: 'Most counties: one audible test a month, daytime, set day (often first Wednesday at noon in TN), canceled in severe weather.' },
  { id: 'monitored', label: 'Monitored system (FEMA 2006 bulletin, automatic testing)', source: FEMA2006[0], url: FEMA2006[1],
    every: { silent: 1, growl: 91, fullcycle: 91, monthly: 30, annual: 365, battery: 365, inspect: 365, activation: 91 },
    note: 'Daily silent test; quarterly growl and full-cycle; full activation at least yearly. Growl tests can replace the monthly sound test where the AHJ agrees.' },
  { id: 'flood', label: 'Flood sirens (TWDB guide)', source: TWDB[0], url: TWDB[1],
    every: { silent: 1, monthly: 30, annual: 365, battery: 365, inspect: 365, activation: 30 },
    note: 'Daily silent and monthly audible tests, results documented; fix failures within 72 hours; check stream gauges with each test.' },
  { id: 'rep', label: 'Nuclear plant zone (utility design report)', source: 'FEMA REP Program / NUREG-0654', url: 'https://www.fema.gov/emergency-managers/risk-management/radiological-emergency-preparedness',
    every: { silent: 14, growl: 91, fullcycle: 365, annual: 365, battery: 365, inspect: 365 },
    note: 'Starting values only: the utility’s FEMA-approved alert and notification design report sets the real schedule. Coordinate every test with the utility and county.' },
  { id: 'campus', label: 'Campus / plant system (NFPA 72 Ch. 14, maker)', source: 'NFPA 72 Chapter 14 and the maker’s manual', url: 'https://www.nfpa.org/codes-and-standards/nfpa-72-standard-development/72',
    every: { silent: 1, monthly: 30, annual: 365, battery: 182, inspect: 365, activation: 91 },
    note: 'Confirm frequencies in NFPA 72 Table 14.4.3.2 for your edition and with the AHJ.' },
];
