// "▶ Guide me" walkthroughs for pages whose help topic has no tour of its own, by menu page id.
// Targets: a data-tour="..." name, or "text:" plus words on a button or heading. Add `click: true`
// to press that button when the person taps Next (for example to open the 3D tilt view first).
import type { TourStep } from './content';

export const PAGE_TOURS: Record<string, TourStep[]> = {
  systems: [
    { target: 'text:Project type and sub-projects', title: 'Project type', text: 'Pick the kind of job. The toolkits, calculators and suggested pages follow this choice.' },
    { target: 'text:Sub-projects on the same job', title: 'Sub-projects', text: 'Tick every other system on the same job, for example fire alarm plus access control.' },
  ],
  fieldnotes: [
    { target: 'text:New note', title: 'New note', text: 'Add a note with photos and the GPS spot. Notes are saved with the project.' },
    { target: 'text:Site survey checklist', title: 'Site survey checklist', text: 'Tick items off as you walk the site.' },
  ],
  autodesign: [
    { target: 'text:1. Project needs', title: '1. Project needs', text: 'Say what the building needs. The design and equipment list follow.' },
    { target: 'text:2D plan', title: '2D plan or 3D model', text: 'Switch between the flat plan and the 3D model of the building.' },
    { target: 'text:4. Recommended equipment', title: 'Recommended equipment', text: 'Equipment picked for these needs, with quantities.' },
    { target: 'text:5. Material estimate', title: 'Material estimate', text: 'Cable, boxes and parts. Send them to the Materials list.' },
  ],
  alarm: [
    { target: 'text:Fire alarm system (NFPA 72)', title: 'Fire alarm system', text: 'Enter the panel, battery and circuits.' },
    { target: 'text:Add device', title: 'Add devices', text: 'Add each device with its standby and alarm current.' },
    { target: 'text:Battery & NAC calculation', title: 'Battery and NAC', text: 'Battery size and voltage at the last device, worked out for you.' },
    { target: 'text:Code check: NFPA 72', title: 'Code check', text: 'Warnings when a value does not meet the code. Confirm with the AHJ.' },
  ],
  erces: [
    { target: 'text:Emergency responder radio coverage', title: 'ERCES / BDA', text: 'Building, bands and coverage needed for first responders.' },
    { target: 'text:Downlink budget', title: 'Downlink budget', text: 'Signal from the donor tower through the BDA to the far antennas.' },
    { target: 'text:Donor antenna aiming', title: 'Donor antenna aiming', text: 'Type the tower’s GPS or address to get the azimuth and tilt for the roof antenna.' },
    { target: 'text:Public-safety channels here', title: 'Public-safety channels', text: 'The county’s channels from RadioReference, after you download them.' },
  ],
  solar: [
    { target: 'text:Add load', title: 'Loads', text: 'Add everything the solar system must power, with watts and hours per day.' },
    { target: 'text:Sizing results', title: 'Sizing results', text: 'Panel, battery and charge controller sizes.' },
    { target: 'text:Code check: NEC 690', title: 'Code check', text: 'NEC 690, 706 and 480 checks.' },
  ],
  grounding: [
    { target: 'text:Grounding electrode system', title: 'Grounding', text: 'Ground rods, ring and bonding for the site.' },
    { target: 'text:Live code check', title: 'Live code check', text: 'Checks update as you type.' },
  ],
  optimize: [
    { target: 'text:Antenna orientation & power', title: 'Orientation and power', text: 'Antenna azimuth, downtilt and power for Site A.' },
    { target: 'text:Aim at Site B', title: '🎯 Aim at', text: 'Points the antenna straight at the far site.' },
    { target: 'text:Apply recommended tilt', title: 'Recommended tilt', text: 'Sets the downtilt that puts the beam on the service edge.' },
    { target: 'text:Side view', title: 'Side view of the beam', text: 'The beam over the real ground, so you can see where it lands.' },
  ],
  view3d: [
    { target: 'text:Download terrain', title: 'Terrain', text: 'Downloads the ground heights around the sites (needs internet once).' },
    { target: 'text:3D terrain model', title: '3D model', text: 'Drag to turn, scroll or pinch to zoom. Towers and the Fresnel zone are drawn to height.' },
  ],
  radioref: [
    { target: 'text:Log in to RadioReference', title: 'Log in', text: 'Your RadioReference Premium username and password. Kept encrypted on this device only.' },
    { target: 'text:Stay logged in', title: 'Stay logged in', text: 'Ticked: stay logged in on this device. Not ticked: logged out when the app closes.' },
    { target: 'text:Download frequencies for this county', title: 'Download a county', text: 'After logging in, download the county once. A progress bar shows how far along it is.' },
  ],
  lfhf: [
    { target: 'text:LF / MF / HF system', title: 'LF / HF system', text: 'Frequency, power, antenna and distance.' },
    { target: 'text:Results', title: 'Results', text: 'Ground wave and sky wave predictions.' },
  ],
  compliance: [
    { target: 'text:Compliance summary', title: 'Summary', text: 'Violations, warnings and notes for this project. Tap the filters to narrow the list.' },
    { target: 'text:Codes for the project address', title: 'Codes in effect', text: 'Code editions picked from the project address.' },
    { target: 'text:Permit and submittal checklist', title: 'Permit checklist', text: 'What to send the AHJ.' },
  ],
  materials: [
    { target: 'text:Materials list (bill of materials)', title: 'Materials list', text: 'Built from the design. Change any quantity, brand or model.' },
    { target: 'text:Add item', title: 'Add item', text: 'Add anything the design did not include.' },
    { target: 'text:Export PDF', title: 'Export', text: 'Save the list as PDF or CSV for ordering.' },
  ],
  blueprints: [
    { target: 'text:Blueprints', title: 'Blueprints', text: 'Drawing sheets for permits and installers, with a title block and north arrow.' },
  ],
  install: [
    { target: 'text:Installation guide', title: 'Pick a guide', text: 'Step-by-step instructions with color wiring diagrams.' },
    { target: 'text:Print', title: 'Print', text: 'Print the guide to take on site.' },
    { target: 'text:Installation checklist', title: 'Installation checklist', text: 'Tick items off as the install is done.' },
  ],
  testing: [
    { target: 'text:Load standard test plan', title: 'Test plan', text: 'Loads the standard tests for this kind of job.' },
    { target: 'text:Add test', title: 'Add test', text: 'Add your own tests and record pass or fail.' },
    { target: 'text:Testing checklist', title: 'Testing checklist', text: 'Tick items off during commissioning.' },
  ],
  reports: [
    { target: 'text:Report builder', title: 'Report builder', text: 'Pick what goes in the report or proposal.' },
    { target: 'text:Print / Save as PDF', title: 'Print or save', text: 'Print, or save as PDF, Word, Excel or a web page.' },
    { target: 'text:Import files', title: 'Attach files', text: 'Add photos, drawings and documents to the package.' },
    { target: 'text:Closeout checklist', title: 'Closeout checklist', text: 'Everything to hand over at the end of the job.' },
  ],
  troubleshoot: [
    { target: 'text:Troubleshooting wizard', title: 'Troubleshooting wizard', text: 'Pick the system and the device, then answer the questions. Each answer narrows down the fault.' },
  ],
  service: [
    { target: 'text:Service & maintenance resources', title: 'Service and PM', text: 'Service calls, PM visits and when the next one is due.' },
    { target: 'text:Attach file', title: 'Manuals and documents', text: 'Attach service manuals or add links; they open offline.' },
  ],
  calculators: [
    { target: 'text:Structured cabling', title: 'Calculators by trade', text: 'Calculators are grouped by trade. Type in the search box to find one fast, for example “azimuth” or “battery”.' },
  ],
  directions: [
    { target: 'text:Project location', title: 'Project location', text: 'The job address and GPS. Copy them for a text or email.' },
    { target: 'text:Directions', title: 'Directions', text: 'Opens driving directions in your maps app.' },
    { target: 'text:3D tilt view', title: '3D tilt view', text: 'See the area in 3D with satellite pictures.' },
  ],
  library: [
    { target: 'text:Specifications library', title: 'Specifications library', text: 'Equipment specs by category. Tap a category to filter.' },
    { target: 'text:Add equipment', title: 'Add equipment', text: 'Add your own equipment, or import a CSV.' },
  ],
  theory: [
    { target: 'text:Index', title: 'Index', text: 'Lessons from basic to advanced. Tap Basic, Intermediate or Advanced to filter.' },
  ],
  contacts: [
    { target: 'text:Pick a place', title: 'Pick a place', text: 'State, county and city. The project address is picked for you.' },
    { target: 'text:Add contact', title: 'Add contact', text: 'Add your own contacts; edit or remove them any time.' },
  ],
  projects: [
    { target: 'text:New project', title: 'New project', text: 'Starts a new job. The current one stays saved here.' },
    { target: 'text:Start a new project from a previous one', title: 'Reuse a project', text: 'Copy company, settings and equipment from an earlier job.' },
    { target: 'text:History of this project', title: 'History', text: 'Earlier versions of this project. Put one back if you need to.' },
    { target: 'text:Check for updates now', title: 'Updates', text: 'The app updates itself. Tap here to check right now.' },
    { target: 'text:Back up all projects', title: 'Backup', text: 'Save every project to one file.' },
  ],
  sync: [
    { target: 'text:Direct sync over Wi-Fi', title: 'Wi-Fi sync', text: 'Show a code on one device and scan it with the other. No internet needed.' },
    { target: 'text:Share by Bluetooth', title: 'Share', text: 'Send a sync file by Bluetooth, Nearby Share or email.' },
    { target: 'text:Automatic sync through a cloud-drive folder', title: 'Cloud folder', text: 'Pick a cloud-drive folder to keep devices in step over cellular.' },
  ],
  settings: [
    { target: 'text:Tools shown in the menu', title: 'Tools in the menu', text: 'Untick the tools you do not use. They leave the menu and the step numbers; nothing is deleted.' },
    { target: 'text:Check my data', title: 'Check my data', text: 'Lists every empty, out-of-range or mismatched entry, with a button to fix it.' },
  ],
};

/** Extra steps added to the end of existing page tours, for tools added later. */
export const PAGE_TOUR_EXTRAS: Record<string, TourStep[]> = {
  terrain: [
    { target: 'text:Draw lines', title: '✏️ Draw lines', text: 'Draw a road, trail or cable route and see the signal along it.' },
    { target: 'text:Measure distance & azimuth', title: '📏 Measure', text: 'Tap points to see distance and azimuth.' },
    { target: 'text:3D tilt view', title: '⛰ 3D tilt view', text: 'Tap Next to open the 3D tilt view.', click: true },
    { target: 'text:Add relay point', title: 'Relay points', text: 'Plot point A and point B, then add relay points to get around hills.' },
    { target: 'text:Flat map', title: 'Back to the flat map', text: 'Tap Next to go back to the flat map.', click: true },
  ],
  path: [
    { target: 'text:Azimuth', title: 'Azimuth', text: 'Direction to aim at each end, true (°T) and compass (°M).' },
  ],
};
