// Specifications library: built-in reference entries. Two kinds:
//  - "Product (typical)": manufacturer products from the app's equipment catalog, typical datasheet values.
//  - "Standard": values fixed by a published standard (IEEE, TIA, FCC band plans, NEC tables).
// Always confirm product values against the current manufacturer datasheet before procurement.
import { ANTENNAS, FEEDERS, RADIOS, PV_MODULES } from './catalog';
import { AWG_SIZES, AMPACITY_75C_CU, AMPACITY_90C_CU, RESISTANCE_OHM_PER_KFT } from '../engine/electrical';

export type SpecValue = string | number;
export interface SpecItem {
  id: string; category: string; sub: string; brand: string; model: string;
  specs: Record<string, SpecValue>;
  kind: 'Product (typical)' | 'Standard' | 'My item';
  reference?: string; datasheet?: string; notes?: string; added?: number;
}
export const CATEGORIES = [
  'Antennas', 'Coax & feeders', 'Connectors', 'Radios & repeaters', 'ERCES / BDA & DAS', 'Public safety bands',
  'Fire alarm', 'Batteries', 'Solar & DC power', 'Wi-Fi', 'Network & PoE', 'Structured cabling', 'Fiber optics',
  'Conductors', 'Surge & grounding', 'Security & access control', 'Other',
] as const;

/** Spec fields offered when adding an item of a category (any extra field can be added too). */
export const TEMPLATES: Record<string, string[]> = {
  'Antennas': ['Type', 'Band low (MHz)', 'Band high (MHz)', 'Gain (dBi)', 'H beamwidth (°)', 'V beamwidth (°)', 'Connector', 'Max power (W)', 'Weight (lb)', 'Wind area (sq ft)', 'Mount'],
  'Coax & feeders': ['Size', 'Loss @150 MHz (dB/100 ft)', 'Loss @450 MHz (dB/100 ft)', 'Loss @900 MHz (dB/100 ft)', 'Loss @1800 MHz (dB/100 ft)', 'Loss @2400 MHz (dB/100 ft)', 'Min bend radius (in)', 'Jacket', 'Connector'],
  'Connectors': ['Interface', 'Frequency range', 'Impedance (Ω)', 'Coupling', 'Cable'],
  'Radios & repeaters': ['Type', 'Band low (MHz)', 'Band high (MHz)', 'Max power (W)', 'Sensitivity (dBm)', 'Modes', 'DC input (V)', 'TX current (A)', 'RX current (A)'],
  'ERCES / BDA & DAS': ['Class', 'Bands', 'Max output (dBm)', 'Max gain (dB)', 'Supply (V)', 'Current (A)', 'Enclosure', 'Listing'],
  'Fire alarm': ['Device type', 'Standby current (mA)', 'Alarm current (mA)', 'Voltage', 'Candela / dB', 'Listing'],
  'Batteries': ['Chemistry', 'Nominal voltage (V)', 'Capacity (Ah)', 'Float voltage (V)', 'Dimensions', 'Weight (lb)', 'Terminal'],
  'Solar & DC power': ['Type', 'Pmax (W)', 'Voc (V)', 'Vmp (V)', 'Isc (A)', 'Imp (A)', 'Temp coeff Voc (%/°C)', 'Rating'],
  'Wi-Fi': ['Standard', 'Bands', 'Max channel width', 'Spatial streams', 'Max TX power (dBm)', 'PoE class', 'Antenna gain (dBi)'],
  'Network & PoE': ['Ports', 'PoE standard', 'PoE budget (W)', 'Uplinks', 'Power supply'],
  'Structured cabling': ['Category', 'Bandwidth (MHz)', 'Max channel (m)', 'Conductor', 'Jacket rating'],
  'Fiber optics': ['Fiber type', 'Core / cladding (µm)', 'Attenuation', 'Bandwidth', 'Reach'],
  'Conductors': ['Size', 'Ampacity 75 °C (A)', 'Ampacity 90 °C (A)', 'DC resistance (Ω/1000 ft)'],
  'Surge & grounding': ['Type', 'Frequency range', 'Connector', 'Surge rating', 'Insertion loss (dB)'],
  'Security & access control': ['Device type', 'Resolution / format', 'Power', 'PoE class', 'Current (mA)', 'Rating'],
  'Public safety bands': ['Mobile / uplink TX (MHz)', 'Base / downlink TX (MHz)', 'Notes'],
  'Other': ['Type', 'Voltage', 'Current', 'Notes'],
};

