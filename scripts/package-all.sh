#!/usr/bin/env bash
# Builds every RadioPlan Pro download into out/:
#   RadioPlan-Pro-Setup.exe        one-click Windows installer (auto-updating)
#   RadioPlan-Pro.apk              Android app
#   RadioPlan-Pro-FlashDrive.zip   unzip onto a flash drive: portable Windows app + Mac/any-browser version
# Needs: Node, Rust with x86_64-pc-windows-gnu, mingw-w64, nsis, and the Android packages listed in build-android-lite.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
mkdir -p out
npm run build
npm run build:usb
(cd src-tauri && cargo build --release --target x86_64-pc-windows-gnu --features tauri/custom-protocol)
WIN=src-tauri/target/x86_64-pc-windows-gnu/release
cp README.md "$WIN/README.md"
makensis -V2 -DVERSION="$VERSION" -DSRC="$PWD/$WIN" -DICON="$PWD/src-tauri/icons/icon.ico" -DOUT="$PWD/out/RadioPlan-Pro-Setup.exe" installer/radioplan.nsi
bash scripts/build-android-lite.sh
# Flash-drive package
U=out/usb/RadioPlan\ Pro; rm -rf out/usb; mkdir -p "$U/RadioPlan Data" "$U/samples"
cp "$WIN/radioplan.exe" "$U/RadioPlan Pro.exe"; cp "$WIN/WebView2Loader.dll" "$U/"
cp dist-usb/RadioPlan.html "$U/"; cp packaging/"Start Here.txt" packaging/"Start on Mac.command" "$U/"; chmod +x "$U/Start on Mac.command"
cp out/RadioPlan-Pro-Setup.exe "$U/"
echo "Projects, maps and terrain for the portable version are kept in this folder." > "$U/RadioPlan Data/About this folder.txt"
cp samples/* "$U/samples/" 2>/dev/null || true
rm -f out/RadioPlan-Pro-FlashDrive.zip; (cd out/usb && zip -qr -X ../RadioPlan-Pro-FlashDrive.zip "RadioPlan Pro")
printf '{"version":"%s"}\n' "$VERSION" > out/version.json
ls -la out
