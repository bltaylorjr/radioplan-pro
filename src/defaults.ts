import type { Project } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

export function defaultProject(): Project {
  return {
    version: 1,
    company: { name: '', title: '', address: '', city: '', state: 'NC', zip: '', phone: '', email: '', license: '' },
    meta: { name: 'New radio site project', number: '', client: '', engineer: '', peLicense: '', state: 'NC', county: '', jurisdictionNotes: '', created: new Date().toISOString().slice(0, 10), revision: 'A' },
    sites: [
      { id: 'A', name: 'Site A (TX)', address: '', lat: 35.2271, lon: -80.8431, groundElevM: null, positionSource: 'Manual', positionAccuracyM: null, structure: 'monopole', structureHeightM: 45, antennaAglM: 43, onBuilding: false, nearestAirportKm: null, nearestRunwayFt: null },
      { id: 'B', name: 'Site B (RX)', address: '', lat: 35.2896, lon: -80.7340, groundElevM: null, positionSource: 'Manual', positionAccuracyM: null, structure: 'monopole', structureHeightM: 30, antennaAglM: 28, onBuilding: false, nearestAirportKm: null, nearestRunwayFt: null },
    ],
    radio: {
      bandPreset: 'UHF LMR', fMHz: 460, txPowerDbm: 47, txSiteId: 'A', rxSiteId: 'B', txAntennaId: 'sinclair-sc229', rxAntennaId: 'sinclair-sc229', feederId: 'ldf5', feederLenM: 60, jumperLossDb: 0.5, connectorLossDb: 0.3,
      rxSensitivityDbm: -116, rxAntGainDbi: 0, rxFeederLossDb: 0, mobileHeightM: 1.5, env: 'suburban', city: 'small-medium', shadowSigmaDb: 8, edgeReliability: 0.9, penetrationLossDb: 0, bodyLossDb: 3, interferenceMarginDb: 2,
      azimuthDeg: 0, mechTiltDeg: 0, elecTiltDeg: 0, kFactor: 4 / 3, clutterM: 10, coverageRadiusKm: 15, coverageGridN: 70, coverageThresholdDbm: -100,
    },
    grounding: { bondingConductorAwg: '6', bondingConductorLengthM: 5, groundRingAwg: '2', groundRods: 4, rodLengthFt: 8, rodSpacingFt: 16, surgeProtector: true, intersystemBond: true, towerGroundKits: 3, measuredResistanceOhm: null, leadInClearanceToPowerM: 1, lightningProtection: false, ice: true, structureClass: 'II' },
    solar: { enabled: false, loads: [{ name: 'Repeater standby', watts: 40, hoursPerDay: 21.6, qty: 1 }, { name: 'Repeater transmit', watts: 340, hoursPerDay: 2.4, qty: 1 }, { name: 'Site controller / modem', watts: 12, hoursPerDay: 24, qty: 1 }],
      systemVdc: 24, autonomyDays: 5, depthOfDischarge: 0.5, pshLocation: 'Charlotte, NC', peakSunHours: 3.7, systemDerate: 0.77, batteryTempFactor: 0.9, inverterEff: 1, moduleId: 'rec-400', recordLowC: -15,
      controllerMaxVoc: 150, controllerMaxA: 60, arrayToControllerFt: 60, batteryToLoadFt: 10, dwelling: false, rapidShutdown: false, batteryDisconnect: true, batteryChemistry: 'AGM', installedPvAwg: '10', installedBatteryAwg: '4' },
    alarm: { enabled: false, devices: [{ name: 'FACP (addressable)', qty: 1, standbyMa: 180, alarmMa: 320 }, { name: 'Smoke detector', qty: 40, standbyMa: 0.3, alarmMa: 0.3 }, { name: 'Pull station module', qty: 6, standbyMa: 0.4, alarmMa: 0.4 }, { name: 'Horn/strobe 75 cd', qty: 24, standbyMa: 0, alarmMa: 120 }, { name: 'Communicator (cellular)', qty: 1, standbyMa: 60, alarmMa: 150 }],
      standbyHours: 24, alarmMinutes: 5, safetyFactor: 1.2, installedBatteryAh: 18, dedicatedBranchCircuit: true, circuitLockedAndMarked: true, nacLoadA: 1.4, nacOneWayFt: 300, nacAwg: '14', minDeviceV: 16, signalingType: 'addressable', communicatorType: 'cellular' },
    erces: { enabled: false, floors: 4, areaPerFloorSqft: 25000, donorRssiDbm: -70, bdaGainDb: 80, bdaMaxOutputDbm: 27, dasCableLossDb: 6, splitterLossDb: 3, indoorAntGainDbi: 3, antennasPerFloor: 4, avgPathLossToEdgeDb: 60, standbyHours: 12,
      nema4Enclosure: true, survivabilityRated: true, ahjFreqApproval: false, fccClassB: true, measuredGeneralPct: null, measuredCriticalPct: null, annunciator: true },
    lfhf: { mode: 'HF', fMHz: 7.2, powerKw: 0.1, antennaHeightM: 12, groundLossOhm: 10, radials: 120, soilSigma: 0.005, distanceKm: 500, foF2: 6.5, hopKm: 1500 },
    indoor: { fMHz: 851, widthM: 60, heightM: 40, walls: [], antennas: [], env: 'office', targetDbm: -95, rxGainDbi: 0, currentMaterial: 'drywall', floors: 0 },
    tests: [],
    bomOverrides: {}, taskDone: {},
  };
}

export const DEFAULT_TESTS: Omit<import('./types').TestRecord, 'id'>[] = [
  { item: 'Feeder sweep — return loss / VSWR', standard: 'Manufacturer / TIA', expected: 'RL ≥ 18 dB (VSWR ≤ 1.29:1)', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'Distance-to-fault (DTF)', standard: 'Site owner spec', expected: 'No fault > -25 dB RL', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'PIM test (2×20 W)', standard: 'IEC 62037', expected: '≤ -153 dBc', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'Insertion loss (feeder)', standard: 'Design', expected: 'Within 0.5 dB of calc', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'Ground resistance (fall-of-potential)', standard: 'IEEE 81 / R56', expected: '≤ 10 Ω (≤ 5 Ω preferred)', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'Bonding continuity (2-point)', standard: 'R56 / TIA-607', expected: '≤ 0.1 Ω between bonds', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'TX output power & frequency error', standard: 'FCC 90.213 / licence', expected: 'Within licensed ERP; freq within tolerance', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'Antenna azimuth / tilt verification', standard: 'Design', expected: '±2° az, ±0.5° tilt', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'Drive test vs. prediction', standard: 'TIA TSB-88', expected: '≥ 90% of tiles ≥ design RSSI', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'ERCES grid test (if applicable)', standard: 'NFPA 1225 / IFC 510', expected: '≥ 90% general / 99% critical at -95 dBm, DAQ ≥ 3.0', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'Battery / standby run test', standard: 'NFPA 72 / NFPA 1225', expected: 'Meets calculated duration', measured: '', pass: null, date: '', tech: '', notes: '' },
  { item: 'RF exposure survey', standard: 'FCC OET-65', expected: '< MPE in public areas; signage installed', measured: '', pass: null, date: '', tech: '', notes: '' },
];
