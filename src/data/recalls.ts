// Recalls, safety notices and technical service bulletins for low-voltage equipment.
//  - Built-in: official U.S. Consumer Product Safety Commission (CPSC) recall notices, read on cpsc.gov
//    on RECALLS_CHECKED. Each keeps the CPSC page link so the full notice opens online.
//  - Fetched: when online, the app asks the official CPSC recalls API for new notices (engine/recallsData.ts)
//    and keeps them on this device, so alerts also work offline.
//  - Mine: manufacturer technical service bulletins the user adds (most are dealer-only and copyrighted, so the
//    app does not ship them; add the bulletin's number, models and link or attach the PDF).
// Notices are matched to equipment by manufacturer and model text. A match means "check the label", not that a
// unit is affected: affected units are usually limited to date codes or serial ranges given in the notice.
import { kvGet, kvSet } from '../engine/projectdb';

export const RECALLS_CHECKED = '2026-11-15';
export type NoticeKind = 'Recall' | 'Safety notice' | 'Service bulletin';
export interface Notice {
  id: string; kind: NoticeKind; source: string; date: string; firm: string; title: string;
  /** Regular expressions (case-insensitive) tested against "brand model". All of `brand` must match, then any of `models`. */
  brand: string; models: string[];
  /** Model numbers as printed in the notice, for display. */
  modelList: string[]; ranges?: string;
  hazard: string; remedy: string; url?: string; contact?: string;
  /** True for notices from the CPSC API with no model numbers: shown as "possible", never as a definite match. */
  loose?: boolean;
  /** For "Mine": a saved file id in the manual shelf, or a note. */
  note?: string;
}

