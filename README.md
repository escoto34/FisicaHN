<p align="center">
  <img src="https://img.shields.io/badge/Versión-1.0.0-00e5ff?style=for-the-badge" alt="Versión">
  <img src="https://img.shields.io/badge/Licencia-MIT-7c4dff?style=for-the-badge" alt="Licencia">
  <img src="https://img.shields.io/badge/JS_Puro-ES6+-f5c842?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Offline-100%25-00c853?style=for-the-badge" alt="Offline">
  <img src="https://img.shields.io/badge/Peso-~400KB-ff6d00?style=for-the-badge" alt="Peso">
</p>

<h1 align="center">⚛️ FísicaHN</h1>
<h3 align="center">Laboratorio Virtual de Física para Colegios Técnicos de Honduras</h3>

<p align="center">
  Simulador interactivo de física web construido con <b>JavaScript puro</b>, <b>HTML5 Canvas</b> y <b>CSS3</b>.<br>
  100% offline · Cero dependencias · Cero instalación · Ejecuta desde USB.
</p>

---

## 🎯 ¿Qué es FísicaHN?

**FísicaHN** es un laboratorio virtual diseñado para que estudiantes de colegios técnicos hondureños realicen prácticas de física de manera interactiva, sin necesitar Internet, servidores, ni software adicional. Solo basta con abrir `index.html` en un navegador moderno.

El simulador cubre los cuatro pilares fundamentales de la física de nivel medio:

| Módulo | Sub-módulos | Descripción |
|--------|-------------|-------------|
| 🏎️ **Cinemática** | MRU · MRUV · Caída Libre · Tiro Parabólico | Movimiento en 1D y 2D con animaciones, vectores y gráficos en tiempo real |
| ⚙️ **Dinámica** | Leyes de Newton · Trabajo y Energía | Diagramas de cuerpo libre, planos inclinados, conservación de energía |
| ⚡ **Electricidad** | Ley de Ohm · Kirchhoff · Constructor de Circuitos | Circuitos DC con electrones animados, análisis nodal (MNA), drag & drop |
| 🔭 **Óptica** | Reflexión · Refracción · Lentes Delgadas | Trazado de rayos, Ley de Snell, TIR, clasificación de imágenes |

> **13 sub-módulos** simulando fenómenos físicos reales con control paramétrico en tiempo real.

---

## ✨ Características Principales

### 🎨 Interfaz de Laboratorio Oscuro
- Tema oscuro de alto contraste optimizado para reducir la fatiga visual
- Diseño inspirado en instrumental científico profesional
- Micro-animaciones y transiciones suaves en todos los controles
- Layout responsivo que se adapta a diferentes resoluciones

### 📊 Gráficos SVG Dinámicos
- Sistema de graficación vectorial propio (sin Chart.js ni D3)
- Auto-escalado inteligente de ejes según los datos
- Soporte para múltiples conjuntos de datos superpuestos
- Integración con el tema oscuro del laboratorio

### 🧪 Instrumentos Virtuales
- **Regla** — Mide distancias arrastrando sobre el canvas
- **Transportador** — Cuantifica ángulos de inclinación y tiro
- **Multímetro Flotante** — Muestra V, I y P al pasar sobre resistencias

### 🎓 Capa Pedagógica Integrada
- **Motor de Desafíos** — Retos de opción múltiple, cálculo numérico y experimentales
- **Gestor de Escenarios** — Guarda, exporta e importa configuraciones de laboratorio en JSON
- **Puntuación persistente** — Almacenada en `localStorage` del navegador

### ⌨️ Atajos de Teclado
| Tecla | Acción |
|-------|--------|
| `Espacio` | ⏯️ Pausar / Reanudar |
| `R` | 🔄 Reiniciar simulación |
| `Esc` | 🧹 Limpiar herramientas activas |
| `1` `2` `3` `4` | 📖 Cambiar módulo rápidamente |

---

## 🚀 Inicio Rápido

```bash
# Opción 1: Clonar el repositorio
git clone https://github.com/tu-usuario/simulador_fisica.git
cd simulador_fisica/fisicahn

# Opción 2: Copiar la carpeta fisicahn/ a una USB

# Abrir en el navegador:
# → Hacer doble clic en index.html
# → O arrastrar index.html a Chrome/Firefox/Edge
```

