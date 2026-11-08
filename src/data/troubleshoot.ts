// Troubleshooting guides by equipment category: what to check, how to check it, and the value to expect.
// Expected values use the selected item's specifications where it has them; otherwise typical or
// standard values. Always follow the manufacturer's manual, the adopted code and the AHJ. Work on
// energized, RF or fire alarm systems only when qualified, with the system placed in test and the
// monitoring company and fire department notified.
import type { Project } from '../types';
import type { SpecItem, SpecValue } from './speclib';
import { FEEDERS, byId } from './catalog';

export interface Ctx { it: SpecItem; s: Record<string, SpecValue>; p: Project }
export interface Step { check: string; how: string; expect: (c: Ctx) => string; ifFail: string; tool?: string }
export interface Symptom { id: string; label: string; steps: Step[] }
export interface Guide { id: string; title: string; categories: string[]; safety: string; symptoms: Symptom[] }

const n = (v: SpecValue | undefined) => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(x) ? x : null; };
const f = (x: number, d = 1) => x.toFixed(d).replace(/\.0+$/, '');
const spec = (c: Ctx, ...keys: string[]) => { for (const k of keys) { const v = n(c.s[k]); if (v != null) return v; } return null; };
const dbm = (w: number) => 10 * Math.log10(w * 1000);

/** Expected loss of a cable run at the design frequency, from the item's loss table. */
function cableLoss(c: Ctx): { per100: number; ft: number; total: number } | null {
  const pts = Object.entries(c.s).map(([k, v]) => { const m = k.match(/Loss @\s*([\d.]+)\s*MHz/i); const l = n(v); return m && l != null ? [parseFloat(m[1]), l] as [number, number] : null; }).filter(Boolean) as [number, number][];
  if (!pts.length) { const fd = byId(FEEDERS, c.p.radio.feederId); if (fd) pts.push(...fd.points); }
  if (!pts.length) return null;
  pts.sort((a, b) => a[0] - b[0]);
  const fm = c.p.radio.fMHz; let per100 = pts[0][1];
  for (let i = 1; i < pts.length; i++) if (fm >= pts[i - 1][0]) { const [f0, l0] = pts[i - 1], [f1, l1] = pts[i]; per100 = fm <= f1 ? l0 + ((l1 - l0) * Math.log(fm / f0)) / Math.log(f1 / f0) : l1 * Math.sqrt(fm / f1); }
  const ft = c.p.radio.feederLenM * 3.28084;
  return { per100, ft, total: (per100 * ft) / 100 };
}

const SWEEP: Step[] = [
  { check: 'Return loss / VSWR of the whole line with the antenna connected', how: 'Calibrate the cable and antenna analyzer (open, short, load) at the end of your test jumper. Sweep the band of the system at the equipment end.', tool: 'Cable & antenna analyzer (sweep tester)',
    expect: () => 'Return loss 14 dB or better (VSWR 1.5:1 or lower) across the operating band. Many owners and carriers require 18 dB (1.29:1).', ifFail: 'Run distance-to-fault next to find where the reflection is.' },
  { check: 'Distance-to-fault (DTF)', how: 'Set the cable type (velocity factor and loss) on the analyzer, then run DTF from the equipment end. Note the distance of any spike.', tool: 'Cable & antenna analyzer',
    expect: () => 'No spike above about 25 dB return loss before the antenna. Each connector should show as a small bump only.', ifFail: 'A spike at a connector usually means water, a loose or badly made connector, or a crushed or kinked cable at that distance. Re-make or replace that section.' },
  { check: 'Cable insertion loss', how: 'Replace the antenna with a short or a calibrated load and measure one-way loss (or two-way loss ÷ 2) with the analyzer cable-loss mode.', tool: 'Cable & antenna analyzer',
    expect: (c) => { const l = cableLoss(c); return l ? `About ${f(l.total, 2)} dB for ${f(l.ft, 0)} ft at ${c.p.radio.fMHz} MHz (${f(l.per100, 2)} dB/100 ft), plus about 0.1 dB per connector. Within ±1 dB is normal.` : 'Datasheet loss per 100 ft × run length, plus about 0.1 dB per connector.'; },
    ifFail: 'Higher loss than expected means water in the cable, the wrong cable type, or a damaged section. Use DTF to locate it.' },
  { check: 'Passive intermodulation (PIM), for cellular, DAS and multi-carrier sites', how: 'Run a PIM test at two 20 W (43 dBm) tones in the system band, with the line connected to the antenna and a low-PIM load for comparison.', tool: 'PIM analyzer',
    expect: () => '-153 dBc or better at 2 × 43 dBm is the common acceptance value. Follow the owner\'s spec if it is different.', ifFail: 'Clean and re-torque connectors, replace non-low-PIM adapters, and look for rusty metal near the antenna.' },
];

