// Indoor sound planning on a floor plan: paging, pro sound, mass notification (voice evacuation) speakers and
// fire alarm horns. Predicts the sound level (dBA) everywhere on the plan from each speaker's rating and tap,
// the distance, the ceiling cone, the walls in between and the room's echo, then estimates speech clarity
// (STI) from the echo and the background noise. Rules of thumb only: a designer, and the AHJ where a code
// applies, must confirm the layout, and every voice system is measured (sound level and STIPA) at acceptance.

/** Coordinates are metres on the floor plan, x to the right and y down (same as the indoor radio planner). */
export interface Wall { x1: number; y1: number; x2: number; y2: number; material: string }

export type SpeakerKind = 'ceiling' | 'pendant' | 'wall' | 'horn' | 'fahorn' | 'spkstrobe';
export type SoundSystem = 'paging' | 'sound' | 'massnotif' | 'firealarm';
export type Occupancy = 'public' | 'private' | 'sleeping';

export interface IndoorSpeaker { id: string; label: string; x: number; y: number; kind: SpeakerKind; watts: number;
  /** Sensitivity: dB at 1 W and 1 m (speakers), or for fire alarm horns the dBA at 10 ft on the chosen setting. */
  ref: number;
  /** Mounting height (m). */
  hM?: number; by?: string }
/** A measured speech-clarity (STIPA) reading at a spot. */
export interface StiReading { id: string; x: number; y: number; sti: number; at: string; note?: string; by?: string }
export interface IndoorSound {
  system: SoundSystem; occupancy: Occupancy; ambientDba: number; ceilingM: number;
  /** Reverberation time RT60 (s). */
  rt60: number; speakers: IndoorSpeaker[]; sti: StiReading[];
  /** Custom sound target (dBA); blank = from the code rule for the system and occupancy. */
  targetDba?: number;
  currentKind: SpeakerKind; currentWatts: number;
}

export const SPEAKER_KINDS: Record<SpeakerKind, { label: string; ref: number; watts: number; hM: number; cone: number; di: number; horn?: boolean; note: string }> = {
  ceiling: { label: 'Ceiling speaker (8 in)', ref: 89, watts: 1, hM: 2.7, cone: 60, di: 6, note: 'Most common. About 89 dB at 1 W and 1 m; spreads about 120° below the ceiling.' },
  pendant: { label: 'Pendant speaker (open ceilings)', ref: 90, watts: 2, hM: 4, cone: 60, di: 6, note: 'Hung from open structure in warehouses, gyms and shops.' },
  wall: { label: 'Wall speaker', ref: 90, watts: 1, hM: 2.4, cone: 90, di: 5, note: 'Corridors and rooms without a ceiling grid. Aim along the space.' },
  horn: { label: 'Paging horn (re-entrant)', ref: 102, watts: 5, hM: 4, cone: 90, di: 9, note: 'Loud, narrow spread for shops, warehouses and noisy rooms. Not for music.' },
  fahorn: { label: 'Fire alarm horn or horn strobe', ref: 88, watts: 1, hM: 2.3, cone: 180, di: 3, horn: true, note: 'Rated in dBA at 10 ft (UL 464). Typical high / medium / low: 92 / 88 / 84 dBA.' },
  spkstrobe: { label: 'Voice evacuation speaker strobe', ref: 86, watts: 1, hM: 2.3, cone: 90, di: 5, note: 'Wall or ceiling speaker with strobe for fire alarm voice and mass notification (UL 1480). About 86 dB at 1 W, 10 ft per UL; taps ¼ to 2 W.' },
};
export const TAPS = [0.25, 0.5, 1, 2, 4, 8, 15, 30];

/** Sound lost through one pass of each indoor wall type (dB, A-weighted speech). From typical STC ratings. */
export const SOUND_WALL_TL: Record<string, number> = { drywall: 30, wood: 26, glass: 22, lowe: 25, brick: 40, block: 38, concrete: 45, metal: 40 };
export const soundWallTl = (m: string) => SOUND_WALL_TL[m] ?? 30;

