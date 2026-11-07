# RadioPlan Pro

Single-user planning workstation for placing radio equipment: topographic maps, GPS, terrain (DEM / LiDAR),
propagation and link budgets, 3D terrain, indoor planning, specialty systems (LF/HF, fire alarm, ERCES, solar),
code-compliance warnings for NC / SC / GA / TN, materials lists, reports and commissioning tests.

One TypeScript/React codebase ships three ways:

| Target | How | Output |
|---|---|---|
| **USB stick** | `npm run build:usb` | `dist-usb/RadioPlan.html`: one self-contained file, double-click to run (Chrome/Edge/Firefox), no install |
| **Windows PC app** | `npm run desktop:build` (needs Rust + Windows) or the GitHub Actions workflow | NSIS installer, MSI, and a portable `radioplan.exe` (uses the WebView2 runtime built into Windows 10/11) |
| **Android app** | `npm run android` (needs Android Studio) or the GitHub Actions workflow | `app-debug.apk` to sideload |

The workflow in `.github/workflows/build.yml` runs the tests and builds all three on every push to `main`;
download the results from the run's **Artifacts** section.

## Workflow pages (in task order)

Find Location & Auto-Plan · Company & Project (project name/number, your company, client company, jurisdiction) ·
Site Data & GPS (with CSV site-database import/export) · Map & Terrain · Equipment & Link Budget · Path Profile / LOS / Fresnel ·
Coverage Prediction (acceptance criteria, pass/fail service contours, model tuning, run history, GIS export) · Tilt, Azimuth & Power ·
Multi-site & Interference (best server, overlap, co-/adjacent-channel C/I) · Scenarios & Compare (input diff, result deltas,
difference map) · Field Survey & Calibration (drive-test import, least-squares model calibration) · 3D Model · Grounding & Structure ·
Indoor Planning · Wi-Fi Survey (floor plan, pasted/imported scans, signal / noise / SNR / channel / AP / co-channel views) ·
Emergency Radio (ERCES) · LF / HF · Alarm Systems · Solar & DC Power · Code Compliance · Materials List · Reports · Final Testing — plus a searchable Help manual, page help (F1),
"Guide me" walkthroughs and `?` tooltips on fields.

## What is real vs. simplified vs. placeholder

**Implemented and unit-tested** (`npm test`, 81 tests): GIS export (KML/KMZ, GeoJSON, Esri Shapefile, PNG + world file, CSV grid), marching-squares service contours, acceptance pass/fail, scenario grid storage and diffs, CSV site import (decimal/DMS, header matching), drive-test calibration (offset + slope least squares), multi-site C/I, Wi-Fi scan parsers (netsh, nmcli, iw, airport, CSV), 4/3-earth radio horizon, earth bulge, Fresnel zones and 60 % clearance,
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
reopening); browsers cannot scan Wi-Fi, so Wi-Fi readings come from pasted or imported scans; C/I analysis is a planning screen, not frequency coordination; map tiles, geocoding and online elevation need internet; LAZ and state-plane LiDAR must be converted first.

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

Project data saves automatically in the browser/app storage; use **Save project** to write a `.radioplan.json` file.
