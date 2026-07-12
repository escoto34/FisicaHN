<p align="center">
  <img src="website/assets/logo.svg" width="72" height="72" alt="FísicaHN">
</p>

<h1 align="center">FísicaHN</h1>
<p align="center">
  <strong>Laboratorio virtual de física para el aula</strong><br>
  JavaScript puro · HTML5 Canvas · catálogo unificado · web / ZIP / escritorio
</p>

<p align="center">
  <a href="https://github.com/escoto34/FisicaHN">github.com/escoto34/FisicaHN</a>
</p>

---

## ¿Qué es?

**FísicaHN** es un simulador de física orientado a clase: módulos interactivos, pizarra docente, guardado de trabajos y panel de evaluación.

| Uso | Cómo |
|-----|------|
| **En el navegador** | Carpeta `website/` (landing + laboratorio) |
| **Sin instalación** | `website/downloads/fisicahn.zip` |
| **Escritorio** | App Electron en `desktop/` (útil si el lab bloquea el navegador del sistema) |

El logo es un **círculo unitario con vector de posición** (geometría / cinemática).

---

## Estructura del repositorio

| Ruta | Contenido |
|------|-----------|
| `skills/fisicahn/` | **Fuente** del simulador (editar aquí) |
| `website/` | Sitio público: inicio, acceso docente, `sim/`, ZIP |
| `desktop/` | Empaquetado Electron |
| `scripts/build-website.sh` | Copia el sim a `website/sim` y regenera el ZIP |
| `supabase/` | Esquema SQL opcional (backend en la nube) |
| `docs/` | Notas de despliegue y backend |

> Tras cambiar el simulador, ejecuta siempre `./scripts/build-website.sh`.

---

## Inicio rápido (desarrollo)

```bash
# 1) Sincronizar simulador → website y regenerar ZIP
./scripts/build-website.sh

# 2) Servir el sitio (necesario para ES modules)
cd website && python3 -m http.server 8080
```

- Inicio: http://127.0.0.1:8080/
- Laboratorio: http://127.0.0.1:8080/sim/
- Docentes: http://127.0.0.1:8080/teacher.html

Recarga con **Ctrl+Shift+R** si no ves cambios.

---

## Laboratorio (`/sim/`)

### Catálogo
- **Un solo listado** de módulos (sin pestañas por grado).
- Tarjeta **Mis trabajos**: importar/exportar JSON, listar guardados e importados, evaluar con **Ver**, y generar **código de examen** (si hay sesión docente en línea).

### Dentro de un módulo
- **Información**: descripción breve + botón *Historia y casos prácticos*.
- **Fórmulas**: tarjetas legibles (notación clara en la página).
- **Datos**: valores en tiempo real.
- **Parámetros**: control deslizante **y** campo numérico.
- **Controles**: velocidad, play/pausa, paso.
- **Gráficas**: solo en módulos donde aportan (p. ej. cinemática); ocultas en el resto.
- **Herramientas** (iconos + tooltip al pasar el mouse): puntero, regla, ángulo, sonda, cronómetro, espacio infinito, limpiar medidas.
- Clic en **FísicaHN** (logo/título de la barra lateral) = volver al catálogo (igual que *Todos los módulos*).
- **Guardar trabajo** en la barra superior del canvas.

### Motores incluidos
Cinemática, dinámica, electricidad, óptica, momentum, sonido/Doppler, campos magnéticos, gravedad, oscilatorio, pizarra, y placeholders de temas en desarrollo.

### Pizarra
Lápiz, formas, texto, **mover** objetos, borrador que **no** borra el fondo ni la cuadrícula, exportar PNG.

---

## Sitio web y docentes

- **Inicio**: entrada rápida del alumno, descarga ZIP, botones Desktop (Windows / Linux / macOS → GitHub Releases), sección docentes e ideas de mejora.
- **Acceso docente**: registro/inicio con **email + colegio + contraseña** (en línea).
- **Código de examen**: se genera y publica en la nube; los alumnos lo escriben en modo Examen.
- **Trabajos**: lista, import/export JSON y botón **Ver** para evaluar.

---

## Backend en la nube (opcional)

El sitio **no muestra** detalles del proveedor al usuario final. Para desarrolladores:

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. SQL Editor → ejecuta `supabase/schema.sql`.
3. Project Settings → API → copia **URL** y clave **anon public**.

```bash
cp website/js/supabase-config.example.js website/js/supabase-config.js
# Edita url + anonKey  (NUNCA la service_role en el frontend)
./scripts/build-website.sh
```

**GitHub Actions** (deploy Pages): secrets  
`SUPABASE_URL` y `SUPABASE_ANON_KEY`.

Sin configuración, el laboratorio sigue en **localStorage** del navegador.

---

## App de escritorio

```bash
cd desktop
npm install
npm start           # sync + Electron
npm run dist:win    # Windows (portable / instalador)
npm run dist:linux  # AppImage / deb
# npm run dist:mac  # en macOS
```

Los artefactos salen en `desktop/release/`.

### Publicar un GitHub Release

1. Genera los binarios con los comandos `dist:*` de arriba.
2. En GitHub → **Releases** → **Draft a new release**.
3. Crea un tag (`v1.0.0`), título y notas.
4. Sube los archivos de `desktop/release/`.
5. Publica. Los botones del sitio apuntan a  
   `https://github.com/escoto34/FisicaHN/releases/latest`.

---

## Despliegue web

| Destino | Cómo |
|---------|------|
| **GitHub Pages** | Workflow `.github/workflows/deploy-pages.yml` (carpeta `website/`) |
| **Cloudflare Pages** | Build: `./scripts/build-website.sh` · Output: `website` |

Cada build actualiza `website/downloads/fisicahn.zip`.

---

## Licencia

MIT — ver el repositorio.
