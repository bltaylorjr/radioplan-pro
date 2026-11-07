// Equipment catalog. Specifications are TYPICAL values transcribed for planning; always confirm against the
// current manufacturer datasheet before procurement. Add your own items in the Equipment page (stored in project).
export interface Antenna { id: string; brand: string; model: string; type: string; bandMHz: [number, number]; gainDbi: number; hBwDeg: number; vBwDeg: number; connector: string; weightLb: number; windAreaSqft: number; mount: string }
export interface Feeder { id: string; brand: string; model: string; size: string; points: [number, number][]; minBendIn: number; connector: string; hangerSpacingFt: number; groundKit: string; hanger: string }
export interface Radio { id: string; brand: string; model: string; type: string; bandMHz: [number, number]; maxPowerW: number; sensitivityDbm: number; dcInputV: number; drawTxA: number; drawRxA: number }
export interface PvModule { id: string; brand: string; model: string; pmaxW: number; vocV: number; vmpV: number; iscA: number; impA: number; tempCoeffVocPctPerC: number }

export const ANTENNAS: Antenna[] = [
  { id: 'sinclair-sc229', brand: 'Sinclair', model: 'SC229-SF2SNF (UHF exposed dipole)', type: 'Omni', bandMHz: [406, 512], gainDbi: 8.15, hBwDeg: 360, vBwDeg: 16, connector: 'N-female', weightLb: 18, windAreaSqft: 1.6, mount: 'Side-mount clamp 2-4.5" OD' },
  { id: 'sinclair-sc281', brand: 'Sinclair', model: 'SC281-HF (VHF folded dipole array)', type: 'Omni', bandMHz: [138, 174], gainDbi: 8.2, hBwDeg: 360, vBwDeg: 24, connector: 'N-female', weightLb: 42, windAreaSqft: 4.9, mount: 'Side-arm mount' },
  { id: 'comprod-871', brand: 'Comprod', model: '871-70 (800 MHz fiberglass omni)', type: 'Omni', bandMHz: [806, 896], gainDbi: 10.1, hBwDeg: 360, vBwDeg: 8, connector: 'N-female / 7-16 DIN', weightLb: 16, windAreaSqft: 1.3, mount: 'Pipe 2.375" OD' },
  { id: 'commscope-sbnhh', brand: 'CommScope', model: 'SBNHH-1D65B (LTE panel)', type: 'Sector panel', bandMHz: [698, 2360], gainDbi: 16.5, hBwDeg: 65, vBwDeg: 9, connector: '4.3-10 female', weightLb: 37, windAreaSqft: 5.5, mount: 'Pipe mount w/ tilt bracket' },
  { id: 'ericsson-kre', brand: 'Ericsson', model: 'KRE 101 2398 (Sector, quad-port)', type: 'Sector panel', bandMHz: [690, 2690], gainDbi: 17, hBwDeg: 65, vBwDeg: 7, connector: '4.3-10 female', weightLb: 55, windAreaSqft: 7.1, mount: 'Pipe mount w/ tilt bracket' },
  { id: 'pctel-yagi', brand: 'PCTEL', model: 'BMOY8905 (900 MHz Yagi)', type: 'Yagi', bandMHz: [890, 960], gainDbi: 12.6, hBwDeg: 40, vBwDeg: 36, connector: 'N-female', weightLb: 2.5, windAreaSqft: 0.6, mount: 'Pipe 1-2.375"' },
  { id: 'laird-donor', brand: 'Laird', model: 'PD7-800 (BDA donor Yagi)', type: 'Yagi', bandMHz: [764, 870], gainDbi: 12, hBwDeg: 48, vBwDeg: 44, connector: 'N-female', weightLb: 3, windAreaSqft: 0.7, mount: 'Pipe 1-2"' },
  { id: 'cambium-dish', brand: 'Cambium', model: 'PTP 2 ft dish (5 GHz)', type: 'Parabolic', bandMHz: [4900, 5925], gainDbi: 28.5, hBwDeg: 6, vBwDeg: 6, connector: 'N-female ×2', weightLb: 18, windAreaSqft: 3.1, mount: 'Pipe 1.5-4.5"' },
  { id: 'dipole-quarter', brand: 'Generic', model: 'Unity-gain ¼-wave mobile/handheld', type: 'Omni', bandMHz: [30, 6000], gainDbi: 0, hBwDeg: 360, vBwDeg: 80, connector: 'NMO', weightLb: 0.2, windAreaSqft: 0, mount: 'NMO' },
  { id: 'das-ceiling', brand: 'CommScope', model: 'CELLMAX-O-CPUSE (ceiling omni)', type: 'Indoor omni', bandMHz: [698, 4000], gainDbi: 3, hBwDeg: 360, vBwDeg: 70, connector: '4.3-10 female', weightLb: 1.3, windAreaSqft: 0, mount: 'Ceiling tile' },
];

