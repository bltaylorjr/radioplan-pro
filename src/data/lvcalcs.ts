import { checkValue, defaultRange, Issue } from '../engine/validate';
// Low-voltage calculators, defined as data so they can be shown on the Calculators page and on each
// system's toolkit. Results are planning values; follow the manufacturer, the adopted code and the AHJ.
export interface CalcInput { k: string; label: string; v: number; unit?: string; step?: number; options?: [number, string][];
  /** Allowed range; outside it the calculator says what is wrong and suggests a fix instead of a result. */
  min?: number; max?: number; integer?: boolean;
  /** May be left blank: the calculation skips it (never counts a blank as zero). */
  optional?: boolean }
export interface CalcOut { label: string; value: string; unit?: string; tone?: 'ok' | 'warn' | 'bad' }
/** A project field a calculator result can be written into ("Apply to fields"; always asks first). */
export interface LvApply { id: string; label: string; page: string; path: (string | number)[]; value: unknown; to: string; on?: boolean; /** How the current value reads (default: as stored). */ show?: (v: unknown) => string }
export interface LvCalc { id: string; title: string; group: string; keywords: string; inputs: CalcInput[]; run: (x: Record<string, number>) => CalcOut[]; note?: string;
  /** Optional: the project fields this result can fill in. */
  apply?: (x: Record<string, number>) => LvApply[];
  /** Optional: numbers this calculator can copy from the project when the user presses "Use project values". */
  fromProject?: (p: import('../types').Project) => Record<string, number> }

const r = (x: number, d = 1) => (Number.isFinite(x) ? (Math.round(x * 10 ** d) / 10 ** d).toLocaleString() : '—');
/**
 * Copper DC resistance, ohms per 1000 ft at 75 °C. #18–#10: NEC Chapter 9 Table 8, uncoated solid (the same values the
 * Fire Alarm page and code checks use). #24–#20 are not in Table 8: 20 °C values × 1.216 (copper at 75 °C).
 * Corrected in 1.5.49: earlier versions used 20 °C values here (about 18% low), which under-stated voltage drop.
 */
export const OHM_KFT: Record<number, number> = { 24: 31.2, 22: 19.6, 20: 12.3, 18: 7.77, 16: 4.89, 14: 3.07, 12: 1.93, 10: 1.21 };
const AWG_OPTS: [number, string][] = [24, 22, 20, 18, 16, 14, 12, 10].map((a) => [a, `#${a} AWG`]);
const drop = (a: number, ft: number, awg: number) => (2 * ft * a * (OHM_KFT[awg] ?? 7.77)) / 1000;

