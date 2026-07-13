#!/usr/bin/env bash
# Copia el simulador (skills/fisicahn) a mobile/www para Capacitor / Android.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/skills/fisicahn"
DEST="$(cd "$(dirname "$0")/.." && pwd)/www"

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

# Config en línea (opcional) para login docente / códigos
WEBSITE_CFG="$ROOT/website/js/supabase-config.js"
if [[ -f "$WEBSITE_CFG" ]]; then
  mkdir -p "$DEST/js"
  cp -f "$WEBSITE_CFG" "$DEST/js/supabase-config.js"
  echo "→ Incluida config Supabase en www/js/supabase-config.js"
fi

# Marca Android en el HTML (detección nativa además del bridge)
if [[ -f "$DEST/index.html" ]]; then
  if ! grep -q 'data-android' "$DEST/index.html"; then
    sed -i 's/<html lang="es"/<html lang="es" data-android="1"/' "$DEST/index.html" || true
  fi
  # Viewport ya correcto; asegurar viewport-fit para notch
  if ! grep -q 'viewport-fit=cover' "$DEST/index.html"; then
    sed -i 's/content="width=device-width, initial-scale=1.0"/content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover"/' "$DEST/index.html" || true
  fi
fi

# Bridge nativo mínimo (flag + status bar safe)
mkdir -p "$DEST/js"
cat > "$DEST/js/android-bridge.js" <<'EOF'
/**
 * FísicaHN Android — flag de plataforma (Capacitor WebView).
 * Los trabajos usan localStorage del WebView (persistente en la app).
 */
(function () {
  try {
    document.documentElement.dataset.android = '1';
    document.documentElement.dataset.mobile = '1';
    window.FisicaHNMobile = {
      isAndroid: true,
      isMobile: true,
      platform: 'android',
      worksCache: 'localStorage'
    };
    // Compat con rutas que miran escritorio “app empaquetada”
    if (!window.FisicaHNDesktop) {
      window.FisicaHNDesktop = {
        isDesktop: false,
        isAndroid: true,
        platform: 'android'
      };
    }
  } catch (e) {
    /* ignore */
  }
})();
EOF

# Inyectar bridge antes de app.js si no está
if [[ -f "$DEST/index.html" ]] && ! grep -q 'android-bridge.js' "$DEST/index.html"; then
  sed -i 's|<script type="module" src="js/app.js"></script>|<script src="js/android-bridge.js"></script>\n  <script type="module" src="js/app.js"></script>|' "$DEST/index.html" || true
fi

echo "→ www listo ($(du -sh "$DEST" | cut -f1))"