// Attenuation points [MHz, dB/100 ft] (typical @ 20 °C)
export const FEEDERS: Feeder[] = [
  { id: 'lmr400', brand: 'Times Microwave', model: 'LMR-400', size: '0.405"', points: [[150, 1.5], [450, 2.7], [900, 3.9], [1500, 5.1], [2400, 6.6], [5800, 10.8]], minBendIn: 1, connector: 'N-male EZ-400', hangerSpacingFt: 3, groundKit: 'Times GK-S400TT', hanger: 'Snap-in hanger 3/8"' },
  { id: 'lmr600', brand: 'Times Microwave', model: 'LMR-600', size: '0.590"', points: [[150, 0.96], [450, 1.7], [900, 2.5], [1500, 3.2], [2400, 4.2], [5800, 7.0]], minBendIn: 1.5, connector: 'N-male EZ-600', hangerSpacingFt: 3, groundKit: 'Times GK-S600TT', hanger: 'Snap-in hanger 5/8"' },
  { id: 'ldf4', brand: 'CommScope', model: 'LDF4-50A (1/2" HELIAX)', size: '1/2"', points: [[150, 0.83], [450, 1.48], [900, 2.13], [1800, 3.1], [2400, 3.63]], minBendIn: 5, connector: 'L4TNM-PS N-male', hangerSpacingFt: 3, groundKit: 'CommScope SG12-03B2A', hanger: 'SNAP-IN 1/2"' },
  { id: 'ldf5', brand: 'CommScope', model: 'LDF5-50A (7/8" HELIAX)', size: '7/8"', points: [[150, 0.46], [450, 0.82], [900, 1.2], [1800, 1.76], [2400, 2.1]], minBendIn: 10, connector: 'L5TNM-PSA N-male', hangerSpacingFt: 3, groundKit: 'CommScope SG78-12B2U', hanger: 'SNAP-IN 7/8"' },
  { id: 'avaf5', brand: 'CommScope', model: 'AVA5-50 (7/8" AL low-loss)', size: '7/8"', points: [[150, 0.41], [450, 0.73], [900, 1.06], [1800, 1.55], [2400, 1.83]], minBendIn: 9, connector: 'AL5NM-PSA N-male', hangerSpacingFt: 3, groundKit: 'CommScope SG78-12B2U', hanger: 'SNAP-IN 7/8"' },
  { id: 'ldf6', brand: 'CommScope', model: 'LDF6-50 (1-1/4" HELIAX)', size: '1-1/4"', points: [[150, 0.34], [450, 0.6], [900, 0.88], [1800, 1.3], [2400, 1.55]], minBendIn: 15, connector: 'L6TNM-PS N-male', hangerSpacingFt: 3, groundKit: 'CommScope SG114-12B2U', hanger: 'SNAP-IN 1-1/4"' },
];

