import React, { useState } from 'react';
import { FullView } from '../components/FullView';
import { useStore } from '../store';
import { Card } from '../components/ui';
import { projectSystems } from '../data/systems';
import { ANTENNAS, FEEDERS, byId } from '../data/catalog';

// Wire colors used in every diagram (and the legend).
const C = {
  coax: '#5f6b7a', ground: '#1f9d3a', pos: '#d62828', neg: '#1b1b1b', ac: '#8a5a00', data: '#1565c0', fiber: '#e0a800',
  nac: '#d62828', slc: '#7b1fa2', relay: '#ef6c00', pv: '#f9a825',
  box: 'var(--diag-box, #eef3f9)', stroke: 'var(--diag-stroke, #33475b)', text: 'var(--diag-text, #1d2733)',
};
type Wire = { d: string; c: string; w?: number; dash?: string };
function Diagram({ title, w = 760, h, boxes, wires, labels = [], legend }: {
  title: string; w?: number; h: number;
  boxes: { x: number; y: number; w: number; h: number; t: string; s?: string; fill?: string }[];
  wires: Wire[]; labels?: { x: number; y: number; t: string; c?: string; a?: 'start' | 'middle' | 'end' }[];
  legend: [string, string][];
}) {
  return (
    <FullView title={title}><figure className="diagram">
      <svg viewBox={`0 0 ${w} ${h + 34}`} role="img" aria-label={title}>
        <title>{title}</title>
        {wires.map((x, i) => <path key={i} d={x.d} fill="none" stroke={x.c} strokeWidth={x.w ?? 4} strokeDasharray={x.dash} strokeLinecap="round" strokeLinejoin="round" />)}
        {boxes.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={7} fill={b.fill ?? C.box} stroke={C.stroke} strokeWidth={1.5} />
            <text x={b.x + b.w / 2} y={b.y + (b.s ? b.h / 2 - 3 : b.h / 2 + 4)} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={C.text}>{b.t}</text>
            {b.s && <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 12} textAnchor="middle" fontSize={10.5} fill={C.text}>{b.s}</text>}
          </g>))}
        {labels.map((l, i) => <text key={i} x={l.x} y={l.y} fontSize={11} fill={l.c ?? C.text} textAnchor={l.a ?? 'start'}>{l.t}</text>)}
        <g transform={`translate(8, ${h + 12})`}>
          {legend.map(([c, t], i) => <g key={t} transform={`translate(${i * (w / Math.max(legend.length, 1))}, 0)`}><line x1={0} y1={6} x2={26} y2={6} stroke={c} strokeWidth={5} strokeLinecap="round" /><text x={32} y={10} fontSize={11} fill={C.text}>{t}</text></g>)}
        </g>
      </svg>
      <figcaption>{title}</figcaption>
    </figure></FullView>
  );
}

export interface Guide { id: string; title: string; applies: string; tools: string[]; safety: string[]; steps: string[]; test: string[]; codes: string[]; diagram: (ctx: Ctx) => React.ReactNode }
export interface Ctx { ant: string; feeder: string; battAh: string }

