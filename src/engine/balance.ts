// Reading pins and signal balance. Measured readings dropped on any heat map (outdoor radio coverage, DAS and
// public-safety BDA, Wi-Fi, cellular, wireless devices, paging / pro sound / mass notification / fire alarm
// sound levels, camera lighting) are compared with the target and the predicted value, grouped by the device
// that serves them, and turned into plain-language advice: turn a device up or down, move it, add one, aim
// or tilt it. Rules of thumb only: a designer, and the AHJ where a code applies, must confirm each change.

export type Qty = 'dbm' | 'dba' | 'lux';
export const QTY: Record<Qty, { unit: string; label: string; word: string; example: string }> = {
  dbm: { unit: 'dBm', label: 'Signal strength', word: 'signal', example: '-87' },
  dba: { unit: 'dBA', label: 'Sound level', word: 'sound level', example: '78' },
  lux: { unit: 'lux', label: 'Light level', word: 'light', example: '60' },
};

/** What a "good" reading is for each system, what its emitters are called and what you turn to change them. */
export interface SystemNorm {
  qty: Qty; target: number; hot: number;
  /** Spread (standard deviation, dB) that still counts as even. */
  tol: number;
  /** Largest turn-up worth suggesting before adding a device is the better answer (dB). */
  maxRaise: number;
  source: string; adjust: string; add: string;
  /** Typical reach of one emitter (m): further than this from the nearest one means "add one". */
  reachM: number;
  /** Share of readings that must meet the target (%). */
  needPct: number;
  note: string;
}

