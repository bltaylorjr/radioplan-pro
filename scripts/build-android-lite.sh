#!/usr/bin/env bash
# Builds LvPlan Pro for Android without Gradle (Ubuntu packages: android-sdk-platform-23,
# android-sdk-build-tools, aapt, zipalign, apksigner, dalvik-exchange; plus a JDK).
# Usage: KEYSTORE=path STOREPASS=... bash scripts/build-android-lite.sh   → out/RadioPlan-Pro.apk
set -euo pipefail
cd "$(dirname "$0")/.."
SDK=/usr/lib/android-sdk; BT=$SDK/build-tools/29.0.3; JAR=$SDK/platforms/android-23/android.jar
VERSION=$(node -p "require('./package.json').version"); CODE=${VERSION_CODE:-$(date +%y%j%H)}
W=build-android; rm -rf $W; mkdir -p $W/assets/www $W/res $W/gen $W/classes $W/compiled out
[ -f dist-usb/RadioPlan.html ] || npm run build:usb
cp dist-usb/RadioPlan.html $W/assets/www/index.html
cp public/icon-192.png $W/assets/www/ 2>/dev/null || true
cp -r android-lite/res/* $W/res/
sed -e "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$CODE\"/" -e "s/android:versionName=\"[^\"]*\"/android:versionName=\"$VERSION\"/" android-lite/AndroidManifest.xml > $W/AndroidManifest.xml
$BT/aapt2 compile --dir $W/res -o $W/compiled/res.zip
$BT/aapt2 link -I $JAR --manifest $W/AndroidManifest.xml --min-sdk-version 24 --target-sdk-version 34 \
  -A $W/assets --java $W/gen -o $W/base.apk $W/compiled/res.zip --auto-add-overlay
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath $JAR -classpath $JAR -d $W/classes $(find android-lite/src $W/gen -name '*.java')
$BT/dx --dex --min-sdk-version=24 --output=$W/classes.dex $W/classes
(cd $W && zip -q -j base.apk classes.dex)
$BT/zipalign -f -p 4 $W/base.apk $W/aligned.apk
KEYSTORE=${KEYSTORE:-android-lite/debug.keystore}; STOREPASS=${STOREPASS:-android}
if [ ! -f "$KEYSTORE" ]; then keytool -genkeypair -keystore "$KEYSTORE" -storepass "$STOREPASS" -keypass "$STOREPASS" -alias radioplan -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=LvPlan Pro" >/dev/null 2>&1; fi
$BT/apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$STOREPASS" --ks-key-alias radioplan --out out/RadioPlan-Pro.apk $W/aligned.apk
$BT/apksigner verify --print-certs out/RadioPlan-Pro.apk | head -3
ls -la out/RadioPlan-Pro.apk