export const BUILTIN_NOTICES: Notice[] = [
 {
  "id": "cpsc-14-713",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2014-01-28",
  "firm": "System Sensor",
  "title": "System Sensor recalls reflected beam smoke detectors",
  "brand": "system sensor|honeywell",
  "models": [
   "\\bBEAM1224S\\b"
  ],
  "modelList": [
   "BEAM1224S"
  ],
  "ranges": "Date codes 2111 through 3053",
  "hazard": "With certain power supplies, the detectors can fail to signal the fire alarm control panel and so fail to alert occupants of a fire.",
  "remedy": "Free replacement for units on power supplies not on the firm's acceptable list; units on acceptable supplies need no replacement.",
  "url": "https://www.cpsc.gov/Recalls/2014/System-Sensor-Recalls-Reflected-Beam-Smoke-Detectors",
  "contact": "System Sensor: www.systemsensor.com"
 },
 {
  "id": "cpsc-11-721",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2011-02-08",
  "firm": "Tyco Safety Products Westminster (SimplexGrinnell)",
  "title": "Simplex fire alarm control panels: may fail to alert monitoring centers",
  "brand": "simplex|tyco",
  "models": [
   "\\b4100U[- ]?NXP\\b"
  ],
  "modelList": [
   "4100U-NXP"
  ],
  "ranges": "Panels set up for third-party monitoring running software revision 14.01; distributed May–September 2010",
  "hazard": "The panels can fail to send a signal to alert monitoring centers in the event of a fire.",
  "remedy": "Free software upgrade from Simplex.",
  "url": "https://www.cpsc.gov/Recalls/2011/simplex-fire-alarm-control-panels-recalled-by-tyco-safety-products-westminster-due-to"
 },
 {
  "id": "cpsc-19-141",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2019-06-21",
  "firm": "Honeywell (Gamewell-FCI and Notifier)",
  "title": "Gamewell-FCI and Notifier \"-IV\" photoelectric smoke sensors: may fail to alert of a fire",
  "brand": "notifier|gamewell|fci|honeywell",
  "models": [
   "\\bASD[- ]?PL3[- ]?IV\\b",
   "\\bASD[- ]?PL3R[- ]?IV\\b",
   "\\bASD[- ]?PTL3[- ]?IV\\b",
   "\\bFSP[- ]?951[- ]?IV\\b",
   "\\bFSP[- ]?951R[- ]?IV\\b",
   "\\bFSP[- ]?951T[- ]?IV\\b"
  ],
  "modelList": [
   "ASD-PL3-IV",
   "ASD-PL3R-IV",
   "ASD-PTL3-IV",
   "FSP-951-IV",
   "FSP-951R-IV",
   "FSP-951T-IV"
  ],
  "ranges": "Gamewell-FCI models: date codes 8034 to 9013 (S3/E3 panels, CLIP mode). Notifier models: used with NFS-3030 / NFS2-3030 panels",
  "hazard": "The sensor can malfunction and cause the fire alarm system to fail to alert occupants of a fire in commercial buildings.",
  "remedy": "Free replacement photoelectric smoke sensor.",
  "url": "https://www.cpsc.gov/Recalls/2019/Honeywell-Recalls-Gamewell-FCI-and-Notifier-Photoelectric-Smoke-Sensors-Sold-with-Fire-Alarm-Systems-Due-to-Failure-to-Alert-of-a-Fire",
  "contact": "Gamewell-FCI 800-633-1311; Notifier 800-289-3473"
 },
 {
  "id": "cpsc-09-717",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2008-12-30",
  "firm": "Notifier",
  "title": "Notifier fire alarm control panels: firmware may fail to process an alarm",
  "brand": "notifier|honeywell",
  "models": [
   "\\bNFS2[- ]?640\\b",
   "\\bNFS[- ]?320\\b",
   "\\bNFS[- ]?640\\b"
  ],
  "modelList": [
   "NFS2-640",
   "NFS-320",
   "NFS-640"
  ],
  "ranges": "NFS2-640 and NFS-320 with firmware 11.2.2; NFS-640 with firmware 3.14.1. Check the firmware version on the panel.",
  "hazard": "Software may fail to process an alarm condition, so the system may not respond in a fire.",
  "remedy": "Distributors get replacement software from Notifier.",
  "url": "https://www.cpsc.gov/Recalls/2008/fire-alarm-control-panels-recalled-by-notifier-due-to-alert-failure"
 },
 {
  "id": "cpsc-06-551",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2006-05-19",
  "firm": "Tyco Fire & Security (SimplexGrinnell, ADT, Ansul)",
  "title": "Tyco / Simplex smoke sensors: may lose sensitivity in high heat and humidity (software upgrade)",
  "brand": "simplex|tyco|adt|ansul",
  "models": [
   "\\b4098[- ]?9714\\b",
   "\\b4098[- ]?9754\\b",
   "\\b4098[- ]?9755\\b",
   "\\b4098[- ]?9756\\b",
   "\\b4098[- ]?9757\\b",
   "\\b430631\\b",
   "\\b430634\\b",
   "\\b430654\\b",
   "\\b430719\\b",
   "\\b431190\\b"
  ],
  "modelList": [
   "4098-9714",
   "4098-9714C",
   "4098-9714EA",
   "4098-9754",
   "4098-9754C",
   "4098-9754EA",
   "4098-9755",
   "4098-9755C",
   "4098-9755EA",
   "4098-9756",
   "4098-9756C",
   "4098-9757",
   "4098-9757CA",
   "430631",
   "430634",
   "430654",
   "430719",
   "431190"
  ],
  "ranges": "Sensors installed from August 2004",
  "hazard": "Sensors may lose smoke sensitivity under high humidity and high temperature, delaying smoke detection in a fire.",
  "remedy": "Free software upgrade through the distributor after it confirms the system is included.",
  "url": "https://www.cpsc.gov/Recalls/2006/tyco-fire-security-announces-recall-to-upgrade-software-of-fire-detection-systems"
 },
 {
  "id": "cpsc-04-508",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2003-10-30",
  "firm": "Notifier",
  "title": "Notifier AM2020 / AFP1010 panels: devices may change type ID (firmware)",
  "brand": "notifier|honeywell",
  "models": [
   "\\bAM2020\\b",
   "\\bAFP1010\\b",
   "\\bAFP[- ]?1010\\b"
  ],
  "modelList": [
   "AM2020",
   "AFP1010"
  ],
  "ranges": "CPU-2020/CPU-2 and DIA-2020/DIA-2 boards with date codes 0100 to 2003 and firmware 3.0 or 3.01 (date code on the back edge of the boards)",
  "hazard": "A software problem can make devices change type ID and appear as photo detectors, so the system may not operate as programmed.",
  "remedy": "Notifier provides upgraded CPU firmware at no charge.",
  "url": "https://www.cpsc.gov/Recalls/2003/cpsc-notifier-announce-recall-for-fire-alarm-panels"
 },
 {
  "id": "cpsc-15-077",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2015-02-11",
  "firm": "System Sensor",
  "title": "System Sensor i4 combination CO / smoke detectors: may fail to detect CO",
  "brand": "system sensor|honeywell",
  "models": [
   "\\bCOSMO[- ]?2W\\b",
   "\\bCOSMO[- ]?4W\\b"
  ],
  "modelList": [
   "COSMO-2W",
   "COSMO-4W"
  ],
  "ranges": "Made 9/3/14 to 9/13/14; date codes 4091 or 4092 (lower left of the back label)",
  "hazard": "The detectors can fail to detect carbon monoxide, a risk of CO poisoning.",
  "remedy": "Free replacement; keep the detector in service until the replacement is installed.",
  "url": "https://www.cpsc.gov/Recalls/2015/System-Sensor-Recalls-Combination-Carbon-Monoxide-and-Smoke-Detectors"
 },
 {
  "id": "cpsc-24-158",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2024-03-14",
  "firm": "Honeywell / System Sensor",
  "title": "System Sensor L-Series low-frequency sounders and sounder strobes: may fail to alert",
  "brand": "system sensor|honeywell",
  "models": [
   "\\bHWL[- ]?LF\\b",
   "\\bHWL[- ]?LF[- ]?BP10\\b",
   "\\bHRL[- ]?LF\\b",
   "\\bHRL[- ]?LF[- ]?BP10\\b",
   "\\bHGWL[- ]?LF[- ]?BP10\\b",
   "\\bP2WL[- ]?LF\\b"
  ],
  "modelList": [
   "HWL-LF",
   "HWL-LF-BP10",
   "HRL-LF",
   "HRL-LF-BP10",
   "HGWL-LF-BP10",
   "P2WL-LF"
  ],
  "ranges": "Date codes 3034 and 3035",
  "hazard": "The sounders and strobes can malfunction and fail to alert occupants of a fire.",
  "remedy": "Free inspection and repair or replacement through System Sensor.",
  "url": "https://www.cpsc.gov/Recalls/2024/Honeywell-Recalls-System-Sensor-L-Series-Low-Frequency-Fire-Alarm-Sounders-and-Strobes-Due-to-Risk-of-Failure-to-Alert-Consumers-to-a-Fire",
  "contact": "buildings.honeywell.com (System Sensor recall page)"
 },
 {
  "id": "cpsc-04-537",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2004-02-26",
  "firm": "Honeywell Video Systems (ADEMCO)",
  "title": "ADEMCO Rapid/Dome security camera: mount can crack and the dome can fall",
  "brand": "ademco|honeywell",
  "models": [
   "\\bAD5RCPP16\\b",
   "\\bAD5GCMPP18\\b",
   "\\bAD5GCPP18\\b",
   "\\bAD5GCPP22\\b"
  ],
  "modelList": [
   "AD5RCPP16",
   "AD5GCMPP18",
   "AD5GCPP18",
   "AD5GCPP22"
  ],
  "ranges": "Serial G01–G12 (2002) and H01–H08 (to August 2003)",
  "hazard": "The plastic mounting assembly can crack, letting the dome and camera fall and possibly injure someone.",
  "remedy": "Free repair of the mounting assembly through Honeywell.",
  "url": "https://www.cpsc.gov/Recalls/2004/cpsc-honeywell-video-system-announce-recall-of-security-camera"
 },
 {
  "id": "cpsc-14-255",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2014-08-13",
  "firm": "Edwards (ESL) and Interlogix",
  "title": "ESL and Interlogix 400/500 series smoke detectors: radio interference can stop alarms",
  "brand": "esl|interlogix|edwards|ge security|utc|kidde",
  "models": [
   "\\b429AT\\b",
   "\\b429C\\b",
   "\\b429CAD\\b",
   "\\b429CRT\\b",
   "\\b429CST\\b",
   "\\b429CT\\b",
   "\\b429CTAD\\b",
   "\\b449AT\\b",
   "\\b449C\\b",
   "\\b449CRT\\b",
   "\\b449CSRH\\b",
   "\\b449CSRT\\b",
   "\\b449CST\\b",
   "\\b449CSTE\\b",
   "\\b449CT\\b",
   "\\b449CTE\\b",
   "\\b511C\\b",
   "\\b518C\\b",
   "\\b521B\\b",
   "\\b521BXT\\b",
   "\\b528B\\b",
   "\\b528CRXT\\b",
   "\\b541C\\b",
   "\\b541CXT\\b",
   "\\b548C\\b"
  ],
  "modelList": [
   "429AT",
   "429C",
   "429CAD",
   "429CRT",
   "429CST",
   "429CT",
   "429CTAD",
   "449AT",
   "449C",
   "449CRT",
   "449CSRH",
   "449CSRT",
   "449CST",
   "449CSTE",
   "449CT",
   "449CTE",
   "511C",
   "518C",
   "521B",
   "521BXT",
   "521B-10PKDMP",
   "521B-10PKG",
   "521BXT-10PKG",
   "521BXT-DMP-10PKG",
   "528B",
   "528CRXT",
   "541C",
   "541C-10PKG",
   "541CXT",
   "541CXT-10PK",
   "548C"
  ],
  "ranges": "Date codes 13084 through 14059 (YYDDD)",
  "hazard": "Radio frequency interference can cause the detectors to fail to alert of a fire.",
  "remedy": "Free replacement and installation through the security or fire system provider; leave units in place until replaced.",
  "url": "https://www.cpsc.gov/Recalls/2014/ESL-Interlogix-Hard-Wired-Smoke-Alarms-Recalled"
 },
 {
  "id": "cpsc-07-546",
  "kind": "Recall",
  "source": "CPSC (U.S. Consumer Product Safety Commission)",
  "date": "2007-05-09",
  "firm": "Cooper Lighting",
  "title": "Cooper Lighting Contractor's Choice FasTest emergency lights: may not light in a power failure",
  "brand": "cooper|eaton|contractor",
  "models": [
   "\\bCC7NCSD\\b"
  ],
  "modelList": [
   "CC7NCSD (all suffixes listed in the notice)"
  ],
  "ranges": "Date codes 12-2005 to 03-2007 (on the circuit board next to the battery)",
  "hazard": "A circuit board can malfunction so the lights may not come on during a power failure.",
  "remedy": "Free replacement product.",
  "url": "https://www.cpsc.gov/Recalls/2007/cooper-lighting-emergency-lights-recalled-could-fail-to-illuminate-in-an-emergency"
 }
];

