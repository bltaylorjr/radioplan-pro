import React from 'react';
import { useStore } from '../store';
import { Card, Field, Num, Sel, Check } from '../components/ui';
import { AWG_SIZES } from '../engine/electrical';
import { evaluateCompliance } from '../compliance/rules';
import { FindingList } from './Compliance';
import type { Grounding } from '../types';

export function GroundingPage() {
  const { project: p, update, rt } = useStore();
  const g = p.grounding;
  const set = <K extends keyof Grounding>(k: K, v: Grounding[K]) => update((d) => { d.grounding[k] = v; });
  const f = evaluateCompliance({ project: p, profile: rt.profile }).filter((x) => x.area === 'Grounding & Bonding' || x.area === 'RF / Structure' || x.area === 'Regulatory (FAA/FCC)');
  return (
    <div className="grid2">
      <Card title="Grounding electrode system & bonding">
        <div className="form">
          <Field label="Mast/tower bonding conductor" tip="NEC 810.21(H)/810.58: ≥ 10 AWG Cu. R56: #2 AWG solid tinned for towers."><Sel value={g.bondingConductorAwg} onChange={(v) => set('bondingConductorAwg', v)} options={[['', 'None'], ...[...AWG_SIZES].reverse().map((a) => [a, `#${a} AWG Cu`] as [string, string])]} /></Field>
          <Field label="Bonding conductor length" tip="NEC 800.100(A)(4): ≤ 6 m (20 ft) for dwellings."><Num value={g.bondingConductorLengthM} onChange={(v) => set('bondingConductorLengthM', v!)} unit="m" /></Field>
          <Field label="Ground ring conductor"><Sel value={g.groundRingAwg} onChange={(v) => set('groundRingAwg', v)} options={[...AWG_SIZES].reverse().map((a) => [a, `#${a} AWG`] as [string, string])} /></Field>
          <Field label="Ground rods"><Num value={g.groundRods} step={1} onChange={(v) => set('groundRods', Math.max(0, Math.round(v!)))} unit="ea" /></Field>
          <Field label="Rod length" tip="NEC 250.52(A)(5): ≥ 8 ft."><Num value={g.rodLengthFt} onChange={(v) => set('rodLengthFt', v!)} unit="ft" /></Field>
          <Field label="Rod spacing" tip="NEC 250.53(A)(3): ≥ 6 ft. R56: ≥ 2× rod length."><Num value={g.rodSpacingFt} onChange={(v) => set('rodSpacingFt', v!)} unit="ft" /></Field>
          <Field label="Feeder ground kits per line"><Num value={g.towerGroundKits} step={1} onChange={(v) => set('towerGroundKits', Math.round(v!))} unit="ea" /></Field>
          <Field label="Measured resistance (fall-of-potential)"><Num value={g.measuredResistanceOhm} nullable onChange={(v) => set('measuredResistanceOhm', v)} unit="Ω" /></Field>
          <Field label="Lead-in clearance to power conductors" tip="NEC 810.18(A): ≥ 0.6 m (2 ft)."><Num value={g.leadInClearanceToPowerM} onChange={(v) => set('leadInClearanceToPowerM', v!)} unit="m" /></Field>
          <Field label="Protection"><span className="stack-tight">
            <Check value={g.surgeProtector} onChange={(v) => set('surgeProtector', v)} label="Listed antenna discharge unit at entry (810.20)" />
            <Check value={g.intersystemBond} onChange={(v) => set('intersystemBond', v)} label="Intersystem bonding termination (250.94)" />
            <Check value={g.lightningProtection} onChange={(v) => set('lightningProtection', v)} label="Bonded to lightning protection system (NFPA 780)" />
          </span></Field>
        </div>
        <h4>Structure (TIA-222-H)</h4>
        <div className="form">
          <Field label="Risk category"><Sel value={g.structureClass} onChange={(v) => set('structureClass', v)} options={[['I', 'I (low hazard)'], ['II', 'II (standard)'], ['III', 'III (essential comms / public safety)']]} /></Field>
          <Field label="Design ice"><Check value={g.ice} onChange={(v) => set('ice', v)} label="Include ice loading" /></Field>
        </div>
      </Card>
      <Card title="Live code check: grounding, structure & regulatory"><FindingList findings={f} /></Card>
    </div>
  );
}
