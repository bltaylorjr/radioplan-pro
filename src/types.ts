// Project data model. Everything the user enters lives in one serialisable Project object.
import type { Environment, CitySize } from './engine/rf';
import type { SolarLoad } from './engine/solar';
import type { AlarmDevice } from './engine/alarm';
import type { Wall } from './engine/indoor';

export type StateCode = 'NC' | 'SC' | 'GA' | 'TN' | 'VA';
export type StructureType = 'monopole' | 'self-support lattice' | 'guyed lattice' | 'rooftop' | 'water tank' | 'wood pole';

export interface Company { name: string; title: string; address: string; city: string; state: string; zip: string; phone: string; email: string; license: string; logoDataUrl?: string }
export interface ProjectMeta {
  name: string; number: string; client: string; engineer: string; peLicense: string;
  state: StateCode; county: string; jurisdictionNotes: string; created: string; revision: string;
  /** Client / customer company (meta.client holds its name). */
  clientContact?: string; clientAddress?: string; clientCity?: string; clientState?: string; clientZip?: string; clientPhone?: string; clientEmail?: string;
  /** Project site address (where the work is). */
  siteAddress?: string; siteZip?: string; poNumber?: string;
  /** City or town of the project site (from the address); used to pick local codes. */
  city?: string;
  /** Main system type (see data/systems.ts) and other systems on the same job. */
  projectType?: string; subSystems?: string[];
  /** With project type 'custom': the pages and tools to show in the menu. */
  customPages?: string[];
  /** Steps the user chose to skip on this project (still open from the menu). */
  skipped?: string[];
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
  /** Public-safety (donor) tower the roof donor antenna is aimed at. */
  donorName?: string; donorLat?: number | null; donorLon?: number | null;
  /** FCC Class B signal booster registration (47 CFR 90.219(d)(5)) and licensee consent. */
  booster?: BoosterReg;
}
export interface BoosterConsent { call: string; licensee: string; phone: string; freqs: string; requested: string; received: string; note: string }
export interface BoosterReg {
  make: string; model: string; fccId: string; units: number; serial: string;
  /** Passbands, e.g. "806-824, 851-869" (MHz). */
  passbands: string;
  /** Where in the building the booster is (room / floor). */
  locationDetail: string;
  operatorName: string; operatorContact: string; operatorPhone: string; operatorEmail: string; operatorAddress: string;
  donorErpDbm: number | null; maxChannelErpDbm: number | null;
  registeredOn: string; confirmation: string;
  consents: BoosterConsent[];
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
  /** Checked magnetic field and space weather values for Site A, kept up to date automatically (engine/magproject.ts). */
  magnetic?: ProjectMagnetic;
  /** Library equipment used in this project (antennas, feeders, radios). */
  customCatalog?: import('./data/catalog').CustomCatalog;
  /** Field notes with optional photos and GPS. */
  fieldNotes?: FieldNote[];
  /** Service calls and repairs. */
  serviceLog?: ServiceCall[];
  /** Materials you added by hand. */
  bomExtra?: BomExtra[];
  /** Materials list costing: unit cost, vendor, part number, text changes and removed lines, by line key. */
  bomCost?: Record<string, import('./engine/estimate').BomCost>;
  /** Labor, tax, shipping, contingency, markup and budgets for the estimate. */
  estimate?: import('./engine/estimate').Estimate;
  /** Lines drawn on the map (by hand or point to point) to check signal and obstacles along them. */
  drawnLines?: import('./engine/routes').DrawnLine[];
  /** Photo site survey: spots where photos or panoramas were taken, with direction and terrain matching. */
  photoSpots?: import('./engine/photosurvey').PhotoSpot[];
  /** Cable and conduit runs between sites, measured on the map and over the terrain. */
  siteRuns?: import('./engine/siteruns').SiteRun[];
  /** Auto-design inputs; when applied, its equipment and materials join the Materials list. */
  autoDesign?: import('./engine/autodesign').AutoInputs & { applied?: boolean };
  /** Building materials (walls, floors, roof, windows, doors, shafts) used by the 2D/3D models and their results. */
  buildingMaterials?: Partial<import('./engine/bldgmaterials').BuildingSpec>;
  /** Multi-building site: other buildings, where each one sits, and the links between them. */
  campus?: import('./engine/campus').Campus;
  /** Drawing set settings (sheet size, scale, revisions). */
  blueprint?: Blueprint;
  /** Proposal pricing, schedule and terms. */
  proposal?: Proposal;
  /** Files attached to the project (drawings, PDFs, data sheets, photos). */
  documents?: ProjectDoc[];
  /** Checklist ticks, key = list:item. */
  checklists?: Record<string, boolean>;
  /** Checklist items you added. */
  checklistExtra?: { id: string; list: string; text: string }[];
  /** PM tasks done: key = system id + task, value = last date done (YYYY-MM-DD). */
  pmDone?: Record<string, string>;
  /** Live signal readings: typed, from a Bluetooth / USB meter, the phone, or imported. */
  signalReadings?: import('./engine/signal').SignalReading[];
  /** Installed equipment logged by its barcode or QR tag, with PM and service history. */
  assets?: import('./engine/assets').Asset[];
  /** NOAA weather for the project site (saved by the Weather page): conditions, 7-day low/high/wind, alerts and work-day notes. */
  weather?: import('./engine/weather').ProjectWeather;
  /** Floor plans imported from PDF, DXF or image files (Floor Plan to 2D / 3D), one per floor. */
  floorPlans?: import('./engine/floorplan').FloorPlanImport[];
  /** Soil iron at the site (USGS soil geochemistry), entered from the USGS data portal. */
  siteSoil?: { fePct: number; source: string };
  /** Site condition variables removed from calculations ("calcId:varId"). */
  siteVarsOff?: string[];
  /** Spectrum analyzer: saved sweeps and tests, corrections, calibration and the channels to watch. */
  spectrum?: { saved: import('./pages/Spectrum').SavedSweep[]; corr?: Partial<import('./engine/spectrum').Corrections>; ppm?: number; calAt?: string; calDevice?: string; watch?: number[]; bench?: Partial<import('./engine/certification').RfBench> & { points?: { hz: number; ref: number; meas: number; measHz: number }[]; steps?: number[] } };
  /** Certification-level test records (RF and audio) that print as signed reports. */
  certs?: import('./engine/certification').CertRecord[];
  /** Audio analyzer: calibration, mic calibration file and the input used. */
  audio?: { calDb?: number; calAt?: string; calLevel?: number; micCal?: { name: string; sensDb: number | null; f: number[]; db: number[]; id?: string; brand?: string; model?: string; kind?: 'measurement' | 'phone' | 'tablet' | 'computer' | 'flat'; source?: 'builtin' | 'file'; note?: string; serial?: string; addedAt?: string; auto?: boolean }; micCalOff?: boolean; device?: string };
  /** Project Build Output: when each element first appeared (key → ISO time). */
  buildSeen?: Record<string, string>;
}
export interface Blueprint { size: string; scale: string; drawnBy: string; checkedBy: string; revisions: { rev: string; date: string; desc: string }[]; off: string[];
  /** Azimuth (degrees true) that the top of the plan faces; turns the north arrow. 0 = plan north is true north. */
  planNorthDeg?: number }
export interface Proposal { laborRate: number; laborHours: number; materialsCost: number; markupPct: number; taxPct: number; startDate: string; weeks: number; validDays: number; paymentTerms: string; exclusions: string; notes: string }
export interface ProjectDoc { id: string; name: string; type: string; size: number; dataUrl: string; addedAt: string; note: string }
export interface BomExtra { id: string; category: string; item: string; brandModel: string; qty: number; unit: string; notes: string }
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

/** Magnetic field at the project (NOAA World Magnetic Model) and the space weather seen with it (NOAA SWPC). Values are only stored after they pass their checks. */
export interface ProjectMagnetic {
  lat: number; lon: number;
  /** Date the values are for (ISO date) and the model that gave them. */
  date: string; model: string;
  /** Declination, east positive (the Southeast US is negative = west), and its yearly change in degrees. */
  decDeg: number; decPerYearDeg: number; dipDeg: number; totalNt: number;
  /** Space weather at the last online check, when one was available. */
  space?: { fetchedAt: string; kpNow: number | null; gNow: number; gPeak3d: number; radioBlackoutPct: number | null };
}
