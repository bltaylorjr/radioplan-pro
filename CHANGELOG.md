# LvPlan Pro 1.5.66

- **Sharper maps on iPhone and other high-resolution screens.** The flat map now builds each map square from the four more-detailed squares under it, so roads, contour lines, labels and satellite pictures are crisp instead of soft. If those aren't saved (offline), it shows the normal map as before.
- **Zoom in closer**: every map picture can now zoom to level 20. Past a picture's most detailed level it enlarges the last one instead of stopping.
- **Sharper 3D tilt view**: the satellite picture over the 3D ground uses up to 4 times more detail (high-res satellite up to level 18, up to 4096 × 4096 pixels), and the ground uses more terrain detail. Offline, any square not saved at full detail is filled from a saved less-detailed one, not left as plain height colors.

# LvPlan Pro 1.5.65

- **RadioReference app key moved to User Settings.** The login page now asks only for your username and password. The app key has its own card in **User Settings → RadioReference app key**, with a warning not to change it: **Change…** asks first, and the key is shown hidden (last 4 characters) unless you tap Show.
- A key you already saved is moved there automatically; nothing to type again. Log out and Log out and delete downloads both keep the key.
- If no key is set yet, the login page and the RadioReference page have a button that opens User Settings.
- **Terrain and towers download by themselves.** The 🌐 Download terrain button on 3D Model is gone because there is nothing to download by hand any more. Whenever the app is online it fetches, in the background:
  - the terrain for the whole area around your sites (as before),
  - **extra-detailed terrain along the radio link** (down to about 8 m, what the old button gave you), and
  - the **existing towers and comm sites** (OpenStreetMap) for the area.
  All of it is saved on the device, so it is there offline too. A failed download tries again by itself (15 s, 30 s, 1 min… then every 5 min) and right away when the device comes back online.
- **3D Model** shows the sharpest terrain it has. When both are ready, **Link detail** and **Whole area** switch between the detailed path and everything around your sites.
- **Path profile, ground elevation on Site Data and the FAA height check** also use the detailed link terrain when the point is inside it.
- A terrain file you import yourself is never replaced. Turn it all off under Offline maps → Automatic terrain.

# LvPlan Pro 1.5.64

- **Layers, zoom and tilt on full page maps.** Open any map or 3D view with ⛶ Full page and you get big buttons made for fingers:
  - **🗂 Layers** (top right): pick the map picture (USGS topo, satellite, streets and more) and switch each layer on or off: sites and radio path, coverage heat map (with a strength slider), the page's own drawings, terrain area, existing towers, FCC registered towers and photo survey spots. On the 3D tilt view it lists line of sight, Fresnel zone, what point A can see, towers, drawn lines, signal heat map and height boost. On 2D & 3D Models and the campus site plan it holds the full layer list for every system.
  - **＋ / −** zoom, **⤢** shows everything. On the flat map **⛰ Tilt** opens the 3D tilt view of the same area.
  - In every 3D view (terrain, building, indoor walls, layered models): **⤒ ⤓** tilt, **⟲ ⟳** turn, **N** puts north at the top looking straight down. Hold a button to keep zooming, tilting or turning.
- Works offline like the rest of the app; nothing new to download.
- **Introduction video**: a new part shows Layers, zoom and tilt on full page maps.

# LvPlan Pro 1.5.63

- **💲 Prices on the Materials list** (now called Materials List & Estimate): type a unit cost on any line and the line total, the category totals and the materials subtotal fill in. Prices you type are saved to your price list on this device and fill in the same item on your next project. Lines without a price are counted so nothing is missed.
- **Change, add and remove any line**: ✎ changes the item, brand / model, part number, unit, vendor or price of any line, including calculated ones (Put back the design values undoes it). ✕ removes a line; calculated lines go under Removed lines and can be put back. ✕ Remove selected removes several at once.
- **🔎 Search online**: tick lines or Select all, then search Google Shopping, Google, Amazon, Octopart, Digi-Key, Mouser or your own vendors' sites. Uses the part number when there is one. Needs the internet; the rest of the page works offline.
- **🏪 Vendors** (new page after the Materials list): your suppliers with name, sales rep, phone, email, website, address, account number, payment terms and notes, plus **+ Add field** for anything else (field names are offered on the other vendors). Saved on this device for every project and included in backups. Pick a vendor for each materials line.
- **Stock and price checks (optional)**: if a vendor gives you a stock or price address (an API or lookup link) and key, the Materials list shows their stock and price, with ↻ to check again and Use $… to take their price. Turn on Check stock by itself to check when the page opens (once every 12 hours, only online). Sites that do not let apps ask simply show a plain message.
- **Labor costs**: lines of people × hours × rate, or **Suggest labor from the materials** for a starting estimate you can change.
- **Estimate and budget**: sales tax, shipping, contingency, overhead and profit, and materials, labor and project budgets. **Anything over budget shows in red** with how much it is over; under budget shows what is left. The PDF and CSV exports include part numbers, vendors, prices and the estimate, and the proposal on Reports uses these totals when its own boxes are blank.
- **Introduction video**: a new part shows prices, vendors, online search, labor and the budget.

# LvPlan Pro 1.5.62

- **Fixed: "This page could not open – Importing a module script failed"** (seen on iPhone on Map & Terrain). It happened when a new version was published while the app was open: the open copy asked for page files that no longer exist on the website. Now the app tries again, and if the files have changed it reloads itself once into the new version and opens the page. The offline copy also keeps the previous version's files, so an open app keeps working during an update.
- A page that cannot download no longer starts the project-repair steps (the project was never the problem). Offline, it says to connect once to save that page.

# LvPlan Pro 1.5.61

- **🏫 Multi-Building Site & Campus** (new page after 2D & 3D Models): plan a whole site with more than one building. The main building comes from Auto-Design; add outbuildings, a gym, a guard house or a parking deck, each with its own type, size, floors and outside walls.
- **Site plan in 2D and 3D**: every building to scale on one site plan with all its system layers, plus a layer for each building so you can show or hide one. Drag a building's ✥ handle to move it; turn it with the Turn box.
- **Links between buildings**: underground or aerial fiber, underground copper, empty conduit, or a wireless bridge. The app works out the route length, cable length with slack, handholes every 300 ft, poles every 150 ft for aerial, and for wireless the signal margin and whether another building blocks the path (60% Fresnel clearance).
- **Outdoor signal heat map** for the whole site, using each building's outside walls.
- **Cable schedule** and **site materials list** (cable, conduit, handholes, poles, fiber enclosures, entrance protectors, wireless radios), with CSV download and **Add to Materials list**. **CAD drawing (DXF)** of the whole site.
- **Introduction video**: a new part shows the site and campus package.

# LvPlan Pro 1.5.60

- **Starts about twice as fast.** Each page now loads the first time you open it instead of all at start, so the app downloads 427 KB instead of 922 KB before it is ready (online version, slow phone connection: about 2.7 s instead of 5.6 s) and uses a third less memory.
- **The online version works with no internet.** After the first visit the whole app, every page and the FCC, airport and terrain data are saved in the browser, so it opens and works offline. You can also add it to the phone's home screen like an app.
- **Coverage maps are up to 3 times faster** and the screen no longer freezes while they are worked out: the math was tightened and the map is split across the device's processor cores. The button shows the percent done. Same results as before. Multi-site & interference and the heat map on drawn lines use the same helpers.
- **Typing stays quick in big projects with many photos.** Only the part of the project you change is copied, and autosave turns the project into text once instead of three times.
- Program updates download less: the map, 3D and screen libraries are kept in their own files, which stay the same between versions.

