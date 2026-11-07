// Ties the project inputs to the RF engine: one place that computes the link budget used by every page/report.
import type { Project } from '../types';
import { ANTENNAS, FEEDERS, byId } from '../data/catalog';
import { cableLossPer100ft, mToFt, linkBudget, shadowMarginDb, areaReliability, rangeForPathLossKm, empiricalPathLoss, radioHorizonKm, losDistanceKm } from './rf';
import { haversineKm } from './geo';

export function designLink(p: Project) {
  const r = p.radio;
  const tx = p.sites.find((s) => s.id === r.txSiteId) ?? p.sites[0];
  const rx = p.sites.find((s) => s.id === r.rxSiteId) ?? p.sites[1] ?? p.sites[0];
  const ant = byId(ANTENNAS, r.txAntennaId), rxAnt = byId(ANTENNAS, r.rxAntennaId), fd = byId(FEEDERS, r.feederId);
  const feederPer100 = fd ? cableLossPer100ft(fd.points, r.fMHz) : 0;
  const feederLoss = (feederPer100 * mToFt(r.feederLenM)) / 100;
  const fade = shadowMarginDb(r.shadowSigmaDb, r.edgeReliability);
  const lb = linkBudget({ txPowerDbm: r.txPowerDbm, txAntGainDbi: ant?.gainDbi ?? 0, txFeederLossDb: feederLoss + r.jumperLossDb, txConnectorLossDb: r.connectorLossDb,
    rxAntGainDbi: r.rxAntGainDbi, rxFeederLossDb: r.rxFeederLossDb, rxSensitivityDbm: r.rxSensitivityDbm,
    fadeMarginDb: fade, bodyLossDb: r.bodyLossDb, penetrationLossDb: r.penetrationLossDb, interferenceMarginDb: r.interferenceMarginDb });
  const base = { fMHz: r.fMHz, hbM: tx?.antennaAglM ?? 30, hmM: r.mobileHeightM, env: r.env, city: r.city };
  const rangeKm = rangeForPathLossKm(lb.maplDb, base);
  const model = empiricalPathLoss({ ...base, dKm: Math.min(Math.max(rangeKm, 1), 20) });
  const area = areaReliability(fade, r.shadowSigmaDb, (44.9 - 6.55 * Math.log10(base.hbM)) / 10);
  const pathKm = tx && rx ? haversineKm(tx, rx) : 0;
  return {
    tx, rx, ant, rxAnt, fd, feederPer100, feederLoss, fadeMarginDb: fade, ...lb, rangeKm, modelName: model.model, modelWarnings: model.warnings, areaReliability: area,
    horizonTxKm: radioHorizonKm(tx?.antennaAglM ?? 0, r.kFactor), losKm: losDistanceKm(tx?.antennaAglM ?? 0, rx?.antennaAglM ?? r.mobileHeightM, r.kFactor), pathKm,
    mobileLimitedKm: Math.min(rangeKm, losDistanceKm(tx?.antennaAglM ?? 0, r.mobileHeightM, r.kFactor)),
  };
}