> [!NOTE]
> No se necesita `npm install`, ni servidor local, ni compilación. **Solo abrir el archivo HTML.**

---

## 🏗️ Arquitectura

```
simulador_fisica/
├── README.md                          ← Este archivo
├── implementation_plan.md             ← Plan de implementación técnico
├── skills/                            ← Especificaciones de diseño por módulo
│   ├── 01-cinematica.md
│   ├── 02-dinamica-energia.md
│   ├── 03-electricidad-dc.md
│   ├── 04-optica-geometrica.md
│   ├── 05-interactividad-uiux.md
│   ├── 06-capa-pedagogica.md
│   └── 07-arquitectura-motor.md
│
└── fisicahn/                          ← ⭐ APLICACIÓN PRINCIPAL
    ├── index.html                     ← Punto de entrada (abrir este archivo)
    ├── css/
    │   ├── main.css                   ← Variables globales, reset, tema oscuro
    │   ├── simulator.css              ← Canvas, controles, ScenarioManager
    │   ├── tools.css                  ← Instrumentos virtuales
    │   └── challenges.css             ← Panel de desafíos
    ├── js/
    │   ├── app.js                     ← Inicializador, enrutamiento, listeners
    │   ├── physics-engine.js          ← Bucle rAF con fixed timestep
    │   ├── renderer.js                ← Canvas 2D, trazado vectorial
    │   ├── ui-controls.js             ← Sliders y controles dinámicos
    │   ├── charts.js                  ← Graficador SVG vectorial
    │   ├── tools.js                   ← Regla, transportador, multímetro
    │   ├── challenges.js              ← ChallengeEngine
    │   ├── scenarios.js               ← ScenarioManager
    │   ├── utils/
    │   │   ├── math-helpers.js        ← Funciones matemáticas comunes
    │   │   ├── unit-converter.js      ← Conversión de unidades SI
    │   │   └── vector2d.js            ← Clase Vector2D inmutable
    │   └── modules/
    │       ├── kinematics.js          ← Facade router → kinematics/
    │       ├── dynamics.js            ← Facade router → dynamics/
    │       ├── electricity.js         ← Facade router → electricity/
    │       ├── optics.js              ← Facade router → optics/
    │       ├── kinematics/
    │       │   ├── mru.js             ← Movimiento Rectilíneo Uniforme
    │       │   ├── mruv.js            ← Mov. Rectilíneo Unif. Variado
    │       │   ├── free-fall.js       ← Caída Libre
    │       │   └── projectile.js      ← Tiro Parabólico
    │       ├── dynamics/
    │       │   ├── newton-laws.js     ← Leyes de Newton con fricción
    │       │   └── work-energy.js     ← Trabajo, Energía y Potencia
    │       ├── electricity/
    │       │   ├── ohm-law.js         ← Ley de Ohm y asociación
    │       │   ├── kirchhoff.js       ← Leyes de Kirchhoff (2 lazos)
    │       │   └── circuit-builder.js ← Constructor drag & drop + MNA
    │       └── optics/
    │           ├── reflection.js      ← Espejos (plano/cóncavo/convexo)
    │           ├── refraction.js      ← Ley de Snell + TIR
    │           └── lenses.js          ← Lentes delgadas
    └── data/
        ├── challenges/                ← Bancos de preguntas JSON
        │   ├── cinematica-retos.json
        │   ├── dinamica-retos.json
        │   ├── electricidad-retos.json
        │   └── optica-retos.json
        └── scenarios/                 ← Plantillas de laboratorios
            ├── cinematica-basica.json
            ├── circuito-serie.json
            └── lente-convergente.json
```

---

## 🔬 Detalle Técnico por Módulo

### 🏎️ Cinemática (4 sub-módulos)

| Sub-módulo | Ecuación Principal | Visualización |
|------------|-------------------|---------------|
| **MRU** | x(t) = x₀ + v₀·t | Vehículo animado con regla de referencia |
| **MRUV** | x(t) = x₀ + v₀·t + ½·a·t² | Vectores en vivo, gráficos triple (a, v, x) |
| **Caída Libre** | y(t) = y₀ + ½·g·t² | Objeto con estela, cronómetro, impacto |
| **Tiro Parabólico** | x = v₀·cos(θ)·t, y = v₀·sin(θ)·t − ½·g·t² | Cañón rotable por arrastre, trayectoria |