export const GUIDES: Guide[] = [
  {
    id: 'antenna', title: 'Antenna, feedline and grounding', applies: 'Tower, pole or rooftop antenna with coax to an equipment room or cabinet',
    tools: ['Torque wrench and connector tools for the cable type', 'Cable cutter / prep tool', 'Weatherproofing kit (butyl + cold shrink or tape)', 'Grounding kits (top, bottom, entry)', 'Cable/antenna analyzer'],
    safety: ['Climbing only by trained, certified climbers with 100 % tie-off.', 'Check RF exposure: power down or lock out nearby transmitters before working near antennas.', 'Never work on towers or rooftops during lightning or high wind.'],
    steps: [
      'Assemble and mount the antenna at the height and azimuth on the plan. Check plumb (omni) or azimuth and downtilt (panel) with a compass / inclinometer.',
      'Connect a short jumper from the antenna to the main feedline. Torque connectors to the manufacturer value.',
      'Weatherproof every outdoor connection: tape or butyl, then cold shrink, sealed upward so water runs off.',
      'Run the feedline down the tower with a hanger every 3 ft (or per datasheet). Keep the minimum bend radius.',
      'Install a grounding kit near the top of the run, one at the bottom before the cable leaves the tower, and one at the building entry. Bond each to the tower or ground bar with the conductor going downward, no sharp bends.',
      'Make a drip loop below the entry port. Seal the entry port.',
      'Inside, mount the coax surge protector on the master ground bar right at the entry. Connect the equipment jumper from the protector to the radio or duplexer.',
      'Bond the master ground bar to the building grounding electrode system and the tower ground ring with a short, straight conductor.',
    ],
    test: ['Sweep the line: return loss / VSWR across the band (e.g. better than 1.5:1).', 'Distance-to-fault test and save the trace for the closeout package.', 'Measure ground resistance of the ground ring (target set by the plan, often 5 Ω or less).', 'Photograph each connector, ground kit and the entry before closing up.'],
    codes: ['NEC Article 810 (radio and television equipment)', 'NEC Article 250 (grounding and bonding)', 'Motorola R56 (site grounding and installation)', 'TIA-222-H (structures)'],
    diagram: ({ ant, feeder }) => (
      <Diagram title="Antenna system: feedline, surge protection and grounding" h={330}
        boxes={[{ x: 40, y: 20, w: 150, h: 46, t: 'Antenna', s: ant }, { x: 300, y: 250, w: 170, h: 50, t: 'Master ground bar', s: 'at building entry' },
          { x: 300, y: 170, w: 170, h: 46, t: 'Coax surge protector' }, { x: 570, y: 160, w: 160, h: 66, t: 'Radio / duplexer', s: 'equipment rack' },
          { x: 20, y: 280, w: 200, h: 34, t: 'Tower ground ring + rods' }, { x: 560, y: 270, w: 180, h: 40, t: 'Building electrode system' }]}
        wires={[{ d: 'M115 66 V 190 H 300', c: C.coax, w: 6 }, { d: 'M470 193 H 570', c: C.coax, w: 5 },
          { d: 'M115 92 H 70 V 280', c: C.ground }, { d: 'M115 160 H 70', c: C.ground }, { d: 'M385 216 V 250', c: C.ground },
          { d: 'M300 280 H 220', c: C.ground }, { d: 'M470 280 H 560', c: C.ground }, { d: 'M650 226 V 250 H 470', c: C.ground, dash: '6 4' }]}
        labels={[{ x: 122, y: 120, t: feeder }, { x: 76, y: 88, t: 'Ground kit (top)', c: C.ground }, { x: 76, y: 156, t: 'Ground kit (bottom)', c: C.ground }, { x: 200, y: 184, t: 'Drip loop + entry port' }, { x: 478, y: 245, t: 'Rack bond' }]}
        legend={[[C.coax, 'Coax feedline'], [C.ground, 'Ground / bond (green)']]} />),
  },
  {
    id: 'repeater', title: 'Repeater or base station power and RF', applies: 'Two-way radio repeater with duplexer, DC power supply and battery backup',
    tools: ['Multimeter', 'Watt meter with dummy load', 'Crimp tools for DC lugs', 'Service monitor (frequency, deviation, sensitivity)'],
    safety: ['Batteries can deliver very high current: insulated tools, remove rings and watches.', 'Fuse the battery positive within 18 in. of the terminal.', 'Never key the transmitter into an open or unknown antenna port.'],
    steps: [
      'Mount the repeater, duplexer and power supply in the rack. Bond the rack to the ground bar.',
      'Tune or verify the duplexer for the TX and RX frequencies on the license.',
      'Connect TX → duplexer TX port and RX → duplexer RX port with double-shielded jumpers. Duplexer ANT → surge protector → feedline.',
      'Wire DC: power supply + (red) and − (black) to the repeater through a fuse or breaker sized to the radio’s TX current.',
      'Connect the battery bank to the supply’s battery terminals through a fuse or DC breaker. Check polarity twice before connecting.',
      'Set the supply’s float voltage for the battery type (lead-acid AGM is typically 13.5–13.8 V per 12 V at 25 °C).',
      'Program the radio (frequencies, tones / NAC, ID), then key into a dummy load to check power before connecting the antenna.',
    ],
    test: ['Forward / reflected power at the duplexer ANT port.', 'Receiver sensitivity with TX keyed (desense check).', 'Pull AC: confirm the repeater stays on battery and log the run time.', 'Record all readings on the Final Testing page.'],
    codes: ['47 CFR Part 90 (license conditions)', 'NEC Article 480 (storage batteries)', 'NEC Article 810', 'Motorola R56'],
    diagram: ({ battAh }) => (
      <Diagram title="Repeater: RF path and DC power with battery backup" h={300}
        boxes={[{ x: 20, y: 20, w: 150, h: 60, t: 'Repeater', s: 'TX / RX' }, { x: 260, y: 20, w: 150, h: 60, t: 'Duplexer' }, { x: 500, y: 25, w: 120, h: 50, t: 'Surge protector' }, { x: 660, y: 25, w: 90, h: 50, t: 'To antenna' },
          { x: 20, y: 160, w: 170, h: 56, t: 'DC power supply', s: 'with battery charger' }, { x: 300, y: 160, w: 120, h: 56, t: 'Fuse / breaker' }, { x: 520, y: 150, w: 170, h: 76, t: 'Battery bank', s: battAh }, { x: 20, y: 250, w: 170, h: 34, t: '120 V AC outlet' }]}
        wires={[{ d: 'M170 40 H 260', c: C.coax, w: 5 }, { d: 'M170 62 H 260', c: C.coax, w: 5 }, { d: 'M410 50 H 500', c: C.coax, w: 6 }, { d: 'M620 50 H 660', c: C.coax, w: 6 },
          { d: 'M60 160 V 80', c: C.pos }, { d: 'M90 160 V 80', c: C.neg }, { d: 'M190 178 H 300', c: C.pos }, { d: 'M420 178 H 520', c: C.pos }, { d: 'M190 200 H 520', c: C.neg },
          { d: 'M105 250 V 216', c: C.ac }]}
        labels={[{ x: 215, y: 35, t: 'TX', a: 'middle' }, { x: 215, y: 76, t: 'RX', a: 'middle' }, { x: 66, y: 125, t: '+', c: C.pos }, { x: 96, y: 125, t: '−' }]}
        legend={[[C.coax, 'Coax'], [C.pos, 'DC + (red)'], [C.neg, 'DC − (black)'], [C.ac, 'AC power']]} />),
  },
  {
    id: 'erces', title: 'ERCES / in-building public safety radio (BDA + DAS)', applies: 'Emergency responder radio coverage system with a signal booster and indoor antennas',
    tools: ['Spectrum analyzer or signal meter for the public safety bands', 'Coax tools and connectors', 'Labels and fire-rated sealant', 'Grid test map of each floor'],
    safety: ['Get written consent / retransmission agreement from the radio system licensee before turning the BDA on (47 CFR 90.219).', 'Keep donor and server antennas isolated (≥ 15 dB more than the BDA gain) to avoid oscillation.'],
    steps: [
      'Install the donor antenna on the roof aimed at the serving radio site. Ground it like any outdoor antenna.',
      'Run the donor cable through a surge protector into the BDA room. Use 2-hour rated pathway or a rated enclosure where the plan calls for it.',
      'Mount the BDA and its battery backup (sized for the required standby, commonly 12 or 24 hours) in a NEMA 4 type enclosure if required by the AHJ.',
      'Install splitters / couplers and run the DAS coax to each indoor antenna per the floor plans. Label every cable at both ends.',
      'Wire the BDA alarm contacts to the fire alarm panel: antenna malfunction, BDA failure, loss of AC, low battery, charger failure (and donor antenna, where required).',
      'Set gains and output levels so downlink at the edge meets the design target without overdriving.',
      'Fill in the annunciator / dedicated panel and the as-built drawings.',
    ],
    test: ['Grid test each floor: the critical areas and general building at the required percentages.', 'Verify every supervisory signal at the fire alarm panel.', 'Measure isolation between donor and server antennas.', 'Battery run-time test for the required hours.'],
    codes: ['IFC Section 510 (ERCES)', 'NFPA 1225 (formerly NFPA 1221 Chapter 9; check the edition adopted)', 'NFPA 72 (monitoring)', '47 CFR 90.219 (signal boosters)'],
    diagram: () => (
      <Diagram title="ERCES: donor antenna, BDA, DAS antennas and fire alarm monitoring" h={330}
        boxes={[{ x: 20, y: 20, w: 140, h: 46, t: 'Donor antenna', s: 'roof, aimed at site' }, { x: 220, y: 22, w: 120, h: 42, t: 'Surge protector' }, { x: 400, y: 10, w: 170, h: 76, t: 'BDA (signal booster)', s: 'Class A / B' },
          { x: 630, y: 22, w: 120, h: 46, t: 'Battery backup' }, { x: 400, y: 140, w: 170, h: 44, t: 'Splitter / coupler' },
          { x: 230, y: 240, w: 120, h: 44, t: 'DAS antenna', s: 'Floor 1' }, { x: 425, y: 240, w: 120, h: 44, t: 'DAS antenna', s: 'Floor 2' }, { x: 620, y: 240, w: 120, h: 44, t: 'DAS antenna', s: 'Stairwell' },
          { x: 20, y: 150, w: 170, h: 66, t: 'Fire alarm panel', s: 'supervisory inputs', fill: 'var(--diag-alarm, #fde2e1)' }]}
        wires={[{ d: 'M160 43 H 220', c: C.coax, w: 6 }, { d: 'M340 43 H 400', c: C.coax, w: 6 }, { d: 'M485 86 V 140', c: C.coax, w: 5 },
          { d: 'M485 184 V 210 H 290 V 240', c: C.coax, w: 4 }, { d: 'M485 210 V 240', c: C.coax, w: 4 }, { d: 'M485 210 H 680 V 240', c: C.coax, w: 4 },
          { d: 'M570 40 H 630', c: C.pos }, { d: 'M570 56 H 630', c: C.neg },
          { d: 'M400 60 H 370 V 172 H 190', c: C.relay, dash: '8 5' }]}
        labels={[{ x: 198, y: 194, t: 'Alarm contacts: BDA fail, antenna,', c: C.relay }, { x: 198, y: 208, t: 'AC power, battery, charger', c: C.relay }]}
        legend={[[C.coax, 'Coax'], [C.relay, 'Supervisory (alarm) wiring'], [C.pos, 'DC +'], [C.neg, 'DC −']]} />),
  },
  {
    id: 'nac', title: 'Fire alarm notification circuit (NAC)', applies: 'Horn / strobe circuit from a fire alarm panel or NAC power extender (Class B)',
    tools: ['Multimeter', 'Fire alarm cable (FPL / FPLR / FPLP as required)', 'End-of-line resistor from the panel manufacturer', 'Candela / sound level meter'],
    safety: ['Notify the monitoring company and building occupants before testing.', 'Use only devices listed as compatible with the panel.'],
    steps: [
      'Calculate the circuit: total alarm current of all devices and voltage drop at the last device (use the Alarm Systems page).',
      'Pull the cable in a loop from the panel NAC output to each device. Keep + and − polarity consistent (red = +, black = −).',
      'At each device, land the incoming and outgoing conductors on separate terminals (no T-taps on a Class B NAC).',
      'Install the manufacturer’s end-of-line resistor at the last device.',
      'Set strobe candela and horn tone / volume per the plan; synchronize strobes in the same view.',
      'Land the circuit on the panel NAC terminals and clear the trouble.',
    ],
    test: ['Remove the EOL resistor: the panel must show a trouble.', 'Activate: every device sounds and flashes, strobes are synchronized.', 'Measure voltage at the last device under alarm.', 'Battery calculation and 24 h standby + alarm test per the plan.'],
    codes: ['NFPA 72 (Chapter 18 notification appliances; Chapter 10 power)', 'NEC Article 760 (fire alarm circuits)', 'ADA Standards (visible notification)'],
    diagram: () => (
      <Diagram title="Class B NAC: panel, horn/strobes in a loop, end-of-line resistor" h={250}
        boxes={[{ x: 20, y: 60, w: 160, h: 90, t: 'Fire alarm panel', s: 'NAC 1 (+ / −)', fill: 'var(--diag-alarm, #fde2e1)' }, { x: 250, y: 70, w: 110, h: 70, t: 'Horn / strobe', s: '15 cd' },
          { x: 420, y: 70, w: 110, h: 70, t: 'Horn / strobe', s: '75 cd' }, { x: 590, y: 70, w: 110, h: 70, t: 'Horn / strobe', s: 'last device' }, { x: 610, y: 190, w: 70, h: 34, t: 'EOL' }]}
        wires={[{ d: 'M180 90 H 250', c: C.nac }, { d: 'M180 120 H 250', c: C.neg }, { d: 'M360 90 H 420', c: C.nac }, { d: 'M360 120 H 420', c: C.neg }, { d: 'M530 90 H 590', c: C.nac }, { d: 'M530 120 H 590', c: C.neg },
          { d: 'M700 90 H 730 V 207 H 680', c: C.nac }, { d: 'M645 140 V 165 H 595 V 207 H 610', c: C.neg }]}
        labels={[{ x: 200, y: 84, t: '+', c: C.nac }, { x: 200, y: 136, t: '−' }, { x: 560, y: 236, t: 'End-of-line resistor at the LAST device', a: 'end' }]}
        legend={[[C.nac, 'NAC + (red)'], [C.neg, 'NAC − (black)']]} />),
  },
  {
    id: 'solar', title: 'Off-grid solar power for a remote site', applies: 'PV array, charge controller and battery bank powering radio equipment',
    tools: ['DC clamp meter', 'MC4 crimp and disconnect tools', 'Torque screwdriver', 'Irradiance meter (optional)'],
    safety: ['PV modules make voltage whenever light hits them: cover them or open the disconnect before wiring.', 'Use DC-rated breakers and fuses only.'],
    steps: [
      'Mount the array facing true south (in NC/SC/GA/TN/VA), tilted about equal to the latitude for year-round output.',
      'Wire modules in series / parallel per the Solar & DC Power page; check the cold-weather Voc stays below the controller and module limits.',
      'Run PV conductors (red +, black −) to a combiner with string fuses if 3 or more strings are paralleled, then to a PV disconnect.',
      'Wire the PV disconnect to the charge controller PV input. Wire the controller battery output through a fuse / breaker to the battery bank.',
      'Wire loads from the controller load output or a DC distribution panel with a breaker per load.',
      'Ground the array frames and the system per the plan; bond the equipment grounding conductors (green) together.',
      'Set the controller battery type, absorption and float voltages, and low-voltage disconnect.',
    ],
    test: ['Open-circuit voltage of each string before connecting.', 'Charging current at midday versus expected.', 'Run the site on battery with PV disconnected; confirm the days of autonomy.'],
    codes: ['NEC Article 690 (solar PV systems)', 'NEC Article 480 (batteries)', 'NEC Article 250'],
    diagram: ({ battAh }) => (
      <Diagram title="Off-grid PV: array, combiner, disconnect, charge controller, battery and loads" h={270}
        boxes={[{ x: 20, y: 20, w: 150, h: 60, t: 'PV array', fill: 'var(--diag-pv, #fff4cc)' }, { x: 220, y: 25, w: 120, h: 50, t: 'Combiner + fuses' }, { x: 390, y: 25, w: 120, h: 50, t: 'PV disconnect' },
          { x: 560, y: 15, w: 180, h: 70, t: 'Charge controller', s: 'MPPT' }, { x: 560, y: 150, w: 180, h: 70, t: 'Battery bank', s: battAh }, { x: 330, y: 160, w: 160, h: 56, t: 'DC load panel', s: 'radios, BDA, lights' },
          { x: 20, y: 200, w: 200, h: 34, t: 'Grounding electrode' }]}
        wires={[{ d: 'M170 40 H 220', c: C.pos }, { d: 'M170 62 H 220', c: C.neg }, { d: 'M340 40 H 390', c: C.pos }, { d: 'M340 62 H 390', c: C.neg }, { d: 'M510 40 H 560', c: C.pos }, { d: 'M510 62 H 560', c: C.neg },
          { d: 'M630 85 V 150', c: C.pos }, { d: 'M670 85 V 150', c: C.neg }, { d: 'M560 175 H 490', c: C.pos }, { d: 'M560 198 H 490', c: C.neg },
          { d: 'M95 80 V 200', c: C.ground }, { d: 'M280 75 V 120 H 120 V 200', c: C.ground, dash: '6 4' }]}
        labels={[{ x: 636, y: 120, t: 'fuse within 18 in.', c: C.pos }]}
        legend={[[C.pos, 'DC + (red)'], [C.neg, 'DC − (black)'], [C.ground, 'Equipment ground']]} />),
  },
  {
    id: 'poe', title: 'Network cable, PoE and Wi-Fi access point', applies: 'Cat 6 / 6A run from a PoE switch to a ceiling access point or camera',
    tools: ['Punch-down tool', 'RJ45 crimper or keystone tool', 'Cable certifier or tester', 'Ceiling mount kit'],
    safety: ['Use plenum-rated (CMP) cable in air-handling ceilings.', 'Do not exceed bundle sizes for PoE Type 3/4 without checking cable heating.'],
    steps: [
      'Pull the cable from the telecom room to the device location (90 m maximum permanent link). Leave a service loop at both ends.',
      'Terminate on the patch panel and at the jack using T568B (or T568A) on both ends: never mix.',
      'Patch from the PoE switch port to the panel; patch from the jack to the access point (10 m total patch cords for the channel).',
      'Mount the AP at the height and spot from the Wi-Fi survey; set channel and power per the plan.',
      'Label the cable at both ends and at the patch panel port.',
    ],
    test: ['Certify each link (wire map, length, NEXT / return loss) and save results.', 'Confirm PoE class negotiated and the AP power draw on the switch.', 'Walk the coverage with the Wi-Fi Survey page.'],
    codes: ['ANSI/TIA-568.2-D (cabling)', 'ANSI/TIA-606 (labeling)', 'NEC Article 800 / 725 (communications and power-limited circuits)', 'IEEE 802.3af/at/bt (PoE)'],
    diagram: () => {
      const pins: [string, string, boolean][] = [['#ef6c00', 'White / orange', true], ['#ef6c00', 'Orange', false], ['#2e7d32', 'White / green', true], ['#1565c0', 'Blue', false], ['#1565c0', 'White / blue', true], ['#2e7d32', 'Green', false], ['#6d4c41', 'White / brown', true], ['#6d4c41', 'Brown', false]];
      return (
        <>
          <Diagram title="PoE link: switch, patch panel, horizontal cable, jack, access point" h={150}
            boxes={[{ x: 20, y: 40, w: 130, h: 56, t: 'PoE switch' }, { x: 200, y: 40, w: 120, h: 56, t: 'Patch panel' }, { x: 470, y: 40, w: 100, h: 56, t: 'Wall / ceiling jack' }, { x: 620, y: 40, w: 120, h: 56, t: 'Access point', s: 'or camera' }]}
            wires={[{ d: 'M150 68 H 200', c: C.data }, { d: 'M320 68 H 470', c: C.data, w: 6 }, { d: 'M570 68 H 620', c: C.data }]}
            labels={[{ x: 395, y: 60, t: 'Cat 6 / 6A, 90 m max', a: 'middle' }, { x: 395, y: 120, t: 'Channel (with patch cords) 100 m max', a: 'middle' }]}
            legend={[[C.data, 'Twisted-pair data + PoE']]} />
          <figure className="diagram">
            <svg viewBox="0 0 760 210" role="img" aria-label="T568B pin colors">
              <title>T568B pin colors</title>
              {pins.map(([col, name, stripe], i) => (
                <g key={i} transform={`translate(${30 + i * 88}, 20)`}>
                  <rect x={0} y={0} width={40} height={110} rx={4} fill={stripe ? '#ffffff' : col} stroke={C.stroke} />
                  {stripe && [0, 1, 2, 3, 4, 5].map((k) => <rect key={k} x={0} y={8 + k * 18} width={40} height={8} fill={col} />)}
                  <text x={20} y={130} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.text}>Pin {i + 1}</text>
                  <text x={20} y={148} textAnchor="middle" fontSize={10.5} fill={C.text}>{name}</text>
                </g>))}
              <text x={380} y={190} textAnchor="middle" fontSize={12} fill={C.text}>T568B, looking at the jack / plug contacts. (T568A swaps the orange and green pairs.)</text>
            </svg>
            <figcaption>T568B wiring colors</figcaption>
          </figure>
        </>);
    },
  },
];