const P = 'Product (typical)' as const, S = 'Standard' as const;
const builtFromCatalog = (): SpecItem[] => [
  ...ANTENNAS.map((a) => ({ id: `cat-ant-${a.id}`, category: 'Antennas', sub: a.type, brand: a.brand, model: a.model, kind: P,
    specs: { 'Type': a.type, 'Band low (MHz)': a.bandMHz[0], 'Band high (MHz)': a.bandMHz[1], 'Gain (dBi)': a.gainDbi, 'H beamwidth (°)': a.hBwDeg, 'V beamwidth (°)': a.vBwDeg, 'Connector': a.connector, 'Weight (lb)': a.weightLb, 'Wind area (sq ft)': a.windAreaSqft, 'Mount': a.mount } })),
  ...FEEDERS.map((f) => ({ id: `cat-fd-${f.id}`, category: 'Coax & feeders', sub: f.size, brand: f.brand, model: f.model, kind: P,
    specs: { 'Size': f.size, ...Object.fromEntries(f.points.map(([m, l]) => [`Loss @${m} MHz (dB/100 ft)`, l])), 'Min bend radius (in)': f.minBendIn, 'Connector': f.connector, 'Hanger': f.hanger, 'Hanger spacing (ft)': f.hangerSpacingFt, 'Ground kit': f.groundKit } })),
  ...RADIOS.map((r) => ({ id: `cat-rad-${r.id}`, category: /BDA/.test(r.type) ? 'ERCES / BDA & DAS' : 'Radios & repeaters', sub: r.type, brand: r.brand, model: r.model, kind: P,
    specs: { 'Type': r.type, 'Band low (MHz)': r.bandMHz[0], 'Band high (MHz)': r.bandMHz[1], 'Max power (W)': r.maxPowerW, 'Sensitivity (dBm)': r.sensitivityDbm, 'DC input (V)': r.dcInputV, 'TX current (A)': r.drawTxA, 'RX current (A)': r.drawRxA } })),
  ...PV_MODULES.map((m) => ({ id: `cat-pv-${m.id}`, category: 'Solar & DC power', sub: 'PV module', brand: m.brand, model: m.model, kind: P,
    specs: { 'Type': 'PV module', 'Pmax (W)': m.pmaxW, 'Voc (V)': m.vocV, 'Vmp (V)': m.vmpV, 'Isc (A)': m.iscA, 'Imp (A)': m.impA, 'Temp coeff Voc (%/°C)': m.tempCoeffVocPctPerC } })),
];

const std = (id: string, category: string, sub: string, model: string, specs: Record<string, SpecValue>, reference: string, notes?: string): SpecItem =>
  ({ id: `std-${id}`, category, sub, brand: 'Standard', model, specs, kind: S, reference, notes });

