#!/usr/bin/env bash
# Genera APK debug o release con el Android SDK + JDK 21 del repo.
set -euo pipefail
MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$MOBILE/.." && pwd)"
MODE="${1:-debug}"

# JDK 21 portable (recomendado por AGP)
if [[ -x "$ROOT/tools/jdk-21/bin/java" ]]; then
  export JAVA_HOME="$ROOT/tools/jdk-21"
elif [[ -n "${JAVA_HOME:-}" ]]; then
  :
else
  export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
fi
export PATH="$JAVA_HOME/bin:$PATH"

# Android SDK
if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "$HOME/Android/Sdk" ]]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  elif [[ -d /opt/android-sdk ]]; then
    export ANDROID_HOME=/opt/android-sdk
  fi
fi
if [[ -z "${ANDROID_HOME:-}" || ! -d "$ANDROID_HOME" ]]; then
  echo "ERROR: define ANDROID_HOME (SDK de Android)." >&2
  exit 1
fi
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"

echo "→ JAVA_HOME=$JAVA_HOME"
echo "→ ANDROID_HOME=$ANDROID_HOME"
java -version 2>&1 | head -1

AND="$MOBILE/android"
if [[ ! -d "$AND" ]]; then
  echo "ERROR: falta mobile/android. Ejecuta: npm run cap:sync" >&2
  exit 1
fi

# local.properties para Gradle
echo "sdk.dir=$ANDROID_HOME" > "$AND/local.properties"

cd "$AND"
chmod +x gradlew 2>/dev/null || true

if [[ "$MODE" == "release" ]]; then
  echo "→ Building release APK (unsigned o con keystore si está configurado)..."
  ./gradlew assembleRelease --no-daemon
  OUT=$(find "$AND/app/build/outputs/apk" -name '*.apk' | head -5)
else
  echo "→ Building debug APK..."
  ./gradlew assembleDebug --no-daemon
  OUT=$(find "$AND/app/build/outputs/apk/debug" -name '*.apk' 2>/dev/null | head -5)
fi

mkdir -p "$MOBILE/release"
# Copiar APKs a mobile/release con nombre claro
shopt -s nullglob
for apk in "$AND"/app/build/outputs/apk/*/*.apk "$AND"/app/build/outputs/apk/*/*/*.apk; do
  [[ -f "$apk" ]] || continue
  base=$(basename "$apk")
  # FisicaHN-<version>-debug.apk
  ver=$(node -p "require('$MOBILE/package.json').version" 2>/dev/null || echo "1.0.0")
  if [[ "$apk" == *debug* ]]; then
    dest="$MOBILE/release/FisicaHN-${ver}-debug.apk"
  else
    dest="$MOBILE/release/FisicaHN-${ver}-release.apk"
  fi
  cp -f "$apk" "$dest"
  echo "→ $dest ($(du -h "$dest" | cut -f1))"
done

echo "→ Listo. APKs en mobile/release/"
ls -lh "$MOBILE/release/"*.apk 2>/dev/null || ls -lh "$AND/app/build/outputs/apk/"
