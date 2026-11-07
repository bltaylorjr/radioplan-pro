// Off-grid / backup solar sizing for remote radio sites with NEC Article 690 checks.
import { sizeConductor, nextStandardOcpd, Awg } from './electrical';

export interface SolarLoad { name: string; watts: number; hoursPerDay: number; qty: number }
export interface SolarInputs {
  loads: SolarLoad[]; systemVdc: number; autonomyDays: number; depthOfDischarge: number;
  peakSunHours: number; systemDerate: number; batteryTempFactor: number; inverterEff: number;
  module: { name?: string; pmaxW: number; vocV: number; vmpV: number; iscA: number; impA: number; tempCoeffVocPctPerC: number };
  recordLowC: number; controllerMaxVoc: number; controllerMaxA: number; arrayToControllerFt: number; batteryToLoadFt: number;
  dwelling: boolean; onBuilding: boolean;
}
export interface SolarResult {
  dailyWh: number; batteryAh: number; batteryWh: number; arrayW: number; modulesTotal: number;
  modulesPerString: number; strings: number; maxStringVoc: number; vocCorrection: number;
  circuitCurrentA: number; conductorAmpsRequired: number; pvConductor: { awg: Awg; vdPct: number; limitedBy: string } | null;
  pvOcpdA: number; controllerOutputA: number; loadCurrentA: number; batteryConductor: { awg: Awg; vdPct: number; limitedBy: string } | null;
  maxSystemVoltageLimit: number; notes: string[];
}

/** NEC 690.7(A) Table 690.7(A) voltage correction factors (crystalline silicon) when no manufacturer coefficient is used. */
export function table6907Factor(lowC: number): number {
  // Each row: lower bound of the temperature band (°C) -> factor
  const rows: [number, number][] = [[25, 1.0], [20, 1.02], [15, 1.04], [10, 1.06], [5, 1.08], [0, 1.1], [-5, 1.12], [-10, 1.14], [-15, 1.16], [-20, 1.18], [-25, 1.2], [-30, 1.21], [-35, 1.23], [-40, 1.25]];
  for (const [t, f] of rows) if (lowC >= t) return f;
  return 1.25; // table ends at -40 °C; use manufacturer coefficient below this
}

export function sizeSolar(i: SolarInputs): SolarResult {
  const notes: string[] = [];
  const dailyWh = i.loads.reduce((s, l) => s + l.watts * l.hoursPerDay * l.qty, 0) / i.inverterEff;
  const batteryWh = (dailyWh * i.autonomyDays) / (i.depthOfDischarge * i.batteryTempFactor);
  const batteryAh = batteryWh / i.systemVdc;
  const arrayW = dailyWh / (i.peakSunHours * i.systemDerate);
  // 690.7(A)(1): manufacturer temperature coefficient method
  const vocCorrection = 1 + (i.module.tempCoeffVocPctPerC / 100) * (i.recordLowC - 25);
  const modVocCold = i.module.vocV * vocCorrection;
  const maxSys = i.dwelling ? 600 : 1000; // 690.7: 600 V max for one- and two-family dwellings
  const vLimit = Math.min(i.controllerMaxVoc, maxSys);
  const minSeries = Math.max(1, Math.ceil((i.systemVdc * 1.2) / i.module.vmpV)); // MPPT needs Vmp above battery voltage
  const maxSeries = Math.max(1, Math.floor(vLimit / modVocCold));
  const modulesPerString = Math.max(1, Math.min(maxSeries, Math.max(minSeries, 2)));
  if (minSeries > maxSeries) notes.push('Module Vmp too low / Voc too high for this controller; choose another module or controller.');
  const needed = Math.ceil(arrayW / i.module.pmaxW);
  const strings = Math.max(1, Math.ceil(needed / modulesPerString));
  const modulesTotal = strings * modulesPerString;
  const maxStringVoc = modulesPerString * modVocCold;
  // 690.8(A)(1)(a): max circuit current = Isc x 1.25 ; 690.8(B): conductors >= 125% of that (=156%)
  const circuitCurrentA = strings * i.module.iscA * 1.25;
  const conductorAmpsRequired = circuitCurrentA * 1.25;
  const pvConductor = sizeConductor(conductorAmpsRequired, i.arrayToControllerFt, modulesPerString * i.module.vmpV, 2);
  const pvOcpdA = nextStandardOcpd(conductorAmpsRequired);
  if (strings <= 2) notes.push('690.9(A): OCPD for PV source circuits may not be required with ≤2 parallel strings when ampacity is adequate (verify module series fuse rating).');
  const controllerOutputA = (modulesTotal * i.module.pmaxW) / i.systemVdc;
  if (controllerOutputA > i.controllerMaxA) notes.push(`Controller output ${controllerOutputA.toFixed(1)} A exceeds rating ${i.controllerMaxA} A; parallel a second controller.`);
  const peakLoadW = i.loads.reduce((s, l) => s + l.watts * l.qty, 0);
  const loadCurrentA = peakLoadW / i.systemVdc;
  const batteryConductor = sizeConductor(loadCurrentA * 1.25, i.batteryToLoadFt, i.systemVdc, 2);
  return { dailyWh, batteryAh, batteryWh, arrayW, modulesTotal, modulesPerString, strings, maxStringVoc, vocCorrection, circuitCurrentA, conductorAmpsRequired, pvConductor, pvOcpdA, controllerOutputA, loadCurrentA, batteryConductor, maxSystemVoltageLimit: maxSys, notes };
}

/** Approximate worst-month (December) peak sun hours, latitude tilt. Source: NREL NSRDB/PVWatts typical values. Verify with PVWatts for the exact site. */
export const PSH_REFERENCE: Record<string, number> = {
  'Asheville, NC': 3.6, 'Charlotte, NC': 3.7, 'Raleigh, NC': 3.6, 'Wilmington, NC': 3.7,
  'Columbia, SC': 3.8, 'Charleston, SC': 3.8, 'Greenville, SC': 3.7,
  'Atlanta, GA': 3.7, 'Savannah, GA': 3.9, 'Macon, GA': 3.8,
  'Nashville, TN': 3.0, 'Knoxville, TN': 3.1, 'Memphis, TN': 3.2, 'Chattanooga, TN': 3.2,
};