# LvPlan Pro 1.5.59

- **📱 How to take a panorama correctly** on the Photo Site Survey page: six short steps (turn on location and the compass, stand still and turn on the spot, phone level at eye height with the horizon in every picture, overlap each photo about a third, do not zoom, and use 📷 Take photos here if your photos lose their location) with a **▶ Play** button for a one minute narrated video with captions. The video is inside the app, so it plays offline.

# LvPlan Pro 1.5.58

- **🧊 2D & 3D Models with Layers** (new page after Auto-Design): a true-scale 2D plan and a 3D model of the building with layers you turn on and off, for every system on the job.
- **Layers for every system**: devices with tags; coverage (smoke detector circles, strobe areas, speaker circles at ear height, camera and motion-sensor views that stop at walls, controlled doors); cable runs and circuits (home runs, fire alarm SLC loop and NAC circuits, 70 V speaker zones, nurse call bus, fiber backbone and riser, DAS coax and donor cable, conduit to outdoor call boxes and cameras); and signal heat maps (Wi-Fi and DAS / public-safety radio, worked out through the walls and floors you picked). Building layers: floors, walls by material, stairs and elevator, labels, dimensions and north arrow, site and parking, and the donor antenna aim from the ERCES page. **Only this** shows one system; tap anything to see what it is.
- **3D model**: floors stacked to scale; **Pull floors apart** to look inside; drag to turn, pinch to zoom; pick one floor or all. **Save picture** and **CAD drawing (DXF)** with the same layers.
- **Building materials for you to pick**: outside walls, windows (and how much of the wall is glass), corridor and room walls, doors, floors, roof, ceiling, floor finish, stairwells, elevator shaft and floors below ground (concrete, block, brick, tilt-up, metal panel, metal stud and drywall, wood, clear / low-E / fire-rated glass, metal deck, hollow-core, post-tensioned slab, earth and more). Every building type starts with typical materials; **Use typical** puts them back.
- **Materials change the results**: radio loss by band (VHF, UHF, 700/800, cellular, Wi-Fi 2.4 and 5 GHz), outside-to-inside signal loss, echo (reverberation) with speaker spacing advice, fire ratings for shafts, corridors and floors, firestop penetration estimate, plenum or riser cable jacket, and which walls cameras and motion sensors can see through.
- **Compare a scenario**: steel and low-E glass, wood frame, tilt-up warehouse, metal building, block walls, glass curtain wall, a basement level, soft or hard finishes. See the differences side by side, then **Use this scenario** if you want it.
- **Auto-Design** now shows the same layered 2D / 3D view.
- **Introduction video**: a new part shows the layered models and building materials.
# LvPlan Pro 1.5.57

- **Everything updates itself when online.** Besides the app itself, LvPlan Pro now downloads newer **code editions and state rules, city and county code lists, contacts and web links, the equipment catalog, manufacturer recommendations, the help manual and the magnetic model** from the LvPlan Pro website as soon as they are published, with no app update needed (this matters most on Android and the flash drive). Each download is checked (SHA-256, and that it is laid out the way this version of the app understands) before it is used, and a spare copy is kept. A short notice says when code information changed.
- **Maps around every project stay fresh.** The topo map the app saves around your sites is now kept complete and downloaded fresh twice a year, like areas you save yourself.
- **Saved datasheets stay current.** Datasheets saved from a manufacturer link are downloaded again twice a year; a download that is not a real document never replaces the saved one. An empty or unreadable one is downloaded again by itself.
- **Safe start.** If the app did not finish starting last time, it starts once with only its built-in data.
- **Introduction video**: the Automatic care part now covers online updates for codes and other data.
# LvPlan Pro 1.5.56

- **Low-voltage equipment for every system** in the Specifications Library, with **access control** in depth: door controllers (Mercury, Software House iSTAR Ultra, LenelS2), interface boards, card readers (HID Signo), credentials (Seos, DESFire), maglocks, electric strikes, latch retraction, wireless locks, access power controllers (Altronix), request-to-exit and door position switches. Also fire alarm panels and devices, CCTV, intercom, nurse call, paging and sound, a new **Mass notification** category, emergency call boxes, DAS and cabling and fiber.
- **⚠ Legacy equipment section**: 60+ older and discontinued models still found on service calls, each filed under its system (fire alarm, intrusion, CCTV, access control, intercom, nurse call, paging, mass notification, call boxes, ERCES / DAS, radios, coax, cabling, fiber, network and Wi-Fi). Each shows its status, the years it was common, suggested current replacements, service and repair notes, and links to the manufacturer's documentation pages (each opened on the maker's site). Attach the manual or datasheet to keep it on the device.
- **Legacy models in the selection lists**, marked ⚠ Legacy: radios (Equipment and link budget), antennas, feeders (including RG-213 and air-dielectric HELIAX), the coax calculator, the materials picker and the troubleshooting wizard, which also shows the legacy service notes.
- **Recalls and service bulletins**: official CPSC recalls for fire alarm, security and related equipment are built in (affected models, date codes, problem, remedy and a link to the official notice), and new ones download automatically about once a week when online (Automatic care). Add a manufacturer service bulletin to any model. **When equipment in a project matches a recall or bulletin, an alert shows on every page of that project** until it is marked checked for that project.
- **Introduction video**: a new part shows the access control equipment, the Legacy equipment section and recall alerts.

# LvPlan Pro 1.5.55

- **ⓘ beside every value.** Point at it on a computer, or tap it on a phone or tablet, to see what the value means in plain words, its unit, the typical range, the allowed range, and the industry-standard default with its source (for example NFPA 72 10.6.7.2.1 for 24 h fire alarm standby, NEC 250.52 for an 8 ft ground rod, IFC 510 for −95 dBm and 12 h ERCES battery, TIA TSB-88 for 8 dB shadow fading).
- **Use default** puts the industry default straight into the box. If the box already has it, you see ✓.
- About 140 project fields and calculator inputs have their own explanation; every calculator input offers that calculator's standard value as its default.
- **Introduction video**: a new part shows the ⓘ info and Use default.

# LvPlan Pro 1.5.54

