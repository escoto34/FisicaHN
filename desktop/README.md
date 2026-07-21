# FísicaHN Desktop

Aplicación de **escritorio multiplataforma** (Windows, Linux, macOS) que envuelve el simulador web con **Electron**.

## ¿Para qué?

En labs con **NetSupport** u otras herramientas de control de aula, a veces se **bloquea el navegador**. La app de escritorio:

- Trae su **propio Chromium** (no usa Chrome/Edge del sistema)
- Funciona **100% offline**
- Se puede instalar o copiar como **.exe portable** (USB)
- Guarda trabajos en el almacenamiento local de la app (mismo sistema de examen/prácticas)

## Alternativas consideradas

| Tecnología | Pros | Contras |
|------------|------|---------|
| **Electron** (elegida, v43) | Canvas fiable, empaquetado fácil, portable Windows | Binario más pesado (~100–180 MB); Windows 10+ |
| Tauri | Binario pequeño | Depende del WebView del SO (WebView2); más fricción en labs viejos |
| PWA | Sin instalar | Sigue siendo “navegador”; NetSupport puede bloquearla |

## Requisitos de desarrollo

- Node.js **20+** (recomendado **22 LTS** o superior; con Electron 43 / electron-builder 26)
- npm 10+

## Uso medido

- Tras `npm start`, la app en el monitor del sistema suele ir por **~90–100 MB de RAM**.
- Los trabajos se guardan en un archivo de **userData** (IPC), no solo en `localStorage`.
- Comando correcto: `npm start` (ya hace `sync`). No uses `npm start / npm run sync`.

## Uso en desarrollo

```bash
cd desktop
npm install
npm start
```

`npm start` sincroniza `skills/fisicahn` → `desktop/app` y abre la ventana.

## Generar instaladores (versión en `package.json`, p. ej. **1.3.0**)

```bash
cd desktop
npm install

# Linux AppImage + .deb
npm run dist:linux

# Windows portable + instalador NSIS
npm run dist:win

# macOS dmg (solo en Mac)
npm run dist:mac
```

Flujo completo (desktop + APK) en el README principal del repo.

Salida en `desktop/release/` (ejemplo **1.3.0**):

| Archivo | Uso en GitHub Releases |
|---------|------------------------|
| `FisicaHN-1.3.0.AppImage` | **Sí** — Linux sin instalar |
| `fisicahn-desktop_1.3.0_amd64.deb` | **Sí** — Debian/Ubuntu |
| `FisicaHN-Portable-1.3.0.exe` | **Sí** — Windows USB / NetSupport |
| `FisicaHN Setup 1.3.0.exe` | **Sí** — instalador Windows |
| `linux-unpacked/`, `win-unpacked/`, `*.yml`, `*.blockmap` | **No** |

`desktop/release/` está en `.gitignore` (no se versiona el binario; se publica en Releases).

## Despliegue en el lab (NetSupport)

1. Genera el portable Windows en un PC con Node (o en CI).
2. Copia `FisicaHN-Portable-x.y.z.exe` a la carpeta compartida o USB.
3. En cada estación: ejecutar el `.exe` (no hace falta Chrome).
4. En NetSupport: permite la aplicación **FisicaHN** / el ejecutable; el bloqueo de navegadores no la afecta.

## Estructura

```
desktop/
  main.js          # proceso principal Electron
  preload.js       # flag window.FisicaHNDesktop
  app/             # copia del simulador (generada, no editar a mano)
  scripts/sync-app.sh
  package.json
  release/         # artefactos de build
```

El código del simulador se edita en `skills/fisicahn/`; luego `npm run sync` o `npm start`.