export const LV_CALCS: LvCalc[] = [
  { id: 'cable-boxes', title: 'Cable quantity (1000 ft boxes)', group: 'Structured cabling', keywords: 'cat6 drops boxes reel footage takeoff estimate',
    inputs: [{ k: 'drops', label: 'Number of cables (drops)', v: 48 }, { k: 'avg', label: 'Average run length', v: 150, unit: 'ft' }, { k: 'slack', label: 'Slack / service loop', v: 15, unit: 'ft' }, { k: 'waste', label: 'Waste', v: 10, unit: '%' }],
    run: (x) => { const ft = x.drops * (x.avg + x.slack) * (1 + x.waste / 100); const per = Math.max(1, Math.floor(1000 / ((x.avg + x.slack) * (1 + x.waste / 100)))); return [{ label: 'Total cable', value: r(ft, 0), unit: 'ft' }, { label: 'Drops per box', value: String(per) }, { label: 'Boxes to order', value: String(Math.ceil(x.drops / per)) }, { label: 'Longest run check', value: x.avg + x.slack > 295 ? 'Over 90 m: add a TR or use fiber' : 'OK (90 m permanent link)', tone: x.avg + x.slack > 295 ? 'bad' : 'ok' }]; },
    note: 'Ordering by drops per box avoids short leftover pieces. TIA-568: 90 m (295 ft) permanent link, 100 m channel.' },
  { id: 'conduit-fill', title: 'Conduit / sleeve fill', group: 'Structured cabling', keywords: 'pathway fill emt cable count 40% raceway',
    inputs: [{ k: 'id', label: 'Conduit inside diameter', v: 1.049, unit: 'in', step: 0.001 }, { k: 'od', label: 'Cable outside diameter', v: 0.25, unit: 'in', step: 0.01 }, { k: 'pct', label: 'Allowed fill', v: 40, unit: '%' }],
    run: (x) => { const a = Math.PI * (x.id / 2) ** 2, c = Math.PI * (x.od / 2) ** 2; return [{ label: 'Conduit area', value: r(a, 3), unit: 'sq in' }, { label: 'Cables that fit', value: String(Math.floor((a * x.pct) / 100 / c)) }]; },
    note: '40% fill for 3+ cables (NEC Chapter 9 Table 1); TIA-569 design guidance uses 40% for conduit and 50% for trays. 1" EMT ID ≈ 1.049 in, ¾" ≈ 0.824 in.' },
  { id: 'jhook', title: 'J-hook / support count', group: 'Structured cabling', keywords: 'j hook support spacing bridle ring',
    inputs: [{ k: 'ft', label: 'Pathway length', v: 300, unit: 'ft' }, { k: 'sp', label: 'Support spacing', v: 5, unit: 'ft' }],
    run: (x) => [{ label: 'Supports needed', value: String(Math.ceil(x.ft / x.sp) + 1) }],
    note: 'TIA-569 / BICSI: support cabling at no more than 5 ft (1.5 m) intervals; do not exceed the hook\'s cable capacity.' },
  { id: 'fiber-budget', title: 'Fiber link loss budget', group: 'Fiber optics', keywords: 'olts power meter loss budget splice connector attenuation certification',
    inputs: [{ k: 'km', label: 'Length', v: 0.3, unit: 'km', step: 0.01 }, { k: 'att', label: 'Fiber attenuation', v: 3.5, unit: 'dB/km', step: 0.1 }, { k: 'pairs', label: 'Mated connector pairs', v: 2 }, { k: 'splices', label: 'Splices', v: 0 }, { k: 'meas', label: 'Measured loss (optional)', v: 0, unit: 'dB', step: 0.01 }],
    run: (x) => { const b = x.km * x.att + x.pairs * 0.75 + x.splices * 0.3; const out: CalcOut[] = [{ label: 'Allowed loss (TIA-568.3-D)', value: r(b, 2), unit: 'dB' }]; if (x.meas > 0) out.push({ label: 'Result', value: x.meas <= b ? 'PASS' : 'FAIL', tone: x.meas <= b ? 'ok' : 'bad' }); return out; },
    note: 'Max cabled-fiber attenuation: multimode 3.5 dB/km @850 nm, 1.5 @1300; single-mode 1.0 dB/km inside plant, 0.5 outside plant. 0.75 dB per mated pair, 0.3 dB per splice.' },
  { id: 'fiber-reach', title: 'Optic power budget (transceiver)', group: 'Fiber optics', keywords: 'sfp transceiver tx power rx sensitivity margin',
    inputs: [{ k: 'tx', label: 'Transmitter minimum power', v: -7.3, unit: 'dBm', step: 0.1 }, { k: 'rx', label: 'Receiver sensitivity', v: -11.1, unit: 'dBm', step: 0.1 }, { k: 'loss', label: 'Link loss', v: 2, unit: 'dB', step: 0.1 }],
    run: (x) => { const m = x.tx - x.loss - x.rx; return [{ label: 'Power budget', value: r(x.tx - x.rx, 1), unit: 'dB' }, { label: 'Margin', value: r(m, 1), unit: 'dB', tone: m >= 3 ? 'ok' : m >= 0 ? 'warn' : 'bad' }]; },
    note: 'Keep at least 3 dB margin for aging and repairs. Defaults are typical 10GBASE-SR values; use the transceiver datasheet.' },
  { id: 'fa-battery', title: 'Standby battery (fire alarm, security, nurse call)', group: 'Power', keywords: 'battery ah standby alarm 24 hour nfpa 72 ul secondary power',
    inputs: [{ k: 'sb', label: 'Total standby current', v: 0.45, unit: 'A', step: 0.01 }, { k: 'al', label: 'Total alarm current', v: 2.2, unit: 'A', step: 0.01 }, { k: 'h', label: 'Standby time', v: 24, unit: 'h' }, { k: 'm', label: 'Alarm time', v: 5, unit: 'min' }, { k: 'sf', label: 'Safety factor', v: 20, unit: '%' }],
    run: (x) => { const ah = (x.sb * x.h + (x.al * x.m) / 60) * (1 + x.sf / 100); const std = [7, 12, 18, 26, 33, 40, 55, 75, 100].find((s) => s >= ah) ?? Math.ceil(ah); return [{ label: 'Required capacity', value: r(ah, 1), unit: 'Ah' }, { label: 'Next standard size', value: String(std), unit: 'Ah' }]; },
    note: 'Fire alarm: 24 h standby + 5 min alarm (15 min for emergency voice/alarm communications), NFPA 72. Intrusion and other systems follow their UL standard or the spec.',
    apply: (x) => { const ah = (x.sb * x.h + (x.al * x.m) / 60) * (1 + x.sf / 100), std = [7, 12, 18, 26, 33, 40, 55, 75, 100].find((v) => v >= ah) ?? Math.ceil(ah); return [
      { id: 'fa-h', label: 'Standby time', page: 'Fire Alarm & Batteries', path: ['alarm', 'standbyHours'], value: x.h, to: `${x.h} h`, show: (v) => `${v} h` },
      { id: 'fa-m', label: 'Alarm time', page: 'Fire Alarm & Batteries', path: ['alarm', 'alarmMinutes'], value: x.m, to: `${x.m} min`, show: (v) => `${v} min` },
      { id: 'fa-sf', label: 'Safety factor', page: 'Fire Alarm & Batteries', path: ['alarm', 'safetyFactor'], value: 1 + x.sf / 100, to: `${x.sf} %`, show: (v) => `${Math.round((Number(v) - 1) * 100)} %` },
      { id: 'fa-ah', label: 'Installed battery', page: 'Fire Alarm & Batteries', path: ['alarm', 'installedBatteryAh'], value: std, to: `${std} Ah (next standard size)`, on: false, show: (v) => `${v} Ah` },
    ]; },
    fromProject: (p) => ({ sb: Math.round(p.alarm.devices.reduce((t, d) => t + d.qty * d.standbyMa, 0)) / 1000, al: Math.round(p.alarm.devices.reduce((t, d) => t + d.qty * d.alarmMa, 0)) / 1000, h: p.alarm.standbyHours, m: p.alarm.alarmMinutes, sf: Math.round((p.alarm.safetyFactor - 1) * 100) }) },
  { id: 'lv-drop', title: 'Low-voltage wire drop (locks, NAC, cameras, call stations)', group: 'Power', keywords: 'voltage drop 12v 24v lock strike maglock nac wire gauge',
    inputs: [{ k: 'v', label: 'Supply voltage', v: 24, unit: 'V' }, { k: 'a', label: 'Load current', v: 1.5, unit: 'A', step: 0.01 }, { k: 'ft', label: 'One-way length', v: 200, unit: 'ft' }, { k: 'awg', label: 'Wire size', v: 18, options: AWG_OPTS }, { k: 'min', label: 'Device minimum voltage', v: 16, unit: 'V' }],
    run: (x) => { const d = drop(x.a, x.ft, x.awg), end = x.v - d; return [{ label: 'Voltage drop', value: r(d, 2), unit: 'V' }, { label: 'Voltage at device', value: r(end, 2), unit: 'V', tone: end >= x.min ? 'ok' : 'bad' }, { label: 'Drop', value: r((d / x.v) * 100, 1), unit: '%' }]; },
    note: 'Copper DC resistance from NEC Chapter 9 Table 8 at 75 °C, both conductors counted. Use the panel\'s starting voltage (often 20.4 V for battery end-of-life on a 24 V system).',
    apply: (x) => [
      { id: 'nac-a', label: 'NAC load current', page: 'Fire Alarm & Batteries', path: ['alarm', 'nacLoadA'], value: x.a, to: `${x.a} A`, show: (v) => `${v} A` },
      { id: 'nac-ft', label: 'NAC one-way length', page: 'Fire Alarm & Batteries', path: ['alarm', 'nacOneWayFt'], value: x.ft, to: `${x.ft} ft`, show: (v) => `${v} ft` },
      { id: 'nac-awg', label: 'NAC wire size', page: 'Fire Alarm & Batteries', path: ['alarm', 'nacAwg'], value: String(x.awg), to: `#${x.awg} AWG`, show: (v) => `#${v} AWG` },
      { id: 'nac-min', label: 'Device minimum voltage', page: 'Fire Alarm & Batteries', path: ['alarm', 'minDeviceV'], value: x.min, to: `${x.min} V`, show: (v) => `${v} V` },
    ],
    fromProject: (p) => ({ a: p.alarm.nacLoadA, ft: p.alarm.nacOneWayFt, awg: Number(p.alarm.nacAwg) || 14, min: p.alarm.minDeviceV }) },
  { id: 'psu', title: 'Power supply sizing', group: 'Power', keywords: 'power supply amps locks cameras headroom',
    inputs: [{ k: 'n', label: 'Devices', v: 8 }, { k: 'ma', label: 'Current per device', v: 450, unit: 'mA' }, { k: 'head', label: 'Headroom', v: 25, unit: '%' }],
    run: (x) => { const a = (x.n * x.ma) / 1000; return [{ label: 'Load', value: r(a, 2), unit: 'A' }, { label: 'Supply rating at least', value: r(a * (1 + x.head / 100), 2), unit: 'A' }]; },
    note: 'Keep 20–25% spare capacity. Maglocks draw steady current; strikes draw inrush; check fail-safe vs fail-secure.' },
  { id: 'poe-budget', title: 'PoE switch budget', group: 'Network', keywords: 'poe budget switch watts cameras access points',
    inputs: [{ k: 'n', label: 'Powered devices', v: 16 }, { k: 'w', label: 'Watts per device (class max)', v: 15.4, unit: 'W', step: 0.1 }, { k: 'sw', label: 'Switch PoE budget', v: 370, unit: 'W' }],
    run: (x) => { const t = x.n * x.w; return [{ label: 'Total PoE draw', value: r(t, 1), unit: 'W' }, { label: 'Budget used', value: r((t / x.sw) * 100, 0), unit: '%', tone: t <= x.sw * 0.8 ? 'ok' : t <= x.sw ? 'warn' : 'bad' }]; },
    note: 'Class power at the switch: Class 3 = 15.4 W, Class 4 = 30 W, Class 6 = 60 W, Class 8 = 90 W (IEEE 802.3af/at/bt). Plan to about 80% of the budget.' },
  { id: 'cctv-storage', title: 'Video storage (NVR)', group: 'CCTV', keywords: 'nvr storage retention days bitrate terabytes h.265',
    inputs: [{ k: 'cams', label: 'Cameras', v: 16 }, { k: 'mbps', label: 'Bitrate per camera', v: 4, unit: 'Mb/s', step: 0.1 }, { k: 'hours', label: 'Recording hours per day', v: 24, unit: 'h' }, { k: 'days', label: 'Retention', v: 30, unit: 'days' }, { k: 'motion', label: 'Motion-only share', v: 100, unit: '%' }],
    run: (x) => { const tb = (x.cams * x.mbps * 3600 * x.hours * x.days * (x.motion / 100)) / 8 / 1e6; return [{ label: 'Storage needed', value: r(tb, 2), unit: 'TB' }, { label: 'With 20% spare', value: r(tb * 1.2, 2), unit: 'TB' }, { label: 'Network load', value: r(x.cams * x.mbps, 0), unit: 'Mb/s' }]; },
    note: 'Typical H.265 bitrates: 1080p ≈ 2 Mb/s, 4 MP ≈ 3–4 Mb/s, 4K ≈ 6–8 Mb/s at 15 fps. Use the camera maker\'s calculator for the exact scene.' },
  { id: 'cctv-ppf', title: 'Camera field of view & pixel density', group: 'CCTV', keywords: 'lens focal length fov pixels per foot identify recognize observe detect',
    inputs: [{ k: 'hres', label: 'Horizontal resolution', v: 2560, unit: 'px' }, { k: 'fov', label: 'Horizontal field of view', v: 90, unit: '°' }, { k: 'd', label: 'Distance to target', v: 30, unit: 'ft' }],
    run: (x) => { const w = 2 * x.d * Math.tan((x.fov * Math.PI) / 360), ppm = x.hres / (w * 0.3048); const lvl = ppm >= 250 ? 'Identify' : ppm >= 125 ? 'Recognize' : ppm >= 62 ? 'Observe' : ppm >= 25 ? 'Detect' : 'Monitor only';
      return [{ label: 'Scene width', value: r(w, 1), unit: 'ft' }, { label: 'Pixel density', value: `${r(x.hres / w, 0)} px/ft (${r(ppm, 0)} px/m)` }, { label: 'Level (IEC 62676-4)', value: lvl, tone: ppm >= 125 ? 'ok' : ppm >= 62 ? 'warn' : 'bad' }]; },
    note: 'IEC 62676-4 guide values: identify 250 px/m, recognize 125, observe 62, detect 25, monitor 12.' },
  { id: 'spl', title: 'Speaker sound level at a distance', group: 'Paging, sound & mass notification', keywords: 'spl speaker sensitivity tap watts db distance intelligibility',
    inputs: [{ k: 'sens', label: 'Speaker sensitivity (1 W / 1 m)', v: 90, unit: 'dB' }, { k: 'w', label: 'Tap power', v: 1, unit: 'W', step: 0.125 }, { k: 'd', label: 'Distance', v: 10, unit: 'ft' }, { k: 'amb', label: 'Ambient noise', v: 55, unit: 'dBA' }],
    run: (x) => { const spl = x.sens + 10 * Math.log10(x.w) - 20 * Math.log10(Math.max(0.1, x.d * 0.3048)); return [{ label: 'Sound level at listener', value: r(spl, 1), unit: 'dB' }, { label: 'Above ambient', value: r(spl - x.amb, 1), unit: 'dB', tone: spl - x.amb >= 15 ? 'ok' : spl - x.amb >= 10 ? 'warn' : 'bad' }]; },
    note: 'Inverse-square law, free field. Paging is usually designed for 10–15 dB above ambient; fire alarm public mode needs 15 dB above average ambient (NFPA 72 Ch. 18). Check intelligibility (STI) for voice evacuation.' },
  { id: 'line70', title: '70 V / 25 V speaker line', group: 'Paging, sound & mass notification', keywords: '70v 100v constant voltage amplifier taps line loss gauge',
    inputs: [{ k: 'taps', label: 'Total of speaker taps', v: 60, unit: 'W' }, { k: 'amp', label: 'Amplifier rating', v: 120, unit: 'W' }, { k: 'v', label: 'Line voltage', v: 70.7, options: [[70.7, '70 V'], [25, '25 V'], [100, '100 V']] }, { k: 'ft', label: 'One-way length', v: 500, unit: 'ft' }, { k: 'awg', label: 'Wire size', v: 16, options: AWG_OPTS }],
    run: (x) => { const zl = (x.v * x.v) / x.taps, rl = (2 * x.ft * (OHM_KFT[x.awg] ?? 4)) / 1000, loss = 20 * Math.log10(zl / (zl + rl)) * -1; const pct = (1 - (zl / (zl + rl)) ** 2) * 100;
      return [{ label: 'Amplifier load', value: r((x.taps / x.amp) * 100, 0), unit: '%', tone: x.taps <= x.amp * 0.8 ? 'ok' : x.taps <= x.amp ? 'warn' : 'bad' }, { label: 'Load impedance', value: r(zl, 1), unit: 'Ω' }, { label: 'Line loss', value: `${r(loss, 2)} dB (${r(pct, 1)}% power)`, tone: loss <= 0.5 ? 'ok' : loss <= 1 ? 'warn' : 'bad' }]; },
    note: 'Keep total taps at or below 80% of the amplifier rating, and line loss under 0.5 dB (about 10% power).' },
  { id: 'spk-spacing', title: 'Ceiling speaker spacing', group: 'Paging, sound & mass notification', keywords: 'ceiling speaker coverage spacing dispersion layout',
    inputs: [{ k: 'ceil', label: 'Ceiling height', v: 10, unit: 'ft' }, { k: 'ear', label: 'Ear height', v: 5, unit: 'ft' }, { k: 'disp', label: 'Speaker dispersion angle', v: 90, unit: '°' }, { k: 'area', label: 'Room area', v: 5000, unit: 'sq ft' }],
    run: (x) => { const rad = (x.ceil - x.ear) * Math.tan((x.disp * Math.PI) / 360), e = 2 * rad, o = rad * Math.SQRT2;
      return [{ label: 'Coverage radius at ear height', value: r(rad, 1), unit: 'ft' }, { label: 'Edge-to-edge spacing (paging, music)', value: r(e, 1), unit: 'ft' }, { label: 'Speakers, edge-to-edge', value: String(Math.ceil(x.area / (e * e))) }, { label: 'Minimum-overlap spacing (voice evacuation)', value: r(o, 1), unit: 'ft' }, { label: 'Speakers, minimum overlap', value: String(Math.ceil(x.area / (o * o))) }]; },
    note: 'Square grid. Edge-to-edge leaves small gaps at the corners; minimum overlap covers every point and suits voice evacuation and noisy rooms. Use the speaker\'s dispersion at 2 kHz.' },
  { id: 'amp-size', title: 'Amplifier sizing (70 V / 100 V)', group: 'Paging, sound & mass notification', keywords: 'amplifier size watts headroom taps speakers zones channel',
    inputs: [{ k: 'n', label: 'Speakers', v: 40 }, { k: 'tap', label: 'Tap per speaker', v: 1, unit: 'W', step: 0.25 }, { k: 'head', label: 'Headroom', v: 25, unit: '%' }, { k: 'zones', label: 'Zones', v: 2 }],
    run: (x) => { const load = x.n * x.tap, need = load * (1 + x.head / 100), sizes = [35, 60, 120, 250, 500, 1000], per = need / Math.max(1, x.zones), pick = sizes.find((s) => s >= per);
      return [{ label: 'Total speaker taps', value: r(load, 1), unit: 'W' }, { label: 'Amplifier power needed', value: r(need, 0), unit: 'W' }, { label: 'Per zone', value: r(per, 0), unit: 'W' }, { label: 'Suggested amplifier per zone', value: pick ? `${pick} W` : `${Math.ceil(per / 500)} × 500 W`, tone: pick ? 'ok' : 'warn' }]; },
    note: 'Size the amplifier at least 20–25% above the total taps so it is not driven into clipping. For fire alarm voice evacuation, also follow the panel listing and NFPA 72 survivability.' },
  { id: 'spk-wire', title: 'Speaker wire: longest run for a given loss', group: 'Paging, sound & mass notification', keywords: 'speaker wire gauge length 70v 8 ohm loss awg run distance',
    inputs: [{ k: 'taps', label: 'Load on the line (total taps)', v: 60, unit: 'W' }, { k: 'v', label: 'Line', v: 70.7, options: [[70.7, '70 V'], [100, '100 V'], [25, '25 V'], [0, '8 Ω speaker (low impedance)'], [-4, '4 Ω speaker (low impedance)']] }, { k: 'loss', label: 'Allowed loss', v: 0.5, unit: 'dB', step: 0.1 }],
    run: (x) => { const zl = x.v > 0 ? (x.v * x.v) / Math.max(0.1, x.taps) : x.v === 0 ? 8 : 4; const rmax = zl * (10 ** (x.loss / 20) - 1);
      return [{ label: 'Load impedance', value: r(zl, 1), unit: 'Ω' }, ...[18, 16, 14, 12, 10].map((a) => ({ label: `#${a} AWG, longest one-way run`, value: r((rmax * 1000) / (2 * OHM_KFT[a]), 0), unit: 'ft' }))]; },
    note: '0.5 dB (about 10% power) is the usual design limit. Low-impedance (8 Ω / 4 Ω) speakers are only practical on short runs; use 70 V or 100 V for long ones. Use plenum or riser rated cable as the space requires (NEC 640 / 725 / 760 for fire alarm).' },
  { id: 'rt60', title: 'Room reverberation time (RT60)', group: 'Paging, sound & mass notification', keywords: 'rt60 reverberation sabine echo room acoustics absorption gym church',
    inputs: [{ k: 'l', label: 'Room length', v: 100, unit: 'ft' }, { k: 'w', label: 'Room width', v: 80, unit: 'ft' }, { k: 'h', label: 'Ceiling height', v: 24, unit: 'ft' }, { k: 'a', label: 'Average absorption', v: 0.1, step: 0.01, options: [[0.05, 'Very hard (gym, concrete, glass)'], [0.1, 'Hard (block walls, hard floor)'], [0.2, 'Average (some carpet, acoustic tile)'], [0.3, 'Soft (carpet + acoustic ceiling + seats)'], [0.45, 'Very soft (treated room)']] }],
    run: (x) => { const V = x.l * x.w * x.h, S = 2 * (x.l * x.w + x.l * x.h + x.w * x.h), t = (0.049 * V) / (S * x.a);
      return [{ label: 'Room volume', value: r(V, 0), unit: 'ft³' }, { label: 'Surface area', value: r(S, 0), unit: 'ft²' }, { label: 'RT60 (Sabine)', value: r(t, 2), unit: 's', tone: t <= 1 ? 'ok' : t <= 1.8 ? 'warn' : 'bad' }, { label: 'For speech', value: t <= 1 ? 'Good' : t <= 1.8 ? 'Fair: use more, closer, directional speakers' : 'Poor: add absorption or use many close speakers', tone: t <= 1 ? 'ok' : t <= 1.8 ? 'warn' : 'bad' }]; },
    note: 'Sabine formula, imperial units: RT60 = 0.049 × V ÷ (S × average absorption). Use it to see whether a room will be hard to make intelligible before you pick speakers.' },
  { id: 'sti', title: 'Speech intelligibility estimate (STI / %ALcons)', group: 'Paging, sound & mass notification', keywords: 'sti intelligibility alcons voice evacuation critical distance nfpa 72 cis peutz',
    inputs: [{ k: 'd', label: 'Listener distance from nearest speaker', v: 20, unit: 'ft' }, { k: 't', label: 'RT60', v: 1.2, unit: 's', step: 0.1 }, { k: 'v', label: 'Room volume', v: 190000, unit: 'ft³' }, { k: 'q', label: 'Speaker directivity (Q)', v: 5, options: [[2, 'Wall / surface speaker (Q 2)'], [5, 'Ceiling speaker (Q 5)'], [10, 'Horn (Q 10)'], [20, 'Long-throw horn / column (Q 20)']] }, { k: 'n', label: 'Speakers heard at once', v: 2 }],
    run: (x) => { const dm = x.d * 0.3048, vm = x.v * 0.0283168, dc = 0.057 * Math.sqrt((x.q * vm) / Math.max(0.1, x.t)), al = Math.max(0.5, Math.min(100, dm > 3.16 * dc ? 9 * x.t : (200 * dm * dm * x.t * x.t * Math.max(1, x.n)) / (vm * x.q))), sti = Math.max(0, Math.min(1, -0.1845 * Math.log(al) + 0.9482));
      return [{ label: '%ALcons (Peutz)', value: r(al, 1), unit: '%', tone: al <= 10 ? 'ok' : al <= 15 ? 'warn' : 'bad' }, { label: 'Estimated STI', value: r(sti, 2), tone: sti >= 0.5 ? 'ok' : sti >= 0.45 ? 'warn' : 'bad' }, { label: 'Critical distance', value: r(dc / 0.3048, 1), unit: 'ft' }, { label: 'Listener is', value: x.d <= dc / 0.3048 ? 'inside critical distance (direct sound dominates)' : 'beyond critical distance: add speakers closer to listeners', tone: x.d <= dc / 0.3048 ? 'ok' : 'warn' }]; },
    note: 'A planning estimate (Peutz %ALcons, converted to STI) that assumes no background noise; beyond about 3 × the critical distance %ALcons is taken as 9 × RT60. NFPA 72 voice systems are commonly designed to STI 0.50 or more (CIS 0.70) in each acoustically distinguishable space; confirm by measurement with an STIPA meter, and confirm requirements with the AHJ.' },
  { id: 'horn-range', title: 'Outdoor horn / mass notification reach', group: 'Paging, sound & mass notification', keywords: 'outdoor horn siren mass notification range distance giant voice campus',
    inputs: [{ k: 'spl', label: 'Horn output at 1 m (rated)', v: 120, unit: 'dB' }, { k: 'amb', label: 'Outdoor ambient noise', v: 60, unit: 'dBA' }, { k: 'over', label: 'Needed above ambient', v: 10, unit: 'dB' }],
    run: (x) => { const target = x.amb + x.over, at = (dft: number) => x.spl - 20 * Math.log10(Math.max(1, dft * 0.3048)) - 0.003 * dft; let d = 3.28; while (d < 50000 && at(d) > target) d *= 1.01;
      return [{ label: 'Level needed at the listener', value: r(target, 0), unit: 'dB' }, { label: 'Usable reach', value: r(d, 0), unit: 'ft' }, { label: 'Level at 100 ft', value: r(at(100), 1), unit: 'dB' }, { label: 'Level at 500 ft', value: r(at(500), 1), unit: 'dB' }]; },
    note: 'Inverse-square loss plus about 1 dB per 100 m of air absorption (speech band). Wind, buildings, trees and terrain reduce reach; UFC 4-021-01 and NFPA 72 Ch. 24 call for voice intelligibility, not only loudness. Verify with a site test.' },
  { id: 'db-sum', title: 'Adding sound levels and distance changes', group: 'Paging, sound & mass notification', keywords: 'decibel add sum two speakers inverse square db distance double',
    inputs: [{ k: 'a', label: 'Level 1', v: 85, unit: 'dB' }, { k: 'b', label: 'Level 2', v: 85, unit: 'dB' }, { k: 'c', label: 'Level 3 (0 = none)', v: 0, unit: 'dB' }, { k: 'd1', label: 'Measured at', v: 10, unit: 'ft' }, { k: 'd2', label: 'New distance', v: 40, unit: 'ft' }],
    run: (x) => { const sum = 10 * Math.log10([x.a, x.b, x.c].filter((v) => v > 0).reduce((s, v) => s + 10 ** (v / 10), 0)); const ch = -20 * Math.log10(Math.max(0.01, x.d2) / Math.max(0.01, x.d1));
      return [{ label: 'Combined level', value: r(sum, 1), unit: 'dB' }, { label: 'Change from distance', value: r(ch, 1), unit: 'dB' }, { label: 'Level 1 at the new distance', value: r(x.a + ch, 1), unit: 'dB' }]; },
    note: 'Two equal sources add 3 dB; doubling the distance loses about 6 dB outdoors (less indoors, where reflections add up).' },
  { id: 'spk-delay', title: 'Delay for fill / under-balcony speakers', group: 'Paging, sound & mass notification', keywords: 'delay ms dsp fill speaker under balcony time align haas',
    inputs: [{ k: 'main', label: 'Main speaker to listener', v: 90, unit: 'ft' }, { k: 'fill', label: 'Fill speaker to listener', v: 20, unit: 'ft' }, { k: 'haas', label: 'Extra precedence delay', v: 10, unit: 'ms' }, { k: 'temp', label: 'Air temperature', v: 70, unit: '°F' }],
    run: (x) => { const c = 1052 + 1.1 * x.temp, base = ((x.main - x.fill) / c) * 1000;
      return [{ label: 'Speed of sound', value: r(c, 0), unit: 'ft/s' }, { label: 'Path difference delay', value: r(base, 1), unit: 'ms' }, { label: 'Set the fill speaker DSP delay to', value: r(Math.max(0, base + x.haas), 1), unit: 'ms' }]; },
    note: 'The extra 5–15 ms keeps the sound seeming to come from the main speakers (precedence effect). Fine-tune by ear or with a measurement system.' },
  { id: 'lo-z', title: 'Low-impedance speaker load (series / parallel)', group: 'Paging, sound & mass notification', keywords: 'ohm impedance series parallel 8 ohm 4 ohm amplifier load speakers',
    inputs: [{ k: 'z', label: 'Speaker impedance', v: 8, unit: 'Ω', options: [[4, '4 Ω'], [8, '8 Ω'], [16, '16 Ω']] }, { k: 'n', label: 'Speakers on the channel', v: 4 }, { k: 'how', label: 'Wired', v: 2, options: [[1, 'All in parallel'], [2, 'All in series'], [3, 'Series-parallel (pairs in series, pairs in parallel)']] }, { k: 'min', label: 'Amplifier minimum load', v: 4, unit: 'Ω' }],
    run: (x) => { const z = x.how === 1 ? x.z / x.n : x.how === 2 ? x.z * x.n : (x.z * 2) / Math.max(1, Math.floor(x.n / 2));
      return [{ label: 'Load on the amplifier', value: r(z, 2), unit: 'Ω', tone: z >= x.min ? 'ok' : 'bad' }, { label: 'Result', value: z >= x.min ? 'Safe for this amplifier' : 'Below the amplifier minimum: rewire or use a 70 V system', tone: z >= x.min ? 'ok' : 'bad' }]; },
    note: 'Series-parallel needs an even number of identical speakers. With many speakers, a 70 V / 100 V system is easier and safer.' },
  { id: 'audio-level', title: 'Audio level converter (dBu, dBV, volts, watts)', group: 'Paging, sound & mass notification', keywords: 'dbu dbv volts line level mic level watts ohms convert',
    inputs: [{ k: 'v', label: 'Voltage (RMS)', v: 1.228, unit: 'V', step: 0.001 }, { k: 'ohm', label: 'Load (for watts)', v: 8, unit: 'Ω' }],
    run: (x) => { const v = Math.max(1e-9, x.v); return [{ label: 'dBu', value: r(20 * Math.log10(v / 0.7746), 2) }, { label: 'dBV', value: r(20 * Math.log10(v), 2) }, { label: 'Power into the load', value: r((v * v) / Math.max(0.01, x.ohm), 3), unit: 'W' }]; },
    note: 'Pro line level is +4 dBu (1.228 V); consumer line level is −10 dBV (0.316 V). Mic level is roughly −60 to −40 dBu.' },
  { id: 'access-lock', title: 'Door lock power', group: 'Access control', keywords: 'maglock strike door lock current supply fail safe',
    inputs: [{ k: 'mag', label: 'Maglocks', v: 4 }, { k: 'magma', label: 'Maglock current each', v: 500, unit: 'mA' }, { k: 'str', label: 'Electric strikes', v: 6 }, { k: 'strma', label: 'Strike current each', v: 450, unit: 'mA' }, { k: 'rdr', label: 'Readers', v: 10 }, { k: 'rdrma', label: 'Reader current each', v: 120, unit: 'mA' }],
    run: (x) => { const a = (x.mag * x.magma + x.str * x.strma + x.rdr * x.rdrma) / 1000; return [{ label: 'Total load (all energized)', value: r(a, 2), unit: 'A' }, { label: 'Supply at 25% headroom', value: r(a * 1.25, 2), unit: 'A' }, { label: 'Fire alarm release needed', value: x.mag > 0 ? 'Yes: maglocks must release on fire alarm (NFPA 101 / IBC 1010)' : 'Check local rules', tone: x.mag > 0 ? 'warn' : undefined }]; },
    note: 'Typical 12 V values; use the hardware datasheet. Fail-safe locks on egress doors need fire alarm release and a listed release method.' },
  { id: 'nc-coverage', title: 'Nurse call / intercom stations', group: 'Nurse call & intercom', keywords: 'nurse call station dome light pull cord count',
    inputs: [{ k: 'rooms', label: 'Patient rooms', v: 30 }, { k: 'beds', label: 'Beds per room', v: 1 }, { k: 'baths', label: 'Toilet / bathing rooms', v: 30 }, { k: 'staff', label: 'Staff / duty stations', v: 2 }],
    run: (x) => [{ label: 'Patient stations', value: String(x.rooms * x.beds) }, { label: 'Pull-cord (emergency) stations', value: String(x.baths) }, { label: 'Dome lights (one per room)', value: String(x.rooms + x.baths) }, { label: 'Staff / duty stations', value: String(x.staff) }],
    note: 'Quantity starting point only. Station types and locations follow the FGI Guidelines for the facility type and UL 1069 listing.' },
  { id: 'callbox', title: 'Emergency call box solar & battery', group: 'Emergency call boxes', keywords: 'call box solar autonomy battery cellular blue light',
    inputs: [{ k: 'sbma', label: 'Standby current', v: 60, unit: 'mA' }, { k: 'calls', label: 'Calls per day', v: 4 }, { k: 'callma', label: 'Current during a call', v: 1500, unit: 'mA' }, { k: 'min', label: 'Minutes per call', v: 5, unit: 'min' }, { k: 'light', label: 'Blue light hours per day', v: 12, unit: 'h' }, { k: 'lightma', label: 'Light current', v: 150, unit: 'mA' }, { k: 'days', label: 'Days without sun', v: 5 }, { k: 'psh', label: 'Peak sun hours (winter)', v: 3.5, unit: 'h', step: 0.1 }],
    run: (x) => { const ah = (x.sbma * 24 + (x.calls * x.min / 60) * x.callma + x.light * x.lightma) / 1000; const bank = ah * x.days / 0.5; const pv = (ah * 12 * 1.3) / x.psh;
      return [{ label: 'Daily use (12 V)', value: r(ah, 2), unit: 'Ah/day' }, { label: 'Battery (50% depth)', value: r(bank, 0), unit: 'Ah' }, { label: 'Solar panel', value: r(pv, 0), unit: 'W' }]; },
    note: '12 V system, 30% charging losses. Check the cellular signal at the pole and the box maker\'s sizing for the exact model.' },
  { id: 'pm-hours', title: 'Service / PM contract labor', group: 'Service & maintenance', keywords: 'preventative maintenance contract price hours devices annual inspection',
    inputs: [{ k: 'dev', label: 'Devices to test', v: 250 }, { k: 'min', label: 'Minutes per device', v: 3, unit: 'min' }, { k: 'panel', label: 'Panels / head-ends', v: 2 }, { k: 'ph', label: 'Hours per panel', v: 2, unit: 'h' }, { k: 'visits', label: 'Visits per year', v: 2 }, { k: 'rate', label: 'Labor rate', v: 95, unit: '$/h' }, { k: 'travel', label: 'Travel per visit', v: 1, unit: 'h' }],
    run: (x) => { const per = (x.dev * x.min) / 60 + x.panel * x.ph + x.travel; const yr = per * x.visits; return [{ label: 'Hours per visit', value: r(per, 1), unit: 'h' }, { label: 'Hours per year', value: r(yr, 1), unit: 'h' }, { label: 'Labor per year', value: `$${r(yr * x.rate, 0)}` }]; },
    note: 'Labor only; add parts, batteries due for replacement, monitoring and reporting time.' },
  { id: 'design-hours', title: 'Design services estimate', group: 'Design services', keywords: 'design hours drawings fee estimate engineering',
    inputs: [{ k: 'sqft', label: 'Building area', v: 50000, unit: 'sq ft' }, { k: 'sys', label: 'Systems designed', v: 3 }, { k: 'rate', label: 'Hours per 10,000 sq ft per system', v: 6, unit: 'h', step: 0.5 }, { k: 'fixed', label: 'Fixed hours (meetings, submittals)', v: 12, unit: 'h' }, { k: 'usd', label: 'Rate', v: 125, unit: '$/h' }],
    run: (x) => { const h = (x.sqft / 10000) * x.sys * x.rate + x.fixed; return [{ label: 'Design hours', value: r(h, 0), unit: 'h' }, { label: 'Fee', value: `$${r(h * x.usd, 0)}` }]; },
    note: 'Your own rates go here. Add PE review and stamping where the AHJ requires it.' },
];

