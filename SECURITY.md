# Security

LvPlan Pro is a low-voltage and radio planning app: the online version at https://lvplan-pro.pages.dev/,
the Windows desktop app and the Android app. Projects stay on your own device; the app has no accounts and no
server of its own.

## Reporting a problem

Please report security problems privately, not in a public issue:
[report a vulnerability](https://github.com/bltaylorjr/radioplan-pro/security/advisories/new) on GitHub.

Tell us what you found, how to see it happen, and what it could let someone do. We will reply within 3 days,
keep you told about the fix, and credit you when it ships unless you would rather stay anonymous. Please give us a
fair chance to fix the problem before you tell anyone else.

`/.well-known/security.txt` on the online version lists the same contact.

## What is covered

- The app (`src/`, `public/`, `index.html`) on the web, Windows (`src-tauri/`) and Android (`capacitor.config.json`)
- The build, release and data workflows (`.github/`)

Out of scope: problems in GitHub, NOAA, USGS, the FCC, RadioReference or other outside data sources themselves
(please report those to them).

## How the app protects users

- Projects, photos and readings are stored only on your device (and in files you export). Sync between devices
  goes device to device with no server in between.
- Every page carries a strict Content Security Policy: only the app's own scripts run (no inline or injected
  scripts, no `eval`), plugins are blocked and the page's base address cannot be changed. The Windows app carries
  the same policy. Network access stays open because the app reads many public data sources (maps, terrain,
  weather, FCC and FAA data) and talks to your own meters and GPS on the local network.
- Project, backup and sync files are read with a parser that drops keys able to change built-in objects, and have
  a size limit. Text placed into print windows is escaped. Links to other sites open without access back to the app.
- Logins you save for outside services (such as the RadioReference key) stay on your device.
- Each change runs the full test suite, a browser security check on every page (`scripts/e2e-security.cjs`),
  CodeQL code scanning and a dependency review before it can merge. Workflow actions are pinned to exact commits
  and checkouts do not keep the token, and Dependabot keeps libraries and actions patched.
