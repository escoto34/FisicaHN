# FísicaHN — Referencia Técnica del Simulador

> Documentación técnica interna de la aplicación. Para la guía completa del proyecto, vea el [README principal](../README.md).

---

## 📁 Estructura de Archivos

```
fisicahn/
├── index.html                     # Punto de entrada — abrir en navegador
├── css/
│   ├── main.css                   # Variables globales, reset, tema oscuro
│   ├── simulator.css              # Canvas, controles, ScenarioManager
│   ├── tools.css                  # Instrumentos virtuales (regla, transportador)
│   └── challenges.css             # Panel de desafíos pedagógicos
├── js/
│   ├── app.js                     # Inicializador, enrutamiento, event listeners
│   ├── physics-engine.js          # Bucle rAF con fixed timestep (60 FPS)
│   ├── renderer.js                # Canvas 2D, primitivas de dibujo vectorial
│   ├── ui-controls.js             # Builder dinámico de sliders y selectores
│   ├── charts.js                  # Graficador SVG vectorial (sin dependencias)
│   ├── tools.js                   # Lógica de instrumentos de medición
│   ├── challenges.js              # ChallengeEngine (retos interactivos)
│   ├── scenarios.js               # ScenarioManager (guardar/cargar/exportar)
│   ├── utils/
│   │   ├── math-helpers.js        # lerp, clamp, degToRad, formatSI
│   │   ├── unit-converter.js      # Conversiones de unidades SI
│   │   └── vector2d.js            # Clase Vector2D inmutable
│   └── modules/
│       ├── kinematics.js          # Facade → kinematics/{mru,mruv,free-fall,projectile}
│       ├── dynamics.js            # Facade → dynamics/{newton-laws,work-energy}
│       ├── electricity.js         # Facade → electricity/{ohm-law,kirchhoff,circuit-builder}
│       └── optics.js              # Facade → optics/{reflection,refraction,lenses}
└── data/
    ├── challenges/*.json          # Bancos de preguntas por módulo
    └── scenarios/*.json           # Escenarios didácticos de ejemplo
```

---

## 🔧 Patrón Facade Router

Cada archivo en `js/modules/` es un **facade router** que delega a los sub-módulos reales según el selector activo. Todos los sub-módulos implementan la interfaz estándar:

```javascript
export default {
  init(ctx, width, height)   // Inicializar estado y bindear controles
  reset()                    // Reiniciar tiempo y variables
  destroy()                  // Limpiar event listeners y UI dinámica
  update(dt)                 // Avanzar la física (dt en segundos)
  render(ctx)                // Dibujar frame actual en el Canvas 2D
  getScenarioState()         // Exportar estado para ScenarioManager
  loadScenarioState(state)   // Importar estado desde ScenarioManager
}
```

### Flujo de Módulo

```
app.js → loadModule("kinematics")
  └── kinematics.js (facade)
        ├── Lee el <select> de sub-módulo
        ├── import("./kinematics/mru.js")
        └── Delega init/update/render al sub-módulo activo
```

---

## 🎨 Sistema de Diseño

Todas las variables de color viven en `css/main.css`:

| Variable | Uso | Valor |
|----------|-----|-------|
| `--bg-primary` | Fondo principal | `#0a0a0f` |
| `--bg-secondary` | Paneles laterales | `#12121a` |
| `--bg-tertiary` | Controles y cards | `#1a1a2e` |
| `--accent` | Acentos principales | `#00e5ff` |
| `--accent-warm` | Acentos cálidos | `#ff6d00` |
| `--text-primary` | Texto principal | `#e0e0e0` |
| `--text-secondary` | Texto secundario | `#9e9e9e` |
| `--border-color` | Bordes de paneles | `#2a2a3e` |

> ⚠️ **Regla obligatoria**: Nunca usar colores hex directos en archivos JS. Siempre leer las variables CSS con `getComputedStyle()` o usar las constantes definidas.

---

## 🔄 Bucle de Simulación

El `PhysicsEngine` en `physics-engine.js` implementa un bucle de paso fijo:

```
requestAnimationFrame
  └── accumulator += deltaTime
        └── while (accumulator >= FIXED_DT)
              ├── module.update(FIXED_DT)  // Física determinista
              └── accumulator -= FIXED_DT
        └── module.render(ctx)             // Renderizado visual
        └── charts.update(data)            // Actualizar gráficos
```

- **FIXED_DT**: `1/60` segundos (60 Hz de simulación)
- **Canvas DPR**: Limitado a `2×` para performance en hardware escolar
- **Pausa**: `Espacio` congela el accumulator sin destruir estado

---

## 📖 Capa Pedagógica

### ChallengeEngine (`challenges.js`)
- Carga bancos de preguntas desde `data/challenges/*.json`
- Tipos: `multiple_choice`, `numeric` (±5% tolerancia), `experimental`
- Puntuación guardada en `localStorage` por módulo

### ScenarioManager (`scenarios.js`)
- **Guardar**: Serializa módulo + sub-módulo + estado → `localStorage`
- **Cargar**: Restaura configuración completa con `loadScenarioState()`
- **Exportar**: Descarga JSON portátil vía `Blob` + `URL.createObjectURL()`
- **Importar**: Lee JSON vía `FileReader` y aplica el escenario

---

## 📋 Agregar un Nuevo Sub-módulo

1. Crear `js/modules/<modulo>/<nombre>.js` con la interfaz estándar
2. Agregar la opción en el `<select>` del HTML (`index.html`)
3. Registrar el import dinámico en el facade router del módulo
4. Crear el banco de preguntas en `data/challenges/<modulo>-retos.json`
5. Probar con `F12` → Console que no haya errores de carga