const FETCHED = 'notices.cpsc.v1';
const MINE = 'notices.mine.v1';
export const NOTICES_EVENT = 'radioplan-notices';
export const loadFetched = () => kvGet<Notice[]>(FETCHED).then((v) => v ?? []);
export const saveFetched = (n: Notice[]) => kvSet(FETCHED, n).then(() => window.dispatchEvent(new Event(NOTICES_EVENT)));
export const loadMine = () => kvGet<Notice[]>(MINE).then((v) => v ?? []);
export const saveMine = (n: Notice[]) => kvSet(MINE, n).then(() => window.dispatchEvent(new Event(NOTICES_EVENT)));
export async function allNotices(): Promise<Notice[]> {
  const [f, m] = await Promise.all([loadFetched().catch(() => []), loadMine().catch(() => [])]);
  const ids = new Set(BUILTIN_NOTICES.map((n) => n.id));
  return [...BUILTIN_NOTICES, ...f.filter((n) => !ids.has(n.id)), ...m];
}

const re = (s: string) => { try { return new RegExp(s, 'i'); } catch { return null; } };
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export interface Equip { brand: string; model: string; sub?: string; specs?: Record<string, unknown> }
/** Notices that may apply to one piece of equipment. Generic ("Typical") entries never match. */
export function noticesFor(it: Equip, list: Notice[]): Notice[] {
  if (/^(typical|standard)$/i.test(it.brand)) return [];
  const text = `${it.brand} ${it.model} ${it.sub ?? ''} ${String(it.specs?.['Device type'] ?? '')}`;
  return list.filter((n) => { const b = re(n.brand); if (!b || !b.test(text)) return false; return n.models.some((m) => re(m)?.test(text)); });
}
/** Free-text equipment (materials lines, device schedules): match on model numbers only. */
export function noticesForText(text: string, list: Notice[]): Notice[] {
  return list.filter((n) => !n.loose && n.modelList.length > 0 && n.models.some((m) => re(m)?.test(text)) && (re(n.brand)?.test(text) || n.modelList.some((x) => x.length >= 5 && new RegExp(`\\b${escapeRe(x)}\\b`, 'i').test(text))));
}

