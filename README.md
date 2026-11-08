# LvPlan Pro

Single-user planning workstation for **low-voltage systems** (fire alarm, ERCES / BDA and DAS, Wi-Fi and network cabling,
solar / DC power, grounding) and the **radio and RF design** behind them (topographic maps, GPS, terrain, propagation, link budgets, 3D).
Includes a specifications library, color installation guides, field notes, code-compliance warnings for NC / SC / GA / TN,
materials lists, reports and commissioning tests.

## Downloads

Get everything from the [latest release](https://github.com/bltaylorjr/radioplan-pro/releases/latest), or use it online at
**https://bltaylorjr.github.io/radioplan-pro/**.

| Download | For | What happens |
|---|---|---|
| `RadioPlan-Pro-Setup.exe` | Windows 10 / 11 | Double-click. Installs with no questions (no administrator rights), adds a desktop icon, opens the app, and **updates itself** when a new release is published. |
| `RadioPlan-Pro.apk` | Android 7+ | Open on the phone, allow "install unknown apps" once, tap Install. The app offers each new version in one tap. |
| `RadioPlan-Pro-FlashDrive.zip` | Flash drive | Unzip onto the drive. `LvPlan Pro.exe` runs on any Windows PC and keeps projects **on the drive** ("RadioPlan Data"); Mac uses `Start on Mac.command`; anything else opens `RadioPlan.html`. |
| Online version | Any browser | Always the latest version; projects are stored in that browser. |

All versions work without internet once installed: projects, history, terrain and a set of reference data are stored inside the app
(see **Projects & Storage**). Maps and terrain download automatically for each project when online and are kept for offline use.

### Building the downloads

`bash scripts/package-all.sh` builds all three into `out/` on Ubuntu (Rust with the `x86_64-pc-windows-gnu` target, `mingw-w64`, `nsis`,
and the Ubuntu Android packages listed in `scripts/build-android-lite.sh`; no Android Studio or Gradle needed).
`.github/workflows/release.yml` does the same when a `v*` tag is pushed and publishes a GitHub Release, which the installed apps update from.
It needs two repository secrets: `ANDROID_KEYSTORE_B64` and `ANDROID_STOREPASS` (Android only accepts updates signed with the same key).
`.github/workflows/web.yml` tests and publishes the online version to GitHub Pages on every push to `main`.

## Workflow pages (in task order)

1. **Project setup:** Company & Project · Project Systems & Toolkits · Find Location & Auto-Plan · Site Data & GPS
2. **Planning: site survey:** Field Notes & Photos · Map & Terrain · Wi-Fi & Network Survey · Drive Test & Calibration
3. **Planning: low-voltage design:** Auto-Design & 3D Model · Fire Alarm & Batteries · Emergency Radio (ERCES / BDA) · Indoor Coverage & DAS · Solar & DC Power · Grounding & Structure
4. **Planning: radio & RF:** Equipment & Link Budget · Path Profile / LOS / Fresnel · Coverage Prediction · Tilt, Azimuth & Power · Multi-site & Interference · Scenarios & Compare · 3D Model · LF / HF Systems
5. **Planning: codes & materials:** Code Compliance · Materials List · Blueprints & Drawing Sets
6. **Testing & closeout:** Final Testing · Reports, Proposals & Closeout
7. **Troubleshooting & repair:** Troubleshooting Wizard
**Tools** (not numbered steps): Map & Directions · Service & Maintenance Resources · Installation Guides (color wiring diagrams) · Specifications Library · Contacts & Web Resources · Calculators · Projects & Storage · Sync Devices

Plus a searchable Help manual, page help (F1), "Guide me" walkthroughs and `?` tooltips. The first start asks what is being designed
(fire alarm, ERCES, Wi-Fi, solar or radio) and where, then opens the right page.

## What is real vs. simplified vs. placeholder

**Implemented and unit-tested** (`npm test`, 104 tests): GIS export (KML/KMZ, GeoJSON, Esri Shapefile, PNG + world file, CSV grid), marching-squares service contours, device sync merge (per-section, item-level for lists, deletions kept), terrain download retry, address suggestions, professional calculators (Erlang B, intermod, VSWR, Dwight ground rod, voltage drop, battery and more), acceptance pass/fail, scenario grid storage and diffs, CSV site import (decimal/DMS, header matching), drive-test calibration (offset + slope least squares), multi-site C/I, Wi-Fi scan parsers (netsh, nmcli, iw, airport, CSV), 4/3-earth radio horizon, earth bulge, Fresnel zones and 60 % clearance,
FSPL, Okumura-Hata (urban/suburban/rural, small/large city), COST-231 Hata, MAPL range inversion, EIRP/ERP link budget,
log-normal shadow margin and Jakes area reliability, ITU-R P.526 knife-edge diffraction, 3GPP sector pattern and downtilt footprint,
FCC OET-65 / 47 CFR 1.1310 MPE distances, feeder loss from datasheet points, NMEA GGA parsing/averaging with checksum, UTM→WGS84,
ESRI ASCII / SRTM HGT / GeoTIFF / LiDAR LAS import, NEC 690.7/690.8 solar sizing, NEC conductor ampacity and voltage drop,
NFPA 72 battery calculation, NAC voltage drop, ITU-R P.1238 and COST-231 multi-wall indoor models.

**Simplified engineering models (labelled in the app):** terrain-aware coverage uses Hata + single worst-obstacle diffraction
(not Longley-Rice/ITM); LF groundwave uses a flat-earth Sommerfeld-Norton approximation (not ITU-R P.368 curves); HF uses the
secant-law MUF with a user-entered foF2 (not VOACAP); ERCES downlink budget is a single worst-path estimate.

**Placeholders / limits:** state amendment text is not bundled (the app lists each state's adopted code set and the authority to
confirm with); equipment catalog is a starter set with typical specs; terrain is held in memory for the session (re-import after
reopening); browsers cannot scan Wi-Fi, so Wi-Fi readings come from pasted or imported scans; C/I analysis is a planning screen, not frequency coordination; sync merges per section and the newest edit to a section (for example company info) wins, while lists such as sites merge item by item; browsers cannot do Bluetooth file transfer directly, so Bluetooth goes through the phone share sheet (Nearby/Quick Share); cellular sync uses a shared cloud-drive folder (OneDrive, Google Drive, Dropbox) or a direct link that needs both devices online; distances display in miles by default (Company page switches to km); map tiles, geocoding and online elevation need internet; LAZ and state-plane LiDAR must be converted first.

## Code citations

Rules cite NEC (NFPA 70) 2020/2023, NFPA 72, NFPA 1225, NFPA 780, IFC 2021, TIA-222-H, Motorola R56, 14 CFR Part 77 and 47 CFR.
Section numbers can move between editions and states adopt different editions with amendments.

## Verification status (2026-11-07)

- **Adopted editions** (official state sources): NC 2020 NEC, effective 2021-11-01 (2023 NEC on indefinite delay, SL 2025-2 §5.12). SC 2020 NEC, effective 2023-01-01. GA 2023 NEC, effective 2025-01-01, plus 2026 GA amendments. TN 2017 NEC, **unconfirmed**.
- **Checked against official text:** 14 CFR 77.9(a)/(b), 47 CFR 90.219(b)(1)(i)/(d)(5), the 47 CFR 1.1310 Table 1 MPE limits, and the ITU-R P.526-16 knife-edge J(v) approximation.
- **Not re-checked (paywalled or no free source):** NEC, NFPA 72, NFPA 1225 and IFC 510 section numbers; the Okumura-Hata / COST-231 coefficients (standard published forms); and the OET-65 ground-reflection factor. These are flagged "confirm in code book" in the app.

**This is a planning aid. A licensed professional engineer and the Authority Having Jurisdiction must verify every design.**

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests
npm run build:usb  # single-file USB build
```

Projects save automatically in the app's built-in storage (IndexedDB: the app data folder on Windows, private app storage on Android, the browser profile or a chosen folder for the flash-drive HTML). **Export** writes a `.radioplan.json` file; **Projects & Storage** has history, backup/restore and the optional data folder. `scripts/build-refdata.mjs` regenerates the built-in county / ZIP / town data.