const RF_IN = { qty: 'dbm' as Qty, tol: 8, maxRaise: 6, needPct: 95 };
const SPL = { qty: 'dba' as Qty, maxRaise: 6, needPct: 95 };
export const PIN_NORMS: Record<string, SystemNorm> = {
  rf: { qty: 'dbm', target: -95, hot: -40, tol: 10, maxRaise: 6, needPct: 90, source: 'site', adjust: 'transmitter power or antenna', add: 'another site or a booster', reachM: 8000,
    note: 'Outdoor radio. Portable radios on the street usually need about −95 dBm; in-vehicle −105 dBm. Check the system\'s own design target.' },
  wifi: { ...RF_IN, target: -67, hot: -30, source: 'access point', adjust: 'access point transmit power', add: 'another access point', reachM: 15,
    note: 'Wi-Fi voice and video: −67 dBm or better, with a second access point within about 10 dB for roaming. Over about −30 dBm the access point is too close or too loud.' },
  cabling: { ...RF_IN, target: -67, hot: -30, source: 'access point', adjust: 'access point transmit power', add: 'another access point', reachM: 15,
    note: 'Wireless network served by the structured cabling: −67 dBm or better.' },
  fiber: { ...RF_IN, target: -67, hot: -30, source: 'access point', adjust: 'access point transmit power', add: 'another access point', reachM: 15,
    note: 'Wireless network served by the fiber backbone: −67 dBm or better.' },
  das: { ...RF_IN, target: -85, hot: -45, source: 'DAS antenna', adjust: 'coupler or splitter value, or the BDA downlink gain', add: 'another DAS antenna', reachM: 20,
    note: 'Cellular in-building: about −85 dBm or better. Very strong spots near antennas can overload phones and push noise into the uplink.' },
  erces: { ...RF_IN, target: -95, hot: -45, needPct: 90, source: 'DAS antenna', adjust: 'coupler or splitter value, or the BDA downlink gain', add: 'another DAS antenna', reachM: 20,
    note: 'NFPA 1225 / IFC 510: −95 dBm in 90% of each floor\'s general areas and 99% of critical areas (stairs, fire command, pump rooms). Too strong near antennas leaks outside and can trip the BDA\'s oscillation protection.' },
  callbox: { qty: 'dbm', target: -95, hot: -40, tol: 10, maxRaise: 6, needPct: 99, source: 'call box', adjust: 'call box antenna or its location', add: 'a repeater, or move the call box', reachM: 400,
    note: 'Wireless emergency call boxes need a dependable link at every box: plan for the radio or cellular level the maker lists, about −95 dBm for most.' },
  security: { ...RF_IN, target: -85, hot: -30, needPct: 99, source: 'wireless receiver', adjust: 'receiver location or antenna', add: 'a wireless repeater', reachM: 30,
    note: 'Wireless sensors need about 10 dB more than the receiver\'s minimum at every sensor. The panel\'s own signal test is the final word.' },
  access: { ...RF_IN, target: -80, hot: -30, needPct: 99, source: 'wireless lock hub', adjust: 'hub location or antenna', add: 'another hub', reachM: 15,
    note: 'Wireless locks need a strong link at every door: about −80 dBm or better for most hubs.' },
  paging: { ...SPL, target: 70, hot: 95, tol: 4, source: 'speaker', adjust: 'speaker tap (watts) or zone level', add: 'another speaker', reachM: 6,
    note: 'Paging: 10 to 15 dB above the background noise, even within about ±3 dB from spot to spot.' },
  sound: { ...SPL, target: 80, hot: 100, tol: 3, source: 'speaker', adjust: 'speaker tap or zone level', add: 'another speaker', reachM: 6,
    note: 'Pro sound: even within ±3 dB across the listening area, with the level set for the program (speech about 70 to 80 dBA, music louder).' },
  massnotif: { ...SPL, target: 75, hot: 110, tol: 4, source: 'speaker', adjust: 'speaker tap (watts)', add: 'another speaker', reachM: 7,
    note: 'NFPA 72 chapter 24: voice must be intelligible (STI 0.45 or better in most spaces) and audible, about 15 dB above the average background, never over 110 dBA.' },
  firealarm: { ...SPL, target: 75, hot: 110, tol: 6, source: 'horn or speaker', adjust: 'horn high/low setting or speaker tap', add: 'another horn or speaker', reachM: 8,
    note: 'NFPA 72 18.4.3: public mode 15 dB above the average background (or 5 dB above the loudest sound lasting 60 seconds), never over 110 dBA; sleeping areas 75 dBA at the pillow.' },
  intercom: { ...SPL, target: 70, hot: 90, tol: 5, source: 'intercom station', adjust: 'station volume', add: 'another station or speaker', reachM: 4,
    note: 'Intercom: clearly above the background where people listen, about 65 to 75 dBA.' },
  nursecall: { ...SPL, target: 65, hot: 85, tol: 5, source: 'nurse call station', adjust: 'station or tone volume', add: 'another annunciator or speaker', reachM: 4,
    note: 'UL 1069 / FGI: tones and voice heard at the nurse station and in corridors; keep them below disturbing levels in patient rooms.' },
  cctv: { qty: 'lux', target: 50, hot: 5000, tol: 6, maxRaise: 6, needPct: 95, source: 'camera light or IR illuminator', adjust: 'light aim or output', add: 'another light or IR illuminator', reachM: 15,
    note: 'Cameras: about 50 lux (5 foot-candles) for a good colour picture, less with IR at night. IES parking lots: keep average-to-minimum under about 4 to 1.' },
};
PIN_NORMS.radio = PIN_NORMS.rf;
export const normFor = (system: string): SystemNorm => PIN_NORMS[system] ?? PIN_NORMS.rf;

export interface BPoint { id: string; v: number; pred?: number | null; x: number; y: number; floor?: number; src?: string; critical?: boolean }
export interface BSource { id: string; label: string; x?: number; y?: number; floor?: number }
export interface BalanceOpts {
  system: string; target?: number; hot?: number;
  /** Map readings (x east, y south, metres): use compass words and the near / far tilt check. Floor plans use up / down / left / right. */
  outdoor?: boolean;
  /** Formats a length in metres for the user (ft or m). */
  fmtLen?: (m: number) => string;
}
export type AdviceKind = 'ok' | 'coverage' | 'raise' | 'lower' | 'balance' | 'add' | 'move' | 'tilt' | 'model' | 'device' | 'uniform' | 'code' | 'info';
export interface Advice { tone: 'ok' | 'warn' | 'bad' | 'info'; kind: AdviceKind; text: string; src?: string; changeDb?: number }
export interface SourceStat { id: string; label: string; n: number; mean: number; min: number; max: number; meanDelta: number | null; cold: number; hot: number }
export interface Cluster { x: number; y: number; floor?: number; n: number; worst: number; ids: string[]; critical: boolean; src?: string; distM?: number }
export interface BalanceResult {
  n: number; qty: Qty; unit: string; target: number; hot: number;
  mean: number; min: number; max: number; sd: number; pctOk: number;
  cold: BPoint[]; hotPts: BPoint[]; meanDelta: number | null; sdDelta: number | null;
  uniform: 'good' | 'fair' | 'poor'; perSource: SourceStat[]; imbalanceDb: number | null;
  clusters: Cluster[]; advice: Advice[]; verdict: { tone: 'ok' | 'warn' | 'bad'; text: string };
}

