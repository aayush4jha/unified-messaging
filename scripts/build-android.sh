#!/usr/bin/env bash
# Builds the Orbit Android app (a Trusted Web Activity: Orbit full screen in Chrome's engine)
# and publishes it at /downloads/orbit.apk with its checksum and the Digital Asset Links file.
#
#   scripts/build-android.sh <host> [--bump]
#     host     the deployed domain, e.g. orbit-inbox.vercel.app (no https://)
#     --bump   increase the app version (only needed when this shell changes, not for web updates)
#
# Needs: JDK 17 and the Android SDK (platforms;android-36, build-tools;36.1.0). See docs/MOBILE.md.
# The signing key lives OUTSIDE the repo in ~/.orbit/android. Back it up: Android only accepts
# updates signed with the same key.
set -euo pipefail

HOST="${1:?usage: scripts/build-android.sh <host> [--bump]}"
HOST="${HOST#https://}"; HOST="${HOST%/}"
BUMP="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android/app-shell"
ASSET_BASE="${ORBIT_ASSET_BASE:-https://$HOST}"
KEY_DIR="${ORBIT_ANDROID_KEY_DIR:-$HOME/.orbit/android}"
KEYSTORE="$KEY_DIR/orbit-release.jks"
SECRETS="$KEY_DIR/keystore.env"
BUBBLEWRAP="${BUBBLEWRAP:-$HOME/.orbit/tools/node_modules/.bin/bubblewrap}"

export JAVA_HOME="${JAVA_HOME:-$(brew --prefix openjdk@17 2>/dev/null)}"
# Homebrew's short path (…/openjdk@17) → the real JDK home inside the .jdk bundle.
[ -d "$JAVA_HOME/libexec/openjdk.jdk/Contents/Home" ] && JAVA_HOME="$JAVA_HOME/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[ -x "$JAVA_HOME/bin/java" ] || { echo "JDK 17 not found (set JAVA_HOME)"; exit 1; }
[ -d "$ANDROID_HOME/build-tools" ] || { echo "Android SDK not found (set ANDROID_HOME)"; exit 1; }
# Bubblewrap looks for sdkmanager at <sdk>/bin (its own SDK layout); point it at the standard cmdline-tools.
[ -e "$ANDROID_HOME/bin" ] || ln -s cmdline-tools/latest/bin "$ANDROID_HOME/bin"
[ -x "$BUBBLEWRAP" ] || { echo "Bubblewrap not found: npm i --prefix ~/.orbit/tools @bubblewrap/cli@1.27.0"; exit 1; }

# 1. Signing key (created once, never committed).
mkdir -p "$KEY_DIR"; chmod 700 "$KEY_DIR"
if [ ! -f "$KEYSTORE" ]; then
  PASS="$(openssl rand -base64 24 | tr -d '/+=')"
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$KEYSTORE" -alias orbit -keyalg RSA -keysize 3072 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Orbit, O=Orbit" >/dev/null
  printf 'BUBBLEWRAP_KEYSTORE_PASSWORD=%s\nBUBBLEWRAP_KEY_PASSWORD=%s\n' "$PASS" "$PASS" > "$SECRETS"
  chmod 600 "$KEYSTORE" "$SECRETS"
  echo "Created signing key at $KEYSTORE. Back up this folder: $KEY_DIR"
fi
set -a; . "$SECRETS"; set +a

# 2. Version.
if [ "$BUMP" = "--bump" ]; then
  node -e 'const f=process.argv[1];const v=require(f);const p=v.versionName.split(".").map(Number);p[2]++;v.versionName=p.join(".");v.versionCode++;require("fs").writeFileSync(f,JSON.stringify(v,null,2)+"\n")' "$ROOT/android/version.json"
fi
VERSION="$(node -p 'require(process.argv[1]).versionName' "$ROOT/android/version.json")"
VERSION_CODE="$(node -p 'require(process.argv[1]).versionCode' "$ROOT/android/version.json")"

# 3. Generate the Android project from the template.
mkdir -p "$ANDROID_DIR"
sed -e "s#__HOST__#$HOST#g" -e "s#__ASSET_BASE__#$ASSET_BASE#g" -e "s#__KEYSTORE__#$KEYSTORE#g" \
    -e "s#__VERSION__#$VERSION#g" -e "s#__VERSION_CODE__#$VERSION_CODE#g" \
    "$ROOT/android/twa-manifest.template.json" > "$ANDROID_DIR/twa-manifest.json"
# Bubblewrap's own config (on macOS it expects the .jdk bundle, i.e. JAVA_HOME without /Contents/Home).
mkdir -p "$HOME/.bubblewrap"
node -e 'const [jdk, sdk, out] = process.argv.slice(1); require("fs").writeFileSync(out, JSON.stringify({ jdkPath: process.platform === "darwin" ? jdk.replace(/\/Contents\/Home\/?$/, "") : jdk, androidSdkPath: sdk }))' "$JAVA_HOME" "$ANDROID_HOME" "$HOME/.bubblewrap/config.json"
( cd "$ANDROID_DIR" && "$BUBBLEWRAP" update --skipVersionUpgrade --manifest="$ANDROID_DIR/twa-manifest.json" --directory="$ANDROID_DIR" )

# 4. Build and sign.
( cd "$ANDROID_DIR" && "$BUBBLEWRAP" build --skipPwaValidation --manifest="$ANDROID_DIR/twa-manifest.json" )
APK="$ANDROID_DIR/app-release-signed.apk"
[ -f "$APK" ] || { echo "Build did not produce $APK"; exit 1; }
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
"$BUILD_TOOLS/apksigner" verify "$APK"

# 5. Publish next to the web app.
mkdir -p "$ROOT/public/downloads" "$ROOT/public/.well-known"
cp "$APK" "$ROOT/public/downloads/orbit.apk"
CERT_SHA256="$("$JAVA_HOME/bin/keytool" -list -v -keystore "$KEYSTORE" -alias orbit -storepass "$BUBBLEWRAP_KEYSTORE_PASSWORD" | awk '/SHA256:/{print $2; exit}')"
PACKAGE_ID="$(node -p 'require(process.argv[1]).packageId' "$ANDROID_DIR/twa-manifest.json")"
node -e '
const [pkg, cert, out] = process.argv.slice(1);
const extra = (process.env.ORBIT_EXTRA_ANDROID_FINGERPRINTS || "").split(",").map((s) => s.trim()).filter(Boolean); // e.g. the Play App Signing key
require("fs").writeFileSync(out, JSON.stringify([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: [cert, ...extra] } }], null, 2) + "\n");
' "$PACKAGE_ID" "$CERT_SHA256" "$ROOT/public/.well-known/assetlinks.json"
node -e '
const [apk, pkg, version, code, out] = process.argv.slice(1);
const fs = require("fs"); const buf = fs.readFileSync(apk);
const sha256 = require("crypto").createHash("sha256").update(buf).digest("hex");
fs.writeFileSync(out, JSON.stringify({ version, versionCode: Number(code), packageId: pkg, sizeBytes: buf.length, sha256, builtAt: new Date().toISOString() }, null, 2) + "\n");
' "$ROOT/public/downloads/orbit.apk" "$PACKAGE_ID" "$VERSION" "$VERSION_CODE" "$ROOT/public/downloads/android.json"

echo
echo "Published public/downloads/orbit.apk ($VERSION, code $VERSION_CODE) for https://$HOST"
echo "Signing certificate SHA-256: $CERT_SHA256"
