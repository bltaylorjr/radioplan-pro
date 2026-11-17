// Interactive help manual content. Each topic is searchable; `page` links a topic to a workflow page,
// and `tour` lists guided-walkthrough steps that highlight elements marked with data-tour="...".
import { MENU_GROUPS, MENU_PAGES, MENU_ORDER, groupHeading } from '../data/menu';
import { FEATURES_BY_VERSION } from './features';
import { PAGE_TOURS, PAGE_TOUR_EXTRAS } from './tours';

export interface TourStep { target: string; title: string; text: string;
  /** Press the target when Next is tapped (to open a view before the next step). */
  click?: boolean }
export interface HelpTopic { id: string; title: string; page?: string; keywords: string; summary: string; body: string; tour?: TourStep[];
  /** Feature cards (from features.ts) shown under the topic, each with ▶ Show me. */
  features?: string[] }

/** Help pages built from the menu list and the feature list, so new pages and tools show up by themselves. */
const GUIDE_TOPICS: HelpTopic[] = [
  { id: 'whats-new', title: "What's new", keywords: 'whats new new features latest update changes release version show me walkthrough',
    summary: 'The newest tools, newest first. Tap ▶ Show me on any of them to go to the page and see where the button is.',
    body: 'Each card says where the tool is and how to use it in a few steps. **▶ Show me** opens the page and points at the buttons one at a time. **Read more** opens the full help topic.',
    features: FEATURES_BY_VERSION.map((f) => f.id) },
  { id: 'menu-guide', title: 'Using the menu', keywords: 'menu navigation sidebar find a tool search sections steps where is how do i fold collapse next previous skip',
    summary: 'The menu on the left follows the job from setup to closeout. Type in 🔎 Find a tool to jump straight to a page or tool.',
    body: [
      '**🔎 Find a tool** at the top of the menu searches every page, tool and help topic. Type a word such as “azimuth”, “battery”, “relay” or “clear”, then tap a result. Results marked ▶ open the page and show you the button.',
      '**Sections**: tap a section heading to fold it up or open it again. The section with the page you are on always stays open.',
      '**Steps**: the numbered sections are the job in order. Use **→** at the bottom of a page to go to the next step, or **Skip this step** if the job does not need it. The last two sections are tools you can open any time. Tools you turn off in **User Settings** are left out of the menu (Find a tool skips them too).',
      MENU_GROUPS.map((g) => `**${groupHeading(g)}**: ${g.hint}\n` + MENU_PAGES.filter((p) => p.group === g.id).map((p) => `- ${p.label}`).join('\n')).join('\n\n'),
      'On a phone or small tablet, tap **☰** at the top left to open the menu.',
    ].join('\n\n'),
    features: ['find-tool'] },
];

