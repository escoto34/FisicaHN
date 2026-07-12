#!/usr/bin/env bash
# Copia el simulador (skills/fisicahn) a desktop/app para empaquetar con Electron.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/skills/fisicahn"
DEST="$(cd "$(dirname "$0")/.." && pwd)/app"

if [[ ! -d "$SRC" ]]; then
  echo "No existe $SRC" >&2
  exit 1
fi

echo "→ Sync $SRC → $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  "$SRC/" "$DEST/"

# Config en línea (opcional) para login docente / códigos desde Electron
WEBSITE_CFG="$ROOT/website/js/supabase-config.js"
if [[ -f "$WEBSITE_CFG" ]]; then
  mkdir -p "$DEST/js"
  cp -f "$WEBSITE_CFG" "$DEST/js/supabase-config.js"
  echo "→ Incluida config en línea en desktop/app/js/supabase-config.js"
fi

# Marca desktop en el HTML (fallback si preload no corrió)
if [[ -f "$DEST/index.html" ]]; then
  if ! grep -q 'data-desktop' "$DEST/index.html"; then
    # inyectar atributo en <html>
    sed -i 's/<html lang="es"/<html lang="es" data-desktop="pending"/' "$DEST/index.html" || true
  fi
fi

echo "→ App lista ($(du -sh "$DEST" | cut -f1))"
