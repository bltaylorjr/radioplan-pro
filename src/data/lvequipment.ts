// Low-voltage equipment catalog (current products) and the Legacy equipment section (older and
// discontinued products still found on service and repair calls). Values are TYPICAL planning values
// from manufacturer literature; always confirm against the exact model's datasheet and manual.
//
// Documentation: only manufacturer pages are linked, and every link below was opened on the
// manufacturer's own site on DOCS_CHECKED. No manufacturer PDFs are bundled (they are copyrighted);
// download the manual from the manufacturer page and use "Attach file" to keep it on this device.
import type { SpecItem, SpecValue } from './speclib';

export const DOCS_CHECKED = '2026-11-15';
export type LegacyStatus = 'Discontinued' | 'No longer supported' | 'Legacy (still sold)' | 'Legacy (check availability)';
export interface LegacyInfo {
  status: LegacyStatus;
  /** About when it was common, e.g. "1990s–2000s". */
  era?: string;
  /** Suggested current replacements or migration paths (confirm with the manufacturer or distributor). */
  replacedBy: string[];
  /** Service, repair and compatibility notes for working on it. */
  service: string[];
}
type Doc = [string, string];

/** Manufacturer documentation pages (opened on the manufacturer's site on DOCS_CHECKED). */
export const DOC = {
  notifier: ['Notifier (Honeywell): brand page and documents', 'https://buildings.honeywell.com/us/en/brands/our-brands/notifier'] as Doc,
  notifierDisc: ['Notifier: discontinued products', 'https://buildings.honeywell.com/us/en/brands/our-brands/notifier/resources/discontinued-products'] as Doc,
  firelite: ['Fire-Lite Alarms (Honeywell)', 'https://www.firelite.com'] as Doc,
  silentknight: ['Silent Knight (Honeywell)', 'https://www.silentknight.com'] as Doc,
  gamewell: ['Gamewell-FCI (Honeywell)', 'https://www.gamewell-fci.com'] as Doc,
  systemsensor: ['System Sensor (Honeywell)', 'https://www.systemsensor.com'] as Doc,
  simplex: ['Simplex: resources and documents', 'https://www.simplexfire.com/resources'] as Doc,
  edwards: ['Edwards (EST): products, resources and legacy', 'https://www.edwardsfiresafety.com/'] as Doc,
  mircom: ['Mircom: product documents finder (active and obsolete)', 'https://mircom.com/product-documents/'] as Doc,
  resideo: ['Resideo (Honeywell Home / Ademco): product support', 'https://www.resideo.com/'] as Doc,
  dsc: ['DSC: technical library', 'https://www.dsc.com/'] as Doc,
  napco: ['Napco: technical library', 'https://napcosecurity.com/'] as Doc,
  aiphone: ['Aiphone: technical support and resource center', 'https://www.aiphone.com/'] as Doc,
  rauland: ['Rauland', 'https://www.rauland.com/'] as Doc,
  raulandLegacy: ['Rauland: Responder legacy nurse call systems', 'https://www.rauland.com/Products/Responder-Legacy'] as Doc,
  jeron: ['Jeron: downloads', 'https://www.jeron.com/resources/downloads/'] as Doc,
  bogen: ['Bogen: resource library', 'https://www.bogen.com/'] as Doc,
  valcom: ['Valcom', 'https://www.valcom.com/'] as Doc,
  valcomArch: ['Valcom: archived product list (manuals for each part number)', 'https://www.valcom.com/valcom-archived-product-list/'] as Doc,
  pelco: ['Pelco: document center', 'https://www.pelco.com/docs'] as Doc,
  bosch: ['Bosch Building Technologies: life safety', 'https://www.boschbuildingtechnologies.com/lifesafetysystems/en/'] as Doc,
  lenels2: ['LenelS2 (Honeywell)', 'https://www.lenels2.com'] as Doc,
  hid: ['HID Global', 'https://www.hidglobal.com/'] as Doc,
  swhouse: ['Software House: technical support portal', 'https://support.swhouse.com/'] as Doc,
  keyscan: ['Keyscan', 'https://www.keyscan.ca/'] as Doc,
  motorola: ['Motorola Solutions', 'https://www.motorolasolutions.com/'] as Doc,
  kenwood: ['Kenwood (JVCKENWOOD USA): two-way radio support', 'https://www.kenwood.com/usa/com/support/'] as Doc,
  l3harris: ['L3Harris', 'https://www.l3harris.com/'] as Doc,
  talkaphone: ['Talkaphone', 'https://www.talkaphone.com/'] as Doc,
  talkaphoneDisc: ['Talkaphone: discontinued product information (manuals and datasheets)', 'https://www.talkaphone.com/discontinued-products'] as Doc,
  codeblue: ['Code Blue Corporation', 'https://www.codeblue.com/'] as Doc,
  commscope: ['CommScope (Andrew)', 'https://www.commscope.com/'] as Doc,
  times: ['Times Microwave Systems: documentation', 'https://timesmicrowave.com/documentations/'] as Doc,
};

const P = 'Product (typical)' as const;
const item = (id: string, category: string, sub: string, brand: string, model: string, specs: Record<string, SpecValue>, docs: Doc[] = [], notes?: string, recommendations?: string[]): SpecItem =>
  ({ id: `lv-${id}`, category, sub, brand, model, specs, kind: P, docs, notes, recommendations });
const old = (id: string, category: string, sub: string, brand: string, model: string, specs: Record<string, SpecValue>, legacy: LegacyInfo, docs: Doc[] = [], notes?: string): SpecItem =>
  ({ id: `legacy-${id}`, category, sub, brand, model, specs: { 'Status': legacy.status, ...(legacy.era ? { 'In service': legacy.era } : {}), ...specs }, kind: P, legacy, docs, notes });