export const HELP: HelpTopic[] = [
  ...GUIDE_TOPICS,
  { id: 'getting-started', title: 'Getting started', keywords: 'start clear reset erase undo intro video tour overview workflow usb android install save open project menu find a tool whats new show me guide me walkthrough', summary: 'The menu on the left follows the job from setup to closeout. Type in 🔎 Find a tool to jump to any page or tool.',
    body: `**The menu** (left side; tap **☰** on a phone) is in the order of a job: **Project setup**, **Site survey**, **Design: low-voltage systems**, **Design: radio & antennas**, **Codes, permits & drawings**, **Equipment & materials**, **Installation**, **Testing & commissioning**, **Service, troubleshooting & repair**, and **Reports & closeout**. **Tools & reference** and **Projects & settings** are at the bottom and can be opened any time; tools turned off in **User Settings** are left out of the menu. Tap a section heading to fold it up. Type in **🔎 Find a tool** at the top of the menu to jump straight to a page or tool, for example “azimuth”, “relay”, “battery” or “clear”. **★ What's new** lists the newest tools with a **▶ Show me** walkthrough for each. See **Using the menu** for the full list.

LvPlan Pro walks a project from first site visit to commissioning. Press **▶ Video** at the top of the screen for a narrated, captioned tour of every page and tool (it plays offline). Press **⛶ Full page** above any map, 3D view or diagram to show it on its own full screen; **✕ Close** (or Esc) brings you back. The tour opens and plays by itself the first time the app is opened; if it starts without sound, tap **🔊 Tap to turn on the sound**. Press **⌫ Clear all fields** at the top of a page to start that page over: it asks first, clears only that page (other pages, saved projects, the RadioReference login and downloads, the specifications library and contacts stay), and **↶ Undo** puts it back; a copy from before is also kept in Projects → History of this project. To start the whole project over, press **↺ Reset project** at the top of Company & Project; **🗑 Delete project** next to it removes the project (both ask first and can be undone right after). Press **Skip this step** at the bottom of any step you don't need on this job: it is greyed out in the menu and Next / Previous pass over it (open it from the menu and press **Don't skip it** to bring it back). Each page in the left sidebar is one **task**, in the order engineers normally perform them. Pages where work gets checked off (site survey, permits, installation, testing, closeout) have a **checklist** at the bottom; the sidebar shows ✓ when a checklist is finished.

- Your work saves automatically in this computer's browser storage.
- Use **Export** (top bar) to write a .radioplan.json file you can keep on the USB drive, email, or open on the Android app.
- Press **F1** or **? Page help** on any page for help on that page. The help lists the **Tools on this page**; tap **▶ Show me** and the app points at each button in turn. **▶ Guide me** walks through the whole page.
- Every **Delete** asks **Are you sure?** first and names what will be deleted.
- Small **?** bubbles next to fields explain what to enter.

**Important:** code citations and calculations are planning aids. A licensed professional engineer and the Authority Having Jurisdiction must verify the design.` },

  { id: 'locate', title: 'Find location & auto-plan', page: 'locate', keywords: 'address suggestions autocomplete search address location coordinates lat lon dms view satellite 3d auto plan build plan candidate tower site selection viewshed', summary: 'Type an address or coordinates, view the spot on topo/satellite/3D, and build a complete starting plan in one click.',
    body: `**Suggestions** appear as you type an address (on this page and in the company, client and site address fields): recent places, saved results and project sites work offline; online suggestions come from Photon (OpenStreetMap data). Use ↑ ↓ and Enter, or tap one.

**Search** with the box on this page. Accepted: street addresses and place names (needs internet; earlier results are remembered offline), decimal coordinates (35.2271, -80.8431), degrees-minutes-seconds (35°13'37"N 80°50'35"W) or degrees-decimal-minutes (N35 13.627 W80 50.587). You can also click the map.

**View**: topographic, satellite and hybrid maps, ground elevation from the USGS 3DEP point service, and a 3D terrain model around the spot.

**Build a plan** downloads terrain for the area, then tests a grid of candidate tower spots within the search radius. Each candidate is scored by how much of the service area it can see over the terrain (near line-of-sight) at your antenna height. The best spot becomes Site A, the location becomes the facility (Site B), and the band, antenna, azimuth, downtilt, feeder length, jurisdiction, coverage run, path profile, materials list, code checks and commissioning test plan are all filled in. Review and adjust every page afterwards.

Not considered: zoning, land ownership, FAA airspace, existing towers and leasing. Verify on site.`,
    tour: [ { target: 'text:Find a location', title: 'Find a location', text: 'Type an address or GPS coordinates and tap 🔎 Search.' }, { target: 'plan', title: 'Auto-plan', text: 'After a search, choose the band, service radius and tower height, then build the plan.' } ] },

  { id: 'offline', title: 'Working offline', keywords: 'offline no internet cache download area tiles usb android field', summary: 'Download an area ahead of time; maps, terrain, 3D, calculations, reports and help then work without a connection.',
    body: `Everything except map downloads, address search and the USGS point-elevation service runs on the device: all calculations, code checks, materials, reports, the help manual and the 3D viewer.

**Before going to the field** (while online):
1. Open the project (or search the location) so the sites are set.
2. On **Map & Terrain**, use **Save area for offline**: choose the radius around your sites (or the current map view), the detail level and the USGS map layers.
3. Terrain for your sites also downloads automatically and is cached.

**In the field**: the top bar shows **○ Offline**. Cached map tiles and terrain load automatically. Type coordinates instead of addresses (or use GPS / click the map). Previously searched addresses still work.

The cache lives in the app's storage on that device (browser profile for the USB file, app data on PC and Android). **Clear cache** frees the space.` },

  { id: 'company', title: 'Company & project', page: 'company', keywords: 'company imperial metric units feet meters measurement title address logo license engineer client project number state county jurisdiction', summary: 'Enter your company details (used on every report header) and the project jurisdiction.',
    body: `**Project information**: project name, project number, client PO / contract number, project site address, revision and date.

**Measurements:** choose Imperial (feet, inches, square feet, miles) or Metric (metres, millimetres, square metres, kilometres). Number boxes, results and distances switch at once; your data is not changed.

**Required fields (*):** project name, project type, client, site address, city, county, state and your company name. Press **Save project information** when you're done; any empty required field is then outlined in red and listed at the top of the page. Printing or exporting a report with missing information does the same and asks before going on.

**Save as my default:** after entering your company, logo, engineer and PE license, press **Save as my default**. New projects fill them in automatically; **Fill from my default** copies them into an older project.

**Your company information** (name, title, address, phone, license number and logo) and the **client / customer company** (name, contact, address, phone, email) are both printed in the header of every report.

**Project state** selects the code set used by the compliance checker: North Carolina, South Carolina, Georgia, Tennessee or Virginia. The county is printed on reports; check whether the county or city enforces a different code edition.

**Find on map** geocodes the company or project address to GPS coordinates and can create a site at that location.`,
    tour: [
      { target: 'company-form', title: 'Company details', text: 'Your company name, title and address appear on every report.' },
      { target: 'company-geocode', title: 'Address to GPS', text: 'Geocode the address to latitude/longitude and send it to the map, terrain and site pages.' },
      { target: 'project-form', title: 'Project & jurisdiction', text: 'Pick the state here. It drives which code editions are cited in the compliance warnings.' },
      
    ] },

  { id: 'sites', title: 'Site data & GPS', page: 'sites', keywords: 'site database csv import export multi-site spreadsheet gps nmea gnss rtk coordinates latitude longitude elevation antenna height structure tower airport geocode address runs between sites fiber conduit trench handhole underground aerial pole distance terrain slope grade labor crew hours existing towers co-locate', summary: 'Record each candidate site (position, ground elevation, structure, antenna height), see existing towers nearby, and plan cable and conduit runs between sites measured over the terrain.',
    body: `Each **site** is a candidate tower, rooftop or building location.

**Runs between sites**: plan fiber, Cat 6, coax, power or empty conduit between two sites. Press **+ Add run**, pick the two sites and how it is installed (underground in conduit, direct-buried, aerial on poles, or inside buildings), then click the map along the route to add bend points (follow the road, go around a building or creek). **Measure over the ground** uses the terrain for the area (downloaded or saved for offline use; otherwise the online elevation service; otherwise the two site elevations) to work out the map length, the length over the ground, the climb and drop, and the steepest grade, with a profile of the ground along the route. From that the app works out trench, conduit, sweeps, handholes (every 500 ft and at each bend), warning tape, cable with slack loops, enclosures, poles and strand for aerial runs, and crew-hours. Steep ground takes longer to trench and gets an erosion-control warning; Cat 6 over 328 ft and multimode over about 1,300 ft are flagged. Measured runs go into the **Materials** list and are added to the labor estimate on the **Reports** page. The production rates are starting points: type your own hours on the Reports page if your crew differs. Walk the route, and call 811 before any digging.

**Existing towers nearby**: lists the mapped towers and comm sites nearest the selected site (OpenStreetMap), with distance, bearing and height, so you can look at co-locating before planning a new structure. Check heights and owners in the FCC ASR database.

**Site database**: import many sites from a CSV spreadsheet. Columns are matched by name (name, latitude, longitude in decimal or DMS, ground elevation, antenna height / rad center, structure height, and optional transmitter columns: frequency, power, antenna, azimuth, tilt, line loss, channel, transmit). Missing ground elevations are looked up from USGS 3DEP. Export the sites back to CSV at any time.

**Positioning options**
- **This device's GPS**: uses the phone/tablet/PC location service with high-accuracy mode. Accuracy is shown in metres.
- **Commercial GNSS receiver**: export or log NMEA 0183 (GGA sentences) from a Trimble, Leica, Emlid, Garmin or similar receiver and import the file. The app averages the fixes, keeps the best fix class (RTK fixed > RTK float > DGPS > autonomous) and reports the 2-D standard deviation.
- **Live serial GNSS** (Chrome/Edge desktop): connect a USB receiver and stream NMEA directly.
- **Address**: geocode a street address (needs internet).

**Ground elevation** can be fetched online (Copernicus 90 m DEM) or read from an imported DEM/LiDAR file.

**Airport distance and runway length** feed the FAA Part 77 notice check.`,
    tour: [
      { target: 'site-list', title: 'Sites', text: 'Add, select and rename candidate sites. Site A is normally the transmitter.' },
      { target: 'site-gps', title: 'GPS', text: 'Capture position from this device or import NMEA logs from a survey-grade receiver.' },
      { target: 'site-structure', title: 'Structure', text: 'Structure type, height and antenna centerline. Heights drive the radio horizon and FAA checks.' },
    ] },

  { id: 'terrain', title: 'Map & terrain data', page: 'terrain', keywords: 'draw line freehand route trail road path corridor heat map heatmap signal along line edit points 3d tilt tilted perspective view satellite drape line of sight obstruction obstacle relay bounce repeater point a point b viewshed map topo topography dem lidar las srtm hgt geotiff asc usgs 3dep terrain elevation layers satellite offline towers existing towers transponders antennas comm sites asr', summary: 'View sites on topographic or satellite maps with existing towers and comm sites, and load terrain (DEM / LiDAR) used by all calculations.',
    body: `**3D tilt view**: every map has two buttons above it, **🗺 Flat map** and **⛰ 3D tilt view**. The 3D tilt view shows the same area as a 3D model with satellite pictures on top (or the topo map, or height colors). Drag the **Tilt** slider, or tap **Straight down**, **Tilted** or **Low angle**. Drag on the model to turn it, scroll or pinch to zoom.
- **Radio path**: enter **point A** and **point B** by typing GPS coordinates (35.5951, -82.5515 or 35°35'42"N 82°33'05"W) or an address, tap **◎ My GPS**, or tap **📍 Pick on 3D** and then the ground. Tap **＋ Add relay point** to bounce the signal around a hill; each hop is checked separately.
- **Line of sight and obstructions**: each hop is drawn green (clear), orange (line of sight, but less than 60% of the Fresnel zone clear) or red (blocked). Red posts mark the ground that blocks the path, labeled with how far it rises above the beam and the distance from the start of the hop. Heights use terrain, earth curve and the trees / buildings allowance from Radio design. **💡 Suggest a relay spot** finds the nearest spot that sees both ends of a blocked hop.
- **What point A can see** shades ground that point A cannot see in red.
**✏️ Draw lines**: tap **✏️ Draw lines** above any flat map to map out a road, trail, cable route or path and see what the signal and terrain do along it.
- **✍️ Draw by hand**: press and drag with your finger or mouse; lift to finish. The map stays still while drawing.
- **📍 Tap points (straight)**: tap the map for each point, then **✓ Finish line**. **🔗 Line between Site A and Site B** adds the straight line between the transmit and receive sites.
- **Predictions**: each line is colored by the predicted signal from the transmitter (same colors as Coverage) and dotted where terrain hides it from the transmitter. Below the map you get the length, the azimuth of each piece (true and compass), the lowest and average signal, the share of the line that meets the signal needed, how much is hidden, and a chart of ground height and signal along the line. Point at the chart to see the spot on the map. A straight two-point line also gets an end-to-end line-of-sight check with the blocking ground marked by a red dot.
- **Heat map**: tick **Signal heat map around the lines** to shade predicted signal over the area around them.
- **Edit**: pick a line, tap **✏️ Edit points**, and drag the round handles. Drag a small middle handle to add a point; tap a handle and **Delete point** to remove one. **Smooth** thins a hand-drawn line; **🗑 Delete line** removes it. Lines are saved with the project.
- In the **⛰ 3D tilt view**, drawn lines show on the 3D ground in signal colors, and **Signal heat map** shades the 3D ground.
- **Offline**: terrain for the Asheville area is built in. Elsewhere, terrain and pictures are saved as you view them while online (and with "Save this area for offline use"), then work offline. Satellite pictures show what is on the ground but are not used as heights.

**Existing towers & comm sites**: on any map, open the layers button (top right) and tick **📡 Existing towers & comm sites**. Towers, masts, antennas, telecom sites and other communications equipment show with labels (name or operator and height; labels appear when zoomed in). Tap one for details: type, operator, height, use (cellular, radio, TV, microwave…) and the FCC ASR number when known. The data comes from OpenStreetMap and is saved for each area you view, so it still shows offline; always verify against the FCC Antenna Structure Registration database before relying on it.

**Base maps**: OpenTopoMap (contours), Esri World Imagery (satellite), USGS Topo, and OpenStreetMap. Map tiles need internet; terrain files work offline once loaded.

**Terrain sources** (used for path profiles, coverage and 3D):
- **Online DEM** around the selected site (Copernicus GLO-90, ~90 m).
- **SRTM / NASADEM .hgt** tiles (1 or 3 arc-second).
- **GeoTIFF** DEM in WGS84 (EPSG:4326), e.g. USGS 3DEP 1/3 arc-second (~10 m).
- **ESRI ASCII grid (.asc)** in WGS84.
- **LiDAR LAS** point clouds (1.0-1.4, uncompressed). Choose DSM (tops of trees/buildings: best for RF obstruction) or DTM (ground class 2). For UTM files enter the UTM zone. LAZ must be decompressed first (laszip). State-plane files must be reprojected to UTM/WGS84.

**Tip:** USGS 3DEP data is available free from the National Map Downloader (apps.nationalmap.gov/downloader).`,
    tour: [
      { target: 'map', title: 'Map', text: 'Click the map to move the selected site. Switch base layers at top-right.' },
      { target: 'dem-import', title: 'Terrain import', text: 'Load DEM or LiDAR files, or fetch an online DEM around the selected site.' },
    ] },

  { id: 'radioref', title: 'RadioReference frequencies', page: 'radioref', keywords: 'radioreference radio reference rr premium api frequencies talkgroups trunked p25 viper site control channel fire police sheriff ems public safety county scanner bda erces das programming', summary: 'Sign in with your RadioReference Premium account once, download a county’s frequencies, trunked sites and talkgroups while online, then use them offline. Kept encrypted on this device only.',
    body: `**Log in:** enter your RadioReference username and password, then tap **Log in**. Tick **Stay logged in** to stay logged in on this device; untick it to be logged out when the app closes. **Log out** removes your username and password; saved frequencies are hidden until you log in again. **App key:** the app key is in **User Settings → RadioReference app key**, entered once. **Do not change it** unless RadioReference sends you a new one: a wrong key stops downloads. It comes from RadioReference (sign in on RadioReference.com and apply on the API key page; the steps are in User Settings).

**Download:** pick the state and county (the project county is chosen for you) and tap **Download frequencies for this county**. This needs internet once. A progress bar shows the percent done, the step it is on, what has been downloaded so far and about how long is left; you can open other pages meanwhile (the ⬇ RadioRef badge at the top shows the progress). Afterwards everything works offline. Tap **Download again** to update.

**Protected information:** frequencies, talkgroups and your sign-in are stored **encrypted on this device only**. They are not saved in project files, backups, reports, exports or Sync Devices.

**Web browser / flash drive copy:** browsers can't talk to RadioReference directly. Download the county's CSV from RadioReference.com and tap **Import a CSV**, then delete the downloaded file.

The **Emergency Radio (ERCES / BDA)** page lists the county's public-safety channels from this list.` },
  { id: 'fcc', title: 'FCC towers & licenses', page: 'fcc', keywords: 'fcc uls asr antenna structure registration tower license licensee call sign frequency frequencies public safety business microwave paging who is on the tower co-locate donor erces bda offline', summary: 'See the FCC-registered towers and licensed transmitters around any spot, who is on each tower and on what frequencies. Built in, works offline.',
    body: `**Look around** a project site, an address, GPS coordinates or your device's GPS, or tap the map. Pick the distance, and narrow it by **band** (VHF, UHF, 700, 800, 900, microwave), **kind of user** (public safety, business, commercial, microwave, paging) or a name, call sign or frequency.

**🗼 Towers** are FCC Antenna Structure Registrations: owner, structure, overall height above ground, ground elevation, distance and azimuth (true and compass), and FAA marking and lighting. Tap **▸ licenses** to see who is on the tower and their frequencies. **+ Add as site** adds it to Site Data & GPS, **Use as donor** aims the ERCES donor antenna at it, **FAA check** opens the FAA Height Check for it.

**📻 Licenses** are active FCC licenses with a transmitter near the spot: call sign, licensee and phone, radio service, frequencies, station class (base, repeater, mobile), power (ERP) and emission (for example 8K10F1E = P25 digital, 11K2F3E = analog). The **county** tab lists licenses for mobiles and portables anywhere in the project county. **⬇ CSV** saves the list.

The data is the FCC's public weekly files for NC, SC, GA, TN and VA, built into the app and updated with each app update. **FCC ↗** opens the live FCC page when you are online. FCC data is public; RadioReference talkgroups are kept separate and protected.` },
  { id: 'faa', title: 'FAA height check', page: 'faa', keywords: 'faa part 77 77.9 notice 7460-1 oe/aaa airport runway heliport height tower mast antenna obstruction notice criteria tool towair asr registration 200 ft imaginary surface', summary: 'Find out whether a new tower, mast or antenna needs FAA notice (Form 7460-1), with the airports built in so it works offline.',
    body: `Pick the structure location (a project site, an address, GPS, or **FAA check** on an FCC tower) and type the **overall height above ground**, to the very top including antennas and the lightning rod. The **ground elevation** fills in by itself (from the site, terrain or USGS); type a surveyed value if you have one.

The check follows 14 CFR 77.9: notice is needed for anything **over 200 ft above ground**, or taller than a surface that rises from the nearest point of the nearest runway: **1 ft up for every 100 ft out to 20,000 ft** (longest runway over 3,200 ft), **1 for 50 out to 10,000 ft** (shorter runways) and **1 for 25 out to 5,000 ft** for heliports. It counts public-use, military and instrument-approach airports; a private airport counts only if it has an FAA instrument approach.

The result shows **Needed / Not needed / Check**, the **tallest structure without notice** at that spot, and each nearby airport with the surface height and your margin. If notice is needed, file Form 7460-1 on FAA OE/AAA at least 45 days ahead; the tower then also needs FCC Antenna Structure Registration. **Save airport on site** stores the nearest airport for the Code Compliance checks.

Not counted: roads and railroads under the structure (77.9(c)), shielding (77.9(e)). Always confirm with the FAA Notice Criteria Tool (button) and keep the printout.` },
  { id: 'magnetic', title: 'Magnetic field & space weather', page: 'magnetic', keywords: 'magnetic declination variation compass true north magnetic north wmm world magnetic model noaa dip inclination field strength prediction space weather geomagnetic storm kp solar flare radio blackout gps', summary: 'How far a compass points away from true north at the job, how that changes over the years, and NOAA’s live space weather forecast.',
    body: `Open **Tools & reference → Magnetic Field & Space Weather**. The place is the project's Site A (Asheville, NC when no site is set). Tap **📡 Use where I am now** for your GPS position, or type a GPS point.

- **Magnetic field here today:** the **declination** (how many degrees a compass needle points west or east of true north), how much it changes each year, the dip, and the field strength. It comes from NOAA's **World Magnetic Model** (WMM2025), which is built into the app and works with **no internet**. When NOAA publishes the next model (WMM2030, due at the end of 2029) it downloads by itself.
- **How it changes over time:** the same numbers for every half year the model covers, with a chart and today marked. Put the declination and its date on drawings.
- **Map bearing ↔ compass reading:** type a map (true) bearing to get the compass reading, or the other way round, and see how far off 1° of error lands at 1 and 10 miles.
- **Space weather (NOAA live forecast):** NOAA's Space Weather Prediction Center Kp index for the last two days and the next three, storm levels G1–G5, and the chance of HF radio blackouts. While online it stays **live**: it updates every 15 minutes while the app is open and right away when the internet comes back. **Offline**, it shows the conditions from the last connection with their date and time. Tap **🔄 Get the latest** to download it now.
- **Saved with this project:** the checked declination for Site A (with its date and model) and the storm level are kept on the project by themselves. They update when Site A moves, each day, and with each new forecast, and are used on the Blueprints north arrow, in Reports and on synced devices. Values are only saved after they pass their checks (model in date, numbers in range, forecast under 12 hours old).
- During a **geomagnetic storm** (Kp 5 or more, now or forecast for now by the last download) a warning shows beside compass bearings on other pages: aim antennas with GPS or a satellite alignment tool instead of a compass.

**Limits:** the model is about ±0.5° in the continental US. Local iron, rebar, vehicles, steel buildings and power lines can throw a hand compass off much more. Space weather forecasts change quickly.` },
  { id: 'floorplan', title: 'Floor plan to 2D / 3D', page: 'floorplan', keywords: 'floor plan blueprint upload drag drop pdf dxf jpg png svg scan photo cad trace walls doors windows rooms area scale calibrate quality grade issues fixes new upload integrate project documentation layers picture in picture to scale custom scale sheet print draw create', summary: 'Turn a floor plan or blueprint file into a true-scale 2D plan and 3D model, check how accurate it is, and add it to the project plan, build and documentation.',
    body: `**Floor Plan to 2D / 3D** (in Tools & reference) reads a floor plan file and traces it into a true-scale plan and model.

**1. Upload.** Pick the floor, then drag the file onto the upload box or click to browse. PDF (vector from CAD or scanned), DXF, JPG, PNG, WebP, GIF, BMP and SVG work. DWG, RVT and SKP must be exported to DXF or PDF first. For a PDF with several sheets, pick the floor plan sheet. **No drawing?** Open *Create a floor plan to scale*, type the outside length and width, and draw the rest.

**How to get an accurate model** lists what to upload (best: DXF from CAD with A-WALL layers; vector PDF at 100 % with the scale noted; scan at 300 DPI; photo straight down only as a last resort) and what to check first.

**2. Upload check.** The file gets a grade (A to F) from its resolution, contrast, sharpness, rotation, perspective, shading, whether the walls form a closed outline, and whether the scale is known. Each issue has its fix.
- If it **won't produce an accurate model**, it says why, lists the fixes and asks for a **new upload** (drop it right there), or you can keep it as an approximate model.
- If the model **is accurate**, it asks whether to **add it to the project plan and build**. Yes puts the walls, doors and windows into the 2D & 3D Models, the size, floors, rooms, exterior doors and ceiling height into Auto-Design (so devices, cable and materials follow), and the walls into Indoor Coverage if nothing is drawn there yet.
- **Include in project documentation** puts the plan and its room, door and window schedules into Reports (Build plan, Closeout package) and keeps the drawing sheet and original file in Documents.

**Scale.** Read from the sheet (e.g. 1/4" = 1'-0"), taken from the CAD units, entered as a known overall length, or calibrated by clicking two points and typing the distance. A scale only estimated from door widths is never called accurate.

**3. Preview.** 2D, 3D or both. The 2D plan is drawn like a construction drawing: solid walls, door swings and marks, window marks, room tags (name, number, area in SF), overall dimensions in feet-inches, title, graphic scale and north arrow. **Layers** has tick boxes for each building element and each technology system (devices, coverage, cabling). Click a wall, door, window or room to fix it; **Undo / Redo** step back and forward. **Draw** adds exterior and interior walls, doors and windows.

**Drawing scale & sheet** sets the plan to a standard architectural, engineering or metric scale or a custom one (e.g. 5/32" = 1'-0", 1" = 15', 1:75) on ANSI or ARCH sheets, says whether it fits, suggests the largest scale that does, and **Print to scale** prints it true size (print at 100 %). Downloads: DXF with AIA layers (A-WALL-EXTR, A-WALL-INTR, A-DOOR, A-GLAZ, A-AREA-IDEN) and the drawing sheet as SVG.

**⧉ Picture in picture** keeps the live plan on top of other pages while you enter information; it changes as you type.

Then it asks whether to **upload another file** (the next floor or a better file) or go to the **Project Build Output**.

Traced plans follow the linework in the file. Check sizes against the dimensioned drawings; the architect's drawings and the AHJ govern.` },
  { id: 'buildout', title: 'Project Build Output', page: 'buildout', keywords: 'build output final output sheet index cover title block schedules device schedule progress live recently added picture in picture', summary: 'The project\'s final output, filled in live as each value and element is added.',
    body: `**Project Build Output** (in Tools & reference) shows the finished project as it is being built, and updates by itself as information is added on any page.

- **Title block**: project, owner, contractor, date and revision.
- **Sheet index** in US National CAD Standard numbering: G-001 cover and project data, A-101… floor plans, A-301 3D model, A-601 schedules, and a sheet for each system (FA fire alarm, T telecommunications, TY security). Each shows Ready or Pending.
- **Recently added**: each value with the time it was added or last changed.
- **Floor plan** with layer tick boxes, the 3D model, and the room, door and window schedules.
- **Device schedule** by level.
- **Build elements**: every value the output needs, ✓ when it is in, with a link to the page where it is added.

**⧉ Picture in picture** keeps the plan in a small window while you fill in other pages. **🖨 Print** prints the page.` },
  { id: 'spectrum', title: 'RF spectrum analyzer', page: 'spectrum', keywords: 'spectrum analyzer rf sdr tinysa tinysa ultra rtl-sdr hackrf usb receiver webusb web serial zadig winusb sweep trace waterfall markers delta peak search channel power occupied bandwidth acpr noise floor danl snr interference hunt tone intermod bda oscillation uplink noise donor downlink limit line mask calibrate ppm cable loss attenuator antenna factor field strength dbuv import csv rtl_power hackrf_sweep', summary: 'A spectrum analyzer that works with USB receivers (tinySA, RTL-SDR, HackRF) or imported sweeps, with markers, measurements, guided tests and calibration.',
    body: `**RF Spectrum Analyzer** (Tools & reference) turns a USB receiver into a spectrum analyzer in Chrome or Edge (computer or Android) and in the Windows app. iPhone, iPad, Safari and Firefox cannot reach USB receivers; import a saved sweep there instead.

**1. Receiver.** Plug it in and press **Connect tinySA**, **Connect RTL-SDR** or **Connect HackRF One**; the browser asks once, then the receiver is listed under **Receivers plugged in now** whenever it is connected. **Compatible USB receivers** lists every supported receiver with its range, connection and level accuracy:
- **tinySA / tinySA Ultra**: a real spectrum analyzer with calibrated dBm. Best for measurements.
- **RTL-SDR** and **HackRF One**: SDR receivers, fast and wide, but levels are relative until calibrated. On Windows install the WinUSB driver with Zadig.
- Airspy, SDRplay, Signal Hound, bench and handheld analyzers, and rtl_power / hackrf_sweep: **import** their CSV traces.
- **Use test signals** for training and the self-test.

**2. Analyzer.** Band presets (VHF, UHF, 700/800 MHz public safety, FirstNet, Wi-Fi, FM), start/stop or center/span, points, RBW, detector (peak, average, sample), trace mode (clear, average, max hold, min hold), reference level and dB/div, units (dBm, dBµV, dBµV/m, mW, µV). Click the trace for up to 4 markers with deltas; **Peak** and **Next peak** jump between signals. A waterfall shows the last 120 sweeps. Project frequencies are drawn as dashed lines.

**3. Measurements**: strongest signal, noise floor, SNR, channel power, 99 % occupied bandwidth, adjacent-channel power ratio, limit pass / fail, the signals found and any intermodulation products that land on a signal or project channel.

**4. Tests**: analyzer self-test, calibration with a known signal (level offset and ppm), noise floor and noise figure, BDA uplink noise, BDA oscillation, donor signal by channel (sends the level to Emergency Radio), downlink level against −95 dBm, interference hunt with a tone, intermod check, limit line / mask, and carrier measurements. Save each test with the project (with GPS when allowed).

**5. Corrections**: calibration offset, frequency correction, cable loss, attenuator, preamp gain, antenna gain or antenna factor, so readings are at the antenna port or in field strength.\n\n**6. Benchmarks and certification**: benchmark the receiver against a signal generator (level accuracy at several points, frequency accuracy, noise floor, dynamic range, 10 dB step linearity, calibration date, sweep speed) for a grade: **Measurement grade** (fit for acceptance tests), **Survey grade** or **Indicative only**. Certification tests: the **ERCES acceptance grid test** (IFC 510 / NFPA 1225: −95 dBm, 95 % general, 99 % critical areas, captured cell by cell into Live Signal Readings), the **FCC 90.210 emission mask** (Mask B or D) and **signal booster checks** (out-of-band emissions, uplink noise, oscillation). Each saves a signed report, also in Reports → Certification test reports.

Save sweeps, add marker readings to **Live Signal Readings**, and download CSV or a picture. Readings from uncalibrated receivers are marked relative.` },
  { id: 'audio', title: 'Audio & acoustic analyzer', page: 'audio', keywords: 'audio acoustic analyzer sound level meter spl leq lmax lmin l10 l50 l90 a weighting c weighting fast slow impulse rta octave third octave rt60 reverberation edt t20 t30 sti intelligibility nfpa 72 audibility thd distortion noise criteria nc microphone calibration file umik calibrator 94 114 generator pink noise sine sweep impulse response loopback benchmark certification report', summary: 'A sound level meter, real-time analyzer, room acoustics (RT60, STI), distortion and noise tool with calibration, benchmarks and certification reports.',
    body: `**Audio & Acoustic Analyzer** (Tools & reference) works with the computer's or phone's microphone, and properly with a measurement microphone (USB like miniDSP UMIK-1/UMIK-2, or a Dayton EMM-6 with an audio interface). Browser echo cancellation, noise suppression and auto gain are turned off.

**1. Input and calibration**: pick the input and **Start**. Put an acoustic calibrator on the microphone and press **Calibrate (94 dB)** or **(114 dB)**, so levels read in dB SPL. Load the microphone's **calibration file** (UMIK, Dayton or REW .txt) to correct its frequency response.

**2. Sound level meter**: A, C or Z weighting (IEC 61672-1), Fast, Slow or Impulse time weighting, and Leq, Lmax, Lmin, L10, L50 and L90. The **real-time analyzer** shows 1/3- or 1/1-octave bands (IEC 61260) and saves them as CSV.

**3. Signal generator**: sine, pink noise and white noise.

**4. Measurements, benchmarks and certification**:
- **Room: RT60 & STI**: a sine sweep through the speakers gives the impulse response, EDT, T20 and T30 by octave (ISO 3382) and the speech transmission index (IEC 60268-16 indirect method). Measure background noise first to include it.
- **Background noise & NC**: 10 s Leq, L90, Lmax and the noise criteria (NC) rating.
- **Distortion**: THD and THD+N of a tone.
- **NFPA 72 audibility**: ambient for 60 s, then the alarm signal; pass / fail for public, private or sleeping areas and the 110 dBA maximum.
- **Intelligibility acceptance**: STI points by location against NFPA 72 Annex D (average ≥ 0.50, 90 % of points ≥ 0.45).
- **Benchmark the measuring chain**: calibrator check and stability, self-noise, mic calibration file, processing off, sample rate, loopback flatness and THD, graded against IEC 61672-1 Class 1 / Class 2 tolerances. This verifies the chain; legal certification still needs a type-approved meter.

Each test saves a **certification report** with the equipment, calibration, requirements, results and signature lines; all of them print in **Reports → Certification test reports** (Closeout package).` },
  { id: 'weather', title: 'Weather & radar (NOAA)', page: 'weather', keywords: 'weather radar forecast noaa national weather service nws rain storm thunder lightning wind gust temperature cold heat alerts warning watch advisory current conditions hourly 7 day work day tower climbing lift offline', summary: 'Live NOAA radar, alerts, current conditions and the 7-day forecast for the job site or where you are, with work-day checks.',
    body: `Open **Tools & reference → Weather & Radar (NOAA)**. The place is the project's Site A (Asheville, NC when no site is set). Tap **📡 Use where I am now** for your GPS position, or type a GPS point.

- **Weather here:** the latest report from the nearest National Weather Service station: temperature, feels-like, wind and gusts, humidity, pressure and visibility, with the station name and the time it was observed. Values that failed NOAA's own quality checks are left out.
- **Weather alerts:** watches, warnings and advisories in force at the place. Tap one for the full text and what to do.
- **Radar map:** NOAA's live radar of all US radars combined, refreshed every 5 minutes, with alert areas outlined. Use **See-through** to see the map under it.
- **Work-day check:** plain checks for the next 24 hours: lightning (no tower, roof or lift work), wind for climbing and lifts, cold for cable pulls and batteries, heat, and rain for outdoor terminations.
- **Next 24 hours** and **7-day forecast:** NOAA's official forecast. Tap a day for the full text.
- **Weather on this project:** when the weather is for the project site it is saved on the project. Site Data & GPS, Installation guides and Service then show a warning when there is an alert, lightning, high wind, cold or heat; Solar & DC Power compares the forecast low with the design record low; and **📝 Add today's weather to Field Notes** writes a weather line into a field note.

**Live and offline:** with internet the page updates by itself every 10 minutes while open, as soon as the connection comes back, and every hour in the background for the last place looked at. With no internet it shows the last weather downloaded and says how long ago that was. The radar needs internet.

**Limits:** forecasts are NOAA's (US only). They are not design values: code wind, ice and record temperatures still come from the adopted codes, TIA-222 and ASHRAE. Your safety plan and the equipment's ratings come first.` },
  { id: 'mappacks', title: 'Offline map packs', page: 'mappacks', keywords: 'offline map pack download satellite imagery topo terrain area no signal no internet field rural mountain storage size estimate progress', summary: 'Download satellite pictures, topo maps and terrain for a whole job area before going where there is no signal.',
    body: `Choose the **area**: around your project sites, around an address or GPS point, or (on Map & Terrain) what the map shows. Pick the **detail** (street level suits most jobs) and **what to save**: satellite pictures, satellite with roads and names, topo map, shaded relief, and terrain (needed for path profiles, line of sight, coverage and 3D).

Before you download you see the **area size, number of tiles and about how many MB**, and the free space on the device. **⬇ Download map pack** shows the percent done, tiles, MB and time left; you can open other pages while it runs (a **⬇ Map pack** badge at the top shows progress) and **■ Stop** keeps what was downloaded.

**Saved on this device** lists each pack: **Finish** downloads anything missing, **Update** downloads it all again for the newest pictures, **Verify** checks what is on the device, **Delete** removes it (tiles another pack uses are kept). Packs use public-domain USGS maps and pictures and USGS 3DEP terrain.` },
  { id: 'equipment', title: 'Equipment & link budget', page: 'equipment', keywords: 'equipment radio antenna feeder coax heliax lmr eirp erp link budget mapl sensitivity margin fade shadow body loss penetration', summary: 'Choose band, radio, antenna and feeder; the app computes EIRP, ERP and Maximum Allowable Path Loss.',
    body: `**EIRP** (Effective Isotropic Radiated Power) = TX power − feeder loss − jumper/connector loss + antenna gain (dBi). **ERP** = EIRP − 2.15 dB.

**Feeder loss** is interpolated from datasheet attenuation points at your frequency and multiplied by the feeder length.

**MAPL** (Maximum Allowable Path Loss) = EIRP + RX antenna gain − RX losses − RX sensitivity − margins.

**Margins**
- **Shadow fading** margin = σ × Q⁻¹(1 − edge reliability). Typical σ = 8 dB; 90% edge reliability ⇒ 10.3 dB. The app also shows the resulting **area reliability** (Jakes).
- **Building penetration**: 10-20 dB for in-building coverage.
- **Body loss**: 3 dB typical for handhelds.
- **Interference margin**: 1-3 dB.

The cell-edge range is the distance where the Hata/COST-231 loss equals the MAPL.`,
    tour: [
      { target: 'eq-band', title: 'Band', text: 'Pick a band preset or enter a custom frequency.' },
      { target: 'eq-chain', title: 'RF chain', text: 'Transmitter power, antenna and feeder. Catalog specs are typical; confirm on the datasheet.' },
      { target: 'eq-margins', title: 'Margins', text: 'Shadow fading, penetration and body loss margins reduce the allowable path loss.' },
      { target: 'eq-results', title: 'Results', text: 'EIRP, ERP, MAPL and the predicted cell-edge radius.' },
    ] },

  { id: 'path', title: 'Path profile, LOS & Fresnel', page: 'path', keywords: 'path profile line of sight los fresnel zone 60 percent clearance earth curvature 4/3 k factor radio horizon knife edge diffraction obstruction', summary: 'Checks line of sight, earth bulge (k = 4/3), first Fresnel zone and 60% clearance between two sites.',
    body: `**Radio horizon** with the standard 4/3-Earth model: d(km) ≈ 4.12 √h(m) for each antenna; the LOS distance is the sum of both.

**Earth bulge** at a point: h = d₁·d₂ / (2·k·Rₑ).

**First Fresnel zone radius**: r = √(λ·d₁·d₂ / d). Engineering practice keeps **at least 60% of F1 clear** of terrain and clutter.

**Clutter height** adds trees/buildings on top of bare-earth DEMs (not needed for LiDAR DSM).

When the path is blocked the worst obstacle is treated as a **knife edge** (ITU-R P.526) and the extra diffraction loss is reported.

The profile needs terrain: either load a DEM on the Map & Terrain page or click **Fetch online profile**.`,
    tour: [
      { target: 'path-controls', title: 'Path settings', text: 'Choose the two sites, the k-factor and clutter height.' },
      { target: 'path-chart', title: 'Profile chart', text: 'Brown = terrain + earth bulge, blue line = LOS, shaded = first Fresnel zone, dashed = 60% F1.' },
      { target: 'path-results', title: 'Results', text: 'Clearance, LOS status, diffraction loss and predicted received level.' },
    ] },

  { id: 'coverage', title: 'Coverage prediction', page: 'coverage', keywords: 'coverage heatmap signal strength map okumura hata cost-231 propagation model urban suburban rural rssi prediction terrain aware', summary: 'Predicts a signal-strength map using Okumura-Hata (150-1500 MHz) or COST-231 (1500-2000 MHz) plus terrain diffraction.',
    body: `**Models**
- **Okumura-Hata**: 150-1500 MHz, base 30-200 m, mobile 1-10 m, 1-20 km. Urban, suburban and rural (open) corrections.
- **COST-231 Hata**: 1500-2000 MHz extension, +3 dB for large metropolitan centres.
- Out-of-range inputs are flagged; results are extrapolated.

**Terrain-aware**: with a DEM loaded, each pixel's radial is scanned for the worst obstacle and knife-edge diffraction loss is added, so valleys and ridge shadows appear instead of a simple circle. The effective base height is taken relative to the ground at each pixel.

**Antenna pattern**: sector antennas use the 3GPP parabolic pattern with your azimuth and downtilt.

**Street-level reference**: the map shows signal at the mobile height with no body or building loss. Each acceptance criterion adds its own extra loss, so one run answers mobile, portable and in-building questions together.

**Acceptance criteria**: each criterion has a threshold (dBm), an extra loss (dB) and a required area (%). It passes when the share of the analysis area with signal − extra loss ≥ threshold is at least the required %. Its service contour is drawn on the map in the criterion's colour. Leave threshold or loss blank to follow the live Equipment-page values. Presets are starting points; public-safety work should use the agency's channel performance criterion (TSB-88 / RFP).

**Model tuning**: offset (dB), distance slope (dB per decade), diffraction weighting and extra clutter loss. Set them by hand or calibrate them from drive-test data on the Field Survey page.

**Run history and scenarios**: every run is logged with all of its inputs; the history table shows what changed since the previous run and how each criterion moved. Save a run as a scenario to keep its full grid for side-by-side comparison.

**GIS export**: KML / KMZ (Google Earth, with heat map), GeoJSON, Esri Shapefile (.zip with sites, service areas, contours and survey points; WGS84 .prj), a georeferenced PNG with world file, and a CSV grid.`,
    tour: [
      { target: 'cov-controls', title: 'Settings', text: 'Radius, resolution and threshold. Higher resolution takes longer.' },
      { target: 'acceptance', title: 'Acceptance criteria', text: 'Pass/fail thresholds: signal, extra loss and the required % of area.' },
      { target: 'tuning', title: 'Model tuning', text: 'Offset, slope, diffraction and clutter. Calibrate from field data for best accuracy.' },
      { target: 'cov-map', title: 'Heatmap and contours', text: 'Colours show predicted signal; lines are each criterion\'s service contour.' },
      { target: 'gis-export', title: 'Export', text: 'Hand off to Google Earth, ArcGIS or QGIS.' },
    ] },

  { id: 'network', title: 'Multi-site & interference', page: 'network', keywords: 'multi site network best server interference co-channel adjacent channel c/i overlap simulcast public safety boundary', summary: 'Best-server, overlap and co-/adjacent-channel C/I analysis across all transmitting sites.',
    body: `Turn on each transmitting site (or import a site database CSV on the Site Data page). All sites are computed on one common grid with the same model, tuning and terrain as the Coverage page.

- **Best server**: which site is strongest at each location.
- **C/I**: best-server signal divided by the power sum of every other co-channel signal plus adjacent-channel signals reduced by the adjacent-channel rejection.
- **Overlap**: how many sites exceed the service threshold, useful for handoff and boundary planning.
- **Interference-limited**: served by signal level but failing the required C/I.

Required C/I depends on modulation and delivered audio quality; take it from TSB-88.1 or the equipment vendor. This is a planning screen, not a frequency-coordination study.`,
    tour: [ { target: 'network-sites', title: 'Transmitters', text: 'Tick each site that transmits and set its frequency, power, antenna and azimuth.' }, { target: 'network-criteria', title: 'Criteria', text: 'Service threshold, required C/I, bandwidth and adjacent-channel rejection.' }, { target: 'network-map', title: 'Map views', text: 'Switch between best server, C/I, overlap and best signal.' } ] },

  { id: 'scenarios', title: 'Scenarios & comparison', page: 'scenarios', keywords: 'scenario compare baseline what-if delta difference run history traceable', summary: 'Save coverage runs as scenarios and compare inputs, pass/fail results and a difference map.',
    body: `Each saved scenario keeps every input that drove the run (site, power, antenna, tilt, model tuning, terrain source, criteria), its acceptance results and the full signal grid.

Pick a baseline (A) and a comparison (B) to see: which inputs changed, how each criterion's area changed, the area gained and lost at each threshold, and a B − A difference map. **Restore inputs** puts a scenario's radio settings back into the project. Export the comparison as CSV for the report.`,
    tour: [ { target: 'scenarios', title: 'Scenarios', text: 'Saved runs with their results. Show, restore or delete.' } ] },

  { id: 'signal', title: 'Live signal readings', page: 'signal', keywords: 'live signal readings meter bluetooth usb com wifi phone cell rssi rsrp dbm walk test grid test erces bda compare prediction heat map g-nettrack network cell info wigle import', summary: 'Take real signal readings with a meter or the phone, or import them, and compare them with the prediction.',
    body: `**Take a reading:** connect a signal meter with **🔵 Bluetooth** or **🔌 USB / COM meter** (Chrome or Edge on a computer or Android), use **📱 Phone cell signal** or **📱 Phone Wi-Fi signal** (LvPlan Pro Android app), or connect a Wi-Fi meter on **Bluetooth & Wi-Fi Devices**. The big number is the live reading. Press **📍 Save this reading**, or tick **Save automatically every … s** and walk. Each reading saves with the GPS position and time. No meter? Type what your meter shows and press **📍 Save reading**.

**Indoors:** tick **Indoors (grid test)** and type the floor and room or grid cell. Tick **Critical area** in stairs, fire command rooms and pump rooms.

**Import:** files from G-NetTrack, Network Cell Info, WiGLE, cell-logger apps and meter software (CSV / TSV with latitude, longitude and a dBm, RSSI, RSRP or Level column), GeoJSON, KML or GPX. dBµV readings are changed to dBm (50 Ω).

**Compare:** each reading with GPS is compared with the coverage prediction at the same spot. The page says in plain words whether the design matches. **🎯 Calibrate the model** sends the readings to Drive Test & Calibration.

**Map:** colour by measured signal, by difference from the prediction, or a heat map that fills in between readings.

**ERCES / BDA grid test:** share of readings at or above −95 dBm per floor (90% general areas, 99% critical areas, NFPA 1225 / IFC 510). **Use these results on the ERCES / BDA page** fills in the measured coverage there. Delivered audio quality (DAQ) must still be checked by ear. The AHJ has the final say.`,
    tour: [ { target: 'signal-read', title: 'Take a reading', text: 'Connect a meter or the phone, or type a reading, then save it with GPS.' }, { target: 'signal-import', title: 'Import', text: 'Load a file from a phone app or meter.' }, { target: 'signal-compare', title: 'Compare', text: 'See how real readings compare with the prediction.' }, { target: 'signal-map', title: 'Map', text: 'Measured signal, difference, or heat map.' }, { target: 'signal-grid', title: 'Grid test', text: 'ERCES / BDA pass or fail per floor.' } ] },

  { id: 'assets', title: 'Equipment & asset tags', page: 'assets', keywords: 'asset tag barcode qr scan camera serial model install date warranty pm preventive maintenance service contract history label print register equipment list inventory', summary: 'Scan a device’s barcode or QR code to find it or add it, with PM dates, service history, photos, reports and labels.',
    body: `**Scan:** press **📷 Scan tag** and hold the barcode or QR code in the box; it reads by itself and beeps. If the camera can't start, use **🖼 Photo of the tag**. A handheld scanner works too: tap the tag box and scan, or connect a Bluetooth / Wi-Fi scanner on Bluetooth & Wi-Fi Devices.

- A tag that is already listed opens that device. A new tag starts a new device: fill in what it is, the system, make, model, serial, location and floor, then **Save device**.
- **Scan the device label** fills in the serial and model from the maker's label.
- **+ Add a device with no tag** gives it the next LV- number; **🏷 Print labels** prints QR labels for it.

**Maintenance:** set **PM every** and the **Last PM** date; the list shows PM overdue or due soon. **✔ PM** marks PM done today; **⚠** marks a device as needing service and **🛠 Fixed** puts it back in service. Every action goes in the device's history.

**At a glance** groups devices by system, for service and PM contracts. **Export CSV / Excel**, **🖨 Print list**, and **📂 Import list** (an owner's spreadsheet) are on the device list. The equipment list prints in the Closeout package on Reports.`,
    tour: [ { target: 'asset-scan', title: 'Scan', text: 'Scan a tag with the camera, a photo or a handheld scanner.' }, { target: 'asset-list', title: 'Devices', text: 'Search, PM status, quick actions, labels and exports.' } ] },

  { id: 'devices', title: 'Bluetooth & Wi-Fi devices', page: 'devices', keywords: 'bluetooth wifi wi-fi usb com port serial pair connect device gps receiver gnss rtk nmea laser distance meter disto glm barcode scanner signal meter printer camera tester', summary: 'Connect signal meters, GPS receivers, laser distance meters and barcode scanners once; every page uses them.',
    body: `Each card connects one kind of device by **🔵 Bluetooth**, **🔌 USB / COM port**, or **📶 Wi-Fi** (type the device's local address, like http://192.168.4.1/ or tcp://192.168.1.20:10110).

- **Signal meter:** live readings on Live Signal Readings; can also fill the box you tap.
- **GPS receiver:** every 📍 GPS button and the live map position use it instead of the built-in GPS (NMEA GGA / RMC; RTK accuracy is shown when the receiver reports it).
- **Laser distance meter:** tap any length box, measure, and the number goes in (feet or meters as set in the app).
- **Barcode scanner:** on Equipment & Asset Tags each scan finds or adds the device.

Where it works: Bluetooth and USB / COM need Chrome or Edge (computer or Android), including the flash-drive copy, offline. Wi-Fi devices work in the installed Windows and Android apps. The Android app also reads the phone's own cell and Wi-Fi signal. Printers, keyboard-style scanners and lasers, cameras and testers connect through the phone or computer settings; the table at the bottom says how. Devices are not saved with the project.` },

  { id: 'survey', title: 'Field survey & calibration', page: 'survey', keywords: 'drive test field survey measurement calibration tune model rssi measured predicted error rms', summary: 'Import drive-test data, compare it with the prediction and calibrate the model.',
    body: `Import a CSV (latitude, longitude and a signal column in dBm such as rssi, signal, level or rsrp) or GeoJSON points, or record readings one at a time with the device GPS.

**Calibration** fits error = measured − predicted as an offset, or offset + slope × log10(distance), by least squares. Readings at or below the receiver floor are excluded because they are censored. The page shows mean, RMS and standard deviation before and after, and error by distance band. Applying the result updates the model tuning used by Coverage, Network and Scenarios, and can set the shadow σ from the residual spread.

Use survey data taken with the same transmitter, frequency and antenna height as the design. A residual spread above about 10 dB usually means a mismatch.`,
    tour: [ { target: 'survey-import', title: 'Import', text: 'Load drive-test points or record them with GPS.' }, { target: 'calibrate', title: 'Calibrate', text: 'Fit and apply the model correction.' } ] },

  { id: 'wifi', title: 'Wi-Fi survey', page: 'wifi', keywords: 'wifi wi-fi wlan survey heat map floor plan access point bssid ssid channel noise snr co-channel walk netsh nmcli airport', summary: 'Turn measured Wi-Fi readings into floor-plan heat maps of signal, noise, SNR, channel and access point.',
    body: `1. Load the floor plan image and enter its real width and depth.
2. Walk the space. At each stop, click your position on the plan, run a scan on the laptop and paste the output, then **Add reading**. Supported: Windows \`netsh wlan show networks mode=bssid\`, Linux \`nmcli dev wifi\` or \`iw dev wlan0 scan\`, macOS \`airport -s\` / \`airport -I\`, or CSV.
3. Or import a survey-tool CSV with x/y (metres) or latitude/longitude per row.
4. Outdoors, use **Add outdoor reading at my GPS position**.

**Views**: signal (best AP), noise floor, SNR, channel of the strongest AP, strongest AP identity, co-channel APs heard ≥ −82 dBm, and number of APs above the target (roaming overlap). Numeric views use inverse-distance interpolation within the radius you set; channel and AP views use the nearest reading.

Browsers and Android web apps cannot scan Wi-Fi themselves, so readings always come from a scan you paste or import. Windows and nmcli report signal as a percentage, converted with dBm ≈ % ÷ 2 − 100.`,
    tour: [ { target: 'wifi-setup', title: 'Setup', text: 'Floor plan, scale, target and network filter.' }, { target: 'wifi-add', title: 'Add readings', text: 'Click your spot on the plan, paste the scan, add.' }, { target: 'wifi-map', title: 'Views', text: 'Switch between signal, noise, SNR, channel and AP maps.' } ] },

  { id: 'optimize', title: 'Tilt, azimuth & power', page: 'optimize', keywords: 'tilt downtilt azimuth power footprint shaping optimize sector beamwidth side view to scale true scale 3d beam', summary: 'Shape the footprint: see where the main beam and −3 dB edges land and get a recommended downtilt.',
    body: `For an antenna at height h with downtilt θ and vertical beamwidth β:
- Main beam hits the ground at d = h / tan θ.
- Inner −3 dB edge at h / tan(θ + β/2); outer edge at h / tan(θ − β/2) (∞ when θ ≤ β/2).

**Recommended tilt** places the upper −3 dB edge at your target cell radius: θ = atan(h/R) + β/2.

**Side view of the beam**: shows the real ground along the antenna's azimuth (with the earth curve) and where the main beam and its −3 dB edges come down on it, so a hill in the way shows up. The ground is colored by predicted signal.
- **📐 2D side view** or **⛰ 3D view**: the 3D view shows the beam as a see-through green wedge over the terrain that stops where it meets the ground, with a yellow dot where the main beam lands. Tick **Signal heat map** to shade predicted signal on the ground.
- **Height scale**: **True scale (1 : 1)** draws heights and distances to the same scale, so the tower, hills and tilt angles look as they really are. **Stretched** makes heights taller so small hills are easy to see (tilt angles then look steeper); pick automatic or ×2 to ×50.
- **Distance shown**: automatic, or pick a distance; a short distance in true scale shows the tower and the first stretch of ground up close.
- Scale bars show a distance across and a height up.

**True scale everywhere**: the same **Height scale** choice is on the Path Profile chart, the chart under drawn lines, the ground profile of runs between sites, and the 3D views (**True scale** button, or height boost / vertical exaggeration 1×). Maps, blueprints and floor plans are always drawn to scale.

Adjust power to balance uplink and downlink and to avoid interference into neighbouring cells. Re-run coverage after changes.` },

  { id: 'azimuth', title: 'Azimuth, back azimuth & compass', keywords: 'azimuth bearing back azimuth reciprocal magnetic declination variation compass true north aim antenna donor yagi measure wmm', summary: 'Azimuth is the direction to aim, in degrees clockwise from north. The app shows true (°T) and compass (°M) values everywhere a direction matters.',
    body: `**Azimuth** is the direction from one point to another, in degrees clockwise from north: 000° north, 090° east, 180° south, 270° west. The **back azimuth** is the direction from the far end back to you, which is how the far-end antenna is aimed.

**°T (true)** is measured from true (geographic) north, like maps, GPS and FCC filings. **°M (magnetic)** is what a hand compass reads. The difference is the **magnetic declination**, from the World Magnetic Model WMM2025 built into the app (works offline, valid to 2030). In western North Carolina it is about 7° west, so a compass reads about 7° more than the true azimuth. Compass = true − declination (east positive, west negative).

Where you see it:
- **Every map**: tap **📏 Measure distance & azimuth** and tap points; each leg shows its distance and azimuth. The TX → RX line and each site's popup show the azimuth from the transmitter.
- **⛰ 3D tilt view**: each hop A → relay → B shows the azimuth to aim at each end, both ways, and the up / down tilt.
- **Path Profile** and **Equipment & Link Budget**: azimuth and back azimuth TX ↔ RX, the declination, and **🎯 Aim at** to point the TX antenna at the far end.
- **Tilt, Azimuth & Power** and **Multi-site**: each antenna azimuth with its compass reading.
- **Emergency Radio (ERCES / BDA)** and **Indoor Coverage & DAS**: donor antenna aiming from the roof to the public-safety tower (also **Aim donor here** in the RadioReference donor list).
- **Drive Test**: each reading's distance and azimuth from the transmitter, and readings grouped by direction to spot a mis-aimed or blocked sector.
- **Blueprints**: set the plan orientation; the north arrow turns and shows magnetic north.
- **Calculators**: distance & azimuth between two points, and true ↔ compass conversion.
- **Reports**: link, coverage, site and ERCES reports print the azimuths.

Tips: use a GPS antenna alignment tool where you can. With a compass, stand well away from vehicles, roof steel, HVAC units and power lines, and check it against a known landmark. Always peak the antenna on measured signal.` },

  { id: 'view3d', title: '3D terrain model', page: 'view3d', keywords: '3d model view terrain mesh tower fresnel ellipsoid existing towers comm sites labels openstreetmap co-locate', summary: 'Interactive 3D terrain with your towers, labeled existing towers, the radio path and the first Fresnel zone.',
    body: `Drag to orbit, right-drag to pan, scroll to zoom. Vertical exaggeration makes terrain easier to read. The red/green line is the path (green = 60% F1 clear). The translucent ellipsoid is the first Fresnel zone.

**Existing towers (labeled)** stands up the towers, masts and comm sites already mapped in OpenStreetMap as purple masts with their name and height, so you can plan around them or look for a co-location spot. Areas you have viewed stay saved for offline use. Heights and owners may be missing or out of date: check the FCC Antenna Structure Registration (ASR) database and the owner before relying on one.

**Terrain downloads by itself.** Whenever you are online the app fetches the ground heights around your sites in the background, then extra detail (down to about 8 m) along the radio link, plus the existing towers for the area, and saves them all for offline use. There is nothing to download by hand. **Link detail** shows the sharper terrain along the path; **Whole area** shows everything around your sites. If you import your own terrain file it is never replaced.` },

  { id: 'grounding', title: 'Grounding, bonding & structure', page: 'grounding', keywords: 'grounding bonding ground rod ring surge protector lightning nec 810 250 tia-222 r56 tia-607 resistance', summary: 'Grounding electrode system, bonding conductors, surge protection and structural class for code checks.',
    body: `Key requirements checked (NEC 2020/2023):
- **810.15** masts and metal structures grounded; **810.21 / 810.58** bonding conductor ≥ 10 AWG copper.
- **810.20** listed antenna discharge unit on every lead-in.
- **250.94** intersystem bonding termination.
- **250.52(A)(5)** rods ≥ 8 ft; **250.53(A)(3)** rods ≥ 6 ft apart; **250.53(A)(2)** single rod must be supplemented unless ≤ 25 Ω.
- **800.100(A)(4)** bonding conductor ≤ 20 ft (dwellings).

Industry practice (Motorola R56, TIA-607, TIA-222-H): ≤ 10 Ω site ground, #2 AWG tinned ring, ground kits at top/bottom/entry, structural analysis by a PE.` },

  { id: 'lfhf', title: 'LF / MF / HF planning', page: 'lfhf', keywords: 'lf mf hf low frequency high frequency groundwave skywave nvis muf foF2 dipole monopole radials am broadcast', summary: 'Antenna dimensions, monopole efficiency, groundwave field strength (LF/MF) and skywave MUF / NVIS (HF).',
    body: `**LF/MF** (30 kHz-3 MHz): short monopoles have low radiation resistance (Rr ≈ 40π²(h/λ)²), so ground-system loss dominates efficiency. 120 λ/4 radials is the broadcast standard (47 CFR 73.189). Groundwave field strength uses a flat-earth Sommerfeld-Norton approximation; regulatory studies must use ITU-R P.368 / FCC 73.184 curves. **Simplified model.**

**HF** (3-30 MHz): enter the current **foF2** (from an ionosonde, e.g. the nearest GIRO/NOAA station). MUF uses the secant law with a 300 km F2 layer; FOT ≈ 85% MUF. For NVIS (0-400 km) use a horizontal dipole 0.1-0.25 λ high and a frequency below foF2. Half-wave dipole length (ft) = 468/f(MHz). **Simplified model.**` },

  { id: 'solar', title: 'Solar & DC power', page: 'solar', keywords: 'solar pv photovoltaic battery autonomy charge controller nec 690 706 480 rapid shutdown voltage drop string voc conductor sizing off-grid', summary: 'Sizes PV array, battery bank and conductors for an off-grid or backup radio site with NEC 690 checks.',
    body: `**Load**: Σ watts × hours/day ÷ inverter efficiency = Wh/day.
**Battery**: Wh/day × autonomy days ÷ (depth of discharge × temperature factor).
**Array**: Wh/day ÷ (worst-month peak sun hours × derate 0.77).

**NEC checks**
- **690.7** cold-corrected string Voc ≤ 600 V (dwellings) / 1000 V and ≤ controller rating. Uses the module temperature coefficient (690.7(A)(1)); Table 690.7(A) factors shown for reference.
- **690.8(A)/(B)** conductor ampacity ≥ Isc × 1.25 × 1.25 (156%).
- **690.12** rapid shutdown for PV on buildings.
- **706.15 / 480.7** ESS disconnect.
- Voltage drop ≤ 3% (informational, recommended).

Peak sun hours are approximate December values; verify with NREL PVWatts.` },

  { id: 'alarm', title: 'Fire alarm systems', page: 'alarm', keywords: 'fire alarm nfpa 72 battery calculation standby alarm nac voltage drop facp horn strobe smoke 760 dedicated circuit', summary: 'NFPA 72 secondary-power battery calculation, NAC voltage drop and NEC 760 power-supply checks.',
    body: `**Battery** = (standby current × 24 h) + (alarm current × 5 min), × safety factor (20% is common practice / manufacturer guidance). EVACS / mass notification requires 15 minutes of alarm (NFPA 72 10.6.7.2.1).

**NAC voltage drop** is calculated from the battery end-of-discharge voltage (20.4 V for 24 V systems) to the last device; the result must stay above the device's listed minimum (typically 16 V).

**NEC 760.41(B) / NFPA 72 10.6.5**: dedicated branch circuit, red-marked, locked, labelled "FIRE ALARM CIRCUIT".` },

  { id: 'erces', title: 'Emergency responder radio (ERCES / BDA)', page: 'erces', keywords: 'erces bda das emergency responder radio public safety nfpa 1225 1221 ifc 510 signal booster 90.219 -95 dbm 99 critical areas', summary: 'In-building public-safety radio coverage: downlink budget, IFC 510 / NFPA 1225 requirements and FCC booster rules.',
    body: `**Requirements** (IFC 2021 510 / NFPA 1225 2022 Ch. 18; verify adopted edition):
- −95 dBm minimum inbound signal; 90% of each floor, 99% in critical areas; DAQ ≥ 3.0.
- 12 hours secondary power at 100% capacity.
- NEMA 4/4X enclosures for BDA and batteries.
- Pathway survivability (commonly 2-hour) for the backbone.
- Supervisory signals to the fire alarm system and a dedicated annunciator.
- **FCC 90.219**: licensee consent; Class B boosters must be registered.

The downlink budget estimates BDA output, power per antenna after splits, and the signal at the worst point using your path-loss estimate (use the Indoor Planner for a detailed estimate).` },

  { id: 'indoor', title: 'Indoor planning', page: 'indoor', keywords: 'indoor floor plan wall 3d walls das wifi antenna placement heatmap itu p.1238 multi-wall cost 231 in-building', summary: 'Draw walls on a floor plan, place antennas, and see a multi-wall coverage heatmap.',
    body: `1. Load a floor-plan image (PNG/JPG) and enter the building width and height in metres.
2. Choose a wall material and **drag** on the plan to draw walls.
3. Switch to **Place antenna** and click to place DAS antennas / APs with their EIRP.
4. Click **🧊 3D walls** to see the walls stand up about 10 ft (3 m) tall in their material colour, with the heat map on the floor and the antennas on the ceiling. Drag to turn, scroll to zoom; switch back to **2D plan** to draw.
5. The heatmap uses the **COST-231 multi-wall model** (free-space loss + loss of every wall crossed). The ITU-R P.1238 site-general estimate is shown for comparison.

Wall losses are typical values; measure on site for critical designs. Coverage % is compared with the target (−95 dBm for ERCES).`,
    tour: [
      { target: 'in-tools', title: 'Tools', text: 'Draw walls, place antennas or erase. Pick the wall material first.' },
      { target: 'in-canvas', title: 'Floor plan', text: 'Drag to draw walls, click to place antennas. Colours show predicted signal.' },
    ] },

  { id: 'compliance', title: 'Code compliance warnings', page: 'compliance', keywords: 'code compliance nec nfpa violation warning north carolina south carolina georgia tennessee ahj amendment citation', summary: 'Lists every design item that does not meet code, citing the code and section, with a recommended fix.',
    body: `Findings are graded:
- **Violation**: a minimum code requirement appears not to be met.
- **Warning**: recommended practice, regulatory notice, or an engineering criterion.
- **Info**: jurisdiction, licensing and context.

Every NEC citation is stamped with the edition your project state has adopted (checked 2026-11-07): **NC 2020 NEC** (2023 NEC indefinitely delayed by SL 2025-2), **SC 2020 NEC**, **GA 2023 NEC + 2026 GA amendments**, **TN 2017 NEC (unconfirmed; no current official list found)**. The jurisdiction box shows the effective date, status and the official source links.

Each finding is marked **✓ checked** when its section text was read in the official free source (eCFR: 14 CFR 77.9, 47 CFR 90.219) or **confirm in code book** when the number comes from the published NEC / NFPA / IFC books, which are paywalled and could not be re-read. Section numbers can move between editions. **State amendments are not bundled in this version**; the page lists each state's adopting authority so you can confirm the edition and amendments.

This checker is a planning aid only. A licensed professional must verify compliance with the AHJ.

**Codes for the project address** lists the building, fire, fire alarm, electrical, life safety and related codes for the project's city and county. **Codes by state, county and city** lets you look up any other place: pick the state, then the county, then the city (★ marks places with their own code list or inspections), and **Use for this project** if you like. Plumbing, mechanical and fuel gas codes are hidden; tick them under **Also show** to include them.` },

  { id: 'materials', title: 'Materials list and estimate', page: 'materials', keywords: 'materials bom bill of materials quantity brand model coax cable boxes add item import excel export csv pdf auto calculate cost costing estimate estimating price unit cost labor budget over budget vendor search online stock inventory availability price list', summary: 'Bill of materials worked out from the project, plus items you add, with prices, vendors, labor, budget and online parts search; PDF, CSV and Excel export.',
    body: `The list fills in by itself from the project. Radio, grounding, solar, fire alarm and ERCES lines follow those design pages. **Auto-design** lines (equipment, cable, boxes, supports) come from the project type and the building size and devices on **Auto-Design & 3D Model**. Change any of those and the list updates. Untick **Calculate equipment and materials from the project** to leave the auto-design lines out.

**Change, add and remove.** Type a new **Qty** right in the table. Tap **✎** on any line to change its item, brand / model, part number, unit, vendor or unit cost; **Put back the design values** undoes your changes to a calculated line. **+ Add item** adds anything else, typed in or picked from the specifications library. **✕** takes a line off the list: calculated lines go under **Removed lines** at the bottom, where **Put back** returns them; items you added are deleted after you confirm. You can also import a parts list from Excel or CSV on **Projects & Storage → Import files** (columns item and qty).

**Prices.** Type the **Unit cost** (what one each, one foot or one box costs you) and the line **Total** and the category totals fill in. Every price you type is also saved to your **price list** on this device, so the same item is priced on your next project (shown as "price list"; type over it to change it for this project). The **Materials subtotal** shows how many lines still have no price.

**🔎 Search online.** Tick the lines you want (or **Select all**), tap **🔎 Search online**, pick where to search (Google Shopping, Amazon, Octopart, Digi-Key, Mouser, or any vendor with a search page address), and tap a part or **Open all**. The search uses the part number when there is one. Searching needs the internet; the rest of the page works offline.

**Vendors and stock.** Pick a **Vendor** for each line from your **🏪 Vendors** list. If a vendor gave you a stock and price address, a **Stock** column shows how many they have and their price; tap **↻** to check again, **Use $…** to take their price, or **📦 Check stock** for all ticked lines. Vendors with "Check stock by itself" are checked when the page opens (once every 12 hours, only with the internet on).

**Labor costs.** One line per kind of work: people × hours each × rate. **Suggest labor from the materials** fills in a starting estimate (about 1 hour per device, 1 hour per 100 ft of cable, 8 hours of programming and testing per system, plus 10% for project management). Change any number.

**Estimate and budget.** Add sales tax, shipping, contingency and overhead and profit, and type the materials, labor and project budgets. Each total is compared with its budget: **anything over budget shows in red** with how much it is over; under budget shows what is left. **⬇ Export PDF** and **⬇ Export CSV** include part numbers, vendors, prices and the estimate once you have prices. The proposal on the Reports page uses these totals when its own materials cost and labor hours are left blank.` },

  { id: 'vendors', title: 'Vendors', page: 'vendors', keywords: 'vendor vendors supplier distributor dealer supply house contact sales rep phone email account terms add field custom field stock inventory availability api key search page', summary: 'Your suppliers with their contact, account and terms, any fields you add, and optional online search and stock checks.',
    body: `Tap **+ Add vendor**, type the name (the only box you must fill in) and any of the basic details: sales rep, phone, email, website, address, your account number and payment terms. **+ Add field** adds anything else, such as a branch, will-call hours or a tax-exempt number; field names you use on one vendor are offered as buttons on the others. Tap **Save vendor**.

Vendors are saved on this device and shared by every project; backups made on Projects & Storage include them. On the **Materials list**, pick a vendor for each line.

**Online search and stock checks (optional).** For **Search page address**, open the vendor's website, search for any part, copy the address from the browser and replace the part you searched for with {part}. That vendor then shows in **🔎 Search online** on the Materials list. **Stock and price address** is only for vendors who give you one (an API or lookup link): use {part}, {qty} and {key} where they go, and type their **Key** if they gave you one. **Test stock check** tries it. Tick **Check stock by itself** to check every line from that vendor when the Materials list opens. Checks need the internet; if a vendor's site does not allow apps to ask, open their page with 🔎 Search online instead.` },


  { id: 'reports', title: 'Reports, proposals and closeout', page: 'reports', keywords: 'report proposal quote bid price build plan closeout package survey print pdf word excel export html kml sections warranty schedule', summary: 'Proposal, build plan, closeout package, site survey and engineering reports, with sections you pick; print, PDF, Word, Excel.',
    body: `Pick a **Report**: Project proposal, Build plan, Closeout package, Site survey report, or Engineering reports. Each starts with the usual sections ticked; tick or untick any, or open **Add more sections** for the rest (floor plans, device schedule, checklists, inspection contacts, maintenance schedule, documents index, warranty, radio and power reports).

**Proposal options** set the labor rate and hours (estimated from the device count if left blank), materials cost, markup, tax, start date and duration (for the schedule), exclusions and payment terms. They are saved with the project.

**Print / Save as PDF** prints the report (choose "Save as PDF" as the printer). **Word** saves a .doc that opens in Word, LibreOffice and Google Docs. **Excel** saves a workbook with the materials list and every table in the report. **Web page**, **Materials CSV** and **KML** are also there. Drawing sheets for permits are on **Blueprints & Drawing Sets**.` },

  { id: 'testing', title: 'Final testing & commissioning', page: 'testing', keywords: 'test commissioning sweep vswr return loss dtf pim ground resistance fall of potential drive test grid test acceptance', summary: 'Acceptance test checklist with expected values, measured results and pass/fail.',
    body: `Standard acceptance tests: feeder sweeps (return loss / VSWR, distance-to-fault), PIM, insertion loss, ground resistance (fall-of-potential, IEEE 81), bonding continuity, TX power and frequency, azimuth/tilt verification, drive test vs. prediction, ERCES grid test, battery run test and RF exposure survey.

Enter measured values and mark pass/fail; the results print in the Commissioning report.` },

  { id: 'calculators', title: 'Calculators', page: 'calculators', keywords: 'calculator dbm watts microvolt field strength eirp erp wavelength dipole isolation tilt fspl fresnel horizon diffraction hata link budget vswr return loss coax noise floor intermod mpe erlang ohm voltage drop conductor battery solar ground rod guy wire distance bearing azimuth back azimuth magnetic compass tilt reset apply to fields use project values conversion awg', summary: 'Calculators for cabling, power, fire alarm, sound and audio (with a sound level meter and test tones), RF, antennas, grounding and units.',
    body: `Type in the search box to filter (for example "vswr", "voltage drop", "erlang").

- **RF levels**: dBm ↔ W ↔ dBW, dBm ↔ µV / dBµV (50 Ω), field strength ↔ received power, EIRP / ERP.
- **Antennas**: wavelength and element lengths, dBd ↔ dBi, gain from beamwidth, antenna isolation for BDAs and co-location, downtilt to a distance.
- **Propagation**: free-space loss, Fresnel zone and 60 % clearance, radio horizon and LOS, knife-edge diffraction (ITU-R P.526), Okumura-Hata / COST-231, point-to-point link budget.
- **Transmission line**: VSWR ↔ return loss ↔ mismatch loss, feeder loss from the cable catalogue.
- **Receivers & interference**: noise floor and sensitivity, intermodulation (3rd and 5th order) against receive frequencies, RF exposure distance.
- **Traffic**: Erlang B channels for trunked systems.
- **Electrical**: Ohm's law, voltage drop (DC, single- and three-phase), conductor sizing, battery bank, solar array.
- **Grounding & structure**: ground rod resistance (Dwight), guy wire length.
- **Location & units**: the **azimuth calculator** (two GPS points or addresses → true and compass azimuth, back azimuth, distance in miles, and the up / down tilt from the antenna heights), magnetic declination, DMS, unit and AWG conversions.

**Each calculator stands on its own.** It starts from an example and keeps its own numbers: changing the project does not change a calculator, and a calculator never changes the project by itself.
- **↺ Reset** (top right of each calculator) puts just that calculator back to its example.
- **⇣ Use project values** copies the matching numbers from this project into the calculator (the project is not changed).
- **➜ Apply to fields…** puts the result into the matching fields on the other pages, for example the azimuth and downtilt on Tilt, Azimuth & Power, the donor tower for ERCES / BDA aiming, or the battery and circuit values on Fire Alarm & Batteries. A box lists every field with its value now → the new value; untick any you don't want. Press **Undo** right after if you change your mind, and a copy from before is kept in Projects → History.

Distances and lengths follow **Measurements** on Company & Project: Imperial (ft, in, mi, the default) or Metric (m, mm, km).` },

  { id: 'settings', title: 'User settings and data check', page: 'settings', keywords: 'info icon i hover explain value meaning default industry standard use default typical range source user settings preferences turn off tools hide pages menu checkbox show all tools only what i need project type turned on notice check my data verify validate errors wrong entry invalid blank empty null zero range typo unit mistake',
    summary: 'Turn tools on or off in the menu, and check the whole project for empty, out-of-range or mismatched entries with the fix for each.',
    body: `**Tools shown in the menu**: untick any tool you do not use. It leaves the menu, the step numbers and Next / Previous; nothing is deleted and you can tick it again any time. **Show every tool** brings them all back; **Only what this project needs** keeps just the tools for the project's systems. The choice is for you on this device and applies to every project. Company & Project, Project Systems, Projects and User Settings always show.

**Automatic turn-on**: when you pick a project type or add a sub-project, any tool that job needs is turned back on and a notice lists what was turned on. On a custom project the needed tools are also added to your page pick.

**Wrong or blank entries**: every number box checks what you type. If it is outside the normal range (for example a negative length, or 2,500 % fill) the box turns red, a message says what is wrong, and a **Use …** button offers the likely value (a slipped decimal point or the wrong unit). The last good value is kept until you fix it. A blank box is never counted as zero: calculators ask you to fill it in, and optional boxes are skipped.

**ⓘ beside each value**: point at it (or tap it) to see what the value means, its unit, the typical and allowed range, and the industry-standard default with its source. **Use default** puts that value in the box.

**Cross-checks**: calculators also compare related values, for example a cable wider than the conduit, a device minimum voltage above the supply, alarm current below standby current, or an ear height above the ceiling.

**Check my data** goes through the whole project (sites, radio design, fire alarm, ERCES, solar, grounding, materials, service calls, proposal) and lists each problem with a **Fix on …** button that opens the right page. ⛔ = must fix, ⚠ = double-check. Every value still needs review by a licensed professional and the AHJ.` },
  { id: 'sync', title: 'Sync between devices', page: 'sync', keywords: 'sync synchronize share bluetooth wifi wi-fi cellular nearby quick share qr code cloud onedrive google drive dropbox merge phone pc tablet', summary: 'Keep the PC, USB, tablet and phone copies of a project in step over Wi-Fi, Bluetooth / Nearby Share, or a cloud-drive folder.',
    body: `Every device keeps a full copy and works offline. Syncing **merges** copies: each part of the project (company, radio design, grounding, etc.) keeps the most recent change from either device, and sites, scenarios, run history, tests, survey points and Wi-Fi readings from both devices are combined. Deleting an item on one device deletes it on the other at the next sync.

**Direct over Wi-Fi** (no internet needed): both devices on the same Wi-Fi or one device's hotspot. Press **Start** on one, scan its QR code with the other, then scan the reply code back. The project goes straight between the devices. When online it can also connect across cellular networks, but some carriers block direct links.

**Bluetooth / Nearby Share / email**: **Share sync file** opens the system share sheet (Android: Bluetooth, Quick Share; Windows: Nearby sharing). On the other device use **Merge a sync file**.

**Cellular (cloud drive)**: on Chrome or Edge for Windows/Mac, choose a folder that OneDrive, Google Drive or Dropbox syncs. Each device writes its own file every minute and merges the others. On Android, save the sync file into the Drive or OneDrive app and merge the other device's file.

No LvPlan server or account is involved; data moves only between your devices or through your own cloud drive.` },

  { id: 'library', title: 'Specifications library', page: 'library', keywords: 'nfpa bicsi tia ul nicet esa icc ahj licensing board training certification rcdd specifications specs datasheet manual service manual technician programming repair parts library equipment catalog legacy discontinued obsolete older replacement recall cpsc service bulletin tsb access control reader maglock strike controller credential low voltage antenna coax cable connector bda das fire alarm battery solar wifi poe cat6 fiber conductor compare import csv', summary: 'Search, compare and add equipment specifications, plus codes, training and licensing references for NFPA, BICSI, TIA, UL, NICET, ESA and the state boards.',
    body: `**Codes, training & licensing** (a category in the library): one entry for each body that matters in low-voltage work: NFPA (NEC and NFPA 72), BICSI (TDMM, RCDD and installer credentials), TIA (568, 569, 606, 607), UL (listings and Product iQ), NICET (fire alarm levels), ESA (National Training School), ICC, the AHJ, the licensing boards for NC, SC, GA, TN and VA, and others such as the FOA, ETA, AVIXA, ASIS, SIA, IEEE and ANSI. Each entry lists what the body does, its key documents, training and credentials, the systems it covers, and its official web pages. The text reads offline; the links need internet.

**Manuals:** pick an item, then under *Service, technician and installation manuals* choose the type and use **Attach file** (PDF, picture, video), **Add link** or **Find … online**. The **Service & technician resources** card holds manuals that aren't tied to one item. All of them open offline and are in backups.

**Manufacturer recommendations:** each item shows the installation, wiring, environment and maintenance points manufacturers in that category commonly state, and your own items can carry the model's exact recommendations (Edit → one per line, from the installation manual).

**Low-voltage equipment:** current products for each system, with access control in depth (door controllers, card readers, credentials, maglocks, electric strikes, latch retraction, power supplies, request-to-exit and door position switches), plus fire alarm panels and devices, CCTV, intercom, nurse call, paging and sound, mass notification, call boxes, DAS and cabling.

**⚠ Legacy equipment:** press the **⚠ Legacy equipment** button to list older and discontinued models still found on service calls (for example Notifier AFP-200, Simplex 4020, Ademco Vista-10P, DSC PowerSeries, Pelco Spectra III, HID prox readers, Rauland Responder IV, Motorola MSF5000, OM1 fiber and Cat 5). Each one is filed under its system and shows its status, suggested current replacements, service and repair notes, and links to the manufacturer's documentation pages. Legacy models also appear, marked ⚠ Legacy, in the radio, antenna and cable lists, the materials picker and the troubleshooting wizard.

**Recalls and service bulletins:** official CPSC recalls for fire alarm, security and related equipment are built in, and new ones download about once a week when online. A model with a recall shows **⚠ Recall / bulletin**; open it to see the affected models, date codes, problem and remedy, with a link to the official notice. When equipment in a project matches a notice, a banner appears on every page of that project until you mark it **Checked for this project**. Add a manufacturer service bulletin to any model with **+ Add a service bulletin**; projects using that model get the alert too.

The library holds three kinds of entries:

- **Typical**: products from the built-in equipment catalog with typical datasheet values.
- **Standard**: values set by a published standard (PoE classes, cable categories, fiber types, Wi-Fi generations, RF connectors, public-safety band plans, conductor ampacity).
- **Mine**: anything you add. No library can list every product on the market, so add the products you use with **+ Add equipment** or **Import CSV** (download the **CSV template** first). Your items stay on this device and can be exported.

Search finds any word in any specification. Tick up to four items to **compare** them side by side. **Find datasheet online** searches the web for the manufacturer's PDF. For your own antennas, coax and radios, **Use in this project** adds them to the Equipment lists so the link budget and materials list use them.

Always confirm values against the current manufacturer datasheet before ordering.

**Datasheets offline:** open an item and use **Save datasheet for offline** (when it has a datasheet link) or **Find datasheet online**, save the PDF, then **Attach saved PDF**. The PDF is kept inside the app and opens with **Open saved datasheet** without internet. It is included in backups.` },

  { id: 'install', title: 'Installation guides', page: 'install', keywords: 'install installation instructions wiring diagram color antenna coax grounding repeater battery erces bda das fire alarm nac solar poe cat6 t568b access point', summary: 'Step-by-step installation instructions with color wiring diagrams.',
    body: `Pick a guide from the **Choose a guide** dropdown; guides for this project's systems are listed first. Sections fold open and closed to save scrolling; **Print** prints the whole guide.

Each guide has a color wiring diagram, tools, safety notes, numbered steps, tests for closeout and the code articles that apply. Diagrams use the antenna and coax chosen in this project where possible. Press **Print** for a copy for the crew.

Guides: antenna feedline and grounding; repeater RF and DC power; ERCES / BDA and DAS with fire alarm monitoring; fire alarm NAC circuit; off-grid solar; network cable, PoE and Wi-Fi access point (with T568B colors).

These are general guidance. Follow the manufacturer's instructions, the approved drawings and the adopted codes.` },

  { id: 'systems', title: 'Project systems and toolkits', page: 'systems', keywords: 'project type sub-project structured cabling fiber fire alarm security intercom nurse call paging sound design service maintenance access control cctv mass notification call box das', summary: 'Pick the main system and any sub-projects; each gets a plan, install, test, repair and maintenance toolkit.',
    body: `Pick **⚙ Custom** as the project type to choose only what you need: **1.** tick the systems on this job, **2.** tick the pages and tools to show (**Suggest for my systems** fills it in for you). The left menu, the step numbers and Next / Previous then follow your pick, and the troubleshooting, installation, service and library pages show your systems first. Company & Project, Project Systems and Projects always show; **Show all** at the bottom of the menu shows every page again.

Pick the **Project type** from the dropdown, then tick any **sub-projects** on the same job (for example fire alarm with access control and CCTV). The same choice is on Company & Project and on the first-start screen.

Each system gets tabs: **Plan**, **Install**, **Test & troubleshoot**, **Repair & maintain** and **Tools & reference** (standards and its calculators). Buttons jump to the related pages.` },
  { id: 'service', title: 'Service & maintenance resources', page: 'service', keywords: 'service maintenance pm preventive inspection repair fault fix manual standards schedule', summary: 'Maintenance intervals, common faults and fixes, test steps, standards and manuals for every system.',
    body: `A reference shelf for service work (Tools). Pick a **system**; this project's systems are listed first.

- **Preventive maintenance:** what to inspect or test and how often, with the code reference.
- **Common faults and fixes**, then the **troubleshooting wizard** for step-by-step help.
- **Test and inspection steps**, **installation reminders** and **standards**.
- **Tools in the app** and **Find online** (service manuals, troubleshooting guides, how-to videos).
- **Service manuals and documents:** keep PDFs and links for that system on this device; they open offline.

Nothing here is saved to the project.` },
  { id: 'troubleshoot', title: 'Troubleshooting wizard', page: 'troubleshoot', keywords: 'troubleshoot equipment type device smoke detector maglock camera reader fault repair vswr sweep battery nac ground fault poe fiber loss bda test values', summary: 'Step-by-step checks with how to test and the value to expect, for the equipment you pick.',
    body: `Pick in short steps instead of one long list: **1. System** (this project's systems first), **2. Equipment**: *General (whole system)*, an **equipment type** (smoke detector, horn/strobe, pull station, panel, battery, maglock, electric strike, card reader, camera, NVR, motion detector, door contact, PoE switch, access point, BDA, repeater, speaker, nurse call station), or *A specific model from the library*, which then asks for the **library category** and the **model** (this project's equipment first). **3. Problem** lists the equipment's own problems first, then the general system problems. Each step shows **what to check**, **how to check it**, the **tool**, and the **expected value**, worked out from that item's specifications where possible.

Type what you measured and press **✓ OK** or **✗ Not OK**. A failed step tells you what to do next. When done, save the results to **Final Testing** or as a **field note**.` },
  { id: 'autodesign', title: 'Auto-design, 2D plan and 3D model', page: 'autodesign', keywords: 'auto design recommend equipment layout 3d model 2d floor plan devices estimate materials topography terrain building', summary: 'Recommended equipment, device layout, a 2D plan or 3D model, and a material estimate from the building you describe.',
    body: `Pick the project type and sub-projects, then describe the building: type, floors, size, doors, rooms, parking and call boxes. The app places devices for every system on a starting grid, puts telecom rooms so cable runs stay under 90 m, recommends head-end equipment (panel, batteries, switches, recorder storage, amplifiers, BDA) and measures cable from the layout.

**2D plan** shows each floor flat (point at a dot to see what it is). **3D model** shows the whole building: drag to turn, pinch to zoom. Tap legend items to hide them. **Site and placement** uses the downloaded terrain to warn about low ground, exposure and donor-antenna height.

**Add to Materials list** puts the equipment and materials in the Materials list and fills the Fire Alarm and ERCES pages. Every quantity is a starting point: a designer must check it against the adopted codes, the manufacturer and the AHJ.` },
  { id: 'models', title: '2D & 3D models with layers and building materials', page: 'models', keywords: 'layers 2d 3d model plan building materials walls floors roof windows doors concrete block brick drywall low-e glass metal elevator stair basement below grade rf penetration loss echo reverberation acoustic fire rating firestop plenum camera view motion heat map coverage cable route slc nac riser backbone das coax donor scenario compare dxf cad', summary: 'A true-scale 2D plan and 3D model of the building with layers for every system, building materials you pick, and what they do to signal, sound, fire ratings and camera views.',
    body: `**1. Building and systems**: the building type, size and floors (shared with Auto-Design) and the project's systems.

**2. Building materials**: pick the outside walls, windows (and how much of the wall is glass), corridor and room walls, doors, floors, roof, ceiling, floor finish, stairs and elevator, and floors below ground. Each building type starts with typical materials; **Use typical** puts them back. Open *What each material does* to see the radio loss at each band (VHF, UHF, 700/800, cellular, Wi-Fi), sound absorption, fire rating and whether cameras can see through it.

**3. 2D plan and 3D model**: switch between **2D plan** and **3D model**, pick a floor or all floors, and in 3D **pull floors apart** to see inside. The **Layers** list turns each part on and off: the building (floors, walls by material, stairs and elevator, labels, dimensions and north arrow, site and parking) and, for every system, its devices, coverage (detector circles, strobe areas, speaker circles, camera and motion-sensor views stopped by walls), cable runs and circuits (home runs, SLC loop and NAC circuits, speaker zones, nurse call bus, fiber backbone and riser, DAS coax and donor cable, conduit to call boxes) and signal heat maps (Wi-Fi and DAS / public-safety radio through the walls and floors you picked). **Only this** shows one system. Tap anything to see what it is. **Save picture** saves the view; **CAD drawing (DXF)** opens in AutoCAD and other CAD programs with the same layers.

The results under the model use the materials: signal coverage, outside signal lost reaching the middle of the floor, echo in a typical room (and speaker spacing advice), firestop penetrations, cable jacket (plenum or riser) and required ratings.

**4. Compare a scenario**: see what changes with a different building (steel and low-E glass, wood frame, tilt-up, metal building, block walls, glass curtain wall, a basement, soft or hard finishes) without changing your choices, then **Use this scenario** if you want it.

Everything is a starting layout from rules of thumb; a designer must check it against the adopted codes, the manufacturer and the AHJ.` },
  { id: 'campus', title: 'Multi-building site and campus', page: 'campus', keywords: 'campus multi building site plan several buildings outbuilding fiber underground conduit handhole aerial pole copper protector wireless bridge point to point line of sight fresnel cable schedule site materials outdoor coverage', summary: 'Plan a whole site: several buildings, each with its own size, floors and materials, the links between them, one layered site model, a cable schedule and the materials for everything.',
    body: `**1. Buildings on the site**: the main building (A) comes from Auto-Design and 2D & 3D Models. **+ Add a building** for each other building: name, type, floors, size, where it sits (feet east and south of building A's corner), how far it is turned, and its outside walls and floor construction. You can also drag a building on the site plan.

**2. Links between buildings**: fiber or copper in underground conduit, aerial fiber on poles, empty conduit for later, or a wireless bridge between roofs. Each link shows its route length, cable length, handholes or poles. Wireless links get a link budget and a check that no other building blocks the path.

**3. Site plan and 3D site model**: every building with all its layers, the links (dashed = underground), handholes and poles, and **Outdoor signal** showing indoor Wi-Fi or radio antennas reaching outside through each building's walls. The **Buildings** layers show or hide a whole building.

**4. Cable schedule** and **5. Materials for the whole site** add up every building and every link; download either as a spreadsheet, or **Add to Materials list**.

Routes are straight lines with 15% added for bends; a designer must walk the route, call 811 before digging, and check everything against the codes and the AHJ.` },
  { id: 'theory', title: 'Low-voltage & RF design principles', page: 'theory', keywords: 'theory training basics advanced principles ohm law voltage drop cabling fiber plenum riser grounding bonding systems installation troubleshooting learn study index rf radio frequency decibels dbm vswr return loss antennas eirp erp propagation fresnel path loss hata longley rice fading noise sinad daq modulation p25 dmr interference intermod pim isolation mpe emi surge poe redundancy network wifi das erces structured cabling tia drawings scales', summary: 'A built-in reading guide to low-voltage and RF work, from basic electrical theory to RF engineering, design concepts and troubleshooting, with an index.',
    body: `**Low-Voltage & RF Design Principles** (in Tools) is a reading guide built into the app, so it works offline. It runs in a logical order:

1. **Electrical fundamentals**: Ohm's law, AC and DC, power-limited circuits, series and parallel, supervision and EOL resistors, wire size and voltage drop, power supplies and batteries, signals and decibels, grounding and bonding, safety.
2. **Cabling, pathways and media**: twisted pair, coax, fiber, cable fire ratings, pathways and firestopping, networks and PoE, radio basics.
3. **The systems**: fire alarm, intrusion, access control, CCTV, intercom, nurse call, paging, pro sound, mass notification, call boxes, DAS/ERCES, two-way radio, design services, and service contracts.
4. **Installation practice**: from the site walk through rough-in, trim-out, programming, testing and closeout.
5. **Advanced design and troubleshooting**: NAC design, audibility and intelligibility, survivability, a troubleshooting method, RF interference, and estimating.
6. **RF engineering principles**: waves, bands and polarization; decibels (dBm, dBi, dBd, µV); transmission lines, VSWR and return loss; antennas, ERP and EIRP; propagation, horizon and Fresnel zones; path loss models (Hata, Longley-Rice, P.1238, multi-wall); fading, margins and diversity; noise, sensitivity, SINAD and DAQ; modulation and channel access; interference, intermod, PIM and BDA isolation; RF exposure.
7. **Low-voltage system design concepts**: EMI, shielding and surge protection; power, batteries and PoE; reliability and redundancy; networks; Wi-Fi; DAS, BDA and ERCES; structured cabling (TIA-568, 569, 606, 607); drawings, scales, symbols and sheets.

Every section ends with **✔ Industry best practices** from the referenced standards and common trade practice.

Click any line in the **Index** to jump to it. Filter by **Basic**, **Intermediate** or **Advanced**, or search the text. Under many sections, **🧮 Calculators** opens the matching calculators right there, and **Open … →** goes to the page that puts it to work.

This is general training text: the adopted code edition, the manufacturer's instructions and the AHJ decide what applies on a job.` },
  { id: 'contacts', title: 'Contacts and web resources', page: 'contacts', keywords: 'contacts zip code phone address inspections fire marshal building department licensing board web links resources city county state', summary: 'Inspection offices, fire marshals and licensing boards by state, county and city, plus web links. Add, edit and remove your own.',
    body: `Pick the **state**, then the **county**, then the **city**, or type a **ZIP code** to set all three at once. The page shows the state, county and city offices for that place, and the **Web resources** tab shows code pages and other links. Tap a phone number to call or an address to open the map.

Built-in numbers were copied from each office's official page on the date shown. Where none is built in, **Look it up** searches the web; then **+ Add contact** keeps it. **Edit** makes your own copy, and **Remove** hides an entry. Pick **★ My contacts** in the state list to see only the ones you added.` },
  { id: 'blueprints', title: 'Blueprints and drawing sets', page: 'blueprints', keywords: 'blueprint drawing sheet permit submittal shop drawings title block scale arch d ansi riser legend symbols dxf cad autocad pdf nfpa 72 seal', summary: 'Permit and shop-drawing sheets with title block, standard sheet sizes, architectural scales, riser, schedules and CAD export.',
    body: `The drawing set is made from the **Auto-Design** layout: a **cover sheet** (project data, codes in effect for the address, sheet index, symbols legend, general notes), a **floor plan** per floor for each discipline (FA fire alarm, T telecom, SS security, NC nurse call, AV paging and sound, RF DAS and ERCES), a **riser diagram**, and **schedules** (device counts per floor, equipment, and for fire alarm the battery calculation and sequence of operations).

Every sheet has a **title block** (your company, project, seal box, revisions, drawn and checked by, date, scale, sheet number). Pick the **sheet size** (ARCH D 24 × 36 in is usual for permits) and the **plan scale** (1/8" = 1'-0" and so on, or the largest that fits). Add a **revision** line each time you reissue.

**Print / Save as PDF** prints each sheet at full size: print at 100%, not "fit to page". **CAD drawing (.dxf)** opens in AutoCAD and other CAD programs, in feet, one layer per system. **SVG** sheets can be opened in drawing programs. For fire alarm, the **NFPA 72 shop drawing checklist** shows which required items the set covers and which you still add (voltage drop, candela, point-to-point wiring). A licensed engineer or NICET-certified designer, as the AHJ requires, must review and seal the drawings.` },
  { id: 'import', title: 'Importing and exporting files', keywords: 'import export file excel xlsx csv kml kmz gpx geojson pdf word photos documents attach open any format dxf', summary: 'Import any file into a project; export to PDF, Word, Excel, CSV, KML, DXF and more.',
    body: `**Import files** (on Projects & Storage and on the Reports page) takes any file:
- **Excel (.xlsx) or CSV** with latitude and longitude columns → sites; with item and qty → Materials list; with name and phone or email → My contacts.
- **KML, KMZ, GPX, GeoJSON** points → sites.
- **Photos** → Field Notes & Photos.
- **LvPlan project or backup files** → Projects.
- **Anything else** (PDF, Word, CAD drawings, permits, data sheets) is kept with the project under **Documents**, syncs with it and is listed in the closeout package. Files up to 15 MB.

Export: Reports page (PDF, Word, Excel, HTML, CSV, KML), Blueprints (PDF, DXF, SVG), Materials (CSV), Map pages (KML, KMZ, GeoJSON, Shapefile), and the project file itself (top bar **Export**).` },
  { id: 'checklists', title: 'Checklists', keywords: 'checklist check off progress task survey permit install testing closeout punch', summary: 'Checklists on the survey, permit, installation, testing and closeout pages, saved with the project.',
    body: `Checklists sit at the bottom of **Field Notes** (site survey), **Code Compliance** (permit and submittal), **Installation Guides**, **Final Testing** and **Reports** (closeout). Installation and testing lists include the steps for every system on the project. Tick items as you go; add your own with **Add your own item**. The sidebar shows ✓ when a page's checklist is finished, and the bottom of the menu shows the total. Checklists print in the Build plan and Closeout reports.` },
  { id: 'selfrepair', title: 'Updates and self-repair', keywords: 'update automatic repair crash error fix broken damaged restore version recover offline database checksum backup rollback refresh care maintenance', summary: 'The app updates itself and repairs damaged data automatically.',
    body: `**Updates:** the app checks for a new version every hour when online. On Windows it installs the update by itself; on Android and the flash drive it shows a one-tap download. The built-in codes, contacts and reference data are updated with each new version.

**Self-repair:** when a project opens, missing or damaged values are filled in with safe defaults. If a page stops working, the app repairs the project data and opens it again; if that does not fix it, it goes back to the last saved version (your newer work is kept in Projects → History). After an update, it reloads itself to pick up the new program files.

**Automatic care (Projects → Automatic care):** without being asked, the app checks its saved data for damage (each saved project carries a SHA-256 checksum) and repairs it: a damaged project is put back from its last good version, damaged terrain or map tiles are removed and downloaded again, and a damaged RadioReference list is put back from its encrypted spare copy. When online, it keeps downloaded data current: RadioReference county lists every 30 days (Windows and Android, while logged in), and the areas you saved for offline maps (gaps filled monthly, a fresh copy twice a year). A new copy only replaces the old one after it passes its check; if a download fails, the old copy stays and the app tries again later. Each changed project gets a daily backup (the last 7 days are kept), and a copy goes into History before every app update. App updates are checked against the file's SHA-256 before they install; if a new version fails to start 3 times, the Windows app goes back to the last version that worked and waits for the next fix. Also when online, the app downloads newer **code editions, city and county code lists, contacts and web links, the equipment catalog, manufacturer recommendations, this help and the magnetic model** from the LvPlan Pro website without waiting for an app update. Each download is checked (SHA-256 and layout) before it is used; data laid out for a newer app waits for that app update. The topo map around each project's sites and datasheets saved from a manufacturer link are kept fresh too. **Check everything now** runs all of this at once.

**Offline database:** projects, history, terrain, your specifications library, saved datasheets, contacts and web links are all kept in a database inside the app and work with no internet. **Back up all projects** saves all of it in one file.` },
  { id: 'fieldnotes', title: 'Field notes', page: 'fieldnotes', keywords: 'field notes photos camera gps site visit punch list follow-up dictate', summary: 'Notes, photos and GPS positions taken on site, saved in the project.',
    body: `Press **+ New note**, type (or dictate with the microphone on your phone keyboard), add photos from the camera and press **Save my GPS position**. Link a note to a site and tick **Needs follow-up** for punch-list items; filter with **Open follow-ups**.

Photos are reduced to 1280 pixels so projects stay small enough to sync. Notes sync between devices like the rest of the project, export to CSV, and print in **Reports → Field Notes & Photos**.` },

  { id: 'photosurvey', title: 'Photo site survey', page: 'photosurvey', keywords: 'photo site survey panorama how to take panoramic video pictures camera compass heading gps exif horizon skyline terrain towers obstructions line of sight heat map view cone 3d', summary: 'Phone photos or a panorama placed where and in the direction they were taken, matched to the terrain, with the horizon, towers, sites, what blocks the view and the signal drawn on them.',
    body: `Stand where an antenna or tower might go and press **📷 Take photos here**. Take photos all the way around you (let each one overlap the last a little), or one panorama. **🖼 Add photos or a panorama** brings in photos you already took; photos taken at the same spot (within 100 ft) go together.

**How to take a good panorama** (open **📱 How to take a panorama correctly** and press **▶ Play** for a one minute video): turn on location and the compass, stand still and turn on the spot, hold the phone level at eye height with the horizon in every picture, overlap each photo about a third (8 to 12 photos around), do not zoom, and use **📷 Take photos here** if your photos lose their location.

**Where and which way:** the app reads the GPS position, height and compass direction saved in each photo (and the tilt from drones). If a photo has no compass direction, the app uses the phone's compass while you take photos in the app, or lines the photos up side by side. Press **⛰ Line up with the terrain**: the app finds the skyline in each photo and turns it until it sits on the terrain horizon. You can always nudge a photo with **◀ ▶**, type its direction in degrees true, or type a reading from a hand compass (°M). If a photo has no position, use **◎ My GPS** at the spot, type coordinates, or tap the map.

**Layers** (tick on or off): Photos, Terrain horizon (yellow), Azimuth & compass (°T and °M across the top), Project sites, Existing towers, RadioReference sites (only while logged in, never in reports), What blocks the view (red ✕ on the ridge that hides a site), Drawn lines, Signal heat map (predicted signal from the transmit site on the ground you can see) and Photo edges. Hover or tap the picture to read the direction and up / down angle.

**What is in view from here** lists every site and nearby tower with distance, azimuth, up / down angle and whether the terrain hides it.

The spots and each photo's view cone show on every flat map (layer **📷 Photo survey spots**) and in the **⛰ 3D tilt view** over the satellite pictures. Press **📄 Save picture for reports** to put the panorama with its overlays and the in-view list in **Reports → Photo site survey** (part of the Site survey report).

**Limits:** the horizon uses terrain heights and the earth's curve; trees and buildings are not in the terrain, so the real skyline can be higher. The app does not build a 3D model of buildings from photos. Satellite pictures are only as new as the last download. Some phones remove the location from photos when they are shared; take them in the app or set the spot by hand. Always confirm on site.` },
  { id: 'directions', title: 'Map & directions', page: 'directions', keywords: 'map directions route drive navigate google apple waze gps address location office', summary: 'The project site on a map, with one-tap driving directions from where you are or from your office.',
    body: `Shows the **project site address** from Company & Project at Site A's position, with the client contact for the crew.

- **Directions:** Google Maps, Apple Maps or Waze open with turn-by-turn directions from where you are now. **From your office** uses your company street address.
- **Show me on the map** adds your current position and the straight-line distance and direction to the site.
- **Copy address / Copy GPS** to paste into a text or another app.
- Offline, the map uses saved tiles; directions need internet.` },
  { id: 'projects', title: 'Projects & built-in storage', page: 'projects', keywords: 'save open project library storage autosave history version restore backup data folder usb flash drive offline delete duplicate copy reuse template similar previous project based on', summary: 'Every project is saved automatically inside the app, with history, terrain and backups. No internet or account needed.',
    body: `**Delete** removes a project and its history from this device. You are always asked to confirm first (Yes, delete it / No, keep it); you can delete the open project too, and the most recent other project opens instead. Press **Export** first if you want a backup file.

LvPlan keeps a **project library inside the app**. Each change saves automatically within a second; the chip in the top bar shows **✓ Saved**.

- **Projects**: open, copy, export or delete any project. **New** starts a fresh project and keeps the current one.
- **Start a new project from a previous one**: for a similar design and build, press **Reuse** on a project (or pick it in the card), type the new name and tick what to carry over: project type, design, equipment and materials, pricing, drawing settings, your checklist items, and optionally the client, sites and attached files. Field notes, photos, tests, service calls and checklist ticks start empty. The old project is not changed.
- **Terrain is kept with the project**, so a downloaded or imported elevation model is there next time, even offline.
- **History**: a version is kept every 10 minutes while you work and whenever you press **Save a version now**. **Restore** goes back to one (the current state is kept first).
- **Backup**: **Back up all projects** saves one file with every project and its terrain. **Restore from backup** adds them on another PC or phone.
- **Data folder** (Chrome / Edge on a computer): choose a folder on the flash drive and a copy of every project is written there, so the projects travel with the drive.

Where the storage lives: the Windows app keeps it in its own data folder, the Android app in its private storage, and the flash-drive version in the computer's browser profile (use a data folder on the drive to carry projects between computers).` },

  { id: 'packaging', title: 'USB, PC and Android versions', keywords: 'usb portable windows desktop install android apk offline', summary: 'One codebase runs from a USB stick, as a Windows desktop app, and as an Android app.',
    body: `- **USB portable**: copy **RadioPlan.html** to the stick and double-click it. Everything is in one file; no install. Save project files next to it.
- **Windows PC app**: built with Tauri (see README "Desktop build"). Produces an installer and a portable .exe.
- **Android**: built with Capacitor (see README "Android build"). GPS uses the phone's GNSS.

Maps and terrain download automatically when online and are cached for offline use; see Working offline.` },

  { id: 'disclaimer', title: 'Professional responsibility', keywords: 'disclaimer liability pe engineer verify', summary: 'Results must be verified by a licensed professional.',
    body: `LvPlan Pro is a planning tool for qualified users. Propagation models are statistical; code citations may not reflect the edition or local amendments adopted by your AHJ. A licensed professional engineer must review and seal designs where required, and installations must be permitted and inspected by the AHJ.` },
];

// Walkthroughs kept in tours.ts: fill in pages without a tour, and add steps for newer tools.
for (const h of HELP) {
  if (!h.page) continue;
  if (!h.tour?.length && PAGE_TOURS[h.page]) h.tour = PAGE_TOURS[h.page];
  if (PAGE_TOUR_EXTRAS[h.page]) h.tour = [...(h.tour ?? []), ...PAGE_TOUR_EXTRAS[h.page]];
}

// The manual lists topics in the same order as the menu: first the intro topics, then each page's
// topic in menu order (general topics sit next to the page they belong with), then the rest.
const INTRO = ['getting-started', 'whats-new', 'menu-guide', 'offline'];
const NEAR: Record<string, string> = { azimuth: 'optimize', checklists: 'testing', import: 'reports', selfrepair: 'projects' };
const rank = (h: HelpTopic) => {
  if (INTRO.includes(h.id)) return INTRO.indexOf(h.id) - 100;
  const pg = h.page ?? NEAR[h.id];
  const i = pg ? MENU_ORDER.findIndex((p) => p.id === pg) : -1;
  return i < 0 ? 1000 : i + (h.page ? 0 : 0.5);
};
HELP.sort((a, b) => rank(a) - rank(b));