export const ROOM_FINISH: Record<string, { label: string; rt60: number }> = {
  soft: { label: 'Soft: carpet, acoustic ceiling tile, furniture (offices, classrooms)', rt60: 0.6 },
  average: { label: 'Average: hard floor with tile ceiling (corridors, stores)', rt60: 1.0 },
  hard: { label: 'Hard: block walls, hard ceiling (gyms, lobbies, cafeterias)', rt60: 1.8 },
  veryhard: { label: 'Very hard: open structure, metal, concrete (warehouses, natatoriums, atriums)', rt60: 3.0 },
};

export const SOUND_SYSTEM_LABEL: Record<SoundSystem, string> = { paging: 'Paging', sound: 'Pro sound', massnotif: 'Mass notification / voice evacuation', firealarm: 'Fire alarm horns' };
export const isVoice = (s: SoundSystem) => s !== 'firealarm';

export function defaultIndoorSound(): IndoorSound {
  return { system: 'massnotif', occupancy: 'public', ambientDba: 55, ceilingM: 2.7, rt60: 1.0, speakers: [], sti: [], currentKind: 'ceiling', currentWatts: 1 };
}
/** Fill in anything missing (older projects, shared copies). */
export function normalizeIndoorSound(s: Partial<IndoorSound> | undefined): IndoorSound {
  const d = defaultIndoorSound(), o = { ...d, ...(s ?? {}) } as IndoorSound;
  if (!Array.isArray(o.speakers)) o.speakers = [];
  if (!Array.isArray(o.sti)) o.sti = [];
  if (!(o.system in SOUND_SYSTEM_LABEL)) o.system = d.system;
  if (!['public', 'private', 'sleeping'].includes(o.occupancy)) o.occupancy = 'public';
  for (const k of ['ambientDba', 'ceilingM', 'rt60', 'currentWatts'] as const) if (!Number.isFinite(o[k])) o[k] = d[k];
  if (!(o.currentKind in SPEAKER_KINDS)) o.currentKind = 'ceiling';
  o.speakers = o.speakers.filter((x) => x && Number.isFinite(x.x) && Number.isFinite(x.y)).map((x) => ({ ...x, kind: x.kind in SPEAKER_KINDS ? x.kind : 'ceiling', watts: Number.isFinite(x.watts) && x.watts > 0 ? x.watts : 1, ref: Number.isFinite(x.ref) ? x.ref : SPEAKER_KINDS[x.kind in SPEAKER_KINDS ? x.kind : 'ceiling'].ref }));
  o.sti = o.sti.filter((x) => x && Number.isFinite(x.sti) && Number.isFinite(x.x) && Number.isFinite(x.y));
  return o;
}

export interface SoundRule { target: number; max: number; rise: number; text: string; cite: string; stiGoal: number | null }
/** The sound target for the system and the kind of space, from the code rule (or the custom value). */
export function soundRule(s: Pick<IndoorSound, 'system' | 'occupancy' | 'ambientDba' | 'targetDba'>): SoundRule {
  const a = s.ambientDba;
  let rise = 15, target: number, text: string, cite: string;
  if (s.system === 'firealarm' || s.system === 'massnotif') {
    if (s.occupancy === 'private') { rise = 10; target = a + 10; text = `Private mode (staff-only spaces such as nurse stations, control rooms): ${a} dBA background + 10 dB.`; cite = 'NFPA 72 18.4.4'; }
    else if (s.occupancy === 'sleeping') { rise = 15; target = Math.max(75, a + 15); text = `Sleeping areas: at least 75 dBA at the pillow, and 15 dB over the background, whichever is louder. Use the 520 Hz low-frequency tone for the alarm signal.`; cite = 'NFPA 72 18.4.5 / 18.4.6'; }
    else { target = a + 15; text = `Public mode: ${a} dBA average background + 15 dB (or 5 dB over the loudest sound lasting 60 seconds).`; cite = 'NFPA 72 18.4.3'; }
    if (s.system === 'massnotif') text += ' Voice must also be clear (intelligible): loud is not enough.';
  } else if (s.system === 'paging') { rise = 12; target = a + 12; text = `Paging: about 10 to 15 dB over the ${a} dBA background, even within about ±3 dB from spot to spot.`; cite = 'Industry practice (NSCA / BICSI AV)'; }
  else { rise = 20; target = Math.min(95, a + 20); text = `Pro sound speech: about 20 dB over the ${a} dBA background, even within ±3 dB across the listening area.`; cite = 'Industry practice (AVIXA)'; }
  if (s.targetDba != null && Number.isFinite(s.targetDba)) { target = s.targetDba; text = `Custom target ${target} dBA (set on this plan). ${text}`; }
  return { target: Math.round(target), max: 110, rise, text, cite, stiGoal: isVoice(s.system) ? (s.system === 'massnotif' ? 0.5 : 0.45) : null };
}

