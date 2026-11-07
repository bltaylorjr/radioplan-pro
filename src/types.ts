// Project data model. Everything the user enters lives in one serialisable Project object.
import type { Environment, CitySize } from './engine/rf';
import type { SolarLoad } from './engine/solar';
import type { AlarmDevice } from './engine/alarm';
import type { Wall } from './engine/indoor';

export type StateCode = 'NC' | 'SC' | 'GA' | 'TN';
export type StructureType = 'monopole' | 'self-support lattice' | 'guyed lattice' | 'rooftop' | 'water tank' | 'wood pole';

export interface Company { name: string; title: string; address: string; city: string; state: string; zip: string; phone: string; email: string; license: string; logoDataUrl?: string }
export interface ProjectMeta {
  name: string; number: string; client: string; engineer: string; peLicense: string;
  state: StateCode; county: string; jurisdictionNotes: string; created: string; revision: string;
}
export interface Site {
  id: string; name: string; address: string; lat: number; lon: number; groundElevM: number | null;
  positionSource: string; positionAccuracyM: number | null;
  structure: StructureType; structureHeightM: number; antennaAglM: number; onBuilding: boolean;
  nearestAirportKm: number | null; nearestRunwayFt: number | null;
}
export interface RadioDesign {
  bandPreset: string; fMHz: number; txPowerDbm: number; txSiteId: string; rxSiteId: string;
  txAntennaId: string; rxAntennaId: string; feederId: string; feederLenM: number; jumperLossDb: number; connectorLossDb: number;
  rxSensitivityDbm: number; rxAntGainDbi: number; rxFeederLossDb: number; mobileHeightM: number;
  env: Environment; city: CitySize; shadowSigmaDb: number; edgeReliability: number; penetrationLossDb: number; bodyLossDb: number; interferenceMarginDb: number;
  azimuthDeg: number; mechTiltDeg: number; elecTiltDeg: number; kFactor: number; clutterM: number;
  coverageRadiusKm: number; coverageGridN: number; coverageThresholdDbm: number;
}
export interface Grounding {
  bondingConductorAwg: string; bondingConductorLengthM: number; groundRingAwg: string; groundRods: number; rodLengthFt: number; rodSpacingFt: number;
  surgeProtector: boolean; intersystemBond: boolean; towerGroundKits: number; measuredResistanceOhm: number | null;
  leadInClearanceToPowerM: number; lightningProtection: boolean; ice: boolean; structureClass: 'I' | 'II' | 'III';
}
export interface SolarDesign {
  enabled: boolean; loads: SolarLoad[]; systemVdc: number; autonomyDays: number; depthOfDischarge: number; pshLocation: string; peakSunHours: number;
  systemDerate: number; batteryTempFactor: number; inverterEff: number; moduleId: string; recordLowC: number; controllerMaxVoc: number; controllerMaxA: number;
  arrayToControllerFt: number; batteryToLoadFt: number; dwelling: boolean; rapidShutdown: boolean; batteryDisconnect: boolean; batteryChemistry: 'AGM' | 'LiFePO4' | 'Flooded';
  installedPvAwg: string; installedBatteryAwg: string;
}
export interface AlarmDesign {
  enabled: boolean; devices: AlarmDevice[]; standbyHours: number; alarmMinutes: number; safetyFactor: number; installedBatteryAh: number;
  dedicatedBranchCircuit: boolean; circuitLockedAndMarked: boolean; nacLoadA: number; nacOneWayFt: number; nacAwg: string; minDeviceV: number;
  signalingType: 'conventional' | 'addressable'; communicatorType: 'DACT 2-line' | 'cellular' | 'IP' | 'radio';
}
export interface ErcesDesign {
  enabled: boolean; floors: number; areaPerFloorSqft: number; donorRssiDbm: number; bdaGainDb: number; bdaMaxOutputDbm: number; dasCableLossDb: number;
  splitterLossDb: number; indoorAntGainDbi: number; antennasPerFloor: number; avgPathLossToEdgeDb: number; standbyHours: number;
  nema4Enclosure: boolean; survivabilityRated: boolean; ahjFreqApproval: boolean; fccClassB: boolean; measuredGeneralPct: number | null; measuredCriticalPct: number | null;
  annunciator: boolean;
}
export interface LfHfDesign { mode: 'LF/MF' | 'HF'; fMHz: number; powerKw: number; antennaHeightM: number; groundLossOhm: number; radials: number; soilSigma: number; distanceKm: number; foF2: number; hopKm: number }
export interface IndoorAntenna { id: string; x: number; y: number; eirpDbm: number; label: string; model: string }
export interface IndoorDesign {
  fMHz: number; widthM: number; heightM: number; walls: Wall[]; antennas: IndoorAntenna[]; floorPlanDataUrl?: string; env: 'residential' | 'office' | 'commercial';
  targetDbm: number; rxGainDbi: number; currentMaterial: string; floors: number;
}
export interface TestRecord { id: string; item: string; standard: string; expected: string; measured: string; pass: boolean | null; date: string; tech: string; notes: string }

export interface Project {
  version: number; company: Company; meta: ProjectMeta; sites: Site[]; radio: RadioDesign; grounding: Grounding;
  solar: SolarDesign; alarm: AlarmDesign; erces: ErcesDesign; lfhf: LfHfDesign; indoor: IndoorDesign; tests: TestRecord[];
  bomOverrides: Record<string, number>; taskDone: Record<string, boolean>;
  settings: { autoTerrain: boolean; terrainMarginKm: number };
}
