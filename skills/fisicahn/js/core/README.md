# Núcleo compartido (`js/core/`)

Contrato y utilidades comunes de los módulos de simulación. Es la base sobre la
que se apoya el rediseño del canvas (escena declarativa) y la migración del
panel de datos.

## Contrato de módulo

- `sim-module.js` — `SimModule`, clase base de todo motor, y la fábrica
  `createModuleInstance(mod, ctx)` que la app usa en `loadEngineModule`.
  - El módulo exporta `default class Foo extends SimModule { … }` → se instancia
    con estado propio (frente al singleton ESM previo).
  - Un módulo legacy (functions sueltas `init/update/render/…`) se envuelve en
    `LegacyModuleAdapter` sin modificar su código: la migración es incremental.
  - Ciclo de vida protegido: `init/reset/update/render/destroy` se invocan desde
    la app dentro de `try/catch`, de modo que un error no rompe el bucle RAF.

### Métodos del contrato

| Método | Cuándo | Notas |
|---|---|---|
| `init(meta)` | Al abrir el módulo | Una sola vez; monta info, fórmulas y parámetros |
| `reset()` | Botón Reiniciar / cambiar parámetro | Vuelve al estado inicial |
| `update(dt)` | Cada timestep (hasta 5/frame) | Física pura, **sin tocar el DOM** |
| `render(ctx, alpha, elapsed)` | Cada frame | Puente actual; en WAVE 2 pasa a `draw(scene)` |
| `draw(scene)` | Cada frame (futuro) | API declarativa de WAVE 2 |
| `readout()` | ~10 Hz (host) | Datos numéricos `{value, unit}`, reemplaza `updateData()` |
| `getState()` / `setState(s)` | Guardar/restaurar trabajo | JSON serializable |
| `destroy()` | Al salir del módulo | Libera la instancia |

## Utilidades

- `trail-buffer.js` — `TrailBuffer`: buffer de estela en anillo O(1). Sustituye
  el patrón `push` + `shift()` de 6 módulos.
- `geometry.js` — `dist`, `distToSegment`, y re-exporta `clamp`, `lerp`,
  `mapRange`, `roundTo`, `toDeg`, `toRad` desde `utils/math-helpers.js`. Un solo
  punto de entrada bajo `core/`; evita copias privadas de `clamp`.
- `draw-primitives.js` — `roundRect`, `arrowHead`, `chip`, `legend`: primitivas
  de dibujo que estaban duplicadas en 3–6 módulos.

Regla de uso: **no** crear copias privadas de estas funciones en un módulo.
Si falta una utilidad, se añade aquí y se importa.
