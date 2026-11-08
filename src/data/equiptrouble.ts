// Equipment-specific troubleshooting: problems and checks for one kind of device (a smoke detector,
// a maglock, an IP camera, a PoE switch...), shown before the general system checks in the wizard.
import type { SpecItem } from './speclib';
import type { Symptom } from './troubleshoot';

export interface EquipType { id: string; label: string; system: string; match: RegExp; symptoms: Symptom[] }
const st = (check: string, how: string, expect: string, ifFail: string, tool?: string) => ({ check, how, expect: () => expect, ifFail, tool });

export const EQUIP_TYPES: EquipType[] = [
  { id: 'smoke', label: 'Smoke detector', system: 'firealarm', match: /smoke|photoelectric|ionization/i, symptoms: [
    { id: 'eq-smoke-false', label: 'Smoke detector: false or nuisance alarms', steps: [
      st('Location', 'Compare the location with supply diffusers, kitchens, showers, dusty or humid areas.', 'At least 36 in. from supply diffusers; not in steam, cooking or dust (NFPA 72 Ch. 17).', 'Relocate, or use heat detection where smoke detectors are not suited.'),
      st('Sensitivity / dirty head', 'Read the drift or sensitivity from the panel, or test with a listed tester.', 'Within the listed range on the label; no "dirty" or "maintenance" alert.', 'Clean per the manual or replace the head.', 'Panel report / sensitivity tester'),
      st('Age', 'Read the date code on the head.', 'Under the manufacturer life (often 10 years).', 'Replace the head.'),
      st('Insects and construction dust', 'Remove the head and look inside the chamber and screen.', 'Clean chamber and screen.', 'Clean or replace; keep covers on during construction.')] },
    { id: 'eq-smoke-trouble', label: 'Smoke detector: trouble, missing or invalid reply', steps: [
      st('Head seated in base', 'Remove and reseat the head; check base terminals.', 'Head locks fully; tight terminals.', 'Reseat or replace the base.'),
      st('Address', 'Read the address on the head and compare with the panel point list.', 'Unique address that matches the program; no duplicates.', 'Set the right address; clear duplicates.'),
      st('SLC voltage at the base', 'Measure loop voltage at the base.', 'Within the panel’s SLC range (see panel manual).', 'Find the open or high resistance splice upstream.', 'Multimeter')] }] },
  { id: 'hornstrobe', label: 'Horn / strobe / speaker-strobe', system: 'firealarm', match: /horn|strobe|notification appliance|speaker\/strobe/i, symptoms: [
    { id: 'eq-hs-dead', label: 'Horn/strobe: does not sound or flash', steps: [
      st('Voltage at the device in alarm', 'Activate the NAC and measure at the device terminals.', 'At or above the listed minimum (often 16 V DC).', 'Voltage drop or open circuit upstream; check splices and wire size.', 'Multimeter'),
      st('Polarity', 'Check + and − at the device against the panel.', 'Correct polarity (devices are polarized).', 'Swap the conductors at the device.'),
      st('Candela / sync settings', 'Check the switch setting and the sync module or panel sync type.', 'Setting matches the drawings; one sync protocol per circuit.', 'Set candela and sync to match the panel / sync module.')] },
    { id: 'eq-hs-sync', label: 'Strobes flash out of sync', steps: [
      st('Sync source', 'Confirm one sync source per area (panel NAC or sync module).', 'All strobes in view share one sync protocol.', 'Use the same manufacturer’s sync on circuits in the same view.'),
      st('Mixed brands', 'Check device brands in the area.', 'One manufacturer per sync circuit.', 'Replace mismatched devices.')] }] },
  { id: 'pull', label: 'Manual pull station', system: 'firealarm', match: /pull station|manual station/i, symptoms: [
    { id: 'eq-pull', label: 'Pull station: no alarm at the panel', steps: [
      st('Station reset and key', 'Open with the key; check the switch and reset.', 'Switch operates; station resets.', 'Replace the switch or station.'),
      st('Module address / zone', 'Compare address or zone with the panel.', 'Matches the program.', 'Correct the address or wiring.')] }] },
  { id: 'facp', label: 'Fire alarm control panel', system: 'firealarm', match: /control (panel|unit)|facp/i, symptoms: [
    { id: 'eq-facp-ac', label: 'Panel: AC power trouble', steps: [
      st('Branch circuit', 'Check the dedicated breaker and lock.', 'Breaker on, marked red and locked (NFPA 72 10.6.5).', 'Reset the breaker; find the overload.'),
      st('Input voltage', 'Measure AC at the panel terminals.', '120 V ±10 %.', 'Electrician to repair the supply.', 'Multimeter')] },
    { id: 'eq-facp-batt', label: 'Panel: battery trouble', steps: [
      st('Battery voltage on charge', 'Measure across the series pair.', 'About 27.0–27.6 V DC float for 24 V.', 'Charger fault or bad battery.', 'Multimeter'),
      st('Battery age and load test', 'Read the date; run a load test.', 'Under about 4–5 years and passes the load test.', 'Replace both batteries.', 'Battery load tester')] }] },
  { id: 'maglock', label: 'Electromagnetic lock', system: 'access', match: /maglock|electromagnetic lock|mag lock/i, symptoms: [
    { id: 'eq-mag-hold', label: 'Maglock: weak hold or door pulls open', steps: [
      st('Armature alignment', 'Check that the armature sits flat and fully on the magnet face.', 'Full contact; armature floats on its rubber washers.', 'Re-align; replace the washers.'),
      st('Voltage at the lock', 'Measure at the lock terminals while locked.', 'Rated voltage ±10 % (12 or 24 V DC as jumpered).', 'Fix the supply or wire size; check the jumper.', 'Multimeter'),
      st('Dirty or rusty faces', 'Inspect the magnet and armature faces.', 'Clean and smooth.', 'Clean; replace if pitted.')] },
    { id: 'eq-mag-release', label: 'Maglock: will not release', steps: [
      st('REX and fire alarm release', 'Trigger the REX, the push button and the fire alarm relay one at a time.', 'Each removes power from the lock.', 'Fix the relay or wiring; the lock must release on fire alarm where required.'),
      st('Residual magnetism', 'Check for a stuck armature with power off.', 'Releases immediately with power off.', 'Check the diode / MOV and bond sensor; replace the lock.')] }] },
  { id: 'strike', label: 'Electric strike', system: 'access', match: /electric strike/i, symptoms: [
    { id: 'eq-strike', label: 'Electric strike: does not unlock', steps: [
      st('Pre-load', 'Push the door closed hard and try again.', 'Unlocks with normal pressure.', 'Adjust the strike or door closer; use a strike rated for pre-load.'),
      st('Voltage and type', 'Measure at the strike while unlocking; check fail-safe / fail-secure setting.', 'Rated voltage; AC or DC as the strike requires.', 'Set the correct mode and supply.', 'Multimeter')] }] },
  { id: 'reader', label: 'Card reader', system: 'access', match: /reader|osdp|wiegand/i, symptoms: [
    { id: 'eq-reader', label: 'Card reader: cards not read or rejected', steps: [
      st('Reader LED and beep', 'Present a card and watch the LED.', 'Beep and LED change on every read.', 'No read: check power and the card technology (prox vs smart).'),
      st('Wiring / protocol', 'Check D0/D1 (Wiegand) or A/B (OSDP), shield and distance.', 'Correct pairs; Wiegand ≤ 500 ft, OSDP ≤ 4,000 ft.', 'Fix wiring; set the OSDP address and baud.'),
      st('Card format and access rights', 'Check the event log for the card number and reason.', 'Granted, with the expected format.', 'Add the format or rights in the software.')] }] },
  { id: 'camera', label: 'IP camera', system: 'cctv', match: /camera/i, symptoms: [
    { id: 'eq-cam-video', label: 'Camera: no video or offline', steps: [
      st('PoE power', 'Check the switch port PoE status and the camera LED.', 'Port delivers the PoE class the camera needs.', 'Raise the PoE budget or class; test with a PoE tester.', 'PoE tester'),
      st('Link and IP', 'Ping the camera; check the switch port link and VLAN.', 'Link up at the right speed; replies to ping.', 'Re-terminate the cable; fix the IP or VLAN.'),
      st('Recorder channel', 'Check the NVR channel credentials and stream settings.', 'Channel online with the right password.', 'Update credentials; re-add the camera.')] },
    { id: 'eq-cam-night', label: 'Camera: poor night image', steps: [
      st('IR range and reflections', 'Look for IR reflection off the dome, eaves or nearby walls.', 'No glare; scene within the IR range on the datasheet.', 'Move the camera, clean the dome, add lighting.'),
      st('Shutter and gain', 'Check exposure settings.', 'Auto or a shutter fast enough for motion (often 1/30 s or faster).', 'Adjust settings or add light.')] }] },
  { id: 'nvr', label: 'Video recorder (NVR / VMS)', system: 'cctv', match: /nvr|recorder|vms|storage/i, symptoms: [
    { id: 'eq-nvr', label: 'Recorder: not recording or gaps', steps: [
      st('Disk status', 'Read disk health in the recorder.', 'All disks normal; no read/write errors.', 'Replace the failed disk; check RAID rebuild.'),
      st('Retention vs bitrate', 'Compare retention days with storage and camera bitrates.', 'Meets the required retention.', 'Lower bitrate / fps, use H.265, or add storage (Calculators → video storage).'),
      st('Time and schedule', 'Check the time source and recording schedule.', 'Correct time (NTP); schedule covers the hours needed.', 'Set NTP; fix the schedule.')] }] },
  { id: 'pir', label: 'Motion detector', system: 'security', match: /motion|pir|dual.?tech/i, symptoms: [
    { id: 'eq-pir', label: 'Motion detector: false alarms or no detection', steps: [
      st('Mounting height and aim', 'Compare with the pattern drawing on the datasheet.', 'Height and aim as shown; no heat sources or windows in view.', 'Re-mount or re-aim; use a pet-immune model.'),
      st('Walk test', 'Put the detector in walk test and cross the pattern.', 'LED on every crossing at the expected range.', 'Adjust sensitivity or replace.')] }] },
  { id: 'contact', label: 'Door contact', system: 'security', match: /door contact|magnetic contact|reed/i, symptoms: [
    { id: 'eq-contact', label: 'Door contact: zone open or chattering', steps: [
      st('Gap', 'Measure the magnet-to-switch gap with the door closed.', 'Within the rated gap (often ½–1 in. for surface, less for recessed).', 'Re-align or use a wide-gap contact.'),
      st('EOL and loop', 'Measure loop resistance at the panel with the door closed.', 'Equals the EOL value.', 'Fix the splice or EOL.')] }] },
  { id: 'switch', label: 'PoE switch', system: 'cabling', match: /switch/i, symptoms: [
    { id: 'eq-switch-poe', label: 'Switch: devices not powered by PoE', steps: [
      st('PoE budget', 'Read used and available PoE power on the switch.', 'Used power under the budget with headroom.', 'Move devices to another switch or raise the budget.'),
      st('Port PoE mode', 'Check the port is PoE-enabled and the class/standard matches.', 'Enabled; 802.3af/at/bt as the device needs.', 'Enable PoE; use a bt port for Type 3/4 devices.'),
      st('Cable', 'Test the link with a cable certifier or qualifier.', 'Passes; under 100 m channel.', 'Re-terminate or replace the cable.', 'Cable tester')] }] },
  { id: 'wap', label: 'Wi-Fi access point', system: 'wifi', match: /access point|\bwap\b|\bap\b|wi-?fi/i, symptoms: [
    { id: 'eq-wap', label: 'Access point: weak or dropping Wi-Fi', steps: [
      st('Signal at the client', 'Measure RSSI and SNR where users complain.', 'At least −67 dBm and 25 dB SNR for voice/video.', 'Add or move APs; check mounting orientation.', 'Wi-Fi analyzer'),
      st('Channel overlap', 'Check co-channel APs.', 'Few same-channel APs heard above −85 dBm.', 'Re-plan channels and power.')] }] },
  { id: 'bda', label: 'BDA / signal booster', system: 'erces', match: /bda|booster|amplifier|class [ab]/i, symptoms: [
    { id: 'eq-bda-osc', label: 'BDA: oscillation or shutting down', steps: [
      st('Isolation', 'Measure donor-to-server isolation.', 'At least 15–20 dB more than the BDA gain.', 'Separate antennas, add shielding or lower gain.'),
      st('Donor signal', 'Measure donor signal level at the BDA input.', 'Within the BDA input range (manual).', 'Re-aim the donor antenna or add attenuation.')] }] },
  { id: 'repeater', label: 'Repeater / base station', system: 'radio', match: /repeater|base station/i, symptoms: [
    { id: 'eq-rpt-desense', label: 'Repeater: short range or desense', steps: [
      st('Desense test', 'Measure receiver sensitivity with and without the transmitter keyed.', 'Less than about 1 dB difference.', 'Tune or replace the duplexer; check connectors and antenna.', 'Service monitor'),
      st('Reflected power', 'Measure forward and reflected power.', 'VSWR under about 1.5:1.', 'Find the bad connector, cable or antenna (DTF sweep).', 'Wattmeter / analyzer')] }] },
  { id: 'speaker', label: 'Speaker / amplifier (70 V)', system: 'paging', match: /speaker|amplifier|horn \(paging\)|paging horn/i, symptoms: [
    { id: 'eq-spk', label: 'Paging: no audio or distortion', steps: [
      st('Line impedance', 'With the amplifier disconnected, measure the speaker line with an impedance meter.', 'Close to V² / total taps; no short.', 'Find the shorted speaker or splice.', 'Impedance meter'),
      st('Amplifier loading', 'Add the tap watts on the line.', 'Under about 80 % of the amplifier rating.', 'Lower taps or add amplifier power.')] }] },
  { id: 'ncstation', label: 'Nurse call station', system: 'nursecall', match: /patient station|pull.?cord|nurse/i, symptoms: [
    { id: 'eq-nc', label: 'Nurse call station: call not reaching staff', steps: [
      st('Station test', 'Place a call and watch the dome light and console.', 'Call shows at the console and dome light.', 'Check station wiring and the room controller.'),
      st('Pillow speaker / cord', 'Swap in a known-good cord.', 'Calls work with the known-good cord.', 'Replace the cord.')] }] },
  { id: 'battery', label: 'Battery (sealed lead-acid)', system: 'firealarm', match: /battery|sla|agm|lead.?acid/i, symptoms: [
    { id: 'eq-batt', label: 'Battery: low or fails load test', steps: [
      st('Open-circuit voltage', 'Disconnect and rest, then measure.', 'About 12.8–13.0 V for a charged 12 V SLA.', 'Charge and retest; replace if it will not hold.', 'Multimeter'),
      st('Load test', 'Load at the manufacturer rate.', 'Holds voltage for the test time.', 'Replace the set.', 'Battery load tester')] }] },
];

/** The equipment type for a library item, from its device type, subcategory and model. */
export function equipTypeOf(it: SpecItem): EquipType | undefined {
  const text = `${it.specs?.['Device type'] ?? ''} ${it.sub ?? ''} ${it.model ?? ''}`;
  return EQUIP_TYPES.find((e) => e.match.test(text));
}
