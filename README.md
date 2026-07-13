<p align="center">
  <img src="website/assets/logo.svg" width="72" height="72" alt="FísicaHN">
</p>

<h1 align="center">FísicaHN</h1>
<p align="center">
  <strong>Laboratorio virtual de física para el aula</strong><br>
  JavaScript puro · HTML5 Canvas · web / ZIP / escritorio · listo para clase
</p>

<p align="center">
  <a href="https://github.com/escoto34/FisicaHN">github.com/escoto34/FisicaHN</a>
</p>

---

## Estado

Versión de empaquetado actual: **1.2.0** (`desktop` / `mobile`).

El producto está **listo para usar** en varias formas:

| Entrega | Cómo | Notas medidas |
|---------|------|----------------|
| **Web** | `website/` (Pages o servidor local) | Landing + lab + docentes |
| **ZIP** | `website/downloads/fisicahn.zip` | USB / sin instalar; regenerar con `./scripts/build-website.sh` |
| **Desktop** | `desktop/` → `npm run dist:linux` / `dist:win` | Electron → `desktop/release/` |
| **Android** | `mobile/` → `npm run build:release` | Capacitor; APK firmado ~3.5 MB |

Stack del laboratorio: **HTML + CSS + JS vanilla + Canvas** (sin React/Vue).  
El logo es un **círculo unitario con vector de posición**.

---

## ¿Qué es?

Simulador de física orientado a clase: módulos interactivos, pizarra, usuarios (alumno/docente), códigos de examen, trabajos con **Abrir en módulo** y guardado en caché (navegador o archivo en Electron).

---

## Estructura del repositorio

| Ruta | Contenido |
|------|-----------|
| `skills/fisicahn/` | **Fuente** del simulador (editar aquí) |
| `website/` | Sitio público: inicio, docentes, `sim/`, ZIP, cabeceras |
| `desktop/` | Electron (`app/` se genera al sincronizar; no editar a mano) |
| `mobile/` | Android / Capacitor (`www/` se genera al sincronizar; ver `mobile/README.md`) |
| `scripts/build-website.sh` | `skills/fisicahn` → `website/sim` + ZIP (+ config en línea si hay) |
| `supabase/schema.sql` | Esquema y RLS (ejecutar en el SQL Editor del backend) |
| `docs/` | Despliegue (`SUPABASE_GITHUB_PAGES.md`) y seguridad (`SECURITY.md`) |


## Usuarios y exámenes

Al abrir el lab (web, ZIP o Electron) se pide identificación.

| Rol | Entrada | Crear código | Unirse a código |
|-----|---------|--------------|-----------------|
| **Alumno** | Nombre + colegio (recordable en USB/PC) | No | Sí |
| **Docente** | Email + contraseña + colegio (**en línea**) | Sí (nube) | Sí |

- **Cuenta** en el catálogo: identidad, unirse / crear código, cambiar usuario.
- Trabajos sellados con nombre, colegio, modo y código de examen.
- Offline: práctica y códigos de pizarra; publicar códigos en la nube requiere config + red.

---

## Laboratorio (`/sim/`)

### Catálogo
- Listado unificado de módulos.
- **Cuenta**, indicador de red, pizarra.
- **Mis trabajos**: importar/exportar JSON, **Abrir en módulo** (restaura parámetros y estado), Detalles, eliminar.
- Docentes: generar código de examen (en línea).

### En un módulo
- Info + historia, fórmulas, datos, parámetros (slider + número).
- Controles, gráficas donde aportan, herramientas de medición.
- Columnas **redimensionables** (arrastrar bordes; se recuerda el layout).
- **Guardar trabajo** (modal de nombre; en Electron escribe en **userData** + respaldo local).

### Módulos
Cinemática, dinámica / fuerzas y energía, electricidad, óptica, momentum, sonido, campos magnéticos, gravedad, oscilatorio, **física atómica** (Bohr), **física de partículas** (cargas en B), pizarra, y entradas que reutilizan motores afines.

### Pizarra
Lápiz denso, formas, texto, mover, borrador que no borra el fondo ni la cuadrícula, PNG.

---

## Sitio web (`website/`)

| Ruta | Uso |
|------|-----|
| `/` | Landing: entrada alumno, descargas, docentes, ideas |
| `/sim/` | Laboratorio (copia de `skills/fisicahn`) |
| `/teacher.html` | Acceso docente (email) |
| `/downloads/fisicahn.zip` | Paquete offline |
| `/_headers` | Cabeceras de seguridad (CSP, etc.) en hosts que las lean |