const STANDARDS: SpecItem[] = [
  // PoE (IEEE 802.3)
  std('poe-af', 'Network & PoE', 'PoE', 'PoE Type 1 (802.3af)', { 'Power at PSE (W)': 15.4, 'Power at PD (W)': 12.95, 'Pairs used': 2, 'Max cable (m)': 100 }, 'IEEE 802.3af / 802.3 Clause 33'),
  std('poe-at', 'Network & PoE', 'PoE', 'PoE+ Type 2 (802.3at)', { 'Power at PSE (W)': 30, 'Power at PD (W)': 25.5, 'Pairs used': 2, 'Max cable (m)': 100 }, 'IEEE 802.3at'),
  std('poe-bt3', 'Network & PoE', 'PoE', 'PoE++ Type 3 (802.3bt)', { 'Power at PSE (W)': 60, 'Power at PD (W)': 51, 'Pairs used': 4, 'Max cable (m)': 100 }, 'IEEE 802.3bt'),
  std('poe-bt4', 'Network & PoE', 'PoE', 'PoE++ Type 4 (802.3bt)', { 'Power at PSE (W)': 90, 'Power at PD (W)': 71.3, 'Pairs used': 4, 'Max cable (m)': 100 }, 'IEEE 802.3bt', 'Bundled PoE cables heat up: check TIA TSB-184-A / NEC 840.160 for bundle sizes.'),
  // Copper cabling (TIA-568.2-D)
  std('cat5e', 'Structured cabling', 'Twisted pair', 'Category 5e', { 'Category': '5e', 'Bandwidth (MHz)': 100, 'Max channel (m)': 100, 'Permanent link (m)': 90, 'Typical use': '1000BASE-T' }, 'ANSI/TIA-568.2-D'),
  std('cat6', 'Structured cabling', 'Twisted pair', 'Category 6', { 'Category': '6', 'Bandwidth (MHz)': 250, 'Max channel (m)': 100, 'Permanent link (m)': 90, 'Typical use': '1000BASE-T; 10GBASE-T to about 55 m' }, 'ANSI/TIA-568.2-D; TSB-155'),
  std('cat6a', 'Structured cabling', 'Twisted pair', 'Category 6A', { 'Category': '6A', 'Bandwidth (MHz)': 500, 'Max channel (m)': 100, 'Permanent link (m)': 90, 'Typical use': '10GBASE-T, PoE Type 3/4' }, 'ANSI/TIA-568.2-D'),
  // Fiber (TIA-568.3-D, IEEE 802.3)
  std('om3', 'Fiber optics', 'Multimode', 'OM3 multimode', { 'Fiber type': 'Laser-optimized MMF', 'Core / cladding (µm)': '50 / 125', 'Attenuation': '3.0 dB/km @ 850 nm (max)', 'Bandwidth': '2000 MHz·km EMB @ 850 nm', 'Reach': '10GBASE-SR 300 m' }, 'TIA-568.3-D; IEEE 802.3ae'),
  std('om4', 'Fiber optics', 'Multimode', 'OM4 multimode', { 'Fiber type': 'Laser-optimized MMF', 'Core / cladding (µm)': '50 / 125', 'Attenuation': '3.0 dB/km @ 850 nm (max)', 'Bandwidth': '4700 MHz·km EMB @ 850 nm', 'Reach': '10GBASE-SR 400 m' }, 'TIA-568.3-D'),
  std('os2', 'Fiber optics', 'Single-mode', 'OS2 single-mode', { 'Fiber type': 'SMF (ITU-T G.652.D)', 'Core / cladding (µm)': '9 / 125', 'Attenuation': '≤ 1.0 dB/km inside plant, ≤ 0.5 dB/km outside plant (1310/1550 nm)', 'Reach': '10GBASE-LR 10 km' }, 'TIA-568.3-D; ITU-T G.652'),
  // Wi-Fi (IEEE 802.11)
  std('wifi4', 'Wi-Fi', 'Standard', 'Wi-Fi 4 (802.11n)', { 'Standard': '802.11n', 'Bands': '2.4 / 5 GHz', 'Max channel width': '40 MHz', 'Spatial streams': 4 }, 'IEEE 802.11n-2009'),
  std('wifi5', 'Wi-Fi', 'Standard', 'Wi-Fi 5 (802.11ac)', { 'Standard': '802.11ac', 'Bands': '5 GHz', 'Max channel width': '160 MHz', 'Spatial streams': 8 }, 'IEEE 802.11ac-2013'),
  std('wifi6', 'Wi-Fi', 'Standard', 'Wi-Fi 6 / 6E (802.11ax)', { 'Standard': '802.11ax', 'Bands': '2.4 / 5 / 6 GHz (6E)', 'Max channel width': '160 MHz', 'Spatial streams': 8 }, 'IEEE 802.11ax-2021'),
  std('wifi7', 'Wi-Fi', 'Standard', 'Wi-Fi 7 (802.11be)', { 'Standard': '802.11be', 'Bands': '2.4 / 5 / 6 GHz', 'Max channel width': '320 MHz', 'Spatial streams': 16 }, 'IEEE 802.11be-2024'),
  // RF connectors (typical rated ranges)
  std('n', 'Connectors', 'RF', 'Type N', { 'Interface': 'N', 'Frequency range': 'DC – 11 GHz', 'Impedance (Ω)': 50, 'Coupling': 'Threaded' }, 'MIL-STD-348 / IEC 61169-16'),
  std('4310', 'Connectors', 'RF', '4.3-10', { 'Interface': '4.3-10', 'Frequency range': 'DC – 6 GHz', 'Impedance (Ω)': 50, 'Coupling': 'Screw / push-pull / hand-screw', 'Notes': 'Low-PIM, common on cellular & DAS' }, 'IEC 61169-54'),
  std('716', 'Connectors', 'RF', '7/16 DIN', { 'Interface': '7/16 DIN', 'Frequency range': 'DC – 7.5 GHz', 'Impedance (Ω)': 50, 'Coupling': 'Threaded', 'Notes': 'Low-PIM, high power' }, 'IEC 61169-4'),
  std('sma', 'Connectors', 'RF', 'SMA', { 'Interface': 'SMA', 'Frequency range': 'DC – 18 GHz', 'Impedance (Ω)': 50, 'Coupling': 'Threaded' }, 'MIL-STD-348 / IEC 61169-15'),
  std('bnc', 'Connectors', 'RF', 'BNC', { 'Interface': 'BNC', 'Frequency range': 'DC – 4 GHz', 'Impedance (Ω)': '50 / 75', 'Coupling': 'Bayonet' }, 'IEC 61169-8'),
  std('tnc', 'Connectors', 'RF', 'TNC', { 'Interface': 'TNC', 'Frequency range': 'DC – 11 GHz', 'Impedance (Ω)': 50, 'Coupling': 'Threaded' }, 'MIL-STD-348'),
  // Public-safety band plans (47 CFR Part 90)
  std('ps-700', 'Public safety bands', '700 MHz', '700 MHz public safety narrowband', { 'Base / downlink TX (MHz)': '769 – 775', 'Mobile / uplink TX (MHz)': '799 – 805' }, '47 CFR 90.531'),
  std('ps-800', 'Public safety bands', '800 MHz', '800 MHz (NPSPAC / rebanded)', { 'Base / downlink TX (MHz)': '851 – 869', 'Mobile / uplink TX (MHz)': '806 – 824', 'Notes': 'NPSPAC 851–854 / 806–809 MHz after rebanding' }, '47 CFR 90.613, 90.617'),
  std('ps-vhf', 'Public safety bands', 'VHF', 'VHF high band', { 'Base / downlink TX (MHz)': '150.8 – 174 (shared)', 'Mobile / uplink TX (MHz)': '150.8 – 174 (shared)', 'Notes': 'Simplex or repeater pairs set by license' }, '47 CFR 90.20'),
  std('ps-uhf', 'Public safety bands', 'UHF', 'UHF 450–470 MHz', { 'Base / downlink TX (MHz)': '450 – 470', 'Mobile / uplink TX (MHz)': '450 – 470 (+5 MHz pairs)', 'Notes': 'Repeater pairs typically 5 MHz split' }, '47 CFR 90.20'),
  std('ps-firstnet', 'Public safety bands', 'LTE Band 14', 'FirstNet Band 14 (LTE)', { 'Base / downlink TX (MHz)': '758 – 768', 'Mobile / uplink TX (MHz)': '788 – 798' }, '47 CFR 27 / 3GPP TS 36.101'),
  // Batteries (typical lead-acid)
  std('vrla', 'Batteries', 'VRLA / SLA', '12 V VRLA (AGM) battery', { 'Chemistry': 'Lead-acid AGM', 'Nominal voltage (V)': 12, 'Float voltage (V)': '13.5 – 13.8 @ 25 °C', 'Common sizes (Ah)': '7, 12, 18, 26, 35, 55, 100', 'Notes': 'Capacity rated at 20 h; derate in cold' }, 'Typical manufacturer values; NFPA 72 10.6.10 for fire alarm sizing'),
  // Conductors (NEC Chapter 9 / 310.16)
  ...AWG_SIZES.map((a) => std(`awg-${a}`, 'Conductors', 'Copper', `${a} AWG copper`, { 'Size': `${a} AWG`, 'Ampacity 75 °C (A)': AMPACITY_75C_CU[a], 'Ampacity 90 °C (A)': AMPACITY_90C_CU[a], 'DC resistance (Ω/1000 ft)': RESISTANCE_OHM_PER_KFT[a] }, 'NEC Table 310.16 and Chapter 9 Table 8 (uncoated copper, 75 °C)', 'Apply 240.4(D) small-conductor limits and ambient / fill adjustments.')),
];

export function builtInSpecs(): SpecItem[] { return [...builtFromCatalog(), ...STANDARDS]; }
