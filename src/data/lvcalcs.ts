// Low-voltage calculators, defined as data so they can be shown on the Calculators page and on each
// system's toolkit. Results are planning values; follow the manufacturer, the adopted code and the AHJ.
export interface CalcInput { k: string; label: string; v: number; unit?: string; step?: number; options?: [number, string][] }
export interface CalcOut { label: string; value: string; unit?: string; tone?: 'ok' | 'warn' | 'bad' }
export interface LvCalc { id: string; title: string; group: string; keywords: string; inputs: CalcInput[]; run: (x: Record<string, number>) => CalcOut[]; note?: string }

const r = (x: number, d = 1) => (Number.isFinite(x) ? (Math.round(x * 10 ** d) / 10 ** d).toLocaleString() : '—');
/** Copper DC resistance, ohms per 1000 ft (NEC Ch. 9 Table 8, uncoated). */
export const OHM_KFT: Record<number, number> = { 24: 25.7, 22: 16.2, 20: 10.1, 18: 6.39, 16: 4.02, 14: 2.52, 12: 1.59, 10: 0.999 };
const AWG_OPTS: [number, string][] = [24, 22, 20, 18, 16, 14, 12, 10].map((a) => [a, `#${a} AWG`]);
const drop = (a: number, ft: number, awg: number) => (2 * ft * a * (OHM_KFT[awg] ?? 6.39)) / 1000;

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
    note: 'Fire alarm: 24 h standby + 5 min alarm (15 min for emergency voice/alarm communications), NFPA 72. Intrusion and other systems follow their UL standard or the spec.' },
  { id: 'lv-drop', title: 'Low-voltage wire drop (locks, NAC, cameras, call stations)', group: 'Power', keywords: 'voltage drop 12v 24v lock strike maglock nac wire gauge',
    inputs: [{ k: 'v', label: 'Supply voltage', v: 24, unit: 'V' }, { k: 'a', label: 'Load current', v: 1.5, unit: 'A', step: 0.01 }, { k: 'ft', label: 'One-way length', v: 200, unit: 'ft' }, { k: 'awg', label: 'Wire size', v: 18, options: AWG_OPTS }, { k: 'min', label: 'Device minimum voltage', v: 16, unit: 'V' }],
    run: (x) => { const d = drop(x.a, x.ft, x.awg), end = x.v - d; return [{ label: 'Voltage drop', value: r(d, 2), unit: 'V' }, { label: 'Voltage at device', value: r(end, 2), unit: 'V', tone: end >= x.min ? 'ok' : 'bad' }, { label: 'Drop', value: r((d / x.v) * 100, 1), unit: '%' }]; },
    note: 'Copper DC resistance from NEC Chapter 9 Table 8 at 75 °C, both conductors counted. Use the panel\'s starting voltage (often 20.4 V for battery end-of-life on a 24 V system).' },
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
    run: (x) => { const rad = (x.ceil - x.ear) * Math.tan((x.disp * Math.PI) / 360), sp = rad * Math.SQRT2; return [{ label: 'Coverage radius at ear height', value: r(rad, 1), unit: 'ft' }, { label: 'Spacing (square grid, edge-to-edge)', value: r(sp, 1), unit: 'ft' }, { label: 'Speakers (approx.)', value: String(Math.ceil(x.area / (sp * sp))) }]; },
    note: 'Edge-to-edge square grid. Use tighter (minimum-overlap) spacing for voice evacuation and noisy rooms.' },
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
export const lvCalc = (id: string) => LV_CALCS.find((c) => c.id === id);
export function runCalc(c: LvCalc, vals?: Record<string, number>) { const x = Object.fromEntries(c.inputs.map((i) => [i.k, vals?.[i.k] ?? i.v])); return c.run(x); }