const DC: (label: string) => Step = (label) => ({ check: `${label} supply voltage`, how: 'Measure DC at the equipment terminals with the equipment running (and again while transmitting or in alarm).', tool: 'Digital multimeter',
  expect: (c) => { const v = spec(c, 'DC input (V)', 'Supply (V)', 'Nominal voltage (V)', 'Voltage'); return v ? `${f(v)} V nominal; stay within about ±10% (${f(v * 0.9)} to ${f(v * 1.1)} V) under full load, or the datasheet range.` : 'Within the datasheet input range, usually ±10% of nominal under full load.'; },
  ifFail: 'Check the supply, fuses, loose terminals, and voltage drop in the power cable. Low voltage only when loaded points to undersized wire or a weak battery.' });

const GUIDES: Guide[] = [
  { id: 'antenna', title: 'Antenna and transmission line', categories: ['Antennas', 'Coax & feeders', 'Connectors', 'Surge & grounding'],
    safety: 'Do not work near a transmitting antenna; lock out the transmitter and follow the site RF exposure plan. Climbing needs fall protection and a trained climber.',
    symptoms: [
      { id: 'vswr', label: 'High VSWR / reflected power alarm', steps: [
        { check: 'Forward and reflected power at the transmitter', how: 'Insert a directional wattmeter (correct element for the band and power) between the transmitter and the line and key up.', tool: 'Directional wattmeter',
          expect: () => 'Reflected power below 4% of forward (VSWR 1.5:1). Above 11% (2:1) most transmitters fold back power.', ifFail: 'Sweep the line to find the fault.' },
        ...SWEEP.slice(0, 2),
        { check: 'Connectors and weatherproofing', how: 'Inspect each outdoor connection: tape and butyl intact, no water, connector tight. Re-torque to the manufacturer value.', expect: () => 'Dry, tight, fully weatherproofed connections; no green corrosion.', ifFail: 'Cut back and re-terminate wet connectors; replace water-filled cable sections.' },
        { check: 'Surge protector (antenna discharge unit)', how: 'Bypass the protector with a barrel or check its DC path. Gas tube types can fail shorted after a strike.', tool: 'Multimeter / analyzer', expect: () => 'No change in VSWR when bypassed; insertion loss about 0.1 dB.', ifFail: 'Replace the protector or its gas tube.' },
      ] },
      { id: 'low', label: 'Weak signal / short range', steps: [
        SWEEP[2],
        { check: 'Antenna type, gain and band', how: 'Read the antenna label and compare with the design.', expect: (c) => { const g = spec(c, 'Gain (dBi)'), lo = spec(c, 'Band low (MHz)'), hi = spec(c, 'Band high (MHz)'); return `${g != null ? `${f(g)} dBi gain. ` : ''}${lo != null && hi != null ? `Rated ${f(lo, 0)}–${f(hi, 0)} MHz; the system runs at ${c.p.radio.fMHz} MHz.` : 'Antenna band must include the operating frequency.'}`; }, ifFail: 'Replace with an antenna cut for the band.' },
        { check: 'Antenna aiming, plumb and down-tilt', how: 'Check azimuth with a compass or alignment tool and tilt with an inclinometer.', tool: 'Antenna alignment tool / inclinometer', expect: (c) => `Azimuth ${f(c.p.radio.azimuthDeg, 0)}° true (allow for magnetic declination), within ±3°. Omni antennas plumb within 1°.`, ifFail: 'Re-aim and tighten the mount.' },
        { check: 'Obstructions near the antenna', how: 'Look for new buildings, trees, other antennas or metal within a few wavelengths of the antenna.', expect: () => 'Clear around the antenna, with vertical separation from other antennas per the site plan.', ifFail: 'Relocate the antenna or raise it.' },
      ] },
      { id: 'install', label: 'New line checkout (commissioning)', steps: [...SWEEP, { check: 'Ground kits and bonding', how: 'Check ground kits at the top, bottom and building entry, bonded to the tower and ground bars. Measure bond resistance with a low-resistance ohmmeter.', tool: 'Low-resistance ohmmeter', expect: () => 'Kits installed with drip loops pointing down; bonds of a few milliohms (well under 0.1 Ω).', ifFail: 'Clean, re-torque or re-bond.' }] },
    ] },
  { id: 'radio', title: 'Radio, repeater and base station', categories: ['Radios & repeaters', 'Public safety bands'],
    safety: 'Key the transmitter only into a dummy load or the licensed antenna system. Observe the FCC license frequency, power and emission.',
    symptoms: [
      { id: 'tx', label: 'Low or no transmit power', steps: [
        DC('Radio'),
        { check: 'Transmit power into a dummy load', how: 'Connect a dummy load and wattmeter or service monitor at the radio output and key up.', tool: 'Service monitor or wattmeter + dummy load',
          expect: (c) => { const w = spec(c, 'Max power (W)'); return w ? `Up to ${f(w)} W (${f(dbm(w))} dBm) at full power; within ±1 dB of the programmed power level and the license limit.` : 'Programmed power within ±1 dB and within the license.'; }, ifFail: 'Check the radio power setting and power supply; if the radio is low into a load it needs repair.' },
        { check: 'Frequency error and deviation', how: 'Measure on a service monitor.', tool: 'Service monitor', expect: () => 'Frequency within the FCC Part 90.213 tolerance for the band and bandwidth (for example ±2.5 ppm for 12.5 kHz base stations in 150–512 MHz). Deviation about ±2.5 kHz peak for 12.5 kHz analog.', ifFail: 'Re-align or reference the radio to a known standard.' },
        ...SWEEP.slice(0, 1),
      ] },
      { id: 'rx', label: 'Poor receive / users not heard', steps: [
        { check: 'Receiver sensitivity', how: 'Inject a signal from the service monitor at the receiver input and lower it until 12 dB SINAD (analog) or 5% BER (digital).', tool: 'Service monitor',
          expect: (c) => { const s = spec(c, 'Sensitivity (dBm)'); return s != null ? `${f(s)} dBm or better (datasheet). Within 1–2 dB is normal.` : 'Datasheet sensitivity, typically −116 to −119 dBm.'; }, ifFail: 'Check the preselector, receive multicoupler and cabling; a radio far below spec needs repair.' },
        { check: 'Desense (repeaters and co-located sites)', how: 'Measure sensitivity with the transmitter keyed into the antenna and compare with unkeyed.', tool: 'Service monitor', expect: () => 'No more than 1 dB worse with the transmitter keyed.', ifFail: 'Check duplexer tuning and isolation, and look for loose hardware or rusty joints causing intermod.' },
        { check: 'Noise floor at the receiver', how: 'Connect a spectrum analyzer through the receive path and look at the channel with no users talking.', tool: 'Spectrum analyzer', expect: () => 'Near the thermal noise floor for the bandwidth (about −129 dBm for 12.5 kHz with a 0 dB noise figure; real systems a few dB higher). No carriers on the channel.', ifFail: 'Find the interference source (other transmitters, intermod, electrical noise) before changing settings.' },
        ...SWEEP.slice(0, 1),
      ] },
      { id: 'install', label: 'New radio checkout (commissioning)', steps: [DC('Radio')] },
    ] },
  { id: 'erces', title: 'ERCES / BDA and DAS', categories: ['ERCES / BDA & DAS'],
    safety: 'A BDA must not transmit until the FCC licensee (agency) has given permission. An oscillating BDA can interfere with public safety radio; shut it down while troubleshooting.',
    symptoms: [
      { id: 'coverage', label: 'Coverage test failed / dead spots', steps: [
        { check: 'Donor signal at the donor antenna', how: 'Measure the serving site downlink at the donor antenna cable with a spectrum analyzer or radio meter.', tool: 'Spectrum analyzer', expect: (c) => `Steady signal from the correct site; the design assumed ${c.p.erces.donorRssiDbm} dBm.`, ifFail: 'Re-aim the donor antenna at the serving site or move it to a better roof position.' },
        { check: 'BDA gain and output', how: 'Read the BDA status page: gain, output per band, and any alarms.', expect: (c) => { const g = spec(c, 'Max gain (dB)') ?? c.p.erces.bdaGainDb, o = spec(c, 'Max output (dBm)') ?? c.p.erces.bdaMaxOutputDbm; return `Gain up to ${f(g)} dB and composite output up to ${f(o)} dBm; no AGC or oscillation alarms.`; }, ifFail: 'Lower gain if oscillating; raise it only within isolation limits.' },
        { check: 'Donor-to-server isolation', how: 'Use the BDA isolation test or inject a signal at the server side and measure at the donor.', expect: (c) => `At least 15 dB more than the BDA gain (≥ ${f((spec(c, 'Max gain (dB)') ?? c.p.erces.bdaGainDb) + 15)} dB).`, ifFail: 'Separate the donor antenna from the building antennas, use the roof as a shield, or reduce gain.' },
        { check: 'Signal strength in each test grid', how: 'Walk the grid with a calibrated meter or radio (inbound and outbound) per the AHJ test procedure.', tool: 'Calibrated test receiver', expect: () => 'At least −95 dBm (or the AHJ value) and DAQ 3.0, in 99% of critical areas and 90% of general areas (IFC 510 / NFPA 1225).', ifFail: 'Add or move indoor antennas, check splitters and coax, and sweep the DAS legs.' },
        ...SWEEP.slice(0, 2),
      ] },
      { id: 'alarm', label: 'BDA trouble alarm at the annunciator / fire panel', steps: [
        { check: 'Which supervisory signal is active', how: 'Read the annunciator and the BDA alarm log: antenna, power, battery, charger, donor or oscillation.', expect: () => 'Each supervised condition must be reported separately and match the BDA log.', ifFail: 'Check the dry-contact wiring and labels between the BDA and the fire panel.' },
        { check: 'Battery backup', how: 'Measure battery voltage on float, then do a load test or confirm the runtime calculation.', tool: 'Multimeter / battery load tester', expect: (c) => `${c.p.erces.standbyHours} hours at 100% load (12 h for IFC 510 unless the AHJ requires 24 h).`, ifFail: 'Replace weak batteries; check the charger output.' },
        DC('BDA'),
      ] },
    ] },
  { id: 'firealarm', title: 'Fire alarm devices and circuits', categories: ['Fire alarm'],
    safety: 'Put the system in test with the monitoring company and fire department before testing. Restore and verify the system is normal when done.',
    symptoms: [
      { id: 'nac', label: 'Notification appliances not working or weak', steps: [
        { check: 'NAC voltage at the last device in alarm', how: 'Put the system in alarm (or use the panel NAC test) and measure across the last device on the circuit.', tool: 'Digital multimeter (true RMS for DC pulsed NACs)',
          expect: (c) => `At least the device's listed minimum voltage (often 16 V for 24 V regulated devices). Design minimum: ${c.p.alarm.minDeviceV} V.`, ifFail: 'Too much voltage drop: shorten the circuit, use heavier wire, split the circuit or add a power supply.' },
        { check: 'Device alarm current', how: 'Measure circuit current in alarm with a clamp meter, or add the datasheet values for each device.', tool: 'DC clamp meter',
          expect: (c) => { const a = spec(c, 'Alarm current (mA)'); return a != null ? `About ${f(a, 0)} mA per device at this setting (datasheet). Circuit total must stay under the NAC rating.` : 'Sum of the datasheet currents; under the NAC rating.'; }, ifFail: 'Check candela settings and remove extra devices from the circuit.' },
        { check: 'End-of-line resistor / supervision', how: 'With power off and the circuit disconnected at the panel, measure resistance across the circuit (devices are polarized so they read open).', tool: 'Multimeter', expect: () => 'The panel\'s EOL value (check the panel manual, often 2.2 kΩ to 4.7 kΩ). Open = broken wire; near 0 Ω = short.', ifFail: 'Find the open or short by splitting the circuit in half.' },
        { check: 'Audibility', how: 'Measure sound level at representative points with the system in alarm.', tool: 'Sound level meter (A-weighted)', expect: () => 'Public mode: 15 dB above average ambient or 5 dB above the maximum sound lasting 60 s (NFPA 72 Ch. 18); sleeping areas: 75 dBA at the pillow.', ifFail: 'Add devices or raise tap settings.' },
      ] },
      { id: 'ground', label: 'Ground fault trouble', steps: [
        { check: 'Which circuit has the fault', how: 'Disconnect circuits one at a time at the panel until the ground fault clears (follow the panel manual).', expect: () => 'The trouble clears when the faulted circuit is removed.', ifFail: 'If it never clears, check the panel, the power supply and the battery wiring.' },
        { check: 'Insulation to ground', how: 'With the circuit disconnected from the panel, measure each conductor to ground. Use a meter, not a megger, if devices are still connected.', tool: 'Multimeter / insulation tester', expect: () => 'Open (no reading) to ground. Any resistance points to a nicked wire, water in a box, or a pinched cable.', ifFail: 'Split the circuit to find the faulted section.' },
      ] },
      { id: 'device', label: 'Detector or device trouble / false alarms', steps: [
        { check: 'Device address and type', how: 'Compare the panel point list with the device installed.', expect: () => 'Address, type and location match the program and drawings.', ifFail: 'Re-address the device or correct the program.' },
        { check: 'Smoke detector sensitivity', how: 'Read sensitivity from the panel or test with a listed sensitivity tester.', tool: 'Sensitivity tester / panel report', expect: () => 'Within the listed range marked on the detector (NFPA 72 Ch. 14 testing).', ifFail: 'Clean or replace dirty detectors; check for dust, steam or air movement causing false alarms.' },
        { check: 'Signaling line circuit (SLC) wiring', how: 'With the loop disconnected, measure loop resistance and capacitance.', tool: 'Multimeter', expect: () => 'Under the panel manual limits for loop resistance and capacitance; no voltage on the loop from outside sources.', ifFail: 'Fix splices, shorten the loop or use the wire size the manual requires.' },
      ] },
    ] },
  { id: 'battery', title: 'Batteries and standby power', categories: ['Batteries'],
    safety: 'Batteries can deliver very high current: insulated tools, eye protection, and no rings or watches.',
    symptoms: [
      { id: 'low', label: 'Low battery / battery trouble', steps: [
        { check: 'Float (charging) voltage', how: 'Measure across the battery bank with the charger connected and the battery charged.', tool: 'Digital multimeter',
          expect: (c) => { const v = spec(c, 'Float voltage (V)'), nom = spec(c, 'Nominal voltage (V)') ?? 12; const lfp = /lifepo|lithium/i.test(String(c.s['Chemistry'] ?? '')); return v ? `${f(v, 2)} V per the datasheet (temperature-corrected).` : lfp ? `About ${f(nom * 13.6 / 12.8, 1)} V for a ${f(nom)} V LiFePO4 battery (check the datasheet).` : `About ${f(nom * 13.5 / 12, 1)}–${f(nom * 13.8 / 12, 1)} V for a ${f(nom)} V lead-acid battery at 25 °C.`; },
          ifFail: 'Adjust or replace the charger; high float dries out lead-acid batteries, low float leaves them undercharged.' },
        { check: 'Open-circuit voltage (charger off, rested 30 min)', how: 'Disconnect the charger, wait, then measure each battery.', tool: 'Digital multimeter',
          expect: (c) => { const nom = spec(c, 'Nominal voltage (V)') ?? 12; return `About ${f(nom * 12.8 / 12, 1)} V for a charged ${f(nom)} V lead-acid battery. Batteries in one string should be within 0.1 V of each other.`; }, ifFail: 'A battery much lower than the others has a bad cell; replace the set.' },
        { check: 'Capacity or load test', how: 'Run a load test at the rated current, or run the system on battery for the required time.', tool: 'Battery load tester',
          expect: (c) => { const ah = spec(c, 'Capacity (Ah)'); return `${ah ? `Rated ${f(ah)} Ah. ` : ''}Must still carry the required standby and alarm load (NFPA 72 requires replacement before capacity drops below the calculated need; lead-acid units are typically replaced about every 4 to 5 years).`; }, ifFail: 'Replace the batteries and write the install date on them.' },
        { check: 'Terminals and connections', how: 'Check for corrosion, swelling, cracks and loose terminals.', expect: () => 'Clean, tight, no swelling or leaks.', ifFail: 'Clean, re-torque or replace.' },
      ] },
    ] },
  { id: 'solar', title: 'Solar and DC power', categories: ['Solar & DC power', 'Conductors'],
    safety: 'PV modules make voltage whenever light hits them. Open the DC disconnect, cover the array if needed, and use meters rated for the DC voltage.',
    symptoms: [
      { id: 'low', label: 'Low charging / batteries not charging', steps: [
        { check: 'String open-circuit voltage (Voc)', how: 'Open the string disconnect and measure Voc at the combiner or controller input. Note the module temperature.', tool: 'DC-rated multimeter',
          expect: (c) => { const v = spec(c, 'Voc (V)'), k = spec(c, 'Temp coeff Voc (%/°C)'); return v ? `About ${f(v, 1)} V per module at 25 °C${k != null ? `, changing ${f(k, 2)}% per °C` : ''} × modules in series. Within about 5% of the calculated value.` : 'Datasheet Voc × modules in series, corrected for temperature.'; }, ifFail: 'Low Voc points to a failed module, bypass diode or a wiring fault; compare strings.' },
        { check: 'String short-circuit current (Isc) or operating current', how: 'Measure with a DC clamp meter in full sun, or use an I-V curve tracer.', tool: 'DC clamp meter / I-V curve tracer',
          expect: (c) => { const i = spec(c, 'Isc (A)'); return i ? `About ${f(i, 1)} A × (sunlight W/m² ÷ 1000) per string.` : 'Datasheet Isc scaled by sunlight.'; }, ifFail: 'Look for shading, dirt, damaged modules or loose connectors.' },
        { check: 'Polarity and insulation', how: 'Check polarity before connecting. Measure insulation resistance of each conductor to ground per the test procedure.', tool: 'Insulation resistance tester', expect: () => 'Correct polarity; insulation typically well above 1 MΩ (follow IEC 62446-1 / manufacturer values).', ifFail: 'Find the damaged conductor or wet connector.' },
        { check: 'Voltage drop', how: 'Measure voltage at both ends of the circuit under load.', tool: 'Digital multimeter', expect: () => 'Up to 2–3% on DC circuits is the usual design target (NEC informational notes suggest 3% branch / 5% total).', ifFail: 'Use larger conductors or shorten the run.' },
        DC('Controller output'),
      ] },
    ] },
  { id: 'network', title: 'Network, PoE, Wi-Fi and cabling', categories: ['Network & PoE', 'Wi-Fi', 'Structured cabling', 'Fiber optics'],
    safety: 'Never look into a fiber or optical port; use a power meter or an inspection scope with a filter.',
    symptoms: [
      { id: 'link', label: 'No link / device not powering up', steps: [
        { check: 'PoE voltage and class at the device', how: 'Use a PoE tester inline at the device end of the cable.', tool: 'PoE tester',
          expect: (c) => { const w = spec(c, 'Power at PD (W)', 'PoE budget (W)'); return `About 44–57 V for 802.3af and 50–57 V at the switch for 802.3at/bt${w ? `; this item lists ${f(w, 1)} W` : ''}. The switch must have enough PoE budget left.`; }, ifFail: 'Check the switch PoE budget, port settings and cable length; replace a failing injector.' },
        { check: 'Cable wiremap and length', how: 'Run a wiremap and length test, or a full certification.', tool: 'Cable certifier / qualifier', expect: () => 'Correct T568A/B wiremap; permanent link up to 90 m and channel up to 100 m; Pass on a TIA-568.2-D certifier for the category.', ifFail: 'Re-terminate the jack or plug; split pairs and opens are the usual faults.' },
        { check: 'Link speed and errors', how: 'Read the switch port: speed, duplex and error counters.', expect: () => 'Expected speed (1 Gb/s or more), full duplex, no CRC errors increasing.', ifFail: 'A link that drops to 100 Mb/s usually has a bad pair; re-terminate or replace the cable.' },
        { check: 'Fiber loss (fiber links)', how: 'Clean and inspect each end face, then measure loss with a light source and power meter.', tool: 'Fiber scope, light source and power meter / OTDR',
          expect: (c) => { const a = String(c.s['Attenuation'] ?? ''); return `Under the loss budget: 0.75 dB per mated connector pair + 0.3 dB per splice + cable loss (${a || 'about 3.5 dB/km multimode at 850 nm, 1.0 dB/km single-mode indoor'}), per TIA-568.3-D.`; }, ifFail: 'Clean connectors first (most faults); then use an OTDR to find the bad splice or bend.' },
      ] },
      { id: 'wifi', label: 'Poor Wi-Fi coverage or speed', steps: [
        { check: 'Signal strength where users are', how: 'Use the Wi-Fi Survey page or a survey app at the problem spots.', tool: 'Wi-Fi survey app / analyzer', expect: () => '−67 dBm or stronger for voice and video, −70 dBm for data; signal-to-noise 25 dB or better.', ifFail: 'Add or move access points; check AP transmit power.' },
        { check: 'Channel overlap and utilization', how: 'Scan for other networks on the same channel.', tool: 'Wi-Fi analyzer', expect: () => 'No more than one strong AP per channel in an area; channel utilization under about 50%.', ifFail: 'Re-plan channels (1, 6, 11 on 2.4 GHz) and use 5 or 6 GHz.' },
      ] },
    ] },
  { id: 'grounding', title: 'Grounding and surge protection', categories: ['Surge & grounding', 'Conductors'],
    safety: 'Never disconnect a ground conductor from an energized system. Fall-of-potential tests use long leads: stay clear of power lines.',
    symptoms: [
      { id: 'resist', label: 'Ground resistance check / lightning damage', steps: [
        { check: 'Grounding electrode resistance', how: 'Measure with a fall-of-potential or clamp-on ground tester.', tool: 'Ground resistance tester',
          expect: () => 'Single rod: 25 Ω or less, or add a supplemental electrode (NEC 250.53(A)(2)). Communications sites: 5 Ω or less is the usual goal (Motorola R56).', ifFail: 'Add rods, a ring or chemical electrodes; check for corroded connections.' },
        { check: 'Bonding between ground bars and equipment', how: 'Measure between bonded points with a low-resistance ohmmeter.', tool: 'Low-resistance ohmmeter', expect: () => 'A few milliohms; well under 0.1 Ω.', ifFail: 'Clean, re-torque, or replace mechanical connections with exothermic welds.' },
        { check: 'Surge protectors', how: 'Check status lights or test per the manufacturer.', expect: () => 'All protectors show good; coax protectors pass the sweep with about 0.1 dB loss.', ifFail: 'Replace spent protectors and look for the damage path.' },
        { check: 'Intersystem bonding', how: 'Check that communications, CATV and power grounds are bonded at the intersystem bonding termination.', expect: () => 'One bonded grounding system (NEC 250.94, 800.100).', ifFail: 'Bond the systems together with the required conductor size.' },
      ] },
    ] },
];
const LOOP: Step = { check: 'Zone / loop resistance', how: 'Disconnect the zone at the panel and measure across it with the device closed (normal).', tool: 'Multimeter',
  expect: (c) => `The EOL value (${String(c.s['EOL resistor (Ω)'] ?? 'per the panel manual')}). Open = broken wire; near 0 Ω = short; a value much above the EOL = bad splice.`, ifFail: 'Split the zone to find the fault; re-make splices with listed connectors.' };