/** Light is compared on a decibel-like scale so the same rules work: 10·log10(lux). */
const toDb = (v: number, q: Qty) => (q === 'lux' ? 10 * Math.log10(Math.max(0.05, v)) : v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => (a.length ? a.reduce((s, b) => s + b, 0) / a.length : NaN);
const sdev = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, b) => s + (b - m) ** 2, 0) / (a.length - 1)); };

/** A level for the user: "-87 dBm", "78 dBA", "60 lux". */
export function fmtQ(v: number, q: Qty): string { return Number.isFinite(v) ? `${q === 'lux' ? Math.round(v) : r1(v)} ${QTY[q].unit}` : '—'; }

/** What a change of `db` means in words for the device being adjusted. */
export function changeText(db: number, q: Qty, system: string): string {
  const up = db >= 0, a = Math.abs(db);
  if (q === 'lux') { const x = 10 ** (a / 10); return `about ${x < 1.95 ? x.toFixed(1) : Math.round(x)}× ${up ? 'more' : 'less'} light`; }
  if (q === 'dba' && ['paging', 'sound', 'massnotif', 'firealarm'].includes(system)) {
    const steps = Math.max(1, Math.round(a / 3));
    const eg = up ? (steps === 1 ? '1 W → 2 W' : steps === 2 ? '1 W → 4 W' : '0.5 W → 4 W') : (steps === 1 ? '2 W → 1 W' : steps === 2 ? '4 W → 1 W' : '4 W → 0.5 W');
    return `about ${up ? '+' : '−'}${Math.round(a)} dB: ${steps} tap step${steps > 1 ? 's' : ''} ${up ? 'up' : 'down'} (each doubling of the tap is +3 dB, e.g. ${eg})${system === 'firealarm' ? ', or the horn\'s high / low setting' : ''}`;
  }
  return `about ${up ? '+' : '−'}${Math.round(a)} dB`;
}

/** Which way, in words: compass on maps, plan directions on floor plans (x right, y down). */
export function dirWord(dx: number, dy: number, outdoor: boolean): string {
  if (Math.hypot(dx, dy) < 1e-6) return 'at';
  const a = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360, i = Math.round(a / 45) % 8;
  return (outdoor ? ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] : ['up', 'up and right', 'right', 'down and right', 'down', 'down and left', 'left', 'up and left'])[i];
}

/** Sort each reading to the device that serves it: the one it names, else the nearest (same floor first). */
export function assignSources(pts: BPoint[], srcs: BSource[]): BPoint[] {
  const placed = srcs.filter((s) => s.x != null && s.y != null);
  return pts.map((p) => {
    if (p.src && srcs.some((s) => s.id === p.src)) return p;
    if (!placed.length) return p;
    const same = placed.filter((s) => p.floor == null || s.floor == null || s.floor === p.floor);
    const pool = same.length ? same : placed;
    let best = pool[0], bd = Infinity;
    for (const s of pool) { const d = Math.hypot(s.x! - p.x, s.y! - p.y); if (d < bd) { bd = d; best = s; } }
    return { ...p, src: best.id };
  });
}

/** Groups weak readings that sit near each other (within `rM`). */
export function clusterPoints(pts: BPoint[], rM: number): Cluster[] {
  const left = [...pts].sort((a, b) => a.v - b.v); const out: Cluster[] = [];
  while (left.length) {
    const seed = left.shift()!; const mem = [seed];
    for (let i = left.length - 1; i >= 0; i--) { const q = left[i]; if ((q.floor ?? 0) === (seed.floor ?? 0) && Math.hypot(q.x - seed.x, q.y - seed.y) <= rM) { mem.push(q); left.splice(i, 1); } }
    const srcCount = new Map<string, number>(); mem.forEach((m) => m.src && srcCount.set(m.src, (srcCount.get(m.src) ?? 0) + 1));
    out.push({ x: mean(mem.map((m) => m.x)), y: mean(mem.map((m) => m.y)), floor: seed.floor, n: mem.length, worst: Math.min(...mem.map((m) => m.v)), ids: mem.map((m) => m.id), critical: mem.some((m) => m.critical),
      src: [...srcCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] });
  }
  return out.sort((a, b) => b.n - a.n || a.worst - b.worst);
}