- **Menu in project order.** Every tool and step now follows the project lifecycle: **1 Project setup**, **2 Site survey**, **3 Design: low-voltage systems**, **4 Design: radio & antennas** (RadioReference frequencies first, then equipment, path, coverage and aiming), **5 Codes, permits & drawings**, **6 Equipment & materials** (Specifications Library, Materials List), **7 Installation**, **8 Testing & commissioning**, **9 Service, troubleshooting & repair**, and **10 Reports & closeout**. **Tools & reference** (Calculators, Low-Voltage Principles, Contacts, Map & Directions) and **Projects & settings** (Projects, Sync Devices, User Settings) are at the bottom and open any time. Next / Previous, step numbers, the custom-project page picker and User Settings all follow the same order, and tools turned off in User Settings stay out of the menu and Find a tool.
- **Folding sections**: tap a section heading to fold it up; the section you are in always stays open, and the menu keeps the page you are on in view.
- **The help manual lists its topics in the same order as the menu.**
- **🔎 Find a tool** at the top of the menu. Type a word, like “azimuth”, “relay”, “battery”, “clear” or “log in”, and tap a result to open the page, the help topic, or a tool. Tools marked ▶ open their page and point at the button.
- **★ What's new** (under Help manual in the menu): every newer tool with where to find it, a few steps, and **▶ Show me**, which opens the page and points at each button in turn. It covers RadioReference log in, downloads and progress, the 3D tilt view and relay points, azimuth everywhere and the map measure tool, donor antenna aiming, drawing lines, Clear all fields, Delete with “Are you sure?”, the true-scale side view and 3D beam, the azimuth calculator, calculator Reset / Use project values / Apply to fields, Automatic care, and Full page view.
- **Page help lists the tools on that page**, each with **▶ Show me**. The help manual search also finds tools.
- **▶ Guide me on every page.** Pages that had no walkthrough now have one, and Map & Terrain and Path Profile walk through the newer buttons (the walkthrough can open the 3D tilt view for you). Walkthroughs find buttons by their words and wait for the page to finish loading, and the bubble always stays on screen.
- **Using the menu**: a new help page lists every section and page.
- Newer pages have their place in the order: Photo Site Survey and Live Signal Readings under Site survey, FCC Towers & Licenses under Design: radio & antennas, FAA Height Check under Codes, permits & drawings, Equipment & Asset Tags under Service, troubleshooting & repair, and Offline Map Packs and Bluetooth & Wi-Fi Devices under Tools & reference.
- Help text lists and paragraphs now show correctly when they are mixed in one section.
- **Introduction video**: the old "How it is organized" card is replaced by a part that shows the new menu order, Find a tool, What's new with Show me, and Page help and Guide me.

# LvPlan Pro 1.5.53

- **📶 Live Signal Readings** (new page, after Drive Test). Read a signal meter over **Bluetooth**, a **USB / COM** cable, or **Wi-Fi**, or use the phone's own **cell or Wi-Fi signal** (Android app), or just type what your meter shows. A big live number, **📍 Save this reading** or save automatically every few seconds as you walk. Each reading keeps its GPS position and time.
- **Import readings** from G-NetTrack, Network Cell Info, WiGLE, cell-logger and Wi-Fi survey apps and meter software (CSV / TSV, GeoJSON, KML, GPX; dBµV changed to dBm).
- **Compare with the prediction**: measured minus predicted at each spot, in plain words ("readings match the prediction well"), with average, spread and the share within ±6 dB. One tap sends the readings to calibration. Map coloured by measured signal, by difference, or a **heat map** of the readings.
- **ERCES / BDA grid test**: indoor readings by floor and room, critical areas ticked, pass or fail at −95 dBm (90% general, 99% critical) per floor, and one tap puts the results on the ERCES / BDA page.
- **🏷 Equipment & Asset Tags** (new page in Tools). **📷 Scan** any barcode or QR code with the camera (or a photo, or a handheld scanner). A known tag opens the device; a new one starts it. Keep what it is, system, make, model, serial, location, floor, GPS, photos, install date, warranty, PM interval and the full service history. PM overdue / due soon, ✔ PM and 🛠 Fixed buttons, a summary per system for service and PM contracts, print QR labels and the equipment list, export CSV / Excel, import an owner's list. The list prints in the Closeout package.
- **🔵 Bluetooth & Wi-Fi Devices** (new page in Tools). Connect once, used on every page: **signal meters**, **GPS receivers** (every GPS button and the map then use it, RTK accuracy included), **laser distance meters** (the measurement goes into the box you tap, in feet or meters) and **barcode scanners**. A chip at the top shows what is connected. Printers, cameras, cable and fiber testers: how to use them with the app.
- Reports: new **Live Signal Readings** and **Equipment list** sections (Closeout, Site survey and Engineering packages).
- Introduction video: a new part shows live readings, asset tags and connecting devices.

# LvPlan Pro 1.5.52

- **📷 Photo Site Survey (new page under 2 · Planning: site survey).** Stand where an antenna or tower might go and tap **📷 Take photos here** (several views all the way around, or one panorama), or **🖼 Add photos or a panorama** you already took. Photos taken at the same spot (within 100 ft) go together.
- **Placed by the photo's GPS and compass.** The app reads the GPS position, height and compass direction saved in each photo (magnetic directions are turned to degrees true), the lens width, phone panorama tags and drone gimbal tags. Taking photos in the app also uses the phone's own GPS and compass when the photo has none. Missing position: **◎ My GPS**, type coordinates, or tap the map.
- **⛰ Line up with the terrain.** The app finds the skyline in each photo and turns the photo until it sits on the terrain horizon worked out from the terrain heights, so photos with no compass direction are placed too (tested on sample photos near Asheville: within 1°). Nudge any photo with **◀ ▶**, type its direction or a hand-compass reading, or change its tilt and width of view.
- **Panorama with layers you tick on or off:** Photos, Terrain horizon (yellow), Azimuth & compass (°T and °M across the top), Project sites, Existing towers, RadioReference sites (only while logged in; never in reports), What blocks the view (red ✕ on the ridge that hides a site), Drawn lines, Signal heat map (predicted signal on the ground you can see) and Photo edges. Hover or tap to read direction and up / down angle. **Fit more / Normal / Close up** zoom.
- **What is in view from here:** every site and nearby tower with distance, azimuth, up / down angle and whether the terrain hides it.
- **On every map and in 3D:** survey spots show with a 📷 pin and a see-through view cone per photo on the flat maps (layer **📷 Photo survey spots**) and as camera posts with view fans in the **⛰ 3D tilt view** over the satellite pictures.
- **Reports:** **📄 Save picture for reports** puts the panorama with its overlays and the in-view list in the new **Photo site survey** section (in the Site survey report and the Engineering report).
- Works offline with saved terrain. Trees and buildings are not in the terrain, so the real skyline can be higher; the app does not build 3D models of buildings from photos. **Clear all fields** on the page removes the survey spots (with Undo).
- **Introduction video:** a new part shows the photo site survey.


# LvPlan Pro 1.5.51