// ---- Input checks (1.5.49) ----
// Allowed ranges by calculator.input. Wide enough for any real job; outside them the entry is almost surely a typo
// or a unit mix-up. Counts are whole numbers. Anything not listed falls back to the unit's usual range.
const RANGES: Record<string, Partial<CalcInput>> = {
  'cable-boxes.drops': { min: 1, max: 100000, integer: true }, 'cable-boxes.avg': { min: 1, max: 1000 }, 'cable-boxes.slack': { min: 0, max: 100 }, 'cable-boxes.waste': { min: 0, max: 50 },
  'conduit-fill.id': { min: 0.1, max: 12 }, 'conduit-fill.od': { min: 0.01, max: 6 }, 'conduit-fill.pct': { min: 1, max: 100 },
  'jhook.ft': { min: 0, max: 100000 }, 'jhook.sp': { min: 0.5, max: 20 },
  'fiber-budget.km': { min: 0, max: 200 }, 'fiber-budget.att': { min: 0.1, max: 10 }, 'fiber-budget.pairs': { min: 0, max: 50, integer: true }, 'fiber-budget.splices': { min: 0, max: 500, integer: true }, 'fiber-budget.meas': { min: 0, max: 100, optional: true },
  'fiber-reach.tx': { min: -40, max: 20 }, 'fiber-reach.rx': { min: -50, max: 10 }, 'fiber-reach.loss': { min: 0, max: 60 },
  'fa-battery.sb': { min: 0, max: 50 }, 'fa-battery.al': { min: 0, max: 100 }, 'fa-battery.h': { min: 0, max: 168 }, 'fa-battery.m': { min: 0, max: 240 }, 'fa-battery.sf': { min: 0, max: 100 },
  'lv-drop.v': { min: 1, max: 600 }, 'lv-drop.a': { min: 0, max: 100 }, 'lv-drop.ft': { min: 0, max: 20000 }, 'lv-drop.min': { min: 0, max: 600 },
  'psu.n': { min: 0, max: 10000, integer: true }, 'psu.ma': { min: 0, max: 20000 }, 'psu.head': { min: 0, max: 100 },
  'poe-budget.n': { min: 0, max: 1000, integer: true }, 'poe-budget.w': { min: 0, max: 100 }, 'poe-budget.sw': { min: 1, max: 20000 },
  'cctv-storage.cams': { min: 0, max: 10000, integer: true }, 'cctv-storage.mbps': { min: 0, max: 100 }, 'cctv-storage.hours': { min: 0, max: 24 }, 'cctv-storage.days': { min: 0, max: 3650 }, 'cctv-storage.motion': { min: 0, max: 100 },
  'cctv-ppf.hres': { min: 100, max: 20000, integer: true }, 'cctv-ppf.fov': { min: 1, max: 179 }, 'cctv-ppf.d': { min: 0.5, max: 5000 },
  'spl.sens': { min: 60, max: 130 }, 'spl.w': { min: 0.01, max: 2000 }, 'spl.d': { min: 0.5, max: 5000 }, 'spl.amb': { min: 0, max: 130 },
  'line70.taps': { min: 0, max: 10000 }, 'line70.amp': { min: 1, max: 10000 }, 'line70.ft': { min: 0, max: 20000 },
  'spk-spacing.ceil': { min: 6, max: 100 }, 'spk-spacing.ear': { min: 0, max: 10 }, 'spk-spacing.disp': { min: 10, max: 180 }, 'spk-spacing.area': { min: 1, max: 10000000 },
  'amp-size.n': { min: 0, max: 10000, integer: true }, 'amp-size.tap': { min: 0, max: 500 }, 'amp-size.head': { min: 0, max: 100 }, 'amp-size.zones': { min: 1, max: 500, integer: true },
  'spk-wire.taps': { min: 0, max: 10000 }, 'spk-wire.loss': { min: 0.1, max: 6 },
  'rt60.l': { min: 1, max: 2000 }, 'rt60.w': { min: 1, max: 2000 }, 'rt60.h': { min: 1, max: 300 },
  'sti.d': { min: 1, max: 2000 }, 'sti.t': { min: 0.1, max: 15 }, 'sti.v': { min: 100, max: 100000000 }, 'sti.n': { min: 1, max: 50, integer: true },
  'horn-range.spl': { min: 60, max: 160 }, 'horn-range.amb': { min: 0, max: 130 }, 'horn-range.over': { min: 0, max: 40 },
  'db-sum.a': { min: 0, max: 200 }, 'db-sum.b': { min: 0, max: 200 }, 'db-sum.c': { min: 0, max: 200, optional: true }, 'db-sum.d1': { min: 0.1, max: 10000 }, 'db-sum.d2': { min: 0.1, max: 10000 },
  'spk-delay.main': { min: 0, max: 2000 }, 'spk-delay.fill': { min: 0, max: 2000 }, 'spk-delay.haas': { min: 0, max: 50 }, 'spk-delay.temp': { min: -40, max: 140 },
  'lo-z.n': { min: 1, max: 64, integer: true }, 'lo-z.min': { min: 0.5, max: 64 },
  'audio-level.v': { min: 0, max: 1000 }, 'audio-level.ohm': { min: 0.1, max: 100000 },
  'access-lock.mag': { min: 0, max: 1000, integer: true }, 'access-lock.magma': { min: 0, max: 5000 }, 'access-lock.str': { min: 0, max: 1000, integer: true }, 'access-lock.strma': { min: 0, max: 5000 }, 'access-lock.rdr': { min: 0, max: 1000, integer: true }, 'access-lock.rdrma': { min: 0, max: 5000 },
  'nc-coverage.rooms': { min: 0, max: 5000, integer: true }, 'nc-coverage.beds': { min: 0, max: 20, integer: true }, 'nc-coverage.baths': { min: 0, max: 5000, integer: true }, 'nc-coverage.staff': { min: 0, max: 500, integer: true },
  'callbox.sbma': { min: 0, max: 5000 }, 'callbox.calls': { min: 0, max: 1000 }, 'callbox.callma': { min: 0, max: 20000 }, 'callbox.min': { min: 0, max: 120 }, 'callbox.light': { min: 0, max: 24 }, 'callbox.lightma': { min: 0, max: 20000 }, 'callbox.days': { min: 0, max: 30 }, 'callbox.psh': { min: 0.5, max: 12 },
  'pm-hours.dev': { min: 0, max: 100000, integer: true }, 'pm-hours.min': { min: 0, max: 240 }, 'pm-hours.panel': { min: 0, max: 1000, integer: true }, 'pm-hours.ph': { min: 0, max: 100 }, 'pm-hours.visits': { min: 0, max: 365, integer: true }, 'pm-hours.rate': { min: 0, max: 1000 }, 'pm-hours.travel': { min: 0, max: 24 },
  'design-hours.sqft': { min: 0, max: 100000000 }, 'design-hours.sys': { min: 0, max: 50, integer: true }, 'design-hours.rate': { min: 0, max: 200 }, 'design-hours.fixed': { min: 0, max: 10000 }, 'design-hours.usd': { min: 0, max: 1000 },
};
for (const c of LV_CALCS) for (const i of c.inputs) {
  const extra = RANGES[`${c.id}.${i.k}`]; if (extra) Object.assign(i, extra);
  if (/\(optional\)|0 = none/i.test(i.label)) i.optional = true;
}