/** The analysis: coverage against the target, hot spots, evenness, balance between devices, model check and advice. */
export function analyzeBalance(points: BPoint[], sources: BSource[], o: BalanceOpts): BalanceResult {
  const nm = normFor(o.system), q = nm.qty, unit = QTY[q].unit;
  const target = o.target ?? nm.target, hot = o.hot ?? nm.hot;
  const len = o.fmtLen ?? ((m: number) => `${Math.round(m)} m`);
  const outdoor = !!o.outdoor;
  const T = toDb(target, q), H = toDb(hot, q);
  const pts = assignSources(points.filter((p) => Number.isFinite(p.v)), sources).map((p) => ({ ...p, raw: p.v, v: toDb(p.v, q), pred: p.pred != null && Number.isFinite(p.pred) ? toDb(p.pred, q) : null }));
  const srcOf = (id?: string) => sources.find((s) => s.id === id);
  const name = (id?: string) => srcOf(id)?.label ?? `the nearest ${nm.source}`;
  const vals = pts.map((p) => p.v), n = pts.length;
  const advice: Advice[] = [];
  const back = (db: number) => (q === 'lux' ? 10 ** (db / 10) : db);
  const empty: BalanceResult = { n: 0, qty: q, unit, target, hot, mean: NaN, min: NaN, max: NaN, sd: NaN, pctOk: NaN, cold: [], hotPts: [], meanDelta: null, sdDelta: null, uniform: 'good', perSource: [], imbalanceDb: null, clusters: [], advice: [], verdict: { tone: 'warn', text: '' } };
  if (!n) return { ...empty, advice: [{ tone: 'info', kind: 'info', text: `Drop reading pins where you measured (tap the heat map, or use your GPS position) and type the ${QTY[q].word} your meter shows. Advice appears here.` }], verdict: { tone: 'warn', text: 'No reading pins yet.' } };

  const cold = pts.filter((p) => p.v < T), hotPts = pts.filter((p) => p.v > H);
  const pctOk = (100 * (n - cold.length)) / n;
  const sd = sdev(vals), avg = mean(vals);
  const withPred = pts.filter((p) => p.pred != null);
  const deltas = withPred.map((p) => p.v - p.pred!);
  const meanDelta = deltas.length ? mean(deltas) : null, sdDelta = deltas.length > 1 ? sdev(deltas) : null;
  const uniform: BalanceResult['uniform'] = sd <= nm.tol * 0.75 ? 'good' : sd <= nm.tol * 1.25 ? 'fair' : 'poor';

  // per device
  const ids = [...new Set(pts.map((p) => p.src).filter((x): x is string => !!x))];
  const perSource: SourceStat[] = ids.map((id) => {
    const my = pts.filter((p) => p.src === id), v = my.map((p) => p.v), d = my.filter((p) => p.pred != null).map((p) => p.v - p.pred!);
    return { id, label: name(id), n: my.length, mean: mean(v), min: Math.min(...v), max: Math.max(...v), meanDelta: d.length ? mean(d) : null, cold: my.filter((p) => p.v < T).length, hot: my.filter((p) => p.v > H).length };
  }).sort((a, b) => b.mean - a.mean);
  const ranked = perSource.filter((s) => s.n >= 2);
  const imbalanceDb = ranked.length >= 2 ? ranked[0].mean - ranked[ranked.length - 1].mean : null;
  const fmtV = (db: number) => fmtQ(back(db), q);
  const addTxt = nm.add.replace(/^(a|an) /, 'another ');
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;

  // 1. Code / target share
  const critPts = pts.filter((p) => p.critical), critCold = critPts.filter((p) => p.v < T);
  if (o.system === 'erces' && critPts.length) advice.push(critCold.length ? { tone: 'bad', kind: 'code', text: `${plural(critCold.length, 'critical-area reading')} below ${fmtQ(target, q)}. Critical areas need 99%: fix these first.` } : { tone: 'ok', kind: 'code', text: `Every critical-area reading meets ${fmtQ(target, q)}.` });
  if (q === 'dba' && ['firealarm', 'massnotif'].includes(o.system) && hotPts.some((p) => p.raw > 110)) advice.push({ tone: 'bad', kind: 'code', text: 'Some readings are over 110 dBA, the NFPA 72 maximum. Turn those horns or speakers down, or move them away from where people stand.' });

  // 2. Whole system weaker / stronger than designed: one common cause
  let common = 0;
  if (meanDelta != null && deltas.length >= 3) {
    if (meanDelta <= -6) {
      common = meanDelta;
      const why = q === 'dbm' ? 'a loose or water-filled connector, a bad jumper or cable, the transmitter, BDA or access points turned down, or more wall loss than the plan assumed'
        : q === 'dba' ? 'the amplifier gain or zone level set low, speakers on lower taps than designed, or a shorted or open speaker line' : 'lamps out, dirty lenses, or IR illuminators switched off';
      advice.push({ tone: 'bad', kind: 'model', changeDb: -meanDelta, text: `Readings are about ${Math.round(-meanDelta)} dB below the design almost everywhere. A problem common to the whole system is likely: ${why}. Fix that first; then, if the design is right, everything should come up together.` });
    } else if (meanDelta >= 6) {
      advice.push({ tone: 'warn', kind: 'model', changeDb: -meanDelta, text: `Readings are about ${Math.round(meanDelta)} dB stronger than the design. ${cold.length ? 'There is headroom' : 'You could turn the whole system down'} about ${Math.round(Math.min(meanDelta, Math.max(0, Math.min(...vals) - T)))} dB${q === 'dbm' ? ' (less leaking outside and less interference)' : q === 'dba' ? ' (less echo and less feedback)' : ''}, or calibrate the prediction to match.` });
    } else if (sdDelta != null && sdDelta > 8) {
      advice.push({ tone: 'warn', kind: 'model', text: `On average the readings match the design, but spots differ from it by ±${Math.round(sdDelta)} dB. Walls, doors or furniture are probably different from what the model assumed: check the spots that differ most.` });
    } else advice.push({ tone: 'ok', kind: 'model', text: `Readings match the design within about ${Math.max(1, Math.round(Math.abs(meanDelta)))} dB on average.` });
    // one device weaker than designed while the rest match
    const check = q === 'dbm' ? 'its connector, jumper, coupler or splitter, and its aim' : q === 'dba' ? 'its tap setting and wiring (a reversed or open speaker)' : 'its lamp and aim';
    if (perSource.filter((s) => s.meanDelta != null && s.n >= 2).length >= 2) for (const s of perSource) if (s.meanDelta != null && s.n >= 2 && meanDelta - s.meanDelta >= 6 && s.meanDelta <= -6)
      advice.push({ tone: 'bad', kind: 'device', src: s.id, text: common ? `${s.label} is about ${Math.round(meanDelta - s.meanDelta)} dB weaker again than the rest. Check that one too: ${check}.`
        : `${s.label} is about ${Math.round(-s.meanDelta)} dB weaker than designed while the others are close. Check that one: ${check}.` });
  }

  // 3. Balance between devices
  if (imbalanceDb != null && imbalanceDb > Math.max(6, nm.tol) && !common) {
    const hi = ranked[0], lo = ranked[ranked.length - 1], half = imbalanceDb / 2;
    const canLower = hi.min - half >= T, canRaise = lo.max + half <= H;
    const parts: string[] = [];
    if (canLower) parts.push(`turn ${hi.label} down ${changeText(-half, q, o.system)}`);
    if (canRaise) parts.push(`turn ${lo.label} up ${changeText(half, q, o.system)}`);
    advice.push({ tone: 'warn', kind: 'balance', src: lo.id, changeDb: half, text: `Out of balance: the area of ${hi.label} averages ${fmtV(hi.mean)} and the area of ${lo.label} only ${fmtV(lo.mean)}, ${Math.round(imbalanceDb)} dB apart. ${parts.length ? `To even it out, ${parts.join(' and ')} (${nm.adjust}).` : `Turning either one would push spots out of range, so move ${lo.label} closer to its weak spots, or add ${addTxt}.`}` });
  }

  // 4. Weak areas: turn up, move or add
  const clusters = clusterPoints(cold, Math.max(nm.reachM * 0.6, outdoor ? 150 : 3));
  for (const c of clusters.slice(0, 6)) {
    const s = srcOf(c.src); const stat = perSource.find((x) => x.id === c.src);
    const short = T - c.worst + (q === 'lux' ? 1 : 2);
    const distM = s?.x != null ? Math.hypot(s.x - c.x, s.y! - c.y) : undefined; c.distM = distM;
    const where = s?.x != null ? distM! < 1 ? `right at ${s.label}` : `${len(distM!)} ${dirWord(c.x - s.x, c.y - s.y!, outdoor)} of ${s.label}` : `around the ${plural(c.n, 'weak pin')}`;
    const crit = c.critical ? ' (critical area)' : '';
    const headroom = stat ? H - stat.max : Infinity;
    const label = `${plural(c.n, 'reading')} below ${fmtQ(target, q)}${crit}, ${where}, worst ${fmtV(c.worst)}`;
    if (common) continue; // the common fault comes first
    const cp = pts.filter((p) => c.ids.includes(p.id) && p.pred != null);
    const localGap = cp.length ? mean(cp.map((p) => p.v - p.pred!)) : 0, predOk = cp.length > 0 && mean(cp.map((p) => p.pred!)) >= T;
    if (predOk && localGap <= -6) {
      advice.push({ tone: c.critical ? 'bad' : 'warn', kind: 'device', src: s?.id, text: `${cap(label)}. The heat map expects about ${fmtV(mean(cp.map((p) => p.pred!)))} here, ${Math.round(-localGap)} dB more, so something local is wrong: check ${s ? s.label : `the nearest ${nm.source}`} (${q === 'dbm' ? 'connector, coupler, aim' : q === 'dba' ? 'tap setting, wiring, a blocked or damaged speaker' : 'lamp and aim'}) and look for a wall, door, shelving or ${q === 'dbm' ? 'metal' : 'equipment'} that is not on the plan.` });
      continue;
    }
    if (short <= nm.maxRaise && short <= headroom && s) {
      advice.push({ tone: c.critical ? 'bad' : 'warn', kind: 'raise', src: s.id, changeDb: short, text: `${cap(label)}. Turn ${s.label} up ${changeText(short, q, o.system)} (${nm.adjust}).` });
    } else if (distM != null && distM > nm.reachM) {
      advice.push({ tone: c.critical ? 'bad' : 'warn', kind: 'add', src: s?.id, text: `${cap(label)}. That is past what one ${nm.source} reaches: add ${addTxt} there${q === 'dbm' && o.system !== 'rf' ? ', or use a lower-loss tap or coupler on the way to it' : ''}.` });
    } else if (s && distM != null && distM > 0) {
      const stHot = pts.filter((p) => p.src === s.id && p.v > T + 6);
      const opp = stHot.length ? Math.hypot(mean(stHot.map((p) => p.x)) - c.x, mean(stHot.map((p) => p.y)) - c.y) > distM : false;
      advice.push({ tone: c.critical ? 'bad' : 'warn', kind: 'move', src: s.id, text: `${cap(label)}. Turning ${s.label} up ${Math.round(short)} dB would ${short > headroom ? 'make its loud spots too strong' : 'be more than a small adjustment'}. ${opp ? `Move ${s.label} about ${len(Math.min(distM / 2, nm.reachM / 2))} ${dirWord(c.x - s.x!, c.y - s.y!, outdoor)} toward the weak spots (its other side has plenty to spare)` : `Add ${addTxt} near the weak spots`}.` });
    } else {
      advice.push({ tone: c.critical ? 'bad' : 'warn', kind: 'add', text: `${cap(label)}. Add ${addTxt} nearby, or move the nearest one toward these spots.` });
    }
  }
  if (clusters.length > 6) advice.push({ tone: 'warn', kind: 'coverage', text: `${clusters.length - 6} more weak areas: fix the ones above, measure again, and the list updates.` });

  // 5. Too strong
  const hotBy = new Map<string, typeof pts>(); for (const p of hotPts) { const k = p.src ?? '?'; hotBy.set(k, [...(hotBy.get(k) ?? []), p]); }
  for (const [id, hs] of hotBy) {
    const s = srcOf(id); const st = perSource.find((x) => x.id === id); const over = Math.max(...hs.map((p) => p.v)) - H + 1;
    const lowerOk = !st || st.min - over >= T;
    advice.push({ tone: q === 'dba' && Math.max(...hs.map((p) => p.raw)) > 110 ? 'bad' : 'warn', kind: 'lower', src: s?.id, changeDb: -over,
      text: `Too strong next to ${s?.label ?? `a ${nm.source}`}: up to ${fmtV(Math.max(...hs.map((p) => p.v)))} (limit ${fmtQ(hot, q)}). ${lowerOk ? `Turn it down ${changeText(-over, q, o.system)}.` : `Turning it down would leave its far spots weak, so ${q === 'dbm' ? 'use a lower-gain antenna, aim it away, or move it away from where people stand' : q === 'dba' ? 'aim it away from the loud spot or move it further from where people stand' : 'aim or shield the light'}.`}${q === 'dbm' && (o.system === 'erces' || o.system === 'das') ? ' Strong spots near antennas also leak outside and can trip the BDA.' : ''}` });
  }

  // 6. Outdoor tilt: near versus far from one site
  if (outdoor) for (const st of perSource) {
    const s = srcOf(st.id); if (s?.x == null || st.n < 6) continue;
    const my = pts.filter((p) => p.src === st.id).map((p) => ({ ...p, d: Math.hypot(p.x - s.x!, p.y - s.y!) })).sort((a, b) => a.d - b.d);
    const half = Math.floor(my.length / 2), near = my.slice(0, half), far = my.slice(half);
    const nc = near.filter((p) => p.v < T).length / near.length, fc = far.filter((p) => p.v < T).length / far.length;
    if (fc >= 0.4 && nc <= 0.15) advice.push({ tone: 'warn', kind: 'tilt', src: s.id, text: `${s.label}: far readings (past about ${len(far[0].d)}) are weak while close ones are fine. Reduce the antenna's downtilt about 1°, raise the antenna, or use a higher-gain antenna toward the weak side.` });
    else if (nc >= 0.4 && fc <= 0.15) advice.push({ tone: 'warn', kind: 'tilt', src: s.id, text: `${s.label}: readings close in (within about ${len(near[near.length - 1].d)}) are weak while far ones are fine. The beam is probably passing over them: add about 1° to 2° of downtilt or use an antenna with null fill.` });
  }

  // 7. Evenness
  if (uniform === 'poor' && !common) advice.push({ tone: 'warn', kind: 'uniform', text: `Uneven: readings swing ±${Math.round(sd)} dB from spot to spot (aim for about ±${nm.tol} dB). ${q === 'dba' ? 'More speakers closer together at lower taps gives even sound; in echoey rooms lower taps also keep speech clear.' : q === 'dbm' ? 'More antennas or access points at lower power, closer together, gives even coverage and less leaking.' : 'More fixtures at lower output, aimed to overlap, evens out the light.'}` });
  else if (uniform === 'good' && n >= 3) advice.push({ tone: 'ok', kind: 'uniform', text: `Even: readings stay within about ±${Math.max(1, Math.round(sd))} dB of each other.` });

  if (!cold.length && !hotPts.length) advice.unshift({ tone: 'ok', kind: 'ok', text: `Every reading is between ${fmtQ(target, q)} and ${fmtQ(hot, q)}. ${uniform === 'poor' ? 'Coverage is met; see below to even it out.' : 'Coverage is good and balanced here.'}` });

  const bad = advice.some((a) => a.tone === 'bad') || pctOk < nm.needPct - 10;
  const verdict = { tone: (bad ? 'bad' : advice.some((a) => a.tone === 'warn') || pctOk < nm.needPct ? 'warn' : 'ok') as 'ok' | 'warn' | 'bad',
    text: `${Math.round(pctOk)}% of ${plural(n, 'reading')} meet ${fmtQ(target, q)} (need ${nm.needPct}%). ${cold.length ? `${cold.length} weak` : 'None weak'}, ${hotPts.length ? `${hotPts.length} too strong` : 'none too strong'}; ${uniform === 'good' ? 'even' : uniform === 'fair' ? 'fairly even' : 'uneven'}${imbalanceDb != null ? `, ${Math.round(imbalanceDb)} dB between the strongest and weakest ${nm.source} areas` : ''}.` };
  return { n, qty: q, unit, target, hot, mean: back(avg), min: back(Math.min(...vals)), max: back(Math.max(...vals)), sd, pctOk, cold: cold.map(strip), hotPts: hotPts.map(strip), meanDelta, sdDelta, uniform, perSource: perSource.map((s) => ({ ...s, mean: back(s.mean), min: back(s.min), max: back(s.max) })), imbalanceDb, clusters, advice, verdict };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function strip(p: BPoint & { raw: number }): BPoint { const { raw, ...rest } = p; return { ...rest, v: raw }; }

/** Pins saved on a floor plan or building model (map pins are saved as live signal readings). */
export interface ReadingPin {
  id: string; at: string;
  /** Which heat map: 'indoor' (Indoor Planning), 'wifi' (Wi-Fi survey), 'model:<page>' (2D/3D models, Auto-Design, campus). */
  map: string; system: string; qty: Qty; v: number;
  /** Plan position: metres on the indoor plans, feet on the building models; floor from 0. */
  x: number; y: number; floor?: number;
  note?: string; photo?: string; critical?: boolean;
}

/** Local flat metres (x east, y south) around a reference point, for map readings. */
export function toLocalM(ref: { lat: number; lon: number }, p: { lat: number; lon: number }): { x: number; y: number } {
  return { x: (p.lon - ref.lon) * 111320 * Math.cos((ref.lat * Math.PI) / 180), y: -(p.lat - ref.lat) * 110570 };
}

/** Predicted value at a point of a row-0-north lat/lon grid (nearest cell). NaN outside. */
export function sampleLatLonGrid(g: { n: number; north: number; south: number; east: number; west: number; rssi?: Float32Array; v?: Float32Array }, lat: number, lon: number): number {
  const a = g.rssi ?? g.v; if (!a) return NaN;
  if (lat > g.north || lat < g.south || lon < g.west || lon > g.east) return NaN;
  const r = Math.min(g.n - 1, Math.floor(((g.north - lat) / (g.north - g.south)) * g.n)), c = Math.min(g.n - 1, Math.floor(((lon - g.west) / (g.east - g.west)) * g.n));
  return a[r * g.n + c];
}

/** Shrinks a photo to a small JPEG data URL (default 640 px) so pins do not bloat the project. */
export function shrinkPhoto(file: File, max = 640): Promise<string> {
  return new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onerror = () => rej(new Error('Could not read the photo.'));
    rd.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('That file is not a picture this device can open.'));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72));
      };
      img.src = rd.result as string;
    };
    rd.readAsDataURL(file);
  });
}

