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
  /** Client / customer company (meta.client holds its name). */
  clientContact?: string; clientAddress?: string; clientCity?: string; clientState?: string; clientZip?: string; clientPhone?: string; clientEmail?: string;
  /** Project site address (where the work is). */
  siteAddress?: string; poNumber?: string;
  /** City or town of the project site (from the address); used to pick local codes. */
  city?: string;
  /** Main system type (see data/systems.ts) and other systems on the same job. */
  projectType?: string; subSystems?: string[];
}
export interface Site {
  id: string; name: string; address: string; lat: number; lon: number; groundElevM: number | null;
  positionSource: string; positionAccuracyM: number | null;
  structure: StructureType; structureHeightM: number; antennaAglM: number; onBuilding: boolean;
  nearestAirportKm: number | null; nearestRunwayFt: number | null;
  /** Optional transmitter at this site for multi-site network / interference analysis. */
  tx?: SiteTx;
}
export interface SiteTx { enabled: boolean; fMHz: number; txPowerDbm: number; antennaId: string; azimuthDeg: number; tiltDeg: number; lossDb: number; channel: string }
/** Model tuning applied on top of Hata/COST-231 + diffraction; set by hand or by field-survey calibration. */
export interface PropagationTuning { offsetDb: number; slopeDbPerDecade: number; diffractionFactor: number; clutterDb: number; source: string }
/** One acceptance criterion: the area where (signal − extraLoss) ≥ dbm must be at least requiredPct of the service area. null = use the live design value. */
export interface AcceptanceTier { id: string; label: string; dbm: number | null; extraLossDb: number | null; requiredPct: number; color: string }
export interface Acceptance { profile: string; tiers: AcceptanceTier[] }
export interface NetworkDesign { channelBwKHz: number; requiredCiDb: number; acrDb: number; serviceDbm: number }
export interface SurveyPoint { lat: number; lon: number; rssiDbm: number; t?: string }
export interface Survey { name: string; importedAt: string; points: SurveyPoint[] }
export interface RunRecord { id: string; at: string; label: string; inputs: Record<string, string | number>; results: { label: string; dbm: number; pct: number; requiredPct: number; pass: boolean }[]; meanDbm: number; cells: number }
export interface Scenario extends RunRecord { notes: string; grid: { n: number; north: number; south: number; east: number; west: number; b64: string }; project: { radio: RadioDesign; propagation: PropagationTuning; tx: Site | null } }
export interface WifiAp { bssid: string; ssid: string; channel: number; band?: string; rssiDbm: number; noiseDbm?: number }
export interface WifiReading { id: string; x: number; y: number; lat?: number; lon?: number; t: string; aps: WifiAp[] }
export interface WifiSurvey { readings: WifiReading[]; ssidFilter: string; targetDbm: number; radiusM: number }
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
  settings: { autoTerrain: boolean; terrainMarginKm: number; units?: 'mi' | 'km'; autoMaps?: boolean };
  propagation: PropagationTuning; acceptance: Acceptance; network: NetworkDesign; survey: Survey;
  runLog: RunRecord[]; scenarios: Scenario[]; wifi: WifiSurvey;
  /** Sync bookkeeping (per-section change times, deletions). Managed automatically. */
  sync?: SyncMeta;
  /** Library equipment used in this project (antennas, feeders, radios). */
  customCatalog?: import('./data/catalog').CustomCatalog;
  /** Field notes with optional photos and GPS. */
  fieldNotes?: FieldNote[];
  /** Service calls and repairs. */
  serviceLog?: ServiceCall[];
  /** PM tasks done: key = system id + task, value = last date done (YYYY-MM-DD). */
  pmDone?: Record<string, string>;
}
export interface ServiceCall { id: string; date: string; system: string; equipment: string; problem: string; cause: string; fix: string; parts: string; hours: number; tech: string; status: 'open' | 'done' }
export interface FieldNote { id: string; at: string; title: string; text: string; category: string; siteId?: string; lat?: number; lon?: number; accM?: number; photos: { id: string; dataUrl: string; caption: string }[]; tags: string[]; author: string; followUp: boolean; done: boolean }
export interface SyncMeta {
  projectId: string; deviceId: string; deviceName: string;
  sections: Record<string, { hash: string; at: number }>;
  /** ids present in each collection at the last stamp, to detect deletions */
  items: Record<string, string[]>;
  tombstones: Record<string, number>;
  peers: Record<string, { name: string; at: number }>;
}