/** Cross-checks between related inputs: values that are each fine alone but do not make sense together. */
const CROSS: Record<string, (x: Record<string, number>) => Issue[]> = {
  'cable-boxes': (x) => x.avg + x.slack > 1000 ? [{ level: 'bad', key: 'avg', msg: 'One run plus slack is longer than a 1000 ft box.', fix: 'Check the run length, or order reels instead of boxes.' }] : [],
  'conduit-fill': (x) => x.od >= x.id ? [{ level: 'bad', key: 'od', msg: 'The cable is as wide as or wider than the inside of the conduit.', fix: 'Check that the cable OD and conduit ID are both in inches (1" EMT is 1.049 in inside).' }] : [],
  'fiber-reach': (x) => x.rx >= x.tx ? [{ level: 'warn', key: 'rx', msg: 'Receiver sensitivity is not lower than the transmit power.', fix: 'Sensitivity is usually a more negative number (for example −11.1 dBm). Check the sign.' }] : [],
  'fa-battery': (x) => x.al < x.sb ? [{ level: 'warn', key: 'al', msg: 'Alarm current is lower than standby current.', fix: 'Alarm current is normally the higher one. Check that the two were not swapped.' }] : x.h < 24 ? [{ level: 'warn', key: 'h', msg: 'Standby time is under 24 hours.', fix: 'NFPA 72 fire alarm needs 24 h standby (some systems differ). Check the spec.' }] : [],
  'lv-drop': (x) => x.min >= x.v ? [{ level: 'bad', key: 'min', msg: 'The device minimum voltage is not lower than the supply voltage.', fix: 'Check both voltages; for a 24 V supply the device minimum is often 16–20 V.' }] : [],
  'poe-budget': (x) => x.w > 90 ? [{ level: 'warn', key: 'w', msg: 'More than 90 W per device is above the highest PoE class.', fix: 'Check the device datasheet; Class 8 is 90 W at the switch.' }] : [],
  'line70': (x) => x.taps > x.amp ? [{ level: 'warn', key: 'taps', msg: 'The speaker taps add up to more than the amplifier rating.', fix: 'Use a bigger amplifier, lower the taps or split the zone.' }] : [],
  'spk-spacing': (x) => x.ear >= x.ceil ? [{ level: 'bad', key: 'ear', msg: 'Ear height is at or above the ceiling.', fix: 'Ear height is about 4 ft seated or 5 ft standing; ceiling height is from the floor.' }] : [],
  'spk-delay': (x) => x.fill > x.main ? [{ level: 'warn', key: 'fill', msg: 'The fill speaker is farther from the listener than the main speaker.', fix: 'A delay fill is normally closer to the listener. Check that the two distances were not swapped.' }] : [],
  'callbox': (x) => x.calls * x.min > 1440 ? [{ level: 'bad', key: 'calls', msg: 'Calls × minutes per call is more than 24 hours a day.', fix: 'Check calls per day and minutes per call.' }] : [],
};

