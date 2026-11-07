#!/usr/bin/env bash
# Adds GPS + network permissions to the generated Android manifest (run after `npx cap add android`).
set -euo pipefail
M=android/app/src/main/AndroidManifest.xml
for perm in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION INTERNET; do
  grep -q "android.permission.$perm" "$M" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$perm\" />\n</manifest>#" "$M"
done
grep -q 'android.hardware.location.gps' "$M" || sed -i 's#</manifest>#    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>#' "$M"