function crosses(ax: number, ay: number, bx: number, by: number, w: Wall): boolean {
  const d = (bx - ax) * (w.y2 - w.y1) - (by - ay) * (w.x2 - w.x1);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((w.x1 - ax) * (w.y2 - w.y1) - (w.y1 - ay) * (w.x2 - w.x1)) / d;
  const u = ((w.x1 - ax) * (by - ay) - (w.y1 - ay) * (bx - ax)) / d;
  return t > 0 && t < 1 && u >= 0 && u <= 1;
}

/** Sound level at 1 m on axis (dB) for a speaker on its tap. Horns are rated at 10 ft (3.05 m). */
export function levelAt1m(sp: Pick<IndoorSpeaker, 'kind' | 'ref' | 'watts'>): number {
  const k = SPEAKER_KINDS[sp.kind] ?? SPEAKER_KINDS.ceiling;
  if (k.horn) return sp.ref + 20 * Math.log10(3.05);
  return sp.ref + 10 * Math.log10(Math.max(0.01, sp.watts)) + (sp.kind === 'spkstrobe' ? 20 * Math.log10(3.05) : 0);
}

export interface SoundOpts { walls: Wall[]; ceilingM: number; rt60: number; widthM: number; heightM: number; earM?: number }
/** Room constant R (m²) from Sabine: A = 0.161 V / T; R = A / (1 − ᾱ). */
export function roomConstant(o: SoundOpts): number {
  const V = Math.max(10, o.widthM * o.heightM * Math.max(2, o.ceilingM)), S = 2 * (o.widthM * o.heightM + (o.widthM + o.heightM) * Math.max(2, o.ceilingM));
  const A = (0.161 * V) / Math.max(0.2, o.rt60), alpha = Math.min(0.95, A / S);
  return A / (1 - alpha);
}

/** Direct and echo (reverberant) sound energy from each speaker at a spot (linear, relative to 1 = 0 dB). */
export function energiesAt(x: number, y: number, speakers: IndoorSpeaker[], o: SoundOpts, R = roomConstant(o)): { direct: number; rev: number; per: number[] } {
  const ear = o.earM ?? 1.5; let direct = 0, rev = 0; const per: number[] = [];
  for (const sp of speakers) {
    const k = SPEAKER_KINDS[sp.kind] ?? SPEAKER_KINDS.ceiling;
    const L1 = levelAt1m(sp), dz = Math.max(0.3, (sp.hM ?? k.hM) - ear), horiz = Math.hypot(x - sp.x, y - sp.y), r = Math.max(1, Math.hypot(horiz, dz));
    let tl = 0; for (const w of o.walls) if (crosses(sp.x, sp.y, x, y, w)) tl += soundWallTl(w.material);
    let ld = L1 - 20 * Math.log10(r) - tl;
    const offAxis = (Math.atan2(horiz, dz) * 180) / Math.PI;
    if (k.cone < 180 && (sp.kind === 'ceiling' || sp.kind === 'pendant') && offAxis > k.cone) ld -= Math.min(12, (offAxis - k.cone) / 3);
    // sound power level Lw ≈ L(1 m) + 11 − DI; echo field Lr = Lw + 10·log10(4 / R), cut by the walls in between
    const lr = L1 + 11 - k.di + 10 * Math.log10(4 / R) - tl;
    const ed = 10 ** (ld / 10), er = 10 ** (lr / 10);
    direct += ed; rev += er; per.push(10 * Math.log10(ed + er));
  }
  return { direct, rev, per };
}

const MOD_F = [0.63, 0.8, 1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10, 12.5];
/** Speech Transmission Index estimate from direct and echo energy, the room's RT60 and the background noise.
 *  Single-band simplified (Houtgast–Steeneken). Good for comparing layouts, not a substitute for STIPA tests. */
