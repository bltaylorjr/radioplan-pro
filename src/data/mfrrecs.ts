// Manufacturer recommendations: the installation, wiring, environment and maintenance points that
// equipment manuals in each category commonly state. They are general; the specific model's
// installation manual and datasheet govern, and an item can carry its own list (SpecItem.recommendations).
import type { SpecItem } from './speclib';

export interface RecGroup { title: string; items: string[] }
export const MFR_RECS: Record<string, RecGroup[]> = {
  'Antennas': [
    { title: 'Mounting', items: ['Mount on a pipe of the diameter the clamp kit is made for; torque hardware to the value in the manual.', 'Keep the separation from the tower face and from other antennas the pattern data assumes (often 1/2 to 1 wavelength or more).', 'Mount vertically with a level; set downtilt with the bracket scale, not by eye.'] },
    { title: 'Connections', items: ['Use the connector type the antenna is supplied with; do not over-torque N or 4.3-10 connectors.', 'Weatherproof every outdoor joint (cold shrink or tape-mastic-tape) and leave a drip loop.', 'Support the jumper so no weight hangs on the connector.'] },
    { title: 'Checks and upkeep', items: ['Sweep return loss / VSWR and record a baseline at installation.', 'Inspect hardware, weatherproofing and grounding yearly and after storms.'] },
  ],
  'Coax & feeders': [
    { title: 'Installation', items: ['Respect the minimum bend radius for both single and repeated bends.', 'Hang with the manufacturer’s hangers at the stated spacing (commonly 3 ft for 1/2 in., about 4 ft for 7/8 in.); use hoisting grips on long vertical runs.', 'Use connectors and prep tools from the same manufacturer as the cable.'] },
    { title: 'Grounding and weather', items: ['Ground kits at the antenna, at the tower base and at the building entry (more on tall towers).', 'Weatherproof every outdoor connector; keep cable ends sealed until connectorized.'] },
    { title: 'Testing', items: ['Sweep distance-to-fault and return loss after installation; keep the trace with the closeout.'] },
  ],
  'Connectors': [{ title: 'Installation', items: ['Use the cable-specific connector and the maker’s prep tool; trim lengths must match the instructions.', 'Torque to the stated value with a torque wrench; keep interfaces clean and capped.', 'Weatherproof outdoor connections.'] }],
  'Radios & repeaters': [
    { title: 'Installation', items: ['Mount in a ventilated rack with the clearance the manual lists; keep within the rated operating temperature.', 'Power from a supply sized for transmit current, with the fuse rating given by the manufacturer.', 'Bond the chassis to the rack ground bar.'] },
    { title: 'RF', items: ['Never key the transmitter without a load or antenna.', 'Set power and deviation with calibrated test equipment to the license limits.', 'Use a duplexer or filters as recommended when TX and RX share an antenna.'] },
    { title: 'Upkeep', items: ['Check frequency, power, deviation and sensitivity yearly; keep the programming file backed up.'] },
  ],
  'ERCES / BDA & DAS': [
    { title: 'Installation', items: ['Use a listed BDA in a NEMA 4 or rated enclosure as the AHJ requires; mount within the temperature range in the manual.', 'Keep donor-to-server antenna isolation at least 15 to 20 dB above the amplifier gain to stop oscillation.', 'Provide the battery backup time required (commonly 12 or 24 h) with the batteries the manufacturer lists.'] },
    { title: 'Commissioning', items: ['Set gain and output with the manufacturer’s software after measuring donor signal.', 'Register the booster with the FCC and get the licensee’s consent before turning it on.', 'Connect supervisory outputs to the fire alarm panel.'] },
    { title: 'Upkeep', items: ['Annual test and grid test as the fire code requires; replace batteries at the manufacturer’s interval.'] },
  ],
  'Fire alarm': [
    { title: 'Installation', items: ['Install per the installation sheet packed with the device and NFPA 72; keep the sheet for the record documents.', 'Use only the bases, back boxes and accessories listed with the device.', 'Do not install detectors until construction dust is cleaned up, or keep dust covers on and remove them at commissioning.'] },
    { title: 'Wiring', items: ['Use the wire gauge and maximum loop resistance and capacitance in the panel manual.', 'Notification circuits: stay within the voltage drop for the lowest rated device voltage (often 16 V).', 'Do not T-tap Class A circuits.'] },
    { title: 'Testing and upkeep', items: ['Sensitivity-test smoke detectors within one year and then on the schedule in NFPA 72.', 'Replace detectors at the end of life printed on the device (often 10 years).'] },
  ],
  'Batteries': [
    { title: 'Installation', items: ['Use the battery type and size the panel or equipment manual lists; torque terminals to the stated value.', 'Keep within the temperature range; capacity drops in cold and life drops in heat.', 'Mark the installation date on each battery.'] },
    { title: 'Upkeep', items: ['Check float voltage and load-test yearly; replace sealed lead-acid batteries at about 4 to 5 years or as the manufacturer states.', 'Replace batteries in sets, never mix old and new.'] },
  ],
  'Solar & DC power': [
    { title: 'Installation', items: ['Mount panels with the rails and clamp zones the manufacturer allows; keep the stated gap for cooling.', 'Size wire and overcurrent protection from Isc × 1.25 (NEC 690) and the controller manual.', 'Set the charge controller to the battery maker’s charge voltages.'] },
    { title: 'Upkeep', items: ['Clean panels and check connections and corrosion twice a year.'] },
  ],
  'Wi-Fi': [
    { title: 'Installation', items: ['Mount in the orientation the antenna pattern assumes (ceiling vs. wall).', 'Power with the PoE class the AP needs for full features.', 'Keep APs away from metal obstructions and other radios by the distance in the deployment guide.'] },
    { title: 'Upkeep', items: ['Keep firmware current; review channel and power plans after layout changes.'] },
  ],
  'Network & PoE': [
    { title: 'Installation', items: ['Rack-mount with front-to-back airflow and the clearance in the manual.', 'Do not exceed the PoE budget; leave about 20 % headroom.', 'Ground the chassis and use surge protection on outdoor-fed ports.'] },
    { title: 'Upkeep', items: ['Back up configurations; keep firmware current; check fans and logs.'] },
  ],
  'Structured cabling': [
    { title: 'Installation', items: ['Do not exceed the maximum pulling tension (about 25 lbf for 4-pair) or the bend radius (4 × cable diameter installed).', 'Keep pairs twisted to within 0.5 in. of the termination (Cat 6 / 6A).', 'Use components from one manufacturer’s system for the extended warranty.'] },
    { title: 'Testing', items: ['Certify every link with a field tester to the permanent link limit; save the results.'] },
  ],
  'Fiber optics': [
    { title: 'Installation', items: ['Pull with the strength member only, within the rated tension; observe the bend radius (often 20 × diameter loaded, 10 × unloaded).', 'Clean and inspect every end face before mating.', 'Keep dust caps on unused ports.'] },
    { title: 'Testing', items: ['Test insertion loss (Tier 1) and OTDR (Tier 2) as specified; record the results.'] },
  ],
  'Conductors': [{ title: 'Installation', items: ['Use the conductor type and temperature rating listed for the terminals (often 75 °C).', 'Torque lugs to the manufacturer’s values.'] }],
  'Surge & grounding': [
    { title: 'Installation', items: ['Mount the protector at the building entry and bond it with the shortest, straightest conductor to the ground bar.', 'Match the protector’s frequency range and DC pass/block type to the system.'] },
    { title: 'Upkeep', items: ['Inspect after storms; replace gas tubes or modules as the manufacturer directs.'] },
  ],
  'Security & access control': [
    { title: 'Installation', items: ['Use the power supply rating and wire gauge in the lock or reader manual; check voltage at the device under load.', 'Fail-safe vs. fail-secure as the life-safety code and AHJ require; tie releases to the fire alarm where required.', 'Install door hardware to the door and frame manufacturer’s templates.'] },
    { title: 'Upkeep', items: ['Test locks, readers, REX and door position switches; check battery backup.'] },
  ],
  'Intrusion': [{ title: 'Installation', items: ['Mount motion sensors at the height and angle in the manual and away from heat sources and air vents.', 'Use the end-of-line resistor value the panel specifies.', 'Walk-test every zone at installation.'] }, { title: 'Upkeep', items: ['Test sensors and communicator; replace panel and wireless batteries on schedule.'] }],
  'CCTV': [
    { title: 'Installation', items: ['Mount within the operating temperature range; use the housing and mounts the maker lists for the IP / IK rating.', 'Seal cable entries with the supplied gaskets; leave a drip loop.', 'Use the PoE class the camera needs (heaters and IR often need more).'] },
    { title: 'Setup and upkeep', items: ['Change default passwords; keep firmware current; set the time source.', 'Clean domes and lenses; check focus and recording retention.'] },
  ],
  'Intercom': [{ title: 'Installation', items: ['Use the cable type and distance limits in the manual; keep SIP stations on a managed network with QoS.', 'Mount at the height the maker shows for camera view and ADA reach.'] }],
  'Nurse call': [{ title: 'Installation', items: ['Install only listed (UL 1069) components from one manufacturer’s system.', 'Follow the manufacturer’s wiring diagrams and cable types exactly; system certification often requires it.'] }, { title: 'Upkeep', items: ['Test every station and pull cord on the facility’s schedule; keep the manufacturer service agreement current.'] }],
  'Paging & sound': [{ title: 'Installation', items: ['Do not load an amplifier beyond about 80 % of its rated output.', 'Use the speaker back cans and tile bridges the manufacturer offers; observe plenum ratings.', 'Keep 70 V lines apart from mic-level cable.'] }],
  'Emergency call boxes': [{ title: 'Installation', items: ['Mount on the pole or pedestal the manufacturer lists, with the foundation detail they supply.', 'Aim the solar panel south at the tilt in the manual; size the battery for the stated autonomy.', 'Test the call path to the answering point at installation.'] }, { title: 'Upkeep', items: ['Monthly call test (or automatic self-test); replace batteries on the maker’s interval.'] }],
};

/** Recommendations for an item: its own list (from its datasheet) plus the category's general points. */
export function recsFor(item: Pick<SpecItem, 'category' | 'recommendations'>): { own: string[]; general: RecGroup[] } {
  return { own: item.recommendations ?? [], general: MFR_RECS[item.category] ?? [] };
}