// ───────────────────────── Current equipment ─────────────────────────
export const LV_CATALOG: SpecItem[] = [
  // Access control: controllers
  item('mercury-lp1502', 'Security & access control', 'Controller', 'Mercury Security', 'LP1502 intelligent controller', { 'Device type': 'Door controller (intelligent)', 'Doors / readers': '2 readers (expandable with MR50/MR52 boards)', 'Reader interface': 'OSDP or Wiegand', 'Power': '12–24 V DC or PoE', 'Host': 'Runs under many access software platforms (OEM firmware)' }, [], 'Open-platform hardware used by LenelS2, Software House, Genetec and others; the software brand decides firmware and licensing.'),
  item('mercury-lp4502', 'Security & access control', 'Controller', 'Mercury Security', 'LP4502 intelligent controller', { 'Device type': 'Door controller (intelligent)', 'Doors / readers': 'Up to 64 readers with downstream boards', 'Reader interface': 'OSDP or Wiegand', 'Power': '12–24 V DC or PoE+', 'Host': 'OEM access software' }),
  item('mercury-mr52', 'Security & access control', 'Interface board', 'Mercury Security', 'MR52 dual reader interface', { 'Device type': 'Reader interface module', 'Doors / readers': '2 readers', 'Inputs / outputs': '8 inputs, 6 relays', 'Power': '12–24 V DC', 'Bus': 'RS-485 to the controller' }),
  item('swh-istar-ultra', 'Security & access control', 'Controller', 'Software House', 'iSTAR Ultra door controller', { 'Device type': 'Door controller (intelligent)', 'Doors / readers': 'Up to 32 readers (model dependent)', 'Reader interface': 'OSDP or Wiegand', 'Power': '12–24 V DC / PoE (Ultra LT)', 'Host': 'C•CURE 9000' }, [DOC.swhouse]),
  item('lenel-x4420', 'Security & access control', 'Controller', 'LenelS2', 'LNL-X4420 intelligent controller', { 'Device type': 'Door controller (intelligent)', 'Doors / readers': '2 on board, up to 64 with interface boards', 'Reader interface': 'OSDP or Wiegand', 'Power': '12–24 V DC or PoE+', 'Host': 'OnGuard' }, [DOC.lenels2]),
  // Access control: readers and credentials
  item('hid-signo-20', 'Security & access control', 'Card reader', 'HID Global', 'Signo 20 reader (mullion)', { 'Device type': 'Card reader (multi-technology)', 'Resolution / format': 'Seos, iCLASS, MIFARE DESFire, Prox (configurable), mobile', 'Reader interface': 'OSDP v2 Secure Channel or Wiegand', 'Power': '12 V DC typical', 'Current (mA)': '≈ 70 avg / 250 peak', 'Max distance (ft)': 'OSDP 4,000 / Wiegand 500' }, [DOC.hid], 'Turn off 125 kHz prox read once all cards are replaced; prox cards are easy to copy.'),
  item('hid-signo-40', 'Security & access control', 'Card reader', 'HID Global', 'Signo 40 reader (wall switch)', { 'Device type': 'Card reader (multi-technology)', 'Resolution / format': 'Seos, iCLASS, MIFARE DESFire, Prox, mobile', 'Reader interface': 'OSDP v2 Secure Channel or Wiegand', 'Power': '12 V DC typical', 'Current (mA)': '≈ 80 avg / 280 peak' }, [DOC.hid]),
  item('hid-signo-40k', 'Security & access control', 'Card reader', 'HID Global', 'Signo 40K keypad reader', { 'Device type': 'Card reader with keypad (card + PIN)', 'Resolution / format': 'Seos, iCLASS, MIFARE DESFire, Prox, mobile', 'Reader interface': 'OSDP v2 or Wiegand', 'Power': '12 V DC typical' }, [DOC.hid]),
  item('cred-seos', 'Security & access control', 'Credential', 'HID Global', 'Seos card (13.56 MHz)', { 'Device type': 'Credential (smart card)', 'Resolution / format': '13.56 MHz, AES-128 secure messaging', 'Rating': 'ISO 14443 / ISO 7816' }, [DOC.hid]),
  item('cred-desfire', 'Security & access control', 'Credential', 'Typical', 'MIFARE DESFire EV3 card', { 'Device type': 'Credential (smart card)', 'Resolution / format': '13.56 MHz, AES-128', 'Rating': 'ISO 14443A' }, [], 'Order with a site-unique key/format; avoid reading only the card serial number (CSN).'),
  // Access control: locking hardware
  item('securitron-m62', 'Security & access control', 'Lock', 'Securitron (ASSA ABLOY)', 'M62 Magnalock 1200 lb', { 'Device type': 'Maglock (fail-safe)', 'Holding force': '1,200 lb', 'Power': '12 or 24 V DC (dual voltage)', 'Current (mA)': '500 @ 12 V / 250 @ 24 V', 'Rating': 'UL 10C (where listed) / UL 1034' }, [], 'Needs a listed REX motion + push button and fire alarm release per the adopted building code.', ['Mount on the secure side, armature on the door.', 'Use the built-in MOV / diode for back-EMF; do not remove it.', 'Fire alarm release: break the lock power, not just the controller output.']),
  item('securitron-m32', 'Security & access control', 'Lock', 'Securitron (ASSA ABLOY)', 'M32 Magnalock 600 lb', { 'Device type': 'Maglock (fail-safe)', 'Holding force': '600 lb', 'Power': '12 or 24 V DC', 'Current (mA)': '300 @ 12 V / 150 @ 24 V' }),
  item('hes-9600', 'Security & access control', 'Lock', 'HES (ASSA ABLOY)', '9600 surface electric strike (rim exit devices)', { 'Device type': 'Electric strike', 'Power': '12 or 24 V DC', 'Current (mA)': '450 @ 12 V / 240 @ 24 V', 'Rating': 'UL 10C fire-rated (fail-secure), UL 1034' }, [], 'Fail-secure only on fire-rated doors.'),
  item('hes-1006', 'Security & access control', 'Lock', 'HES (ASSA ABLOY)', '1006 electric strike (cylindrical / mortise locks)', { 'Device type': 'Electric strike', 'Power': '12 or 24 V DC', 'Current (mA)': '450 @ 12 V / 240 @ 24 V', 'Rating': 'UL 10C fire-rated (fail-secure), UL 1034' }),
  item('vd-qel', 'Security & access control', 'Lock', 'Von Duprin (Allegion)', 'QEL quiet electric latch retraction exit device', { 'Device type': 'Electric latch retraction (exit device)', 'Power': '24 V DC from a matching power supply (e.g. PS900 series)', 'Current (mA)': 'About 1,000 inrush, low hold (see datasheet)' }, [], 'Use the manufacturer\'s power supply; ELR inrush is high for standard supplies.'),
  item('schlage-ad400', 'Security & access control', 'Lock', 'Schlage (Allegion)', 'AD-400 networked wireless lock', { 'Device type': 'Wireless electronic lock (reader in lock)', 'Power': '4 × AA batteries', 'Communication': 'Wireless to a PIM400 / gateway', 'Resolution / format': 'Prox / smart card (reader module)' }),
  // Access control: power, REX, door position
  item('altronix-al600', 'Security & access control', 'Power supply', 'Altronix', 'AL600ULACM access power controller', { 'Device type': 'Power supply / access power controller', 'Power': '12 or 24 V DC, 6 A', 'Outputs': '8 fused, fail-safe or fail-secure selectable', 'Fire alarm': 'FACP disconnect input', 'Battery': 'Charges sealed lead-acid / gel standby batteries' }, [], 'Size at 80% of rating with all locks energized; add battery standby where required.'),
  item('altronix-al400', 'Security & access control', 'Power supply', 'Altronix', 'AL400ULACM access power controller', { 'Device type': 'Power supply / access power controller', 'Power': '12 or 24 V DC, 4 A', 'Outputs': '8 fused', 'Fire alarm': 'FACP disconnect input' }),
  item('bosch-ds160', 'Security & access control', 'Request to exit', 'Bosch', 'DS160 request-to-exit PIR', { 'Device type': 'Request-to-exit motion (REX)', 'Power': '12–30 V DC', 'Current (mA)': '≈ 30', 'Outputs': 'Form C relay, adjustable latch time', 'Range / coverage': 'Over-door, adjustable curtain' }, [DOC.bosch]),
  item('securitron-eeb', 'Security & access control', 'Request to exit', 'Securitron (ASSA ABLOY)', 'EEB series emergency exit button', { 'Device type': 'Push-to-exit button (pneumatic timer)', 'Power': '12–24 V DC', 'Outputs': 'Breaks lock power directly, 30 s timer' }, [], 'Many codes require this button to cut lock power directly, independent of the controller.'),
  item('dps-recessed', 'Security & access control', 'Door position', 'Typical', 'Recessed door position switch (DPS)', { 'Device type': 'Door contact', 'Outputs': 'Dry contact, supervised with EOL at the panel input', 'Gap': '¾–1 in' }),
  // Fire alarm: current panels and devices
  item('notifier-nfs2-640', 'Fire alarm', 'Control panel', 'Notifier', 'NFS2-640 addressable control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Loops': '1 SLC (2 with LCM-320/LEM-320 card)', 'Points': '318 per SLC (159 detectors + 159 modules)', 'Protocol': 'FlashScan (also CLIP mode)', 'Listing': 'UL 864 10th edition' }, [DOC.notifier]),
  item('notifier-nfs-320', 'Fire alarm', 'Control panel', 'Notifier', 'NFS-320 addressable control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Loops': '1 SLC', 'Points': '318 (159 detectors + 159 modules)', 'Protocol': 'FlashScan (also CLIP mode)', 'Listing': 'UL 864' }, [DOC.notifier], 'Common retrofit for AFP-200/AFP-300 sites: CLIP mode can keep existing 300/700-series devices on the loop (confirm device list in the manual).'),
  item('firelite-9600', 'Fire alarm', 'Control panel', 'Fire-Lite', 'MS-9600UDLS addressable control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Loops': '1 SLC (2nd with SLC-2LS)', 'Points': '318 per SLC', 'Communicator': 'Built-in dual-line DACT; IP/cell options', 'Listing': 'UL 864' }, [DOC.firelite]),
  item('firelite-9200', 'Fire alarm', 'Control panel', 'Fire-Lite', 'MS-9200UDLS addressable control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Loops': '1 SLC', 'Points': '198', 'Communicator': 'Built-in dual-line DACT', 'Listing': 'UL 864' }, [DOC.firelite]),
  item('sk-6820', 'Fire alarm', 'Control panel', 'Silent Knight', '6820 addressable control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Communicator': 'Built-in; IP / cellular options', 'Listing': 'UL 864' }, [DOC.silentknight]),
  item('simplex-4100es', 'Fire alarm', 'Control panel', 'Simplex', '4100ES fire alarm control unit', { 'Device type': 'Fire alarm control panel (addressable, networkable)', 'Protocol': 'IDNet / IDNet+', 'Voice': 'Optional emergency voice / mass notification', 'Listing': 'UL 864' }, [DOC.simplex]),
  item('simplex-4010es', 'Fire alarm', 'Control panel', 'Simplex', '4010ES fire alarm control unit', { 'Device type': 'Fire alarm control panel (addressable)', 'Protocol': 'IDNet', 'Listing': 'UL 864' }, [DOC.simplex]),
  item('est-est3x', 'Fire alarm', 'Control panel', 'Edwards (EST)', 'EST3X life safety control panel', { 'Device type': 'Fire alarm control panel (addressable, networkable)', 'Protocol': 'Signature series', 'Voice': 'Optional', 'Listing': 'UL 864' }, [DOC.edwards]),
  item('est-io64', 'Fire alarm', 'Control panel', 'Edwards (EST)', 'iO64 / iO1000 control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Protocol': 'Signature series', 'Listing': 'UL 864' }, [DOC.edwards]),
  item('mircom-fx2000', 'Fire alarm', 'Control panel', 'Mircom', 'FX-2000 series fire alarm control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Listing': 'UL 864 / ULC' }, [DOC.mircom]),
  item('ss-i3', 'Fire alarm', 'Initiating device', 'System Sensor', 'i3 series conventional smoke detector (2W-B / 4W-B)', { 'Device type': 'Photoelectric smoke (conventional)', 'Standby current (mA)': '0.05–0.12 (2-wire, see table)', 'Voltage': '8.5–35 V DC', 'Listing': 'UL 268' }, [DOC.systemsensor], 'Drop-in replacement on many conventional zones; check the panel compatibility list (2-wire detectors must be listed with the panel).'),
  item('ss-l-series', 'Fire alarm', 'Notification appliance', 'System Sensor', 'L-Series horn/strobe (wall)', { 'Device type': 'Horn/strobe', 'Standby current (mA)': 0, 'Alarm current (mA)': 'About 60–200 by candela (see table)', 'Voltage': '16–33 V DC', 'Candela / dB': '15–185 cd selectable', 'Listing': 'UL 1971 / UL 464' }, [DOC.systemsensor]),
  item('ss-spectralert', 'Fire alarm', 'Notification appliance', 'System Sensor', 'SpectrAlert Advance horn/strobe', { 'Device type': 'Horn/strobe', 'Standby current (mA)': 0, 'Alarm current (mA)': 'About 60–230 by candela (see table)', 'Voltage': '16–33 V DC', 'Candela / dB': '15–185 cd selectable', 'Listing': 'UL 1971 / UL 464' }, [DOC.systemsensor]),
  // CCTV
  item('axis-p3265', 'CCTV', 'IP camera', 'Axis', 'P3265-LVE dome camera', { 'Device type': 'IP dome camera', 'Resolution (px)': '1920 × 1080', 'Lens / field of view (°)': 'Varifocal, about 100–34° H', 'IR range (ft)': 'About 130', 'PoE class': 'Class 3', 'Rating (IP / IK)': 'IP66/67, IK10' }),
  item('axis-q6135', 'CCTV', 'IP camera', 'Axis', 'Q6135-LE PTZ camera', { 'Device type': 'IP PTZ camera', 'Resolution (px)': '1920 × 1080', 'Lens / field of view (°)': '32× optical zoom', 'IR range (ft)': 'About 650', 'PoE class': 'High PoE / 60 W midspan', 'Rating (IP / IK)': 'IP66/IK10' }),
  item('pelco-sarix', 'CCTV', 'IP camera', 'Pelco', 'Sarix Professional 4 series camera', { 'Device type': 'IP camera (dome / bullet)', 'Resolution (px)': '2 MP to 8 MP models', 'PoE class': 'Class 3' }, [DOC.pelco]),
  item('pelco-spectra-pro', 'CCTV', 'IP camera', 'Pelco', 'Spectra Enhanced / Spectra Pro IR PTZ camera', { 'Device type': 'IP PTZ camera', 'Resolution (px)': '2 MP / 4K models', 'PoE class': 'PoE+ / 24 V AC' }, [DOC.pelco], 'Current replacement path for older Spectra III and IV analog domes.'),
  item('nvr-16', 'CCTV', 'Recorder', 'Typical', '16-channel NVR with PoE', { 'Device type': 'Network video recorder (NVR)', 'Channels': 16, 'PoE class': '16 ports, 802.3af/at, about 160–200 W budget', 'Storage': '2–4 drive bays (size for days × bitrate)' }, [], 'Use the Calculators page for storage days and PoE budget.'),
  item('hd-coax-encoder', 'CCTV', 'Encoder', 'Typical', 'Analog-to-IP video encoder', { 'Device type': 'Video encoder', 'Channels': '1, 4 or 16 analog inputs', 'Resolution (px)': 'D1 / 960H', 'PoE class': 'Class 2–3 (single-channel)' }, [], 'Keeps working analog cameras on a new VMS while they are replaced over time.'),
  item('eoc-adapter', 'CCTV', 'Network extender', 'Typical', 'Ethernet-over-coax adapter pair (with PoE)', { 'Device type': 'Ethernet / PoE extender over RG-59 / RG-6', 'Max distance (ft)': 'About 1,000–2,000 at reduced speed', 'PoE class': 'Passes 802.3af/at (model dependent)' }, [], 'Reuses existing coax runs when an analog camera is swapped for an IP camera.'),
  // Intercom
  item('aiphone-ix', 'Intercom', 'Entry station', 'Aiphone', 'IX Series IP video door station (IX-DV / IX-EA)', { 'Device type': 'IP video door station', 'Protocol (analog / SIP)': 'IP (IX), SIP capable', 'Power': 'PoE', 'Cable': 'Cat 5e / 6', 'Max distance (ft)': 328 }, [DOC.aiphone]),
  item('aiphone-ix-mv7', 'Intercom', 'Master station', 'Aiphone', 'IX-MV7 IP video master station', { 'Device type': 'IP video master station', 'Protocol (analog / SIP)': 'IP (IX)', 'Power': 'PoE', 'Cable': 'Cat 5e / 6' }, [DOC.aiphone]),
  item('aiphone-gt', 'Intercom', 'Entry station', 'Aiphone', 'GT Series multi-tenant entry system', { 'Device type': 'Apartment entry (audio / video)', 'Protocol (analog / SIP)': 'Analog 2-wire (non-polarized)', 'Power': 'From GT power supply', 'Cable': 'Shielded 2-conductor per manual' }, [DOC.aiphone]),
  item('aiphone-jo', 'Intercom', 'Entry station', 'Aiphone', 'JO Series video intercom', { 'Device type': 'Residential / small office video intercom', 'Protocol (analog / SIP)': 'Analog 2-wire', 'Power': 'Supplied power adapter' }, [DOC.aiphone]),
  item('talkaphone-voip', 'Intercom', 'Help point', 'Talkaphone', 'VOIP-500 series IP call station', { 'Device type': 'IP help / call station', 'Protocol (analog / SIP)': 'SIP', 'Power': 'PoE', 'Cable': 'Cat 6' }, [DOC.talkaphone]),
  // Nurse call
  item('rauland-r5', 'Nurse call', 'System', 'Rauland', 'Responder 5 nurse call system', { 'Device type': 'IP nurse call system', 'Listing': 'UL 1069', 'Integration': 'Wireless phones, RTLS, EMR, bed exits' }, [DOC.rauland]),
  item('jeron-790', 'Nurse call', 'System', 'Jeron', 'Provider 790 nurse call system', { 'Device type': 'IP nurse call system', 'Listing': 'UL 1069', 'Integration': 'Phones, pagers, wireless' }, [DOC.jeron]),
  item('jeron-pillow', 'Nurse call', 'Patient station', 'Jeron', 'Patient station with pillow speaker jack', { 'Device type': 'Patient station', 'Listing': 'UL 1069', 'Power': 'From the room controller' }, [DOC.jeron]),
  // Paging & sound
  item('bogen-nyquist', 'Paging & sound', 'System', 'Bogen', 'Nyquist IP paging and intercom system', { 'Device type': 'IP paging / school intercom / bell', 'Line voltage': 'IP speakers (PoE) or 25/70 V via IP amplifiers', 'Integration': 'SIP phones, bell schedules, emergency announcements' }, [DOC.bogen]),
  item('bogen-amp', 'Paging & sound', 'Amplifier', 'Bogen', 'Mixer-amplifier (25 / 70 V), 60–250 W', { 'Device type': 'Paging amplifier', 'Amplifier power (W)': '60 / 100 / 150 / 250 models', 'Line voltage': '25 / 70 V and 4 Ω', 'Inputs': 'Mic, line, telephone page' }, [DOC.bogen]),
  item('valcom-ip-speaker', 'Paging & sound', 'Ceiling speaker', 'Valcom', 'IP ceiling speaker (PoE)', { 'Device type': 'IP speaker', 'Power': 'PoE', 'Protocol': 'SIP / multicast' }, [DOC.valcom]),
  item('sound-dsp', 'Paging & sound', 'Processor', 'Typical', 'DSP audio processor (pro sound)', { 'Device type': 'Digital signal processor', 'Inputs': '8–16 mic/line', 'Outputs': '8–16', 'Network audio': 'Dante / AES67 (model dependent)' }, [], 'Save the DSP file after every change and keep a copy with the job.'),
  item('sound-powered-spk', 'Paging & sound', 'Loudspeaker', 'Typical', 'Two-way installed loudspeaker (8 Ω / 70 V)', { 'Device type': 'Loudspeaker', 'Taps (W)': '7.5 / 15 / 30 / 60 (70 V)', 'Sensitivity (dB 1W/1m)': 92, 'Dispersion (°)': '90 × 60' }),
  // Mass notification
  item('mns-ecs', 'Mass notification', 'Control', 'Typical', 'In-building emergency voice / mass notification control (ECS)', { 'Device type': 'Emergency communication system', 'Listing': 'UL 864 / UL 2572', 'Speakers': '25 / 70 V speaker circuits, supervised', 'Intelligibility': 'Meet NFPA 72 Ch. 18/24 (STI ≥ 0.45 typical goal)' }, [DOC.simplex, DOC.edwards], 'Most fire alarm makers offer a voice / MNS version of their panels; listed for both fire and mass notification.'),
  item('mns-speaker-strobe', 'Mass notification', 'Speaker / strobe', 'Typical', 'Amber or clear speaker/strobe (MNS)', { 'Device type': 'Speaker/strobe', 'Taps (W)': '¼ – 2', 'Line voltage': '25 / 70 V', 'Candela / dB': '15–185 cd', 'Listing': 'UL 1480 / UL 1638' }, [], 'Amber or "ALERT" lens for mass notification; clear "FIRE" lens for fire.'),
  item('mns-giant-voice', 'Mass notification', 'Outdoor', 'Typical', 'Outdoor wide-area speaker array', { 'Device type': 'Outdoor siren / speaker array', 'Power': 'AC with battery backup', 'Communication': 'Radio / IP / cellular' }),
  // Emergency call boxes
  item('talkaphone-etp500', 'Emergency call boxes', 'Call box', 'Talkaphone', 'ETP-500 series emergency phone (analog / VoIP)', { 'Device type': 'Emergency phone / help point', 'Communication': 'Analog line, VoIP or cellular options', 'Power': 'Line, PoE or 12 V', 'Light': 'Blue strobe (tower models)', 'Mounting': 'Wall, pedestal or tower' }, [DOC.talkaphone]),
  item('codeblue-ip', 'Emergency call boxes', 'Call box', 'Code Blue', 'IP / cellular emergency help point', { 'Device type': 'Emergency phone / help point', 'Communication': 'IP, cellular or analog options', 'Power': 'PoE, AC or solar', 'Light': 'Blue strobe' }, [DOC.codeblue]),
  // DAS / ERCES
  item('commscope-era', 'ERCES / BDA & DAS', 'DAS', 'CommScope', 'ERA digital DAS', { 'Class': 'Active DAS (commercial cellular)', 'Bands': 'Multi-band 600–3,800 MHz', 'Supply (V)': 'AC / -48 V DC', 'Listing': 'Per model' }, [DOC.commscope]),
  item('erces-classa-fiber', 'ERCES / BDA & DAS', 'BDA', 'Typical', 'Public-safety Class A BDA with fiber remotes', { 'Class': 'Class A (channelized) BDA', 'Bands': '700/800 MHz (VHF/UHF options)', 'Supply (V)': 'AC + 12 h / 24 h battery', 'Enclosure': 'NEMA 4 type, 2-hour protection or rated room', 'Listing': 'UL 2524' }, [], 'Needs FCC Part 90 licensee consent and signal booster registration; see the ERCES pages.'),
  // Cabling and fiber
  item('cat6a-fut', 'Structured cabling', 'Twisted pair', 'Typical', 'Category 6A F/UTP cable (plenum)', { 'Category': '6A (shielded)', 'Bandwidth (MHz)': 500, 'Max channel (m)': 100, 'Conductor': '23 AWG solid', 'Jacket rating': 'CMP' }, [], 'Bond shields at the panel per TIA-607; use shielded jacks and patch cords end to end.'),
  item('cat6-utp', 'Structured cabling', 'Twisted pair', 'Typical', 'Category 6 U/UTP cable (riser)', { 'Category': '6', 'Bandwidth (MHz)': 250, 'Max channel (m)': 100, 'Conductor': '23 AWG solid', 'Jacket rating': 'CMR' }),
  item('fiber-os2-12', 'Fiber optics', 'Single-mode', 'Typical', '12-strand OS2 indoor/outdoor tight-buffer cable', { 'Fiber type': 'OS2 (G.652.D / G.657.A1)', 'Core / cladding (µm)': '9 / 125', 'Attenuation': '≤ 0.4 dB/km @ 1310 nm typical cable spec', 'Jacket rating': 'OFNR / OFNP or indoor/outdoor riser' }),
  item('fiber-om4-12', 'Fiber optics', 'Multimode', 'Typical', '12-strand OM4 distribution cable', { 'Fiber type': 'OM4 50/125', 'Core / cladding (µm)': '50 / 125', 'Attenuation': '≤ 3.0 dB/km @ 850 nm', 'Jacket rating': 'OFNP / OFNR' }),
];

