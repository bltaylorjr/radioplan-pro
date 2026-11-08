// Low-voltage principles: theory, systems and installation, from basic to advanced.
// Written as general training text. Code references point to where a rule lives; the adopted
// edition, the manufacturer's instructions and the AHJ decide what applies on a job.

export type Level = 'Basic' | 'Intermediate' | 'Advanced';
export interface TheorySection {
  id: string; title: string; level: Level; body: string;
  /** Calculators shown under the section (ids from data/lvcalcs). */
  calcs?: string[];
  /** App pages that put the section to work: [page id, label]. */
  pages?: [string, string][];
  /** Diagrams shown with the section: THEORY_DIAGRAMS ids or Installation Guide wiring diagram ids. */
  diagrams?: string[];
}
export interface TheoryPart { id: string; title: string; intro: string; sections: TheorySection[] }

export const THEORY: TheoryPart[] = [
  { id: 'p1', title: 'Part 1. Electrical fundamentals', intro: 'The few rules that explain almost every low-voltage problem: voltage, current, resistance, power, and how circuits are built.', sections: [
    { id: 'ohm', diagrams: ['ohm'], title: 'Voltage, current, resistance and Ohm\'s law', level: 'Basic', calcs: ['lv-drop'], body: `**Voltage (V, volts)** is the electrical pressure that pushes current. **Current (I, amps)** is the flow. **Resistance (R, ohms Ω)** opposes the flow.

**Ohm's law** ties them together:
- V = I × R (volts = amps × ohms)
- I = V ÷ R
- R = V ÷ I

**Power (P, watts)** is the work done: P = V × I. A 24 V device drawing 0.5 A uses 12 W.

Every wire has resistance, so current flowing through it loses some voltage on the way. That loss is **voltage drop**, and it is the most common reason a lock, strobe or camera at the end of a long run misbehaves while the same device works on the bench.` },
    { id: 'acdc', title: 'AC and DC, and what "low voltage" means', level: 'Basic', body: `**DC (direct current)** flows one way: batteries, power supplies, PoE. **AC (alternating current)** reverses many times a second (60 Hz in the US): building power, transformers for doorbells and some locks, 70 V speaker lines carrying audio.

AC values are given as **RMS**, the equivalent heating value. 120 V AC RMS peaks at about 170 V.

"Low voltage" in the trade usually means **power-limited** circuits: the source limits voltage and power so the wiring is not a fire or shock hazard. In the NEC these are **Class 2 and Class 3** circuits (Article 725, moved into Articles 722 and 724 in the 2023 edition) and **power-limited fire alarm (PLFA)** circuits (Article 760). A listed Class 2 power supply is marked as such. Class 2 sources are generally limited to 100 VA, with voltage limits that depend on whether the circuit is AC or DC and whether it can get wet (NEC Chapter 9, Tables 11(A) and 11(B)).

Communications circuits (telephone, data, coax, fiber) are covered by NEC Chapter 8 (Articles 800–840) and Article 770 for optical fiber.` },
    { id: 'circuits', diagrams: ['seriesparallel', 'classab'], title: 'Series and parallel circuits, supervision and end-of-line devices', level: 'Basic', body: `In a **series** circuit there is one path: the current is the same everywhere and the voltages add up. One open breaks the whole circuit.

In a **parallel** circuit each device has its own path across the same voltage: the currents add up. Speakers on a 70 V line, strobes on a NAC and detectors on a two-wire zone are wired in parallel.

**Supervision**: alarm panels watch their own wiring. A small current flows through an **end-of-line (EOL) resistor** at the far end. If the wire opens, the current stops and the panel shows a **trouble**. A short or a device operating changes the current and shows an **alarm** (or a short trouble, depending on the circuit).

- **Class B** circuits run out to the last device and stop at the EOL. One break loses everything past it.
- **Class A** circuits loop back to the panel, so one break still leaves every device working.

Never put the EOL in the panel "to clear the trouble": the wiring past the panel is then unsupervised.` },
    { id: 'conductors', title: 'Wire size, resistance and voltage drop', level: 'Basic', calcs: ['lv-drop', 'psu'], body: `Wire size is given in **AWG**: a smaller number is a thicker wire. Each step of 3 AWG roughly doubles or halves the resistance. #18 copper is about 6.4 Ω per 1,000 ft; #14 is about 2.5 Ω (NEC Chapter 9, Table 8).

For DC circuits, the current travels out and back, so the loop resistance is **2 × length × resistance per foot**.

Voltage drop = current × loop resistance. Example: a 0.5 A maglock 300 ft away on #18: 2 × 300 × 0.0064 = 3.84 Ω, × 0.5 A = 1.9 V lost. On a 12 V lock that leaves about 10 V: likely too low. On 24 V it is fine.

Ways to fix voltage drop, in order of cost: use the higher voltage option on the device, use a bigger wire, add a second pair in parallel, or move the power supply closer.` },
    { id: 'power', title: 'Power supplies and batteries', level: 'Basic', calcs: ['fa-battery', 'psu'], body: `Size a power supply for the **total current** of everything on it plus headroom (about 20–25%). Check the supply's rating for each output and for battery charging.

Batteries are rated in **amp-hours (Ah)**: a 7 Ah battery can supply 1 A for about 7 hours (less at high current and in the cold).

For alarm systems, the standby calculation is: (standby current × standby hours) + (alarm current × alarm time), plus a safety margin. Fire alarm systems typically need 24 hours standby and 5 minutes of alarm (15 minutes for voice evacuation) under NFPA 72; security, access control and nurse call follow their own standards and the specification.

Sealed lead-acid batteries lose capacity with age and heat. Date every battery when installed and test them on the PM schedule.` },
    { id: 'signals', title: 'Signals, decibels, impedance and noise', level: 'Intermediate', calcs: ['audio-level', 'db-sum'], body: `A **signal** carries information: audio, video, data or radio. Its strength is often given in **decibels (dB)**, a ratio on a log scale. +3 dB is double the power; +10 dB is ten times the power; +6 dB is double the voltage.

**dBm** is power relative to 1 milliwatt (radio and fiber). **dBu** and **dBV** are audio voltages (pro line level is +4 dBu, consumer is −10 dBV). **dB SPL / dBA** are sound levels.

**Impedance** is resistance to AC signals. Sources, cables and loads should match: 50 Ω for radio coax, 75 Ω for video coax, 100 Ω for twisted-pair data, 8 Ω or 70 V lines for speakers.

**Noise** enters through induction from power wiring, ground loops and radio interference. Defenses: **balanced** lines (two conductors plus shield, the noise cancels), **twisted pairs**, shields grounded at one end for audio, separation from power wiring, and single-point grounding.` },
    { id: 'grounding', diagrams: ['antenna'], title: 'Grounding and bonding', level: 'Intermediate', pages: [['grounding', 'Grounding & Structure'], ['sites', 'Site Data & GPS']], body: `**Grounding** connects the system to the earth. **Bonding** connects metal parts together so they sit at the same voltage. Bonding is what keeps people and equipment safe during a fault or a lightning strike; the earth connection alone is not enough.

Key points:
- Communications systems bond to the building's grounding electrode system through the **intersystem bonding termination (IBT)** (NEC 250.94, 800.100, 820.100).
- Telecom rooms get a **telecommunications grounding busbar** tied back to the main busbar (ANSI/TIA-607).
- Cables entering a building from outside need **primary protectors** at the entrance for copper (NEC 800.90) and bonding of the coax shield (NEC 820.93).
- Towers and antennas follow NEC Article 810 and industry practice such as Motorola R56.

A **ground loop** is two ground connections at different voltages. It causes hum in audio and rolling bars in analog video. Fix by bonding properly and grounding shields at one end, or with isolation transformers.` },
    { id: 'safety', title: 'Working safely', level: 'Basic', body: `- Treat every circuit as live until you have tested it. Power-limited does not mean harmless: a battery bank can deliver hundreds of amps into a short.
- Follow lockout/tagout for anything fed from line voltage. Low-voltage installers do not work on 120 V circuits unless licensed and qualified for them.
- Ladders and lifts: use the right ladder, 3 points of contact, and fall protection on lifts and roofs (OSHA 1926 Subparts L, M, X).
- Wear eye protection when cutting, drilling and handling fiber; dispose of fiber scraps in a marked container.
- Never look into a fiber end or connector: lasers can be invisible.
- Restore every **fire-rated penetration** with a listed firestop system.
- Asbestos, lead and confined spaces: stop and ask before disturbing ceilings and old materials.` },
  ] },
  { id: 'p2', title: 'Part 2. Cabling, pathways and media', intro: 'How signals travel: copper, coax, fiber and wireless, and the pathways that carry them.', sections: [
    { id: 'twisted', diagrams: ['poe'], title: 'Twisted-pair cabling (Cat 5e, 6, 6A)', level: 'Basic', calcs: ['cable-boxes', 'conduit-fill', 'jhook'], pages: [['install', 'Installation Guides'], ['testing', 'Final Testing']], body: `Twisted pairs cancel noise because each pair carries equal and opposite signals. Keep the twists right up to the termination (no more than about 1/2 in untwisted for Category 6).

Rules from ANSI/TIA-568:
- **100 m (328 ft) channel**: 90 m permanent link plus up to 10 m of patch cords.
- Pick one wiring pattern for the whole job, **T568A or T568B**. Mixing them at the two ends makes a crossover.
- Bend radius: at least 4 × the cable diameter for 4-pair cable.
- Pulling tension: no more than 25 lbf on a 4-pair cable.
- Do not crush with tight cable ties; use hook-and-loop.

**Category 6A** supports 10 Gb/s to 100 m and runs cooler with high-power PoE. Test every link with a certifier, not just a continuity tester.` },
    { id: 'coax', title: 'Coax cable', level: 'Basic', body: `Coax has a center conductor, a dielectric, a shield and a jacket. **50 Ω** coax is used for radio and DAS; **75 Ω** for video and CATV.

Loss rises with frequency and length. Larger cable has less loss: 1/2 in foam coax loses much less than RG-58 at UHF. Use the Library and the Equipment page for loss per 100 ft at your frequency.

Connectors must match the cable and be installed with the right tool. Weatherproof every outdoor connection (cold-shrink or butyl tape). For DAS and public-safety radio use low-PIM connectors and keep them clean and tight.` },
    { id: 'fiber', title: 'Fiber optics', level: 'Intermediate', calcs: ['fiber-budget', 'fiber-reach'], body: `Fiber carries light, so it is immune to electrical noise and lightning and covers long distances.

- **Multimode** (OM3, OM4: aqua; OM5: lime) has a larger core and is used inside buildings, up to a few hundred meters at high speeds.
- **Single-mode** (OS2: yellow jacket) has a tiny core and goes many kilometers. It is the safe choice between buildings and for future speed.

Loss comes from the fiber itself (dB per km), connectors (about 0.75 dB maximum each per TIA-568.3), and splices (about 0.3 dB maximum). The **loss budget** adds these up and must be less than what the equipment can tolerate.

Good practice: inspect and clean every connector before mating, keep the bend radius (about 10 × diameter unloaded, 20 × while pulling), keep polarity consistent (Tx to Rx), and test with a light source and power meter; use an OTDR to locate faults on long or outside runs.` },
    { id: 'ratings', title: 'Cable fire ratings and where they go', level: 'Basic', body: `Cables are listed for the space they pass through:
- **Plenum** (CMP, FPLP, OFNP, CL2P): air-handling spaces such as return-air ceilings.
- **Riser** (CMR, FPLR, OFNR, CL2R): vertical shafts between floors.
- **General purpose** (CM, FPL, OFN, CL2): other spaces in the building.
- **Limited use** (CMX, CL2X): dwellings and short exposed runs.

A higher rating can substitute for a lower one (plenum can go anywhere riser can). **Fire alarm** circuits use FPL-type cable (Article 760). Cable entering the building from outside must be outdoor rated and transition to listed indoor cable within the distance the NEC allows, unless it is in conduit.

Remove abandoned cable where the code requires it (NEC 725, 760, 770, 800 sections on abandoned cable).` },
    { id: 'pathways', title: 'Pathways: conduit, J-hooks, trays and firestopping', level: 'Intermediate', calcs: ['conduit-fill', 'jhook'], pages: [['sites', 'Runs between sites']], body: `Cables need a supported, protected path (ANSI/TIA-569):
- Support cables every 4 to 5 ft with J-hooks or trays; never lay them on the ceiling grid or tie them to pipes or ceiling wires.
- **Conduit fill**: about 40% for three or more cables. Fewer, larger conduits are easier to pull.
- **Bends**: no more than two 90° bends (180°) between pull points for telecom conduit; add a pull box rather than force it.
- Keep separation from power wiring and fluorescent fixtures; cross power at 90°.
- Seal every rated wall and floor penetration with a **listed firestop system** that matches the wall type and the cables.
- Outside: bury at the depth the code requires, use warning tape, and add handholes at intervals and bends. Call **811** before digging.` },
    { id: 'network', title: 'Networks and Power over Ethernet', level: 'Intermediate', calcs: ['poe-budget'], pages: [['wifi', 'Wi-Fi & Network Survey']], body: `Most modern low-voltage systems are on IP: cameras, door controllers, intercoms, paging, nurse call.

- Each device has an **IP address**, a **subnet mask** and a **gateway**. Keep a plan; avoid duplicates.
- Separate security and life-safety devices on their own **VLAN** or network.
- **PoE** powers devices over the data cable: 802.3af (15.4 W at the switch), 802.3at (30 W), 802.3bt (60 W and 90 W). Size the switch PoE budget for the total.
- Large bundles of high-power PoE cables heat up; check TIA TSB-184-A and the NEC (840.160) for bundle sizes.
- Change default passwords, update firmware and document every device and credential for the owner.` },
    { id: 'rf', title: 'Radio basics: frequency, antennas and path loss', level: 'Intermediate', pages: [['path', 'Path Profile'], ['coverage', 'Coverage Prediction'], ['equipment', 'Equipment & Link Budget']], body: `Radio signals weaken with distance (**free-space path loss** rises 6 dB each time the distance doubles) and are blocked by terrain and buildings.

- **Antenna gain** focuses energy in some directions; it does not create power.
- A **link budget** adds transmitter power and antenna gains, and subtracts cable losses and path loss. The result must stay above the receiver's sensitivity with a margin for fading.
- **Line of sight** is not enough: keep the **Fresnel zone** (an oval around the straight line) mostly clear.
- Higher frequencies carry more data but go shorter and penetrate buildings worse.

Use the radio pages of this app with terrain loaded to see real path profiles and coverage.` },
  ] },
  { id: 'p3', title: 'Part 3. The systems', intro: 'What each system does, its main parts, how it works, the key codes and the faults you will see most.', sections: [
    { id: 'sys-fa', diagrams: ['riser', 'nac'], title: 'Fire alarm', level: 'Intermediate', calcs: ['fa-battery', 'lv-drop', 'spl'], pages: [['alarm', 'Fire Alarm & Batteries'], ['compliance', 'Code Compliance']], body: `**Purpose**: detect fire early, warn occupants, notify the fire department and control building functions (elevators, doors, fans).

**Parts**: fire alarm control unit (FACU), initiating devices (smoke and heat detectors, pull stations, waterflow and tamper switches), notification appliances (horns, strobes, speakers), signaling line circuit (SLC) for addressable devices, notification appliance circuits (NACs), power supplies and batteries, and a communicator to the monitoring station.

**Codes**: NFPA 72 (design, installation, testing), NEC Article 760 (wiring), the building and fire code (where an alarm is required), ADA for strobes, and the AHJ.

**Common faults**: ground faults (a wire touching conduit or a box), open circuits, wrong EOL value, low NAC voltage at the last strobe, dirty detectors, bad batteries.` },
    { id: 'sys-sec', title: 'Intrusion (burglar alarm)', level: 'Intermediate', calcs: ['fa-battery'], body: `**Purpose**: detect unauthorized entry and report it.

**Parts**: control panel, keypads, door and window contacts, motion detectors (PIR, dual-tech), glass-break detectors, sirens, communicator (cellular, IP), and zones wired with EOL resistors.

**Standards**: UL 681 / 1076 / 2050 for certificated systems, ANSI/SIA CP-01 (false alarm reduction), local alarm ordinances and permits.

**Common faults**: false alarms from poorly aimed motion sensors or loose contacts, low batteries in wireless devices, communicator failure.` },
    { id: 'sys-ac', title: 'Access control', level: 'Intermediate', calcs: ['lv-drop', 'psu'], body: `**Purpose**: let the right people through the right doors at the right times, and record it.

**Parts**: software/server, door controllers, card or mobile credential readers, locking hardware (electric strikes, maglocks, electrified locksets), request-to-exit (REX) devices, door position switches, power supplies.

**Key rules**: free egress must never be blocked. Maglocks need a motion sensor REX plus a push-to-exit button, and must release on fire alarm and power loss (IBC/IFC 1010 and NFPA 101). Fail-safe vs fail-secure must match the code and the owner's needs. Coordinate with the door hardware supplier.

**Common faults**: voltage drop at the lock, door misalignment, reader wiring (Wiegand vs OSDP), REX not releasing.` },
    { id: 'sys-cctv', title: 'Video surveillance (CCTV)', level: 'Intermediate', calcs: ['poe-budget'], body: `**Purpose**: see, record and review what happens.

**Parts**: IP cameras (fixed, PTZ, multi-sensor), PoE switches, network video recorder (NVR) or video management software, storage, monitors and remote viewing.

**Design**: pick the lens and resolution for what you must see (detect, recognize, identify), light the scene or use IR, avoid backlight, and size storage from bitrate × hours × days.

**Common faults**: no PoE power, IP conflicts, night images blurred by IR reflection, storage full, time not synchronized.` },
    { id: 'sys-intercom', title: 'Intercom and entry systems', level: 'Intermediate', body: `**Purpose**: talk between stations, and let visitors call in and be let in.

**Parts**: master and sub stations, door stations, video entry, IP or two-wire bus, door release relays. Area of rescue assistance two-way communication is required in many buildings (IBC 1009.8).

**Common faults**: echo and feedback (volume and placement), wrong bus wiring, door release not tied correctly to the access control.` },
    { id: 'sys-nurse', title: 'Nurse call', level: 'Intermediate', body: `**Purpose**: let patients and staff call for help, and route calls to the right staff.

**Parts**: patient stations, pillow speakers, bath and shower pull cords, staff and duty stations, dome lights, master station or software, integrations with phones and pagers.

**Standards**: UL 1069, the FGI Guidelines and NFPA 99 for health care. Systems must be listed, and installation follows the manufacturer closely.

**Common faults**: damaged pillow speaker cords, call cord stations missing, dome lights out, integration servers down.` },
    { id: 'sys-paging', title: 'Paging and background music', level: 'Intermediate', calcs: ['spl', 'line70', 'spk-spacing', 'amp-size', 'spk-wire'], body: `**Purpose**: voice announcements and music across zones.

**Parts**: sources (phone system page port, microphone, music), mixer/zone controller, amplifiers, 70 V or 100 V speaker lines, ceiling and horn speakers with taps.

**Design**: space speakers for even coverage, choose taps for 10–15 dB above the room's noise, keep total taps at or under about 80% of the amplifier, and keep line loss under 0.5 dB.

**Common faults**: amplifier shutting down (shorted line or too many watts on it), one dead zone (open line), distortion (wrong tap or failed transformer), hum (ground loop at the phone interface).` },
    { id: 'sys-sound', title: 'Professional sound systems', level: 'Advanced', calcs: ['rt60', 'sti', 'spk-delay', 'lo-z', 'audio-level'], body: `**Purpose**: clear, even sound for speech and music in auditoriums, churches, gyms and meeting rooms.

**Signal chain**: microphones → preamps → mixer/DSP (gain, EQ, compression, delay, feedback control) → amplifiers → loudspeakers. Assistive listening systems are required in many assembly areas (ADA 219 and 706).

**Acoustics**: hard rooms reverberate (long RT60) and hurt intelligibility. More, closer and more directional speakers help, as does absorption. Delay fill speakers to the mains so sound appears to come from the stage.

**Gain structure**: set each stage so the signal is well above noise and below clipping. **Feedback**: keep mics behind and away from speakers, and limit open mics.` },
    { id: 'sys-mns', title: 'Mass notification and emergency communications', level: 'Advanced', calcs: ['sti', 'horn-range', 'spl'], body: `**Purpose**: tell people what is happening and what to do, inside and outside, for fire and other emergencies.

**Parts**: in-building voice systems, outdoor giant-voice speaker arrays, visible text signs, desktop and phone alerts, and a risk analysis that sets the messages and priorities (NFPA 72 Chapter 24, UL 2572; UFC 4-021-01 on DoD projects).

**Key point**: the message must be **intelligible**, not only loud. Design with STI in mind and verify by measurement. Pathway survivability rules apply to the wiring that must keep working during an emergency.` },
    { id: 'sys-callbox', diagrams: ['solar'], title: 'Emergency call boxes', level: 'Intermediate', pages: [['solar', 'Solar & DC Power']], body: `**Purpose**: blue-light phones in parking lots, campuses and roads that call for help.

**Parts**: hands-free speakerphone, strobe, cellular or radio or wired communicator, battery and often solar power, pole or wall mount.

**Design**: place within sight of each other on routes, check cellular or radio coverage at every location, size solar for winter, and test monthly.` },
    { id: 'sys-das', diagrams: ['erces'], title: 'DAS and emergency responder radio (ERCES)', level: 'Advanced', pages: [['erces', 'Emergency Radio (ERCES / BDA)'], ['indoor', 'Indoor Coverage & DAS']], body: `**Purpose**: bring radio coverage inside buildings, for public safety radios (ERCES) and for cellular (DAS).

**Parts**: donor antenna aimed at the serving site, bi-directional amplifier (BDA) or DAS head end, splitters and couplers, coax or fiber distribution, indoor antennas, annunciator and monitoring.

**Codes**: IFC 510 and NFPA 1225 set coverage (commonly 95% of general areas and 99% of critical areas at a minimum signal level), 12 hours battery backup in a NEMA 4 enclosure, 2-hour survivable pathways, and FCC rules for signal boosters (47 CFR 90.219). Check the AHJ's own amendments.

**Design keys**: enough isolation between donor and server antennas (commonly at least 15–20 dB more than the BDA gain) to prevent oscillation, low-PIM components, and a grid test at acceptance.` },
    { id: 'sys-radio', diagrams: ['antenna', 'repeater'], title: 'Two-way radio and towers', level: 'Advanced', pages: [['equipment', 'Equipment & Link Budget'], ['coverage', 'Coverage Prediction'], ['grounding', 'Grounding & Structure']], body: `**Purpose**: wide-area radio for businesses and public safety.

**Parts**: repeaters, base stations, antennas, combiners and duplexers, feedline, towers, grounding, and FCC licenses.

**Rules**: FCC licensing (47 CFR Part 90), FAA notice for tall structures near airports (14 CFR Part 77), TIA-222 for tower structures, NEC 810 and R56 practice for grounding.` },
    { id: 'sys-design', diagrams: ['floorplan', 'riser'], title: 'Design services', level: 'Advanced', pages: [['blueprints', 'Blueprints & Drawing Sets'], ['compliance', 'Code Compliance']], body: `A design package usually holds: device layout drawings, riser diagrams, wiring details, battery and voltage drop calculations, equipment data sheets, sequence of operations, and specifications.

Start from the adopted codes for the address, the owner's requirements and the architect's backgrounds. Many AHJs require fire alarm drawings by a NICET Level III/IV designer or a professional engineer. Submit, answer comments, and keep the approved set on site.` },
    { id: 'sys-service', title: 'Service and preventive maintenance contracts', level: 'Intermediate', calcs: ['pm-hours'], pages: [['service', 'Service & Maintenance Resources']], body: `Systems need regular inspection and testing to stay reliable and to meet code. NFPA 72 Chapter 14 sets fire alarm frequencies (for example, annual testing of most devices and semiannual battery checks). Other systems follow the manufacturer and the contract.

A PM contract states what is tested, how often, response times, what parts are included, and how results are reported. Keep records for the owner and the AHJ.` },
  ] },
  { id: 'p4', title: 'Part 4. Installation practice', intro: 'From the first site walk to handing over the keys.', sections: [
    { id: 'pre', diagrams: ['floorplan'], title: 'Before work: drawings, permits and the site walk', level: 'Basic', pages: [['company', 'Company & Project'], ['contacts', 'Contacts & Web Resources']], body: `1. Read the drawings and specifications; list every system, device and cable.
2. Confirm the licensing and permits needed for the address and get them before starting.
3. Walk the site: ceilings, shafts, wall types, power at each head end, pathways between floors and buildings, and hazards.
4. Order long-lead equipment early and check every item is listed for its use.
5. Coordinate with the electrician (power circuits, conduits), the door hardware supplier, the IT department and the general contractor's schedule.` },
    { id: 'rough', title: 'Rough-in: boxes, pathways and pulling cable', level: 'Basic', pages: [['install', 'Installation Guides']], body: `- Mount back boxes and pathways at the heights and positions on the drawings.
- Label both ends of every cable as you pull it (ANSI/TIA-606).
- Pull from the reel without kinks; do not exceed the tension or bend radius.
- Leave a service loop at each end (about 10 ft at the head end, about 1 ft at the device for copper; more for fiber).
- Keep fire alarm, security and data cables in their own supported paths; keep away from power.
- Firestop as you go and photograph each penetration.` },
    { id: 'trim', title: 'Termination and trim-out', level: 'Intermediate', body: `- Terminate to the manufacturer's instructions and the job's chosen standard (T568A or B).
- Use the correct crimp tool and connectors for each cable.
- Dress cables neatly in racks and panels; keep bend radius.
- Mount devices level and at the right height (ADA and NFPA 72 mounting heights for appliances).
- Check every circuit for opens, shorts and ground faults before connecting it to a panel.` },
    { id: 'program', title: 'Programming and commissioning', level: 'Intermediate', body: `- Load the programming from the approved sequence of operations.
- Set addresses and labels that match the drawings so service techs can find devices.
- Test each input and output, including interfaces to other systems (elevator recall, door release, HVAC shutdown).
- Record firmware versions, IP addresses and passwords for the owner.` },
    { id: 'test', title: 'Testing and documentation', level: 'Intermediate', pages: [['testing', 'Final Testing'], ['reports', 'Reports & Closeout']], body: `- **Cabling**: certify every copper link and fiber strand and keep the reports.
- **Fire alarm**: 100% functional test, battery and voltage readings, audibility and intelligibility measurements, and the NFPA 72 record of completion. The AHJ witnesses the acceptance test.
- **ERCES/DAS**: grid test of signal strength and talk-back at the AHJ's levels.
- **Security, access, CCTV**: test every point, door and camera, including night views.
- Mark up **as-built drawings** as you go.` },
    { id: 'closeout', title: 'Closeout and owner training', level: 'Basic', body: `Hand over: as-built drawings, test reports, programming files, manuals and data sheets, warranty letters, passwords, spare parts and the PM schedule. Train the owner's staff on daily use and what to do on a trouble. Get a signed acceptance.` },
  ] },
  { id: 'p5', title: 'Part 5. Advanced design and troubleshooting', intro: 'The calculations and methods that separate a working system from a reliable one.', sections: [
    { id: 'nac', title: 'NAC and power circuit design', level: 'Advanced', calcs: ['lv-drop', 'fa-battery'], pages: [['alarm', 'Fire Alarm & Batteries']], body: `Notification appliance circuits must deliver at least the appliance's minimum listed voltage at the last device, at the end of the battery's life. Design with the panel's **end-of-life battery voltage** (often 20.4 V for a 24 V system), not 24 V. Many appliances are listed for 16 V minimum.

Use the **lumped** method (all current at the end of the line) for a safe answer, or the **distributed** method (each appliance at its real position) for a closer one. Use the manufacturer's current draw at the candela or tap setting actually used.` },
    { id: 'audibility', title: 'Audibility and intelligibility', level: 'Advanced', calcs: ['spl', 'sti', 'rt60'], body: `NFPA 72 Chapter 18 sets audible signal levels. In public mode the signal must be at least 15 dB above the average ambient sound level (or 5 dB above the maximum level lasting 60 seconds, if that is higher), and not over the maximum allowed (110 dBA in recent editions). Sleeping areas have their own rules, including the 520 Hz low-frequency signal.

Voice systems must also be **intelligible** in each acoustically distinguishable space. Plan with RT60 and STI estimates, and verify with an STIPA meter. Check the edition your state adopted.` },
    { id: 'survivability', title: 'Survivability and secondary power', level: 'Advanced', body: `Systems that must keep working during a fire have **pathway survivability** rules: from Level 0 (no special protection) up to Level 3 (2-hour rated, in a sprinklered building) in NFPA 72. ERCES riser and feeder cables commonly need 2-hour protection. Use listed 2-hour cable or a rated enclosure, and watch the special installation instructions for those cables.

Secondary power (batteries, generators) must carry the system for its required time; label and date every battery.` },
    { id: 'method', title: 'A troubleshooting method that always works', level: 'Advanced', pages: [['troubleshoot', 'Troubleshooting Wizard']], body: `1. **Listen and look**: what changed, when did it start, what does the panel say?
2. **Check the simple things**: power, batteries, fuses, loose connectors.
3. **Measure, don't guess**: voltage at the device under load, resistance of the circuit with it disconnected, insulation to ground.
4. **Divide and conquer (half-split)**: open the circuit in the middle; the fault is on the side that still shows it. Repeat until you find it.
5. **Fix the cause, not the symptom**: a ground fault that comes back after rain is water in a box.
6. **Test and document** the repair.

Ground faults: disconnect the circuit, measure from each conductor to ground (should be open). Split the circuit until the fault is isolated.` },
    { id: 'rfadv', title: 'RF interference, PIM and isolation', level: 'Advanced', pages: [['network', 'Multi-site & Interference'], ['optimize', 'Tilt, Azimuth & Power']], body: `- **Intermodulation**: two strong signals mix in a nonlinear part and create new ones on other frequencies. Check frequency plans and use good filtering.
- **PIM (passive intermodulation)** comes from loose, dirty or corroded connectors and rusty metal near antennas. Use low-PIM parts and torque connectors properly.
- **Isolation**: a BDA oscillates if its output leaks back into its input. Keep donor and server antennas apart and shielded by the building, and measure isolation before turning the gain up.
- **Desense**: a nearby transmitter overloads a receiver. Separate antennas vertically, add cavity filters.` },
    { id: 'estimating', title: 'Estimating materials and labor', level: 'Advanced', calcs: ['cable-boxes', 'design-hours'], pages: [['materials', 'Materials List'], ['reports', 'Reports & Proposals'], ['sites', 'Runs between sites']], body: `Count every device from the drawings, then add cable by average run length × count, plus waste (about 10%). Measure outside runs on the map and over the terrain; slopes lengthen runs and slow trenching.

Labor: use your own historical hours per device and per foot when you have them. Add time for programming, testing, documentation, travel and project management. Track actual hours on each job to improve the next estimate.` },
  ] },
];

export const LEVELS: Level[] = ['Basic', 'Intermediate', 'Advanced'];