### ⚙️ Dinámica y Energía (2 sub-módulos)

| Sub-módulo | Física | Visualización |
|------------|--------|---------------|
| **Leyes de Newton** | F = ma, fricción μₛ/μₖ | DCL vectorial completo en plano inclinado |
| **Trabajo y Energía** | Ec + Ep = Em | Barras de energía animadas en rampa |

### ⚡ Electricidad DC (3 sub-módulos)

| Sub-módulo | Análisis | Visualización |
|------------|----------|---------------|
| **Ley de Ohm** | V = IR, serie/paralelo/mixto | Electrones animados, LEDs con brillo variable |
| **Kirchhoff** | Regla de Cramer (2 lazos) | Corrientes de rama, malla dual |
| **Constructor** | MNA + Eliminación Gaussiana | Drag & drop en rejilla 40px, interruptores |

### 🔭 Óptica Geométrica (3 sub-módulos)

| Sub-módulo | Ley | Visualización |
|------------|-----|---------------|
| **Reflexión** | 1/f = 1/do + 1/di | 3 rayos principales, clasificación de imagen |
| **Refracción** | n₁·sin(θ₁) = n₂·sin(θ₂) | Interfaz dual, TIR, ángulo crítico |
| **Lentes** | 1/f = 1/do + 1/di | Convergente/divergente, trazado completo |

---

## 📋 Requisitos del Sistema

| Requisito | Especificación |
|-----------|----------------|
| **Navegador** | Chrome 80+, Firefox 78+, Edge 80+ |
| **JavaScript** | ES6+ (módulos, clases, arrow functions) |
| **Resolución mínima** | 1024 × 768 px |
| **Memoria** | < 50 MB RAM |
| **Disco** | ~400 KB (toda la aplicación) |
| **Red** | ❌ No requerida (100% offline) |
| **Servidor** | ❌ No requerido (abre directo desde el archivo) |
| **Instalación** | ❌ No requerida (copiar y abrir) |

---

## 🎓 Uso Pedagógico

### Para Docentes

1. **Preparar el laboratorio**: Abra el simulador, seleccione el módulo deseado y configure los parámetros iniciales.
2. **Guardar escenario**: Use el panel **Información** → **Guardar Escenario** para almacenar la configuración actual.
3. **Exportar a USB**: Haga clic en **Exportar JSON** para descargar un archivo liviano con toda la configuración.
4. **Distribuir**: Copie el archivo `.json` y la carpeta `fisicahn/` a las memorias USB de los estudiantes.

### Para Estudiantes

1. **Abrir el simulador**: Doble clic en `index.html`.
2. **Importar escenario** (opcional): Cargue el archivo `.json` proporcionado por el docente.
3. **Experimentar**: Manipule los controles y observe cómo cambian las variables físicas en tiempo real.
4. **Resolver desafíos**: Abra la pestaña de **Desafíos** en el panel inferior para practicar.

---

## 📈 Estadísticas del Proyecto

| Métrica | Valor |
|---------|-------|
| Archivos totales | 40 |
| Líneas de JavaScript | ~9,100 |
| Líneas de CSS | ~1,700 |
| Sub-módulos de física | 12 |
| Bancos de desafíos | 4 |
| Escenarios de ejemplo | 3 |
| Dependencias externas | **0** |

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Para contribuir:

1. Haz un fork del repositorio
2. Crea una rama para tu feature (`git checkout -b feature/nuevo-modulo`)
3. Realiza tus cambios siguiendo la arquitectura de facade routers
4. Asegúrate de mantener el tema oscuro y las variables CSS globales
5. Envía un Pull Request con descripción detallada

### Convenciones de Código

- **Módulos**: Cada sub-módulo exporta `init()`, `reset()`, `destroy()`, `update(dt)`, `render(ctx)`
- **CSS**: Usar variables de `main.css` (`--bg-primary`, `--accent`, `--text-primary`), nunca hex directos
- **Archivos**: Nombres en inglés con kebab-case (`circuit-builder.js`)
- **Comentarios**: En español, alineados con el público objetivo

---

## 📄 Licencia

Este proyecto es de código abierto bajo la licencia **MIT**. Siéntase libre de usarlo, modificarlo y distribuirlo en instituciones educativas.

---

<p align="center">
  Hecho con ❤️ para la educación técnica de Honduras 🇭🇳
</p>