Más detalle: `website/README.md`.

## App de escritorio

| Detalle | Valor |
|---------|--------|
| Versión | **1.2.0** (`desktop/package.json`) |
| Trabajos | Archivo en **userData** (`fisicahn-works-v1.json`) vía IPC |
| RAM en uso (medida) | **~90–100 MB** con la app abierta |
| SO | Windows 10+, Linux (AppImage / .deb) |

Documentación extra: `desktop/README.md`.

### Generar instaladores (v1.2.0)

Desde la raíz del repo (o ajusta la ruta):

```bash
# 1) Desktop Linux → AppImage + .deb
cd "/home/escoto/Documentos/simulador fisica/desktop"
npm install
npm run dist:linux

# 2) Desktop Windows → portable + Setup NSIS
npm run dist:win

# 3) Android APK firmado (release)
cd "/home/escoto/Documentos/simulador fisica/mobile"
npm install
export ANDROID_HOME="$HOME/Android/Sdk"   # o /opt/android-sdk
export JAVA_HOME="/home/escoto/Documentos/simulador fisica/tools/jdk-21"
export PATH="$JAVA_HOME/bin:$PATH"
npm run build:release
```

Cada comando hace `sync` de `skills/fisicahn` automáticamente.

**Salida desktop** (`desktop/release/`):

| Archivo | Uso |
|---------|-----|
| `FisicaHN-1.2.0.AppImage` (~122 MB) | Linux, sin instalar |
| `fisicahn-desktop_1.2.0_amd64.deb` (~96 MB) | Debian/Ubuntu |
| `FisicaHN-Portable-1.2.0.exe` (~86 MB) | Windows USB / NetSupport |
| `FisicaHN Setup 1.2.0.exe` (~86 MB) | Instalador Windows |

**Salida Android** (`mobile/release/`):

| Archivo | Uso |
|---------|-----|
| `FisicaHN-1.2.0-release.apk` (~3.5 MB) | **Distribución** (firmado) |
| `FisicaHN-1.2.0-debug.apk` (~4.4 MB) | Solo pruebas de desarrollo |

### Qué subir a GitHub Releases (`v1.2.0`)

Sube **solo los instaladores** (no carpetas `*-unpacked`, ni `.yml` de autoupdate, ni keystores):

1. `desktop/release/FisicaHN-1.2.0.AppImage`
2. `desktop/release/fisicahn-desktop_1.2.0_amd64.deb`
3. `desktop/release/FisicaHN-Portable-1.2.0.exe`
4. `desktop/release/FisicaHN Setup 1.2.0.exe`
5. `mobile/release/FisicaHN-1.2.0-release.apk`

Opcional: `website/downloads/fisicahn.zip` (lab web offline).

**No subas:** `linux-unpacked/`, `win-unpacked/`, `*.blockmap`, `latest.yml`, `builder-*.yaml`, APK **debug**, ni nada de `mobile/keystore/`.

Tag sugerido:

```bash
git tag v1.2.0
git push origin v1.2.0
# Luego en GitHub → Releases → Draft a new release → adjuntar los 5 archivos
```

### Linux (AppImage) — uso del usuario

```bash
chmod +x FisicaHN-1.2.0.AppImage
./FisicaHN-1.2.0.AppImage
```

**Paquete `.deb`:**

```bash
sudo apt install ./fisicahn-desktop_1.2.0_amd64.deb
```

### Android — instalación

```bash
adb install -r FisicaHN-1.2.0-release.apk
```

O copia el APK al tablet y ábrelo (permitir “orígenes desconocidos” si hace falta).  
Detalle: `mobile/README.md`.

### Subir versión la próxima vez

1. `desktop/package.json` y `mobile/package.json` → `"version": "1.3.0"`
2. `mobile/android/app/build.gradle` → `versionName "1.3.0"` y **`versionCode` +1** (entero)
3. Regenerar builds y publicar tag `v1.3.0`

---

## Despliegue web

| Destino | Cómo |
|---------|------|
| **GitHub Pages** | `.github/workflows/deploy-pages.yml` |
| **Cloudflare Pages** | Build `./scripts/build-website.sh` · output `website` |

---

## Requisitos orientativos

| Entrega | Disco (aprox. v1.2.0) | RAM en ejecución |
|---------|------------------------|------------------|
| **ZIP** | ~0,5 MB el `.zip` | La del navegador |
| **Electron Linux/Windows** | ~86–122 MB por instalable | **~90–100 MB** |
| **Android APK release** | **~3.5 MB** | WebView del sistema |

---
