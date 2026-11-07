#!/usr/bin/env bash
# Adds GPS, network, camera (QR sync) and Wi-Fi multicast (device-to-device sync) permissions to the generated Android manifest (run after `npx cap add android`).
set -euo pipefail
M=android/app/src/main/AndroidManifest.xml
for perm in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION INTERNET CAMERA ACCESS_NETWORK_STATE ACCESS_WIFI_STATE CHANGE_WIFI_MULTICAST_STATE; do
  grep -q "android.permission.$perm" "$M" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$perm\" />\n</manifest>#" "$M"
done
grep -q 'android.hardware.location.gps' "$M" || sed -i 's#</manifest>#    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>#' "$M"
