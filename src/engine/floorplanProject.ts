// Putting an imported floor plan into the project plan and build, and taking it out again.
import type { Project, ProjectDoc } from '../types';
import { defaultInputs } from './autodesign';
import { integrationValues, planInFeet, type FloorPlanImport } from './floorplan';

/** Ordinal level names used on drawing sheets. */
export function levelName(floor: number): string {
  const ord = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH'];
  return floor < 0 ? 'BASEMENT FLOOR PLAN' : `${ord[floor] ?? `LEVEL ${floor + 1}`} FLOOR PLAN`;
}

/** Adds (or removes) the plan from the project plan and build:
 *  - 2D & 3D Models use its walls, doors and windows (with the project's materials),
 *  - Auto-Design gets its size, floors, rooms, exterior doors and ceiling height (so devices, cable and materials follow),
 *  - Indoor Coverage gets the walls when nothing has been drawn there yet. */
export function setIntegrated(d: Project, id: string, on: boolean): void {
  const plan = d.floorPlans?.find((x) => x.id === id); if (!plan) return;
  plan.integrated = on; plan.integratedAt = on ? new Date().toISOString() : undefined;
  const v = integrationValues(d.floorPlans ?? []);
  if (v) d.autoDesign = { ...defaultInputs(), ...(d.autoDesign ?? {}), ...v };
  if (on && plan.scale.ftPerPx && d.indoor && !(d.indoor.walls?.length)) {
    const f = planInFeet(plan), m = 0.3048;
    d.indoor.widthM = +(f.L * m).toFixed(2); d.indoor.heightM = +(f.W * m).toFixed(2);
    d.indoor.walls = [...f.walls.map((w) => ({ x1: w.x1 * m, y1: w.y1 * m, x2: w.x2 * m, y2: w.y2 * m, material: w.exterior ? 'block' : 'drywall' })),
      ...f.openings.filter((o) => o.kind === 'window').map((o) => ({ x1: o.x1 * m, y1: o.y1 * m, x2: o.x2 * m, y2: o.y2 * m, material: 'glass' }))];
  }
}

/** Ticks the plan for the project documentation: Reports (floor plans and schedules) and the Documents list (the drawing and the original file). */
export function setInDocs(d: Project, plan: FloorPlanImport, on: boolean, sheetSvg?: string, original?: { name: string; type: string; size: number; dataUrl: string }): void {
  const p = d.floorPlans?.find((x) => x.id === plan.id); if (!p) return;
  p.inDocs = on;
  const tag = `floorplan:${plan.id}`;
  d.documents = (d.documents ?? []).filter((x) => !x.note.startsWith(tag));
  if (!on) return;
  const now = new Date().toISOString(), docs: ProjectDoc[] = [];
  if (sheetSvg) docs.push({ id: `${plan.id}-sheet`, name: `A-${101 + plan.floor} ${plan.level || 'FLOOR PLAN'}.svg`, type: 'image/svg+xml', size: sheetSvg.length, dataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sheetSvg), addedAt: now, note: `${tag} Floor plan sheet (traced, true scale)` });
  if (original) docs.push({ id: `${plan.id}-src`, ...original, addedAt: now, note: `${tag} Original floor plan file` });
  d.documents.push(...docs);
}