export interface CalcCheck { out: CalcOut[] | null; issues: Issue[]; missing: string[] }
/**
 * Run a calculator with full checks: blank required boxes are listed (never treated as zero), blank optional boxes
 * are skipped, each entry is range-checked with a suggested fix, related entries are cross-checked, and results are
 * only shown when no entry is wrong. Results with NaN or Infinity are replaced by a message.
 */
export function checkCalc(c: LvCalc, vals: Record<string, number | null | undefined> = {}): CalcCheck {
  const issues: Issue[] = [], missing: string[] = [];
  const x: Record<string, number> = {};
  for (const i of c.inputs) {
    const v = i.k in vals ? vals[i.k] : i.v;
    if (v == null || Number.isNaN(v)) { if (i.optional) { x[i.k] = 0; continue; } missing.push(i.label); issues.push({ level: 'bad', key: i.k, msg: `${i.label} is empty.`, fix: 'Type a number. A blank box is not counted as zero.' }); continue; }
    if (!i.options) { const d = defaultRange(i.unit); const e = checkValue(v, { min: i.min ?? d.min, max: i.max ?? d.max, integer: i.integer, label: i.label, unit: i.unit }); if (e) issues.push({ ...e, key: i.k }); }
    x[i.k] = v;
  }
  if (issues.some((i) => i.level === 'bad')) return { out: null, issues, missing };
  issues.push(...(CROSS[c.id]?.(x) ?? []));
  if (issues.some((i) => i.level === 'bad')) return { out: null, issues, missing };
  const out = c.run(x);
  if (out.some((o) => /NaN|Infinity|—/.test(o.value))) issues.push({ level: 'warn', msg: 'Some results could not be worked out from these numbers (a zero where a size or distance is needed).', fix: 'Check for a 0 in a distance, size or rating box.' });
  return { out, issues, missing };
}

export const lvCalc = (id: string) => LV_CALCS.find((c) => c.id === id);
export function runCalc(c: LvCalc, vals?: Record<string, number>) { const x = Object.fromEntries(c.inputs.map((i) => [i.k, vals?.[i.k] ?? i.v])); return c.run(x); }
