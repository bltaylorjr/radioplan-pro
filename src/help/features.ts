// Feature guide: one entry per tool or button worth knowing about. The help manual's "What's new"
// page, each page's help panel ("On this page"), the menu's "Find a tool" search and the
// "▶ Show me" walkthroughs are all built from this list.
//
// To add a feature: add one entry below. `page` is the menu page id (src/data/menu.ts) where the
// walkthrough starts. Each walkthrough step highlights `target`, which is either a data-tour="..."
// name or "text:" followed by words on the button or heading (for example 'text:Clear all fields').
// A step whose target is not on screen still shows its words in the middle of the screen.
import type { TourStep } from './content';

export interface Feature {
  id: string;
  /** Version it arrived in, e.g. '1.5.41'. */
  version: string;
  title: string;
  /** Menu page where it lives and where "Show me" starts. */
  page: string;
  /** Other pages where it also shows (listed in their help too). */
  alsoOn?: string[];
  /** Where to find it, in plain words. */
  where: string;
  summary: string;
  /** Short numbered steps for the help manual. */
  steps: string[];
  keywords: string;
  /** Help manual topic with the full details. */
  topic?: string;
  tour?: TourStep[];
}

export const FEATURES: Feature[] = [
  { id: 'find-tool', version: '1.5.50', title: 'Find a tool and the new menu', page: 'company', where: 'Top of the menu on the left (☰ on a phone)',
    summary: 'Type what you want to do, like “azimuth” or “battery”, and the menu shows the pages, tools and help that match. The menu now follows the job from setup to closeout.',
    steps: ['Tap the 🔎 Find a tool box at the top of the menu.', 'Type a word, for example “relay”, “clear” or “log in”.', 'Tap a result. Tools marked ▶ open their page and show you where the button is.', 'Tap a heading in the menu (like “Site survey”) to fold it up or open it again.'],
    keywords: 'find search menu where is how do i navigation organize sections fold collapse whats new',
    topic: 'menu-guide',
    tour: [
      { target: 'nav-find', title: 'Find a tool', text: 'Type what you want to do. Pages, tools and help topics that match show up here.' },
      { target: 'nav-groups', title: 'The menu follows the job', text: 'Project setup, site survey, design, codes and permits, equipment and materials, installation, testing, service and repair, then reports. Tools, projects and settings are at the bottom.' },
      { target: 'nav-whatsnew', title: 'What’s new', text: 'Every new tool, with a ▶ Show me walkthrough.' },
    ] },

  { id: 'rr-download', version: '1.5.35', title: 'RadioReference frequencies', page: 'radioref', alsoOn: ['erces', 'indoor', 'equipment'], where: 'Design radio & antennas → RadioReference Frequencies',
    summary: 'Download a county’s frequencies, trunked sites and talkgroups once while online, then use them offline in ERCES / BDA, DAS and the link budget. Kept encrypted on this device only.',
    steps: ['Open RadioReference Frequencies and log in.', 'Pick the state and county (the project county is chosen for you).', 'Tap ⬇ Download frequencies for this county.', 'Use the list on the Emergency Radio (ERCES / BDA) page and in frequency pickers.'],
    keywords: 'radioreference radio reference frequencies talkgroups trunked p25 county public safety fire police ems scanner', topic: 'radioref',
    tour: [
      { target: 'text:Download frequencies for this county', title: 'Download a county', text: 'Needs internet once. Afterwards the frequencies work offline.' },
    ] },
  { id: 'rr-login', version: '1.5.36', title: 'RadioReference log in and log out', page: 'radioref', where: 'RadioReference Frequencies page, at the top',
    summary: 'Log in with your RadioReference username and password. Tick Stay logged in to stay logged in on this device. Log out removes your login and hides the saved frequencies.',
    steps: ['Type your RadioReference username and password. (The app key is entered once in User Settings.)', 'Tick Stay logged in if you want to stay logged in on this device.', 'Tap Log in.', 'Tap Log out when you are done on a shared device.'],
    keywords: 'login log in sign in password username stay logged in log out sign out app key', topic: 'radioref',
    tour: [
      { target: 'text:Stay logged in', title: 'Stay logged in', text: 'Ticked: you stay logged in on this device. Not ticked: you are logged out when the app closes.' },
      { target: 'text:Log in', title: 'Log in', text: 'Checks your RadioReference Premium account. Your login is kept encrypted on this device only.' },
    ] },
  { id: 'rr-progress', version: '1.5.40', title: 'Download progress', page: 'radioref', where: 'RadioReference page while downloading, and the ⬇ RadioRef badge at the top',
    summary: 'A progress bar shows the percent done, the step it is on and about how long is left. You can open other pages; the badge at the top keeps showing the progress.',
    steps: ['Start a county download.', 'Watch the bar, or open another page and keep working.', 'Tap the ⬇ RadioRef badge at the top to come back.', 'When it shows ✓, the page lists what was saved.'],
    keywords: 'progress bar percent download time left badge', topic: 'radioref',
    tour: [
      { target: 'text:Download frequencies for this county', title: 'Start a download', text: 'After logging in, tap here. A progress bar shows the percent done and about how long is left.' },
      { target: 'text:⬇ RadioRef', title: 'Badge at the top', text: 'While it downloads you can open other pages; this badge shows the progress. Tap it to come back.' },
    ] },

  { id: 'tilt-view', version: '1.5.37', title: '3D tilt view', page: 'terrain', alsoOn: ['locate', 'coverage', 'directions'], where: 'Above every map: ⛰ 3D tilt view',
    summary: 'See the area as a 3D model with satellite pictures on top. Tilt it, turn it and zoom. Plot point A, point B and relay points to check line of sight over the hills.',
    steps: ['Tap ⛰ 3D tilt view above a map.', 'Drag the Tilt slider, or tap Straight down, Tilted or Low angle.', 'Enter point A and point B by GPS, address, ◎ My GPS or 📍 Pick on 3D.', 'Green means clear, orange means the Fresnel zone is partly blocked, red means blocked.', 'Tap 🗺 Flat map to go back.'],
    keywords: '3d tilt tilted perspective satellite drape line of sight obstruction point a point b viewshed', topic: 'terrain',
    tour: [
      { target: 'text:3D tilt view', title: '3D tilt view', text: 'Tap here to see this map as a tilted 3D model with satellite pictures.' },
      { target: 'text:Flat map', title: 'Back to the flat map', text: 'Tap here to go back to the normal map.' },
    ] },
  { id: 'relays', version: '1.5.37', title: 'Relay points around hills', page: 'terrain', where: '⛰ 3D tilt view → ＋ Add relay point',
    summary: 'When a hill blocks the path, add a relay point to bounce the signal around it. Each hop is checked on its own, and 💡 Suggest a relay spot finds a spot that sees both ends.',
    steps: ['Open the ⛰ 3D tilt view and plot point A and point B.', 'If the hop is red, tap 💡 Suggest a relay spot, or tap ＋ Add relay point and place it.', 'Each hop shows its own color, azimuth and tilt.'],
    keywords: 'relay repeater bounce hop hill blocked suggest relay spot', topic: 'terrain',
    tour: [
      { target: 'text:3D tilt view', title: 'Open the 3D tilt view', text: 'Tap Next and the 3D tilt view opens.', click: true },
      { target: 'text:Add relay point', title: '＋ Add relay point', text: 'Adds a relay between point A and point B. Each hop is checked on its own.' },
      { target: 'text:Suggest a relay spot', title: '💡 Suggest a relay spot', text: 'Finds the nearest spot that can see both ends of a blocked hop.' },
      { target: 'text:Flat map', title: 'Back to the flat map', text: 'Tap Next to go back to the flat map.', click: true },
    ] },

  { id: 'azimuth', version: '1.5.39', title: 'Azimuth and compass bearings everywhere', page: 'path', alsoOn: ['equipment', 'optimize', 'erces', 'indoor', 'survey', 'blueprints', 'reports', 'terrain'], where: 'Path Profile, Equipment, Tilt & Azimuth, ERCES, maps and reports',
    summary: 'Every direction shows degrees true (°T, as on maps and FCC filings) and a compass reading (°M), plus the back azimuth for aiming the far end.',
    steps: ['Open Path Profile / LOS / Fresnel to see azimuth and back azimuth between the sites.', 'Tap 🎯 Aim at to point the antenna at the far end.', 'Use the compass reading (°M) when aiming with a hand compass.'],
    keywords: 'azimuth bearing back azimuth compass magnetic declination true north aim antenna', topic: 'azimuth',
    tour: [ { target: 'text:Azimuth', title: 'Azimuth both ways', text: 'Direction to aim from each end, true (°T) and compass (°M), with the magnetic declination.' } ] },
  { id: 'measure', version: '1.5.39', title: 'Measure distance & azimuth on a map', page: 'terrain', alsoOn: ['locate', 'directions', 'coverage'], where: 'Above every flat map: 📏 Measure distance & azimuth',
    summary: 'Tap points on the map to see each leg’s distance, azimuth and back azimuth.',
    steps: ['Tap 📏 Measure distance & azimuth above the map.', 'Tap the map at each point.', 'Read the distance and azimuth of each leg under the map.', 'Tap the button again to stop.'],
    keywords: 'measure distance ruler bearing azimuth map', topic: 'azimuth',
    tour: [ { target: 'text:Measure distance & azimuth', title: 'Measure', text: 'Tap here, then tap points on the map.' } ] },
  { id: 'donor-aim', version: '1.5.39', title: 'Donor antenna aiming', page: 'erces', alsoOn: ['indoor'], where: 'Emergency Radio (ERCES / BDA) → Donor antenna aiming',
    summary: 'Type the donor tower’s GPS or address, or tap Aim donor here in the RadioReference list, to get the azimuth and tilt for the roof donor antenna.',
    steps: ['Open Emergency Radio (ERCES / BDA).', 'In Donor antenna aiming, type the tower’s GPS or address, or pick a site.', 'Aim the donor antenna at the azimuth shown (true and compass).'],
    keywords: 'donor antenna aim bda erces tower azimuth', topic: 'azimuth',
    tour: [ { target: 'text:Donor antenna aiming', title: 'Donor antenna aiming', text: 'Enter the donor tower here to get the aiming direction.' } ] },

  { id: 'draw-lines', version: '1.5.41', title: 'Draw lines on the map', page: 'terrain', alsoOn: ['locate', 'coverage', 'directions'], where: 'Above every flat map: ✏️ Draw lines',
    summary: 'Draw a road, trail or cable route by hand or point by point and see the predicted signal, hidden spots and ground height along it. Add a heat map around the lines.',
    steps: ['Tap ✏️ Draw lines above the map.', 'Pick ✍️ Draw by hand and drag, or 📍 Tap points (straight) and tap ✓ Finish line.', 'Read the signal and terrain along the line under the map.', 'Tap ✏️ Edit points to drag, add or delete points.'],
    keywords: 'draw line freehand route road trail cable path heat map edit points', topic: 'terrain',
    tour: [
      { target: 'text:Draw lines', title: 'Draw lines', text: 'Tap here to start drawing on the map.' },
      { target: 'map', title: 'The map', text: 'Drag your finger or mouse to draw. Lines are colored by predicted signal and saved with the project.' },
    ] },

  { id: 'clear-page', version: '1.5.42', title: 'Clear all fields on a page', page: 'company', alsoOn: ['*'], where: 'Top of each page, next to ? Page help: ⌫ Clear all fields',
    summary: 'Empties only this page’s boxes after asking first. ↶ Undo puts them back, and a copy from before is kept in Projects → History.',
    steps: ['Open the page you want to empty.', 'Tap ⌫ Clear all fields at the top.', 'Read the box that says what will be cleared, then confirm.', 'Changed your mind? Tap ↶ Undo right away.'],
    keywords: 'clear reset erase empty blank fields start over undo', topic: 'getting-started',
    tour: [ { target: 'text:Clear all fields', title: 'Clear all fields', text: 'Empties this page only, after asking. Other pages and saved projects are not touched.' } ] },
  { id: 'delete-confirm', version: '1.5.42', title: 'Delete asks “Are you sure?”', page: 'projects', alsoOn: ['fieldnotes', 'reports', 'library', 'contacts', 'wifi', 'survey', 'indoor'], where: 'Every 🗑 Delete button',
    summary: 'Deleting a project, note, photo, file, reading or library item always asks first, on every device.',
    steps: ['Tap Delete (or 🗑) next to the item.', 'Read the “Are you sure?” box: it names what will be deleted.', 'Tap Delete to delete it, or Cancel to keep it.'],
    keywords: 'delete remove trash are you sure confirm', topic: 'projects',
    tour: [ { target: 'text:Delete', title: 'Delete', text: 'Tap Delete and a box asks “Are you sure?” and names what will be deleted. Nothing is deleted until you confirm.' } ] },

  { id: 'true-scale', version: '1.5.43', title: 'True-scale side view and 3D beam', page: 'optimize', alsoOn: ['path', 'terrain', 'view3d'], where: 'Tilt, Azimuth & Power → Side view of the beam',
    summary: 'See the real ground along the antenna’s direction and where the beam lands. True scale (1 : 1) shows hills and tilt angles as they really are; Stretched makes small hills easy to see.',
    steps: ['Open Tilt, Azimuth & Power.', 'In Side view of the beam, pick 📐 2D side view or ⛰ 3D view.', 'Set Height scale to True scale (1 : 1) or Stretched.', 'Change the tilt and watch where the beam meets the ground.'],
    keywords: 'true scale side view beam 3d beam height scale stretched exaggeration downtilt', topic: 'optimize',
    tour: [ { target: 'text:Side view of the beam', title: 'Side view of the beam', text: 'The beam over the real ground, with the earth curve.' } ] },

  { id: 'az-calc', version: '1.5.44', title: 'Azimuth calculator', page: 'calculators', where: 'Tools & reference → Calculators → Location & units',
    summary: 'Two GPS points or addresses give the true and compass azimuth, back azimuth, distance and up / down tilt from the antenna heights.',
    steps: ['Open Calculators.', 'Type “azimuth” in the calculator search, or scroll to Location & units.', 'Enter the two points and antenna heights.', 'Tap ➜ Apply to fields… to send the result to Tilt, Azimuth & Power or ERCES donor aiming.'],
    keywords: 'azimuth calculator bearing back azimuth distance tilt two points', topic: 'calculators',
    tour: [ { target: 'text:Azimuth calculator', title: 'Azimuth calculator', text: 'Enter two points to get the aiming direction both ways.' } ] },
  { id: 'calc-kit', version: '1.5.44', title: 'Calculator Reset, Use project values and Apply', page: 'calculators', where: 'Top right of each calculator',
    summary: 'Each calculator keeps its own numbers. ↺ Reset puts one back to its example, ⇣ Use project values copies numbers in, and ➜ Apply to fields… puts the result into the project after you check it.',
    steps: ['↺ Reset: back to the example numbers for that calculator only.', '⇣ Use project values: copies matching numbers from this project.', '➜ Apply to fields…: shows each field, old → new; untick any you don’t want, then apply.', 'Tap Undo right after if you change your mind.'],
    keywords: 'reset apply to fields use project values calculator undo', topic: 'calculators',
    tour: [
      { target: 'text:Reset', title: '↺ Reset', text: 'Puts just this calculator back to its example.' },
      { target: 'text:Apply to fields', title: '➜ Apply to fields…', text: 'Sends the result to the matching fields on other pages, after you check each one.' },
    ] },

  { id: 'reset-project', version: '1.5.50', title: 'Reset project and Delete project', page: 'company', where: 'Top of Company & Project',
    summary: '↺ Reset project empties every page of the open project and keeps it as a blank project. 🗑 Delete project removes it from this device. Both ask first, and ↶ Undo puts it back right after.',
    steps: ['Open Company & Project.', 'Tap ↺ Reset project to start the whole project over, or 🗑 Delete project to remove it.', 'Read the “Are you sure?” box, then confirm.', 'Tap ↶ Undo right away if you change your mind.'],
    keywords: 'reset project start over blank delete project remove undo', topic: 'getting-started',
    tour: [ { target: 'text:Reset project', title: '↺ Reset project', text: 'Clears every page of this project. It asks first, and Undo puts it back.' }, { target: 'text:Delete project', title: '🗑 Delete project', text: 'Removes this project from the device, after asking.' } ] },
  { id: 'fcc-towers', version: '1.5.51', title: 'FCC towers & licenses', page: 'fcc', where: 'Design: radio & antennas → FCC Towers & Licenses',
    summary: 'Every FCC-registered tower and licensed transmitter near a site: owner, height, distance and azimuth, and who is on each tower on what frequencies. Works offline.',
    steps: ['Open FCC Towers & Licenses.', 'Pick a project site, an address or your GPS.', 'Narrow it by band if you like.', 'Read the towers and licenses on the map and in the list.'],
    keywords: 'fcc tower asr uls license licensee frequencies nearby who is on the tower', topic: 'fcc',
    tour: [ { target: 'text:Find towers and licenses', title: 'Find towers and licenses', text: 'Pick the spot to look around.' } ] },
  { id: 'faa-check', version: '1.5.51', title: 'FAA height check', page: 'faa', where: 'Codes, permits & drawings → FAA Height Check',
    summary: 'Type the overall height and the app checks every airport and heliport nearby: notice Needed, Not needed or Check, and the tallest structure without notice.',
    steps: ['Open FAA Height Check.', 'Type the overall structure height (the ground height fills in).', 'Read Needed / Not needed / Check and each airport’s margin.'],
    keywords: 'faa part 77 airport heliport height notice 7460 obstruction', topic: 'faa',
    tour: [ { target: 'text:Structure', title: 'Structure', text: 'Type the overall height here.' } ] },
  { id: 'booster-reg', version: '1.5.51', title: 'FCC Class B booster registration', page: 'erces', where: 'Emergency Radio (ERCES / BDA) → FCC Class B booster registration',
    summary: 'Fills in the booster registration from the project, checks the 5 W ERP limit, finds the public-safety licensees in the passbands and writes each consent request letter.',
    steps: ['Open Emergency Radio (ERCES / BDA).', 'Scroll to FCC Class B booster registration.', 'Check the filled-in details and the licensees found.', 'Send the consent letters and tick them off as they come back.'],
    keywords: 'booster registration class b fcc consent letter licensee bda 90.219', topic: 'erces',
    tour: [ { target: 'text:FCC Class B booster registration', title: 'Booster registration', text: 'Registration details, ERP check and consent letters.' } ] },
  { id: 'map-packs', version: '1.5.51', title: 'Offline map packs', page: 'mappacks', alsoOn: ['terrain'], where: 'Tools & reference → Offline Map Packs (also on Map & Terrain)',
    summary: 'Download satellite pictures, topo maps and terrain for an area before going where there is no signal. Shows the size first and the progress while it downloads.',
    steps: ['Open Offline Map Packs.', 'Choose the area around your sites, an address or a GPS point.', 'Pick the detail and what to save, check the size, then download.', 'Keep working on other pages; a badge at the top shows the progress.'],
    keywords: 'offline map pack download area satellite topo terrain no internet', topic: 'mappacks' },
  { id: 'photo-survey', version: '1.5.52', title: 'Photo site survey', page: 'photosurvey', alsoOn: ['terrain'], where: 'Site survey → Photo Site Survey',
    summary: 'Take photos all the way around a spot. The app lines them up with the terrain horizon and shows sites, towers, what blocks the view and predicted signal on the photos.',
    steps: ['Stand where an antenna might go and tap 📷 Take photos here, or add photos you already took.', 'The app places each photo by its GPS and compass and lines it up with the skyline.', 'Tick the layers you want: terrain horizon, azimuth, sites, towers, what blocks the view, heat map.', 'Tap 📄 Save picture for reports.'],
    keywords: 'photo survey panorama horizon skyline towers obstructions heat map pictures compass', topic: 'photosurvey',
    tour: [ { target: 'text:Take photos here', title: '📷 Take photos here', text: 'Take several photos all the way around, or one panorama.' } ] },
  { id: 'tool-settings', version: '1.5.49', title: 'Turn tools on or off', page: 'settings', where: 'Projects & settings → User Settings',
    summary: 'Untick the tools you do not use and they leave the menu, step numbers and Next / Previous. Nothing is deleted; tick a tool to bring it back. Tools also follow the project type.',
    steps: ['Open User Settings at the bottom of the menu.', 'Untick any tool you do not use, or tap Only what this project needs.', 'Tap Show every tool to bring them all back.'],
    keywords: 'settings turn off hide tools show every tool only what this project needs menu', topic: 'settings',
    tour: [ { target: 'text:Tools shown in the menu', title: 'Tools shown in the menu', text: 'Untick a tool to take it out of the menu. Nothing is deleted.' }, { target: 'text:Only what this project needs', title: 'Only what this project needs', text: 'Hides the tools this job does not use.' } ] },
  { id: 'data-check', version: '1.5.49', title: 'Check my data and entry checks', page: 'settings', alsoOn: ['*'], where: 'User Settings → Check my data, and every number box',
    summary: 'Number boxes turn red with a plain message and a suggested fix when a value is out of range. Check my data goes through the whole project and lists anything empty, out of range or mismatched, with a button to fix it.',
    steps: ['Type a number. If it is out of range, read the message under the box and tap Use … for the suggested value.', 'Open User Settings and look at Check my data.', 'Tap Fix on … to go to the page with the problem.'],
    keywords: 'check my data wrong entry red box out of range validate mistake error fix blank zero', topic: 'settings',
    tour: [ { target: 'text:Check my data', title: 'Check my data', text: 'Every empty, out-of-range or mismatched entry in the project, with a Fix button.' } ] },
  { id: 'rr-appkey', version: '1.5.67', title: 'RadioReference app key (in User Settings)', page: 'settings', alsoOn: ['radioref'], where: 'User Settings → RadioReference app key',
    summary: 'The RadioReference app key is entered once in User Settings, kept encrypted on this device, and is no longer on the login page. Do not change it unless RadioReference sends a new one.',
    steps: ['Open User Settings at the bottom of the menu.', 'Paste the key RadioReference emailed you and tap Save app key (one time).', 'Leave it alone after that: Change… asks first, because a wrong key stops downloads.'],
    keywords: 'radioreference radio reference app key api key settings change warning', topic: 'radioref',
    tour: [ { target: 'text:RadioReference app key', title: 'RadioReference app key', text: 'Entered once. Do not change it: a wrong key stops downloads.' } ] },
  { id: 'auto-care', version: '1.5.48', title: 'Automatic care', page: 'projects', where: 'Projects & Storage → Automatic care',
    summary: 'The app checks and repairs its own saved data, keeps downloads current when online, makes daily backups, and goes back to the last good version if an update will not start. Nothing to set up.',
    steps: ['Open Projects & Storage.', 'The Automatic care card shows what it keeps checked and when.', 'Tap Check everything now to run the checks right away.', 'A short notice tells you when something was fixed.'],
    keywords: 'automatic care self repair fix damaged backup refresh check everything update rollback broken', topic: 'selfrepair',
    tour: [ { target: 'text:Automatic care', title: 'Automatic care', text: 'What the app keeps checked and repaired by itself.' }, { target: 'text:Check everything now', title: 'Check everything now', text: 'Runs every check right away.' } ] },
  { id: 'live-signal', version: '1.5.53', title: 'Live signal readings', page: 'signal', alsoOn: ['erces', 'survey'], where: 'Site survey → Live Signal Readings',
    summary: 'Read a signal meter over Bluetooth, USB or Wi-Fi, use the phone’s own signal, or type the reading. Each reading keeps its GPS spot and is compared with the prediction. Includes the ERCES / BDA grid test.',
    steps: ['Open Live Signal Readings.', 'Connect a meter, or use the phone’s signal, or type the reading.', 'Tap 📍 Save reading at each spot.', 'Read how the readings compare with the prediction, and calibrate the model with one tap.'],
    keywords: 'live signal meter reading dbm walk test grid test erces bda compare prediction import g-nettrack', topic: 'signal',
    tour: [ { target: 'text:Take a reading', title: 'Take a reading', text: 'Pick where the reading comes from: a meter, the phone or typed in.' }, { target: 'text:Save reading', title: '📍 Save reading', text: 'Saves the reading with its GPS spot and time.' } ] },
  { id: 'asset-tags', version: '1.5.53', title: 'Equipment & asset tags', page: 'assets', alsoOn: ['service'], where: 'Service, troubleshooting & repair → Equipment & Asset Tags',
    summary: 'Scan a barcode or QR tag with the camera to open that device or start a new one: make, model, serial, location, photos, warranty, PM due dates and service history.',
    steps: ['Open Equipment & Asset Tags.', 'Tap 📷 Scan tag and point the camera at the tag.', 'A known tag opens the device; a new tag starts one.', 'Use ✔ PM and 🛠 Fixed to log visits; print labels or the list.'],
    keywords: 'asset tag barcode qr scan serial warranty pm due service history equipment list labels', topic: 'assets',
    tour: [ { target: 'text:Scan tag', title: '📷 Scan tag', text: 'Point the camera at a barcode or QR code.' }, { target: 'text:At a glance', title: 'At a glance', text: 'PM overdue, due soon and the count by system.' } ] },
  { id: 'bt-devices', version: '1.5.53', title: 'Bluetooth & Wi-Fi devices', page: 'devices', where: 'Tools & reference → Bluetooth & Wi-Fi Devices',
    summary: 'Connect signal meters, GPS receivers, laser distance meters and barcode scanners once; every page uses them. A chip at the top shows what is connected.',
    steps: ['Open Bluetooth & Wi-Fi Devices.', 'Pick the kind of device and tap 🔵 Bluetooth, 🔌 USB / COM port or 📶 Connect on Wi-Fi.', 'The 🔵 chip at the top shows it is connected.'],
    keywords: 'bluetooth wifi usb device connect meter gps receiver rtk laser distance barcode scanner', topic: 'devices',
    tour: [ { target: 'text:Signal meter', title: 'Pick a device', text: 'Signal meter, GPS receiver, laser distance meter or barcode scanner.' } ] },
  { id: 'full-page', version: '1.5.33', title: 'Full page view', page: 'terrain', alsoOn: ['coverage', 'view3d', 'path', 'autodesign', 'blueprints', 'indoor'], where: 'Above any map, 3D view or diagram: ⛶ Full page',
    summary: 'Shows the map, 3D view or diagram on the whole screen. ✕ Close goes back.',
    steps: ['Tap ⛶ Full page above a map or diagram.', 'Tap ✕ Close when you are done.'],
    keywords: 'full screen full page bigger enlarge', topic: 'getting-started',
    tour: [ { target: 'text:Full page', title: '⛶ Full page', text: 'Shows this view on the whole screen.' } ] },
  { id: 'full-page-controls', version: '1.5.64', title: 'Layers, zoom and tilt on full page maps', page: 'coverage', alsoOn: ['terrain', 'view3d', 'path', 'models', 'campus', 'autodesign', 'indoor', 'fcc', 'network'], where: 'Any map or 3D view on ⛶ Full page: 🗂 Layers (top right) and the big buttons (bottom right)',
    summary: 'On a full page map, 🗂 Layers picks the map picture (topo, satellite, streets) and switches each layer on or off: sites and radio path, coverage heat map, towers, FCC towers, photo spots and the page\'s drawings. Big ＋ and − buttons zoom, ⤢ shows everything, and ⛰ Tilt opens the 3D view, where ⤒ ⤓ tilt, ⟲ ⟳ turn and N puts north back at the top. Hold a button to keep going.',
    steps: ['Tap ⛶ Full page above a map or 3D view.', 'Tap 🗂 Layers to choose what shows, then Done.', 'Use ＋ − to zoom. On the flat map tap ⛰ Tilt for 3D.', 'In 3D use ⤒ ⤓ to tilt, ⟲ ⟳ to turn and N for north up.'],
    keywords: 'layers layer zoom tilt turn rotate spin north full page full screen map 3d buttons iphone phone', topic: 'getting-started',
    tour: [ { target: 'text:Full page', title: '⛶ Full page', text: 'Open full page to get the Layers, zoom and tilt buttons.' } ] },
  { id: 'background-terrain', version: '1.5.65', title: 'Terrain and towers download by themselves', page: 'view3d', alsoOn: ['path', 'terrain', 'sites', 'faa'], where: '3D Model, Path profile and Map & Terrain: nothing to tap',
    summary: 'While you are online the app downloads the terrain around your sites, extra detail (about 8 m) along the radio link and the existing towers for the area in the background, and saves them for offline use. 3D Model shows the sharpest terrain; Link detail and Whole area switch between the path and the full area.',
    steps: ['Add your sites (and pick TX and RX).', 'Stay online for a minute: terrain, link detail and towers arrive by themselves.', 'On 3D Model choose Link detail or Whole area.'],
    keywords: 'terrain download automatic background offline elevation dem detail towers preload ready', topic: 'getting-started',
    tour: [ { target: 'text:Vertical exaggeration', title: 'Terrain', text: 'Terrain downloads by itself in the background and is saved for offline use.' } ] },
  { id: 'intro-video', version: '1.5.16', title: 'Introduction video', page: 'company', where: 'Top bar: ▶ Video',
    summary: 'A narrated tour of every page and tool. It plays offline.',
    steps: ['Tap ▶ Video at the top of the screen.', 'Close it any time; it is always there to watch again.'],
    keywords: 'video intro tour watch learn', topic: 'getting-started',
    tour: [ { target: 'text:▶ Video', title: '▶ Video', text: 'Watch the narrated tour of the app.' } ] },
  { id: 'legacy-equipment', version: '1.5.56', title: 'Legacy equipment and access control in the library', page: 'library', alsoOn: ['troubleshoot', 'equipment', 'materials'], where: 'Equipment & materials → Specifications Library → ⚠ Legacy equipment',
    summary: 'Current equipment for every low-voltage system (access control in depth), and older or discontinued models still found on service calls, each with suggested replacements, repair notes and the maker\'s documentation pages.',
    steps: ['Open the Specifications Library.', 'Tap ⚠ Legacy equipment, or a system such as Security & access control.', 'Tap a model to see its status, replacements, service notes and documentation links.', 'Attach the manual under the model to keep it on this device.'],
    keywords: 'legacy discontinued obsolete older replacement access control reader maglock strike controller credential manual datasheet',
    topic: 'library',
    tour: [ { target: 'text:Legacy equipment', title: 'Legacy equipment', text: 'Older and discontinued models, filed under their systems, with replacements and repair notes.' } ] },
  { id: 'recall-alerts', version: '1.5.56', title: 'Recall and service bulletin alerts', page: 'library', where: 'Specifications Library (each model) and a banner on every page of a matching project',
    summary: 'Official CPSC recalls are built in and update by themselves when online. When equipment in a project matches a recall or a bulletin you added, a warning shows on every page of that project until you mark it checked.',
    steps: ['Open a model in the Specifications Library to see its recalls and bulletins.', 'Tap + Add a service bulletin to add one from the maker.', 'On a project with a match, tap Show on the warning, check the label, then tap Checked for this project.'],
    keywords: 'recall cpsc safety notice service bulletin tsb alert warning date code',
    topic: 'library' },
  { id: 'mat-costing', version: '1.5.63', title: 'Prices and changes on the Materials list', page: 'materials', where: 'Equipment & materials → Materials List & Estimate',
    summary: 'Type a unit cost on any line to get line, category and materials totals. Change any line (item, brand, part number, unit, vendor, price) with ✎, remove lines with ✕ and put them back later. Prices are remembered in your price list for the next project.',
    steps: ['Open Materials List & Estimate.', 'Type a unit cost in a line; the total fills in.', 'Tap ✎ to change a line, or ✕ to take it off the list.', 'Removed lines are under Removed lines at the bottom; tap Put back.'],
    keywords: 'cost costing estimate estimating price pricing unit cost total edit change remove delete put back price list', topic: 'materials',
    tour: [
      { target: 'text:Unit cost', title: 'Unit cost', text: 'Type what one unit costs you. The line total and the materials subtotal fill in.' },
      { target: 'text:Materials subtotal', title: 'Materials subtotal', text: 'All the materials added up, with a count of lines that still have no price.' },
    ] },
  { id: 'mat-search', version: '1.5.63', title: 'Search online for parts', page: 'materials', where: 'Materials List & Estimate → tick lines → 🔎 Search online',
    summary: 'Tick some lines or Select all, then search Google Shopping, Amazon, Octopart, Digi-Key, Mouser or your own vendors for them. Needs the internet.',
    steps: ['Tick the lines to look up, or tick Select all.', 'Tap 🔎 Search online.', 'Pick where to search, then tap a part or Open all.', 'Type the price you find into the line.'],
    keywords: 'search online parts lookup find price shopping amazon octopart digikey mouser select all', topic: 'materials',
    tour: [
      { target: 'mat-select', title: 'Pick lines', text: 'Tick lines in the table, or Select all.' },
      { target: 'text:🔎 Search online', title: 'Search online', text: 'Opens a search for each ticked part at the site you pick.' },
    ] },
  { id: 'mat-labor-budget', version: '1.5.63', title: 'Labor costs, project budget and over-budget warnings', page: 'materials', alsoOn: ['reports'], where: 'Materials List & Estimate → Labor costs and Estimate and budget',
    summary: 'Add labor lines (people × hours × rate) or let the app suggest them from the materials. Add tax, shipping, contingency and markup, type your budgets, and anything over budget shows in red.',
    steps: ['Under Labor costs, tap Suggest labor from the materials, or + Add labor.', 'Change people, hours or rate on any line.', 'Under Estimate and budget, type the tax, shipping and your budgets.', 'Red numbers are over budget; green shows what is left.'],
    keywords: 'labor labour hours rate technician budget over budget red contingency markup tax shipping freight total estimate proposal', topic: 'materials',
    tour: [
      { target: 'text:Suggest labor from the materials', title: 'Suggest labor', text: 'A starting labor estimate from the quantities on the list. Change any number.' },
      { target: 'mat-estimate', title: 'Estimate and budget', text: 'Totals beside your budgets. Anything over budget is red.' },
    ] },
  { id: 'vendors-db', version: '1.5.63', title: 'Vendors list with your own fields and stock checks', page: 'vendors', alsoOn: ['materials'], where: 'Equipment & materials → Vendors',
    summary: 'Keep your suppliers with contact, account and terms, add any field you need, and pick a vendor for each materials line. With a vendor\'s stock address, the app checks stock and price by itself when online.',
    steps: ['Open Vendors and tap + Add vendor.', 'Type the name and any details; tap + Add field for anything else.', 'Optional: paste their search page and stock addresses.', 'Tap Save vendor, then pick the vendor on Materials lines.'],
    keywords: 'vendor supplier distributor contact account terms add field custom stock inventory availability api', topic: 'vendors',
    tour: [
      { target: 'text:+ Add vendor', title: 'Add a vendor', text: 'Type the name, phone, email and any other details.' },
    ] },
  { id: 'weather-radar', version: '1.5.71', title: 'Weather & radar (NOAA)', page: 'weather', where: 'Tools & reference → Weather & Radar (NOAA)',
    summary: 'Live NOAA radar, weather alerts, current conditions and the 7-day forecast for the job site or where you are, work-day checks for tower, roof and cable work, and weather saved on the project.',
    steps: ['Open Tools & reference → Weather & Radar (NOAA).', 'Read the conditions and any alerts at the site.', 'Look at the radar map and the Work-day check.', 'Tap Add today\'s weather to Field Notes to keep a record.'],
    keywords: 'weather radar forecast noaa nws alerts warning lightning wind cold heat work day', topic: 'weather',
    tour: [ { target: 'wx-now', title: 'Weather here', text: 'The latest NOAA station report at the site.' }, { target: 'wx-radar', title: 'Radar map', text: 'NOAA’s live radar with alert areas.' }, { target: 'wx-work', title: 'Work-day check', text: 'Lightning, wind, cold and heat for the next 24 hours.' } ] },
];

/** Features that live on, or also show on, a page. Features marked for every page ('*') are left out unless `all`. */
export function featuresFor(page: string, all = false): Feature[] {
  return FEATURES.filter((f) => f.page === page || f.alsoOn?.includes(page) || (all && f.alsoOn?.includes('*')));
}

const vnum = (v: string) => v.split('.').reduce((a, x) => a * 1000 + (+x || 0), 0);
/** Newest first. */
export const FEATURES_BY_VERSION = [...FEATURES].sort((a, b) => vnum(b.version) - vnum(a.version));

/** Ask the app to open a feature's page and run its walkthrough. */
export function showFeature(id: string) {
  window.dispatchEvent(new CustomEvent('lvplan:feature', { detail: id }));
}