export function stiFrom(direct: number, rev: number, rt60: number, noiseDba: number): number {
  const en = 10 ** (noiseDba / 10), tot = direct + rev;
  if (tot <= 0) return 0;
  let sum = 0;
  for (const F of MOD_F) {
    const mr = 1 / Math.sqrt(1 + ((2 * Math.PI * F * rt60) / 13.8) ** 2);
    const m = Math.min(0.9999, Math.max(1e-6, (direct + rev * mr) / (tot + en)));
    const snr = Math.max(-15, Math.min(15, 10 * Math.log10(m / (1 - m))));
    sum += (snr + 15) / 30;
  }
  return sum / MOD_F.length;
}
export function stiWord(sti: number): { word: string; tone: 'ok' | 'warn' | 'bad' } {
  if (sti >= 0.6) return { word: 'good', tone: 'ok' };
  if (sti >= 0.5) return { word: 'fair to good', tone: 'ok' };
  if (sti >= 0.45) return { word: 'fair', tone: 'warn' };
  if (sti >= 0.3) return { word: 'poor', tone: 'bad' };
  return { word: 'bad', tone: 'bad' };
}

export interface SoundGrid { nx: number; ny: number; v: Float32Array; sti: Float32Array; pct: number; stiPct: number; stiAvg: number; maxDba: number; minDba: number; over110: number }
/** Sound level (dBA) and estimated STI over the whole plan. */
export function soundGrid(s: IndoorSound, o: SoundOpts, nx = 72): SoundGrid {
  const ny = Math.max(8, Math.round((nx * o.heightM) / o.widthM));
  const v = new Float32Array(nx * ny).fill(NaN), sti = new Float32Array(nx * ny).fill(NaN);
  const rule = soundRule(s);
  if (!s.speakers.length) return { nx, ny, v, sti, pct: 0, stiPct: 0, stiAvg: 0, maxDba: NaN, minDba: NaN, over110: 0 };
  const R = roomConstant(o); let ok = 0, sOk = 0, sSum = 0, mx = -Infinity, mn = Infinity, hot = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = ((i + 0.5) / nx) * o.widthM, y = ((j + 0.5) / ny) * o.heightM;
    const e = energiesAt(x, y, s.speakers, o, R), L = 10 * Math.log10(e.direct + e.rev), k = j * nx + i;
    v[k] = L; if (L >= rule.target) ok++; if (L > 110) hot++; mx = Math.max(mx, L); mn = Math.min(mn, L);
    if (isVoice(s.system)) { const t = stiFrom(e.direct, e.rev, o.rt60, s.ambientDba); sti[k] = t; sSum += t; if (t >= 0.45) sOk++; }
  }
  const n = nx * ny;
  return { nx, ny, v, sti, pct: (ok / n) * 100, stiPct: isVoice(s.system) ? (sOk / n) * 100 : 0, stiAvg: isVoice(s.system) ? sSum / n : 0, maxDba: mx, minDba: mn, over110: (hot / n) * 100 };
}

/** Predicted level at a spot and which speaker serves it most. */
export function soundAt(x: number, y: number, s: IndoorSound, o: SoundOpts): { dba: number | null; sti: number | null; src: number } {
  if (!s.speakers.length) return { dba: null, sti: null, src: -1 };
  const e = energiesAt(x, y, s.speakers, o);
  return { dba: 10 * Math.log10(e.direct + e.rev), sti: isVoice(s.system) ? stiFrom(e.direct, e.rev, o.rt60, s.ambientDba) : null, src: e.per.indexOf(Math.max(...e.per)) };
}

export const STI_SCALE = [
  { min: 0.6, color: [0, 150, 70], label: 'STI ≥ 0.60 (good)' },
  { min: 0.5, color: [120, 200, 40], label: '0.50 to 0.60 (fair to good)' },
  { min: 0.45, color: [250, 200, 30], label: '0.45 to 0.50 (fair, the usual minimum)' },
  { min: 0.3, color: [245, 120, 30], label: '0.30 to 0.45 (poor)' },
  { min: -1, color: [210, 40, 40], label: '< 0.30 (bad: words lost)' },
] as const;
export function stiColor(v: number): [number, number, number, number] {
  if (!Number.isFinite(v)) return [0, 0, 0, 0];
  for (const s of STI_SCALE) if (v >= s.min) return [s.color[0], s.color[1], s.color[2], 150];
  return [0, 0, 0, 0];
}

