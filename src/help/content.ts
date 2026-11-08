// Interactive help manual content. Each topic is searchable; `page` links a topic to a workflow page,
// and `tour` lists guided-walkthrough steps that highlight elements marked with data-tour="...".
export interface TourStep { target: string; title: string; text: string }
export interface HelpTopic { id: string; title: string; page?: string; keywords: string; summary: string; body: string; tour?: TourStep[] }

export const HELP: HelpTopic[] = [
  { id: 'getting-started', title: 'Getting started', keywords: 'start intro video tour overview workflow usb android install save open project', summary: 'The left sidebar is your workflow: work top to bottom from Company & Project to Testing.',
    body: `LvPlan Pro walks a project from first site visit to commissioning. Press **▶ Video** at the top of the screen for a narrated, captioned tour of every page and tool (it plays offline). Press **Skip this step** at the bottom of any step you don't need on this job: it is greyed out in the menu and Next / Previous pass over it (open it from the menu and press **Don't skip it** to bring it back). Each page in the left sidebar is one **task**, in the order engineers normally perform them. Pages where work gets checked off (site survey, permits, installation, testing, closeout) have a **checklist** at the bottom; the sidebar shows ✓ when a checklist is finished.

- Your work saves automatically in this computer's browser storage.
- Use **Save project** (top bar) to write a .radioplan.json file you can keep on the USB drive, email, or open on the Android app.
- Press **F1** or the **?** button on any page for help on that page, or **Guide me** for a step-by-step walkthrough.
- Small **?** bubbles next to fields explain what to enter.

**Important:** code citations and calculations are planning aids. A licensed professional engineer and the Authority Having Jurisdiction must verify the design.` },

  { id: 'locate', title: 'Find location & auto-plan', page: 'locate', keywords: 'address suggestions autocomplete search address location coordinates lat lon dms view satellite 3d auto plan build plan candidate tower site selection viewshed', summary: 'Type an address or coordinates, view the spot on topo/satellite/3D, and build a complete starting plan in one click.',
    body: `**Suggestions** appear as you type an address (on this page and in the company, client and site address fields): recent places, saved results and project sites work offline; online suggestions come from Photon (OpenStreetMap data). Use ↑ ↓ and Enter, or tap one.

**Search** with the box on this page. Accepted: street addresses and place names (needs internet; earlier results are remembered offline), decimal coordinates (35.2271, -80.8431), degrees-minutes-seconds (35°13'37"N 80°50'35"W) or degrees-decimal-minutes (N35 13.627 W80 50.587). You can also click the map.

**View**: topographic, satellite and hybrid maps, ground elevation from the USGS 3DEP point service, and a 3D terrain model around the spot.

**Build a plan** downloads terrain for the area, then tests a grid of candidate tower spots within the search radius. Each candidate is scored by how much of the service area it can see over the terrain (near line-of-sight) at your antenna height. The best spot becomes Site A, the location becomes the facility (Site B), and the band, antenna, azimuth, downtilt, feeder length, jurisdiction, coverage run, path profile, materials list, code checks and commissioning test plan are all filled in. Review and adjust every page afterwards.

Not considered: zoning, land ownership, FAA airspace, existing towers and leasing. Verify on site.`,
    tour: [ { target: 'plan', title: 'Auto-plan', text: 'Choose the band, service radius and tower height, then build the plan.' } ] },

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

**Project state** selects the code set used by the compliance checker: North Carolina, South Carolina, Georgia or Tennessee. The county is printed on reports; check whether the county or city enforces a different code edition.

**Find on map** geocodes the company or project address to GPS coordinates and can create a site at that location.`,
    tour: [
      { target: 'company-form', title: 'Company details', text: 'Your company name, title and address appear on every report.' },
      { target: 'company-geocode', title: 'Address to GPS', text: 'Geocode the address to latitude/longitude and send it to the map, terrain and site pages.' },
      { target: 'project-form', title: 'Project & jurisdiction', text: 'Pick the state here. It drives which code editions are cited in the compliance warnings.' },
      
    ] },

  { id: 'sites', title: 'Site data & GPS', page: 'sites', keywords: 'site database csv import export multi-site spreadsheet gps nmea gnss rtk coordinates latitude longitude elevation antenna height structure tower airport geocode address', summary: 'Record each candidate site: position (GPS), ground elevation, structure and antenna height.',
    body: `Each **site** is a candidate tower, rooftop or building location.

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

  { id: 'terrain', title: 'Map & terrain data', page: 'terrain', keywords: 'map topo topography dem lidar las srtm hgt geotiff asc usgs 3dep terrain elevation layers satellite offline', summary: 'View sites on topographic or satellite maps and load terrain (DEM / LiDAR) used by all calculations.',
    body: `**Base maps**: OpenTopoMap (contours), Esri World Imagery (satellite), USGS Topo, and OpenStreetMap. Map tiles need internet; terrain files work offline once loaded.

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

  { id: 'optimize', title: 'Tilt, azimuth & power', page: 'optimize', keywords: 'tilt downtilt azimuth power footprint shaping optimize sector beamwidth', summary: 'Shape the footprint: see where the main beam and −3 dB edges land and get a recommended downtilt.',
    body: `For an antenna at height h with downtilt θ and vertical beamwidth β:
- Main beam hits the ground at d = h / tan θ.
- Inner −3 dB edge at h / tan(θ + β/2); outer edge at h / tan(θ − β/2) (∞ when θ ≤ β/2).

**Recommended tilt** places the upper −3 dB edge at your target cell radius: θ = atan(h/R) + β/2.

Adjust power to balance uplink and downlink and to avoid interference into neighbouring cells. Re-run coverage after changes.` },

  { id: 'view3d', title: '3D terrain model', page: 'view3d', keywords: '3d model view terrain mesh tower fresnel ellipsoid', summary: 'Interactive 3D terrain with towers, the radio path and the first Fresnel zone.',
    body: `Drag to orbit, right-drag to pan, scroll to zoom. Vertical exaggeration makes terrain easier to read. The red/green line is the path (green = 60% F1 clear). The translucent ellipsoid is the first Fresnel zone.

The 3D model uses the loaded DEM; if none is loaded click **Fetch online terrain**.` },

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

  { id: 'indoor', title: 'Indoor planning', page: 'indoor', keywords: 'indoor floor plan wall das wifi antenna placement heatmap itu p.1238 multi-wall cost 231 in-building', summary: 'Draw walls on a floor plan, place antennas, and see a multi-wall coverage heatmap.',
    body: `1. Load a floor-plan image (PNG/JPG) and enter the building width and height in metres.
2. Choose a wall material and **drag** on the plan to draw walls.
3. Switch to **Place antenna** and click to place DAS antennas / APs with their EIRP.
4. The heatmap uses the **COST-231 multi-wall model** (free-space loss + loss of every wall crossed). The ITU-R P.1238 site-general estimate is shown for comparison.

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

  { id: 'materials', title: 'Materials list', page: 'materials', keywords: 'materials bom bill of materials quantity brand model coax cable boxes add item import excel export csv auto calculate', summary: 'Bill of materials worked out from the project, plus items you add; editable, with CSV and Excel export.',
    body: `The list fills in by itself from the project. Radio, grounding, solar, fire alarm and ERCES lines follow those design pages. **Auto-design** lines (equipment, cable, boxes, supports) come from the project type and the building size and devices on **Auto-Design & 3D Model**. Change any of those and the list updates. Untick **Calculate equipment and materials from the project** to leave the auto-design lines out.

**+ Add item** adds anything else, typed in or picked from the specifications library; edit or remove your items in the table. Edit any calculated quantity to override it ("(overridden)" shows in the basis). You can also import a parts list from Excel or CSV on **Projects & Storage → Import files** (columns item and qty). Export to CSV here, or to Excel from the Reports page.` },

  { id: 'reports', title: 'Reports, proposals and closeout', page: 'reports', keywords: 'report proposal quote bid price build plan closeout package survey print pdf word excel export html kml sections warranty schedule', summary: 'Proposal, build plan, closeout package, site survey and engineering reports, with sections you pick; print, PDF, Word, Excel.',
    body: `Pick a **Report**: Project proposal, Build plan, Closeout package, Site survey report, or Engineering reports. Each starts with the usual sections ticked; tick or untick any, or open **Add more sections** for the rest (floor plans, device schedule, checklists, inspection contacts, maintenance schedule, documents index, warranty, radio and power reports).

**Proposal options** set the labor rate and hours (estimated from the device count if left blank), materials cost, markup, tax, start date and duration (for the schedule), exclusions and payment terms. They are saved with the project.

**Print / Save as PDF** prints the report (choose "Save as PDF" as the printer). **Word** saves a .doc that opens in Word, LibreOffice and Google Docs. **Excel** saves a workbook with the materials list and every table in the report. **Web page**, **Materials CSV** and **KML** are also there. Drawing sheets for permits are on **Blueprints & Drawing Sets**.` },

  { id: 'testing', title: 'Final testing & commissioning', page: 'testing', keywords: 'test commissioning sweep vswr return loss dtf pim ground resistance fall of potential drive test grid test acceptance', summary: 'Acceptance test checklist with expected values, measured results and pass/fail.',
    body: `Standard acceptance tests: feeder sweeps (return loss / VSWR, distance-to-fault), PIM, insertion loss, ground resistance (fall-of-potential, IEEE 81), bonding continuity, TX power and frequency, azimuth/tilt verification, drive test vs. prediction, ERCES grid test, battery run test and RF exposure survey.

Enter measured values and mark pass/fail; the results print in the Commissioning report.` },

  { id: 'calculators', title: 'Calculators', page: 'calculators', keywords: 'calculator dbm watts microvolt field strength eirp erp wavelength dipole isolation tilt fspl fresnel horizon diffraction hata link budget vswr return loss coax noise floor intermod mpe erlang ohm voltage drop conductor battery solar ground rod guy wire distance bearing conversion awg', summary: 'Stand-alone engineering calculators for RF, antennas, propagation, transmission lines, interference, trunking traffic, electrical power, grounding and units.',
    body: `Type in the search box to filter (for example "vswr", "voltage drop", "erlang").

- **RF levels**: dBm ↔ W ↔ dBW, dBm ↔ µV / dBµV (50 Ω), field strength ↔ received power, EIRP / ERP.
- **Antennas**: wavelength and element lengths, dBd ↔ dBi, gain from beamwidth, antenna isolation for BDAs and co-location, downtilt to a distance.
- **Propagation**: free-space loss, Fresnel zone and 60 % clearance, radio horizon and LOS, knife-edge diffraction (ITU-R P.526), Okumura-Hata / COST-231, point-to-point link budget.
- **Transmission line**: VSWR ↔ return loss ↔ mismatch loss, feeder loss from the cable catalogue.
- **Receivers & interference**: noise floor and sensitivity, intermodulation (3rd and 5th order) against receive frequencies, RF exposure distance.
- **Traffic**: Erlang B channels for trunked systems.
- **Electrical**: Ohm's law, voltage drop (DC, single- and three-phase), conductor sizing, battery bank, solar array.
- **Grounding & structure**: ground rod resistance (Dwight), guy wire length.
- **Location & units**: distance and bearing, DMS, unit and AWG conversions.

Distances and lengths follow **Measurements** on Company & Project: Imperial (ft, in, mi, the default) or Metric (m, mm, km).` },

  { id: 'sync', title: 'Sync between devices', page: 'sync', keywords: 'sync synchronize share bluetooth wifi wi-fi cellular nearby quick share qr code cloud onedrive google drive dropbox merge phone pc tablet', summary: 'Keep the PC, USB, tablet and phone copies of a project in step over Wi-Fi, Bluetooth / Nearby Share, or a cloud-drive folder.',
    body: `Every device keeps a full copy and works offline. Syncing **merges** copies: each part of the project (company, radio design, grounding, etc.) keeps the most recent change from either device, and sites, scenarios, run history, tests, survey points and Wi-Fi readings from both devices are combined. Deleting an item on one device deletes it on the other at the next sync.

**Direct over Wi-Fi** (no internet needed): both devices on the same Wi-Fi or one device's hotspot. Press **Start** on one, scan its QR code with the other, then scan the reply code back. The project goes straight between the devices. When online it can also connect across cellular networks, but some carriers block direct links.

**Bluetooth / Nearby Share / email**: **Share sync file** opens the system share sheet (Android: Bluetooth, Quick Share; Windows: Nearby sharing). On the other device use **Merge a sync file**.

**Cellular (cloud drive)**: on Chrome or Edge for Windows/Mac, choose a folder that OneDrive, Google Drive or Dropbox syncs. Each device writes its own file every minute and merges the others. On Android, save the sync file into the Drive or OneDrive app and merge the other device's file.

No LvPlan server or account is involved; data moves only between your devices or through your own cloud drive.` },

  { id: 'library', title: 'Specifications library', page: 'library', keywords: 'specifications specs datasheet manual service manual technician programming repair parts library equipment catalog low voltage antenna coax cable connector bda das fire alarm battery solar wifi poe cat6 fiber conductor compare import csv', summary: 'Search, compare and add specifications for low-voltage and radio equipment.',
    body: `**Manuals:** pick an item, then under *Service, technician and installation manuals* choose the type and use **Attach file** (PDF, picture, video), **Add link** or **Find … online**. The **Service & technician resources** card holds manuals that aren't tied to one item. All of them open offline and are in backups.

**Manufacturer recommendations:** each item shows the installation, wiring, environment and maintenance points manufacturers in that category commonly state, and your own items can carry the model's exact recommendations (Edit → one per line, from the installation manual).

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
  { id: 'selfrepair', title: 'Updates and self-repair', keywords: 'update automatic repair crash error fix broken damaged restore version recover offline database', summary: 'The app updates itself and repairs damaged data automatically.',
    body: `**Updates:** the app checks for a new version every hour when online. On Windows it installs the update by itself; on Android and the flash drive it shows a one-tap download. The built-in codes, contacts and reference data are updated with each new version.

**Self-repair:** when a project opens, missing or damaged values are filled in with safe defaults. If a page stops working, the app repairs the project data and opens it again; if that does not fix it, it goes back to the last saved version (your newer work is kept in Projects → History). After an update, it reloads itself to pick up the new program files.

**Offline database:** projects, history, terrain, your specifications library, saved datasheets, contacts and web links are all kept in a database inside the app and work with no internet. **Back up all projects** saves all of it in one file.` },
  { id: 'fieldnotes', title: 'Field notes', page: 'fieldnotes', keywords: 'field notes photos camera gps site visit punch list follow-up dictate', summary: 'Notes, photos and GPS positions taken on site, saved in the project.',
    body: `Press **+ New note**, type (or dictate with the microphone on your phone keyboard), add photos from the camera and press **Save my GPS position**. Link a note to a site and tick **Needs follow-up** for punch-list items; filter with **Open follow-ups**.

Photos are reduced to 1280 pixels so projects stay small enough to sync. Notes sync between devices like the rest of the project, export to CSV, and print in **Reports → Field Notes & Photos**.` },

  { id: 'directions', title: 'Map & directions', page: 'directions', keywords: 'map directions route drive navigate google apple waze gps address location office', summary: 'The project site on a map, with one-tap driving directions from where you are or from your office.',
    body: `Shows the **project site address** from Company & Project at Site A's position, with the client contact for the crew.

- **Directions:** Google Maps, Apple Maps or Waze open with turn-by-turn directions from where you are now. **From your office** uses your company street address.
- **Show me on the map** adds your current position and the straight-line distance and direction to the site.
- **Copy address / Copy GPS** to paste into a text or another app.
- Offline, the map uses saved tiles; directions need internet.` },
  { id: 'projects', title: 'Projects & built-in storage', page: 'projects', keywords: 'save open project library storage autosave history version restore backup data folder usb flash drive offline delete duplicate copy reuse template similar previous project based on', summary: 'Every project is saved automatically inside the app, with history, terrain and backups. No internet or account needed.',
    body: `LvPlan keeps a **project library inside the app**. Each change saves automatically within a second; the chip in the top bar shows **✓ Saved**.

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
