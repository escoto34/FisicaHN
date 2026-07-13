#!/usr/bin/env bash
# Copia el icono del desktop a mipmaps Android (si existen tras cap add).
set -euo pipefail
MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$MOBILE/.." && pwd)"
ICON="$ROOT/desktop/build/icon.png"
RES="$MOBILE/android/app/src/main/res"

if [[ ! -f "$ICON" ]]; then
  echo "Sin icono en $ICON" >&2
  exit 0
fi
if [[ ! -d "$RES" ]]; then
  echo "Aún no hay proyecto Android (npm run cap:sync primero)." >&2
  exit 0
fi

# Capacitor usa ic_launcher; copiamos PNG 512 a drawable y a mipmap-* si convert está disponible
mkdir -p "$RES/drawable"
cp -f "$ICON" "$RES/drawable/ic_launcher_foreground_src.png"

if command -v convert >/dev/null 2>&1 || command -v magick >/dev/null 2>&1; then
  CVT=$(command -v magick || command -v convert)
  for pair in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
    dens=${pair%%:*}
    px=${pair##*:}
    dir="$RES/mipmap-$dens"
    mkdir -p "$dir"
    $CVT "$ICON" -resize "${px}x${px}" "$dir/ic_launcher.png" 2>/dev/null || true
    $CVT "$ICON" -resize "${px}x${px}" "$dir/ic_launcher_round.png" 2>/dev/null || true
    $CVT "$ICON" -resize "${px}x${px}" "$dir/ic_launcher_foreground.png" 2>/dev/null || true
  done
  echo "→ Iconos mipmap generados"
else
  echo "→ (opcional) instala ImageMagick para redimensionar mipmaps; se usa el icono por defecto de Capacitor"
fi