GUIDES.push(
  { id: 'intrusion', title: 'Intrusion (burglar alarm)', categories: ['Intrusion'], safety: 'Tell the central station before testing so they do not dispatch police.',
    symptoms: [
      { id: 'false', label: 'False alarms', steps: [
        { check: 'Which zone and when', how: 'Read the panel event history and the central station report.', expect: () => 'A pattern (same zone, time of day, weather) points to the cause.', ifFail: 'Walk-test that zone with the panel in test.' },
        { check: 'Motion detector aim and environment', how: 'Look for heaters, vents, sunlight, pets, balloons and moving signs in the pattern.', expect: (c) => `Mounted at the datasheet height${c.s['Range / coverage'] ? `, coverage ${c.s['Range / coverage']}` : ''}, aimed away from windows and heat.`, ifFail: 'Re-aim, re-mount, or change to dual technology.' },
        LOOP,
        { check: 'Door contacts', how: 'Check the magnet gap with the door shut and rattled.', expect: () => 'Gap within the contact rating (often ½–1 in) with no chatter.', ifFail: 'Realign or replace with a wide-gap contact; adjust the door.' },
      ] },
      { id: 'comm', label: 'Communication failure to central station', steps: [
        { check: 'Cellular signal at the communicator', how: 'Read signal strength on the communicator or keypad.', expect: () => 'The maker\'s minimum (often 2 bars / better than −95 dBm).', ifFail: 'Move the communicator or add a remote antenna.' },
        { check: 'IP path', how: 'Check the network cable, DHCP / static address and the router.', expect: () => 'Link up and the panel reaches the receiver.', ifFail: 'Fix the network; ask IT about firewall changes.' },
        { check: 'Test signal', how: 'Send a test and confirm with the central station.', expect: () => 'Received on both paths.', ifFail: 'Check the account number and receiver settings.' },
      ] },
      { id: 'power', label: 'Low battery / AC loss', steps: [DC('Panel'), { check: 'Battery', how: 'Measure on float, then load test.', tool: 'Multimeter / load tester', expect: () => 'About 13.5–13.8 V on float; holds above 12 V under load.', ifFail: 'Replace the battery (typically every 3–5 years).' }] },
    ] },
  { id: 'access', title: 'Access control', categories: ['Security & access control'], safety: 'Never leave an egress door unable to open. Keep fire alarm release working while you test.',
    symptoms: [
      { id: 'lock', label: 'Door will not lock or unlock', steps: [
        { check: 'Voltage at the lock', how: 'Measure at the lock terminals while the lock should be energized.', tool: 'Multimeter',
          expect: (c) => `${String(c.s['Power'] ?? '12 or 24 V DC')} within about 10%${c.s['Current (mA)'] ? `; draws ${c.s['Current (mA)']}` : ''}.`, ifFail: 'Check the power supply, fuse, relay output and wire size (use the wire drop calculator).' },
        { check: 'Relay output from the controller', how: 'Present a valid card and watch the relay LED and the lock voltage.', expect: () => 'Relay changes state for the programmed unlock time.', ifFail: 'Check the door schedule, the reader and the controller output.' },
        { check: 'Door alignment', how: 'Check the strike keeper or maglock armature lines up and the door closes fully.', expect: () => 'Latch enters the strike with no binding; maglock plate flat on the magnet.', ifFail: 'Adjust the closer, hinges or strike.' },
        { check: 'Fire alarm release', how: 'With the system in test, put the fire alarm in alarm.', expect: () => 'Fail-safe locks release on the egress side and stay released until reset.', ifFail: 'Check the fire alarm relay and the lock power supply input.' },
      ] },
      { id: 'reader', label: 'Reader offline / card not read', steps: [
        { check: 'Reader power and LED', how: 'Measure voltage at the reader.', tool: 'Multimeter', expect: () => 'Reader input range (usually 12 V); LED shows idle status.', ifFail: 'Check power and the cable.' },
        { check: 'Data wiring', how: 'OSDP: check RS-485 polarity and termination; Wiegand: D0 / D1 not swapped and within about 500 ft.', expect: () => 'Controller shows the reader online.', ifFail: 'Correct the wiring; set the OSDP address and baud rate.' },
        { check: 'Card format', how: 'Check the card format and facility code in the software.', expect: () => 'The card\'s format is enabled for that reader.', ifFail: 'Add the format or re-enroll the card.' },
      ] },
    ] },
  { id: 'cctv', title: 'CCTV / video surveillance', categories: ['CCTV'], safety: 'Use a ladder or lift safely; outdoor cameras may be on poles near power.',
    symptoms: [
      { id: 'offline', label: 'Camera offline or no video', steps: [
        { check: 'PoE power at the camera', how: 'Use a PoE tester at the camera end of the cable.', tool: 'PoE tester', expect: (c) => `Enough PoE class for the camera (${String(c.s['PoE class'] ?? 'see datasheet')}${c.s['Power (W)'] ? `, about ${c.s['Power (W)']} W` : ''}); IR and heaters draw more at night.`, ifFail: 'Check the switch budget and the cable; replace a bad injector.' },
        { check: 'Network', how: 'Ping the camera and check the switch port and VLAN.', expect: () => 'Camera answers with no packet loss.', ifFail: 'Check addressing, VLAN and cable (certify it).' },
        { check: 'Recorder settings', how: 'Check the channel in the NVR: address, user name, stream settings.', expect: () => 'Channel online and recording.', ifFail: 'Re-add the camera; update firmware on both.' },
      ] },
      { id: 'image', label: 'Poor image (night, blur, glare)', steps: [
        { check: 'Pixel density on the target', how: 'Use the field-of-view calculator for the lens and distance.', expect: (c) => `Enough for the task (identify 250 px/m, recognize 125). Camera: ${String(c.s['Resolution (px)'] ?? 'see datasheet')}.`, ifFail: 'Zoom in, use a longer lens or a higher-resolution camera, or move it closer.' },
        { check: 'IR reflection and dirt', how: 'Clean the dome; look for walls, eaves or the dome bubble reflecting IR.', expect: () => 'Clear night image without white haze.', ifFail: 'Re-seat the dome liner, move the camera, or add an external IR light.' },
        { check: 'Settings', how: 'Check focus, WDR, shutter and bitrate.', expect: () => 'Sharp focus; WDR on for backlit scenes; bitrate high enough for motion.', ifFail: 'Adjust settings; refocus at night with IR on.' },
      ] },
    ] },
  { id: 'audio', title: 'Paging, sound and intercom', categories: ['Paging & sound', 'Intercom'], safety: '70 V lines carry enough voltage to shock; turn the amplifier off before working on them.',
    symptoms: [
      { id: 'noaudio', label: 'No sound or weak sound in a zone', steps: [
        { check: 'Speaker line impedance', how: 'Disconnect the line at the amplifier and measure with an impedance meter (not an ohmmeter).', tool: 'Speaker impedance meter',
          expect: (c) => `About V² ÷ total taps (70.7 V with 60 W of taps ≈ 83 Ω).${c.s['Taps (W)'] ? ` Speaker taps: ${c.s['Taps (W)']} W.` : ''}`, ifFail: 'Much lower: a short or too many taps. Infinite: an open line. Split the line to find it.' },
        { check: 'Amplifier load and protection', how: 'Read the amplifier status; total the taps.', expect: () => 'Taps total 80% of the rating or less; no protect light.', ifFail: 'Lower taps or add amplifier capacity.' },
        { check: 'Sound level in the space', how: 'Play pink noise and measure.', tool: 'Sound level meter', expect: () => '10–15 dB above ambient for paging; even within about ±3 dB across the zone.', ifFail: 'Raise taps, add speakers or re-aim horns.' },
      ] },
      { id: 'hum', label: 'Hum, buzz or one-way audio', steps: [
        { check: 'Grounding and shields', how: 'Check that shields are terminated at one end only and the rack has one ground point.', expect: () => 'No hum with inputs muted.', ifFail: 'Lift the shield at the far end; use isolation transformers on unbalanced feeds.' },
        { check: 'Station wiring (intercom)', how: 'Swap the station with a known good one; check the pair.', tool: 'Multimeter / tone tracer', expect: (c) => `Within the maker\'s distance and cable (${String(c.s['Cable'] ?? 'see datasheet')}).`, ifFail: 'Replace the station or re-run the cable.' },
        { check: 'IP / SIP (IP intercoms and paging)', how: 'Check PoE, VLAN, SIP registration and codecs.', expect: () => 'Registered, matching codecs, no packet loss.', ifFail: 'Fix network settings; open RTP ports.' },
      ] },
    ] },
  { id: 'nursecall', title: 'Nurse call', categories: ['Nurse call'], safety: 'Tell the unit staff before testing and keep patient call coverage during repairs.',
    symptoms: [
      { id: 'station', label: 'Station or dome light not working', steps: [
        { check: 'Station status at the console', how: 'Look for the station supervision fault on the master or software.', expect: () => 'Every station shows online.', ifFail: 'Check the station connection and address.' },
        { check: 'Station power and bus', how: 'Measure voltage at the station and check the bus or network connection.', tool: 'Multimeter', expect: (c) => `${String(c.s['Power'] ?? '24 V DC')} within the maker\'s range.`, ifFail: 'Find the open or short on the bus; replace the station.' },
        { check: 'Call test', how: 'Place each call type (normal, bath, code) and cancel at the station.', expect: () => 'Dome light, console and phones respond with the right priority.', ifFail: 'Check programming and the integration server.' },
      ] },
    ] },
  { id: 'callbox', title: 'Emergency call boxes', categories: ['Emergency call boxes'], safety: 'Tell the answering point before test calls.',
    symptoms: [
      { id: 'nocall', label: 'Call does not connect', steps: [
        { check: 'Cellular signal', how: 'Read the signal level in the box diagnostics or with a meter at the box.', tool: 'Cellular signal meter', expect: () => 'Better than about −95 dBm RSRP (LTE), or the maker\'s minimum.', ifFail: 'Add a high-gain antenna or move to another carrier.' },
        { check: 'Battery under load', how: 'Measure battery voltage while a call is in progress.', tool: 'Multimeter', expect: (c) => `Stays above about 12 V during the call (call current ${String(c.s['Call current (mA)'] ?? 'per datasheet')} mA).`, ifFail: 'Replace the battery; check solar charging.' },
        { check: 'Programming', how: 'Check the dial-out number and location message.', expect: () => 'Calls the right number and plays the right location.', ifFail: 'Reprogram the box.' },
      ] },
      { id: 'solar', label: 'Battery not charging / light out', steps: [
        { check: 'Solar panel output', how: 'Measure panel open-circuit voltage in sun; check for shade and dirt.', tool: 'Multimeter', expect: () => 'Near the panel Voc (about 21–22 V for a 12 V panel).', ifFail: 'Clean, re-aim south, trim trees, or replace the panel.' },
        DC('Charge controller output'),
      ] },
    ] },
);

const GENERIC: Guide = { id: 'generic', title: 'General equipment', categories: [], safety: 'Follow the manufacturer manual and lock out power before working inside equipment.',
  symptoms: [{ id: 'gen', label: 'Not working / intermittent', steps: [
    DC('Equipment'),
    { check: 'Indicators and logs', how: 'Read status lights, the display and the event log.', expect: () => 'Normal status; no alarms.', ifFail: 'Look up the alarm code in the manual.' },
    { check: 'Connections', how: 'Check each cable and terminal for damage, looseness and correct polarity.', expect: () => 'Tight, correct and undamaged.', ifFail: 'Re-terminate or replace.' },
  ] }] };

export function guideFor(it: SpecItem): Guide {
  return GUIDES.find((g) => g.categories.includes(it.category)) ?? GENERIC;
}
export const ALL_GUIDES = [...GUIDES, GENERIC];