/** Colour of a pin by how it compares with the target: red weak, amber close, green good, purple too strong. */
export function pinColor(v: number, target: number, hot: number, q: Qty): string {
  const V = toDb(v, q), T = toDb(target, q), H = toDb(hot, q);
  return V > H ? '#7b1fa2' : V < T ? '#d32f2f' : V < T + 3 ? '#f9a825' : '#2e7d32';
}

/** Sound-level heat map colours (dBA): blue quiet, green good, yellow loud, red too loud. */
export const SPL_SCALE = [
  { min: 100, color: [220, 40, 40], label: '≥ 100 dBA (very loud)' },
  { min: 85, color: [250, 170, 30], label: '85 to 100 dBA (loud)' },
  { min: 70, color: [0, 160, 60], label: '70 to 85 dBA (good for paging and alarms)' },
  { min: 60, color: [120, 200, 40], label: '60 to 70 dBA (quiet)' },
  { min: -999, color: [90, 140, 220], label: '< 60 dBA (too quiet for most uses)' },
] as const;
export function splColor(v: number): [number, number, number, number] {
  if (!Number.isFinite(v) || v < 30) return [0, 0, 0, 0];
  for (const s of SPL_SCALE) if (v >= s.min) return [s.color[0], s.color[1], s.color[2], 150];
  return [0, 0, 0, 0];
}

/** CSV rows for any set of pins. */
export function pinsCsvRows(pins: { at?: string; v: number; pred?: number | null; where: string; note?: string; src?: string; critical?: boolean }[], q: Qty): unknown[][] {
  return [['Time', `Reading (${QTY[q].unit})`, `Predicted (${QTY[q].unit})`, 'Where', 'Served by', 'Critical area', 'Note'],
    ...pins.map((p) => [p.at ?? '', p.v, p.pred != null && Number.isFinite(p.pred) ? r1(p.pred) : '', p.where, p.src ?? '', p.critical ? 'yes' : '', p.note ?? ''])];
}
