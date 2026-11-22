---
name: FísicaHN
description: Laboratorio virtual de física interactivo, accesible y sin dependencias
colors:
  bg-primary: "#0c0f14"
  bg-secondary: "#141a22"
  bg-tertiary: "#1c2430"
  text-primary: "#e8eef6"
  text-secondary: "#9aa8b8"
  accent: "#3ecfbf"
  accent-secondary: "#e8a838"
  success: "#3ecf7a"
  danger: "#f07178"
  border: "#253040"
typography:
  display:
    fontFamily: "Oswald, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.015em"
  heading:
    fontFamily: "Oswald, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.08em"
  brand:
    fontFamily: "BBH Bogle, Oswald, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 400
  body:
    fontFamily: "Nunito, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.5
  formula:
    fontFamily: "Share, monospace"
    fontSize: "0.85rem"
    fontWeight: 700
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#35bba9"
  button-secondary:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
---

# Design System: FísicaHN

## 1. Overview

**Creative North Star: "El Observatorio de Precisión"**

FísicaHN está diseñado como un instrumento científico y educativo contemporáneo. La interfaz adopta una estética oscura, técnica y rigurosa inspirada en instrumentación de laboratorio y observatorios físicos, donde la luz y el color emergen del fenómeno que se estudia, no del marco que lo rodea.

El sistema rechaza conscientemente los clichés de los dashboards administrativos (tarjetas repetitivas con números gigantes, gradientes decorativos en texto o gráficos decorativos que compiten con el espacio físico). Toda decisión visual responde a dos mandatos: máxima visibilidad del fenómeno físico y ergonomía para la experimentación en aula y hogar.

**Key Characteristics:**
- **Lienzo físico como protagonista:** El espacio geométrico de simulación domina el área visual sin elementos decorativos intrusivos.
- **Separación de planos:** El lienzo representa coordenadas métricas; las gráficas estadísticas y comparativas pertenecen al panel de consulta inferior.
- **Cuarteto tipográfico estricto:** Share (fórmulas y canvas), Oswald (encabezados), BBH Bogle (marca) y Nunito (interfaz).
- **Consistencia ergonómica:** Botones y selectores con áreas táctiles ≥ 44×44 px en pantallas táctiles y máquina de estados coherente.

## 2. Colors

La paleta se fundamenta en un fondo neutro profundo derivado de la landing de FísicaHN, utilizando el turquesa tecnológico como ancla de interacción y preservando los colores semánticos vectoriales para la física.

### Primary & Dark Spectrum
- **Deep Space Black (`#0c0f14`)**: Fondo del lienzo de simulación, body de la aplicación y base general.
- **Elevated Void (`#141a22`)**: Superficie de paneles laterales (sidebar, panel derecho, panel inferior).
- **Surface Card / Input (`#1c2430`)**: Fondo de botones secundarios, tarjetas, inputs y controles.
- **Border Slate (`#253040` / `rgba(154, 168, 184, 0.16)`)**: Delimitación sutil entre secciones sin sobrecargar la pantalla.

### Accents & Semantic States
- **Teal Quantum (`#3ecfbf`)**: Color principal de acento e interacción. Reservado para estados activos, foco visible, botones primarios y confirmación.
- **Amber Energy (`#e8a838`)**: Resaltados secundarios y advertencias pedagógicas.
- **Green OK (`#3ecf7a`)**: Estados de éxito, conectividad e integridad correcta.
- **Red Alert / Danger (`#f07178`)**: Grabación activa (`.recording-pulse`), errores y valores límite.

### Physics Vector Palette (Canal de información científica)
- **Fuerza:** Rojo (`#f07178` / `#ef5350`).
- **Velocidad:** Verde (`#4caf50` / `#66bb6a`).
- **Aceleración:** Violeta (`#ab47bc`).
- **Masa / Cuerpo:** Azul / Turquesa (`#4fc3f7` / `#3ecfbf`).
- **Campo Magnético / Eléctrico:** Cian y Ámbar.
*Regla:* Los colores vectoriales nunca se reemplazan por la paleta de chrome; son el lenguaje científico del estudiante.

## 3. Typography

La jerarquía tipográfica es rígida y está respaldada por fuentes autoalojadas en formato WOFF2:

### Roles
- **Display / Headings (`Oswald`, 500-650):** Títulos de secciones (`Parámetros`, `Controles`, `Herramientas`, `Útil para`), títulos de diálogo y nombre del módulo (`.module-title`).
- **Brand (`BBH Bogle`, 400):** Exclusivamente para el logotipo y nombre de marca **FISICAHN**.
- **Body & Controls (`Nunito`, 400, 600, 700):** Texto de interfaz, botones, sliders, etiquetas, tablas de datos y explicaciones conceptuales.
- **Formula & Canvas Engine (`Share`, negrita 700):** Fórmulas matemáticas dentro del motor gráfico, coordenadas en pantalla, cotas de regla, ángulos y valores del readout.

## 4. Elevation

FísicaHN prioriza la estratificación tonal sobre las sombras densas para mantener un rendimiento óptimo a 60 FPS:

- **Plano 0 (Canvas & Base):** `#0c0f14`.
- **Plano 1 (Paneles & Sidebar):** `#141a22` con borde sutil de 1 px (`rgba(154, 168, 184, 0.16)`).
- **Plano 2 (Controles & Sliders):** `#1c2430` con micro-sombra `0 2px 4px rgba(0,0,0,0.2)`.
- **Plano 3 (Controles flotantes del lienzo):** `rgba(20, 26, 34, 0.85)` con `backdrop-filter: blur(8px)`.
- **Plano 4 (Hojas inferiores y Drawers móviles):** Elevación con sombra difusa `0 -10px 28px rgba(0, 0, 0, 0.3)` y scrim semitransparente.

## 5. Components

### Buttons
- **Primary (`.ctrl-btn.primary`):** Fondo turquesa `#3ecfbf`, texto oscuro `#0c0f14`, peso 700. Radio 6 px.
- **Secondary (`.ctrl-btn`):** Fondo `#1c2430`, texto `#e8eef6`, borde slate. Al pasar el cursor, fondo turquesa translúcido (`rgba(62, 207, 191, 0.12)`).
- **Icon Buttons (`.tool-btn`, `.view-btn`):** Botones compactos con SVG centrado (área mínima 36×36 px en escritorio, 44×44 px en táctil). Estado `.active` en turquesa.
- **Disabled (`:disabled`):** Opacidad 42%, cursor `not-allowed`, sin transform ni cambio de color en hover.

### Inputs & Sliders
- **Sliders (`.custom-slider`):** Track de 6–8 px en `#1c2430`, thumb circular de 18–24 px en `#3ecfbf` con feedback visual al arrastrar.
- **Campos Numéricos (`.param-number`):** Fondo `#1c2430`, borde slate, texto blanco en Share/monospace. Foco turquesa sin contorno discontinuo.
- **Selects (`.custom-select`):** Altura mínima de 40 px, apariencia nativa eliminada, chevron SVG embebido, fondo `#1c2430`.

### Navigation & Bottom Sheets
- **Sidebar:** Ancho 260 px en modo completo, 64 px en modo colapsado (`.sidebar-collapsed`).
- **Bottom Sheets (Móvil):** Hojas inferiores deslizables con tirador de 38×4 px y cierre con scrim.

## 6. Do's and Don'ts

### Do's
- **Hacer:** Asegurar que la simulación física tenga siempre la máxima jerarquía visual.
- **Hacer:** Separar gráficos comparativos y tablas al panel inferior de consulta.
- **Hacer:** Probar que cada botón interactivo en móvil tenga un área táctil mínima de 44 × 44 px.
- **Hacer:** Usar Share en negrita para cualquier cifra o etiqueta dentro del lienzo.
- **Hacer:** Garantizar que la aplicación funcione 100% offline sin dependencias externas.

### Don'ts
- **No:** No colocar barras comparativas, gráficos o tablas dentro del espacio de coordenadas de la simulación.
- **No:** No utilizar gradientes decorativos en texto ni glassmorphism indiscriminado.
- **No:** No usar la tipografía BBH Bogle fuera del logotipo de marca FISICAHN.
- **No:** No duplicar controles de reproducción o reinicio en múltiples sitios a la vez.
- **No:** No introducir bundlers, transpiler steps ni frameworks que rompan el runtime vanilla ES Modules.
