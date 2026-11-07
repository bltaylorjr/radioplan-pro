// Fire alarm (NFPA 72) and ERCES / public-safety BDA (NFPA 1225, IFC 510) calculations.
export interface AlarmDevice { name: string; qty: number; standbyMa: number; alarmMa: number }
export interface BatteryCalcInputs { devices: AlarmDevice[]; standbyHours: number; alarmMinutes: number; safetyFactor: number }

/** Secondary power capacity: (standby I x standby h) + (alarm I x alarm h), then derating/safety factor. */
export function alarmBatteryAh(i: BatteryCalcInputs) {
  const standbyA = i.devices.reduce((s, d) => s + d.qty * d.standbyMa, 0) / 1000;
  const alarmA = i.devices.reduce((s, d) => s + d.qty * d.alarmMa, 0) / 1000;
  const raw = standbyA * i.standbyHours + alarmA * (i.alarmMinutes / 60);
  const req = raw * i.safetyFactor;
  const std = [7, 12, 18, 26, 33, 40, 55, 75, 100].find((x) => x >= req) ?? Math.ceil(req);
  return { standbyA, alarmA, rawAh: raw, requiredAh: req, recommendedBatteryAh: std };
}

/** NAC end-of-line voltage using the battery end-of-discharge voltage (20.4 V for 24 V systems is common practice). */
export function nacVoltageDrop(loadA: number, oneWayFt: number, ohmPerKft: number, sourceV = 20.4) {
  const drop = (2 * oneWayFt * loadA * ohmPerKft) / 1000;
  return { dropV: drop, eolV: sourceV - drop, pct: (drop / sourceV) * 100 };
}

export interface ErcesInputs {
  floors: number; areaPerFloorSqft: number; donorRssiDbm: number; bdaGainDb: number; bdaMaxOutputDbm: number;
  dasCableLossDb: number; splitterLossDb: number; indoorAntGainDbi: number; antennasPerFloor: number;
  avgPathLossToEdgeDb: number; standbyHours: number;
}
/** Simplified downlink budget to the worst point on a floor. */
export function ercesDownlink(i: ErcesInputs) {
  const bdaOut = Math.min(i.donorRssiDbm + i.bdaGainDb, i.bdaMaxOutputDbm);
  const splitDb = 10 * Math.log10(Math.max(1, i.floors * i.antennasPerFloor));
  const perAntenna = bdaOut - i.dasCableLossDb - i.splitterLossDb - splitDb;
  const edge = perAntenna + i.indoorAntGainDbi - i.avgPathLossToEdgeDb;
  return { bdaOutputDbm: bdaOut, perAntennaDbm: perAntenna, edgeRssiDbm: edge, compressed: i.donorRssiDbm + i.bdaGainDb > i.bdaMaxOutputDbm };
}