export interface SoundTip { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }
/** Plain-language design advice for the whole plan. */
export function soundAdvice(s: IndoorSound, g: SoundGrid, rule: SoundRule, fmtLen: (m: number) => string): SoundTip[] {
  const out: SoundTip[] = [];
  if (!s.speakers.length) return [{ tone: 'info', text: `Pick 🔊 Place speaker and tap the plan to add ${s.system === 'firealarm' ? 'horns' : 'speakers'}. The heat map shows how loud each spot will be.` }];
  if (g.pct >= 95) out.push({ tone: 'ok', text: `${g.pct.toFixed(0)}% of the floor reaches ${rule.target} dBA.` });
  else out.push({ tone: g.pct >= 85 ? 'warn' : 'bad', text: `Only ${g.pct.toFixed(0)}% of the floor reaches ${rule.target} dBA. Add ${s.system === 'firealarm' ? 'horns' : 'speakers'} in the blue spots, or turn the nearest ones up one tap (+3 dB each doubling).` });
  if (g.over110 > 0) out.push({ tone: 'bad', text: `Some spots are over 110 dBA (${g.over110.toFixed(1)}% of the floor). NFPA 72 18.4.1 does not allow that: turn those down or use more devices at lower settings.` });
  else if (g.maxDba - rule.target > 20) out.push({ tone: 'warn', text: `Near the loudest device it reaches ${g.maxDba.toFixed(0)} dBA, ${Math.round(g.maxDba - rule.target)} dB over the target. More devices at lower taps give an even level and clearer speech.` });
  // spacing: suggest a center-to-center spacing for ceiling speakers from height and the cone
  const ceil = s.speakers.filter((x) => x.kind === 'ceiling' || x.kind === 'pendant');
  if (ceil.length) {
    const h = Math.max(0.5, s.ceilingM - 1.5), spacing = 2 * h * Math.tan((60 * Math.PI) / 180) * (s.rt60 > 1.5 ? 0.65 : s.rt60 > 0.8 ? 0.8 : 1);
    out.push({ tone: 'info', text: `Ceiling speakers at ${fmtLen(s.ceilingM)}: space them about ${fmtLen(spacing)} apart (edge to edge for even sound${s.rt60 > 0.8 ? ', closer because of the echo' : ''}).` });
  }
  if (rule.stiGoal != null) {
    const w = stiWord(g.stiAvg);
    if (g.stiAvg >= rule.stiGoal && g.stiPct >= 90) out.push({ tone: 'ok', text: `Speech clarity estimate STI ${g.stiAvg.toFixed(2)} (${w.word}); ${g.stiPct.toFixed(0)}% of the floor at 0.45 or better.` });
    else {
      const why = s.rt60 > 1.2 ? `the room echo (RT60 ${s.rt60.toFixed(1)} s) blurs words: use more speakers closer to listeners at lower taps, aim horns or wall speakers at people instead of hard walls, and add sound-absorbing panels or ceiling tile` : `background noise (${s.ambientDba} dBA) masks words where the level is low: fill the quiet spots with more speakers`;
      out.push({ tone: 'bad', text: `Speech clarity estimate STI ${g.stiAvg.toFixed(2)} (${w.word}); only ${g.stiPct.toFixed(0)}% of the floor at 0.45. Goal: ${rule.stiGoal.toFixed(2)} average with 0.45 at 90% of spots. Here ${why}.` });
    }
    if (s.rt60 > 2) out.push({ tone: 'warn', text: 'With an echo this long, turning speakers up does not make speech clearer; it makes the echo louder too. Spread out more low-power speakers instead.' });
  }
  if (s.system === 'firealarm' && s.occupancy === 'sleeping') out.push({ tone: 'info', text: 'Sleeping rooms: test at the pillow with doors closed. Horns in the corridor rarely reach 75 dBA inside a room with a closed door; put a device in each room.' });
  return out;
}

/** Codes and standards for indoor voice, paging and alarm sound. Section numbers move between editions; the
 *  adopted edition for the project's state comes from the state code list (Fire alarm row). */
