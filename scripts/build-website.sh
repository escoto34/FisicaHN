#!/usr/bin/env bash
# Arma website/ listo para Cloudflare Pages: copia el simulador y genera ZIP de descarga.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/skills/fisicahn"
DEST="$ROOT/website"
SIM="$DEST/sim"
DL="$DEST/downloads"

echo "→ Sincronizando simulador → website/sim"
rm -rf "$SIM"
mkdir -p "$SIM" "$DL"
# copiar solo lo necesario del simulador
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  "$SRC/" "$SIM/"

# Enlace "volver" en session-gate ya apunta a ../index.html (landing)

echo "→ Generando downloads/fisicahn.zip"
rm -f "$DL/fisicahn.zip"
(
  cd "$DEST"
  zip -r -q "downloads/fisicahn.zip" sim \
    -x "*.DS_Store" -x "**/.git/**"
)

# Ajustar index del zip: el usuario abre sim/index.html
echo "→ Listo para Cloudflare Pages"
echo "   Carpeta de publicación: $DEST"
echo "   Comando ejemplo: npx wrangler pages deploy website --project-name fisicahn"
ls -lh "$DL/fisicahn.zip"