- **🗼 FCC Towers & Licenses** (new page, works offline). Pick a project site, an address or your GPS and see every FCC-registered tower and licensed transmitter nearby: owner, height above ground, distance and azimuth, and **who is on each tower and on what frequencies** (licensee and phone, radio service, station class, power, analog or digital). Narrow it by band (VHF, UHF, 700, 800, 900, microwave), by kind of user (public safety, business, commercial, microwave, paging) or by name, call sign or frequency. A county tab lists county-wide mobile licenses. **+ Add as site**, **Use as donor** (ERCES) and **FAA check** on every tower, **⬇ CSV** to save the list. The FCC public data for NC, SC, GA, TN and VA (22,710 registered towers, 48,841 active licenses) is built into the app and updates with each app update. A new **🗼 FCC registered towers** map layer shows them on every map, and Site Data & GPS lists them under Existing towers nearby.
- **✈ FAA Height Check** (new page, works offline). Type the overall height; the ground height fills in. The app applies 14 CFR 77.9 to every airport and heliport nearby (FAA airport data built in) and shows **Needed / Not needed / Check**, the **tallest structure without notice** at that spot, and each airport's distance, rule and your margin. Links to the FAA Notice Criteria Tool, OE/AAA and TOWAIR. **✈ Fill from FAA data** on Site Data & GPS fills the nearest public airport for the code checks.
- **FCC Class B booster registration** (Emergency Radio page). Fills in the registration from the project (operator from the client, location, booster make, model and FCC ID, passbands), checks the **5 W ERP per channel** limit, finds the **public-safety licensees** whose channels are in the passbands, writes each **consent request letter**, tracks when consent comes back, and copies everything ready to paste into the FCC site.
- **⬇ Offline map packs** (new Tools page, also on Map & Terrain). Choose an area around your sites or an address or GPS point, pick the detail and what to save (satellite pictures, topo, shaded relief, terrain), see the size and free space first, then download with percent, MB and time left. It keeps going on other pages (a badge at the top shows progress). Saved packs can be finished, updated, verified or deleted, and Automatic care keeps them filled in and fresh. With no signal, terrain now uses the most detailed saved level.
- **Introduction video**: a new part shows the FCC towers and licenses, the FAA height check, booster registration and map packs.
# LvPlan Pro 1.5.50

- **↺ Reset project** and **🗑 Delete project** at the top of the main page (Company & Project).
- **Reset project** clears every entry on every page of the open project (project and client information, sites, designs, field notes and photos, tests, materials, checklists, drawings, pricing) and keeps it as a blank project. Your measurement setting and saved company default stay.
- **Delete project** removes the open project from this device with its history and terrain, and its copy in the data folder (flash drive); the most recent other project opens, or a new blank one.
- Both ask **Are you sure?** first (Reset / Delete and Cancel), and **↶ Undo** right after puts the project back. A copy from before a reset is also kept in Projects → History.
- **Introduction video**: a new part shows Reset project, Delete project and Undo.

# LvPlan Pro 1.5.49

- **⚙ User Settings page** (Tools menu): a check box for every tool. Untick the ones you do not use and they leave the menu, step numbers and Next / Previous. Nothing is deleted; tick a tool to bring it back. **Show every tool** and **Only what this project needs** buttons.
- **Tools follow the project type.** When you pick a project type or add a sub-project, any tool that job needs is turned back on, the tools it does not use are hidden (you can turn this off), and a notice lists exactly what was turned on and hidden.
- **Fields the job does not use are hidden.** On Site Data & GPS, tower, antenna, airport and radio-horizon fields only show for radio, DAS, ERCES, call box, Wi-Fi and solar jobs (a **Show them** button brings them back; nothing is deleted).
- **Wrong entries are explained.** Every number box checks what you type. If it is out of range, the box turns red, a message says what is wrong (for example "Waste must be between 0 and 50 %. You typed 500 %.") and suggests a fix, with a **Use …** button for the likely value (a slipped decimal point, the wrong unit or a missing minus sign). The last good value is kept until it is fixed.
- **Blank is never zero.** Calculators ask for empty boxes ("Fill in One-way length to see the result") instead of using 0, optional boxes are skipped, and blank rows in fire alarm device and solar load lists are skipped instead of breaking the totals.
- **Cross-checks** between related values, for example a cable wider than the conduit, device minimum voltage above the supply, alarm current below standby current, ear height above the ceiling, a fill speaker farther than the main speaker, or more call time than there is in a day.
- **Check my data** (User Settings): goes through the whole project and lists every empty, out-of-range or mismatched entry, with a **Fix on …** button to the right page. It catches, for example, a longitude missing its minus sign, an antenna above the top of its tower, a deleted transmit site, or fire alarm standby under 24 h.
- **Verified calculations.** New automated tests check calculator results against hand-worked reference values. This found and fixed one error: the low-voltage wire drop, 70 V line and speaker-wire calculators used 20 °C copper resistance while saying NEC Chapter 9 Table 8 (75 °C), so they under-stated voltage drop by about 18%. They now use the same NEC values as the Fire Alarm page.
- **Introduction video**: a new part shows User Settings, the tool notice and the entry checks.

# LvPlan Pro 1.5.48

- **🔧 Automatic care: the app looks after itself and its data.** Nothing to set up. A new **Automatic care** card on **Projects** shows what it keeps checked and when, with **Check everything now**.
- **Checks and repairs saved data by itself.** Each saved project now carries a SHA-256 checksum. A damaged project is put back from its last good version, damaged terrain and map tiles are removed and downloaded again, and a damaged RadioReference list is put back from its encrypted spare copy. A short plain notice tells you when something was fixed.
- **Keeps downloaded data current when online.** RadioReference county lists refresh every 30 days (Windows and Android, while logged in; still encrypted, still only on this device). Areas saved for offline maps are kept complete monthly and downloaded fresh twice a year. A new copy replaces the old one only after it passes its check; if a download fails, the old copy stays and it tries again later.
- **Backups before changes.** Each changed project gets a daily backup (the last 7 days are kept apart from autosaves), and a copy goes into History before every app update.
- **Safer updates.** The Windows app checks each update's SHA-256 before installing it. If a new version fails to start 3 times in a row, it goes back to the last version that worked and skips the bad one until a fix comes out. If the app ever stops at start, it shows a Restart button instead of a blank window.
- **For new features:** downloaded packs (FCC, FAA, map packs and others) plug into the same automatic checks, repairs and refreshes.
- **Introduction video**: a new part shows Automatic care, including a damaged project being put back by itself.
# LvPlan Pro 1.5.44