/** Labels for the diagrams from the project's own equipment. */
export function guideCtx(p: import('../types').Project): Ctx { const ant = byId(ANTENNAS, p.radio.txAntennaId), fd = byId(FEEDERS, p.radio.feederId); return { ant: ant ? ant.model.slice(0, 28) : 'per plan', feeder: fd ? fd.model : 'Feedline per plan', battAh: p.alarm ? 'size per battery calc' : 'per plan' }; }
/** Which wiring diagrams apply to which systems. */
export const GUIDES_FOR: Record<string, string[]> = { firealarm: ['nac'], massnotif: ['nac'], erces: ['erces'], das: ['erces'], cabling: ['poe'], wifi: ['poe'], cctv: ['poe'], access: ['poe'], fiber: ['poe'], intercom: ['poe'], radio: ['antenna', 'repeater'], solar: ['solar'], callbox: ['solar'] };

export function InstallPage() {
  const { project: p } = useStore();
  const mine = [...new Set(projectSystems(p.meta).flatMap((sy) => GUIDES_FOR[sy.id] ?? []))].filter((id) => GUIDES.some((x) => x.id === id));
  const [open, setOpen] = useState(mine[0] ?? GUIDES[0].id);
  const ant = byId(ANTENNAS, p.radio.txAntennaId), fd = byId(FEEDERS, p.radio.feederId);
  const ctx: Ctx = { ant: ant ? ant.model.slice(0, 28) : 'per plan', feeder: fd ? fd.model : 'Feedline per plan', battAh: p.alarm ? 'size per battery calc' : 'per plan' };
  const g = GUIDES.find((x) => x.id === open) ?? GUIDES[0];
  const others = GUIDES.filter((x) => !mine.includes(x.id));
  return (
    <div className="grid">
      <Card title="Installation guide" className="wide install" tip="Step-by-step installation with color wiring diagrams. Labels use the equipment chosen in this project where available. Print any guide for the field crew." actions={<button onClick={() => { document.querySelectorAll('.install details').forEach((d) => d.setAttribute('open', '')); setTimeout(() => window.print(), 50); }}>Print</button>}>
        <label className="field no-print" style={{ maxWidth: 520 }}><span>Choose a guide ({GUIDES.length})</span>
          <select value={g.id} onChange={(e) => setOpen(e.target.value)} aria-label="Installation guide">
            {mine.length > 0 && <optgroup label="For this project">{mine.map((id) => <option key={id} value={id}>{GUIDES.find((x) => x.id === id)!.title}</option>)}</optgroup>}
            <optgroup label={mine.length ? 'Other guides' : 'All guides'}>{others.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</optgroup>
          </select></label>
        <h3 style={{ margin: '12px 0 4px' }}>{g.title}</h3>
        <p className="muted">{g.applies}</p>
        <details open><summary>Wiring diagram</summary>{g.diagram(ctx)}</details>
        <details><summary>Before you start: tools and safety ({g.tools.length + g.safety.length})</summary>
          <h4>Tools and materials</h4><ul>{g.tools.map((t) => <li key={t}>{t}</li>)}</ul>
          <h4 className="warn-h">⚠ Safety</h4><ul>{g.safety.map((t) => <li key={t}>{t}</li>)}</ul></details>
        <details open><summary>Steps ({g.steps.length})</summary><ol className="steps">{g.steps.map((t) => <li key={t}>{t}</li>)}</ol></details>
        <details><summary>Test and close out ({g.test.length})</summary><ul>{g.test.map((t) => <li key={t}>{t}</li>)}</ul></details>
        <p className="small"><b>Code references:</b> {g.codes.join(' · ')}</p>
        <p className="small muted">General guidance for planning and training. Follow the manufacturer’s instructions, the approved drawings and the adopted codes; a licensed professional and the Authority Having Jurisdiction must verify the installation.</p>
      </Card>
    </div>
  );
}