export const RADIOS: Radio[] = [
  { id: 'mot-mtr3000', brand: 'Motorola Solutions', model: 'MTR3000 repeater', type: 'LMR repeater', bandMHz: [403, 470], maxPowerW: 100, sensitivityDbm: -119, dcInputV: 24, drawTxA: 14, drawRxA: 1.5 },
  { id: 'mot-slr8000', brand: 'Motorola Solutions', model: 'MOTOTRBO SLR 8000', type: 'DMR repeater', bandMHz: [136, 174], maxPowerW: 100, sensitivityDbm: -122, dcInputV: 24, drawTxA: 12, drawRxA: 0.9 },
  { id: 'l3h-masterIII', brand: 'L3Harris', model: 'MASTR V station', type: 'P25 base station', bandMHz: [806, 870], maxPowerW: 100, sensitivityDbm: -119, dcInputV: 24, drawTxA: 18, drawRxA: 2 },
  { id: 'kenwood-nxr', brand: 'Kenwood', model: 'NXR-1800 repeater', type: 'NXDN/DMR repeater', bandMHz: [400, 520], maxPowerW: 50, sensitivityDbm: -120, dcInputV: 13.6, drawTxA: 12, drawRxA: 0.8 },
  { id: 'cambium-ptp670', brand: 'Cambium', model: 'PTP 670 (5 GHz backhaul)', type: 'PTP microwave', bandMHz: [4900, 6050], maxPowerW: 0.2, sensitivityDbm: -94, dcInputV: 48, drawTxA: 1, drawRxA: 1 },
  { id: 'ericsson-radio', brand: 'Ericsson', model: 'Radio 4449 B5/B12', type: 'LTE RRU', bandMHz: [698, 894], maxPowerW: 160, sensitivityDbm: -103, dcInputV: 48, drawTxA: 18, drawRxA: 4 },
  { id: 'honeywell-bda', brand: 'Honeywell / Fiplex', model: 'BDA-DH7-8-33 Class A', type: 'ERCES BDA', bandMHz: [764, 869], maxPowerW: 2, sensitivityDbm: -110, dcInputV: 24, drawTxA: 4, drawRxA: 2 },
  { id: 'icom-hf', brand: 'Icom', model: 'IC-F8101 HF transceiver', type: 'HF', bandMHz: [1.6, 30], maxPowerW: 125, sensitivityDbm: -120, dcInputV: 13.6, drawTxA: 23, drawRxA: 1.2 },
];

export const PV_MODULES: PvModule[] = [
  { id: 'rec-400', brand: 'REC', model: 'Alpha Pure 400', pmaxW: 400, vocV: 48.6, vmpV: 41.1, iscA: 10.48, impA: 9.75, tempCoeffVocPctPerC: -0.24 },
  { id: 'qcells-410', brand: 'Qcells', model: 'Q.PEAK DUO BLK ML-G10+ 410', pmaxW: 410, vocV: 45.37, vmpV: 37.64, iscA: 11.14, impA: 10.89, tempCoeffVocPctPerC: -0.27 },
  { id: 'canadian-450', brand: 'Canadian Solar', model: 'HiKu6 CS6R-450MS', pmaxW: 450, vocV: 41.1, vmpV: 34.6, iscA: 13.85, impA: 13.01, tempCoeffVocPctPerC: -0.26 },
  { id: 'off-grid-100', brand: 'Renogy', model: 'RSP100D 100 W 12 V', pmaxW: 100, vocV: 23.0, vmpV: 19.0, iscA: 5.75, impA: 5.26, tempCoeffVocPctPerC: -0.28 },
];

export const BAND_PRESETS: Record<string, { fMHz: number; label: string }> = {
  'VHF-high LMR': { fMHz: 155, label: 'VHF high-band land mobile (150-174 MHz)' },
  'UHF LMR': { fMHz: 460, label: 'UHF land mobile (450-470 MHz)' },
  '700 MHz public safety': { fMHz: 770, label: '700 MHz public safety / FirstNet B14 (758-775)' },
  '800 MHz public safety': { fMHz: 855, label: '800 MHz NPSPAC / trunked (851-869)' },
  'LTE B12/B13': { fMHz: 740, label: 'LTE low band 700 MHz' },
  'Cellular 850': { fMHz: 880, label: 'Cellular 850 / B5' },
  'PCS 1900': { fMHz: 1960, label: 'PCS 1900 / B2/B25 (COST-231)' },
  'AWS 2100': { fMHz: 2120, label: 'AWS B4/B66 (beyond COST-231; extrapolated)' },
  '900 MHz ISM/SCADA': { fMHz: 915, label: '900 MHz ISM / SCADA' },
  'Custom': { fMHz: 0, label: 'Custom frequency' },
};

export const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);