// ───────────────────────── Legacy equipment ─────────────────────────
export const LEGACY: SpecItem[] = [
  // Fire alarm panels
  old('notifier-afp200', 'Fire alarm', 'Control panel', 'Notifier', 'AFP-200 addressable control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Loops': '1 SLC', 'Points': '198 (99 detectors + 99 modules)', 'Protocol': 'CLIP' },
    { status: 'Discontinued', era: '1990s–2000s', replacedBy: ['Notifier NFS-320 (CLIP mode keeps compatible existing devices)', 'Notifier NFS2-640'], service: ['Detectors are 300-series and 700-series CLIP devices (e.g. SDX-551, FSP-751); FlashScan 851-series devices can run in CLIP mode on newer panels.', 'Back up the program with the VeriFire / programming tool before any board swap.', 'Parts: look for refurbished boards from distributors; Notifier lists it on its discontinued products page.'] }, [DOC.notifierDisc, DOC.notifier]),
  old('notifier-afp300', 'Fire alarm', 'Control panel', 'Notifier', 'AFP-300 / AFP-400 addressable control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Loops': '1 SLC (AFP-300) / 2 SLC (AFP-400)', 'Points': '198 per SLC', 'Protocol': 'CLIP' },
    { status: 'Discontinued', era: '1990s–2000s', replacedBy: ['Notifier NFS2-640', 'Notifier NFS-320 (single loop)'], service: ['Same CLIP device family as the AFP-200.', 'Check the battery charger output and the power supply board first on trouble calls; aging supplies cause many faults.'] }, [DOC.notifierDisc]),
  old('notifier-am2020', 'Fire alarm', 'Control panel', 'Notifier', 'AM2020 / AFP1010 network panel', { 'Device type': 'Fire alarm control panel (large, networked)', 'Loops': 'Up to 10 SLC', 'Protocol': 'CLIP' },
    { status: 'Discontinued', era: '1990s–2000s', replacedBy: ['Notifier NFS2-3030 (ask about retrofit kits that reuse the cabinet and field wiring)'], service: ['Retrofit is usually done in phases, loop by loop; plan the fire watch with the AHJ.'] }, [DOC.notifierDisc]),
  old('notifier-clip-det', 'Fire alarm', 'Initiating device', 'Notifier', 'SDX-551 / FSP-751 CLIP smoke detector', { 'Device type': 'Photoelectric smoke (addressable, CLIP)', 'Standby current (mA)': 0.2, 'Alarm current (mA)': 0.2, 'Voltage': '15–32 V DC (SLC)' },
    { status: 'Discontinued', era: '1990s–2010s', replacedBy: ['Notifier FSP-851 (set the panel loop to CLIP mode or upgrade the panel)'], service: ['Rotary address switches 01–99; detectors and modules use separate address ranges.', 'A detector over its sensitivity window reports "maintenance alert"; clean or replace.'] }, [DOC.notifierDisc]),
  old('firelite-ms9200', 'Fire alarm', 'Control panel', 'Fire-Lite', 'MS-9200 / MS-9200UD addressable panel (older)', { 'Device type': 'Fire alarm control panel (addressable)', 'Loops': '1 SLC', 'Points': '198', 'Protocol': 'CLIP' },
    { status: 'Discontinued', era: '2000s', replacedBy: ['Fire-Lite MS-9200UDLS', 'Fire-Lite MS-9600UDLS'], service: ['Programming by keypad or PS-Tools; save the program before changing parts.', 'POTS dialer: plan a cellular or IP communicator where phone lines are gone.'] }, [DOC.firelite]),
  old('firelite-ms5024', 'Fire alarm', 'Control panel', 'Fire-Lite', 'MS-5024 / MS-5012 conventional panel', { 'Device type': 'Fire alarm control panel (conventional)', 'Zones': '12 or 24', 'Communicator': 'Built-in DACT (POTS)' },
    { status: 'Discontinued', era: '1990s–2000s', replacedBy: ['Fire-Lite MS-5UD / MS-10UD conventional', 'Addressable panel if devices are being replaced'], service: ['Zones use EOL resistors; match the value printed in the manual (often 4.7 kΩ).', 'Two-wire smoke detectors must be on the panel compatibility list.'] }, [DOC.firelite]),
  old('sk-5820xl', 'Fire alarm', 'Control panel', 'Silent Knight', 'IntelliKnight 5820XL addressable panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Communicator': 'Built-in DACT' },
    { status: 'Legacy (check availability)', era: '2000s–2010s', replacedBy: ['Silent Knight 6820 / 6808 series'], service: ['Program with the SK software and a programming cable; keep the file with the job.'] }, [DOC.silentknight]),
  old('sk-5208', 'Fire alarm', 'Control panel', 'Silent Knight', '5207 / 5208 conventional panel with communicator', { 'Device type': 'Fire alarm control panel (conventional)', 'Zones': '6–8', 'Communicator': 'Built-in DACT (POTS)' },
    { status: 'Legacy (check availability)', era: '1990s–2010s', replacedBy: ['Current Silent Knight conventional or addressable panel'], service: ['Phone-line sunsets: add a listed cellular or IP communicator.'] }, [DOC.silentknight]),
  old('simplex-4020', 'Fire alarm', 'Control panel', 'Simplex', '4020 fire alarm control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Protocol': 'MAPNET II / IDNet' },
    { status: 'Discontinued', era: '1990s–2000s', replacedBy: ['Simplex 4100ES (Simplex offers upgrade paths that reuse many field devices)'], service: ['MAPNET II devices may be supported on newer panels through an interface card; check with Simplex.', 'Programming needs Simplex software and authorization (dealer-only).'] }, [DOC.simplex]),
  old('simplex-4002', 'Fire alarm', 'Control panel', 'Simplex', '4002 / 4001 fire alarm panel', { 'Device type': 'Fire alarm control panel (conventional / hybrid)' },
    { status: 'Discontinued', era: '1990s', replacedBy: ['Simplex 4010ES or 4007ES'], service: ['Usually replaced, not repaired; plan the device and wiring survey before quoting.'] }, [DOC.simplex]),
  old('est-irc3', 'Fire alarm', 'Control panel', 'Edwards (EST)', 'IRC-3 control panel', { 'Device type': 'Fire alarm control panel (conventional / zoned)' },
    { status: 'Discontinued', era: '1980s–2000s', replacedBy: ['Edwards iO series or EST3X'], service: ['Edwards keeps a legacy section on its site; check it for manuals.'] }, [DOC.edwards]),
  old('est-est2', 'Fire alarm', 'Control panel', 'Edwards (EST)', 'EST2 control panel', { 'Device type': 'Fire alarm control panel (addressable)', 'Protocol': 'Signature series' },
    { status: 'Discontinued', era: '2000s', replacedBy: ['Edwards iO64 / iO1000', 'EST3X'], service: ['Signature devices store their own address and data; most can move to iO / EST3X loops (confirm with the compatibility list).'] }, [DOC.edwards]),
  old('gamewell-if600', 'Fire alarm', 'Control panel', 'Gamewell', 'IdentiFlex 600 series / 7100 series (FCI)', { 'Device type': 'Fire alarm control panel (addressable)' },
    { status: 'Discontinued', era: '1990s–2000s', replacedBy: ['Gamewell-FCI E3 Series or current Gamewell-FCI panel'], service: ['Confirm device protocol before reuse; many older loops need new devices.'] }, [DOC.gamewell]),
  old('ss-1400-2400', 'Fire alarm', 'Initiating device', 'System Sensor', '1400 ionization / 2400 photoelectric conventional detectors', { 'Device type': 'Smoke detector (conventional; ionization or photoelectric)', 'Standby current (mA)': 0.1, 'Voltage': '8.5–35 V DC', 'Listing': 'UL 268' },
    { status: 'Discontinued', era: '1990s–2010s', replacedBy: ['System Sensor i3 series (2W-B / 4W-B), checked against the panel compatibility list'], service: ['Ionization detectors contain a small radioactive source (Am-241): return them through the manufacturer or a take-back program, do not throw them away.', 'Most heads are past their 10-year life; replace rather than clean.'] }, [DOC.systemsensor]),
  old('fa-dact-pots', 'Fire alarm', 'Communicator', 'Typical', 'DACT on copper phone lines (POTS)', { 'Device type': 'Digital alarm communicator (2 phone lines)' },
    { status: 'Legacy (still sold)', era: 'Until the copper line is retired', replacedBy: ['Listed cellular communicator (LTE)', 'IP + cellular dual-path communicator (NFPA 72 26.6)'], service: ['Carriers are retiring copper lines; VoIP "POTS replacement" lines may not pass alarm formats reliably.', 'Test a signal to the central station after any phone service change.'] }),
  // Security / intrusion
  old('ademco-vista10p', 'Intrusion', 'Control panel', 'Ademco (Resideo)', 'Vista-10P control panel', { 'Device type': 'Intrusion control panel', 'Zone type': 'Hardwired + wireless (with receiver)' },
    { status: 'Discontinued', era: '2000s–2010s', replacedBy: ['Resideo Vista-20P', 'Resideo ProSeries (PROA7PLUS)'], service: ['Default installer code is 4112 if never changed; program from the keypad (*20 etc.) or Compass.', 'EOL is 2 kΩ on most Vista hardwire zones.'] }, [DOC.resideo]),
  old('ademco-vista128bp', 'Intrusion', 'Control panel', 'Ademco (Resideo)', 'Vista-128BP / Vista-250BP commercial panel', { 'Device type': 'Intrusion / commercial burglary panel', 'Zone type': 'Hardwire, V-Plex polling loop, wireless' },
    { status: 'Discontinued', era: '2000s–2010s', replacedBy: ['Resideo Vista-128BPT / Vista-250BPT'], service: ['V-Plex devices carry over to the BPT panels.', 'Old 2G/3G communicators (e.g. older GSM radios) no longer connect: replace with an LTE communicator.'] }, [DOC.resideo]),
  old('dsc-power', 'Intrusion', 'Control panel', 'DSC', 'PowerSeries PC1555 / PC1616 / PC1832 / PC5020 panels', { 'Device type': 'Intrusion control panel', 'Zone type': 'Hardwired + wireless with receiver' },
    { status: 'Discontinued', era: '1990s–2010s', replacedBy: ['DSC PowerSeries Neo (HS2016 / HS2032 / HS2064 / HS2128)'], service: ['Default installer code is often 5555 or 1234 (PC5020); enter programming with *8.', 'EOL is 5.6 kΩ on most PowerSeries zones.'] }, [DOC.dsc]),
  old('caddx-nx8', 'Intrusion', 'Control panel', 'GE / Interlogix (Caddx)', 'NetworX NX-4 / NX-6 / NX-8 / NX-8E panels', { 'Device type': 'Intrusion control panel' },
    { status: 'No longer supported', era: '1990s–2010s', replacedBy: ['Another maker\'s panel (Interlogix left the North American intrusion market about 2020)'], service: ['Keep spare keypads and expanders; plan a takeover panel when parts run out.'] }),
  old('napco-gemini', 'Intrusion', 'Control panel', 'Napco', 'Gemini GEM-P816 / P9600 panels (older)', { 'Device type': 'Intrusion control panel' },
    { status: 'Legacy (check availability)', era: '2000s–2010s', replacedBy: ['Current Napco Gemini or iBridge panel'], service: ['Napco keeps a technical library; download the programming guide before the service call.'] }, [DOC.napco]),
  old('comm-2g3g', 'Intrusion', 'Communicator', 'Typical', '2G / 3G cellular alarm communicators', { 'Device type': 'Cellular communicator (GSM / CDMA / 3G)' },
    { status: 'No longer supported', era: 'Until the 2G/3G networks shut down (US carriers ended 3G in 2022)', replacedBy: ['LTE (4G / LTE-M) communicator from the panel maker'], service: ['A panel that still reports "communication failure" daily often has a dead 3G radio.'] }),
  // CCTV
  old('cctv-analog-cam', 'CCTV', 'Analog camera', 'Typical', 'Analog CCTV camera (NTSC, 420–700 TVL)', { 'Device type': 'Analog camera (composite video, CVBS)', 'Resolution (px)': 'About 720 × 480 (D1) max', 'Power': '12 V DC or 24 V AC', 'Cable': 'RG-59 + 18/2 (Siamese)' },
    { status: 'Legacy (still sold)', era: '1980s–2010s', replacedBy: ['IP camera (reuse coax with Ethernet-over-coax adapters)', 'HD-over-coax camera (HD-TVI / AHD / HD-CVI) on the same RG-59 with a hybrid recorder'], service: ['No picture: check 12 V DC at the camera, then BNC connectors and the video balun.', 'Rolling bars: ground loop; use a ground-loop isolator or a balun.', 'Max RG-59 run about 750–1,000 ft for analog.'] }),
  old('pelco-spectra3', 'CCTV', 'Analog camera', 'Pelco', 'Spectra III / Spectra IV analog PTZ dome', { 'Device type': 'Analog PTZ dome camera', 'Power': '24 V AC', 'Control': 'Coaxitron or RS-422 (Pelco D / P protocol)' },
    { status: 'Discontinued', era: '1990s–2010s', replacedBy: ['Pelco Spectra Enhanced or Spectra Pro IR (IP)', 'Any IP PTZ on a VMS'], service: ['No control: check RS-422 polarity, address dip switches, protocol and baud rate.', '24 V AC under load at the dome; long 18 AWG runs drop too much voltage.'] }, [DOC.pelco]),
  old('pelco-dx8100', 'CCTV', 'Recorder', 'Pelco', 'DX8100 / DX4100 digital video recorder', { 'Device type': 'Digital video recorder (DVR)', 'Channels': '8 / 16' },
    { status: 'Discontinued', era: '2000s–2010s', replacedBy: ['Pelco VideoXpert or a hybrid NVR with analog inputs'], service: ['Drives fail with age; export needed video before working on the unit.'] }, [DOC.pelco]),
  old('cctv-matrix', 'CCTV', 'Recorder', 'Typical', 'Analog matrix switcher / multiplexer / VCR recorder', { 'Device type': 'Analog video switcher / multiplexer' },
    { status: 'Legacy (check availability)', era: '1980s–2000s', replacedBy: ['VMS with encoders for any analog cameras kept'], service: ['Document camera numbers and keyboard addresses before removal.'] }),
  // Access control
  old('hid-prox', 'Security & access control', 'Card reader', 'HID Global', '125 kHz prox readers (MiniProx 5365, ThinLine II 5395, ProxPro 5355)', { 'Device type': 'Card reader (125 kHz prox)', 'Resolution / format': '125 kHz HID Prox (26-bit, H10301, corporate formats)', 'Reader interface': 'Wiegand', 'Power': '5–16 V DC', 'Current (mA)': 'About 60–160' },
    { status: 'Legacy (check availability)', era: '1990s–2010s', replacedBy: ['HID Signo (reads prox during the migration, then turn prox off)', 'OSDP Secure Channel readers with 13.56 MHz credentials'], service: ['125 kHz prox cards and Wiegand wiring are easy to copy or tap; tell the owner and plan a migration.', 'Reader beeps but no access: check facility code and format in the software.', 'Wiegand: D0 green, D1 white, red +, black ground (check the reader label).'] }, [DOC.hid]),
  old('cred-proxcard2', 'Security & access control', 'Credential', 'HID Global', 'ProxCard II / ISOProx (125 kHz)', { 'Device type': 'Credential (125 kHz proximity)', 'Resolution / format': '26-bit or corporate formats' },
    { status: 'Legacy (still sold)', era: '1990s–present', replacedBy: ['Seos, iCLASS SE or DESFire EV3 cards; mobile credentials'], service: ['Card number is printed on the card (facility code + card number) for 26-bit formats.'] }, [DOC.hid]),
  old('casi-pp', 'Security & access control', 'System', 'Casi-Rusco / GE / UTC', 'Picture Perfect and Secure Perfect access systems', { 'Device type': 'Access control system (software + Micro/5 controllers)' },
    { status: 'No longer supported', era: '1990s–2010s', replacedBy: ['LenelS2 OnGuard (migration tools exist; confirm with LenelS2)', 'Any current platform on Mercury hardware'], service: ['Get a full card and reader export before the old server fails.'] }, [DOC.lenels2]),
  old('lenel-lnl2000', 'Security & access control', 'Controller', 'Lenel', 'LNL-500 / LNL-1000 / LNL-2000 controllers', { 'Device type': 'Door controller (intelligent)', 'Reader interface': 'Wiegand / RS-485 interface boards' },
    { status: 'Discontinued', era: '2000s–2010s', replacedBy: ['LenelS2 LNL-X2220 / LNL-X4420', 'LNL-4420 (Mercury-based)'], service: ['Downstream interface boards (LNL-1300/1320) often carry over; check the firmware matrix.'] }, [DOC.lenels2]),
  old('swh-istar-classic', 'Security & access control', 'Controller', 'Software House', 'iSTAR Classic / iSTAR Pro controllers', { 'Device type': 'Door controller (intelligent)', 'Host': 'C•CURE 800 / 9000' },
    { status: 'Discontinued', era: '2000s–2010s', replacedBy: ['Software House iSTAR Ultra / Ultra SE'], service: ['Check C•CURE version support before replacing; very old C•CURE 800 sites need a software upgrade first.'] }, [DOC.swhouse]),
  old('nc-n1000', 'Security & access control', 'Controller', 'Northern Computers (Honeywell)', 'N-1000 / N-485 access controllers', { 'Device type': 'Access controller (legacy)' },
    { status: 'No longer supported', era: '1990s–2000s', replacedBy: ['Honeywell Pro-Watch with current controllers'], service: ['RS-485 loops: check termination and shield grounding at one end only.'] }),
  old('keyscan-ca', 'Security & access control', 'Controller', 'Keyscan', 'CA250 / CA4500 / CA8500 access controllers', { 'Device type': 'Access controller', 'Host': 'Keyscan System VII / Aurora' },
    { status: 'Legacy (check availability)', era: '2000s–2010s', replacedBy: ['Current Keyscan controllers with Aurora software'], service: ['Many CA boards work under Aurora; confirm with Keyscan before replacing hardware.'] }, [DOC.keyscan]),
  // Intercom
  old('aiphone-lef', 'Intercom', 'Master station', 'Aiphone', 'LEF series selective-call intercom (LEF-3 / LEF-5 / LEF-10)', { 'Device type': 'Audio master station (selective call)', 'Protocol (analog / SIP)': 'Analog, home-run wiring', 'Power': 'Aiphone power supply' },
    { status: 'Legacy (check availability)', era: '1990s–2010s', replacedBy: ['Aiphone IX Series (IP) or the current Aiphone audio intercom line'], service: ['Use the Aiphone-recommended cable; mixing cable types causes hum and low volume.'] }, [DOC.aiphone]),
  old('aiphone-mk', 'Intercom', 'Entry station', 'Aiphone', 'MK / MY series video intercom', { 'Device type': 'Video intercom (analog)', 'Protocol (analog / SIP)': 'Analog' },
    { status: 'Discontinued', era: '1990s–2000s', replacedBy: ['Aiphone JO Series (residential)', 'Aiphone GT or IX Series (commercial)'], service: ['Monitors use CRT or early LCD; replace the system rather than repair.'] }, [DOC.aiphone]),
  old('rauland-tc21', 'Intercom', 'System', 'Rauland', 'Telecenter System 21 / older Telecenter school intercom', { 'Device type': 'School intercom / paging / clock system', 'Protocol (analog / SIP)': 'Analog' },
    { status: 'No longer supported', era: '1980s–2000s', replacedBy: ['Rauland Telecenter U / Telecenter ICS'], service: ['Many classroom speakers and call switches can be reused; survey them first.'] }, [DOC.rauland]),
  old('talkaphone-etp400', 'Intercom', 'Help point', 'Talkaphone', 'ETP-400 series and older analog call stations', { 'Device type': 'Analog help / call station', 'Protocol (analog / SIP)': 'Analog (phone line)' },
    { status: 'Discontinued', era: '2000s–2010s', replacedBy: ['Talkaphone ETP-500 / VOIP-500 series'], service: ['Talkaphone keeps manuals and datasheets for discontinued models on its site.'] }, [DOC.talkaphoneDisc]),
  // Nurse call
  old('rauland-responder34', 'Nurse call', 'System', 'Rauland', 'Responder III / Responder IV nurse call', { 'Device type': 'Nurse call system (legacy)', 'Listing': 'UL 1069' },
    { status: 'No longer supported', era: '1990s–2010s', replacedBy: ['Rauland Responder 5'], service: ['Rauland lists these as no longer manufactured or supported; spare parts come from the used market only.', 'Plan replacement by unit to keep patient areas covered.'] }, [DOC.raulandLegacy]),
  old('jeron-analog', 'Nurse call', 'System', 'Jeron', 'Older Jeron analog / tone-visual nurse call', { 'Device type': 'Nurse call system (legacy)', 'Listing': 'UL 1069' },
    { status: 'Legacy (check availability)', era: '1990s–2010s', replacedBy: ['Jeron Provider 790'], service: ['Jeron posts downloads on its site; ask Jeron for the legacy manual if it is not listed.'] }, [DOC.jeron]),
  old('hillrom-comlinx', 'Nurse call', 'System', 'Hill-Rom', 'COMLinx / COMposer nurse call', { 'Device type': 'Nurse call system (legacy)', 'Listing': 'UL 1069' },
    { status: 'Legacy (check availability)', era: '2000s–2010s', replacedBy: ['Current Hillrom (Baxter) nurse call platform'], service: ['Usually serviced under a manufacturer contract; check before working on it.'] }),
  // Paging & sound
  old('bogen-quantum', 'Paging & sound', 'System', 'Bogen', 'Quantum / Multicom 2000 school intercom', { 'Device type': 'School intercom / paging (analog)', 'Line voltage': '25 V speaker lines' },
    { status: 'Legacy (check availability)', era: '1990s–2010s', replacedBy: ['Bogen Nyquist (IP)'], service: ['Classroom speakers on 25 V lines can often be reused with Nyquist IP amplifiers.'] }, [DOC.bogen]),
  old('valcom-legacy', 'Paging & sound', 'System', 'Valcom', 'Valcom archived paging and talkback products', { 'Device type': 'Paging / talkback (analog)', 'Line voltage': 'One-way and talkback speakers' },
    { status: 'Discontinued', era: '1980s–2010s', replacedBy: ['Valcom IP paging (VIP series)'], service: ['Valcom\'s archived product list links an installation manual for each old part number.'] }, [DOC.valcomArch]),
  old('paging-tube-amp', 'Paging & sound', 'Amplifier', 'Typical', 'Older paging amplifier (pre-DSP, 25 / 70 V)', { 'Device type': 'Paging amplifier', 'Line voltage': '25 / 70 V' },
    { status: 'Legacy (still sold)', era: '1970s–2000s', replacedBy: ['Current mixer-amplifier or IP amplifier sized at 80% of load'], service: ['Measure line impedance before reconnecting; added speakers often overload old amps.', 'Hum: check the telephone page input isolation.'] }),
  // Mass notification
  old('mns-horn-only', 'Mass notification', 'Control', 'Typical', 'Horn-only evacuation / non-intelligible voice systems', { 'Device type': 'Evacuation signaling (tone only)' },
    { status: 'Legacy (still sold)', era: 'Pre-2010', replacedBy: ['Listed emergency voice / mass notification system (UL 2572) with intelligibility testing'], service: ['Replacement may trigger code updates for intelligibility; check with the AHJ.'] }),
  // Emergency call boxes
  old('callbox-analog', 'Emergency call boxes', 'Call box', 'Typical', 'Analog phone-line or 3G emergency call boxes', { 'Device type': 'Emergency phone / help point', 'Communication': 'Copper phone line or 3G cellular' },
    { status: 'No longer supported', era: '1990s–2010s', replacedBy: ['VoIP or LTE cellular emergency phone (Talkaphone, Code Blue and others)'], service: ['A dead 3G radio means no calls; test every box after a carrier change.', 'Many towers can be reused with a new phone head.'] }, [DOC.talkaphoneDisc, DOC.codeblue]),
  // DAS / ERCES
  old('andrew-node', 'ERCES / BDA & DAS', 'BDA', 'Andrew (CommScope)', 'Node A / Node C indoor repeaters', { 'Class': 'Indoor repeater (legacy)', 'Bands': 'Cellular / PCS / SMR (model dependent)' },
    { status: 'Discontinued', era: '2000s', replacedBy: ['Current Class A public-safety BDA or CommScope ERA DAS'], service: ['Older units may not meet the 2013 FCC signal booster rules; do not reuse without checking.'] }, [DOC.commscope]),
  old('bda-pre-rebanding', 'ERCES / BDA & DAS', 'BDA', 'Typical', 'Pre-rebanding 800 MHz BDA (before 2014 FCC booster rules)', { 'Class': 'Class B (broadband) or Class A', 'Bands': '806–824 / 851–869 MHz (old channel plan)' },
    { status: 'No longer supported', era: '1990s–2014', replacedBy: ['Current Class A BDA, UL 2524 listed, with FCC registration and licensee consent'], service: ['800 MHz rebanding moved NPSPAC channels; an old filter set may block today\'s channels.', 'Class B boosters must be registered with the FCC and have licensee consent (Part 90.219).'] }),
  // Cabling & fiber
  old('cab-cat3', 'Structured cabling', 'Twisted pair', 'Typical', 'Category 3 cable', { 'Category': '3', 'Bandwidth (MHz)': 16, 'Max channel (m)': 100, 'Typical use': 'Voice, 10BASE-T' },
    { status: 'Legacy (still sold)', era: '1990s', replacedBy: ['Category 6 or 6A'], service: ['Fine for analog phones and alarm dialers; not for data or PoE cameras.'] }),
  old('cab-cat5', 'Structured cabling', 'Twisted pair', 'Typical', 'Category 5 (not 5e) cable', { 'Category': '5', 'Bandwidth (MHz)': 100, 'Max channel (m)': 100, 'Typical use': '100BASE-TX' },
    { status: 'Discontinued', era: 'Mid-1990s–2001', replacedBy: ['Category 6 or 6A'], service: ['TIA no longer recognizes Cat 5; it may pass gigabit on short runs but cannot be certified to Cat 5e.'] }),
  old('cab-coax-ethernet', 'Structured cabling', 'Coax', 'Typical', '10BASE2 / 10BASE5 coax Ethernet (thinnet / thicknet)', { 'Category': 'RG-58 (thinnet) / RG-8 (thicknet)', 'Bandwidth (MHz)': '10 Mb/s shared', 'Max channel (m)': '185 (thinnet) / 500 (thicknet)' },
    { status: 'No longer supported', era: '1980s–1990s', replacedBy: ['Category 6A to a switch'], service: ['Leftover coax can carry Ethernet-over-coax adapters or analog video if it tests good.'] }),
  old('cab-type1', 'Structured cabling', 'Twisted pair', 'IBM', 'IBM Type 1 STP (Token Ring, 150 Ω)', { 'Category': '150 Ω shielded twisted pair', 'Typical use': 'Token Ring 4 / 16 Mb/s' },
    { status: 'No longer supported', era: '1980s–1990s', replacedBy: ['Category 6A'], service: ['Large data connectors (IBM Data Connector); usually abandoned in place: remove per NEC 800.25 / 770.25.'] }),
  old('cab-66block', 'Structured cabling', 'Termination', 'Typical', '66 block (punch-down) for data', { 'Category': 'Cat 3 / Cat 5 rated (some)' },
    { status: 'Legacy (still sold)', era: '1960s–present', replacedBy: ['110 blocks or Cat 6 / 6A patch panels for data'], service: ['Fine for voice and alarm cross-connects; do not run gigabit data through it.'] }),
  old('fib-om1', 'Fiber optics', 'Multimode', 'Typical', 'OM1 62.5/125 multimode fiber', { 'Fiber type': 'OM1 62.5/125 (orange jacket)', 'Core / cladding (µm)': '62.5 / 125', 'Attenuation': '3.5 dB/km @ 850 nm', 'Bandwidth': '200 MHz·km @ 850 nm', 'Reach': '1000BASE-SX about 275 m; 10GBASE-SR about 33 m' },
    { status: 'Legacy (still sold)', era: '1980s–2000s', replacedBy: ['OM4 (multimode) or OS2 (single-mode)'], service: ['Never mix 62.5 and 50 µm patch cords: expect about 4 dB extra loss one way.', 'Check the optic: many new SFPs are specified for OM3/OM4 reach only.'] }),
  old('fib-om2', 'Fiber optics', 'Multimode', 'Typical', 'OM2 50/125 multimode fiber (non laser-optimized)', { 'Fiber type': 'OM2 50/125 (orange jacket)', 'Core / cladding (µm)': '50 / 125', 'Bandwidth': '500 MHz·km @ 850 nm', 'Reach': '1000BASE-SX about 550 m; 10GBASE-SR about 82 m' },
    { status: 'Legacy (still sold)', era: '1990s–2000s', replacedBy: ['OM4 or OS2'], service: ['Label the jacket color: OM2 is orange like OM1, so check the print legend.'] }),
  old('fib-st', 'Fiber optics', 'Connector', 'Typical', 'ST and biconic fiber connectors', { 'Fiber type': 'ST (bayonet) / biconic', 'Attenuation': 'About 0.3–0.5 dB per mated pair (ST)' },
    { status: 'Legacy (still sold)', era: '1980s–2000s', replacedBy: ['LC (duplex) connectors; hybrid ST-LC patch cords for transition'], service: ['Clean and inspect ST end faces like any other connector; ST keys can turn in worn adapters.'] }),
  old('cab-rg59-cctv', 'Coax & feeders', 'Coax', 'Typical', 'RG-59/U coax for analog CCTV', { 'Size': '0.242"', 'Loss @450 MHz (dB/100 ft)': 'About 5', 'Jacket': 'PVC or plenum', 'Connector': 'BNC (75 Ω)' },
    { status: 'Legacy (still sold)', era: '1970s–present', replacedBy: ['Category 6 for IP cameras', 'Keep for HD-over-coax or Ethernet-over-coax adapters'], service: ['Use 75 Ω BNC compression connectors; most picture problems on old systems are failed crimps.'] }),
  // Network & Wi-Fi
  old('net-prestd-poe', 'Network & PoE', 'PoE', 'Typical', 'Pre-standard PoE (Cisco inline power) and 10/100 hubs', { 'PoE standard': 'Pre-802.3af (Cisco ILP) or none', 'Ports': '10/100 Mb/s' },
    { status: 'No longer supported', era: '1990s–2000s', replacedBy: ['802.3at / 802.3bt PoE switch'], service: ['Some pre-standard phones and APs will not power from a standard PoE port; check before swapping the switch.'] }),
  old('wifi-legacy', 'Wi-Fi', 'Access point', 'Typical', '802.11b/g access points (WEP / WPA-TKIP)', { 'Standard': '802.11b/g', 'Bands': '2.4 GHz', 'Max channel width': '20 MHz' },
    { status: 'No longer supported', era: '2000s', replacedBy: ['Wi-Fi 6 / 6E access point with WPA3'], service: ['WEP and TKIP are not secure: replace, do not reuse.', 'Older devices may need a 2.4 GHz SSID during the change-over.'] }),
];

export const isLegacy = (it: Pick<SpecItem, 'legacy'>) => !!it.legacy;
/** Label for a selection list: marks legacy and discontinued items. */
export const legacyTag = (it: { legacy?: { status: string } }) => (it.legacy ? ` · ⚠ Legacy (${it.legacy.status.replace(/^Legacy \((.*)\)$/, '$1').toLowerCase()})` : '');