export interface VoiceCode { cat: 'Federal' | 'Model code' | 'Standard' | 'Guidance'; cite: string; text: string; applies: SoundSystem[]; confirm?: boolean }
export const INDOOR_VOICE_CODES: VoiceCode[] = [
  { cat: 'Model code', cite: 'IBC / IFC 907.5.2.2 and 907.2', text: 'Where the building or fire code requires an emergency voice / alarm communication system (EVACS), such as large assembly spaces, schools, high-rise buildings, covered malls and some hospital and detention spaces, it must be installed to NFPA 72. Your state\'s edition decides the exact triggers.', applies: ['massnotif', 'firealarm'], confirm: true },
  { cat: 'Standard', cite: 'NFPA 72 18.4.1 (maximum level)', text: 'No audible signal may be louder than 110 dBA at the minimum hearing distance.', applies: ['firealarm', 'massnotif'] },
  { cat: 'Standard', cite: 'NFPA 72 18.4.3 (public mode)', text: 'At least 15 dB over the average background sound (or 5 dB over the loudest sound lasting 60 seconds), measured 5 ft above the floor.', applies: ['firealarm', 'massnotif'] },
  { cat: 'Standard', cite: 'NFPA 72 18.4.4 (private mode)', text: 'At least 10 dB over the average background where only staff need to hear it.', applies: ['firealarm', 'massnotif'] },
  { cat: 'Standard', cite: 'NFPA 72 18.4.5 / 18.4.6 (sleeping areas)', text: 'At least 75 dBA at the pillow (and 15 dB over background); the alarm signal in sleeping rooms must be the 520 Hz low-frequency tone.', applies: ['firealarm', 'massnotif'] },
  { cat: 'Standard', cite: 'NFPA 72 18.4 voice intelligibility and acoustically distinguishable spaces (ADS)', text: 'Voice must be intelligible in every ADS (each room or area that sounds different). The designer lists which ADS need intelligible voice; some (restrooms, small closets) may only need to hear the tone.', applies: ['massnotif'] },
  { cat: 'Standard', cite: 'NFPA 72 Annex D (intelligibility testing)', text: 'STIPA readings in each ADS. A commonly used acceptance goal is an average of 0.50 STI, with at least 0.45 at 90% of the test spots. Annex D is advisory unless your AHJ adopts it.', applies: ['massnotif', 'paging'], confirm: true },
  { cat: 'Standard', cite: 'NFPA 72 Chapter 24 (emergency communications systems)', text: 'In-building mass notification: a risk analysis sets which messages, zones and priorities are needed. Mass notification may take priority over the fire alarm signal when the risk analysis says so; live voice overrides recorded messages.', applies: ['massnotif'] },
  { cat: 'Standard', cite: 'NFPA 72 Chapter 14 (testing)', text: 'Measure sound levels and voice clarity at acceptance, after any change, and test notification appliances every year. Keep the records with the system.', applies: ['firealarm', 'massnotif'] },
  { cat: 'Standard', cite: 'NFPA 70 (NEC) Articles 760, 725 and 640', text: 'Fire alarm speaker and horn circuits are Article 760 (fire alarm cable, survivability where required). Paging and sound speaker lines are Article 725 / 640 (Class 2 or 3).', applies: ['firealarm', 'massnotif', 'paging', 'sound'] },
  { cat: 'Federal', cite: '2010 ADA Standards 702 and ICC A117.1 702', text: 'Audible alarms follow NFPA 72, and visible alarms (strobes) are required where audible alarms are provided in public and common use areas.', applies: ['firealarm', 'massnotif'] },
  { cat: 'Federal', cite: 'OSHA 29 CFR 1910.165', text: 'Employee alarm systems must be heard (or seen) above the workplace noise by all employees. Noisy shops often need strobes as well as horns.', applies: ['firealarm', 'massnotif', 'paging'] },
  { cat: 'Federal', cite: 'UFC 4-021-01 (Department of Defense)', text: 'Military and some federal buildings: mass notification design with intelligibility tests in each ADS.', applies: ['massnotif'] },
  { cat: 'Guidance', cite: 'Outdoor warning sirens (FEMA CPG 1-17)', text: 'Outdoor sirens are meant for people outside. Inside a closed building they are usually not loud enough to alert people; use the indoor voice system, a NOAA weather radio, or phone alerts indoors.', applies: ['massnotif', 'paging'] },
];

/** Outdoor sound lost getting inside a closed building (dB, A-weighted). Typical: 25 dB, open windows 15 dB, sealed glass and block 30 dB+. */
export const OUTSIDE_IN_DBA = 25;