- **🧭 Azimuth calculator** on Calculators: type two GPS positions or addresses (or pick project sites) and get the azimuth from A to B and the back azimuth from B to A, both in degrees true (°T) and as a compass reading (°M) with the declination at each end, the distance in miles, and the up / down tilt at each antenna from the ground and antenna heights (with the earth's curve). Ground heights fill in from the built-in or project terrain, so it works offline; online, **Look up** asks USGS.
- **Every calculator stands on its own.** Calculators start from examples and keep their own numbers: changing the project no longer changes them, and they never change the project by themselves.
- **↺ Reset** on each calculator puts just that one back to its example.
- **⇣ Use project values** copies the matching project numbers into a calculator (frequency, power, heights, k-factor, feeder, alarm values and more), without changing the project.
- **➜ Apply to fields…** puts a calculator's result into the matching fields on other pages: the azimuth and downtilt on Tilt, Azimuth & Power, the donor tower for ERCES / BDA and DAS aiming, transmitter azimuth and tilt on Multi-site, TX power, RX sensitivity, feeder and k-factor, solar, ground rod, fire alarm battery and NAC circuit values. A box lists every field with its value now → the new value, so you can untick any you don't want; **Undo** right after, and a copy is kept in Projects → History.
- **Introduction video**: a new part shows the azimuth calculator, Reset and Apply to fields.

# LvPlan Pro 1.5.43

- **Tilt, Azimuth & Power: side view of the beam over the real ground.** The side view now follows the ground along the antenna's azimuth (terrain and earth curve) and shows where the main beam and the −3 dB edges come down on it, with the ground colored by predicted signal and the far-end site when it is in the beam.
- **True scale or stretched.** Pick **True scale (1 : 1)** to see heights and distances to the same scale, or stretch heights automatically or ×2 to ×50. Scale bars show a distance across and a height up. Pick the distance shown to look close in at the tower.
- **2D or 3D.** **⛰ 3D view** shows the beam as a see-through green wedge over the terrain that stops where it meets the ground, with a tilt slider and an optional signal heat map.
- **True scale on every side view and 3D view**: Path Profile, the chart under drawn lines, the ground profile of runs between sites, the 3D tilt view and the 3D terrain model. Path Profile heights are now in feet (or metres when metric is chosen).
- **Introduction video**: a new part shows the side view in 2D and 3D, true scale and stretched.

# LvPlan Pro 1.5.42

- **⌫ Clear all fields on each page.** Every page with boxes to fill in has a **Clear all fields** button at the top, next to **? Page help**. It clears only that page's entries: lists are emptied and numbers go back to their starting values. Pages that only hold typed-in numbers (Calculators, Troubleshooting Wizard, Find Location) start over too.
- **Asks first**: a Yes / No box says exactly what will be cleared on that page. Other pages, saved projects, the RadioReference login and downloads, the specifications library and contacts are never touched.
- **↶ Undo** right after clearing puts the page back, and a copy from before is saved in Projects → History of this project.
- Pages with nothing to type in (RadioReference, 3D Model, Map & Directions, Service, Library, Contacts, Projects, Sync) have no button. On a page that is already empty the button says "Nothing to clear".
- **Delete works everywhere, with an "Are you sure?" box.** Deleting attached files (Projects & Storage, Reports), field notes, saved datasheets and manuals, library items, contacts, RadioReference saved lists, Wi-Fi readings, survey points, indoor walls and checklist ticks did nothing in the Windows app, because it used a browser pop-up the app does not show. Every delete now uses the app's own box with **Delete** and **Cancel** buttons, and the other yes / no questions use the same box.
- **Deleted projects stay deleted** when a data folder (flash drive) is used: the project's file in the folder is deleted too, and Update folder no longer loads it back.
- **Introduction video**: a new part shows Clear all fields and Undo.

# LvPlan Pro 1.5.41

- **✏️ Draw lines on any map.** Draw a line by hand with your finger or mouse, or tap points for straight lines, or add the line between the transmit and receive sites, to map out obstacles and signal along a road, trail or cable route.
- **Predictions along each line**: colored by predicted signal from the transmitter and dotted where terrain hides it, with length, azimuth of each piece (true and compass), lowest / average signal, the share that meets the signal needed, the distance hidden, and a chart of ground and signal along the line. Straight two-point lines also get an end-to-end line-of-sight check with the blocking ground marked.
- **Heat map**: shade predicted signal over the area around the lines, on the flat map and on the 3D tilt view, where the drawn lines also show on the ground.
- **Edit**: drag points, add a point from a middle handle, delete a point, smooth a hand-drawn line, rename or delete a line. Lines are saved with the project and work offline.
- **Introduction video**: a new part shows drawing and editing lines, the predictions and the heat map.

# LvPlan Pro 1.5.40

- **RadioReference download progress.** While a county downloads you see a progress bar with the percent done, the step it is on (find county, agencies, frequencies, trunked systems, save), what it is reading right now (for example "Frequencies: Fire · Dispatch, 7 of 12"), running counts of frequencies, lists, trunked systems, sites and talkgroups, the time so far and about how long is left. **Stop download** stops it.
- The download keeps going if you open another page. A **⬇ RadioRef 57%** badge at the top shows how far along it is; tap it to go back. When it finishes, the badge shows ✓ and the page lists what was saved.

# LvPlan Pro 1.5.39

- **Azimuth everywhere a direction matters.** Every azimuth is shown in degrees **true (°T)**, as on maps, GPS and FCC filings, and as a **compass (°M)** reading, with the compass point (NE, SSW…). Magnetic declination comes from the World Magnetic Model WMM2025, built in, so it works offline (about 7° west around Asheville).
- **📏 Measure distance & azimuth** on every map: tap points to see each leg's distance, azimuth and back azimuth. The TX → RX line and each site's popup show the azimuth from the transmitter.
- **3D tilt view**: each hop A → relay → B shows the azimuth to aim at each end, both ways, plus the up / down tilt.
- **Path Profile** and **Equipment & Link Budget**: azimuth and back azimuth TX ↔ RX and the declination. **🎯 Aim at** points the TX antenna at the far end (also on Tilt, Azimuth & Power). Antenna azimuths show the compass reading; Multi-site shows it per transmitter.
- **ERCES / BDA and Indoor & DAS**: new **Donor antenna aiming** card (type the tower's GPS or address, pick a site, or tap **Aim donor here** in the RadioReference donor list).
- **Drive Test**: each reading shows its distance and azimuth from the transmitter, plus a **Readings by direction** table to spot a mis-aimed or blocked sector.
- **Blueprints**: set the plan orientation; the north arrow turns to true north and shows magnetic north. **Calculators**: distance & azimuth with back azimuth, and a true ↔ compass converter. **Reports** print the azimuths. Help has a new **Azimuth, back azimuth & compass** topic.
- **Introduction video**: a new part right after the 3D tilt view shows azimuth on the Path page, the map measure tool, the 3D tilt hops, ERCES donor aiming and the calculators.

# LvPlan Pro 1.5.38

- **Introduction video updated.** A new part right after Map & Terrain shows the 3D tilt view: satellite pictures on 3D terrain, the tilt slider, plotting point A and point B by GPS coordinates or address, line of sight with the blocked spots marked, a suggested relay point, and shading of ground point A cannot see.

# LvPlan Pro 1.5.37

- **3D tilt view on every map.** Tap **⛰ 3D tilt view** above any map to see the area as a 3D model with satellite pictures on top (or the topo map, or height colors). A **Tilt** slider and **Straight down / Tilted / Low angle** buttons, plus a height boost slider. **🗺 Flat map** goes back.
- **Line of sight and obstructions.** Plot **point A**, **point B** and any **relay points** to bounce the signal around hills. Each point can be GPS coordinates, an address, your device's GPS, or a tap on the 3D view. Each hop shows green (clear), orange (Fresnel zone crowded) or red (blocked), with red posts on the ground that blocks it and how far it rises above the beam. **Suggest a relay spot** finds a spot that sees both ends. **What point A can see** shades hidden ground red.
- **Works offline.** Terrain for the Asheville area is built into the app. Elsewhere, terrain and pictures saved while online keep working offline; any missing picture tiles show height colors instead.

# LvPlan Pro 1.5.36

- **RadioReference login page.** Log in with your RadioReference username and password (the app key is entered once and remembered). Tick **Stay logged in** to stay logged in on this device until you tap **Log out**. Untick it to be logged out when the app closes.
- **Log out** removes your username and password from the device. Downloaded frequencies stay on the device, encrypted, but they are hidden everywhere (RadioReference page, ERCES card and frequency pickers) until you log in again. **Log out and delete downloads** removes them as well.
- Logging in while offline is checked against your last good login, using a salted hash; the password itself is not kept.

# LvPlan Pro 1.5.35

- **RadioReference Frequencies** (new page under Planning: radio & RF). Sign in once with your RadioReference Premium username, password and app key. While online, download a county's frequencies, agencies, trunked systems, tower sites and talkgroups (optionally statewide agencies and systems too). After that it all works offline. Search, or show only public-safety channels.
- **Protected information:** frequencies, talkgroups and your RadioReference sign-in are stored only on this device, encrypted (AES-256 with a device key that can't be copied out). They are never in project files, backups, reports, exports or Sync Devices. "Remove sign-in and downloads" erases them.
- **Used in design and calculations:** the Emergency Radio (ERCES / BDA) page lists the bands the BDA must pass (with Class A / Class B advice), the highest frequency to pass (one tap sets it for Indoor Coverage & DAS or the link budget), and the nearest trunked tower sites with distance, bearing and an estimated donor signal (one tap puts it in "Donor signal at roof", or adds the tower as a site). Equipment & Link Budget and Indoor Coverage & DAS have a RadioReference frequency picker.
- The Windows and Android apps download straight from RadioReference. The online and flash-drive versions can import a CSV file saved from RadioReference.com instead (browsers can't contact RadioReference directly).

# LvPlan Pro 1.5.34

- Introduction video: the narration and title card now name all five states (NC, SC, GA, TN and VA), and the map scene shows the **⛶ Full page** button and **✕ Close**.

# LvPlan Pro 1.5.33

- **Full page view** for maps, 3D views and diagrams: press **⛶ Full page** above any map, 3D model, drawing sheet, floor plan, wiring or theory diagram, or profile chart to show it on its own full screen, with a big **✕ Close** button (Esc also closes). Maps and 3D views keep their position and zoom.
- **Virginia added.** Pick Virginia as the project state, or type a Virginia address, town or ZIP code, and the app fills in the county or independent city by itself (works offline: all 95 counties, 38 independent cities and Virginia ZIP codes are built in).
- Codes for Virginia: the 2021 Virginia Uniform Statewide Building Code (Virginia Construction Code, 2021 IBC/IRC base) and the 2021 Statewide Fire Prevention Code, effective Jan 18, 2024, with the 2020 NEC. The USBC overrides local building codes (Va. Code 36-98), so the app says so instead of listing local amendments. The 2024 Virginia codes are still being written and have no effective date yet.
- Contacts: DHCD State Building Codes Office, the Virginia State Fire Marshal's Office and the DPOR Board for Contractors, copied from their own pages. The Library has a Virginia licensing entry (Class A/B/C, ELE with the ESC and FAS specialties).
- Not yet checked on an official page: DCJS private security registration for alarm and electronic security work (the DCJS site would not load), and the ICC A117.1 and IEBC editions Virginia uses. The app marks these "confirm".

# LvPlan Pro 1.5.32

- The introduction video opens and plays by itself the first time the app is opened on a device (once only; the ▶ Video button plays it again any time). If the device will not start it with sound, a big **🔊 Tap to turn on the sound** button shows. **Skip the video** goes straight to the welcome screen.

# LvPlan Pro 1.5.31

- **3D walls** on Indoor Coverage & DAS: press **🧊 3D walls** to see the walls you drew stand up in their material colour, with the coverage heat map on the floor and the antennas on the ceiling. Drag to turn, scroll to zoom; **🗺 2D plan** goes back to drawing.
- **Existing towers on the 3D terrain model**: towers, masts and comm sites already mapped in OpenStreetMap stand up as purple masts, labeled with their name and height, so you can plan around them or look for a place to co-locate. Turn it on or off with **Existing towers (labeled)**. Areas you have viewed stay saved for offline use. Check the FCC Antenna Structure Registration database and the owner before relying on one.
- Introduction video: the room scene now draws walls, places antennas, shows the heat map and then the 3D walls; the 3D Model scene shows the labeled existing towers.

# LvPlan Pro 1.5.30

- Fix: the **📡 Existing towers & comm sites** map layer stays on when you move between pages (leaving a page with a map used to switch it off).
- Introduction video: tower labels now show on the Map & Terrain scene.

# LvPlan Pro 1.5.29

- Introduction video: the map zooms in to show the tower labels, the drawing set shows the floor plan sheets, and the demo project is a fire alarm job with paging, access control and CCTV, so the 3D model, plans and materials are filled in.

# LvPlan Pro 1.5.28

- **Runs between sites, measured over the ground** (Site Data & GPS): plan fiber, Cat 6, coax, power or conduit between two sites, click bend points along the route on the map, and press **Measure over the ground**. The app uses the terrain to work out the map length, the length over the ground, climb, drop and the steepest grade, with a ground profile. From that it works out trench, conduit, sweeps, handholes, warning tape, cable with slack, strand and poles for aerial runs, and crew-hours. Measured runs go into the **Materials** list and the labor estimate on **Reports**. Warnings for steep ground, Cat 6 over 328 ft, multimode distance limits and copper between buildings.
- **Existing towers nearby** (Site Data & GPS): the nearest mapped towers and comm sites to the selected site, with distance, bearing and height, to look at co-location first.
- **Sound and audio tools** (Calculators): a sound level meter on the device microphone (A-weighted, average, min and max, with calibration), a test signal generator (tones, pink noise, sweep), and calculators for amplifier sizing, speaker wire length, room reverberation (RT60), speech intelligibility (STI / %ALcons), outdoor horn reach, adding sound levels, fill-speaker delay, low-impedance speaker loads and audio level conversion.
- **Codes, training & licensing** in the Specifications Library and on Contacts & Web Resources: NFPA, BICSI, TIA, UL, NICET, ESA, ICC, the AHJ, the NC, SC, GA and TN licensing boards, FOA, ETA, AVIXA, ASIS, SIA, IEEE and ANSI: what each covers, key documents, training, credentials, and their official web pages (checked on the official sites). Readable offline.
- **Low-Voltage Principles** (Tools): a reading guide from basic electrical theory to advanced design and troubleshooting, in 5 parts with a clickable index, Basic / Intermediate / Advanced filters, search, diagrams (Ohm's law, series and parallel, Class A and B, a riser diagram and a blueprint floor plan, plus the wiring diagrams), and the matching calculators under each section.
- Introduction video: text-only captions (no dark box over the page), and new scenes: tower labels on the map, a run measured over the terrain, the coverage heat map, the 3D views, a site photo in Field Notes, the drawing sets, the sound tools, the library references and the new principles page.

# LvPlan Pro 1.5.27

- **Existing towers & comm sites map layer**: on any map, open the layers button and tick **📡 Existing towers & comm sites** to show towers, masts, antennas, telecom sites and other communications equipment with labels (name / operator and height). Tap one for its type, operator, height, use and FCC ASR number when known. Data from OpenStreetMap, saved per area so it works offline afterwards; verify against the FCC ASR database.
- Introduction video updated to show the new layer, with a livelier narrator and a broadcast-style finish on the voice so it sits with the music.

# LvPlan Pro 1.5.26

- **Delete a project** from Projects & Storage, including the one that is open. A clear in-app box asks you to confirm first (Yes, delete it / No, keep it); after deleting the open project, the most recent other project opens.

# LvPlan Pro 1.5.25

- Introduction video: new background music in an '80s hard-rock style (original track: power-chord guitars, driving drums and bass, synth brass and tapped-guitar fills), kept under the narration.

# LvPlan Pro 1.5.24

- Introduction video: a new background beat (an original swung groove with claps, electric piano and bass), kept under the narration.

# LvPlan Pro 1.5.23

- Introduction video: louder, clearer narration (normal listening level) with the upbeat background music kept under the voice.

# LvPlan Pro 1.5.22

- Introduction video: upbeat background music (an original track) that dips under the narrator's voice.

# LvPlan Pro 1.5.21

- **Materials list → Export PDF**: saves the bill of materials as a PDF file (project, site, your company, grouped by category, page numbers), ready to email or print. Works on the Windows app, Android and the browser.
- Introduction video: a more natural American male narrator with corrected pronunciation, a slower pace with more time on each page, filled-in maps, and soft background music.

# LvPlan Pro 1.5.20

- **Skip this step** button at the bottom of every step page. A skipped step is greyed out in the menu, Next / Previous pass over it and its checklist leaves the totals. Open it from the menu and press **Don't skip it** to bring it back. Skips are saved with the project (and carried over when you reuse a project).

# LvPlan Pro 1.5.19

- **New name: LvPlan Pro** (was RadioPlan Pro) on every screen, the window title, the installer, shortcuts, the Android app and the help. Your projects, settings and flash-drive data are kept; the Windows update replaces the old desktop and Start-menu shortcuts.
- Introduction video: American male narrator with a slower, clearer pace and soft background music; the title card no longer says "and radio".

# RadioPlan Pro 1.5.18

- The **introduction video** now has spoken narration for every page and tool (a natural voice reads each step along with the captions). Press **▶ Video** at the top of any page.

# RadioPlan Pro 1.5.17

- **⚙ Custom project type** (Project Systems & Toolkits, and Company & Project): tick only the systems on the job, then the pages and tools you want (**Suggest for my systems** fills it in). The left menu, step numbers, Next / Previous and checklist totals follow your pick; troubleshooting, installation, service and library pages show your systems first. **Show all** at the bottom of the menu brings every page back.

# RadioPlan Pro 1.5.16

- **▶ Video** button at the top of every page plays the introduction video (a captioned tour of every page and tool). The video is built into the app, so it plays offline; it is re-recorded with every update.
- **How-to videos** buttons in Help now search YouTube for the page you are on (and your project's systems on Troubleshooting, Installation, Service, Testing and similar pages) instead of "Getting started". **Help manual** in the sidebar opens the topic for the page you were on.

# RadioPlan Pro 1.5.15

- **Contacts and web resources**: new **or ZIP code** box beside the state, county and city pickers. Type a 5-digit ZIP and all three are set for you.

# RadioPlan Pro 1.5.14

- **Troubleshooting wizard** now picks in short steps instead of one long list: System, then Equipment (General, an equipment type, or a specific library model by category then model), then Problem.
- **Equipment-specific troubleshooting** for 18 device types (smoke detectors, horn/strobes, pull stations, fire alarm panels, batteries, maglocks, electric strikes, card readers, IP cameras, NVRs, motion detectors, door contacts, PoE switches, access points, BDAs, repeaters, 70 V speakers, nurse call stations). Their problems are listed first, then the general system problems. Library models are matched to their type automatically.

# RadioPlan Pro 1.5.13

- **Service & Maintenance Resources** moved to Tools and is now a reference page instead of record keeping: pick a system to see its maintenance schedule (what and how often), common faults and fixes, test steps, installation reminders, standards, shortcuts to the matching tools, online manual / guide / video searches, and a shelf for that system's manuals kept offline.

# RadioPlan Pro 1.5.12

- Sites left at the old Charlotte default are moved to the project's town when the project opens (sites you placed yourself are not touched).
- **Move Site A to the project address** on Map & Directions (shown when Site A is outside the project's county) and **Put Site A at this address** on Company & Project. Online it finds the street address; offline it uses the town or ZIP center.

# RadioPlan Pro 1.5.11

- New **Map & Directions** page (Tools): the project site address on a map with the client contact, one-tap driving directions in Google Maps, Apple Maps or Waze from where you are or from your office, your position and straight-line distance, and copy address / GPS.

# RadioPlan Pro 1.5.10

- Required fields are highlighted only after you press **Save project information** (new button on Company & Project) or try to print or export a report with information missing. The * marks stay so you can see which fields are required.
- New projects are named "New project" (older projects still named "New radio site project" are renamed).

# RadioPlan Pro 1.5.9

- Specifications Library: every item has a **Service, technician and installation manuals** shelf. Attach PDFs, pictures or videos, or add a link (saved offline when the site allows), sorted by type: installation, service / repair, technician / programming, operation, wiring diagram, parts list, firmware notes, training. **Find … online** searches for the exact model.
- New **Service & technician resources** card for manuals not tied to one item (panel programming guides, service bulletins, company procedures), with shortcuts to troubleshooting, the service log, installation guides and calculators.
- Manuals open with no internet and are included in **Back up all projects**.
- **Save as my default** on Company & Project keeps your company information, logo, engineer and PE license on this device; every new project fills them in, and empty fields in any project fill in when you open Company & Project.
- Every dropdown starts with **— Choose one —**.

# RadioPlan Pro 1.5.8

- Required project information: project name, project type, client, site address, city, county, state and your company name are marked *. Empty ones are outlined in red with a list at the top of Company & Project, a count on the menu, and a reminder on Reports.

# RadioPlan Pro 1.5.7

- County and state fill in by themselves from the city, the new **Site ZIP code** box or the site address on Company & Project (built-in data, works offline). Projects whose county doesn't match their city (for example Asheville with Mecklenburg County) are corrected when opened.
- Contacts & Web Resources: picking a city sets its county; every town in the state is listed, with the county's towns first.
- Installation Guides: one dropdown (this project's guides first) and fold-away sections instead of a long page.
- Specifications Library: **Manufacturer recommendations** for every item (installation, wiring, environment, upkeep), plus your own per-model list.

# RadioPlan Pro 1.5.6

- Contacts & Web Resources follows the project's state, county and city, and updates when they change. If the project's county or city doesn't match where the first site is, it offers **Use the site's location** to correct it.
- The place line links the levels: State › County › City. Tap the state or county to step out a level; contacts show the city's offices with its county and state offices.
- Built in, from the City of Asheville's official pages: Development Services Permit Application Center and the Fire Marshals Division.

# RadioPlan Pro 1.5.5

- Screens adapt to the device: text scales with the screen, forms drop to one column on phones, buttons wrap instead of running off the edge, wide tables scroll inside their card, and very large monitors keep a readable width. Checked on every page at phone (360 px), tablet (768 and 1024 px) and desktop (1920 px) sizes.

# RadioPlan Pro 1.5.4

- Imperial or metric: **Measurements** on Company & Project switches number boxes, results and distances between feet, inches, square feet and miles, and metres, millimetres, square metres and kilometres. Switching does not change your data.

# RadioPlan Pro 1.5.3

- Start a new project from a previous one: press **Reuse** on Projects & Storage (or pick the project in the new card), name the new job and tick what to carry over: project type, design, equipment and materials, pricing, drawing settings and your checklist items, and optionally the client, sites and attached files. Field notes, photos, tests, service calls and checklist ticks start empty, and the old project is not changed.
- The menu's Tools section no longer shows step numbers, and Installation Guides and the Specifications Library are now under Tools.
- Footer shows "© Bobby Taylor. All rights reserved."
- The address search box was removed from the top bar; search on Find Location & Auto-Plan.

# RadioPlan Pro 1.5.2

- Code Compliance: one "Codes by state, county and city" picker with three dropdowns replaces the long county and city lists. ★ marks places with their own code list or inspections.
- Plumbing, mechanical and fuel gas codes are hidden; tick them under "Also show" to include them.

# RadioPlan Pro 1.5.1

- New projects start in Asheville, NC (Buncombe County) instead of Charlotte.

# RadioPlan Pro 1.5.0

- Report builder: pick Project proposal, Build plan, Closeout package, Site survey report or Engineering reports, then tick the sections you want (cover letter, scope of work, recommended equipment, materials, price, schedule, terms, floor plans, device schedule, codes, inspection contacts, checklists, test report, maintenance schedule, documents, photos, color wiring diagrams, warranty and sign-off, and the radio and power reports). Proposal options set labor, materials, markup, tax, dates, exclusions and payment terms.
- Print and export: print or save as PDF, Word (.docx with photos and diagrams), Excel (.xlsx), web page, CSV and KML.
- New Blueprints & Drawing Sets page: cover sheet (codes, sheet index, symbols, general notes), a plan per floor at an architectural scale with north arrow, scale bar, dimensions and tagged devices, riser diagram, and schedules (device schedule, equipment, fire alarm battery calculation and sequence of operations). Title block with seal box and revisions on every sheet; ARCH D, ARCH E1, ARCH C, ANSI D, ANSI B and Letter sizes; export to PDF, CAD (.dxf) and SVG. NFPA 72 shop drawing checklist.
- Import any file: Excel or CSV becomes sites, materials or contacts; KML, KMZ, GPX and GeoJSON become sites; photos go to Field Notes; project files open; anything else (PDF, Word, CAD, permits) is kept with the project under Documents.
- The Materials list now fills in by itself from the project type, building and devices. Tower, feedline and site grounding lines only appear on radio projects.
- Specifications library: save each item's datasheet (PDF) inside the app so it opens offline.
- Backups now include your library, contacts, web links and saved datasheets.
- Help: a screenshot of each page, color wiring diagrams where they apply, how-to video search links, and new topics for blueprints, reports, importing and exporting, checklists, and updates and self-repair.
- Reports and the report builder fit on phone screens.

# RadioPlan Pro 1.4.0

- New Auto-Design page: describe the building and the app recommends head-end equipment, lays out devices for every system on the project, and estimates materials from the layout. It uses the site terrain for placement advice. Shown as a 2D floor plan or a 3D model, by floor, and can be added to the Materials list.
- Materials list: add your own items, or pick them from the specifications library; edit or remove them.
- Page navigation on every page: back and next buttons and a "Go to page" list.
- Codes by city: every town in NC, SC, GA and TN. Cities and counties that adopt their own codes (Nashville, Memphis/Shelby County, Knoxville, Knox County, Clarksville/Montgomery County, Murfreesboro, Franklin, Collierville, Maryville, Williamson County, Chattanooga, Atlanta, Greenville County SC) show their own list, read from their official pages.
- New Contacts & Web Resources page: pick state, then county, then city. It shows inspection offices, fire marshals and licensing boards (numbers copied from official pages), plus web links. Add, edit and remove your own, and see them under "My contacts".
- Checklists replace the "Mark task complete" boxes: site survey, permits and submittals, installation and testing (with steps for each system on the project), and closeout.
- Self-repair: damaged or old project data is fixed when it opens; a page that fails repairs the data, then goes back to the last saved version; after an update the app reloads itself to pick up new files. It now checks for updates every hour.

# RadioPlan Pro 1.3.0

- Project type dropdown with check boxes for sub-projects, on the first-start screen, Company & Project and the new Project Systems page.
- Toolkits for 20 system types, including all 16 service lines: structured cabling, fiber, fire alarm, security, intercom, nurse call, paging, professional sound, design services, service contracts, PM contracts, access control, CCTV, mass notification, wireless emergency call boxes and DAS. Each has Plan, Install, Test & troubleshoot, Repair & maintain, and Tools & reference tabs.
- 19 new low-voltage calculators: cable boxes, conduit fill, J-hooks, fiber loss budget, optic power budget, standby batteries, wire voltage drop, power supply, PoE budget, NVR storage, camera pixel density, speaker sound level, 70 V lines, ceiling speaker spacing, door lock power, nurse call stations, call box solar, PM contract labor and design hours.
- New library categories (Intrusion, CCTV, Intercom, Nurse call, Paging & sound, Emergency call boxes) with typical and standard values.
- Troubleshooting guides for intrusion, access control, CCTV, paging/sound/intercom, nurse call and call boxes; the wizard can also start from a system type.
- New Service & Maintenance page: preventive maintenance schedule with next-due dates and a service and repair log with CSV export.
- Menu now runs planning → installation → testing → troubleshooting & repair.
- The first-start screen scrolls on small screens, and address suggestions no longer cover the Start button.

# RadioPlan Pro 1.2.0

- Codes follow the project address: the app finds the state, county and city and shows the adopted fire, building, electrical, plumbing, mechanical, fuel gas, energy, accessibility, fire alarm and ERCES codes there, with effective dates, upcoming code changes and sources.
- New "Codes by county" browser on the Code Compliance page for all 400 counties in NC, SC, GA and TN, including Tennessee exempt cities and counties.
- Code data re-checked against state sources on 2026-11-07: NC stays on the 2018 NC State Building Code (2024 code not yet effective); SC and GA 2024 codes take effect 2027-01-01; TN 2021 I-codes and 2017 NEC confirmed.
- Equipment added to a project loads into the Specifications Library automatically ("From project") and can be edited; fire alarm device edits can update the battery calculation.
- New Troubleshooting Wizard: pick the equipment and the problem, then follow each check with how to test it, the tool, and the expected value from the item's specifications. Results save to Final Testing or a field note.
- New menu section "Troubleshooting & repair".

# RadioPlan Pro 1.1.0

- The menu follows the project phases: setup, site survey, low-voltage design, radio & RF design, compliance & materials, installation, testing & closeout. Low-voltage systems come first within design.
- First start asks what you are designing and where, then opens the right page.
- New Specifications Library: search, compare and add equipment specifications; import / export CSV; use your own antennas, coax and radios in project calculations.
- New Installation Guides with color wiring diagrams (antenna and grounding, repeater power, ERCES / BDA, fire alarm NAC, off-grid solar, PoE and T568B).
- New Field Notes page with photos and GPS, included in reports and synced between devices.