/** Turn a record from the CPSC recalls API into a notice (brand from the manufacturer, models from the products). */
export interface CpscRecall { RecallID?: number; RecallNumber?: string; RecallDate?: string; Title?: string; URL?: string; Description?: string;
  Products?: { Name?: string; Model?: string; Description?: string }[]; Manufacturers?: { Name?: string }[]; Hazards?: { Name?: string }[]; Remedies?: { Name?: string }[] }
export function fromCpsc(r: CpscRecall): Notice | null {
  const firm = (r.Manufacturers ?? []).map((m) => m.Name).filter(Boolean).join(', ');
  if (!r.RecallNumber && !r.RecallID) return null;
  const models = [...new Set((r.Products ?? []).flatMap((p) => (p.Model ?? '').split(/[,;]|\band\b/)).map((s) => s.trim()).filter((s) => s.length >= 3 && s.length <= 40))];
  const firstWord = (firm.split(/[\s,]+/)[0] || (r.Title ?? '').split(/\s+/)[0] || '').replace(/[^\w-]/g, '');
  if (!firstWord) return null;
  return {
    id: `cpsc-${r.RecallNumber ?? r.RecallID}`, kind: 'Recall', source: 'CPSC (U.S. Consumer Product Safety Commission)', date: (r.RecallDate ?? '').slice(0, 10), firm: firm || firstWord,
    title: r.Title ?? 'Recall', brand: escapeRe(firstWord), models: models.length ? models.map((m) => escapeRe(m).replace(/\\-|-/g, '[- ]?')) : ['.'],
    modelList: models, hazard: (r.Hazards ?? []).map((h) => h.Name).filter(Boolean).join(' ') || r.Description || '', remedy: (r.Remedies ?? []).map((x) => x.Name).filter(Boolean).join(' '),
    url: r.URL, loose: models.length === 0,
  };
}
/** Words that mark a CPSC recall as low-voltage equipment worth keeping. */
export const LV_WORDS = /fire alarm|smoke (detector|sensor|alarm)|heat detector|strobe|sounder|horn|notification appliance|alarm (panel|control)|control panel|intercom|nurse call|access control|card reader|electric strike|magnetic lock|security camera|surveillance|video recorder|\bnvr\b|\bdvr\b|emergency light|exit sign|paging|amplifier|speaker|signal booster|repeater|two-way radio|battery backup|power supply|surge protect|ethernet|poe|network switch|wireless access point|call box|emergency phone/i;
