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

## Canvas (WAVE 2)

El lienzo deja de ser un `<canvas>` que se borra entero 60 veces por segundo.
Sigue habiendo **un único elemento en el DOM**; lo que cambia es lo que hay
detrás.

| Archivo | Qué aporta |
|---|---|
| `camera.js` | Escala **isotrópica** (adiós al mundo deformado en pantalla ancha), zoom anclado al cursor, pan, `follow()` interpolado, viewports rectangulares |
| `layers.js` | Capas `background` / `world` / `hud` con invalidación independiente; la rejilla pasa de ~68 operaciones por frame a 0 en régimen estacionario |
| `scene.js` | API declarativa: `scene.body(…)`, `scene.vector(…)`, `scene.hud.plot(…)`. Oculta el backend, lo que permite exportar a SVG |
| `theme.js` | Tokens de color + perfiles `dark` / `light` / `projector` / `colorSafe` |
| `interaction.js` | Rueda, pellizco, pan, picking y arrastre de objetos; `MeasureTools` reutilizable |
| `params-schema.js` | Panel construido desde `static params` |
| `scene-export.js` | PNG del lienzo y SVG vectorial (grabador del contexto 2D) |
| `compare.js` | Comparación lado a lado: dos instancias, dos viewports, un solo bucle |

### Regla dura de coordenadas

Un módulo **nunca** accede a `ctx.canvas`. En su lugar:

```js
scene.viewport()   // { x, y, w, h } SIEMPRE en px CSS
scene.world()      // { left, right, top, bottom } en unidades de mundo
```

`ctx.canvas.width` devuelve píxeles de **dispositivo**: en un móvil con DPR 1,75
es 1,75× el ancho CSS, y ése era el origen de los ocho bugs que mandaban las
leyendas fuera de pantalla. Los módulos legacy tienen la misma vía de escape en
`renderer.viewport()`.

### Cómo se ve un módulo migrado

`modules/momentum.js` es la referencia: estado en la instancia, `static params`,
`static viewport`, `draw(scene)` y `readout()` con números en vez de HTML.

```js
export default class MiModulo extends SimModule {
  static viewport = { width: 22, height: 12 };
  static params = [{ id: 'm', label: 'Masa', unit: 'kg', min: 0.1, max: 10, step: 0.1, value: 1 }];

  update(dt) { /* física pura */ }

  draw(scene) {
    scene.body(this.x, 0, { shape: 'circle', r: 0.3, color: 'mass', id: 'bola' });
    scene.vector(this.x, 0, this.v * 0.25, 0, { color: 'velocity', label: 'v' });
    scene.hud.chip(`Ec = ${roundTo(this.ec, 2)} J`, 'top-right');
  }

  onDrag(id, world) { this.x = world.x; }   // manipulación directa
  readout() { return { 'v': { value: this.v, unit: 'm/s' } }; }
}
```

Los colores son **tokens** (`'velocity'`, `'mass'`, `'force'`), nunca literales:
así el modo proyector y la paleta segura para daltonismo funcionan sin tocar el
módulo. Regla que las acompaña: **el color nunca es el único portador de
información** — debe ir con estilo de línea, etiqueta o forma.
